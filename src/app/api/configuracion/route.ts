import { NextRequest, NextResponse } from 'next/server'
import { getConfig, saveConfig } from '@/lib/config'

export const dynamic = 'force-dynamic'

export async function GET() {
  const config = await getConfig()
  return NextResponse.json(config)
}

export async function POST(req: NextRequest) {
  const body = await req.json()
  await saveConfig(body)
  return NextResponse.json({ ok: true })
}
