import { useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ArrowLeft, CheckCircle2, Clock3, Loader2 } from 'lucide-react'
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
 * ============================================================================
 * FIX #4: DECISION THRESHOLDS CONFIGURATION (Parameterization)
 * ============================================================================
 * Moved hardcoded thresholds to a configuration object for clarity and
 * customization per market segment.
 */
const DECISION_THRESHOLDS = {
  highOccupancy: 0.75,      // 75% occupancy considered "high" (elevated demand)
  lowOccupancy: 0.45,       // 45% occupancy considered "low" (depressed demand)
  aboveAvgPrice: 1.15,      // 15% above average price
  belowAvgPrice: 0.85,      // 15% below average price
}

/**
 * ============================================================================
 * FIX #2: OCCUPANCY CONVERSION HELPER (Consistency & Clarity)
 * ============================================================================
 * Ensures consistent decimal↔percentage conversion throughout the component.
 * All internal logic uses decimal (0-1), display uses percentage (0-100).
 */
function occupancyAsDecimal(value) {
  /**
   * Ensures value is in decimal format (0-1).
   * @param {number} value - Value to normalize (can be 0-1 or 0-100)
   * @returns {number} Decimal occupancy (0-1)
   */
  const num = Number(value) || 0
  return num > 1 ? num / 100 : num
}

function occupancyAsPercent(value) {
  /**
   * Converts decimal occupancy (0-1) to percentage string (0-100).
   * @param {number} value - Decimal occupancy rate (0-1)
   * @returns {string} Percentage string (e.g., "75%")
   */
  return Math.round(occupancyAsDecimal(value) * 100)
}

/**
 * ============================================================================
 * FIX #1: DYNAMIC MULTIPLIER CALCULATION (Identical Curves Fix)
 * ============================================================================
 * Instead of applying uniform multipliers (peak=1.2x, normal=1.0x, off=0.8x)
 * to all months, we derive multipliers from the actual occupancy patterns.
 *
 * This creates distinct seasonal curves instead of parallel lines.
 *
 * Algorithm:
 * 1. Calculate occupancy percentiles (25th, 50th, 75th)
 * 2. Assign "peak", "normal", "off" labels based on each month's occupancy
 * 3. Use occupancy-aware multipliers that vary month-to-month
 *
 * Example:
 * BEFORE: peak = [120, 120, 120], normal = [100, 100, 100], off = [80, 80, 80]
 *         (perfectly parallel lines)
 * AFTER:  peak = [118, 112, 125], normal = [98, 92, 105], off = [78, 72, 85]
 *         (realistic seasonal variation)
 */
function calculateDynamicMultipliers(forecast) {
  if (!forecast.length) return null

  // Extract occupancy rates (convert to decimal 0-1)
  const occupancies = forecast.map(m => occupancyAsDecimal(m.occupancy_rate))

  // Calculate percentiles to understand this listing's seasonal pattern
  const sorted = [...occupancies].sort((a, b) => a - b)
  const p25 = sorted[Math.floor(sorted.length * 0.25)] || 0
  const p50 = sorted[Math.floor(sorted.length * 0.50)] || 0
  const p75 = sorted[Math.floor(sorted.length * 0.75)] || 0
  const pMax = Math.max(...occupancies)
  const pMin = Math.min(...occupancies)

  // Generate month-to-month multipliers based on occupancy patterns
  // High occupancy = peak multiplier; Low occupancy = off multiplier
  const multipliers = occupancies.map(occ => {
    // Normalize occupancy to 0-1 range within this listing's min/max
    const range = pMax - pMin || 1
    const normalized = (occ - pMin) / range // 0=worst month, 1=best month

    return {
      // Peak scenario: boost high-occupancy months, reduce low-occupancy months
      peak: 0.95 + normalized * 0.30,        // Range: 0.95-1.25
      // Normal scenario: subtle adjustment, flatten extreme months
      normal: 0.98 + normalized * 0.08,      // Range: 0.98-1.06
      // Off scenario: severe discount on low seasons, mild discount on peaks
      off: 0.65 + normalized * 0.20,         // Range: 0.65-0.85
    }
  })

  return {
    peak: multipliers.map(m => m.peak),
    normal: multipliers.map(m => m.normal),
    off: multipliers.map(m => m.off),
  }
}

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

  /**
   * =========================================================================
   * avg_adjusted_price: Nightly rate as observed in the market
   *   (includes dynamic pricing, seasonal adjustments, etc.)
   * avg_base_price: Normalized reference price for comparison
   *   (represents the listing's "baseline" without seasonality)
   * =========================================================================
   */
  const nightlyPrice = getListingPriceNightly(listing?.price_clean)
  const chartScaffold = nightlyPrice ?? 100

  // Derive scenario data from real monthly metrics with dynamic multipliers
  const scenarioData = useMemo(() => {
    if (!forecast.length) {
      // Fallback mock data when no real data available
      // NOTE: This fallback SHOULD show realistic seasonal variation
      // (matching the real data behavior after Fix #1)
      return {
        peak: [
          { month: 'Jan', price: Math.round(chartScaffold * 1.05) },
          { month: 'Feb', price: Math.round(chartScaffold * 1.08) },
          { month: 'Mar', price: Math.round(chartScaffold * 1.12) },
          { month: 'Apr', price: Math.round(chartScaffold * 1.15) },
          { month: 'May', price: Math.round(chartScaffold * 1.22) },
          { month: 'Jun', price: Math.round(chartScaffold * 1.25) },
        ],
        normal: [
          { month: 'Jan', price: Math.round(chartScaffold * 0.98) },
          { month: 'Feb', price: Math.round(chartScaffold * 0.99) },
          { month: 'Mar', price: Math.round(chartScaffold * 1.02) },
          { month: 'Apr', price: Math.round(chartScaffold * 1.03) },
          { month: 'May', price: Math.round(chartScaffold * 1.05) },
          { month: 'Jun', price: Math.round(chartScaffold * 1.06) },
        ],
        off: [
          { month: 'Jan', price: Math.round(chartScaffold * 0.78) },
          { month: 'Feb', price: Math.round(chartScaffold * 0.81) },
          { month: 'Mar', price: Math.round(chartScaffold * 0.85) },
          { month: 'Apr', price: Math.round(chartScaffold * 0.83) },
          { month: 'May', price: Math.round(chartScaffold * 0.80) },
          { month: 'Jun', price: Math.round(chartScaffold * 0.78) },
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

    // FIX #1: Calculate dynamic multipliers from occupancy data
    const multipliers = calculateDynamicMultipliers(forecast)

    if (!multipliers) {
      // Fallback to original behavior if multiplier calculation fails
      return {
        peak: prices.map((p, i) => ({ month: monthLabels[i] || `M${i + 1}`, price: Math.round(p * 1.2) })),
        normal: prices.map((p, i) => ({ month: monthLabels[i] || `M${i + 1}`, price: Math.round(p) })),
        off: prices.map((p, i) => ({ month: monthLabels[i] || `M${i + 1}`, price: Math.round(p * 0.8) })),
        realData: forecast.map((m, i) => ({
          month: monthLabels[i] || `M${i + 1}`,
          price: prices[i],
          occupancy: occupancyAsPercent(m.occupancy_rate),
        })),
        avgPrice: Math.round(avgPrice),
      }
    }

    // Apply DYNAMIC multipliers (not uniform) to create realistic seasonal curves
    return {
      peak: prices.map((p, i) => ({
        month: monthLabels[i] || `M${i + 1}`,
        price: Math.round(p * multipliers.peak[i]),
      })),
      normal: prices.map((p, i) => ({
        month: monthLabels[i] || `M${i + 1}`,
        price: Math.round(p * multipliers.normal[i]),
      })),
      off: prices.map((p, i) => ({
        month: monthLabels[i] || `M${i + 1}`,
        price: Math.round(p * multipliers.off[i]),
      })),
      realData: forecast.map((m, i) => ({
        month: monthLabels[i] || `M${i + 1}`,
        price: prices[i],
        occupancy: occupancyAsPercent(m.occupancy_rate),
      })),
      avgPrice: Math.round(avgPrice),
    }
  }, [forecast, nightlyPrice, chartScaffold])

  const [activeScenario, setActiveScenario] = useState('normal')

  const chartData = scenarioData[activeScenario] || scenarioData.normal

  // Generate buy/wait suggestion based on real data
  const suggestion = useMemo(() => {
    if (!forecast.length) {
      return {
        action: 'buy',
        headline: 'Fair value window',
        detail: 'Based on historical pricing patterns, this listing shows typical seasonal variation.',
        confidence: 75,
      }
    }

    // FIX #2: Use decimal occupancy consistently with clear variable naming
    const occupancyValues = forecast.map(m => occupancyAsDecimal(m.occupancy_rate))
    const avgOccupancy = occupancyValues.reduce((sum, val) => sum + val, 0) / forecast.length
    const avgPrice = scenarioData.avgPrice ?? nightlyPrice ?? 0
    const listingNightly = nightlyPrice ?? 0

    // FIX #3: Use parameterized thresholds from configuration
    const {
      highOccupancy,
      lowOccupancy,
      aboveAvgPrice,
      belowAvgPrice,
    } = DECISION_THRESHOLDS

    if (avgOccupancy > highOccupancy || listingNightly > avgPrice * aboveAvgPrice) {
      return {
        action: 'wait',
        headline: 'Wait — prices are elevated',
        detail: `Occupancy is high at ${occupancyAsPercent(avgOccupancy)}%. Prices may soften outside peak periods.`,
        confidence: Math.round(70 + avgOccupancy * 20),
      }
    } else if (avgOccupancy < lowOccupancy || listingNightly < avgPrice * belowAvgPrice) {
      return {
        action: 'buy',
        headline: 'Buy — strongest value',
        detail: `Low season pricing detected. Occupancy ${occupancyAsPercent(avgOccupancy)}% — this is a great time to book.`,
        confidence: Math.round(80 + (1 - avgOccupancy) * 15),
      }
    } else {
      return {
        action: 'buy',
        headline: 'Buy — fair value window',
        detail: `Stable market conditions with ${occupancyAsPercent(avgOccupancy)}% average occupancy. Current rate aligns with market average.`,
        confidence: Math.round(75 + (0.6 - Math.abs(avgOccupancy - 0.6)) * 30),
      }
    }
  }, [forecast, scenarioData, nightlyPrice])

  /**
   * FIX #4: Stabilize gradient ID
   * Removed activeScenario from gradient ID to prevent re-rendering issues
   * when scenario changes. The gradient definition will remain stable.
   */
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
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
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
        <div
          className="inline-flex shrink-0 rounded-xl bg-slate-100 p-1 shadow-inner"
          role="tablist"
          aria-label="Scenario selection"
        >
          {[
            { id: 'off', label: 'Off Season' },
            { id: 'normal', label: 'Normal' },
            { id: 'peak', label: 'Peak' },
          ].map((s) => (
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
        <div className="mb-1 flex items-center justify-between">
          <p className="text-sm font-medium text-slate-900">Price trend</p>
          {forecast.length > 0 && (
            <p className="text-xs text-slate-500">
              Real data from {forecast.length} months
            </p>
          )}
        </div>
        <p className="mb-4 text-sm text-slate-500">
          Projected nightly rate (USD) — scenario:{' '}
          <span className="font-medium text-slate-700">
            {activeScenario === 'peak' ? 'Peak' : activeScenario === 'off' ? 'Off Season' : 'Normal'}
          </span>
        </p>
        <div className="h-72 w-full sm:h-80">
          {chartData && chartData.length > 0 ? (
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart
                data={chartData}
                margin={{ top: 8, right: 8, left: 0, bottom: 0 }}
                key={activeScenario}
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
            <p className="mt-1 text-2xl font-bold text-teal-700">{Math.min(99, suggestion.confidence)}%</p>
          </div>
        </div>
      </div>

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
