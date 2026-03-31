'use client'

import { useState, useEffect } from 'react'
import type { Config } from '@/types'

export default function ConfiguracionPage() {
  const [config, setConfig] = useState<Config | null>(null)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    fetch('/api/configuracion').then((r) => r.json()).then(setConfig)
  }, [])

  if (!config) return <div className="text-center py-12 text-gray-400">Cargando...</div>

  const set = (path: string, value: unknown) => {
    const keys = path.split('.')
    setConfig((prev) => {
      if (!prev) return prev
      const next = { ...prev }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let obj: any = next
      for (let i = 0; i < keys.length - 1; i++) {
        obj[keys[i]] = { ...obj[keys[i]] }
        obj = obj[keys[i]]
      }
      obj[keys[keys.length - 1]] = value
      return next
    })
  }

  const handleSave = async () => {
    setSaving(true)
    await fetch('/api/configuracion', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(config),
    })
    setSaving(false)
    setSaved(true)
    setTimeout(() => setSaved(false), 3000)
  }

  return (
    <div className="max-w-2xl mx-auto">
      <h1 className="text-2xl font-bold text-gray-800 mb-6">⚙️ Configuración</h1>

      {saved && (
        <div className="bg-green-50 text-green-700 px-4 py-3 rounded-lg text-sm mb-4">
          ✅ Configuración guardada exitosamente
        </div>
      )}

      <div className="space-y-6">
        {/* Calendly */}
        <section className="bg-white rounded-2xl shadow p-6">
          <h2 className="text-lg font-semibold text-gray-700 mb-4">📅 Link de reunión (Calendly)</h2>
          <div>
            <label className="block text-sm font-medium text-gray-600 mb-1">
              URL de agenda
            </label>
            <input
              value={config.calendlyUrl || ''}
              onChange={(e) => set('calendlyUrl', e.target.value)}
              placeholder="https://calendly.com/tu-usuario/tu-evento"
              className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-400"
            />
            <label className="block text-sm font-medium text-gray-600 mt-3 mb-1">
              Event Type URI (opcional, mejora precisión de disponibilidad API)
            </label>
            <input
              value={config.calendlyEventTypeUri || ''}
              onChange={(e) => set('calendlyEventTypeUri', e.target.value)}
              placeholder="https://api.calendly.com/event_types/XXXXXXXX"
              className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-400"
            />
            <p className="text-xs text-gray-400 mt-2">
              Este enlace se usará al enviar solicitud de reunión por WhatsApp.
            </p>
          </div>
        </section>

        {/* Empresa */}
        <section className="bg-white rounded-2xl shadow p-6">
          <h2 className="text-lg font-semibold text-gray-700 mb-4">🏢 Datos de la empresa</h2>
          <div className="space-y-3">
            {[
              { label: 'Nombre de la empresa', key: 'empresa.nombre' },
              { label: 'Nombre del producto/servicio', key: 'empresa.producto' },
              { label: 'Sitio web', key: 'empresa.sitioWeb' },
              { label: 'Nombre del vendedor', key: 'empresa.nombreVendedor' },
            ].map(({ label, key }) => (
              <div key={key}>
                <label className="block text-sm font-medium text-gray-600 mb-1">{label}</label>
                <input
                  value={key.split('.').reduce((o, k) => (o as Record<string, unknown>)[k], config as unknown) as string || ''}
                  onChange={(e) => set(key, e.target.value)}
                  className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-400"
                />
              </div>
            ))}
            <div>
              <label className="block text-sm font-medium text-gray-600 mb-1">Beneficio 1</label>
              <input
                value={config.empresa.beneficios[0] || ''}
                onChange={(e) => set('empresa.beneficios', [e.target.value, config.empresa.beneficios[1] || ''])}
                className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-400"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-600 mb-1">Beneficio 2</label>
              <input
                value={config.empresa.beneficios[1] || ''}
                onChange={(e) => set('empresa.beneficios', [config.empresa.beneficios[0] || '', e.target.value])}
                className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-400"
              />
            </div>
          </div>
        </section>

        {/* Secuencia */}
        <section className="bg-white rounded-2xl shadow p-6">
          <h2 className="text-lg font-semibold text-gray-700 mb-4">⏱️ Tiempos de secuencia</h2>
          <div className="space-y-3">
            {[
              { label: 'Horas antes del seguimiento 1', key: 'secuencia.horasAntesSeguimiento1' },
              { label: 'Horas antes del seguimiento 2', key: 'secuencia.horasAntesSeguimiento2' },
              { label: 'Horas antes del seguimiento 3', key: 'secuencia.horasAntesSeguimiento3' },
            ].map(({ label, key }) => (
              <div key={key} className="flex items-center gap-3">
                <label className="flex-1 text-sm text-gray-600">{label}</label>
                <input
                  type="number"
                  min={1}
                  value={key.split('.').reduce((o, k) => (o as Record<string, unknown>)[k], config as unknown) as number || 0}
                  onChange={(e) => set(key, parseInt(e.target.value))}
                  className="w-24 border rounded-lg px-3 py-2 text-sm text-center focus:outline-none focus:ring-2 focus:ring-green-400"
                />
                <span className="text-xs text-gray-400">horas</span>
              </div>
            ))}
          </div>
        </section>

        {/* Horario */}
        <section className="bg-white rounded-2xl shadow p-6">
          <h2 className="text-lg font-semibold text-gray-700 mb-4">🕐 Horario de envío</h2>
          <div className="flex gap-6">
            <div>
              <label className="block text-sm text-gray-600 mb-1">Hora inicio</label>
              <input
                type="number" min={0} max={23}
                value={config.horarioEnvio.horaInicio}
                onChange={(e) => set('horarioEnvio.horaInicio', parseInt(e.target.value))}
                className="w-20 border rounded-lg px-3 py-2 text-sm text-center focus:outline-none focus:ring-2 focus:ring-green-400"
              />
            </div>
            <div>
              <label className="block text-sm text-gray-600 mb-1">Hora fin</label>
              <input
                type="number" min={0} max={23}
                value={config.horarioEnvio.horaFin}
                onChange={(e) => set('horarioEnvio.horaFin', parseInt(e.target.value))}
                className="w-20 border rounded-lg px-3 py-2 text-sm text-center focus:outline-none focus:ring-2 focus:ring-green-400"
              />
            </div>
          </div>
        </section>

        <button
          onClick={handleSave}
          disabled={saving}
          className="w-full bg-green-600 hover:bg-green-700 text-white py-3 rounded-xl font-medium transition disabled:opacity-50"
        >
          {saving ? 'Guardando...' : '💾 Guardar configuración'}
        </button>
      </div>
    </div>
  )
}
