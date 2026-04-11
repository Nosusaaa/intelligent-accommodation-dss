/**
 * Client-side mirror of `backend/strategy_ranking.py` for Smart Search ordering.
 */

function toRad(deg) {
  return (deg * Math.PI) / 180
}

export function haversineKm(aLat, aLon, bLat, bLon) {
  const R = 6371
  const dLat = toRad(bLat - aLat)
  const dLon = toRad(bLon - aLon)
  const x =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.sin(dLon / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(Math.min(1, Math.max(0, x))))
}

export function parseVibeTagsPipe(raw) {
  if (!raw || typeof raw !== 'string') return []
  return raw
    .split('|')
    .map((s) => s.trim())
    .filter(Boolean)
}

export function poiProximityScore(listing, pois) {
  const lat = Number(listing?.latitude)
  const lon = Number(listing?.longitude)
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || !Array.isArray(pois) || pois.length === 0)
    return 0
  let nearest = Number.POSITIVE_INFINITY
  for (const poi of pois) {
    const plat = Number(poi?.lat)
    const plon = Number(poi?.lon)
    if (!Number.isFinite(plat) || !Number.isFinite(plon)) continue
    const d = haversineKm(lat, lon, plat, plon)
    if (d < nearest) nearest = d
  }
  if (!Number.isFinite(nearest)) return 0
  return 100 / (1 + nearest)
}

export function sentimentScore(listing) {
  const intel = listing?.intelligent_score
  if (intel != null && Number.isFinite(Number(intel))) {
    const v = Number(intel)
    return Math.min(100, Math.max(0, v))
  }
  const rating = listing?.review_scores_rating
  if (rating != null && Number.isFinite(Number(rating))) {
    return Math.min(100, Math.max(0, Number(rating) * 20))
  }
  const avg = listing?.average_sentiment_score
  if (avg != null && Number.isFinite(Number(avg))) {
    const a = Number(avg)
    if (a <= 1) return Math.min(100, Math.max(0, a * 100))
    return Math.min(100, Math.max(0, a))
  }
  return 50
}

export function costScore(listing, pmin, pmax) {
  const p = listing?.price_clean
  if (p == null || !Number.isFinite(Number(p))) return 50
  const price = Number(p)
  if (pmax <= pmin) return 50
  const t = Math.min(1, Math.max(0, (price - pmin) / (pmax - pmin)))
  return 100 * (1 - t)
}

export function preferenceScore(vibeTagsStr, tagWeights) {
  if (!tagWeights || typeof tagWeights !== 'object' || Object.keys(tagWeights).length === 0)
    return 50
  const tags = parseVibeTagsPipe(vibeTagsStr)
  if (tags.length === 0) return 35
  const weights = Object.values(tagWeights).map((x) => Number(x))
  const maxW = Math.max(1, ...weights.filter((n) => Number.isFinite(n)))
  let total = 0
  for (const lt of tags) {
    const ltL = lt.toLowerCase()
    let best = 0
    for (const [ut, sc] of Object.entries(tagWeights)) {
      const u = String(ut).trim()
      if (!u) continue
      const ul = u.toLowerCase()
      const sv = Number(sc)
      if (!Number.isFinite(sv)) continue
      if (ul === ltL) best = Math.max(best, sv)
      else if (ul.includes(ltL) || ltL.includes(ul)) best = Math.max(best, sv * 0.65)
    }
    total += best
  }
  const raw = (100 * total) / (maxW * tags.length)
  return Math.min(100, Math.max(0, raw))
}

export function priceBounds(listings) {
  const vals = []
  for (const li of listings) {
    const p = li?.price_clean
    if (p == null) continue
    const v = Number(p)
    if (Number.isFinite(v) && v > 0) vals.push(v)
  }
  if (vals.length === 0) return { min: 0, max: 1 }
  return { min: Math.min(...vals), max: Math.max(...vals) }
}

export function weightedTotal(poi, cost, sentiment, preference, wPoi, wCost, wSent, wPref) {
  const ws = wPoi + wCost + wSent + wPref
  if (ws <= 0) return 0
  return (wPoi * poi + wCost * cost + wSent * sentiment + wPref * preference) / ws
}

/**
 * @returns {Array<{ listing: object, score: number }>}
 */
export function rankListings(listings, { pois, tagWeights, wPoi, wCost, wSent, wPref }) {
  const { min, max } = priceBounds(listings)
  const rows = listings.map((listing) => {
    const poi = poiProximityScore(listing, pois)
    const cost = costScore(listing, min, max)
    const sentiment = sentimentScore(listing)
    const preference = preferenceScore(listing?.vibe_tags, tagWeights)
    const score = weightedTotal(poi, cost, sentiment, preference, wPoi, wCost, wSent, wPref)
    return { listing, score: Math.round(score * 100) / 100 }
  })
  rows.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score
    return (a.listing?.id || 0) - (b.listing?.id || 0)
  })
  return rows
}
