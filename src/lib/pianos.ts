import type {
  Piano,
  PianoAccess,
  PianoConfidence,
  PianoSource,
  PianoStatus,
} from '../types'

export type Filters = {
  query: string
  access: PianoAccess | 'all'
  confidence: PianoConfidence | 'all'
  status: PianoStatus | 'all'
  source: PianoSource | 'all'
  city: string
}

export type UserLocation = {
  lat: number
  lng: number
}

export const defaultFilters: Filters = {
  query: '',
  access: 'all',
  confidence: 'all',
  status: 'all',
  source: 'all',
  city: 'all',
}

export function normalizeSearchText(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
}

export function statusLabel(status: PianoStatus) {
  const labels: Record<PianoStatus, string> = {
    available: 'Available',
    likely_available: 'Likely available',
    unknown: 'Unverified',
    limited_access: 'Limited access',
    seasonal_closed: 'Seasonal',
    damaged_present: 'Damaged',
    missing_reported: 'Missing report',
    retired: 'Historical',
  }

  return labels[status]
}

export function accessLabel(access: PianoAccess) {
  const labels: Record<PianoAccess, string> = {
    public: 'Public',
    permissive: 'Permissive',
    customers: 'Customers',
    limited: 'Limited',
    unknown: 'Unknown',
  }

  return labels[access]
}

export function confidenceLabel(confidence: PianoConfidence) {
  const labels: Record<PianoConfidence, string> = {
    high: 'High confidence',
    medium: 'Medium confidence',
    low: 'Low confidence',
  }

  return labels[confidence]
}

export function sourceLabel(source: PianoSource) {
  return source === 'openstreetmap' ? 'OpenStreetMap' : 'Curated fallback'
}

export function searchableText(piano: Piano) {
  return normalizeSearchText(
    [
      piano.name,
      piano.venue,
      piano.city,
      piano.region,
      piano.country,
      piano.address,
      piano.insideDirections,
      piano.operator,
      piano.notes,
      piano.tags.join(' '),
    ]
      .filter(Boolean)
      .join(' '),
  )
}

export function distanceKm(from: UserLocation, piano: Piano) {
  const radius = 6371
  const dLat = toRadians(piano.lat - from.lat)
  const dLng = toRadians(piano.lng - from.lng)
  const lat1 = toRadians(from.lat)
  const lat2 = toRadians(piano.lat)

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1) *
      Math.cos(lat2) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2)

  return radius * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

function toRadians(value: number) {
  return (value * Math.PI) / 180
}

export function filterPianos(
  pianos: Piano[],
  filters: Filters,
  userLocation?: UserLocation,
) {
  const query = normalizeSearchText(filters.query)

  const filtered = pianos.filter((piano) => {
    if (query && !searchableText(piano).includes(query)) {
      return false
    }

    if (filters.access !== 'all' && piano.access !== filters.access) {
      return false
    }

    if (
      filters.confidence !== 'all' &&
      piano.confidence !== filters.confidence
    ) {
      return false
    }

    if (filters.status !== 'all' && piano.status !== filters.status) {
      return false
    }

    if (filters.source !== 'all' && piano.source !== filters.source) {
      return false
    }

    if (filters.city !== 'all' && piano.city !== filters.city) {
      return false
    }

    return true
  })

  return [...filtered].sort((a, b) => {
    if (userLocation) {
      return distanceKm(userLocation, a) - distanceKm(userLocation, b)
    }

    const statusScore = scoreStatus(b.status) - scoreStatus(a.status)
    if (statusScore !== 0) {
      return statusScore
    }

    return `${a.country}${a.city}${a.name}`.localeCompare(
      `${b.country}${b.city}${b.name}`,
    )
  })
}

function scoreStatus(status: PianoStatus) {
  const scores: Record<PianoStatus, number> = {
    available: 7,
    likely_available: 6,
    limited_access: 5,
    unknown: 4,
    seasonal_closed: 3,
    damaged_present: 2,
    missing_reported: 1,
    retired: 0,
  }

  return scores[status]
}

export function cityGroups(pianos: Piano[]) {
  const counts = new Map<string, number>()
  for (const piano of pianos) {
    counts.set(piano.city, (counts.get(piano.city) ?? 0) + 1)
  }

  return [...counts.entries()]
    .map(([city, count]) => ({ city, count }))
    .sort((a, b) => b.count - a.count || a.city.localeCompare(b.city))
}

export function formatDistance(km?: number) {
  if (km === undefined) {
    return ''
  }

  if (km < 1) {
    return `${Math.round(km * 1000)} m`
  }

  if (km < 100) {
    return `${km.toFixed(1)} km`
  }

  return `${Math.round(km).toLocaleString()} km`
}

export function mapsUrl(piano: Piano) {
  return `https://www.google.com/maps/dir/?api=1&destination=${piano.lat},${piano.lng}`
}
