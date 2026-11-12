"use client";

// «أعمار الديون» (debt ageing): what each shop still owes, split by how old the unpaid invoices are
// (0–30, 31–60, 61–90, over 90 days). Old money is the risky money: those shops come first, and a WhatsApp
// reminder goes out in one tap. Worked out from the open invoices (what is left on each one).
import { Download, MessageCircle } from "lucide-react";
import { openWhatsApp } from "@/components/share";
import { useApp } from "@/components/shell";
import { Button, Card, CardHeader, DataTable, Empty, LoadingRows, Money, type Column } from "@/components/ui";
import { inWarehouse, useWarehouseFilter } from "@/components/warehouse-filter";
import { api } from "@/lib/api";
import type { Customer, Invoice } from "@/lib/api/types";
import { useFmt } from "@/lib/i18n";
import { useBrand } from "@/lib/site";
import { useLoad } from "@/lib/use-load";
import { cn, downloadCsv } from "@/lib/utils";

const BUCKETS = [
  { key: "b0", max: 30, ar: "حتى 30 يوماً", en: "Up to 30 days", color: "#16a34a" },
  { key: "b30", max: 60, ar: "31–60 يوماً", en: "31–60 days", color: "#ca8a04" },
  { key: "b60", max: 90, ar: "61–90 يوماً", en: "61–90 days", color: "#ea580c" },
  { key: "b90", max: Infinity, ar: "أكثر من 90 يوماً", en: "Over 90 days", color: "#dc2626" },
] as const;
type BucketKey = (typeof BUCKETS)[number]["key"];

interface Row {
  customer: Customer;
  buckets: Record<BucketKey, number>;
  total: number;
  oldestDays: number;
  invoices: number;
}

const daysSince = (iso: string, now: number) => Math.max(0, Math.floor((now - new Date(iso).getTime()) / 86_400_000));

/** Each shop's unpaid money by age. Exported for tests and other pages. */
export function ageDebts(invoices: Invoice[], customers: Customer[], now = Date.now()): Row[] {
  const byCustomer = new Map<number, Row>();
  for (const inv of invoices) {
    if (inv.remaining <= 0) continue;
    const c = customers.find((x) => x.id === inv.customer_id);
    if (!c) continue;
    const row = byCustomer.get(c.id) ?? { customer: c, buckets: { b0: 0, b30: 0, b60: 0, b90: 0 }, total: 0, oldestDays: 0, invoices: 0 };
    const days = daysSince(inv.date, now);
    const b = BUCKETS.find((x) => days <= x.max)!;
    row.buckets[b.key] += inv.remaining;
    row.total += inv.remaining;
    row.invoices++;
    row.oldestDays = Math.max(row.oldestDays, days);
    byCustomer.set(c.id, row);
  }
  // The riskiest first: the most money over 90 days, then 61–90, then the total.
  return [...byCustomer.values()].sort((a, b) => b.buckets.b90 - a.buckets.b90 || b.buckets.b60 - a.buckets.b60 || b.total - a.total);
}

export function DebtAgeing() {
  const { tr, money, num } = useFmt();
  const { lookups } = useApp();
  const brand = useBrand();
  const wh = useWarehouseFilter();
  const invoices = useLoad(() => api.listInvoices(), []);
  const customers = useLoad(() => api.listCustomers(), []);
  const loading = !invoices.data || !customers.data;
  const rows = loading ? [] : ageDebts(invoices.data!.filter((i) => inWarehouse(wh, i.warehouse_id)), customers.data!);
  const totals = BUCKETS.map((b) => ({ ...b, sum: rows.reduce((s, r) => s + r.buckets[b.key], 0) }));
  const all = totals.reduce((s, t) => s + t.sum, 0);

  function remind(r: Row) {
    const old = r.buckets.b60 + r.buckets.b90;
    const text = [
      tr(`السلام عليكم ${r.customer.owner_name}،`, `Hello ${r.customer.owner_name},`),
      tr(`نذكّركم بأن على ${r.customer.name} مبلغ ${money(r.total)}`, `a reminder that ${r.customer.name} owes ${money(r.total)}`) +
        (old > 0 ? tr(`، منها ${money(old)} منذ أكثر من 60 يوماً.`, `, of which ${money(old)} is over 60 days old.`) : "."),
      tr(`نرجو التسديد في أقرب وقت. شكراً لتعاملكم مع ${brand.company}.`, `Please pay at your earliest. Thank you, ${brand.company}.`),
    ].join("\n");
    openWhatsApp(text, r.customer.phone);
  }

  function exportCsv() {
    downloadCsv("debt-ageing.csv", [
      [tr("الزبون", "Customer"), tr("المندوب", "Rep"), ...BUCKETS.map((b) => tr(b.ar, b.en)), tr("المجموع", "Total"), tr("أقدم فاتورة (يوم)", "Oldest (days)")],
      ...rows.map((r) => [r.customer.name, lookups.reps.find((x) => x.id === r.customer.rep_id)?.name ?? "", ...BUCKETS.map((b) => r.buckets[b.key]), r.total, r.oldestDays]),
    ]);
  }

  const columns: Column<Row>[] = [
    { key: "n", head: tr("الزبون", "Customer"), cell: (r) => <span className="font-medium">{r.customer.name}</span>, sort: (r) => r.customer.name },
    { key: "r", head: tr("المندوب", "Rep"), cell: (r) => lookups.reps.find((x) => x.id === r.customer.rep_id)?.name ?? "-" },
    ...BUCKETS.map(
      (b): Column<Row> => ({
        key: b.key,
        head: tr(b.ar, b.en),
        cell: (r) => (r.buckets[b.key] ? <Money value={r.buckets[b.key]} className={cn(b.key === "b90" && "font-bold text-danger", b.key === "b60" && "font-semibold text-warning")} /> : <span className="text-faint">-</span>),
        sort: (r) => r.buckets[b.key],
        align: "end",
      }),
    ),
    { key: "t", head: tr("المجموع", "Total"), cell: (r) => <Money value={r.total} className="font-semibold" />, sort: (r) => r.total, align: "end" },
    { key: "d", head: tr("أقدم فاتورة", "Oldest"), cell: (r) => <span className="num">{tr(`${num(r.oldestDays)} يوماً`, `${r.oldestDays} days`)}</span>, sort: (r) => r.oldestDays, align: "center" },
    {
      key: "w",
      head: "",
      noSort: true,
      cell: (r) => (
        <Button size="sm" variant="ghost" onClick={() => remind(r)} aria-label={tr(`ذكّر ${r.customer.name} عبر واتساب`, `Remind ${r.customer.name} on WhatsApp`)}>
          <MessageCircle className="size-4 text-[#25d366]" /> {tr("ذكّره", "Remind")}
        </Button>
      ),
      align: "end",
    },
  ];

  return (
    <div className="space-y-4">
      {/* The four ages: how much, and their share of all the debts (a bar in their colors). */}
      <Card className="p-4">
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {totals.map((t) => (
            <div key={t.key} className="rounded-2xl border border-line p-3">
              <p className="flex items-center gap-2 text-xs text-muted">
                <span className="size-2.5 rounded-full" style={{ background: t.color }} /> {tr(t.ar, t.en)}
              </p>
              <Money value={t.sum} className="mt-1 block text-lg font-bold" />
              <p className="text-xs text-muted">{all ? `${Math.round((t.sum / all) * 100)}%` : "-"}</p>
            </div>
          ))}
        </div>
        <div className="mt-3 flex h-2.5 overflow-hidden rounded-full bg-card-2" aria-hidden>
          {totals.map((t) => (
            <span key={t.key} style={{ width: `${all ? (t.sum / all) * 100 : 0}%`, background: t.color }} />
          ))}
        </div>
      </Card>
      <Card>
        <CardHeader
          title={tr("أعمار الديون حسب الزبون", "Debt ageing by customer")}
          subtitle={tr("الأخطر أولاً: الأكثر مالاً منذ أكثر من 90 يوماً", "Riskiest first: the most money over 90 days")}
          action={
            <Button size="sm" onClick={exportCsv} disabled={!rows.length}>
              <Download className="size-4" /> {tr("تصدير", "Export")}
            </Button>
          }
        />
        {loading ? (
          <LoadingRows />
        ) : (
          <DataTable
            rows={rows}
            columns={columns}
            rowKey={(r) => r.customer.id}
            onRowHref={(r) => `/customers/${r.customer.id}`}
            mobile={(r) => (
              <div className="space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <span className="min-w-0">
                    <span className="block font-semibold">{r.customer.name}</span>
                    <span className="text-xs text-muted">{tr(`أقدم فاتورة: ${num(r.oldestDays)} يوماً`, `Oldest: ${r.oldestDays} days`)}</span>
                  </span>
                  <Money value={r.total} className="shrink-0 font-bold" />
                </div>
                <div className="flex h-2 overflow-hidden rounded-full bg-card-2" aria-hidden>
                  {BUCKETS.map((b) => (
                    <span key={b.key} style={{ width: `${(r.buckets[b.key] / r.total) * 100}%`, background: b.color }} />
                  ))}
                </div>
                {(r.buckets.b60 > 0 || r.buckets.b90 > 0) && (
                  <p className="text-xs font-semibold text-danger">{tr(`فوق 60 يوماً: ${money(r.buckets.b60 + r.buckets.b90)}`, `Over 60 days: ${money(r.buckets.b60 + r.buckets.b90)}`)}</p>
                )}
              </div>
            )}
            empty={<Empty title={tr("لا ديون مفتوحة", "No open debts")} />}
          />
        )}
      </Card>
    </div>
  );
}
