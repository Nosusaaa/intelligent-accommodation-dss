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
 * PLAN B: MULTI-DIMENSIONAL LISTING VARIANCE
 * 方案B：多维度列表特征差异化
 * ============================================================================
 *
 * 实现以下4个维度来确保不同列表有不同的曲线:
 * 1. PropertyType (属性类型) - 公寓/酒店/别墅等
 * 2. PricePoint (价格档次) - 预算/中档/豪华
 * 3. LocationTier (位置等级) - 市中心/郊区/度假地
 * 4. CompetitionIndex (竞争指数) - 周边列表价格对比
 */

/**
 * ============================================================================
 * DIMENSION 1: PROPERTY TYPE PARAMETERS
 * 维度1：属性类型参数 - 不同类型有不同定价能力
 * ============================================================================
 */
const PROPERTY_TYPE_PARAMS = {
  apartment: {
    peakMultiplier: 0.30,        // 峰值提升30%
    offMultiplier: -0.25,        // 淡季降低25%
    seasonalityWeight: 0.7,      // 季节性权重70%
    ratingBoost: 1.05,           // 评分提升5%
    description: '公寓 - 中等波动',
  },
  hotel: {
    peakMultiplier: 0.20,        // 峰值提升20%（波动小）
    offMultiplier: -0.15,        // 淡季降低15%
    seasonalityWeight: 0.5,      // 季节性权重50%
    ratingBoost: 1.02,           // 评分提升2%
    description: '酒店 - 小波动',
  },
  villa: {
    peakMultiplier: 0.40,        // 峰值提升40%（高端波动大）
    offMultiplier: -0.35,        // 淡季降低35%
    seasonalityWeight: 0.9,      // 季节性权重90%
    ratingBoost: 1.08,           // 评分提升8%
    description: '别墅 - 大波动',
  },
  house: {
    peakMultiplier: 0.32,
    offMultiplier: -0.28,
    seasonalityWeight: 0.75,
    ratingBoost: 1.06,
    description: '房子 - 中大波动',
  },
  room: {
    peakMultiplier: 0.15,        // 波动最小
    offMultiplier: -0.12,
    seasonalityWeight: 0.4,
    ratingBoost: 1.01,
    description: '房间 - 最小波动',
  },
}

/**
 * ============================================================================
 * DIMENSION 2: PRICE POINT PARAMETERS
 * 维度2：价格档次参数 - 不同价格等级有不同灵活性
 * ============================================================================
 */
function getPricePointCategory(avgPrice) {
  if (avgPrice < 50) return 'budget'
  if (avgPrice < 150) return 'midrange'
  if (avgPrice < 300) return 'upscale'
  return 'luxury'
}

const PRICE_POINT_ADJUSTMENTS = {
  budget: {
    occupancyWeight: 0.8,        // 占用率影响大（对价格敏感）
    priceElasticity: 0.7,        // 价格灵活性低
    multiplierInflation: 0.95,   // 乘数稍微压低
    description: '预算 - 价格敏感',
  },
  midrange: {
    occupancyWeight: 0.6,
    priceElasticity: 0.85,
    multiplierInflation: 1.0,    // 标准
    description: '中档 - 均衡',
  },
  upscale: {
    occupancyWeight: 0.5,
    priceElasticity: 0.95,
    multiplierInflation: 1.05,   // 乘数提升5%
    description: '豪华 - 品牌价值',
  },
  luxury: {
    occupancyWeight: 0.3,        // 占用率影响小（品牌价值>价格）
    priceElasticity: 1.0,        // 价格最灵活
    multiplierInflation: 1.12,   // 乘数提升12%
    description: '高端 - 最灵活',
  },
}

/**
 * ============================================================================
 * DIMENSION 3: LOCATION-BASED SEASONALITY
 * 维度3：位置基础季节性 - 不同位置有不同的季节模式
 * ============================================================================
 */
const LOCATION_SEASONALITY = {
  downtown: {
    peakMonths: [3, 4, 5, 9, 10],           // 春秋旺季
    offMonths: [1, 2, 7, 8],                 // 冬夏淡季
    seasonalityStrength: 0.35,
    description: '市中心 - 商务季节',
  },
  beach: {
    peakMonths: [6, 7, 8],                   // 夏季旺季
    offMonths: [1, 2, 11, 12],               // 冬季淡季
    seasonalityStrength: 0.60,               // 海滨季节性强
    description: '海滨 - 夏季旺',
  },
  mountain: {
    peakMonths: [12, 1, 2, 6, 7, 8],        // 冬季滑雪+夏季登山
    offMonths: [4, 5, 10, 11],               // 春秋淡季
    seasonalityStrength: 0.55,
    description: '山区 - 双高峰',
  },
  countryside: {
    peakMonths: [5, 6, 7, 8, 9],            // 春夏秋旺季
    offMonths: [11, 12, 1, 2],               // 冬季淡季
    seasonalityStrength: 0.40,
    description: '郊区 - 温和季节',
  },
}

/**
 * ============================================================================
 * DIMENSION 4: COMPETITION INDEX CALCULATION
 * 维度4：竞争指数 - 基于周边列表的价格对比
 * ============================================================================
 */
function calculateCompetitionIndex(listing, nearbyListings = []) {
  // 如果没有周边列表数据，返回中等竞争指数
  if (!nearbyListings.length) {
    return {
      ratio: 1.0,
      competitionIntensity: 'medium',
      adjustment: 1.0,
    }
  }

  const currentPrice = listing?.price_clean ?? 0
  const nearbyAvgPrice = nearbyListings.reduce((sum, l) => sum + (l.price_clean ?? 0), 0) / nearbyListings.length

  if (nearbyAvgPrice === 0) {
    return {
      ratio: 1.0,
      competitionIntensity: 'medium',
      adjustment: 1.0,
    }
  }

  const competitionRatio = currentPrice / nearbyAvgPrice

  // 竞争强度评估
  let competitionIntensity, adjustment

  if (competitionRatio < 0.85) {
    // 价格远低于周边 → 竞争激烈，需要更多差异化
    competitionIntensity = 'intense'
    adjustment = 1.15  // 增加15%的波动来吸引不同客户
  } else if (competitionRatio < 0.95) {
    competitionIntensity = 'strong'
    adjustment = 1.08
  } else if (competitionRatio <= 1.05) {
    // 价格接近市场 → 中等竞争
    competitionIntensity = 'medium'
    adjustment = 1.0
  } else if (competitionRatio <= 1.15) {
    competitionIntensity = 'weak'
    adjustment = 0.95  // 减少波动，强调稳定
  } else {
    // 价格远高于周边 → 非常弱
    competitionIntensity = 'minimal'
    adjustment = 0.90
  }

  return {
    ratio: competitionRatio,
    competitionIntensity,
    adjustment,
  }
}

/**
 * ============================================================================
 * CORE FUNCTION: EXTRACT COMPREHENSIVE LISTING CHARACTERISTICS
 * 核心函数：提取全面的列表特征
 * ============================================================================
 */
function extractListingCharacteristics(listing, forecast, nearbyListings = []) {
  // 基础特征
  const basePrice = listing?.price_clean ?? 100
  const rating = Number(listing?.review_scores_rating) || 4.0
  const reviews = listing?.number_of_reviews ?? 0
  const propertyType = (listing?.property_type || 'apartment').toLowerCase()
  const neighbourhood = listing?.neighbourhood_cleansed || 'downtown'

  // 占用率特征
  const occupancies = forecast.map(m => {
    const occ = Number(m.occupancy_rate) || 0
    return occ > 1 ? occ / 100 : occ
  })

  const avgOccupancy = occupancies.length
    ? occupancies.reduce((a, b) => a + b, 0) / occupancies.length
    : 0.5

  const maxOccupancy = Math.max(...occupancies, 0)
  const minOccupancy = Math.min(...occupancies, 0)
  const occupancyVolatility = maxOccupancy - minOccupancy

  // 价格特征
  const prices = forecast.map(m => Number(m.avg_adjusted_price) || basePrice)
  const avgPrice = prices.length
    ? prices.reduce((a, b) => a + b, 0) / prices.length
    : basePrice

  const maxPrice = Math.max(...prices)
  const minPrice = Math.min(...prices)
  const seasonalityRange = maxPrice > 0 ? (maxPrice - minPrice) / avgPrice : 0

  // 维度特征
  const propertyTypeParams = PROPERTY_TYPE_PARAMS[propertyType] || PROPERTY_TYPE_PARAMS.apartment
  const pricePointCategory = getPricePointCategory(avgPrice)
  const pricePointParams = PRICE_POINT_ADJUSTMENTS[pricePointCategory]
  const locationParams = LOCATION_SEASONALITY[neighbourhood] || LOCATION_SEASONALITY.downtown
  const competitionIndex = calculateCompetitionIndex(listing, nearbyListings)

  return {
    basePrice,
    rating,
    reviews,
    propertyType,
    neighbourhood,
    avgOccupancy,
    maxOccupancy,
    minOccupancy,
    occupancyVolatility,
    avgPrice,
    maxPrice,
    minPrice,
    seasonalityRange,
    // 维度参数
    propertyTypeParams,
    pricePointCategory,
    pricePointParams,
    locationParams,
    competitionIndex,
    // 元数据
    listingSignature: `${propertyType}|${pricePointCategory}|${neighbourhood}`,
  }
}

/**
 * ============================================================================
 * PLAN B: LISTING-SPECIFIC MULTIPLIER GENERATION
 * 方案B：列表特定的乘数生成 - 每个列表有不同的参数
 * ============================================================================
 */
function generateListingSpecificMultipliers(characteristics, monthIndex, monthOccupancy) {
  const {
    seasonalityRange,
    rating,
    avgOccupancy,
    occupancyVolatility,
    propertyTypeParams,
    pricePointParams,
    locationParams,
    competitionIndex,
  } = characteristics

  // 第一层：属性类型乘数基础
  const peakBase = 1.0 + propertyTypeParams.peakMultiplier
  const normalBase = 1.0
  const offBase = 1.0 + propertyTypeParams.offMultiplier

  // 第二层：价格档次调整
  const pricePointAdjustment = pricePointParams.multiplierInflation

  // 第三层：位置基础季节性调整
  const month = monthIndex + 1
  const isLocationPeak = locationParams.peakMonths.includes(month)
  const isLocationOff = locationParams.offMonths.includes(month)

  let locationAdjustment = 1.0
  if (isLocationPeak) {
    locationAdjustment = 1.0 + locationParams.seasonalityStrength * 0.5
  } else if (isLocationOff) {
    locationAdjustment = 1.0 - locationParams.seasonalityStrength * 0.5
  }

  // 第四层：竞争指数调整
  const competitionAdjustment = competitionIndex.adjustment

  // 第五层：评分和占用率微调
  const ratingBoost = (rating - 3.5) / 10 + 1.0
  const occupancyNormalized = Math.max(0, Math.min(1, monthOccupancy))
  const occupancyDeviation = (occupancyNormalized - avgOccupancy) / (occupancyVolatility || 0.3)

  // 组合所有调整
  const peak = (peakBase + occupancyDeviation * 0.15) * pricePointAdjustment * locationAdjustment * ratingBoost * competitionAdjustment
  const normal = (normalBase + occupancyDeviation * 0.05) * pricePointAdjustment * locationAdjustment * ratingBoost * competitionAdjustment
  const off = (offBase + occupancyDeviation * 0.15) * pricePointAdjustment * locationAdjustment * ratingBoost * competitionAdjustment

  return {
    peak: Math.max(0.5, peak),   // 防止负数
    normal: Math.max(0.5, normal),
    off: Math.max(0.5, off),
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

  const nightlyPrice = getListingPriceNightly(listing?.price_clean)
  const chartScaffold = nightlyPrice ?? 100

  const scenarioData = useMemo(() => {
    if (!forecast.length) {
      return {
        peak: [
          { month: 'Jan', price: Math.round(chartScaffold * 1.08) },
          { month: 'Feb', price: Math.round(chartScaffold * 1.10) },
          { month: 'Mar', price: Math.round(chartScaffold * 1.12) },
          { month: 'Apr', price: Math.round(chartScaffold * 1.14) },
          { month: 'May', price: Math.round(chartScaffold * 1.16) },
          { month: 'Jun', price: Math.round(chartScaffold * 1.18) },
        ],
        normal: [
          { month: 'Jan', price: Math.round(chartScaffold * 0.98) },
          { month: 'Feb', price: Math.round(chartScaffold * 0.99) },
          { month: 'Mar', price: Math.round(chartScaffold * 1.01) },
          { month: 'Apr', price: Math.round(chartScaffold * 1.03) },
          { month: 'May', price: Math.round(chartScaffold * 1.05) },
          { month: 'Jun', price: Math.round(chartScaffold * 1.06) },
        ],
        off: [
          { month: 'Jan', price: Math.round(chartScaffold * 0.80) },
          { month: 'Feb', price: Math.round(chartScaffold * 0.82) },
          { month: 'Mar', price: Math.round(chartScaffold * 0.84) },
          { month: 'Apr', price: Math.round(chartScaffold * 0.82) },
          { month: 'May', price: Math.round(chartScaffold * 0.78) },
          { month: 'Jun', price: Math.round(chartScaffold * 0.75) },
        ],
      }
    }

    // 方案B核心改进：使用全面的列表特征
    const characteristics = extractListingCharacteristics(listing, forecast)

    const monthLabels = forecast.map((m) => {
      const ym = String(m.year_month ?? '')
      if (ym.length >= 7) {
        const [, mnum] = ym.split('-')
        const date = new Date(parseInt(ym.slice(0, 4), 10), parseInt(mnum, 10) - 1, 1)
        return date.toLocaleDateString('en-US', { month: 'short' })
      }
      return ym
    })

    const basePrices = forecast.map((m) => {
      const p = Number(m.avg_adjusted_price)
      return Number.isFinite(p) ? p : (nightlyPrice ?? 100)
    })

    const avgPrice = basePrices.length
      ? basePrices.reduce((a, b) => a + b, 0) / basePrices.length
      : (nightlyPrice ?? 100)

    const occupancies = forecast.map((m) => {
      const occ = Number(m.occupancy_rate) || 0
      return occ > 1 ? occ / 100 : occ
    })

    const scenarioArrays = {
      peak: [],
      normal: [],
      off: [],
      realData: [],
    }

    basePrices.forEach((price, idx) => {
      const monthOccupancy = occupancies[idx]
      const multipliers = generateListingSpecificMultipliers(
        characteristics,
        idx,
        monthOccupancy
      )

      scenarioArrays.peak.push({
        month: monthLabels[idx] || `M${idx + 1}`,
        price: Math.round(price * multipliers.peak),
      })

      scenarioArrays.normal.push({
        month: monthLabels[idx] || `M${idx + 1}`,
        price: Math.round(price * multipliers.normal),
      })

      scenarioArrays.off.push({
        month: monthLabels[idx] || `M${idx + 1}`,
        price: Math.round(price * multipliers.off),
      })

      scenarioArrays.realData.push({
        month: monthLabels[idx] || `M${idx + 1}`,
        price: Math.round(price),
        occupancy: Math.round(monthOccupancy * 100),
      })
    })

    return {
      ...scenarioArrays,
      avgPrice: Math.round(avgPrice),
      characteristics,
      signature: characteristics.listingSignature,
    }
  }, [forecast, nightlyPrice, chartScaffold, listing])

  const [activeScenario, setActiveScenario] = useState('normal')
  const chartData = scenarioData[activeScenario] || scenarioData.normal

  const suggestion = useMemo(() => {
    if (!forecast.length) {
      return {
        action: 'buy',
        headline: 'Fair value window',
        detail: 'Historical patterns suggest typical seasonal variation.',
        confidence: 70,
        metrics: { priceRatio: 100, occupancyRate: 50, buyScore: 60 },
      }
    }

    const characteristics = scenarioData.characteristics
    const currentPrice = listing?.price_clean ?? 0
    const avgForecastPrice = scenarioData.avgPrice ?? currentPrice || 100
    const priceRatio = currentPrice / avgForecastPrice
    const occupancyScore = characteristics.avgOccupancy

    const qualityScore = Math.max(0, Math.min(1, (characteristics.rating - 3.0) / 2.0))
    const seasonalityBoost = Math.min(0.2, characteristics.seasonalityRange * 0.5)

    const buyScore = Math.round(
      (1 - priceRatio) * 50 + occupancyScore * 30 + qualityScore * 10 + seasonalityBoost * 10
    )

    let action, headline, detail, confidence

    if (priceRatio < 0.80 && occupancyScore < 0.60) {
      action = 'buy'
      headline = 'Buy — 最强价值'
      detail = `${characteristics.propertyTypeParams.description} | ${characteristics.pricePointParams.description} | ${characteristics.locationParams.description}`
      detail += `\n价格低于平均${Math.round((1 - priceRatio) * 100)}%，占用率${Math.round(occupancyScore * 100)}%。`
      confidence = Math.min(95, 75 + (1 - priceRatio) * 50)
    } else if (priceRatio < 0.90 && occupancyScore < 0.75) {
      action = 'buy'
      headline = 'Buy — 不错的价值'
      detail = `${characteristics.propertyTypeParams.description} | ${characteristics.locationParams.description}`
      confidence = Math.min(88, 68 + (1 - priceRatio) * 40)
    } else if (priceRatio > 1.15 && occupancyScore > 0.80) {
      action = 'wait'
      headline = 'Wait — 价格偏高'
      detail = `${characteristics.propertyTypeParams.description} | 竞争强度: ${characteristics.competitionIndex.competitionIntensity}`
      confidence = Math.min(82, 65 + (priceRatio - 1.0) * 50)
    } else {
      action = 'buy'
      headline = 'Buy — 公平价值'
      detail = `${characteristics.locationParams.description} | ${characteristics.pricePointParams.description}`
      confidence = Math.min(75, 58 + Math.abs(1 - priceRatio) * 30)
    }

    return {
      action,
      headline,
      detail,
      confidence: Math.round(confidence),
      metrics: {
        priceRatio: Math.round(priceRatio * 100),
        occupancyRate: Math.round(occupancyScore * 100),
        buyScore,
      },
    }
  }, [listing, forecast, scenarioData])

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
          {scenarioData.signature && (
            <p className="mt-2 text-xs text-slate-500">
              特征: {scenarioData.signature}
            </p>
          )}
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
              Real data from {forecast.length} months (PLAN B: Listing-Specific Variance)
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
              <p className="mt-2 max-w-xl whitespace-pre-line text-sm leading-relaxed text-slate-600">
                {suggestion.detail}
              </p>
            </div>
          </div>
          <div className="shrink-0 rounded-xl border border-slate-100 bg-white/80 px-4 py-3 text-center text-sm text-slate-600 shadow-sm">
            <p className="font-semibold text-slate-900">Confidence</p>
            <p className="mt-1 text-2xl font-bold text-teal-700">{Math.min(99, suggestion.confidence)}%</p>
          </div>
        </div>

        {suggestion.metrics && (
          <div className="mt-4 grid gap-3 border-t border-slate-200/50 pt-4 sm:grid-cols-3">
            <div>
              <p className="text-xs text-slate-500">价格比率</p>
              <p className="text-sm font-semibold text-slate-900">{suggestion.metrics.priceRatio}%</p>
            </div>
            <div>
              <p className="text-xs text-slate-500">占用率</p>
              <p className="text-sm font-semibold text-slate-900">{suggestion.metrics.occupancyRate}%</p>
            </div>
            <div>
              <p className="text-xs text-slate-500">买入得分</p>
              <p className="text-sm font-semibold text-slate-900">{suggestion.metrics.buyScore}/100</p>
            </div>
          </div>
        )}
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
