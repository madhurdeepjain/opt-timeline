'use client'

import { useState, useMemo, useEffect, useRef } from 'react'
import {
  AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine, ReferenceDot,
  LineChart, Line, CartesianGrid, Legend,
} from 'recharts'
import type { TimelineRecord } from '@/lib/types'
import { buildSurvivalCurve } from '@/lib/data'
import { daysBetween } from '@/lib/utils'

const TODAY = new Date().toISOString().slice(0, 10)

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
type PremiumFilter = 'standard' | 'premium' | null

function Pill({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className="px-3 py-1 rounded-full text-[12px] font-medium cursor-pointer transition-colors"
      style={{
        backgroundColor: active ? 'var(--ink)' : 'var(--surface-soft)',
        color: active ? '#fff' : 'var(--body)',
      }}
    >
      {children}
    </button>
  )
}

export default function WhereAreYouCard({ records }: { records: TimelineRecord[] }) {
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

  // Keep in sync when main filters change type/premium
  useEffect(() => {
    function handleSync(e: Event) {
      const { typeFilter: tf, premiumFilter: pf, source } = (e as CustomEvent).detail
      if (source === 'where-are-you') return
      setTypeFilter(tf ?? null)
      setPremiumFilter(pf ?? null)
    }
    window.addEventListener('opt-filters-sync', handleSync)
    return () => window.removeEventListener('opt-filters-sync', handleSync)
  }, [])

  // Always scoped to 2026 threads only
  const base2026 = useMemo(
    () => records.filter((r) => THREAD_2026.has(postId(r.permalink))),
    [records]
  )

  const cohort = useMemo(() => {
    let r = base2026
    if (typeFilter) r = r.filter((x) => x.normalized_type === typeFilter)
    if (premiumFilter === 'premium') r = r.filter((x) => x.premium_processing === true)
    if (premiumFilter === 'standard') r = r.filter((x) => x.premium_processing === false)
    return r
  }, [base2026, typeFilter, premiumFilter])

  const allCurve = useMemo(() => buildSurvivalCurve(cohort), [cohort])
  const standardCurve = useMemo(
    () => buildSurvivalCurve(cohort.filter((r) => r.premium_processing === false)),
    [cohort]
  )
  const premiumCurve = useMemo(
    () => buildSurvivalCurve(cohort.filter((r) => r.premium_processing === true)),
    [cohort]
  )

  const waitDays = appliedDate ? Math.max(0, daysBetween(appliedDate, TODAY)) : null
  const clampedDay = waitDays != null ? Math.min(Math.max(waitDays, 1), 120) : null

  const p50 = useMemo(() => allCurve.find((p) => p.pctApproved >= 50), [allCurve])
  const p75 = useMemo(() => allCurve.find((p) => p.pctApproved >= 75), [allCurve])
  const p90 = useMemo(() => allCurve.find((p) => p.pctApproved >= 90), [allCurve])

  const userPoint = clampedDay != null
    ? allCurve.find((p) => p.day === clampedDay) ?? allCurve[allCurve.length - 1]
    : null

  const daysToP75 = p75 && waitDays != null ? Math.max(0, p75.day - waitDays) : null
  const pastP75 = p75 && waitDays != null && waitDays >= p75.day

  const mergedCurve = useMemo(
    () => allCurve.map((pt, i) => ({
      day: pt.day,
      All: pt.pctPending,
      Standard: standardCurve[i]?.pctPending,
      Premium: premiumCurve[i]?.pctPending,
    })),
    [allCurve, standardCurve, premiumCurve]
  )

  const approvedCount = cohort.filter((r) => typeof r.days_to_approval === 'number' && r.days_to_approval > 0).length

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
                color: tab === t ? '#fff' : 'var(--mute)',
              }}
            >
              {t === 'position' ? 'Your position' : 'Approval curve'}
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
            max={TODAY}
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
          </div>
        </div>
      </div>

      {/* Summary strip */}
      {waitDays != null && userPoint ? (
        <div className="grid grid-cols-3 gap-3">
          <div className="rounded-md p-3" style={{ backgroundColor: 'var(--surface-soft)' }}>
            <div className="text-lg font-bold leading-tight" style={{ color: 'var(--ink)' }}>
              Day {waitDays}
            </div>
            <div className="text-[11px] mt-0.5" style={{ color: 'var(--mute)' }}>
              {waitDays > 120 ? 'beyond our 120-day range' : 'in the queue'}
            </div>
          </div>
          <div className="rounded-md p-3" style={{ backgroundColor: 'var(--surface-soft)' }}>
            <div className="text-lg font-bold leading-tight" style={{ color: 'var(--ink)' }}>
              {waitDays > 120 ? '>95' : userPoint.pctApproved}%
            </div>
            <div className="text-[11px] mt-0.5" style={{ color: 'var(--mute)' }}>
              of similar cases had approval by now
            </div>
          </div>
          <div className="rounded-md p-3" style={{ backgroundColor: 'var(--surface-soft)' }}>
            {pastP75 ? (
              <>
                <div className="text-lg font-bold leading-tight" style={{ color: '#f7a501' }}>Past 75th%</div>
                <div className="text-[11px] mt-0.5" style={{ color: 'var(--mute)' }}>most similar cases are done</div>
              </>
            ) : (
              <>
                <div className="text-lg font-bold leading-tight" style={{ color: 'var(--ink)' }}>
                  {daysToP75 != null ? `~${daysToP75}d` : '—'}
                </div>
                <div className="text-[11px] mt-0.5" style={{ color: 'var(--mute)' }}>until 75% of similar cases are done</div>
              </>
            )}
          </div>
        </div>
      ) : (
        <p className="text-[13px]" style={{ color: 'var(--mute)' }}>
          Enter your applied date above, then narrow by type and processing to match your situation.
        </p>
      )}

      {/* Chart */}
      {allCurve.length === 0 ? (
        <p className="text-[13px] text-center py-8" style={{ color: 'var(--mute)' }}>
          No records match the selected combination.
        </p>
      ) : tab === 'position' ? (
        <>
          <ResponsiveContainer width="100%" height={220}>
            <AreaChart data={allCurve} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="goldGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#f7a501" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#f7a501" stopOpacity={0} />
                </linearGradient>
              </defs>
              <XAxis
                dataKey="day"
                ticks={[15, 30, 45, 60, 75, 90, 105, 120]}
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
                formatter={(val) => [`${val}%`, 'Approved by this day']}
                labelFormatter={(v) => `Day ${v}`}
              />
              <Area type="monotone" dataKey="pctApproved" stroke="#f7a501" strokeWidth={2} fill="url(#goldGrad)" dot={false} />
              {p50 && <ReferenceLine x={p50.day} stroke="var(--hairline)" strokeDasharray="3 3" label={{ value: `${p50.day}d`, position: 'insideTopLeft', fontSize: 9, fill: '#9b9c92', offset: 3 }} />}
              {p75 && <ReferenceLine x={p75.day} stroke="var(--hairline)" strokeDasharray="3 3" label={{ value: `${p75.day}d`, position: 'insideTopLeft', fontSize: 9, fill: '#9b9c92', offset: 3 }} />}
              {p90 && <ReferenceLine x={p90.day} stroke="var(--hairline)" strokeDasharray="3 3" label={{ value: `${p90.day}d`, position: 'insideTopLeft', fontSize: 9, fill: '#9b9c92', offset: 3 }} />}
              {clampedDay != null && <ReferenceLine x={clampedDay} stroke="var(--ink)" strokeWidth={2} />}
              {clampedDay != null && userPoint && (
                <ReferenceDot x={clampedDay} y={userPoint.pctApproved} r={5} fill="var(--ink)" stroke="white" strokeWidth={2} />
              )}
            </AreaChart>
          </ResponsiveContainer>
          <p className="text-[11px]" style={{ color: 'var(--mute)' }}>
            Dashed lines mark when 50%, 75%, and 90% of cases had their approval. Based on {approvedCount} records with a known wait time from 2026 threads.
          </p>
        </>
      ) : (
        <>
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={mergedCurve} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--hairline-soft)" vertical={false} />
              <XAxis
                dataKey="day"
                ticks={[15, 30, 45, 60, 75, 90, 105, 120]}
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
                formatter={(val) => [`${val}%`, 'Still waiting']}
                labelFormatter={(v) => `Day ${v}`}
              />
              <Legend wrapperStyle={{ fontSize: '12px', color: 'var(--mute)', paddingTop: '8px' }} />
              <Line type="monotone" dataKey="All" stroke="var(--ink)" strokeWidth={2} dot={false} activeDot={{ r: 3 }} />
              <Line type="monotone" dataKey="Standard" stroke="#9b9c92" strokeWidth={1.5} strokeDasharray="4 2" dot={false} activeDot={{ r: 3 }} />
              <Line type="monotone" dataKey="Premium" stroke="#f7a501" strokeWidth={1.5} dot={false} activeDot={{ r: 3 }} />
              {clampedDay != null && <ReferenceLine x={clampedDay} stroke="var(--ink)" strokeWidth={1.5} strokeDasharray="3 3" opacity={0.5} />}
            </LineChart>
          </ResponsiveContainer>
          <p className="text-[11px]" style={{ color: 'var(--mute)' }}>
            % of cases still waiting at each day. Based on 2026 thread data only.
          </p>
        </>
      )}
    </div>
  )
}
