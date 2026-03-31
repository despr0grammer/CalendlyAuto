'use client'

import type { Stats } from '@/types'

interface Props {
  stats: Stats
  onRespondieronClick?: () => void
}

const ITEMS = [
  { key: 'total', label: 'Total', color: 'bg-gray-100 text-gray-700', emoji: '👥' },
  { key: 'pendientes', label: 'Pendientes', color: 'bg-yellow-50 text-yellow-700', emoji: '⏳' },
  { key: 'en_secuencia', label: 'En secuencia', color: 'bg-blue-50 text-blue-700', emoji: '📨' },
  { key: 'respondieron', label: 'Respondieron', color: 'bg-green-50 text-green-700', emoji: '💬' },
  { key: 'convertidos', label: 'Convertidos', color: 'bg-purple-50 text-purple-700', emoji: '🎯' },
  { key: 'descartados', label: 'Descartados', color: 'bg-red-50 text-red-700', emoji: '🗑️' },
] as const

export function StatsGrid({ stats, onRespondieronClick }: Props) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-6">
      {ITEMS.map(({ key, label, color, emoji }) => (
        key === 'respondieron' ? (
          <button
            key={key}
            onClick={onRespondieronClick}
            className={`rounded-xl p-4 text-left transition hover:shadow hover:scale-[1.01] ${color}`}
            type="button"
          >
            <div className="text-2xl font-bold">{stats[key]}</div>
            <div className="text-xs font-medium mt-1">
              {emoji} {label} (abrir)
            </div>
          </button>
        ) : (
          <div key={key} className={`rounded-xl p-4 ${color}`}>
            <div className="text-2xl font-bold">{stats[key]}</div>
            <div className="text-xs font-medium mt-1">
              {emoji} {label}
            </div>
          </div>
        )
      ))}
    </div>
  )
}
