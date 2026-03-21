import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { GitCompare, MapPin, Minus, Plus, Search } from 'lucide-react'
import { useCompare } from '../context/CompareContext.jsx'
import { api } from '../services/api.js'

const SUGGESTED_TAGS = [
  'Location & Accessibility',
  'Atmosphere & Style',
  'Cleanliness & Condition',
  'Host Hospitality',
  'Key Amenities',
  'Outdoor & Views',
  'Value & Practicality',
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

/** Up to 3 vibe labels from pipe-separated tags (matches `listing_tags` / room_tags). */
function parseVibeTags(raw) {
  if (!raw || typeof raw !== 'string') return []
  return raw
    .split('|')
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 3)
}

/** `average_sentiment_score` is typically 0–1; show as percent. */
function formatSentimentScore(value) {
  if (value == null || value === '') return '—'
  const n = Number(value)
  if (Number.isNaN(n)) return '—'
  const pct = n <= 1 ? n * 100 : n
  return `${pct.toFixed(2)}%`
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
}) {
  const params = {
    min_price: priceMin,
    max_price: priceMax,
    guests,
    bedrooms,
    beds,
    bathrooms,
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
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState(null)

  const [guests, setGuests] = useState(2)
  const [bedrooms, setBedrooms] = useState(1)
  const [beds, setBeds] = useState(2)
  const [bathrooms, setBathrooms] = useState(1)

  const [priceMin, setPriceMin] = useState(80)
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

  const toggleTag = useCallback((tag) => {
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
        })
        const data = await api.getListings(query)
        if (!cancelled) {
          setListings(Array.isArray(data) ? data : [])
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
              className="w-full rounded-2xl border border-slate-100 bg-white py-3.5 pl-12 pr-4 text-sm text-slate-900 shadow-sm outline-none ring-teal-600/20 transition-all placeholder:text-slate-400 focus:border-teal-200 focus:ring-4"
            />
          </div>

          <div className="mt-3">
            <p className="mb-2 text-[11px] font-bold uppercase tracking-wide text-slate-500">
              Suggested tags
            </p>
            <div className="-mx-1 flex gap-2 overflow-x-auto pb-1 pt-0.5">
              {SUGGESTED_TAGS.map((tag) => {
                const active = selectedTags.has(tag)
                return (
                  <button
                    key={tag}
                    type="button"
                    onClick={() => toggleTag(tag)}
                    className={[
                      'shrink-0 rounded-full border px-2.5 py-1 text-[11px] font-medium transition-all',
                      active
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
              {isLoading ? '…' : `${listings.length} results`}
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
