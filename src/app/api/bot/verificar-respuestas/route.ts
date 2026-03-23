import { NextResponse } from 'next/server'
import { logger } from '@/lib/logger'

export async function POST() {
  logger.log('🔍 Verificación manual iniciada — Baileys detecta en tiempo real')
  return NextResponse.json({ ok: true, mensaje: 'Baileys monitorea respuestas en tiempo real automáticamente' })
}
