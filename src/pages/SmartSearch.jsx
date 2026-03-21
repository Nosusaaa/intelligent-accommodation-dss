import { Link, useNavigate } from 'react-router-dom'
import {
  CalendarRange,
  GitCompare,
  MapPin,
  Search,
  Users,
} from 'lucide-react'
import { useCompare } from '../context/CompareContext.jsx'

const properties = [
  {
    id: '123',
    title: 'Harbor View Loft',
    area: 'Central District',
    price: 212,
    beds: 2,
    rating: 4.8,
    image:
      'https://images.unsplash.com/photo-1522708323590-d24dbb6b0267?w=600&q=80',
  },
  {
    id: '124',
    title: 'Garden Studio',
    area: 'Riverside',
    price: 156,
    beds: 1,
    rating: 4.6,
    image:
      'https://images.unsplash.com/photo-1502672260266-1c1ef2d93688?w=600&q=80',
  },
  {
    id: '125',
    title: 'Skyline Suite',
    area: 'Uptown',
    price: 289,
    beds: 3,
    rating: 4.9,
    image:
      'https://images.unsplash.com/photo-1493809842364-78817add7ffb?w=600&q=80',
  },
  {
    id: '126',
    title: 'Boutique Flat',
    area: 'Old Town',
    price: 178,
    beds: 2,
    rating: 4.5,
    image:
      'https://images.unsplash.com/photo-1522771739844-6a9f6d5f14af?w=600&q=80',
  },
]

const priceBubbles = [
  { label: '$156', left: '12%', top: '58%' },
  { label: '$212', left: '44%', top: '32%' },
  { label: '$289', left: '68%', top: '48%' },
  { label: '$178', left: '78%', top: '72%' },
]

export default function SmartSearch() {
  const navigate = useNavigate()
  const { items, toggleCompare, isInCompare } = useCompare()

  return (
    <div className="relative grid grid-cols-12 gap-6 pb-24 lg:gap-8">
      <aside className="col-span-12 space-y-6 md:col-span-3">
        <div>
          <label htmlFor="command-search" className="sr-only">
            Search
          </label>
          <div className="relative">
            <Search
              className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400"
              aria-hidden
            />
            <input
              id="command-search"
              type="search"
              placeholder="Search neighborhoods, vibes, transit…"
              className="w-full rounded-2xl border border-slate-100 bg-white py-3.5 pl-12 pr-4 text-sm text-slate-900 shadow-sm outline-none ring-teal-600/20 transition-all placeholder:text-slate-400 focus:border-teal-200 focus:ring-4"
            />
          </div>
        </div>

        <div className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
          <h2 className="mb-4 text-sm font-semibold text-slate-900">Filters</h2>
          <div className="space-y-5">
            <div>
              <div className="mb-2 flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-slate-400">
                <CalendarRange className="h-3.5 w-3.5" aria-hidden />
                Dates
              </div>
              <div className="grid grid-cols-2 gap-2">
                <input
                  type="date"
                  className="w-full rounded-xl border border-slate-100 bg-slate-50/80 px-3 py-2.5 text-sm text-slate-800 shadow-sm outline-none focus:border-teal-200 focus:ring-2 focus:ring-teal-600/15"
                />
                <input
                  type="date"
                  className="w-full rounded-xl border border-slate-100 bg-slate-50/80 px-3 py-2.5 text-sm text-slate-800 shadow-sm outline-none focus:border-teal-200 focus:ring-2 focus:ring-teal-600/15"
                />
              </div>
            </div>

            <div>
              <div className="mb-2 flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-slate-400">
                <Users className="h-3.5 w-3.5" aria-hidden />
                Guests
              </div>
              <select className="w-full rounded-xl border border-slate-100 bg-slate-50/80 px-3 py-2.5 text-sm text-slate-800 shadow-sm outline-none focus:border-teal-200 focus:ring-2 focus:ring-teal-600/15">
                <option>1 guest</option>
                <option>2 guests</option>
                <option>3 guests</option>
                <option>4+ guests</option>
              </select>
            </div>
          </div>
        </div>
      </aside>

      <div className="col-span-12 flex flex-col gap-6 md:col-span-9">
        <div className="relative min-h-[220px] overflow-hidden rounded-2xl bg-slate-200 shadow-inner sm:min-h-[280px]">
          <div
            className="absolute inset-0 opacity-40"
            style={{
              backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%2394a3b8' fill-opacity='0.25'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")`,
            }}
          />
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="rounded-2xl border border-white/60 bg-white/90 px-4 py-2 text-sm font-medium text-slate-600 shadow-sm backdrop-blur">
              <MapPin className="mr-2 inline h-4 w-4 text-teal-600" aria-hidden />
              Map preview — listings update as you filter
            </div>
          </div>
          {priceBubbles.map((b) => (
            <span
              key={`${b.left}-${b.top}`}
              className="absolute z-10 rounded-full bg-teal-600 px-2.5 py-1 text-xs font-bold text-white shadow-md ring-2 ring-white/90"
              style={{ left: b.left, top: b.top }}
            >
              {b.label}
            </span>
          ))}
        </div>

        <div>
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-lg font-semibold text-slate-900">
              Matching stays
            </h2>
            <span className="text-sm text-slate-500">
              {properties.length} results
            </span>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            {properties.map((p) => {
              const selected = isInCompare(p.id)
              return (
                <article
                  key={p.id}
                  className="group relative overflow-hidden rounded-2xl border border-slate-100 bg-white shadow-sm transition-all duration-300 hover:-translate-y-1 hover:shadow-md"
                >
                  <Link to="/details/123" className="block">
                    <div className="relative aspect-[16/10] overflow-hidden">
                      <img
                        src={p.image}
                        alt=""
                        className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.03]"
                      />
                      <div className="absolute inset-0 bg-gradient-to-t from-slate-900/50 to-transparent opacity-0 transition-opacity group-hover:opacity-100" />
                    </div>
                    <div className="p-4">
                      <h3 className="font-semibold text-slate-900">{p.title}</h3>
                      <p className="mt-0.5 text-sm text-slate-500">{p.area}</p>
                    </div>
                  </Link>
                  <div className="flex items-start justify-between gap-2 border-t border-slate-50 px-4 pb-4">
                    <p className="text-xs text-slate-400">
                      {p.beds} beds · {p.rating} rating
                    </p>
                    <span className="shrink-0 rounded-lg bg-teal-50 px-2 py-1 text-sm font-semibold text-teal-800">
                      ${p.price}
                    </span>
                  </div>
                  <button
                    type="button"
                    title={
                      selected ? 'Remove from compare' : 'Add to compare'
                    }
                    className={[
                      'absolute right-3 top-3 flex h-9 w-9 items-center justify-center rounded-xl border shadow-sm backdrop-blur transition-all duration-300 hover:scale-105 hover:shadow-md',
                      selected
                        ? 'border-teal-300 bg-teal-600 text-white hover:bg-teal-700'
                        : 'border-white/80 bg-white/95 text-slate-600 hover:border-teal-200 hover:text-teal-700',
                    ].join(' ')}
                    onClick={(e) => {
                      e.preventDefault()
                      e.stopPropagation()
                      toggleCompare({ id: p.id, name: p.title })
                    }}
                  >
                    <GitCompare className="h-4 w-4" aria-hidden />
                  </button>
                </article>
              )
            })}
          </div>
        </div>
      </div>

      {items.length > 0 && (
        <button
          type="button"
          onClick={() => navigate('/compare')}
          className="fixed bottom-6 right-6 z-40 flex items-center gap-2 rounded-full bg-teal-600 px-5 py-3.5 text-sm font-semibold text-white shadow-lg shadow-teal-600/30 transition-all duration-300 hover:-translate-y-1 hover:bg-teal-700 hover:shadow-xl"
        >
          <GitCompare className="h-4 w-4" aria-hidden />
          Compare ({items.length}{' '}
          {items.length === 1 ? 'item' : 'items'})
        </button>
      )}
    </div>
  )
}
