import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Search, X, Loader2 } from 'lucide-react'
import {
  Legend,
  PolarAngleAxis,
  PolarGrid,
  PolarRadiusAxis,
  Radar,
  RadarChart,
  ResponsiveContainer,
  Tooltip,
} from 'recharts'
import { useCompare } from '../context/CompareContext.jsx'
import { api } from '../services/api.js'
import { formatListingPriceDisplay } from '../utils/listingPriceDisplay.js'

const KEY_CHARS = ['a', 'b', 'c', 'd', 'e']

/**
 * Clamp and scale a value to 0–100 using a fixed absolute domain.
 * Using fixed domains means scores reflect real-world values rather than
 * relative rank within the current compare set (which would always produce
 * 0 and 100 for 2 items, or all-50 for 1 item).
 *
 * @param {number|null} value  Raw field value
 * @param {number} domainMin   Absolute minimum of the scale (maps to 0)
 * @param {number} domainMax   Absolute maximum of the scale (maps to 100)
 * @param {boolean} invert     If true, lower value → higher score (e.g. price)
 * @returns {number} Integer score 0–100
 */
function scaleToScore(value, domainMin, domainMax, invert = false) {
  if (value == null || !isFinite(value)) return 50
  const clamped = Math.max(domainMin, Math.min(domainMax, value))
  const ratio = (clamped - domainMin) / (domainMax - domainMin)
  return Math.round((invert ? 1 - ratio : ratio) * 100)
}

/**
 * Fixed absolute domains for each radar axis.
 * Chosen for real-world Airbnb data already in the database:
 *
 * Value      : price_clean inverted, capped at $600 so distribution isn't
 *              crushed at the cheap end (most listings are $50–$400).
 * Rating     : review_scores_rating 3.0–5.0 (Airbnb floor is ~3).
 * Popularity : number_of_reviews 0–500 (captures active vs quiet listings).
 * Amenities  : count of 6 boolean flags (wifi/kitchen/ac/parking/tv/balcony)
 *              → each flag = ~16.7 pts, no external domain needed.
 * Sentiment  : intelligent_score 0.0–1.0 (AI composite from reviews).
 */
const SCORE_DOMAINS = {
  Value:      { min: 0,   max: 600, invert: true  },
  Rating:     { min: 3.0, max: 5.0, invert: false },
  Popularity: { min: 0,   max: 500, invert: false },
  Amenities:  { min: 0,   max: 6,   invert: false },
  Sentiment:  { min: 0.0, max: 1.0, invert: false },
}

/**
 * Count how many of the 6 key amenity booleans are true for a listing.
 */
function amenityCount(l) {
  return [
    l.has_wifi,
    l.has_kitchen,
    l.has_air_conditioning,
    l.has_parking,
    l.has_tv,
    l.has_balcony,
  ].filter(Boolean).length
}

/**
 * Given an array of listing objects, compute per-dimension scores (0–100)
 * using fixed absolute domains.
 * Returns { [listingId]: { Value, Rating, Popularity, Amenities, Sentiment } }
 */
function computeScores(listings) {
  const result = {}
  for (const l of listings) {
    const price      = l.price_clean > 0 ? l.price_clean : null
    const rating     = l.review_scores_rating
    const popularity = l.number_of_reviews
    const amenities  = amenityCount(l)
    const sentiment  = l.intelligent_score ?? l.average_sentiment_score

    result[l.id] = {
      Value:      scaleToScore(price,      SCORE_DOMAINS.Value.min,      SCORE_DOMAINS.Value.max,      SCORE_DOMAINS.Value.invert),
      Rating:     scaleToScore(rating,     SCORE_DOMAINS.Rating.min,     SCORE_DOMAINS.Rating.max,     SCORE_DOMAINS.Rating.invert),
      Popularity: scaleToScore(popularity, SCORE_DOMAINS.Popularity.min, SCORE_DOMAINS.Popularity.max, SCORE_DOMAINS.Popularity.invert),
      Amenities:  scaleToScore(amenities,  SCORE_DOMAINS.Amenities.min,  SCORE_DOMAINS.Amenities.max,  SCORE_DOMAINS.Amenities.invert),
      Sentiment:  scaleToScore(sentiment,  SCORE_DOMAINS.Sentiment.min,  SCORE_DOMAINS.Sentiment.max,  SCORE_DOMAINS.Sentiment.invert),
    }
  }
  return result
}

const RADAR_AXES = ['Value', 'Rating', 'Popularity', 'Amenities', 'Sentiment']

export default function RadarCompare() {
  const { items: tray, removeFromCompare } = useCompare()
  const [listingDetails, setListingDetails] = useState({})
  const [loading, setLoading] = useState(false)

  // Fetch missing listing details whenever the tray changes
  useEffect(() => {
    if (tray.length === 0) return
    const missingIds = tray.map((t) => t.id).filter((id) => !listingDetails[id])
    if (missingIds.length === 0) return

    setLoading(true)
    Promise.all(missingIds.map((id) => api.getListingById(id).catch(() => null)))
      .then((results) => {
        setListingDetails((prev) => {
          const next = { ...prev }
          results.forEach((data, i) => {
            if (data) next[missingIds[i]] = data
          })
          return next
        })
      })
      .finally(() => setLoading(false))
  }, [tray])

  // Build array of loaded listings in tray order
  const loadedListings = tray
    .map((t) => listingDetails[t.id])
    .filter(Boolean)

  const scores = loadedListings.length > 0 ? computeScores(loadedListings) : {}

  const keys = tray.map((t, i) => ({
    key: KEY_CHARS[i],
    id: t.id,
    name: t.name,
    color: t.color,
  }))

  const chartData = RADAR_AXES.map((axis) => {
    const out = { metric: axis }
    keys.forEach((k) => {
      out[k.key] = scores[k.id]?.[axis] ?? 50
    })
    return out
  })

  // Table rows built from real data
  const tableRows = [
    {
      label: 'Price (nightly)',
      getValue: (l) => formatListingPriceDisplay(l?.price_clean),
    },
    {
      label: 'Rating',
      getValue: (l) =>
        l?.review_scores_rating != null ? l.review_scores_rating.toFixed(2) : '—',
    },
    {
      label: 'Reviews',
      getValue: (l) =>
        l?.number_of_reviews != null ? `${l.number_of_reviews}` : '—',
    },
    {
      label: 'Capacity',
      getValue: (l) =>
        l?.accommodates != null
          ? `${l.accommodates} guest${l.accommodates !== 1 ? 's' : ''}`
          : '—',
    },
    {
      label: 'Bedrooms',
      getValue: (l) => (l?.bedrooms != null ? `${l.bedrooms}` : '—'),
    },
    {
      label: 'Beds',
      getValue: (l) => (l?.beds != null ? `${l.beds}` : '—'),
    },
    {
      label: 'Bathrooms',
      getValue: (l) =>
        l?.bathrooms_text ?? (l?.bathrooms_num != null ? `${l.bathrooms_num}` : '—'),
    },
    {
      label: 'Room type',
      getValue: (l) => l?.room_type ?? '—',
    },
    {
      label: 'Neighbourhood',
      getValue: (l) => l?.neighbourhood_cleansed ?? '—',
    },
    {
      label: 'Sentiment score',
      getValue: (l) => {
        const s = l?.intelligent_score ?? l?.average_sentiment_score
        return s != null ? s.toFixed(3) : '—'
      },
    },
  ]

  if (tray.length === 0) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
            Compare properties
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Price, rating, capacity, room size, and sentiment — side by side.
          </p>
        </div>

        <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-slate-200 bg-slate-50/80 px-6 py-16 text-center">
          <p className="text-lg font-semibold text-slate-900">No properties selected</p>
          <p className="mt-2 max-w-md text-sm text-slate-600">
            Add listings from search to build a comparison. Your tray syncs here
            automatically.
          </p>
          <Link
            to="/search"
            className="mt-8 inline-flex items-center gap-2 rounded-2xl bg-teal-600 px-6 py-3 text-sm font-semibold text-white shadow-sm transition-all duration-300 hover:-translate-y-0.5 hover:bg-teal-700 hover:shadow-md"
          >
            <Search className="h-4 w-4" aria-hidden />
            Back to search
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
          Compare properties
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          Radar and table update live as you edit the tray.
        </p>
      </div>

      {/* Compare tray */}
      <section aria-label="Compare tray">
        <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-400">
          Compare tray
        </p>
        <div className="flex flex-wrap gap-3">
          {tray.map((p) => (
            <div
              key={p.id}
              className="inline-flex min-w-[140px] items-center gap-3 rounded-xl border border-slate-200 bg-white px-3 py-2.5 shadow-sm"
            >
              <span
                className="h-8 w-8 shrink-0 rounded-lg ring-2 ring-white"
                style={{ backgroundColor: p.color }}
                aria-hidden
              />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-slate-900">
                  {p.name}
                </p>
                <p className="text-xs text-slate-500">ID {p.id}</p>
              </div>
              <button
                type="button"
                onClick={() => removeFromCompare(p.id)}
                className="shrink-0 rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-800"
                aria-label={`Remove ${p.name}`}
              >
                <X className="h-4 w-4" aria-hidden />
              </button>
            </div>
          ))}
        </div>
      </section>

      {/* Radar chart */}
      <section className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm sm:p-6">
        <div className="mb-4 flex items-center justify-between">
          <p className="text-sm font-medium text-slate-700">
            Multi-axis radar (normalized 0–100)
          </p>
          {loading && (
            <span className="flex items-center gap-1.5 text-xs text-slate-400">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              Loading data…
            </span>
          )}
        </div>
        <div className="h-[340px] w-full sm:h-[400px]">
          <ResponsiveContainer width="100%" height="100%">
            <RadarChart cx="50%" cy="50%" outerRadius="75%" data={chartData}>
              <PolarGrid stroke="#e2e8f0" />
              <PolarAngleAxis
                dataKey="metric"
                tick={{ fill: '#64748b', fontSize: 11 }}
              />
              <PolarRadiusAxis angle={30} domain={[0, 100]} tick={false} />
              <Tooltip
                formatter={(value, name) => [`${value}`, name]}
                contentStyle={{
                  borderRadius: '12px',
                  border: '1px solid #f1f5f9',
                  boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.08)',
                }}
              />
              {keys.map((k) => (
                <Radar
                  key={k.key}
                  name={k.name}
                  dataKey={k.key}
                  stroke={k.color}
                  fill={k.color}
                  fillOpacity={0.4}
                  strokeWidth={2}
                />
              ))}
              <Legend
                wrapperStyle={{ paddingTop: 16 }}
                formatter={(value) => (
                  <span className="text-xs text-slate-600">{value}</span>
                )}
              />
            </RadarChart>
          </ResponsiveContainer>
        </div>
        <p className="mt-2 text-center text-xs text-slate-400">
          Value is inverted from price — higher score = more affordable. Amenities = count of 6 key facilities.
        </p>
      </section>

      {/* Detailed comparison table */}
      <section className="overflow-hidden rounded-2xl border border-slate-100 bg-white shadow-sm">
        <div className="border-b border-slate-100 bg-slate-50/90 px-4 py-3 sm:px-6">
          <h2 className="text-sm font-semibold text-slate-900">Detailed comparison</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[520px] border-collapse text-left text-sm">
            <thead>
              <tr className="border-b border-slate-100 text-xs font-semibold uppercase tracking-wide text-slate-500">
                <th className="whitespace-nowrap px-4 py-3 sm:px-6">Metric</th>
                {tray.map((p) => (
                  <th key={p.id} className="whitespace-nowrap px-4 py-3 sm:px-6">
                    <span className="inline-flex items-center gap-2 font-semibold text-slate-900">
                      <span
                        className="h-2 w-2 rounded-full"
                        style={{ backgroundColor: p.color }}
                      />
                      {p.name}
                    </span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {tableRows.map((row, idx) => (
                <tr
                  key={row.label}
                  className={idx % 2 === 1 ? 'bg-slate-50' : 'bg-white'}
                >
                  <td className="border-t border-slate-100 px-4 py-3 text-slate-600 sm:px-6">
                    {row.label}
                  </td>
                  {tray.map((p) => (
                    <td
                      key={p.id}
                      className="border-t border-slate-100 px-4 py-3 font-medium text-slate-900 sm:px-6"
                    >
                      {loading && !listingDetails[p.id]
                        ? <span className="text-slate-300">…</span>
                        : row.getValue(listingDetails[p.id])}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  )
}