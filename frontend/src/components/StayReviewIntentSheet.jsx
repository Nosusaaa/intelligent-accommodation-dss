import { MessageSquare, X } from 'lucide-react'

/**
 * First step before StayReviewModal: dismiss (X / backdrop) vs write review vs unmark stayed.
 * z-[10000] matches StayReviewModal so Leaflet map tiles stay underneath.
 */
export default function StayReviewIntentSheet({
  isOpen,
  onClose,
  listing,
  isStayed,
  hasStayReview = false,
  onConfirmReview,
  onUnmarkStayed,
  confirming = false,
  unmarking = false,
}) {
  if (!isOpen || !listing) return null

  const title = listing?.name || `Listing ${listing?.id ?? ''}`
  const busy = confirming || unmarking
  const primaryLabel = (() => {
    if (!isStayed) return confirming ? 'Working…' : 'Write review'
    if (hasStayReview) return confirming ? 'Working…' : 'Manage stay review'
    return confirming ? 'Working…' : 'Write stay review'
  })()

  return (
    <div
      className="fixed inset-0 z-[10000] flex items-end justify-center bg-slate-950/45 p-4 pb-8 backdrop-blur-sm sm:items-center sm:pb-4"
      role="presentation"
      onClick={() => !busy && onClose?.()}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="stay-intent-title"
        className="w-full max-w-md overflow-hidden rounded-[1.75rem] border border-slate-200 bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 border-b border-slate-100 px-5 py-4 sm:px-6">
          <div className="min-w-0">
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-teal-700">Stayed</p>
            <h2 id="stay-intent-title" className="mt-1 truncate text-lg font-bold text-slate-900">
              {title}
            </h2>
            <p className="mt-1 text-sm text-slate-600">
              {isStayed
                ? hasStayReview
                  ? 'You already left a review for this listing. Open to view options, unmark stayed, or close.'
                  : 'Open the review form, unmark this listing as stayed, or close.'
                : 'Write review marks this listing as stayed and opens the form. Close (X) to leave without saving.'}
            </p>
          </div>
          <button
            type="button"
            onClick={() => !busy && onClose?.()}
            className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-slate-200 text-slate-600 transition hover:bg-slate-50"
            aria-label="Close"
            disabled={busy}
          >
            <X className="h-5 w-5" aria-hidden />
          </button>
        </div>
        <div className="flex flex-col gap-2 px-5 py-4 sm:px-6 sm:py-5">
          <button
            type="button"
            onClick={() => onConfirmReview?.()}
            disabled={busy}
            className="inline-flex items-center justify-center gap-2 rounded-2xl bg-teal-600 px-5 py-3.5 text-sm font-semibold text-white shadow-sm transition hover:bg-teal-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <MessageSquare className="h-4 w-4" aria-hidden />
            {primaryLabel}
          </button>
          {isStayed ? (
            <button
              type="button"
              onClick={() => onUnmarkStayed?.()}
              disabled={busy}
              className="rounded-2xl border border-slate-200 bg-white px-5 py-3.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {unmarking ? 'Working…' : 'Unmark stayed'}
            </button>
          ) : null}
        </div>
      </div>
    </div>
  )
}
