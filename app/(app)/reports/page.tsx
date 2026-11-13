"use client";

import { RatingsReport } from "@/components/ratings-report";

import { useRemembered } from "@/lib/remember";

import Link from "next/link";
import { useState } from "react";
import { Download } from "lucide-react";
import { RankBars } from "@/components/charts";
import { DebtAgeing } from "@/components/debt-ageing";
import { useApp } from "@/components/shell";
import { inWarehouse, useWarehouseFilter } from "@/components/warehouse-filter";
import { BatchStatusBadge } from "@/components/status";
import { Button, Card, CardHeader, DataTable, Empty, GoIcon, Input, LimitBar, LoadingRows, Money, PageHeader, Segmented, Stat, type Column } from "@/components/ui";
import { api, type SalesGroup } from "@/lib/api";
import type { SalesRow } from "@/lib/api/types";
import { useFmt } from "@/lib/i18n";
import { useLoad } from "@/lib/use-load";
import { downloadCsv, today } from "@/lib/utils";

type Tab = "daily" | "sales" | "slow" | "expiry" | "debts" | "ageing" | "ratings";

export default function ReportsPage() {
  const { tr } = useFmt();
  const { user } = useApp();
  const stockOnly = user.role === "warehouse";
  const [tab, setTab] = useRemembered<Tab>("reports:tab", stockOnly ? "expiry" : "daily");
  const tabs: { value: Tab; label: string }[] = [
    ...(!stockOnly
      ? [
          { value: "daily" as Tab, label: tr("المبيعات اليومية", "Daily sales") },
          { value: "sales" as Tab, label: tr("المبيعات والأرباح", "Sales and profit") },
          { value: "debts" as Tab, label: tr("الديون", "Debts") },
          { value: "ageing" as Tab, label: tr("أعمار الديون", "Debt ageing") },
          { value: "ratings" as Tab, label: tr("تقييم التوصيل", "Delivery ratings") },
        ]
      : []),
    { value: "slow", label: tr("المواد الراكدة", "Slow-moving") },
    { value: "expiry", label: tr("الصلاحية", "Expiry") },
  ];
  return (
    <>
      <PageHeader title={tr("التقارير", "Reports")} />
      <Segmented value={tab} onChange={setTab} options={tabs} className="mb-4" />
      {tab === "daily" && <Daily />}
      {tab === "sales" && <Sales />}
      {tab === "slow" && <Slow />}
      {tab === "expiry" && <Expiry />}
      {tab === "debts" && <Debts />}
      {tab === "ageing" && <DebtAgeing />}
      {tab === "ratings" && <RatingsReport />}
    </>
  );
}

function Daily() {
  const { tr, name } = useFmt();
  const [date, setDate] = useState(today());
  const wh = useWarehouseFilter();
  const d = useLoad(() => api.dailySales(date, wh), [date, wh]);
  const x = d.data;
  return (
    <div className="space-y-4">
      <div className="flex items-end gap-2">
        <label className="text-xs text-muted">
          {tr("اليوم", "Day")}
          <Input type="date" value={date} max={today()} onChange={(e) => setDate(e.target.value)} className="mt-1 w-44" />
        </label>
      </div>
      {!x ? (
        <LoadingRows rows={3} />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Stat label={tr("المبيعات", "Sales")} value={<Money value={x.sales} />} href="/invoices" />
            <Stat label={tr("عدد الفواتير", "Invoices")} value={x.invoices} href="/invoices" />
            <Stat label={tr("المقبوض", "Collected")} value={<Money value={x.collected} />} href="/payments" />
            <Stat label={tr("المرتجعات", "Returns")} value={<Money value={x.returns} />} href="/returns" />
          </div>
          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader title={tr("حسب المندوب", "By rep")} />
              <div className="p-4">
                {x.by_rep.length ? (
                  <RankBars rows={x.by_rep.map((r) => ({ label: r.label, value: r.sales, sub: tr(`${r.invoices} فاتورة`, `${r.invoices} invoices`) }))} />
                ) : (
                  <Empty title={tr("لا مبيعات", "No sales")} />
                )}
              </div>
            </Card>
            <Card>
              <CardHeader title={tr("حسب المخزن", "By warehouse")} />
              <div className="p-4">
                {x.by_warehouse.length ? (
                  <RankBars rows={x.by_warehouse.map((r) => ({ label: name({ name: r.label, name_en: r.label_en }), value: r.sales }))} />
                ) : (
                  <Empty title={tr("لا مبيعات", "No sales")} />
                )}
              </div>
            </Card>
          </div>
        </>
      )}
    </div>
  );
}

function Sales() {
  const { tr, name, num } = useFmt();
  const { user } = useApp();
  const [group, setGroup] = useRemembered<SalesGroup>("reports:group", "item");
  const [from, setFrom] = useRemembered("reports:from", today(-29));
  const [to, setTo] = useRemembered("reports:to", today());
  const wh = useWarehouseFilter();
  const rows = useLoad(() => api.salesReport(group, from, to, wh), [group, from, to, wh]);
  const showProfit = user.role === "manager" || user.role === "accountant";
  const data = rows.data ?? [];
  const sum = (k: "sales" | "returns" | "profit" | "invoices") => data.reduce((s, r) => s + (r[k] ?? 0), 0);
  const columns: Column<SalesRow>[] = [
    { key: "l", head: tr("الاسم", "Name"), cell: (r) => <span className="font-medium">{name({ name: r.label, name_en: r.label_en })}</span> },
    { key: "i", head: group === "item" ? tr("مرات البيع", "Times sold") : tr("الفواتير", "Invoices"), cell: (r) => <span className="num">{num(r.invoices)}</span>, align: "center" },
    { key: "s", head: tr("المبيعات", "Sales"), cell: (r) => <Money value={r.sales} />, align: "end" },
    { key: "r", head: tr("المرتجعات", "Returns"), cell: (r) => (r.returns ? <Money value={-r.returns} className="text-danger" /> : "-"), align: "end" },
    { key: "n", head: tr("الصافي", "Net"), cell: (r) => <Money value={r.sales - r.returns} className="font-semibold" />, align: "end" },
    ...(showProfit
      ? [
          { key: "p", head: tr("الربح", "Profit"), cell: (r: SalesRow) => <Money value={r.profit} className="text-success" />, align: "end" as const },
          {
            key: "m",
            head: tr("الهامش", "Margin"),
            cell: (r: SalesRow) => <span className="num text-muted">{r.sales - r.returns > 0 ? Math.round(((r.profit ?? 0) / (r.sales - r.returns)) * 100) : 0}%</span>,
            align: "end" as const,
          },
        ]
      : []),
  ];
  return (
    <Card>
      <div className="flex flex-col gap-3 border-b border-line p-3 xl:flex-row xl:items-end xl:justify-between">
        <Segmented
          value={group}
          onChange={setGroup}
          options={[
            { value: "item", label: tr("حسب المادة", "By item") },
            { value: "rep", label: tr("حسب المندوب", "By rep") },
            { value: "warehouse", label: tr("حسب المخزن", "By warehouse") },
            { value: "customer", label: tr("حسب الزبون", "By customer") },
          ]}
        />
        <div className="flex flex-wrap items-end gap-2">
          <label className="text-xs text-muted">
            {tr("من", "From")}
            <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="mt-1 w-40" />
          </label>
          <label className="text-xs text-muted">
            {tr("إلى", "To")}
            <Input type="date" value={to} max={today()} onChange={(e) => setTo(e.target.value)} className="mt-1 w-40" />
          </label>
          <Button
            onClick={() =>
              downloadCsv(`sales-${group}-${from}-${to}`, [
                [tr("الاسم", "Name"), tr("الفواتير", "Invoices"), tr("المبيعات", "Sales"), tr("المرتجعات", "Returns"), ...(showProfit ? [tr("الربح", "Profit")] : [])],
                ...data.map((r) => [name({ name: r.label, name_en: r.label_en }), r.invoices, r.sales, r.returns, ...(showProfit ? [r.profit ?? 0] : [])]),
              ])
            }
          >
            <Download className="size-4" /> Excel
          </Button>
        </div>
      </div>
      {showProfit && data.length > 0 && (
        <div className="grid grid-cols-2 gap-3 border-b border-line p-3 lg:grid-cols-4">
          <Stat label={tr("المبيعات", "Sales")} value={<Money value={sum("sales")} />} />
          <Stat label={tr("المرتجعات", "Returns")} value={<Money value={sum("returns")} />} />
          <Stat label={tr("الربح الحقيقي", "Real profit")} value={<Money value={sum("profit")} />} hint={tr("حسب سعر شراء الدفعة المباعة", "By the cost of the batch sold")} tone="success" />
          <Stat label={tr("الهامش", "Margin")} value={`${sum("sales") - sum("returns") > 0 ? Math.round((sum("profit") / (sum("sales") - sum("returns"))) * 100) : 0}%`} />
        </div>
      )}
      {rows.state.status === "loading" ? (
        <LoadingRows />
      ) : (
        <DataTable
          rows={data}
          columns={columns}
          rowKey={(r) => r.key}
          onRowHref={(r) => (group === "item" ? `/items/${r.key}` : group === "customer" ? `/customers/${r.key}` : undefined)}
          empty={<Empty title={tr("لا توجد مبيعات في هذه الفترة", "No sales in this period")} />}
        />
      )}
    </Card>
  );
}

function Slow() {
  const { tr, name, qty, date } = useFmt();
  const { lookups, itemById } = useApp();
  const [days, setDays] = useState(lookups.settings.slow_moving_days);
  const whS = useWarehouseFilter();
  const rows = useLoad(() => api.slowMoving(days, whS), [days, whS]);
  return (
    <Card>
      <CardHeader
        title={tr("المواد الراكدة", "Slow-moving items")}
        subtitle={tr("مواد لديها مخزون ولم تُبع منذ مدة", "Items in stock that haven't sold for a while")}
        action={<Segmented value={String(days)} onChange={(v) => setDays(Number(v))} options={[14, 21, 30, 60].map((d) => ({ value: String(d), label: tr(`${d} يوم`, `${d} days`) }))} />}
      />
      {rows.state.status === "loading" ? (
        <LoadingRows rows={3} />
      ) : (
        <DataTable
          rows={rows.data ?? []}
          rowKey={(r) => r.item_id}
          onRowHref={(r) => `/items/${r.item_id}`}
          columns={[
            { key: "n", head: tr("المادة", "Item"), cell: (r) => name(itemById.get(r.item_id)) },
            { key: "l", head: tr("آخر بيع", "Last sale"), cell: (r) => (r.last_sale ? date(r.last_sale) : tr("لم تُبع", "Never")) },
            { key: "d", head: tr("بدون حركة", "Idle for"), cell: (r) => <span className="font-semibold text-warning">{r.days === null ? "—" : tr(`${r.days} يوم`, `${r.days} days`)}</span> },
            { key: "s", head: tr("المخزون", "Stock"), cell: (r) => qty(r.stock, itemById.get(r.item_id)?.pieces_per_carton ?? 1, itemById.get(r.item_id)) },
          ]}
          empty={<Empty title={tr("كل المواد تتحرك", "Everything is selling")} />}
        />
      )}
    </Card>
  );
}

function Expiry() {
  const { tr, name, qty } = useFmt();
  const { lookups, itemById } = useApp();
  const [days, setDays] = useState(lookups.settings.near_expiry_days);
  const whE = useWarehouseFilter();
  const rows = useLoad(() => api.nearExpiry(days), [days]);
  return (
    <Card>
      <CardHeader
        title={tr("المواد القريبة من الانتهاء والمنتهية", "Expiring and expired stock")}
        action={<Segmented value={String(days)} onChange={(v) => setDays(Number(v))} options={[15, 30, 60, 90].map((d) => ({ value: String(d), label: tr(`${d} يوم`, `${d} days`) }))} />}
      />
      {rows.state.status === "loading" ? (
        <LoadingRows rows={3} />
      ) : (
        <DataTable
          rows={(rows.data ?? []).filter((r) => inWarehouse(whE, r.batch.warehouse_id))}
          rowKey={(r) => r.batch.id}
          onRowHref={(r) => `/items/${r.batch.item_id}`}
          columns={[
            { key: "n", head: tr("المادة", "Item"), cell: (r) => name(itemById.get(r.batch.item_id)) },
            { key: "w", head: tr("المخزن", "Warehouse"), cell: (r) => name(lookups.warehouses.find((w) => w.id === r.batch.warehouse_id)) },
            { key: "e", head: tr("الصلاحية", "Expiry"), cell: (r) => <span className="num">{r.batch.expiry_date}</span> },
            { key: "q", head: tr("الكمية", "Qty"), cell: (r) => qty(r.batch.qty_left, itemById.get(r.batch.item_id)?.pieces_per_carton ?? 1, itemById.get(r.batch.item_id)) },
            { key: "s", head: tr("الحالة", "Status"), cell: (r) => <BatchStatusBadge status={r.batch.status} days={r.days_left} /> },
            {
              key: "c",
              head: tr("قيمة الشراء", "Cost value"),
              cell: (r) => <Money value={r.batch.purchase_price !== undefined ? r.batch.purchase_price * r.batch.qty_left : undefined} />,
              align: "end",
            },
          ]}
          empty={<Empty title={tr("لا شيء قريب الانتهاء", "Nothing expiring")} />}
        />
      )}
    </Card>
  );
}

function Debts() {
  const { tr, ago } = useFmt();
  const { lookups } = useApp();
  const rows = useLoad(() => api.debts(), []);
  const total = (rows.data ?? []).reduce((s, r) => s + (r.customer.balance ?? 0), 0);
  return (
    <Card>
      <CardHeader
        title={tr("ديون الزبائن", "Customer debts")}
        subtitle={
          <span>
            {tr("المجموع", "Total")} <Money value={total} className="font-semibold text-text" />
          </span>
        }
      />
      {rows.state.status === "loading" ? (
        <LoadingRows />
      ) : (
        <DataTable
          rows={rows.data ?? []}
          rowKey={(r) => r.customer.id}
          onRowHref={(r) => `/customers/${r.customer.id}`}
          columns={[
            { key: "n", head: tr("الزبون", "Customer"), cell: (r) => r.customer.name },
            { key: "r", head: tr("المندوب", "Rep"), cell: (r) => lookups.reps.find((x) => x.id === r.customer.rep_id)?.name },
            { key: "o", head: tr("فواتير مفتوحة", "Open invoices"), cell: (r) => <span className="num">{r.open_invoices}</span>, align: "center" },
            { key: "a", head: tr("أقدم فاتورة", "Oldest"), cell: (r) => (r.oldest_open ? ago(r.oldest_open) : "-") },
            {
              key: "b",
              head: tr("الدين / السقف", "Debt / limit"),
              cell: (r) => (
                <div className="min-w-44">
                  <div className="mb-1 flex justify-between text-xs">
                    <Money value={r.customer.balance} className="font-semibold" />
                    <Money value={r.customer.debt_limit} className="text-muted" />
                  </div>
                  <LimitBar balance={r.customer.balance ?? 0} limit={r.customer.debt_limit ?? 0} />
                </div>
              ),
            },
          ]}
          empty={<Empty title={tr("لا توجد ديون", "No debts")} />}
        />
      )}
      <Link
        href="/customers"
        className="flex items-center justify-between border-t border-line px-4 py-2.5 text-sm font-medium text-muted transition-colors hover:bg-card-2 hover:text-text active:bg-primary-soft"
      >
        {tr("كل الزبائن", "All customers")}
        <GoIcon />
      </Link>
    </Card>
  );
}
