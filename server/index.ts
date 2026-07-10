import compression from 'compression'
import cors from 'cors'
import express, { type Request, type RequestHandler } from 'express'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { z } from 'zod'
import { seedPianos } from '../src/data/seedPianos.ts'
import {
  filterPianos,
  type Filters,
} from '../src/lib/pianos.ts'
import type { Piano, PianoReport, PianosResponse } from '../src/types.ts'

type CacheFile = {
  fetchedAt: string
  pianos: Piano[]
  upstream: string
  error?: string
}

type OverpassElement = {
  type: 'node' | 'way' | 'relation'
  id: number
  lat?: number
  lon?: number
  center?: { lat: number; lon: number }
  timestamp?: string
  version?: number
  tags?: Record<string, string>
}

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const cacheDir = path.join(__dirname, 'cache')
const pianoCachePath = path.join(cacheDir, 'pianos.json')
const reportsPath = path.join(cacheDir, 'reports.json')
const osmAttribution = '© OpenStreetMap contributors'
const osmLicenseUrl = 'https://opendatacommons.org/licenses/odbl/1-0/'

const app = express()
const port = Number(process.env.PORT ?? 5174)
const refreshRateLimit = createRateLimiter({
  limit: 3,
  windowMs: 60_000,
  shouldLimit: (request) => request.query.refresh === 'true',
})
const reportRateLimit = createRateLimiter({ limit: 10, windowMs: 60_000 })
let inFlightOverpassRefresh: Promise<CacheFile> | null = null

app.use(compression())
app.use(cors())
app.use(express.json({ limit: '64kb' }))

const querySchema = z.object({
  q: z.string().optional(),
  city: z.string().optional(),
  access: z.string().optional(),
  confidence: z.string().optional(),
  status: z.string().optional(),
  source: z.string().optional(),
  bbox: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(1000).optional(),
  refresh: z
    .enum(['true', 'false'])
    .optional()
    .transform((value) => value === 'true'),
})

const reportSchema = z.object({
  pianoId: z.string().optional(),
  kind: z.enum([
    'confirm_available',
    'missing',
    'damaged',
    'access_changed',
    'add_new',
  ]),
  name: z.string().max(120).optional(),
  city: z.string().max(80).optional(),
  country: z.string().max(80).optional(),
  lat: z.number().min(-90).max(90).optional(),
  lng: z.number().min(-180).max(180).optional(),
  note: z.string().min(8).max(1200),
  contact: z.string().max(160).optional(),
})

app.get('/api/health', (_request, response) => {
  response.json({ ok: true, service: 'piano-atlas-api' })
})

app.get('/api/status', async (_request, response) => {
  const cache = await readCache()
  response.json({
    ok: true,
    cache: cache
      ? {
          count: cache.pianos.length,
          fetchedAt: cache.fetchedAt,
          upstream: cache.upstream,
          stale: isStale(cache.fetchedAt),
          error: cache.error,
        }
      : null,
    fallbackCount: seedPianos.length,
    sources: [
      'https://wiki.openstreetmap.org/wiki/Tag%3Aamenity%3Dpiano',
      'https://www.openstreetmap.org/copyright',
    ],
  })
})

app.get('/api/pianos', refreshRateLimit, async (request, response) => {
  const parsed = querySchema.safeParse(request.query)
  if (!parsed.success) {
    response.status(400).json({ error: 'Invalid query parameters' })
    return
  }

  let cache = await readCache()
  let pianos = cache?.pianos ?? seedPianos
  let meta: PianosResponse['meta'] = {
    source: cache ? 'api' : 'fallback',
    fetchedAt: cache?.fetchedAt ?? new Date().toISOString(),
    stale: cache ? isStale(cache.fetchedAt) : true,
    count: pianos.length,
    message: cache?.error,
    attribution: osmAttribution,
    licenseUrl: osmLicenseUrl,
  }

  if (parsed.data.refresh) {
    cache = await refreshOverpass()
    pianos = cache.pianos.length ? cache.pianos : seedPianos
    meta = {
      source: cache.pianos.length ? 'api' : 'fallback',
      fetchedAt: cache.fetchedAt,
      stale: Boolean(cache.error),
      count: pianos.length,
      message: cache.error,
      attribution: osmAttribution,
      licenseUrl: osmLicenseUrl,
    }
  }

  const filters = filtersFromQuery(parsed.data)
  const filtered = applyBbox(filterPianos(pianos, filters), parsed.data.bbox)
  const limit = parsed.data.limit ?? 1000

  response
    .setHeader('cache-control', 'public, max-age=300, stale-while-revalidate=86400')
    .json({
      pianos: filtered.slice(0, limit),
      meta: { ...meta, count: filtered.length },
    } satisfies PianosResponse)
})

app.get('/api/pianos/:id', async (request, response) => {
  const cache = await readCache()
  const piano = [...(cache?.pianos ?? []), ...seedPianos].find(
    (item) => item.id === request.params.id,
  )

  if (!piano) {
    response.status(404).json({ error: 'Piano not found' })
    return
  }

  response.json({ piano })
})

app.post(
  '/api/reports',
  noStore,
  reportRateLimit,
  async (request, response) => {
    const parsed = reportSchema.safeParse(request.body)
    if (!parsed.success) {
      response.status(400).json({ error: 'Invalid report' })
      return
    }

    const report = sanitizeReport(parsed.data)
    const existing = await readReports()
    const id = `report:${Date.now().toString(36)}`
    await writeReports([
      ...existing,
      { id, createdAt: new Date().toISOString(), ...report },
    ])
    response.status(201).json({ ok: true, id })
  },
)

app.listen(port, '127.0.0.1', () => {
  console.log(`Piano Atlas API listening on http://127.0.0.1:${port}`)
})

async function refreshOverpass(): Promise<CacheFile> {
  if (inFlightOverpassRefresh) {
    return inFlightOverpassRefresh
  }

  inFlightOverpassRefresh = performOverpassRefresh()

  try {
    return await inFlightOverpassRefresh
  } finally {
    inFlightOverpassRefresh = null
  }
}

async function performOverpassRefresh(): Promise<CacheFile> {
  const endpoint =
    process.env.OVERPASS_ENDPOINT ?? 'https://overpass-api.de/api/interpreter'
  const query = `[out:json][timeout:45];
nwr["amenity"="piano"];
out center meta qt;`
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 18000)

  try {
    const upstream = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'content-type': 'text/plain;charset=UTF-8',
        'user-agent': 'PianoAtlasLocal/0.1 (local development)',
      },
      body: query,
      signal: controller.signal,
    })

    const body = await upstream.text()
    if (!upstream.ok) {
      throw new Error(`Overpass returned ${upstream.status}`)
    }

    const json = JSON.parse(body) as { elements?: OverpassElement[] }
    const pianos = normalizeOverpass(json.elements ?? [])
    const cache = {
      fetchedAt: new Date().toISOString(),
      pianos,
      upstream: endpoint,
    }
    await writeCache(cache)
    return cache
  } catch (error) {
    const prior = await readCache()
    const message =
      error instanceof Error ? error.message : 'Overpass refresh failed'
    const cache = {
      fetchedAt: prior?.fetchedAt ?? new Date().toISOString(),
      pianos: prior?.pianos ?? [],
      upstream: endpoint,
      error: message,
    }

    if (!prior) {
      await writeCache(cache)
    }

    return cache
  } finally {
    clearTimeout(timeout)
  }
}

function normalizeOverpass(elements: OverpassElement[]) {
  const seen = new Set<string>()
  const pianos: Piano[] = []

  for (const element of elements) {
    const tags = element.tags ?? {}
    const lat = element.lat ?? element.center?.lat
    const lng = element.lon ?? element.center?.lon
    if (lat === undefined || lng === undefined) {
      continue
    }

    const id = `osm:${element.type}:${element.id}`
    if (seen.has(id)) {
      continue
    }

    seen.add(id)
    const city =
      tags['addr:city'] ??
      tags['is_in:city'] ??
      tags['addr:town'] ??
      tags['addr:suburb'] ??
      'Unknown city'
    const countryCode = tags['addr:country']?.toUpperCase()
    const country = countryCode ? countryName(countryCode) : 'Unknown country'
    const access = normalizeAccess(tags.access)
    const instrument = tags.musical_instrument?.includes('digital')
      ? 'digital_piano'
      : 'piano_unknown'

    pianos.push({
      id,
      name: tags.name ?? tags.operator ?? 'Public piano',
      venue: tags.operator ?? tags['addr:full'] ?? city,
      city,
      country,
      countryCode: countryCode ?? 'UN',
      lat,
      lng,
      address: formatAddress(tags),
      insideDirections: tags.level ? `Level ${tags.level}` : tags.location,
      access,
      accessNotes: tags.access ? `OSM access=${tags.access}` : undefined,
      status: access === 'limited' ? 'limited_access' : 'unknown',
      condition: 'unknown',
      confidence: 'high',
      instrument,
      indoor: normalizeIndoor(tags),
      operator: tags.operator,
      openingHours: tags.opening_hours,
      lastVerified: tags.check_date ?? tags['survey:date'],
      source: 'openstreetmap',
      sourceUrl: `https://www.openstreetmap.org/${element.type}/${element.id}`,
      osm: {
        type: element.type,
        id: element.id,
        version: element.version,
        updatedAt: element.timestamp,
        url: `https://www.openstreetmap.org/${element.type}/${element.id}`,
      },
      tags: Object.entries(tags)
        .filter(([key]) =>
          [
            'amenity',
            'musical_instrument',
            'musical_instrument:piano',
            'access',
            'operator',
            'opening_hours',
            'location',
            'check_date',
            'survey:date',
          ].includes(key),
        )
        .map(([key, value]) => `${key}=${value}`),
      notes: tags.description,
    })
  }

  return pianos
}

function countryName(countryCode: string) {
  try {
    return (
      new Intl.DisplayNames(['en'], { type: 'region' }).of(countryCode) ??
      countryCode
    )
  } catch {
    return countryCode
  }
}

function normalizeAccess(value?: string): Piano['access'] {
  if (value === 'yes') {
    return 'public'
  }

  if (value === 'permissive') {
    return 'permissive'
  }

  if (value === 'customers') {
    return 'customers'
  }

  if (value === 'private' || value === 'no') {
    return 'limited'
  }

  return 'unknown'
}

function normalizeIndoor(tags: Record<string, string>) {
  const value = tags.indoor ?? tags.location
  if (!value) {
    return null
  }

  if (['yes', 'indoor', 'inside'].includes(value)) {
    return true
  }

  if (['no', 'outdoor', 'outside'].includes(value)) {
    return false
  }

  return null
}

function formatAddress(tags: Record<string, string>) {
  return [
    tags['addr:housenumber'],
    tags['addr:street'],
    tags['addr:suburb'],
    tags['addr:city'],
    tags['addr:postcode'],
  ]
    .filter(Boolean)
    .join(' ')
}

function filtersFromQuery(query: z.infer<typeof querySchema>): Filters {
  return {
    query: query.q ?? '',
    city: query.city ?? 'all',
    access: (query.access as Filters['access']) ?? 'all',
    confidence: (query.confidence as Filters['confidence']) ?? 'all',
    status: (query.status as Filters['status']) ?? 'all',
    source: (query.source as Filters['source']) ?? 'all',
  }
}

function applyBbox(pianos: Piano[], bbox?: string) {
  if (!bbox) {
    return pianos
  }

  const parts = bbox.split(',').map(Number)
  if (parts.length !== 4 || parts.some((part) => Number.isNaN(part))) {
    return pianos
  }

  const [west, south, east, north] = parts
  return pianos.filter(
    (piano) =>
      piano.lng >= west &&
      piano.lng <= east &&
      piano.lat >= south &&
      piano.lat <= north,
  )
}

function isStale(fetchedAt: string) {
  const ageMs = Date.now() - new Date(fetchedAt).getTime()
  return ageMs > 1000 * 60 * 60 * 24 * 7
}

async function readCache() {
  try {
    return JSON.parse(await readFile(pianoCachePath, 'utf8')) as CacheFile
  } catch {
    return null
  }
}

async function writeCache(cache: CacheFile) {
  await mkdir(cacheDir, { recursive: true })
  await writeFile(pianoCachePath, JSON.stringify(cache, null, 2))
}

async function readReports() {
  try {
    return JSON.parse(await readFile(reportsPath, 'utf8')) as Array<
      PianoReport & { id: string; createdAt: string }
    >
  } catch {
    return []
  }
}

async function writeReports(reports: Array<PianoReport & { id: string; createdAt: string }>) {
  await mkdir(cacheDir, { recursive: true })
  await writeFile(reportsPath, JSON.stringify(reports, null, 2))
}

function sanitizeReport(report: PianoReport): PianoReport {
  return Object.fromEntries(
    Object.entries(report).map(([key, value]) => [
      key,
      typeof value === 'string' ? value.replace(/[<>]/g, '').trim() : value,
    ]),
  ) as PianoReport
}

function noStore(
  _request: Parameters<RequestHandler>[0],
  response: Parameters<RequestHandler>[1],
  next: Parameters<RequestHandler>[2],
) {
  response.setHeader('cache-control', 'no-store')
  next()
}

function createRateLimiter({
  limit,
  windowMs,
  shouldLimit = () => true,
}: {
  limit: number
  windowMs: number
  shouldLimit?: (request: Request) => boolean
}): RequestHandler {
  const clients = new Map<string, { count: number; resetAt: number }>()

  return (request, response, next) => {
    if (!shouldLimit(request)) {
      next()
      return
    }

    const now = Date.now()
    const key = request.ip || request.socket.remoteAddress || 'local'
    const current = clients.get(key)
    const entry =
      !current || current.resetAt <= now
        ? { count: 0, resetAt: now + windowMs }
        : current

    entry.count += 1
    clients.set(key, entry)

    response.setHeader('x-ratelimit-limit', limit)
    response.setHeader('x-ratelimit-remaining', Math.max(0, limit - entry.count))
    response.setHeader('x-ratelimit-reset', Math.ceil(entry.resetAt / 1000))

    if (entry.count > limit) {
      response.setHeader(
        'retry-after',
        Math.max(1, Math.ceil((entry.resetAt - now) / 1000)),
      )
      response.status(429).json({ error: 'Too many requests' })
      return
    }

    next()
  }
}
