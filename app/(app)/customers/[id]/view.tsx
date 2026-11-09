"use client";

import { Pencil, Phone, ShoppingCart, Wallet } from "lucide-react";
import { useState } from "react";
import { CustomerForm } from "@/components/customer-form";
import { useApp } from "@/components/shell";
import { OrderStatusBadge } from "@/components/status";
import { StatementView } from "@/components/statement-view";
import { Badge, Button, Card, CardHeader, ErrorBox, KV, LimitBar, LoadingRows, Money, Notice, PageHeader } from "@/components/ui";
import { api } from "@/lib/api";
import { useFmt } from "@/lib/i18n";
import { useLoad } from "@/lib/use-load";
import { useIdParam } from "@/lib/utils";
import Link from "next/link";

export default function CustomerView() {
  const id = useIdParam();
  const { tr, name, money, ago } = useFmt();
  const { user, lookups } = useApp();
  const c = useLoad(() => api.getCustomer(id), [id]);
  const orders = useLoad(() => api.listOrders(), [id]);
  const [edit, setEdit] = useState(false);

  if (c.state.status === "loading") return <LoadingRows />;
  if (c.state.status === "error" || !c.data) return <ErrorBox error={c.state.status === "error" ? c.state.error : null} onRetry={c.reload} />;
  const x = c.data;
  const bal = x.balance ?? 0;
  const lim = x.debt_limit ?? 0;
  const left = lim - bal;
  const mine = (orders.data ?? []).filter((o) => o.customer_id === x.id).slice(0, 6);
  const rep = lookups.reps.find((r) => r.id === x.rep_id);

  return (
    <>
      <PageHeader
        back="/customers"
        title={
          <span className="flex flex-wrap items-center gap-2">
            {x.name} {!x.active && <Badge>{tr("موقوف", "Inactive")}</Badge>}
          </span>
        }
        subtitle={`${x.owner_name} · ${x.area}`}
        actions={
          <>
            {user.role === "manager" && (
              <Button onClick={() => setEdit(true)}>
                <Pencil className="size-4" /> {tr("تعديل", "Edit")}
              </Button>
            )}
            <Button href={`tel:${x.phone}`}>
              <Phone className="size-4" /> {tr("اتصال", "Call")}
            </Button>
            {(user.role === "rep" || user.role === "manager") && (
              <Button variant="primary" href={`/orders/new?customer=${x.id}`}>
                <ShoppingCart className="size-4" /> {tr("طلب جديد", "New order")}
              </Button>
            )}
            {bal > 0 && (
              <Button variant="action" href={`/payments/new?customer=${x.id}`}>
                <Wallet className="size-4" /> {tr("استلام تسديد", "Take payment")}
              </Button>
            )}
          </>
        }
      />
      <div className="mb-4 grid gap-4 lg:grid-cols-3">
        <Card className="p-4 lg:col-span-2">
          <div className="grid gap-4 sm:grid-cols-3">
            <div>
              <p className="text-xs text-muted">{tr("الدين الحالي", "Current debt")}</p>
              <Money value={bal} className="text-2xl font-bold" />
            </div>
            <div>
              <p className="text-xs text-muted">{tr("سقف الدين", "Debt limit")}</p>
              <Money value={lim} className="text-2xl font-bold" />
            </div>
            <div>
              <p className="text-xs text-muted">{left >= 0 ? tr("المتبقي للسقف", "Left before limit") : tr("فوق السقف", "Over the limit")}</p>
              <Money value={Math.abs(left)} className={`text-2xl font-bold ${left < 0 ? "text-danger" : "text-success"}`} />
            </div>
          </div>
          <div className="mt-4">
            <LimitBar balance={bal} limit={lim} />
          </div>
          {left < 0 && (
            <div className="mt-3">
              <Notice tone="danger">{tr("أي طلب جديد لهذا الزبون يحتاج موافقة المدير.", "Any new order for this customer needs the manager's approval.")}</Notice>
            </div>
          )}
          {bal < 0 && (
            <div className="mt-3">
              <Notice tone="success">{tr(`للزبون رصيد ${money(-bal)} (من مرتجع على فاتورة مسددة)`, `Customer has ${money(-bal)} credit (from a return on a paid invoice)`)}</Notice>
            </div>
          )}
        </Card>
        <Card className="p-4">
          <KV k={tr("الهاتف", "Phone")} v={<span dir="ltr">{x.phone}</span>} />
          <KV k={tr("العنوان", "Address")} v={x.address} />
          <KV k={tr("نوع السعر", "Price tier")} v={<Badge tone="primary">{name(lookups.tiers.find((t) => t.id === x.tier_id))}</Badge>} />
          <KV k={tr("المندوب", "Rep")} v={rep?.name} />
          <KV k={tr("آخر طلب", "Last order")} v={x.last_order_at ? ago(x.last_order_at) : "-"} />
        </Card>
      </div>

      <div className="grid gap-4 xl:grid-cols-[1fr_360px]">
        <div className="min-w-0">
          <h2 className="mb-2 font-semibold">{tr("كشف الحساب", "Statement")}</h2>
          <StatementView customerId={x.id} />
        </div>
        <Card className="self-start">
          <CardHeader title={tr("آخر الطلبات", "Latest orders")} />
          <ul className="divide-y divide-line text-sm">
            {mine.map((o) => (
              <li key={o.id}>
                <Link href={`/orders/${o.id}`} className="flex items-center justify-between gap-2 px-4 py-2.5 hover:bg-card-2">
                  <span>
                    <span className="num block font-medium">{o.number}</span>
                    <span className="text-xs text-muted">{ago(o.created_at)}</span>
                  </span>
                  <span className="text-end">
                    <Money value={o.total} className="block" />
                    <OrderStatusBadge status={o.status} />
                  </span>
                </Link>
              </li>
            ))}
            {!mine.length && <li className="p-4 text-center text-muted">{tr("لا توجد طلبات", "No orders")}</li>}
          </ul>
        </Card>
      </div>
      {edit && <CustomerForm open customer={x} onClose={() => setEdit(false)} onSaved={() => c.reload()} />}
    </>
  );
}
