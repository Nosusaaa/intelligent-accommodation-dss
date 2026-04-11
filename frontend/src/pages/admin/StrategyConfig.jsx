import { useCallback, useEffect, useMemo, useState } from 'react'
import { Loader2, Save, SlidersHorizontal } from 'lucide-react'
import { SUGGESTED_VIBE_TAGS } from '../../constants/suggestedVibeTags.js'
import { api } from '../../services/api'

const DEFAULT_PREF_JSON = JSON.stringify(
  {
    'Cozy & Homey': 4,
    'Modern & Updated': 3,
  },
  null,
  2,
)

function WeightSlider({ label, value, onChange }) {
  return (
    <div>
      <div className="flex items-center justify-between gap-3">
        <span className="text-sm font-medium text-slate-800">{label}</span>
        <span className="rounded-md bg-teal-50 px-2.5 py-0.5 font-mono text-sm font-semibold tabular-nums text-teal-800 ring-1 ring-teal-100">
          {value}
        </span>
      </div>
      <input
        type="range"
        min={0}
        max={100}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="mt-3 h-2 w-full cursor-pointer appearance-none rounded-full bg-slate-200 [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-white [&::-webkit-slider-thumb]:bg-teal-600 [&::-webkit-slider-thumb]:shadow-md [&::-moz-range-thumb]:h-4 [&::-moz-range-thumb]:w-4 [&::-moz-range-thumb]:cursor-pointer [&::-moz-range-thumb]:appearance-none [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border-2 [&::-moz-range-thumb]:border-white [&::-moz-range-thumb]:bg-teal-600"
        style={{
          background: `linear-gradient(to right, rgb(13 148 136) 0%, rgb(13 148 136) ${value}%, rgb(226 232 240) ${value}%, rgb(226 232 240) 100%)`,
        }}
      />
    </div>
  )
}

export default function StrategyConfig() {
  const [scenic, setScenic] = useState(28)
  const [cost, setCost] = useState(24)
  const [sentiment, setSentiment] = useState(26)
  const [preference, setPreference] = useState(22)
  const [prefJsonText, setPrefJsonText] = useState(DEFAULT_PREF_JSON)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saveSuccess, setSaveSuccess] = useState(false)
  const [lastSaved, setLastSaved] = useState(null)
  const [previewRows, setPreviewRows] = useState([])
  const [previewLoading, setPreviewLoading] = useState(false)
  const [previewMeta, setPreviewMeta] = useState(null)

  const refreshPreview = useCallback(async () => {
    setPreviewLoading(true)
    try {
      const data = await api.getStrategyPreviewRanking({ limit: 6 })
      setPreviewRows(Array.isArray(data?.rankings) ? data.rankings : [])
      setPreviewMeta({
        poiCount: data?.poi_count ?? 0,
        listingCount: data?.listing_count ?? 0,
      })
    } catch (err) {
      console.error('Preview ranking failed:', err)
      setPreviewRows([])
      setPreviewMeta(null)
    } finally {
      setPreviewLoading(false)
    }
  }, [])

  useEffect(() => {
    api
      .getStrategy()
      .then((config) => {
        setScenic(config.scenic_weight)
        setCost(config.cost_weight)
        setSentiment(config.sentiment_weight)
        setPreference(config.preference_weight)
        const tags = config.default_preference_tags
        if (tags && typeof tags === 'object') {
          setPrefJsonText(JSON.stringify(tags, null, 2))
        }
        if (config.updated_at) {
          setLastSaved(config.updated_at)
        }
      })
      .catch((err) => console.error('Failed to load strategy config:', err))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    if (loading) return
    refreshPreview()
  }, [loading, lastSaved, refreshPreview])

  const parsedDefaultPrefs = useMemo(() => {
    try {
      const o = JSON.parse(prefJsonText)
      if (!o || typeof o !== 'object' || Array.isArray(o)) return null
      const out = {}
      for (const [k, v] of Object.entries(o)) {
        const iv = Number(v)
        if (typeof k === 'string' && k.trim() && Number.isFinite(iv) && iv > 0) {
          out[k.trim()] = Math.round(iv)
        }
      }
      return out
    } catch {
      return null
    }
  }, [prefJsonText])

  const handleSave = async () => {
    if (!parsedDefaultPrefs || Object.keys(parsedDefaultPrefs).length === 0) {
      alert(
        'Default preference must be a JSON object of Suggested tag names → positive scores, e.g. {"Cozy & Homey": 4}.',
      )
      return
    }
    setSaving(true)
    setSaveSuccess(false)
    try {
      const result = await api.updateStrategy({
        scenic_weight: scenic,
        cost_weight: cost,
        sentiment_weight: sentiment,
        preference_weight: preference,
        default_preference_tags: parsedDefaultPrefs,
      })
      setLastSaved(result.updated_at)
      setSaveSuccess(true)
      setTimeout(() => setSaveSuccess(false), 3000)
    } catch (err) {
      console.error('Failed to save strategy config:', err)
      alert('Failed to save configuration. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-teal-600" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div>
        <div className="flex items-center gap-2 text-teal-700">
          <SlidersHorizontal className="h-5 w-5" aria-hidden />
          <span className="text-xs font-bold uppercase tracking-widest">
            Strategy engine
          </span>
        </div>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight text-slate-900">
          Ranking & weights
        </h1>
        <p className="mt-1 max-w-xl text-sm text-slate-500">
          Weights apply to all dimensions. “Area amenities” merges transport, parks, restaurants,
          schools, and hospitals from the offline POI cache. Default vibe JSON must use the same
          labels as Smart Search “Suggested tags” (canonical `vibe_tags` strings) so Preference
          Match lines up with listings; it is used for Admin preview and for guests until they save
          their own preferences.
          {lastSaved && (
            <span className="ml-2 text-slate-400">
              Last saved: {new Date(lastSaved).toLocaleString()}
            </span>
          )}
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-2 lg:gap-8">
        <section className="col-span-1 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-base font-semibold text-slate-900">
            Algorithm Weights (0-100)
          </h2>
          <div className="mt-6 space-y-5">
            <WeightSlider
              label="Area amenities (merged POI)"
              value={scenic}
              onChange={setScenic}
            />
            <WeightSlider
              label="Cost efficiency"
              value={cost}
              onChange={setCost}
            />
            <WeightSlider
              label="Sentiment score"
              value={sentiment}
              onChange={setSentiment}
            />
            <WeightSlider
              label="Vibe preference match"
              value={preference}
              onChange={setPreference}
            />
          </div>

          <div className="mt-8">
            <label className="block text-sm font-medium text-slate-800">
              Default vibe preferences (JSON)
            </label>
            <p className="mt-1 text-xs text-slate-500">
              Keys must be the same strings as client <strong className="font-medium text-slate-700">Suggested tags</strong>{' '}
              (see list below) — they match <code className="rounded bg-slate-100 px-1">vibe_tags</code> on
              listings. Logged-in users use onboarding scores instead; this JSON is the guest fallback
              and drives this preview after save.
            </p>
            <details className="mt-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-600">
              <summary className="cursor-pointer font-medium text-slate-700">Suggested tag labels</summary>
              <ul className="mt-2 grid max-h-32 grid-cols-1 gap-1 overflow-y-auto sm:grid-cols-2">
                {SUGGESTED_VIBE_TAGS.map((t) => (
                  <li key={t} className="font-mono text-[11px] text-slate-600">
                    {t}
                  </li>
                ))}
              </ul>
            </details>
            <textarea
              value={prefJsonText}
              onChange={(e) => setPrefJsonText(e.target.value)}
              rows={6}
              spellCheck={false}
              className="mt-2 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 font-mono text-xs text-slate-800 focus:border-teal-500 focus:outline-none focus:ring-1 focus:ring-teal-500"
            />
            {parsedDefaultPrefs == null && (
              <p className="mt-1 text-xs text-amber-700">Invalid JSON — fix before saving.</p>
            )}
          </div>

          <button
            type="button"
            onClick={handleSave}
            disabled={saving || parsedDefaultPrefs == null}
            className="mt-8 flex w-full items-center justify-center gap-2 rounded-xl bg-teal-600 px-4 py-3 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-teal-700 disabled:opacity-60"
          >
            {saving ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Saving...
              </>
            ) : saveSuccess ? (
              <>
                <Save className="h-4 w-4" />
                Saved!
              </>
            ) : (
              <>
                <Save className="h-4 w-4" />
                Save Configuration
              </>
            )}
          </button>
        </section>

        <section className="col-span-1 rounded-2xl border border-slate-200 bg-slate-100 p-5 shadow-inner lg:min-h-[420px]">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-600">
            Live preview (real listings)
          </h2>
          <p className="mt-1 text-xs text-slate-500">
            Uses last saved weights and default vibe tags, merged POI cache, and up to 6 listings with
            coordinates. Save to refresh after editing weights or JSON.
          </p>
          {previewMeta && (
            <p className="mt-1 text-[11px] text-slate-400">
              POIs loaded: {previewMeta.poiCount} · Listings ranked: {previewMeta.listingCount}
            </p>
          )}
          {previewLoading ? (
            <div className="mt-8 flex justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-teal-600" />
            </div>
          ) : (
            <ul className="mt-5 max-h-[480px] space-y-3 overflow-y-auto pr-1">
              {previewRows.map((p, i) => (
                <li
                  key={p.id}
                  className="flex items-center gap-3 rounded-xl border border-slate-200/80 bg-white p-3 shadow-sm"
                >
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-slate-800 text-[11px] font-bold text-white">
                    {i + 1}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-slate-900">
                      {p.name || 'Listing'}
                    </p>
                    <p className="truncate text-xs text-slate-500">
                      {p.neighbourhood_cleansed || '—'}
                    </p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="text-[10px] font-medium uppercase tracking-wide text-slate-400">
                      Match
                    </p>
                    <p className="text-xl font-bold tabular-nums text-teal-600">{p.score}%</p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  )
}
