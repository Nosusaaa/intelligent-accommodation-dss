import { useCallback, useEffect, useState } from 'react'
import { Check, Copy, Loader2, Search, Users, X } from 'lucide-react'
import { api } from '../../services/api'

const PAGE_SIZE = 20

function KpiCard({ label, value }) {
  return (
    <div className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-2 text-2xl font-bold tabular-nums text-slate-900">{value}</p>
    </div>
  )
}

function formatDt(v) {
  if (v == null || v === '') return '—'
  const s = String(v)
  return s.length > 16 ? s.replace('T', ' ').slice(0, 16) : s
}

export default function UserData() {
  const [stats, setStats] = useState(null)
  const [statsLoading, setStatsLoading] = useState(true)
  const [users, setUsers] = useState([])
  const [total, setTotal] = useState(0)
  const [listLoading, setListLoading] = useState(true)
  const [qInput, setQInput] = useState('')
  const [q, setQ] = useState('')
  const [page, setPage] = useState(0)
  const [error, setError] = useState('')
  const [detail, setDetail] = useState(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [copied, setCopied] = useState(false)

  const loadStats = useCallback(async () => {
    setStatsLoading(true)
    try {
      const data = await api.getAdminUserStats()
      setStats(data)
    } catch (e) {
      console.error(e)
    } finally {
      setStatsLoading(false)
    }
  }, [])

  const loadUsers = useCallback(async () => {
    setListLoading(true)
    setError('')
    try {
      const data = await api.getAdminUsers({
        q: q || undefined,
        limit: PAGE_SIZE,
        offset: page * PAGE_SIZE,
      })
      setUsers(Array.isArray(data?.users) ? data.users : [])
      setTotal(Number(data?.total) || 0)
    } catch (err) {
      setError(
        err?.response?.data?.detail || err?.message || 'Failed to load users.',
      )
      setUsers([])
      setTotal(0)
    } finally {
      setListLoading(false)
    }
  }, [q, page])

  useEffect(() => {
    loadStats()
  }, [loadStats])

  useEffect(() => {
    loadUsers()
  }, [loadUsers])

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE) || 1)

  const openDetail = async (userId) => {
    setDetail(null)
    setDetailLoading(true)
    setCopied(false)
    try {
      const data = await api.getAdminUser(userId)
      setDetail(data)
    } catch (err) {
      setDetail({
        error:
          err?.response?.data?.detail ||
          err?.message ||
          'Failed to load user.',
      })
    } finally {
      setDetailLoading(false)
    }
  }

  const closeDetail = () => {
    setDetail(null)
    setCopied(false)
  }

  const copyDetailJson = async () => {
    if (!detail || detail.error) return
    const blob = {
      user: detail.user,
      stays: detail.stays,
      favorites: detail.favorites,
      stay_reviews: detail.stay_reviews,
      favorites_truncated: detail.favorites_truncated,
    }
    try {
      await navigator.clipboard.writeText(JSON.stringify(blob, null, 2))
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // ignore
    }
  }

  const handleSearch = (e) => {
    e.preventDefault()
    setPage(0)
    setQ(qInput.trim())
  }

  return (
    <div className="space-y-6">
      <div>
        <div className="flex items-center gap-2 text-teal-700">
          <Users className="h-5 w-5" aria-hidden />
          <span className="text-xs font-bold uppercase tracking-widest">
            User data
          </span>
        </div>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight text-slate-900">
          Guests &amp; activity
        </h1>
        <p className="mt-1 max-w-3xl text-sm text-slate-600">
          Read-only overview of guest accounts, stayed listings, favorites, and
          post-stay reviews. Passwords are never exposed.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {statsLoading ? (
          <div className="col-span-full flex justify-center py-8">
            <Loader2 className="h-8 w-8 animate-spin text-teal-600" />
          </div>
        ) : (
          <>
            <KpiCard
              label="Total registered guests"
              value={stats?.total_users ?? '—'}
            />
            <KpiCard
              label="Users with at least one stay"
              value={stats?.users_with_stays ?? '—'}
            />
            <KpiCard
              label="Users with at least one favorite"
              value={stats?.users_with_favorites ?? '—'}
            />
            <KpiCard
              label="Post-stay reviews"
              value={stats?.total_stay_reviews ?? '—'}
            />
          </>
        )}
      </div>

      <div className="rounded-2xl border border-slate-100 bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">Guest list</h2>
            <p className="mt-1 text-sm text-slate-500">
              Filter by email. Showing {users.length} of {total} match
              {total === 1 ? '' : 'es'}.
            </p>
          </div>
          <form onSubmit={handleSearch} className="flex w-full max-w-md gap-2">
            <div className="relative min-w-0 flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                type="search"
                value={qInput}
                onChange={(e) => setQInput(e.target.value)}
                placeholder="Search by email…"
                className="w-full rounded-xl border border-slate-200 py-2.5 pl-10 pr-3 text-sm text-slate-900 outline-none focus:border-teal-300 focus:ring-2 focus:ring-teal-500/20"
              />
            </div>
            <button
              type="submit"
              className="shrink-0 rounded-xl bg-teal-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-teal-700"
            >
              Search
            </button>
          </form>
        </div>

        {error ? (
          <p className="mt-4 text-sm font-medium text-red-600" role="alert">
            {error}
          </p>
        ) : null}

        <div className="mt-6 overflow-x-auto rounded-xl border border-slate-100">
          <table className="min-w-full divide-y divide-slate-100 text-left text-sm">
            <thead className="bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3">ID</th>
                <th className="px-4 py-3">Email</th>
                <th className="px-4 py-3">Full name</th>
                <th className="px-4 py-3">Created</th>
                <th className="px-4 py-3">Top vibe tag</th>
                <th className="px-4 py-3 text-right">Fav</th>
                <th className="px-4 py-3 text-right">Stays</th>
                <th className="px-4 py-3 text-right">Reviews</th>
                <th className="px-4 py-3 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 bg-white">
              {listLoading ? (
                <tr>
                  <td colSpan={9} className="px-4 py-12 text-center text-slate-500">
                    <Loader2 className="mx-auto h-6 w-6 animate-spin text-teal-600" />
                  </td>
                </tr>
              ) : users.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-4 py-10 text-center text-slate-500">
                    No guests match this filter.
                  </td>
                </tr>
              ) : (
                users.map((u) => (
                  <tr key={u.id} className="hover:bg-slate-50/80">
                    <td className="whitespace-nowrap px-4 py-3 font-mono text-slate-700">
                      {u.id}
                    </td>
                    <td className="max-w-[200px] truncate px-4 py-3 text-slate-900">
                      {u.email}
                    </td>
                    <td className="max-w-[140px] truncate px-4 py-3 text-slate-700">
                      {u.full_name || '—'}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-slate-600">
                      {formatDt(u.created_at)}
                    </td>
                    <td className="max-w-[120px] truncate px-4 py-3 text-slate-600">
                      {u.top_vibe_tag || '—'}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-slate-700">
                      {u.favorite_count ?? 0}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-slate-700">
                      {u.stay_count ?? 0}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-slate-700">
                      {u.stay_review_count ?? 0}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        type="button"
                        onClick={() => openDetail(u.id)}
                        className="rounded-lg border border-teal-200 bg-teal-50 px-3 py-1.5 text-xs font-semibold text-teal-800 hover:bg-teal-100"
                      >
                        View
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-sm text-slate-600">
          <span>
            Page {page + 1} of {totalPages}
          </span>
          <div className="flex gap-2">
            <button
              type="button"
              disabled={page <= 0 || listLoading}
              onClick={() => setPage((p) => Math.max(0, p - 1))}
              className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 font-medium hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Previous
            </button>
            <button
              type="button"
              disabled={page + 1 >= totalPages || listLoading}
              onClick={() => setPage((p) => p + 1)}
              className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 font-medium hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Next
            </button>
          </div>
        </div>
      </div>

      {(detail || detailLoading) && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-sm"
          role="presentation"
          onClick={closeDetail}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="user-detail-title"
            className="max-h-[90vh] w-full max-w-4xl overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-4 border-b border-slate-100 px-6 py-4">
              <h2
                id="user-detail-title"
                className="text-lg font-semibold text-slate-900"
              >
                Guest detail
              </h2>
              <div className="flex shrink-0 items-center gap-2">
                {detail && !detail.error ? (
                  <button
                    type="button"
                    onClick={copyDetailJson}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                  >
                    {copied ? (
                      <Check className="h-3.5 w-3.5 text-teal-600" />
                    ) : (
                      <Copy className="h-3.5 w-3.5" />
                    )}
                    {copied ? 'Copied' : 'Copy JSON'}
                  </button>
                ) : null}
                <button
                  type="button"
                  onClick={closeDetail}
                  className="rounded-lg border border-slate-200 p-2 text-slate-600 hover:bg-slate-50"
                  aria-label="Close"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
            </div>
            <div className="max-h-[calc(90vh-4rem)] overflow-y-auto px-6 py-4">
              {detailLoading ? (
                <div className="flex justify-center py-16">
                  <Loader2 className="h-8 w-8 animate-spin text-teal-600" />
                </div>
              ) : detail?.error ? (
                <p className="text-sm text-red-600">{detail.error}</p>
              ) : (
                <div className="space-y-8">
                  <div className="rounded-xl border border-slate-100 bg-slate-50/80 p-4 text-sm">
                    <dl className="grid gap-2 sm:grid-cols-2">
                      <div>
                        <dt className="text-xs font-semibold uppercase text-slate-500">
                          ID
                        </dt>
                        <dd className="font-mono text-slate-900">
                          {detail.user?.id}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-xs font-semibold uppercase text-slate-500">
                          Email
                        </dt>
                        <dd className="text-slate-900">{detail.user?.email}</dd>
                      </div>
                      <div>
                        <dt className="text-xs font-semibold uppercase text-slate-500">
                          Full name
                        </dt>
                        <dd className="text-slate-900">
                          {detail.user?.full_name || '—'}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-xs font-semibold uppercase text-slate-500">
                          Created
                        </dt>
                        <dd className="text-slate-700">
                          {formatDt(detail.user?.created_at)}
                        </dd>
                      </div>
                      <div className="sm:col-span-2">
                        <dt className="text-xs font-semibold uppercase text-slate-500">
                          Top vibe tag
                        </dt>
                        <dd className="text-slate-700">
                          {detail.user?.top_vibe_tag || '—'}
                        </dd>
                      </div>
                    </dl>
                  </div>

                  <section>
                    <h3 className="text-sm font-bold uppercase tracking-wide text-slate-500">
                      Stayed listings
                    </h3>
                    {detail.stays?.length ? (
                      <ul className="mt-2 divide-y divide-slate-100 rounded-xl border border-slate-100">
                        {detail.stays.map((s, idx) => (
                          <li
                            key={`stay-${s.listing_id}-${idx}`}
                            className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-sm"
                          >
                            <span className="font-medium text-slate-900">
                              {s.listing_name}
                            </span>
                            <span className="font-mono text-xs text-slate-500">
                              #{s.listing_id}
                            </span>
                            <span className="text-xs text-slate-500">
                              Stayed {formatDt(s.stayed_at || s.created_at)}
                            </span>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="mt-2 text-sm text-slate-500">No stays.</p>
                    )}
                  </section>

                  <section>
                    <h3 className="text-sm font-bold uppercase tracking-wide text-slate-500">
                      Favorites
                    </h3>
                    {detail.favorites?.length ? (
                      <>
                        <ul className="mt-2 divide-y divide-slate-100 rounded-xl border border-slate-100">
                          {detail.favorites.map((f, idx) => (
                            <li
                              key={`fav-${f.listing_id}-${idx}`}
                              className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-sm"
                            >
                              <span className="font-medium text-slate-900">
                                {f.listing_name}
                              </span>
                              <span className="font-mono text-xs text-slate-500">
                                #{f.listing_id}
                              </span>
                            </li>
                          ))}
                        </ul>
                        {detail.favorites_truncated ? (
                          <p className="mt-2 text-xs text-amber-700">
                            Showing first {detail.favorites_limit} favorites only.
                          </p>
                        ) : null}
                      </>
                    ) : (
                      <p className="mt-2 text-sm text-slate-500">
                        No favorites.
                      </p>
                    )}
                  </section>

                  <section>
                    <h3 className="text-sm font-bold uppercase tracking-wide text-slate-500">
                      Post-stay reviews
                    </h3>
                    {detail.stay_reviews?.length ? (
                      <div className="mt-2 space-y-3">
                        {detail.stay_reviews.map((r) => (
                          <div
                            key={r.id}
                            className="rounded-xl border border-slate-100 bg-slate-50/50 p-4 text-sm"
                          >
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <span className="font-semibold text-slate-900">
                                {r.listing_name}
                              </span>
                              <span className="text-teal-700">
                                Overall {r.overall_rating}/5
                              </span>
                            </div>
                            <p className="mt-1 font-mono text-xs text-slate-500">
                              Listing #{r.listing_id} · Updated{' '}
                              {formatDt(r.updated_at || r.created_at)}
                            </p>
                            {r.comment ? (
                              <p className="mt-2 text-slate-700">
                                &ldquo;{r.comment}&rdquo;
                              </p>
                            ) : null}
                            <details className="mt-2">
                              <summary className="cursor-pointer text-xs font-semibold text-teal-700">
                                Raw review JSON
                              </summary>
                              <pre className="mt-2 max-h-40 overflow-auto rounded-lg bg-slate-900 p-3 text-xs text-slate-100">
                                {JSON.stringify(r, null, 2)}
                              </pre>
                            </details>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="mt-2 text-sm text-slate-500">
                        No post-stay reviews.
                      </p>
                    )}
                  </section>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
