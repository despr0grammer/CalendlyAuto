'use client'

import Image from 'next/image'
import type { BotEstado } from '@/types'

interface Props {
  botEstado: BotEstado
  onForzarEnvio: () => void
  onVerificarRespuestas: () => void
  onProbar: (telefono: string) => void
}

export function BotStatusCard({ botEstado, onForzarEnvio, onVerificarRespuestas, onProbar }: Props) {
  const { estado, qrDataUrl } = botEstado

  if (estado === 'detenido') {
    return (
      <div className="bg-white rounded-2xl shadow p-6">
        <h2 className="text-lg font-semibold text-gray-700 mb-4">🔴 Bot detenido</h2>
        <p className="text-gray-500 text-sm mb-4">
          El bot no está corriendo. Sigue estos pasos:
        </p>
        <ol className="text-sm text-gray-600 space-y-2 list-decimal list-inside">
          <li>Abre una terminal en la carpeta del proyecto</li>
          <li>Ejecuta: <code className="bg-gray-100 px-1 rounded">npm run dev</code></li>
          <li>Espera a que aparezca el código QR aquí</li>
          <li>Escanéalo con WhatsApp desde tu celular</li>
        </ol>
      </div>
    )
  }

  if (estado === 'conectando') {
    return (
      <div className="bg-white rounded-2xl shadow p-6">
        <h2 className="text-lg font-semibold text-gray-700 mb-4">⏳ Conectando...</h2>
        <div className="flex items-center gap-3 text-gray-500">
          <div className="w-6 h-6 border-2 border-green-500 border-t-transparent rounded-full animate-spin" />
          <span className="text-sm">Iniciando sesión de WhatsApp...</span>
        </div>
      </div>
    )
  }

  if (estado === 'qr' && qrDataUrl) {
    return (
      <div className="bg-white rounded-2xl shadow p-6">
        <h2 className="text-lg font-semibold text-gray-700 mb-2">📱 Escanea el QR con WhatsApp</h2>
        <p className="text-sm text-gray-500 mb-4">
          Abre WhatsApp → Menú → Dispositivos vinculados → Vincular dispositivo
        </p>
        <div className="flex justify-center">
          <div className="border-4 border-green-500 rounded-xl p-2 inline-block">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={qrDataUrl} alt="QR WhatsApp" className="w-48 h-48" />
          </div>
        </div>
        <p className="text-xs text-center text-gray-400 mt-3 animate-pulse">
          ● Esperando escaneo...
        </p>
      </div>
    )
  }

  if (estado === 'conectado') {
    return (
      <div className="bg-white rounded-2xl shadow p-6 space-y-4">
        <div className="flex items-center gap-2">
          <span className="w-3 h-3 bg-green-500 rounded-full animate-pulse" />
          <h2 className="text-lg font-semibold text-green-700">✅ WhatsApp conectado</h2>
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            onClick={onForzarEnvio}
            className="bg-green-600 hover:bg-green-700 text-white text-sm px-4 py-2 rounded-lg font-medium transition"
          >
            ⚡ Enviar ahora
          </button>
          <button
            onClick={onVerificarRespuestas}
            className="bg-blue-600 hover:bg-blue-700 text-white text-sm px-4 py-2 rounded-lg font-medium transition"
          >
            🔍 Verificar respuestas
          </button>
        </div>

        <ProbarForm onProbar={onProbar} />
      </div>
    )
  }

  return null
}

function ProbarForm({ onProbar }: { onProbar: (tel: string) => void }) {
  return (
    <div className="border-t pt-4">
      <p className="text-sm font-medium text-gray-600 mb-2">🧪 Probar con mi número</p>
      <form
        onSubmit={(e) => {
          e.preventDefault()
          const data = new FormData(e.currentTarget)
          onProbar(data.get('telefono') as string)
          e.currentTarget.reset()
        }}
        className="flex gap-2"
      >
        <input
          name="telefono"
          placeholder="+54911XXXXXXXX"
          className="flex-1 border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-400"
          required
        />
        <button
          type="submit"
          className="bg-gray-800 hover:bg-gray-900 text-white text-sm px-3 py-2 rounded-lg transition"
        >
          Agregar
        </button>
      </form>
    </div>
  )
}
