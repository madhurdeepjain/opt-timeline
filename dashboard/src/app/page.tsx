'use client'

import { useEffect, useState, useMemo } from 'react'
import type { TimelineRecord, FilterState } from '@/lib/types'
import { CITIZENSHIP_UNSPECIFIED, SERVICE_CENTER_UNSPECIFIED, DEFAULT_FILTERS } from '@/lib/types'
import { applyFilters, computeStats, buildHistogramData, buildMonthlyTrendData } from '@/lib/data'
import { formatDate } from '@/lib/utils'
import { fetchAllTimeline, fetchMeta } from '@/lib/supabase'

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

// Supabase returns typed JSON (real booleans, numbers, and 'YYYY-MM-DD' date
// strings or null), so these coercions just narrow/normalize rather than parse.
function asStr(v: unknown): string | null {
  return typeof v === 'string' && v.trim() !== '' ? v.trim() : null
}

function asBool(v: unknown): boolean | null {
  return typeof v === 'boolean' ? v : null
}

function asNum(v: unknown): number | null {
  return typeof v === 'number' && !isNaN(v) ? v : null
}

function mapRow(row: Record<string, unknown>): TimelineRecord {
  return {
    comment_id: String(row.comment_id ?? ''),
    author: String(row.author ?? ''),
    created_utc: String(row.created_utc ?? ''),
    subreddit: String(row.subreddit ?? ''),
    permalink: String(row.permalink ?? ''),
    type: String(row.type ?? ''),
    normalized_type: String(row.normalized_type ?? ''),
    premium_processing: asBool(row.premium_processing),
    pp_upgraded: asBool(row.pp_upgraded),
    pp_upgrade_date: asStr(row.pp_upgrade_date),
    date_applied: asStr(row.date_applied),
    employment_start_date: asStr(row.employment_start_date),
    rfie_date: asStr(row.rfie_date),
    biometrics_requested_date: asStr(row.biometrics_requested_date),
    biometrics_completed_date: asStr(row.biometrics_completed_date),
    biometrics_location: asStr(row.biometrics_location),
    noid: asBool(row.noid),
    noid_date: asStr(row.noid_date),
    date_approved: asStr(row.date_approved),
    date_card_produced: asStr(row.date_card_produced),
    date_card_shipped: asStr(row.date_card_shipped),
    date_card_received: asStr(row.date_card_received),
    country_of_citizenship: asStr(row.country_of_citizenship),
    ban_status: (row.ban_status === 'restricted' || row.ban_status === 'non_restricted') ? row.ban_status : null,
    service_center: asStr(row.service_center),
    days_to_approval: asNum(row.days_to_approval),
    days_to_card: asNum(row.days_to_card),
    raw_text: String(row.raw_text ?? ''),
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
      const { typeFilter, premiumFilter } = (e as CustomEvent).detail
      setFilters(prev => ({
        ...prev,
        type: typeFilter === 'OPT' ? 'OPT' : typeFilter === 'STEM' ? 'STEM' : 'all',
        premium: premiumFilter === 'premium' ? 'premium' : premiumFilter === 'standard' ? 'standard' : 'all',
      }))
    }
    window.addEventListener('opt-filters-sync', handleSync)
    return () => window.removeEventListener('opt-filters-sync', handleSync)
  }, [])

  function handleFiltersClear() {
    setFilters(DEFAULT_FILTERS)
  }

  function handleFiltersChange(newFilters: FilterState) {
    setFilters(newFilters)
  }

  useEffect(() => {
    fetchMeta()
      .then(({ scraped_at }) => {
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

    fetchAllTimeline()
      .then((rows) => {
        setRecords(rows.map(mapRow))
        setLoading(false)
      })
      .catch((e) => {
        setError(e instanceof Error ? e.message : 'Failed to load data')
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
    let std = 0, prem = 0, upgraded = 0, premUnk = 0
    for (const r of basePremium) {
      if (r.premium_processing === false) std++
      else if (r.pp_upgraded === true) upgraded++
      else if (r.premium_processing === true) prem++
      else premUnk++
    }
    let approvedYes = 0
    for (const r of baseApproved) if (r.date_approved) approvedYes++
    return {
      type: { OPT: opt, STEM: stem, unknown: typeUnk },
      premium: { standard: std, premium: prem, upgraded, unknown: premUnk },
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

  const serviceCenterOptions = useMemo(() => {
    const base = applyFilters(records, { ...filters, serviceCenter: [] })
    const counts = new Map<string, number>()
    let unspecified = 0
    for (const r of base) {
      if (r.service_center) counts.set(r.service_center, (counts.get(r.service_center) ?? 0) + 1)
      else unspecified++
    }
    for (const sel of filters.serviceCenter) {
      if (sel !== SERVICE_CENTER_UNSPECIFIED && !counts.has(sel)) counts.set(sel, 0)
    }
    const entries = [...counts.entries()]
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .map(([center, count]) => ({ center, count }))
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

      <main className="flex-1 max-w-6xl mx-auto w-full px-6 py-6 space-y-10">

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
              <Filters filters={filters} onChange={handleFiltersChange} onClear={handleFiltersClear} total={filtered.length} citizenshipOptions={citizenshipOptions} serviceCenterOptions={serviceCenterOptions} banStatusCounts={banStatusCounts} cardStatusCounts={cardStatusCounts} ternaryCounts={ternaryCounts} pillCounts={pillCounts} threadCounts={threadCounts} appliedDateBounds={appliedDateBounds} appliedDateDistribution={appliedDateDistribution} />
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
