import { useEffect, useMemo } from 'react'
import L from 'leaflet'
import {
  MapContainer,
  Marker,
  Popup,
  TileLayer,
  useMap,
} from 'react-leaflet'
import type { Piano } from '../types'
import { sourceLabel, statusLabel } from '../lib/pianos'

type PianoMapProps = {
  pianos: Piano[]
  selectedId?: string
  onSelect: (id: string) => void
}

const markerIcon = L.divIcon({
  className: 'piano-marker',
  html: '<span>P</span>',
  iconSize: [34, 34],
  iconAnchor: [17, 17],
  popupAnchor: [0, -12],
})

const selectedMarkerIcon = L.divIcon({
  className: 'piano-marker piano-marker-selected',
  html: '<span>P</span>',
  iconSize: [38, 38],
  iconAnchor: [19, 19],
  popupAnchor: [0, -14],
})

function FitBounds({ pianos, selectedId }: Pick<PianoMapProps, 'pianos' | 'selectedId'>) {
  const map = useMap()

  useEffect(() => {
    if (!pianos.length) {
      map.setView([20, 0], 2)
      return
    }

    const selected = pianos.find((piano) => piano.id === selectedId)
    if (selected) {
      map.setView([selected.lat, selected.lng], Math.max(map.getZoom(), 12), {
        animate: true,
      })
      return
    }

    const bounds = L.latLngBounds(pianos.map((piano) => [piano.lat, piano.lng]))
    map.fitBounds(bounds, { padding: [28, 28], maxZoom: 12 })
  }, [map, pianos, selectedId])

  return null
}

export function PianoMap({ pianos, selectedId, onSelect }: PianoMapProps) {
  const center = useMemo<[number, number]>(() => {
    const selected = pianos.find((piano) => piano.id === selectedId)
    if (selected) {
      return [selected.lat, selected.lng]
    }

    return pianos[0] ? [pianos[0].lat, pianos[0].lng] : [20, 0]
  }, [pianos, selectedId])

  return (
    <MapContainer
      center={center}
      zoom={pianos.length ? 3 : 2}
      minZoom={2}
      scrollWheelZoom
      className="piano-map"
      aria-label="Public piano map"
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      <FitBounds pianos={pianos} selectedId={selectedId} />
      {pianos.map((piano) => (
        <Marker
          key={piano.id}
          position={[piano.lat, piano.lng]}
          icon={piano.id === selectedId ? selectedMarkerIcon : markerIcon}
          eventHandlers={{ click: () => onSelect(piano.id) }}
        >
          <Popup>
            <strong>{piano.name}</strong>
            <span>{piano.venue}</span>
            <span>
              {piano.city}, {piano.country}
            </span>
            <span>
              {statusLabel(piano.status)} / {sourceLabel(piano.source)}
            </span>
          </Popup>
        </Marker>
      ))}
    </MapContainer>
  )
}
