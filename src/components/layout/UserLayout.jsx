import { NavLink, Outlet } from 'react-router-dom'
import { Building2, Compass, Home, Radar } from 'lucide-react'

const navLinkClass = ({ isActive }) =>
  [
    'rounded-xl px-3 py-2 text-sm font-medium transition-all duration-300 hover:-translate-y-1 hover:shadow-md',
    isActive
      ? 'bg-teal-50 text-teal-700 shadow-sm'
      : 'text-slate-600 hover:bg-white/60 hover:text-slate-900',
  ].join(' ')

const navItems = [
  { to: '/onboarding', label: 'Onboarding', icon: Compass },
  { to: '/search', label: 'Smart Search', icon: Building2 },
  { to: '/compare', label: 'Compare', icon: Radar },
]

export default function UserLayout() {
  return (
    <div className="min-h-svh bg-slate-50">
      <header className="sticky top-0 z-40 border-b border-slate-100/80 bg-white/70 shadow-sm backdrop-blur-md">
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
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <Outlet />
      </main>
    </div>
  )
}
