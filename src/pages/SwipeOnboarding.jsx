import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Heart, X } from 'lucide-react'

const CARD_IMAGE =
  'https://images.unsplash.com/photo-1566073771259-6a8506099945?w=900&q=80'

const vibeTags = ['Quiet', 'Walkable', 'Scenic view']

const TOTAL_SWIPES = 8

export default function SwipeOnboarding() {
  const navigate = useNavigate()
  const [swipeCount, setSwipeCount] = useState(0)

  useEffect(() => {
    if (swipeCount === TOTAL_SWIPES) {
      navigate('/search')
    }
  }, [swipeCount, navigate])

  const handleSwipe = () => {
    setSwipeCount((c) => (c >= TOTAL_SWIPES ? c : c + 1))
  }

  const progress = Math.min(swipeCount / TOTAL_SWIPES, 1)

  return (
    <div className="flex min-h-[calc(100svh-8rem)] flex-col items-center justify-center px-4 py-8">
      <div className="mb-8 w-full max-w-md">
        <div className="mb-2 flex items-center justify-between text-sm">
          <span className="font-medium text-slate-700">Train your taste</span>
          <span className="tabular-nums text-slate-600">
            <span className="font-semibold text-slate-900">{swipeCount}</span>
            <span className="text-slate-400"> / {TOTAL_SWIPES}</span>
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
      </div>

      <div className="relative w-full max-w-md overflow-hidden rounded-3xl border border-slate-100 bg-white shadow-lg shadow-slate-200/50">
        <div className="relative aspect-[4/5] w-full">
          <img
            src={CARD_IMAGE}
            alt="Property preview"
            className="h-full w-full object-cover"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-slate-950/90 via-slate-900/25 to-transparent" />
          <div className="absolute inset-x-0 bottom-0 p-6 text-white">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-white/70">
                  Price
                </p>
                <p className="text-2xl font-semibold tracking-tight">$189</p>
                <span className="text-sm text-white/80">/ night</span>
              </div>
              <div className="text-right">
                <p className="text-xs font-medium uppercase tracking-wide text-white/70">
                  Distance
                </p>
                <p className="text-lg font-semibold">2.4 km</p>
                <span className="text-sm text-white/80">to center</span>
              </div>
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              {vibeTags.map((tag) => (
                <span
                  key={tag}
                  className="rounded-full bg-teal-600/90 px-3 py-1 text-xs font-semibold text-white shadow-sm backdrop-blur-sm"
                >
                  {tag}
                </span>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="mt-10 flex items-center justify-center gap-10">
        <button
          type="button"
          onClick={handleSwipe}
          aria-label="Pass"
          className="flex h-20 w-20 items-center justify-center rounded-full bg-red-500 text-white shadow-lg shadow-red-500/30 transition-all duration-300 hover:scale-110 hover:bg-red-600 hover:shadow-xl"
        >
          <X className="h-9 w-9 stroke-[2.5]" aria-hidden />
        </button>
        <button
          type="button"
          onClick={handleSwipe}
          aria-label="Like"
          className="flex h-20 w-20 items-center justify-center rounded-full bg-teal-600 text-white shadow-lg shadow-teal-600/35 transition-all duration-300 hover:scale-110 hover:bg-teal-700 hover:shadow-xl"
        >
          <Heart className="h-9 w-9 fill-current" aria-hidden />
        </button>
      </div>
    </div>
  )
}
