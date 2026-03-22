import { useCallback, useEffect, useState } from 'react'
import { Loader2, UploadCloud } from 'lucide-react'
import { api } from '../../services/api'

function formatNow() {
  const d = new Date()
  const pad = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function StatusPill({ status }) {
  const ok = status === 'success'
  return (
    <span
      className={[
        'inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold',
        ok
          ? 'bg-emerald-100 text-emerald-800 ring-1 ring-emerald-200/80'
          : 'bg-red-100 text-red-800 ring-1 ring-red-200/80',
      ].join(' ')}
    >
      {ok ? 'Success' : 'Error'}
    </span>
  )
}

export default function DataSync() {
  const [logs, setLogs] = useState([])
  const [progress, setProgress] = useState(0)
  const [isSyncing, setIsSyncing] = useState(false)
  const [loading, setLoading] = useState(true)

  // Load sync logs from backend
  useEffect(() => {
    api.getSyncLogs()
      .then(setLogs)
      .catch((err) => console.error('Failed to load sync logs:', err))
      .finally(() => setLoading(false))
  }, [])

  const handleSync = useCallback(() => {
    if (isSyncing) return
    setIsSyncing(true)
    setProgress(0)
    const start = Date.now()

    const tick = () => {
      const elapsed = Date.now() - start
      const p = Math.min(100, (elapsed / 2000) * 100)
      setProgress(p)
      if (p >= 100) {
        setProgress(100)
        // Create sync log on backend
        api.createSyncLog({
          file_type: 'CSV',
          status: 'success',
          records_updated: Math.floor(200 + Math.random() * 800),
        })
          .then((newRow) => {
            setLogs((prev) => [newRow, ...prev])
          })
          .catch((err) => console.error('Failed to create sync log:', err))
          .finally(() => {
            setIsSyncing(false)
            setProgress(0)
          })
        return
      }
      requestAnimationFrame(tick)
    }

    requestAnimationFrame(tick)
  }, [isSyncing])

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
          Data Synchronization
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          Upload datasets to update the system.
        </p>
      </div>

      <div className="rounded-xl border-2 border-dashed border-slate-300 bg-white p-10 flex flex-col items-center text-center">
        <UploadCloud
          className="h-12 w-12 text-teal-600"
          strokeWidth={1.25}
          aria-hidden
        />
        <p className="mt-4 max-w-md text-sm font-medium text-slate-700">
          Drag & drop listings.csv and calendar.csv here
        </p>

        <button
          type="button"
          onClick={handleSync}
          disabled={isSyncing}
          className="mt-6 rounded-xl bg-teal-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition-all hover:bg-teal-700 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isSyncing ? 'Syncing…' : 'Simulate Sync'}
        </button>

        {isSyncing && (
          <div className="mt-6 w-full max-w-md">
            <div className="mb-1 flex justify-between text-xs text-slate-500">
              <span>Progress</span>
              <span className="tabular-nums">{Math.round(progress)}%</span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-slate-200">
              <div
                className="h-full rounded-full bg-teal-600 transition-[width] duration-75 ease-linear"
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>
        )}
      </div>

      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-100 bg-slate-50/80 px-5 py-4">
          <h2 className="text-sm font-semibold text-slate-900">Sync logs</h2>
          <p className="text-xs text-slate-500">Recent sync history</p>
        </div>
        <div className="overflow-x-auto">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-teal-600" />
            </div>
          ) : logs.length === 0 ? (
            <p className="px-5 py-10 text-center text-sm text-slate-500">
              No sync logs yet.
            </p>
          ) : (
            <table className="w-full min-w-[640px] border-collapse text-left text-sm">
              <thead>
                <tr className="border-b border-slate-100 text-xs font-semibold uppercase tracking-wide text-slate-500">
                  <th className="px-5 py-3">Date</th>
                  <th className="px-5 py-3">File Type</th>
                  <th className="px-5 py-3">Status</th>
                  <th className="px-5 py-3 text-right">Records Updated</th>
                </tr>
              </thead>
              <tbody>
                {logs.map((row, idx) => (
                  <tr
                    key={row.id}
                    className={idx % 2 === 1 ? 'bg-slate-50/80' : 'bg-white'}
                  >
                    <td className="whitespace-nowrap px-5 py-3.5 font-mono text-xs text-slate-600">
                      {row.date ? row.date.replace('T', ' ').slice(0, 16) : '-'}
                    </td>
                    <td className="px-5 py-3.5 font-medium text-slate-900">
                      {row.file_type}
                    </td>
                    <td className="px-5 py-3.5">
                      <StatusPill status={row.status} />
                    </td>
                    <td className="whitespace-nowrap px-5 py-3.5 text-right tabular-nums text-slate-800">
                      {row.records_updated.toLocaleString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </section>
    </div>
  )
}
