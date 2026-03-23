'use client'

import { useEffect, useState, useRef } from 'react'
import type { Stats, BotEstado } from '@/types'

interface SSEState {
  botEstado: BotEstado
  stats: Stats
  logs: string[]
  alertas: unknown[]
}

const DEFAULT_ESTADO: BotEstado = {
  estado: 'detenido',
  corriendo: false,
  conectado: false,
  qrDataUrl: null,
}

const DEFAULT_STATS: Stats = {
  total: 0,
  pendientes: 0,
  en_secuencia: 0,
  respondieron: 0,
  convertidos: 0,
  descartados: 0,
}

export function useBotSSE() {
  const [state, setState] = useState<SSEState>({
    botEstado: DEFAULT_ESTADO,
    stats: DEFAULT_STATS,
    logs: [],
    alertas: [],
  })

  const esRef = useRef<EventSource | null>(null)

  useEffect(() => {
    const connect = () => {
      const es = new EventSource('/api/sse')
      esRef.current = es

      es.addEventListener('bot-estado', (e) => {
        const data = JSON.parse(e.data)
        setState((s) => ({ ...s, botEstado: data }))
      })

      es.addEventListener('qr', (e) => {
        const data = JSON.parse(e.data)
        setState((s) => ({
          ...s,
          botEstado: {
            ...s.botEstado,
            qrDataUrl: data.qrDataUrl,
            estado: 'qr',
          },
        }))
      })

      es.addEventListener('log', (e) => {
        const data = JSON.parse(e.data)
        if (data.lines) {
          setState((s) => ({ ...s, logs: data.lines }))
        } else if (data.line) {
          setState((s) => ({
            ...s,
            logs: [...s.logs.slice(-99), data.line],
          }))
        }
      })

      es.addEventListener('stats', (e) => {
        const data = JSON.parse(e.data)
        setState((s) => ({ ...s, stats: data }))
      })

      es.addEventListener('alertas', (e) => {
        const data = JSON.parse(e.data)
        setState((s) => ({ ...s, alertas: data }))
      })

      es.addEventListener('alerta', (e) => {
        const data = JSON.parse(e.data)
        setState((s) => ({
          ...s,
          alertas: [data, ...s.alertas.slice(0, 19)],
        }))
      })

      es.onerror = () => {
        es.close()
        // Reconectar después de 3s
        setTimeout(connect, 3000)
      }
    }

    connect()

    return () => {
      esRef.current?.close()
    }
  }, [])

  const forzarEnvio = async () => {
    await fetch('/api/bot/forzar-envio', { method: 'POST' })
  }

  const verificarRespuestas = async () => {
    await fetch('/api/bot/verificar-respuestas', { method: 'POST' })
  }

  return { ...state, forzarEnvio, verificarRespuestas }
}
