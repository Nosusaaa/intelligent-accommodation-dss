import { useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ArrowLeft, Loader2 } from 'lucide-react'
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { api } from '../services/api.js'
import { getListingPriceNightly } from '../utils/listingPriceDisplay.js'

/**
 * SIMPLIFIED VERSION: Shows only Normal scenario, no Buy/Wait suggestion
 * Removed:
 * - Off Season / Normal / Peak scenario selection buttons
 * - Chart scenario toggle
 * - Buy / Wait suggestion panel
 */
export default function ForecastDashboard() {
  const { id } = useParams()
  const numericId = Number.isFinite(parseInt(String(id ?? ''), 10))
    ? parseInt(String(id ?? ''), 10)
    : null

  const [listing, setListing] = useState(null)
  const [forecast, setForecast] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    if (!Number.isFinite(numericId)) {
      setError('Invalid listing ID')
      setLoading(false)
      return
    }

    let cancelled = false
    setLoading(true)
    setError(null)

    async function loadData() {
      try {
        const [listingData, forecastData] = await Promise.all([
          api.getListingById(numericId),
          api.getListingForecast(numericId),
        ])
        if (!cancelled) {
          setListing(listingData)
          setForecast(Array.isArray(forecastData) ? forecastData : [])
        }
      } catch (err) {
        if (!cancelled) {
          setError(err?.response?.data?.detail || err?.message || 'Failed to load data')
        }
      } finally {
        if (!cancelled) {
          setLoading(false)
        }
      }
    }

    loadData()
    return () => {
      cancelled = true
    }
  }, [numericId])

  /** Positive nightly from `price_clean`, or null — charts use a neutral scaffold when missing. */
  const nightlyPrice = getListingPriceNightly(listing?.price_clean)
  const chartScaffold = nightlyPrice ?? 100

  // Derive scenario data from real monthly metrics
  const scenarioData = useMemo(() => {
    if (!forecast.length) {
      // Fallback mock data when no real data available
      return {
        normal: [
          { month: 'Jan', price: Math.round(chartScaffold * 0.95) },
          { month: 'Feb', price: Math.round(chartScaffold * 0.98) },
          { month: 'Mar', price: Math.round(chartScaffold * 1.0) },
          { month: 'Apr', price: Math.round(chartScaffold * 1.02) },
          { month: 'May', price: Math.round(chartScaffold * 1.05) },
          { month: 'Jun', price: Math.round(chartScaffold * 1.08) },
        ],
      }
    }

    // Use real data from monthly_metrics
    const monthLabels = forecast.map((m) => {
      const ym = String(m.year_month ?? '')
      if (ym.length >= 7) {
        const [, mnum] = ym.split('-')
        const date = new Date(parseInt(ym.slice(0, 4), 10), parseInt(mnum, 10) - 1, 1)
        return date.toLocaleDateString('en-US', { month: 'short' })
      }
      return ym
    })

    const prices = forecast.map((m) => {
      const p = Number(m.avg_adjusted_price)
      return Number.isFinite(p) ? p : (nightlyPrice ?? 0)
    })

    const avgPrice =
      prices.reduce((a, b) => a + b, 0) / prices.length || (nightlyPrice ?? 0)

    return {
      normal: prices.map((p, i) => ({ month: monthLabels[i] || `M${i + 1}`, price: Math.round(p) })),
      realData: forecast.map((m, i) => ({
        month: monthLabels[i] || `M${i + 1}`,
        price: prices[i],
        occupancy: Math.round((Number(m.occupancy_rate) || 0) * 100),
      })),
      avgPrice: Math.round(avgPrice),
    }
  }, [forecast, nightlyPrice, chartScaffold])

  // Always display normal scenario
  const chartData = scenarioData.normal || []
  const gradientId = `priceTrendFill-${id ?? 'unknown'}`

  if (loading) {
    return (
      <div className="flex min-h-[400px] flex-col items-center justify-center gap-4">
        <Loader2 className="h-10 w-10 animate-spin text-teal-600" aria-hidden />
        <p className="text-sm font-medium text-slate-600">Loading forecast data…</p>
      </div>
    )
  }

  if (error) {
    return (
      <div className="rounded-2xl border border-red-200 bg-red-50 p-6 text-sm text-red-800">
        {error}
        <div className="mt-3">
          <Link
            to="/search"
            className="inline-flex items-center gap-2 text-sm font-medium text-red-700 underline"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden />
            Back to search
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-8">
      <div>
        <Link
          to={`/details/${id}`}
          className="inline-flex items-center gap-2 text-sm font-medium text-slate-600 transition-colors hover:text-teal-700"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden />
          Back to Details
        </Link>
        <p className="mt-4 text-sm font-medium text-slate-500">
          Forecast · {listing?.name || `Listing #${id}`}
        </p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight text-slate-900">
          Price trend & timing
        </h1>
      </div>

      {/* Price Trend Chart - Normal Scenario Only */}
      <div className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm sm:p-6">
        <div className="mb-1 flex items-center justify-between">
          <p className="text-sm font-medium text-slate-900">Price trend</p>
          {forecast.length > 0 && (
            <p className="text-xs text-slate-500">
              Real data from {forecast.length} months
            </p>
          )}
        </div>
        <p className="mb-4 text-sm text-slate-500">
          Projected nightly rate (USD)
        </p>
        <div className="h-72 w-full sm:h-80">
          {chartData && chartData.length > 0 ? (
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
          ) : (
            <div className="flex h-full items-center justify-center rounded-xl border border-dashed border-slate-200 bg-slate-50/80 text-sm text-slate-600">
              No forecast data available for this listing.
            </div>
          )}
        </div>
      </div>

      {/* Monthly Details Table */}
      {forecast.length > 0 && (
        <div className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm sm:p-6">
          <p className="mb-4 text-sm font-semibold text-slate-900">Monthly details</p>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100">
                  <th className="pb-2 pr-4 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">Month</th>
                  <th className="pb-2 pr-4 text-right text-xs font-semibold uppercase tracking-wide text-slate-500">Avg Price</th>
                  <th className="pb-2 text-right text-xs font-semibold uppercase tracking-wide text-slate-500">Occupancy</th>
                </tr>
              </thead>
              <tbody>
                {(scenarioData.realData || []).map((row, i) => (
                  <tr key={i} className="border-b border-slate-50 last:border-0">
                    <td className="py-2.5 pr-4 text-slate-700">{row.month}</td>
                    <td className="py-2.5 pr-4 text-right font-mono font-medium text-slate-900">
                      ${row.price}
                    </td>
                    <td className="py-2.5 text-right text-slate-600">
                      {row.occupancy}%
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
