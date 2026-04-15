"use client";

import { useState, useMemo } from "react";
import {
  BarChart, Bar, LineChart, Line, AreaChart, Area, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer
} from "recharts";
import { TimelineRecord } from "@/lib/types";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { format, parseISO, startOfWeek, startOfMonth } from "date-fns";

const COLORS = [
  "#38bdf8", "#a78bfa", "#34d399", "#fb923c", "#f472b6", "#60a5fa", "#c084fc", "#4ade80"
];

function avg(arr: number[]) {
  if (!arr.length) return 0;
  return arr.reduce((a, b) => a + b, 0) / arr.length;
}

export function Explorer({ records }: { records: TimelineRecord[] }) {
  const [xAxis, setXAxis] = useState<string>("date_applied_week");
  const [metric, setMetric] = useState<string>("count");
  const [splitBy, setSplitBy] = useState<string>("normalized_type");
  const [chartType, setChartType] = useState<string>("bar");

  const data = useMemo(() => {
    // 1. Group records by X-Axis
    const grouped = new Map<string, TimelineRecord[]>();
    
    for (const r of records) {
      let key = "Unknown";
      
      if (xAxis === "date_applied_week" || xAxis === "date_applied_month") {
        if (!r.date_applied) continue;
        try {
          const d = parseISO(r.date_applied);
          if (isNaN(d.getTime())) continue;
          if (xAxis === "date_applied_week") {
            key = format(startOfWeek(d), "yyyy-MM-dd");
          } else {
            key = format(startOfMonth(d), "yyyy-MM");
          }
        } catch {
          continue;
        }
      } else if (xAxis === "processing_time") {
        const days = parseInt(r.days_to_approval);
        if (isNaN(days) || days < 0 || days > 300) continue;
        const low = Math.floor(days / 10) * 10;
        key = `${low}–${low + 9}`;
      } else if (xAxis === "type") {
        key = r.normalized_type || "Unknown";
      } else if (xAxis === "premium") {
        key = r.premium_processing === "true" ? "Premium" : r.premium_processing === "false" ? "Standard" : "Unknown";
      }

      if (!grouped.has(key)) grouped.set(key, []);
      grouped.get(key)!.push(r);
    }

    // 2. Calculate metrics and split
    const result: any[] = [];
    const splits = new Set<string>();

    // Determine split keys based on records and sort
    const sortedEntries = Array.from(grouped.entries()).sort(([a], [b]) => {
      // Numerical sort for processing time
      if (xAxis === "processing_time") return parseInt(a) - parseInt(b);
      // Alphabetical / Date
      return a.localeCompare(b);
    });

    for (const [key, groupRecords] of sortedEntries) {
      const entry: any = { [xAxis]: key };
      
      if (splitBy === "none") {
        let val = 0;
        if (metric === "count") {
          val = groupRecords.length;
        } else if (metric === "avg_approval") {
          val = avg(groupRecords.map(r => parseInt(r.days_to_approval)).filter(n => !isNaN(n)));
        }
        entry["Total"] = val;
        splits.add("Total");
      } else {
        // We are splitting
        const splitMap = new Map<string, TimelineRecord[]>();
        for (const r of groupRecords) {
          let sKey = "Unknown";
          if (splitBy === "normalized_type") sKey = r.normalized_type || "Unknown";
          if (splitBy === "premium") sKey = r.premium_processing === "true" ? "Premium" : r.premium_processing === "false" ? "Standard" : "Unknown";
          if (splitBy === "subreddit") sKey = r.subreddit || "Unknown";
          
          if (!splitMap.has(sKey)) splitMap.set(sKey, []);
          splitMap.get(sKey)!.push(r);
        }

        for (const [sKey, sRecords] of splitMap.entries()) {
          let val = 0;
          if (metric === "count") val = sRecords.length;
          else if (metric === "avg_approval") {
            val = avg(sRecords.map(r => parseInt(r.days_to_approval)).filter(n => !isNaN(n)));
          }
          entry[sKey] = Math.round(val * 10) / 10;
          splits.add(sKey);
        }
      }
      
      result.push(entry);
    }
    
    return { chartData: result, splitKeys: Array.from(splits).sort() };
  }, [records, xAxis, metric, splitBy]);

  return (
    <Card className="col-span-1 md:col-span-2 shadow-sm border-border bg-card">
      <CardHeader>
        <CardTitle className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
          <span>Custom Visualization Explorer</span>
        </CardTitle>
        <div className="flex flex-wrap gap-4 mt-4">
          <div className="flex flex-col gap-1.5 w-40">
            <label className="text-xs font-medium text-muted-foreground">X-Axis</label>
            <Select value={xAxis} onValueChange={setXAxis}>
              <SelectTrigger className="h-8 text-xs bg-muted/50"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="date_applied_week">Date Applied (Week)</SelectItem>
                <SelectItem value="date_applied_month">Date Applied (Month)</SelectItem>
                <SelectItem value="processing_time">Processing Time (Days)</SelectItem>
                <SelectItem value="type">OPT Type</SelectItem>
                <SelectItem value="premium">Premium vs Standard</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-1.5 w-40">
            <label className="text-xs font-medium text-muted-foreground">Y-Axis (Metric)</label>
            <Select value={metric} onValueChange={setMetric}>
              <SelectTrigger className="h-8 text-xs bg-muted/50"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="count">Count (Volume)</SelectItem>
                <SelectItem value="avg_approval">Avg Days to Approval</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-1.5 w-40">
            <label className="text-xs font-medium text-muted-foreground">Split By/Color</label>
            <Select value={splitBy} onValueChange={setSplitBy}>
              <SelectTrigger className="h-8 text-xs bg-muted/50"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">None (Total)</SelectItem>
                <SelectItem value="normalized_type">OPT / STEM OPT</SelectItem>
                <SelectItem value="premium">Premium Processing</SelectItem>
                <SelectItem value="subreddit">Subreddit</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-1.5 w-40">
            <label className="text-xs font-medium text-muted-foreground">Chart Type</label>
            <Select value={chartType} onValueChange={setChartType}>
              <SelectTrigger className="h-8 text-xs bg-muted/50"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="bar">Bar Chart</SelectItem>
                <SelectItem value="line">Line Chart</SelectItem>
                <SelectItem value="area">Area Chart</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {data.chartData.length === 0 ? (
          <div className="h-80 flex items-center justify-center text-muted-foreground text-sm">
            Not enough data for this configuration
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={320}>
            {chartType === "bar" ? (
              <BarChart data={data.chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
                <XAxis dataKey={xAxis} tick={{ fontSize: 11 }} stroke="#52525b" />
                <YAxis tick={{ fontSize: 11 }} stroke="#52525b" />
                <Tooltip contentStyle={{ background: "#18181b", border: "1px solid #3f3f46", borderRadius: 8 }} labelStyle={{ color: "#e4e4e7" }} />
                <Legend wrapperStyle={{ fontSize: 12, paddingTop: "10px" }} />
                {data.splitKeys.map((key, i) => (
                  <Bar key={key} dataKey={key} fill={COLORS[i % COLORS.length]} stackId={splitBy === "none" ? undefined : "a"} />
                ))}
              </BarChart>
            ) : chartType === "line" ? (
              <LineChart data={data.chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
                <XAxis dataKey={xAxis} tick={{ fontSize: 11 }} stroke="#52525b" />
                <YAxis tick={{ fontSize: 11 }} stroke="#52525b" />
                <Tooltip contentStyle={{ background: "#18181b", border: "1px solid #3f3f46", borderRadius: 8 }} labelStyle={{ color: "#e4e4e7" }} />
                <Legend wrapperStyle={{ fontSize: 12, paddingTop: "10px" }} />
                {data.splitKeys.map((key, i) => (
                  <Line key={key} type="monotone" dataKey={key} stroke={COLORS[i % COLORS.length]} strokeWidth={2} dot={false} activeDot={{ r: 6 }} />
                ))}
              </LineChart>
            ) : (
              <AreaChart data={data.chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
                <XAxis dataKey={xAxis} tick={{ fontSize: 11 }} stroke="#52525b" />
                <YAxis tick={{ fontSize: 11 }} stroke="#52525b" />
                <Tooltip contentStyle={{ background: "#18181b", border: "1px solid #3f3f46", borderRadius: 8 }} labelStyle={{ color: "#e4e4e7" }} />
                <Legend wrapperStyle={{ fontSize: 12, paddingTop: "10px" }} />
                {data.splitKeys.map((key, i) => (
                  <Area key={key} type="monotone" dataKey={key} fill={COLORS[i % COLORS.length]} stroke={COLORS[i % COLORS.length]} stackId={splitBy === "none" ? undefined : "a"} fillOpacity={0.4} />
                ))}
              </AreaChart>
            )}
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  );
}
