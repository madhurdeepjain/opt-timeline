'use client'

import { useEffect, useRef, useState } from 'react'
import { Check } from 'lucide-react'
import { formatShortDate, daysBetween } from '@/lib/utils'

export interface TimelineEvent {
  /** full description, shown on hover and in the mobile list */
  label: string
  /** a word or two, shown under/over the dot */
  short: string
  date: string
  /** highlight the dot (e.g. the premium-processing upgrade) */
  accent?: boolean
}

// Layout (px)
const H_PAD = 44 // inset so the first/last dot centres sit inside the card
const DOT = 28
const LINE_Y = 50
const H = 106
const DOT_TOP = LINE_Y - DOT / 2
const LABEL_GAP = 10 // min space between two labels on the same side
// Rough label width: 11px semibold text is ~6.4px per character.
const labelWidth = (short: string, date: string) => Math.max(short.length * 6.4, date.length * 5.8) + 8

interface Placed {
  date: string
  label: string
  short: string
  accent: boolean
  x: number
  above: boolean
  /** horizontal label offset from the dot, when both sides were taken */
  shift: number
}

/**
 * Put each label above or below the line so none overlap: prefer the side
 * opposite the previous label, take the other side if that one is taken, and
 * only when both are, nudge the label right past its neighbour.
 */
function layout(events: TimelineEvent[], width: number): Placed[] {
  // One dot per day: "Card Out" and "Card In" on the same date share it.
  const groups: TimelineEvent[][] = []
  for (const e of events) {
    const last = groups[groups.length - 1]
    if (last && last[0].date === e.date) last.push(e)
    else groups.push([e])
  }
  const first = groups[0][0].date
  const span = daysBetween(first, groups[groups.length - 1][0].date)
  const inner = Math.max(0, width - H_PAD * 2)

  const laneEnd = { above: -Infinity, below: -Infinity }
  let prevAbove = true
  return groups.map((g) => {
    const short = g.map((e) => e.short).join(' · ')
    const x = H_PAD + (span === 0 ? 0 : (daysBetween(first, g[0].date) / span) * inner)
    const w = labelWidth(short, formatShortDate(g[0].date))
    // Keep labels inside the card.
    const centre = Math.min(Math.max(x, w / 2), width - w / 2)
    const fits = (above: boolean) => centre - w / 2 >= laneEnd[above ? 'above' : 'below'] + LABEL_GAP
    let above = !prevAbove
    if (!fits(above) && fits(!above)) above = !above
    const lane = above ? 'above' : 'below'
    const shift = Math.max(0, laneEnd[lane] + LABEL_GAP - (centre - w / 2)) + (centre - x)
    laneEnd[lane] = x + shift + w / 2
    prevAbove = above
    return {
      date: g[0].date,
      label: g.map((e) => e.label).join(' · '),
      short,
      accent: g.some((e) => e.accent),
      x,
      above,
      shift,
    }
  })
}

export default function Timeline({ events }: { events: TimelineEvent[] }) {
  const ref = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(0)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const ro = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const placed = width > 0 && events.length > 0 ? layout(events, width) : []

  return (
    <>
      {/* Desktop: proportional horizontal timeline */}
      <div className="hidden md:block">
        <div ref={ref} className="relative w-full" style={{ height: H }}>
          <div
            className="absolute"
            style={{ top: LINE_Y, left: H_PAD, right: H_PAD, height: 1, backgroundColor: 'var(--hairline)' }}
          />
          {placed.map((p) => {
            const text = (
              <div
                className="absolute text-center whitespace-nowrap"
                style={{
                  ...(p.above ? { bottom: H - DOT_TOP + 5 } : { top: DOT_TOP + DOT + 5 }),
                  left: p.x + p.shift,
                  transform: 'translateX(-50%)',
                }}
              >
                <p className="text-[11px] font-semibold leading-tight" style={{ color: 'var(--ink)' }}>{p.short}</p>
                <p className="text-[10px] mt-0.5" style={{ color: 'var(--mute)' }}>{formatShortDate(p.date)}</p>
              </div>
            )
            return (
              <div key={p.date}>
                {text}
                {/* Dot; the tooltip is a child so hover stays active while reading it */}
                <div
                  className="group absolute rounded-full flex items-center justify-center cursor-default"
                  style={{
                    width: DOT,
                    height: DOT,
                    top: DOT_TOP,
                    left: p.x,
                    transform: 'translateX(-50%)',
                    backgroundColor: p.accent ? 'var(--primary-pressed)' : 'var(--ink)',
                    color: p.accent ? 'var(--ink)' : 'var(--on-ink)',
                    zIndex: 2,
                  }}
                >
                  <Check size={13} strokeWidth={2.5} />
                  <div
                    className="pointer-events-none absolute opacity-0 group-hover:opacity-100 transition-opacity z-20 whitespace-nowrap"
                    style={{
                      ...(p.above ? { top: 'calc(100% + 6px)' } : { bottom: 'calc(100% + 6px)' }),
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
                    {p.label}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* Mobile: vertical list with day gaps */}
      <div className="md:hidden">
        {events.map((event, i) => {
          const isLast = i === events.length - 1
          const daysSincePrev = i > 0 ? daysBetween(events[i - 1].date, event.date) : null
          return (
            <div key={event.date + i} className="flex items-start gap-3">
              <div className="flex flex-col items-center flex-shrink-0">
                <div
                  className="w-6 h-6 rounded-full flex items-center justify-center"
                  style={{
                    backgroundColor: event.accent ? 'var(--primary-pressed)' : 'var(--ink)',
                    color: event.accent ? 'var(--ink)' : 'var(--on-ink)',
                  }}
                >
                  <Check size={11} strokeWidth={2.5} />
                </div>
                {!isLast && (
                  <div className="w-px flex-1 mt-1" style={{ backgroundColor: 'var(--hairline-soft)', minHeight: 20 }} />
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
    </>
  )
}
