import type { Config, PlantillaKey } from '@/types'

// ─── Plantillas de mensajes ────────────────────────────────────────────────
export const PLANTILLAS: Record<PlantillaKey, string> = {
  inicial: `¡Hola {nombre}! 👋

Soy {vendedor} de *{empresa}*. Me comunico porque trabajamos con empresas del rubro {rubro} y creo que podemos ayudarlos.

Ofrecemos *{producto}* que permite:
✅ {beneficio1}
✅ {beneficio2}

¿Tendrías 5 minutos para contarte cómo lo hacemos? 😊`,

  seguimiento1: `¡Hola {nombre}! ¿Cómo estás?

Te escribo nuevamente de *{empresa}*. Sé que el mensaje anterior pudo haberse perdido entre tantas notificaciones.

¿Podrías darme 15 minutos para mostrarte cómo {producto} puede ayudar a {empresa_prospecto}? Sin compromiso 🤝`,

  seguimiento2: `Hola {nombre} 👋

Sé que los mensajes se acumulan, así que voy al grano.

Muchos negocios como {empresa_prospecto} nos dicen que fue un antes y un después al implementar *{producto}*:

• {beneficio1}
• {beneficio2}

Si en algún momento quieres saber más, acá estaré. ¡Escribime cuando puedas! 😊

— {vendedor} de {empresa}`,

  seguimiento3: `Hola {nombre},

Entiendo que quizás no es el momento o simplemente no es lo que necesitan ahora. Lo respeto totalmente.

Si en el futuro quieren explorar cómo {producto} puede ayudar a su empresa, pueden encontrarnos en:
🌐 {web}

¡Mucho éxito y hasta pronto! 🚀

— {vendedor} de {empresa}`,
}

export const ETAPA_A_PLANTILLA: Record<number, PlantillaKey> = {
  0: 'inicial',
  1: 'seguimiento1',
  2: 'seguimiento2',
  3: 'seguimiento3',
}

// ─── Generar mensaje ──────────────────────────────────────────────────────
export function generarMensaje(
  plantilla: PlantillaKey,
  prospecto: { nombre: string; empresa: string; rubro: string },
  config: Config
): string {
  const b = config.empresa.beneficios
  let msg = PLANTILLAS[plantilla]

  msg = msg
    .replace(/{nombre}/g, prospecto.nombre)
    .replace(/{empresa_prospecto}/g, prospecto.empresa || prospecto.nombre)
    .replace(/{rubro}/g, prospecto.rubro || 'su sector')
    .replace(/{producto}/g, config.empresa.producto)
    .replace(/{empresa}/g, config.empresa.nombre)
    .replace(/{vendedor}/g, config.empresa.nombreVendedor)
    .replace(/{web}/g, config.empresa.sitioWeb)
    .replace(/{beneficio1}/g, b[0] || '')
    .replace(/{beneficio2}/g, b[1] || '')

  return msg
}

// ─── Calcular próximo envío ───────────────────────────────────────────────
export function calcularProximoEnvio(
  nuevaEtapa: number,
  config: Config
): Date | null {
  const { horasAntesSeguimiento1, horasAntesSeguimiento2, horasAntesSeguimiento3 } =
    config.secuencia

  const horas: Record<number, number> = {
    1: horasAntesSeguimiento1,
    2: horasAntesSeguimiento2,
    3: horasAntesSeguimiento3,
  }

  if (!horas[nuevaEtapa]) return null

  const proximo = new Date()
  proximo.setHours(proximo.getHours() + horas[nuevaEtapa])
  return ajustarHorarioLaboral(proximo, config)
}

// ─── Ajustar horario laboral ──────────────────────────────────────────────
export function ajustarHorarioLaboral(fecha: Date, config: Config): Date {
  const { horaInicio, horaFin, diasHabiles } = config.horarioEnvio
  const tzOffset = parseInt(process.env.TZ_OFFSET_HOURS || '-3')

  let d = new Date(fecha)
  // Convertir a hora local (UTC + offset)
  d = new Date(d.getTime() + tzOffset * 60 * 60 * 1000)

  for (let i = 0; i < 14; i++) {
    const diaSemana = d.getDay() === 0 ? 6 : d.getDay() - 1 // 0=lunes
    const hora = d.getUTCHours()

    if (!diasHabiles.includes(diaSemana)) {
      // Fin de semana → siguiente día hábil a horaInicio
      d.setUTCDate(d.getUTCDate() + 1)
      d.setUTCHours(horaInicio, 0, 0, 0)
      continue
    }
    if (hora < horaInicio) {
      d.setUTCHours(horaInicio, 0, 0, 0)
      break
    }
    if (hora >= horaFin) {
      d.setUTCDate(d.getUTCDate() + 1)
      d.setUTCHours(horaInicio, 0, 0, 0)
      continue
    }
    break
  }

  // Convertir de vuelta a UTC
  return new Date(d.getTime() - tzOffset * 60 * 60 * 1000)
}
