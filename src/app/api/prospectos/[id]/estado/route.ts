import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { z } from 'zod'

const schema = z.object({
  estado: z.enum(['pendiente', 'en_secuencia', 'respondio', 'convertido', 'descartado']),
})

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const id = parseInt(params.id)
  const body = await req.json()
  const parsed = schema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: 'Estado inválido' }, { status: 400 })

  const p = await prisma.prospecto.update({
    where: { id },
    data: { estado: parsed.data.estado },
  })
  return NextResponse.json(p)
}
