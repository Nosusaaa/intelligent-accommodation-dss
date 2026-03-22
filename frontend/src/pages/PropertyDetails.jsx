import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import {
  ArrowLeft,
  BedDouble,
  DollarSign,
  MapPin,
  MessageCircle,
  Sparkles,
  Star,
  X,
} from 'lucide-react'
import { api } from '../services/api.js'
import { formatListingPriceDisplay } from '../utils/listingPriceDisplay.js'
import {
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
} from 'recharts'


const GALLERY_IMAGES = [
  'https://images.unsplash.com/photo-1618773928121-c32242e63f39?w=1600&q=80',
  'https://images.unsplash.com/photo-1566073771259-6a8506099945?w=1600&q=80',
  'https://images.unsplash.com/photo-1522708323590-d24dbb6b0267?w=1600&q=80',
  'https://images.unsplash.com/photo-1502672260266-1c1ef2d93688?w=1600&q=80',
]

const SENTIMENT_FILLS = {
  Positive: '#0d9488',
  Neutral: '#94a3b8',
  Negative: '#fb7185',
}

/** Parse pipe-separated vibe_tags string from API into an array of tag strings. */
function parseVibeTags(raw) {
  if (!raw) return []
  return raw
    .split('|')
    .map((t) => t.trim())
    .filter(Boolean)
}

/** Strip HTML tags for safe text display; turn &lt;br&gt; into newlines. */
function stripHtmlForDisplay(raw) {
  if (raw == null) return ''
  let s = String(raw)
  s = s.replace(/<br\s*\/?>/gi, '\n')
  s = s.replace(/<[^>]+>/g, '')
  s = s
    .replace(/&nbsp;/g, ' ')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
  return s.trim()
}

function formatReviewDate(iso) {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return String(iso)
  return d.toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
}

/** Map API/legacy rows to one of Positive | Neutral | Negative (ETL uses these exact strings). */
function normalizeSentimentLabel(label) {
  if (label === 'Positive' || label === 'Neutral' || label === 'Negative') {
    return label
  }
  return 'Neutral'
}

function safeSentimentPercent(count, total) {
  const c = Number(count)
  const t = Number(total)
  if (!(t > 0) || !Number.isFinite(c) || !Number.isFinite(t)) return 0
  const p = Math.round((c / t) * 100)
  return Number.isFinite(p) ? p : 0
}

export default function PropertyDetails() {
  const navigate = useNavigate()
  const { id } = useParams()
  const propertyId = id ?? '123'
  const numericListingId = useMemo(() => {
    const n = parseInt(String(id ?? ''), 10)
    return Number.isFinite(n) ? n : NaN
  }, [id])

  const [listing, setListing] = useState(null)
  const [listingLoading, setListingLoading] = useState(true)

  const [reviews, setReviews] = useState([])
  const [reviewsLoading, setReviewsLoading] = useState(false)
  const [reviewsError, setReviewsError] = useState(null)

  const positiveReviews = useMemo(
    () =>
      reviews.filter((r) => normalizeSentimentLabel(r.sentiment_label) === 'Positive'),
    [reviews],
  )
  const neutralReviews = useMemo(
    () =>
      reviews.filter((r) => normalizeSentimentLabel(r.sentiment_label) === 'Neutral'),
    [reviews],
  )
  const negativeReviews = useMemo(
    () =>
      reviews.filter((r) => normalizeSentimentLabel(r.sentiment_label) === 'Negative'),
    [reviews],
  )

  const sentimentChart = useMemo(() => {
    if (reviewsLoading) {
      return { rows: null, sourceLabel: '', hasData: false, loading: true }
    }
    const totalAnalyzed =
      positiveReviews.length + neutralReviews.length + negativeReviews.length
    if (totalAnalyzed > 0) {
      const rows = [
        {
          name: 'Positive',
          value: safeSentimentPercent(positiveReviews.length, totalAnalyzed),
          fill: SENTIMENT_FILLS.Positive,
        },
        {
          name: 'Neutral',
          value: safeSentimentPercent(neutralReviews.length, totalAnalyzed),
          fill: SENTIMENT_FILLS.Neutral,
        },
        {
          name: 'Negative',
          value: safeSentimentPercent(negativeReviews.length, totalAnalyzed),
          fill: SENTIMENT_FILLS.Negative,
        },
      ]
      return {
        rows,
        sourceLabel:
          'Precomputed RoBERTa sentiment (3-class) — share of loaded reviews',
        hasData: true,
        loading: false,
      }
    }
    return {
      rows: [{ name: 'No Data', value: 100, fill: '#cbd5e1' }],
      sourceLabel: 'No reviews to analyze yet',
      hasData: false,
      loading: false,
    }
  }, [
    positiveReviews,
    neutralReviews,
    negativeReviews,
    reviewsLoading,
  ])

  const [activeImage, setActiveImage] = useState(0)
  const [reviewsOpen, setReviewsOpen] = useState(false)
  const [reviewTab, setReviewTab] = useState('positive')

  useEffect(() => {
    if (!Number.isFinite(numericListingId)) {
      setListing(null)
      setListingLoading(false)
      setReviews([])
      setReviewsError(null)
      return
    }

    let cancelled = false

    async function loadListing() {
      setListingLoading(true)
      try {
        const data = await api.getListingById(numericListingId)
        if (!cancelled) setListing(data)
      } catch {
        if (!cancelled) setListing(null)
      } finally {
        if (!cancelled) setListingLoading(false)
      }
    }

    loadListing()
    return () => {
      cancelled = true
    }
  }, [numericListingId])

  useEffect(() => {
    if (!Number.isFinite(numericListingId)) {
      setReviews([])
      setReviewsError(null)
      return
    }

    let cancelled = false

    async function loadReviews() {
      setReviewsLoading(true)
      setReviewsError(null)
      try {
        const data = await api.getListingReviews(numericListingId)
        if (!cancelled) {
          setReviews(Array.isArray(data) ? data : [])
        }
      } catch (err) {
        if (!cancelled) {
          setReviewsError(
            err?.response?.data?.detail ||
              err?.message ||
              'Failed to load reviews',
          )
          setReviews([])
        }
      } finally {
        if (!cancelled) {
          setReviewsLoading(false)
        }
      }
    }

    loadReviews()
    return () => {
      cancelled = true
    }
  }, [numericListingId])

  useEffect(() => {
    if (!reviewsOpen) return
    const onKey = (e) => {
      if (e.key === 'Escape') setReviewsOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [reviewsOpen])

  return (
    <div className="space-y-8">
      <div className="flex items-center gap-3">
        <Link
          to="/search"
          className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 shadow-sm transition-all duration-300 hover:-translate-y-0.5 hover:border-teal-200 hover:text-teal-800 hover:shadow-md"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden />
          Back to Search
        </Link>
      </div>

      <div className="overflow-hidden rounded-2xl border border-slate-100 bg-white shadow-sm">
        <div className="relative aspect-[21/9] max-h-[420px] w-full">
          <img
            src={GALLERY_IMAGES[activeImage]}
            alt=""
            className="h-full w-full object-cover"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-slate-950/60 via-transparent to-transparent" />
          <div className="absolute bottom-0 left-0 p-6 sm:p-8">
            <p className="text-sm font-medium text-white/80">
              Listing #{propertyId}
            </p>
            <h1 className="mt-1 text-3xl font-bold tracking-tight text-white sm:text-4xl">
              {listingLoading
                ? 'Loading…'
                : listing?.name || 'Azure Pier Residence'}
            </h1>
          </div>
        </div>
        <div className="flex gap-2 overflow-x-auto border-t border-slate-100 bg-slate-50/80 p-3 sm:p-4">
          {GALLERY_IMAGES.map((src, i) => (
            <button
              key={src}
              type="button"
              onClick={() => setActiveImage(i)}
              className={[
                'relative h-16 w-24 shrink-0 overflow-hidden rounded-lg ring-2 ring-offset-2 transition-all',
                activeImage === i
                  ? 'ring-teal-600 ring-offset-white'
                  : 'ring-transparent opacity-80 hover:opacity-100',
              ].join(' ')}
              aria-label={`View image ${i + 1}`}
            >
              <img src={src} alt="" className="h-full w-full object-cover" />
            </button>
          ))}
        </div>
      </div>

      <div className="grid gap-8 lg:grid-cols-2">
        <div className="space-y-6">
          <section className="rounded-2xl border border-slate-100 bg-white p-6 shadow-sm sm:p-8">
            <h2 className="text-lg font-semibold text-slate-900">
              Property details
            </h2>
            <p className="mt-3 whitespace-pre-line text-slate-600 leading-relaxed">
              {listingLoading
                ? 'Loading…'
                : stripHtmlForDisplay(listing?.description) ||
                  'No description provided by the host.'}
            </p>
            <ul className="mt-6 grid gap-3 sm:grid-cols-2">
              <li className="flex items-center gap-2 text-sm text-slate-700">
                <MapPin className="h-4 w-4 shrink-0 text-teal-600" aria-hidden />
                {listingLoading
                  ? 'Loading…'
                  : listing?.neighbourhood_cleansed || 'Rochester'}
              </li>
              <li className="flex items-center gap-2 text-sm text-slate-700">
                <DollarSign className="h-4 w-4 shrink-0 text-teal-600" aria-hidden />
                {listingLoading
                  ? 'Loading…'
                  : `${formatListingPriceDisplay(listing?.price_clean)} / night`}
              </li>
              <li className="flex items-center gap-2 text-sm text-slate-700">
                <BedDouble className="h-4 w-4 shrink-0 text-teal-600" aria-hidden />
                {listingLoading
                  ? 'Loading…'
                  : `${listing?.bedrooms ?? 0} bedrooms · ${listing?.bathrooms_num ?? listing?.bathrooms ?? 0} baths`}
              </li>
              <li className="flex items-center gap-2 text-sm text-slate-700">
                <Star className="h-4 w-4 shrink-0 text-amber-500" aria-hidden />
                {listingLoading
                  ? 'Loading…'
                  : (() => {
                      const rating = listing?.review_scores_rating
                      const n = listing?.number_of_reviews ?? 0
                      const label =
                        rating != null && Number.isFinite(Number(rating))
                          ? `${Number(rating).toFixed(2)}`
                          : 'New'
                      return `${label} guest rating (${n} reviews)`
                    })()}
              </li>
            </ul>
          </section>
        </div>

        <div className="space-y-6">
          <section className="rounded-2xl border border-slate-100 bg-white p-6 shadow-sm sm:p-8">
            <div className="flex items-center gap-2 text-teal-700">
              <Sparkles className="h-5 w-5" aria-hidden />
              <h2 className="text-lg font-semibold text-slate-900">
                AI Sentiment Analysis
              </h2>
            </div>
            <p className="mt-1 text-sm text-slate-500">
              {sentimentChart.sourceLabel
                ? `${sentimentChart.sourceLabel}.`
                : 'Sentiment share from precomputed RoBERTa labels.'}
            </p>

            <div className="relative mt-5 h-52 w-full">
              {sentimentChart.loading ? (
                <div className="flex h-full items-center justify-center rounded-xl border border-dashed border-slate-200 bg-slate-50/80 text-sm text-slate-600">
                  Loading reviews for sentiment chart…
                </div>
              ) : sentimentChart.hasData ? (
                <>
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={sentimentChart.rows}
                        cx="50%"
                        cy="50%"
                        innerRadius="52%"
                        outerRadius="78%"
                        paddingAngle={3}
                        dataKey="value"
                        strokeWidth={0}
                      >
                        {sentimentChart.rows.map((entry) => (
                          <Cell key={entry.name} fill={entry.fill} />
                        ))}
                      </Pie>
                      <Tooltip
                        formatter={(value, _name, props) => [
                          `${value}%`,
                          props.payload.name,
                        ]}
                        contentStyle={{
                          borderRadius: '10px',
                          border: '1px solid #f1f5f9',
                          boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.08)',
                          fontSize: '13px',
                        }}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                  {/* Centre label */}
                  <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center">
                    <span className="text-2xl font-bold tabular-nums text-slate-800">
                      {sentimentChart.rows[0].value}%
                    </span>
                    <span className="mt-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                      Positive
                    </span>
                  </div>
                  {/* Legend */}
                  <div className="absolute bottom-0 left-0 right-0 flex justify-center gap-4">
                    {sentimentChart.rows.map((entry) => (
                      <div key={entry.name} className="flex items-center gap-1.5">
                        <span
                          className="inline-block h-2.5 w-2.5 rounded-full"
                          style={{ backgroundColor: entry.fill }}
                        />
                        <span className="text-xs text-slate-600">
                          {entry.name}{' '}
                          <span className="font-semibold tabular-nums">{entry.value}%</span>
                        </span>
                      </div>
                    ))}
                  </div>
                </>
              ) : (
                <div className="flex h-full items-center justify-center rounded-xl border border-dashed border-slate-200 bg-slate-50/80 text-sm text-slate-600">
                  No reviews to analyze yet
                </div>
              )}
            </div>

            {listing?.vibe_tags && (
              <div className="mt-4 flex flex-wrap gap-2">
                {parseVibeTags(listing.vibe_tags).map((tag) => (
                  <span
                    key={tag}
                    className="rounded-full bg-teal-50 px-3 py-1 text-xs font-semibold text-teal-800 ring-1 ring-teal-100"
                  >
                    {tag}
                  </span>
                ))}
              </div>
            )}

            <button
              type="button"
              onClick={() => setReviewsOpen(true)}
              className="mt-6 w-full rounded-xl border border-teal-200 bg-teal-50/80 px-4 py-3 text-sm font-semibold text-teal-900 shadow-sm transition-all hover:bg-teal-100"
            >
              Read Extracted Reviews
            </button>
          </section>

          <div className="rounded-xl bg-teal-50 p-4 text-teal-900 shadow-sm ring-1 ring-teal-100/80">
            <h3 className="text-sm font-semibold">Why recommended</h3>
            <ul className="mt-3 list-inside list-disc space-y-1.5 text-sm leading-relaxed text-teal-800/90">
              <li>Strong match to your quiet + walkable preferences</li>
              <li>Price sits below similar waterfront comps</li>
              <li>Sentiment skews positive on cleanliness and location</li>
            </ul>
          </div>

          <button
            type="button"
            onClick={() => navigate(`/forecast/${propertyId}`)}
            className="w-full rounded-2xl bg-teal-600 px-5 py-3.5 text-sm font-semibold text-white shadow-sm transition-all duration-300 hover:-translate-y-1 hover:bg-teal-700 hover:shadow-md"
          >
            View Price Forecast
          </button>
        </div>
      </div>

      {reviewsOpen && (
        <div
          className="fixed inset-0 z-[100] flex flex-col items-stretch justify-center bg-slate-900/50 p-0 backdrop-blur-sm sm:p-4"
          role="presentation"
          onClick={() => setReviewsOpen(false)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="reviews-modal-title"
            className="flex h-full min-h-0 flex-col bg-white shadow-2xl sm:mx-auto sm:h-auto sm:max-h-[calc(100vh-3rem)] sm:min-h-0 sm:max-w-2xl sm:rounded-2xl sm:border sm:border-slate-200"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex shrink-0 items-start justify-between gap-4 border-b border-slate-100 px-4 py-4 sm:px-6">
              <div className="min-w-0 flex-1">
                <h2
                  id="reviews-modal-title"
                  className="text-lg font-semibold text-slate-900"
                >
                  Extracted reviews
                </h2>
                <p className="mt-0.5 text-xs text-slate-500">
                  Precomputed sentiment labels · Listing #{propertyId}
                </p>
                <div
                  className="mt-4 flex flex-wrap gap-1 rounded-xl bg-slate-100 p-1"
                  role="tablist"
                  aria-label="Review sentiment"
                >
                  <button
                    type="button"
                    role="tab"
                    aria-selected={reviewTab === 'positive'}
                    onClick={() => setReviewTab('positive')}
                    className={[
                      'rounded-lg px-3 py-2 text-sm font-semibold transition-all sm:px-4',
                      reviewTab === 'positive'
                        ? 'bg-white text-slate-900 shadow-sm'
                        : 'text-slate-600 hover:text-slate-900',
                    ].join(' ')}
                  >
                    Positive ({positiveReviews.length})
                  </button>
                  <button
                    type="button"
                    role="tab"
                    aria-selected={reviewTab === 'neutral'}
                    onClick={() => setReviewTab('neutral')}
                    className={[
                      'rounded-lg px-3 py-2 text-sm font-semibold transition-all sm:px-4',
                      reviewTab === 'neutral'
                        ? 'bg-white text-slate-900 shadow-sm'
                        : 'text-slate-600 hover:text-slate-900',
                    ].join(' ')}
                  >
                    Neutral ({neutralReviews.length})
                  </button>
                  <button
                    type="button"
                    role="tab"
                    aria-selected={reviewTab === 'negative'}
                    onClick={() => setReviewTab('negative')}
                    className={[
                      'rounded-lg px-3 py-2 text-sm font-semibold transition-all sm:px-4',
                      reviewTab === 'negative'
                        ? 'bg-white text-slate-900 shadow-sm'
                        : 'text-slate-600 hover:text-slate-900',
                    ].join(' ')}
                  >
                    Negative ({negativeReviews.length})
                  </button>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setReviewsOpen(false)}
                className="shrink-0 rounded-xl p-2 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-800"
                aria-label="Close"
              >
                <X className="h-6 w-6" aria-hidden />
              </button>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-6 sm:py-5">
              {reviewsLoading && (
                <p className="py-8 text-center text-sm text-slate-600">
                  Loading reviews…
                </p>
              )}
              {!reviewsLoading && reviewsError && (
                <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
                  {reviewsError}
                </p>
              )}
              {!reviewsLoading &&
                !reviewsError &&
                reviewTab === 'positive' && (
                  <ul className="space-y-4">
                    {positiveReviews.length === 0 ? (
                      <li className="rounded-xl border border-dashed border-slate-200 bg-slate-50/80 px-4 py-8 text-center text-sm text-slate-600">
                        No positive reviews for this listing.
                      </li>
                    ) : (
                      positiveReviews.map((r) => (
                        <li
                          key={r.id}
                          className="rounded-xl border border-slate-100 border-l-4 border-l-teal-500 bg-slate-50/50 px-4 py-4 shadow-sm"
                        >
                          <div className="flex flex-wrap items-baseline justify-between gap-2">
                            <span className="font-semibold text-slate-900">
                              {r.reviewer_name || 'Guest'}
                            </span>
                            <span className="text-xs text-slate-500">
                              {formatReviewDate(r.review_date)}
                            </span>
                          </div>
                          <p className="mt-2 text-sm leading-relaxed text-slate-700">
                            {r.review_text_cleaned || '—'}
                          </p>
                        </li>
                      ))
                    )}
                  </ul>
                )}
              {!reviewsLoading &&
                !reviewsError &&
                reviewTab === 'neutral' && (
                  <ul className="space-y-4">
                    {neutralReviews.length === 0 ? (
                      <li className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-slate-200/90 bg-gradient-to-b from-slate-50 to-white px-6 py-12 text-center shadow-sm">
                        <div className="flex h-14 w-14 items-center justify-center rounded-full bg-slate-100 text-slate-400 ring-4 ring-slate-50">
                          <MessageCircle
                            className="h-7 w-7"
                            strokeWidth={1.75}
                            aria-hidden
                          />
                        </div>
                        <div>
                          <p className="text-base font-semibold text-slate-800">
                            No neutral reviews found for this property.
                          </p>
                          <p className="mt-2 max-w-sm text-sm leading-relaxed text-slate-500">
                            Neutral is assigned by the offline 3-class English
                            model; empty review text is stored as neutral.
                          </p>
                        </div>
                      </li>
                    ) : (
                      neutralReviews.map((r) => (
                        <li
                          key={r.id}
                          className="rounded-xl border border-slate-100 border-l-4 border-l-slate-400 bg-slate-50/50 px-4 py-4 shadow-sm"
                        >
                          <div className="flex flex-wrap items-baseline justify-between gap-2">
                            <span className="font-semibold text-slate-900">
                              {r.reviewer_name || 'Guest'}
                            </span>
                            <span className="text-xs text-slate-500">
                              {formatReviewDate(r.review_date)}
                            </span>
                          </div>
                          <p className="mt-2 text-sm leading-relaxed text-slate-700">
                            {r.review_text_cleaned || '—'}
                          </p>
                        </li>
                      ))
                    )}
                  </ul>
                )}
              {!reviewsLoading &&
                !reviewsError &&
                reviewTab === 'negative' && (
                  <ul className="space-y-4">
                    {negativeReviews.length === 0 ? (
                      <li className="rounded-xl border border-dashed border-slate-200 bg-slate-50/80 px-4 py-8 text-center text-sm text-slate-600">
                        No negative reviews for this listing.
                      </li>
                    ) : (
                      negativeReviews.map((r) => (
                        <li
                          key={r.id}
                          className="rounded-xl border border-slate-100 border-l-4 border-l-orange-400 bg-slate-50/50 px-4 py-4 shadow-sm"
                        >
                          <div className="flex flex-wrap items-baseline justify-between gap-2">
                            <span className="font-semibold text-slate-900">
                              {r.reviewer_name || 'Guest'}
                            </span>
                            <span className="text-xs text-slate-500">
                              {formatReviewDate(r.review_date)}
                            </span>
                          </div>
                          <p className="mt-2 text-sm leading-relaxed text-slate-700">
                            {r.review_text_cleaned || '—'}
                          </p>
                        </li>
                      ))
                    )}
                  </ul>
                )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
