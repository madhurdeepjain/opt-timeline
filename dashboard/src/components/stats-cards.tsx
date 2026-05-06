import type { DashboardStats } from '@/lib/types'
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

export default function StatsCards({ stats }: { stats: DashboardStats }) {
  const premiumLabel =
    stats.medianDaysPremium !== null && stats.medianDaysStandard !== null
      ? `${stats.medianDaysPremium}d premium · ${stats.medianDaysStandard}d standard`
      : stats.medianDaysPremium !== null
      ? `${stats.medianDaysPremium}d premium`
      : stats.medianDaysStandard !== null
      ? `${stats.medianDaysStandard}d standard`
      : undefined

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
      <Card
        icon={<Users size={14} />}
        label="Total Records"
        value={stats.total.toLocaleString()}
        sub={`${stats.optCount} OPT · ${stats.stemCount} STEM`}
      />
      <Card
        icon={<Clock size={14} />}
        label="Median Approval"
        value={stats.medianDaysToApproval !== null ? `${stats.medianDaysToApproval}d` : '—'}
        sub="days from applied to approved"
      />
      <Card
        icon={<Zap size={14} />}
        label="Premium Processing"
        value={`${stats.premiumPct}%`}
        sub={premiumLabel}
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
