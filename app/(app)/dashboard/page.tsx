"use client";

// The dashboard. In the manager's customize mode every card here can be dragged to a new place, hidden
// with the eye, and its title changed by clicking it. The arrangement is saved for everyone who sees
// the dashboard (see lib/site.ts).
import Link from "next/link";
import type { ReactNode } from "react";
import { AlertTriangle, Banknote, Boxes, ClipboardList, PackageX, ShieldAlert, TrendingUp, UserPlus, Wallet } from "lucide-react";
import { RankBars, SalesBars } from "@/components/charts";
import { EditText, SortArea, SortItem, toggleIn, useSaveSite } from "@/components/customize";
import { useApp } from "@/components/shell";
import { UsdRateCard } from "@/components/usd-rate";
import { inWarehouse, useWarehouseFilter } from "@/components/warehouse-filter";
import { OrderStatusBadge } from "@/components/status";
import { Button, Card, CardHeader, ErrorBox, LimitBar, Money, PageHeader, Skeleton, Stat } from "@/components/ui";
import { api } from "@/lib/api";
import { useFmt } from "@/lib/i18n";
import { ordered, useLabel, useSite } from "@/lib/site";
import { useLoad } from "@/lib/use-load";
import { today } from "@/lib/utils";

type Piece = { id: string; el: ReactNode; wide?: boolean };

export default function DashboardPage() {
  const { tr, money, date, ago, name, lang } = useFmt();
  const { user, lookups } = useApp();
  const wh = useWarehouseFilter();
  const d = useLoad(() => api.dashboard(wh), [wh]);
  const debts = useLoad(() => api.debts(), []);
  const orders = useLoad(() => api.listOrders(), []);
  const daily = useLoad(() => api.dailySales(today(), wh), [wh]);
  const customers = useLoad(() => api.listCustomers(), []);
  const site = useSite();
  const lab = useLabel();
  const save = useSaveSite();
  const cName = (id: number) => customers.data?.find((c) => c.id === id)?.name ?? `#${id}`;
  const hour = new Date().getHours();
  const hello = hour < 12 ? tr("صباح الخير", "Good morning") : hour < 17 ? tr("مساء الخير", "Good afternoon") : tr("مساء الخير", "Good evening");

  if (d.state.status === "error") return <ErrorBox error={d.state.error} onRetry={d.reload} />;
  const x = d.data;
  const waiting = (orders.data ?? []).filter((o) => (o.status === "needs_approval" || o.status === "pending") && inWarehouse(wh, o.warehouse_id)).slice(0, 6);

  // ----- customization: names, order, hidden -----
  const dash = site.dashboard;
  /** A title the manager can change by clicking it (customize mode). */
  const T = (id: string, ar: string, en: string) => (
    <EditText
      value={lab(dash.labels[id], ar, en)}
      onSave={(v) => save((s) => ({ ...s, dashboard: { ...s.dashboard, labels: { ...s.dashboard.labels, [id]: { ...s.dashboard.labels[id], [lang]: v } } } }))}
    />
  );
  const inOrder = (list: Piece[]) => ordered(list, dash.order, (p) => p.id);
  // The cards of one area take their new order; the other area's cards keep theirs after them.
  const reorder = (ids: string[]) => save((s) => ({ ...s, dashboard: { ...s.dashboard, order: [...ids, ...s.dashboard.order.filter((id) => !ids.includes(id))] } }));
  const hide = (id: string) => save((s) => ({ ...s, dashboard: { ...s.dashboard, hidden: toggleIn(s.dashboard.hidden, id) } }));
  const area = (list: Piece[], className: string) => (
    <SortArea ids={list.map((p) => p.id)} onOrder={reorder} grid>
      <div className={className}>
        {list.map((p) => (
          <SortItem key={p.id} id={p.id} hidden={dash.hidden.includes(p.id)} onHide={() => hide(p.id)} className={p.wide ? "xl:col-span-2" : undefined}>
            {p.el}
          </SortItem>
        ))}
      </div>
    </SortArea>
  );

  const stats: Piece[] = x
    ? inOrder([
        {
          id: "s_sales",
          el: (
            <Stat
              label={T("s_sales", "مبيعات اليوم", "Sales today")}
              value={<Money value={x.today_sales} />}
              hint={tr(`${x.today_invoices} فاتورة`, `${x.today_invoices} invoices`)}
              icon={<TrendingUp className="size-4" />}
              tone="primary"
              href="/reports"
            />
          ),
        },
        {
          id: "s_collected",
          el: <Stat label={T("s_collected", "المقبوض اليوم", "Collected today")} value={<Money value={x.today_collected} />} icon={<Banknote className="size-4" />} tone="success" href="/payments" />,
        },
        {
          id: "s_debt",
          el: (
            <Stat
              label={T("s_debt", "مجموع الديون", "Total debt")}
              value={<Money value={x.total_debt} />}
              hint={x.over_limit_customers ? tr(`${x.over_limit_customers} زبون فوق السقف`, `${x.over_limit_customers} over limit`) : undefined}
              icon={<Wallet className="size-4" />}
              tone="warning"
              href="/customers"
            />
          ),
        },
        {
          id: "s_month",
          el:
            x.month_profit !== undefined ? (
              <Stat
                label={T("s_month", "ربح الشهر", "Profit this month")}
                value={<Money value={x.month_profit} />}
                hint={`${tr("مبيعات", "Sales")} ${money(x.month_sales)}`}
                icon={<TrendingUp className="size-4" />}
                tone="success"
                href="/reports"
              />
            ) : (
              <Stat label={T("s_month_sales", "مبيعات الشهر", "Sales this month")} value={<Money value={x.month_sales} />} href="/reports" />
            ),
        },
        // The profit after this month's expenses (rent, salaries, fuel…): what really stays.
        ...(x.month_net !== undefined
          ? [
              {
                id: "s_net",
                el: (
                  <Stat
                    label={T("s_net", "صافي الربح بعد الصرفيات", "Net profit after expenses")}
                    value={<Money value={x.month_net} />}
                    hint={`${tr("صرفيات الشهر", "Expenses this month")} ${money(x.month_expenses ?? 0)}`}
                    icon={<Banknote className="size-4" />}
                    tone={x.month_net < 0 ? "danger" : "success"}
                    href="/expenses"
                  />
                ),
              },
            ]
          : []),
        { id: "s_pending", el: <Stat label={T("s_pending", "طلبات بانتظار التثبيت", "Orders waiting")} value={x.pending_orders} icon={<ClipboardList className="size-4" />} href="/orders" /> },
        {
          id: "s_low",
          el: (
            <Stat label={T("s_low", "مواد تحت الحد الأدنى", "Items below minimum")} value={x.low_stock} tone={x.low_stock ? "danger" : undefined} icon={<Boxes className="size-4" />} href="/stock" />
          ),
        },
        {
          id: "s_near",
          el: (
            <Stat
              label={T("s_near", "دفعات قريبة الانتهاء", "Batches expiring soon")}
              value={x.near_expiry}
              tone={x.near_expiry ? "warning" : undefined}
              icon={<AlertTriangle className="size-4" />}
              href="/stock"
            />
          ),
        },
        {
          id: "s_expired",
          el: (
            <Stat
              label={T("s_expired", "دفعات منتهية في المخزن", "Expired batches")}
              value={x.expired_batches}
              tone={x.expired_batches ? "danger" : undefined}
              icon={<PackageX className="size-4" />}
              href="/stock"
            />
          ),
        },
      ])
    : [];

  const cards: Piece[] = inOrder([
    { id: "c_usd", wide: true, el: <UsdRateCard /> },
    {
      id: "c_last7",
      el: (
        <Card className="h-full">
          <CardHeader title={T("c_last7", "آخر 7 أيام", "Last 7 days")} subtitle={tr("المبيعات مقابل المقبوض", "Sales vs. money collected")} />
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
      ),
    },
    {
      id: "c_reps",
      el: (
        <Card className="h-full">
          <CardHeader title={T("c_reps", "مبيعات اليوم حسب المندوب", "Today by rep")} />
          <div className="p-4">
            {daily.data && daily.data.by_rep.length ? (
              <RankBars rows={daily.data.by_rep.map((r) => ({ label: r.label, value: r.sales, sub: tr(`${r.invoices} فاتورة`, `${r.invoices} invoices`) }))} />
            ) : (
              <p className="py-8 text-center text-sm text-muted">{tr("لا توجد مبيعات اليوم بعد", "No sales yet today")}</p>
            )}
          </div>
        </Card>
      ),
    },
    {
      id: "c_debts",
      el: (
        <Card className="h-full">
          <CardHeader
            title={T("c_debts", "أعلى الديون", "Highest debts")}
            action={
              <Button size="sm" variant="ghost" href="/customers">
                {tr("الكل", "All")}
              </Button>
            }
          />
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
      ),
    },
    {
      id: "c_waiting",
      el: (
        <Card className="h-full">
          <CardHeader
            title={T("c_waiting", "طلبات تنتظر", "Orders waiting")}
            action={
              <Button size="sm" variant="ghost" href="/orders">
                {tr("الكل", "All")}
              </Button>
            }
          />
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
                    <OrderStatusBadge status={o.status} waiting={o.waiting_stock} />
                  </span>
                </Link>
              </li>
            ))}
            {!waiting.length && <li className="p-6 text-center text-sm text-muted">{tr("لا توجد طلبات معلقة", "Nothing waiting")}</li>}
          </ul>
        </Card>
      ),
    },
  ]);

  return (
    <>
      <PageHeader
        title={`${hello}${tr("، ", ", ")}${user.name.split(" ")[0]}`}
        subtitle={date(new Date().toISOString())}
        actions={<Button href="/reports">{tr("كل التقارير", "All reports")}</Button>}
      />

      {(customers.data ?? []).some((c) => c.pending) && user.role === "manager" && (
        <Link href="/customers" className="mb-4 flex items-center gap-3 rounded-xl border border-action/30 bg-action/10 p-3 text-text">
          <UserPlus className="size-5 shrink-0 text-action" />
          <span className="flex-1 text-sm font-medium">
            {tr(
              `${(customers.data ?? []).filter((c) => c.pending).length} محل جديد سجّل من الموقع وينتظر موافقتك`,
              `${(customers.data ?? []).filter((c) => c.pending).length} new shop(s) signed up online and wait for your approval`,
            )}
          </span>
          <span className="text-sm underline">{tr("مراجعة", "Review")}</span>
        </Link>
      )}

      {/* The manager's approvals: always one line (also when nothing waits), and its place is kept while
          loading, so the page doesn't jump when the numbers arrive. */}
      {user.role === "manager" &&
        (!x ? (
          <div aria-hidden className="mb-4 h-[3.25rem] rounded-xl bg-card-2" />
        ) : x.needs_approval > 0 ? (
          <Link href="/orders" className="mb-4 flex h-[3.25rem] items-center gap-3 rounded-xl border border-warning/30 bg-warning-soft px-3 text-warning">
            <ShieldAlert className="size-5 shrink-0" />
            <span className="flex-1 text-sm font-medium">{tr(`${x.needs_approval} طلب يتجاوز سقف الدين وينتظر موافقتك`, `${x.needs_approval} order(s) over the debt limit wait for your approval`)}</span>
            <span className="text-sm underline">{tr("عرض", "Show")}</span>
          </Link>
        ) : (
          <p className="mb-4 flex h-[3.25rem] items-center gap-3 rounded-xl border border-line bg-card px-3 text-sm text-muted">
            <ShieldAlert className="size-5 shrink-0 text-success" />
            {tr("لا شيء يتجاوز سقف الدين وينتظر موافقتك", "Nothing over the debt limit waits for you")}
          </p>
        ))}

      {x ? (
        area(stats, "grid grid-cols-2 gap-3 lg:grid-cols-4 [&>*]:min-w-0")
      ) : (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {/* As many as the real tiles (the net-profit tile is there for whoever sees the profit). */}
          {Array.from({ length: user.role === "manager" || user.role === "accountant" ? 9 : 8 }, (_, i) => (
            <Skeleton key={i} className="h-28" />
          ))}
        </div>
      )}

      {/* One column on phones (minmax 0: a chart shrinks to the screen instead of pushing it wider). */}
      <div className="mt-4">{area(cards, "grid grid-cols-[minmax(0,1fr)] gap-4 xl:grid-cols-2 [&>*]:min-w-0")}</div>
    </>
  );
}
