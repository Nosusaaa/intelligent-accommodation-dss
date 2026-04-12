import { NavLink, Outlet } from 'react-router-dom'
import {
  Database,
  LayoutDashboard,
  LogOut,
  Mountain,
  SlidersHorizontal,
  Users,
} from 'lucide-react'

const sideLinkClass = ({ isActive }) =>
  [
    'flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all duration-300 hover:-translate-y-0.5 hover:shadow-md',
    isActive
      ? 'bg-white/10 text-white shadow-sm'
      : 'text-slate-300 hover:bg-white/5 hover:text-white',
  ].join(' ')

const adminNav = [
  { to: '/admin/sync', label: 'Data sync', icon: Database },
  { to: '/admin/scenic', label: 'Scenic', icon: Mountain },
  { to: '/admin/strategy', label: 'Strategy', icon: SlidersHorizontal },
  { to: '/admin/users', label: 'User data', icon: Users },
]

export default function AdminLayout() {
  return (
    <div className="flex min-h-svh bg-slate-50">
      <aside
        className="flex w-64 flex-col border-r border-slate-800 bg-slate-900 text-white"
        aria-label="Admin navigation"
      >
        <div className="border-b border-slate-800 p-5">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-teal-600 shadow-sm">
              <LayoutDashboard className="h-5 w-5" aria-hidden />
            </span>
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-slate-400">
                Admin
              </p>
              <p className="text-sm font-semibold">Control center</p>
            </div>
          </div>
        </div>
        <nav className="flex flex-1 flex-col gap-1 p-3">
          {adminNav.map(({ to, label, icon }) => {
            const Icon = icon
            return (
              <NavLink key={to} to={to} className={sideLinkClass}>
                <Icon className="h-4 w-4 shrink-0 text-teal-400" aria-hidden />
                {label}
              </NavLink>
            )
          })}
        </nav>
        <div className="border-t border-slate-800 p-3">
          <NavLink
            to="/admin/login"
            className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-slate-300 transition-all duration-300 hover:-translate-y-0.5 hover:bg-white/5 hover:text-white hover:shadow-md"
          >
            <LogOut className="h-4 w-4" aria-hidden />
            Sign in
          </NavLink>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 border-b border-slate-100 bg-white/80 shadow-sm backdrop-blur-md">
          <div className="flex items-center justify-between px-6 py-4">
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-slate-400">
                Intelligent accommodation
              </p>
              <p className="text-lg font-semibold text-slate-900">
                Operations dashboard
              </p>
            </div>
            <div className="rounded-2xl border border-slate-100 bg-white px-3 py-1.5 text-xs text-slate-500 shadow-sm">
              Admin workspace
            </div>
          </div>
        </header>
        <main className="flex-1 px-6 py-8">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
