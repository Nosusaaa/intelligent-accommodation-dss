import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { Camera, Download, ExternalLink, Mail, RefreshCw, Save, Star, Trash2, User2 } from 'lucide-react'
import { useCollection } from '../context/CollectionContext.jsx'
import { useUser } from '../context/UserContext.jsx'
import { api } from '../services/api.js'
import { formatListingPriceDisplay } from '../utils/listingPriceDisplay.js'

function formatDate(value) {
  if (!value) return '—'
  const d = new Date(value)
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleString()
}

function formatReviewDate(value) {
  if (!value) return '—'
  const d = new Date(value)
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
}

function initialsFrom(value) {
  const s = (value || '').trim()
  if (!s) return 'G'
  const base = s.includes('@') ? s.split('@')[0] : s
  const parts = base.split(/[._\s-]+/).filter(Boolean)
  const a = (parts[0]?.[0] || base[0] || 'U').toUpperCase()
  const b = (parts[1]?.[0] || parts[0]?.[1] || '').toUpperCase()
  return (a + b).slice(0, 2)
}

function downloadJson(filename, obj) {
  const blob = new Blob([JSON.stringify(obj, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}

function renderStars(value) {
  const score = Math.max(0, Math.min(5, Number(value) || 0))
  return Array.from({ length: 5 }, (_, idx) => (
    <Star key={`profile-star-${idx}`} className={['h-4 w-4', idx < score ? 'fill-current text-amber-500' : 'text-slate-300'].join(' ')} aria-hidden />
  ))
}

export default function Profile() {
  const { userId, profile, loadingProfile, fetchProfile, updateProfile } = useUser()
  const { refreshStaysFromServer, stayDataEpoch } = useCollection()
  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [avatarUrl, setAvatarUrl] = useState('')
  const [status, setStatus] = useState('')
  const [saving, setSaving] = useState(false)
  const [stayedListings, setStayedListings] = useState([])
  const [stayedLoading, setStayedLoading] = useState(false)
  const [preferences, setPreferences] = useState(null)
  const fileInputRef = useRef(null)

  useEffect(() => {
    if (userId && !profile) fetchProfile(userId).catch(() => {})
  }, [userId, profile, fetchProfile])

  useEffect(() => {
    setFullName(profile?.full_name || '')
    setEmail(profile?.email || '')
    setAvatarUrl(profile?.avatar_url || '')
  }, [profile])

  useEffect(() => {
    if (!userId) return void setStayedListings([])
    let cancelled = false
    setStayedLoading(true)
    api.getUserStays(userId)
      .then((data) => !cancelled && setStayedListings(Array.isArray(data?.listings) ? data.listings : []))
      .catch(() => !cancelled && setStayedListings([]))
      .finally(() => !cancelled && setStayedLoading(false))
    return () => {
      cancelled = true
    }
  }, [userId, stayDataEpoch])

  useEffect(() => {
    if (!userId) return void setPreferences(null)
    let cancelled = false
    api.getPreferences(userId)
      .then((data) => !cancelled && setPreferences(data))
      .catch(() => !cancelled && setPreferences(null))
    return () => {
      cancelled = true
    }
  }, [userId])

  const displayName = useMemo(() => fullName || email || 'Guest', [fullName, email])
  const initials = useMemo(() => initialsFrom(displayName), [displayName])
  const reviewedListings = useMemo(() => stayedListings.filter((listing) => listing?.user_stay_review), [stayedListings])

  const onAvatarChange = (e) => {
    const file = e.target.files?.[0]
    if (!file || !file.type?.startsWith('image/')) return
    if (file.size > 2 * 1024 * 1024) return setStatus('Image is too large. Please upload a file smaller than 2MB.')
    const reader = new FileReader()
    reader.onload = () => {
      setAvatarUrl(typeof reader.result === 'string' ? reader.result : '')
      setStatus('')
    }
    reader.readAsDataURL(file)
  }

  const onSave = async (e) => {
    e.preventDefault()
    if (!userId) return setStatus('Please sign in to edit your profile.')
    setSaving(true)
    try {
      await updateProfile({ full_name: fullName, email, avatar_url: avatarUrl })
      setStatus('Profile updated successfully.')
    } catch (err) {
      setStatus(err?.response?.data?.detail || err?.message || 'Failed to update profile.')
    } finally {
      setSaving(false)
    }
  }

  const exportData = { user_id: userId, full_name: fullName, email, avatar_url: avatarUrl, created_at: profile?.created_at || null }

  return (
    <div className="mx-auto w-full max-w-5xl space-y-6">
      <section className="overflow-hidden rounded-[2rem] border border-slate-100 bg-white shadow-sm">
        <div className="relative bg-[linear-gradient(135deg,#0f766e_0%,#0d9488_45%,#34d399_100%)] px-6 py-10 text-white sm:px-8">
          <div className="absolute inset-0 opacity-25 [background-image:radial-gradient(circle_at_1px_1px,rgba(255,255,255,0.45)_1px,transparent_0)] [background-size:16px_16px]" />
          <div className="relative flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
            <div className="flex items-center gap-4">
              <div className="relative">
                {avatarUrl ? <img src={avatarUrl} alt="" className="h-24 w-24 rounded-[1.6rem] object-cover ring-4 ring-white/70" /> : <div className="flex h-24 w-24 items-center justify-center rounded-[1.6rem] bg-white/15 text-3xl font-black ring-4 ring-white/25">{initials}</div>}
                <button type="button" onClick={() => fileInputRef.current?.click()} className="absolute -bottom-2 -right-2 inline-flex h-10 w-10 items-center justify-center rounded-2xl border border-white/40 bg-white/20 text-white shadow-sm backdrop-blur transition hover:bg-white/30"><Camera className="h-4 w-4" /></button>
              </div>
              <div><p className="text-xs font-bold uppercase tracking-[0.25em] text-white/75">Profile</p><h1 className="mt-2 text-3xl font-black tracking-tight">{displayName}</h1><p className="mt-2 text-sm text-white/85">Browse every listing you stayed at and the homes you already reviewed.</p></div>
            </div>
            <div className="rounded-2xl border border-white/25 bg-white/10 px-4 py-3 text-white/90 backdrop-blur"><p className="text-xs font-bold uppercase tracking-wide text-white/70">Member Since</p><p className="mt-1 text-sm font-medium">{formatDate(profile?.created_at)}</p></div>
          </div>
        </div>
      </section>

      <form onSubmit={onSave} className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
        <section className="rounded-3xl border border-slate-100 bg-white p-6 shadow-sm">
          <div className="flex items-start justify-between gap-3"><div><p className="text-xs font-bold uppercase tracking-wide text-slate-400">Account</p><h2 className="mt-1 text-lg font-semibold text-slate-900">Personal Information</h2></div><button type="button" onClick={() => downloadJson(`profile-${userId || 'guest'}.json`, exportData)} className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 shadow-sm transition hover:border-teal-200 hover:text-teal-800"><Download className="h-4 w-4" />Export Data</button></div>
          <div className="mt-6 grid gap-4">
            <label className="grid gap-2 text-xs font-bold uppercase tracking-wide text-slate-600"><span>Full Name</span><div className="flex items-center gap-2"><span className="inline-flex h-11 w-11 items-center justify-center rounded-2xl border border-slate-200 bg-slate-50 text-slate-600"><User2 className="h-4 w-4" /></span><input value={fullName} onChange={(e) => setFullName(e.target.value)} maxLength={120} placeholder="Enter your full name" className="h-11 w-full rounded-2xl border border-slate-200 px-4 text-sm outline-none focus:border-teal-200 focus:ring-4 focus:ring-teal-600/15" /></div></label>
            <label className="grid gap-2 text-xs font-bold uppercase tracking-wide text-slate-600"><span>Email Address</span><div className="flex items-center gap-2"><span className="inline-flex h-11 w-11 items-center justify-center rounded-2xl border border-slate-200 bg-slate-50 text-slate-600"><Mail className="h-4 w-4" /></span><input value={email} onChange={(e) => setEmail(e.target.value)} type="email" placeholder="you@example.com" className="h-11 w-full rounded-2xl border border-slate-200 px-4 text-sm outline-none focus:border-teal-200 focus:ring-4 focus:ring-teal-600/15" /></div></label>
            <div><p className="text-xs font-bold uppercase tracking-wide text-slate-600">Avatar</p><div className="mt-2 flex flex-wrap gap-3"><button type="button" onClick={() => fileInputRef.current?.click()} className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 shadow-sm transition hover:border-teal-200 hover:text-teal-800"><Camera className="h-4 w-4" />Upload Avatar</button><button type="button" onClick={() => setAvatarUrl('')} className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 shadow-sm transition hover:border-red-200 hover:text-red-700"><Trash2 className="h-4 w-4" />Remove Avatar</button><input ref={fileInputRef} type="file" accept="image/*" onChange={onAvatarChange} className="hidden" /></div></div>
          </div>
        </section>

        <section className="rounded-3xl border border-slate-100 bg-white p-6 shadow-sm">
          <p className="text-xs font-bold uppercase tracking-wide text-slate-400">Overview</p>
          <h2 className="mt-1 text-lg font-semibold text-slate-900">Profile Summary</h2>
          <div className="mt-6 space-y-4">
            <div className="rounded-2xl border border-slate-100 bg-slate-50 p-4"><p className="text-xs font-bold uppercase tracking-wide text-slate-500">Current Name</p><p className="mt-2 text-base font-semibold text-slate-900">{fullName || 'Not set yet'}</p></div>
            <div className="rounded-2xl border border-slate-100 bg-slate-50 p-4"><p className="text-xs font-bold uppercase tracking-wide text-slate-500">Current Email</p><p className="mt-2 text-base font-semibold text-slate-900">{email || 'Not set yet'}</p></div>
            <div className="rounded-2xl border border-slate-100 bg-slate-50 p-4"><p className="text-xs font-bold uppercase tracking-wide text-slate-500">Member Since</p><p className="mt-2 text-base font-semibold text-slate-900">{formatDate(profile?.created_at)}</p></div>
            <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-xs text-amber-900"><p className="font-semibold text-amber-950">Privacy Notice</p><p className="mt-2 leading-5">Your avatar and account details are stored with your user profile and used to personalize your signed-in experience.</p></div>
            <div className="rounded-2xl border border-slate-100 bg-slate-50 p-4"><div className="flex items-center justify-between"><p className="text-xs font-bold uppercase tracking-wide text-slate-500">Your Vibe</p>{userId ? <Link to="/onboarding" className="inline-flex items-center gap-1 rounded-xl border border-teal-200 bg-teal-50 px-3 py-1.5 text-xs font-semibold text-teal-700 transition hover:border-teal-300 hover:bg-teal-100"><RefreshCw className="h-3 w-3" />Retest</Link> : null}</div><p className="mt-3 text-base font-bold text-teal-700">{preferences?.top_vibe_tag || 'No preference data yet.'}</p></div>
          </div>
        </section>

        <div className="lg:col-span-2 flex items-center justify-between gap-3 border-t border-slate-100 pt-2"><p className="text-sm text-slate-500">{loadingProfile ? 'Loading profile…' : status}</p><button type="submit" disabled={saving || !userId} className="inline-flex items-center gap-2 rounded-2xl bg-teal-600 px-5 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-teal-700 disabled:cursor-not-allowed disabled:opacity-60"><Save className="h-4 w-4" />{saving ? 'Saving…' : 'Save Changes'}</button></div>
      </form>

      <section className="rounded-3xl border border-slate-100 bg-white p-6 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-xs font-bold uppercase tracking-[0.22em] text-slate-400">Travel history</p><h2 className="mt-1 text-lg font-semibold text-slate-900">Stayed listings</h2><p className="mt-1 text-sm text-slate-500">Browse every property you marked as stayed and see whether you already submitted your one-time review.</p></div><div className="rounded-2xl border border-teal-100 bg-teal-50 px-4 py-3 text-right text-sm text-teal-900"><p className="font-semibold">{stayedListings.length} stayed listing{stayedListings.length === 1 ? '' : 's'}</p><p className="text-xs text-teal-800/80">{reviewedListings.length} reviewed</p></div></div>
        {stayedLoading ? <div className="mt-5 rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-10 text-center text-sm text-slate-500">Loading your stayed listings…</div> : stayedListings.length === 0 ? <div className="mt-5 rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-10 text-center text-sm text-slate-600">You have not marked any listings as stayed yet.</div> : <div className="mt-5 grid gap-4 md:grid-cols-2">{stayedListings.map((listing) => { const review = listing.user_stay_review; return <article key={listing.id} className="overflow-hidden rounded-[1.75rem] border border-slate-100 bg-[linear-gradient(180deg,#ffffff_0%,#f8fafc_100%)] shadow-sm"><div className="relative h-44 overflow-hidden bg-slate-100">{listing.picture_url ? <img src={listing.picture_url} alt="" className="h-full w-full object-cover" /> : <div className="flex h-full items-center justify-center text-sm font-semibold text-slate-400">No image available</div>}<div className="absolute inset-0 bg-gradient-to-t from-slate-950/70 via-transparent to-transparent" /><div className="absolute bottom-0 left-0 right-0 flex items-end justify-between gap-3 p-4 text-white"><div><p className="text-xs font-bold uppercase tracking-[0.22em] text-white/70">Listing #{listing.id}</p><h3 className="mt-1 line-clamp-2 text-lg font-black leading-tight">{listing.name || `Listing ${listing.id}`}</h3></div><div className="rounded-2xl bg-white/15 px-3 py-2 text-right backdrop-blur"><p className="text-[11px] font-bold uppercase tracking-wide text-white/75">Price</p><p className="mt-1 text-sm font-semibold text-white">{formatListingPriceDisplay(listing.price_clean)}/night</p></div></div></div><div className="space-y-4 p-5"><div className="flex items-start justify-between gap-3"><div><p className="text-sm font-semibold text-slate-900">{listing.neighbourhood_cleansed || 'Unknown area'}</p><p className="mt-1 text-xs text-slate-500">{listing.room_type || 'Room type unavailable'}</p></div>{review ? <div className="rounded-2xl border border-amber-200 bg-amber-50 px-3 py-2 text-right text-amber-800"><p className="text-[11px] font-bold uppercase tracking-wide">Your rating</p><div className="mt-1 flex items-center gap-2"><div className="flex items-center gap-0.5">{renderStars(review.overall_rating)}</div><span className="text-sm font-bold">{review.overall_rating}/5</span></div></div> : <div className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-600">Review not submitted yet</div>}</div>{review ? <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3"><div className="flex items-center justify-between gap-3"><p className="text-xs font-bold uppercase tracking-wide text-slate-500">Review date</p><p className="text-xs text-slate-600">{formatReviewDate(review.updated_at || review.created_at)}</p></div>{review.comment ? <p className="mt-3 text-sm leading-6 text-slate-700">"{review.comment}"</p> : <p className="mt-3 text-sm text-slate-500">No written comment provided.</p>}</div> : null}<div className="flex flex-wrap gap-3"><Link to={`/details/${listing.id}`} className="inline-flex items-center gap-2 rounded-2xl border border-teal-200 bg-teal-50 px-4 py-2.5 text-sm font-semibold text-teal-800 transition hover:border-teal-300 hover:bg-teal-100"><ExternalLink className="h-4 w-4" />Open details</Link><span className={['inline-flex items-center rounded-2xl px-4 py-2.5 text-sm font-semibold', review ? 'border border-emerald-200 bg-emerald-50 text-emerald-700' : 'border border-slate-200 bg-slate-50 text-slate-600'].join(' ')}>{review ? 'Review submitted once' : 'Not reviewed yet'}</span></div></div></article>})}</div>}
      </section>
    </div>
  )
}
