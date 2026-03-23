import { NextResponse } from 'next/server'
import { procesarEnviosPendientes } from '@/lib/bot-scheduler'
import { logger } from '@/lib/logger'

export async function POST() {
  logger.log('⚡ Envío forzado desde el dashboard')
  // Ejecutar de forma asíncrona sin bloquear la respuesta
  procesarEnviosPendientes().catch((e) =>
    logger.log('❌ Error en envío forzado: ' + String(e))
  )
  return NextResponse.json({ ok: true, mensaje: 'Ciclo de envío iniciado' })
}
