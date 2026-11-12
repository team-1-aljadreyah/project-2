"use client";

import { useAppRouter } from "@/lib/app-path";
import { useEffect, useState } from "react";
import { Ban, CheckCircle2, Clock, FileText, PackageCheck, Pencil, ShieldCheck } from "lucide-react";
import { useApp } from "@/components/shell";
import { OrderStatusBadge, SourceBadge } from "@/components/status";
import { Badge, Button, Card, CardHeader, Dialog, ErrorBox, errorText, Field, KV, LimitBar, LoadingRows, Money, Notice, PageHeader, RefLink, Textarea, useToast } from "@/components/ui";
import { api } from "@/lib/api";
import type { Batch } from "@/lib/api/types";
import { useFmt } from "@/lib/i18n";
import { useLoad } from "@/lib/use-load";
import { useRealtime } from "@/lib/realtime";
import { DeliveryPanel } from "@/components/delivery/status";
import { ShipmentTracker, useRepLocations } from "@/components/delivery/live-map";
import { OrderTotals } from "@/components/discount";
import { editOrderInBag } from "@/components/shop-store";
import { PrepareOrder } from "@/components/prepare-order";
import { piecesOf, useIdParam } from "@/lib/utils";

export default function OrderView() {
  const id = useIdParam();
  const { tr, dateTime, money, qty, name } = useFmt();
  const { user, lookups, itemById, reloadItems } = useApp();
  const router = useAppRouter();
  const toast = useToast();
  const order = useLoad(() => api.getOrder(id), [id]);
  const locations = useRepLocations();
  useRealtime(["orders"], () => order.reload());
  const o = order.data;
  const customer = useLoad(() => (o ? api.getCustomer(o.customer_id) : Promise.resolve(undefined)), [o?.customer_id]);
  const seesBatches = ["manager", "warehouse", "accountant"].includes(user.role);
  const batches = useLoad(() => (o && seesBatches ? api.listBatches(o.warehouse_id) : Promise.resolve([] as Batch[])), [o?.warehouse_id, seesBatches]);
  const [busy, setBusy] = useState<string | null>(null);
  const [preparing, setPreparing] = useState(false);
  const [cancel, setCancel] = useState(false);
  const [reason, setReason] = useState("");

  if (order.state.status === "loading") return <LoadingRows />;
  if (order.state.status === "error" || !o) return <ErrorBox error={order.state.status === "error" ? order.state.error : null} onRetry={order.reload} />;

  const c = customer.data;
  const wh = lookups.warehouses.find((w) => w.id === o.warehouse_id);
  const rep = lookups.reps.find((r) => r.id === o.rep_id);
  const open = o.status === "pending" || o.status === "needs_approval";
  // Not delivered yet: it can still be cancelled (nothing was owed).
  const beforeDelivery = open || o.status === "approved";
  // The accountant or the manager approves; then the warehouse keeper prepares; the invoice comes at delivery.
  const canAccept = ["manager", "accountant"].includes(user.role) && (o.status === "pending" || o.status === "expired");
  // A keeper prepares only his own warehouse: the order of his warehouse (deciding where each line comes from),
  // or his part of an order split with the other warehouse. The manager can do any part.
  const myPartWaits = !!o.prep_parts?.some((p) => !p.prepared_by && (user.role === "manager" || p.warehouse_id === user.warehouse_id));
  const canPrepare =
    o.status === "approved" && !o.delivery && (o.prep_parts ? myPartWaits : user.role === "manager" || (user.role === "warehouse" && (!user.warehouse_id || user.warehouse_id === o.warehouse_id)));
  const canApprove = user.role === "manager" && o.status === "needs_approval";
  const canCancel = (beforeDelivery && (user.role === "manager" || user.role === "accountant")) || (open && o.created_by.id === user.id);
  const canEditDiscount = open && (user.role === "manager" || (user.role === "rep" && o.rep_id === user.id) || user.role === "accountant");
  const waitsFor = o.approval_for ?? ["debt"];
  // The shop owner changes his own order until the warehouse confirms it.
  const canEditLines = open && user.role === "shop" && user.customer_id === o.customer_id;

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
            {tr("طلب", "Order")} <span className="num">{o.number}</span> <OrderStatusBadge status={o.status} waiting={o.waiting_stock} />
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
            {canEditLines && (
              <Button
                variant="action"
                onClick={() => {
                  // The lines go into his store's bag; he changes them there and saves.
                  editOrderInBag(user.id, o.customer_id, o);
                  router.push("/shop");
                }}
              >
                <Pencil className="size-4" /> {tr("تعديل الطلب", "Change the order")}
              </Button>
            )}
            {canCancel && (
              <Button variant="danger" onClick={() => setCancel(true)}>
                <Ban className="size-4" /> {tr("إلغاء الطلب", "Cancel order")}
              </Button>
            )}
            {canApprove && (
              <Button
                variant="action"
                loading={busy === "approve"}
                onClick={() => act("approve", () => api.approveOrder(o.id), tr("تمت الموافقة، وأصبح الطلب بانتظار التثبيت", "Approved. The order now waits to be confirmed"))}
              >
                <ShieldCheck className="size-4" /> {waitsFor.includes("debt") ? tr("موافقة على تجاوز السقف", "Approve over limit") : tr("موافقة على الخصم", "Approve the discount")}
              </Button>
            )}
            {canAccept && (
              <Button
                variant="action"
                loading={busy === "accept"}
                onClick={() => act("accept", () => api.acceptOrder(o.id), tr("اعتُمد الطلب، ويجهزه المخزن الآن", "Approved. The warehouse prepares it now"))}
              >
                <CheckCircle2 className="size-4" /> {tr("اعتماد الطلب", "Approve the order")}
              </Button>
            )}
            {canPrepare &&
              (o.prep_parts ? (
                <Button variant="action" loading={busy === "part"} onClick={() => act("part", () => api.prepareOrder(o.id, {}), tr("جُهّز جزء مخزنك", "Your warehouse's part is prepared"))}>
                  <PackageCheck className="size-4" /> {tr("جهّزتُ جزء مخزني", "My warehouse's part is ready")}
                </Button>
              ) : (
                <Button variant="action" onClick={() => setPreparing(true)}>
                  <PackageCheck className="size-4" /> {tr("تجهيز الطلب", "Prepare the order")}
                </Button>
              ))}
          </>
        }
      />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_340px]">
        <div className="space-y-4">
          {o.delivery && <DeliveryPanel order={o} role={user.role} shop={c?.name ?? ""} rep={o.delivery.rep?.name ?? rep?.name ?? ""} area={c?.area} />}
          {o.delivery?.status === "out" && c && <ShipmentTracker order={o} shop={c} warehouse={wh} live={locations[o.delivery.rep?.id ?? o.rep_id]} />}
          {o.status === "needs_approval" && (
            <Notice
              tone="warning"
              title={
                waitsFor.includes("debt") && waitsFor.includes("discount")
                  ? tr(`يتجاوز سقف دين الزبون، وفيه خصم ${o.discount?.percent}%`, `Over the debt limit, with a ${o.discount?.percent}% discount`)
                  : waitsFor.includes("discount")
                    ? tr(`فيه خصم ${o.discount?.percent}%: أكثر مما يعطيه المندوب أو المحاسب وحده (3%)`, `It has a ${o.discount?.percent}% discount: more than a rep or accountant gives alone (3%)`)
                    : tr("هذا الطلب يتجاوز سقف دين الزبون", "This order passes the customer's debt limit")
              }
            >
              {user.role === "manager"
                ? tr("وافق عليه إذا كنت تثق بالزبون، أو ألغِه.", "Approve it if you trust the customer, or cancel it.")
                : tr("ينتظر موافقة المدير، والكمية محجوزة حتى ذلك الحين.", "Waiting for the manager. The stock stays held until then.")}
            </Notice>
          )}
          {o.status === "expired" && o.waiting_stock && (
            <Notice tone="warning" title={tr("بانتظار توفر البضاعة", "Waiting for the goods")}>
              {tr(
                "سُجّل بدون إنترنت، ولم تكن البضاعة متوفرة عند المزامنة، فلم يُحجز شيء. يعتمده المحاسب أو المدير عندما تصل البضاعة.",
                "Written offline; the goods weren't there when it synced, so nothing is held. The accountant or manager approves it when the goods come.",
              )}
            </Notice>
          )}
          {o.status === "expired" && !o.waiting_stock && (
            <Notice tone="danger" title={tr("انتهى وقت الحجز", "The hold time ended")}>
              {tr(
                "مرّت 24 ساعة دون اعتماد، فعادت الكمية إلى المخزون. يمكن اعتماده إذا كانت البضاعة لا تزال موجودة.",
                "24 hours passed without approval, so the stock was released. It can still be approved if the goods are there.",
              )}
            </Notice>
          )}
          {o.status === "cancelled" && (
            <Notice tone="danger" title={tr("الطلب ملغي", "Cancelled")}>
              {o.cancel_reason}
            </Notice>
          )}
          {o.status === "pending" && (
            <Notice tone="primary" title={tr("بانتظار الاعتماد", "Waiting for approval")}>
              {tr("يعتمده المحاسب أو المدير، والكمية محجوزة حتى ينتهي وقت الحجز.", "The accountant or the manager approves it. The goods are held until the hold time ends.")}
            </Notice>
          )}
          {o.status === "approved" && (
            <Notice tone="primary" title={tr(`معتمد${o.accepted_by ? ` · ${o.accepted_by.name}` : ""}`, `Approved${o.accepted_by ? ` · ${o.accepted_by.name}` : ""}`)}>
              {!o.delivery
                ? tr("البضاعة محجوزة له حتى التسليم، وينتظر أن يجهزه المخزن.", "The goods are held until delivery; the warehouse prepares it.")
                : tr("جُهّز. تصدر الفاتورة ويثبت الدين عند التسليم للمحل.", "Prepared. The invoice and the debt come at delivery.")}
            </Notice>
          )}
          {o.prep_parts && o.prep_parts.length > 1 && !o.delivery && (
            <Notice tone="warning" title={tr("يُجهَّز من المخزنين", "Prepared from both warehouses")}>
              {o.prep_parts.map((p) => (
                <span key={p.warehouse_id} className="me-3 inline-block">
                  {name(lookups.warehouses.find((w) => w.id === p.warehouse_id))}:{" "}
                  {p.prepared_by ? tr(`جاهز (${p.prepared_by.name})`, `ready (${p.prepared_by.name})`) : tr("ينتظر أمينه", "waits for its keeper")}
                </span>
              ))}
              <span className="block text-xs">
                {tr("كل أمين يجهّز جزء مخزنه فقط، ويُصنع ملصق الشحنة عندما يجهز الجزآن.", "Each keeper prepares only his own part; the label is made when both are ready.")}
              </span>
            </Notice>
          )}
          {o.short_lines && o.short_lines.length > 0 && (
            <Notice tone="warning" title={tr("سُلِّم جزء من الطلب", "Part of the order was delivered")} href={o.rest_order_id ? `/orders/${o.rest_order_id}` : undefined}>
              {tr("الفاتورة على ما سُلِّم فقط. ", "The invoice is for what was delivered only. ")}
              {o.rest_order_id ? <b>{tr("الباقي في طلب مفتوح", "The rest is an open order")}</b> : tr("وأُلغي الباقي برغبة المحل.", "The rest was cancelled at the shop's wish.")}
            </Notice>
          )}
          {o.parent_id && (
            <Notice tone="primary" href={`/orders/${o.parent_id}`}>
              {tr("هذا الطلب هو باقي طلب سابق سُلِّم جزء منه.", "This order carries on the rest of an earlier order that was partly delivered.")}
            </Notice>
          )}
          {open && o.reserved_until && <Countdown until={o.reserved_until} />}

          <Card>
            <CardHeader title={tr("المواد", "Items")} subtitle={`${tr("يخرج من", "From")} ${name(wh)}`} />
            <ul className="divide-y divide-line">
              {plan.map(({ line: l, use, short }) => {
                const it = itemById.get(l.item_id);
                return (
                  <li key={`${l.item_id}-${l.unit}`} className="box-row px-4 py-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="font-medium">
                          <RefLink main href={`/items/${l.item_id}`}>
                            {name(it)}
                          </RefLink>
                        </p>
                        <p className="text-xs text-muted">
                          <span className="num">{l.qty}</span> {l.unit === "carton" ? tr("كارتون", "carton") : tr("قطعة", "piece")} × <span className="num">{money(l.unit_price)}</span>
                          {it && l.unit === "carton" && (
                            <span>
                              {" "}
                              · {it.pieces_per_carton * l.qty} {tr("قطعة", "pcs")}
                            </span>
                          )}
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
                        {short && <Badge tone="danger">{tr("الكمية غير كافية في المخزن", "Not enough on the shelf")}</Badge>}
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
            <OrderTotals order={o} role={user.role} canEdit={canEditDiscount} onChanged={order.reload} />
          </Card>
          {seesBatches && open && (
            <p className="text-xs text-muted">
              {tr("الدفعات المعروضة هي التي ستُصرف عند التثبيت: الأقدم صلاحية أولاً، والمنتهية لا تُصرف أبداً.", "The batches shown will leave on confirm: oldest expiry first, expired never.")}
            </p>
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
            {/* The name block opens the customer's file from anywhere in it; the phone calls. */}
            <div className="box-row -m-2 rounded-xl p-2">
              <p className="text-xs text-muted">{tr("الزبون", "Customer")}</p>
              <p className="text-lg font-semibold">
                <RefLink main href={c && `/customers/${c.id}`}>
                  {c?.name ?? "…"}
                </RefLink>
              </p>
              {c && (
                <p className="text-sm text-muted">
                  {c.owner_name} ·{" "}
                  <RefLink href={user.role === "shop" ? undefined : `tel:${c.phone}`} className="text-muted">
                    <span dir="ltr">{c.phone}</span>
                  </RefLink>
                </p>
              )}
            </div>
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
            {c && user.role !== "shop" && user.role !== "warehouse" && user.role !== "staff" && (
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
                act(
                  "cancel",
                  () => api.cancelOrder(o.id, reason),
                  tr("أُلغي الطلب وعادت الكمية إلى المخزون", "Cancelled. Stock released"),
                  () => {
                    setCancel(false);
                    setReason("");
                  },
                )
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
      {preparing && o && <PrepareOrder order={o} onClose={() => setPreparing(false)} onDone={order.reload} />}
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
        {tr("الكمية محجوزة لهذا الطلب حتى", "Stock is held for this order until")} <b className="num">{time(until)}</b> ·{" "}
        <span className="num font-semibold text-primary-ink" dir="ltr">
          {h}:{String(m).padStart(2, "0")}:{String(s).padStart(2, "0")}
        </span>
      </span>
    </div>
  );
}
