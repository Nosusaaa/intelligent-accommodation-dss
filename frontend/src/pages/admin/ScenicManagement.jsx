import { useCallback, useEffect, useState } from 'react'
import { Loader2, Pencil, Plus, Search, Trash2, X } from 'lucide-react'
import { api } from '../../services/api'

const EMPTY_FORM = {
  name: '',
  description: '',
  latitude: '',
  longitude: '',
  category: '',
}

function formatDate(value) {
  if (!value) return '-'
  try {
    return new Date(value).toLocaleString()
  } catch {
    return value
  }
}

export default function ScenicManagement() {
  const [query, setQuery] = useState('')
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [editingRow, setEditingRow] = useState(null)
  const [form, setForm] = useState(EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  const [searching, setSearching] = useState(false)

  const loadRows = useCallback(async (nameQuery = '') => {
    setSearching(true)
    try {
      const data = await api.getScenics(nameQuery.trim() ? { q: nameQuery.trim() } : {})
      setRows(Array.isArray(data) ? data : [])
    } catch (err) {
      console.error('Failed to load scenic spots:', err)
    } finally {
      setLoading(false)
      setSearching(false)
    }
  }, [])

  useEffect(() => {
    loadRows('')
  }, [loadRows])

  useEffect(() => {
    const timer = window.setTimeout(() => {
      loadRows(query)
    }, 250)
    return () => window.clearTimeout(timer)
  }, [query, loadRows])

  const resetForm = () => {
    setForm(EMPTY_FORM)
    setEditingRow(null)
  }

  const closeDrawer = () => {
    setDrawerOpen(false)
    resetForm()
  }

  const openAddDrawer = () => {
    resetForm()
    setDrawerOpen(true)
  }

  const openEditDrawer = (row) => {
    setEditingRow(row)
    setForm({
      name: row.name ?? '',
      description: row.description ?? '',
      latitude: row.latitude ?? '',
      longitude: row.longitude ?? '',
      category: row.category ?? '',
    })
    setDrawerOpen(true)
  }

  const handleChange = (key, value) => {
    setForm((prev) => ({ ...prev, [key]: value }))
  }

  const validateForm = () => {
    if (!form.name.trim()) return 'Please enter scenic spot name.'
    if (!form.category.trim()) return 'Please enter category.'
    if (form.latitude === '' || Number.isNaN(Number(form.latitude))) return 'Please enter valid latitude.'
    if (form.longitude === '' || Number.isNaN(Number(form.longitude))) return 'Please enter valid longitude.'
    return null
  }

  const buildPayload = () => ({
    name: form.name.trim(),
    description: form.description.trim(),
    latitude: Number(form.latitude),
    longitude: Number(form.longitude),
    category: form.category.trim(),
  })

  const handleSave = async (e) => {
    e.preventDefault()
    const error = validateForm()
    if (error) {
      alert(error)
      return
    }

    setSaving(true)
    try {
      if (editingRow) {
        await api.updateScenic(editingRow.id, buildPayload())
      } else {
        await api.createScenic(buildPayload())
      }
      closeDrawer()
      await loadRows(query)
    } catch (err) {
      console.error('Failed to save scenic spot:', err)
      alert(err?.response?.data?.detail || 'Failed to save scenic spot.')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (row) => {
    if (!window.confirm(`Are you sure you want to delete "${row.name}"?`)) return
    try {
      await api.deleteScenic(row.id)
      setRows((prev) => prev.filter((item) => item.id !== row.id))
    } catch (err) {
      console.error('Failed to delete scenic spot:', err)
      alert(err?.response?.data?.detail || 'Failed to delete scenic spot.')
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Scenic Spot Management</h1>
          <p className="mt-1 text-sm text-slate-500">Manage the scenic spot database for future map display.</p>
        </div>
        <button
          type="button"
          onClick={openAddDrawer}
          className="inline-flex items-center justify-center gap-2 rounded-xl bg-teal-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-teal-700"
        >
          <Plus className="h-4 w-4" aria-hidden />
          Add Scenic Spot
        </button>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="relative max-w-md">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by scenic spot name"
            className="w-full rounded-xl border border-slate-200 bg-white py-2.5 pl-10 pr-10 text-sm text-slate-900 outline-none transition-all placeholder:text-slate-400 focus:border-teal-300 focus:ring-2 focus:ring-teal-500"
          />
          {searching && <Loader2 className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-teal-600" />}
        </div>
      </div>

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        {loading ? (
          <div className="flex items-center justify-center py-14">
            <Loader2 className="h-6 w-6 animate-spin text-teal-600" />
          </div>
        ) : rows.length === 0 ? (
          <div className="px-6 py-14 text-center text-sm text-slate-500">No scenic spots found.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full border-collapse text-left text-sm">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500">
                  <th className="px-4 py-3">ID</th>
                  <th className="px-4 py-3">Name</th>
                  <th className="px-4 py-3">Category</th>
                  <th className="px-4 py-3">Latitude</th>
                  <th className="px-4 py-3">Longitude</th>
                  <th className="px-4 py-3">Description</th>
                  <th className="px-4 py-3">Updated</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row, idx) => (
                  <tr key={row.id} className={idx % 2 ? 'bg-slate-50/70' : 'bg-white'}>
                    <td className="border-t border-slate-100 px-4 py-4 font-mono text-xs text-slate-600">{row.id}</td>
                    <td className="border-t border-slate-100 px-4 py-4 font-medium text-slate-900">{row.name}</td>
                    <td className="border-t border-slate-100 px-4 py-4 text-slate-700">{row.category || '-'}</td>
                    <td className="border-t border-slate-100 px-4 py-4 font-mono text-slate-700">{row.latitude ?? '-'}</td>
                    <td className="border-t border-slate-100 px-4 py-4 font-mono text-slate-700">{row.longitude ?? '-'}</td>
                    <td className="border-t border-slate-100 px-4 py-4 text-slate-600"><div className="max-w-xs truncate" title={row.description || ''}>{row.description || '-'}</div></td>
                    <td className="border-t border-slate-100 px-4 py-4 text-slate-500">{formatDate(row.updated_at || row.created_at)}</td>
                    <td className="border-t border-slate-100 px-4 py-4">
                      <div className="flex justify-end gap-1">
                        <button type="button" onClick={() => openEditDrawer(row)} className="rounded-lg p-2 text-slate-500 transition-colors hover:bg-slate-100 hover:text-teal-700" title="Edit">
                          <Pencil className="h-4 w-4" aria-hidden />
                        </button>
                        <button type="button" onClick={() => handleDelete(row)} className="rounded-lg p-2 text-slate-500 transition-colors hover:bg-red-50 hover:text-red-600" title="Delete">
                          <Trash2 className="h-4 w-4" aria-hidden />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {drawerOpen && (
        <>
          <button type="button" aria-label="Close overlay" className="fixed inset-0 z-40 bg-slate-900/40 backdrop-blur-sm" onClick={closeDrawer} />
          <div className="fixed inset-y-0 right-0 z-50 flex w-full max-w-lg flex-col border-l border-slate-200 bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
              <div>
                <h2 className="text-lg font-semibold text-slate-900">{editingRow ? 'Edit scenic spot' : 'Add scenic spot'}</h2>
                <p className="text-sm text-slate-500">Save basic scenic spot information into the database.</p>
              </div>
              <button type="button" onClick={closeDrawer} className="rounded-lg p-2 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700">
                <X className="h-5 w-5" aria-hidden />
              </button>
            </div>

            <form onSubmit={handleSave} className="flex flex-1 flex-col overflow-y-auto p-5">
              <div className="space-y-5">
                <div>
                  <label className="block text-sm font-medium text-slate-700">Scenic spot name</label>
                  <input value={form.name} onChange={(e) => handleChange('name', e.target.value)} className="mt-1.5 w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm outline-none transition-all focus:border-teal-300 focus:ring-2 focus:ring-teal-500" placeholder="e.g. Highland Park" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700">Description</label>
                  <textarea rows={4} value={form.description} onChange={(e) => handleChange('description', e.target.value)} className="mt-1.5 w-full resize-none rounded-xl border border-slate-200 px-4 py-2.5 text-sm outline-none transition-all focus:border-teal-300 focus:ring-2 focus:ring-teal-500" placeholder="Scenic spot description" />
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <label className="block text-sm font-medium text-slate-700">Latitude</label>
                    <input type="number" step="any" value={form.latitude} onChange={(e) => handleChange('latitude', e.target.value)} className="mt-1.5 w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm outline-none transition-all focus:border-teal-300 focus:ring-2 focus:ring-teal-500" placeholder="43.1566" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700">Longitude</label>
                    <input type="number" step="any" value={form.longitude} onChange={(e) => handleChange('longitude', e.target.value)} className="mt-1.5 w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm outline-none transition-all focus:border-teal-300 focus:ring-2 focus:ring-teal-500" placeholder="-77.6088" />
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700">Category</label>
                  <input value={form.category} onChange={(e) => handleChange('category', e.target.value)} className="mt-1.5 w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm outline-none transition-all focus:border-teal-300 focus:ring-2 focus:ring-teal-500" placeholder="park / museum / landmark" />
                </div>
              </div>

              <div className="mt-auto flex gap-3 border-t border-slate-100 pt-5">
                <button type="button" onClick={closeDrawer} className="flex-1 rounded-xl border border-slate-200 py-2.5 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-50">Cancel</button>
                <button type="submit" disabled={saving} className="flex-1 rounded-xl bg-teal-600 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-teal-700 disabled:opacity-60">{saving ? 'Saving...' : editingRow ? 'Update' : 'Create'}</button>
              </div>
            </form>
          </div>
        </>
      )}
    </div>
  )
}
