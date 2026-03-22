import { useEffect, useMemo, useState } from 'react'
import { Loader2, Save, SlidersHorizontal } from 'lucide-react'
import { api } from '../../services/api'

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
        className="mt-3 h-2 w-full cursor-pointer appearance-none rounded-full bg-slate-200 [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-white [&::-webkit-slider-thumb]:bg-teal-600 [&::-webkit-slider-thumb]:shadow-md [&::-moz-range-thumb]:h-4 [&::-moz-range-thumb]:w-4 [&::-moz-range-thumb]:cursor-pointer [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border-2 [&::-moz-range-thumb]:border-white [&::-moz-range-thumb]:bg-teal-600"
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
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saveSuccess, setSaveSuccess] = useState(false)
  const [lastSaved, setLastSaved] = useState(null)

  // Load strategy config from backend
  useEffect(() => {
    api.getStrategy()
      .then((config) => {
        setScenic(config.scenic_weight)
        setCost(config.cost_weight)
        setSentiment(config.sentiment_weight)
        setPreference(config.preference_weight)
        if (config.updated_at) {
          setLastSaved(config.updated_at)
        }
      })
      .catch((err) => console.error('Failed to load strategy config:', err))
      .finally(() => setLoading(false))
  }, [])

  const handleSave = async () => {
    setSaving(true)
    setSaveSuccess(false)
    try {
      const result = await api.updateStrategy({
        scenic_weight: scenic,
        cost_weight: cost,
        sentiment_weight: sentiment,
        preference_weight: preference,
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

  const weights = useMemo(
    () => ({ scenic, cost, sentiment, preference }),
    [scenic, cost, sentiment, preference],
  )

  // Deterministic "noise" from weights
  function scoreFluctuation(w, propertyId) {
    const key = `${w.scenic}|${w.cost}|${w.sentiment}|${w.preference}|${propertyId}`
    let h = 2166136261
    for (let i = 0; i < key.length; i++) {
      h ^= key.charCodeAt(i)
      h = Math.imul(h, 16777619)
    }
    const u = (h >>> 0) / 4294967296
    return (u - 0.5) * 8
  }

  // Demo properties for preview
  const demoProperties = useMemo(() => [
    { id: 'p1', name: 'Harbor View Loft', zone: 'Central · Waterfront', scenic: 94, cost: 62, sentiment: 91, preference: 88 },
    { id: 'p2', name: 'Garden Studio', zone: 'Riverside', scenic: 78, cost: 89, sentiment: 84, preference: 80 },
    { id: 'p3', name: 'Skyline Suite', zone: 'Uptown', scenic: 72, cost: 48, sentiment: 93, preference: 76 },
    { id: 'p4', name: 'Boutique Flat', zone: 'Old Town', scenic: 85, cost: 71, sentiment: 86, preference: 82 },
  ], [])

  const ranked = useMemo(() => {
    const sum = scenic + cost + sentiment + preference
    return demoProperties.map((p) => {
      if (sum <= 0) return { ...p, score: 0 }
      const base = (
        p.scenic * scenic +
        p.cost * cost +
        p.sentiment * sentiment +
        p.preference * preference
      ) / sum
      const jitter = scoreFluctuation(weights, p.id)
      const score = Math.min(100, Math.max(0, Math.round(base + jitter)))
      return { ...p, score }
    }).sort((a, b) => b.score - a.score)
  }, [weights, demoProperties])

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
          Adjust algorithm weights — live preview simulates real-time score updates.
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
              label="Scenic Proximity"
              value={scenic}
              onChange={setScenic}
            />
            <WeightSlider
              label="Cost Efficiency"
              value={cost}
              onChange={setCost}
            />
            <WeightSlider
              label="Sentiment Score"
              value={sentiment}
              onChange={setSentiment}
            />
            <WeightSlider
              label="Preference Match"
              value={preference}
              onChange={setPreference}
            />
          </div>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
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
            Live Preview Ranking
          </h2>
          <p className="mt-1 text-xs text-slate-500">
            Match scores refresh when weights change (includes simulated noise).
          </p>
          <ul className="mt-5 space-y-3">
            {ranked.map((p, i) => (
              <li
                key={p.id}
                className="flex items-center gap-3 rounded-xl border border-slate-200/80 bg-white p-3 shadow-sm"
              >
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-slate-800 text-[11px] font-bold text-white">
                  {i + 1}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-slate-900">
                    {p.name}
                  </p>
                  <p className="truncate text-xs text-slate-500">{p.zone}</p>
                </div>
                <div className="shrink-0 text-right">
                  <p className="text-[10px] font-medium uppercase tracking-wide text-slate-400">
                    Match score
                  </p>
                  <p className="text-xl font-bold tabular-nums text-teal-600">
                    {p.score}%
                  </p>
                </div>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  )
}
