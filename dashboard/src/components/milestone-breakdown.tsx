'use client'

import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, ErrorBar, LabelList } from 'recharts'
import type { TimelineRecord, MilestonePoint } from '@/lib/types'
import { buildMilestoneData } from '@/lib/data'
import { ChartCard } from '@/components/charts'

interface LabelProps {
  x: number
  y: number
  width: number
  height: number
  index: number
}

function MilestoneLabel({ x, y, width, height, index }: LabelProps, milestoneData: MilestonePoint[]) {
  const entry = milestoneData[index]
  if (!entry?.median) return null
  return (
    <text x={x + width + 8} y={y + height / 2 + 4} fontSize={11} fill="var(--mute)">
      {entry.median}d
    </text>
  )
}

export default function MilestoneBreakdown({ records }: { records: TimelineRecord[] }) {
  const data = buildMilestoneData(records)
  const maxMedian = Math.max(...data.map((d) => d.median ?? 0), 1)
  const domainMax = Math.ceil(maxMedian * 1.3 / 10) * 10

  const total = records.length
  const bioCount = records.filter((r) => r.biometrics_requested_date || r.biometrics_completed_date).length
  const bioPct = total > 0 ? Math.round(bioCount / total * 100) : 0
  const bioNote = bioPct >= 60
    ? `Gray bars apply to the ${bioPct}% of cases that required biometrics.`
    : bioPct >= 30
    ? `Gray bars apply to biometrics cases (${bioPct}% of this view) — varies by policy period.`
    : `Gray bars apply to biometrics cases (${bioPct}% of this view) — most were waived in this period.`

  const chartData = data.map((d) => ({
    ...d,
    median: d.median ?? 0,
    range: d.range ?? [0, 0],
  }))

  if (data.every((d) => d.n === 0)) return null

  return (
    <ChartCard title="How long each step typically takes" sub="Stage Durations">
      <ResponsiveContainer width="100%" height={260}>
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
            contentStyle={{
              backgroundColor: 'var(--surface-card)',
              border: '1px solid var(--hairline)',
              borderRadius: '6px',
              fontSize: '12px',
              color: 'var(--ink)',
            }}
            formatter={(val, _key, item) => {
              const p = item.payload as MilestonePoint
              return [`${val}d median · ${p.p25}–${p.p75}d range · n=${p.n}`, '']
            }}
          />
          <Bar dataKey="median" radius={[0, 3, 3, 0]} barSize={16}>
            {chartData.map((entry, i) => (
              <Cell key={i} fill={entry.bioOnly ? '#bfc1b7' : 'var(--ink)'} />
            ))}
            <ErrorBar dataKey="range" width={4} strokeWidth={2} stroke="#9b9c92" direction="x" />
            <LabelList content={(props) => MilestoneLabel(props as unknown as LabelProps, data)} />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
      <p className="text-[11px]" style={{ color: 'var(--mute)' }}>
        {bioNote} Error bars show the p25–p75 range.
      </p>
    </ChartCard>
  )
}
