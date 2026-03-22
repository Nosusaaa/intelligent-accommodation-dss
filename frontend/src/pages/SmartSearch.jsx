import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { GitCompare, MapPin, Minus, Plus, Search, Tag, X } from 'lucide-react'
import { useCompare } from '../context/CompareContext.jsx'
import { api } from '../services/api.js'

/** Canonical segments from `Data/room_tags.csv` → `listing_tags.vibe_tags` (pipe-separated). */
const SUGGESTED_TAGS = [
  'Above & Beyond',
  'Artistic & Curated',
  'Climate Comfort',
  'Cozy & Homey',
  'Exceptional Host',
  'Fully Equipped',
  'General Stay',
  'Highly Walkable',
  'Historic Charm',
  'Modern & Updated',
  'Outdoor Oasis',
  'Pet Friendly',
  'Prime Location',
  'Responsive & Clear',
  'Safe & Quiet',
  'Spacious & Bright',
  'Spotless & Pristine',
  'Transit Friendly',
  'Value for Money',
  'Work-Friendly',
]

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

const priceBubbles = [
  { label: '$156', left: '12%', top: '58%' },
  { label: '$212', left: '44%', top: '32%' },
  { label: '$289', left: '68%', top: '48%' },
  { label: '$178', left: '78%', top: '72%' },
]

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
  selectedTags,
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
  if (selectedTags && selectedTags.size > 0) {
    params.vibe_tags = Array.from(selectedTags)
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
  const { items, toggleCompare, isInCompare } = useCompare()

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

  const [page, setPage] = useState(1)
  const PAGE_SIZE = 12

  // Derive tags from search query
  const queryExtractedTags = useMemo(
    () => extractTagsFromQuery(searchQuery, SUGGESTED_TAGS),
    [searchQuery],
  )

  // Merge manually selected tags + query-extracted tags
  const allActiveTags = useMemo(() => {
    return new Set([...selectedTags, ...queryExtractedTags])
  }, [selectedTags, queryExtractedTags])

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

  // Remove a tag (works for both manual and query-extracted tags)
  const removeTag = useCallback(
    (tag) => {
      // If it's a query-extracted tag, clear the search
      if (queryExtractedTags.includes(tag)) {
        setInputValue('')
        setSearchQuery('')
      } else {
        setSelectedTags((prev) => {
          const next = new Set(prev)
          next.delete(tag)
          return next
        })
      }
    },
    [queryExtractedTags],
  )

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
    let a = clampInt(nextMin, 0, 2000)
    let b = clampInt(nextMax, 0, 2000)
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

  useEffect(() => {
    let cancelled = false

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
          selectedTags: allActiveTags,
          page,
          limit: PAGE_SIZE,
        })
        const data = await api.getListings(query)
        if (!cancelled) {
          // Backend returns { listings: [...], total, skip, limit }
          const arr = Array.isArray(data)
            ? data
            : Array.isArray(data?.listings)
              ? data.listings
              : []
          const total = Number.isFinite(data?.total) ? data.total : arr.length
          setListings(arr)
          setTotalCount(total)
          // Reset to page 1 when filters change
          if (page !== 1) {
            setPage(1)
          }
        }
      } catch (err) {
        if (!cancelled) {
          setError(
            err?.response?.data?.detail ||
              err?.message ||
              'Failed to load listings',
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
  }, [
    guests,
    bedrooms,
    beds,
    bathrooms,
    priceMin,
    priceMax,
    roomTypes,
    amenities,
    allActiveTags,
    page,
  ])

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
                Stay dates
              </h3>
              <div className="mt-2 grid grid-cols-2 gap-2">
                <input
                  type="date"
                  className="w-full rounded-xl border border-slate-200 bg-slate-50/80 px-3 py-2.5 text-sm text-slate-800 shadow-sm outline-none focus:border-teal-200 focus:ring-2 focus:ring-teal-600/20"
                />
                <input
                  type="date"
                  className="w-full rounded-xl border border-slate-200 bg-slate-50/80 px-3 py-2.5 text-sm text-slate-800 shadow-sm outline-none focus:border-teal-200 focus:ring-2 focus:ring-teal-600/20"
                />
              </div>
            </div>

            <div className="border-t border-slate-100 pt-4">
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
                    max={2000}
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
                    max={2000}
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
                    max={2000}
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
                    max={2000}
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
          <div className="relative">
            <Search
              className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400"
              aria-hidden
            />
            <input
              id="command-search"
              type="search"
              placeholder="Search neighborhoods, vibes, transit…"
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

          {/* Active tags from search query */}
          {queryExtractedTags.length > 0 && (
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

          <div className="mt-3">
            <p className="mb-2 text-[11px] font-bold uppercase tracking-wide text-slate-500">
              Suggested tags
            </p>
            <div className="-mx-1 flex flex-wrap gap-2 overflow-x-auto pb-1 pt-0.5">
              {SUGGESTED_TAGS.map((tag) => {
                const isSelected = allActiveTags.has(tag)
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
          </div>
        </div>

        <div className="relative min-h-[220px] overflow-hidden rounded-2xl bg-slate-200 shadow-inner sm:min-h-[280px]">
          <div
            className="absolute inset-0 opacity-40"
            style={{
              backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%2394a3b8' fill-opacity='0.25'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")`,
            }}
          />
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="rounded-2xl border border-white/60 bg-white/90 px-4 py-2 text-sm font-medium text-slate-600 shadow-sm backdrop-blur">
              <MapPin className="mr-2 inline h-4 w-4 text-teal-600" aria-hidden />
              Map preview — listings update as you filter
            </div>
          </div>
          {priceBubbles.map((b) => (
            <span
              key={`${b.left}-${b.top}`}
              className="absolute z-10 rounded-full bg-teal-600 px-2.5 py-1 text-xs font-bold text-white shadow-md ring-2 ring-white/90"
              style={{ left: b.left, top: b.top }}
            >
              {b.label}
            </span>
          ))}
        </div>

        <div>
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-lg font-semibold text-slate-900">
              Matching stays
            </h2>
            <span className="text-sm text-slate-500">
              {isLoading ? '…' : `${totalCount} results`}
            </span>
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
              listings.map((listing) => {
                const selected = isInCompare(listing.id)
                const price =
                  listing.price_clean != null && !Number.isNaN(Number(listing.price_clean))
                    ? Number(listing.price_clean)
                    : null
                const vibePills = parseVibeTags(listing.vibe_tags)
                return (
                  <article
                    key={listing.id}
                    className="group relative overflow-hidden rounded-2xl border border-slate-100 bg-white shadow-sm transition-all duration-300 hover:-translate-y-1 hover:shadow-md"
                  >
                    <Link to={`/details/${listing.id}`} className="block">
                      <div className="relative aspect-[16/10] overflow-hidden">
                        <img
                          src={listing.picture_url || PLACEHOLDER_IMAGE}
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
                      <p className="text-xs text-slate-400">
                        Sentiment {formatSentimentScore(listing.average_sentiment_score)}
                      </p>
                      <span className="shrink-0 rounded-lg bg-teal-50 px-2 py-1 text-sm font-semibold text-teal-800">
                        {price != null ? `$${price}` : '—'}
                      </span>
                    </div>
                    <button
                      type="button"
                      title={
                        selected ? 'Remove from compare' : 'Add to compare'
                      }
                      className={[
                        'absolute right-3 top-3 flex h-9 w-9 items-center justify-center rounded-xl border shadow-sm backdrop-blur transition-all duration-300 hover:scale-105 hover:shadow-md',
                        selected
                          ? 'border-teal-300 bg-teal-600 text-white hover:bg-teal-700'
                          : 'border-white/80 bg-white/95 text-slate-600 hover:border-teal-200 hover:text-teal-700',
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
                  </article>
                )
              })}
            {!isLoading && !error && listings.length === 0 && (
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
