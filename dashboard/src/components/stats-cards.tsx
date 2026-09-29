import type { DashboardStats, QuantileEstimate } from '@/lib/types'
import { MIN_N } from '@/lib/data'
import { windowPhrase } from '@/components/wait-window-picker'
import { formatDate } from '@/lib/utils'
import { Clock, Users, Zap, CalendarDays } from 'lucide-react'

function Card({
  icon,
  label,
  value,
  sub,
}: {
  icon: React.ReactNode
  label: string
  value: string
  sub?: string
}) {
  return (
    <div
      className="rounded-md border p-6 flex flex-col gap-3"
      style={{ backgroundColor: 'var(--surface-card)', borderColor: 'var(--hairline)' }}
    >
      <div className="flex items-center gap-2">
        <div style={{ color: 'var(--mute)' }}>{icon}</div>
        <p className="text-xs font-bold uppercase tracking-widest" style={{ color: 'var(--mute)' }}>
          {label}
        </p>
      </div>
      <p className="text-[26px] font-extrabold leading-none" style={{ color: 'var(--ink)', letterSpacing: '-0.6px' }}>
        {value}
      </p>
      {sub && (
        <p className="text-sm" style={{ color: 'var(--mute)' }}>
          {sub}
        </p>
      )}
    </div>
  )
}

function fmtEstimate(e: QuantileEstimate | null): string {
  return e ? `${e.value}d` : '—'
}

export default function StatsCards({ stats, waitWindow }: { stats: DashboardStats; waitWindow: number | null }) {
  const byKind = [
    stats.medianWaitStandard && `${stats.medianWaitStandard.value}d standard`,
    stats.medianWaitPremium && `${stats.medianWaitPremium.value}d premium`,
    stats.medianWaitUpgraded && `${stats.medianWaitUpgraded.value}d upgraded`,
  ].filter(Boolean)
  const m = stats.medianWait
  const medianSub = m
    ? `95% CI ${m.lo}–${m.hi}d · ${m.n} cases ${windowPhrase(waitWindow)}` + (byKind.length ? ` · ${byKind.join(' · ')}` : '')
    : `Not enough cases ${windowPhrase(waitWindow)} (${stats.recentCount} of ${MIN_N} needed)`

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
      <Card
        icon={<Users size={14} />}
        label="Total Records"
        value={stats.total.toLocaleString()}
        sub={[stats.optCount > 0 && `${stats.optCount} OPT`, stats.stemCount > 0 && `${stats.stemCount} STEM`].filter(Boolean).join(' · ')}
      />
      <Card
        icon={<Clock size={14} />}
        label="Median Wait"
        value={fmtEstimate(m)}
        sub={medianSub}
      />
      <Card
        icon={<Zap size={14} />}
        label="Premium Processing"
        value={`${stats.premiumPct}%`}
        sub="of records with known processing type, incl. upgrades"
      />
      <Card
        icon={<CalendarDays size={14} />}
        label="Data Through"
        value={stats.latestAppliedDate ? formatDate(stats.latestAppliedDate) : '—'}
        sub="most recent application"
      />
    </div>
  )
}
