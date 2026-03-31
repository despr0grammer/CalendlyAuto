'use client'

import { useBotSSE } from '@/hooks/useBotSSE'
import { StatsGrid } from '@/components/dashboard/StatsGrid'
import { BotStatusCard } from '@/components/dashboard/BotStatusCard'
import { LogBox } from '@/components/dashboard/LogBox'
import { useRouter } from 'next/navigation'

export function Dashboard() {
  const router = useRouter()
  const { botEstado, stats, logs, alertas, forzarEnvio, verificarRespuestas } = useBotSSE()

  const handleProbar = async (telefono: string) => {
    const res = await fetch('/api/probar', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ telefono }),
    })
    const data = await res.json()
    alert(data.mensaje || data.error)
  }

  return (
    <div className="max-w-4xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-800">📊 Dashboard</h1>
        <p className="text-gray-500 text-sm mt-1">Asistente de prospección WhatsApp</p>
      </div>

      <StatsGrid
        stats={stats}
        onRespondieronClick={() => router.push('/prospectos?estado=respondio')}
      />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        <BotStatusCard
          botEstado={botEstado}
          onForzarEnvio={forzarEnvio}
          onVerificarRespuestas={verificarRespuestas}
          onProbar={handleProbar}
        />

        {/* Alertas de respuestas */}
        <div className="bg-white rounded-2xl shadow p-6">
          <h2 className="text-lg font-semibold text-gray-700 mb-3">
            🔔 Respondieron ({(alertas as unknown[]).length})
          </h2>
          {(alertas as unknown[]).length === 0 ? (
            <p className="text-gray-400 text-sm">Ningún prospecto ha respondido aún.</p>
          ) : (
            <div className="space-y-2 max-h-48 overflow-y-auto">
              {(alertas as Array<{ id: number; nombre: string; telefono: string; fechaRespuesta: string | null }>).map((a, idx) => (
                <a
                  key={`${a.id}-${a.fechaRespuesta ?? 'na'}-${idx}`}
                  href={`/prospectos/${a.id}`}
                  className="flex items-center gap-3 p-2 rounded-lg hover:bg-green-50 transition"
                >
                  <div className="w-8 h-8 bg-green-100 rounded-full flex items-center justify-center text-green-700 font-bold text-sm">
                    {a.nombre.charAt(0).toUpperCase()}
                  </div>
                  <div>
                    <div className="text-sm font-medium text-gray-800">{a.nombre}</div>
                    <div className="text-xs text-gray-400">{a.telefono}</div>
                  </div>
                  <span className="ml-auto text-green-500 text-xs">💬 Respondió</span>
                </a>
              ))}
            </div>
          )}
        </div>
      </div>

      <LogBox logs={logs} />
    </div>
  )
}
