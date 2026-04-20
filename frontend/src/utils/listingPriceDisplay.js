/**
 * Nightly listing price from API field `price_clean` (USD).
 * `null` / `undefined` / non-finite / `<= 0` are treated as missing for display.
 *
 * @param {unknown} priceClean
 * @returns {number | null} Positive finite number, or null if missing/invalid.
 */
export function getListingPriceNightly(priceClean) {
  if (priceClean == null) return null
  const n = Number(priceClean)
  if (!Number.isFinite(n) || n <= 0) return null
  return n
}

/**
 * Unified UI label for list / detail / onboarding cards.
 *
 * @param {unknown} priceClean
 * @param {{ missingLabel?: string }} [opts]
 * @returns {string} e.g. `$129` or missing label (default `-`).
 */
export function formatListingPriceDisplay(priceClean, { missingLabel = '-' } = {}) {
  const n = getListingPriceNightly(priceClean)
  if (n == null) return missingLabel
  return `$${Math.round(n)}`
}
