import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Heart, Loader2, X } from 'lucide-react'
import { usePreference } from '../context/PreferenceContext.jsx'
import { api } from '../services/api.js'
import {
  formatListingPriceDisplay,
  getListingPriceNightly,
} from '../utils/listingPriceDisplay.js'

const PLACEHOLDER_IMAGE =
  'https://images.unsplash.com/photo-1566073771259-6a8506099945?w=900&q=80'

const TOTAL_SWIPES = 8

function parseVibeTags(raw) {
  if (!raw || typeof raw !== 'string') return []
  return raw
    .split('|')
    .map((s) => s.trim())
    .filter(Boolean)
}

export default function SwipeOnboarding() {
  const navigate = useNavigate()
  const { saveTopVibeTag } = usePreference()

  const [rooms, setRooms] = useState([])
  const [isLoadingRooms, setIsLoadingRooms] = useState(true)
  const [loadError, setLoadError] = useState(null)

  // tagScores: { [tagName]: count }
  const tagScores = useRef({})
  const [swipeCount, setSwipeCount] = useState(0)
  const [isSaving, setIsSaving] = useState(false)

  // drag / swipe state
  const [dragX, setDragX] = useState(0)
  const [isDragging, setIsDragging] = useState(false)
  const dragStart = useRef(null)
  const cardRef = useRef(null)

  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        setIsLoadingRooms(true)
        const data = await api.getOnboardingRooms()
        if (!cancelled) setRooms(Array.isArray(data) ? data : [])
      } catch {
        if (!cancelled) setLoadError('Could not load rooms — make sure the backend is running.')
      } finally {
        if (!cancelled) setIsLoadingRooms(false)
      }
    }
    load()
    return () => { cancelled = true }
  }, [])

  const currentRoom = rooms[swipeCount] ?? null
  const progress = Math.min(swipeCount / TOTAL_SWIPES, 1)

  async function finishOnboarding() {
    setIsSaving(true)
    const scores = tagScores.current

    // Compute top tag
    const topTag = Object.keys(scores).length
      ? Object.entries(scores).sort((a, b) => b[1] - a[1])[0][0]
      : null

    // Persist to backend if user_id is available
    const userId = sessionStorage.getItem('user_id')
    if (userId && Object.keys(scores).length > 0) {
      try {
        await api.savePreferences({ user_id: Number(userId), tag_scores: scores })
      } catch {
        // non-fatal: still navigate
      }
    }

    saveTopVibeTag(topTag)
    navigate('/search')
  }

  function handleLike() {
    if (currentRoom) {
      const tags = parseVibeTags(currentRoom.vibe_tags)
      tags.forEach((tag) => {
        tagScores.current[tag] = (tagScores.current[tag] ?? 0) + 1
      })
    }
    advance()
  }

  function handlePass() {
    advance()
  }

  function advance() {
    const next = swipeCount + 1
    if (next >= TOTAL_SWIPES || next >= rooms.length) {
      finishOnboarding()
    } else {
      setSwipeCount(next)
      setDragX(0)
    }
  }

  // ── Pointer drag handlers ──────────────────────────────────────
  function onPointerDown(e) {
    dragStart.current = e.clientX
    setIsDragging(true)
    cardRef.current?.setPointerCapture(e.pointerId)
  }

  function onPointerMove(e) {
    if (!isDragging || dragStart.current === null) return
    setDragX(e.clientX - dragStart.current)
  }

  function onPointerUp() {
    if (!isDragging) return
    setIsDragging(false)
    const threshold = 80
    if (dragX > threshold) {
      handleLike()
    } else if (dragX < -threshold) {
      handlePass()
    } else {
      setDragX(0)
    }
    dragStart.current = null
  }

  // derived drag visuals
  const rotate = dragX * 0.08
  const likeOpacity = Math.min(Math.max(dragX / 100, 0), 1)
  const passOpacity = Math.min(Math.max(-dragX / 100, 0), 1)

  if (isLoadingRooms) {
    return (
      <div className="flex h-screen items-center justify-center gap-3 text-slate-500">
        <Loader2 className="h-6 w-6 animate-spin text-teal-600" />
        <span className="text-sm font-medium">Loading your taste cards…</span>
      </div>
    )
  }

  if (loadError) {
    return (
      <div className="flex h-screen flex-col items-center justify-center gap-4 px-6 text-center">
        <p className="text-sm text-red-600">{loadError}</p>
        <button
          type="button"
          onClick={() => navigate('/search')}
          className="rounded-xl bg-teal-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-teal-700"
        >
          Skip to Search
        </button>
      </div>
    )
  }

  if (isSaving) {
    return (
      <div className="flex h-screen items-center justify-center gap-3 text-slate-500">
        <Loader2 className="h-6 w-6 animate-spin text-teal-600" />
        <span className="text-sm font-medium">Saving your taste profile…</span>
      </div>
    )
  }

  const tags = currentRoom ? parseVibeTags(currentRoom.vibe_tags) : []
  const nightlyPrice = currentRoom
    ? getListingPriceNightly(currentRoom.price_clean)
    : null

  return (
    <div className="flex h-screen max-h-full min-h-0 flex-1 flex-col overflow-hidden">
      {/* Header */}
      <div className="mx-auto w-full max-w-md shrink-0 px-1 pt-4">
        <div className="mb-2 flex items-center justify-between text-sm">
          <span className="font-medium text-slate-700">Train your taste</span>
          <span className="tabular-nums text-slate-600">
            <span className="font-semibold text-slate-900">{swipeCount}</span>
            <span className="text-slate-400"> / {Math.min(TOTAL_SWIPES, rooms.length)}</span>
          </span>
        </div>
        <div
          className="h-2 overflow-hidden rounded-full bg-slate-200"
          role="progressbar"
          aria-valuenow={swipeCount}
          aria-valuemin={0}
          aria-valuemax={TOTAL_SWIPES}
          aria-label="Swipe progress"
        >
          <div
            className="h-full rounded-full bg-teal-600 transition-all duration-300 ease-out"
            style={{ width: `${progress * 100}%` }}
          />
        </div>
        <p className="mt-2 text-center text-xs text-slate-400">
          Swipe right or press <span className="font-semibold text-teal-600">Like</span> on rooms you enjoy
        </p>
      </div>

      {/* Card */}
      <div className="mx-auto flex min-h-0 w-full max-w-md flex-1 flex-col px-1 py-3">
        <div
          ref={cardRef}
          className="relative min-h-0 flex-1 cursor-grab overflow-hidden rounded-3xl border border-slate-100 bg-white shadow-lg shadow-slate-200/50 select-none active:cursor-grabbing"
          style={{
            transform: `translateX(${dragX}px) rotate(${rotate}deg)`,
            transition: isDragging ? 'none' : 'transform 0.3s ease',
          }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
        >
          <img
            src={currentRoom?.picture_url || PLACEHOLDER_IMAGE}
            alt="Property preview"
            className="absolute inset-0 h-full w-full object-cover"
            draggable={false}
          />
          <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-slate-950/90 via-slate-900/25 to-transparent" />

          {/* LIKE overlay */}
          <div
            className="pointer-events-none absolute left-6 top-8 rotate-[-22deg] rounded-xl border-4 border-teal-400 px-4 py-2 text-2xl font-black uppercase text-teal-400"
            style={{ opacity: likeOpacity }}
          >
            LIKE
          </div>
          {/* PASS overlay */}
          <div
            className="pointer-events-none absolute right-6 top-8 rotate-[22deg] rounded-xl border-4 border-red-400 px-4 py-2 text-2xl font-black uppercase text-red-400"
            style={{ opacity: passOpacity }}
          >
            PASS
          </div>

          <div className="absolute inset-x-0 bottom-0 p-4 text-white sm:p-6">
            <h3 className="line-clamp-2 text-base font-semibold leading-snug">
              {currentRoom?.name || 'Property'}
            </h3>
            {currentRoom?.neighbourhood_cleansed && (
              <p className="mt-0.5 text-sm text-white/70">{currentRoom.neighbourhood_cleansed}</p>
            )}
            <div className="mt-3 flex flex-wrap items-end justify-between gap-3">
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-white/70">Price</p>
                <p className="text-2xl font-semibold tracking-tight">
                  {formatListingPriceDisplay(currentRoom?.price_clean)}
                </p>
                {nightlyPrice != null ? (
                  <span className="text-sm text-white/80">/ night</span>
                ) : null}
              </div>
              <div className="text-right">
                <p className="text-xs font-medium uppercase tracking-wide text-white/70">Type</p>
                <p className="text-sm font-semibold">{currentRoom?.room_type || '—'}</p>
              </div>
            </div>
            {tags.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-2 sm:mt-4">
                {tags.map((tag) => (
                  <span
                    key={tag}
                    className="rounded-full bg-teal-600/90 px-3 py-1 text-xs font-semibold text-white shadow-sm backdrop-blur-sm"
                  >
                    {tag}
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Buttons */}
      <div className="flex shrink-0 items-center justify-center gap-8 pb-6 pt-2 sm:gap-10">
        <button
          type="button"
          onClick={handlePass}
          aria-label="Pass"
          className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-red-500 text-white shadow-lg shadow-red-500/30 transition-all duration-300 hover:scale-110 hover:bg-red-600 hover:shadow-xl sm:h-20 sm:w-20"
        >
          <X className="h-8 w-8 stroke-[2.5] sm:h-9 sm:w-9" aria-hidden />
        </button>
        <button
          type="button"
          onClick={handleLike}
          aria-label="Like"
          className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-teal-600 text-white shadow-lg shadow-teal-600/35 transition-all duration-300 hover:scale-110 hover:bg-teal-700 hover:shadow-xl sm:h-20 sm:w-20"
        >
          <Heart className="h-8 w-8 fill-current sm:h-9 sm:w-9" aria-hidden />
        </button>
      </div>
    </div>
  )
}
