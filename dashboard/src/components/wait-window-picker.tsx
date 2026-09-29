import { WAIT_WINDOWS } from '@/lib/types'

export function windowPhrase(days: number | null): string {
  return days === null ? 'approved at any time' : `approved in the last ${days} days`
}

export default function WaitWindowPicker({
  value,
  onChange,
}: {
  value: number | null
  onChange: (days: number | null) => void
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-[13px]" style={{ color: 'var(--mute)' }}>
        Wait times use cases approved in the last
      </span>
      <div className="flex items-center gap-1 rounded-full p-1" style={{ backgroundColor: 'var(--surface-soft)' }}>
        {WAIT_WINDOWS.map((w) => (
          <button
            key={w ?? 'all'}
            onClick={() => onChange(w)}
            className="px-3 py-1 rounded-full text-[12px] font-medium cursor-pointer transition-colors"
            style={{
              backgroundColor: value === w ? 'var(--ink)' : 'transparent',
              color: value === w ? 'var(--on-ink)' : 'var(--body)',
            }}
          >
            {w === null ? 'All time' : `${w}d`}
          </button>
        ))}
      </div>
    </div>
  )
}
