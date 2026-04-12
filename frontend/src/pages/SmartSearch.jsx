import { Component, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  CheckSquare,
  ChevronDown,
  ChevronRight,
  GitCompare,
  MapPin,
  Minus,
  Plus,
  Search,
  Star,
  Tag,
  X,
} from 'lucide-react'
import { CircleMarker, MapContainer, Marker, Popup, TileLayer, useMapEvents } from 'react-leaflet'
import { useCollection } from '../context/CollectionContext.jsx'
import { useCompare } from '../context/CompareContext.jsx'
import { usePreference } from '../context/PreferenceContext.jsx'
import { useUser } from '../context/UserContext.jsx'
import { api } from '../services/api.js'
import ListingMap from '../components/ListingMap.jsx'
import StayReviewIntentSheet from '../components/StayReviewIntentSheet.jsx'
import StayReviewModal from '../components/StayReviewModal.jsx'
import { formatListingPriceDisplay } from '../utils/listingPriceDisplay.js'
import { listingMarkerIcon, POI_CATEGORIES, ROCHESTER_CENTER } from '../utils/mapConfig.js'
import { rankListings } from '../utils/strategyRank.js'
import { SUGGESTED_VIBE_TAGS } from '../constants/suggestedVibeTags.js'

const POI_MERGE_CATEGORIES = ['transport', 'park', 'restaurant', 'education', 'hospital']

/** Same list as `SUGGESTED_VIBE_TAGS` (suggested tag picker + listing `vibe_tags` vocabulary). */
const SUGGESTED_TAGS = SUGGESTED_VIBE_TAGS

const ROOM_TYPE_KEYS = [
  { id: 'entire', label: 'Entire home/apt' },
  { id: 'private', label: 'Private room' },
  { id: 'shared', label: 'Shared room' },
  { id: 'hotel', label: 'Hotel room' },
]

const AMENITY_KEYS = [
  { id: 'wifi', label: 'Wifi' },
  { id: 'kitchen', label: 'Kitchen' },
  { id: 'ac', label: 'Air conditioning' },
  { id: 'parking', label: 'Parking' },
  { id: 'tv', label: 'TV' },
  { id: 'balcony', label: 'Balcony' },
]

const PLACEHOLDER_IMAGE =
  'https://images.unsplash.com/photo-1522708323590-d24dbb6b0267?w=600&q=80'

/** Must match `LISTING_PRICE_FILTER_MAX` in `backend/main.py`. */
const PRICE_FILTER_MAX = 1000
const CATEGORY_SCORE_WEIGHT = {
  transport: 1.0,
  park: 0.85,
  restaurant: 1.15,
  education: 0.75,
  hospital: 0.9,
}
const CATEGORY_POI_STYLE = {
  transport: { color: '#2563eb', fillColor: '#60a5fa', radius: 5 },
  park: { color: '#15803d', fillColor: '#4ade80', radius: 6 },
  restaurant: { color: '#c2410c', fillColor: '#fb923c', radius: 6 },
  education: { color: '#7c3aed', fillColor: '#a78bfa', radius: 5 },
  hospital: { color: '#b91c1c', fillColor: '#f87171', radius: 6 },
}

class MapErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { hasError: false, message: '' }
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, message: error?.message || 'Map failed to render' }
  }

  componentDidCatch(error) {
    if (import.meta.env.DEV) {
      console.error('[MapErrorBoundary]', {
        name: error?.name,
        message: error?.message,
      })
    }
    this.props.onError?.(error)
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex h-[320px] items-center justify-center rounded-2xl border border-red-200 bg-red-50 px-4 text-sm text-red-700 sm:h-[380px]">
          Map failed to load and the page fell back to list-only mode. Refresh and check the first map error in the browser console.
        </div>
      )
    }
    return this.props.children
  }
}

function clampInt(value, min, max) {
  const n = Number.isFinite(value) ? Math.trunc(value) : min
  return Math.min(max, Math.max(min, n))
}

function parseIntStrict(raw, fallback) {
  const n = parseInt(String(raw), 10)
  return Number.isFinite(n) ? n : fallback
}

/** All segments from pipe-separated `vibe_tags` (typically 5 per listing in room_tags.csv). */
function parseVibeTags(raw) {
  if (!raw || typeof raw !== 'string') return []
  return raw
    .split('|')
    .map((s) => s.trim())
    .filter(Boolean)
}

function listingLatLon(listing) {
  const lat = Number(listing?.latitude)
  const lon = Number(listing?.longitude)
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null
  return [lat, lon]
}

function toRad(deg) {
  return (deg * Math.PI) / 180
}

function haversineKm(aLat, aLon, bLat, bLon) {
  const R = 6371
  const dLat = toRad(bLat - aLat)
  const dLon = toRad(bLon - aLon)
  const x =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.sin(dLon / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(x))
}

function mapIntentScore(listing, pois, category) {
  const ll = listingLatLon(listing)
  if (!ll || !Array.isArray(pois) || pois.length === 0) return 0
  let nearest = Number.POSITIVE_INFINITY
  for (const poi of pois) {
    const lat = Number(poi?.lat)
    const lon = Number(poi?.lon)
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue
    const d = haversineKm(ll[0], ll[1], lat, lon)
    if (d < nearest) nearest = d
  }
  if (!Number.isFinite(nearest)) return 0
  const w = CATEGORY_SCORE_WEIGHT[category] ?? 1
  const proximity = 100 / (1 + nearest)
  return Number((w * proximity).toFixed(3))
}

function ViewportReporter({ onViewportChange }) {
  const map = useMapEvents({
    moveend() {
      const b = map.getBounds()
      onViewportChange({
        north: b.getNorth(),
        south: b.getSouth(),
        east: b.getEast(),
        west: b.getWest(),
      })
    },
    zoomend() {
      const b = map.getBounds()
      onViewportChange({
        north: b.getNorth(),
        south: b.getSouth(),
        east: b.getEast(),
        west: b.getWest(),
      })
    },
  })
  return null
}

function MapPanel({
  mapCenter,
  mappableListings,
  mapPois,
  poiCategory,
  setPoiCategory,
  onViewportChange,
  mapError,
  mapMeta,
  poiCount,
  hasPoiData,
  mapBoundsFilterEnabled,
  onMapBoundsFilterEnabledChange,
}) {
  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 bg-slate-50/70 px-3 py-2">
        <div className="flex min-w-0 flex-1 flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2 text-xs text-slate-600">
            <MapPin className="h-4 w-4 shrink-0 text-teal-600" aria-hidden />
            <span>
              {mapBoundsFilterEnabled
                ? 'Drag or zoom the map: the list is filtered to the current viewport.'
                : 'Viewport filtering is off; you can still explore the map, but the list is not limited by map bounds.'}
            </span>
          </div>
          <label className="flex shrink-0 cursor-pointer items-center gap-2 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-[11px] font-semibold text-slate-700 shadow-sm">
            <input
              type="checkbox"
              className="h-3.5 w-3.5 rounded border-slate-300 text-teal-600 focus:ring-teal-500"
              checked={mapBoundsFilterEnabled}
              onChange={(e) => onMapBoundsFilterEnabledChange(e.target.checked)}
            />
            Filter list by viewport
          </label>
        </div>
        <div className="flex items-center gap-1 rounded-lg bg-white p-1 ring-1 ring-slate-200">
          {POI_CATEGORIES.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => setPoiCategory(c)}
              className={[
                'rounded-md px-2 py-1 text-[11px] font-semibold capitalize transition-colors',
                poiCategory === c
                  ? 'bg-teal-600 text-white'
                  : 'text-slate-600 hover:bg-slate-100',
              ].join(' ')}
            >
              {c}
            </button>
          ))}
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2 border-b border-slate-100 px-3 py-2 text-[11px] text-slate-600">
        {POI_CATEGORIES.map((c) => {
          const style = CATEGORY_POI_STYLE[c] || CATEGORY_POI_STYLE.transport
          const active = c === poiCategory
          return (
            <span
              key={`legend-${c}`}
              className={[
                'inline-flex items-center gap-1.5 rounded-full px-2 py-1',
                active ? 'bg-slate-100 font-semibold text-slate-800' : 'text-slate-500',
              ].join(' ')}
            >
              <span
                className="inline-block h-2.5 w-2.5 rounded-full border"
                style={{ backgroundColor: style.fillColor, borderColor: style.color }}
              />
              {c}
              {active ? ` (${poiCount})` : ''}
            </span>
          )
        })}
      </div>
      <div className="h-[320px] w-full sm:h-[380px]">
        <MapContainer center={mapCenter} zoom={12} scrollWheelZoom className="h-full w-full">
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          <ViewportReporter onViewportChange={onViewportChange} />
          {mappableListings.map((listing) => {
            const ll = listingLatLon(listing)
            if (!ll) return null
            return (
              <Marker key={`listing-${listing.id}`} position={ll} icon={listingMarkerIcon}>
                <Popup>
                  <div className="space-y-1">
                    <Link
                      to={`/details/${listing.id}`}
                      className="block text-sm font-semibold text-teal-700 underline-offset-2 hover:text-teal-900 hover:underline"
                      onClick={(e) => e.stopPropagation()}
                    >
                      {listing.name || `Listing ${listing.id}`}
                    </Link>
                    <p className="text-xs text-slate-600">
                      {formatListingPriceDisplay(listing.price_clean)}
                    </p>
                  </div>
                </Popup>
              </Marker>
            )
          })}
          {mapPois.map((poi, idx) => (
            <CircleMarker
              key={`poi-${poi.id ?? idx}`}
              center={[poi.lat, poi.lon]}
              radius={(CATEGORY_POI_STYLE[poi.category || poiCategory] || CATEGORY_POI_STYLE.transport).radius}
              pathOptions={{
                color: (CATEGORY_POI_STYLE[poi.category || poiCategory] || CATEGORY_POI_STYLE.transport).color,
                fillColor: (CATEGORY_POI_STYLE[poi.category || poiCategory] || CATEGORY_POI_STYLE.transport).fillColor,
                fillOpacity: 0.75,
                weight: 2,
              }}
            >
              <Popup>
                <div className="space-y-1">
                  <p className="text-sm font-semibold">{poi.name || 'POI'}</p>
                  <p className="text-xs capitalize text-slate-600">{poi.category || poiCategory}</p>
                </div>
              </Popup>
            </CircleMarker>
          ))}
        </MapContainer>
      </div>
      {mapError && (
        <div className="border-t border-red-100 bg-red-50 px-3 py-2 text-xs text-red-700">
          {mapError}
        </div>
      )}
      {!mapError && mapMeta?.source && (
        <div className="border-t border-slate-100 bg-slate-50 px-3 py-2 text-[11px] text-slate-500">
          data source: {mapMeta.source}
          {typeof mapMeta.coverage === 'number' ? ` | coverage: ${(mapMeta.coverage * 100).toFixed(0)}%` : ''}
          {mapMeta.generatedAt ? ` | generated: ${mapMeta.generatedAt}` : ''}
        </div>
      )}
      {!mapError && !hasPoiData && (
        <div className="border-t border-amber-200 bg-amber-50 px-3 py-2 text-[11px] text-amber-800">
          No POI data for this category; the list uses default sort order.
        </div>
      )}
    </div>
  )
}

/** `average_sentiment_score` is typically 0–1; show as percent. */
function formatSentimentScore(value) {
  if (value == null || value === '') return '—'
  const n = Number(value)
  if (Number.isNaN(n)) return '—'
  const pct = n <= 1 ? n * 100 : n
  return `${pct.toFixed(2)}%`
}

/** Extract tag-like words from search query and match against known tags. */
function extractTagsFromQuery(query, knownTags) {
  if (!query || typeof query !== 'string') return []
  const normalized = query.toLowerCase().trim()
  if (!normalized) return []

  const matchedTags = []
  const queryWords = normalized.split(/\s+/).filter(Boolean)

  for (const tag of knownTags) {
    const tagLower = tag.toLowerCase()
    // Exact or partial match in query words
    const found = queryWords.some((word) => tagLower.includes(word) || word.includes(tagLower))
    if (found) {
      matchedTags.push(tag)
    }
  }

  // Also check if the entire query matches a tag
  if (!matchedTags.length) {
    const exactMatch = knownTags.find(
      (tag) => tag.toLowerCase() === normalized || normalized.includes(tag.toLowerCase()),
    )
    if (exactMatch) {
      matchedTags.push(exactMatch)
    }
  }

  return matchedTags
}

/** Maps UI filter state → FastAPI `/api/listings` query params. */
function buildListingParams({
  guests,
  bedrooms,
  beds,
  bathrooms,
  priceMin,
  priceMax,
  roomTypes,
  amenities,
  vibeTags,
  vibeTagsMode,
  q,
  viewport,
  page,
  limit,
}) {
  const params = {
    min_price: priceMin,
    max_price: priceMax,
    guests,
    bedrooms,
    beds,
    bathrooms,
    skip: (page - 1) * limit,
    limit,
  }
  if (viewport) {
    params.map_mode = true
    params.north = viewport.north
    params.south = viewport.south
    params.east = viewport.east
    params.west = viewport.west
  }
  const roomLabels = ROOM_TYPE_KEYS.filter(({ id }) => roomTypes[id]).map(
    ({ label }) => label,
  )
  if (roomLabels.length > 0) {
    params.room_type = roomLabels.join(',')
  }
  if (amenities.wifi) params.has_wifi = true
  if (amenities.kitchen) params.has_kitchen = true
  if (amenities.ac) params.has_air_conditioning = true
  if (amenities.parking) params.has_parking = true
  if (amenities.tv) params.has_tv = true
  if (amenities.balcony) params.has_balcony = true
  const qTrim = typeof q === 'string' ? q.trim() : ''
  if (qTrim) {
    params.q = qTrim
  }
  if (vibeTags && vibeTags.length > 0) {
    params.vibe_tags = vibeTags
    params.vibe_tags_mode = vibeTagsMode === 'and' ? 'and' : 'or'
  }
  return params
}

function IntegerStepper({
  label,
  value,
  onChange,
  min,
  max,
}) {
  const dec = () => onChange(clampInt(value - 1, min, max))
  const inc = () => onChange(clampInt(value + 1, min, max))
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-xs font-bold uppercase tracking-wide text-slate-700">
        {label}
      </span>
      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={dec}
          disabled={value <= min}
          className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 shadow-sm transition-colors hover:border-teal-300 hover:bg-teal-50 hover:text-teal-800 disabled:cursor-not-allowed disabled:opacity-40"
          aria-label={`Decrease ${label}`}
        >
          <Minus className="h-4 w-4" aria-hidden />
        </button>
        <span className="min-w-[2rem] text-center font-mono text-sm font-semibold tabular-nums text-slate-900">
          {value}
        </span>
        <button
          type="button"
          onClick={inc}
          disabled={value >= max}
          className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 shadow-sm transition-colors hover:border-teal-300 hover:bg-teal-50 hover:text-teal-800 disabled:cursor-not-allowed disabled:opacity-40"
          aria-label={`Increase ${label}`}
        >
          <Plus className="h-4 w-4" aria-hidden />
        </button>
      </div>
    </div>
  )
}

export default function SmartSearch() {
  const navigate = useNavigate()
  const { userId, profile } = useUser()
  const { items, toggleCompare, isInCompare } = useCompare()
  const { topVibeTag, saveTopVibeTag } = usePreference()
  const {
    isFavorite,
    isStayed,
    isStayReviewed,
    toggleFavorite,
    toggleStayed,
    syncListingFlags,
    refreshStaysFromServer,
    bumpStayDataEpoch,
  } = useCollection()

  const [listings, setListings] = useState([])
  const [totalCount, setTotalCount] = useState(0)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState(null)

  const [searchQuery, setSearchQuery] = useState('')
  const [inputValue, setInputValue] = useState('')

  const [guests, setGuests] = useState(2)
  const [bedrooms, setBedrooms] = useState(1)
  const [beds, setBeds] = useState(1)
  const [bathrooms, setBathrooms] = useState(1)

  const [priceMin, setPriceMin] = useState(30)
  const [priceMax, setPriceMax] = useState(400)

  const [roomTypes, setRoomTypes] = useState({
    entire: false,
    private: false,
    shared: false,
    hotel: false,
  })

  const [amenities, setAmenities] = useState({
    wifi: false,
    kitchen: false,
    ac: false,
    parking: false,
    tv: false,
    balcony: false,
  })

  const [selectedTags, setSelectedTags] = useState(() => new Set())
  /** Avoid re-adding the same auto-picked vibe when `resolvedVibeTag` is stable; reset when `userId` changes. */
  const lastAutoAppliedVibeRef = useRef(null)
  /** Multiple tags → backend `vibe_tags_mode`: match any (or) vs match all (and). */
  const [tagMatchMode, setTagMatchMode] = useState('or')
  /** Search box: name = listing name / neighbourhood (`q`); tags = parse tags from input + chips below. */
  const [searchFieldMode, setSearchFieldMode] = useState('tags')
  /** When false, listing requests omit map bbox; map and POIs still follow the viewport. */
  const [mapBoundsFilterEnabled, setMapBoundsFilterEnabled] = useState(true)
  const [suggestedTagsOpen, setSuggestedTagsOpen] = useState(false)
  const [page, setPage] = useState(1)
  const PAGE_SIZE = 12
  const [viewport, setViewport] = useState(null)
  const [mapPois, setMapPois] = useState([])
  const [poiCategory, setPoiCategory] = useState('transport')
  const [mapError, setMapError] = useState(null)
  const [mapMeta, setMapMeta] = useState(null)
  const [mapDisabled, setMapDisabled] = useState(false)
  const [mapRenderNonce, setMapRenderNonce] = useState(0)
  const [strategyConfig, setStrategyConfig] = useState(null)
  const [mergedPois, setMergedPois] = useState([])
  const [userTagScores, setUserTagScores] = useState(null)
  const [reviewModalListing, setReviewModalListing] = useState(null)
  const [stayIntentListing, setStayIntentListing] = useState(null)
  const [stayIntentConfirming, setStayIntentConfirming] = useState(false)
  const [stayIntentUnmarking, setStayIntentUnmarking] = useState(false)
  const poiCount = mapPois.length
  const hasPoiData = poiCount > 0

  const effectiveTagWeights = useMemo(() => {
    if (userTagScores && typeof userTagScores === 'object' && Object.keys(userTagScores).length > 0) {
      return userTagScores
    }
    const d = strategyConfig?.default_preference_tags
    if (d && typeof d === 'object') return d
    return {}
  }, [userTagScores, strategyConfig])

  const useStrategyRanking = Boolean(
    strategyConfig &&
      typeof strategyConfig.scenic_weight === 'number' &&
      typeof strategyConfig.cost_weight === 'number',
  )

  /**
   * Default vibe for filters: guests use session/onboarding tag; signed-in users use
   * `GET /profile` `top_vibe_tag` once `profile.user_id` matches (avoid stale cache before fetch).
   */
  const resolvedVibeTag = useMemo(() => {
    const fromSession =
      topVibeTag != null && String(topVibeTag).trim() ? String(topVibeTag).trim() : ''
    if (!userId) return fromSession || null
    const pid = profile?.user_id != null ? Number(profile.user_id) : null
    const profileMatches = pid === Number(userId)
    if (!profileMatches) return null
    const fromProfile =
      profile?.top_vibe_tag != null ? String(profile.top_vibe_tag).trim() : ''
    if (fromProfile) return fromProfile
    return fromSession || null
  }, [userId, profile?.user_id, profile?.top_vibe_tag, topVibeTag])

  // Derive tags from search query
  const queryExtractedTags = useMemo(
    () => extractTagsFromQuery(searchQuery, SUGGESTED_TAGS),
    [searchQuery],
  )

  // Merge manual tag selection + query-derived tags (tags search mode only for API + chip state).
  const allActiveTags = useMemo(() => {
    return new Set([...selectedTags, ...queryExtractedTags])
  }, [selectedTags, queryExtractedTags])

  const vibeTagsForApi = useMemo(() => {
    if (searchFieldMode === 'name') {
      return [...selectedTags]
    }
    return [...allActiveTags]
  }, [searchFieldMode, selectedTags, allActiveTags])

  const effectiveViewportForListings = useMemo(
    () => (mapBoundsFilterEnabled ? viewport : null),
    [mapBoundsFilterEnabled, viewport],
  )

  const qForApi = searchQuery.trim()

  const filterKey = useMemo(
    () =>
      JSON.stringify({
        guests,
        bedrooms,
        beds,
        bathrooms,
        priceMin,
        priceMax,
        roomTypes,
        amenities,
        vibeTags: [...vibeTagsForApi].sort(),
        vibeTagsMode: tagMatchMode,
        q: qForApi,
        searchFieldMode,
        viewport: effectiveViewportForListings,
        mapBoundsFilterEnabled,
      }),
    [
      guests,
      bedrooms,
      beds,
      bathrooms,
      priceMin,
      priceMax,
      roomTypes,
      amenities,
      vibeTagsForApi,
      tagMatchMode,
      qForApi,
      searchFieldMode,
      effectiveViewportForListings,
      mapBoundsFilterEnabled,
    ],
  )

  const prevFilterKeyRef = useRef(filterKey)
  const viewportDebounceRef = useRef(null)

  // Handle search input changes
  const handleSearchChange = useCallback((e) => {
    const value = e.target.value
    setInputValue(value)
    setSearchQuery(value)
  }, [])

  // Clear search
  const clearSearch = useCallback(() => {
    setInputValue('')
    setSearchQuery('')
  }, [])

  const onViewportChange = useCallback((nextBbox) => {
    if (viewportDebounceRef.current) {
      window.clearTimeout(viewportDebounceRef.current)
    }
    viewportDebounceRef.current = window.setTimeout(() => {
      setViewport(nextBbox)
    }, 280)
  }, [])

  const toggleTag = useCallback((tag) => {
    // Only toggle in selectedTags (not in query-extracted)
    setSelectedTags((prev) => {
      const next = new Set(prev)
      if (next.has(tag)) next.delete(tag)
      else next.add(tag)
      return next
    })
  }, [])

  const syncPriceRange = useCallback((nextMin, nextMax) => {
    let a = clampInt(nextMin, 0, PRICE_FILTER_MAX)
    let b = clampInt(nextMax, 0, PRICE_FILTER_MAX)
    if (a > b) [a, b] = [b, a]
    setPriceMin(a)
    setPriceMax(b)
  }, [])

  const onMinInput = (e) => {
    const v = parseIntStrict(e.target.value, priceMin)
    syncPriceRange(v, priceMax)
  }

  const onMaxInput = (e) => {
    const v = parseIntStrict(e.target.value, priceMax)
    syncPriceRange(priceMin, v)
  }

  const onMinRange = (e) => {
    const v = parseIntStrict(e.target.value, priceMin)
    syncPriceRange(v, priceMax)
  }

  const onMaxRange = (e) => {
    const v = parseIntStrict(e.target.value, priceMax)
    syncPriceRange(priceMin, v)
  }

  // Keep session preference aligned with server after login / profile refresh
  useEffect(() => {
    if (!userId || !profile?.user_id || Number(profile.user_id) !== Number(userId)) return
    const p = profile.top_vibe_tag != null ? String(profile.top_vibe_tag).trim() : ''
    if (p) saveTopVibeTag(p)
  }, [userId, profile?.user_id, profile?.top_vibe_tag, saveTopVibeTag])

  useEffect(() => {
    lastAutoAppliedVibeRef.current = null
  }, [userId])

  // Auto-add the user's vibe tag when it becomes available (login/profile load or guest session)
  useEffect(() => {
    const tag = resolvedVibeTag?.trim()
    if (!tag) return
    if (lastAutoAppliedVibeRef.current === tag) return
    lastAutoAppliedVibeRef.current = tag
    setSelectedTags((prev) => {
      const next = new Set(prev)
      next.add(tag)
      return next
    })
  }, [resolvedVibeTag])

  useEffect(() => {
    return () => {
      if (viewportDebounceRef.current) {
        window.clearTimeout(viewportDebounceRef.current)
      }
    }
  }, [])

  useEffect(() => {
    let cancelled = false

    const filtersJustChanged = prevFilterKeyRef.current !== filterKey
    if (filtersJustChanged) {
      prevFilterKeyRef.current = filterKey
      if (page !== 1) {
        setPage(1)
      }
    }
    const requestPage = filtersJustChanged ? 1 : page

    async function fetchListings() {
      setError(null)
      setIsLoading(true)
      try {
        const query = buildListingParams({
          guests,
          bedrooms,
          beds,
          bathrooms,
          priceMin,
          priceMax,
          roomTypes,
          amenities,
          vibeTags: vibeTagsForApi,
          vibeTagsMode: tagMatchMode,
          q: qForApi,
          viewport: effectiveViewportForListings,
          page: requestPage,
          limit: PAGE_SIZE,
        })
        const data = await api.getListings(query)
        if (!cancelled) {
          const arr = Array.isArray(data)
            ? data
            : Array.isArray(data?.listings)
              ? data.listings
              : []
          const total = Number.isFinite(data?.total) ? data.total : arr.length
          setListings(arr)
          setTotalCount(total)
        }
      } catch (err) {
        if (!cancelled) {
          const detail = err?.response?.data?.detail
          const fromServer =
            typeof detail === 'string'
              ? detail
              : Array.isArray(detail)
                ? detail.map((x) => x?.msg || x).filter(Boolean).join(', ')
                : null
          const isNetwork =
            !err?.response &&
            (err?.code === 'ERR_NETWORK' || err?.message === 'Network Error')
          setError(
            fromServer ||
              (isNetwork
                ? 'Cannot reach the API. Start the backend from the backend folder: python3 -m uvicorn main:app --reload --host 127.0.0.1 --port 8000, and run the frontend with npm run dev (Vite proxy).'
                : err?.message || 'Failed to load listings'),
          )
          setListings([])
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false)
        }
      }
    }

    fetchListings()
    return () => {
      cancelled = true
    }
  }, [filterKey, page])

  useEffect(() => {
    let cancelled = false
    if (!viewport) {
      setMapPois([])
      setMapError(null)
      setMapMeta(null)
      return
    }
    async function fetchPois() {
      try {
        setMapError(null)
        const data = await api.getMapPois({
          north: viewport.north,
          south: viewport.south,
          east: viewport.east,
          west: viewport.west,
          category: poiCategory,
        })
        if (!cancelled) {
          setMapPois(Array.isArray(data?.pois) ? data.pois : [])
          setMapMeta({
            source: data?.source ?? null,
            coverage: Number.isFinite(data?.coverage) ? data.coverage : null,
            generatedAt: data?.generated_at ?? null,
          })
        }
      } catch (err) {
        if (!cancelled) {
          setMapError(err?.response?.data?.detail || err?.message || 'Failed to load map POIs')
          setMapPois([])
          setMapMeta(null)
        }
      }
    }
    fetchPois()
    return () => {
      cancelled = true
    }
  }, [viewport, poiCategory])

  useEffect(() => {
    let cancelled = false
    api
      .getPublicStrategy()
      .then((d) => {
        if (!cancelled) setStrategyConfig(d)
      })
      .catch(() => {
        if (!cancelled) setStrategyConfig(null)
      })
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (!userId) {
      setUserTagScores(null)
      return
    }
    let cancelled = false
    api
      .getPreferences(userId)
      .then((d) => {
        if (cancelled) return
        setUserTagScores(d?.tag_scores && typeof d.tag_scores === 'object' ? d.tag_scores : {})
      })
      .catch(() => {
        if (!cancelled) setUserTagScores(null)
      })
    return () => {
      cancelled = true
    }
  }, [userId])

  useEffect(() => {
    if (!viewport) {
      setMergedPois([])
      return
    }
    let cancelled = false
    async function loadMerged() {
      try {
        const results = await Promise.all(
          POI_MERGE_CATEGORIES.map((category) =>
            api.getMapPois({
              north: viewport.north,
              south: viewport.south,
              east: viewport.east,
              west: viewport.west,
              category,
            }),
          ),
        )
        if (cancelled) return
        const byId = new Map()
        for (const data of results) {
          for (const p of data?.pois || []) {
            const id = p?.id
            if (id != null && !byId.has(id)) byId.set(id, p)
          }
        }
        setMergedPois([...byId.values()])
      } catch {
        if (!cancelled) setMergedPois([])
      }
    }
    loadMerged()
    return () => {
      cancelled = true
    }
  }, [viewport])

  const rankedListings = useMemo(() => {
    if (useStrategyRanking && listings.length > 0) {
      const ranked = rankListings(listings, {
        pois: mergedPois,
        tagWeights: effectiveTagWeights,
        wPoi: strategyConfig.scenic_weight,
        wCost: strategyConfig.cost_weight,
        wSent: strategyConfig.sentiment_weight,
        wPref: strategyConfig.preference_weight,
      })
      return ranked.map(({ listing, score }) => ({
        ...listing,
        strategy_rank_score: score,
      }))
    }
    const enriched = listings.map((listing) => ({
      ...listing,
      map_intent_score: mapIntentScore(listing, mapPois, poiCategory),
    }))
    if (!hasPoiData) {
      return enriched.sort((a, b) => a.id - b.id)
    }
    return enriched.sort((a, b) => {
      if (b.map_intent_score !== a.map_intent_score) {
        return b.map_intent_score - a.map_intent_score
      }
      return a.id - b.id
    })
  }, [
    useStrategyRanking,
    listings,
    mergedPois,
    effectiveTagWeights,
    strategyConfig,
    mapPois,
    poiCategory,
    hasPoiData,
  ])

  const listingIdsSyncKey = useMemo(
    () => rankedListings.map((l) => l.id).join(','),
    [rankedListings],
  )

  useEffect(() => {
    if (!userId || !listingIdsSyncKey) return
    const ids = listingIdsSyncKey.split(',').map(Number).filter(Boolean)
    if (ids.length) syncListingFlags(ids)
  }, [userId, listingIdsSyncKey, syncListingFlags])

  const mappableListings = useMemo(
    () => rankedListings.filter((x) => listingLatLon(x) !== null),
    [rankedListings],
  )
  const mapCenter = useMemo(() => {
    const first = mappableListings[0]
    const ll = listingLatLon(first)
    return ll || ROCHESTER_CENTER
  }, [mappableListings])

  return (
    <div className="relative grid grid-cols-12 gap-6 pb-24 lg:gap-8">
      <aside className="col-span-12 space-y-0 md:col-span-3">
        <div className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
          <h2 className="text-sm font-bold uppercase tracking-wide text-slate-800">
            Filters
          </h2>

          <div className="mt-4 space-y-4">
            <div>
              <h3 className="text-[11px] font-bold uppercase tracking-wide text-slate-600">
                Capacity
              </h3>
              <div className="mt-3 space-y-3">
                <IntegerStepper
                  label="Guests"
                  value={guests}
                  onChange={(v) => setGuests(v)}
                  min={1}
                  max={16}
                />
                <IntegerStepper
                  label="Bedrooms"
                  value={bedrooms}
                  onChange={(v) => setBedrooms(v)}
                  min={0}
                  max={10}
                />
                <IntegerStepper
                  label="Beds"
                  value={beds}
                  onChange={(v) => setBeds(v)}
                  min={1}
                  max={10}
                />
                <IntegerStepper
                  label="Bathrooms"
                  value={bathrooms}
                  onChange={(v) => setBathrooms(v)}
                  min={0}
                  max={10}
                />
              </div>
            </div>

            <div className="border-t border-slate-100 pt-4">
              <h3 className="text-[11px] font-bold uppercase tracking-wide text-slate-600">
                Price range (USD / night)
              </h3>
              <p className="mt-1 text-xs text-slate-500">Integers only</p>
              <div className="mt-3 grid grid-cols-2 gap-2">
                <div>
                  <label htmlFor="price-min" className="sr-only">
                    Minimum price
                  </label>
                  <input
                    id="price-min"
                    type="number"
                    inputMode="numeric"
                    step={1}
                    min={0}
                    max={PRICE_FILTER_MAX}
                    value={priceMin}
                    onChange={onMinInput}
                    className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 font-mono text-sm tabular-nums text-slate-900 shadow-sm outline-none focus:border-teal-200 focus:ring-2 focus:ring-teal-600/20"
                  />
                </div>
                <div>
                  <label htmlFor="price-max" className="sr-only">
                    Maximum price
                  </label>
                  <input
                    id="price-max"
                    type="number"
                    inputMode="numeric"
                    step={1}
                    min={0}
                    max={PRICE_FILTER_MAX}
                    value={priceMax}
                    onChange={onMaxInput}
                    className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 font-mono text-sm tabular-nums text-slate-900 shadow-sm outline-none focus:border-teal-200 focus:ring-2 focus:ring-teal-600/20"
                  />
                </div>
              </div>
              <div className="mt-4 space-y-3">
                <div>
                  <div className="mb-1 flex items-center justify-between text-[10px] font-bold uppercase text-slate-500">
                    <span>Min slider</span>
                    <span className="font-mono tabular-nums">${priceMin}</span>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={PRICE_FILTER_MAX}
                    step={1}
                    value={priceMin}
                    onChange={onMinRange}
                    className="h-2 w-full cursor-pointer appearance-none rounded-full bg-slate-200 accent-teal-600"
                  />
                </div>
                <div>
                  <div className="mb-1 flex items-center justify-between text-[10px] font-bold uppercase text-slate-500">
                    <span>Max slider</span>
                    <span className="font-mono tabular-nums">${priceMax}</span>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={PRICE_FILTER_MAX}
                    step={1}
                    value={priceMax}
                    onChange={onMaxRange}
                    className="h-2 w-full cursor-pointer appearance-none rounded-full bg-slate-200 accent-teal-600"
                  />
                </div>
              </div>
            </div>

            <div className="border-t border-slate-100 pt-4">
              <h3 className="text-[11px] font-bold uppercase tracking-wide text-slate-600">
                Room type
              </h3>
              <div className="mt-3 space-y-2">
                {ROOM_TYPE_KEYS.map(({ id, label }) => (
                  <label
                    key={id}
                    className="flex cursor-pointer items-center gap-2.5 rounded-lg border border-transparent px-1 py-1.5 text-sm text-slate-700 hover:bg-slate-50"
                  >
                    <input
                      type="checkbox"
                      checked={roomTypes[id]}
                      onChange={(e) =>
                        setRoomTypes((prev) => ({
                          ...prev,
                          [id]: e.target.checked,
                        }))
                      }
                      className="h-4 w-4 rounded border-slate-300 text-teal-600 focus:ring-teal-500"
                    />
                    {label}
                  </label>
                ))}
              </div>
            </div>

            <div className="border-t border-slate-100 pt-4">
              <h3 className="text-[11px] font-bold uppercase tracking-wide text-slate-600">
                Amenities
              </h3>
              <div className="mt-3 space-y-2">
                {AMENITY_KEYS.map(({ id, label }) => (
                  <label
                    key={id}
                    className="flex cursor-pointer items-center gap-2.5 rounded-lg border border-transparent px-1 py-1.5 text-sm text-slate-700 hover:bg-slate-50"
                  >
                    <input
                      type="checkbox"
                      checked={amenities[id]}
                      onChange={(e) =>
                        setAmenities((prev) => ({
                          ...prev,
                          [id]: e.target.checked,
                        }))
                      }
                      className="h-4 w-4 rounded border-slate-300 text-teal-600 focus:ring-teal-500"
                    />
                    {label}
                  </label>
                ))}
              </div>
            </div>
          </div>
        </div>
      </aside>

      <div className="col-span-12 flex flex-col gap-6 md:col-span-9">
        <div>
          <label htmlFor="command-search" className="sr-only">
            Search
          </label>
          <div className="flex flex-col gap-3 lg:flex-row lg:items-stretch">
            <div className="relative min-w-0 flex-1">
              <Search
                className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400"
                aria-hidden
              />
              <input
                id="command-search"
                type="search"
                placeholder={
                  searchFieldMode === 'name'
                    ? 'Search listing name or neighbourhood (space-separated words must all match)…'
                    : 'Type to match vibe tags, or pick suggested tags below…'
                }
                value={inputValue}
                onChange={handleSearchChange}
                className="w-full rounded-2xl border border-slate-100 bg-white py-3.5 pl-12 pr-10 text-sm text-slate-900 shadow-sm outline-none ring-teal-600/20 transition-all placeholder:text-slate-400 focus:border-teal-200 focus:ring-4"
              />
              {inputValue && (
                <button
                  type="button"
                  onClick={clearSearch}
                  className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full p-1 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600"
                  aria-label="Clear search"
                >
                  <X className="h-4 w-4" aria-hidden />
                </button>
              )}
            </div>
            <div className="flex shrink-0 items-center lg:self-center">
              <div
                className="flex items-center gap-0.5 rounded-lg border border-slate-200 bg-white p-0.5 text-[11px] font-semibold shadow-sm"
                role="group"
                aria-label="Search mode"
              >
                <button
                  type="button"
                  onClick={() => setSearchFieldMode('name')}
                  className={[
                    'rounded-md px-2 py-1 transition-colors',
                    searchFieldMode === 'name'
                      ? 'bg-teal-600 text-white shadow-sm'
                      : 'text-slate-600 hover:bg-slate-100',
                  ].join(' ')}
                >
                  Name
                </button>
                <button
                  type="button"
                  onClick={() => setSearchFieldMode('tags')}
                  className={[
                    'rounded-md px-2 py-1 transition-colors',
                    searchFieldMode === 'tags'
                      ? 'bg-teal-600 text-white shadow-sm'
                      : 'text-slate-600 hover:bg-slate-100',
                  ].join(' ')}
                >
                  Tags
                </button>
              </div>
            </div>
          </div>

          {/* Active tags from search query */}
          {searchFieldMode === 'tags' && queryExtractedTags.length > 0 && (
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <Tag className="h-3.5 w-3.5 shrink-0 text-teal-600" aria-hidden />
              <span className="text-xs text-slate-500">Matched tags:</span>
              <div className="flex flex-wrap gap-1.5">
                {queryExtractedTags.map((tag) => (
                  <span
                    key={tag}
                    className="inline-flex items-center gap-1 rounded-full border border-teal-200 bg-teal-50 px-2.5 py-1 text-xs font-medium text-teal-800"
                  >
                    <Tag className="h-3 w-3" aria-hidden />
                    {tag}
                  </span>
                ))}
              </div>
            </div>
          )}

          <div className="mt-3 rounded-xl border border-slate-100 bg-slate-50/50">
            <div
              className={[
                'flex flex-wrap items-center justify-between gap-2 px-2 py-2 sm:px-3',
                suggestedTagsOpen ? 'border-b border-slate-100/80' : '',
              ].join(' ')}
            >
              <button
                type="button"
                onClick={() => setSuggestedTagsOpen((o) => !o)}
                className="flex min-w-0 flex-1 items-center gap-2 rounded-lg py-0.5 text-left text-slate-600 transition-colors hover:bg-white/80 hover:text-slate-900"
                aria-expanded={suggestedTagsOpen}
                aria-controls="suggested-tags-panel"
                id="suggested-tags-toggle"
              >
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-slate-200 bg-white text-slate-500 shadow-sm">
                  {suggestedTagsOpen ? (
                    <ChevronDown className="h-4 w-4" aria-hidden />
                  ) : (
                    <ChevronRight className="h-4 w-4" aria-hidden />
                  )}
                </span>
                <span className="min-w-0">
                  <span className="block text-[11px] font-bold uppercase tracking-wide text-slate-500">
                    Suggested tags
                  </span>
                  {!suggestedTagsOpen && vibeTagsForApi.length > 0 && (
                    <span className="text-[11px] text-slate-400">
                      {vibeTagsForApi.length} active
                    </span>
                  )}
                </span>
              </button>
              <div className="flex items-center gap-0.5 rounded-lg border border-slate-200 bg-white p-0.5 text-[11px] font-semibold shadow-sm">
                <button
                  type="button"
                  onClick={() => setTagMatchMode('or')}
                  className={[
                    'rounded-md px-2 py-1 transition-colors',
                    tagMatchMode === 'or'
                      ? 'bg-teal-600 text-white shadow-sm'
                      : 'text-slate-600 hover:bg-slate-100',
                  ].join(' ')}
                >
                  Any (OR)
                </button>
                <button
                  type="button"
                  onClick={() => setTagMatchMode('and')}
                  className={[
                    'rounded-md px-2 py-1 transition-colors',
                    tagMatchMode === 'and'
                      ? 'bg-teal-600 text-white shadow-sm'
                      : 'text-slate-600 hover:bg-slate-100',
                  ].join(' ')}
                >
                  All (AND)
                </button>
              </div>
            </div>
            {suggestedTagsOpen && (
              <div
                id="suggested-tags-panel"
                role="region"
                aria-labelledby="suggested-tags-toggle"
                className="-mx-1 flex flex-wrap gap-2 overflow-x-auto px-2 pb-2 pt-2 sm:px-3"
              >
                {SUGGESTED_TAGS.map((tag) => {
                  const isSelected =
                    searchFieldMode === 'tags'
                      ? allActiveTags.has(tag)
                      : selectedTags.has(tag)
                  return (
                    <button
                      key={tag}
                      type="button"
                      onClick={() => toggleTag(tag)}
                      className={[
                        'shrink-0 rounded-full border px-2.5 py-1 text-[11px] font-medium transition-all',
                        isSelected
                          ? 'border-teal-300 bg-teal-50 text-teal-800 shadow-sm'
                          : 'border-slate-200 bg-white text-slate-600 hover:border-teal-200 hover:bg-slate-50',
                      ].join(' ')}
                    >
                      {tag}
                    </button>
                  )
                })}
              </div>
            )}
          </div>
        </div>

        {mapDisabled ? (
          <div className="flex h-[320px] flex-col items-center justify-center gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 text-center sm:h-[380px]">
            <p className="text-sm text-amber-800">
              Map is disabled; you are in list-only mode. Filters and listings still work.
            </p>
            <button
              type="button"
              onClick={() => {
                setMapDisabled(false)
                setMapRenderNonce((n) => n + 1)
              }}
              className="rounded-lg bg-amber-600 px-3 py-2 text-xs font-semibold text-white hover:bg-amber-700"
            >
              Retry loading map
            </button>
          </div>
        ) : (
          <MapErrorBoundary
            key={mapRenderNonce}
            onError={() => {
              setMapDisabled(true)
            }}
          >
            <MapPanel
              mapCenter={mapCenter}
              mappableListings={mappableListings}
              mapPois={mapPois}
              poiCategory={poiCategory}
              setPoiCategory={setPoiCategory}
              onViewportChange={onViewportChange}
              mapError={mapError}
              mapMeta={mapMeta}
              poiCount={poiCount}
              hasPoiData={hasPoiData}
              mapBoundsFilterEnabled={mapBoundsFilterEnabled}
              onMapBoundsFilterEnabledChange={setMapBoundsFilterEnabled}
            />
          </MapErrorBoundary>
        )}

        <div>
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-lg font-semibold text-slate-900">
              Matching stays
            </h2>
            <div className="text-right">
              <span className="text-sm text-slate-500">
                {isLoading ? '…' : `${totalCount} results`}
              </span>
              <p className="text-[11px] text-slate-400">
                {useStrategyRanking
                  ? userTagScores && Object.keys(userTagScores).length > 0
                    ? 'Sorted by match score (your vibe preferences + merged area POIs + price + reviews)'
                    : 'Sorted by match score (default vibe profile + merged area POIs + price + reviews)'
                  : hasPoiData
                    ? `Sorted by ${poiCategory} proximity`
                    : 'Default order (no POI data)'}
              </p>
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            {isLoading && (
              <div className="col-span-full flex min-h-[200px] flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-slate-200 bg-slate-50/80 text-slate-600">
                <span
                  className="inline-block h-8 w-8 animate-spin rounded-full border-2 border-teal-600 border-t-transparent"
                  aria-hidden
                />
                <p className="text-sm font-medium">Loading real data…</p>
              </div>
            )}
            {!isLoading && error && (
              <div className="col-span-full rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
                {error}
              </div>
            )}
            {!isLoading &&
              !error &&
              rankedListings.map((listing) => {
                const selected = isInCompare(listing.id)
                const vibePills = parseVibeTags(listing.vibe_tags)
                return (
                  <article
                    key={listing.id}
                    className="group relative overflow-hidden rounded-2xl border border-slate-100 bg-white shadow-sm transition-all duration-300 hover:-translate-y-1 hover:shadow-md"
                  >
                    <Link to={`/details/${listing.id}`} className="block">
                      <div className="relative aspect-[16/10] overflow-hidden">
                        <img
                          src={
                            listing.picture_url &&
                            String(listing.picture_url).trim().startsWith('http')
                              ? listing.picture_url
                              : PLACEHOLDER_IMAGE
                          }
                          alt=""
                          className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.03]"
                        />
                        <div className="absolute inset-0 bg-gradient-to-t from-slate-900/50 to-transparent opacity-0 transition-opacity group-hover:opacity-100" />
                      </div>
                      <div className="p-4">
                        <h3 className="font-semibold text-slate-900">
                          {listing.name || 'Untitled listing'}
                        </h3>
                        <p className="mt-0.5 text-sm text-slate-500">
                          {listing.room_type || listing.property_type || '—'}
                        </p>
                        {vibePills.length > 0 && (
                          <div className="mt-2 flex flex-wrap gap-1.5">
                            {vibePills.map((tag) => (
                              <span
                                key={tag}
                                className="rounded-full bg-teal-50 px-2 py-0.5 text-[10px] font-medium text-teal-800 ring-1 ring-teal-100"
                              >
                                {tag}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    </Link>
                    <div className="flex items-start justify-between gap-2 border-t border-slate-50 px-4 pb-4">
                      <div className="text-xs text-slate-400">
                        <p>Sentiment {formatSentimentScore(listing.average_sentiment_score)}</p>
                        <p className="mt-0.5 text-teal-700">
                          {useStrategyRanking
                            ? `Match score ${typeof listing.strategy_rank_score === 'number' ? listing.strategy_rank_score.toFixed(1) : '—'}`
                            : `Map fit (${poiCategory}) ${typeof listing.map_intent_score === 'number' ? listing.map_intent_score.toFixed(1) : '—'}`}
                        </p>
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        <button
                          type="button"
                          title={
                            selected ? 'Remove from compare' : 'Add to compare'
                          }
                          className={[
                            'flex h-9 w-9 items-center justify-center rounded-xl border shadow-sm transition-all duration-300 hover:scale-105 hover:shadow-md',
                            selected
                              ? 'border-teal-300 bg-teal-600 text-white hover:bg-teal-700'
                              : 'border-slate-200 bg-white text-slate-600 hover:border-teal-200 hover:text-teal-700',
                          ].join(' ')}
                          onClick={(e) => {
                            e.preventDefault()
                            e.stopPropagation()
                            toggleCompare({
                              id: listing.id,
                              name: listing.name || `Listing ${listing.id}`,
                            })
                          }}
                        >
                          <GitCompare className="h-4 w-4" aria-hidden />
                        </button>
                        <span className="rounded-lg bg-teal-50 px-2 py-1 text-sm font-semibold text-teal-800">
                          {formatListingPriceDisplay(listing.price_clean)}
                        </span>
                      </div>
                    </div>
                    <div className="absolute right-3 top-3 flex flex-col gap-2">
                      <button
                        type="button"
                        title={
                          userId
                            ? isFavorite(listing.id)
                              ? 'Remove from favorites'
                              : 'Add to favorites'
                            : 'Sign in to save favorites'
                        }
                        className={[
                          'flex h-9 w-9 items-center justify-center rounded-xl border shadow-sm backdrop-blur transition-all duration-300 hover:scale-105 hover:shadow-md',
                          isFavorite(listing.id)
                            ? 'border-amber-300 bg-amber-50 text-amber-500'
                            : 'border-white/80 bg-white/95 text-slate-600 hover:border-amber-200 hover:text-amber-600',
                        ].join(' ')}
                        onClick={(e) => {
                          e.preventDefault()
                          e.stopPropagation()
                          if (!userId) {
                            navigate('/guest-login')
                            return
                          }
                          toggleFavorite(listing.id).catch(() => {})
                        }}
                      >
                        <Star
                          className={[
                            'h-4 w-4',
                            isFavorite(listing.id) ? 'fill-current' : '',
                          ].join(' ')}
                          aria-hidden
                        />
                      </button>
                      <button
                        type="button"
                        title={
                          userId
                            ? isStayed(listing.id)
                              ? 'Manage stay review'
                              : 'Mark as stayed'
                            : 'Sign in to record stays'
                        }
                        className={[
                          'flex h-9 w-9 items-center justify-center rounded-xl border shadow-sm backdrop-blur transition-all duration-300 hover:scale-105 hover:shadow-md',
                          isStayed(listing.id)
                            ? 'border-teal-300 bg-teal-600 text-white hover:bg-teal-700'
                            : 'border-white/80 bg-white/95 text-slate-600 hover:border-teal-200 hover:text-teal-700',
                        ].join(' ')}
                        onClick={(e) => {
                          e.preventDefault()
                          e.stopPropagation()
                          if (!userId) {
                            navigate('/guest-login')
                            return
                          }
                          setStayIntentListing(listing)
                        }}
                      >
                        <CheckSquare className="h-4 w-4" aria-hidden />
                      </button>
                    </div>
                  </article>
                )
              })}
            {!isLoading && !error && rankedListings.length === 0 && (
              <div className="col-span-full rounded-2xl border border-slate-100 bg-slate-50 px-4 py-12 text-center text-sm text-slate-600">
                No listings found.
              </div>
            )}
          </div>

          {/* Pagination */}
          {!isLoading && totalCount > PAGE_SIZE && (
            <div className="mt-6 flex items-center justify-between">
              <p className="text-sm text-slate-500">
                Showing {Math.min((page - 1) * PAGE_SIZE + 1, totalCount)}–{Math.min(page * PAGE_SIZE, totalCount)} of {totalCount}
              </p>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page === 1}
                  className="flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 bg-white text-sm font-medium text-slate-700 shadow-sm transition-colors hover:border-teal-200 hover:text-teal-800 disabled:cursor-not-allowed disabled:opacity-40"
                  aria-label="Previous page"
                >
                  <Minus className="h-4 w-4" aria-hidden />
                </button>
                {Array.from({ length: Math.min(5, Math.ceil(totalCount / PAGE_SIZE)) }, (_, i) => {
                  const totalPages = Math.ceil(totalCount / PAGE_SIZE)
                  let pageNum
                  if (totalPages <= 5) {
                    pageNum = i + 1
                  } else if (page <= 3) {
                    pageNum = i + 1
                  } else if (page >= totalPages - 2) {
                    pageNum = totalPages - 4 + i
                  } else {
                    pageNum = page - 2 + i
                  }
                  return (
                    <button
                      key={pageNum}
                      type="button"
                      onClick={() => setPage(pageNum)}
                      className={[
                        'flex h-9 min-w-[2.25rem] items-center justify-center rounded-xl border px-3 text-sm font-medium shadow-sm transition-colors',
                        page === pageNum
                          ? 'border-teal-300 bg-teal-600 text-white shadow-sm'
                          : 'border-slate-200 bg-white text-slate-700 hover:border-teal-200 hover:text-teal-800',
                      ].join(' ')}
                      aria-label={`Page ${pageNum}`}
                      aria-current={page === pageNum ? 'page' : undefined}
                    >
                      {pageNum}
                    </button>
                  )
                })}
                <button
                  type="button"
                  onClick={() => setPage((p) => Math.min(Math.ceil(totalCount / PAGE_SIZE), p + 1))}
                  disabled={page >= Math.ceil(totalCount / PAGE_SIZE)}
                  className="flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 bg-white text-sm font-medium text-slate-700 shadow-sm transition-colors hover:border-teal-200 hover:text-teal-800 disabled:cursor-not-allowed disabled:opacity-40"
                  aria-label="Next page"
                >
                  <Plus className="h-4 w-4" aria-hidden />
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      <StayReviewIntentSheet
        isOpen={Boolean(stayIntentListing)}
        onClose={() => {
          if (!stayIntentConfirming && !stayIntentUnmarking) setStayIntentListing(null)
        }}
        listing={stayIntentListing}
        isStayed={Boolean(stayIntentListing && isStayed(stayIntentListing.id))}
        hasStayReview={Boolean(stayIntentListing && isStayReviewed(stayIntentListing.id))}
        confirming={stayIntentConfirming}
        unmarking={stayIntentUnmarking}
        onConfirmReview={async () => {
          const l = stayIntentListing
          if (!l || !userId) return
          setStayIntentConfirming(true)
          try {
            if (!isStayed(l.id)) {
              await toggleStayed(l.id)
              bumpStayDataEpoch()
              await refreshStaysFromServer()
            }
            setStayIntentListing(null)
            setReviewModalListing(l)
          } catch {
            // keep sheet open on failure
          } finally {
            setStayIntentConfirming(false)
          }
        }}
        onUnmarkStayed={async () => {
          const l = stayIntentListing
          if (!l || !userId || !isStayed(l.id)) return
          setStayIntentUnmarking(true)
          try {
            await toggleStayed(l.id)
            bumpStayDataEpoch()
            await refreshStaysFromServer()
            setStayIntentListing(null)
          } catch {
            // keep sheet open on failure
          } finally {
            setStayIntentUnmarking(false)
          }
        }}
      />

      <StayReviewModal
        isOpen={Boolean(reviewModalListing)}
        onClose={() => setReviewModalListing(null)}
        userId={userId}
        listing={reviewModalListing}
        onSaved={() => {
          const lid = reviewModalListing?.id
          setReviewModalListing(null)
          bumpStayDataEpoch()
          refreshStaysFromServer().catch(() => {})
          if (lid != null) syncListingFlags([lid]).catch(() => {})
        }}
      />

      {items.length > 0 && (
        <button
          type="button"
          onClick={() => navigate('/compare')}
          className="fixed bottom-6 right-6 z-40 flex items-center gap-2 rounded-full bg-teal-600 px-5 py-3.5 text-sm font-semibold text-white shadow-lg shadow-teal-600/30 transition-all duration-300 hover:-translate-y-1 hover:bg-teal-700 hover:shadow-xl"
        >
          <GitCompare className="h-4 w-4" aria-hidden />
          Compare ({items.length}{' '}
          {items.length === 1 ? 'item' : 'items'})
        </button>
      )}
    </div>
  )
}
