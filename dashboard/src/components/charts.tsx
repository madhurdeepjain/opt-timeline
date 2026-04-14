"use client";

import { motion } from "framer-motion";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  LineChart, Line, PieChart, Pie, Cell, FunnelChart, Funnel,
  LabelList, ResponsiveContainer,
} from "recharts";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";

const fadeUp = {
  hidden: { opacity: 0, y: 24 },
  show: { opacity: 1, y: 0, transition: { duration: 0.5 } },
};

const COLORS = {
  opt: "#38bdf8",    // sky-400
  stem: "#a78bfa",   // violet-400
  premium: "#34d399",// emerald-400
  standard: "#fb923c",// orange-400
  total: "#94a3b8",  // slate-400
};

const PIE_COLORS = [COLORS.opt, COLORS.stem];

// ─── Processing Time Histogram ───────────────────────────────────────────────
export function ProcessingTimeChart({ data }: { data: { range: string; opt: number; stem: number }[] }) {
  return (
    <motion.div variants={fadeUp} initial="hidden" animate="show">
      <Card>
        <CardHeader>
          <CardTitle>Processing Time Distribution (days applied → approved)</CardTitle>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={data} margin={{ top: 4, right: 8, left: -16, bottom: 4 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
              <XAxis dataKey="range" tick={{ fontSize: 11 }} stroke="#52525b" />
              <YAxis tick={{ fontSize: 11 }} stroke="#52525b" />
              <Tooltip
                contentStyle={{ background: "#18181b", border: "1px solid #3f3f46", borderRadius: 8 }}
                labelStyle={{ color: "#e4e4e7" }}
              />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Bar dataKey="opt" name="OPT" stackId="a" fill={COLORS.opt} radius={[0, 0, 0, 0]} />
              <Bar dataKey="stem" name="STEM OPT" stackId="a" fill={COLORS.stem} radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>
    </motion.div>
  );
}

// ─── Weekly Submission Trend ──────────────────────────────────────────────────
export function SubmissionTrendChart({ data }: { data: { week: string; opt: number; stem: number; total: number }[] }) {
  return (
    <motion.div variants={fadeUp} initial="hidden" animate="show">
      <Card>
        <CardHeader>
          <CardTitle>Weekly New Applications (by date applied)</CardTitle>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={280}>
            <LineChart data={data} margin={{ top: 4, right: 8, left: -16, bottom: 4 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
              <XAxis
                dataKey="week"
                tick={{ fontSize: 10 }}
                stroke="#52525b"
                tickFormatter={(v) => v.slice(5)}  // show MM-DD portion
              />
              <YAxis tick={{ fontSize: 11 }} stroke="#52525b" />
              <Tooltip
                contentStyle={{ background: "#18181b", border: "1px solid #3f3f46", borderRadius: 8 }}
                labelStyle={{ color: "#e4e4e7" }}
              />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Line type="monotone" dataKey="opt" name="OPT" stroke={COLORS.opt} strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="stem" name="STEM OPT" stroke={COLORS.stem} strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>
    </motion.div>
  );
}

// ─── OPT vs STEM Breakdown ────────────────────────────────────────────────────
export function TypeBreakdownChart({ data }: { data: { name: string; value: number }[] }) {
  return (
    <motion.div variants={fadeUp} initial="hidden" animate="show">
      <Card>
        <CardHeader>
          <CardTitle>Application Type Breakdown</CardTitle>
        </CardHeader>
        <CardContent className="flex items-center justify-center">
          <ResponsiveContainer width="100%" height={240}>
            <PieChart>
              <Pie
                data={data}
                cx="50%"
                cy="50%"
                innerRadius={60}
                outerRadius={95}
                paddingAngle={3}
                dataKey="value"
                label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                labelLine={false}
              >
                {data.map((_, i) => (
                  <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                ))}
              </Pie>
              <Tooltip
                contentStyle={{ background: "#18181b", border: "1px solid #3f3f46", borderRadius: 8 }}
              />
            </PieChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>
    </motion.div>
  );
}

// ─── Premium vs Standard Avg Processing Time ──────────────────────────────────
export function PremiumComparisonChart({
  data,
}: {
  data: { label: string; avgDays: number; count: number }[];
}) {
  return (
    <motion.div variants={fadeUp} initial="hidden" animate="show">
      <Card>
        <CardHeader>
          <CardTitle>Avg Processing Time — Premium vs Standard</CardTitle>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={data} margin={{ top: 4, right: 8, left: -16, bottom: 4 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
              <XAxis dataKey="label" stroke="#52525b" />
              <YAxis
                label={{ value: "days", angle: -90, position: "insideLeft", style: { fill: "#71717a" } }}
                stroke="#52525b"
              />
              <Tooltip
                contentStyle={{ background: "#18181b", border: "1px solid #3f3f46", borderRadius: 8 }}
                formatter={(v: number) => [`${v} days`, "Avg processing"]}
              />
              <Bar dataKey="avgDays" name="Avg days to approval" radius={[6, 6, 0, 0]}>
                {data.map((d, i) => (
                  <Cell key={i} fill={d.label === "Premium" ? COLORS.premium : COLORS.standard} />
                ))}
                <LabelList dataKey="count" position="top" formatter={(v: number) => `n=${v}`} style={{ fill: "#a1a1aa", fontSize: 11 }} />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>
    </motion.div>
  );
}

// ─── Application Status Funnel ────────────────────────────────────────────────
export function StatusFunnelChart({ data }: { data: { stage: string; count: number }[] }) {
  // Recharts' FunnelChart doesn't look great with dark themes — use a simple horizontal bar instead
  const max = data[0]?.count || 1;
  return (
    <motion.div variants={fadeUp} initial="hidden" animate="show">
      <Card>
        <CardHeader>
          <CardTitle>Application Progress Funnel</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 pt-2">
          {data.map(({ stage, count }, i) => {
            const pct = Math.round((count / max) * 100);
            const hue = 200 - i * 20; // shift colour as we go deeper
            return (
              <div key={stage} className="space-y-1">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">{stage}</span>
                  <span className="font-medium tabular-nums">
                    {count.toLocaleString()}
                    <span className="text-xs text-muted-foreground ml-2">({pct}%)</span>
                  </span>
                </div>
                <div className="h-2 rounded-full bg-muted overflow-hidden">
                  <motion.div
                    className="h-full rounded-full"
                    style={{ backgroundColor: `hsl(${hue}, 80%, 60%)` }}
                    initial={{ width: 0 }}
                    animate={{ width: `${pct}%` }}
                    transition={{ duration: 0.7, delay: i * 0.1 }}
                  />
                </div>
              </div>
            );
          })}
        </CardContent>
      </Card>
    </motion.div>
  );
}
