'use client'

import { useRef, useState, useEffect, useMemo } from 'react'
import type { FilterState } from '@/lib/types'
import { THREAD_OPTIONS, CITIZENSHIP_UNSPECIFIED, DEFAULT_FILTERS } from '@/lib/types'
import { cn } from '@/lib/utils'
import { ChevronDown, X, RotateCcw } from 'lucide-react'

function isDefaultFilters(f: FilterState): boolean {
  const d = DEFAULT_FILTERS
  if (f.type !== d.type) return false
  if (f.premium !== d.premium) return false
  if (f.approved !== d.approved) return false
  if (f.rfie !== d.rfie) return false
  if (f.appliedDateFrom !== d.appliedDateFrom) return false
  if (f.appliedDateTo !== d.appliedDateTo) return false
  if (f.cardStatus.length !== 0) return false
  if (f.banStatus.length !== 0) return false
  if (f.citizenship.length !== 0) return false
  if (f.threads.length !== d.threads.length || !d.threads.every((t) => f.threads.includes(t))) return false
  return true
}

interface CitizenshipOptions {
  entries: { country: string; count: number }[]
  unspecified: number
}

interface BanStatusCounts {
  restricted: number
  non_restricted: number
  unknown: number
}

interface TernaryCounts {
  rfie: { yes: number; no: number }
}

interface CardStatusCounts {
  none: number
  produced: number
  received: number
}

interface PillCounts {
  type: { OPT: number; STEM: number; unknown: number }
  premium: { standard: number; premium: number; unknown: number }
  approved: { yes: number; no: number; unknown: number }
}

interface FiltersProps {
  filters: FilterState
  onChange: (filters: FilterState) => void
  total: number
  citizenshipOptions: CitizenshipOptions
  banStatusCounts: BanStatusCounts
  cardStatusCounts: CardStatusCounts
  ternaryCounts: TernaryCounts
  pillCounts: PillCounts
  threadCounts: Record<string, number>
  appliedDateBounds: { min: string | null; max: string | null }
  appliedDateDistribution: { month: string; count: number; inScope: number }[]
}

type CardStatusKey = 'none' | 'produced' | 'received'
const CARD_STATUS_LABELS: Record<CardStatusKey, string> = {
  none: 'No card yet',
  produced: 'Produced',
  received: 'Received',
}

type BanStatusKey = 'restricted' | 'non_restricted' | 'unknown'

const BAN_STATUS_LABELS: Record<BanStatusKey, string> = {
  restricted: 'Restricted',
  non_restricted: 'Non-restricted',
  unknown: 'Unknown',
}

function PillTab({
  active,
  onClick,
  children,
  count,
}: {
  active: boolean
  onClick: () => void
  children: React.ReactNode
  count?: number
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
      {count !== undefined && (
        <span className="ml-1.5 text-[11px]" style={{ opacity: 0.55 }}>
          {count}
        </span>
      )}
    </button>
  )
}

function CitizenshipDropdown({
  selected,
  options,
  onChange,
}: {
  selected: string[]
  options: CitizenshipOptions
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

  function toggle(value: string) {
    if (selected.includes(value)) {
      onChange(selected.filter((c) => c !== value))
    } else {
      onChange([...selected, value])
    }
  }

  function displayLabel(value: string): string {
    return value === CITIZENSHIP_UNSPECIFIED ? 'Unspecified' : value
  }

  const label =
    selected.length === 0
      ? 'All citizenships'
      : selected.length === 1
      ? displayLabel(selected[0])
      : `${displayLabel(selected[0])} +${selected.length - 1}`

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
          className="absolute top-full left-0 mt-1 z-50 rounded-md border shadow-md min-w-56 max-h-64 overflow-y-auto"
          style={{ backgroundColor: 'var(--surface-card)', borderColor: 'var(--hairline)' }}
        >
          {options.unspecified > 0 && (
            <>
              <label
                className="flex items-center justify-between gap-2.5 px-3 py-2 text-sm cursor-pointer hover:bg-[var(--surface-soft)]"
                style={{ color: 'var(--ink)' }}
              >
                <span className="flex items-center gap-2.5">
                  <input
                    type="checkbox"
                    checked={selected.includes(CITIZENSHIP_UNSPECIFIED)}
                    onChange={() => toggle(CITIZENSHIP_UNSPECIFIED)}
                    className="accent-[var(--ink)] cursor-pointer"
                  />
                  <span style={{ fontStyle: 'italic', color: 'var(--mute)' }}>Unspecified</span>
                </span>
                <span className="text-[11px]" style={{ color: 'var(--mute)' }}>{options.unspecified}</span>
              </label>
              <div className="border-t" style={{ borderColor: 'var(--hairline)' }} />
            </>
          )}
          {options.entries.map(({ country, count }) => (
            <label
              key={country}
              className="flex items-center justify-between gap-2.5 px-3 py-2 text-sm cursor-pointer hover:bg-[var(--surface-soft)]"
              style={{ color: 'var(--ink)' }}
            >
              <span className="flex items-center gap-2.5">
                <input
                  type="checkbox"
                  checked={selected.includes(country)}
                  onChange={() => toggle(country)}
                  className="accent-[var(--ink)] cursor-pointer"
                />
                {country}
              </span>
              <span className="text-[11px]" style={{ color: 'var(--mute)' }}>{count}</span>
            </label>
          ))}
        </div>
      )}
    </div>
  )
}

function TernaryDropdown({
  label,
  selected,
  yesLabel,
  noLabel,
  yesCount,
  noCount,
  onChange,
}: {
  label: string
  selected: 'all' | 'yes' | 'no'
  yesLabel: string
  noLabel: string
  yesCount: number
  noCount: number
  onChange: (v: 'all' | 'yes' | 'no') => void
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

  const active = selected !== 'all'
  const triggerLabel = selected === 'yes' ? yesLabel : selected === 'no' ? noLabel : label

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-2 px-3.5 py-1.5 rounded-full text-[13px] font-medium cursor-pointer transition-colors"
        style={{
          backgroundColor: active ? 'var(--ink)' : 'var(--surface-soft)',
          color: active ? '#fff' : 'var(--body)',
        }}
      >
        {triggerLabel}
        {active ? (
          <span
            role="button"
            onClick={(e) => { e.stopPropagation(); onChange('all') }}
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
          className="absolute top-full left-0 mt-1 z-50 rounded-md border shadow-md min-w-44"
          style={{ backgroundColor: 'var(--surface-card)', borderColor: 'var(--hairline)' }}
        >
          {([
            { key: 'yes' as const, text: yesLabel, count: yesCount },
            { key: 'no' as const, text: noLabel, count: noCount },
          ]).map(({ key, text, count }) => (
            <button
              key={key}
              onClick={() => { onChange(selected === key ? 'all' : key); setOpen(false) }}
              className="flex items-center justify-between gap-2.5 px-3 py-2 text-sm cursor-pointer hover:bg-[var(--surface-soft)] w-full text-left"
              style={{ color: 'var(--ink)', backgroundColor: selected === key ? 'var(--surface-soft)' : 'transparent' }}
            >
              <span>{text}</span>
              <span className="text-[11px]" style={{ color: 'var(--mute)' }}>{count}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

function CardStatusDropdown({
  selected,
  counts,
  onChange,
}: {
  selected: CardStatusKey[]
  counts: CardStatusCounts
  onChange: (v: CardStatusKey[]) => void
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

  function toggle(key: CardStatusKey) {
    if (selected.includes(key)) onChange(selected.filter((k) => k !== key))
    else onChange([...selected, key])
  }

  const label =
    selected.length === 0
      ? 'All card statuses'
      : selected.length === 1
      ? CARD_STATUS_LABELS[selected[0]]
      : `${CARD_STATUS_LABELS[selected[0]]} +${selected.length - 1}`

  const options: CardStatusKey[] = ['none', 'produced', 'received']

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
          className="absolute top-full left-0 mt-1 z-50 rounded-md border shadow-md min-w-52"
          style={{ backgroundColor: 'var(--surface-card)', borderColor: 'var(--hairline)' }}
        >
          <label
            className="flex items-center justify-between gap-2.5 px-3 py-2 text-sm cursor-pointer hover:bg-[var(--surface-soft)]"
            style={{ color: 'var(--ink)' }}
          >
            <span className="flex items-center gap-2.5">
              <input
                type="checkbox"
                checked={selected.includes('none')}
                onChange={() => toggle('none')}
                className="accent-[var(--ink)] cursor-pointer"
              />
              <span style={{ fontStyle: 'italic', color: 'var(--mute)' }}>{CARD_STATUS_LABELS.none}</span>
            </span>
            <span className="text-[11px]" style={{ color: 'var(--mute)' }}>{counts.none}</span>
          </label>
          <div className="border-t" style={{ borderColor: 'var(--hairline)' }} />
          {(['produced', 'received'] as const).map((key) => (
            <label
              key={key}
              className="flex items-center justify-between gap-2.5 px-3 py-2 text-sm cursor-pointer hover:bg-[var(--surface-soft)]"
              style={{ color: 'var(--ink)' }}
            >
              <span className="flex items-center gap-2.5">
                <input
                  type="checkbox"
                  checked={selected.includes(key)}
                  onChange={() => toggle(key)}
                  className="accent-[var(--ink)] cursor-pointer"
                />
                {CARD_STATUS_LABELS[key]}
              </span>
              <span className="text-[11px]" style={{ color: 'var(--mute)' }}>{counts[key]}</span>
            </label>
          ))}
        </div>
      )}
    </div>
  )
}

function BanStatusDropdown({
  selected,
  counts,
  onChange,
}: {
  selected: BanStatusKey[]
  counts: BanStatusCounts
  onChange: (v: BanStatusKey[]) => void
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

  function toggle(key: BanStatusKey) {
    if (selected.includes(key)) onChange(selected.filter((k) => k !== key))
    else onChange([...selected, key])
  }

  const label =
    selected.length === 0
      ? 'All ban statuses'
      : selected.length === 1
      ? BAN_STATUS_LABELS[selected[0]]
      : `${BAN_STATUS_LABELS[selected[0]]} +${selected.length - 1}`

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
          className="absolute top-full left-0 mt-1 z-50 rounded-md border shadow-md min-w-56"
          style={{ backgroundColor: 'var(--surface-card)', borderColor: 'var(--hairline)' }}
        >
          <label
            className="flex items-center justify-between gap-2.5 px-3 py-2 text-sm cursor-pointer hover:bg-[var(--surface-soft)]"
            style={{ color: 'var(--ink)' }}
          >
            <span className="flex items-center gap-2.5">
              <input
                type="checkbox"
                checked={selected.includes('unknown')}
                onChange={() => toggle('unknown')}
                className="accent-[var(--ink)] cursor-pointer"
              />
              <span style={{ fontStyle: 'italic', color: 'var(--mute)' }}>Unknown</span>
            </span>
            <span className="text-[11px]" style={{ color: 'var(--mute)' }}>{counts.unknown}</span>
          </label>
          <div className="border-t" style={{ borderColor: 'var(--hairline)' }} />
          {(['restricted', 'non_restricted'] as const).map((key) => (
            <label
              key={key}
              className="flex items-center justify-between gap-2.5 px-3 py-2 text-sm cursor-pointer hover:bg-[var(--surface-soft)]"
              style={{ color: 'var(--ink)' }}
            >
              <span className="flex items-center gap-2.5">
                <input
                  type="checkbox"
                  checked={selected.includes(key)}
                  onChange={() => toggle(key)}
                  className="accent-[var(--ink)] cursor-pointer"
                />
                {BAN_STATUS_LABELS[key]}
              </span>
              <span className="text-[11px]" style={{ color: 'var(--mute)' }}>{counts[key]}</span>
            </label>
          ))}
        </div>
      )}
    </div>
  )
}

function ThreadFilter({
  selected,
  counts,
  onChange,
}: {
  selected: string[]
  counts: Record<string, number>
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
            style={{
              position: 'absolute',
              width: '200%',
              height: '200%',
              top: '-50%',
              left: '-50%',
              background: 'conic-gradient(from 0deg, transparent 45%, #f7a501 62%, #f7a501 82%, transparent 100%)',
              animation: 'border-spin 3.8s linear infinite',
              zIndex: 0,
            }}
          />
        )}
        <button
          onClick={() => { setShowGlow(false); setOpen((o) => !o) }}
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
              onClick={(e) => { e.stopPropagation(); setShowGlow(false); onChange([]) }}
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
              className="flex items-start justify-between gap-2.5 px-3 py-2.5 cursor-pointer hover:bg-[var(--surface-soft)]"
            >
              <span className="flex items-start gap-2.5 min-w-0">
                <input
                  type="checkbox"
                  checked={selected.includes(thread.id)}
                  onChange={() => toggle(thread.id)}
                  className="accent-[var(--ink)] cursor-pointer mt-0.5 shrink-0"
                />
                <span className="flex flex-col min-w-0">
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
                </span>
              </span>
              <span className="text-[11px] mt-0.5 shrink-0" style={{ color: 'var(--mute)' }}>
                {counts[thread.id] ?? 0}
              </span>
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
  distribution: { month: string; count: number; inScope: number }[]
  onChange: (from: string | null, to: string | null) => void
}) {
  const [open, setOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const trackRef = useRef<HTMLDivElement>(null)
  const hasFilter = !!from || !!to

  const months = useMemo(() => (min && max ? buildMonths(min, max) : []), [min, max])
  const n = months.length

  const countMap = useMemo(() => {
    const m: Record<string, { count: number; inScope: number }> = {}
    for (const d of distribution) m[d.month] = { count: d.count, inScope: d.inScope }
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
          {/* Histogram. Bar height = full-dataset count for the month.
              Color encodes two dimensions: facet scope (does the month have
              any records given other active filters) and slider range. */}
          <div className="flex items-end gap-px h-14">
            {months.map((month, idx) => {
              const { count, inScope } = countMap[month] ?? { count: 0, inScope: 0 }
              const heightPct = (count / maxCount) * 100
              const inRange = idx >= leftIdx && idx <= rightIdx
              const bg = count === 0
                ? 'transparent'
                : inScope === 0
                ? 'var(--hairline)'
                : inRange
                ? 'var(--ink)'
                : 'var(--surface-soft)'
              return (
                <div
                  key={month}
                  className="flex-1 rounded-[1px] transition-colors duration-75"
                  style={{
                    height: count > 0 ? `${Math.max(heightPct, 8)}%` : '2px',
                    backgroundColor: bg,
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

export default function Filters({ filters, onChange, total, citizenshipOptions, banStatusCounts, cardStatusCounts, ternaryCounts, pillCounts, threadCounts, appliedDateBounds, appliedDateDistribution }: FiltersProps) {
  return (
    <div className="flex flex-wrap items-center gap-4">
      <ThreadFilter
        selected={filters.threads}
        counts={threadCounts}
        onChange={(threads) => onChange({ ...filters, threads })}
      />

      <AppliedDateFilter
        from={filters.appliedDateFrom}
        to={filters.appliedDateTo}
        min={appliedDateBounds.min}
        max={appliedDateBounds.max}
        distribution={appliedDateDistribution}
        onChange={(from, to) => onChange({ ...filters, appliedDateFrom: from, appliedDateTo: to })}
      />

      <div
        className="flex items-center gap-1 rounded-full p-1"
        style={{ backgroundColor: 'var(--surface-soft)' }}
      >
        <PillTab active={filters.type === 'all'} onClick={() => onChange({ ...filters, type: 'all' })}>
          All types
        </PillTab>
        <PillTab active={filters.type === 'OPT'} onClick={() => onChange({ ...filters, type: 'OPT' })} count={pillCounts.type.OPT}>
          OPT
        </PillTab>
        <PillTab active={filters.type === 'STEM'} onClick={() => onChange({ ...filters, type: 'STEM' })} count={pillCounts.type.STEM}>
          STEM OPT
        </PillTab>
        <PillTab active={filters.type === 'unknown'} onClick={() => onChange({ ...filters, type: 'unknown' })} count={pillCounts.type.unknown}>
          Unknown
        </PillTab>
      </div>

      <div
        className="flex items-center gap-1 rounded-full p-1"
        style={{ backgroundColor: 'var(--surface-soft)' }}
      >
        <PillTab active={filters.premium === 'all'} onClick={() => onChange({ ...filters, premium: 'all' })}>
          All processing
        </PillTab>
        <PillTab active={filters.premium === 'standard'} onClick={() => onChange({ ...filters, premium: 'standard' })} count={pillCounts.premium.standard}>
          Standard
        </PillTab>
        <PillTab active={filters.premium === 'premium'} onClick={() => onChange({ ...filters, premium: 'premium' })} count={pillCounts.premium.premium}>
          Premium
        </PillTab>
        <PillTab active={filters.premium === 'unknown'} onClick={() => onChange({ ...filters, premium: 'unknown' })} count={pillCounts.premium.unknown}>
          Unknown
        </PillTab>
      </div>

      <div
        className="flex items-center gap-1 rounded-full p-1"
        style={{ backgroundColor: 'var(--surface-soft)' }}
      >
        <PillTab active={filters.approved === 'all'} onClick={() => onChange({ ...filters, approved: 'all' })}>
          All statuses
        </PillTab>
        <PillTab active={filters.approved === 'yes'} onClick={() => onChange({ ...filters, approved: 'yes' })} count={pillCounts.approved.yes}>
          Approved
        </PillTab>
        <PillTab active={filters.approved === 'no'} onClick={() => onChange({ ...filters, approved: 'no' })} count={pillCounts.approved.no}>
          Pending
        </PillTab>
        <PillTab active={filters.approved === 'unknown'} onClick={() => onChange({ ...filters, approved: 'unknown' })} count={pillCounts.approved.unknown}>
          Unknown
        </PillTab>
      </div>

      <CardStatusDropdown
        selected={filters.cardStatus}
        counts={cardStatusCounts}
        onChange={(cardStatus) => onChange({ ...filters, cardStatus })}
      />

      <TernaryDropdown
        label="RFIE"
        selected={filters.rfie}
        yesLabel="With RFIE"
        noLabel="No RFIE"
        yesCount={ternaryCounts.rfie.yes}
        noCount={ternaryCounts.rfie.no}
        onChange={(v) => onChange({ ...filters, rfie: v })}
      />

      <CitizenshipDropdown
        selected={filters.citizenship}
        options={citizenshipOptions}
        onChange={(citizenship) => onChange({ ...filters, citizenship })}
      />

      <BanStatusDropdown
        selected={filters.banStatus}
        counts={banStatusCounts}
        onChange={(banStatus) => onChange({ ...filters, banStatus })}
      />

      <div className="flex items-center gap-3 ml-auto">
        {!isDefaultFilters(filters) && (
          <ClearFiltersButton onClear={() => onChange(DEFAULT_FILTERS)} />
        )}
        <span className="text-sm" style={{ color: 'var(--mute)' }}>
          {total.toLocaleString()} records
        </span>
      </div>
    </div>
  )
}

function ClearFiltersButton({ onClear }: { onClear: () => void }) {
  const [hover, setHover] = useState(false)
  return (
    <div className="relative">
      <button
        onClick={onClear}
        onMouseEnter={() => setHover(true)}
        onMouseLeave={() => setHover(false)}
        className="flex items-center gap-1.5 text-[12px] font-medium px-3 py-1.5 rounded-full cursor-pointer transition-colors border"
        style={{
          backgroundColor: 'var(--surface-card)',
          borderColor: 'var(--hairline)',
          color: 'var(--ink)',
        }}
      >
        <RotateCcw size={12} />
        Clear filters
      </button>
      {hover && (
        <div
          className="absolute top-full right-0 mt-2 px-3 py-2 rounded-md text-[11px] leading-snug whitespace-nowrap pointer-events-none z-50"
          style={{
            backgroundColor: 'var(--ink)',
            color: '#fff',
            boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
          }}
        >
          Resets every filter — but keeps the latest Reddit threads selected.
          <span
            className="absolute bottom-full right-4 -mb-px"
            style={{
              borderLeft: '5px solid transparent',
              borderRight: '5px solid transparent',
              borderBottom: '5px solid var(--ink)',
              width: 0,
              height: 0,
            }}
          />
        </div>
      )}
    </div>
  )
}
