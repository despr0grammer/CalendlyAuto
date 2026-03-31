import { prisma } from './prisma'
import type { Config } from '@/types'

const DEFAULT_CONFIG: Config = {
  calendlyUrl: 'https://calendly.com/diego-venegas-abastella/30min',
  calendlyEventTypeUri: '',
  empresa: {
    nombre: 'Mi Empresa',
    producto: 'Nuestro Software',
    descripcion: 'Software de gestión empresarial',
    beneficios: [
      'Ahorro de tiempo administrativo',
      'Control total de tu negocio',
    ],
    sitioWeb: 'https://miempresa.com',
    telefono: '',
    nombreVendedor: 'El equipo de ventas',
  },
  secuencia: {
    horasAntesSeguimiento1: 48,
    horasAntesSeguimiento2: 72,
    horasAntesSeguimiento3: 120,
  },
  horarioEnvio: {
    horaInicio: 9,
    horaFin: 19,
    diasHabiles: [0, 1, 2, 3, 4],
  },
}

export async function getConfig(): Promise<Config> {
  try {
    const row = await prisma.configuracion.findUnique({ where: { id: 1 } })
    if (!row) return DEFAULT_CONFIG
    const parsed = JSON.parse(row.datos) as Partial<Config>
    return {
      ...DEFAULT_CONFIG,
      ...parsed,
      empresa: {
        ...DEFAULT_CONFIG.empresa,
        ...(parsed.empresa || {}),
      },
      secuencia: {
        ...DEFAULT_CONFIG.secuencia,
        ...(parsed.secuencia || {}),
      },
      horarioEnvio: {
        ...DEFAULT_CONFIG.horarioEnvio,
        ...(parsed.horarioEnvio || {}),
      },
    }
  } catch {
    return DEFAULT_CONFIG
  }
}

export async function saveConfig(config: Config): Promise<void> {
  await prisma.configuracion.upsert({
    where: { id: 1 },
    create: { id: 1, datos: JSON.stringify(config) },
    update: { datos: JSON.stringify(config) },
  })
}

export function getConfigSync(): Config {
  return DEFAULT_CONFIG
}
