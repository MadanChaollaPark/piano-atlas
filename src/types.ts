export type PianoSource = 'openstreetmap' | 'curated_seed'

export type PianoAccess =
  | 'public'
  | 'permissive'
  | 'customers'
  | 'limited'
  | 'unknown'

export type PianoStatus =
  | 'available'
  | 'likely_available'
  | 'unknown'
  | 'limited_access'
  | 'seasonal_closed'
  | 'damaged_present'
  | 'missing_reported'
  | 'retired'

export type PianoCondition = 'excellent' | 'good' | 'fair' | 'poor' | 'unknown'

export type PianoConfidence = 'high' | 'medium' | 'low'

export type InstrumentType =
  | 'acoustic_piano'
  | 'digital_piano'
  | 'upright'
  | 'grand'
  | 'piano_unknown'

export type Piano = {
  id: string
  name: string
  venue: string
  city: string
  region?: string
  country: string
  countryCode: string
  lat: number
  lng: number
  address?: string
  insideDirections?: string
  access: PianoAccess
  accessNotes?: string
  status: PianoStatus
  condition: PianoCondition
  confidence: PianoConfidence
  instrument: InstrumentType
  indoor: boolean | null
  operator?: string
  openingHours?: string
  lastVerified?: string
  source: PianoSource
  sourceUrl?: string
  osm?: {
    type: 'node' | 'way' | 'relation'
    id: number
    version?: number
    updatedAt?: string
    url: string
  }
  tags: string[]
  notes?: string
}

export type PianoMeta = {
  source: 'api' | 'fallback'
  fetchedAt: string
  stale: boolean
  count: number
  message?: string
}

export type PianosResponse = {
  pianos: Piano[]
  meta: PianoMeta
}

export type ReportKind =
  | 'confirm_available'
  | 'missing'
  | 'damaged'
  | 'access_changed'
  | 'add_new'

export type PianoReport = {
  pianoId?: string
  kind: ReportKind
  name?: string
  city?: string
  country?: string
  lat?: number
  lng?: number
  note: string
  contact?: string
}
