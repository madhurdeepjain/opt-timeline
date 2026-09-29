'use client'

import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, ErrorBar, LabelList } from 'recharts'
import type { TimelineRecord, MilestonePoint } from '@/lib/types'
import { buildMilestoneData } from '@/lib/data'
import { ChartCard } from '@/components/charts'
import { MIN_N } from '@/lib/data'

interface LabelProps {
  x: number
  y: number
  width: number
  height: number
  value: string
}

// Recharts' label index skips some bars, so look the row up by its stage name.
// The text goes past the p75 whisker, not just the bar, so the two never touch.
function MilestoneLabel({ x, y, width, height, value }: LabelProps, rows: MilestonePoint[]) {
  const entry = rows.find((r) => r.stage === value)
  if (!entry || entry.median == null) return null
  const pxPerDay = entry.median > 0 ? width / entry.median : 0
  const end = x + Math.max(width, (entry.p75 ?? entry.median) * pxPerDay)
  return (
    <text x={end + 8} y={y + height / 2 + 4} fontSize={11} fill="var(--mute)">
      {entry.median}d
    </text>
  )
}

export default function MilestoneBreakdown({
  records,
  since,
  waitWindow,
}: {
  records: TimelineRecord[]
  since: string | null
  waitWindow: number | null
}) {
  const data = buildMilestoneData(records, since)
  const shown = data.filter((d) => d.median != null)
  const hidden = data.filter((d) => d.median == null).map((d) => d.stage)
  const maxEnd = Math.max(...shown.map((d) => d.p75 ?? d.median ?? 0), 1)
  const domainMax = Math.ceil((maxEnd * 1.25) / 10) * 10

  const total = records.length
  const bioCount = records.filter((r) => r.biometrics_requested_date || r.biometrics_completed_date).length
  const bioPct = total > 0 ? Math.round(bioCount / total * 100) : 0
  const bioNote = bioPct >= 60
    ? `Gray bars apply to the ${bioPct}% of cases that required biometrics.`
    : bioPct >= 30
    ? `Gray bars apply to biometrics cases (${bioPct}% of this view) — varies by policy period.`
    : `Gray bars apply to biometrics cases (${bioPct}% of this view) — most were waived in this period.`

  const chartData = shown.map((d) => ({ ...d, range: d.range ?? [0, 0] }))

  if (shown.length === 0) return null

  return (
    <ChartCard title="How long each step typically takes" sub={`Stage durations · steps finished ${waitWindow === null ? 'at any time' : `in the last ${waitWindow} days`}`}>
      <ResponsiveContainer width="100%" height={chartData.length * 48 + 40}>
        <BarChart
          data={chartData}
          layout="vertical"
          margin={{ top: 0, right: 52, left: 16, bottom: 0 }}
          barCategoryGap="30%"
        >
          <XAxis
            type="number"
            domain={[0, domainMax]}
            tick={{ fontSize: 11, fill: 'var(--mute)' }}
            axisLine={false}
            tickLine={false}
            tickFormatter={(v) => `${v}d`}
          />
          <YAxis
            type="category"
            dataKey="stage"
            tick={(props: { x: string | number; y: string | number; payload: { value: string } }) => (
              <text x={props.x} y={props.y} textAnchor="end" fill="var(--ink)" fontSize={11} dominantBaseline="central">
                {props.payload.value}
              </text>
            )}
            axisLine={false}
            tickLine={false}
            width={165}
          />
          <Tooltip
            content={({ active, payload }) => {
              if (!active || !payload?.[0]) return null
              const p = payload[0].payload as MilestonePoint
              if (p.median == null) return null
              return (
                <div style={{ backgroundColor: 'var(--surface-card)', border: '1px solid var(--hairline)', borderRadius: '6px', fontSize: '12px', padding: '8px 12px' }}>
                  <div style={{ fontWeight: 600, color: 'var(--ink)', marginBottom: 2 }}>{p.stage}</div>
                  <div style={{ color: 'var(--mute)' }}>{p.median}d median · {p.p25}–{p.p75}d range · n={p.n}</div>
                </div>
              )
            }}
          />
          <Bar dataKey="median" radius={[0, 3, 3, 0]} barSize={16}>
            {chartData.map((entry, i) => (
              <Cell key={i} fill={entry.bioOnly ? '#bfc1b7' : 'var(--ink)'} />
            ))}
            <ErrorBar dataKey="range" width={4} strokeWidth={2} stroke="#9b9c92" direction="x" />
            <LabelList dataKey="stage" content={(props) => MilestoneLabel(props as unknown as LabelProps, shown)} />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
      <p className="text-[11px]" style={{ color: 'var(--mute)' }}>
        {bioNote} Error bars show the p25–p75 range.
        {hidden.length > 0 && ` Fewer than ${MIN_N} cases, so not shown: ${hidden.join(', ')}.`}
      </p>
    </ChartCard>
  )
}
