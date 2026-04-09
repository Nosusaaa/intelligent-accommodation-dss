import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { LogIn, UserRound } from 'lucide-react'
import { api } from '../services/api.js'
import RoomSliderBackground from '../components/RoomSliderBackground.jsx'
import { useUser } from '../context/UserContext.jsx'

function errorMessageFromAxios(err) {
  const detail = err?.response?.data?.detail
  if (typeof detail === 'string') return detail
  if (Array.isArray(detail)) {
    return detail
      .map((item) => (typeof item === 'string' ? item : item?.msg))
      .filter(Boolean)
      .join(', ')
  }
  return err?.message || 'Something went wrong'
}

export default function GuestLogin() {
  const navigate = useNavigate()
  const { login, continueAsGuest } = useUser()

  const [isLoginMode, setIsLoginMode] = useState(true)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState(null)
  const [isLoading, setIsLoading] = useState(false)

  const goSearch = () => {
    continueAsGuest({ email: email.trim() })
    navigate('/search')
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setError(null)
    setIsLoading(true)
    try {
      const credentials = { email: email.trim(), password }
      if (isLoginMode) {
        const result = await api.login(credentials)
        await login({ userId: result?.user_id ?? null, email: result?.email ?? credentials.email })
        navigate('/search')
      } else {
        const result = await api.signup(credentials)
        await login({ userId: result?.user_id ?? null, email: credentials.email })
        navigate('/onboarding')
      }
    } catch (err) {
      setError(errorMessageFromAxios(err))
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="relative flex min-h-svh items-center justify-center overflow-hidden bg-gradient-to-br from-teal-50 to-emerald-50 px-4 py-12">
      {/* Animated room image grid background */}
      <RoomSliderBackground />

      {/* Login card — above the background overlay */}
      <div className="relative z-10 w-full max-w-sm rounded-2xl border border-white/80 bg-white/85 p-8 shadow-2xl backdrop-blur-md">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-teal-600 text-white shadow-sm">
          <UserRound className="h-6 w-6" aria-hidden />
        </div>
        <h1 className="mt-5 text-center text-2xl font-bold tracking-tight text-slate-900">
          Welcome
        </h1>
        <p className="mt-2 text-center text-sm text-slate-600">
          Sign up to personalize your experience, or continue as a guest.
        </p>

        {error ? (
          <p
            className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800"
            role="alert"
          >
            {error}
          </p>
        ) : null}

        <form onSubmit={handleSubmit} className="mt-6 space-y-5">
          <div>
            <label
              htmlFor="guest-email"
              className="block text-sm font-medium text-slate-700"
            >
              Email
            </label>
            <input
              id="guest-email"
              name="email"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="mt-1.5 w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 shadow-sm outline-none transition-all placeholder:text-slate-400 focus:border-teal-300 focus:ring-2 focus:ring-teal-500"
              placeholder="you@example.com"
            />
          </div>
          <div>
            <label
              htmlFor="guest-password"
              className="block text-sm font-medium text-slate-700"
            >
              Password
            </label>
            <input
              id="guest-password"
              name="password"
              type="password"
              autoComplete={isLoginMode ? 'current-password' : 'new-password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              className="mt-1.5 w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 shadow-sm outline-none transition-all placeholder:text-slate-400 focus:border-teal-300 focus:ring-2 focus:ring-teal-500"
              placeholder="••••••••"
            />
          </div>

          <button
            type="submit"
            disabled={isLoading}
            className="mt-2 flex w-full items-center justify-center gap-2 rounded-lg bg-teal-600 px-4 py-3 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-teal-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <LogIn className="h-4 w-4" aria-hidden />
            {isLoading ? 'Please wait…' : isLoginMode ? 'Sign In' : 'Sign Up'}
          </button>
        </form>

        <p className="mt-4 text-center text-sm text-slate-600">
          {isLoginMode ? (
            <>
              Don&apos;t have an account?{' '}
              <button
                type="button"
                className="font-semibold text-teal-700 underline-offset-2 hover:text-teal-900 hover:underline"
                onClick={() => {
                  setIsLoginMode(false)
                  setError(null)
                }}
              >
                Sign Up
              </button>
            </>
          ) : (
            <>
              Already have an account?{' '}
              <button
                type="button"
                className="font-semibold text-teal-700 underline-offset-2 hover:text-teal-900 hover:underline"
                onClick={() => {
                  setIsLoginMode(true)
                  setError(null)
                }}
              >
                Sign In
              </button>
            </>
          )}
        </p>

        <button
          type="button"
          onClick={goSearch}
          className="mt-3 w-full rounded-lg border-2 border-slate-200 bg-transparent px-4 py-3 text-sm font-semibold text-slate-700 shadow-none transition-all hover:border-teal-300 hover:bg-teal-50/50 hover:text-teal-900"
        >
          Continue as Guest
        </button>

        <p className="mt-6 text-center">
          <Link
            to="/"
            className="text-sm font-medium text-slate-500 transition-colors hover:text-slate-800"
          >
            ← Back to home
          </Link>
        </p>
      </div>
    </div>
  )
}
