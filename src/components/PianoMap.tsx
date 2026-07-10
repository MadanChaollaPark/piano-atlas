import { useEffect, useMemo, useRef } from 'react'
import L from 'leaflet'
import {
  Circle,
  CircleMarker,
  MapContainer,
  Marker,
  Popup,
  TileLayer,
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

function MapCamera({
  pianos,
  selectedId,
  userLocation,
}: Pick<PianoMapProps, 'pianos' | 'selectedId' | 'userLocation'>) {
  const map = useMap()
  const initialized = useRef(false)
  const previousSelection = useRef<string | undefined>(undefined)
  const previousLocation = useRef<UserLocation | undefined>(undefined)

  useEffect(() => {
    if (initialized.current || !pianos.length) return
    initialized.current = true

    const bounds = L.latLngBounds(pianos.map((piano) => [piano.lat, piano.lng]))
    map.fitBounds(bounds, { padding: [48, 48], maxZoom: 11 })
  }, [map, pianos])

  useEffect(() => {
    if (!userLocation) return
    if (
      previousLocation.current?.lat === userLocation.lat &&
      previousLocation.current?.lng === userLocation.lng
    ) return

    previousLocation.current = userLocation
    const center: L.LatLngExpression = [userLocation.lat, userLocation.lng]
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      map.setView(center, 13)
    } else {
      map.flyTo(center, 13, { duration: 0.8 })
    }
  }, [map, userLocation])

  useEffect(() => {
    if (!selectedId) return
    if (previousSelection.current === selectedId) return

    previousSelection.current = selectedId
    const selected = pianos.find((piano) => piano.id === selectedId)
    if (!selected) return

    const center: L.LatLngExpression = [selected.lat, selected.lng]
    const zoom = Math.max(map.getZoom(), 12)
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      map.setView(center, zoom)
    } else {
      map.flyTo(center, zoom, { duration: 0.65 })
    }
  }, [map, pianos, selectedId])

  return null
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

  return (
    <MapContainer
      center={center}
      zoom={2}
      minZoom={2}
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
      <MapCamera pianos={pianos} selectedId={selectedId} userLocation={userLocation} />

      {userLocation && (
        <>
          <Circle
            center={[userLocation.lat, userLocation.lng]}
            radius={280}
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

      {pianos.map((piano) => (
        <Marker
          key={piano.id}
          position={[piano.lat, piano.lng]}
          icon={piano.id === selectedId ? selectedMarkerIcon : markerIcon}
          title={`${piano.name}, ${statusLabel(piano.status)}`}
          zIndexOffset={piano.id === selectedId ? 500 : 0}
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
      ))}
    </MapContainer>
  )
}
