import { useEffect, useRef, useState } from 'react'
import { api } from '../services/api.js'

// Fallback images in case API is unavailable
const FALLBACK_IMAGES = [
  'https://images.unsplash.com/photo-1522708323590-d24dbb6b0267?w=600&q=70',
  'https://images.unsplash.com/photo-1502672260266-1c1ef2d93688?w=600&q=70',
  'https://images.unsplash.com/photo-1560448204-e02f11c3d0e2?w=600&q=70',
  'https://images.unsplash.com/photo-1560185007-cde436f6a4d0?w=600&q=70',
  'https://images.unsplash.com/photo-1484154218962-a197022b5858?w=600&q=70',
  'https://images.unsplash.com/photo-1493809842364-78817add7ffb?w=600&q=70',
  'https://images.unsplash.com/photo-1555854877-bab0e564b8d5?w=600&q=70',
  'https://images.unsplash.com/photo-1512917774080-9991f1c4c750?w=600&q=70',
  'https://images.unsplash.com/photo-1449844908441-8829872d2607?w=600&q=70',
  'https://images.unsplash.com/photo-1505691938895-1758d7feb511?w=600&q=70',
  'https://images.unsplash.com/photo-1536376072261-38c75010e6c9?w=600&q=70',
  'https://images.unsplash.com/photo-1507089947368-19c1da9775ae?w=600&q=70',
  'https://images.unsplash.com/photo-1522771739844-6a9f6d5f14af?w=600&q=70',
  'https://images.unsplash.com/photo-1554995207-c18c203602cb?w=600&q=70',
  'https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=600&q=70',
  'https://images.unsplash.com/photo-1564013799919-ab600027ffc6?w=600&q=70',
]

/** Deterministically split an array into N roughly-equal rows */
function splitIntoRows(arr, rowCount) {
  const rows = Array.from({ length: rowCount }, () => [])
  arr.forEach((item, i) => rows[i % rowCount].push(item))
  // Duplicate items so each row has enough for seamless looping
  return rows.map((row) => {
    while (row.length < 8) row = [...row, ...row]
    return [...row, ...row] // double for seamless loop
  })
}

const ROW_COUNT = 3
// px widths + gap — must match CSS card size
const CARD_W = 260
const CARD_GAP = 16
// Scroll speeds (px per second) per row — alternating direction
const SPEEDS = [28, 22, 32]

export default function RoomSliderBackground({ className = '' }) {
  const [imageUrls, setImageUrls] = useState([])
  const rowRefs = useRef([])
  const animFrames = useRef([])
  const offsets = useRef([0, 0, 0])
  const lastTime = useRef(null)

  // Fetch room images from the API
  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        const data = await api.getListings({ limit: 48, skip: 0 })
        const listings = Array.isArray(data)
          ? data
          : Array.isArray(data?.listings)
            ? data.listings
            : []
        // Homepage background: CSV cover only — never use gallery_urls (details page only).
        const urls = listings
          .map((l) => l.picture_url)
          .filter((u) => u && typeof u === 'string' && u.startsWith('http'))
        if (!cancelled && urls.length >= 6) {
          setImageUrls(urls)
        } else if (!cancelled) {
          setImageUrls(FALLBACK_IMAGES)
        }
      } catch {
        if (!cancelled) setImageUrls(FALLBACK_IMAGES)
      }
    }
    load()
    return () => { cancelled = true }
  }, [])

  const rows = imageUrls.length > 0 ? splitIntoRows(imageUrls, ROW_COUNT) : []

  // Animate scrolling
  useEffect(() => {
    if (rows.length === 0) return

    // Calculate the total width of ONE copy of each row (for seamless wrap)
    const halfLengths = rows.map((row) => Math.ceil(row.length / 2))

    function animate(ts) {
      if (lastTime.current === null) lastTime.current = ts
      const dt = Math.min((ts - lastTime.current) / 1000, 0.05) // seconds, capped
      lastTime.current = ts

      rows.forEach((row, i) => {
        const el = rowRefs.current[i]
        if (!el) return
        const dir = i % 2 === 0 ? 1 : -1
        offsets.current[i] += dir * SPEEDS[i] * dt

        const singleWidth = halfLengths[i] * (CARD_W + CARD_GAP)
        // wrap around seamlessly
        offsets.current[i] = ((offsets.current[i] % singleWidth) + singleWidth) % singleWidth
        if (dir === 1) {
          el.style.transform = `translateX(-${offsets.current[i]}px)`
        } else {
          el.style.transform = `translateX(${offsets.current[i] - singleWidth}px)`
        }
      })

      animFrames.current.push(requestAnimationFrame(animate))
    }

    animFrames.current.push(requestAnimationFrame(animate))
    return () => {
      animFrames.current.forEach(cancelAnimationFrame)
      animFrames.current = []
      lastTime.current = null
    }
  }, [rows.length])

  if (imageUrls.length === 0) return null

  return (
    <div
      className={`room-slider-bg ${className}`}
      aria-hidden="true"
    >
      <div className="room-slider-skew-wrapper">
        {rows.map((row, rowIdx) => (
          <div key={rowIdx} className="room-slider-row">
            <div
              ref={(el) => (rowRefs.current[rowIdx] = el)}
              className="room-slider-track"
            >
              {row.map((url, imgIdx) => (
                <div key={imgIdx} className="room-slider-card">
                  <img
                    src={url}
                    alt=""
                    loading="lazy"
                    draggable={false}
                  />
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
