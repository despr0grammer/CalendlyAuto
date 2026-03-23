import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { z } from 'zod'

const schema = z.object({
  telefono: z.string().min(5),
  nombre: z.string().optional().default('Mi número de prueba'),
})

export async function POST(req: NextRequest) {
  const body = await req.json()
  const parsed = schema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: 'Datos inválidos' }, { status: 400 })

  const { telefono, nombre } = parsed.data
  const tel = telefono.replace(/[\s+\-()]/g, '')

  try {
    await prisma.prospecto.upsert({
      where: { telefono: tel },
      create: {
        nombre,
        telefono: tel,
        empresa: 'Prueba',
        rubro: 'prueba',
        notas: 'Número de prueba personal',
      },
      update: {
        estado: 'pendiente',
        etapaActual: 0,
        proximoMensaje: null,
      },
    })
    return NextResponse.json({ ok: true, mensaje: 'Prospecto de prueba agregado. Se enviará en el próximo ciclo.' })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
