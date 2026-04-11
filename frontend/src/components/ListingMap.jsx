import { useEffect, useRef, useState, useCallback, useMemo } from 'react'
import { Link } from 'react-router-dom'
import {
  MapContainer, TileLayer, Marker, Popup, Circle, GeoJSON, useMap,
} from 'react-leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'

/** Served from `frontend/public/neighbourhoods.geojson`. */
const NEIGHBOURHOODS_GEOJSON_URL =
  `${import.meta.env.BASE_URL}neighbourhoods.geojson`

/* ── Haversine ───────────────────────────────────────────────────────────── */
function haversineM(lat1, lon1, lat2, lon2) {
  const R = 6371000
  const toRad = (x) => (x * Math.PI) / 180
  const dLat = toRad(lat2 - lat1)
  const dLon = toRad(lon2 - lon1)
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

/* ── Overpass API helpers ────────────────────────────────────────────────── */
const OVERPASS_URL = 'https://overpass-api.de/api/interpreter'
const OVERPASS_RADIUS = 1000

/** Fetch restaurants + attractions for a single listing lat/lon. */
async function fetchPOIs(lat, lon) {
  const r = OVERPASS_RADIUS
  const q = (filter) =>
    `node[${filter}](around:${r},${lat.toFixed(6)},${lon.toFixed(6)});`

  const body = `[out:json][timeout:30];` +
    `(${q('amenity~"restaurant|cafe|fast_food|bar"')}` +
    `${q('tourism~"attraction|museum|gallery"')}` +
    `${q('leisure=park')}` +
    `);out body;`

  const res = await fetch(OVERPASS_URL, {
    method: 'POST',
    body: `data=${encodeURIComponent(body)}`,
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  })
  if (!res.ok) throw new Error(`Overpass ${res.status}`)
  const json = await res.json()
  return (json.elements || []).map((el) => ({
    id: el.id,
    name: el.tags?.name || 'Unnamed',
    category: el.tags?.amenity || el.tags?.tourism || el.tags?.leisure || 'place',
    lat: el.lat,
    lon: el.lon,
    tags: el.tags,
  }))
}

/* ── Batch POI loader ────────────────────────────────────────────────────── */
/** Overpass union query — fetch POIs near all listings in one shot. */
async function fetchAllPOIs(listings) {
  if (!listings.length) return []
  const seen = new Map()
  const SLEEP_MS = 250 // Overpass 友好：避免连续请求过快
  for (const l of listings) {
    if (l.latitude == null || l.longitude == null) continue
    const r = OVERPASS_RADIUS
    const lat = l.latitude, lon = l.longitude
    const q = (f) => `node[${f}](around:${r},${lat.toFixed(6)},${lon.toFixed(6)});`
    const body = `[out:json][timeout:60];` +
      `(${q('amenity~"restaurant|cafe|fast_food|bar"')}` +
      `${q('tourism~"attraction|museum|gallery"')}` +
      `${q('leisure=park')}` +
      `);out body;`
    try {
      const res = await fetch(OVERPASS_URL, {
        method: 'POST',
        body: `data=${encodeURIComponent(body)}`,
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      })
      if (!res.ok) continue
      const json = await res.json()
      for (const el of json.elements || []) {
        if (!seen.has(el.id)) {
          seen.set(el.id, {
            id: el.id,
            name: el.tags?.name || 'Unnamed',
            category:
              el.tags?.amenity || el.tags?.tourism || el.tags?.leisure || 'place',
            lat: el.lat,
            lon: el.lon,
            tags: el.tags,
          })
        }
      }
    } catch {
      // skip failed listing
    }

    // Avoid hammering Overpass when you have multiple listings.
    await new Promise((res) => setTimeout(res, SLEEP_MS))
  }
  return [...seen.values()]
}

/* ── Icons ──────────────────────────────────────────────────────────────── */
function makeIcon(color, size = 28, innerSize = 4) {
  return L.divIcon({
    html: `<svg width="${size}" height="${size}" viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg">
      <circle cx="16" cy="16" r="14" fill="${color}" stroke="white" stroke-width="2.5" opacity="0.92"/>
      <circle cx="16" cy="16" r="${innerSize}" fill="white" opacity="0.9"/>
    </svg>`,
    className: '',
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
    popupAnchor: [0, -(size / 2 + 4)],
  })
}

const ICON_LISTING     = makeIcon('#0ea5e9', 36, 5)
const ICON_RESTAURANT  = makeIcon('#f97316', 26, 3)
const ICON_ATTRRACTION = makeIcon('#22c55e', 26, 3)

/* ── GeoJSON helpers ────────────────────────────────────────────────────── */
function getGeoJSONBounds(features) {
  let minLat = Infinity, minLon = Infinity,
      maxLat = -Infinity, maxLon = -Infinity
  const process = (arr) => {
    for (const c of arr) {
      if (typeof c[0] === 'number') {
        const [lon, lat] = c
        if (lat < minLat) minLat = lat
        if (lat > maxLat) maxLat = lat
        if (lon < minLon) minLon = lon
        if (lon > maxLon) maxLon = lon
      } else process(c)
    }
  }
  for (const f of features) process(f.geometry.coordinates)
  return [[minLat, minLon], [maxLat, maxLon]]
}

/* ── Map sub-components ─────────────────────────────────────────────────── */
function FitNeighbourhoodBounds({ bounds }) {
  const map = useMap()
  const done = useRef(false)
  useEffect(() => {
    if (!bounds || done.current) return
    const [[minLat, minLon], [maxLat, maxLon]] = bounds
    map.fitBounds(
      [[minLat, minLon], [maxLat, maxLon]],
      { padding: [28, 28], maxZoom: 13, animate: true },
    )
    done.current = true
  }, [map, bounds])
  return null
}

function FlyTo({ lat, lon }) {
  const map = useMap()
  useEffect(() => {
    if (lat != null && lon != null)
      map.flyTo([lat, lon], Math.max(map.getZoom(), 14), { duration: 0.5 })
  }, [lat, lon, map])
  return null
}

function Rectangle({ bounds, pathOptions }) {
  const map = useMap()
  const rectRef = useRef(null)
  useEffect(() => {
    if (!bounds || rectRef.current) return
    rectRef.current = L.rectangle(bounds, pathOptions).addTo(map)
    return () => {
      if (rectRef.current) { map.removeLayer(rectRef.current); rectRef.current = null }
    }
  }, [map, bounds, pathOptions])
  return null
}

/* ── Popup contents ─────────────────────────────────────────────────────── */
function POIPopup({ poi, distM }) {
  const distLabel = distM != null
    ? distM < 1000 ? `${Math.round(distM)}m` : `${(distM / 1000).toFixed(2)} km`
    : '—'
  const catColor =
    poi.category === 'restaurant' || poi.category === 'cafe' ? '#f97316' : '#22c55e'
  return (
    <div className="text-sm min-w-[160px]">
      <p className="font-semibold text-slate-800 leading-tight">{poi.name}</p>
      <p
        className="capitalize text-xs mt-0.5 px-1.5 py-0.5 rounded-full inline-block"
        style={{ background: catColor + '22', color: catColor }}
      >
        {poi.category.replace(/_/g, ' ')}
      </p>
      {distM != null && (
        <p className="text-xs text-teal-600 mt-1">↗ {distLabel} from listing</p>
      )}
    </div>
  )
}

function ListingPopupContent({ listing }) {
  return (
    <div className="text-sm min-w-[180px]">
      <Link
        to={`/details/${listing.id}`}
        className="block font-bold text-teal-700 leading-tight underline-offset-2 hover:text-teal-900 hover:underline"
        onClick={(e) => e.stopPropagation()}
      >
        {listing.name || 'Untitled'}
      </Link>
      <p className="mt-1 font-semibold text-teal-600">
        {listing.price_clean != null
          ? `$${Number(listing.price_clean).toFixed(0)} / night`
          : '—'}
      </p>
      <p className="text-slate-500 capitalize">{listing.room_type || '—'}</p>
      <p className="text-slate-400 text-xs">{listing.neighbourhood_cleansed || '—'}</p>
      <p className="text-slate-500 text-xs">👤 {listing.accommodates ?? '—'} guests</p>
      {listing.review_scores_rating != null && (
        <p className="text-slate-500 text-xs">⭐ {Number(listing.review_scores_rating).toFixed(1)}</p>
      )}
      {listing.minimum_nights != null && (
        <p className="text-slate-400 text-xs">Min. {listing.minimum_nights} night(s)</p>
      )}
    </div>
  )
}

/* ── Hover tooltip (absolute overlay) ─────────────────────────────────── */
function HoverCard({ listing, pois }) {
  const dist = (poi) =>
    typeof poi._dist === 'number'
      ? poi._dist
      : haversineM(listing.latitude, listing.longitude, poi.lat, poi.lon)

  const restaurants = pois.filter(
    (p) => p.category === 'restaurant' || p.category === 'cafe' || p.category === 'fast_food' || p.category === 'bar',
  )
  const attractions = pois.filter(
    (p) =>
      p.category === 'attraction' || p.category === 'museum' ||
      p.category === 'gallery' || p.category === 'park',
  )

  const restaurantsIn1km = restaurants.filter((p) => dist(p) <= 1000).length
  const attractionsIn1km = attractions.filter((p) => dist(p) <= 1000).length

  const nearest = (arr) =>
    arr.length
      ? arr.slice().sort((a, b) => dist(a) - dist(b))[0]
      : null

  const r = nearest(restaurants)
  const a = nearest(attractions)
  const distLabel = (m) =>
    m < 1000 ? `${Math.round(m)}m` : `${(m / 1000).toFixed(1)} km`

  return (
    <div className="bg-white rounded-xl shadow-lg border border-slate-200 p-3 w-52 text-sm space-y-2 pointer-events-none">
      <p className="font-bold text-slate-800 leading-tight truncate">
        {listing.name || 'Untitled'}
      </p>
      <div className="flex items-center gap-1 text-teal-600 font-semibold text-xs">
        <span>💰</span>
        <span>
          {listing.price_clean != null
            ? `$${Number(listing.price_clean).toFixed(0)} / night`
            : '—'}
        </span>
      </div>

      <div className="text-xs text-slate-600 space-y-1">
        <div className="flex items-center gap-2">
          <span className="text-orange-400">🍽️</span>
          <span>
            1km 内餐厅：<span className="font-semibold text-slate-800">{restaurantsIn1km}</span>
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-green-600">🏛️</span>
          <span>
            1km 内景区：<span className="font-semibold text-slate-800">{attractionsIn1km}</span>
          </span>
        </div>
      </div>
      {r && (
        <div className="flex items-start gap-1.5 text-xs">
          <span className="text-orange-400 mt-0.5">🍽️</span>
          <div className="text-slate-600 leading-snug">
            <span className="font-medium text-slate-700">{r.name}</span>
            <br />
            <span className="text-slate-400">restaurant · {distLabel(dist(r))}</span>
          </div>
        </div>
      )}
      {a && (
        <div className="flex items-start gap-1.5 text-xs">
          <span className="text-green-500 mt-0.5">🏛️</span>
          <div className="text-slate-600 leading-snug">
            <span className="font-medium text-slate-700">{a.name}</span>
            <br />
            <span className="text-slate-400">attraction · {distLabel(dist(a))}</span>
          </div>
        </div>
      )}
    </div>
  )
}

/* ── Main ───────────────────────────────────────────────────────────────── */
export default function ListingMap({ listings = [] }) {
  const [hoveredId, setHoveredId] = useState(null)
  const [allPOIs, setAllPOIs] = useState([])
  const [poisLoading, setPOIsLoading] = useState(false)
  const [poisError, setPOIsError] = useState(null)
  const [neighbourhoodsGeoJSON, setNeighbourhoodsGeoJSON] = useState(null)
  const mapRef = useRef(null)

  const hoveredListing = listings.find((l) => l.id === hoveredId) || null

  const ROCHESTER_CENTER = [43.1553, -77.6052]
  const DEFAULT_ZOOM = 12

  /* Load GeoJSON boundaries */
  useEffect(() => {
    let cancelled = false
    fetch(NEIGHBOURHOODS_GEOJSON_URL)
      .then((r) => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json() })
      .then((data) => {
        if (!cancelled && data?.type === 'FeatureCollection' && Array.isArray(data.features))
          setNeighbourhoodsGeoJSON(data)
      })
      .catch(() => { if (!cancelled) setNeighbourhoodsGeoJSON(null) })
    return () => { cancelled = true }
  }, [])

  /* Load all POIs on mount / listings change */
  useEffect(() => {
    const valid = listings.filter(
      (l) => l.latitude != null && l.longitude != null,
    )
    if (!valid.length) return
    let cancelled = false
    setPOIsLoading(true)
    setPOIsError(null)
    fetchAllPOIs(valid)
      .then((pois) => { if (!cancelled) setAllPOIs(pois) })
      .catch(() => { if (!cancelled) setPOIsError('Could not load nearby places.') })
      .finally(() => { if (!cancelled) setPOIsLoading(false) })
    return () => { cancelled = true }
  }, [listings])

  /* GeoJSON bounds */
  const geoBounds = useMemo(() => {
    if (!neighbourhoodsGeoJSON?.features?.length) return null
    return getGeoJSONBounds(neighbourhoodsGeoJSON.features)
  }, [neighbourhoodsGeoJSON])

  const maskBounds = useMemo(() => {
    if (!geoBounds) return null
    const [[minLat, minLon], [maxLat, maxLon]] = geoBounds
    const padLat = (maxLat - minLat) * 0.35
    const padLon = (maxLon - minLon) * 0.35
    return [
      [minLat - padLat, minLon - padLon],
      [maxLat + padLat, maxLon + padLon],
    ]
  }, [geoBounds])

  const mappableListings = listings.filter(
    (l) =>
      l.latitude != null && l.longitude != null &&
      !Number.isNaN(l.latitude) && !Number.isNaN(l.longitude),
  )

  /* Styles */
  const geojsonStyle = useCallback(() => ({
    color: '#0284c7', weight: 2.5, opacity: 0.9,
    fillColor: '#e0f2fe', fillOpacity: 0.15, interactive: false,
  }), [])

  const onEachFeature = useCallback((feature, layer) => {
    const name = feature.properties?.neighbourhood
    if (!name) return
    layer.bindTooltip(name, {
      permanent: false, direction: 'center', className: 'neighbourhood-tooltip',
      style: {
        background: '#0ea5e9', border: 'none', borderRadius: '8px',
        color: 'white', fontWeight: '600', fontSize: '11px',
        padding: '3px 8px', boxShadow: '0 2px 6px rgba(0,0,0,0.2)',
      },
    })
  }, [])

  /* Compute distance from listing to each POI (memoised per hovered) */
  const poisWithDist = useMemo(() => {
    if (!hoveredListing) return allPOIs
    return allPOIs.map((p) => ({
      ...p,
      _dist: haversineM(
        hoveredListing.latitude, hoveredListing.longitude, p.lat, p.lon,
      ),
    }))
  }, [allPOIs, hoveredListing])

  const restaurants = poisWithDist.filter(
    (p) =>
      p.category === 'restaurant' || p.category === 'cafe' ||
      p.category === 'fast_food' || p.category === 'bar',
  )
  const attractions = poisWithDist.filter(
    (p) =>
      p.category === 'attraction' || p.category === 'museum' ||
      p.category === 'gallery' || p.category === 'park',
  )

  return (
    <div
      className="relative rounded-2xl overflow-hidden border border-slate-200 shadow-inner"
      style={{ height: 420, minHeight: 420 }}
    >
      {/* POI loading banner */}
      {poisLoading && (
        <div className="absolute top-2 left-1/2 -translate-x-1/2 z-[1000]
          bg-teal-600 text-white text-xs font-medium px-4 py-1.5 rounded-full shadow-md flex items-center gap-1.5">
          <span className="inline-block w-2 h-2 rounded-full bg-white animate-pulse" />
          Loading nearby places…
        </div>
      )}

      {/* POI error banner */}
      {poisError && (
        <div className="absolute top-2 left-1/2 -translate-x-1/2 z-[1000]
          bg-red-500 text-white text-xs font-medium px-3 py-1.5 rounded-full shadow-md">
          {poisError}
        </div>
      )}

      {/* Legend */}
      <div className="absolute top-2 right-2 z-[900] bg-white/95 rounded-xl
        border border-slate-200 shadow-sm px-3 py-2 space-y-1.5 text-xs max-w-[130px]">
        <div className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded-full bg-[#0ea5e9] ring-1 ring-white flex-shrink-0" />
          <span className="text-slate-600">Listing</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded-full bg-[#f97316] ring-1 ring-white flex-shrink-0" />
          <span className="text-slate-600">Restaurant</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded-full bg-[#22c55e] ring-1 ring-white flex-shrink-0" />
          <span className="text-slate-600">Attraction</span>
        </div>
        <div className="mt-1 pt-1 border-t border-slate-100 space-y-0.5">
          <div className="flex items-center gap-1.5">
            <span className="w-3 h-0.5 bg-[#0284c7] flex-shrink-0" />
            <span className="text-slate-400">Neighbourhood</span>
          </div>
          <span className="text-slate-400 block">All POIs always visible</span>
        </div>
      </div>

      {/* Hover tooltip card */}
      {hoveredListing && (
        <div className="absolute bottom-3 left-3 z-[1100]">
          <HoverCard listing={hoveredListing} pois={poisWithDist} />
        </div>
      )}

      <MapContainer
        ref={mapRef}
        center={ROCHESTER_CENTER}
        zoom={DEFAULT_ZOOM}
        style={{ width: '100%', height: '100%' }}
        scrollWheelZoom={true}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />

        {geoBounds && <FitNeighbourhoodBounds bounds={geoBounds} />}

        {/* Grey mask outside Rochester */}
        {maskBounds && (
          <Rectangle
            bounds={maskBounds}
            pathOptions={{ color: 'none', fillColor: '#64748b', fillOpacity: 0.3, interactive: false, zIndex: 1 }}
          />
        )}

        {/* Rochester neighbourhood boundaries */}
        {neighbourhoodsGeoJSON?.features?.length > 0 && (
          <GeoJSON
            key="neighbourhood-boundaries"
            data={neighbourhoodsGeoJSON}
            style={geojsonStyle}
            onEachFeature={onEachFeature}
          />
        )}

        {/* 1-km radius circle for hovered listing */}
        {hoveredListing && (
          <Circle
            center={[hoveredListing.latitude, hoveredListing.longitude]}
            radius={1000}
            pathOptions={{
              color: '#0ea5e9', fillColor: '#0ea5e9', fillOpacity: 0.07,
              weight: 1.5, dashArray: '5 4',
            }}
            zIndex={300}
          />
        )}

        {/* Fly to hovered listing */}
        <FlyTo lat={hoveredListing?.latitude} lon={hoveredListing?.longitude} />

        {/* Restaurant POIs (always visible) */}
        {restaurants.map((poi) => (
          <Marker
            key={`r-${poi.id}`}
            position={[poi.lat, poi.lon]}
            icon={ICON_RESTAURANT}
            zIndexOffset={hoveredListing ? 200 : 0}
          >
            <Popup>
              <POIPopup
                poi={poi}
                distM={poi._dist ?? null}
              />
            </Popup>
          </Marker>
        ))}

        {/* Attraction POIs (always visible) */}
        {attractions.map((poi) => (
          <Marker
            key={`a-${poi.id}`}
            position={[poi.lat, poi.lon]}
            icon={ICON_ATTRRACTION}
            zIndexOffset={hoveredListing ? 200 : 0}
          >
            <Popup>
              <POIPopup poi={poi} distM={poi._dist ?? null} />
            </Popup>
          </Marker>
        ))}

        {/* Listing markers */}
        {mappableListings.map((listing) => (
          <Marker
            key={listing.id}
            position={[listing.latitude, listing.longitude]}
            icon={ICON_LISTING}
            zIndexOffset={hoveredId === listing.id ? 500 : 100}
            eventHandlers={{
              mouseover: () => setHoveredId(listing.id),
              mouseout: () => setHoveredId(null),
            }}
          >
            <Popup>
              <ListingPopupContent listing={listing} />
            </Popup>
          </Marker>
        ))}
      </MapContainer>
    </div>
  )
}
