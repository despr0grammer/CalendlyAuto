import { whatsappService } from '@/lib/whatsapp'
import { logger } from '@/lib/logger'
import { prisma } from '@/lib/prisma'
import { initBotScheduler } from '@/lib/bot-scheduler'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

// Inicializa el scheduler en runtime servidor de Next, evitando hacerlo en next.config.
initBotScheduler()

async function getStats() {
  const rows = await prisma.prospecto.groupBy({
    by: ['estado'],
    _count: { estado: true },
  })
  const stats: Record<string, number> = {
    total: 0, pendientes: 0, en_secuencia: 0,
    respondieron: 0, convertidos: 0, descartados: 0,
  }
  for (const r of rows) {
    const n = r._count.estado
    stats.total += n
    if (r.estado === 'pendiente') stats.pendientes = n
    if (r.estado === 'en_secuencia') stats.en_secuencia = n
    if (r.estado === 'respondio') stats.respondieron = n
    if (r.estado === 'convertido') stats.convertidos = n
    if (r.estado === 'descartado') stats.descartados = n
  }
  return stats
}

export async function GET() {
  const encoder = new TextEncoder()
  let closed = false

  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: string, data: unknown) => {
        if (closed) return
        const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`
        try {
          controller.enqueue(encoder.encode(payload))
        } catch {}
      }

      // Enviar estado inicial
      send('bot-estado', whatsappService.getEstado())
      send('log', { lines: logger.getLogs() })
      send('stats', await getStats())

      // Alertas iniciales
      const alertas = await prisma.prospecto.findMany({
        where: { estado: 'respondio' },
        orderBy: { fechaRespuesta: 'desc' },
        take: 10,
      })
      send('alertas', alertas)

      // Escuchar eventos del servicio WhatsApp
      const onEstado = (estado: unknown) => send('bot-estado', estado)
      const onQr = (qrDataUrl: string) => send('qr', { qrDataUrl })
      const onConectado = () => send('bot-estado', whatsappService.getEstado())
      const onRespuesta = async (prospecto: unknown) => {
        send('alerta', prospecto)
        send('stats', await getStats())
      }

      whatsappService.on('estado', onEstado)
      whatsappService.on('qr', onQr)
      whatsappService.on('conectado', onConectado)
      whatsappService.on('respuesta', onRespuesta)

      // Escuchar logs
      const onLog = (line: string) => send('log', { line })
      logger.on('log', onLog)

      // Heartbeat cada 30s para mantener conexión
      const heartbeat = setInterval(() => {
        send('heartbeat', { ts: Date.now() })
      }, 30000)

      // Cleanup cuando el cliente desconecta
      return () => {
        closed = true
        clearInterval(heartbeat)
        whatsappService.off('estado', onEstado)
        whatsappService.off('qr', onQr)
        whatsappService.off('conectado', onConectado)
        whatsappService.off('respuesta', onRespuesta)
        logger.off('log', onLog)
      }
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  })
}
