import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, BedDouble, MapPin, Sparkles, Star } from 'lucide-react'
import {
  Cell,
  Legend,
  RadialBar,
  RadialBarChart,
  ResponsiveContainer,
  Tooltip,
} from 'recharts'

const GALLERY_IMAGES = [
  'https://images.unsplash.com/photo-1618773928121-c32242e63f39?w=1600&q=80',
  'https://images.unsplash.com/photo-1566073771259-6a8506099945?w=1600&q=80',
  'https://images.unsplash.com/photo-1522708323590-d24dbb6b0267?w=1600&q=80',
  'https://images.unsplash.com/photo-1502672260266-1c1ef2d93688?w=1600&q=80',
]

const sentimentRadial = [
  { name: 'Positive', value: 62, fill: '#0d9488' },
  { name: 'Neutral', value: 28, fill: '#94a3b8' },
  { name: 'Negative', value: 10, fill: '#fb7185' },
]

const vibeTags = ['Quiet', 'Walkable', 'Waterfront']

export default function PropertyDetails() {
  const navigate = useNavigate()
  const { id } = useParams()
  const propertyId = id ?? '123'
  const [activeImage, setActiveImage] = useState(0)

  return (
    <div className="space-y-8">
      <div className="flex items-center gap-3">
        <Link
          to="/search"
          className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 shadow-sm transition-all duration-300 hover:-translate-y-0.5 hover:border-teal-200 hover:text-teal-800 hover:shadow-md"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden />
          Back to Search
        </Link>
      </div>

      <div className="overflow-hidden rounded-2xl border border-slate-100 bg-white shadow-sm">
        <div className="relative aspect-[21/9] max-h-[420px] w-full">
          <img
            src={GALLERY_IMAGES[activeImage]}
            alt=""
            className="h-full w-full object-cover"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-slate-950/60 via-transparent to-transparent" />
          <div className="absolute bottom-0 left-0 p-6 sm:p-8">
            <p className="text-sm font-medium text-white/80">
              Listing #{propertyId}
            </p>
            <h1 className="mt-1 text-3xl font-bold tracking-tight text-white sm:text-4xl">
              Azure Pier Residence
            </h1>
          </div>
        </div>
        <div className="flex gap-2 overflow-x-auto border-t border-slate-100 bg-slate-50/80 p-3 sm:p-4">
          {GALLERY_IMAGES.map((src, i) => (
            <button
              key={src}
              type="button"
              onClick={() => setActiveImage(i)}
              className={[
                'relative h-16 w-24 shrink-0 overflow-hidden rounded-lg ring-2 ring-offset-2 transition-all',
                activeImage === i
                  ? 'ring-teal-600 ring-offset-white'
                  : 'ring-transparent opacity-80 hover:opacity-100',
              ].join(' ')}
              aria-label={`View image ${i + 1}`}
            >
              <img src={src} alt="" className="h-full w-full object-cover" />
            </button>
          ))}
        </div>
      </div>

      <div className="grid gap-8 lg:grid-cols-2">
        <div className="space-y-6">
          <section className="rounded-2xl border border-slate-100 bg-white p-6 shadow-sm sm:p-8">
            <h2 className="text-lg font-semibold text-slate-900">
              Property details
            </h2>
            <p className="mt-3 text-slate-600 leading-relaxed">
              Waterfront loft with floor-to-ceiling glass, smart climate, and
              fast access to transit. Recent guests highlight sunrise views and
              low noise — ideal for focused remote work weeks or weekend city
              escapes.
            </p>
            <ul className="mt-6 grid gap-3 sm:grid-cols-2">
              <li className="flex items-center gap-2 text-sm text-slate-700">
                <MapPin className="h-4 w-4 shrink-0 text-teal-600" aria-hidden />
                Harbor District — 6 min walk to metro
              </li>
              <li className="flex items-center gap-2 text-sm text-slate-700">
                <BedDouble className="h-4 w-4 shrink-0 text-teal-600" aria-hidden />
                2 bedrooms · 2 baths
              </li>
              <li className="flex items-center gap-2 text-sm text-slate-700">
                <Star className="h-4 w-4 shrink-0 text-amber-500" aria-hidden />
                4.9 guest rating (128 reviews)
              </li>
            </ul>
          </section>
        </div>

        <div className="space-y-6">
          <section className="rounded-2xl border border-slate-100 bg-white p-6 shadow-sm sm:p-8">
            <div className="flex items-center gap-2 text-teal-700">
              <Sparkles className="h-5 w-5" aria-hidden />
              <h2 className="text-lg font-semibold text-slate-900">
                NLP dashboard
              </h2>
            </div>
            <p className="mt-1 text-sm text-slate-500">
              Sentiment mix from reviews & messages — updated nightly.
            </p>

            <div className="mt-5 h-56 w-full sm:h-64">
              <ResponsiveContainer width="100%" height="100%">
                <RadialBarChart
                  cx="50%"
                  cy="50%"
                  innerRadius="20%"
                  outerRadius="90%"
                  data={sentimentRadial}
                  startAngle={90}
                  endAngle={-270}
                >
                  <RadialBar
                    dataKey="value"
                    cornerRadius={6}
                    background={{ fill: '#f1f5f9' }}
                  >
                    {sentimentRadial.map((entry) => (
                      <Cell key={entry.name} fill={entry.fill} />
                    ))}
                  </RadialBar>
                  <Tooltip
                    formatter={(value, name, props) => [
                      `${value}%`,
                      props.payload.name,
                    ]}
                    contentStyle={{
                      borderRadius: '12px',
                      border: '1px solid #f1f5f9',
                      boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.08)',
                    }}
                  />
                  <Legend
                    formatter={(value) => (
                      <span className="text-xs text-slate-600">{value}</span>
                    )}
                  />
                </RadialBarChart>
              </ResponsiveContainer>
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
              {vibeTags.map((tag) => (
                <span
                  key={tag}
                  className="rounded-full bg-teal-50 px-3 py-1 text-xs font-semibold text-teal-800 ring-1 ring-teal-100"
                >
                  {tag}
                </span>
              ))}
            </div>
          </section>

          <div className="rounded-xl bg-teal-50 p-4 text-teal-900 shadow-sm ring-1 ring-teal-100/80">
            <h3 className="text-sm font-semibold">Why recommended</h3>
            <ul className="mt-3 list-inside list-disc space-y-1.5 text-sm leading-relaxed text-teal-800/90">
              <li>Strong match to your quiet + walkable preferences</li>
              <li>Price sits below similar waterfront comps</li>
              <li>Sentiment skews positive on cleanliness and location</li>
            </ul>
          </div>

          <button
            type="button"
            onClick={() => navigate(`/forecast/${propertyId}`)}
            className="w-full rounded-2xl bg-teal-600 px-5 py-3.5 text-sm font-semibold text-white shadow-sm transition-all duration-300 hover:-translate-y-1 hover:bg-teal-700 hover:shadow-md"
          >
            View Price Forecast
          </button>
        </div>
      </div>
    </div>
  )
}
