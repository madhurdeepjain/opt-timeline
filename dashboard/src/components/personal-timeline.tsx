'use client'

import Timeline, { type TimelineEvent } from '@/components/timeline'
import { daysBetween } from '@/lib/utils'

const EVENTS: TimelineEvent[] = [
  { label: 'Applied (Standard)',            short: 'Applied',    date: '2026-03-10' },
  { label: 'Biometrics Scheduled Notice',   short: 'Bio Notice', date: '2026-03-21' },
  { label: 'Biometrics Appointment',        short: 'Biometrics', date: '2026-04-06' },
  { label: 'Upgraded to Premium Processing',short: '→ Premium',  date: '2026-04-14', accent: true },
  { label: 'Received Email Approval',       short: 'Approved',   date: '2026-04-21' },
  { label: 'Approval in USCIS Portal',      short: 'Portal',     date: '2026-04-23' },
  { label: 'EAD Card Produced',             short: 'Card Out',   date: '2026-04-28' },
  { label: 'EAD Card Received',             short: 'Card In',    date: '2026-05-02' },
]

const TOTAL_DAYS = daysBetween(EVENTS[0].date, EVENTS[EVENTS.length - 1].date)

export default function PersonalTimeline() {
  return (
    <div
      className="rounded-md border p-6"
      style={{ backgroundColor: 'var(--surface-card)', borderColor: 'var(--hairline)' }}
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <p className="text-xs font-bold uppercase tracking-widest mb-1" style={{ color: 'var(--mute)' }}>
            My Timeline
          </p>
          <h2 className="text-lg font-bold" style={{ color: 'var(--ink)' }}>
            My OPT Case Journey
          </h2>
        </div>
        <div className="text-right">
          <p className="text-[26px] font-extrabold leading-none" style={{ color: 'var(--ink)', letterSpacing: '-0.6px' }}>
            {TOTAL_DAYS}
          </p>
          <p className="text-xs" style={{ color: 'var(--mute)' }}>days total</p>
        </div>
      </div>

      <Timeline events={EVENTS} />
    </div>
  )
}
