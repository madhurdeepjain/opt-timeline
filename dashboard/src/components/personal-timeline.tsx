"use client";

import { motion } from "framer-motion";
import { CheckCircle2, CircleDashed } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type PersonalEvent = {
  label: string;
  date: string;
  done: boolean;
};

const PERSONAL_TIMELINE: PersonalEvent[] = [
  { label: "Applied (Standard)", date: "2026-03-10", done: true },
  { label: "Biometrics Scheduled Notice", date: "2026-03-21", done: true },
  { label: "Biometrics Appointment", date: "2026-04-06", done: true },
  { label: "Upgraded to Premium Processing", date: "2026-04-14", done: true },
  { label: "Received Email Approval", date: "2026-04-21", done: true },
  { label: "Waiting for EAD Card", date: "Pending", done: false },
];

function formatEventDate(value: string): string {
  if (value === "Pending") return value;

  const [year, month, day] = value.split("-").map(Number);
  if (!year || !month || !day) return value;

  return new Date(year, month - 1, day).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function PersonalTimeline() {
  return (
    <motion.section initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-foreground">My Personal Timeline</CardTitle>
        </CardHeader>
        <CardContent>
          <ol className="relative ml-2 border-l border-border pl-5">
            {PERSONAL_TIMELINE.map((event, index) => (
              <li key={`${event.label}-${index}`} className="relative pb-5 last:pb-0">
                <span
                  className={`absolute -left-[1.8rem] inline-flex h-6 w-6 items-center justify-center rounded-full border ${
                    event.done
                      ? "border-emerald-500/40 bg-emerald-500/15 text-emerald-300"
                      : "border-amber-500/40 bg-amber-500/15 text-amber-300"
                  }`}
                >
                  {event.done ? <CheckCircle2 className="h-3.5 w-3.5" /> : <CircleDashed className="h-3.5 w-3.5" />}
                </span>

                <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="text-sm font-medium text-foreground">{event.label}</p>
                    <p className="text-xs text-muted-foreground">{event.done ? "Completed" : "Pending"}</p>
                  </div>
                  <span className="text-xs text-muted-foreground">{formatEventDate(event.date)}</span>
                </div>
              </li>
            ))}
          </ol>
        </CardContent>
      </Card>
    </motion.section>
  );
}
