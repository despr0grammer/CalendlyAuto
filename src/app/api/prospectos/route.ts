import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { z } from 'zod'

export const dynamic = 'force-dynamic'

const createSchema = z.object({
  nombre: z.string().min(1),
  telefono: z.string().min(5),
  empresa: z.string().optional().default(''),
  rubro: z.string().optional().default(''),
  notas: z.string().optional().default(''),
})

export async function GET(req: NextRequest) {
  const estado = req.nextUrl.searchParams.get('estado')
  const prospectos = await prisma.prospecto.findMany({
    where: estado ? { estado } : undefined,
    orderBy: { fechaCreacion: 'desc' },
  })
  return NextResponse.json(prospectos)
}

export async function POST(req: NextRequest) {
  const body = await req.json()
  const parsed = createSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
  }

  try {
    const p = await prisma.prospecto.create({ data: parsed.data })
    return NextResponse.json(p, { status: 201 })
  } catch (e: unknown) {
    if (String(e).includes('Unique')) {
      return NextResponse.json(
        { error: 'El número de teléfono ya existe' },
        { status: 409 }
      )
    }
    return NextResponse.json({ error: 'Error al crear prospecto' }, { status: 500 })
  }
}
