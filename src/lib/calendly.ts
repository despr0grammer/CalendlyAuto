import { logger } from './logger'

const CALENDLY_API = 'https://api.calendly.com'

interface CalendlyEventType {
  uri: string
  scheduling_url?: string
  slug?: string
}

interface AvailabilitySlot {
  start_time: string
}

interface TokenClaims {
  user_uuid?: string
}

interface CreateInviteeResponse {
  resource?: {
    uri?: string
    scheduling_url?: string
    event?: string
    event_memberships?: Array<{ user?: string }>
    location?: {
      join_url?: string
      status?: string
      type?: string
    }
  }
}

function normalizeSlots(slots: AvailabilitySlot[], withDay = false): string[] {
  return slots
    .map((s) => {
      const dt = new Date(s.start_time)
      if (withDay) {
        const day = dt.toLocaleDateString('es-CL', { weekday: 'short', day: '2-digit', month: '2-digit' })
        const hour = dt.toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' })
        return `${day} ${hour}`
      }
      return dt.toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' })
    })
    .filter(Boolean)
}

async function fetchAvailability(
  eventTypeUri: string,
  start: Date,
  end: Date
): Promise<AvailabilitySlot[]> {
  logger.log(
    `🧪 Calendly disponibilidad: event_type=${eventTypeUri} | desde=${start.toISOString()} | hasta=${end.toISOString()}`
  )
  const query = `/event_type_available_times?event_type=${encodeURIComponent(eventTypeUri)}&start_time=${encodeURIComponent(start.toISOString())}&end_time=${encodeURIComponent(end.toISOString())}`
  const availability = await calendlyGet<{ collection: AvailabilitySlot[] }>(query)
  const collection = availability?.collection || []
  logger.log(`🧪 Calendly slots recibidos: ${collection.length} para event_type=${eventTypeUri}`)
  return collection
}

async function resolveCandidateEventTypeUris(
  calendlyUrl: string,
  configuredUri?: string
): Promise<string[]> {
  const uris = new Set<string>()
  if (configuredUri?.trim()) {
    uris.add(configuredUri.trim())
  }

  const resolvedByUrl = await resolveEventTypeUri(calendlyUrl, undefined)
  if (resolvedByUrl) {
    uris.add(resolvedByUrl)
  }

  const result = Array.from(uris)
  logger.log(`🧩 Calendly candidatos event_type_uri: ${result.join(' | ') || '(ninguno)'}`)
  return result
}

function getToken(): string | null {
  const raw = process.env.CALENDLY_ACCESS_TOKEN
  if (!raw) return null
  const trimmed = raw.trim()
  // Evita 401 por comillas/copiado desde .env o UI.
  return trimmed.replace(/^"+|"+$/g, '')
}

function decodeTokenClaims(token: string): TokenClaims | null {
  try {
    const parts = token.split('.')
    if (parts.length < 2) return null
    const payload = parts[1]
    const normalized = payload.replace(/-/g, '+').replace(/_/g, '/')
    const pad = normalized.length % 4 === 0 ? '' : '='.repeat(4 - (normalized.length % 4))
    const json = Buffer.from(normalized + pad, 'base64').toString('utf8')
    return JSON.parse(json) as TokenClaims
  } catch {
    return null
  }
}

function userUriFromToken(token: string): string | null {
  const claims = decodeTokenClaims(token)
  if (!claims?.user_uuid) return null
  return `https://api.calendly.com/users/${claims.user_uuid}`
}

async function calendlyGet<T>(path: string): Promise<T | null> {
  const token = getToken()
  if (!token) {
    logger.log('⚠️ Calendly: CALENDLY_ACCESS_TOKEN no configurado')
    return null
  }

  try {
    logger.log(`📡 Calendly GET ${path}`)
    const res = await fetch(`${CALENDLY_API}${path}`, {
      headers: { Authorization: `Bearer ${token}` },
      cache: 'no-store',
    })
    if (!res.ok) {
      const body = await res.text().catch(() => '')
      logger.log(`⚠️ Calendly API ${res.status} en ${path}${body ? ` | body=${body}` : ''}`)
      return null
    }
    return (await res.json()) as T
  } catch (e) {
    logger.log('⚠️ Error consultando Calendly API: ' + String(e))
    return null
  }
}

async function calendlyPost<T>(path: string, body: unknown): Promise<T | null> {
  const token = getToken()
  if (!token) {
    logger.log('⚠️ Calendly: CALENDLY_ACCESS_TOKEN no configurado')
    return null
  }

  try {
    logger.log(`📡 Calendly POST ${path}`)
    const res = await fetch(`${CALENDLY_API}${path}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
      cache: 'no-store',
    })
    if (!res.ok) {
      const raw = await res.text().catch(() => '')
      logger.log(`⚠️ Calendly API ${res.status} en POST ${path}${raw ? ` | body=${raw}` : ''}`)
      return null
    }
    return (await res.json()) as T
  } catch (e) {
    logger.log('⚠️ Error POST Calendly API: ' + String(e))
    return null
  }
}

export async function resolveEventTypeUri(calendlyUrl: string, configuredUri?: string): Promise<string | null> {
  if (configuredUri?.trim()) {
    logger.log(`🧩 Calendly usa eventTypeUri configurado: ${configuredUri.trim()}`)
    return configuredUri.trim()
  }

  let userUri: string | null = null
  const me = await calendlyGet<{ resource: { uri: string } }>('/users/me')
  if (me?.resource?.uri) {
    userUri = me.resource.uri
    logger.log(`🧩 Calendly user uri desde /users/me: ${userUri}`)
  } else {
    const token = getToken()
    if (token) {
      userUri = userUriFromToken(token)
      if (userUri) {
        logger.log(`🧩 Calendly user uri desde claim user_uuid del PAT: ${userUri}`)
      }
    }
  }
  if (!userUri) {
    logger.log('⚠️ Calendly: no se pudo resolver user uri ni por /users/me ni por claim user_uuid')
    return null
  }

  const query = `/event_types?user=${encodeURIComponent(userUri)}`
  const types = await calendlyGet<{ collection: CalendlyEventType[] }>(query)
  if (!types?.collection?.length) return null

  const normalized = calendlyUrl.replace(/\/+$/, '')
  const exact = types.collection.find((t) => (t.scheduling_url || '').replace(/\/+$/, '') === normalized)
  if (exact?.uri) {
    logger.log(`🧩 Calendly match exacto URL -> ${exact.uri}`)
    return exact.uri
  }

  const slug = normalized.split('/').filter(Boolean).pop()?.toLowerCase() || ''
  const byIncludes = types.collection.find((t) => {
    const su = (t.scheduling_url || '').toLowerCase()
    const s = (t.slug || '').toLowerCase()
    return (!!slug && (su.includes(`/${slug}`) || s === slug))
  })
  if (byIncludes?.uri) {
    logger.log(`🧩 Calendly match por slug/url parcial -> ${byIncludes.uri}`)
    return byIncludes.uri
  }

  if (types.collection.length === 1) {
    logger.log('ℹ️ Calendly: no hubo match exacto por URL, se usa único event type disponible')
    return types.collection[0].uri
  }

  logger.log('⚠️ Calendly: no se pudo resolver event type por URL. Configura calendlyEventTypeUri en panel.')
  return null
}

export async function getTodayAvailabilitySummary(calendlyUrl: string, configuredUri?: string) {
  logger.log(`📅 getTodayAvailabilitySummary url=${calendlyUrl}`)
  // Calendly exige start_time en futuro.
  const start = new Date(Date.now() + 2 * 60 * 1000)
  start.setSeconds(0, 0)
  const end = new Date(start)
  end.setHours(23, 59, 59, 999)

  const candidates = await resolveCandidateEventTypeUris(calendlyUrl, configuredUri)
  if (!candidates.length) return { slots: [] as string[], eventTypeUri: null }

  for (const uri of candidates) {
    const raw = await fetchAvailability(uri, start, end)
    const slots = normalizeSlots(raw, false)
    if (slots.length) {
      logger.log(`✅ Calendly disponibilidad HOY encontrada con ${uri}: ${slots.join(' · ')}`)
      return { slots, eventTypeUri: uri }
    }
    logger.log(`ℹ️ Calendly sin disponibilidad HOY para ${uri}`)
  }

  logger.log('⚠️ Calendly sin disponibilidad HOY en todos los candidatos')
  return { slots: [] as string[], eventTypeUri: candidates[0] }
}

export async function getAvailabilitySummary(
  calendlyUrl: string,
  configuredUri?: string,
  daysAhead = 7
) {
  logger.log(`📅 getAvailabilitySummary url=${calendlyUrl} daysAhead=${daysAhead}`)
  // Calendly exige rango <= 7 días exactos.
  const safeDaysAhead = Math.max(1, Math.min(daysAhead, 7))
  const start = new Date(Date.now() + 2 * 60 * 1000)
  start.setSeconds(0, 0)
  const end = new Date(start.getTime() + safeDaysAhead * 24 * 60 * 60 * 1000 - 1000)

  const candidates = await resolveCandidateEventTypeUris(calendlyUrl, configuredUri)
  if (!candidates.length) return { slots: [] as string[], eventTypeUri: null }

  for (const uri of candidates) {
    const raw = await fetchAvailability(uri, start, end)
    const slots = normalizeSlots(raw, true)
    if (slots.length) {
      logger.log(`✅ Calendly disponibilidad próximos días con ${uri}: ${slots.join(' · ')}`)
      return { slots, eventTypeUri: uri }
    }
    logger.log(`ℹ️ Calendly sin disponibilidad próximos días para ${uri}`)
  }

  logger.log('⚠️ Calendly sin disponibilidad en próximos días en todos los candidatos')
  return { slots: [] as string[], eventTypeUri: candidates[0] }
}

export function buildAvailabilitySummaryMessage(
  nombre: string,
  calendlyUrl: string,
  slots: string[]
): string {
  const compact = slots.slice(0, 6).join(' · ')
  return `¡Hola ${nombre}! 🙌\n\nHoy tengo estos horarios disponibles:\n${compact}\n\nSi alguno te sirve, respóndeme con la hora (ej: ${slots[0] || '15:30'}) y te confirmo.\n\nTambién puedes reservar directo aquí:\n${calendlyUrl}`
}

export interface AvailabilityEntry {
  startTime: string
  label: string
}

export async function getAvailabilityEntries(
  calendlyUrl: string,
  configuredUri?: string,
  daysAhead = 7
): Promise<{ entries: AvailabilityEntry[]; eventTypeUri: string | null }> {
  const safeDaysAhead = Math.max(1, Math.min(daysAhead, 7))
  const start = new Date(Date.now() + 2 * 60 * 1000)
  start.setSeconds(0, 0)
  const end = new Date(start.getTime() + safeDaysAhead * 24 * 60 * 60 * 1000 - 1000)

  const candidates = await resolveCandidateEventTypeUris(calendlyUrl, configuredUri)
  if (!candidates.length) return { entries: [], eventTypeUri: null }

  for (const uri of candidates) {
    const raw = await fetchAvailability(uri, start, end)
    const entries = raw.map((s) => {
      const dt = new Date(s.start_time)
      const day = dt.toLocaleDateString('es-CL', { weekday: 'short', day: '2-digit', month: '2-digit' })
      const hour = dt.toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' })
      return { startTime: s.start_time, label: `${day} ${hour}` }
    })
    if (entries.length) return { entries, eventTypeUri: uri }
  }

  return { entries: [], eventTypeUri: candidates[0] }
}

export async function createInviteeAtTime(params: {
  eventTypeUri: string
  startTime: string
  name: string
  email: string
  timezone?: string
}): Promise<{ ok: boolean; joinUrl: string | null }> {
  const payload = {
    event_type: params.eventTypeUri,
    start_time: params.startTime,
    invitee: {
      name: params.name,
      email: params.email,
      timezone: params.timezone || 'America/Santiago',
    },
  }
  const created = await calendlyPost<CreateInviteeResponse>('/invitees', payload)
  if (!created?.resource) return { ok: false, joinUrl: null }

  const joinUrl =
    created.resource.location?.join_url ||
    created.resource.scheduling_url ||
    null
  return { ok: true, joinUrl }
}
