import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { whatsappService } from '@/lib/whatsapp'
import { initBotScheduler } from '@/lib/bot-scheduler'
import { z } from 'zod'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const schema = z.object({
  texto: z.string().min(1),
})

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const id = parseInt(params.id)
  if (Number.isNaN(id)) {
    return NextResponse.json({ error: 'ID inválido' }, { status: 400 })
  }

  const body = await req.json()
  const parsed = schema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Texto inválido' }, { status: 400 })
  }

  const prospecto = await prisma.prospecto.findUnique({ where: { id } })
  if (!prospecto) {
    return NextResponse.json({ error: 'Prospecto no encontrado' }, { status: 404 })
  }

  initBotScheduler()
  const ready = await whatsappService.waitUntilConnected(25000)
  if (!ready) {
    return NextResponse.json(
      {
        error:
          'WhatsApp no está conectado. Abre la página principal del panel o escanea el QR.',
        code: 'WHATSAPP_NOT_CONNECTED',
      },
      { status: 503 }
    )
  }

  const ok = await whatsappService.enviarMensaje(prospecto.telefono, parsed.data.texto)
  if (!ok) {
    return NextResponse.json({ error: 'No se pudo enviar el mensaje', code: 'WHATSAPP_SEND_FAILED' }, { status: 503 })
  }

  await prisma.mensajeLog.create({
    data: {
      prospectoId: prospecto.id,
      tipo: 'enviado',
      plantilla: 'manual',
      contenido: parsed.data.texto,
    },
  })

  return NextResponse.json({ ok: true })
}
