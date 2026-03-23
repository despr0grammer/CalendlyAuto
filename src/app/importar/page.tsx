'use client'

import { useState } from 'react'
import Papa from 'papaparse'
import { useRouter } from 'next/navigation'

export default function ImportarPage() {
  const router = useRouter()
  const [preview, setPreview] = useState<unknown[]>([])
  const [result, setResult] = useState<{ creados: number; duplicados: number } | null>(null)
  const [loading, setLoading] = useState(false)

  const handleFile = (file: File) => {
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        setPreview(results.data)
        setResult(null)
      },
    })
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    const file = e.dataTransfer.files[0]
    if (file) handleFile(file)
  }

  const handleImport = async () => {
    setLoading(true)
    // Normalizar columnas
    const normalized = (preview as Record<string, string>[]).map((row) => ({
      nombre: row.nombre || row.name || row.Nombre || '',
      telefono: row.telefono || row.phone || row.tel || row.Telefono || '',
      empresa: row.empresa || row.company || '',
      rubro: row.rubro || row.sector || '',
      notas: row.notas || row.notes || '',
    }))

    const res = await fetch('/api/importar', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(normalized),
    })

    const data = await res.json()
    setResult(data)
    setLoading(false)
    setPreview([])
  }

  return (
    <div className="max-w-2xl mx-auto">
      <h1 className="text-2xl font-bold text-gray-800 mb-6">📂 Importar CSV</h1>

      {result ? (
        <div className="bg-green-50 rounded-2xl p-6 text-center">
          <div className="text-4xl mb-3">✅</div>
          <p className="text-lg font-semibold text-green-700">{result.creados} prospectos importados</p>
          {result.duplicados > 0 && (
            <p className="text-sm text-yellow-600 mt-1">{result.duplicados} duplicados ignorados</p>
          )}
          <button
            onClick={() => router.push('/prospectos')}
            className="mt-4 bg-green-600 text-white px-5 py-2 rounded-lg text-sm hover:bg-green-700"
          >
            Ver prospectos →
          </button>
        </div>
      ) : preview.length > 0 ? (
        <div>
          <div className="bg-white rounded-2xl shadow p-4 mb-4 overflow-x-auto">
            <p className="text-sm text-gray-500 mb-3">{preview.length} filas cargadas — vista previa:</p>
            <table className="text-xs w-full">
              <thead>
                <tr className="text-gray-400 border-b">
                  {Object.keys((preview as Record<string, string>[])[0]).map((k) => (
                    <th key={k} className="text-left pb-2 pr-4">{k}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {(preview as Record<string, string>[]).slice(0, 5).map((row, i) => (
                  <tr key={i} className="border-b border-gray-50">
                    {Object.values(row).map((v, j) => (
                      <td key={j} className="py-1 pr-4 text-gray-600">{String(v).substring(0, 30)}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
            {preview.length > 5 && <p className="text-xs text-gray-400 mt-2">... y {preview.length - 5} más</p>}
          </div>
          <div className="flex gap-3">
            <button
              onClick={handleImport}
              disabled={loading}
              className="bg-green-600 hover:bg-green-700 text-white px-5 py-2 rounded-lg text-sm font-medium disabled:opacity-50"
            >
              {loading ? 'Importando...' : `✅ Importar ${preview.length} contactos`}
            </button>
            <button onClick={() => setPreview([])} className="px-4 py-2 border rounded-lg text-sm text-gray-600 hover:bg-gray-50">
              Cancelar
            </button>
          </div>
        </div>
      ) : (
        <div
          onDrop={handleDrop}
          onDragOver={(e) => e.preventDefault()}
          className="border-2 border-dashed border-gray-300 rounded-2xl p-12 text-center hover:border-green-400 transition"
        >
          <div className="text-5xl mb-4">📄</div>
          <p className="text-gray-600 font-medium mb-2">Arrastra tu archivo CSV aquí</p>
          <p className="text-gray-400 text-sm mb-4">o</p>
          <label className="cursor-pointer bg-green-600 hover:bg-green-700 text-white px-5 py-2 rounded-lg text-sm">
            Seleccionar archivo
            <input
              type="file"
              accept=".csv"
              className="hidden"
              onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
            />
          </label>
          <p className="text-xs text-gray-400 mt-4">
            Columnas esperadas: nombre, telefono, empresa (opcional), rubro (opcional)
          </p>
        </div>
      )}
    </div>
  )
}
