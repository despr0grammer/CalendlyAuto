import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const id = parseInt(params.id)
  const prospecto = await prisma.prospecto.findUnique({
    where: { id },
    include: { mensajesLog: { orderBy: { fecha: 'asc' } } },
  })
  if (!prospecto) return NextResponse.json({ error: 'No encontrado' }, { status: 404 })
  return NextResponse.json(prospecto)
}
