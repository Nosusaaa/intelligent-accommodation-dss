import { createContext, useContext, useState } from 'react'

const PreferenceContext = createContext(null)

export function PreferenceProvider({ children }) {
  // top vibe tag determined after onboarding; null means no preference set yet
  const [topVibeTag, setTopVibeTag] = useState(() => {
    try {
      return sessionStorage.getItem('top_vibe_tag') || null
    } catch {
      return null
    }
  })

  const saveTopVibeTag = (tag) => {
    setTopVibeTag(tag)
    try {
      if (tag) sessionStorage.setItem('top_vibe_tag', tag)
      else sessionStorage.removeItem('top_vibe_tag')
    } catch {
      // ignore
    }
  }

  return (
    <PreferenceContext.Provider value={{ topVibeTag, saveTopVibeTag }}>
      {children}
    </PreferenceContext.Provider>
  )
}

export function usePreference() {
  const ctx = useContext(PreferenceContext)
  if (!ctx) throw new Error('usePreference must be used within PreferenceProvider')
  return ctx
}
