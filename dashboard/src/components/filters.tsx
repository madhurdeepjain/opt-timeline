'use client'

import { useRef, useState, useEffect, useMemo } from 'react'
import type { FilterState } from '@/lib/types'
import { THREAD_OPTIONS } from '@/lib/types'
import { cn } from '@/lib/utils'
import { ChevronDown, X } from 'lucide-react'

interface FiltersProps {
  filters: FilterState
  onChange: (filters: FilterState) => void
  total: number
  citizenshipOptions: string[]
  appliedDateBounds: { min: string | null; max: string | null }
  appliedDateDistribution: { month: string; count: number }[]
}

function PillTab({
  active,
  onClick,
  children,
}: {
  active: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'px-3.5 py-1.5 rounded-full text-[13px] font-medium transition-colors cursor-pointer border',
        active ? 'border-transparent' : 'border-transparent hover:border-transparent'
      )}
      style={
        active
          ? { backgroundColor: 'var(--ink)', color: '#fff', borderColor: 'transparent' }
          : { backgroundColor: 'transparent', color: 'var(--body)', borderColor: 'transparent' }
      }
    >
      {children}
    </button>
  )
}

function CitizenshipDropdown({
  selected,
  options,
  onChange,
}: {
  selected: string[]
  options: string[]
  onChange: (v: string[]) => void
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [open])

  function toggle(country: string) {
    if (selected.includes(country)) {
      onChange(selected.filter((c) => c !== country))
    } else {
      onChange([...selected, country])
    }
  }

  const label =
    selected.length === 0
      ? 'All citizenships'
      : selected.length === 1
      ? selected[0]
      : `${selected[0]} +${selected.length - 1}`

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-2 px-3.5 py-1.5 rounded-full text-[13px] font-medium cursor-pointer transition-colors"
        style={{
          backgroundColor: selected.length > 0 ? 'var(--ink)' : 'var(--surface-soft)',
          color: selected.length > 0 ? '#fff' : 'var(--body)',
        }}
      >
        {label}
        {selected.length > 0 ? (
          <span
            role="button"
            onClick={(e) => { e.stopPropagation(); onChange([]) }}
            className="flex items-center opacity-70 hover:opacity-100"
          >
            <X size={11} />
          </span>
        ) : (
          <ChevronDown size={12} style={{ opacity: 0.5 }} />
        )}
      </button>

      {open && (
        <div
          className="absolute top-full left-0 mt-1 z-50 rounded-md border shadow-md min-w-48 max-h-64 overflow-y-auto"
          style={{ backgroundColor: 'var(--surface-card)', borderColor: 'var(--hairline)' }}
        >
          {options.map((country) => (
            <label
              key={country}
              className="flex items-center gap-2.5 px-3 py-2 text-sm cursor-pointer hover:bg-[var(--surface-soft)]"
              style={{ color: 'var(--ink)' }}
            >
              <input
                type="checkbox"
                checked={selected.includes(country)}
                onChange={() => toggle(country)}
                className="accent-[var(--ink)] cursor-pointer"
              />
              {country}
            </label>
          ))}
        </div>
      )}
    </div>
  )
}

function ThreadFilter({
  selected,
  onChange,
}: {
  selected: string[]
  onChange: (v: string[]) => void
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const [showGlow, setShowGlow] = useState(() => selected.length > 0)

  useEffect(() => {
    if (!open) return
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [open])

  function toggle(id: string) {
    if (selected.includes(id)) onChange(selected.filter((s) => s !== id))
    else onChange([...selected, id])
  }

  const label =
    selected.length === 0
      ? 'All threads'
      : selected.length === 1
      ? `${THREAD_OPTIONS.find((t) => t.id === selected[0])?.subreddit} · ${THREAD_OPTIONS.find((t) => t.id === selected[0])?.label}`
      : `${selected.length} threads`

  return (
    <div ref={ref} className="relative">
      <div style={{ position: 'relative', display: 'inline-flex', borderRadius: '9999px', padding: '2px', overflow: 'hidden' }}>
        {showGlow && (
          <div
            onAnimationEnd={() => setShowGlow(false)}
            style={{
              position: 'absolute',
              width: '200%',
              height: '200%',
              top: '-50%',
              left: '-50%',
              background: 'conic-gradient(from 0deg, transparent 45%, #f7a501 62%, #f7a501 82%, transparent 100%)',
              animation: 'border-spin 7s linear forwards',
              zIndex: 0,
            }}
          />
        )}
        <button
          onClick={() => setOpen((o) => !o)}
          className="flex items-center gap-2 px-3.5 py-1.5 rounded-full text-[13px] font-medium cursor-pointer transition-colors"
          style={{
            position: 'relative',
            zIndex: 1,
            backgroundColor: selected.length > 0 ? 'var(--ink)' : 'var(--surface-soft)',
            color: selected.length > 0 ? '#fff' : 'var(--body)',
          }}
        >
          {label}
          {selected.length > 0 ? (
            <span
              role="button"
              onClick={(e) => { e.stopPropagation(); onChange([]) }}
              className="flex items-center opacity-70 hover:opacity-100"
            >
              <X size={11} />
            </span>
          ) : (
            <ChevronDown size={12} style={{ opacity: 0.5 }} />
          )}
        </button>
      </div>

      {open && (
        <div
          className="absolute top-full left-0 mt-1 z-50 rounded-md border shadow-md min-w-56"
          style={{ backgroundColor: 'var(--surface-card)', borderColor: 'var(--hairline)' }}
        >
          {THREAD_OPTIONS.map((thread) => (
            <label
              key={thread.id}
              className="flex items-start gap-2.5 px-3 py-2.5 cursor-pointer hover:bg-[var(--surface-soft)]"
            >
              <input
                type="checkbox"
                checked={selected.includes(thread.id)}
                onChange={() => toggle(thread.id)}
                className="accent-[var(--ink)] cursor-pointer mt-0.5 shrink-0"
              />
              <div className="flex flex-col min-w-0">
                <span className="text-sm leading-tight" style={{ color: 'var(--ink)' }}>
                  r/{thread.subreddit} · {thread.label}
                </span>
                <a
                  href={thread.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={(e) => e.stopPropagation()}
                  className="text-[11px] hover:underline truncate"
                  style={{ color: 'var(--mute)' }}
                >
                  reddit.com/r/{thread.subreddit}/comments/{thread.id}/
                </a>
              </div>
            </label>
          ))}
        </div>
      )}
    </div>
  )
}

function buildMonths(min: string, max: string): string[] {
  const result: string[] = []
  let [y, m] = min.slice(0, 7).split('-').map(Number)
  const [ey, em] = max.slice(0, 7).split('-').map(Number)
  while (y < ey || (y === ey && m <= em)) {
    result.push(`${y}-${String(m).padStart(2, '0')}`)
    m++
    if (m > 12) { m = 1; y++ }
  }
  return result
}

function fmtMonth(ym: string): string {
  const [y, m] = ym.split('-')
  return new Date(Number(y), Number(m) - 1, 1).toLocaleDateString('en-US', { month: 'short', year: '2-digit' })
}

const _MON = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']

function fmtPillDate(dateStr: string): string {
  const [y, m, d] = dateStr.split('-').map(Number)
  return `${d} ${_MON[m - 1]} '${String(y).slice(2)}`
}

function lastDayOfMonth(ym: string): string {
  const [y, m] = ym.split('-').map(Number)
  const day = new Date(y, m, 0).getDate()
  return `${ym}-${String(day).padStart(2, '0')}`
}

function AppliedDateFilter({
  from,
  to,
  min,
  max,
  distribution,
  onChange,
}: {
  from: string | null
  to: string | null
  min: string | null
  max: string | null
  distribution: { month: string; count: number }[]
  onChange: (from: string | null, to: string | null) => void
}) {
  const [open, setOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const trackRef = useRef<HTMLDivElement>(null)
  const hasFilter = !!from || !!to

  const months = useMemo(() => (min && max ? buildMonths(min, max) : []), [min, max])
  const n = months.length

  const countMap = useMemo(() => {
    const m: Record<string, number> = {}
    for (const d of distribution) m[d.month] = d.count
    return m
  }, [distribution])

  const maxCount = useMemo(() => Math.max(1, ...distribution.map((d) => d.count)), [distribution])

  const [leftIdx, _setLeftIdx] = useState(0)
  const [rightIdx, _setRightIdx] = useState(Math.max(0, n - 1))
  const leftRef = useRef(0)
  const rightRef = useRef(Math.max(0, n - 1))

  function setLeft(idx: number) { leftRef.current = idx; _setLeftIdx(idx) }
  function setRight(idx: number) { rightRef.current = idx; _setRightIdx(idx) }

  // Sync local indices when panel opens or external from/to changes
  useEffect(() => {
    if (!open || n === 0) return
    const l = from ? months.indexOf(from.slice(0, 7)) : -1
    const r = to ? months.indexOf(to.slice(0, 7)) : -1
    setLeft(l >= 0 ? l : 0)
    setRight(r >= 0 ? r : n - 1)
  }, [open, from, to]) // eslint-disable-line react-hooks/exhaustive-deps

  // Outside click
  useEffect(() => {
    if (!open) return
    function handler(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  function pctFromClientX(clientX: number): number {
    if (!trackRef.current || n <= 1) return 0
    const rect = trackRef.current.getBoundingClientRect()
    return Math.max(0, Math.min(1, (clientX - rect.left) / rect.width))
  }

  function commit(l: number, r: number) {
    if (l === 0 && r === n - 1) {
      onChange(null, null)
    } else {
      onChange(`${months[l]}-01`, lastDayOfMonth(months[r]))
    }
  }

  function startDrag(side: 'left' | 'right', e: React.MouseEvent) {
    e.preventDefault()
    e.stopPropagation()

    function onMove(ev: MouseEvent) {
      const idx = Math.round(pctFromClientX(ev.clientX) * (n - 1))
      if (side === 'left') setLeft(Math.min(idx, rightRef.current))
      else setRight(Math.max(idx, leftRef.current))
    }

    function onUp() {
      commit(leftRef.current, rightRef.current)
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup', onUp)
    }

    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
  }

  const leftPct = n > 1 ? (leftIdx / (n - 1)) * 100 : 0
  const rightPct = n > 1 ? (rightIdx / (n - 1)) * 100 : 100

  const tickIndices = useMemo(() => {
    if (n <= 1) return [0]
    const interval = n <= 8 ? 1 : n <= 18 ? 3 : n <= 36 ? 6 : 12
    const candidates: number[] = []
    for (let i = 0; i < n; i++) {
      const mo = parseInt(months[i].slice(5, 7), 10)
      if (interval === 1 || mo % interval === 1) candidates.push(i)
    }
    if (candidates.length === 0 || candidates[candidates.length - 1] !== n - 1) candidates.push(n - 1)

    // Different minimum gaps based on label transforms (label ≈ 44px in 268px container):
    //   first → second  (0% + right-edge vs -50% centered): 26%
    //   middle → middle (-50% each):                         18%
    //   any    → last   (-50% vs -100% right-anchored):     30%, pop multiple if needed
    const result: number[] = []
    for (const idx of candidates) {
      const isLast = idx === n - 1
      const pct = (idx / (n - 1)) * 100

      if (result.length === 0) { result.push(idx); continue }

      if (isLast) {
        while (result.length > 1 && pct - (result[result.length - 1] / (n - 1)) * 100 < 30) {
          result.pop()
        }
        result.push(idx)
      } else {
        const prevPct = (result[result.length - 1] / (n - 1)) * 100
        const minGap = result.length === 1 ? 26 : 18
        if (pct - prevPct >= minGap) result.push(idx)
      }
    }
    return result
  }, [n, months])

  const label = hasFilter
    ? from && to
      ? `${fmtPillDate(from)} – ${fmtPillDate(to)}`
      : from
      ? `From ${fmtPillDate(from)}`
      : `Until ${fmtPillDate(to!)}`
    : 'Applied date'

  return (
    <div ref={containerRef} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-2 px-3.5 py-1.5 rounded-full text-[13px] font-medium cursor-pointer transition-colors"
        style={{
          backgroundColor: hasFilter ? 'var(--ink)' : 'var(--surface-soft)',
          color: hasFilter ? '#fff' : 'var(--body)',
        }}
      >
        {label}
        {hasFilter ? (
          <span
            role="button"
            onClick={(e) => {
              e.stopPropagation()
              setLeft(0)
              setRight(n - 1)
              onChange(null, null)
            }}
            className="flex items-center opacity-70 hover:opacity-100"
          >
            <X size={11} />
          </span>
        ) : (
          <ChevronDown size={12} style={{ opacity: 0.5 }} />
        )}
      </button>

      {open && n > 0 && (
        <div
          className="absolute top-full left-0 mt-1 z-50 rounded-md border p-4 select-none"
          style={{
            backgroundColor: 'var(--surface-card)',
            borderColor: 'var(--hairline)',
            width: 300,
            boxShadow: '0 4px 16px rgba(0,0,0,0.08)',
          }}
        >
          {/* Histogram */}
          <div className="flex items-end gap-px h-14">
            {months.map((month, idx) => {
              const count = countMap[month] ?? 0
              const heightPct = (count / maxCount) * 100
              const inRange = idx >= leftIdx && idx <= rightIdx
              return (
                <div
                  key={month}
                  className="flex-1 rounded-[1px] transition-colors duration-75"
                  style={{
                    height: count > 0 ? `${Math.max(heightPct, 8)}%` : '2px',
                    backgroundColor: count > 0
                      ? inRange ? 'var(--ink)' : 'var(--surface-soft)'
                      : 'transparent',
                  }}
                />
              )
            })}
          </div>

          {/* X-axis: baseline + tick marks + labels */}
          <div className="relative h-5 mb-3">
            <div className="absolute top-0 left-0 right-0 h-px" style={{ backgroundColor: 'var(--hairline)' }} />
            {tickIndices.map((idx, ti) => {
              const isFirst = ti === 0
              const isLast = ti === tickIndices.length - 1
              const pct = n > 1 ? (idx / (n - 1)) * 100 : 0
              return (
                <div
                  key={months[idx]}
                  className="absolute top-0 flex flex-col"
                  style={{ left: `${pct}%` }}
                >
                  <div className="w-px h-1" style={{ backgroundColor: 'var(--hairline)' }} />
                  <span
                    className="text-[10px] leading-none whitespace-nowrap mt-0.5 block"
                    style={{
                      color: 'var(--mute)',
                      transform: isFirst ? 'none' : isLast ? 'translateX(-100%)' : 'translateX(-50%)',
                    }}
                  >
                    {fmtMonth(months[idx])}
                  </span>
                </div>
              )
            })}
          </div>

          {/* Slider */}
          <div ref={trackRef} className="relative h-5 cursor-default">
            {/* Background track */}
            <div
              className="absolute top-1/2 -translate-y-1/2 w-full h-[3px] rounded-full"
              style={{ backgroundColor: 'var(--surface-soft)' }}
            />
            {/* Selected fill */}
            <div
              className="absolute top-1/2 -translate-y-1/2 h-[3px] rounded-full"
              style={{
                left: `${leftPct}%`,
                width: `${rightPct - leftPct}%`,
                backgroundColor: 'var(--ink)',
              }}
            />
            {/* Left handle */}
            <div
              className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-4 h-4 rounded-full border-2 cursor-grab"
              style={{
                left: `${leftPct}%`,
                backgroundColor: 'var(--surface-card)',
                borderColor: 'var(--ink)',
                boxShadow: '0 1px 4px rgba(0,0,0,0.15)',
                zIndex: leftIdx === rightIdx ? 3 : 2,
              }}
              onMouseDown={(e) => startDrag('left', e)}
            />
            {/* Right handle */}
            <div
              className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-4 h-4 rounded-full border-2 cursor-grab"
              style={{
                left: `${rightPct}%`,
                backgroundColor: 'var(--surface-card)',
                borderColor: 'var(--ink)',
                boxShadow: '0 1px 4px rgba(0,0,0,0.15)',
                zIndex: 2,
              }}
              onMouseDown={(e) => startDrag('right', e)}
            />
          </div>

          {/* Date inputs */}
          <div className="flex items-center gap-2 mt-3">
            <div className="flex-1">
              <div className="text-[10px] mb-1" style={{ color: 'var(--mute)' }}>From</div>
              <input
                type="date"
                value={from ?? ''}
                min={min ?? undefined}
                max={to ?? max ?? undefined}
                onChange={(e) => onChange(e.target.value || null, to)}
                className="w-full text-xs px-2 py-1 rounded border outline-none"
                style={{ backgroundColor: 'var(--surface-soft)', borderColor: 'var(--hairline)', color: 'var(--ink)' }}
              />
            </div>
            <div className="text-xs pt-5" style={{ color: 'var(--mute)' }}>–</div>
            <div className="flex-1">
              <div className="text-[10px] mb-1" style={{ color: 'var(--mute)' }}>To</div>
              <input
                type="date"
                value={to ?? ''}
                min={from ?? min ?? undefined}
                max={max ?? undefined}
                onChange={(e) => onChange(from, e.target.value || null)}
                className="w-full text-xs px-2 py-1 rounded border outline-none"
                style={{ backgroundColor: 'var(--surface-soft)', borderColor: 'var(--hairline)', color: 'var(--ink)' }}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default function Filters({ filters, onChange, total, citizenshipOptions, appliedDateBounds, appliedDateDistribution }: FiltersProps) {
  return (
    <div className="flex flex-wrap items-center gap-4">
      <div
        className="flex items-center gap-1 rounded-full p-1"
        style={{ backgroundColor: 'var(--surface-soft)' }}
      >
        <PillTab active={filters.type === 'all'} onClick={() => onChange({ ...filters, type: 'all' })}>
          All types
        </PillTab>
        <PillTab active={filters.type === 'OPT'} onClick={() => onChange({ ...filters, type: 'OPT' })}>
          OPT
        </PillTab>
        <PillTab active={filters.type === 'STEM'} onClick={() => onChange({ ...filters, type: 'STEM' })}>
          STEM OPT
        </PillTab>
      </div>

      <div
        className="flex items-center gap-1 rounded-full p-1"
        style={{ backgroundColor: 'var(--surface-soft)' }}
      >
        <PillTab active={filters.premium === 'all'} onClick={() => onChange({ ...filters, premium: 'all' })}>
          All processing
        </PillTab>
        <PillTab active={filters.premium === 'standard'} onClick={() => onChange({ ...filters, premium: 'standard' })}>
          Standard
        </PillTab>
        <PillTab active={filters.premium === 'premium'} onClick={() => onChange({ ...filters, premium: 'premium' })}>
          Premium
        </PillTab>
      </div>

      <div
        className="flex items-center gap-1 rounded-full p-1"
        style={{ backgroundColor: 'var(--surface-soft)' }}
      >
        <PillTab active={filters.approved === 'all'} onClick={() => onChange({ ...filters, approved: 'all' })}>
          All statuses
        </PillTab>
        <PillTab active={filters.approved === 'yes'} onClick={() => onChange({ ...filters, approved: 'yes' })}>
          Approved
        </PillTab>
        <PillTab active={filters.approved === 'no'} onClick={() => onChange({ ...filters, approved: 'no' })}>
          Pending
        </PillTab>
      </div>

      <div
        className="flex items-center gap-1 rounded-full p-1"
        style={{ backgroundColor: 'var(--surface-soft)' }}
      >
        <PillTab active={filters.cardReceived === 'all'} onClick={() => onChange({ ...filters, cardReceived: 'all' })}>
          All card statuses
        </PillTab>
        <PillTab active={filters.cardReceived === 'yes'} onClick={() => onChange({ ...filters, cardReceived: 'yes' })}>
          Card received
        </PillTab>
        <PillTab active={filters.cardReceived === 'no'} onClick={() => onChange({ ...filters, cardReceived: 'no' })}>
          Not yet
        </PillTab>
      </div>

      <div
        className="flex items-center gap-1 rounded-full p-1"
        style={{ backgroundColor: 'var(--surface-soft)' }}
      >
        <PillTab active={filters.rfie === 'all'} onClick={() => onChange({ ...filters, rfie: 'all' })}>
          All RFIE
        </PillTab>
        <PillTab active={filters.rfie === 'yes'} onClick={() => onChange({ ...filters, rfie: 'yes' })}>
          With RFIE
        </PillTab>
        <PillTab active={filters.rfie === 'no'} onClick={() => onChange({ ...filters, rfie: 'no' })}>
          No RFIE
        </PillTab>
      </div>

      <AppliedDateFilter
        from={filters.appliedDateFrom}
        to={filters.appliedDateTo}
        min={appliedDateBounds.min}
        max={appliedDateBounds.max}
        distribution={appliedDateDistribution}
        onChange={(from, to) => onChange({ ...filters, appliedDateFrom: from, appliedDateTo: to })}
      />

      <ThreadFilter
        selected={filters.threads}
        onChange={(threads) => onChange({ ...filters, threads })}
      />

      <CitizenshipDropdown
        selected={filters.citizenship}
        options={citizenshipOptions}
        onChange={(citizenship) => onChange({ ...filters, citizenship })}
      />

      <span className="text-sm ml-auto" style={{ color: 'var(--mute)' }}>
        {total.toLocaleString()} records
      </span>
    </div>
  )
}
