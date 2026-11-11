"use client";

// Deliveries. The delivery rep's flow, so no delivery can be faked:
//   at the warehouse: scan the shipment's QR → it is "out" with him (his name and the time are recorded);
//   at the shop: photo of the packages + the PIN only the shop owner has → "delivered".
// He can pick several shops for one trip (in driving order), and report when he can't deliver (an accident,
// the shop closed...): the manager is told, and the manager / warehouse keeper can take the shipment back.
// The manager, the warehouse keeper and the accountant see every shipment here (they don't deliver).
import Link from "next/link";
import { useMemo, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { AlertTriangle, CheckCircle2, CheckSquare, KeyRound, Lock, MapPin, PackageCheck, QrCode, Route, Square, Truck, Warehouse } from "lucide-react";
import { PhotoCapture } from "@/components/delivery/photo";
import { ProblemNote, ReportProblem } from "@/components/delivery/problem";
import { TripPanel, buildTrip, saveTrip, useTrip } from "@/components/delivery/trip";
import { QrScanner } from "@/components/delivery/scanner";
import { DeliveryChip } from "@/components/delivery/status";
import { useApp } from "@/components/shell";
import { inWarehouse, useWarehouseFilter } from "@/components/warehouse-filter";
import { Button, Dialog, Empty, ErrorBox, Input, LoadingRows, Money, PageHeader, Segmented, Stepper, errorText, useToast, Pager, usePages } from "@/components/ui";
import { api } from "@/lib/api";
import type { Order } from "@/lib/api/types";
import { useFmt } from "@/lib/i18n";
import { useLoad } from "@/lib/use-load";
import { cn, dayOfIso, today } from "@/lib/utils";

type Tab = "ready" | "out" | "delivered";

export default function DeliveriesPage() {
  const { tr, ago, num } = useFmt();
  const { user } = useApp();
  const toast = useToast();
  const isRep = user.role === "rep";
  const orders = useLoad(() => api.listOrders(), []);
  const customers = useLoad(() => api.listCustomers().catch(() => []), []);
  const [tab, setTab] = useState<Tab>(isRep ? "out" : "ready");
  const [scan, setScan] = useState(false);
  const [busy, setBusy] = useState(false);
  const [handing, setHanding] = useState<Order | null>(null);
  const [reporting, setReporting] = useState<Order[] | null>(null);
  // Picking shops for a trip: the shops ticked so far (saved as the trip when he presses "start").
  const [picking, setPicking] = useState<number[] | null>(null);
  const trip = useTrip(user.id);
  const whFilter = useWarehouseFilter();
  const cust = useMemo(() => new Map((customers.data ?? []).map((c) => [c.id, c])), [customers.data]);

  const withDelivery = (orders.data ?? []).filter((o) => o.delivery && inWarehouse(whFilter, o.warehouse_id));
  const list = (t: Tab) =>
    withDelivery.filter((o) => o.delivery!.status === t && (t !== "delivered" || dayOfIso(o.delivery!.delivered_at ?? "") >= today(-6)));
  // Shipments with a problem first, so nobody misses them.
  const shown = list(tab).sort((a, b) => Number(!!b.delivery!.problem) - Number(!!a.delivery!.problem));
  const pg = usePages(shown, 12);
  const mineOut = isRep ? list("out") : [];
  // Shops he can put in a trip: their shipments are with him, or ready at the warehouse for him to take.
  const tripable = isRep ? [...list("out"), ...list("ready")] : [];
  const tripShops = new Set(tripable.map((o) => o.customer_id));
  const stops = isRep && trip.length ? buildTrip(trip, withDelivery, cust, today()) : [];
  const toggle = (customerId: number) => setPicking((p) => (p ? (p.includes(customerId) ? p.filter((x) => x !== customerId) : [...p, customerId]) : p));

  async function dispatch(code: string) {
    setBusy(true);
    try {
      const o = await api.dispatchDelivery(code);
      setScan(false);
      setTab("out");
      toast("success", tr(`استلمت الشحنة ${o.number}: هي الآن معك في الطريق`, `Shipment ${o.number} is now out with you`));
    } catch (e) {
      toast("danger", errorText(e, tr));
    } finally {
      setBusy(false);
    }
  }

  if (orders.state.status === "error") return <ErrorBox error={orders.state.error} onRetry={orders.reload} />;
  return (
    <>
      <PageHeader
        title={tr("التوصيل", "Deliveries")}
        subtitle={tr("امسح QR الشحنة في المخزن، وسلّمها بصورة ورمز استلام من صاحب المحل", "Scan the shipment's QR at the warehouse; deliver it with a photo and the shop owner's PIN")}
        actions={
          isRep && (
            <>
              {mineOut.length > 0 && (
                <Button variant="danger" size="lg" onClick={() => setReporting(mineOut)}>
                  <AlertTriangle className="size-5" /> {tr("تعذّر التسليم", "Can't deliver")}
                </Button>
              )}
              <Button variant="action" size="lg" onClick={() => setScan(true)}>
                <QrCode className="size-5" /> {tr("امسح QR", "Scan QR")}
              </Button>
            </>
          )
        }
      />

      {isRep && (
        <motion.button
          type="button"
          whileTap={{ scale: 0.98 }}
          onClick={() => setScan(true)}
          className="brand-panel relative mb-4 flex w-full items-center gap-4 overflow-hidden rounded-3xl p-5 text-start sm:hidden"
        >
          <span className="flex size-14 items-center justify-center rounded-2xl bg-action text-on-action">
            <QrCode className="size-7" />
          </span>
          <span>
            <span className="block text-lg font-bold">{tr("استلام شحنة من المخزن", "Take a shipment")}</span>
            <span className="block text-sm opacity-80">{tr("امسح رمز QR على الملصق", "Scan the QR on the label")}</span>
          </span>
          <span className="hazard absolute inset-x-0 bottom-0 h-1.5" aria-hidden />
        </motion.button>
      )}

      {stops.length > 0 && !picking && (
        <TripPanel
          stops={stops}
          onDeliver={setHanding}
          onProblem={setReporting}
          onEnd={() => saveTrip(user.id, [])}
        />
      )}

      <Segmented
        className="mb-4"
        value={tab}
        onChange={setTab}
        options={[
          { value: "ready", label: tr("في المخزن", "At the warehouse"), count: list("ready").length },
          { value: "out", label: tr("في الطريق", "On the way"), count: list("out").length },
          { value: "delivered", label: tr("سُلِّمت (7 أيام)", "Delivered (7 days)"), count: list("delivered").length },
        ]}
      />

      {/* Pick several shops for one trip */}
      {/* Pick several shops for one trip: always in sight for a delivery rep */}
      {isRep && (tab === "out" || tab === "ready") && !picking && (
        tripShops.size > 1 ? (
          <div className="mb-3 flex flex-wrap items-center gap-3 rounded-2xl border border-action/40 bg-action/10 p-3">
            <Route className="size-5 shrink-0 text-action" />
            <p className="min-w-0 flex-1 text-sm">
              {stops.length
                ? tr("جولتك جاهزة في الأعلى. يمكنك تغيير محلاتها.", "Your trip is above. You can change its shops.")
                : tr(`عندك شحنات لـ ${num(tripShops.size)} محلات: اخترها لجولة واحدة مرتبة منطقةً بعد منطقة.`, `You have shipments for ${num(tripShops.size)} shops: pick them for one trip, area by area.`)}
            </p>
            <Button variant="action" onClick={() => setPicking(stops.length ? trip.filter((id) => tripShops.has(id)) : [])}>
              {stops.length ? tr("عدّل محلات الجولة", "Change the trip's shops") : tr("اختر محلات الجولة", "Pick the trip's shops")}
            </Button>
          </div>
        ) : (
          <p className="mb-3 flex items-center gap-2 rounded-2xl bg-card-2 p-3 text-xs text-muted">
            <Route className="size-4 shrink-0" />
            {tr("عندما تكون عندك شحنات لمحلين أو أكثر، تستطيع اختيارها هنا لجولة توصيل واحدة.", "When you have shipments for two shops or more, you can pick them here for one delivery trip.")}
          </p>
        )
      )}

      {orders.state.status === "loading" ? (
        <LoadingRows />
      ) : !shown.length ? (
        <Empty
          icon={tab === "ready" ? <Warehouse className="size-6" /> : tab === "out" ? <Truck className="size-6" /> : <PackageCheck className="size-6" />}
          title={tab === "ready" ? tr("لا توجد شحنات بانتظار الاستلام", "No shipments waiting") : tab === "out" ? tr("لا توجد شحنات في الطريق", "Nothing on the way") : tr("لا توجد شحنات مُسلَّمة", "No deliveries yet")}
        />
      ) : (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
          <AnimatePresence initial={false}>
            {pg.shown.map((o, i) => {
              const c = cust.get(o.customer_id);
              const d = o.delivery!;
              return (
                <motion.article
                  key={o.id}
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0, transition: { delay: Math.min(i, 8) * 0.04 } }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  className={cn("rounded-2xl border bg-card p-4", d.locked || d.problem ? "border-danger/40" : picking?.includes(o.customer_id) ? "border-action ring-2 ring-action/30" : "border-line")}
                >
                  {picking && (d.status === "out" || d.status === "ready") && (
                    <button
                      type="button"
                      onClick={() => toggle(o.customer_id)}
                      aria-pressed={picking.includes(o.customer_id)}
                      className={cn("mb-3 flex w-full items-center gap-2 rounded-xl px-3 py-2 text-sm font-semibold", picking.includes(o.customer_id) ? "bg-action/15 text-text" : "bg-card-2 text-muted")}
                    >
                      {picking.includes(o.customer_id) ? <CheckSquare className="size-5 text-action" /> : <Square className="size-5" />}
                      {picking.includes(o.customer_id) ? tr("ضمن الجولة", "In the trip") : tr("أضِفه إلى الجولة", "Add to the trip")}
                    </button>
                  )}
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <Link href={`/orders/${o.id}`} className="font-bold hover:underline">
                        {c?.name ?? `#${o.customer_id}`}
                      </Link>
                      <p className="flex items-center gap-1 text-xs text-muted">
                        <MapPin className="size-3" /> {c?.area ?? ""} · <span className="num" dir="ltr">{o.number}</span>
                      </p>
                      {c?.address_info?.lat !== undefined && (
                        <a
                          href={`https://www.google.com/maps/dir/?api=1&destination=${c.address_info.lat},${c.address_info.lng}`}
                          target="_blank"
                          rel="noreferrer"
                          className="mt-1 inline-flex items-center gap-1 rounded-full bg-action/10 px-2 py-0.5 text-[11px] font-semibold text-action"
                        >
                          <MapPin className="size-3" /> {tr("الموقع", "Location")}
                          {c.address_info.landmark ? ` · ${c.address_info.landmark}` : ""}
                        </a>
                      )}
                    </div>
                    <DeliveryChip d={d} tr={tr} />
                  </div>
                  <div className="mt-3 flex items-end justify-between gap-2">
                    <div className="text-xs text-muted">
                      <p>
                        {num(o.lines.length)} {tr("مواد", "items")}
                      </p>
                      {d.out_at && d.status === "out" && <p>{tr(`خرجت ${ago(d.out_at)} مع ${d.out_by?.name ?? ""}`, `Out ${ago(d.out_at)} with ${d.out_by?.name ?? ""}`)}</p>}
                      {d.delivered_at && <p>{tr(`سُلِّمت ${ago(d.delivered_at)}`, `Delivered ${ago(d.delivered_at)}`)}</p>}
                    </div>
                    <Money value={o.total} className="font-bold" />
                  </div>
                  <ProblemNote order={o} role={user.role} onChanged={orders.reload} className="mt-3" />
                  {isRep && d.status === "out" && !picking && (
                    <div className="mt-3 flex gap-2">
                      <Button variant="action" className="flex-1" disabled={d.locked} onClick={() => setHanding(o)}>
                        {d.locked ? <Lock className="size-4" /> : <PackageCheck className="size-4" />}
                        {d.locked ? tr("مقفلة: اتصل بالمدير", "Locked: call the manager") : tr("تسليم للمحل", "Deliver to the shop")}
                      </Button>
                      <Button variant="danger" onClick={() => setReporting([o])} aria-label={tr("تعذّر التسليم", "Can't deliver")} title={tr("تعذّر التسليم", "Can't deliver")}>
                        <AlertTriangle className="size-4" />
                      </Button>
                    </div>
                  )}
                  {isRep && d.status === "ready" && <p className="mt-3 rounded-lg bg-card-2 px-3 py-2 text-xs text-muted">{tr("امسح QR الملصق عند استلامها من المخزن", "Scan the label's QR when you take it")}</p>}
                </motion.article>
              );
            })}
          </AnimatePresence>
        </div>
      )}
      <Pager {...pg} sizes={[12, 24, 48]} className="mt-2" />

      {/* While picking: how many shops, start / cancel (above the phone's bottom bar) */}
      {picking && (
        <div className="fixed inset-x-0 bottom-16 z-40 px-4 md:bottom-4 md:start-64">
          <div className="mx-auto flex max-w-xl items-center gap-2 rounded-2xl border border-line bg-card p-2 shadow-2xl">
            <p className="flex-1 px-2 text-sm font-semibold">{tr(`${num(picking.length)} محلات في الجولة`, `${num(picking.length)} shops in the trip`)}</p>
            <Button variant="ghost" onClick={() => setPicking(null)}>
              {tr("إلغاء", "Cancel")}
            </Button>
            <Button
              variant="action"
              disabled={!picking.length}
              onClick={() => {
                saveTrip(user.id, picking);
                setPicking(null);
                window.scrollTo({ top: 0, behavior: "smooth" });
              }}
            >
              <Route className="size-4" /> {tr("ابدأ الجولة", "Start the trip")}
            </Button>
          </div>
        </div>
      )}
      {picking && <div className="h-20" aria-hidden />}

      {scan && <QrScanner busy={busy} onClose={() => setScan(false)} onCode={dispatch} />}
      {reporting && reporting.length > 0 && <ReportProblem orders={reporting} onClose={() => setReporting(null)} onDone={orders.reload} />}
      {handing && <HandOver order={handing} shop={cust.get(handing.customer_id)?.name ?? ""} onClose={() => setHanding(null)} />}
    </>
  );
}

/** At the shop: 1) photo of the packages, 2) the shop owner's PIN. Both are needed. */
function HandOver({ order, shop, onClose }: { order: Order; shop: string; onClose: () => void }) {
  const { tr, name } = useFmt();
  const { itemById } = useApp();
  const toast = useToast();
  // What the shop takes: everything by default; less if it refuses part of it (the invoice is for what it took).
  const [got, setGot] = useState<Record<string, number>>(() => Object.fromEntries(order.lines.map((l) => [`${l.item_id}-${l.unit}`, l.qty])));
  const [rest, setRest] = useState<"keep" | "cancel">("keep");
  const partial = order.lines.some((l) => (got[`${l.item_id}-${l.unit}`] ?? l.qty) < l.qty);
  const [photo, setPhoto] = useState<string | null>(null);
  const [pin, setPin] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ tone: "danger" | "warning"; text: string } | null>(null);
  const [done, setDone] = useState(false);

  async function send() {
    if (!photo || pin.length !== 4) return;
    setBusy(true);
    setMsg(null);
    try {
      const r = await api.deliverOrder(order.id, {
        pin,
        photo,
        ...(partial ? { lines: order.lines.map((l) => ({ item_id: l.item_id, unit: l.unit, qty: got[`${l.item_id}-${l.unit}`] ?? l.qty })), rest } : {}),
      });
      if (r.ok) {
        setDone(true);
        toast("success", tr(`تم تسليم ${order.number} إلى ${shop}`, `${order.number} delivered to ${shop}`));
        setTimeout(onClose, 1400);
      } else {
        setPin("");
        setMsg(
          r.locked
            ? { tone: "danger", text: tr("الشحنة قُفلت بعد 5 رموز خاطئة، وأُبلغ المدير.", "The shipment is locked after 5 wrong PINs; the manager was told.") }
            : { tone: "warning", text: tr(`رمز الاستلام غير صحيح. باقي ${r.left} محاولات.`, `Wrong PIN. ${r.left} tries left.`) },
        );
      }
    } catch (e) {
      setMsg({ tone: "danger", text: errorText(e, tr) });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog
      open
      onClose={onClose}
      title={tr(`تسليم ${order.number} · ${shop}`, `Deliver ${order.number} · ${shop}`)}
      footer={
        !done && (
          <Button variant="action" size="lg" className="w-full" disabled={!photo || pin.length !== 4 || busy} onClick={send}>
            <CheckCircle2 className="size-5" /> {tr("تأكيد التسليم", "Confirm delivery")}
          </Button>
        )
      }
    >
      {done ? (
        <motion.div initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="flex flex-col items-center gap-2 py-8 text-center">
          <CheckCircle2 className="size-14 text-success" />
          <p className="text-lg font-bold">{tr("تم التسليم", "Delivered")}</p>
          <p className="text-sm text-muted">{tr("سُجّل الرمز والصورة والوقت، وصدرت الفاتورة على ما استُلم.", "The PIN, the photo and the time are recorded; the invoice is made for what was taken.")}</p>
        </motion.div>
      ) : (
        <div className="space-y-5">
          <section>
            <p className="mb-2 flex items-center gap-2 text-sm font-bold">
              <span className="flex size-6 items-center justify-center rounded-full bg-action text-xs text-on-action">1</span>
              {tr("صوّر الشحنة", "Photo of the packages")}
            </p>
            <PhotoCapture value={photo} onChange={setPhoto} />
          </section>
          <section>
            <p className="mb-2 flex items-center gap-2 text-sm font-bold">
              <span className="flex size-6 items-center justify-center rounded-full bg-action text-xs text-on-action">2</span>
              {tr("رمز الاستلام من صاحب المحل", "The shop owner's PIN")}
            </p>
            <div className="relative">
              <KeyRound className="pointer-events-none absolute start-3 top-1/2 size-5 -translate-y-1/2 text-faint" />
              <Input
                inputMode="numeric"
                dir="ltr"
                autoComplete="off"
                maxLength={4}
                value={pin}
                onChange={(e) => setPin(e.target.value.replace(/[٠-٩]/g, (x) => String("٠١٢٣٤٥٦٧٨٩".indexOf(x))).replace(/\D/g, "").slice(0, 4))}
                placeholder="• • • •"
                className="num h-14 ps-11 text-center text-2xl tracking-[0.6em]"
                aria-label={tr("رمز الاستلام", "Delivery PIN")}
              />
            </div>
            <p className="mt-1 text-xs text-muted">{tr("صاحب المحل يرى الرمز في تطبيقه فقط. اطلبه بعد أن يتأكد من البضاعة.", "Only the shop owner sees it in his app. Ask for it after he checks the goods.")}</p>
          </section>
          <section>
            <p className="mb-2 flex items-center gap-2 text-sm font-bold">
              <span className="flex size-6 items-center justify-center rounded-full bg-action text-xs text-on-action">3</span>
              {tr("ما استلمه المحل", "What the shop took")}
            </p>
            <ul className="divide-y divide-line rounded-xl border border-line">
              {order.lines.map((l) => {
                const k = `${l.item_id}-${l.unit}`;
                return (
                  <li key={k} className="flex items-center justify-between gap-2 px-3 py-2">
                    <span className="min-w-0 text-sm">
                      <span className="block truncate font-medium">{name(itemById.get(l.item_id))}</span>
                      <span className="text-xs text-muted">
                        {tr("المطلوب", "Ordered")} <span className="num">{l.qty}</span> {l.unit === "carton" ? tr("كارتون", "ctn") : tr("قطعة", "pc")}
                      </span>
                    </span>
                    <Stepper value={got[k] ?? l.qty} onChange={(v) => setGot((g) => ({ ...g, [k]: v }))} min={0} max={l.qty} />
                  </li>
                );
              })}
            </ul>
            {partial && (
              <div className="mt-2 rounded-xl bg-warning-soft p-3 text-sm">
                <p className="font-semibold text-warning">{tr("تسليم جزئي: الفاتورة على ما استُلم فقط. والباقي؟", "Partial: the invoice is for what was taken. And the rest?")}</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {(
                    [
                      ["keep", tr("يبقى طلباً مفتوحاً", "Stays an open order")],
                      ["cancel", tr("يُلغى برغبة المحل", "Cancel it (shop's wish)")],
                    ] as const
                  ).map(([v, t]) => (
                    <button key={v} type="button" onClick={() => setRest(v)} aria-pressed={rest === v} className={cn("rounded-full border px-3 py-1 text-xs font-semibold", rest === v ? "border-action bg-card text-text" : "border-line text-muted")}>
                      {t}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </section>
          {msg && <p className={cn("rounded-xl p-3 text-sm font-medium", msg.tone === "danger" ? "bg-danger-soft text-danger" : "bg-warning-soft text-warning")}>{msg.text}</p>}
        </div>
      )}
    </Dialog>
  );
}
