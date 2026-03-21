import { Link } from 'react-router-dom'
import { ArrowRight, Map, ShieldCheck } from 'lucide-react'

export default function Home() {
  return (
    <div className="min-h-svh bg-gradient-to-br from-slate-50 to-teal-50">
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

        <section className="mt-12 grid gap-6 pb-8 md:mt-16 md:grid-cols-2 md:gap-8">
          <article
            className="group relative flex flex-col rounded-2xl border border-slate-100 bg-white p-8 shadow-sm transition-all duration-300 hover:-translate-y-2 hover:border-teal-200/80 hover:shadow-[0_20px_50px_-12px_rgba(13,148,136,0.25)] md:p-10"
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
              to="/onboarding"
              className="mt-8 inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-teal-600 px-5 py-3.5 text-sm font-semibold text-white shadow-sm transition-all duration-300 hover:-translate-y-1 hover:bg-teal-700 hover:shadow-md sm:w-auto sm:self-start"
            >
              Start Searching
              <ArrowRight className="h-4 w-4" aria-hidden />
            </Link>
          </article>

          <article
            className="group relative flex flex-col rounded-2xl border border-slate-100 bg-white/90 p-8 shadow-sm backdrop-blur-sm transition-all duration-300 hover:-translate-y-2 hover:border-slate-200 hover:shadow-[0_20px_50px_-12px_rgba(15,23,42,0.18)] md:p-10"
          >
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-900 text-white shadow-sm ring-1 ring-slate-800 transition-all duration-300 group-hover:ring-slate-600">
              <ShieldCheck className="h-7 w-7 text-teal-400" aria-hidden />
            </div>
            <h2 className="mt-6 text-2xl font-semibold text-slate-900">
              System Admin
            </h2>
            <p className="mt-3 flex-1 text-slate-600">
              Manage algorithms, data sync, and platform strategy.
            </p>
            <Link
              to="/admin/login"
              className="mt-8 inline-flex w-full items-center justify-center rounded-2xl border-2 border-slate-200 bg-transparent px-5 py-3.5 text-sm font-semibold text-slate-800 shadow-none transition-all duration-300 hover:-translate-y-1 hover:border-teal-600 hover:bg-teal-50/50 hover:text-teal-800 hover:shadow-sm sm:w-auto sm:self-start"
            >
              Login as Admin
            </Link>
          </article>
        </section>
      </div>
    </div>
  )
}
