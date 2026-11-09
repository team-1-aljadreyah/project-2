"use client";

import Link from "next/link";
import { ChevronLeft, ChevronRight, Percent, ShoppingCart, Wallet, WifiOff } from "lucide-react";
import { useApp } from "@/components/shell";
import { OrderStatusBadge } from "@/components/status";
import { Button, Card, CardHeader, LimitBar, Money, Notice, Stat } from "@/components/ui";
import { api } from "@/lib/api";
import { useFmt } from "@/lib/i18n";
import { useQueue } from "@/lib/offline";
import { useLoad } from "@/lib/use-load";
import { dayOfIso, today } from "@/lib/utils";

// The rep's home on the phone: today's work, his customers with debts, his commission, and saved offline work.
export default function RepHome() {
  const { tr, ago, lang } = useFmt();
  const { user } = useApp();
  const orders = useLoad(() => api.listOrders(), []);
  const customers = useLoad(() => api.listCustomers(), []);
  const payments = useLoad(() => api.listPayments(), []);
  const month = today().slice(0, 7);
  const comm = useLoad(() => api.commissions(month), [month]);
  const queue = useQueue();
  const Chevron = lang === "ar" ? ChevronLeft : ChevronRight;
  const t = today();
  const todayOrders = (orders.data ?? []).filter((o) => dayOfIso(o.created_at) === t && o.status !== "cancelled");
  const collected = (payments.data ?? []).filter((p) => dayOfIso(p.date) === t).reduce((s, p) => s + p.amount, 0);
  const mine = (customers.data ?? []).slice().sort((a, b) => (b.balance ?? 0) - (a.balance ?? 0));
  const row = comm.data?.[0];
  const cName = (id: number) => customers.data?.find((c) => c.id === id)?.name ?? "";

  return (
    <>
      <div className="mb-4">
        <p className="text-sm text-muted">{tr("أهلاً", "Hello")}</p>
        <h1 className="text-2xl font-bold">{user.name}</h1>
      </div>
      {queue.length > 0 && (
        <div className="mb-4">
          <Notice tone="warning" title={tr(`${queue.length} محفوظة على الجوال`, `${queue.length} saved on the phone`)} action={<Button size="sm" href="/orders">{tr("عرض", "Show")}</Button>}>
            <span className="flex items-center gap-1">
              <WifiOff className="size-3.5" /> {tr("تنرسل لوحدها لما يرجع النت", "They send by themselves when the internet is back")}
            </span>
          </Notice>
        </div>
      )}
      <div className="mb-4 grid grid-cols-2 gap-3">
        <Button variant="action" size="lg" href="/orders/new" className="h-20 flex-col gap-1 text-base">
          <ShoppingCart className="size-6" /> {tr("طلب جديد", "New order")}
        </Button>
        <Button variant="primary" size="lg" href="/payments/new" className="h-20 flex-col gap-1 text-base">
          <Wallet className="size-6" /> {tr("استلام تسديد", "Take payment")}
        </Button>
      </div>
      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-3">
        <Stat label={tr("طلبات اليوم", "Orders today")} value={todayOrders.length} hint={<Money value={todayOrders.reduce((s, o) => s + o.total, 0)} />} />
        <Stat label={tr("قبضت اليوم", "Collected today")} value={<Money value={collected} />} />
        <Stat label={tr("عمولتي هذا الشهر", "My commission")} value={<Money value={row?.net} />} hint={tr("على المبالغ المدفوعة فعلاً", "On money actually paid")} icon={<Percent className="size-4" />} tone="success" href="/commissions" />
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader title={tr("زبائني", "My customers")} subtitle={tr("الأعلى ديناً أولاً", "Highest debt first")} action={<Button size="sm" variant="ghost" href="/customers">{tr("الكل", "All")}</Button>} />
          <ul className="divide-y divide-line">
            {mine.slice(0, 8).map((c) => (
              <li key={c.id}>
                <Link href={`/customers/${c.id}`} className="flex items-center gap-3 px-4 py-3 active:bg-card-2">
                  <div className="min-w-0 flex-1">
                    <div className="flex justify-between gap-2">
                      <span className="truncate font-medium">{c.name}</span>
                      <Money value={c.balance} className="text-sm font-semibold" />
                    </div>
                    <p className="mb-1.5 text-xs text-muted">
                      {c.area} · {c.last_order_at ? tr(`آخر طلب ${ago(c.last_order_at)}`, `last order ${ago(c.last_order_at)}`) : tr("لم يطلب بعد", "no orders yet")}
                    </p>
                    <LimitBar balance={c.balance ?? 0} limit={c.debt_limit ?? 0} />
                  </div>
                  <Chevron className="size-4 shrink-0 text-faint" />
                </Link>
              </li>
            ))}
          </ul>
        </Card>
        <Card>
          <CardHeader title={tr("طلباتي الأخيرة", "My latest orders")} action={<Button size="sm" variant="ghost" href="/orders">{tr("الكل", "All")}</Button>} />
          <ul className="divide-y divide-line">
            {(orders.data ?? []).slice(0, 8).map((o) => (
              <li key={o.id}>
                <Link href={`/orders/${o.id}`} className="flex items-center justify-between gap-3 px-4 py-3 active:bg-card-2">
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium">{cName(o.customer_id)}</span>
                    <span className="text-xs text-muted">{ago(o.created_at)}</span>
                  </span>
                  <span className="text-end">
                    <Money value={o.total} className="block text-sm" />
                    <OrderStatusBadge status={o.status} />
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </>
  );
}
