import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

export async function GET() {
  const alertas = await prisma.prospecto.findMany({
    where: { estado: 'respondio' },
    orderBy: { fechaRespuesta: 'desc' },
    take: 20,
  })
  return NextResponse.json(alertas)
}
