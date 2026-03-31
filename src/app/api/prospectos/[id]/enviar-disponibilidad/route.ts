import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { whatsappService } from '@/lib/whatsapp'
import { initBotScheduler } from '@/lib/bot-scheduler'
import { getConfig } from '@/lib/config'
import { buildAvailabilitySummaryMessage, getAvailabilitySummary, getTodayAvailabilitySummary } from '@/lib/calendly'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(
  _req: Request,
  { params }: { params: { id: string } }
) {
  const id = Number(params.id)
  if (Number.isNaN(id)) {
    return NextResponse.json({ error: 'ID inválido' }, { status: 400 })
  }

  const prospecto = await prisma.prospecto.findUnique({ where: { id } })
  if (!prospecto) {
    return NextResponse.json({ error: 'Prospecto no encontrado' }, { status: 404 })
  }

  const cfg = await getConfig()
  const calendlyUrl = (cfg.calendlyUrl || '').trim()
  if (!calendlyUrl) {
    return NextResponse.json({ error: 'No hay link de Calendly configurado' }, { status: 400 })
  }

  const availability = await getTodayAvailabilitySummary(calendlyUrl, cfg.calendlyEventTypeUri)
  const slots = availability.slots.slice(0, 6)
  let texto = ''
  let sentSlots = slots

  if (slots.length) {
    texto = buildAvailabilitySummaryMessage(prospecto.nombre, calendlyUrl, slots)
  } else {
    const nextAvailability = await getAvailabilitySummary(calendlyUrl, cfg.calendlyEventTypeUri, 7)
    const nextSlots = nextAvailability.slots.slice(0, 6)
    if (!nextSlots.length) {
      texto = `¡Hola ${prospecto.nombre}! 🙌\n\nHoy no aparecen horarios disponibles en Calendly y tampoco encontré cupos en los próximos días.\n\nPuedes revisar y reservar cuando se abra disponibilidad aquí:\n${calendlyUrl}`
      sentSlots = []
    } else {
      texto = `¡Hola ${prospecto.nombre}! 🙌\n\nHoy no tengo cupos, pero estos son los próximos horarios disponibles:\n${nextSlots.join(' · ')}\n\nSi alguno te sirve, te ayudo a confirmarlo. También puedes reservar directo aquí:\n${calendlyUrl}`
      sentSlots = nextSlots
    }
  }

  // Mismo arranque que el dashboard (SSE); si no, WhatsApp queda detenido y enviarMensaje falla con 503.
  initBotScheduler()
  const ready = await whatsappService.waitUntilConnected(25000)
  if (!ready) {
    return NextResponse.json(
      {
        error:
          'WhatsApp no está conectado. Abre la página principal del panel unos segundos (para que el bot conecte) o escanea el QR si te lo pide.',
        code: 'WHATSAPP_NOT_CONNECTED',
      },
      { status: 503 }
    )
  }

  const ok = await whatsappService.enviarMensaje(prospecto.telefono, texto)
  if (!ok) {
    return NextResponse.json(
      { error: 'No se pudo enviar el mensaje por WhatsApp', code: 'WHATSAPP_SEND_FAILED' },
      { status: 503 }
    )
  }

  await prisma.mensajeLog.create({
    data: {
      prospectoId: prospecto.id,
      tipo: 'enviado',
      plantilla: 'disponibilidad_hoy_manual',
      contenido: texto,
    },
  })

  return NextResponse.json({ ok: true, slots: sentSlots })
}
