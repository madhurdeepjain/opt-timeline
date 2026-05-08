'use client'

import { useState, useEffect } from 'react'
import { Check, ChevronLeft, Pencil } from 'lucide-react'
import { formatShortDate, daysBetween } from '@/lib/utils'

export const JOURNEY_KEY = 'my-journey'
const WAY_PREFS_KEY = 'way-prefs'
const TODAY = new Date().toISOString().slice(0, 10)

export interface JourneyData {
  type: 'OPT' | 'STEM' | null
  premium: boolean | null
  date_applied: string | null
  biometrics_requested_date: string | null
  biometrics_completed_date: string | null
  date_approved: string | null
  date_card_produced: string | null
  date_card_received: string | null
}

const EMPTY: JourneyData = {
  type: null,
  premium: null,
  date_applied: null,
  biometrics_requested_date: null,
  biometrics_completed_date: null,
  date_approved: null,
  date_card_produced: null,
  date_card_received: null,
}

export function loadJourney(): JourneyData | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = localStorage.getItem(JOURNEY_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as JourneyData
    // Pre-populate from way-prefs if journey fields are missing
    const prefs = JSON.parse(localStorage.getItem(WAY_PREFS_KEY) ?? '{}')
    return {
      ...parsed,
      type: parsed.type ?? (prefs.typeFilter as JourneyData['type']) ?? null,
      premium: parsed.premium ?? (prefs.premiumFilter === 'premium' ? true : prefs.premiumFilter === 'standard' ? false : null),
      date_applied: parsed.date_applied ?? prefs.appliedDate ?? null,
    }
  } catch { return null }
}

function loadInitialJourney(): JourneyData | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = localStorage.getItem(JOURNEY_KEY)
    if (raw) return JSON.parse(raw) as JourneyData
    // No journey yet — seed from way-prefs if available
    const prefs = JSON.parse(localStorage.getItem(WAY_PREFS_KEY) ?? '{}')
    const seeded: Partial<JourneyData> = {}
    if (prefs.typeFilter) seeded.type = prefs.typeFilter as JourneyData['type']
    if (prefs.premiumFilter) seeded.premium = prefs.premiumFilter === 'premium'
    if (prefs.appliedDate) seeded.date_applied = prefs.appliedDate
    if (Object.keys(seeded).length > 0) return { ...EMPTY, ...seeded }
    return null
  } catch { return null }
}

function syncPrefs(data: JourneyData) {
  try {
    const prefs = JSON.parse(localStorage.getItem(WAY_PREFS_KEY) ?? '{}')
    localStorage.setItem(WAY_PREFS_KEY, JSON.stringify({
      ...prefs,
      appliedDate: data.date_applied ?? prefs.appliedDate ?? '',
      typeFilter: data.type ?? prefs.typeFilter ?? null,
      premiumFilter: data.premium === true ? 'premium' : data.premium === false ? 'standard' : (prefs.premiumFilter ?? null),
    }))
  } catch {}
  window.dispatchEvent(new CustomEvent('journey-updated', { detail: data }))
}

function saveJourney(data: JourneyData) {
  localStorage.setItem(JOURNEY_KEY, JSON.stringify(data))
  syncPrefs(data)
}

interface StepDef {
  id: keyof JourneyData
  question: string
  inputType: 'pills' | 'date'
  options?: { label: string; value: string }[]
  skipLabel?: string
  condition?: (d: JourneyData) => boolean
}

const STEPS: StepDef[] = [
  {
    id: 'type',
    question: 'What type of OPT?',
    inputType: 'pills',
    options: [{ label: 'Initial OPT', value: 'OPT' }, { label: 'STEM OPT', value: 'STEM' }],
  },
  {
    id: 'premium',
    question: 'Did you use premium processing?',
    inputType: 'pills',
    options: [{ label: 'Yes', value: 'yes' }, { label: 'No', value: 'no' }],
  },
  {
    id: 'date_applied',
    question: 'When did you apply?',
    inputType: 'date',
  },
  {
    id: 'biometrics_requested_date',
    question: 'Did you receive a biometrics notice?',
    inputType: 'date',
    skipLabel: 'No biometrics',
  },
  {
    id: 'biometrics_completed_date',
    question: 'When was your biometrics appointment?',
    inputType: 'date',
    skipLabel: 'Skip',
    condition: (d) => !!d.biometrics_requested_date,
  },
  {
    id: 'date_approved',
    question: 'Have you been approved?',
    inputType: 'date',
    skipLabel: 'Not yet',
  },
  {
    id: 'date_card_produced',
    question: 'Has your EAD card been produced?',
    inputType: 'date',
    skipLabel: 'Not yet',
    condition: (d) => !!d.date_approved,
  },
  {
    id: 'date_card_received',
    question: 'Have you received your EAD card?',
    inputType: 'date',
    skipLabel: 'Not yet',
    condition: (d) => !!d.date_card_produced,
  },
]

function getVisibleSteps(data: JourneyData): StepDef[] {
  return STEPS.filter(s => !s.condition || s.condition(data))
}

// Resume from the first unanswered step; fall back to last step if all answered
function getResumeIndex(data: JourneyData): number {
  const steps = getVisibleSteps(data)
  for (let i = 0; i < steps.length; i++) {
    const val = data[steps[i].id]
    if (val === null || val === undefined) return i
  }
  return steps.length - 1
}

function pillValue(id: keyof JourneyData, data: JourneyData): string | null {
  if (id === 'premium') return data.premium === true ? 'yes' : data.premium === false ? 'no' : null
  return data[id] as string | null
}

function cleanDependent(d: JourneyData): JourneyData {
  const r = { ...d }
  if (!r.biometrics_requested_date) r.biometrics_completed_date = null
  if (!r.date_approved) { r.date_card_produced = null; r.date_card_received = null }
  if (!r.date_card_produced) r.date_card_received = null
  return r
}

function buildEvents(j: JourneyData) {
  const events: { label: string; short: string; date: string }[] = []
  const typeStr = j.type === 'STEM' ? 'STEM OPT' : 'Initial OPT'
  const premStr = j.premium === true ? ' · Premium' : j.premium === false ? ' · Standard' : ''
  if (j.date_applied) events.push({ label: `Applied — ${typeStr}${premStr}`, short: 'Applied', date: j.date_applied })
  if (j.biometrics_requested_date) events.push({ label: 'Biometrics Notice', short: 'Bio Notice', date: j.biometrics_requested_date })
  if (j.biometrics_completed_date) events.push({ label: 'Biometrics Appointment', short: 'Biometrics', date: j.biometrics_completed_date })
  if (j.date_approved) events.push({ label: 'Approved', short: 'Approved', date: j.date_approved })
  if (j.date_card_produced) events.push({ label: 'EAD Card Produced', short: 'Card Out', date: j.date_card_produced })
  if (j.date_card_received) events.push({ label: 'EAD Card Received', short: 'Card In', date: j.date_card_received })
  return events
}

// Layout constants (match personal-timeline.tsx)
const H_PAD   = 44
const DOT     = 28
const LINE_Y  = 50
const H       = 106
const DOT_TOP = LINE_Y - DOT / 2  // 36

function Wizard({
  initialData,
  initialStepIndex,
  onProgress,
  onComplete,
}: {
  initialData: JourneyData
  initialStepIndex: number
  onProgress: (d: JourneyData) => void
  onComplete: (d: JourneyData) => void
}) {
  const [data, setData] = useState<JourneyData>(initialData)
  const [stepIndex, setStepIndex] = useState(initialStepIndex)
  const [dateInput, setDateInput] = useState<string>(() => {
    const step = getVisibleSteps(initialData)[initialStepIndex]
    if (!step) return ''
    const val = initialData[step.id]
    return typeof val === 'string' ? val : ''
  })

  const visibleSteps = getVisibleSteps(data)
  const step = visibleSteps[Math.min(stepIndex, visibleSteps.length - 1)]

  function advance(rawData: JourneyData) {
    const newData = cleanDependent(rawData)
    const nextSteps = getVisibleSteps(newData)
    setData(newData)
    onProgress(newData)
    if (stepIndex < nextSteps.length - 1) {
      const nextStep = nextSteps[stepIndex + 1]
      const nextVal = newData[nextStep.id]
      setStepIndex(s => s + 1)
      setDateInput(typeof nextVal === 'string' ? nextVal : '')
    } else {
      onComplete(newData)
    }
  }

  function handlePillSelect(rawValue: string) {
    const value = step.id === 'premium' ? rawValue === 'yes' : rawValue
    advance({ ...data, [step.id]: value })
  }

  function handleDateNext() {
    if (!dateInput) return
    advance({ ...data, [step.id]: dateInput })
  }

  function handleSkip() {
    advance({ ...data, [step.id]: null })
  }

  function handleBack() {
    if (stepIndex === 0) return
    const prevStep = visibleSteps[stepIndex - 1]
    const prevVal = data[prevStep.id]
    setStepIndex(s => s - 1)
    setDateInput(typeof prevVal === 'string' ? prevVal : '')
  }

  const pval = pillValue(step.id, data)

  return (
    <div className="flex flex-col gap-6">
      {/* Progress bar */}
      <div className="flex items-center gap-3">
        <button
          onClick={handleBack}
          disabled={stepIndex === 0}
          className="p-1 rounded disabled:opacity-30 cursor-pointer disabled:cursor-default transition-opacity"
          style={{ color: 'var(--mute)' }}
        >
          <ChevronLeft size={16} />
        </button>
        <div className="flex gap-1 flex-1">
          {visibleSteps.map((_, i) => (
            <div
              key={i}
              className="h-1 flex-1 rounded-full transition-colors"
              style={{ backgroundColor: i <= stepIndex ? 'var(--ink)' : 'var(--hairline)' }}
            />
          ))}
        </div>
        <span className="text-[11px] tabular-nums" style={{ color: 'var(--mute)' }}>
          {stepIndex + 1} / {visibleSteps.length}
        </span>
      </div>

      {/* Question */}
      <p className="text-[15px] font-semibold" style={{ color: 'var(--ink)' }}>
        {step.question}
      </p>

      {/* Input */}
      {step.inputType === 'pills' ? (
        <div className="flex flex-wrap gap-2">
          {step.options!.map((opt) => (
            <button
              key={opt.value}
              onClick={() => handlePillSelect(opt.value)}
              className="px-4 py-2 rounded-full text-sm font-medium cursor-pointer transition-colors"
              style={{
                backgroundColor: pval === opt.value ? 'var(--ink)' : 'var(--surface-soft)',
                color: pval === opt.value ? '#fff' : 'var(--body)',
              }}
            >
              {opt.label}
            </button>
          ))}
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          <input
            type="date"
            value={dateInput}
            max={TODAY}
            onChange={(e) => setDateInput(e.target.value)}
            className="text-sm px-3 py-2 rounded border outline-none w-full max-w-[200px]"
            style={{
              backgroundColor: 'var(--surface-soft)',
              borderColor: 'var(--hairline)',
              color: 'var(--ink)',
            }}
          />
          <div className="flex gap-2">
            <button
              onClick={handleDateNext}
              disabled={!dateInput}
              className="px-4 py-1.5 rounded-full text-sm font-medium cursor-pointer disabled:opacity-40 disabled:cursor-default transition-colors"
              style={{ backgroundColor: 'var(--ink)', color: '#fff' }}
            >
              Next →
            </button>
            {step.skipLabel && (
              <button
                onClick={handleSkip}
                className="px-4 py-1.5 rounded-full text-sm font-medium cursor-pointer transition-colors"
                style={{ backgroundColor: 'var(--surface-soft)', color: 'var(--mute)' }}
              >
                {step.skipLabel}
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

export default function UserJourney() {
  const [journey, setJourney] = useState<JourneyData | null | undefined>(undefined)
  const [editing, setEditing] = useState(false)
  const [wizardKey, setWizardKey] = useState(0)

  useEffect(() => {
    setJourney(loadInitialJourney())
  }, [])

  if (journey === undefined) return null

  function handleComplete(data: JourneyData) {
    saveJourney(data)
    setJourney(data)
    setEditing(false)
  }

  function handleClear() {
    localStorage.removeItem(JOURNEY_KEY)
    // Clear the shared fields from way-prefs so the queue widget resets too
    try {
      const prefs = JSON.parse(localStorage.getItem(WAY_PREFS_KEY) ?? '{}')
      localStorage.setItem(WAY_PREFS_KEY, JSON.stringify({
        ...prefs,
        appliedDate: '',
        typeFilter: null,
        premiumFilter: null,
      }))
    } catch {}
    window.dispatchEvent(new CustomEvent('journey-updated', { detail: EMPTY }))
    setJourney(null)
    setEditing(false)
    setWizardKey(k => k + 1)
  }

  function startEditing() {
    setEditing(true)
  }

  const events = journey ? buildEvents(journey) : []
  const showWizard = journey === null || editing
  const resumeIndex = journey && editing ? getResumeIndex(journey) : 0

  const isComplete = !!journey?.date_card_received
  const firstDate = events[0]?.date
  const lastDate = events[events.length - 1]?.date
  const totalDays =
    firstDate && lastDate && events.length > 1
      ? daysBetween(firstDate, lastDate)
      : journey?.date_applied
      ? daysBetween(journey.date_applied, TODAY)
      : null

  let startMs = 0
  let totalMs = 0
  if (events.length >= 2) {
    startMs = new Date(events[0].date + 'T12:00:00Z').getTime()
    totalMs = new Date(events[events.length - 1].date + 'T12:00:00Z').getTime() - startMs
  }

  function frac(dateStr: string): number {
    if (totalMs === 0) return 0
    return (new Date(dateStr + 'T12:00:00Z').getTime() - startMs) / totalMs
  }

  return (
    <div
      className="rounded-md border p-6"
      style={{ backgroundColor: 'var(--surface-card)', borderColor: 'var(--hairline)' }}
    >
      {showWizard ? (
        <>
          <div className="mb-6">
            <p className="text-xs font-bold uppercase tracking-widest mb-1" style={{ color: 'var(--mute)' }}>
              Your Journey
            </p>
            <h2 className="text-lg font-bold" style={{ color: 'var(--ink)' }}>
              {journey ? 'Update your journey' : 'Track your OPT journey'}
            </h2>
            <p className="text-[11px] mt-1" style={{ color: 'var(--mute)' }}>
              Stored only in your browser — never sent anywhere.
            </p>
          </div>
          <Wizard
            key={wizardKey}
            initialData={journey ?? EMPTY}
            initialStepIndex={resumeIndex}
            onProgress={syncPrefs}
            onComplete={handleComplete}
          />
        </>
      ) : (
        <>
          {/* Header */}
          <div className="flex items-start justify-between mb-6">
            <div>
              <p className="text-xs font-bold uppercase tracking-widest mb-1" style={{ color: 'var(--mute)' }}>
                Your Journey
              </p>
              <h2 className="text-lg font-bold" style={{ color: 'var(--ink)' }}>
                Your OPT Case Journey
              </h2>
              <p className="text-[11px] mt-1" style={{ color: 'var(--mute)' }}>
                Stored only in your browser — never sent anywhere.
              </p>
            </div>
            <div className="flex items-start gap-4">
              {totalDays !== null && (
                <div className="text-right">
                  <p
                    className="text-[26px] font-extrabold leading-none"
                    style={{ color: 'var(--ink)', letterSpacing: '-0.6px' }}
                  >
                    {totalDays}
                  </p>
                  <p className="text-xs" style={{ color: 'var(--mute)' }}>
                    {isComplete ? 'days total' : 'days in'}
                  </p>
                </div>
              )}
              <button
                onClick={startEditing}
                className="flex items-center gap-1 px-2.5 py-1.5 rounded-md text-xs font-medium cursor-pointer transition-colors mt-1"
                style={{ backgroundColor: 'var(--surface-soft)', color: 'var(--mute)' }}
              >
                <Pencil size={11} />
                Edit
              </button>
              <button
                onClick={handleClear}
                className="px-2.5 py-1.5 rounded-md text-xs font-medium cursor-pointer transition-colors mt-1"
                style={{ backgroundColor: 'var(--surface-soft)', color: 'var(--mute)' }}
              >
                Clear
              </button>
            </div>
          </div>

          {events.length >= 2 ? (
            <>
              {/* Desktop: proportional horizontal timeline */}
              <div className="hidden md:block">
                <div className="relative w-full" style={{ height: H }}>
                  <div
                    className="absolute"
                    style={{ top: LINE_Y, left: H_PAD, right: H_PAD, height: 1, backgroundColor: 'var(--hairline)' }}
                  />
                  {events.map((event, i) => {
                    const f = frac(event.date)
                    const above = i % 2 === 1
                    return (
                      <div
                        key={event.date + i}
                        className="absolute"
                        style={{
                          left: `calc(${H_PAD}px + (100% - ${H_PAD * 2}px) * ${f})`,
                          transform: 'translateX(-50%)',
                          top: 0,
                          height: H,
                        }}
                      >
                        {above && (
                          <div
                            className="absolute text-center whitespace-nowrap"
                            style={{ bottom: H - DOT_TOP + 5, left: '50%', transform: 'translateX(-50%)' }}
                          >
                            <p className="text-[11px] font-semibold leading-tight" style={{ color: 'var(--ink)' }}>{event.short}</p>
                            <p className="text-[10px] mt-0.5" style={{ color: 'var(--mute)' }}>{formatShortDate(event.date)}</p>
                          </div>
                        )}
                        <div
                          className="group absolute rounded-full flex items-center justify-center cursor-default"
                          style={{
                            width: DOT,
                            height: DOT,
                            top: DOT_TOP,
                            left: '50%',
                            transform: 'translateX(-50%)',
                            backgroundColor: 'var(--ink)',
                            color: '#fff',
                            zIndex: 2,
                          }}
                        >
                          <Check size={13} strokeWidth={2.5} />
                          <div
                            className="pointer-events-none absolute opacity-0 group-hover:opacity-100 transition-opacity z-20 whitespace-nowrap"
                            style={{
                              ...(above ? { top: 'calc(100% + 6px)' } : { bottom: 'calc(100% + 6px)' }),
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
                        {!above && (
                          <div
                            className="absolute text-center whitespace-nowrap"
                            style={{ top: DOT_TOP + DOT + 5, left: '50%', transform: 'translateX(-50%)' }}
                          >
                            <p className="text-[11px] font-semibold leading-tight" style={{ color: 'var(--ink)' }}>{event.short}</p>
                            <p className="text-[10px] mt-0.5" style={{ color: 'var(--mute)' }}>{formatShortDate(event.date)}</p>
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>

              {/* Mobile: vertical list with day gaps */}
              <div className="md:hidden">
                {events.map((event, i) => {
                  const isLast = i === events.length - 1
                  const daysSincePrev =
                    i > 0
                      ? Math.round(
                          (new Date(event.date + 'T12:00:00Z').getTime() -
                            new Date(events[i - 1].date + 'T12:00:00Z').getTime()) /
                            86_400_000,
                        )
                      : null
                  return (
                    <div key={event.date + i} className="flex items-start gap-3">
                      <div className="flex flex-col items-center flex-shrink-0">
                        <div
                          className="w-6 h-6 rounded-full flex items-center justify-center"
                          style={{ backgroundColor: 'var(--ink)', color: '#fff' }}
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
            </>
          ) : (
            <p className="text-sm" style={{ color: 'var(--mute)' }}>
              {events.length === 1
                ? `Applied on ${formatShortDate(events[0].date)} — waiting for more milestones.`
                : 'No milestones recorded yet.'}
            </p>
          )}
        </>
      )}
    </div>
  )
}
