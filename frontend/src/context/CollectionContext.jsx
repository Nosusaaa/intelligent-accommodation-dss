import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react'
import { api } from '../services/api.js'
import { useUser } from './UserContext.jsx'

const CollectionContext = createContext(null)

export function CollectionProvider({ children }) {
  const { userId } = useUser()
  const [favoriteIds, setFavoriteIds] = useState(() => new Set())
  const [stayedIds, setStayedIds] = useState(() => new Set())
  const [reviewedListingIds, setReviewedListingIds] = useState(() => new Set())
  const [stayDataEpoch, setStayDataEpoch] = useState(0)

  const bumpStayDataEpoch = useCallback(() => {
    setStayDataEpoch((n) => n + 1)
  }, [])

  useEffect(() => {
    if (!userId) {
      setFavoriteIds(new Set())
      setStayedIds(new Set())
      setReviewedListingIds(new Set())
    }
  }, [userId])

  const mergeFlags = useCallback((flags) => {
    if (!flags || typeof flags !== 'object') return
    setFavoriteIds((prev) => {
      const next = new Set(prev)
      for (const [k, v] of Object.entries(flags)) {
        const id = Number(k)
        if (!Number.isFinite(id)) continue
        if (v?.favorited) next.add(id)
        else next.delete(id)
      }
      return next
    })
    setStayedIds((prev) => {
      const next = new Set(prev)
      for (const [k, v] of Object.entries(flags)) {
        const id = Number(k)
        if (!Number.isFinite(id)) continue
        if (v?.stayed) next.add(id)
        else next.delete(id)
      }
      return next
    })
    setReviewedListingIds((prev) => {
      const next = new Set(prev)
      for (const [k, v] of Object.entries(flags)) {
        const id = Number(k)
        if (!Number.isFinite(id)) continue
        if (typeof v?.reviewed === 'boolean') {
          if (v.reviewed) next.add(id)
          else next.delete(id)
        }
      }
      return next
    })
  }, [])

  const syncListingFlags = useCallback(
    async (listingIds) => {
      if (!userId || !listingIds?.length) return
      const uniq = [...new Set(listingIds.filter((x) => x != null))]
      if (!uniq.length) return
      try {
        const data = await api.getUserListingFlags(userId, uniq)
        mergeFlags(data?.flags)
      } catch {
        // ignore
      }
    },
    [userId, mergeFlags],
  )

  const refreshFavoritesFromServer = useCallback(async () => {
    if (!userId) return
    try {
      const data = await api.getUserFavorites(userId)
      const list = Array.isArray(data?.listings) ? data.listings : []
      setFavoriteIds(new Set(list.map((x) => x.id).filter(Boolean)))
    } catch {
      // ignore
    }
  }, [userId])

  const refreshStaysFromServer = useCallback(async () => {
    if (!userId) return
    try {
      const data = await api.getUserStays(userId)
      const list = Array.isArray(data?.listings) ? data.listings : []
      setStayedIds(new Set(list.map((x) => x.id).filter(Boolean)))
      setReviewedListingIds(() => {
        const next = new Set()
        for (const x of list) {
          const lid = Number(x.id)
          if (!Number.isFinite(lid)) continue
          const rev = x?.user_stay_review
          if (rev != null && typeof rev === 'object' && Number.isFinite(Number(rev.id))) {
            next.add(lid)
          }
        }
        return next
      })
    } catch {
      // ignore
    }
  }, [userId])

  const toggleFavorite = useCallback(
    async (listingId) => {
      if (!userId) throw new Error('signin')
      const wasOn = favoriteIds.has(listingId)
      if (wasOn) {
        await api.removeUserFavorite(userId, listingId)
      } else {
        await api.addUserFavorite(userId, listingId)
      }
      setFavoriteIds((prev) => {
        const n = new Set(prev)
        if (wasOn) n.delete(listingId)
        else n.add(listingId)
        return n
      })
    },
    [userId, favoriteIds],
  )

  const toggleStayed = useCallback(
    async (listingId) => {
      if (!userId) throw new Error('signin')
      const wasOn = stayedIds.has(listingId)
      if (wasOn) {
        await api.removeUserStay(userId, listingId)
      } else {
        await api.addUserStay(userId, listingId)
      }
      setStayedIds((prev) => {
        const n = new Set(prev)
        if (wasOn) n.delete(listingId)
        else n.add(listingId)
        return n
      })
    },
    [userId, stayedIds],
  )

  const value = useMemo(
    () => ({
      favoriteIds,
      stayedIds,
      reviewedListingIds,
      stayDataEpoch,
      bumpStayDataEpoch,
      isFavorite: (id) => favoriteIds.has(id),
      isStayed: (id) => stayedIds.has(id),
      isStayReviewed: (id) => {
        const n = Number(id)
        return Number.isFinite(n) && reviewedListingIds.has(n)
      },
      syncListingFlags,
      toggleFavorite,
      toggleStayed,
      refreshFavoritesFromServer,
      refreshStaysFromServer,
    }),
    [
      favoriteIds,
      stayedIds,
      reviewedListingIds,
      stayDataEpoch,
      bumpStayDataEpoch,
      syncListingFlags,
      toggleFavorite,
      toggleStayed,
      refreshFavoritesFromServer,
      refreshStaysFromServer,
    ],
  )

  return (
    <CollectionContext.Provider value={value}>{children}</CollectionContext.Provider>
  )
}

export function useCollection() {
  const ctx = useContext(CollectionContext)
  if (!ctx) {
    throw new Error('useCollection must be used within CollectionProvider')
  }
  return ctx
}
