import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'

export default function AdminLogin() {
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')

  return (
    <div className="flex min-h-svh items-center justify-center bg-slate-50 px-4 py-12">
      <div className="w-full max-w-sm rounded-xl border border-slate-100 bg-white p-8 shadow-md">
        <h1 className="text-center text-2xl font-bold tracking-tight text-slate-900">
          Admin Portal
        </h1>

        <div className="mt-8 space-y-5">
          <div>
            <label
              htmlFor="admin-email"
              className="block text-sm font-medium text-slate-700"
            >
              Email
            </label>
            <input
              id="admin-email"
              name="email"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="mt-1.5 w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 shadow-sm outline-none transition-all placeholder:text-slate-400 focus:border-teal-300 focus:ring-2 focus:ring-teal-500"
              placeholder="you@company.com"
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
              onChange={(e) => setPassword(e.target.value)}
              className="mt-1.5 w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 shadow-sm outline-none transition-all placeholder:text-slate-400 focus:border-teal-300 focus:ring-2 focus:ring-teal-500"
              placeholder="••••••••"
            />
          </div>
        </div>

        <button
          type="button"
          onClick={() => navigate('/admin/strategy')}
          className="mt-8 w-full rounded-lg bg-teal-600 px-4 py-3 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-teal-700"
        >
          Access Dashboard
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
