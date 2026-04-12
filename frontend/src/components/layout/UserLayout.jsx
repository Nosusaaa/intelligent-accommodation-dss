import { useEffect, useMemo, useRef, useState } from 'react'
import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import { Building2, Home, ListOrdered, LogOut, Radar, Star, User } from 'lucide-react'
import { useUser } from '../../context/UserContext.jsx'

const navLinkClass = ({ isActive }) =>
  [
    'rounded-xl px-3 py-2 text-sm font-medium transition-all duration-300 hover:-translate-y-1 hover:shadow-md',
    isActive
      ? 'bg-teal-50 text-teal-700 shadow-sm'
      : 'text-slate-600 hover:bg-white/60 hover:text-slate-900',
  ].join(' ')

const navItems = [
  { to: '/search', label: 'Smart Search', icon: Building2 },
  { to: '/rank', label: 'Rank', icon: ListOrdered },
  { to: '/compare', label: 'Compare', icon: Radar },
  { to: '/favorites', label: 'Favorites', icon: Star },
]

function initialsFromName(value) {
  const s = (value || '').trim()
  if (!s) return 'G'
  const base = s.includes('@') ? s.split('@')[0] : s
  const parts = base.split(/[._\s-]+/).filter(Boolean)
  const a = (parts[0]?.[0] || base[0] || 'U').toUpperCase()
  const b = (parts[1]?.[0] || parts[0]?.[1] || '').toUpperCase()
  return (a + b).slice(0, 2)
}

export default function UserLayout() {
  const navigate = useNavigate()
  const { profile, logout, loadingProfile } = useUser()
  const [open, setOpen] = useState(false)
  const menuRef = useRef(null)

  const initials = useMemo(
    () => initialsFromName(profile?.full_name || profile?.email || ''),
    [profile?.full_name, profile?.email],
  )
  const displayName = useMemo(
    () => profile?.full_name || profile?.email || 'Guest',
    [profile?.full_name, profile?.email],
  )

  useEffect(() => {
    function onDocDown(e) {
      if (!open) return
      const el = menuRef.current
      if (!el) return
      if (el.contains(e.target)) return
      setOpen(false)
    }
    document.addEventListener('mousedown', onDocDown)
    return () => document.removeEventListener('mousedown', onDocDown)
  }, [open])

  return (
    <div className="flex min-h-svh flex-col bg-slate-50">
      <header className="sticky top-0 z-40 shrink-0 border-b border-slate-100/80 bg-white/70 shadow-sm backdrop-blur-md">
        <div className="mx-auto grid max-w-7xl grid-cols-12 gap-4 px-4 py-4 sm:px-6 lg:px-8">
          <div className="col-span-12 flex flex-wrap items-center justify-between gap-4">
            <NavLink
              to="/"
              className="group flex items-center gap-2 rounded-2xl border border-slate-100 bg-white/80 px-3 py-2 text-slate-900 shadow-sm transition-all duration-300 hover:-translate-y-1 hover:shadow-md"
            >
              <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-teal-600 text-white shadow-sm">
                <Home className="h-4 w-4" aria-hidden />
              </span>
              <span className="text-sm font-semibold tracking-tight">
                Accommodation Decision Support
              </span>
            </NavLink>

            <div className="flex items-center gap-3">
              <nav
                className="flex flex-wrap items-center gap-1 rounded-2xl border border-slate-100 bg-white/90 p-1 shadow-sm"
                aria-label="User sections"
              >
                {navItems.map(({ to, label, icon }) => {
                  const Icon = icon
                  return (
                    <NavLink key={to} to={to} className={navLinkClass}>
                      <span className="inline-flex items-center gap-2">
                        <Icon className="h-4 w-4 text-teal-600" aria-hidden />
                        {label}
                      </span>
                    </NavLink>
                  )
                })}
              </nav>

              <div ref={menuRef} className="relative">
                <button
                  type="button"
                  onClick={() => setOpen((v) => !v)}
                  className={[
                    'group relative inline-flex h-11 w-11 items-center justify-center overflow-hidden rounded-2xl border bg-white shadow-sm transition',
                    open
                      ? 'border-teal-200 ring-4 ring-teal-600/15'
                      : 'border-slate-100 hover:border-teal-200 hover:ring-4 hover:ring-teal-600/10',
                  ].join(' ')}
                  aria-label="User menu"
                  aria-expanded={open}
                >
                  {profile?.avatar_url ? (
                    <img
                      src={profile.avatar_url}
                      alt=""
                      className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.05]"
                    />
                  ) : (
                    <span className="text-sm font-extrabold text-slate-700">
                      {loadingProfile ? '…' : initials}
                    </span>
                  )}
                  <span className="pointer-events-none absolute inset-0 rounded-2xl ring-1 ring-slate-900/5" />
                </button>

                {open ? (
                  <div className="absolute right-0 top-[calc(100%+0.75rem)] z-50 w-64 overflow-hidden rounded-2xl border border-slate-100 bg-white shadow-xl">
                    <div className="border-b border-slate-100 px-4 py-3">
                      <p className="text-xs font-bold uppercase tracking-wide text-slate-400">
                        Signed in as
                      </p>
                      <p className="mt-1 truncate text-sm font-semibold text-slate-900">
                        {displayName}
                      </p>
                      {profile?.full_name && profile?.email ? (
                        <p className="mt-0.5 truncate text-xs text-slate-500">
                          {profile.email}
                        </p>
                      ) : null}
                    </div>
                    <div className="p-2">
                      <button
                        type="button"
                        onClick={() => {
                          setOpen(false)
                          navigate('/profile')
                        }}
                        className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50 hover:text-slate-900"
                      >
                        <User className="h-4 w-4 text-teal-600" aria-hidden />
                        View Profile
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setOpen(false)
                          logout()
                          navigate('/guest-login')
                        }}
                        className="mt-1 flex w-full items-center gap-2 rounded-xl px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-red-50 hover:text-red-700"
                      >
                        <LogOut className="h-4 w-4" aria-hidden />
                        Sign Out
                      </button>
                    </div>
                  </div>
                ) : null}
              </div>
            </div>
          </div>
        </div>
      </header>

      <main className="mx-auto flex min-h-0 w-full max-w-7xl flex-1 flex-col px-4 py-4 sm:px-6 lg:px-8">
        <Outlet />
      </main>
    </div>
  )
}
