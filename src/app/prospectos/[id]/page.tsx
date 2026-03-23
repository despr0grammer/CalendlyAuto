'use client'

import { useState, useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import type { Prospecto, MensajeLog } from '@/types'

const ESTADOS = ['pendiente', 'en_secuencia', 'respondio', 'convertido', 'descartado']

export default function DetalleProspectoPage() {
  const { id } = useParams()
  const router = useRouter()
  const [data, setData] = useState<(Prospecto & { mensajesLog: MensajeLog[] }) | null>(null)
  const [loading, setLoading] = useState(true)

  const fetchData = () => {
    fetch(`/api/prospectos/${id}`)
      .then((r) => r.json())
      .then((d) => { setData(d); setLoading(false) })
  }

  useEffect(() => { fetchData() }, [id])

  const cambiarEstado = async (estado: string) => {
    await fetch(`/api/prospectos/${id}/estado`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ estado }),
    })
    fetchData()
  }

  if (loading) return <div className="text-center py-12 text-gray-400">Cargando...</div>
  if (!data) return <div className="text-center py-12 text-red-400">No encontrado</div>

  return (
    <div className="max-w-2xl mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <button onClick={() => router.back()} className="text-gray-400 hover:text-gray-600">← Volver</button>
        <h1 className="text-2xl font-bold text-gray-800">{data.nombre}</h1>
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
