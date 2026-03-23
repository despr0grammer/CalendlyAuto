import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function POST(req: NextRequest) {
  const body = await req.json() as Array<{ nombre: string; telefono: string; empresa?: string; rubro?: string; notas?: string }>

  let creados = 0
  let duplicados = 0

  for (const row of body) {
    if (!row.nombre || !row.telefono) continue
    try {
      await prisma.prospecto.create({
        data: {
          nombre: row.nombre,
          telefono: row.telefono,
          empresa: row.empresa || '',
          rubro: row.rubro || '',
          notas: row.notas || '',
        },
      })
      creados++
    } catch {
      duplicados++
    }
  }

  return NextResponse.json({ creados, duplicados })
}
