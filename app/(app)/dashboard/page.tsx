"use client";

import Link from "next/link";
import { AlertTriangle, Banknote, Boxes, ClipboardList, PackageX, ShieldAlert, TrendingUp, UserPlus, Wallet } from "lucide-react";
import { RankBars, SalesBars } from "@/components/charts";
import { useApp } from "@/components/shell";
import { UsdRateCard } from "@/components/usd-rate";
import { inWarehouse, useWarehouseFilter } from "@/components/warehouse-filter";
import { OrderStatusBadge } from "@/components/status";
import { Button, Card, CardHeader, ErrorBox, LimitBar, Money, PageHeader, Skeleton, Stat } from "@/components/ui";
import { api } from "@/lib/api";
import { useFmt } from "@/lib/i18n";
import { useLoad } from "@/lib/use-load";
import { today } from "@/lib/utils";

export default function DashboardPage() {
  const { tr, money, date, ago, name } = useFmt();
  const { user, lookups } = useApp();
  const wh = useWarehouseFilter();
  const d = useLoad(() => api.dashboard(wh), [wh]);
  const debts = useLoad(() => api.debts(), []);
  const orders = useLoad(() => api.listOrders(), []);
  const daily = useLoad(() => api.dailySales(today(), wh), [wh]);
  const customers = useLoad(() => api.listCustomers(), []);
  const cName = (id: number) => customers.data?.find((c) => c.id === id)?.name ?? `#${id}`;
  const hour = new Date().getHours();
  const hello = hour < 12 ? tr("صباح الخير", "Good morning") : hour < 17 ? tr("مساء الخير", "Good afternoon") : tr("مساء الخير", "Good evening");

  if (d.state.status === "error") return <ErrorBox error={d.state.error} onRetry={d.reload} />;
  const x = d.data;
  const waiting = (orders.data ?? []).filter((o) => (o.status === "needs_approval" || o.status === "pending") && inWarehouse(wh, o.warehouse_id)).slice(0, 6);

  return (
    <>
      <PageHeader title={`${hello}${tr("، ", ", ")}${user.name.split(" ")[0]}`} subtitle={date(new Date().toISOString())} actions={<Button href="/reports">{tr("كل التقارير", "All reports")}</Button>} />

      {(customers.data ?? []).some((c) => c.pending) && user.role === "manager" && (
        <Link href="/customers" className="mb-4 flex items-center gap-3 rounded-xl border border-action/30 bg-action/10 p-3 text-text">
          <UserPlus className="size-5 shrink-0 text-action" />
          <span className="flex-1 text-sm font-medium">
            {tr(`${(customers.data ?? []).filter((c) => c.pending).length} محل جديد سجّل من الموقع وينتظر موافقتك`, `${(customers.data ?? []).filter((c) => c.pending).length} new shop(s) signed up online and wait for your approval`)}
          </span>
          <span className="text-sm underline">{tr("مراجعة", "Review")}</span>
        </Link>
      )}

      {x && x.needs_approval > 0 && user.role === "manager" && (
        <Link href="/orders" className="mb-4 flex items-center gap-3 rounded-xl border border-warning/30 bg-warning-soft p-3 text-warning">
          <ShieldAlert className="size-5 shrink-0" />
          <span className="flex-1 text-sm font-medium">{tr(`${x.needs_approval} طلب يتجاوز سقف الدين وينتظر موافقتك`, `${x.needs_approval} order(s) over the debt limit wait for your approval`)}</span>
          <span className="text-sm underline">{tr("عرض", "Show")}</span>
        </Link>
      )}

      <UsdRateCard className="mb-4" />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {x ? (
          <>
            <Stat label={tr("مبيعات اليوم", "Sales today")} value={<Money value={x.today_sales} />} hint={tr(`${x.today_invoices} فاتورة`, `${x.today_invoices} invoices`)} icon={<TrendingUp className="size-4" />} tone="primary" />
            <Stat label={tr("المقبوض اليوم", "Collected today")} value={<Money value={x.today_collected} />} icon={<Banknote className="size-4" />} tone="success" href="/payments" />
            <Stat label={tr("مجموع الديون", "Total debt")} value={<Money value={x.total_debt} />} hint={x.over_limit_customers ? tr(`${x.over_limit_customers} زبون فوق السقف`, `${x.over_limit_customers} over limit`) : undefined} icon={<Wallet className="size-4" />} tone="warning" href="/customers" />
            {x.month_profit !== undefined ? (
              <Stat label={tr("ربح الشهر", "Profit this month")} value={<Money value={x.month_profit} />} hint={`${tr("مبيعات", "Sales")} ${money(x.month_sales)}`} icon={<TrendingUp className="size-4" />} tone="success" href="/reports" />
            ) : (
              <Stat label={tr("مبيعات الشهر", "Sales this month")} value={<Money value={x.month_sales} />} />
            )}
          </>
        ) : (
          Array.from({ length: 4 }, (_, i) => <Skeleton key={i} className="h-28" />)
        )}
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {x && (
          <>
            <Stat label={tr("طلبات بانتظار التثبيت", "Orders waiting")} value={x.pending_orders} icon={<ClipboardList className="size-4" />} href="/orders" />
            <Stat label={tr("مواد تحت الحد الأدنى", "Items below minimum")} value={x.low_stock} tone={x.low_stock ? "danger" : undefined} icon={<Boxes className="size-4" />} href="/stock" />
            <Stat label={tr("دفعات قريبة الانتهاء", "Batches expiring soon")} value={x.near_expiry} tone={x.near_expiry ? "warning" : undefined} icon={<AlertTriangle className="size-4" />} href="/stock" />
            <Stat label={tr("دفعات منتهية في المخزن", "Expired batches")} value={x.expired_batches} tone={x.expired_batches ? "danger" : undefined} icon={<PackageX className="size-4" />} href="/stock" />
          </>
        )}
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-[1.6fr_1fr]">
        <Card>
          <CardHeader title={tr("آخر 7 أيام", "Last 7 days")} subtitle={tr("المبيعات مقابل المقبوض", "Sales vs. money collected")} />
          <div className="p-3">
            {x ? (
              <SalesBars
                data={x.last7.map((r) => ({ label: date(r.date).slice(0, 5), sales: r.sales, collected: r.collected }))}
                keys={[
                  { key: "sales", label: tr("المبيعات", "Sales"), color: "var(--primary)" },
                  { key: "collected", label: tr("المقبوض", "Collected"), color: "var(--action)" },
                ]}
              />
            ) : (
              <Skeleton className="h-64" />
            )}
          </div>
        </Card>
        <Card>
          <CardHeader title={tr("مبيعات اليوم حسب المندوب", "Today by rep")} />
          <div className="p-4">
            {daily.data && daily.data.by_rep.length ? (
              <RankBars rows={daily.data.by_rep.map((r) => ({ label: r.label, value: r.sales, sub: tr(`${r.invoices} فاتورة`, `${r.invoices} invoices`) }))} />
            ) : (
              <p className="py-8 text-center text-sm text-muted">{tr("لا توجد مبيعات اليوم بعد", "No sales yet today")}</p>
            )}
          </div>
        </Card>
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-2">
        <Card>
          <CardHeader title={tr("أعلى الديون", "Highest debts")} action={<Button size="sm" variant="ghost" href="/customers">{tr("الكل", "All")}</Button>} />
          <ul className="divide-y divide-line">
            {(debts.data ?? []).slice(0, 6).map((r) => (
              <li key={r.customer.id}>
                <Link href={`/customers/${r.customer.id}`} className="block px-4 py-3 hover:bg-card-2">
                  <div className="flex justify-between gap-2 text-sm">
                    <span className="font-medium">{r.customer.name}</span>
                    <Money value={r.customer.balance} className="font-semibold" />
                  </div>
                  <div className="mt-1.5 flex items-center gap-2">
                    <LimitBar balance={r.customer.balance ?? 0} limit={r.customer.debt_limit ?? 0} />
                    <span className="shrink-0 text-xs text-muted">{r.oldest_open && tr(`أقدم فاتورة ${ago(r.oldest_open)}`, `oldest ${ago(r.oldest_open)}`)}</span>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        </Card>
        <Card>
          <CardHeader title={tr("طلبات تنتظر", "Orders waiting")} action={<Button size="sm" variant="ghost" href="/orders">{tr("الكل", "All")}</Button>} />
          <ul className="divide-y divide-line">
            {waiting.map((o) => (
              <li key={o.id}>
                <Link href={`/orders/${o.id}`} className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-card-2">
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium">{cName(o.customer_id)}</span>
                    <span className="text-xs text-muted">
                      <span className="num">{o.number}</span> · {ago(o.created_at)} · {name(lookups.warehouses.find((w) => w.id === o.warehouse_id))}
                    </span>
                  </span>
                  <span className="text-end">
                    <Money value={o.total} className="block text-sm" />
                    <OrderStatusBadge status={o.status} />
                  </span>
                </Link>
              </li>
            ))}
            {!waiting.length && <li className="p-6 text-center text-sm text-muted">{tr("لا توجد طلبات معلقة", "Nothing waiting")}</li>}
          </ul>
        </Card>
      </div>
    </>
  );
}
