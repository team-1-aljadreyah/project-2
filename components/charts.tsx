"use client";

// Charts. Colors come from the design tokens, so they follow day/night mode.
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { useFmt } from "@/lib/i18n";

const short = (n: number) => (n >= 1_000_000 ? `${(n / 1_000_000).toFixed(n >= 10_000_000 ? 0 : 1)}M` : n >= 1000 ? `${Math.round(n / 1000)}K` : String(n));

export function SalesBars({ data, keys }: { data: Record<string, string | number>[]; keys: { key: string; label: string; color: string }[] }) {
  const { money, lang } = useFmt();
  return (
    <div className="h-64 w-full" dir="ltr">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }} barGap={2}>
          <CartesianGrid vertical={false} stroke="var(--line)" />
          <XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fill: "var(--muted)", fontSize: 12 }} reversed={lang === "ar"} />
          <YAxis tickFormatter={short} tickLine={false} axisLine={false} width={44} tick={{ fill: "var(--muted)", fontSize: 12 }} orientation={lang === "ar" ? "right" : "left"} />
          <Tooltip
            cursor={{ fill: "var(--card-2)" }}
            contentStyle={{ background: "var(--card)", border: "1px solid var(--line)", borderRadius: 12, fontSize: 12, direction: lang === "ar" ? "rtl" : "ltr" }}
            labelStyle={{ color: "var(--text)", fontWeight: 600 }}
            formatter={(v) => money(Number(v))}
          />
          <Legend wrapperStyle={{ fontSize: 12 }} />
          {keys.map((k) => (
            <Bar key={k.key} dataKey={k.key} name={k.label} fill={k.color} radius={[6, 6, 0, 0]} maxBarSize={28} />
          ))}
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

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
