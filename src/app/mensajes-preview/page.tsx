'use client'

import { useState, useEffect } from 'react'
import { PLANTILLAS, ETAPA_A_PLANTILLA } from '@/lib/mensajes'
import type { Config, PlantillaKey } from '@/types'

const ETAPAS: { key: PlantillaKey; label: string }[] = [
  { key: 'inicial', label: '📩 Mensaje inicial' },
  { key: 'seguimiento1', label: '🔔 Seguimiento 1' },
  { key: 'seguimiento2', label: '🔔 Seguimiento 2' },
  { key: 'seguimiento3', label: '👋 Seguimiento 3 (cierre)' },
]

export default function PreviewPage() {
  const [config, setConfig] = useState<Config | null>(null)
  const [activa, setActiva] = useState<PlantillaKey>('inicial')

  useEffect(() => {
    fetch('/api/configuracion').then((r) => r.json()).then(setConfig)
  }, [])

  const renderPlantilla = (key: PlantillaKey) => {
    if (!config) return PLANTILLAS[key]
    return PLANTILLAS[key]
      .replace(/{nombre}/g, 'Juan García')
      .replace(/{empresa_prospecto}/g, 'La empresa del cliente')
      .replace(/{rubro}/g, config.empresa.producto ? 'su sector' : 'su rubro')
      .replace(/{producto}/g, config.empresa.producto)
      .replace(/{empresa}/g, config.empresa.nombre)
      .replace(/{vendedor}/g, config.empresa.nombreVendedor)
      .replace(/{web}/g, config.empresa.sitioWeb)
      .replace(/{beneficio1}/g, config.empresa.beneficios[0] || '✓ Beneficio 1')
      .replace(/{beneficio2}/g, config.empresa.beneficios[1] || '✓ Beneficio 2')
  }

  return (
    <div className="max-w-2xl mx-auto">
      <h1 className="text-2xl font-bold text-gray-800 mb-6">👁️ Preview de mensajes</h1>
      <p className="text-sm text-gray-500 mb-6">
        Vista previa de cómo se verán los mensajes con tu configuración actual.
      </p>

      <div className="flex gap-2 mb-6 flex-wrap">
        {ETAPAS.map(({ key, label }) => (
          <button
            key={key}
            onClick={() => setActiva(key)}
            className={`px-3 py-2 rounded-lg text-sm font-medium transition ${
              activa === key
                ? 'bg-green-600 text-white'
                : 'bg-white border text-gray-600 hover:bg-gray-50'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="bg-gray-800 rounded-2xl p-6">
        <div className="flex items-center gap-2 mb-4">
          <div className="w-8 h-8 bg-green-500 rounded-full flex items-center justify-center text-white text-sm font-bold">
            {config?.empresa.nombreVendedor?.[0] || 'V'}
          </div>
          <div>
            <div className="text-white text-sm font-medium">{config?.empresa.nombreVendedor || 'Vendedor'}</div>
            <div className="text-gray-400 text-xs">{config?.empresa.nombre || 'Tu empresa'}</div>
          </div>
        </div>
        <div className="bg-green-500 rounded-2xl rounded-tl-sm p-4 text-white text-sm whitespace-pre-wrap leading-relaxed max-w-xs">
          {config ? renderPlantilla(activa) : 'Cargando configuración...'}
        </div>
        <div className="text-gray-500 text-xs mt-2 text-right">Ahora ✓✓</div>
      </div>
    </div>
  )
}
