'use client'

import { Check } from 'lucide-react'
import { formatShortDate } from '@/lib/utils'

const EVENTS = [
  { label: 'Applied (Standard)',            short: 'Applied',    date: '2026-03-10' },
  { label: 'Biometrics Scheduled Notice',   short: 'Bio Notice', date: '2026-03-21' },
  { label: 'Biometrics Appointment',        short: 'Biometrics', date: '2026-04-06' },
  { label: 'Upgraded to Premium Processing',short: '→ Premium',  date: '2026-04-14', premium: true },
  { label: 'Received Email Approval',       short: 'Approved',   date: '2026-04-21' },
  { label: 'Approval in USCIS Portal',      short: 'Portal',     date: '2026-04-23' },
  { label: 'EAD Card Produced',             short: 'Card Out',   date: '2026-04-28' },
  { label: 'EAD Card Received',             short: 'Card In',    date: '2026-05-02' },
]

const START  = new Date('2026-03-10T12:00:00Z')
const END    = new Date('2026-05-02T12:00:00Z')
const TOTAL_MS   = END.getTime() - START.getTime()
const TOTAL_DAYS = Math.round(TOTAL_MS / 86_400_000) // 53

// Returns 0→1 fraction along the timeline
function frac(dateStr: string) {
  return (new Date(dateStr + 'T12:00:00Z').getTime() - START.getTime()) / TOTAL_MS
}

// Layout constants (px)
const H_PAD  = 44   // horizontal inset so first/last dot centres sit at the card edge
const DOT    = 28   // dot diameter
const LINE_Y = 50   // y of the centre line
const H      = 106  // total track height
const dotTop = LINE_Y - DOT / 2  // = 36

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

      {/* ── Desktop: proportional horizontal timeline ── */}
      <div className="hidden md:block">
        <div className="relative w-full" style={{ height: H }}>

          {/* Centre line */}
          <div
            className="absolute"
            style={{
              top: LINE_Y,
              left: H_PAD,
              right: H_PAD,
              height: 1,
              backgroundColor: 'var(--hairline)',
            }}
          />

          {EVENTS.map((event, i) => {
            const f     = frac(event.date)
            const above = i % 2 === 1   // odd indices: label above the line

            return (
              <div
                key={event.date}
                className="absolute"
                style={{
                  // dot centre tracks the fraction of the inner width, then offset by H_PAD
                  left: `calc(${H_PAD}px + (100% - ${H_PAD * 2}px) * ${f})`,
                  transform: 'translateX(-50%)',
                  top: 0,
                  height: H,
                }}
              >
                {/* Label ABOVE the line (odd events) */}
                {above && (
                  <div
                    className="absolute text-center whitespace-nowrap"
                    style={{
                      bottom: H - dotTop + 5,
                      left: '50%',
                      transform: 'translateX(-50%)',
                    }}
                  >
                    <p className="text-[11px] font-semibold leading-tight" style={{ color: 'var(--ink)' }}>
                      {event.short}
                    </p>
                    <p className="text-[10px] mt-0.5" style={{ color: 'var(--mute)' }}>
                      {formatShortDate(event.date)}
                    </p>
                  </div>
                )}

                {/* Dot — tooltip is a child so group-hover stays active while reading it */}
                <div
                  className="group absolute rounded-full flex items-center justify-center cursor-default"
                  style={{
                    width: DOT,
                    height: DOT,
                    top: dotTop,
                    left: '50%',
                    transform: 'translateX(-50%)',
                    backgroundColor: event.premium ? 'var(--primary-pressed)' : 'var(--ink)',
                    color: event.premium ? 'var(--ink)' : '#fff',
                    zIndex: 2,
                  }}
                >
                  <Check size={13} strokeWidth={2.5} />

                  {/* Tooltip — appears on the side opposite the label */}
                  <div
                    className="pointer-events-none absolute opacity-0 group-hover:opacity-100 transition-opacity z-20 whitespace-nowrap"
                    style={{
                      ...(above
                        ? { top: 'calc(100% + 6px)' }       // label above → tooltip below dot
                        : { bottom: 'calc(100% + 6px)' }),  // label below → tooltip above dot
                      left: '50%',
                      transform: 'translateX(-50%)',
                      backgroundColor: 'var(--surface-dark)',
                      color: '#fff',
                      fontSize: 11,
                      fontWeight: 600,
                      padding: '3px 8px',
                      borderRadius: 4,
                    }}
                  >
                    {event.label}
                  </div>
                </div>

                {/* Label BELOW the line (even events) */}
                {!above && (
                  <div
                    className="absolute text-center whitespace-nowrap"
                    style={{
                      top: dotTop + DOT + 5,
                      left: '50%',
                      transform: 'translateX(-50%)',
                    }}
                  >
                    <p className="text-[11px] font-semibold leading-tight" style={{ color: 'var(--ink)' }}>
                      {event.short}
                    </p>
                    <p className="text-[10px] mt-0.5" style={{ color: 'var(--mute)' }}>
                      {formatShortDate(event.date)}
                    </p>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>

      {/* ── Mobile: vertical list with full labels and day gaps ── */}
      <div className="md:hidden">
        {EVENTS.map((event, i) => {
          const isLast = i === EVENTS.length - 1
          const daysSincePrev = i > 0
            ? Math.round(
                (new Date(event.date + 'T12:00:00Z').getTime() -
                 new Date(EVENTS[i - 1].date + 'T12:00:00Z').getTime()) / 86_400_000
              )
            : null

          return (
            <div key={event.date} className="flex items-start gap-3">
              <div className="flex flex-col items-center flex-shrink-0">
                <div
                  className="w-6 h-6 rounded-full flex items-center justify-center"
                  style={{
                    backgroundColor: event.premium ? 'var(--primary-pressed)' : 'var(--ink)',
                    color: event.premium ? 'var(--ink)' : '#fff',
                  }}
                >
                  <Check size={11} strokeWidth={2.5} />
                </div>
                {!isLast && (
                  <div
                    className="w-px flex-1 mt-1"
                    style={{ backgroundColor: 'var(--hairline-soft)', minHeight: 20 }}
                  />
                )}
              </div>
              <div className="pb-4">
                <p className="text-sm font-semibold leading-tight" style={{ color: 'var(--ink)' }}>
                  {event.label}
                </p>
                <p className="text-xs mt-0.5" style={{ color: 'var(--mute)' }}>
                  {formatShortDate(event.date)}
                  {daysSincePrev !== null && ` · +${daysSincePrev}d`}
                </p>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
