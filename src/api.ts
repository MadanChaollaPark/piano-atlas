import { seedPianos } from './data/seedPianos'
import type { Piano, PianoReport, PianosResponse } from './types'

const fallbackResponse = (message: string): PianosResponse => ({
  pianos: seedPianos,
  meta: {
    source: 'fallback',
    fetchedAt: new Date().toISOString(),
    stale: true,
    count: seedPianos.length,
    message,
  },
})

export async function fetchPianos(refresh = false): Promise<PianosResponse> {
  try {
    const response = await fetch(`/api/pianos${refresh ? '?refresh=true' : ''}`)
    if (!response.ok) {
      throw new Error(`API returned ${response.status}`)
    }

    const payload: unknown = await response.json()
    if (!isPianosResponse(payload)) {
      throw new Error('API returned an invalid piano response')
    }

    return payload
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'The local API is unavailable'
    return fallbackResponse(message)
  }
}

export async function sendReport(report: PianoReport) {
  const response = await fetch('/api/reports', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(report),
  })

  if (!response.ok) {
    throw new Error(`Report rejected with ${response.status}`)
  }

  return (await response.json()) as { ok: true; id: string }
}

export function pianoById(pianos: Piano[], id: string) {
  return pianos.find((piano) => piano.id === id)
}

function isPianosResponse(value: unknown): value is PianosResponse {
  if (!value || typeof value !== 'object') return false

  const response = value as Partial<PianosResponse>
  if (!Array.isArray(response.pianos) || !response.meta) return false
  if (
    typeof response.meta.fetchedAt !== 'string' ||
    typeof response.meta.count !== 'number' ||
    typeof response.meta.stale !== 'boolean'
  ) return false

  return response.pianos.every(
    (piano) =>
      piano &&
      typeof piano.id === 'string' &&
      typeof piano.name === 'string' &&
      Number.isFinite(piano.lat) &&
      Number.isFinite(piano.lng),
  )
}
