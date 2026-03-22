import { useEffect, useId, useState } from 'react'
import { Loader2, Pencil, Plus, Search, Trash2, X } from 'lucide-react'
import { api } from '../../services/api'

function thumbnailSrc(seed) {
  return `https://picsum.photos/seed/${encodeURIComponent(seed)}/96/64`
}

export default function ScenicManagement() {
  const [query, setQuery] = useState('')
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [editingId, setEditingId] = useState(null)
  const [formName, setFormName] = useState('')
  const [formDesc, setFormDesc] = useState('')
  const [formRadius, setFormRadius] = useState(8)
  const [saving, setSaving] = useState(false)
  const titleId = useId()
  const descId = useId()

  // Load scenic spots from backend
  useEffect(() => {
    api.getScenics()
      .then(setRows)
      .catch((err) => console.error('Failed to load scenic spots:', err))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    if (!drawerOpen) return
    const onKey = (e) => {
      if (e.key === 'Escape') {
        setDrawerOpen(false)
        setEditingId(null)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [drawerOpen])

  const filtered = rows.filter((r) =>
    r.name?.toLowerCase().includes(query.trim().toLowerCase()),
  )

  const openAddDrawer = () => {
    setEditingId(null)
    setFormName('')
    setFormDesc('')
    setFormRadius(8)
    setDrawerOpen(true)
  }

  const openEditDrawer = (scenic) => {
    setEditingId(scenic.id)
    setFormName(scenic.name || '')
    setFormDesc(scenic.description || '')
    setFormRadius(scenic.radius_km || 8)
    setDrawerOpen(true)
  }

  const handleSave = async (e) => {
    e.preventDefault()
    setSaving(true)
    try {
      if (editingId) {
        const updated = await api.updateScenic(editingId, {
          name: formName.trim() || 'Untitled scenic spot',
          description: formDesc.trim(),
          radius_km: formRadius,
        })
        setRows((prev) => prev.map((r) => r.id === editingId ? { ...r, ...updated } : r))
      } else {
        const created = await api.createScenic({
          name: formName.trim() || 'Untitled scenic spot',
          description: formDesc.trim(),
          radius_km: formRadius,
        })
        setRows((prev) => [...prev, created])
      }
      setDrawerOpen(false)
      setEditingId(null)
    } catch (err) {
      console.error('Failed to save scenic spot:', err)
      alert('Failed to save. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  const remove = async (id) => {
    if (!confirm('Are you sure you want to delete this scenic spot?')) return
    try {
      await api.deleteScenic(id)
      setRows((prev) => prev.filter((r) => r.id !== id))
    } catch (err) {
      console.error('Failed to delete scenic spot:', err)
      alert('Failed to delete. Please try again.')
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
          Scenic management
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          Define scenic influence zones for ranking.
        </p>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative w-full sm:max-w-sm">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
            aria-hidden
          />
          <input
            type="search"
            placeholder="Search scenic spots…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="w-full rounded-xl border border-slate-200 bg-white py-2.5 pl-10 pr-3 text-sm text-slate-900 shadow-sm outline-none transition-all placeholder:text-slate-400 focus:border-teal-300 focus:ring-2 focus:ring-teal-500"
          />
        </div>
        <button
          type="button"
          onClick={openAddDrawer}
          className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl bg-teal-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-all duration-300 hover:bg-teal-700 hover:shadow-md"
        >
          <Plus className="h-4 w-4" aria-hidden />
          Add New Scenic Spot
        </button>
      </div>

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-teal-600" />
          </div>
        ) : filtered.length === 0 ? (
          <p className="px-5 py-10 text-center text-sm text-slate-500">
            No scenic spots match your search.
          </p>
        ) : (
          <table className="w-full border-collapse text-left text-sm">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500">
                <th className="px-5 py-3">ID</th>
                <th className="px-5 py-3">Thumbnail</th>
                <th className="px-5 py-3">Name</th>
                <th className="px-5 py-3">Radius Rule (km)</th>
                <th className="px-5 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((row, idx) => (
                <tr
                  key={row.id}
                  className={idx % 2 === 1 ? 'bg-slate-50/80' : 'bg-white'}
                >
                  <td className="border-t border-slate-100 px-5 py-4 font-mono text-xs text-slate-600">
                    {row.id}
                  </td>
                  <td className="border-t border-slate-100 px-5 py-4">
                    <img
                      src={row.thumbnail_url || thumbnailSrc(row.id)}
                      alt=""
                      className="h-12 w-16 rounded-lg border border-slate-200 object-cover"
                    />
                  </td>
                  <td className="border-t border-slate-100 px-5 py-4 font-medium text-slate-900">
                    {row.name}
                  </td>
                  <td className="border-t border-slate-100 px-5 py-4 font-mono tabular-nums text-slate-700">
                    {Number.isInteger(row.radius_km)
                      ? row.radius_km
                      : row.radius_km?.toFixed(1)}
                  </td>
                  <td className="border-t border-slate-100 px-5 py-4 text-right">
                    <div className="flex justify-end gap-1">
                      <button
                        type="button"
                        title="Edit"
                        onClick={() => openEditDrawer(row)}
                        className="rounded-lg p-2 text-slate-500 transition-colors hover:bg-slate-100 hover:text-teal-700"
                      >
                        <Pencil className="h-4 w-4" aria-hidden />
                      </button>
                      <button
                        type="button"
                        title="Delete"
                        onClick={() => remove(row.id)}
                        className="rounded-lg p-2 text-slate-500 transition-colors hover:bg-red-50 hover:text-red-600"
                      >
                        <Trash2 className="h-4 w-4" aria-hidden />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {drawerOpen && (
        <>
          <button
            type="button"
            aria-label="Close drawer overlay"
            className="fixed inset-0 z-40 bg-slate-900/40 backdrop-blur-sm"
            onClick={() => {
              setDrawerOpen(false)
              setEditingId(null)
            }}
          />
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            aria-describedby={descId}
            className="fixed inset-y-0 right-0 z-50 flex w-full max-w-md flex-col border-l border-slate-200 bg-white shadow-2xl"
          >
            <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
              <div>
                <h2
                  id={titleId}
                  className="text-lg font-semibold text-slate-900"
                >
                  {editingId ? 'Edit scenic spot' : 'Add scenic spot'}
                </h2>
                <p id={descId} className="text-sm text-slate-500">
                  Scenic name, description, and radius rule.
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setDrawerOpen(false)
                  setEditingId(null)
                }}
                className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                aria-label="Close"
              >
                <X className="h-5 w-5" aria-hidden />
              </button>
            </div>

            <form
              onSubmit={handleSave}
              className="flex flex-1 flex-col overflow-y-auto p-5"
            >
              <div className="space-y-5">
                <div>
                  <label
                    htmlFor="scenic-name"
                    className="block text-sm font-medium text-slate-700"
                  >
                    Scenic name
                  </label>
                  <input
                    id="scenic-name"
                    value={formName}
                    onChange={(e) => setFormName(e.target.value)}
                    className="mt-1.5 w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm outline-none transition-all focus:border-teal-300 focus:ring-2 focus:ring-teal-500"
                    placeholder="e.g. North Ridge Vista"
                  />
                </div>
                <div>
                  <label
                    htmlFor="scenic-desc"
                    className="block text-sm font-medium text-slate-700"
                  >
                    Description
                  </label>
                  <textarea
                    id="scenic-desc"
                    rows={4}
                    value={formDesc}
                    onChange={(e) => setFormDesc(e.target.value)}
                    className="mt-1.5 w-full resize-none rounded-xl border border-slate-200 px-4 py-2.5 text-sm outline-none transition-all focus:border-teal-300 focus:ring-2 focus:ring-teal-500"
                    placeholder="Notes for operators…"
                  />
                </div>
                <div>
                  <div className="flex items-center justify-between text-sm font-medium text-slate-700">
                    <label htmlFor="scenic-radius">Radius rule (km)</label>
                    <span className="font-mono text-teal-700">
                      {Number.isInteger(formRadius)
                        ? formRadius
                        : formRadius.toFixed(1)}{' '}
                      km
                    </span>
                  </div>
                  <input
                    id="scenic-radius"
                    type="range"
                    min={1}
                    max={50}
                    step={0.5}
                    value={formRadius}
                    onChange={(e) => setFormRadius(Number(e.target.value))}
                    className="mt-3 h-2 w-full cursor-pointer appearance-none rounded-full bg-slate-200 accent-teal-600"
                  />
                  <div className="mt-1 flex justify-between text-xs text-slate-400">
                    <span>1 km</span>
                    <span>50 km</span>
                  </div>
                </div>
              </div>

              <div className="mt-auto flex gap-3 border-t border-slate-100 pt-5">
                <button
                  type="button"
                  onClick={() => {
                    setDrawerOpen(false)
                    setEditingId(null)
                  }}
                  className="flex-1 rounded-xl border border-slate-200 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="flex-1 rounded-xl bg-teal-600 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-teal-700 disabled:opacity-60"
                >
                  {saving ? 'Saving...' : (editingId ? 'Update spot' : 'Save spot')}
                </button>
              </div>
            </form>
          </div>
        </>
      )}
    </div>
  )
}
