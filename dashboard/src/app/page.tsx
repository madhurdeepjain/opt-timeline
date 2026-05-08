'use client'

import { useEffect, useState, useMemo } from 'react'
import Papa from 'papaparse'
import type { TimelineRecord, FilterState } from '@/lib/types'
import { CITIZENSHIP_UNSPECIFIED, DEFAULT_FILTERS } from '@/lib/types'
import { applyFilters, computeStats, buildHistogramData, buildMonthlyTrendData } from '@/lib/data'
import { formatDate } from '@/lib/utils'

import Nav from '@/components/nav'
import UserJourney from '@/components/user-journey'
import PersonalTimeline from '@/components/personal-timeline'
import Filters from '@/components/filters'
import StatsCards from '@/components/stats-cards'
import { ProcessingTimeChart, MonthlyTrendChart } from '@/components/charts'
import DataTable from '@/components/data-table'
import Footer from '@/components/footer'
import WhereAreYouCard from '@/components/where-are-you'
import StageFunnel from '@/components/stage-funnel'
import MilestoneBreakdown from '@/components/milestone-breakdown'
import CountryBreakdown from '@/components/country-breakdown'

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
    ban_status: (row.ban_status === 'restricted' || row.ban_status === 'non_restricted') ? row.ban_status : null,
    days_to_approval: parseNum(row.days_to_approval),
    days_to_card: parseNum(row.days_to_card),
    raw_text: row.raw_text ?? '',
  }
}

export default function Home() {
  const [records, setRecords] = useState<TimelineRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [fetchedAt, setFetchedAt] = useState<string | null>(null)
  const [filters, setFilters] = useState<FilterState>(() => {
    if (typeof window === 'undefined') return DEFAULT_FILTERS
    try {
      const prefs = JSON.parse(localStorage.getItem('way-prefs') ?? '{}')
      const type: FilterState['type'] = prefs.typeFilter === 'OPT' ? 'OPT' : prefs.typeFilter === 'STEM' ? 'STEM' : 'all'
      const premium: FilterState['premium'] = prefs.premiumFilter === 'premium' ? 'premium' : prefs.premiumFilter === 'standard' ? 'standard' : 'all'
      return { ...DEFAULT_FILTERS, type, premium }
    } catch { return DEFAULT_FILTERS }
  })

  useEffect(() => {
    function handleSync(e: Event) {
      const { typeFilter, premiumFilter, source } = (e as CustomEvent).detail
      if (source === 'page') return
      setFilters(prev => ({
        ...prev,
        type: typeFilter === 'OPT' ? 'OPT' : typeFilter === 'STEM' ? 'STEM' : 'all',
        premium: premiumFilter === 'premium' ? 'premium' : premiumFilter === 'standard' ? 'standard' : 'all',
      }))
    }
    window.addEventListener('opt-filters-sync', handleSync)
    return () => window.removeEventListener('opt-filters-sync', handleSync)
  }, [])

  function handleFiltersChange(newFilters: FilterState) {
    setFilters(newFilters)
    if (newFilters.type !== filters.type || newFilters.premium !== filters.premium) {
      const typeFilter = (newFilters.type === 'OPT' || newFilters.type === 'STEM') ? newFilters.type : null
      const premiumFilter = (newFilters.premium === 'premium' || newFilters.premium === 'standard') ? newFilters.premium : null
      try {
        const prefs = JSON.parse(localStorage.getItem('way-prefs') ?? '{}')
        localStorage.setItem('way-prefs', JSON.stringify({ ...prefs, typeFilter, premiumFilter }))
      } catch {}
      window.dispatchEvent(new CustomEvent('opt-filters-sync', { detail: { typeFilter, premiumFilter, source: 'page' } }))
    }
  }

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

  // Facet counts: each dimension's counts are computed against records that
  // pass all *other* active filters (the dimension itself is neutralized so
  // its own selection doesn't zero out the alternatives).

  const pillCounts = useMemo(() => {
    const baseType = applyFilters(records, { ...filters, type: 'all' })
    const basePremium = applyFilters(records, { ...filters, premium: 'all' })
    const baseApproved = applyFilters(records, { ...filters, approved: 'all' })
    let opt = 0, stem = 0, typeUnk = 0
    for (const r of baseType) {
      if (r.normalized_type === 'OPT') opt++
      else if (r.normalized_type === 'STEM') stem++
      else typeUnk++
    }
    let std = 0, prem = 0, premUnk = 0
    for (const r of basePremium) {
      if (r.premium_processing === false) std++
      else if (r.premium_processing === true) prem++
      else premUnk++
    }
    let approvedYes = 0
    for (const r of baseApproved) if (r.date_approved) approvedYes++
    return {
      type: { OPT: opt, STEM: stem, unknown: typeUnk },
      premium: { standard: std, premium: prem, unknown: premUnk },
      approved: { yes: approvedYes, no: baseApproved.length - approvedYes, unknown: 0 },
    }
  }, [records, filters])

  const cardStatusCounts = useMemo(() => {
    const base = applyFilters(records, { ...filters, cardStatus: [] })
    const c = { none: 0, produced: 0, received: 0 }
    for (const r of base) {
      if (r.date_card_received) c.received++
      else if (r.date_card_produced) c.produced++
      else c.none++
    }
    return c
  }, [records, filters])

  const ternaryCounts = useMemo(() => {
    const base = applyFilters(records, { ...filters, rfie: 'all' })
    let rfieYes = 0
    for (const r of base) if (r.rfie_date) rfieYes++
    return { rfie: { yes: rfieYes, no: base.length - rfieYes } }
  }, [records, filters])

  const banStatusCounts = useMemo(() => {
    const base = applyFilters(records, { ...filters, banStatus: [] })
    const c = { restricted: 0, non_restricted: 0, unknown: 0 }
    for (const r of base) {
      if (r.ban_status === 'restricted') c.restricted++
      else if (r.ban_status === 'non_restricted') c.non_restricted++
      else c.unknown++
    }
    return c
  }, [records, filters])

  const citizenshipOptions = useMemo(() => {
    const base = applyFilters(records, { ...filters, citizenship: [] })
    const counts = new Map<string, number>()
    let unspecified = 0
    for (const r of base) {
      if (r.country_of_citizenship) counts.set(r.country_of_citizenship, (counts.get(r.country_of_citizenship) ?? 0) + 1)
      else unspecified++
    }
    // Keep currently-selected options visible at count=0 so users can still toggle them off
    for (const sel of filters.citizenship) {
      if (sel !== CITIZENSHIP_UNSPECIFIED && !counts.has(sel)) counts.set(sel, 0)
    }
    const entries = [...counts.entries()]
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .map(([country, count]) => ({ country, count }))
    return { entries, unspecified }
  }, [records, filters])

  const appliedDateBounds = useMemo(() => {
    const dates = records.map((r) => r.date_applied).filter((d): d is string => !!d).sort()
    return { min: dates[0] ?? null, max: dates[dates.length - 1] ?? null }
  }, [records])

  const appliedDateDistribution = useMemo(() => {
    // Bar height = full-dataset count per month (stable across filter changes).
    // inScope = count after applying all other filters (drives the in-scope tint).
    const total: Record<string, number> = {}
    for (const r of records) {
      if (!r.date_applied) continue
      const ym = r.date_applied.slice(0, 7)
      total[ym] = (total[ym] ?? 0) + 1
    }
    const base = applyFilters(records, { ...filters, appliedDateFrom: null, appliedDateTo: null })
    const inScope: Record<string, number> = {}
    for (const r of base) {
      if (!r.date_applied) continue
      const ym = r.date_applied.slice(0, 7)
      inScope[ym] = (inScope[ym] ?? 0) + 1
    }
    return Object.entries(total)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([month, count]) => ({ month, count, inScope: inScope[month] ?? 0 }))
  }, [records, filters])

  const threadCounts = useMemo(() => {
    const base = applyFilters(records, { ...filters, threads: [] })
    const counts: Record<string, number> = {}
    for (const r of base) {
      const id = r.permalink.split('/comments/')[1]?.split('/')[0] ?? ''
      if (id) counts[id] = (counts[id] ?? 0) + 1
    }
    return counts
  }, [records, filters])

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
            {/* User's personal journey tracker */}
            <section>
              <UserJourney />
            </section>

            {/* Where Are You — uses own 2026-thread scope, unaffected by global filters */}
            <section>
              <WhereAreYouCard records={records} />
            </section>

            {/* Filters */}
            <section>
              <Filters filters={filters} onChange={handleFiltersChange} total={filtered.length} citizenshipOptions={citizenshipOptions} banStatusCounts={banStatusCounts} cardStatusCounts={cardStatusCounts} ternaryCounts={ternaryCounts} pillCounts={pillCounts} threadCounts={threadCounts} appliedDateBounds={appliedDateBounds} appliedDateDistribution={appliedDateDistribution} />
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

            {/* Stage Funnel */}
            <section>
              <StageFunnel records={filtered} />
            </section>

            {/* Milestone Breakdown */}
            <section>
              <MilestoneBreakdown records={filtered} />
            </section>

            {/* Country Breakdown */}
            <section>
              <CountryBreakdown records={filtered} />
            </section>

            {/* Data Table */}
            <section>
              <DataTable records={filtered} />
            </section>

            {/* Personal Timeline */}
            <section>
              <PersonalTimeline />
            </section>
          </>
        )}
      </main>

      <Footer />
    </div>
  )
}
