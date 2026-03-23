import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

export async function GET() {
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
  return NextResponse.json(stats)
}
