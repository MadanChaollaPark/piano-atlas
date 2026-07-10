import { useEffect, useMemo, useRef, useState } from 'react'
import type { FormEvent, MouseEvent } from 'react'
import {
  CheckCircle2,
  ChevronDown,
  ExternalLink,
  Flag,
  Layers3,
  List,
  LocateFixed,
  Map as MapIcon,
  MapPin,
  Moon,
  Navigation,
  RefreshCcw,
  Search,
  Send,
  Sun,
  X,
} from 'lucide-react'
import 'leaflet/dist/leaflet.css'
import './App.css'
import { fetchPianos, pianoById, sendReport } from './api'
import { PianoMap } from './components/PianoMap'
import {
  accessLabel,
  cityGroups,
  confidenceLabel,
  defaultFilters,
  distanceKm,
  filterPianos,
  formatDistance,
  mapsUrl,
  sourceLabel,
  statusLabel,
  type Filters,
  type UserLocation,
} from './lib/pianos'
import type { Piano, PianoMeta, PianoReport, PianoStatus } from './types'

type Theme = 'light' | 'dark'
type MobileView = 'map' | 'list'

const statusFilters: Array<PianoStatus | 'all'> = [
  'all',
  'available',
  'likely_available',
  'limited_access',
  'unknown',
]

function App() {
  const [pianos, setPianos] = useState<Piano[]>([])
  const [meta, setMeta] = useState<PianoMeta | null>(null)
  const [filters, setFilters] = useState<Filters>(readFiltersFromUrl)
  const [selectedId, setSelectedId] = useState<string>()
  const [theme, setTheme] = useState<Theme>(readInitialTheme)
  const [mobileView, setMobileView] = useState<MobileView>('map')
  const [userLocation, setUserLocation] = useState<UserLocation>()
  const [loading, setLoading] = useState(true)
  const [locating, setLocating] = useState(false)
  const [syncing, setSyncing] = useState(false)
  const [notice, setNotice] = useState('')
  const [reportTarget, setReportTarget] = useState<Piano | 'new' | null>(null)

  useEffect(() => {
    document.documentElement.dataset.theme = theme
    localStorage.setItem('piano-atlas-theme', theme)
  }, [theme])

  useEffect(() => {
    let cancelled = false

    fetchPianos().then((response) => {
      if (cancelled) return
      setPianos(response.pianos)
      setMeta(response.meta)
      const requestedId = new URLSearchParams(window.location.search).get('piano')
      setSelectedId(
        response.pianos.some((piano) => piano.id === requestedId)
          ? requestedId ?? undefined
          : undefined,
      )
      setLoading(false)
    })

    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    writeStateToUrl(filters, selectedId)
  }, [filters, selectedId])

  const visiblePianos = useMemo(
    () => filterPianos(pianos, filters, userLocation),
    [filters, pianos, userLocation],
  )

  const cities = useMemo(() => cityGroups(pianos), [pianos])
  const selectedPiano = selectedId
    ? pianoById(visiblePianos, selectedId)
    : undefined
  const activeFilterCount = Object.values(filters).filter(
    (value) => value !== '' && value !== 'all',
  ).length

  function updateFilter<K extends keyof Filters>(key: K, value: Filters[K]) {
    setFilters((current) => ({ ...current, [key]: value }))
  }

  function choosePiano(id: string, showMap = false) {
    setSelectedId(id)
    if (showMap) setMobileView('map')
  }

  function locateUser() {
    setNotice('')
    setLocating(true)

    if (!navigator.geolocation) {
      setNotice('Location is not available in this browser.')
      setLocating(false)
      return
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const location = {
          lat: position.coords.latitude,
          lng: position.coords.longitude,
        }
        const nearest = filterPianos(pianos, filters, location)[0]
        setUserLocation(location)
        setSelectedId(nearest?.id)
        setNotice(
          nearest
            ? `${nearest.name} is the closest listed piano to you.`
            : 'Your location is shown on the map.',
        )
        setMobileView('map')
        setLocating(false)
      },
      (error) => {
        const message =
          error.code === error.PERMISSION_DENIED
            ? 'Location permission was denied. Search by city instead.'
            : 'Your location could not be determined. Try again or search by city.'
        setNotice(message)
        setLocating(false)
      },
      { enableHighAccuracy: false, timeout: 10_000, maximumAge: 300_000 },
    )
  }

  async function refreshFromOsm() {
    setSyncing(true)
    setNotice('Refreshing the worldwide OpenStreetMap piano layer.')
    const response = await fetchPianos(true)
    setPianos(response.pianos)
    setMeta(response.meta)
    setSelectedId(response.pianos[0]?.id)
    setNotice(
      response.meta.source === 'api'
        ? `Map refreshed with ${response.pianos.length.toLocaleString()} records.`
        : 'The live source is unavailable, so verified fallback records remain visible.',
    )
    setSyncing(false)
  }

  const resultLabel = loading
    ? 'Loading piano locations'
    : `${visiblePianos.length.toLocaleString()} piano${visiblePianos.length === 1 ? '' : 's'}`

  return (
    <div className="atlas-app">
      <a className="skip-link" href="#piano-results">Skip to piano listings</a>
      <header className="atlas-header">
        <a className="atlas-brand" href="/" aria-label="Piano Atlas home">
          <span className="brand-keys" aria-hidden="true">
            <i />
            <i />
            <i />
          </span>
          <span className="brand-copy">
            <strong>Piano Atlas</strong>
            <small>Public pianos worldwide</small>
          </span>
        </a>

        <div className="world-count" aria-live="polite">
          <span className="live-dot" aria-hidden="true" />
          {loading ? 'Opening the atlas' : `${pianos.length.toLocaleString()} mapped places`}
        </div>

        <div className="header-actions">
          <button
            className="icon-button"
            type="button"
            onClick={() => setReportTarget('new')}
            aria-label="Add a public piano"
            title="Add a public piano"
          >
            <Flag size={19} />
          </button>
          <button
            className="icon-button"
            type="button"
            onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
            aria-label="Toggle dark mode"
            aria-pressed={theme === 'dark'}
            title="Toggle dark mode"
          >
            {theme === 'dark' ? <Sun size={19} /> : <Moon size={19} />}
          </button>
        </div>
      </header>

      <main className="atlas-stage">
        <section
          className="map-canvas"
          role="region"
          aria-label="Public piano map"
        >
          <PianoMap
            pianos={visiblePianos}
            selectedId={selectedPiano?.id}
            userLocation={userLocation}
            theme={theme}
            onSelect={(id) => choosePiano(id)}
          />

          <div className="map-tools" aria-label="Map actions">
            <button type="button" onClick={locateUser} disabled={locating}>
              <LocateFixed size={18} />
              <span>{locating ? 'Locating' : 'Near me'}</span>
            </button>
            <button type="button" onClick={refreshFromOsm} disabled={syncing}>
              <RefreshCcw size={18} className={syncing ? 'spin' : ''} />
              <span>{syncing ? 'Syncing' : 'Sync map'}</span>
            </button>
          </div>

          {selectedPiano && (
            <PianoDetail
              piano={selectedPiano}
              distance={
                userLocation
                  ? distanceKm(userLocation, selectedPiano)
                  : undefined
              }
              onClose={() => setSelectedId(undefined)}
              onReport={() => setReportTarget(selectedPiano)}
            />
          )}

          {!visiblePianos.length && !loading && (
            <div className="map-empty" role="status">
              <MapPin size={24} />
              <strong>No pianos match this view</strong>
              <button type="button" onClick={() => setFilters(defaultFilters)}>
                Clear filters
              </button>
            </div>
          )}
        </section>

        <aside
          className={`explorer-panel ${mobileView === 'list' ? 'mobile-open' : ''}`}
          aria-label="Explore public pianos"
        >
          <div className="explorer-heading">
            <p className="eyebrow">The worldwide piano map</p>
            <h1>Find a piano.<br />Play the city.</h1>
            <p className="intro-copy">
              Discover playable pianos in stations, parks, libraries, airports,
              markets, and other public spaces.
            </p>
          </div>

          <label className="search-control">
            <Search size={19} aria-hidden="true" />
            <span className="sr-only">Search public pianos</span>
            <input
              value={filters.query}
              placeholder="City, venue, or country"
              onChange={(event) => updateFilter('query', event.target.value)}
            />
            {filters.query && (
              <button
                type="button"
                onClick={() => updateFilter('query', '')}
                aria-label="Clear search"
              >
                <X size={16} />
              </button>
            )}
          </label>

          <div className="primary-actions">
            <button className="primary-button" type="button" onClick={locateUser} disabled={locating}>
              <Navigation size={17} />
              {locating ? 'Finding you' : 'Closest to me'}
            </button>
            <button className="secondary-button" type="button" onClick={() => setReportTarget('new')}>
              <Flag size={17} />
              Add piano
            </button>
          </div>

          <div className="filter-block">
            <div className="filter-selects">
              <label>
                <span>City</span>
                <select value={filters.city} onChange={(event) => updateFilter('city', event.target.value)}>
                  <option value="all">Everywhere</option>
                  {cities.map(({ city, count }) => (
                    <option key={city} value={city}>{city} ({count})</option>
                  ))}
                </select>
                <ChevronDown size={15} aria-hidden="true" />
              </label>
              <label>
                <span>Access</span>
                <select
                  value={filters.access}
                  onChange={(event) => updateFilter('access', event.target.value as Filters['access'])}
                >
                  <option value="all">Any access</option>
                  <option value="public">Public</option>
                  <option value="permissive">Permissive</option>
                  <option value="customers">Customers</option>
                  <option value="limited">Limited</option>
                  <option value="unknown">Unknown</option>
                </select>
                <ChevronDown size={15} aria-hidden="true" />
              </label>
            </div>

            <div className="status-filters" aria-label="Availability filters">
              {statusFilters.map((status) => (
                <button
                  key={status}
                  type="button"
                  className={filters.status === status ? 'active' : ''}
                  onClick={() => updateFilter('status', status)}
                  aria-pressed={filters.status === status}
                >
                  {status === 'all' ? 'All' : statusLabel(status)}
                </button>
              ))}
            </div>
          </div>

          <div className="results-heading">
            <div>
              <span>{userLocation ? 'Nearest first' : 'Explore the atlas'}</span>
              <strong>{resultLabel}</strong>
            </div>
            {activeFilterCount > 0 && (
              <button type="button" onClick={() => setFilters(defaultFilters)}>
                Reset {activeFilterCount}
              </button>
            )}
          </div>

          <p className="notice" aria-live="polite">
            {notice || meta?.message || (meta?.stale ? 'Showing resilient fallback data.' : '')}
          </p>

          <div id="piano-results" className="piano-list" aria-busy={loading} tabIndex={-1}>
            {loading && <SkeletonRows />}
            {!loading && visiblePianos.map((piano, index) => (
              <PianoRow
                key={piano.id}
                piano={piano}
                index={index}
                selected={piano.id === selectedPiano?.id}
                distance={userLocation ? distanceKm(userLocation, piano) : undefined}
                onSelect={() => choosePiano(piano.id, true)}
              />
            ))}
          </div>

          <footer className="explorer-footer">
            <span>
              {meta?.source === 'api' ? 'Live OpenStreetMap layer' : 'Curated fallback layer'}
            </span>
            <a href="https://www.awwwards.com/sites/ayla-interactive-map" target="_blank" rel="noreferrer">
              AYLA-inspired design <ExternalLink size={12} />
            </a>
          </footer>
        </aside>
      </main>

      <div className="mobile-view-switch" role="group" aria-label="Choose map or list view">
        <button
          type="button"
          className={mobileView === 'map' ? 'active' : ''}
          onClick={() => setMobileView('map')}
          aria-pressed={mobileView === 'map'}
        >
          <MapIcon size={18} /> Map
        </button>
        <button
          type="button"
          className={mobileView === 'list' ? 'active' : ''}
          onClick={() => setMobileView('list')}
          aria-pressed={mobileView === 'list'}
        >
          <List size={18} /> List
        </button>
      </div>

      {reportTarget && (
        <ReportDialog
          target={reportTarget}
          onClose={() => setReportTarget(null)}
          onDone={(message) => {
            setReportTarget(null)
            setNotice(message)
          }}
        />
      )}
    </div>
  )
}

function PianoRow({
  piano,
  index,
  selected,
  distance,
  onSelect,
}: {
  piano: Piano
  index: number
  selected: boolean
  distance?: number
  onSelect: () => void
}) {
  return (
    <button
      className={selected ? 'piano-row selected' : 'piano-row'}
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
    >
      <span className="row-index">{String(index + 1).padStart(2, '0')}</span>
      <span className="row-copy">
        <strong>{piano.name}</strong>
        <span>{piano.venue}</span>
        <small>{piano.city}, {piano.country}</small>
      </span>
      <span className="row-meta">
        {distance !== undefined && <b>{formatDistance(distance)}</b>}
        <i className={`status-dot status-${piano.status}`} aria-hidden="true" />
        <small>{statusLabel(piano.status)}</small>
      </span>
    </button>
  )
}

function PianoDetail({
  piano,
  distance,
  onClose,
  onReport,
}: {
  piano: Piano
  distance?: number
  onClose: () => void
  onReport: () => void
}) {
  return (
    <aside className="piano-detail" aria-label="Selected piano">
      <div className="detail-topline">
        <span className={`availability status-${piano.status}`}>
          <CheckCircle2 size={14} /> {statusLabel(piano.status)}
        </span>
        <button type="button" onClick={onClose} aria-label="Close piano details">
          <X size={17} />
        </button>
      </div>
      <p className="eyebrow">{piano.city} / {piano.countryCode}</p>
      <h2>{piano.name}</h2>
      <p className="detail-venue">{piano.venue}</p>
      <dl>
        <div><dt>Access</dt><dd>{accessLabel(piano.access)}</dd></div>
        <div><dt>Confidence</dt><dd>{confidenceLabel(piano.confidence)}</dd></div>
        {distance !== undefined && <div><dt>Distance</dt><dd>{formatDistance(distance)}</dd></div>}
      </dl>
      {(piano.insideDirections || piano.accessNotes) && (
        <p className="detail-note">{piano.insideDirections ?? piano.accessNotes}</p>
      )}
      <div className="detail-actions">
        <a href={mapsUrl(piano)} target="_blank" rel="noreferrer">
          <Navigation size={16} /> Directions
        </a>
        <button type="button" onClick={onReport}>
          <Flag size={16} /> Report
        </button>
        {piano.sourceUrl && (
          <a href={piano.sourceUrl} target="_blank" rel="noreferrer" title={sourceLabel(piano.source)}>
            <Layers3 size={16} /> Source
          </a>
        )}
      </div>
    </aside>
  )
}

function SkeletonRows() {
  return (
    <div className="skeleton-rows" aria-hidden="true">
      {Array.from({ length: 5 }).map((_, index) => (
        <div key={index}><span /><span /><span /></div>
      ))}
    </div>
  )
}

function ReportDialog({
  target,
  onClose,
  onDone,
}: {
  target: Piano | 'new'
  onClose: () => void
  onDone: (message: string) => void
}) {
  const isNew = target === 'new'
  const [kind, setKind] = useState<PianoReport['kind']>(isNew ? 'add_new' : 'confirm_available')
  const [note, setNote] = useState('')
  const [name, setName] = useState('')
  const [city, setCity] = useState('')
  const [country, setCountry] = useState('')
  const [contact, setContact] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const dialogRef = useRef<HTMLDivElement>(null)
  const previousFocus = useRef<HTMLElement | null>(null)

  useEffect(() => {
    previousFocus.current = document.activeElement as HTMLElement | null
    const priorOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    const focusable = () =>
      Array.from(
        dialogRef.current?.querySelectorAll<HTMLElement>(
          'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), a[href]',
        ) ?? [],
      )

    const focusTimer = window.setTimeout(() => focusable()[0]?.focus(), 0)
    const handleKeys = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose()
        return
      }

      if (event.key !== 'Tab') return
      const controls = focusable()
      const first = controls[0]
      const last = controls.at(-1)
      if (!first || !last) return

      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }

    window.addEventListener('keydown', handleKeys)
    return () => {
      window.clearTimeout(focusTimer)
      window.removeEventListener('keydown', handleKeys)
      document.body.style.overflow = priorOverflow
      previousFocus.current?.focus()
    }
  }, [onClose])

  async function submit(event: FormEvent) {
    event.preventDefault()
    setSubmitting(true)
    setError('')

    try {
      await sendReport({
        pianoId: isNew ? undefined : target.id,
        kind,
        name: isNew ? name : target.name,
        city: isNew ? city : target.city,
        country: isNew ? country : target.country,
        note,
        contact: contact || undefined,
      })
      onDone(isNew ? 'Thank you. Your piano tip was saved for review.' : 'Thank you. Your piano update was saved for review.')
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'The report could not be saved.')
    } finally {
      setSubmitting(false)
    }
  }

  function dismissFromBackdrop(event: MouseEvent<HTMLDivElement>) {
    if (event.target === event.currentTarget) onClose()
  }

  return (
    <div className="dialog-backdrop" onMouseDown={dismissFromBackdrop}>
      <div ref={dialogRef} className="report-dialog" role="dialog" aria-modal="true" aria-labelledby="report-title">
        <div className="dialog-heading">
          <div>
            <p className="eyebrow">{isNew ? 'Contribute to the atlas' : 'Update this listing'}</p>
            <h2 id="report-title">{isNew ? 'Add a public piano' : target.name}</h2>
          </div>
          <button className="icon-button" type="button" onClick={onClose} aria-label="Close report form">
            <X size={18} />
          </button>
        </div>

        <form onSubmit={submit}>
          {isNew && (
            <div className="form-grid">
              <label><span>Name or venue</span><input autoFocus required value={name} onChange={(event) => setName(event.target.value)} /></label>
              <label><span>City</span><input required value={city} onChange={(event) => setCity(event.target.value)} /></label>
              <label><span>Country</span><input required value={country} onChange={(event) => setCountry(event.target.value)} /></label>
            </div>
          )}
          <label>
            <span>What changed?</span>
            <select value={kind} onChange={(event) => setKind(event.target.value as PianoReport['kind'])}>
              <option value="confirm_available">Still available</option>
              <option value="missing">Missing</option>
              <option value="damaged">Damaged</option>
              <option value="access_changed">Access changed</option>
              <option value="add_new">New piano</option>
            </select>
          </label>
          <label>
            <span>Details</span>
            <textarea
              autoFocus={!isNew}
              required
              minLength={8}
              value={note}
              onChange={(event) => setNote(event.target.value)}
              placeholder="Exact location, access, condition, hours, or a supporting link"
            />
          </label>
          <label><span>Contact (optional)</span><input value={contact} onChange={(event) => setContact(event.target.value)} /></label>
          {error && <p className="form-error" role="alert">{error}</p>}
          <button className="primary-button submit-report" type="submit" disabled={submitting}>
            <Send size={16} /> {submitting ? 'Saving' : 'Submit for review'}
          </button>
        </form>
      </div>
    </div>
  )
}

function readInitialTheme(): Theme {
  const saved = localStorage.getItem('piano-atlas-theme')
  if (saved === 'light' || saved === 'dark') return saved
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

function readFiltersFromUrl(): Filters {
  const params = new URLSearchParams(window.location.search)
  return {
    ...defaultFilters,
    query: params.get('q') ?? '',
    access: (params.get('access') as Filters['access']) ?? 'all',
    confidence: (params.get('confidence') as Filters['confidence']) ?? 'all',
    status: (params.get('status') as Filters['status']) ?? 'all',
    source: (params.get('source') as Filters['source']) ?? 'all',
    city: params.get('city') ?? 'all',
  }
}

function writeStateToUrl(filters: Filters, selectedId?: string) {
  const params = new URLSearchParams()
  for (const [key, value] of Object.entries(filters)) {
    if (value && value !== 'all') params.set(key === 'query' ? 'q' : key, value)
  }
  if (selectedId) params.set('piano', selectedId)
  const query = params.toString()
  window.history.replaceState(null, '', query ? `${window.location.pathname}?${query}` : window.location.pathname)
}

export default App
