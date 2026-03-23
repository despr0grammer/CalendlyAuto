'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import type { Prospecto } from '@/types'

const ESTADOS = ['todos', 'pendiente', 'en_secuencia', 'respondio', 'convertido', 'descartado']

const ESTADO_COLORS: Record<string, string> = {
  pendiente: 'bg-yellow-100 text-yellow-700',
  en_secuencia: 'bg-blue-100 text-blue-700',
  respondio: 'bg-green-100 text-green-700',
  convertido: 'bg-purple-100 text-purple-700',
  descartado: 'bg-red-100 text-red-700',
}

export default function ProspectosPage() {
  const [prospectos, setProspectos] = useState<Prospecto[]>([])
  const [filtro, setFiltro] = useState('todos')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const url = filtro === 'todos' ? '/api/prospectos' : `/api/prospectos?estado=${filtro}`
    fetch(url)
      .then((r) => r.json())
      .then((data) => { setProspectos(data); setLoading(false) })
  }, [filtro])

  return (
    <div className="max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-800">👥 Prospectos</h1>
        <Link
          href="/prospectos/nuevo"
          className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition"
        >
          ➕ Nuevo
        </Link>
      </div>

      {/* Filtros */}
      <div className="flex gap-2 flex-wrap mb-4">
        {ESTADOS.map((e) => (
          <button
            key={e}
            onClick={() => setFiltro(e)}
            className={`px-3 py-1 rounded-full text-xs font-medium transition capitalize ${
              filtro === e
                ? 'bg-green-600 text-white'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            {e}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="text-center py-12 text-gray-400">Cargando...</div>
      ) : prospectos.length === 0 ? (
        <div className="text-center py-12 text-gray-400">
          No hay prospectos en esta categoría.
        </div>
      ) : (
        <div className="bg-white rounded-2xl shadow overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-gray-500 text-xs uppercase">
              <tr>
                <th className="px-4 py-3 text-left">Nombre</th>
                <th className="px-4 py-3 text-left">Teléfono</th>
                <th className="px-4 py-3 text-left">Empresa</th>
                <th className="px-4 py-3 text-left">Estado</th>
                <th className="px-4 py-3 text-left">Etapa</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {prospectos.map((p) => (
                <tr key={p.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 font-medium text-gray-800">{p.nombre}</td>
                  <td className="px-4 py-3 text-gray-500">{p.telefono}</td>
                  <td className="px-4 py-3 text-gray-500">{p.empresa || '—'}</td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${ESTADO_COLORS[p.estado] || 'bg-gray-100 text-gray-600'}`}>
                      {p.estado}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-gray-400">{p.etapaActual}/4</td>
                  <td className="px-4 py-3">
                    <Link href={`/prospectos/${p.id}`} className="text-blue-500 hover:underline text-xs">
                      Ver →
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
