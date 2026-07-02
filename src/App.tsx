import { useEffect, useMemo, useState } from 'react'
import type { FormEvent } from 'react'
import {
  ChevronDown,
  Compass,
  ExternalLink,
  Flag,
  ListFilter,
  LocateFixed,
  Map,
  MapPin,
  Moon,
  Music2,
  RefreshCcw,
  Route,
  Search,
  Send,
  Sparkles,
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
type ViewMode = 'list' | 'map'
type VariantId = 'grid' | 'stays' | 'food' | 'atlas' | 'locator'

type Variant = {
  id: VariantId
  number: string
  name: string
  reference: string
  proofUrl: string
  tagline: string
  cta: string
}

const variants: Record<VariantId, Variant> = {
  grid: {
    id: 'grid',
    number: '01',
    name: 'Neighborhood Guide',
    reference: 'On The Grid',
    proofUrl: 'https://www.awwwards.com/sites/on-the-grid-city',
    tagline: 'Numbered city guide with neighborhood shortcuts and editorial cards.',
    cta: 'Find closest pianos',
  },
  stays: {
    id: 'stays',
    number: '02',
    name: 'Stay Finder',
    reference: 'Welcome Beyond',
    proofUrl: 'https://www.theguardian.com/travel/2011/jul/15/best-travel-websites',
    tagline: 'Editorial accommodation search with calm list/map filtering.',
    cta: 'Use my location',
  },
  food: {
    id: 'food',
    number: '03',
    name: 'Taste Atlas',
    reference: 'TasteAtlas',
    proofUrl: 'https://www.awwwards.com/sites/tasteatlas',
    tagline: 'Map-first food atlas with near-me discovery, rankings, and dense cards.',
    cta: 'Rank near me',
  },
  atlas: {
    id: 'atlas',
    number: '04',
    name: 'Curious Atlas',
    reference: 'National Parks',
    proofUrl: 'https://www.awwwards.com/sites/national-parks',
    tagline: 'Archive-style place browser with sidebar, gallery rhythm, and map.',
    cta: 'Start nearby',
  },
  locator: {
    id: 'locator',
    number: '05',
    name: 'Map Locator',
    reference: 'AYLA Interactive Map',
    proofUrl: 'https://www.awwwards.com/sites/ayla-interactive-map',
    tagline: 'Illustrated destination-map behavior with animated location previews.',
    cta: 'Closest pianos',
  },
}

const variantOrder: VariantId[] = ['grid', 'stays', 'food', 'atlas', 'locator']

const statusOptions: Array<PianoStatus | 'all'> = [
  'all',
  'available',
  'likely_available',
  'limited_access',
  'seasonal_closed',
  'unknown',
]

function App() {
  const variant = variants[readVariantId()]
  const [pianos, setPianos] = useState<Piano[]>([])
  const [meta, setMeta] = useState<PianoMeta | null>(null)
  const [filters, setFilters] = useState<Filters>(() => readFiltersFromUrl())
  const [selectedId, setSelectedId] = useState<string>()
  const [loading, setLoading] = useState(true)
  const [syncing, setSyncing] = useState(false)
  const [viewMode, setViewMode] = useState<ViewMode>(
    variant.id === 'locator' ? 'map' : 'list',
  )
  const [theme, setTheme] = useState<Theme>(() => readInitialTheme())
  const [userLocation, setUserLocation] = useState<UserLocation>()
  const [locating, setLocating] = useState(false)
  const [locationMessage, setLocationMessage] = useState('')
  const [reportTarget, setReportTarget] = useState<Piano | 'new' | null>(null)
  const [reportStatus, setReportStatus] = useState('')

  useEffect(() => {
    document.documentElement.dataset.theme = theme
    localStorage.setItem('piano-atlas-theme', theme)
  }, [theme])

  useEffect(() => {
    let cancelled = false

    fetchPianos().then((response) => {
      if (cancelled) {
        return
      }

      setPianos(response.pianos)
      setMeta(response.meta)
      setLoading(false)
      setSelectedId((current) => current ?? response.pianos[0]?.id)
    })

    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    writeFiltersToUrl(filters)
  }, [filters])

  const visiblePianos = useMemo(
    () => filterPianos(pianos, filters, userLocation),
    [filters, pianos, userLocation],
  )

  const nearestPianos = useMemo(() => {
    if (!userLocation) {
      return []
    }

    return filterPianos(
      pianos,
      { ...filters, query: '', city: 'all' },
      userLocation,
    ).slice(0, 5)
  }, [filters, pianos, userLocation])

  const selectedPiano =
    pianoById(visiblePianos, selectedId ?? '') ?? visiblePianos[0]

  const cities = useMemo(() => cityGroups(pianos), [pianos])

  const sourceCounts = useMemo(() => {
    return pianos.reduce(
      (counts, piano) => {
        counts[piano.source] += 1
        return counts
      },
      { openstreetmap: 0, curated_seed: 0 },
    )
  }, [pianos])

  function updateFilter<K extends keyof Filters>(key: K, value: Filters[K]) {
    setFilters((current) => ({ ...current, [key]: value }))
  }

  async function refreshFromOsm() {
    setSyncing(true)
    setReportStatus('')
    const response = await fetchPianos(true)
    setPianos(response.pianos)
    setMeta(response.meta)
    setSelectedId(response.pianos[0]?.id)
    setSyncing(false)
  }

  function locateUser() {
    setLocationMessage('')
    setLocating(true)

    if (!navigator.geolocation) {
      setLocationMessage('Location is not available in this browser.')
      setLocating(false)
      return
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        setUserLocation({
          lat: position.coords.latitude,
          lng: position.coords.longitude,
        })
        setLocationMessage('Closest pianos are now sorted from your position.')
        setLocating(false)
      },
      () => {
        setLocationMessage('Location permission was not granted.')
        setLocating(false)
      },
      { enableHighAccuracy: false, timeout: 8000 },
    )
  }

  function handleReportDone(message: string) {
    setReportTarget(null)
    setReportStatus(message)
  }

  const resultLabel = loading
    ? 'Loading public pianos'
    : `${visiblePianos.length.toLocaleString()} of ${pianos.length.toLocaleString()} pianos`

  return (
    <div className={`app variant-${variant.id}`}>
      <header className="topbar">
        <a className="brand" href="/" aria-label="Piano Atlas home">
          <span className="brand-mark" aria-hidden="true">
            <Music2 className="music-logo" size={24} />
            <span className="grid-logo">
              <span>P I</span>
              <span>A N</span>
              <span>O S</span>
            </span>
          </span>
          <span>
            <strong>Piano Atlas</strong>
            <small>Public pianos worldwide</small>
          </span>
        </a>

        <VariantSwitcher active={variant.id} />

        <div className="topbar-actions">
          <button
            className="icon-button"
            type="button"
            onClick={() => setReportTarget('new')}
            aria-label="Add a piano"
            title="Add a piano"
          >
            <Flag size={19} />
          </button>
          <button
            className="icon-button"
            type="button"
            onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
            aria-label="Toggle dark mode"
            title="Toggle dark mode"
          >
            {theme === 'dark' ? <Sun size={19} /> : <Moon size={19} />}
          </button>
        </div>
      </header>

      {variant.id === 'grid' && (
        <section className="on-grid-hero" aria-label="Piano Atlas introduction">
          <div className="hero-copy">
            <h1>Explore public pianos</h1>
            <p>
              A city-by-city guide to playable pianos in stations, parks,
              markets, airports, and neighborhood corners around the world.
            </p>
            <button type="button" onClick={locateUser}>
              {locating ? 'Finding you' : 'Choose nearby'}
            </button>
          </div>
          <p className="hero-credit">
            Jean-Talon Market public piano / Ville de Montreal
          </p>
        </section>
      )}

      {variant.id !== 'grid' && variant.id !== 'locator' && (
        <ReferenceHero
          variant={variant.id}
          totalCount={pianos.length}
          locating={locating}
          onLocate={locateUser}
        />
      )}

      <section className="command-band" aria-label="Search and filters">
        <div className="title-block">
          <p className="eyebrow">
            Prototype {variant.number} / {variant.reference}
          </p>
          <h1>Public Pianos</h1>
          <p className="source-line">
            {sourceCounts.openstreetmap.toLocaleString()} OpenStreetMap records /{' '}
            {sourceCounts.curated_seed.toLocaleString()} fallback records /{' '}
            <a
              href="https://www.openstreetmap.org/copyright"
              target="_blank"
              rel="noreferrer"
            >
              OSM attribution
            </a>
          </p>
        </div>

        <div className="search-row">
          <label className="search-box">
            <Search size={19} aria-hidden="true" />
            <span className="sr-only">Search public pianos</span>
            <input
              value={filters.query}
              placeholder="Search city, station, park, country"
              onChange={(event) => updateFilter('query', event.target.value)}
            />
          </label>
          <button
            className="solid-button locate-button"
            type="button"
            onClick={locateUser}
            disabled={locating}
          >
            <LocateFixed size={18} />
            {locating ? 'Locating' : variant.cta}
          </button>
          <button
            className="ghost-button"
            type="button"
            onClick={refreshFromOsm}
            disabled={syncing}
          >
            <RefreshCcw size={18} className={syncing ? 'spin' : ''} />
            Sync OSM
          </button>
        </div>

        <div className="filters-grid">
          <label className="select-shell">
            <span>City</span>
            <select
              value={filters.city}
              onChange={(event) => updateFilter('city', event.target.value)}
            >
              <option value="all">All cities</option>
              {cities.map((city) => (
                <option key={city.city} value={city.city}>
                  {city.city} ({city.count})
                </option>
              ))}
            </select>
            <ChevronDown size={16} aria-hidden="true" />
          </label>

          <label className="select-shell">
            <span>Access</span>
            <select
              value={filters.access}
              onChange={(event) =>
                updateFilter('access', event.target.value as Filters['access'])
              }
            >
              <option value="all">Any access</option>
              <option value="public">Public</option>
              <option value="permissive">Permissive</option>
              <option value="customers">Customers</option>
              <option value="limited">Limited</option>
              <option value="unknown">Unknown</option>
            </select>
            <ChevronDown size={16} aria-hidden="true" />
          </label>

          <label className="select-shell">
            <span>Confidence</span>
            <select
              value={filters.confidence}
              onChange={(event) =>
                updateFilter(
                  'confidence',
                  event.target.value as Filters['confidence'],
                )
              }
            >
              <option value="all">Any confidence</option>
              <option value="high">High</option>
              <option value="medium">Medium</option>
              <option value="low">Low</option>
            </select>
            <ChevronDown size={16} aria-hidden="true" />
          </label>

          <label className="select-shell">
            <span>Source</span>
            <select
              value={filters.source}
              onChange={(event) =>
                updateFilter('source', event.target.value as Filters['source'])
              }
            >
              <option value="all">All sources</option>
              <option value="openstreetmap">OpenStreetMap</option>
              <option value="curated_seed">Curated fallback</option>
            </select>
            <ChevronDown size={16} aria-hidden="true" />
          </label>
        </div>

        <div className="status-row" aria-label="Availability filters">
          {statusOptions.map((status) => (
            <button
              key={status}
              type="button"
              className={filters.status === status ? 'chip active' : 'chip'}
              onClick={() => updateFilter('status', status)}
            >
              {status === 'all' ? 'All status' : statusLabel(status)}
            </button>
          ))}
        </div>
      </section>

      <section className="reference-strip" aria-label="Prototype reference">
        <div>
          <Sparkles size={18} aria-hidden="true" />
          <span>{variant.name}</span>
          <small>{variant.tagline}</small>
        </div>
        <a href={variant.proofUrl} target="_blank" rel="noreferrer">
          Recognition source <ExternalLink size={14} />
        </a>
      </section>

      <section className="city-strip" aria-label="City shortcuts">
        {cities.slice(0, 8).map((city, index) => (
          <button
            key={city.city}
            type="button"
            className={filters.city === city.city ? 'city-tile active' : 'city-tile'}
            onClick={() =>
              updateFilter('city', filters.city === city.city ? 'all' : city.city)
            }
          >
            <span>{String(index + 1).padStart(2, '0')}</span>
            <strong>{city.city}</strong>
            <small>{city.count} pianos</small>
          </button>
        ))}
      </section>

      <div className="mobile-view-toggle" role="group" aria-label="View mode">
        <button
          type="button"
          className={viewMode === 'list' ? 'active' : ''}
          onClick={() => setViewMode('list')}
        >
          <ListFilter size={18} />
          List
        </button>
        <button
          type="button"
          className={viewMode === 'map' ? 'active' : ''}
          onClick={() => setViewMode('map')}
        >
          <Map size={18} />
          Map
        </button>
      </div>

      <main id="directory" className="directory-shell">
        <section
          className={`list-pane ${viewMode === 'list' ? 'mobile-active' : ''}`}
          aria-label="Public piano listings"
        >
          <div className="results-head">
            <div>
              <p className="eyebrow">Directory</p>
              <h2>{resultLabel}</h2>
            </div>
            {meta && (
              <p className={meta.stale ? 'meta-pill stale' : 'meta-pill'}>
                {meta.stale ? 'Fallback data' : 'Live API'} /{' '}
                {new Date(meta.fetchedAt).toLocaleDateString()}
              </p>
            )}
          </div>

          <div className="live-region" aria-live="polite">
            {locationMessage || reportStatus || meta?.message || resultLabel}
          </div>

          <NearestPanel
            pianos={nearestPianos}
            userLocation={userLocation}
            locating={locating}
            onLocate={locateUser}
            onSelect={(id) => {
              setSelectedId(id)
              setViewMode('map')
            }}
          />

          {loading && <SkeletonList />}

          {!loading && !visiblePianos.length && (
            <div className="empty-state">
              <Compass size={34} />
              <h2>No pianos match these filters</h2>
              <button
                className="solid-button"
                type="button"
                onClick={() => setFilters(defaultFilters)}
              >
                Reset filters
              </button>
            </div>
          )}

          <div className="cards">
            {visiblePianos.map((piano, index) => (
              <PianoCard
                key={piano.id}
                piano={piano}
                index={index}
                selected={piano.id === selectedPiano?.id}
                distance={
                  userLocation ? distanceKm(userLocation, piano) : undefined
                }
                onSelect={() => {
                  setSelectedId(piano.id)
                  setViewMode('map')
                }}
                onReport={() => setReportTarget(piano)}
              />
            ))}
          </div>
        </section>

        <section
          className={`map-pane ${viewMode === 'map' ? 'mobile-active' : ''}`}
          role="region"
          aria-label="Public piano map"
        >
          <PianoMap
            pianos={visiblePianos}
            selectedId={selectedPiano?.id}
            onSelect={(id) => {
              setSelectedId(id)
              setViewMode(variant.id === 'locator' ? 'map' : 'list')
            }}
          />
          {selectedPiano && (
            <aside className="selected-panel" aria-label="Selected piano">
              <p className="eyebrow">{selectedPiano.city}</p>
              <h2>{selectedPiano.name}</h2>
              <p>{selectedPiano.venue}</p>
              <div className="panel-actions">
                <a href={mapsUrl(selectedPiano)} target="_blank" rel="noreferrer">
                  Directions <ExternalLink size={15} />
                </a>
                <button type="button" onClick={() => setReportTarget(selectedPiano)}>
                  <Flag size={15} />
                  Report
                </button>
              </div>
            </aside>
          )}
        </section>
      </main>

      <footer className="footer">
        <span>
          Design reference: {variant.reference}. Prototype {variant.number}.
        </span>
        <span>
          Data source: OpenStreetMap `amenity=piano` sync plus local fallback.
        </span>
      </footer>

      {reportTarget && (
        <ReportDialog
          target={reportTarget}
          onClose={() => setReportTarget(null)}
          onDone={handleReportDone}
        />
      )}
    </div>
  )
}

function ReferenceHero({
  variant,
  totalCount,
  locating,
  onLocate,
}: {
  variant: Exclude<VariantId, 'grid' | 'locator'>
  totalCount: number
  locating: boolean
  onLocate: () => void
}) {
  if (variant === 'stays') {
    return (
      <section className="reference-hero stays-hero" aria-label="Welcome Beyond style introduction">
        <div className="stays-brand-block">
          <p className="hero-kicker">Welcome Beyond style</p>
          <h2>Hand-picked public pianos worth writing home about.</h2>
          <p>
            Design-led corners, station halls, markets, and parks selected for
            people who travel for places with a little character.
          </p>
        </div>
        <div className="stays-search-card">
          <span>WHERE WOULD YOU LIKE TO PLAY?</span>
          <strong>{totalCount.toLocaleString()} public pianos</strong>
          <button type="button" onClick={onLocate}>
            {locating ? 'Finding location' : 'View nearby pianos'}
          </button>
          <a href="#directory">Advanced search</a>
        </div>
      </section>
    )
  }

  if (variant === 'food') {
    return (
      <section className="reference-hero food-hero" aria-label="TasteAtlas style introduction">
        <div className="food-nav-row">
          <span>BEST 26</span>
          <span>NEAR</span>
          <span>PLACES</span>
          <span>PIANOS</span>
          <span>MAP</span>
        </div>
        <div className="food-hero-copy">
          <p className="hero-kicker">World Piano Atlas</p>
          <h2>Travel global. Play local.</h2>
          <div className="food-hero-actions">
            <button type="button" onClick={onLocate}>
              <LocateFixed size={17} />
              {locating ? 'Locating' : 'Near me'}
            </button>
            <a href="#directory">Explore map</a>
            <a href="#directory">View list</a>
          </div>
        </div>
      </section>
    )
  }

  return (
    <section className="reference-hero atlas-hero" aria-label="National Parks style introduction">
      <div className="atlas-fact-cell">
        <p className="hero-kicker">Interesting fact</p>
        <p>
          Public pianos turn civic space into playable archives: transport hubs,
          libraries, waterfronts, and plazas all become part of the map.
        </p>
      </div>
      <div className="atlas-title-cell">
        <h2>
          Piano
          <span>Atlas</span>
        </h2>
      </div>
      <div className="atlas-copy-cell">
        <p>
          A typographic archive of places where anyone can sit down, play, and
          leave a trace in public.
        </p>
      </div>
      <div className="atlas-image-band" aria-hidden="true" />
    </section>
  )
}

function VariantSwitcher({ active }: { active: VariantId }) {
  return (
    <nav className="variant-switcher" aria-label="Prototype versions">
      {variantOrder.map((id, index) => {
        const variant = variants[id]
        const href = `http://127.0.0.1:${5181 + index}/`
        return (
          <a
            key={id}
            href={href}
            aria-current={active === id ? 'page' : undefined}
            title={variant.reference}
          >
            {variant.number}
          </a>
        )
      })}
    </nav>
  )
}

function NearestPanel({
  pianos,
  userLocation,
  locating,
  onLocate,
  onSelect,
}: {
  pianos: Piano[]
  userLocation?: UserLocation
  locating: boolean
  onLocate: () => void
  onSelect: (id: string) => void
}) {
  return (
    <section className="nearest-panel" aria-label="Closest pianos">
      <div className="nearest-head">
        <span className="nearest-icon" aria-hidden="true">
          <Route size={18} />
        </span>
        <div>
          <p className="eyebrow">Closest pianos</p>
          <h2>{userLocation ? 'Nearest to you' : 'Find pianos near you'}</h2>
        </div>
      </div>

      {!userLocation ? (
        <div className="nearest-empty">
          <p>
            Ask the browser for your approximate location, then sort every piano
            by distance.
          </p>
          <button className="solid-button" type="button" onClick={onLocate}>
            <LocateFixed size={17} />
            {locating ? 'Locating' : 'Find closest pianos'}
          </button>
        </div>
      ) : (
        <ol className="nearest-list">
          {pianos.map((piano) => (
            <li key={piano.id}>
              <button type="button" onClick={() => onSelect(piano.id)}>
                <span>
                  <MapPin size={15} />
                  {piano.name}
                </span>
                <strong>{formatDistance(distanceKm(userLocation, piano))}</strong>
              </button>
            </li>
          ))}
        </ol>
      )}
    </section>
  )
}

function PianoCard({
  piano,
  index,
  selected,
  distance,
  onSelect,
  onReport,
}: {
  piano: Piano
  index: number
  selected: boolean
  distance?: number
  onSelect: () => void
  onReport: () => void
}) {
  return (
    <article className={selected ? 'piano-card selected' : 'piano-card'}>
      <button className="card-main" type="button" onClick={onSelect}>
        <span className="card-number">{String(index + 1).padStart(2, '0')}</span>
        <span className="card-copy">
          <span className="card-title">{piano.name}</span>
          <span className="card-location">
            {piano.venue} / {piano.city}, {piano.country}
          </span>
          <span className="card-notes">
            {piano.insideDirections ?? piano.accessNotes ?? piano.notes}
          </span>
        </span>
      </button>

      <div className="card-meta">
        <span className={`badge status-${piano.status}`}>
          {statusLabel(piano.status)}
        </span>
        <span>{accessLabel(piano.access)}</span>
        <span>{confidenceLabel(piano.confidence)}</span>
        {distance !== undefined && <span>{formatDistance(distance)}</span>}
      </div>

      <div className="card-actions">
        <a href={mapsUrl(piano)} target="_blank" rel="noreferrer">
          Directions <ExternalLink size={14} />
        </a>
        <button type="button" onClick={onReport}>
          <Flag size={14} />
          Report
        </button>
        {piano.sourceUrl && (
          <a href={piano.sourceUrl} target="_blank" rel="noreferrer">
            {sourceLabel(piano.source)}
          </a>
        )}
      </div>
    </article>
  )
}

function SkeletonList() {
  return (
    <div className="cards" aria-hidden="true">
      {Array.from({ length: 5 }).map((_, index) => (
        <div className="piano-card skeleton" key={index}>
          <span />
          <span />
          <span />
        </div>
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
  const [kind, setKind] = useState<PianoReport['kind']>(
    isNew ? 'add_new' : 'confirm_available',
  )
  const [note, setNote] = useState('')
  const [name, setName] = useState('')
  const [city, setCity] = useState('')
  const [country, setCountry] = useState('')
  const [contact, setContact] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

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
      onDone(isNew ? 'Piano tip saved.' : 'Piano report saved.')
    } catch (submitError) {
      setError(
        submitError instanceof Error
          ? submitError.message
          : 'Could not save the report.',
      )
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="dialog-backdrop" role="presentation">
      <div className="dialog" role="dialog" aria-modal="true" aria-labelledby="report-title">
        <div className="dialog-head">
          <div>
            <p className="eyebrow">{isNew ? 'Add piano' : 'Report piano'}</p>
            <h2 id="report-title">
              {isNew ? 'New public piano' : target.name}
            </h2>
          </div>
          <button
            className="icon-button"
            type="button"
            onClick={onClose}
            aria-label="Close report form"
          >
            <X size={18} />
          </button>
        </div>

        <form className="report-form" onSubmit={submit}>
          {isNew && (
            <div className="inline-fields">
              <label>
                <span>Name</span>
                <input
                  required
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                />
              </label>
              <label>
                <span>City</span>
                <input
                  required
                  value={city}
                  onChange={(event) => setCity(event.target.value)}
                />
              </label>
              <label>
                <span>Country</span>
                <input
                  required
                  value={country}
                  onChange={(event) => setCountry(event.target.value)}
                />
              </label>
            </div>
          )}

          <label>
            <span>Update type</span>
            <select
              value={kind}
              onChange={(event) => setKind(event.target.value as PianoReport['kind'])}
            >
              <option value="confirm_available">Still available</option>
              <option value="missing">Missing</option>
              <option value="damaged">Damaged</option>
              <option value="access_changed">Access changed</option>
              <option value="add_new">Add new piano</option>
            </select>
          </label>

          <label>
            <span>Note</span>
            <textarea
              required
              minLength={8}
              value={note}
              onChange={(event) => setNote(event.target.value)}
              placeholder="Location, condition, hours, access, or source"
            />
          </label>

          <label>
            <span>Contact</span>
            <input
              value={contact}
              onChange={(event) => setContact(event.target.value)}
              placeholder="Optional"
            />
          </label>

          {error && <p className="form-error">{error}</p>}

          <button className="solid-button" type="submit" disabled={submitting}>
            <Send size={16} />
            {submitting ? 'Saving' : 'Save report'}
          </button>
        </form>
      </div>
    </div>
  )
}

function readInitialTheme(): Theme {
  const saved = localStorage.getItem('piano-atlas-theme')
  if (saved === 'light' || saved === 'dark') {
    return saved
  }

  return window.matchMedia('(prefers-color-scheme: dark)').matches
    ? 'dark'
    : 'light'
}

function readVariantId(): VariantId {
  const search = new URLSearchParams(window.location.search)
  const requested = search.get('variant') ?? import.meta.env.VITE_VARIANT
  const pathMatch = window.location.pathname.match(/\/v([1-5])\b/)
  const portMap: Record<string, VariantId> = {
    '5181': 'grid',
    '5182': 'stays',
    '5183': 'food',
    '5184': 'atlas',
    '5185': 'locator',
  }

  if (requested && requested in variants) {
    return requested as VariantId
  }

  if (pathMatch) {
    return variantOrder[Number(pathMatch[1]) - 1]
  }

  return portMap[window.location.port] ?? 'locator'
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

function writeFiltersToUrl(filters: Filters) {
  const params = new URLSearchParams()
  const currentVariant = new URLSearchParams(window.location.search).get('variant')

  if (currentVariant && currentVariant in variants) {
    params.set('variant', currentVariant)
  }

  for (const [key, value] of Object.entries(filters)) {
    if (value && value !== 'all') {
      params.set(key === 'query' ? 'q' : key, value)
    }
  }

  const next = params.toString()
  const url = next ? `${window.location.pathname}?${next}` : window.location.pathname
  window.history.replaceState(null, '', url)
}

export default App
