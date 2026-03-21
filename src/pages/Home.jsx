import { Link } from 'react-router-dom'
import { ArrowRight, Map } from 'lucide-react'

export default function Home() {
  return (
    <div className="relative min-h-svh bg-gradient-to-br from-slate-50 to-teal-50">
      <div className="absolute right-4 top-4 z-10 sm:right-6 sm:top-6">
        <Link
          to="/admin/login"
          className="text-sm font-semibold text-slate-600 transition-colors hover:text-teal-700"
        >
          Admin Login
        </Link>
      </div>

      <div className="mx-auto flex min-h-svh max-w-5xl flex-col px-4 py-16 sm:px-6 lg:px-8">
        <header className="flex flex-1 flex-col items-center justify-center text-center">
          <h1 className="max-w-4xl text-4xl font-bold tracking-tight sm:text-5xl md:text-6xl">
            <span className="bg-gradient-to-r from-teal-600 to-emerald-600 bg-clip-text text-transparent">
              Intelligent Accommodation DSS
            </span>
          </h1>
          <p className="mt-5 max-w-2xl text-lg text-slate-600 sm:text-xl">
            Decide where to stay with AI-ranked options, transparent signals,
            and forecasts you can trust — built for travelers and operators
            alike.
          </p>
        </header>

        <section className="mt-12 flex justify-center pb-8 md:mt-16">
          <article
            className="group relative flex w-full max-w-md flex-col rounded-2xl border border-slate-100 bg-white p-8 shadow-sm transition-all duration-300 hover:-translate-y-2 hover:border-teal-200/80 hover:shadow-[0_20px_50px_-12px_rgba(13,148,136,0.25)] md:p-10"
          >
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-teal-50 text-teal-600 shadow-sm ring-1 ring-teal-100/80 transition-all duration-300 group-hover:ring-teal-200">
              <Map className="h-7 w-7" aria-hidden />
            </div>
            <h2 className="mt-6 text-2xl font-semibold text-slate-900">
              Traveler Portal
            </h2>
            <p className="mt-3 flex-1 text-slate-600">
              Find your perfect stay with AI-driven insights.
            </p>
            <Link
              to="/guest-login"
              className="mt-8 inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-teal-600 px-5 py-3.5 text-sm font-semibold text-white shadow-sm transition-all duration-300 hover:-translate-y-1 hover:bg-teal-700 hover:shadow-md"
            >
              Start Searching
              <ArrowRight className="h-4 w-4" aria-hidden />
            </Link>
          </article>
        </section>
      </div>
    </div>
  )
}
