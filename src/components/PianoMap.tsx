import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import L from 'leaflet'
import {
  Circle,
  CircleMarker,
  MapContainer,
  Marker,
  Popup,
  TileLayer,
  ZoomControl,
  useMap,
} from 'react-leaflet'
import type { UserLocation } from '../lib/pianos'
import { sourceLabel, statusLabel } from '../lib/pianos'
import type { Piano } from '../types'

type PianoMapProps = {
  pianos: Piano[]
  selectedId?: string
  userLocation?: UserLocation
  theme: 'light' | 'dark'
  onSelect: (id: string) => void
}

type ClusterEntry =
  | {
      type: 'piano'
      piano: Piano
    }
  | {
      type: 'cluster'
      id: string
      center: [number, number]
      bounds: L.LatLngBounds
      pianos: Piano[]
    }

const CLUSTER_MAX_ZOOM = 12
const CLUSTER_GRID_SIZE = 72
const CLUSTER_FIT_MAX_ZOOM = 16
const FALLBACK_LOCATION_ACCURACY_METERS = 280

const markerIcon = L.divIcon({
  className: 'piano-marker-shell',
  html: '<span class="piano-pin"><i></i><i></i><i></i></span>',
  iconSize: [34, 42],
  iconAnchor: [17, 39],
  popupAnchor: [0, -34],
})

const selectedMarkerIcon = L.divIcon({
  className: 'piano-marker-shell selected',
  html: '<span class="piano-pin"><i></i><i></i><i></i></span>',
  iconSize: [42, 50],
  iconAnchor: [21, 47],
  popupAnchor: [0, -42],
})

function prefersReducedMotion() {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

function userLocationAccuracyRadius(userLocation: UserLocation) {
  const accuracy = userLocation.accuracy
  return typeof accuracy === 'number' && Number.isFinite(accuracy) && accuracy > 0
    ? accuracy
    : FALLBACK_LOCATION_ACCURACY_METERS
}

function clusterIcon(count: number) {
  const label = count.toLocaleString()
  const size = Math.min(66, Math.max(42, 32 + label.length * 7))
  const fontSize = label.length > 4 ? 11 : 13

  return L.divIcon({
    className: 'piano-cluster-marker',
    html: `<span aria-hidden="true" style="width:${size}px;height:${size}px;display:inline-flex;align-items:center;justify-content:center;border:2px solid var(--surface);border-radius:999px;background:var(--teal-dark);color:#fffefa;box-shadow:0 10px 22px rgba(44,39,32,0.3);font:800 ${fontSize}px/1 system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">${label}</span>`,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
  })
}

function clusterPianos(
  map: L.Map,
  pianos: Piano[],
  selectedId?: string,
): ClusterEntry[] {
  const bounds = map.getBounds()
  const selectedPiano = selectedId
    ? pianos.find((piano) => piano.id === selectedId)
    : undefined

  if (map.getZoom() > CLUSTER_MAX_ZOOM) {
    return pianos
      .filter((piano) => {
        if (piano.id === selectedId) return true
        return bounds.contains([piano.lat, piano.lng])
      })
      .map((piano) => ({ type: 'piano', piano }))
  }

  const grid = new Map<string, Piano[]>()
  for (const piano of pianos) {
    if (piano.id === selectedId) continue

    const latLng = L.latLng(piano.lat, piano.lng)
    if (!bounds.contains(latLng)) continue

    const point = map.latLngToContainerPoint(latLng)
    const gridKey = `${Math.floor(point.x / CLUSTER_GRID_SIZE)}:${Math.floor(
      point.y / CLUSTER_GRID_SIZE,
    )}`
    const existing = grid.get(gridKey)
    if (existing) {
      existing.push(piano)
    } else {
      grid.set(gridKey, [piano])
    }
  }

  const entries: ClusterEntry[] = []
  for (const [gridKey, clusteredPianos] of grid) {
    if (clusteredPianos.length === 1) {
      entries.push({ type: 'piano', piano: clusteredPianos[0] })
      continue
    }

    const clusterBounds = L.latLngBounds(
      clusteredPianos.map((piano) => [piano.lat, piano.lng]),
    )
    const center = clusterBounds.getCenter()
    entries.push({
      type: 'cluster',
      id: `cluster-${gridKey}-${clusteredPianos.length}-${clusteredPianos[0].id}`,
      center: [center.lat, center.lng],
      bounds: clusterBounds,
      pianos: clusteredPianos,
    })
  }

  if (selectedPiano) {
    entries.push({ type: 'piano', piano: selectedPiano })
  }

  return entries
}

function MapCamera({
  pianos,
  selectedId,
  userLocation,
}: Pick<PianoMapProps, 'pianos' | 'selectedId' | 'userLocation'>) {
  const map = useMap()
  const initialized = useRef(false)
  const previousSelection = useRef<string | undefined>(undefined)
  const previousLocation = useRef<UserLocation | undefined>(undefined)
  const previousResultKey = useRef('')

  const fitResults = useCallback(() => {
    if (!pianos.length) return
    const bounds = L.latLngBounds(pianos.map((piano) => [piano.lat, piano.lng]))
    map.fitBounds(bounds, {
      padding: [48, 48],
      maxZoom: 11,
      animate: !prefersReducedMotion(),
    })
  }, [map, pianos])

  useEffect(() => {
    if (initialized.current || !pianos.length) return
    initialized.current = true
    previousResultKey.current = pianos.map((piano) => piano.id).join('|')
    fitResults()
  }, [fitResults, pianos])

  useEffect(() => {
    if (!initialized.current || selectedId || userLocation) return
    const resultKey = pianos.map((piano) => piano.id).join('|')
    if (resultKey === previousResultKey.current) return
    previousResultKey.current = resultKey
    fitResults()
  }, [fitResults, pianos, selectedId, userLocation])

  useEffect(() => {
    if (!userLocation) return
    if (
      previousLocation.current?.lat === userLocation.lat &&
      previousLocation.current?.lng === userLocation.lng
    ) return

    previousLocation.current = userLocation
    const center: L.LatLngExpression = [userLocation.lat, userLocation.lng]
    if (prefersReducedMotion()) {
      map.setView(center, 13)
    } else {
      map.flyTo(center, 13, { duration: 0.8 })
    }
  }, [map, userLocation])

  useEffect(() => {
    if (!selectedId) {
      if (previousSelection.current) {
        previousSelection.current = undefined
        fitResults()
      }
      return
    }
    if (previousSelection.current === selectedId) return

    const selected = pianos.find((piano) => piano.id === selectedId)
    if (!selected) return

    if (userLocation && previousSelection.current === undefined) {
      previousSelection.current = selectedId
      return
    }

    previousSelection.current = selectedId
    const center: L.LatLngExpression = [selected.lat, selected.lng]
    const zoom = Math.max(map.getZoom(), 12)
    if (prefersReducedMotion()) {
      map.setView(center, zoom)
    } else {
      map.flyTo(center, zoom, { duration: 0.65 })
    }
  }, [fitResults, map, pianos, selectedId, userLocation])

  return null
}

function PianoMarker({
  piano,
  selected,
  onSelect,
}: {
  piano: Piano
  selected: boolean
  onSelect: PianoMapProps['onSelect']
}) {
  return (
    <Marker
      position={[piano.lat, piano.lng]}
      icon={selected ? selectedMarkerIcon : markerIcon}
      title={`${piano.name}, ${statusLabel(piano.status)}`}
      keyboard={false}
      zIndexOffset={selected ? 500 : 0}
      eventHandlers={{ click: () => onSelect(piano.id) }}
    >
      <Popup>
        <div className="marker-popup">
          <small>{piano.city}, {piano.country}</small>
          <strong>{piano.name}</strong>
          <span>{piano.venue}</span>
          <span>{statusLabel(piano.status)} / {sourceLabel(piano.source)}</span>
        </div>
      </Popup>
    </Marker>
  )
}

function PianoMarkerLayer({
  pianos,
  selectedId,
  onSelect,
}: Pick<PianoMapProps, 'pianos' | 'selectedId' | 'onSelect'>) {
  const map = useMap()
  const [entries, setEntries] = useState<ClusterEntry[]>([])

  const refreshClusters = useCallback(() => {
    setEntries(clusterPianos(map, pianos, selectedId))
  }, [map, pianos, selectedId])

  useEffect(() => {
    refreshClusters()
    map.on('moveend zoomend resize', refreshClusters)
    return () => {
      map.off('moveend zoomend resize', refreshClusters)
    }
  }, [map, refreshClusters])

  const fitClusterBounds = useCallback(
    (bounds: L.LatLngBounds) => {
      const center = bounds.getCenter()
      const isSinglePoint = bounds.getNorthEast().equals(bounds.getSouthWest())

      if (isSinglePoint) {
        map.setView(
          center,
          Math.min(
            CLUSTER_FIT_MAX_ZOOM,
            Math.max(map.getZoom() + 2, CLUSTER_MAX_ZOOM + 1),
          ),
          { animate: !prefersReducedMotion() },
        )
        return
      }

      map.fitBounds(bounds, {
        padding: [72, 72],
        maxZoom: CLUSTER_FIT_MAX_ZOOM,
        animate: !prefersReducedMotion(),
      })
    },
    [map],
  )

  return (
    <>
      {entries.map((entry) => {
        if (entry.type === 'cluster') {
          const count = entry.pianos.length
          return (
            <Marker
              key={entry.id}
              position={entry.center}
              icon={clusterIcon(count)}
              title={`${count.toLocaleString()} pianos in this area`}
              keyboard={false}
              zIndexOffset={250}
              eventHandlers={{ click: () => fitClusterBounds(entry.bounds) }}
            />
          )
        }

        return (
          <PianoMarker
            key={entry.piano.id}
            piano={entry.piano}
            selected={entry.piano.id === selectedId}
            onSelect={onSelect}
          />
        )
      })}
    </>
  )
}

export function PianoMap({
  pianos,
  selectedId,
  userLocation,
  theme,
  onSelect,
}: PianoMapProps) {
  const center = useMemo<[number, number]>(() => [20, 0], [])
  const tileUrl =
    theme === 'dark'
      ? 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png'
      : 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png'
  const accuracyRadius = userLocation
    ? userLocationAccuracyRadius(userLocation)
    : FALLBACK_LOCATION_ACCURACY_METERS

  return (
    <MapContainer
      center={center}
      zoom={2}
      minZoom={1}
      maxZoom={19}
      scrollWheelZoom
      zoomControl={false}
      className="piano-map"
    >
      <TileLayer
        key={theme}
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>'
        url={tileUrl}
      />
      <ZoomControl position="bottomright" />
      <MapCamera pianos={pianos} selectedId={selectedId} userLocation={userLocation} />

      {userLocation && (
        <>
          <Circle
            center={[userLocation.lat, userLocation.lng]}
            radius={accuracyRadius}
            pathOptions={{ color: '#087e78', fillColor: '#4fd1c5', fillOpacity: 0.12, weight: 1 }}
          />
          <CircleMarker
            center={[userLocation.lat, userLocation.lng]}
            radius={8}
            pathOptions={{ color: '#ffffff', fillColor: '#087e78', fillOpacity: 1, weight: 3 }}
          >
            <Popup>Your approximate location</Popup>
          </CircleMarker>
        </>
      )}

      <PianoMarkerLayer pianos={pianos} selectedId={selectedId} onSelect={onSelect} />
    </MapContainer>
  )
}
