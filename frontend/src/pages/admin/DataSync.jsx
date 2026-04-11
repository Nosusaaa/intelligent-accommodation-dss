import { useCallback, useEffect, useRef, useState } from 'react'
import { AlertCircle, CheckCircle, FileText, Loader2, RefreshCw, Trash2, UploadCloud, X, XCircle } from 'lucide-react'
import { api } from '../../services/api'

const SUPPORTED_TYPES = {
  listings: { label: 'Listings', keywords: ['listings', 'cleaned_listings', 'listing'], icon: '🏠' },
  calendar: { label: 'Calendar', keywords: ['calendar', 'calendars'], icon: '📅' },
  reviews: { label: 'Reviews', keywords: ['reviews', 'review'], icon: '⭐' },
  listing_tags: { label: 'Listing Tags', keywords: ['listing_tags', 'room_tags', 'tags'], icon: '🏷️' },
}

function getFileType(filename) {
  if (!filename) return null
  const lower = filename.toLowerCase()
  for (const [type, config] of Object.entries(SUPPORTED_TYPES)) {
    if (config.keywords.some(kw => lower.includes(kw))) {
      return type
    }
  }
  return null
}

function formatDate(dateStr) {
  if (!dateStr) return '-'
  try {
    return dateStr.replace('T', ' ').slice(0, 16)
  } catch {
    return dateStr
  }
}

function StatusBadge({ status }) {
  const styles = {
    success: 'bg-emerald-100 text-emerald-800 ring-emerald-200',
    partial: 'bg-amber-100 text-amber-800 ring-amber-200',
    error: 'bg-red-100 text-red-800 ring-red-200',
  }
  const labels = {
    success: 'Success',
    partial: 'Partial',
    error: 'Failed',
  }
  return (
    <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ${styles[status] || styles.error}`}>
      {labels[status] || status}
    </span>
  )
}

function ImportResult({ result, onClose }) {
  if (!result) return null

  const isSuccess = result.status !== 'error'
  const Icon = result.status === 'success' ? CheckCircle : result.status === 'partial' ? AlertCircle : XCircle

  return (
    <div className={`rounded-xl border p-4 ${
      result.status === 'success' ? 'border-emerald-200 bg-emerald-50' :
      result.status === 'partial' ? 'border-amber-200 bg-amber-50' :
      'border-red-200 bg-red-50'
    }`}>
      <div className="flex items-start gap-3">
        <Icon className={`h-5 w-5 mt-0.5 ${
          result.status === 'success' ? 'text-emerald-600' :
          result.status === 'partial' ? 'text-amber-600' :
          'text-red-600'
        }`} />
        <div className="flex-1">
          <h4 className="font-semibold text-slate-900">
            {result.status === 'success' ? 'Import Successful' :
             result.status === 'partial' ? 'Import Completed with Issues' :
             'Import Failed'}
          </h4>
          {result.message && (
            <p className="mt-1 text-sm text-slate-600">{result.message}</p>
          )}
          <div className="mt-3 grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
            <div className="bg-white/80 rounded-lg p-2 text-center">
              <div className="text-lg font-bold text-slate-900">{result.total_rows ?? result.total ?? 0}</div>
              <div className="text-xs text-slate-500">Total Rows</div>
            </div>
            <div className="bg-white/80 rounded-lg p-2 text-center">
              <div className="text-lg font-bold text-emerald-700">{result.inserted ?? result.records_updated ?? 0}</div>
              <div className="text-xs text-slate-500">Inserted</div>
            </div>
            <div className="bg-white/80 rounded-lg p-2 text-center">
              <div className="text-lg font-bold text-amber-700">{result.duplicates ?? 0}</div>
              <div className="text-xs text-slate-500">Duplicates</div>
            </div>
            <div className="bg-white/80 rounded-lg p-2 text-center">
              <div className="text-lg font-bold text-red-700">{result.invalid ?? result.errors ?? 0}</div>
              <div className="text-xs text-slate-500">Invalid</div>
            </div>
          </div>
          {result.errors && result.errors.length > 0 && (
            <div className="mt-3">
              <p className="text-xs font-medium text-red-700 mb-1">Error Details:</p>
              <ul className="text-xs text-red-600 space-y-0.5 max-h-20 overflow-y-auto">
                {result.errors.slice(0, 5).map((err, i) => (
                  <li key={i}>• {err}</li>
                ))}
                {result.errors.length > 5 && (
                  <li className="text-slate-500">... and {result.errors.length - 5} more</li>
                )}
              </ul>
            </div>
          )}
        </div>
        <button
          onClick={onClose}
          className="p-1 hover:bg-white/50 rounded-full transition-colors"
        >
          <X className="h-4 w-4 text-slate-500" />
        </button>
      </div>
    </div>
  )
}

export default function DataSync() {
  const [logs, setLogs] = useState([])
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [uploadProgress, setUploadProgress] = useState(0)
  const [selectedFile, setSelectedFile] = useState(null)
  const [importResult, setImportResult] = useState(null)
  const [isDragging, setIsDragging] = useState(false)
  const [clearConfirm, setClearConfirm] = useState(false)
  const fileInputRef = useRef(null)

  const loadData = useCallback(async () => {
    setLoading(true)
    try {
      const logsData = await api.getSyncLogs()
      setLogs(logsData || [])
    } catch (err) {
      console.error('Failed to load sync data:', err)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadData()
  }, [loadData])

  const handleFileSelect = (e) => {
    const file = e.target.files?.[0]
    if (file) {
      const ext = file.name.split('.').pop()?.toLowerCase()
      if (ext !== 'csv' && ext !== 'xlsx' && ext !== 'xls') {
        setImportResult({
          status: 'error',
          message: 'Invalid file format. Please upload a .csv or .xlsx file.',
          total: 0,
          inserted: 0,
          duplicates: 0,
          invalid: 0,
        })
        return
      }
      setSelectedFile(file)
      setImportResult(null)
    }
  }

  const handleDrop = useCallback((e) => {
    e.preventDefault()
    setIsDragging(false)
    const file = e.dataTransfer.files?.[0]
    if (file) {
      const ext = file.name.split('.').pop()?.toLowerCase()
      if (ext === 'csv' || ext === 'xlsx' || ext === 'xls') {
        setSelectedFile(file)
        setImportResult(null)
      } else {
        setImportResult({
          status: 'error',
          message: 'Invalid file format. Please upload a CSV or XLSX file.',
          total: 0,
          inserted: 0,
          duplicates: 0,
          invalid: 0,
        })
      }
    }
  }, [])

  const handleDragOver = useCallback((e) => {
    e.preventDefault()
    setIsDragging(true)
  }, [])

  const handleDragLeave = useCallback((e) => {
    e.preventDefault()
    setIsDragging(false)
  }, [])

  const handleUpload = async () => {
    if (!selectedFile) return

    const fileType = getFileType(selectedFile.name)
    if (!fileType) {
      setImportResult({
        status: 'error',
        message: 'Unsupported file type. Please upload a CSV file with supported naming (listings, calendar, reviews, or listing_tags).',
        total: 0,
        inserted: 0,
        duplicates: 0,
        invalid: 0,
      })
      return
    }

    setUploading(true)
    setUploadProgress(0)
    setImportResult(null)

    try {
      const result = await api.uploadSyncFile(selectedFile, (progress) => {
        setUploadProgress(progress)
      })

      const finalResult = {
        status: result.status === 'success' ? 'success' : 'error',
        message: result.message || `Successfully imported ${result.file_type} data`,
        total: result.total_rows || result.records_updated || 0,
        inserted: result.records_updated || 0,
        duplicates: result.duplicates || 0,
        invalid: result.invalid || 0,
        errors: result.errors || [],
      }

      setImportResult(finalResult)
      await loadData()
    } catch (err) {
      setImportResult({
        status: 'error',
        message: err.response?.data?.detail || err.message || 'Upload failed',
        total: 0,
        inserted: 0,
        duplicates: 0,
        invalid: 0,
        errors: [err.response?.data?.detail || err.message],
      })
    } finally {
      setUploading(false)
      setUploadProgress(0)
      setSelectedFile(null)
      if (fileInputRef.current) {
        fileInputRef.current.value = ''
      }
    }
  }

  const handleClearData = async () => {
    if (!clearConfirm) {
      setClearConfirm(true)
      setTimeout(() => setClearConfirm(false), 5000)
      return
    }

    try {
      await api.clearAllData()
      await loadData()
      setClearConfirm(false)
    } catch (err) {
      console.error('Failed to clear data:', err)
    }
  }

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
          Data Synchronization
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          Upload files to import or update listing data in the database.
        </p>
      </div>

      {/* Upload Section */}
      <div className="rounded-xl border border-slate-200 bg-white p-6">
        <div className="flex items-center gap-2 mb-4">
          <UploadCloud className="h-5 w-5 text-teal-600" />
          <h2 className="text-lg font-semibold text-slate-900">Upload CSV File</h2>
        </div>

        {/* Drop Zone */}
        <div
          onDrop={handleDrop}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          className={`relative border-2 border-dashed rounded-xl p-12 text-center transition-all ${
            isDragging
              ? 'border-teal-500 bg-teal-50'
              : selectedFile
              ? 'border-emerald-400 bg-emerald-50'
              : 'border-slate-300 hover:border-teal-400 hover:bg-slate-50'
          }`}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv,.xlsx,.xls"
            onChange={handleFileSelect}
            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
          />

          {selectedFile ? (
            <div className="space-y-2">
              <FileText className="h-12 w-12 mx-auto text-emerald-600" />
              <p className="font-medium text-slate-900">{selectedFile.name}</p>
              <p className="text-sm text-slate-500">
                {(selectedFile.size / 1024).toFixed(1)} KB
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              <UploadCloud className="h-12 w-12 mx-auto text-slate-400" />
              <p className="font-medium text-slate-700">
                Drag & drop CSV file here
              </p>
              <p className="text-sm text-slate-500">
                or click to browse files
              </p>
            </div>
          )}
        </div>

        {/* Required CSV Columns */}
        <div className="mt-4 p-4 bg-slate-50 rounded-lg">
          <h3 className="text-xs font-semibold text-slate-700 mb-2">Required CSV Columns</h3>
          <div className="grid sm:grid-cols-2 gap-2 text-xs text-slate-600">
            <p><strong>Listings:</strong> id, name, description, price_clean, latitude, longitude, accommodates, bedrooms, bathrooms_num</p>
            <p><strong>Calendar:</strong> listing_id, date, available, price</p>
            <p><strong>Reviews:</strong> listing_id, reviewer_name, review_date, review_text_cleaned</p>
            <p><strong>Listing Tags:</strong> listing_id, vibe_tags</p>
          </div>
        </div>

        {/* Upload Button */}
        <button
          onClick={handleUpload}
          disabled={!selectedFile || uploading}
          className="mt-6 w-full flex items-center justify-center gap-2 rounded-xl bg-teal-600 px-4 py-3 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-teal-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {uploading ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Uploading... {uploadProgress}%
            </>
          ) : (
            <>
              <UploadCloud className="h-4 w-4" />
              Upload & Import
            </>
          )}
        </button>

        {/* Progress Bar */}
        {uploading && (
          <div className="mt-3">
            <div className="h-2 overflow-hidden rounded-full bg-slate-200">
              <div
                className="h-full rounded-full bg-teal-600 transition-all duration-100"
                style={{ width: `${uploadProgress}%` }}
              />
            </div>
          </div>
        )}

        {/* Import Result */}
        {importResult && (
          <div className="mt-4">
            <ImportResult result={importResult} onClose={() => setImportResult(null)} />
          </div>
        )}
      </div>

      {/* Sync Logs Table */}
      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-100 bg-slate-50/80 px-5 py-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-sm font-semibold text-slate-900">Sync Logs</h2>
              <p className="text-xs text-slate-500">History of data import operations</p>
            </div>
            <button
              onClick={loadData}
              className="p-2 hover:bg-slate-100 rounded-lg transition-colors"
              title="Refresh"
            >
              <RefreshCw className="h-4 w-4 text-slate-500" />
            </button>
          </div>
        </div>

        <div className="overflow-x-auto">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-teal-600" />
            </div>
          ) : logs.length === 0 ? (
            <div className="px-5 py-12 text-center">
              <FileText className="h-12 w-12 mx-auto text-slate-300" />
              <p className="mt-3 text-sm text-slate-500">No sync logs yet.</p>
              <p className="text-xs text-slate-400">Upload a CSV file to start syncing data.</p>
            </div>
          ) : (
            <table className="w-full min-w-[800px] border-collapse text-sm">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500">
                  <th className="px-5 py-3 text-left">Date</th>
                  <th className="px-5 py-3 text-left">File Name</th>
                  <th className="px-5 py-3 text-left">File Type</th>
                  <th className="px-5 py-3 text-left">Status</th>
                  <th className="px-5 py-3 text-right">Total</th>
                  <th className="px-5 py-3 text-right">Inserted</th>
                  <th className="px-5 py-3 text-right">Duplicates</th>
                  <th className="px-5 py-3 text-right">Invalid</th>
                </tr>
              </thead>
              <tbody>
                {logs.map((row, idx) => (
                  <tr
                    key={row.id}
                    className={idx % 2 === 1 ? 'bg-slate-50/80' : 'bg-white'}
                  >
                    <td className="whitespace-nowrap px-5 py-3.5 font-mono text-xs text-slate-600">
                      {formatDate(row.date)}
                    </td>
                    <td className="px-5 py-3.5 text-slate-900 truncate max-w-[200px]">
                      {row.filename || '-'}
                    </td>
                    <td className="px-5 py-3.5">
                      <span className="inline-flex items-center gap-1 rounded bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-700">
                        {row.file_type}
                      </span>
                    </td>
                    <td className="px-5 py-3.5">
                      <StatusBadge status={row.status} />
                    </td>
                    <td className="whitespace-nowrap px-5 py-3.5 text-right tabular-nums text-slate-700">
                      {(row.total_rows || row.records_updated || 0).toLocaleString()}
                    </td>
                    <td className="whitespace-nowrap px-5 py-3.5 text-right tabular-nums text-emerald-700">
                      {(row.inserted || row.records_updated || 0).toLocaleString()}
                    </td>
                    <td className="whitespace-nowrap px-5 py-3.5 text-right tabular-nums text-amber-700">
                      {(row.duplicates || 0).toLocaleString()}
                    </td>
                    <td className="whitespace-nowrap px-5 py-3.5 text-right tabular-nums text-red-700">
                      {(row.invalid || 0).toLocaleString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Danger Zone */}
      <div className="rounded-xl border border-red-200 bg-white p-6">
        <div className="flex items-center gap-2 mb-4">
          <Trash2 className="h-5 w-5 text-red-600" />
          <h2 className="text-lg font-semibold text-slate-900">Danger Zone</h2>
        </div>
        <p className="text-sm text-slate-600 mb-4">
          Clear all listing data before a fresh import. This action cannot be undone.
        </p>
        <button
          onClick={handleClearData}
          className={`rounded-xl px-4 py-2.5 text-sm font-semibold transition-colors ${
            clearConfirm
              ? 'bg-red-600 text-white hover:bg-red-700'
              : 'bg-red-50 text-red-700 hover:bg-red-100 border border-red-200'
          }`}
        >
          {clearConfirm ? 'Click again to confirm' : 'Clear All Data'}
        </button>
      </div>
    </div>
  )
}
