'use client'

import { useState, useEffect, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import type { Prospecto, MensajeLog, Config } from '@/types'

const ESTADOS = ['pendiente', 'en_secuencia', 'respondio', 'convertido', 'descartado']

async function parseJsonResponse<T extends Record<string, unknown>>(
  res: Response
): Promise<T | null> {
  const text = await res.text()
  if (!text.trim()) return null
  try {
    return JSON.parse(text) as T
  } catch {
    return null
  }
}

export default function DetalleProspectoPage() {
  const { id } = useParams()
  const router = useRouter()
  const [data, setData] = useState<(Prospecto & { mensajesLog: MensajeLog[] }) | null>(null)
  const [loading, setLoading] = useState(true)
  const [mensajeManual, setMensajeManual] = useState('')
  const [enviandoManual, setEnviandoManual] = useState(false)
  const [enviandoDisponibilidad, setEnviandoDisponibilidad] = useState(false)
  const [config, setConfig] = useState<Config | null>(null)
  const [calendlyInput, setCalendlyInput] = useState('')
  const [guardandoCalendly, setGuardandoCalendly] = useState(false)

  const fetchData = useCallback(() => {
    fetch(`/api/prospectos/${id}`)
      .then((r) => r.json())
      .then((d) => { setData(d); setLoading(false) })
  }, [id])

  useEffect(() => { fetchData() }, [fetchData])

  useEffect(() => {
    fetch('/api/configuracion')
      .then((r) => r.json())
      .then((cfg: Config) => {
        setConfig(cfg)
        setCalendlyInput(cfg.calendlyUrl || '')
      })
  }, [])

  const cambiarEstado = async (estado: string) => {
    await fetch(`/api/prospectos/${id}/estado`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ estado }),
    })
    fetchData()
  }

  const enviarMensajeManual = async (texto: string) => {
    if (!texto.trim()) return
    setEnviandoManual(true)
    const res = await fetch(`/api/prospectos/${id}/enviar`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ texto }),
    })
    setEnviandoManual(false)
    if (!res.ok) {
      const err = await parseJsonResponse<{ error?: string }>(res)
      alert(err?.error || `No se pudo enviar el mensaje (${res.status})`)
      return
    }
    setMensajeManual('')
    fetchData()
  }

  const enviarCalendly = async () => {
    const calendlyUrl = (config?.calendlyUrl || calendlyInput || 'https://calendly.com/diego-venegas-abastella/30min').trim()
    const texto = `¡Hola ${data?.nombre}! Gracias por responder 🙌\n\nSi te parece, podemos coordinar una reunión breve aquí:\n${calendlyUrl}\n\nAsí vemos tu caso y te muestro cómo avanzar.`
    await enviarMensajeManual(texto)
  }

  const enviarDisponibilidadManual = async () => {
    setEnviandoDisponibilidad(true)
    const res = await fetch(`/api/prospectos/${id}/enviar-disponibilidad`, {
      method: 'POST',
    })
    setEnviandoDisponibilidad(false)
    const payload = await parseJsonResponse<{ error?: string; slots?: string[] }>(res)
    if (!res.ok) {
      alert(payload?.error || `No se pudo enviar la disponibilidad (${res.status})`)
      return
    }
    fetchData()
    const slots = payload?.slots ?? []
    alert(
      slots.length
        ? `Disponibilidad enviada: ${slots.join(' · ')}`
        : 'Disponibilidad enviada.'
    )
  }

  const guardarCalendly = async () => {
    if (!config) return
    const nuevo = calendlyInput.trim()
    if (!nuevo) {
      alert('Debes ingresar un link de Calendly válido')
      return
    }
    setGuardandoCalendly(true)
    const res = await fetch('/api/configuracion', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...config, calendlyUrl: nuevo }),
    })
    setGuardandoCalendly(false)
    if (!res.ok) {
      alert('No se pudo guardar el link de Calendly')
      return
    }
    setConfig({ ...config, calendlyUrl: nuevo })
  }

  if (loading) return <div className="text-center py-12 text-gray-400">Cargando...</div>
  if (!data) return <div className="text-center py-12 text-red-400">No encontrado</div>

  return (
    <div className="max-w-2xl mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <button onClick={() => router.back()} className="text-gray-400 hover:text-gray-600">← Volver</button>
        <h1 className="text-2xl font-bold text-gray-800">{data.nombre}</h1>
      </div>

      {/* Acciones sobre respuestas */}
      <div className="bg-white rounded-2xl shadow p-6 mb-6">
        <h2 className="text-lg font-semibold text-gray-700 mb-4">🤝 Acciones rápidas</h2>
        <div className="flex flex-wrap gap-2 mb-3">
          <button
            onClick={enviarCalendly}
            disabled={enviandoManual}
            className="px-4 py-2 rounded-lg bg-indigo-600 text-white text-sm hover:bg-indigo-700 disabled:opacity-60"
          >
            Enviar solicitud de reunión (Calendly)
          </button>
          <button
            onClick={enviarDisponibilidadManual}
            disabled={enviandoDisponibilidad}
            className="px-4 py-2 rounded-lg bg-amber-500 text-white text-sm hover:bg-amber-600 disabled:opacity-60"
          >
            {enviandoDisponibilidad ? 'Enviando disponibilidad...' : 'Enviar disponibilidad del día'}
          </button>
          <a
            href={(config?.calendlyUrl || calendlyInput || 'https://calendly.com/diego-venegas-abastella/30min').trim()}
            target="_blank"
            rel="noreferrer"
            className="px-4 py-2 rounded-lg bg-slate-700 text-white text-sm hover:bg-slate-800"
          >
            Abrir Calendly
          </a>
        </div>
        <div className="grid md:grid-cols-[1fr_auto] gap-2 mb-3">
          <input
            value={calendlyInput}
            onChange={(e) => setCalendlyInput(e.target.value)}
            placeholder="Pega aquí tu link de Calendly"
            className="w-full border rounded-lg px-3 py-2 text-sm"
          />
          <button
            onClick={guardarCalendly}
            disabled={guardandoCalendly}
            className="px-4 py-2 rounded-lg bg-sky-600 text-white text-sm hover:bg-sky-700 disabled:opacity-60"
            type="button"
          >
            {guardandoCalendly ? 'Guardando...' : 'Guardar link'}
          </button>
        </div>
        <textarea
          value={mensajeManual}
          onChange={(e) => setMensajeManual(e.target.value)}
          placeholder="Escribe un mensaje manual para este prospecto..."
          className="w-full border rounded-lg p-3 text-sm min-h-24"
        />
        <div className="mt-2">
          <button
            onClick={() => enviarMensajeManual(mensajeManual)}
            disabled={enviandoManual || !mensajeManual.trim()}
            className="px-4 py-2 rounded-lg bg-green-600 text-white text-sm hover:bg-green-700 disabled:opacity-60"
          >
            {enviandoManual ? 'Enviando...' : 'Enviar mensaje manual'}
          </button>
        </div>
      </div>

      {/* Datos del prospecto */}
      <div className="bg-white rounded-2xl shadow p-6 mb-6">
        <div className="grid grid-cols-2 gap-4 text-sm">
          <div><span className="text-gray-500">Teléfono:</span> <span className="font-medium">{data.telefono}</span></div>
          <div><span className="text-gray-500">Empresa:</span> <span className="font-medium">{data.empresa || '—'}</span></div>
          <div><span className="text-gray-500">Rubro:</span> <span className="font-medium">{data.rubro || '—'}</span></div>
          <div><span className="text-gray-500">Etapa:</span> <span className="font-medium">{data.etapaActual}/4</span></div>
          <div><span className="text-gray-500">Mensajes enviados:</span> <span className="font-medium">{data.totalMensajesEnviados}</span></div>
          <div>
            <span className="text-gray-500">Próximo mensaje:</span>{' '}
            <span className="font-medium">
              {data.proximoMensaje ? new Date(data.proximoMensaje).toLocaleString('es-AR') : '—'}
            </span>
          </div>
        </div>

        {data.notas && (
          <div className="mt-4 pt-4 border-t text-sm">
            <span className="text-gray-500">Notas:</span> {data.notas}
          </div>
        )}

        {/* Cambiar estado */}
        <div className="mt-4 pt-4 border-t">
          <p className="text-sm font-medium text-gray-600 mb-2">Cambiar estado:</p>
          <div className="flex flex-wrap gap-2">
            {ESTADOS.map((e) => (
              <button
                key={e}
                onClick={() => cambiarEstado(e)}
                className={`px-3 py-1 rounded-full text-xs transition ${
                  data.estado === e
                    ? 'bg-green-600 text-white'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                {e}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Historial de mensajes */}
      <div className="bg-white rounded-2xl shadow p-6">
        <h2 className="text-lg font-semibold text-gray-700 mb-4">💬 Historial de mensajes</h2>
        {data.mensajesLog.length === 0 ? (
          <p className="text-gray-400 text-sm">Sin mensajes aún.</p>
        ) : (
          <div className="space-y-3">
            {data.mensajesLog.map((m) => (
              <div
                key={m.id}
                className={`p-3 rounded-xl text-sm ${
                  m.tipo === 'enviado' ? 'bg-green-50 text-green-800' : 'bg-blue-50 text-blue-800'
                }`}
              >
                <div className="flex items-center gap-2 mb-1">
                  <span className="font-medium">{m.tipo === 'enviado' ? '📤 Enviado' : '📨 Recibido'}</span>
                  {m.plantilla && <span className="text-xs opacity-60">({m.plantilla})</span>}
                  <span className="ml-auto text-xs opacity-50">
                    {new Date(m.fecha).toLocaleString('es-AR')}
                  </span>
                </div>
                <p className="whitespace-pre-wrap">{m.contenido}</p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
