import { Link } from 'react-router-dom'
import { Search, X } from 'lucide-react'
import {
  Legend,
  PolarAngleAxis,
  PolarGrid,
  PolarRadiusAxis,
  Radar,
  RadarChart,
  ResponsiveContainer,
  Tooltip,
} from 'recharts'
import { useCompare } from '../context/CompareContext.jsx'

/** Radar uses 0–100 scores; table shows human-readable values per property id. */
const KEY_CHARS = ['a', 'b', 'c', 'd', 'e']

const RADAR_DIMENSIONS = [
  {
    metric: 'Price',
    scores: { '123': 82, '124': 91, '125': 68, '126': 79 },
  },
  {
    metric: 'Rating',
    scores: { '123': 92, '124': 86, '125': 96, '126': 84 },
  },
  {
    metric: 'Capacity',
    scores: { '123': 78, '124': 65, '125': 88, '126': 80 },
  },
  {
    metric: 'Room Size',
    scores: { '123': 85, '124': 72, '125': 90, '126': 77 },
  },
  {
    metric: 'Scenic Score',
    scores: { '123': 94, '124': 80, '125': 72, '126': 88 },
  },
]

const TABLE_ROWS = [
  {
    label: 'Price (nightly)',
    values: { '123': '$212', '124': '$156', '125': '$289', '126': '$178' },
  },
  {
    label: 'Rating',
    values: { '123': '4.8', '124': '4.6', '125': '4.9', '126': '4.5' },
  },
  {
    label: 'Capacity',
    values: { '123': '2 guests', '124': '1 guest', '125': '3 guests', '126': '2 guests' },
  },
  {
    label: 'Room size',
    values: {
      '123': '58 m²',
      '124': '42 m²',
      '125': '72 m²',
      '126': '51 m²',
    },
  },
  {
    label: 'Scenic score',
    values: { '123': '94', '124': '80', '125': '72', '126': '88' },
  },
]

export default function RadarCompare() {
  const { items: tray, removeFromCompare } = useCompare()

  const keys = tray.map((t, i) => ({
    key: KEY_CHARS[i],
    name: t.name,
    color: t.color,
  }))

  const chartData = RADAR_DIMENSIONS.map((row) => {
    const out = { metric: row.metric }
    tray.forEach((t, i) => {
      out[KEY_CHARS[i]] = row.scores[t.id] ?? 70
    })
    return out
  })

  if (tray.length === 0) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
            Compare properties
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Price, rating, capacity, room size, and scenic score — side by side.
          </p>
        </div>

        <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-slate-200 bg-slate-50/80 px-6 py-16 text-center">
          <p className="text-lg font-semibold text-slate-900">No properties selected</p>
          <p className="mt-2 max-w-md text-sm text-slate-600">
            Add listings from search to build a comparison. Your tray syncs here
            automatically.
          </p>
          <Link
            to="/search"
            className="mt-8 inline-flex items-center gap-2 rounded-2xl bg-teal-600 px-6 py-3 text-sm font-semibold text-white shadow-sm transition-all duration-300 hover:-translate-y-0.5 hover:bg-teal-700 hover:shadow-md"
          >
            <Search className="h-4 w-4" aria-hidden />
            Back to search
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
          Compare properties
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          Radar and table update live as you edit the tray.
        </p>
      </div>

      <section aria-label="Compare tray">
        <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-400">
          Compare tray
        </p>
        <div className="flex flex-wrap gap-3">
          {tray.map((p) => (
            <div
              key={p.id}
              className="inline-flex min-w-[140px] items-center gap-3 rounded-xl border border-slate-200 bg-white px-3 py-2.5 shadow-sm"
            >
              <span
                className="h-8 w-8 shrink-0 rounded-lg ring-2 ring-white"
                style={{ backgroundColor: p.color }}
                aria-hidden
              />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-slate-900">
                  {p.name}
                </p>
                <p className="text-xs text-slate-500">ID {p.id}</p>
              </div>
              <button
                type="button"
                onClick={() => removeFromCompare(p.id)}
                className="shrink-0 rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-800"
                aria-label={`Remove ${p.name}`}
              >
                <X className="h-4 w-4" aria-hidden />
              </button>
            </div>
          ))}
        </div>
      </section>

      <section className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm sm:p-6">
        <p className="mb-4 text-sm font-medium text-slate-700">
          Multi-axis radar (normalized 0–100)
        </p>
        <div className="h-[340px] w-full sm:h-[400px]">
          <ResponsiveContainer width="100%" height="100%">
            <RadarChart cx="50%" cy="50%" outerRadius="75%" data={chartData}>
              <PolarGrid stroke="#e2e8f0" />
              <PolarAngleAxis
                dataKey="metric"
                tick={{ fill: '#64748b', fontSize: 11 }}
              />
              <PolarRadiusAxis angle={30} domain={[0, 100]} tick={false} />
              <Tooltip
                formatter={(value) => [`${value}`, 'Score']}
                contentStyle={{
                  borderRadius: '12px',
                  border: '1px solid #f1f5f9',
                  boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.08)',
                }}
              />
              {keys.map((k) => (
                <Radar
                  key={k.key}
                  name={k.name}
                  dataKey={k.key}
                  stroke={k.color}
                  fill={k.color}
                  fillOpacity={0.4}
                  strokeWidth={2}
                />
              ))}
              <Legend
                wrapperStyle={{ paddingTop: 16 }}
                formatter={(value) => (
                  <span className="text-xs text-slate-600">{value}</span>
                )}
              />
            </RadarChart>
          </ResponsiveContainer>
        </div>
      </section>

      <section className="overflow-hidden rounded-2xl border border-slate-100 bg-white shadow-sm">
        <div className="border-b border-slate-100 bg-slate-50/90 px-4 py-3 sm:px-6">
          <h2 className="text-sm font-semibold text-slate-900">
            Detailed comparison
          </h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[520px] border-collapse text-left text-sm">
            <thead>
              <tr className="border-b border-slate-100 text-xs font-semibold uppercase tracking-wide text-slate-500">
                <th className="whitespace-nowrap px-4 py-3 sm:px-6">Metric</th>
                {tray.map((p) => (
                  <th key={p.id} className="whitespace-nowrap px-4 py-3 sm:px-6">
                    <span className="inline-flex items-center gap-2 font-semibold text-slate-900">
                      <span
                        className="h-2 w-2 rounded-full"
                        style={{ backgroundColor: p.color }}
                      />
                      {p.name}
                    </span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {TABLE_ROWS.map((row, idx) => (
                <tr
                  key={row.label}
                  className={idx % 2 === 1 ? 'bg-slate-50' : 'bg-white'}
                >
                  <td className="border-t border-slate-100 px-4 py-3 text-slate-600 sm:px-6">
                    {row.label}
                  </td>
                  {tray.map((p) => (
                    <td
                      key={p.id}
                      className="border-t border-slate-100 px-4 py-3 font-medium text-slate-900 sm:px-6"
                    >
                      {row.values[p.id] ?? '—'}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  )
}
