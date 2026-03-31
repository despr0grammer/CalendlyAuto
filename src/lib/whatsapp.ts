import makeWASocket, {
  DisconnectReason,
  useMultiFileAuthState,
  fetchLatestBaileysVersion,
  WASocket,
} from '@whiskeysockets/baileys'
import { Boom } from '@hapi/boom'
import { EventEmitter } from 'events'
import QRCode from 'qrcode'
import path from 'path'
import fs from 'fs'
import { logger } from './logger'
import { prisma } from './prisma'
import { getConfig } from './config'
import { createInviteeAtTime, getAvailabilityEntries, getAvailabilitySummary, getTodayAvailabilitySummary } from './calendly'

// ─── Estado del servicio ───────────────────────────────────────────────────
export type WAStatus = 'detenido' | 'conectando' | 'qr' | 'conectado'

interface WAState {
  status: WAStatus
  qrDataUrl: string | null
  sock: WASocket | null
}

// ─── Singleton global (sobrevive HMR en desarrollo) ────────────────────────
const g = globalThis as unknown as {
  waService: WAService | undefined
}

class WAService extends EventEmitter {
  private state: WAState = {
    status: 'detenido',
    sock: null,
    qrDataUrl: null,
  }

  private sessionDir: string
  private reconnectAttempts = 0
  private reconnectTimer: NodeJS.Timeout | null = null
  private connecting = false
  private consecutive440 = 0
  private lastAvailabilityPromptByProspect = new Map<number, number>()
  private offeredSlotsByProspect = new Map<number, string[]>()
  private pendingScheduleByProspect = new Map<number, { startTime: string; label: string; eventTypeUri: string }>()

  constructor() {
    super()
    this.sessionDir = path.resolve(
      process.env.WHATSAPP_SESSION_DIR || './data/session'
    )
    fs.mkdirSync(this.sessionDir, { recursive: true })
  }

  getEstado() {
    return {
      status: this.state.status,
      corriendo: this.state.status !== 'detenido',
      conectado: this.state.status === 'conectado',
      qrDataUrl: this.state.qrDataUrl,
    }
  }

  /** Espera a que Baileys quede conectado (p. ej. tras reiniciar el servidor sin abrir el dashboard). */
  async waitUntilConnected(timeoutMs = 20000): Promise<boolean> {
    if (this.getEstado().conectado) return true
    if (this.getEstado().status === 'detenido') {
      await this.iniciar()
    }
    const start = Date.now()
    while (Date.now() - start < timeoutMs) {
      if (this.getEstado().conectado) return true
      await new Promise((r) => setTimeout(r, 400))
    }
    return this.getEstado().conectado
  }

  async iniciar() {
    if (this.connecting) return
    if (this.state.status !== 'detenido') {
      logger.log('⚠️  WhatsApp ya está iniciado')
      return
    }
    this.connecting = true

    logger.log('🚀 Iniciando servicio WhatsApp...')
    this.setStatus('conectando')

    try {
      const { state, saveCreds } = await useMultiFileAuthState(this.sessionDir)
      const { version } = await fetchLatestBaileysVersion()

      const sock = makeWASocket({
        version,
        auth: state,
        printQRInTerminal: false,
        logger: {
          level: 'silent',
          trace: () => {},
          debug: () => {},
          info: () => {},
          warn: () => {},
          error: () => {},
          fatal: () => {},
          child: () => ({ level: 'silent', trace: () => {}, debug: () => {}, info: () => {}, warn: () => {}, error: () => {}, fatal: () => {}, child: () => ({} as any) }),
        } as any,
      })

      this.state.sock = sock

      // ── Conexión y QR ──────────────────────────────────────────────────
      sock.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect, qr } = update

        if (qr) {
          try {
            const dataUrl = await QRCode.toDataURL(qr)
            this.state.qrDataUrl = dataUrl
            this.setStatus('qr')
            logger.log('📱 QR generado — escanéalo desde WhatsApp')
            this.emit('qr', dataUrl)
          } catch (e) {
            logger.log('❌ Error generando QR: ' + String(e))
          }
        }

        if (connection === 'close') {
          const statusCode = (lastDisconnect?.error as Boom)?.output?.statusCode
          const shouldReconnect = statusCode !== DisconnectReason.loggedOut
          if (statusCode === 440) {
            this.consecutive440 += 1
          } else {
            this.consecutive440 = 0
          }

          logger.log(
            shouldReconnect
              ? `⚠️  Conexión cerrada (código ${statusCode}), reconectando...`
              : '🔴 Sesión cerrada (logout). Escanea el QR nuevamente.'
          )

          this.state.sock = null
          this.state.qrDataUrl = null

          if (shouldReconnect) {
            if (this.consecutive440 >= 3) {
              logger.log('🧹 Se detectaron varios errores 440 seguidos. Reiniciando sesión local para pedir QR nuevo...')
              fs.rmSync(this.sessionDir, { recursive: true, force: true })
              fs.mkdirSync(this.sessionDir, { recursive: true })
              this.consecutive440 = 0
            }
            this.setStatus('detenido')
            this.scheduleReconnect()
          } else {
            // Borrar sesión para que pida QR de nuevo
            fs.rmSync(this.sessionDir, { recursive: true, force: true })
            fs.mkdirSync(this.sessionDir, { recursive: true })
            this.consecutive440 = 0
            this.reconnectAttempts = 0
            this.setStatus('detenido')
          }
        }

        if (connection === 'open') {
          this.consecutive440 = 0
          this.reconnectAttempts = 0
          this.state.qrDataUrl = null
          this.setStatus('conectado')
          logger.log('✅ WhatsApp conectado correctamente')
          this.emit('conectado')
        }
      })

      // ── Guardar credenciales ───────────────────────────────────────────
      sock.ev.on('creds.update', saveCreds)

      // ── Mensajes entrantes (detección de respuestas en tiempo real) ────
      sock.ev.on('messages.upsert', async ({ messages, type }) => {
        if (type !== 'notify') return

        for (const msg of messages) {
          if (!msg.message) continue
          if (msg.key.fromMe) continue // ignorar mensajes propios

          const jid = msg.key.remoteJid || ''
          const participantJid = msg.key.participant || ''
          if (jid.includes('@g.us')) continue // ignorar grupos

          const texto =
            msg.message.conversation ||
            msg.message.extendedTextMessage?.text ||
            '[mensaje multimedia]'

          const sender = participantJid || jid
          const prospecto = await this.findProspectoBySender(sender)
          const telefono = prospecto?.telefono || this.normalizePhone(sender)

          logger.log(`📨 Mensaje recibido de ${telefono || sender}: ${texto.substring(0, 50)}`)

          // Verificar si es un prospecto en secuencia
          try {
            if (prospecto) {
              const actualizarEstado = prospecto.estado === 'en_secuencia' || prospecto.estado === 'pendiente'
              await prisma.prospecto.update({
                where: { id: prospecto.id },
                data: {
                  estado: actualizarEstado ? 'respondio' : prospecto.estado,
                  fechaRespuesta: new Date(),
                },
              })
              await prisma.mensajeLog.create({
                data: {
                  prospectoId: prospecto.id,
                  tipo: 'recibido',
                  contenido: texto,
                },
              })
              logger.log(
                `🎉 ¡${prospecto.nombre} respondió! Automatización pausada.`
              )
              this.emit('respuesta', prospecto)
              await this.maybeHandleSchedulingIntent(prospecto.id, prospecto.nombre, prospecto.telefono, texto)
            } else {
              logger.log(`ℹ️ Mensaje recibido sin prospecto asociado: sender=${sender} remoteJid=${jid} participant=${participantJid}`)
            }
          } catch (e) {
            logger.log('❌ Error procesando mensaje: ' + String(e))
          }
        }
      })
    } catch (e) {
      logger.log('❌ Error iniciando WhatsApp: ' + String(e))
      this.setStatus('detenido')
      this.scheduleReconnect()
    } finally {
      this.connecting = false
    }
  }

  async enviarMensaje(telefono: string, texto: string): Promise<boolean> {
    if (!this.state.sock || this.state.status !== 'conectado') {
      logger.log('⚠️  WhatsApp no está conectado')
      return false
    }

    try {
      // Normalizar teléfono: quitar +, espacios, guiones
      const tel = telefono.replace(/[\s+\-()]/g, '')
      const jid = `${tel}@s.whatsapp.net`

      await this.state.sock.sendMessage(jid, { text: texto })
      logger.log(`📤 Mensaje enviado a ${telefono}`)
      return true
    } catch (e) {
      logger.log(`❌ Error enviando a ${telefono}: ${String(e)}`)
      return false
    }
  }

  cerrar() {
    if (this.state.sock) {
      this.state.sock.end(undefined)
      this.state.sock = null
    }
    this.setStatus('detenido')
    logger.log('🔴 Servicio WhatsApp detenido')
  }

  private setStatus(status: WAStatus) {
    this.state.status = status
    this.emit('estado', this.getEstado())
  }

  private scheduleReconnect() {
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer)
    this.reconnectAttempts += 1
    const delay = Math.min(3000 * this.reconnectAttempts, 30000)
    logger.log(`⏳ Reintento de conexión en ${Math.round(delay / 1000)}s`)
    this.reconnectTimer = setTimeout(() => this.iniciar(), delay)
  }

  private normalizePhone(jidOrPhone: string): string {
    const left = jidOrPhone.split('@')[0] || ''
    return left.replace(/\D/g, '')
  }

  private async findProspectoBySender(jidOrPhone: string) {
    const normalized = this.normalizePhone(jidOrPhone)
    if (!normalized) return null

    const exact = await prisma.prospecto.findUnique({ where: { telefono: normalized } })
    if (exact) return exact

    const prospectos = await prisma.prospecto.findMany({
      where: { estado: { in: ['pendiente', 'en_secuencia', 'respondio'] } },
      select: { id: true, nombre: true, telefono: true, estado: true, fechaRespuesta: true },
      take: 300,
      orderBy: { fechaCreacion: 'desc' },
    })

    const bySuffix = prospectos.find((p) => {
      const pNorm = p.telefono.replace(/\D/g, '')
      if (!pNorm) return false
      return normalized.endsWith(pNorm) || pNorm.endsWith(normalized)
    })

    if (bySuffix) return bySuffix

    // Fallback para identificadores ofuscados (ej: @lid):
    // 1) prioriza el prospecto con último MENSAJE ENVIADO registrado recientemente,
    // 2) si no existe, usa el prospecto más reciente en secuencia.
    const ultimoEnviado = await prisma.mensajeLog.findFirst({
      where: { tipo: 'enviado' },
      orderBy: { fecha: 'desc' },
      include: { prospecto: true },
    })
    if (ultimoEnviado?.prospecto && ultimoEnviado?.fecha) {
      const ageMs = Date.now() - new Date(ultimoEnviado.fecha).getTime()
      if (ageMs <= 72 * 60 * 60 * 1000) {
        logger.log(`🧭 Fallback @lid por último enviado -> ${ultimoEnviado.prospecto.nombre} (${ultimoEnviado.prospecto.telefono})`)
        return ultimoEnviado.prospecto
      }
    }

    const candidatoReciente = await prisma.prospecto.findFirst({
      where: { fechaUltimoMensaje: { not: null } },
      orderBy: { fechaUltimoMensaje: 'desc' },
    })
    if (candidatoReciente?.fechaUltimoMensaje) {
      const ageMs = Date.now() - new Date(candidatoReciente.fechaUltimoMensaje).getTime()
      if (ageMs <= 72 * 60 * 60 * 1000) {
        logger.log(`🧭 Fallback @lid por último contacto -> ${candidatoReciente.nombre} (${candidatoReciente.telefono})`)
        return candidatoReciente
      }
    }

    return null
  }

  private containsSchedulingInterest(texto: string): boolean {
    return /(reuni[oó]n|agendar|agenda|disponibilidad|coordinar|si[,!.\s]*gracias|me interesa|ok|dale)/i.test(texto)
  }

  private containsStrongSchedulingInterest(texto: string): boolean {
    return /(quiero agendar|si quiero agendar|sí quiero agendar|agendemos|podemos agendar|coordinemos reuni[oó]n|quiero reuni[oó]n)/i.test(texto)
  }

  private normalizeCandidateTimeTo24h(texto: string): string | null {
    const m = texto.match(/(?:^|\s)([0-2]?\d)[:.]([0-5]\d)\s*(a\.?\s*m\.?|p\.?\s*m\.?)?/i)
    if (!m) return null
    let hh = Number(m[1])
    const mm = m[2]
    const ampm = (m[3] || '').toLowerCase().replace(/\s/g, '')

    if (ampm.startsWith('p') && hh < 12) hh += 12
    if (ampm.startsWith('a') && hh === 12) hh = 0
    if (hh > 23) return null

    return `${String(hh).padStart(2, '0')}:${mm}`
  }

  private offeredSlotTo24h(slot: string): string | null {
    const m = slot.match(/([0-2]?\d):([0-5]\d)\s*(a\.?\s*m\.?|p\.?\s*m\.?)?/i)
    if (!m) return null
    let hh = Number(m[1])
    const mm = m[2]
    const ampm = (m[3] || '').toLowerCase().replace(/\s/g, '')

    if (ampm.startsWith('p') && hh < 12) hh += 12
    if (ampm.startsWith('a') && hh === 12) hh = 0
    if (hh > 23) return null

    return `${String(hh).padStart(2, '0')}:${mm}`
  }

  private selectedMatchesOffered(texto: string, offered: string[]): string | null {
    const selected = this.normalizeCandidateTimeTo24h(texto)
    if (!selected) return null
    const matched = offered.find((s) => this.offeredSlotTo24h(s) === selected)
    return matched || null
  }

  private extractTime(texto: string): string | null {
    return this.normalizeCandidateTimeTo24h(texto)
  }

  private extractEmail(texto: string): string | null {
    const m = texto.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/)
    return m ? m[0].trim().toLowerCase() : null
  }

  private extractTimesTo24h(texto: string): string[] {
    const matches = texto.matchAll(/([0-2]?\d)[:.]([0-5]\d)\s*(a\.?\s*m\.?|p\.?\s*m\.?)?/gi)
    const result: string[] = []
    for (const m of matches) {
      const normalized = this.normalizeCandidateTimeTo24h(`${m[1]}:${m[2]} ${m[3] || ''}`.trim())
      if (normalized) result.push(normalized)
    }
    return Array.from(new Set(result))
  }

  private async savePendingSchedule(
    prospectoId: number,
    startTime: string,
    label: string,
    eventTypeUri: string
  ) {
    this.pendingScheduleByProspect.set(prospectoId, { startTime, label, eventTypeUri })
    await prisma.prospecto.update({
      where: { id: prospectoId },
      data: {
        pendingScheduleStart: new Date(startTime),
        pendingScheduleLabel: label,
        pendingScheduleEvent: eventTypeUri,
      },
    })
  }

  private async clearPendingSchedule(prospectoId: number) {
    this.pendingScheduleByProspect.delete(prospectoId)
    await prisma.prospecto.update({
      where: { id: prospectoId },
      data: {
        pendingScheduleStart: null,
        pendingScheduleLabel: null,
        pendingScheduleEvent: null,
      },
    })
  }

  private async getPendingSchedule(prospectoId: number) {
    const inMemory = this.pendingScheduleByProspect.get(prospectoId)
    if (inMemory) return inMemory

    const row = await prisma.prospecto.findUnique({
      where: { id: prospectoId },
      select: {
        pendingScheduleStart: true,
        pendingScheduleLabel: true,
        pendingScheduleEvent: true,
      },
    })
    if (!row?.pendingScheduleStart || !row.pendingScheduleEvent) return null
    const pending = {
      startTime: row.pendingScheduleStart.toISOString(),
      label: row.pendingScheduleLabel || row.pendingScheduleStart.toISOString(),
      eventTypeUri: row.pendingScheduleEvent,
    }
    this.pendingScheduleByProspect.set(prospectoId, pending)
    return pending
  }

  private async getRecentOfferedSlotsFromDb(prospectoId: number, maxHours = 24): Promise<string[]> {
    const since = new Date(Date.now() - maxHours * 60 * 60 * 1000)
    const lastAvailabilityMsg = await prisma.mensajeLog.findFirst({
      where: {
        prospectoId,
        tipo: 'enviado',
        fecha: { gte: since },
        OR: [
          { plantilla: { in: ['disponibilidad_hoy_manual', 'disponibilidad_auto'] } },
          { contenido: { contains: 'horarios disponibles' } },
        ],
      },
      orderBy: { fecha: 'desc' },
      select: { contenido: true },
    })
    if (!lastAvailabilityMsg?.contenido) return []
    return this.extractTimesTo24h(lastAvailabilityMsg.contenido)
  }

  private async hasRecentSchedulingRequest(prospectoId: number, maxHours = 24): Promise<boolean> {
    const inMemory = this.lastAvailabilityPromptByProspect.get(prospectoId) || 0
    if (inMemory && Date.now() - inMemory <= maxHours * 60 * 60 * 1000) {
      logger.log(`🧭 Solicitud de agenda reciente detectada en memoria para prospecto ${prospectoId}`)
      return true
    }

    const since = new Date(Date.now() - maxHours * 60 * 60 * 1000)
    const recentPrompt = await prisma.mensajeLog.findFirst({
      where: {
        prospectoId,
        tipo: 'enviado',
        fecha: { gte: since },
        OR: [
          { plantilla: { in: ['disponibilidad_hoy_manual', 'disponibilidad_auto'] } },
          { contenido: { contains: 'horarios disponibles' } },
          { contenido: { contains: 'agendar directo aquí' } },
        ],
      },
      orderBy: { fecha: 'desc' },
      select: { id: true },
    })
    if (recentPrompt) {
      logger.log(`🧭 Solicitud de agenda reciente detectada en DB para prospecto ${prospectoId}`)
    } else {
      logger.log(`🧭 Sin solicitud de agenda reciente para prospecto ${prospectoId}`)
    }
    return !!recentPrompt
  }

  private async tryAutoScheduleBySelectedTime(params: {
    prospectoId: number
    nombre: string
    texto: string
    selectedTime: string
    calendlyUrl: string
    calendlyEventTypeUri?: string
  }): Promise<{ scheduled: boolean; joinUrl: string | null; handledMessage?: boolean; pendingEmail?: boolean }> {
    const { prospectoId, nombre, texto, selectedTime, calendlyUrl, calendlyEventTypeUri } = params
    const availability = await getAvailabilityEntries(calendlyUrl, calendlyEventTypeUri, 7)
    if (!availability.entries.length || !availability.eventTypeUri) {
      logger.log(`⚠️ No hay slots para intentar agendar automáticamente a ${nombre}`)
      return { scheduled: false, joinUrl: null }
    }

    const picked = availability.entries.find((entry) => {
      const h = this.normalizeCandidateTimeTo24h(entry.label)
      return h === selectedTime
    })
    if (!picked) {
      logger.log(`ℹ️ ${nombre} eligió ${selectedTime}, pero ese horario ya no está disponible`)
      return { scheduled: false, joinUrl: null }
    }

    const prospecto = await prisma.prospecto.findUnique({ where: { id: prospectoId } })
    const emailFromText = this.extractEmail(texto)
    const emailFromNotes = this.extractEmail(prospecto?.notas || '')
    const email = emailFromText || emailFromNotes
    if (!email) {
      await this.savePendingSchedule(prospectoId, picked.startTime, picked.label, availability.eventTypeUri)
      await this.enviarMensaje(
        prospecto?.telefono || '',
        `¡Excelente ${nombre}! 🙌\n\nPara confirmar automáticamente el horario ${picked.label}, compárteme tu correo (ej: nombre@empresa.com).`
      )
      logger.log(`ℹ️ Falta email para agendar automáticamente a ${nombre}`)
      return { scheduled: false, joinUrl: null, handledMessage: true, pendingEmail: true }
    }

    const created = await createInviteeAtTime({
      eventTypeUri: availability.eventTypeUri,
      startTime: picked.startTime,
      name: nombre,
      email,
      timezone: 'America/Santiago',
    })
    if (!created.ok) {
      logger.log(`⚠️ No se pudo crear invitee en Calendly para ${nombre}`)
      return { scheduled: false, joinUrl: null }
    }

    logger.log(`✅ Reunión agendada automáticamente para ${nombre} (${picked.label})`)
    await this.clearPendingSchedule(prospectoId)
    return { scheduled: true, joinUrl: created.joinUrl }
  }

  private async maybeHandleSchedulingIntent(
    prospectoId: number,
    nombre: string,
    telefono: string,
    texto: string
  ) {
    try {
      logger.log(`🧪 Evaluando agenda automática para ${nombre}: "${texto.substring(0, 80)}"`)
      const cfg = await getConfig()
      const calendlyUrl = (cfg.calendlyUrl || '').trim()
      if (!calendlyUrl) return

      const now = Date.now()
      const lastPrompt = this.lastAvailabilityPromptByProspect.get(prospectoId) || 0
      const selectedTime = this.extractTime(texto)
      const emailInText = this.extractEmail(texto)
      const offered = this.offeredSlotsByProspect.get(prospectoId) || []
      const matchedOfferedSlot = this.selectedMatchesOffered(texto, offered)

      // Si el prospecto envía correo después de elegir horario, cerramos agendamiento pendiente.
      if (emailInText) {
        const pending = await this.getPendingSchedule(prospectoId)
        if (pending) {
          const created = await createInviteeAtTime({
            eventTypeUri: pending.eventTypeUri,
            startTime: pending.startTime,
            name: nombre,
            email: emailInText,
            timezone: 'America/Santiago',
          })
          if (created.ok) {
            await this.clearPendingSchedule(prospectoId)
            const msg = created.joinUrl
              ? `¡Perfecto ${nombre}! 🙌\n\nTu reunión quedó agendada. Aquí tienes el link para entrar:\n${created.joinUrl}`
              : `¡Perfecto ${nombre}! 🙌\n\nTu reunión quedó agendada correctamente. Te llegará la confirmación por correo.`
            await this.enviarMensaje(telefono, msg)
            logger.log(`✅ Reunión confirmada con correo recibido para ${nombre}`)
          } else {
            await this.enviarMensaje(
              telefono,
              `Gracias ${nombre}. Recibí tu correo, pero no pude confirmar automáticamente en este momento.\n\nPuedes reservar directo aquí:\n${calendlyUrl}`
            )
            logger.log(`⚠️ Falló confirmación con correo recibido para ${nombre}`)
          }
          return
        }
      }

      // Solo procesamos respuesta con hora si antes se envió solicitud de agenda
      // (manual o automática), para evitar agendar por cualquier hora aislada.
      const hasRecentPrompt = now - lastPrompt < 24 * 60 * 60 * 1000
      const hasRecentSchedulingRequest = await this.hasRecentSchedulingRequest(prospectoId, 24)
      logger.log(`🧪 Hora detectada=${selectedTime || 'no'} | hasRecentPrompt=${hasRecentPrompt} | hasRecentSchedulingRequest=${hasRecentSchedulingRequest}`)
      if (selectedTime && hasRecentSchedulingRequest) {
        const recentOfferedFromDb = await this.getRecentOfferedSlotsFromDb(prospectoId, 24)
        if (recentOfferedFromDb.length && !recentOfferedFromDb.includes(selectedTime)) {
          const alternatives = recentOfferedFromDb.slice(0, 4).join(' · ')
          const msg = alternatives
            ? `Gracias ${nombre} 🙌\n\nEse horario (${selectedTime}) no está disponible ahora.\n\nLos horarios disponibles son: ${alternatives}\n\nSi te sirve alguno, respóndeme con esa hora exacta.`
            : `Gracias ${nombre} 🙌\n\nEse horario (${selectedTime}) no está disponible ahora. Puedes elegir otro desde aquí:\n${calendlyUrl}`
          await this.enviarMensaje(telefono, msg)
          logger.log(`ℹ️ ${nombre} solicitó hora fuera de oferta reciente (${selectedTime})`)
          return
        }

        const scheduled = await this.tryAutoScheduleBySelectedTime({
          prospectoId,
          nombre,
          texto,
          selectedTime,
          calendlyUrl,
          calendlyEventTypeUri: cfg.calendlyEventTypeUri,
        })

        if (scheduled.scheduled) {
          const confirmMsg = scheduled.joinUrl
            ? `Perfecto ${nombre} 🙌\n\n¡Ya agendé tu reunión! Aquí tienes el link para entrar:\n${scheduled.joinUrl}`
            : `Perfecto ${nombre} 🙌\n\n¡Ya agendé tu reunión! Te llegará también la confirmación por correo.\n\nSi necesitas, también puedes revisar aquí:\n${calendlyUrl}`
          await this.enviarMensaje(telefono, confirmMsg)
          logger.log(`📅 Confirmación de agenda enviada a ${nombre} para horario ${matchedOfferedSlot || selectedTime}`)
        } else if (!scheduled.handledMessage) {
          const selectedLabel = matchedOfferedSlot || selectedTime
          const reasonHint = hasRecentPrompt
            ? ''
            : '\n\nNo pude confirmar automáticamente ese horario en este instante.'
          const confirmMsg = `Perfecto ${nombre} 🙌\n\nTomé tu elección (${selectedLabel}).${reasonHint}\nPara asegurar la reserva de inmediato, usa este enlace:\n${calendlyUrl}\n\nSi quieres, también puedes enviarme tu correo y lo agendo por ti automáticamente.`
          await this.enviarMensaje(telefono, confirmMsg)
          logger.log(`📅 Fallback de confirmación enviado a ${nombre} para horario ${selectedLabel}`)
        } else {
          logger.log(`📅 Flujo ya respondió a ${nombre} (esperando correo), se omite segundo mensaje`)
        }
        return
      }
      if (selectedTime && !hasRecentSchedulingRequest) {
        logger.log(`ℹ️ Hora detectada para ${nombre}, pero sin solicitud de agenda reciente (manual/auto). Se ignora.`)
        return
      }

      if (!this.containsSchedulingInterest(texto)) return
      logger.log(`📅 Intención de agenda detectada para ${nombre}`)

      const isStrongInterest = this.containsStrongSchedulingInterest(texto)
      if (!isStrongInterest && now - lastPrompt < 60 * 60 * 1000) {
        logger.log(`⏱️ Se omite disponibilidad para ${nombre} por cooldown de 1h`)
        return // Evita repetir en menos de 1h para señales débiles.
      }

      const todayAvailability = await getTodayAvailabilitySummary(calendlyUrl, cfg.calendlyEventTypeUri)
      let topSlots = todayAvailability.slots.slice(0, 6)
      let intro = 'Hoy tengo estos horarios disponibles:'

      if (!topSlots.length) {
        const nextAvailability = await getAvailabilitySummary(calendlyUrl, cfg.calendlyEventTypeUri, 7)
        topSlots = nextAvailability.slots.slice(0, 6)
        intro = 'Hoy no tengo cupos, pero estos son los próximos disponibles:'
      }

      this.lastAvailabilityPromptByProspect.set(prospectoId, now)
      if (topSlots.length) {
        this.offeredSlotsByProspect.set(prospectoId, topSlots)
      }

      const msg = topSlots.length
        ? `¡Genial ${nombre}! 🙌\n\n${intro}\n${topSlots.join(' · ')}\n\nRespóndeme con uno (ej: ${topSlots[0]}) y te paso la confirmación automática.\n\nTambién puedes agendar directo aquí:\n${calendlyUrl}`
        : `¡Genial ${nombre}! 🙌\n\nEn este momento no tengo horarios disponibles para hoy ni próximos días desde Calendly.\n\nDe todas formas, puedes revisar y reservar apenas se libere un cupo aquí:\n${calendlyUrl}`
      await this.enviarMensaje(telefono, msg)
      await prisma.mensajeLog.create({
        data: {
          prospectoId,
          tipo: 'enviado',
          plantilla: 'disponibilidad_auto',
          contenido: msg,
        },
      })
      logger.log(`📅 Disponibilidad enviada automáticamente a ${nombre}`)
    } catch (e) {
      logger.log(`❌ Error en flujo de agenda automática para ${nombre}: ${String(e)}`)
      const cfg = await getConfig().catch(() => null)
      const calendlyUrl = (cfg?.calendlyUrl || '').trim()
      if (calendlyUrl) {
        const fallbackMsg = `¡Genial ${nombre}! 🙌\n\nPara no retrasarte, agenda directo aquí:\n${calendlyUrl}`
        await this.enviarMensaje(telefono, fallbackMsg)
        logger.log(`📅 Fallback de agenda enviado a ${nombre}`)
      }
    }
  }
}

export const whatsappService = g.waService ?? new WAService()
if (process.env.NODE_ENV !== 'production') g.waService = whatsappService
