import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'

const ADMIN_USER = 'admin'
const ADMIN_PASS = 'password123'

export default function AdminLogin() {
  const navigate = useNavigate()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')

  const handleSubmit = (e) => {
    e.preventDefault()
    if (username === ADMIN_USER && password === ADMIN_PASS) {
      setError('')
      navigate('/admin/strategy')
    } else {
      setError('Invalid credentials')
    }
  }

  return (
    <div className="flex min-h-svh items-center justify-center bg-slate-50 px-4 py-12">
      <div className="w-full max-w-sm rounded-xl border border-slate-100 bg-white p-8 shadow-md">
        <h1 className="text-center text-2xl font-bold tracking-tight text-slate-900">
          Admin Portal
        </h1>

        <form onSubmit={handleSubmit} className="mt-8 space-y-5">
          <div>
            <label
              htmlFor="admin-username"
              className="block text-sm font-medium text-slate-700"
            >
              Username
            </label>
            <input
              id="admin-username"
              name="username"
              type="text"
              autoComplete="username"
              value={username}
              onChange={(e) => {
                setUsername(e.target.value)
                if (error) setError('')
              }}
              className="mt-1.5 w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 shadow-sm outline-none transition-all placeholder:text-slate-400 focus:border-teal-300 focus:ring-2 focus:ring-teal-500"
              placeholder="admin"
            />
          </div>
          <div>
            <label
              htmlFor="admin-password"
              className="block text-sm font-medium text-slate-700"
            >
              Password
            </label>
            <input
              id="admin-password"
              name="password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => {
                setPassword(e.target.value)
                if (error) setError('')
              }}
              className="mt-1.5 w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 shadow-sm outline-none transition-all placeholder:text-slate-400 focus:border-teal-300 focus:ring-2 focus:ring-teal-500"
              placeholder="••••••••"
            />
          </div>

          {error ? (
            <p className="text-sm font-medium text-red-600" role="alert">
              {error}
            </p>
          ) : null}

          <button
            type="submit"
            className="w-full rounded-lg bg-teal-600 px-4 py-3 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-teal-700"
          >
            Access Dashboard
          </button>
        </form>

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
