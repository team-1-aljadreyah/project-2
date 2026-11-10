"use client";

// Deliveries. The delivery rep's flow, so no delivery can be faked:
//   at the warehouse: scan the shipment's QR → it is "out" with him (his name and the time are recorded);
//   at the shop: photo of the packages + the PIN only the shop owner has → "delivered".
// The manager, the warehouse keeper and the accountant see every shipment here (they don't deliver).
import Link from "next/link";
import { useMemo, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { CheckCircle2, KeyRound, Lock, MapPin, PackageCheck, QrCode, Truck, Warehouse } from "lucide-react";
import { PhotoCapture } from "@/components/delivery/photo";
import { QrScanner } from "@/components/delivery/scanner";
import { DeliveryChip } from "@/components/delivery/status";
import { useApp } from "@/components/shell";
import { Button, Dialog, Empty, ErrorBox, Input, LoadingRows, Money, PageHeader, Segmented, errorText, useToast } from "@/components/ui";
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
  const cust = useMemo(() => new Map((customers.data ?? []).map((c) => [c.id, c])), [customers.data]);

  if (orders.state.status === "error") return <ErrorBox error={orders.state.error} onRetry={orders.reload} />;
  const withDelivery = (orders.data ?? []).filter((o) => o.delivery);
  const list = (t: Tab) =>
    withDelivery.filter((o) => o.delivery!.status === t && (t !== "delivered" || dayOfIso(o.delivery!.delivered_at ?? "") >= today(-6)));
  const shown = list(tab);

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

  return (
    <>
      <PageHeader
        title={tr("التوصيل", "Deliveries")}
        subtitle={tr("امسح QR الشحنة في المخزن، وسلّمها بصورة ورمز استلام من صاحب المحل", "Scan the shipment's QR at the warehouse; deliver it with a photo and the shop owner's PIN")}
        actions={
          isRep && (
            <Button variant="action" size="lg" onClick={() => setScan(true)}>
              <QrCode className="size-5" /> {tr("امسح QR", "Scan QR")}
            </Button>
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
            {shown.map((o, i) => {
              const c = cust.get(o.customer_id);
              const d = o.delivery!;
              return (
                <motion.article
                  key={o.id}
                  layout
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0, transition: { delay: Math.min(i, 8) * 0.04 } }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  className={cn("rounded-2xl border bg-card p-4", d.locked ? "border-danger/40" : "border-line")}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <Link href={`/orders/${o.id}`} className="font-bold hover:underline">
                        {c?.name ?? `#${o.customer_id}`}
                      </Link>
                      <p className="flex items-center gap-1 text-xs text-muted">
                        <MapPin className="size-3" /> {c?.area ?? ""} · <span className="num" dir="ltr">{o.number}</span>
                      </p>
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
                  {isRep && d.status === "out" && (
                    <Button variant="action" className="mt-3 w-full" disabled={d.locked} onClick={() => setHanding(o)}>
                      {d.locked ? <Lock className="size-4" /> : <PackageCheck className="size-4" />}
                      {d.locked ? tr("مقفلة: اتصل بالمدير", "Locked: call the manager") : tr("تسليم للمحل", "Deliver to the shop")}
                    </Button>
                  )}
                  {isRep && d.status === "ready" && <p className="mt-3 rounded-lg bg-card-2 px-3 py-2 text-xs text-muted">{tr("امسح QR الملصق عند استلامها من المخزن", "Scan the label's QR when you take it")}</p>}
                </motion.article>
              );
            })}
          </AnimatePresence>
        </div>
      )}

      {scan && <QrScanner busy={busy} onClose={() => setScan(false)} onCode={dispatch} />}
      {handing && <HandOver order={handing} shop={cust.get(handing.customer_id)?.name ?? ""} onClose={() => setHanding(null)} />}
    </>
  );
}

/** At the shop: 1) photo of the packages, 2) the shop owner's PIN. Both are needed. */
function HandOver({ order, shop, onClose }: { order: Order; shop: string; onClose: () => void }) {
  const { tr } = useFmt();
  const toast = useToast();
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
      const r = await api.deliverOrder(order.id, { pin, photo });
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
          <p className="text-sm text-muted">{tr("سُجّل الرمز والصورة والوقت.", "The PIN, the photo and the time are recorded.")}</p>
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
          {msg && <p className={cn("rounded-xl p-3 text-sm font-medium", msg.tone === "danger" ? "bg-danger-soft text-danger" : "bg-warning-soft text-warning")}>{msg.text}</p>}
        </div>
      )}
    </Dialog>
  );
}
