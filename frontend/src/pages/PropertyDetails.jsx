import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import {
  ArrowLeft,
  BedDouble,
  ChevronDown,
  DollarSign,
  MapPin,
  MessageCircle,
  Sparkles,
  Star,
  X,
} from 'lucide-react'
import StayReviewModal from '../components/StayReviewModal.jsx'
import { useCollection } from '../context/CollectionContext.jsx'
import { useUser } from '../context/UserContext.jsx'
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

function formatDimensionLabel(key) {
  const mapping = {
    listing_accuracy_rating: 'Listing Accuracy',
    airbnb_review_accuracy_rating: 'Existing Review Accuracy',
    cleanliness_rating: 'Cleanliness',
    host_communication_rating: 'Host Communication',
    check_in_rating: 'Check-in Experience',
    location_convenience_rating: 'Location Convenience',
    value_for_money_rating: 'Value for Money',
  }
  return mapping[key] || key
}

function renderStars(value) {
  const score = Math.max(0, Math.min(5, Number(value) || 0))
  return Array.from({ length: 5 }, (_, idx) => (
    <Star
      key={`star-${idx}`}
      className={[
        'h-4 w-4',
        idx < score ? 'fill-current text-amber-500' : 'text-slate-300',
      ].join(' ')}
      aria-hidden
    />
  ))
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

function isSafeHttpUrl(raw) {
  if (!raw || typeof raw !== 'string') return false
  try {
    const u = new URL(raw)
    return u.protocol === 'http:' || u.protocol === 'https:'
  } catch {
    return false
  }
}

function ExtractedReviewAccordionRow({
  review,
  borderLeftClass,
  rowKey,
  expandedKey,
  onToggleKey,
}) {
  const isOpen = expandedKey === rowKey
  const text = review.review_text_cleaned || '—'
  return (
    <li
      className={[
        'overflow-hidden rounded-xl border border-slate-100 bg-slate-50/50 shadow-sm',
        borderLeftClass,
      ].join(' ')}
    >
      <button
        type="button"
        className="flex w-full items-start justify-between gap-2 px-4 py-3 text-left transition hover:bg-slate-100/80"
        onClick={() => onToggleKey((prev) => (prev === rowKey ? null : rowKey))}
        aria-expanded={isOpen}
        aria-controls={`extracted-review-body-${rowKey}`}
      >
        <div className="min-w-0 flex-1">
          <span className="font-semibold text-slate-900">
            {review.reviewer_name || 'Guest'}
          </span>
          <span className="mt-0.5 block text-xs text-slate-500">
            {formatReviewDate(review.review_date)}
          </span>
          <span className="mt-1 block text-xs text-slate-500">
            {isOpen ? 'Hide review text' : 'Show review text'}
          </span>
        </div>
        <ChevronDown
          className={[
            'mt-0.5 h-5 w-5 shrink-0 text-slate-400 transition-transform',
            isOpen ? 'rotate-180' : '',
          ].join(' ')}
          aria-hidden
        />
      </button>
      {isOpen ? (
        <p
          id={`extracted-review-body-${rowKey}`}
          className="border-t border-slate-100 px-4 py-3 text-sm leading-relaxed text-slate-700"
        >
          {text}
        </p>
      ) : null}
    </li>
  )
}

export default function PropertyDetails() {
  const navigate = useNavigate()
  const { id } = useParams()
  const { userId } = useUser()
  const {
    isStayed,
    isStayReviewed,
    toggleStayed,
    refreshStaysFromServer,
    syncListingFlags,
    bumpStayDataEpoch,
    stayDataEpoch,
  } = useCollection()
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
  const [stayReviews, setStayReviews] = useState([])
  const [stayReviewsLoading, setStayReviewsLoading] = useState(false)
  const [stayReviewError, setStayReviewError] = useState(null)
  const [stayReviewModalOpen, setStayReviewModalOpen] = useState(false)

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
  /** Post-stay review card: show dimension breakdown + comment only when expanded. */
  const [expandedStayReviewId, setExpandedStayReviewId] = useState(null)
  /** Extracted reviews modal row key `${tab}-${id}` — body text shown on expand. */
  const [expandedExtractedReviewKey, setExpandedExtractedReviewKey] = useState(null)

  const existingUserStayReview = useMemo(() => {
    if (!userId) return null
    return stayReviews.find((review) => Number(review.user_id) === Number(userId)) || null
  }, [stayReviews, userId])

  const stayReviewSummary = useMemo(() => {
    if (!stayReviews.length) {
      return { averageOverall: null, reviewCount: 0 }
    }
    const total = stayReviews.reduce((sum, review) => sum + (Number(review.overall_rating) || 0), 0)
    return {
      averageOverall: total / stayReviews.length,
      reviewCount: stayReviews.length,
    }
  }, [stayReviews])

  /** Parsed scraped URLs only (no fallbacks). */
  const scrapedGallery = useMemo(() => {
    if (!listing?.gallery_urls || !String(listing.gallery_urls).trim()) return []
    return String(listing.gallery_urls)
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
  }, [listing])

  /**
   * Hero + strip: prefer scraped high-res gallery; else CSV `picture_url`; else placeholders.
   * List/search cards must keep using `picture_url` only — never mix gallery there.
   */
  const displayImages = useMemo(() => {
    if (!listing) return GALLERY_IMAGES
    if (scrapedGallery.length > 0) return scrapedGallery
    const cover = listing.picture_url && String(listing.picture_url).trim()
    if (cover && cover.startsWith('http')) return [cover]
    return GALLERY_IMAGES
  }, [listing, scrapedGallery])

  const thumbImages = displayImages.length > 1 ? displayImages.slice(1) : []
  const externalListingUrl =
    listing?.listing_url && isSafeHttpUrl(listing.listing_url) ? listing.listing_url : null

  useEffect(() => {
    setActiveImage(0)
    setExpandedStayReviewId(null)
  }, [numericListingId])

  useEffect(() => {
    if (!reviewsOpen) setExpandedExtractedReviewKey(null)
  }, [reviewsOpen])

  useEffect(() => {
    if (!displayImages.length) return
    setActiveImage((prev) =>
      prev >= displayImages.length ? 0 : prev,
    )
  }, [displayImages.length])

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
    if (!Number.isFinite(numericListingId)) {
      setStayReviews([])
      setStayReviewError(null)
      return
    }

    let cancelled = false

    async function loadStayReviews() {
      setStayReviewsLoading(true)
      setStayReviewError(null)
      try {
        const data = await api.getListingStayReviews(numericListingId)
        if (!cancelled) {
          setStayReviews(Array.isArray(data?.reviews) ? data.reviews : [])
        }
      } catch (err) {
        if (!cancelled) {
          setStayReviewError(
            err?.response?.data?.detail || err?.message || 'Failed to load guest reviews',
          )
          setStayReviews([])
        }
      } finally {
        if (!cancelled) {
          setStayReviewsLoading(false)
        }
      }
    }

    loadStayReviews()
    return () => {
      cancelled = true
    }
  }, [numericListingId, stayDataEpoch])

  useEffect(() => {
    if (!userId || !Number.isFinite(numericListingId)) return
    syncListingFlags([numericListingId]).catch(() => {})
  }, [userId, numericListingId, syncListingFlags])

  useEffect(() => {
    if (!Number.isFinite(numericListingId)) return

    const handler = () => {
      if (document.visibilityState !== 'visible') return
      api
        .getListingStayReviews(numericListingId)
        .then((data) => {
          setStayReviews(Array.isArray(data?.reviews) ? data.reviews : [])
          setStayReviewError(null)
        })
        .catch((err) => {
          setStayReviewError(
            err?.response?.data?.detail || err?.message || 'Failed to load guest reviews',
          )
        })
    }

    document.addEventListener('visibilitychange', handler)
    return () => document.removeEventListener('visibilitychange', handler)
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
            src={
              displayImages[
                Math.min(activeImage, Math.max(0, displayImages.length - 1))
              ] ?? displayImages[0]
            }
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
        {thumbImages.length > 0 && (
          <div className="border-t border-slate-100 bg-slate-50/80 p-3 sm:p-4">
            {activeImage > 0 && (
              <button
                type="button"
                onClick={() => setActiveImage(0)}
                className="mb-2 text-xs font-semibold text-teal-700 hover:text-teal-900 hover:underline"
              >
                ← Cover photo
              </button>
            )}
            <div className="flex flex-wrap gap-2">
              {thumbImages.map((src, i) => {
                const idx = i + 1
                return (
                  <button
                    key={`${idx}-${src.slice(-48)}`}
                    type="button"
                    onClick={() => setActiveImage(idx)}
                    className={[
                      'relative h-16 min-w-[5.5rem] max-w-[8rem] flex-1 overflow-hidden rounded-lg ring-2 ring-offset-2 transition-all sm:h-20 sm:min-w-[6rem]',
                      activeImage === idx
                        ? 'ring-teal-600 ring-offset-white'
                        : 'ring-transparent opacity-80 hover:opacity-100',
                    ].join(' ')}
                    aria-label={`View image ${idx + 1}`}
                  >
                    <img src={src} alt="" className="h-full w-full object-cover" />
                  </button>
                )
              })}
            </div>
          </div>
        )}
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
          {externalListingUrl && (
            <a
              href={externalListingUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="block w-full rounded-2xl border border-slate-200 bg-white px-5 py-3.5 text-center text-sm font-semibold text-slate-800 shadow-sm transition-all duration-300 hover:-translate-y-1 hover:border-slate-300 hover:bg-slate-50 hover:shadow-md"
            >
              Open on Airbnb
            </a>
          )}

          <section className="rounded-2xl border border-slate-100 bg-white p-6 shadow-sm sm:p-8">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.22em] text-slate-400">
                  Guest reflections
                </p>
                <h2 className="mt-1 text-lg font-semibold text-slate-900">
                  Post-stay reviews
                </h2>
                <p className="mt-1 text-sm text-slate-500">
                  Ratings submitted after guests marked this listing as stayed.
                </p>
                {stayReviewSummary.reviewCount > 0 ? (
                  <div className="mt-3 inline-flex items-center gap-2 rounded-2xl border border-amber-200 bg-amber-50 px-3 py-2 text-amber-700">
                    <div className="flex items-center gap-0.5">{renderStars(Math.round(stayReviewSummary.averageOverall))}</div>
                    <span className="text-sm font-bold">
                      Average overall rating: {stayReviewSummary.averageOverall.toFixed(1)}/5
                    </span>
                    <span className="text-xs text-amber-700/80">
                      ({stayReviewSummary.reviewCount} review{stayReviewSummary.reviewCount > 1 ? 's' : ''})
                    </span>
                  </div>
                ) : null}
              </div>
              {userId && isStayed(numericListingId) ? (
                <button
                  type="button"
                  onClick={() => setStayReviewModalOpen(true)}
                  className="rounded-2xl border border-teal-200 bg-teal-50 px-4 py-2.5 text-sm font-semibold text-teal-800 transition hover:border-teal-300 hover:bg-teal-100"
                >
                  {existingUserStayReview || isStayReviewed(numericListingId) ? 'Manage review' : 'Leave a review'}
                </button>
              ) : null}
            </div>

            {stayReviewsLoading ? (
              <div className="mt-5 rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-8 text-center text-sm text-slate-500">
                Loading guest reviews…
              </div>
            ) : stayReviewError ? (
              <div className="mt-5 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                {stayReviewError}
              </div>
            ) : stayReviews.length === 0 ? (
              <div className="mt-5 rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-8 text-center text-sm text-slate-600">
                No post-stay reviews yet. Guests can share one after marking this stay as completed.
              </div>
            ) : (
              <div className="mt-5 space-y-3">
                {stayReviews.map((review) => {
                  const dimensionEntries = Object.entries(review).filter(([key]) =>
                    key.endsWith('_rating') && key !== 'overall_rating',
                  )
                  const hasDetail =
                    dimensionEntries.length > 0 || Boolean(review.comment && String(review.comment).trim())
                  const isExpanded = expandedStayReviewId === review.id
                  const panelId = `stay-review-detail-${review.id}`
                  return (
                    <article
                      key={review.id}
                      className="overflow-hidden rounded-2xl border border-slate-100 bg-slate-50/70 shadow-sm"
                    >
                      <button
                        type="button"
                        className="flex w-full flex-wrap items-start justify-between gap-3 p-4 text-left transition hover:bg-slate-50/90"
                        onClick={() => {
                          if (!hasDetail) return
                          setExpandedStayReviewId((prev) => (prev === review.id ? null : review.id))
                        }}
                        aria-expanded={hasDetail ? isExpanded : undefined}
                        aria-controls={hasDetail ? panelId : undefined}
                        disabled={!hasDetail}
                      >
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-semibold text-slate-900">
                            {review.reviewer_name || 'Guest'}
                          </p>
                          <p className="mt-1 text-xs text-slate-500">
                            Updated {formatReviewDate(review.updated_at || review.created_at)}
                          </p>
                          {hasDetail ? (
                            <p className="mt-2 text-xs text-slate-500">
                              {isExpanded ? 'Hide details' : 'Show rating breakdown & comment'}
                            </p>
                          ) : (
                            <p className="mt-2 text-xs text-slate-400">No written or dimension details</p>
                          )}
                        </div>
                        <div className="flex shrink-0 items-start gap-2">
                          <div className="rounded-2xl border border-amber-200 bg-amber-50 px-3 py-2 text-right">
                            <p className="text-[11px] font-bold uppercase tracking-wide text-amber-700">
                              Overall
                            </p>
                            <div className="mt-1 flex items-center gap-2 text-amber-600">
                              <div className="flex items-center gap-0.5">{renderStars(review.overall_rating)}</div>
                              <span className="text-sm font-bold text-amber-700">{review.overall_rating}/5</span>
                            </div>
                          </div>
                          {hasDetail ? (
                            <ChevronDown
                              className={[
                                'mt-1 h-5 w-5 shrink-0 text-slate-400 transition-transform',
                                isExpanded ? 'rotate-180' : '',
                              ].join(' ')}
                              aria-hidden
                            />
                          ) : null}
                        </div>
                      </button>

                      {hasDetail && isExpanded ? (
                        <div
                          id={panelId}
                          className="border-t border-slate-100 px-4 pb-4 pt-0"
                        >
                          <div className="mt-4 grid gap-3 sm:grid-cols-2">
                            {dimensionEntries.map(([key, value]) => (
                              <div
                                key={key}
                                className="rounded-2xl border border-slate-200 bg-white px-3 py-3"
                              >
                                <p className="text-xs font-semibold text-slate-600">
                                  {formatDimensionLabel(key)}
                                </p>
                                <div className="mt-2 flex items-center gap-2">
                                  <div className="flex items-center gap-0.5">{renderStars(value)}</div>
                                  <span className="text-xs font-bold text-slate-700">{value}/5</span>
                                </div>
                              </div>
                            ))}
                          </div>

                          {review.comment ? (
                            <p className="mt-4 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm leading-6 text-slate-700">
                              “{review.comment}”
                            </p>
                          ) : null}
                        </div>
                      ) : null}
                    </article>
                  )
                })}
              </div>
            )}
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

      <StayReviewModal
        isOpen={stayReviewModalOpen}
        onClose={() => setStayReviewModalOpen(false)}
        userId={userId}
        listing={listing}
        onSaved={async (savedReview) => {
          if (!savedReview) {
            setStayReviews((prev) => prev.filter((item) => Number(item.user_id) !== Number(userId)))
          } else {
            setStayReviews((prev) => {
              const others = prev.filter((item) => Number(item.user_id) !== Number(savedReview.user_id))
              return [{ ...savedReview, reviewer_name: 'You' }, ...others]
            })
          }
          bumpStayDataEpoch()
          refreshStaysFromServer().catch(() => {})
          if (Number.isFinite(numericListingId)) {
            syncListingFlags([numericListingId]).catch(() => {})
            try {
              const data = await api.getListingStayReviews(numericListingId)
              setStayReviews(Array.isArray(data?.reviews) ? data.reviews : [])
            } catch {
              // keep optimistic local state from above
            }
          }
        }}
      />

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
                        <ExtractedReviewAccordionRow
                          key={r.id}
                          review={r}
                          borderLeftClass="border-l-4 border-l-teal-500"
                          rowKey={`positive-${r.id}`}
                          expandedKey={expandedExtractedReviewKey}
                          onToggleKey={setExpandedExtractedReviewKey}
                        />
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
                        <ExtractedReviewAccordionRow
                          key={r.id}
                          review={r}
                          borderLeftClass="border-l-4 border-l-slate-400"
                          rowKey={`neutral-${r.id}`}
                          expandedKey={expandedExtractedReviewKey}
                          onToggleKey={setExpandedExtractedReviewKey}
                        />
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
                        <ExtractedReviewAccordionRow
                          key={r.id}
                          review={r}
                          borderLeftClass="border-l-4 border-l-orange-400"
                          rowKey={`negative-${r.id}`}
                          expandedKey={expandedExtractedReviewKey}
                          onToggleKey={setExpandedExtractedReviewKey}
                        />
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
