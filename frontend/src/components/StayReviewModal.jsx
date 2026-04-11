import { useEffect, useMemo, useState } from 'react'
import { MessageSquareMore, Star, X } from 'lucide-react'
import { api } from '../services/api.js'

function buildInitialRatings(dimensions) {
  const ratings = {}
  for (const dim of dimensions) ratings[dim.key] = null
  return { overall_rating: null, ratings, comment: '' }
}

function StarRating({ label, value, onChange, hint }) {
  return (
    <div className="rounded-2xl border border-slate-100 bg-slate-50/80 p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-slate-900">{label}</p>
          {hint ? <p className="mt-1 text-xs leading-5 text-slate-500">{hint}</p> : null}
        </div>
        <span className="rounded-full bg-white px-2.5 py-1 text-xs font-bold text-amber-600 ring-1 ring-amber-200">{Number.isFinite(value) ? `${value}/5` : '未评分'}</span>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        {[1, 2, 3, 4, 5].map((score) => {
          const active = Number.isFinite(value) && score <= value
          return (
            <button
              key={score}
              type="button"
              onClick={() => onChange(score)}
              className={[
                'inline-flex h-11 w-11 items-center justify-center rounded-2xl border transition',
                active ? 'border-amber-300 bg-amber-50 text-amber-500 shadow-sm' : 'border-slate-200 bg-white text-slate-300 hover:border-amber-200 hover:text-amber-400',
              ].join(' ')}
              aria-label={`${label} ${score} star${score > 1 ? 's' : ''}`}
            >
              <Star className={['h-5 w-5', active ? 'fill-current' : ''].join(' ')} />
            </button>
          )
        })}
      </div>
    </div>
  )
}

export default function StayReviewModal({ isOpen, onClose, userId, listing, existingReview, onSaved }) {
  const [config, setConfig] = useState(null)
  const [remoteExistingReview, setRemoteExistingReview] = useState(existingReview || null)
  const [loadingConfig, setLoadingConfig] = useState(false)
  const [loadingExistingReview, setLoadingExistingReview] = useState(false)
  const [overallRating, setOverallRating] = useState(null)
  const [ratings, setRatings] = useState({})
  const [comment, setComment] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const dimensions = useMemo(() => config?.dimensions || [], [config])
  const activeExistingReview = remoteExistingReview || existingReview || null
  const listingId = Number(listing?.id)
  const canSubmitReview = Number.isFinite(overallRating) && dimensions.length > 0 && dimensions.every((dim) => Number.isFinite(ratings[dim.key]))

  useEffect(() => {
    if (!isOpen) return
    setRemoteExistingReview(existingReview || null)
  }, [isOpen, existingReview])

  useEffect(() => {
    if (!isOpen || !userId) return
    let cancelled = false
    setLoadingConfig(true)
    api.getUserReviewConfig(userId)
      .then((data) => {
        if (!cancelled) setConfig(data)
      })
      .catch((err) => {
        if (!cancelled) setError(err?.response?.data?.detail || err?.message || 'Failed to load review form.')
      })
      .finally(() => {
        if (!cancelled) setLoadingConfig(false)
      })
    return () => {
      cancelled = true
    }
  }, [isOpen, userId])

  useEffect(() => {
    if (!isOpen || !userId || !Number.isFinite(listingId) || existingReview) return
    let cancelled = false
    setLoadingExistingReview(true)
    api.getUserStayReview(userId, listingId)
      .then((data) => {
        if (!cancelled) setRemoteExistingReview(data || null)
      })
      .catch((err) => {
        if (cancelled) return
        if (err?.response?.status === 404) {
          setRemoteExistingReview(null)
          return
        }
        setError(err?.response?.data?.detail || err?.message || 'Failed to load existing review.')
      })
      .finally(() => {
        if (!cancelled) setLoadingExistingReview(false)
      })
    return () => {
      cancelled = true
    }
  }, [isOpen, userId, listingId, existingReview])

  useEffect(() => {
    if (!dimensions.length) return
    const initial = buildInitialRatings(dimensions)
    setOverallRating(initial.overall_rating)
    setRatings(initial.ratings)
    setComment(initial.comment)
    setError('')
  }, [dimensions])

  if (!isOpen) return null

  const submitReview = async (e) => {
    e.preventDefault()
    if (!userId || !Number.isFinite(listingId) || activeExistingReview) return
    if (!canSubmitReview) {
      setError('请手动完成所有评分项后再保存评价。')
      return
    }
    setSaving(true)
    setError('')
    try {
      const payload = { overall_rating: overallRating, comment }
      for (const dim of dimensions) payload[dim.key] = ratings[dim.key]
      const saved = await api.saveUserReview(userId, listingId, payload)
      onSaved?.(saved)
      onClose?.()
    } catch (err) {
      setError(err?.response?.data?.detail || err?.message || 'Failed to save review.')
    } finally {
      setSaving(false)
    }
  }

  const cancelReview = async () => {
    if (!userId || !Number.isFinite(listingId) || !activeExistingReview) return
    setSaving(true)
    setError('')
    try {
      await api.removeUserReview(userId, listingId)
      setRemoteExistingReview(null)
      onSaved?.(null)
      onClose?.()
    } catch (err) {
      setError(err?.response?.data?.detail || err?.message || 'Failed to cancel review.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-[10000] flex items-center justify-center bg-slate-950/45 p-4 backdrop-blur-sm" role="presentation" onClick={() => onClose?.()}>
      <div role="dialog" aria-modal="true" aria-labelledby="stay-review-title" className="max-h-[90vh] w-full max-w-3xl overflow-hidden rounded-[2rem] border border-slate-200 bg-white shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="border-b border-slate-100 bg-[linear-gradient(135deg,#0f766e_0%,#115e59_100%)] px-6 py-5 text-white sm:px-7">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.24em] text-white/70">Post-stay review</p>
              <h2 id="stay-review-title" className="mt-2 text-2xl font-black tracking-tight">{activeExistingReview ? 'Manage your stay review' : 'Share your stay experience'}</h2>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-white/85">Leave one overall rating and detailed scores for listing accuracy, existing review accuracy, cleanliness, host communication, check-in, location convenience, and value.</p>
              <p className="mt-2 max-w-2xl text-xs leading-5 text-white/75">Please write your comment in English only. Each user can submit only one review for a listing.</p>
            </div>
            <button type="button" onClick={() => onClose?.()} className="inline-flex h-11 w-11 items-center justify-center rounded-2xl border border-white/20 bg-white/10 text-white transition hover:bg-white/20" aria-label="Close review form">
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        <form onSubmit={submitReview} className="max-h-[calc(90vh-108px)] overflow-y-auto px-6 py-6 sm:px-7">
          <div className="rounded-2xl border border-teal-100 bg-teal-50/70 p-4 text-sm text-teal-900">
            <p className="font-semibold">{listing?.name || `Listing ${listing?.id || ''}`}</p>
            <p className="mt-1 text-teal-800/80">{activeExistingReview ? 'You already submitted a review. If you continue, your existing review will be removed.' : 'Your review will appear on the listing details page and in your profile under stayed listings.'}</p>
          </div>

          {loadingConfig || loadingExistingReview ? (
            <div className="mt-5 rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-10 text-center text-sm text-slate-500">Loading review form?</div>
          ) : activeExistingReview ? (
            <div className="mt-5 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-4 text-sm text-amber-900">
              <p className="font-semibold">You have already submitted a review for this listing.</p>
              <p className="mt-1">Do you want to cancel this review? This action cannot be undone.</p>
            </div>
          ) : (
            <div className="mt-5 space-y-4">
              <StarRating label="Overall stay satisfaction" hint="A quick summary score for the whole stay." value={overallRating} onChange={setOverallRating} />
              {dimensions.map((dim) => (
                <StarRating key={dim.key} label={dim.label} hint={dim.description} value={ratings[dim.key] ?? null} onChange={(value) => setRatings((prev) => ({ ...prev, [dim.key]: value }))} />
              ))}
              <label className="block rounded-2xl border border-slate-100 bg-white p-4">
                <div className="flex items-center gap-2 text-slate-900">
                  <MessageSquareMore className="h-4 w-4 text-teal-700" />
                  <span className="text-sm font-semibold">Additional comments</span>
                  <span className="text-xs font-medium text-slate-400">Optional</span>
                </div>
                <textarea value={comment} onChange={(e) => setComment(e.target.value)} rows={5} maxLength={1200} placeholder="Please write your review in English. Share what future guests should know." className="mt-3 w-full resize-y rounded-2xl border border-slate-200 px-4 py-3 text-sm text-slate-700 outline-none focus:border-teal-200 focus:ring-4 focus:ring-teal-600/10" />
                <p className="mt-2 text-right text-xs text-slate-400">{comment.length}/1200</p>
              </label>
            </div>
          )}

          {error ? <div className="mt-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div> : null}

          <div className="mt-6 flex flex-col-reverse gap-3 border-t border-slate-100 pt-5 sm:flex-row sm:justify-end">
            <button type="button" onClick={() => onClose?.()} className="rounded-2xl border border-slate-200 bg-white px-5 py-3 text-sm font-semibold text-slate-700 transition hover:border-slate-300 hover:bg-slate-50">Maybe later</button>
            {activeExistingReview ? (
              <button type="button" onClick={cancelReview} disabled={saving || loadingConfig || loadingExistingReview} className="rounded-2xl bg-red-600 px-5 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-60">
                {saving ? 'Cancelling review?' : 'Cancel review'}
              </button>
            ) : (
              <button type="submit" disabled={saving || loadingConfig || loadingExistingReview || !dimensions.length || !canSubmitReview} className="rounded-2xl bg-teal-600 px-5 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-teal-700 disabled:cursor-not-allowed disabled:opacity-60">
                {saving ? 'Saving review?' : 'Save review'}
              </button>
            )}
          </div>
        </form>
      </div>
    </div>
  )
}
