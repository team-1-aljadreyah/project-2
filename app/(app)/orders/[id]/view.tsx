"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Ban, CheckCircle2, Clock, FileText, PackageCheck, ShieldCheck } from "lucide-react";
import { useApp } from "@/components/shell";
import { OrderStatusBadge, SourceBadge } from "@/components/status";
import { Badge, Button, Card, CardHeader, Dialog, ErrorBox, Field, KV, LimitBar, LoadingRows, Money, Notice, PageHeader, Textarea, errorText, useToast } from "@/components/ui";
import { api } from "@/lib/api";
import type { Batch } from "@/lib/api/types";
import { useFmt } from "@/lib/i18n";
import { useLoad } from "@/lib/use-load";
import { piecesOf, useIdParam } from "@/lib/utils";

export default function OrderView() {
  const id = useIdParam();
  const { tr, dateTime, money, qty, name } = useFmt();
  const { user, lookups, itemById, reloadItems } = useApp();
  const router = useRouter();
  const toast = useToast();
  const order = useLoad(() => api.getOrder(id), [id]);
  const o = order.data;
  const customer = useLoad(() => (o ? api.getCustomer(o.customer_id) : Promise.resolve(undefined)), [o?.customer_id]);
  const seesBatches = ["manager", "warehouse", "accountant"].includes(user.role);
  const batches = useLoad(() => (o && seesBatches ? api.listBatches(o.warehouse_id) : Promise.resolve([] as Batch[])), [o?.warehouse_id, seesBatches]);
  const [busy, setBusy] = useState<string | null>(null);
  const [cancel, setCancel] = useState(false);
  const [reason, setReason] = useState("");

  if (order.state.status === "loading") return <LoadingRows />;
  if (order.state.status === "error" || !o) return <ErrorBox error={order.state.status === "error" ? order.state.error : null} onRetry={order.reload} />;

  const c = customer.data;
  const wh = lookups.warehouses.find((w) => w.id === o.warehouse_id);
  const rep = lookups.reps.find((r) => r.id === o.rep_id);
  const open = o.status === "pending" || o.status === "needs_approval";
  const canConfirm = ["manager", "warehouse", "accountant"].includes(user.role) && (o.status === "pending" || o.status === "expired");
  const canApprove = user.role === "manager" && o.status === "needs_approval";
  const canCancel = open && (user.role === "manager" || o.created_by.id === user.id);

  async function act(key: string, fn: () => Promise<unknown>, ok: string, after?: (r: unknown) => void) {
    setBusy(key);
    try {
      const r = await fn();
      toast("success", ok);
      reloadItems();
      order.reload();
      after?.(r);
    } catch (e) {
      toast("danger", errorText(e, tr));
    } finally {
      setBusy(null);
    }
  }

  // Which batches will leave, oldest expiry first (what the server will do on confirm).
  const plan = o.lines.map((l) => {
    const it = itemById.get(l.item_id);
    const need = it ? piecesOf(it, l.unit, l.qty) : 0;
    let left = need;
    const use: { b: Batch; n: number }[] = [];
    for (const b of (batches.data ?? []).filter((x) => x.item_id === l.item_id && x.status !== "expired")) {
      if (left <= 0) break;
      const n = Math.min(b.qty_left, left);
      use.push({ b, n });
      left -= n;
    }
    return { line: l, use, short: left > 0 };
  });

  return (
    <>
      <PageHeader
        back="/orders"
        title={
          <span className="flex flex-wrap items-center gap-2">
            {tr("طلب", "Order")} <span className="num">{o.number}</span> <OrderStatusBadge status={o.status} />
          </span>
        }
        subtitle={`${dateTime(o.created_at)} · ${tr("سجّله", "by")} ${o.created_by.name}`}
        actions={
          <>
            {o.invoice_id && (
              <Button href={`/invoices/${o.invoice_id}`}>
                <FileText className="size-4" /> {tr("الفاتورة", "Invoice")}
              </Button>
            )}
            {canCancel && (
              <Button variant="danger" onClick={() => setCancel(true)}>
                <Ban className="size-4" /> {tr("إلغاء الطلب", "Cancel order")}
              </Button>
            )}
            {canApprove && (
              <Button variant="action" loading={busy === "approve"} onClick={() => act("approve", () => api.approveOrder(o.id), tr("تمت الموافقة، والطلب صار بانتظار التثبيت", "Approved. The order now waits to be confirmed"))}>
                <ShieldCheck className="size-4" /> {tr("موافقة على تجاوز السقف", "Approve over limit")}
              </Button>
            )}
            {canConfirm && (
              <Button
                variant="action"
                loading={busy === "confirm"}
                onClick={() =>
                  act("confirm", () => api.confirmOrder(o.id), tr("تم التثبيت وصدرت الفاتورة", "Confirmed and invoiced"), (inv) => router.push(`/invoices/${(inv as { id: number }).id}`))
                }
              >
                <PackageCheck className="size-4" /> {tr("تثبيت وإصدار فاتورة", "Confirm and invoice")}
              </Button>
            )}
          </>
        }
      />

      <div className="grid gap-4 lg:grid-cols-[1fr_340px]">
        <div className="space-y-4">
          {o.status === "needs_approval" && (
            <Notice tone="warning" title={tr("هذا الطلب يتجاوز سقف دين الزبون", "This order passes the customer's debt limit")}>
              {user.role === "manager" ? tr("وافق عليه إذا تثق بالزبون، أو ألغه.", "Approve it if you trust the customer, or cancel it.") : tr("ينتظر موافقة المدير. الكمية محجوزة لحد ذاك الوقت.", "Waiting for the manager. The stock stays held until then.")}
            </Notice>
          )}
          {o.status === "expired" && (
            <Notice tone="danger" title={tr("انتهى وقت الحجز", "The hold time ended")}>
              {tr("رجعت الكمية للمخزون. تقدر تثبّته إذا البضاعة بعدها موجودة.", "The stock was released. You can still confirm if the goods are available.")}
            </Notice>
          )}
          {o.status === "cancelled" && <Notice tone="danger" title={tr("الطلب ملغي", "Cancelled")}>{o.cancel_reason}</Notice>}
          {open && o.reserved_until && <Countdown until={o.reserved_until} />}

          <Card>
            <CardHeader title={tr("المواد", "Items")} subtitle={`${tr("يطلع من", "From")} ${name(wh)}`} />
            <ul className="divide-y divide-line">
              {plan.map(({ line: l, use, short }) => {
                const it = itemById.get(l.item_id);
                return (
                  <li key={`${l.item_id}-${l.unit}`} className="px-4 py-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="font-medium">{name(it)}</p>
                        <p className="text-xs text-muted">
                          <span className="num">{l.qty}</span> {l.unit === "carton" ? tr("كارتون", "carton") : tr("قطعة", "piece")} × <span className="num">{money(l.unit_price)}</span>
                          {it && l.unit === "carton" && <span> · {it.pieces_per_carton * l.qty} {tr("قطعة", "pcs")}</span>}
                        </p>
                      </div>
                      <Money value={l.total} className="font-semibold" />
                    </div>
                    {seesBatches && open && (
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {use.map(({ b, n }) => (
                          <Badge key={b.id} tone={b.status === "near_expiry" ? "warning" : "neutral"}>
                            {tr("دفعة", "Batch")} #{b.id} · {tr("صلاحية", "exp")} <span className="num">{b.expiry_date}</span> · {it && qty(n, it.pieces_per_carton)}
                          </Badge>
                        ))}
                        {short && <Badge tone="danger">{tr("الكمية غير كافية بالمخزن", "Not enough on the shelf")}</Badge>}
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
            <div className="flex items-center justify-between border-t border-line px-4 py-3">
              <span className="font-semibold">{tr("المجموع", "Total")}</span>
              <Money value={o.total} className="text-lg font-bold" />
            </div>
          </Card>
          {seesBatches && open && (
            <p className="text-xs text-muted">{tr("الدفعات المعروضة هي التي ستُصرف عند التثبيت: الأقدم صلاحية أولاً، والمنتهية لا تُصرف أبداً.", "The batches shown will leave on confirm: oldest expiry first, expired never.")}</p>
          )}
          {o.note && (
            <Card className="p-4">
              <p className="text-xs text-muted">{tr("ملاحظة", "Note")}</p>
              <p className="mt-1">{o.note}</p>
            </Card>
          )}
        </div>

        <div className="space-y-4">
          <Card className="p-4">
            <p className="text-xs text-muted">{tr("الزبون", "Customer")}</p>
            <p className="text-lg font-semibold">{c?.name ?? "…"}</p>
            {c && (
              <p className="text-sm text-muted">
                {c.owner_name} · <span dir="ltr">{c.phone}</span>
              </p>
            )}
            <div className="mt-3 border-t border-line pt-2">
              <KV k={tr("المنطقة", "Area")} v={c?.area} />
              <KV k={tr("نوع السعر", "Price tier")} v={name(lookups.tiers.find((t) => t.id === c?.tier_id))} />
              <KV k={tr("المندوب", "Rep")} v={rep?.name} />
              <KV k={tr("المصدر", "Source")} v={<SourceBadge source={o.source} />} />
              {c?.balance !== undefined && c.debt_limit !== undefined && (
                <>
                  <KV k={tr("الدين الحالي", "Current debt")} v={<Money value={c.balance} />} />
                  <KV k={tr("سقف الدين", "Debt limit")} v={<Money value={c.debt_limit} />} />
                  <div className="mt-1">
                    <LimitBar balance={c.balance} limit={c.debt_limit} />
                  </div>
                </>
              )}
            </div>
            {c && user.role !== "shop" && user.role !== "warehouse" && (
              <Button className="mt-3 w-full" href={`/customers/${c.id}`}>
                {tr("ملف الزبون", "Customer file")}
              </Button>
            )}
          </Card>
          {o.approved_by && (
            <Card className="flex items-center gap-2 p-4 text-sm">
              <CheckCircle2 className="size-4 text-success" /> {tr("وافق المدير", "Approved by")} {o.approved_by.name}
            </Card>
          )}
        </div>
      </div>

      <Dialog
        open={cancel}
        onClose={() => setCancel(false)}
        title={tr("إلغاء الطلب", "Cancel order")}
        footer={
          <>
            <Button onClick={() => setCancel(false)}>{tr("رجوع", "Back")}</Button>
            <Button
              variant="danger"
              loading={busy === "cancel"}
              disabled={!reason.trim()}
              onClick={() =>
                act("cancel", () => api.cancelOrder(o.id, reason), tr("أُلغي الطلب ورجعت الكمية للمخزون", "Cancelled. Stock released"), () => {
                  setCancel(false);
                  setReason("");
                })
              }
            >
              {tr("تأكيد الإلغاء", "Confirm cancel")}
            </Button>
          </>
        }
      >
        <Field label={tr("سبب الإلغاء", "Reason")} hint={tr("يظهر في سجل التعديلات", "Shown in the activity log")}>
          <Textarea value={reason} onChange={(e) => setReason(e.target.value)} placeholder={tr("مثلاً: الزبون غيّر رأيه", "e.g. the customer changed their mind")} />
        </Field>
      </Dialog>
    </>
  );
}

/** "Stock held for 1:24:10 more" */
function Countdown({ until }: { until: string }) {
  const { tr, time } = useFmt();
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  const ms = new Date(until).getTime() - now;
  if (ms <= 0) return null;
  const h = Math.floor(ms / 3_600_000);
  const m = Math.floor((ms % 3_600_000) / 60_000);
  const s = Math.floor((ms % 60_000) / 1000);
  return (
    <div className="flex items-center gap-3 rounded-xl border border-line bg-card p-3 text-sm">
      <Clock className="size-5 text-primary-ink" />
      <span>
        {tr("الكمية محجوزة لهذا الطلب لحد", "Stock is held for this order until")} <b className="num">{time(until)}</b> ·{" "}
        <span className="num font-semibold text-primary-ink" dir="ltr">
          {h}:{String(m).padStart(2, "0")}:{String(s).padStart(2, "0")}
        </span>
      </span>
    </div>
  );
}

