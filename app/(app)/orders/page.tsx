"use client";

import { useState } from "react";
import { ClipboardList, Clock, Plus, RotateCw, Trash2, WifiOff } from "lucide-react";
import { useApp } from "@/components/shell";
import { inWarehouse, useWarehouseFilter } from "@/components/warehouse-filter";
import { OrderStatusBadge, SourceBadge } from "@/components/status";
import { Button, Card, DataTable, Empty, ErrorBox, LoadingRows, Money, Notice, PageHeader, SearchBox, Segmented, type Column } from "@/components/ui";
import { api } from "@/lib/api";
import type { Order, OrderStatus } from "@/lib/api/types";
import { useFmt } from "@/lib/i18n";
import { removeJob, retryJob, useQueue } from "@/lib/offline";
import { useLoad } from "@/lib/use-load";
import { useRealtime } from "@/lib/realtime";
import { matches } from "@/lib/utils";

type Filter = "open" | OrderStatus | "all";

export default function OrdersPage() {
  const { tr, dateTime, ago, money } = useFmt();
  const { user, lookups } = useApp();
  const orders = useLoad(() => api.listOrders(), []);
  useRealtime(["orders"], () => orders.reload());
  const customers = useLoad(() => api.listCustomers().catch(() => []), []);
  const queue = useQueue();
  const [filter, setFilter] = useState<Filter>(user.role === "warehouse" ? "approved" : user.role === "accountant" ? "pending" : "open");
  const [q, setQ] = useState("");

  const cName = (id: number) => customers.data?.find((c) => c.id === id)?.name ?? `#${id}`;
  const rName = (id: number) => lookups.reps.find((r) => r.id === id)?.name ?? "-";
  const wh = useWarehouseFilter();
  const all = (orders.data ?? []).filter((o) => inWarehouse(wh, o.warehouse_id));
  const count = (f: Filter) => all.filter((o) => pass(o, f)).length;
  const rows = all.filter((o) => pass(o, filter) && matches(q, o.number, cName(o.customer_id), rName(o.rep_id)));
  const canCreate = user.role === "rep" || user.role === "manager";

  const columns: Column<Order>[] = [
    { key: "n", head: tr("الرقم", "No."), cell: (o) => <span className="num">{o.number}</span> },
    { key: "c", head: tr("الزبون", "Customer"), cell: (o) => cName(o.customer_id) },
    { key: "r", head: tr("المندوب", "Rep"), cell: (o) => rName(o.rep_id), hideOnMobile: true },
    { key: "s", head: tr("المصدر", "Source"), cell: (o) => <SourceBadge source={o.source} /> },
    { key: "t", head: tr("المبلغ", "Amount"), cell: (o) => <Money value={o.total} className="font-medium" />, align: "end" },
    { key: "st", head: tr("الحالة", "Status"), cell: (o) => <OrderStatusBadge status={o.status} waiting={o.waiting_stock} /> },
    { key: "d", head: tr("الوقت", "Time"), cell: (o) => <span className="text-muted">{dateTime(o.created_at)}</span> },
  ];

  return (
    <>
      <PageHeader
        title={tr("الطلبات", "Orders")}
        subtitle={user.role === "warehouse" ? tr("الطلبات التي تنتظر التجهيز من مخزنك", "Orders waiting to be issued from your warehouse") : undefined}
        actions={canCreate && <Button variant="primary" href="/orders/new"><Plus className="size-4" /> {tr("طلب جديد", "New order")}</Button>}
      />

      {queue.length > 0 && (
        <Card className="mb-4 border-warning/40">
          <div className="flex items-center gap-2 border-b border-line px-4 py-3 text-sm font-semibold text-warning">
            <WifiOff className="size-4" /> {tr("محفوظة على الجوال بانتظار الإرسال", "Saved on the phone, waiting to send")}
          </div>
          <ul className="divide-y divide-line">
            {queue.map((j) => (
              <li key={j.client_ref} className="flex items-center justify-between gap-3 px-4 py-3 text-sm">
                <div className="min-w-0">
                  <p className="font-medium">
                    {j.kind === "order" ? tr("طلب", "Order") : tr("تسديد", "Payment")} · {j.label}
                  </p>
                  <p className="text-xs text-muted">{tr("تم الحفظ", "Saved")} {ago(j.saved_at)}</p>
                  {j.error && <p className="mt-1 text-xs text-danger">{j.error}</p>}
                </div>
                {j.error ? (
                  <div className="flex gap-1">
                    <Button size="sm" onClick={() => retryJob(j.client_ref)}>
                      <RotateCw className="size-3.5" /> {tr("أعد المحاولة", "Retry")}
                    </Button>
                    <Button size="sm" variant="danger" onClick={() => confirm(tr("حذف هذا من الجوال؟", "Delete this from the phone?")) && removeJob(j.client_ref)}>
                      <Trash2 className="size-3.5" />
                    </Button>
                  </div>
                ) : (
                  <span className="flex items-center gap-1 text-xs text-warning">
                    <Clock className="size-3.5" /> {tr("بانتظار الإنترنت", "Waiting")}
                  </span>
                )}
              </li>
            ))}
          </ul>
        </Card>
      )}

      {count("needs_approval") > 0 && user.role === "manager" && filter !== "needs_approval" && (
        <div className="mb-4">
          <Notice tone="warning" title={tr(`${count("needs_approval")} طلب يتجاوز سقف الدين ينتظر موافقتك`, `${count("needs_approval")} order(s) over the debt limit wait for you`)} action={<Button size="sm" onClick={() => setFilter("needs_approval")}>{tr("عرض", "Show")}</Button>} />
        </div>
      )}

      <Card>
        <div className="flex flex-col gap-3 border-b border-line p-3 lg:flex-row lg:items-center lg:justify-between">
          <Segmented
            value={filter}
            onChange={setFilter}
            options={[
              { value: "open", label: tr("المفتوحة", "Open"), count: count("open") },
              { value: "pending", label: tr("بانتظار الاعتماد", "To approve"), count: count("pending") },
              { value: "approved", label: tr("معتمدة", "Approved"), count: count("approved") },
              { value: "needs_approval", label: tr("تحتاج موافقة", "Need approval"), count: count("needs_approval") },
              { value: "confirmed", label: tr("سُلِّمت", "Delivered"), count: count("confirmed") },
              { value: "all", label: tr("الكل", "All"), count: all.length },
            ]}
          />
          <SearchBox value={q} onChange={setQ} placeholder={tr("رقم الطلب، الزبون أو المندوب", "Order no., customer or rep")} className="lg:w-72" />
        </div>
        {orders.state.status === "loading" ? (
          <LoadingRows />
        ) : orders.state.status === "error" ? (
          <ErrorBox error={orders.state.error} onRetry={orders.reload} />
        ) : (
          <DataTable
            rows={rows}
            columns={columns}
            rowKey={(o) => o.id}
            onRowHref={(o) => `/orders/${o.id}`}
            mobile={(o) => (
              <div className="space-y-1">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-semibold">{cName(o.customer_id)}</span>
                  <Money value={o.total} className="font-semibold" />
                </div>
                <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
                  <span className="num">{o.number}</span>
                  <OrderStatusBadge status={o.status} waiting={o.waiting_stock} />
                  {o.source === "shop" && <SourceBadge source="shop" />}
                  <span>{ago(o.created_at)}</span>
                </div>
              </div>
            )}
            empty={<Empty icon={<ClipboardList className="size-6" />} title={tr("لا توجد طلبات هنا", "No orders here")} body={filter === "pending" ? tr("كل الطلبات تم تجهيزها", "Every order has been handled") : undefined} />}
          />
        )}
        {rows.length > 0 && (
          <div className="flex justify-between border-t border-line px-4 py-2.5 text-xs text-muted">
            <span>
              {rows.length} {tr("طلب", "orders")}
            </span>
            <span className="num">{money(rows.reduce((s, o) => s + o.total, 0))}</span>
          </div>
        )}
      </Card>
    </>
  );
}

function pass(o: Order, f: Filter) {
  if (f === "all") return true;
  if (f === "open") return o.status === "pending" || o.status === "needs_approval" || o.status === "approved";
  return o.status === f;
}
