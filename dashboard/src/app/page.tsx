'use client'

import { useEffect, useState, useMemo } from 'react'
import type { TimelineRecord, FilterState } from '@/lib/types'
import { applyFilters, computeStats, buildHistogramData, buildMonthlyTrendData } from '@/lib/data'
import { formatDate } from '@/lib/utils'

import Nav from '@/components/nav'
import PersonalTimeline from '@/components/personal-timeline'
import Filters from '@/components/filters'
import StatsCards from '@/components/stats-cards'
import { ProcessingTimeChart, MonthlyTrendChart } from '@/components/charts'
import DataTable from '@/components/data-table'
import Footer from '@/components/footer'

export default function Home() {
  const [records, setRecords] = useState<TimelineRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [fetchedAt, setFetchedAt] = useState<string | null>(null)
  const [filters, setFilters] = useState<FilterState>({ type: 'all', premium: 'all' })

  useEffect(() => {
    fetch(`${process.env.NEXT_PUBLIC_BASE_PATH ?? ''}/api/data`)
      .then((r) => {
        if (!r.ok) throw new Error('Failed to load data')
        return r.json()
      })
      .then((data: TimelineRecord[]) => {
        setRecords(data)
        setFetchedAt(formatDate(new Date().toISOString().slice(0, 10)))
        setLoading(false)
      })
      .catch((e) => {
        setError(e.message)
        setLoading(false)
      })
  }, [])

  const filtered = useMemo(() => applyFilters(records, filters), [records, filters])
  const stats = useMemo(() => computeStats(filtered), [filtered])
  const histogramData = useMemo(() => buildHistogramData(filtered), [filtered])
  const trendData = useMemo(() => buildMonthlyTrendData(filtered), [filtered])

  return (
    <div className="min-h-screen flex flex-col" style={{ backgroundColor: 'var(--canvas)' }}>
      <Nav lastUpdated={fetchedAt} />

      <main className="flex-1 max-w-6xl mx-auto w-full px-6 py-10 space-y-10">

        {/* Hero */}
        <div>
          <h1
            className="text-3xl font-bold mb-2"
            style={{ color: 'var(--ink)', letterSpacing: '-0.5px' }}
          >
            OPT Processing Timelines
          </h1>
          <p className="text-base max-w-xl" style={{ color: 'var(--body)' }}>
            Real processing times shared by students on Reddit. Use this to calibrate your expectations
            and understand what&apos;s typical for your situation.
          </p>
        </div>

        {/* Personal Timeline */}
        <section>
          <PersonalTimeline />
        </section>

        {/* Loading / Error states */}
        {loading && (
          <div className="space-y-4">
            <div
              className="rounded-md border h-24 animate-pulse"
              style={{ backgroundColor: 'var(--surface-soft)', borderColor: 'var(--hairline)' }}
            />
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              {[...Array(4)].map((_, i) => (
                <div
                  key={i}
                  className="rounded-md border h-28 animate-pulse"
                  style={{ backgroundColor: 'var(--surface-soft)', borderColor: 'var(--hairline)' }}
                />
              ))}
            </div>
          </div>
        )}

        {error && (
          <div
            className="rounded-md border p-6"
            style={{ backgroundColor: '#f7d6d3', borderColor: '#cd4239' }}
          >
            <p className="font-semibold" style={{ color: '#cd4239' }}>
              Could not load timeline data
            </p>
            <p className="text-sm mt-1" style={{ color: 'var(--body)' }}>
              Make sure <code className="px-1 py-0.5 rounded text-xs" style={{ backgroundColor: 'var(--surface-soft)' }}>dashboard/data/timeline.csv</code> exists. Copy it from <code className="px-1 py-0.5 rounded text-xs" style={{ backgroundColor: 'var(--surface-soft)' }}>scraper/out/timeline.csv</code>.
            </p>
          </div>
        )}

        {!loading && !error && (
          <>
            {/* Filters */}
            <section>
              <Filters filters={filters} onChange={setFilters} total={filtered.length} />
            </section>

            {/* Stats */}
            <section>
              <StatsCards stats={stats} />
            </section>

            {/* Charts */}
            <section className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <ProcessingTimeChart data={histogramData} />
              <MonthlyTrendChart data={trendData} />
            </section>

            {/* Data Table */}
            <section>
              <DataTable records={filtered} />
            </section>
          </>
        )}
      </main>

      <Footer />
    </div>
  )
}
