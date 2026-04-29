import * as React from "react";
import { cn } from "./cn";

export interface StatProps {
  label: string;
  value: React.ReactNode;
  hint?: React.ReactNode;
  className?: string;
}

/**
 * A compact label+value stat block. Used in performance summaries and the
 * intelligence sidebar. Vertical, label-above-value, KPI feel.
 */
export function Stat({ label, value, hint, className }: StatProps) {
  return (
    <div className={cn("flex flex-col gap-0.5", className)}>
      <p className="text-[10.5px] font-medium uppercase tracking-[0.14em] text-sand-500">{label}</p>
      <p className="text-2xl font-serif font-medium text-sand-900 leading-none tabular-nums">{value}</p>
      {hint && <p className="mt-1 text-xs text-sand-500">{hint}</p>}
    </div>
  );
}

export interface StatRowItem {
  label: string;
  value: React.ReactNode;
  hint?: React.ReactNode;
}

export function StatRow({ items, className }: { items: StatRowItem[]; className?: string }) {
  return (
    <div
      className={cn(
        "grid divide-x divide-sand-200 rounded-md border border-sand-200 bg-white",
        className,
      )}
      style={{ gridTemplateColumns: `repeat(${items.length}, minmax(0, 1fr))` }}
    >
      {items.map((it, i) => (
        <div key={i} className="px-4 py-3">
          <Stat label={it.label} value={it.value} hint={it.hint} />
        </div>
      ))}
    </div>
  );
}
