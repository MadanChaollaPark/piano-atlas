import { describe, expect, it } from 'vitest'
import { seedPianos } from '../data/seedPianos'
import {
  defaultFilters,
  distanceKm,
  filterPianos,
  normalizeSearchText,
} from './pianos'

describe('piano filtering', () => {
  it('normalizes accents and case for search', () => {
    expect(normalizeSearchText(' Sao Paulo Station ')).toBe('sao paulo station')
  })

  it('matches search text across venue, city, country, and tags', () => {
    const results = filterPianos(seedPianos, {
      ...defaultFilters,
      query: 'station',
    })

    expect(results.length).toBeGreaterThan(0)
    expect(results.every((piano) => `${piano.name} ${piano.venue} ${piano.tags.join(' ')}`.toLowerCase().includes('station'))).toBe(true)
  })

  it('combines city and status filters', () => {
    const results = filterPianos(seedPianos, {
      ...defaultFilters,
      city: 'Seoul',
      status: 'likely_available',
    })

    expect(results.map((piano) => piano.id).sort()).toEqual([
      'seed:kr:seoul:nodeul',
      'seed:kr:seoul:noksapyeong',
    ])
  })

  it('sorts by nearest distance when a user location is present', () => {
    const seoul = { lat: 37.5665, lng: 126.978 }
    const results = filterPianos(seedPianos, defaultFilters, seoul)

    expect(results[0].city).toBe('Seoul')
    expect(distanceKm(seoul, results[0])).toBeLessThan(8)
  })
})
