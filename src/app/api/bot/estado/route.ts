import { NextResponse } from 'next/server'
import { whatsappService } from '@/lib/whatsapp'
import { logger } from '@/lib/logger'

export const dynamic = 'force-dynamic'

export async function GET() {
  return NextResponse.json({
    ...whatsappService.getEstado(),
    logs: logger.getLogs().slice(-30),
  })
}
