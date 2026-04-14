"use client";

import { motion } from "framer-motion";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { DashboardStats } from "@/lib/types";
import { Clock, CheckCircle2, Hourglass, Users } from "lucide-react";

const container = {
  hidden: {},
  show: { transition: { staggerChildren: 0.08 } },
};
const item = {
  hidden: { opacity: 0, y: 20 },
  show: { opacity: 1, y: 0, transition: { duration: 0.4 } },
};

interface StatCardProps {
  title: string;
  value: string | number;
  sub?: string;
  icon: React.ReactNode;
  accent?: string;
}

function StatCard({ title, value, sub, icon, accent = "text-foreground" }: StatCardProps) {
  return (
    <motion.div variants={item}>
      <Card className="relative overflow-hidden">
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <CardTitle>{title}</CardTitle>
          <div className="text-muted-foreground">{icon}</div>
        </CardHeader>
        <CardContent>
          <div className={`text-3xl font-bold ${accent}`}>{value}</div>
          {sub && <p className="text-xs text-muted-foreground mt-1">{sub}</p>}
        </CardContent>
      </Card>
    </motion.div>
  );
}

export function StatsCards({ stats }: { stats: DashboardStats }) {
  const approvalPct =
    stats.total > 0 ? Math.round((stats.approved / stats.total) * 100) : 0;

  return (
    <motion.div
      variants={container}
      initial="hidden"
      animate="show"
      className="grid grid-cols-2 gap-4 lg:grid-cols-4"
    >
      <StatCard
        title="Total Records"
        value={stats.total.toLocaleString()}
        sub={`OPT: ${stats.optCount}  ·  STEM: ${stats.stemCount}`}
        icon={<Users className="h-4 w-4" />}
      />
      <StatCard
        title="Approved"
        value={stats.approved.toLocaleString()}
        sub={`${approvalPct}% of total`}
        icon={<CheckCircle2 className="h-4 w-4" />}
        accent="text-emerald-400"
      />
      <StatCard
        title="Pending"
        value={stats.pending.toLocaleString()}
        sub="awaiting approval"
        icon={<Hourglass className="h-4 w-4" />}
        accent="text-amber-400"
      />
      <StatCard
        title="Avg Processing"
        value={stats.avgDaysToApproval != null ? `${stats.avgDaysToApproval}d` : "—"}
        sub={
          stats.avgDaysToCard != null
            ? `${stats.avgDaysToCard}d applied → card received`
            : "applied → approved"
        }
        icon={<Clock className="h-4 w-4" />}
        accent="text-sky-400"
      />
    </motion.div>
  );
}
