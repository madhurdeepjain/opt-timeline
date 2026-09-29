'use client'

import { useState, useMemo, useEffect, useRef } from 'react'
import {
  AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine, ReferenceDot,
  LineChart, Line, CartesianGrid, Legend,
} from 'recharts'
import type { TimelineRecord, QuantileEstimate } from '@/lib/types'
import { buildWaitCurve, waitCurveMaxDay, recentApprovals, sortedWaits, quantileCI, processingKind, MIN_N } from '@/lib/data'
import { WAIT_WINDOWS } from '@/lib/types'
import { daysBetween, formatShortDate, localToday } from '@/lib/utils'

const PREFS_KEY = 'way-prefs'
const JOURNEY_KEY = 'my-journey'

// The journey tracker above may already record an approval for this application.
function loadJourneyDates(): { applied: string | null; approved: string | null } {
  try {
    const j = JSON.parse(localStorage.getItem(JOURNEY_KEY) ?? '{}')
    return { applied: j.date_applied ?? null, approved: j.date_approved ?? null }
  } catch { return { applied: null, approved: null } }
}

function loadPrefs(): { tab?: string; appliedDate?: string; typeFilter?: string | null; premiumFilter?: string | null } {
  if (typeof window === 'undefined') return {}
  try {
    const prefs = JSON.parse(localStorage.getItem(PREFS_KEY) ?? '{}')
    // Seed from user journey if way-prefs fields are not set
    const journey = JSON.parse(localStorage.getItem(JOURNEY_KEY) ?? '{}')
    return {
      ...prefs,
      appliedDate: prefs.appliedDate || journey.date_applied || '',
      typeFilter: prefs.typeFilter || journey.type || null,
      premiumFilter: prefs.premiumFilter || (journey.premium === true ? 'premium' : journey.premium === false ? 'standard' : null),
    }
  } catch { return {} }
}

const THREAD_2026 = new Set(['1r6p9k0', '1qz1n7j'])

function postId(permalink: string): string {
  return permalink.split('/comments/')[1]?.split('/')[0] ?? ''
}

const TOOLTIP_STYLE = {
  backgroundColor: 'var(--surface-card)',
  border: '1px solid var(--hairline)',
  borderRadius: '6px',
  fontSize: '12px',
  color: 'var(--ink)',
}

type TypeFilter = 'OPT' | 'STEM' | null
type PremiumFilter = 'standard' | 'premium' | 'upgraded' | null

function Pill({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className="px-3 py-1 rounded-full text-[12px] font-medium cursor-pointer transition-colors"
      style={{
        backgroundColor: active ? 'var(--ink)' : 'var(--surface-soft)',
        color: active ? 'var(--on-ink)' : 'var(--body)',
      }}
    >
      {children}
    </button>
  )
}

function SummaryBox({ value, sub, accent }: { value: string; sub: string; accent?: boolean }) {
  return (
    <div className="rounded-md p-3" style={{ backgroundColor: 'var(--surface-soft)' }}>
      <div className="text-lg font-bold leading-tight" style={{ color: accent ? 'var(--primary)' : 'var(--ink)' }}>
        {value}
      </div>
      <div className="text-[11px] mt-0.5" style={{ color: 'var(--mute)' }}>
        {sub}
      </div>
    </div>
  )
}

export default function WhereAreYouCard({
  records,
  waitWindow,
  onWaitWindowChange,
  asOf,
}: {
  records: TimelineRecord[]
  waitWindow: number | null
  onWaitWindowChange: (days: number | null) => void
  asOf: string
}) {
  const today = localToday()
  const [tab, setTab] = useState<'position' | 'curve'>(() => (loadPrefs().tab as 'position' | 'curve') ?? 'position')
  const [appliedDate, setAppliedDate] = useState<string>(() => loadPrefs().appliedDate ?? '')
  const [typeFilter, setTypeFilter] = useState<TypeFilter>(() => (loadPrefs().typeFilter as TypeFilter) ?? null)
  const [premiumFilter, setPremiumFilter] = useState<PremiumFilter>(() => (loadPrefs().premiumFilter as PremiumFilter) ?? null)
  const [journeyDates, setJourneyDates] = useState(loadJourneyDates)
  const mountedRef = useRef(false)

  useEffect(() => {
    if (typeof window === 'undefined') return
    localStorage.setItem(PREFS_KEY, JSON.stringify({ tab, appliedDate, typeFilter, premiumFilter }))
  }, [tab, appliedDate, typeFilter, premiumFilter])

  // Broadcast type/premium changes to main filters (skip initial mount)
  useEffect(() => {
    if (!mountedRef.current) { mountedRef.current = true; return }
    window.dispatchEvent(new CustomEvent('opt-filters-sync', {
      detail: { typeFilter, premiumFilter, source: 'where-are-you' },
    }))
  }, [typeFilter, premiumFilter])

  // Keep in sync when the user fills the journey wizard above
  useEffect(() => {
    function handleJourneyUpdate(e: Event) {
      const data = (e as CustomEvent).detail as { type?: string | null; premium?: boolean | null; date_applied?: string | null }
      setAppliedDate(data.date_applied ?? '')
      setJourneyDates({ applied: data.date_applied ?? null, approved: (data as { date_approved?: string | null }).date_approved ?? null })
      setTypeFilter((data.type as TypeFilter) ?? null)
      setPremiumFilter(data.premium === true ? 'premium' : data.premium === false ? 'standard' : null)
    }
    window.addEventListener('journey-updated', handleJourneyUpdate)
    return () => window.removeEventListener('journey-updated', handleJourneyUpdate)
  }, [])


  // Always scoped to 2026 threads only
  const base2026 = useMemo(
    () => records.filter((r) => THREAD_2026.has(postId(r.permalink))),
    [records]
  )

  // "Your position" compares against the selected type and processing;
  // "By processing" keeps the type but splits every processing kind out.
  const typeCohort = useMemo(
    () => (typeFilter ? base2026.filter((x) => x.normalized_type === typeFilter) : base2026),
    [base2026, typeFilter],
  )
  const cohort = useMemo(
    () => (premiumFilter ? typeCohort.filter((x) => processingKind(x) === premiumFilter) : typeCohort),
    [typeCohort, premiumFilter],
  )

  // Everything below describes cases approved recently, not everyone who applied:
  // wait times are only known once someone reports their approval.
  const recent = useMemo(() => recentApprovals(cohort, waitWindow, asOf), [cohort, waitWindow, asOf])
  const waits = useMemo(() => sortedWaits(recent), [recent])
  const maxDay = waitCurveMaxDay(waits)
  const enough = waits.length >= MIN_N
  const curve = useMemo(() => (enough ? buildWaitCurve(waits, maxDay) : []), [enough, waits, maxDay])
  const p50 = quantileCI(waits, 0.5)
  const p75 = quantileCI(waits, 0.75)
  const p90 = quantileCI(waits, 0.9)

  const typeRecent = useMemo(() => recentApprovals(typeCohort, waitWindow, asOf), [typeCohort, waitWindow, asOf])
  const typeWaits = useMemo(() => sortedWaits(typeRecent), [typeRecent])
  const compareMax = waitCurveMaxDay(typeWaits)
  const compareEnough = typeWaits.length >= MIN_N
  const byKind = useMemo(() => {
    const out: Record<'standard' | 'premium' | 'upgraded', number[]> = { standard: [], premium: [], upgraded: [] }
    for (const r of typeRecent) {
      const k = processingKind(r)
      if (k !== 'unknown') out[k].push(r.days_to_approval as number)
    }
    for (const k of Object.keys(out) as (keyof typeof out)[]) out[k].sort((a, b) => a - b)
    return out
  }, [typeRecent])
  const compareCurve = useMemo(() => {
    if (!compareEnough) return []
    const all = buildWaitCurve(typeWaits, compareMax)
    const curves = {
      Standard: byKind.standard.length >= MIN_N ? buildWaitCurve(byKind.standard, compareMax) : null,
      Premium: byKind.premium.length >= MIN_N ? buildWaitCurve(byKind.premium, compareMax) : null,
      Upgraded: byKind.upgraded.length >= MIN_N ? buildWaitCurve(byKind.upgraded, compareMax) : null,
    }
    return all.map((pt, i) => ({
      day: pt.day,
      All: pt.pctApproved,
      Standard: curves.Standard?.[i].pctApproved,
      Premium: curves.Premium?.[i].pctApproved,
      Upgraded: curves.Upgraded?.[i].pctApproved,
    }))
  }, [compareEnough, typeWaits, compareMax, byKind])

  // Already approved (per the journey tracker, same applied date): the wait is final.
  const approvedOn = appliedDate && journeyDates.approved && journeyDates.applied === appliedDate ? journeyDates.approved : null
  const waitDays = appliedDate ? Math.max(0, daysBetween(appliedDate, approvedOn ?? today)) : null
  // Of the comparison cases: share approved by the user's day, and share that waited longer.
  const pctDone = waitDays != null && enough
    ? Math.round((waits.filter((d) => d <= waitDays).length / waits.length) * 100)
    : null
  const nLonger = waitDays != null ? waits.filter((d) => d > waitDays).length : 0
  // Percentile lines closer than ~4% of the axis share one label.
  const quantileLabels = useMemo(() => {
    const qs: [string, QuantileEstimate | null][] = [['median', p50], ['75%', p75], ['90%', p90]]
    const groups: { x: number; names: string[]; values: number[] }[] = []
    let lastX = -Infinity
    for (const [name, q] of qs) {
      if (!q) continue
      const g = groups[groups.length - 1]
      if (g && q.value - lastX < maxDay * 0.04) {
        g.names.push(name)
        g.values.push(q.value)
      } else groups.push({ x: q.value, names: [name], values: [q.value] })
      lastX = q.value
    }
    // "median 137d", or for a cluster "median–90% 182–186d"
    return groups.map((g) => ({
      x: g.x,
      text: g.names.length === 1
        ? `${g.names[0]} ${g.values[0]}d`
        : `${g.names[0]}–${g.names[g.names.length - 1]} ${g.values[0]}–${g.values[g.values.length - 1]}d`,
    }))
  }, [p50, p75, p90, maxDay])
  const markerDay = waitDays != null ? Math.min(Math.max(waitDays, 1), maxDay) : null
  const markerPct = markerDay != null ? curve.find((p) => p.day === markerDay)?.pctApproved : undefined
  const daysToP75 = p75 && waitDays != null ? p75.value - waitDays : null
  const ticksTo = (max: number) => Array.from({ length: Math.floor(max / 30) }, (_, i) => (i + 1) * 30)
  const typeLabel = typeFilter === 'STEM' ? 'STEM OPT' : typeFilter === 'OPT' ? 'OPT' : null
  const processingLabel = premiumFilter === 'premium' ? 'premium from the start' : premiumFilter
  // "108 STEM OPT · standard cases" / "892 cases"
  const groupLabel = (n: number, withProcessing: boolean) =>
    `${n} ${[typeLabel, withProcessing ? processingLabel : null].filter(Boolean).join(' · ')} cases`.replace(/\s+/g, ' ')

  return (
    <div
      className="rounded-md border p-6 flex flex-col gap-5"
      style={{ backgroundColor: 'var(--surface-card)', borderColor: 'var(--hairline)' }}
    >
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-bold uppercase tracking-widest mb-0.5" style={{ color: 'var(--mute)' }}>
            Your Wait
          </p>
          <h3 className="text-base font-bold" style={{ color: 'var(--ink)' }}>
            Where are you in the queue?
          </h3>
        </div>
        {/* Tab toggle */}
        <div
          className="flex gap-1"
          style={{ backgroundColor: 'var(--surface-soft)', borderRadius: '9999px', padding: '3px' }}
        >
          {(['position', 'curve'] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className="px-3 py-1 rounded-full text-[12px] font-medium cursor-pointer transition-colors"
              style={{
                backgroundColor: tab === t ? 'var(--ink)' : 'transparent',
                color: tab === t ? 'var(--on-ink)' : 'var(--mute)',
              }}
            >
              {t === 'position' ? 'Your position' : 'By processing'}
            </button>
          ))}
        </div>
      </div>

      {/* Controls row */}
      <div className="flex flex-wrap items-center gap-4">
        {/* Applied date */}
        <div className="flex items-center gap-2">
          <label className="text-[12px] whitespace-nowrap" style={{ color: 'var(--mute)' }}>
            Applied:
          </label>
          <input
            type="date"
            value={appliedDate}
            max={today}
            onChange={(e) => setAppliedDate(e.target.value)}
            className="text-xs px-2 py-1 rounded border outline-none"
            style={{ backgroundColor: 'var(--surface-soft)', borderColor: 'var(--hairline)', color: 'var(--ink)' }}
          />
        </div>

        {/* Type */}
        <div className="flex items-center gap-2">
          <span className="text-[12px] whitespace-nowrap" style={{ color: 'var(--mute)' }}>Type:</span>
          <div className="flex flex-wrap gap-1">
            <Pill active={typeFilter === 'OPT'} onClick={() => setTypeFilter(typeFilter === 'OPT' ? null : 'OPT')}>OPT</Pill>
            <Pill active={typeFilter === 'STEM'} onClick={() => setTypeFilter(typeFilter === 'STEM' ? null : 'STEM')}>STEM OPT</Pill>
          </div>
        </div>

        {/* Premium */}
        <div className="flex items-center gap-2">
          <span className="text-[12px] whitespace-nowrap" style={{ color: 'var(--mute)' }}>Processing:</span>
          <div className="flex flex-wrap gap-1">
            <Pill active={premiumFilter === 'standard'} onClick={() => setPremiumFilter(premiumFilter === 'standard' ? null : 'standard')}>Standard</Pill>
            <Pill active={premiumFilter === 'premium'} onClick={() => setPremiumFilter(premiumFilter === 'premium' ? null : 'premium')}>Premium</Pill>
            <Pill active={premiumFilter === 'upgraded'} onClick={() => setPremiumFilter(premiumFilter === 'upgraded' ? null : 'upgraded')}>Upgraded</Pill>
          </div>
        </div>
      </div>

      {/* Who "similar cases" are: everything below is relative to this group. */}
      <p className="text-[13px] -mt-1" style={{ color: 'var(--body)' }}>
        Compared with{' '}
        <strong style={{ color: 'var(--ink)' }}>
          {tab === 'position' ? groupLabel(waits.length, true) : groupLabel(typeWaits.length, false)}
        </strong>{' '}
        from the 2026 threads approved{' '}
        <select
          value={waitWindow ?? 'all'}
          onChange={(e) => onWaitWindowChange(e.target.value === 'all' ? null : Number(e.target.value))}
          aria-label="Approval window"
          className="text-[13px] font-semibold rounded px-1 py-0.5 cursor-pointer outline-none"
          style={{ backgroundColor: 'var(--surface-soft)', color: 'var(--ink)', border: '1px solid var(--hairline)' }}
        >
          {WAIT_WINDOWS.map((w) => (
            <option key={w ?? 'all'} value={w ?? 'all'}>
              {w === null ? 'at any time' : `in the last ${w} days`}
            </option>
          ))}
        </select>
        . Only approved cases have a known wait, so pending ones aren&apos;t counted.
      </p>

      {/* Summary strip */}
      {tab === 'position' && waitDays != null && enough ? (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {approvedOn ? (
            <>
              <SummaryBox
                value={`${waitDays} days`}
                sub={`your wait: ${formatShortDate(appliedDate)} → ${formatShortDate(approvedOn)} (from your journey)`}
              />
              <SummaryBox
                value={nLonger === waits.length ? `All ${waits.length}` : nLonger === 0 ? 'None' : `${Math.round((nLonger / waits.length) * 100)}%`}
                sub="of these cases waited longer than you"
              />
              {p50 && (
                <SummaryBox
                  value={waitDays === p50.value ? 'Same as the median' : `${Math.abs(waitDays - p50.value)} days ${waitDays < p50.value ? 'less' : 'more'}`}
                  sub={`than their median wait of ${p50.value} days`}
                />
              )}
            </>
          ) : (
            <>
              <SummaryBox value={`Day ${waitDays}`} sub={`waiting since ${formatShortDate(appliedDate)}`} />
              <SummaryBox value={`${pctDone}%`} sub={`of these cases were approved by day ${waitDays}`} />
              {p75 && daysToP75 != null && daysToP75 <= 0 ? (
                <SummaryBox value={`Past ${p75.value} days`} sub="longer than 3 in 4 of these cases waited" accent />
              ) : (
                <SummaryBox
                  value={p75 && daysToP75 != null ? `~${daysToP75} days` : '—'}
                  sub={p75 ? `until day ${p75.value}: 3 in 4 of these cases were approved by then` : 'too few cases for a 75th percentile'}
                />
              )}
            </>
          )}
        </div>
      ) : (tab === 'position' ? !enough : !compareEnough) ? (
        <p className="text-[13px]" style={{ color: 'var(--mute)' }}>
          At least {MIN_N} cases are needed. Try a longer window or fewer filters.
        </p>
      ) : tab === 'position' ? (
        <p className="text-[13px]" style={{ color: 'var(--mute)' }}>
          Enter your applied date to see where you stand.
        </p>
      ) : null}

      {/* Chart */}
      {tab === 'position' ? (!enough ? null : (
        <>
          <ResponsiveContainer width="100%" height={220}>
            <AreaChart data={curve} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="goldGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#f7a501" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#f7a501" stopOpacity={0} />
                </linearGradient>
              </defs>
              <XAxis
                dataKey="day"
                ticks={ticksTo(maxDay)}
                tick={{ fontSize: 11, fill: 'var(--mute)' }}
                axisLine={false}
                tickLine={false}
                tickFormatter={(v) => `${v}d`}
              />
              <YAxis
                tick={{ fontSize: 11, fill: 'var(--mute)' }}
                axisLine={false}
                tickLine={false}
                tickFormatter={(v) => `${v}%`}
                domain={[0, 100]}
                ticks={[0, 25, 50, 75, 100]}
                width={36}
              />
              <Tooltip
                contentStyle={TOOLTIP_STYLE}
                formatter={(val) => [`${val}%`, 'Approved within this many days']}
                labelFormatter={(v) => `Day ${v}`}
              />
              <Area type="monotone" dataKey="pctApproved" stroke="#f7a501" strokeWidth={2} fill="url(#goldGrad)" dot={false} />
              {[p50, p75, p90].map((q, i) => q && (
                <ReferenceLine key={i} x={q.value} stroke="var(--hairline)" strokeDasharray="3 3" />
              ))}
              {markerDay != null && <ReferenceLine x={markerDay} stroke="var(--ink)" strokeWidth={2} />}
              {quantileLabels.map((g) => (
                <ReferenceLine
                  key={g.x}
                  x={g.x}
                  stroke="none"
                  label={{ value: g.text, position: g.x > maxDay * 0.6 ? 'insideTopRight' : 'insideTopLeft', fontSize: 10, fill: 'var(--mute)', offset: 4 }}
                />
              ))}
              {markerDay != null && markerPct != null && (
                <ReferenceDot x={markerDay} y={markerPct} r={5} fill="var(--ink)" stroke="white" strokeWidth={2} />
              )}
            </AreaChart>
          </ResponsiveContainer>
          <p className="text-[11px]" style={{ color: 'var(--mute)' }}>
            Share of these cases approved within each number of days. Dashed lines mark the median, 75th and 90th percentiles.
          </p>
        </>
      )) : !compareEnough ? null : (
        <>
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={compareCurve} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--hairline-soft)" vertical={false} />
              <XAxis
                dataKey="day"
                ticks={ticksTo(compareMax)}
                tick={{ fontSize: 11, fill: 'var(--mute)' }}
                axisLine={false}
                tickLine={false}
                tickFormatter={(v) => `${v}d`}
              />
              <YAxis
                tick={{ fontSize: 11, fill: 'var(--mute)' }}
                axisLine={false}
                tickLine={false}
                tickFormatter={(v) => `${v}%`}
                domain={[0, 100]}
                ticks={[0, 25, 50, 75, 100]}
                width={36}
              />
              <Tooltip
                contentStyle={TOOLTIP_STYLE}
                formatter={(val) => `${val}%`}
                labelFormatter={(v) => `Approved within ${v} days`}
              />
              <Legend wrapperStyle={{ fontSize: '12px', color: 'var(--mute)', paddingTop: '8px' }} />
              <Line type="monotone" dataKey="All" stroke="var(--ink)" strokeWidth={2} dot={false} activeDot={{ r: 3 }} />
              {byKind.standard.length >= MIN_N && <Line type="monotone" dataKey="Standard" stroke="#9b9c92" strokeWidth={premiumFilter === 'standard' ? 3 : 1.5} strokeDasharray="4 2" dot={false} activeDot={{ r: 3 }} />}
              {byKind.premium.length >= MIN_N && <Line type="monotone" dataKey="Premium" stroke="#f7a501" strokeWidth={premiumFilter === 'premium' ? 3 : 1.5} dot={false} activeDot={{ r: 3 }} />}
              {byKind.upgraded.length >= MIN_N && <Line type="monotone" dataKey="Upgraded" stroke="#5b9bd5" strokeWidth={premiumFilter === 'upgraded' ? 3 : 1.5} dot={false} activeDot={{ r: 3 }} />}
              {waitDays != null && <ReferenceLine x={Math.min(Math.max(waitDays, 1), compareMax)} stroke="var(--ink)" strokeWidth={1.5} strokeDasharray="3 3" opacity={0.5} />}
            </LineChart>
          </ResponsiveContainer>
          <p className="text-[11px]" style={{ color: 'var(--mute)' }}>
            Share approved within each number of days, by how the case was processed. Premium means premium from the start; upgraded cases count from their original filing date. Groups with fewer than {MIN_N} cases are hidden.
          </p>
        </>
      )}
    </div>
  )
}
