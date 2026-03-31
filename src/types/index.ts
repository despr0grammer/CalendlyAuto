export type EstadoProspecto =
  | 'pendiente'
  | 'en_secuencia'
  | 'respondio'
  | 'convertido'
  | 'descartado'

export interface Prospecto {
  id: number
  nombre: string
  telefono: string
  empresa: string
  rubro: string
  notas: string
  estado: EstadoProspecto
  etapaActual: number
  fechaCreacion: string
  fechaUltimoMensaje: string | null
  fechaRespuesta: string | null
  proximoMensaje: string | null
  totalMensajesEnviados: number
}

export interface MensajeLog {
  id: number
  prospectoId: number
  tipo: 'enviado' | 'recibido'
  plantilla: string
  contenido: string
  fecha: string
}

export interface Config {
  calendlyUrl: string
  calendlyEventTypeUri?: string
  empresa: {
    nombre: string
    producto: string
    descripcion: string
    beneficios: string[]
    sitioWeb: string
    telefono: string
    nombreVendedor: string
  }
  secuencia: {
    horasAntesSeguimiento1: number
    horasAntesSeguimiento2: number
    horasAntesSeguimiento3: number
  }
  horarioEnvio: {
    horaInicio: number
    horaFin: number
    diasHabiles: number[]
  }
}

export type EstadoBot = 'detenido' | 'conectando' | 'qr' | 'conectado'

export interface BotEstado {
  estado: EstadoBot
  corriendo: boolean
  conectado: boolean
  qrDataUrl: string | null
}

export interface Stats {
  total: number
  pendientes: number
  en_secuencia: number
  respondieron: number
  convertidos: number
  descartados: number
}

export type PlantillaKey = 'inicial' | 'seguimiento1' | 'seguimiento2' | 'seguimiento3'
