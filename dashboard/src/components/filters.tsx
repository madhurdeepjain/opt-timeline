"use client";

import { FilterState } from "@/lib/types";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

interface FiltersProps {
  filters: FilterState;
  onChange: (next: FilterState) => void;
}

export function Filters({ filters, onChange }: FiltersProps) {
  return (
    <div className="flex flex-wrap gap-3">
      <div className="flex flex-col gap-1">
        <label className="text-xs text-muted-foreground">Type</label>
        <Select
          value={filters.normalizedType}
          onValueChange={(v) => onChange({ ...filters, normalizedType: v as FilterState["normalizedType"] })}
        >
          <SelectTrigger className="w-36">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All types</SelectItem>
            <SelectItem value="OPT">OPT</SelectItem>
            <SelectItem value="STEM">STEM OPT</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="flex flex-col gap-1">
        <label className="text-xs text-muted-foreground">Premium Processing</label>
        <Select
          value={filters.premiumProcessing}
          onValueChange={(v) => onChange({ ...filters, premiumProcessing: v as FilterState["premiumProcessing"] })}
        >
          <SelectTrigger className="w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All</SelectItem>
            <SelectItem value="true">Premium</SelectItem>
            <SelectItem value="false">Standard</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="flex flex-col gap-1">
        <label className="text-xs text-muted-foreground">Source</label>
        <Select
          value={filters.subreddit}
          onValueChange={(v) => onChange({ ...filters, subreddit: v as FilterState["subreddit"] })}
        >
          <SelectTrigger className="w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All subreddits</SelectItem>
            <SelectItem value="f1visa">r/f1visa</SelectItem>
            <SelectItem value="USCIS">r/USCIS</SelectItem>
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}
