'use client'

import { useRef, useState, useEffect } from 'react'
import type { FilterState } from '@/lib/types'
import { cn } from '@/lib/utils'
import { ChevronDown, X } from 'lucide-react'

interface FiltersProps {
  filters: FilterState
  onChange: (filters: FilterState) => void
  total: number
  citizenshipOptions: string[]
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

export default function Filters({ filters, onChange, total, citizenshipOptions }: FiltersProps) {
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
