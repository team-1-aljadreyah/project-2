"use client";

// Charts. Colors come from the design tokens, so they follow day/night mode. The real chart (recharts) is
// loaded on its own (sales-bars.tsx); the bars below are plain HTML.
import dynamic from "next/dynamic";
import { useFmt } from "@/lib/i18n";


export const SalesBars = dynamic(() => import("./sales-bars").then((m) => m.SalesBars), {
  ssr: false,
  // The same height as the chart: nothing jumps when it arrives.
  loading: () => <div className="h-64 w-full animate-pulse rounded-xl bg-card-2" />,
});

/** Horizontal bars as plain HTML (lighter than a chart, reads well in Arabic). */
export function RankBars({ rows }: { rows: { label: string; value: number; sub?: string }[] }) {
  const { money } = useFmt();
  const max = Math.max(1, ...rows.map((r) => r.value));
  return (
    <ul className="space-y-3">
      {rows.map((r) => (
        <li key={r.label}>
          <div className="mb-1 flex justify-between gap-2 text-sm">
            <span className="truncate">{r.label}</span>
            <span className="num shrink-0 font-medium">{money(r.value)}</span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-line">
            <div className="h-full rounded-full bg-primary" style={{ width: `${(r.value / max) * 100}%` }} />
          </div>
          {r.sub && <p className="mt-0.5 text-xs text-muted">{r.sub}</p>}
        </li>
      ))}
    </ul>
  );
}
