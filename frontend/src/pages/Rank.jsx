import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { ListOrdered, Loader2, RefreshCw } from 'lucide-react'
import { api } from '../services/api'

const PREVIEW_LIMIT = 20

export default function Rank() {
  const [rows, setRows] = useState([])
  const [meta, setMeta] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const data = await api.getStrategyPreviewRanking({ limit: PREVIEW_LIMIT })
      setRows(Array.isArray(data?.rankings) ? data.rankings : [])
      setMeta({
        poiCount: data?.poi_count ?? 0,
        listingCount: data?.listing_count ?? 0,
        preferenceSource: data?.preference_source ?? '—',
      })
    } catch (err) {
      setError(
        err?.response?.data?.detail ||
          err?.message ||
          'Failed to load ranking.',
      )
      setRows([])
      setMeta(null)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex items-center gap-2 text-teal-700">
            <ListOrdered className="h-5 w-5" aria-hidden />
            <span className="text-xs font-bold uppercase tracking-widest">
              Strategy ranking
            </span>
          </div>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight text-slate-900">
            Rank
          </h1>
          <p className="mt-2 max-w-3xl text-sm text-slate-600">
            Same engine as the Admin Strategy &quot;Live preview&quot;: saved
            weights, default vibe-tag preferences, and merged POI cache. This is
            not the Smart Search list (which applies your filters, viewport,
            and onboarding preferences).
          </p>
          {meta ? (
            <p className="mt-2 text-xs text-slate-500">
              POIs loaded: {meta.poiCount} · Listings ranked:{' '}
              {meta.listingCount} · Preference source: {meta.preferenceSource}
            </p>
          ) : null}
        </div>
        <button
          type="button"
          onClick={load}
          disabled={loading}
          className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <RefreshCw
            className={['h-4 w-4', loading ? 'animate-spin' : ''].join(' ')}
            aria-hidden
          />
          Refresh
        </button>
      </div>

      <section className="rounded-2xl border border-slate-100 bg-white p-6 shadow-sm">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
          Top listings by match score
        </h2>

        {error ? (
          <p className="mt-4 text-sm font-medium text-red-600" role="alert">
            {error}
          </p>
        ) : null}

        {loading ? (
          <div className="mt-10 flex justify-center py-16">
            <Loader2 className="h-10 w-10 animate-spin text-teal-600" />
          </div>
        ) : rows.length === 0 ? (
          <p className="mt-6 text-sm text-slate-500">No rankings returned.</p>
        ) : (
          <ul className="mt-5 space-y-3">
            {rows.map((p, i) => (
              <li
                key={p.id}
                className="rounded-xl border border-slate-100 bg-slate-50/60 p-4 shadow-sm"
              >
                <div className="flex flex-wrap items-start gap-3 sm:flex-nowrap">
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-slate-800 text-xs font-bold text-white">
                    {i + 1}
                  </span>
                  <div className="min-w-0 flex-1">
                    <Link
                      to={`/details/${p.id}`}
                      className="text-sm font-semibold text-teal-800 underline-offset-2 hover:text-teal-900 hover:underline"
                    >
                      {p.name || 'Listing'}
                    </Link>
                    <p className="mt-0.5 truncate text-xs text-slate-500">
                      {p.neighbourhood_cleansed || '—'}
                    </p>
                  </div>
                  <div className="shrink-0 text-right sm:ml-auto">
                    <p className="text-[10px] font-medium uppercase tracking-wide text-slate-400">
                      Match
                    </p>
                    <p className="text-xl font-bold tabular-nums text-teal-600">
                      {p.score}%
                    </p>
                    <Link
                      to={`/details/${p.id}`}
                      className="mt-1 inline-block text-xs font-medium text-slate-500 hover:text-teal-700"
                    >
                      View details
                    </Link>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}
