import { useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ArrowLeft, CheckCircle2, Clock3 } from 'lucide-react'
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'

const scenarios = [
  { id: 'peak', label: 'Peak' },
  { id: 'normal', label: 'Normal' },
  { id: 'off', label: 'Off Season' },
]

const priceTrendByScenario = {
  peak: [
    { month: 'Jan', price: 265 },
    { month: 'Feb', price: 278 },
    { month: 'Mar', price: 292 },
    { month: 'Apr', price: 305 },
    { month: 'May', price: 318 },
    { month: 'Jun', price: 332 },
  ],
  normal: [
    { month: 'Jan', price: 198 },
    { month: 'Feb', price: 205 },
    { month: 'Mar', price: 212 },
    { month: 'Apr', price: 218 },
    { month: 'May', price: 224 },
    { month: 'Jun', price: 230 },
  ],
  off: [
    { month: 'Jan', price: 142 },
    { month: 'Feb', price: 148 },
    { month: 'Mar', price: 155 },
    { month: 'Apr', price: 162 },
    { month: 'May', price: 168 },
    { month: 'Jun', price: 175 },
  ],
}

const suggestionByScenario = {
  peak: {
    action: 'wait',
    headline: 'Wait — prices are elevated',
    detail:
      'Demand is high; similar listings have softened 6–9% two months after peak windows.',
  },
  normal: {
    action: 'buy',
    headline: 'Buy — fair value window',
    detail:
      'Rates align with your budget curve; locking now avoids peak surcharges.',
  },
  off: {
    action: 'buy',
    headline: 'Buy — strongest value',
    detail:
      'Off-season discounts plus flexible cancellation make this the lowest-risk entry.',
  },
}

export default function ForecastDashboard() {
  const { id } = useParams()
  const propertyId = id ?? '123'
  const [activeScenario, setActiveScenario] = useState('normal')

  const chartData = priceTrendByScenario[activeScenario]
  const suggestion = suggestionByScenario[activeScenario]

  const gradientId = useMemo(() => {
    const safe = String(propertyId).replace(/[^a-zA-Z0-9_-]/g, '')
    return `priceTrendFill-${activeScenario}-${safe}`
  }, [activeScenario, propertyId])

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <Link
            to={`/details/${propertyId}`}
            className="inline-flex items-center gap-2 text-sm font-medium text-slate-600 transition-colors hover:text-teal-700"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden />
            Back to Details
          </Link>
          <p className="mt-4 text-sm font-medium text-slate-500">
            Forecast · listing {propertyId}
          </p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight text-slate-900">
            Price trend & timing
          </h1>
        </div>
        <div
          className="inline-flex shrink-0 rounded-xl bg-slate-100 p-1 shadow-inner"
          role="tablist"
          aria-label="Scenario selection"
        >
          {scenarios.map((s) => (
            <button
              key={s.id}
              type="button"
              role="tab"
              aria-selected={activeScenario === s.id}
              onClick={() => setActiveScenario(s.id)}
              className={[
                'rounded-lg px-4 py-2 text-sm font-semibold transition-all duration-300',
                activeScenario === s.id
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900',
              ].join(' ')}
            >
              {s.label}
            </button>
          ))}
        </div>
      </div>

      <div className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm sm:p-6">
        <p className="mb-1 text-sm font-medium text-slate-900">Price trend</p>
        <p className="mb-4 text-sm text-slate-500">
          Projected nightly rate (USD) — scenario:{' '}
          <span className="font-medium text-slate-700">
            {scenarios.find((x) => x.id === activeScenario)?.label}
          </span>
        </p>
        <div className="h-72 w-full sm:h-80">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart
              data={chartData}
              margin={{ top: 8, right: 8, left: 0, bottom: 0 }}
            >
              <defs>
                <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#0d9488" stopOpacity={0.35} />
                  <stop offset="95%" stopColor="#0d9488" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
              <XAxis
                dataKey="month"
                tick={{ fill: '#64748b', fontSize: 12 }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                tick={{ fill: '#64748b', fontSize: 12 }}
                axisLine={false}
                tickLine={false}
                tickFormatter={(v) => `$${v}`}
              />
              <Tooltip
                formatter={(v) => [`$${v}`, 'Price']}
                contentStyle={{
                  borderRadius: '12px',
                  border: '1px solid #f1f5f9',
                  boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.08)',
                }}
              />
              <Area
                type="monotone"
                dataKey="price"
                stroke="#0d9488"
                strokeWidth={2.5}
                fill={`url(#${gradientId})`}
                fillOpacity={1}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div
        className={[
          'rounded-2xl border p-6 shadow-sm sm:p-8',
          suggestion.action === 'buy'
            ? 'border-emerald-200 bg-gradient-to-br from-emerald-50 to-white'
            : 'border-amber-200 bg-gradient-to-br from-amber-50 to-white',
        ].join(' ')}
      >
        <div className="flex flex-col gap-6 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-4">
            {suggestion.action === 'buy' ? (
              <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-emerald-500 text-white shadow-lg shadow-emerald-500/25">
                <CheckCircle2 className="h-8 w-8" aria-hidden />
              </span>
            ) : (
              <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-amber-500 text-white shadow-lg shadow-amber-500/25">
                <Clock3 className="h-8 w-8" aria-hidden />
              </span>
            )}
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                Buy / wait suggestion
              </p>
              <p
                className={[
                  'mt-1 text-2xl font-bold tracking-tight sm:text-3xl',
                  suggestion.action === 'buy' ? 'text-emerald-900' : 'text-amber-900',
                ].join(' ')}
              >
                {suggestion.headline}
              </p>
              <p className="mt-2 max-w-xl text-sm leading-relaxed text-slate-600">
                {suggestion.detail}
              </p>
            </div>
          </div>
          <div className="shrink-0 rounded-xl border border-slate-100 bg-white/80 px-4 py-3 text-center text-sm text-slate-600 shadow-sm">
            <p className="font-semibold text-slate-900">Confidence</p>
            <p className="mt-1 text-2xl font-bold text-teal-700">87%</p>
          </div>
        </div>
      </div>
    </div>
  )
}
