"use client";

// The account file's chart (recharts): in its own file, so the chart library loads only with it.
import { Bar, CartesianGrid, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { useFmt } from "@/lib/i18n";
import type { MonthRow } from "./accounts";

const short = (n: number) => (n >= 1_000_000 ? `${(n / 1_000_000).toFixed(1)}M` : n >= 1000 ? `${Math.round(n / 1000)}K` : String(n));

export function MoneyPlot({ rows, data, onSelect }: { rows: MonthRow[]; data: (MonthRow & { mark: number })[]; onSelect: (key: string) => void }) {
  const { tr, money, lang } = useFmt();
  return (
    <div className="h-56 w-full" dir="ltr">
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart
          data={data}
          margin={{ top: 10, right: 8, left: 0, bottom: 0 }}
          onClick={(e) => {
            // Empty when the mouse didn't hover a month first (e.g. a tap on a phone): then do nothing,
            // because Number(null) would be 0 and wrongly pick the first month.
            const raw = e?.activeTooltipIndex;
            if (raw === null || raw === undefined) return;
            const i = Number(raw);
            if (Number.isFinite(i) && rows[i]) onSelect(rows[i].key);
          }}
        >
          <defs>
            <linearGradient id="acc-mark" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--success)" stopOpacity={0.9} />
              <stop offset="100%" stopColor="var(--success)" stopOpacity={0.1} />
            </linearGradient>
          </defs>
          <CartesianGrid vertical={false} stroke="var(--line)" strokeDasharray="4 4" />
          <XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fill: "var(--muted)", fontSize: 12 }} reversed={lang === "ar"} />
          <YAxis tickFormatter={short} tickLine={false} axisLine={false} width={44} tick={{ fill: "var(--muted)", fontSize: 12 }} orientation={lang === "ar" ? "right" : "left"} />
          <Tooltip
            cursor={{ fill: "var(--card-2)" }}
            contentStyle={{ background: "var(--card)", border: "1px solid var(--line)", borderRadius: 12, fontSize: 12, direction: lang === "ar" ? "rtl" : "ltr" }}
            labelStyle={{ color: "var(--text)", fontWeight: 600 }}
            formatter={(v, n) => [money(Number(v)), n === "bought" ? tr("المشتريات", "Bought") : n === "paid" ? tr("التسديدات", "Paid") : ""]}
            filterNull
          />
          <Bar dataKey="mark" fill="url(#acc-mark)" radius={[10, 10, 0, 0]} maxBarSize={44} isAnimationActive tooltipType="none" />
          <Line type="monotone" dataKey="bought" stroke="var(--warning)" strokeWidth={2.5} dot={false} activeDot={{ r: 5 }} />
          <Line type="monotone" dataKey="paid" stroke="var(--success)" strokeWidth={2.5} dot={{ r: 3, fill: "var(--success)" }} activeDot={{ r: 6 }} />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
