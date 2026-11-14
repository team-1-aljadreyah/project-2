"use client";

// Pieces of the accountant's "account file" page, after the "Accountity" design Yasser chose:
// the customer picker, the colored invoice tiles, the purchases-vs-payments chart and the payments list.
import Link from "next/link";
import { useState } from "react";
import dynamic from "next/dynamic";
import { motion } from "motion/react";
import { ArrowUpLeft, ArrowUpRight, Banknote, Check, ChevronDown, CreditCard, Landmark, Search, Undo2 } from "lucide-react";
import { methodLabel } from "@/components/pay-method";
import { netPaid, type Customer, type Invoice, type Payment } from "@/lib/api/types";
import { useFmt } from "@/lib/i18n";
import { cn, matches, today } from "@/lib/utils";

// ---------- Customer picker ----------

export function CustomerPicker({ customers, value, onChange }: { customers: Customer[]; value?: Customer; onChange: (id: number) => void }) {
  const { tr, money } = useFmt();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  // Most debt first: the accountant usually wants those.
  const list = customers.filter((c) => !c.pending && matches(q, c.name, c.owner_name, c.area, c.phone)).sort((a, b) => (b.balance ?? 0) - (a.balance ?? 0));
  return (
    <div className="relative">
      <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} className="flex h-10 w-full items-center gap-2 rounded-xl border border-line-strong bg-card px-3 text-sm font-semibold hover:bg-card-2 sm:w-72">
        <Search className="size-4 text-faint" />
        <span className="truncate">{value?.name ?? tr("اختر الزبون", "Choose the customer")}</span>
        <ChevronDown className={cn("ms-auto size-4 text-faint transition", open && "rotate-180")} />
      </button>
      {open && (
        <>
          <button type="button" aria-label={tr("إغلاق", "Close")} className="fixed inset-0 z-30 cursor-default" onClick={() => setOpen(false)} />
          <motion.div
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            className="absolute end-0 z-40 mt-2 w-[min(22rem,calc(100vw-2rem))] overflow-hidden rounded-2xl border border-line bg-card shadow-xl"
          >
            <div className="border-b border-line p-2">
              <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder={tr("اسم المحل، صاحبه أو المنطقة", "Shop, owner or area")} className="h-10 w-full rounded-lg bg-card-2 px-3 text-sm outline-none" />
            </div>
            <ul className="max-h-80 overflow-y-auto p-1">
              {list.map((c) => (
                <li key={c.id}>
                  <button
                    type="button"
                    onClick={() => {
                      onChange(c.id);
                      setOpen(false);
                      setQ("");
                    }}
                    className={cn("flex w-full items-center gap-2 rounded-lg px-3 py-2 text-start text-sm hover:bg-card-2", c.id === value?.id && "bg-primary-soft")}
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-semibold">{c.name}</span>
                      <span className="block truncate text-xs text-muted">{c.area}</span>
                    </span>
                    <span className={cn("num shrink-0 text-xs font-semibold", (c.balance ?? 0) > (c.debt_limit ?? Infinity) ? "text-danger" : "text-muted")}>{money(c.balance ?? 0)}</span>
                    {c.id === value?.id && <Check className="size-4 shrink-0 text-primary-ink" />}
                  </button>
                </li>
              ))}
              {!list.length && <li className="p-4 text-center text-sm text-muted">{tr("لا يوجد زبون بهذا الاسم", "No customer by that name")}</li>}
            </ul>
          </motion.div>
        </>
      )}
    </div>
  );
}

// ---------- Invoice tiles ----------

/** Like the design's colored project tiles: open = graphite, partly paid = orange, paid = plain. */
const tileStyle = {
  open: "bg-primary text-on-primary border-transparent",
  partial: "bg-action text-on-action border-transparent",
  paid: "bg-card text-text border-line",
} as const;

export function InvoiceTiles({ invoices }: { invoices: Invoice[] }) {
  const { tr, money, date, lang } = useFmt();
  const Arrow = lang === "ar" ? ArrowUpLeft : ArrowUpRight;
  const label = { open: tr("غير مسددة", "Unpaid"), partial: tr("مسددة جزئياً", "Partly paid"), paid: tr("مسددة", "Paid") };
  const t = today();
  if (!invoices.length) return <p className="rounded-2xl border border-dashed border-line-strong p-8 text-center text-sm text-muted">{tr("لا توجد فواتير", "No invoices")}</p>;
  return (
    <div className="grid grid-cols-2 gap-2 sm:gap-3 xl:grid-cols-3">
      {invoices.map((inv, i) => {
        const days = Math.round((new Date(t).getTime() - new Date(inv.date.slice(0, 10)).getTime()) / 86_400_000);
        const late = inv.status !== "paid" && days > 30;
        const solid = inv.status !== "paid";
        return (
          <motion.div key={inv.id} initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05, type: "spring", stiffness: 260, damping: 24 }}>
            <Link href={`/invoices/${inv.id}`} className={cn("group flex h-full flex-col rounded-2xl border p-3 transition sm:p-4 hover:-translate-y-0.5 hover:shadow-lg", tileStyle[inv.status])}>
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className={cn("num text-[11px]", solid ? "opacity-90" : "text-muted")}>{date(inv.date)}</p>
                  <p className="num mt-0.5 text-start text-xs font-bold break-all sm:text-sm" dir="ltr">
                    {inv.number}
                  </p>
                  <p className={cn("text-xs", solid ? "opacity-75" : "text-muted")}>
                    {inv.lines.length} {tr("مواد", "items")}
                  </p>
                </div>
                <span className={cn("flex size-8 shrink-0 items-center justify-center rounded-full transition group-hover:scale-110", solid ? "bg-current/15" : "bg-card-2")}>
                  <Arrow className="size-4" />
                </span>
              </div>
              <div className="mt-3 flex flex-wrap items-end justify-between gap-1.5 sm:mt-4">
                <div>
                  <p className="num text-base font-bold sm:text-xl">{money(inv.total)}</p>
                  {inv.status === "partial" && (
                    <p className="num text-[11px] opacity-80">
                      {tr("الباقي", "Left")} {money(inv.remaining)}
                    </p>
                  )}
                </div>
                <span
                  className={cn(
                    "shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold",
                    late ? "bg-danger text-white dark:text-[#0e1013]" : solid ? "bg-current/15" : "bg-success-soft text-success",
                  )}
                >
                  {late ? tr(`متأخرة ${days} يوم`, `${days} days late`) : label[inv.status]}
                </span>
              </div>
            </Link>
          </motion.div>
        );
      })}
    </div>
  );
}

// ---------- Purchases vs payments chart ----------

export interface MonthRow {
  key: string; // YYYY-MM
  label: string;
  bought: number;
  paid: number;
}

/**
 * Month by month (oldest first): what the customer bought (invoices less returns) and what it paid.
 * It starts at the customer's first invoice or payment (at least 3 months, at most 6), so a new
 * customer doesn't get a chart that is mostly empty months.
 */
export function monthRows(invoices: Invoice[], payments: Payment[], lang: "ar" | "en"): MonthRow[] {
  const f = new Intl.DateTimeFormat(lang === "ar" ? "ar-IQ" : "en-GB", { month: "short" });
  const [y, m] = today().split("-").map(Number);
  const first = [...invoices.map((x) => x.date), ...payments.map((p) => p.date)].sort()[0];
  const since = first ? (y - Number(first.slice(0, 4))) * 12 + (m - Number(first.slice(5, 7))) + 1 : 3;
  const n = Math.min(6, Math.max(3, since));
  return Array.from({ length: n }, (_, i) => {
    const d = new Date(y, m - 1 - (n - 1 - i), 1);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    return {
      key,
      label: f.format(d),
      bought: invoices.filter((x) => x.date.startsWith(key)).reduce((s, x) => s + x.total - x.returned, 0),
      paid: payments.filter((p) => p.date.startsWith(key)).reduce((s, p) => s + netPaid(p), 0),
    };
  });
}


/** Like the design's "income stage": two lines, and the chosen month stands out as a bar with a bubble. */
export function MoneyChart({ rows, selected, onSelect }: { rows: MonthRow[]; selected: string; onSelect: (key: string) => void }) {
  const { tr, money } = useFmt();
  const data = rows.map((r) => ({ ...r, mark: r.key === selected ? Math.max(r.bought, r.paid) : 0 }));
  const sel = rows.find((r) => r.key === selected);
  return (
    <div>
      <div className="mb-2 flex flex-wrap items-center gap-3 text-xs text-muted">
        <span className="flex items-center gap-1.5">
          <span className="h-1 w-4 rounded-full bg-[var(--warning)]" /> {tr("المشتريات", "Bought")}
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-1 w-4 rounded-full bg-success" /> {tr("التسديدات", "Paid")}
        </span>
        {sel && (
          <span className="ms-auto rounded-full bg-primary px-2.5 py-0.5 font-semibold text-on-primary">
            {sel.label}: {tr("سدّد", "paid")} <b className="num">{money(sel.paid)}</b>
          </span>
        )}
      </div>
      <MoneyPlot rows={rows} data={data} onSelect={onSelect} />
      {/* The months as buttons too: works with a tap on a phone and with the keyboard */}
      <div className="mt-2 flex flex-wrap justify-center gap-1.5">
        {rows.map((r) => (
          <button
            key={r.key}
            type="button"
            onClick={() => onSelect(r.key)}
            aria-pressed={r.key === selected}
            className={cn("rounded-full px-3 py-1 text-xs font-semibold transition", r.key === selected ? "bg-primary text-on-primary" : "bg-card-2 text-muted hover:text-text")}
          >
            {r.label}
          </button>
        ))}
      </div>
    </div>
  );
}

// The chart itself loads on its own (money-plot.tsx), with a same-size placeholder until then.
const MoneyPlot = dynamic(() => import("./money-plot").then((m) => m.MoneyPlot), {
  ssr: false,
  loading: () => <div className="h-56 w-full animate-pulse rounded-xl bg-card-2" />,
});

// ---------- Payments list ----------

export function PaymentList({ payments }: { payments: Payment[] }) {
  const { tr, money, date, time } = useFmt();
  if (!payments.length) return <p className="rounded-2xl border border-dashed border-line-strong p-6 text-center text-sm text-muted">{tr("لا توجد تسديدات", "No payments")}</p>;
  return (
    <ul className="space-y-2">
      {payments.map((p) => {
        const Icon = p.reversal_of ? Undo2 : p.method === "online" ? CreditCard : p.method === "cash" ? Banknote : Landmark;
        const off = p.reversed || !!p.reversal_of;
        return (
          <li key={p.id}>
            <Link href={`/payments/${p.id}`} className="flex items-center gap-3 rounded-2xl border border-line bg-card-2/60 p-3 transition hover:border-line-strong hover:bg-card-2">
              <span className={cn("flex size-9 shrink-0 items-center justify-center rounded-xl", off ? "bg-danger-soft text-danger" : "bg-success-soft text-success")}>
                <Icon className="size-4" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold">
                  <span className="num" dir="ltr">
                    {p.number}
                  </span>{" "}
                  · {p.reversal_of ? tr("عملية عكسية", "Reversal") : methodLabel(p.method, tr, p.gateway?.provider)}
                </p>
                <p className={cn("num text-base font-bold", off && "text-muted line-through")}>{money(Math.abs(p.amount))}</p>
              </div>
              <div className="flex shrink-0 flex-col items-end gap-1">
                <span className="num rounded-md bg-card px-1.5 py-0.5 text-[10px] font-semibold text-muted">{time(p.date)}</span>
                <span className="num rounded-md bg-card px-1.5 py-0.5 text-[10px] font-semibold text-muted">{date(p.date)}</span>
              </div>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
