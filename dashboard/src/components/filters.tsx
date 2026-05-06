'use client'

import type { FilterState } from '@/lib/types'
import { cn } from '@/lib/utils'

interface FiltersProps {
  filters: FilterState
  onChange: (filters: FilterState) => void
  total: number
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
        active
          ? 'border-transparent'
          : 'border-transparent hover:border-transparent'
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

export default function Filters({ filters, onChange, total }: FiltersProps) {
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
        <PillTab
          active={filters.premium === 'standard'}
          onClick={() => onChange({ ...filters, premium: 'standard' })}
        >
          Standard
        </PillTab>
        <PillTab
          active={filters.premium === 'premium'}
          onClick={() => onChange({ ...filters, premium: 'premium' })}
        >
          Premium
        </PillTab>
      </div>

      <span className="text-sm ml-auto" style={{ color: 'var(--mute)' }}>
        {total.toLocaleString()} records
      </span>
    </div>
  )
}
