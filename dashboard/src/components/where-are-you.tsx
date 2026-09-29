'use client'

import { useState, useMemo, useEffect, useRef } from 'react'
import {
  AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine, ReferenceDot,
  LineChart, Line, CartesianGrid, Legend,
} from 'recharts'
import type { TimelineRecord } from '@/lib/types'
import { buildWaitCurve, waitCurveMaxDay, recentApprovals, sortedWaits, quantileCI, processingKind, MIN_N } from '@/lib/data'
import { daysBetween, localToday } from '@/lib/utils'
import { windowPhrase } from '@/components/wait-window-picker'

const PREFS_KEY = 'way-prefs'
const JOURNEY_KEY = 'my-journey'

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

export default function WhereAreYouCard({
  records,
  waitWindow,
  asOf,
}: {
  records: TimelineRecord[]
  waitWindow: number | null
  asOf: string
}) {
  const today = localToday()
  const [tab, setTab] = useState<'position' | 'curve'>(() => (loadPrefs().tab as 'position' | 'curve') ?? 'position')
  const [appliedDate, setAppliedDate] = useState<string>(() => loadPrefs().appliedDate ?? '')
  const [typeFilter, setTypeFilter] = useState<TypeFilter>(() => (loadPrefs().typeFilter as TypeFilter) ?? null)
  const [premiumFilter, setPremiumFilter] = useState<PremiumFilter>(() => (loadPrefs().premiumFilter as PremiumFilter) ?? null)
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

  const cohort = useMemo(() => {
    let r = base2026
    if (typeFilter) r = r.filter((x) => x.normalized_type === typeFilter)
    if (premiumFilter) r = r.filter((x) => processingKind(x) === premiumFilter)
    return r
  }, [base2026, typeFilter, premiumFilter])

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

  const byKind = useMemo(() => {
    const out: Record<'standard' | 'premium' | 'upgraded', number[]> = { standard: [], premium: [], upgraded: [] }
    for (const r of recent) {
      const k = processingKind(r)
      if (k !== 'unknown') out[k].push(r.days_to_approval as number)
    }
    for (const k of Object.keys(out) as (keyof typeof out)[]) out[k].sort((a, b) => a - b)
    return out
  }, [recent])
  const compareCurve = useMemo(() => {
    const curves = {
      Standard: byKind.standard.length >= MIN_N ? buildWaitCurve(byKind.standard, maxDay) : null,
      Premium: byKind.premium.length >= MIN_N ? buildWaitCurve(byKind.premium, maxDay) : null,
      Upgraded: byKind.upgraded.length >= MIN_N ? buildWaitCurve(byKind.upgraded, maxDay) : null,
    }
    return curve.map((pt, i) => ({
      day: pt.day,
      All: pt.pctApproved,
      Standard: curves.Standard?.[i].pctApproved,
      Premium: curves.Premium?.[i].pctApproved,
      Upgraded: curves.Upgraded?.[i].pctApproved,
    }))
  }, [curve, byKind, maxDay])

  const waitDays = appliedDate ? Math.max(0, daysBetween(appliedDate, today)) : null
  // Share of recent approvals that took no longer than the user has waited so far.
  const pctFaster = waitDays != null && enough
    ? Math.round((waits.filter((d) => d <= waitDays).length / waits.length) * 100)
    : null
  const markerDay = waitDays != null ? Math.min(Math.max(waitDays, 1), maxDay) : null
  const markerPct = markerDay != null ? curve.find((p) => p.day === markerDay)?.pctApproved : undefined
  const daysToP75 = p75 && waitDays != null ? p75.value - waitDays : null
  const ticks = Array.from({ length: Math.floor(maxDay / 30) }, (_, i) => (i + 1) * 30)
  const scope = `${waits.length} ${typeFilter ?? ''} ${premiumFilter ?? ''} cases ${windowPhrase(waitWindow)}`.replace(/\s+/g, ' ')

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
              {t === 'position' ? 'Your position' : 'Compare processing'}
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
          <div className="flex gap-1">
            <Pill active={typeFilter === 'OPT'} onClick={() => setTypeFilter(typeFilter === 'OPT' ? null : 'OPT')}>OPT</Pill>
            <Pill active={typeFilter === 'STEM'} onClick={() => setTypeFilter(typeFilter === 'STEM' ? null : 'STEM')}>STEM OPT</Pill>
          </div>
        </div>

        {/* Premium */}
        <div className="flex items-center gap-2">
          <span className="text-[12px] whitespace-nowrap" style={{ color: 'var(--mute)' }}>Processing:</span>
          <div className="flex gap-1">
            <Pill active={premiumFilter === 'standard'} onClick={() => setPremiumFilter(premiumFilter === 'standard' ? null : 'standard')}>Standard</Pill>
            <Pill active={premiumFilter === 'premium'} onClick={() => setPremiumFilter(premiumFilter === 'premium' ? null : 'premium')}>Premium</Pill>
            <Pill active={premiumFilter === 'upgraded'} onClick={() => setPremiumFilter(premiumFilter === 'upgraded' ? null : 'upgraded')}>Upgraded</Pill>
          </div>
        </div>
      </div>

      {/* Summary strip */}
      {waitDays != null && enough ? (
        <div className="grid grid-cols-3 gap-3">
          <div className="rounded-md p-3" style={{ backgroundColor: 'var(--surface-soft)' }}>
            <div className="text-lg font-bold leading-tight" style={{ color: 'var(--ink)' }}>
              Day {waitDays}
            </div>
            <div className="text-[11px] mt-0.5" style={{ color: 'var(--mute)' }}>
              since you applied
            </div>
          </div>
          <div className="rounded-md p-3" style={{ backgroundColor: 'var(--surface-soft)' }}>
            <div className="text-lg font-bold leading-tight" style={{ color: 'var(--ink)' }}>
              {pctFaster}%
            </div>
            <div className="text-[11px] mt-0.5" style={{ color: 'var(--mute)' }}>
              of recently approved similar cases waited this long or less
            </div>
          </div>
          <div className="rounded-md p-3" style={{ backgroundColor: 'var(--surface-soft)' }}>
            {p75 && daysToP75 != null && daysToP75 <= 0 ? (
              <>
                <div className="text-lg font-bold leading-tight" style={{ color: '#f7a501' }}>Past {p75.value}d</div>
                <div className="text-[11px] mt-0.5" style={{ color: 'var(--mute)' }}>longer than 3 in 4 recent approvals waited</div>
              </>
            ) : (
              <>
                <div className="text-lg font-bold leading-tight" style={{ color: 'var(--ink)' }}>
                  {p75 && daysToP75 != null ? `~${daysToP75}d` : '—'}
                </div>
                <div className="text-[11px] mt-0.5" style={{ color: 'var(--mute)' }}>
                  {p75 ? `until ${p75.value}d, the wait 3 in 4 recent approvals stayed under` : 'too few cases for a 75th percentile'}
                </div>
              </>
            )}
          </div>
        </div>
      ) : (
        <p className="text-[13px]" style={{ color: 'var(--mute)' }}>
          {enough
            ? 'Enter your applied date above, then narrow by type and processing to match your situation.'
            : `Only ${scope} — at least ${MIN_N} are needed. Try a longer window or fewer filters.`}
        </p>
      )}

      {/* Chart */}
      {!enough ? null : tab === 'position' ? (
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
                ticks={ticks}
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
              {[p50, p75, p90].map((q) => q && (
                <ReferenceLine key={q.value} x={q.value} stroke="var(--hairline)" strokeDasharray="3 3" label={{ value: `${q.value}d`, position: 'insideTopLeft', fontSize: 9, fill: '#9b9c92', offset: 3 }} />
              ))}
              {markerDay != null && <ReferenceLine x={markerDay} stroke="var(--ink)" strokeWidth={2} />}
              {markerDay != null && markerPct != null && (
                <ReferenceDot x={markerDay} y={markerPct} r={5} fill="var(--ink)" stroke="white" strokeWidth={2} />
              )}
            </AreaChart>
          </ResponsiveContainer>
          <p className="text-[11px]" style={{ color: 'var(--mute)' }}>
            Share of {scope} (2026 threads) that were approved within each number of days. Dashed lines mark the 50th, 75th and 90th percentiles where there are enough cases. Pending cases aren&apos;t included: their wait isn&apos;t known yet.
          </p>
        </>
      ) : (
        <>
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={compareCurve} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--hairline-soft)" vertical={false} />
              <XAxis
                dataKey="day"
                ticks={ticks}
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
              {byKind.standard.length >= MIN_N && <Line type="monotone" dataKey="Standard" stroke="#9b9c92" strokeWidth={1.5} strokeDasharray="4 2" dot={false} activeDot={{ r: 3 }} />}
              {byKind.premium.length >= MIN_N && <Line type="monotone" dataKey="Premium" stroke="#f7a501" strokeWidth={1.5} dot={false} activeDot={{ r: 3 }} />}
              {byKind.upgraded.length >= MIN_N && <Line type="monotone" dataKey="Upgraded" stroke="#5b9bd5" strokeWidth={1.5} dot={false} activeDot={{ r: 3 }} />}
              {markerDay != null && <ReferenceLine x={markerDay} stroke="var(--ink)" strokeWidth={1.5} strokeDasharray="3 3" opacity={0.5} />}
            </LineChart>
          </ResponsiveContainer>
          <p className="text-[11px]" style={{ color: 'var(--mute)' }}>
            Share of cases {windowPhrase(waitWindow)} approved within each number of days, by processing. Premium means premium from the start; upgraded cases are counted from their original filing date. Groups with fewer than {MIN_N} cases are hidden.
          </p>
        </>
      )}
    </div>
  )
}
