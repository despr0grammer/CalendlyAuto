import cron from 'node-cron'
import { prisma } from './prisma'
import { logger } from './logger'
import { whatsappService } from './whatsapp'
import { getConfig } from './config'
import { generarMensaje, ETAPA_A_PLANTILLA, calcularProximoEnvio } from './mensajes'

// ─── Flags de trigger manual ───────────────────────────────────────────────
let forzarEnvioFlag = false
let forzarLecturaFlag = false

export function triggerEnvio() {
  forzarEnvioFlag = true
}

export function triggerLectura() {
  forzarLecturaFlag = true
}

// ─── Proceso de envíos pendientes ─────────────────────────────────────────
export async function procesarEnviosPendientes() {
  const estado = whatsappService.getEstado()
  if (!estado.conectado) {
    logger.log('⚠️  Bot: WhatsApp no conectado, saltando ciclo de envíos')
    return
  }

  const ahora = new Date()
  const prospectos = await prisma.prospecto.findMany({
    where: {
      estado: { in: ['pendiente', 'en_secuencia'] },
      OR: [
        { proximoMensaje: null },
        { proximoMensaje: { lte: ahora } },
      ],
      etapaActual: { lt: 4 },
    },
  })

  if (prospectos.length === 0) {
    logger.log('✓ Sin mensajes pendientes por enviar')
    return
  }

  logger.log(`📋 ${prospectos.length} prospectos para enviar`)
  const config = await getConfig()

  for (const p of prospectos) {
    const plantillaKey = ETAPA_A_PLANTILLA[p.etapaActual]
    if (!plantillaKey) continue

    const texto = generarMensaje(plantillaKey, {
      nombre: p.nombre,
      empresa: p.empresa,
      rubro: p.rubro,
    }, config)

    logger.log(`📤 Enviando mensaje "${plantillaKey}" a ${p.nombre}...`)

    const ok = await whatsappService.enviarMensaje(p.telefono, texto)

    if (ok) {
      const nuevaEtapa = p.etapaActual + 1
      const proximo = calcularProximoEnvio(nuevaEtapa, config)

      await prisma.prospecto.update({
        where: { id: p.id },
        data: {
          estado: 'en_secuencia',
          etapaActual: nuevaEtapa,
          fechaUltimoMensaje: new Date(),
          proximoMensaje: proximo,
          totalMensajesEnviados: { increment: 1 },
        },
      })

      await prisma.mensajeLog.create({
        data: {
          prospectoId: p.id,
          tipo: 'enviado',
          plantilla: plantillaKey,
          contenido: texto,
        },
      })

      logger.log(`✅ Enviado a ${p.nombre}. Próximo: ${proximo ? proximo.toLocaleString('es-AR') : 'ninguno (secuencia completa)'}`)
    } else {
      logger.log(`❌ Falló envío a ${p.nombre}`)
    }

    // Anti-spam: esperar 12 segundos entre mensajes
    await new Promise((r) => setTimeout(r, 12000))
  }
}

// ─── Verificar respuestas (backup — Baileys ya detecta en tiempo real) ─────
export async function verificarRespuestas() {
  logger.log('🔍 Verificando respuestas (backup)...')
  // Baileys detecta respuestas en tiempo real via messages.upsert
  // Esta función es solo un log informativo
  const respondieron = await prisma.prospecto.count({
    where: { estado: 'respondio' },
  })
  logger.log(`📊 ${respondieron} prospectos han respondido hasta ahora`)
}

// ─── Inicializar scheduler ─────────────────────────────────────────────────
const g = globalThis as unknown as { schedulerInitialized: boolean | undefined }

export function initBotScheduler() {
  if (g.schedulerInitialized) return
  g.schedulerInitialized = true

  logger.log('⏰ Scheduler iniciado')

  // Ciclo de envíos cada 5 minutos
  cron.schedule('*/5 * * * *', async () => {
    if (forzarEnvioFlag) {
      forzarEnvioFlag = false
      logger.log('⚡ Envío forzado manualmente')
    }
    await procesarEnviosPendientes()
  })

  // Ciclo de verificación cada 2 minutos
  cron.schedule('*/2 * * * *', async () => {
    if (forzarLecturaFlag) {
      forzarLecturaFlag = false
      logger.log('⚡ Verificación forzada manualmente')
      await verificarRespuestas()
    }
  })

  // Iniciar WhatsApp automáticamente
  whatsappService.iniciar()
}
