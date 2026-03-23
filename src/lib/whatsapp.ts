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

  async iniciar() {
    if (this.state.status !== 'detenido') {
      logger.log('⚠️  WhatsApp ya está iniciado')
      return
    }

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

          logger.log(
            shouldReconnect
              ? `⚠️  Conexión cerrada (código ${statusCode}), reconectando...`
              : '🔴 Sesión cerrada (logout). Escanea el QR nuevamente.'
          )

          this.state.sock = null
          this.state.qrDataUrl = null

          if (shouldReconnect) {
            this.setStatus('detenido')
            setTimeout(() => this.iniciar(), 3000)
          } else {
            // Borrar sesión para que pida QR de nuevo
            fs.rmSync(this.sessionDir, { recursive: true, force: true })
            fs.mkdirSync(this.sessionDir, { recursive: true })
            this.setStatus('detenido')
          }
        }

        if (connection === 'open') {
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
          const telefono = jid.replace('@s.whatsapp.net', '').replace('@g.us', '')
          if (!telefono || jid.includes('@g.us')) continue // ignorar grupos

          const texto =
            msg.message.conversation ||
            msg.message.extendedTextMessage?.text ||
            '[mensaje multimedia]'

          logger.log(`📨 Mensaje recibido de ${telefono}: ${texto.substring(0, 50)}`)

          // Verificar si es un prospecto en secuencia
          try {
            const prospecto = await prisma.prospecto.findUnique({
              where: { telefono },
            })

            if (prospecto && prospecto.estado === 'en_secuencia') {
              await prisma.prospecto.update({
                where: { id: prospecto.id },
                data: { estado: 'respondio', fechaRespuesta: new Date() },
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
            }
          } catch (e) {
            logger.log('❌ Error procesando mensaje: ' + String(e))
          }
        }
      })
    } catch (e) {
      logger.log('❌ Error iniciando WhatsApp: ' + String(e))
      this.setStatus('detenido')
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
}

export const whatsappService = g.waService ?? new WAService()
if (process.env.NODE_ENV !== 'production') g.waService = whatsappService
