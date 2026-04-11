import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { CheckSquare, GitCompare, Star } from 'lucide-react'
import StayReviewIntentSheet from '../components/StayReviewIntentSheet.jsx'
import StayReviewModal from '../components/StayReviewModal.jsx'
import { useCompare } from '../context/CompareContext.jsx'
import { useCollection } from '../context/CollectionContext.jsx'
import { useUser } from '../context/UserContext.jsx'
import { api } from '../services/api.js'
import { formatListingPriceDisplay } from '../utils/listingPriceDisplay.js'

const PLACEHOLDER_IMAGE =
  'https://images.unsplash.com/photo-1522708323590-d24dbb6b0267?w=600&q=80'

function parseVibeTags(raw) {
  if (!raw) return []
  return raw
    .split('|')
    .map((s) => s.trim())
    .filter(Boolean)
}

export default function Favorites() {
  const navigate = useNavigate()
  const { userId } = useUser()
  const { items, toggleCompare, isInCompare } = useCompare()
  const {
    isStayed,
    toggleFavorite,
    toggleStayed,
    refreshFavoritesFromServer,
    refreshStaysFromServer,
    syncListingFlags,
    bumpStayDataEpoch,
  } = useCollection()

  const [listings, setListings] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [reviewModalListing, setReviewModalListing] = useState(null)
  const [stayIntentListing, setStayIntentListing] = useState(null)
  const [stayIntentConfirming, setStayIntentConfirming] = useState(false)
  const [stayIntentUnmarking, setStayIntentUnmarking] = useState(false)

  const load = useCallback(async () => {
    if (!userId) {
      setListings([])
      setLoading(false)
      return
    }
    setLoading(true)
    setError(null)
    try {
      const data = await api.getUserFavorites(userId)
      const arr = Array.isArray(data?.listings) ? data.listings : []
      setListings(arr)
      await syncListingFlags(arr.map((x) => x.id))
    } catch (e) {
      setError(e?.response?.data?.detail || e?.message || 'Failed to load favorites')
      setListings([])
    } finally {
      setLoading(false)
    }
  }, [userId, syncListingFlags])

  useEffect(() => {
    load()
  }, [load])

  const onRemoveFavorite = async (listingId, e) => {
    e.preventDefault()
    e.stopPropagation()
    if (!userId) return
    try {
      await toggleFavorite(listingId)
      setListings((prev) => prev.filter((x) => x.id !== listingId))
      await refreshFavoritesFromServer()
    } catch {
      // revert handled by context if needed
    }
  }

  const onToggleStayed = (listing, e) => {
    e.preventDefault()
    e.stopPropagation()
    if (!userId) {
      navigate('/guest-login')
      return
    }
    setStayIntentListing(listing)
  }

  if (!userId) {
    return (
      <div className="mx-auto max-w-2xl rounded-2xl border border-amber-200 bg-amber-50 px-6 py-10 text-center">
        <p className="text-slate-800">Sign in to view your favorites.</p>
        <Link
          to="/guest-login"
          className="mt-4 inline-block rounded-xl bg-teal-600 px-5 py-2.5 text-sm font-semibold text-white"
        >
          Go to sign in
        </Link>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Favorites</h1>
          <p className="mt-1 text-sm text-slate-500">
            {loading ? 'Loading…' : `${listings.length} saved listing${listings.length === 1 ? '' : 's'}`}
          </p>
        </div>
        <Link
          to="/search"
          className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm hover:border-teal-200 hover:text-teal-800"
        >
          Back to search
        </Link>
      </div>

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          {error}
        </div>
      )}

      {loading && (
        <div className="flex min-h-[200px] items-center justify-center rounded-2xl border border-dashed border-slate-200 bg-slate-50/80">
          <span className="inline-block h-8 w-8 animate-spin rounded-full border-2 border-teal-600 border-t-transparent" />
        </div>
      )}

      {!loading && !error && listings.length === 0 && (
        <div className="rounded-2xl border border-slate-100 bg-white px-6 py-14 text-center text-slate-600">
          <p>No favorites yet. Save listings from Smart Search with the star button.</p>
          <Link to="/search" className="mt-4 inline-block font-semibold text-teal-700 hover:underline">
            Browse listings
          </Link>
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        {!loading &&
          listings.map((listing) => {
            const vibePills = parseVibeTags(listing.vibe_tags)
            const selected = isInCompare(listing.id)
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
                        {vibePills.slice(0, 4).map((tag) => (
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

                <div className="absolute right-3 top-3 flex flex-col gap-2">
                  <button
                    type="button"
                    title="Remove from favorites"
                    className="flex h-9 w-9 items-center justify-center rounded-xl border border-amber-200 bg-white/95 text-amber-500 shadow-sm hover:bg-amber-50"
                    onClick={(e) => onRemoveFavorite(listing.id, e)}
                  >
                    <Star className="h-4 w-4 fill-current" aria-hidden />
                  </button>
                  <button
                    type="button"
                    title={isStayed(listing.id) ? 'Manage stay review' : 'Mark as stayed'}
                    className={[
                      'flex h-9 w-9 items-center justify-center rounded-xl border shadow-sm backdrop-blur transition-all',
                      isStayed(listing.id)
                        ? 'border-teal-400 bg-teal-600 text-white'
                        : 'border-white/80 bg-white/95 text-slate-600 hover:border-teal-200',
                    ].join(' ')}
                    onClick={(e) => onToggleStayed(listing, e)}
                  >
                    <CheckSquare className="h-4 w-4" aria-hidden />
                  </button>
                </div>

                <div className="flex items-start justify-between gap-2 border-t border-slate-50 px-4 pb-4">
                  <div className="text-xs text-slate-400">
                    <p>Sentiment —</p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <button
                      type="button"
                      title={selected ? 'Remove from compare' : 'Add to compare'}
                      className={[
                        'flex h-9 w-9 items-center justify-center rounded-xl border shadow-sm transition-all',
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
              </article>
            )
          })}
      </div>

      {items.length > 0 && (
        <button
          type="button"
          onClick={() => navigate('/compare')}
          className="fixed bottom-6 right-6 z-40 flex items-center gap-2 rounded-full bg-teal-600 px-5 py-3.5 text-sm font-semibold text-white shadow-lg"
        >
          <GitCompare className="h-4 w-4" aria-hidden />
          Compare ({items.length})
        </button>
      )}

      <StayReviewIntentSheet
        isOpen={Boolean(stayIntentListing)}
        onClose={() => {
          if (!stayIntentConfirming && !stayIntentUnmarking) setStayIntentListing(null)
        }}
        listing={stayIntentListing}
        isStayed={Boolean(stayIntentListing && isStayed(stayIntentListing.id))}
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
            await load()
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
        existingReview={reviewModalListing?.user_stay_review || null}
        onSaved={() => {
          setReviewModalListing(null)
          bumpStayDataEpoch()
          refreshStaysFromServer().catch(() => {})
          load().catch(() => {})
        }}
      />
    </div>
  )
}
