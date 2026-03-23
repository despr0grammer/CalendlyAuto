'use client'

import { useEffect, useRef } from 'react'

interface Props {
  logs: string[]
}

export function LogBox({ logs }: Props) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (ref.current) {
      ref.current.scrollTop = ref.current.scrollHeight
    }
  }, [logs])

  return (
    <div className="bg-gray-900 rounded-xl p-4">
      <div className="flex items-center justify-between mb-2">
        <span className="text-gray-400 text-xs font-mono">📋 Log del bot</span>
        <span className="text-gray-600 text-xs">{logs.length} líneas</span>
      </div>
      <div
        ref={ref}
        className="font-mono text-xs text-green-400 h-40 overflow-y-auto space-y-0.5"
      >
        {logs.length === 0 ? (
          <p className="text-gray-500">Sin actividad aún...</p>
        ) : (
          logs.map((line, i) => (
            <div key={i} className="leading-5">{line}</div>
          ))
        )}
      </div>
    </div>
  )
}
