import L from 'leaflet'

export const ROCHESTER_CENTER = [43.1566, -77.6088]
export const POI_CATEGORIES = ['transport', 'park', 'restaurant', 'education', 'hospital']

/** Admin scenic / map POI category labels (keys match `POI_CATEGORIES`). */
export const POI_CATEGORY_LABELS = {
  transport: 'Transport',
  park: 'Park',
  restaurant: 'Restaurant',
  education: 'Education',
  hospital: 'Hospital',
}

/** Map free text or legacy values to a valid map POI category (default park). */
export function normalizeMapPoiCategory(raw) {
  const s = String(raw ?? '').trim().toLowerCase()
  return POI_CATEGORIES.includes(s) ? s : 'park'
}

export const listingMarkerIcon = new L.Icon({
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41],
})
