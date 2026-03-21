import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
} from 'react'

const COLORS = ['#0d9488', '#4f46e5', '#c026d3', '#ea580c', '#0284c7']

const CompareContext = createContext(null)

export function CompareProvider({ children }) {
  const [items, setItems] = useState([])

  const addToCompare = useCallback((item) => {
    setItems((prev) => {
      if (prev.some((x) => x.id === item.id)) return prev
      const color = COLORS[prev.length % COLORS.length]
      return [...prev, { id: item.id, name: item.name, color }]
    })
  }, [])

  const removeFromCompare = useCallback((id) => {
    setItems((prev) => prev.filter((x) => x.id !== id))
  }, [])

  const toggleCompare = useCallback((item) => {
    setItems((prev) => {
      const exists = prev.some((x) => x.id === item.id)
      if (exists) return prev.filter((x) => x.id !== item.id)
      const color = COLORS[prev.length % COLORS.length]
      return [...prev, { id: item.id, name: item.name, color }]
    })
  }, [])

  const isInCompare = useCallback(
    (id) => items.some((x) => x.id === id),
    [items],
  )

  const setCompareItems = useCallback((next) => {
    setItems(
      next.map((item, i) => ({
        ...item,
        color: item.color ?? COLORS[i % COLORS.length],
      })),
    )
  }, [])

  const value = useMemo(
    () => ({
      items,
      addToCompare,
      removeFromCompare,
      toggleCompare,
      isInCompare,
      setCompareItems,
    }),
    [
      items,
      addToCompare,
      removeFromCompare,
      toggleCompare,
      isInCompare,
      setCompareItems,
    ],
  )

  return (
    <CompareContext.Provider value={value}>{children}</CompareContext.Provider>
  )
}

// eslint-disable-next-line react-refresh/only-export-components -- hook paired with provider
export function useCompare() {
  const ctx = useContext(CompareContext)
  if (!ctx) {
    throw new Error('useCompare must be used within CompareProvider')
  }
  return ctx
}
