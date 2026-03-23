'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

const NAV = [
  { href: '/', label: '🏠 Dashboard' },
  { href: '/prospectos', label: '👥 Prospectos' },
  { href: '/prospectos/nuevo', label: '➕ Nuevo prospecto' },
  { href: '/importar', label: '📂 Importar CSV' },
  { href: '/configuracion', label: '⚙️ Configuración' },
  { href: '/mensajes-preview', label: '👁️ Preview mensajes' },
]

export function Sidebar() {
  const pathname = usePathname()

  return (
    <aside className="w-60 min-h-screen bg-green-900 text-white flex flex-col">
      <div className="p-5 border-b border-green-800">
        <div className="text-lg font-bold">🤖 WA Sales Bot</div>
        <div className="text-green-400 text-xs mt-1">Asistente de prospección</div>
      </div>
      <nav className="flex-1 p-3 space-y-1">
        {NAV.map(({ href, label }) => (
          <Link
            key={href}
            href={href}
            className={`block px-3 py-2 rounded-lg text-sm transition ${
              pathname === href
                ? 'bg-green-700 text-white font-medium'
                : 'text-green-200 hover:bg-green-800 hover:text-white'
            }`}
          >
            {label}
          </Link>
        ))}
      </nav>
      <div className="p-4 text-xs text-green-600">
        Powered by Next.js + Baileys
      </div>
    </aside>
  )
}
