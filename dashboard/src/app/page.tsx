'use client'

import { useEffect, useState, useMemo } from 'react'
import Papa from 'papaparse'
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

function parseBool(v: string): boolean | null {
  if (v === 'true') return true
  if (v === 'false') return false
  return null
}

function parseNum(v: string): number | null {
  const n = parseInt(v, 10)
  return isNaN(n) ? null : n
}

function parseStr(v: string): string | null {
  return v && v.trim() !== '' ? v.trim() : null
}

function mapRow(row: Record<string, string>): TimelineRecord {
  return {
    comment_id: row.comment_id ?? '',
    author: row.author ?? '',
    created_utc: row.created_utc ?? '',
    subreddit: row.subreddit ?? '',
    permalink: row.permalink ?? '',
    type: row.type ?? '',
    normalized_type: row.normalized_type ?? '',
    premium_processing: parseBool(row.premium_processing),
    date_applied: parseStr(row.date_applied),
    rfie_date: parseStr(row.rfie_date),
    biometrics_requested_date: parseStr(row.biometrics_requested_date),
    biometrics_completed_date: parseStr(row.biometrics_completed_date),
    biometrics_location: parseStr(row.biometrics_location),
    noid: parseBool(row.noid),
    noid_date: parseStr(row.noid_date),
    date_approved: parseStr(row.date_approved),
    date_card_produced: parseStr(row.date_card_produced),
    date_card_shipped: parseStr(row.date_card_shipped),
    date_card_received: parseStr(row.date_card_received),
    country_of_citizenship: parseStr(row.country_of_citizenship),
    days_to_approval: parseNum(row.days_to_approval),
    days_to_card: parseNum(row.days_to_card),
    raw_text: row.raw_text ?? '',
    parse_errors: [],
  }
}

export default function Home() {
  const [records, setRecords] = useState<TimelineRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [fetchedAt, setFetchedAt] = useState<string | null>(null)
  const [filters, setFilters] = useState<FilterState>({ type: 'all', premium: 'all', approved: 'all', cardReceived: 'all', rfie: 'all', citizenship: [], threads: [], appliedDateFrom: null, appliedDateTo: null })

  useEffect(() => {
    const base = process.env.NEXT_PUBLIC_BASE_PATH ?? ''

    fetch(`${base}/api/meta`)
      .then((r) => r.json())
      .then(({ scraped_at }: { scraped_at: string | null }) => {
        if (scraped_at) {
          const d = new Date(scraped_at)
          const tz = Intl.DateTimeFormat().resolvedOptions().timeZone
          const tzAbbr = d.toLocaleTimeString('en-US', { timeZoneName: 'short' }).split(' ').pop() ?? tz
          setFetchedAt(
            d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) +
            ' · ' +
            d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }) +
            ' ' + tzAbbr
          )
        }
      })
      .catch(() => {})

    fetch(`${base}/api/data`, { cache: 'no-store' })
      .then((r) => {
        if (!r.ok) throw new Error(`Failed to load data (${r.status})`)
        return r.text()
      })
      .then((text) => {
        const result = Papa.parse<Record<string, string>>(text, {
          header: true,
          skipEmptyLines: true,
        })
        setRecords(result.data.map(mapRow))
        setLoading(false)
      })
      .catch((e) => {
        setError(e.message)
        setLoading(false)
      })
  }, [])

  const citizenshipOptions = useMemo(() =>
    [...new Set(records.map((r) => r.country_of_citizenship).filter((c): c is string => !!c))].sort()
  , [records])

  const appliedDateBounds = useMemo(() => {
    const dates = records.map((r) => r.date_applied).filter((d): d is string => !!d).sort()
    return { min: dates[0] ?? null, max: dates[dates.length - 1] ?? null }
  }, [records])

  const appliedDateDistribution = useMemo(() => {
    const counts: Record<string, number> = {}
    for (const r of records) {
      if (!r.date_applied) continue
      const ym = r.date_applied.slice(0, 7)
      counts[ym] = (counts[ym] ?? 0) + 1
    }
    return Object.entries(counts)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([month, count]) => ({ month, count }))
  }, [records])

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
              <Filters filters={filters} onChange={setFilters} total={filtered.length} citizenshipOptions={citizenshipOptions} appliedDateBounds={appliedDateBounds} appliedDateDistribution={appliedDateDistribution} />
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
