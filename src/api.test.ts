import { afterEach, describe, expect, it, vi } from 'vitest'
import { seedPianos } from './data/seedPianos'
import { fetchPianos } from './api'

describe('piano API client', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('returns API data when the local backend responds', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        Response.json({
          pianos: [seedPianos[0]],
          meta: {
            source: 'api',
            fetchedAt: '2026-07-03T00:00:00.000Z',
            stale: false,
            count: 1,
          },
        }),
      ),
    )

    const response = await fetchPianos()

    expect(response.meta.source).toBe('api')
    expect(response.pianos).toHaveLength(1)
  })

  it('falls back to bundled seed data when the backend fails', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('broken', { status: 500 })),
    )

    const response = await fetchPianos()

    expect(response.meta.source).toBe('fallback')
    expect(response.meta.stale).toBe(true)
    expect(response.pianos).toHaveLength(seedPianos.length)
  })
})
