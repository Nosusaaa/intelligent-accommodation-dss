import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { api } from '../services/api.js'

const UserContext = createContext(null)

function getStoredUserId() {
  try {
    const raw = sessionStorage.getItem('user_id')
    return raw ? Number(raw) : null
  } catch {
    return null
  }
}

function getStoredEmail() {
  try {
    return sessionStorage.getItem('user_email') || ''
  } catch {
    return ''
  }
}

function getStoredProfile() {
  try {
    const raw = sessionStorage.getItem('user_profile_cache')
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

function cacheProfile(profile) {
  try {
    if (profile) sessionStorage.setItem('user_profile_cache', JSON.stringify(profile))
    else sessionStorage.removeItem('user_profile_cache')
  } catch {
    // ignore
  }
}

function clearSession() {
  try {
    sessionStorage.removeItem('user_id')
    sessionStorage.removeItem('user_email')
    sessionStorage.removeItem('user_profile_cache')
  } catch {
    // ignore
  }
}

export function UserProvider({ children }) {
  const [userId, setUserId] = useState(() => getStoredUserId())
  const [profile, setProfile] = useState(() => getStoredProfile())
  const [loadingProfile, setLoadingProfile] = useState(false)

  const fetchProfile = useCallback(async (targetUserId) => {
    if (!targetUserId) return null
    setLoadingProfile(true)
    try {
      const data = await api.getProfile(targetUserId)
      setProfile(data)
      cacheProfile(data)
      if (data?.email) sessionStorage.setItem('user_email', data.email)
      return data
    } finally {
      setLoadingProfile(false)
    }
  }, [])

  useEffect(() => {
    if (!userId) return
    fetchProfile(userId).catch(() => {
      const fallbackEmail = getStoredEmail()
      const fallback = profile || {
        user_id: userId,
        full_name: '',
        email: fallbackEmail,
        avatar_url: '',
        created_at: null,
      }
      setProfile(fallback)
      cacheProfile(fallback)
    })
  }, [userId])

  const login = useCallback(async ({ userId: nextUserId, email }) => {
    const numericId = nextUserId ? Number(nextUserId) : null
    if (numericId) sessionStorage.setItem('user_id', String(numericId))
    if (email) sessionStorage.setItem('user_email', email)
    setUserId(numericId)
    if (numericId) {
      try {
        await fetchProfile(numericId)
      } catch {
        const fallback = {
          user_id: numericId,
          full_name: '',
          email: email || '',
          avatar_url: '',
          created_at: null,
        }
        setProfile(fallback)
        cacheProfile(fallback)
      }
    }
  }, [fetchProfile])

  const continueAsGuest = useCallback(({ email } = {}) => {
    clearSession()
    if (email) sessionStorage.setItem('user_email', email)
    setUserId(null)
    setProfile({
      user_id: null,
      full_name: '',
      email: email || '',
      avatar_url: '',
      created_at: null,
    })
  }, [])

  const logout = useCallback(() => {
    clearSession()
    setUserId(null)
    setProfile(null)
  }, [])

  const updateProfile = useCallback(async ({ full_name, email, avatar_url }) => {
    if (!userId) throw new Error('No signed-in user')
    const data = await api.updateProfile({
      user_id: userId,
      full_name,
      email,
      avatar_url,
    })
    setProfile(data)
    cacheProfile(data)
    if (data?.email) sessionStorage.setItem('user_email', data.email)
    return data
  }, [userId])

  const value = useMemo(() => ({
    userId,
    profile,
    loadingProfile,
    login,
    continueAsGuest,
    logout,
    fetchProfile,
    updateProfile,
  }), [userId, profile, loadingProfile, login, continueAsGuest, logout, fetchProfile, updateProfile])

  return <UserContext.Provider value={value}>{children}</UserContext.Provider>
}

export function useUser() {
  const ctx = useContext(UserContext)
  if (!ctx) throw new Error('useUser must be used within UserProvider')
  return ctx
}
