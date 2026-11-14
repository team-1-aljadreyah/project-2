"use client";

// Where a shipment is, the same on every page, and the delivery block of the order page.
import { useState } from "react";
import { motion } from "motion/react";
import { Banknote, Check, Clock, Container, KeyRound, Lock, PackageCheck, ShieldCheck, Truck, Warehouse } from "lucide-react";
import { Button, Card, Money, errorText, useToast } from "@/components/ui";
import { api } from "@/lib/api";
import type { Delivery, DoorPayment, Order, Role } from "@/lib/api/types";
import { useFmt, type Tr } from "@/lib/i18n";
import { useLoad } from "@/lib/use-load";
import { cn } from "@/lib/utils";
import { ProblemNote } from "./problem";
import { PrintButton, ShipmentLabel } from "./qr";

export function deliveryLabel(d: Delivery, tr: Tr) {
  if (d.locked) return tr("مقفلة: رموز خاطئة", "Locked: wrong PINs");
  if (d.problem && d.status === "out") return tr("تعذّر التسليم", "Couldn't deliver");
  if (d.status === "ready" && d.loaded_at) return tr("محمّلة في السيارة", "Loaded in the van");
  return { ready: tr("جاهزة في المخزن", "Ready at the warehouse"), out: tr("في الطريق", "On the way"), delivered: tr("تم التسليم", "Delivered") }[d.status];
}

export function DeliveryChip({ d, tr }: { d: Delivery; tr: Tr }) {
  const tone =
    d.locked || (d.problem && d.status === "out")
      ? "bg-danger-soft text-danger"
      : { ready: "bg-card-2 text-muted", out: "bg-warning-soft text-warning", delivered: "bg-success-soft text-success" }[d.status];
  return <span className={cn("inline-flex whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-semibold", tone)}>{deliveryLabel(d, tr)}</span>;
}

/** The shop owner's PIN, big. Shown only on his own screen (the server sends it to nobody else). */
export function PinCard({ pin, compact }: { pin: string; compact?: boolean }) {
  const { tr } = useFmt();
  return (
    <div className={cn("rounded-2xl border-2 border-action/40 bg-action/10", compact ? "p-3" : "p-4")}>
      <p className="flex items-center gap-1.5 text-xs font-semibold text-action">
        <KeyRound className="size-4" /> {tr("رمز الاستلام", "Delivery PIN")}
      </p>
      <p className="num mt-1 text-4xl font-bold tracking-[0.35em]" dir="ltr">
        {pin}
      </p>
      <p className="mt-1 text-xs text-muted">
        {tr("أعطه لمندوب التوصيل فقط بعد أن تستلم البضاعة وتتأكد أنها سليمة وكاملة.", "Give it to the delivery rep only after you get the goods complete and in good shape.")}
      </p>
    </div>
  );
}

/** The delivery block on the order page: the steps, the PIN (shop owner), the label (warehouse), the proof photo. */
export function DeliveryPanel({ order, role, shop, rep, area }: { order: Order; role: Role; shop: string; rep: string; area?: string }) {
  const { tr, dateTime } = useFmt();
  const toast = useToast();
  const d = order.delivery!;
  const photo = useLoad(() => (d.has_photo ? api.getDeliveryPhoto(order.id) : Promise.resolve(null)), [order.id, d.has_photo]);
  const [busy, setBusy] = useState(false);
  const steps = [
    { on: true, icon: Warehouse, t: tr("جاهزة في المخزن", "Ready at the warehouse"), s: tr("فُحصت البضاعة وطُبع ملصق QR للشحنة", "The goods were checked and the QR label printed") },
    {
      on: !!d.loaded_at || d.status !== "ready",
      icon: Container,
      t: tr("حُمّلت في سيارة التوصيل", "Loaded in the delivery van"),
      s: d.loaded_by ? `${d.loaded_by.name} · ${dateTime(d.loaded_at)}` : tr("يحمّلها موظف المخزن", "The warehouse staff load it"),
    },
    {
      on: d.status !== "ready",
      icon: Truck,
      t: tr("خرجت مع مندوب التوصيل", "Out with the delivery rep"),
      s: d.out_by ? `${d.out_by.name} · ${dateTime(d.out_at)} · ${tr("بمسح QR", "QR scanned")}` : tr("عند مسح QR في المخزن", "When the QR is scanned"),
    },
    {
      on: d.status === "delivered",
      icon: PackageCheck,
      t: tr("تم التسليم للمحل", "Delivered to the shop"),
      s: d.delivered_by ? `${d.delivered_by.name} · ${dateTime(d.delivered_at)}` : tr("برمز الاستلام وصورة الشحنة", "With the PIN and a photo"),
    },
  ];

  return (
    <Card className="p-4">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="flex items-center gap-1.5 font-bold">
          <Truck className="size-4 text-action" /> {tr("التوصيل", "Delivery")}
        </h2>
        <DeliveryChip d={d} tr={tr} />
      </div>

      <ol className="space-y-0">
        {steps.map((s, i) => (
          <li key={i} className="relative flex gap-3 pb-4 last:pb-0">
            {i < steps.length - 1 && <span className={cn("absolute start-[15px] top-8 h-[calc(100%-28px)] w-0.5", steps[i + 1].on ? "bg-success" : "bg-line")} aria-hidden />}
            <span className={cn("relative flex size-8 shrink-0 items-center justify-center rounded-full", s.on ? "bg-success text-white" : "bg-card-2 text-faint")}>
              {s.on ? <Check className="size-4" /> : <s.icon className="size-4" />}
            </span>
            <div className="min-w-0 pt-1">
              <p className={cn("text-sm font-semibold", !s.on && "text-muted")}>{s.t}</p>
              <p className="text-xs text-muted">{s.s}</p>
            </div>
          </li>
        ))}
      </ol>

      {d.status === "delivered" && (
        <div className="mt-3 space-y-2">
          {d.has_photo ? (
            <p className="flex items-center gap-1.5 text-xs font-semibold text-success">
              <ShieldCheck className="size-4" /> {tr("تم التحقق برمز الاستلام من صاحب المحل، وبصورة للشحنة", "Checked with the shop owner's PIN and a photo")}
            </p>
          ) : (
            <p className="text-xs text-muted">{tr("سُلِّمت قبل تفعيل نظام إثبات التسليم.", "Delivered before delivery proof was turned on.")}</p>
          )}
          {d.payment && <DoorPaid payment={d.payment} rep={d.delivered_by?.name ?? rep} role={role} />}
          {photo.data && (
            <motion.a initial={{ opacity: 0 }} animate={{ opacity: 1 }} href={photo.data} target="_blank" rel="noreferrer" className="block overflow-hidden rounded-xl border border-line">
              {/* eslint-disable-next-line @next/next/no-img-element -- a stored data URL */}
              <img src={photo.data} alt={tr("صورة الشحنة عند التسليم", "Photo of the packages at delivery")} className="max-h-64 w-full object-cover" />
            </motion.a>
          )}
        </div>
      )}

      <ProblemNote order={order} role={role} className="mt-3" />

      {/* The shop owner: his PIN, while the goods are on the way */}
      {role === "shop" && d.pin && d.status !== "delivered" && (
        <div className="mt-3">
          <PinCard pin={d.pin} />
        </div>
      )}

      {d.status === "ready" && !d.loaded_at && <LoadButton order={order} role={role} className="mt-3 w-full" />}

      {/* The warehouse and the manager: the label to print and stick on the packages, until they leave */}
      {(role === "warehouse" || role === "manager") && d.status === "ready" && (
        <div className="mt-3 space-y-2">
          <ShipmentLabel order={order} shop={shop} rep={rep} area={area} />
          <PrintButton order={order} shop={shop} rep={rep} area={area} />
        </div>
      )}

      {/* Locked: too many wrong PINs. Only the manager opens it again, after checking with the shop. */}
      {d.locked && (
        <div className="mt-3 rounded-xl bg-danger-soft p-3 text-sm text-danger">
          <p className="flex items-center gap-1.5 font-semibold">
            <Lock className="size-4" /> {tr("الشحنة مقفلة بعد 5 رموز استلام خاطئة", "Locked after 5 wrong PINs")}
          </p>
          {role === "manager" && (
            <Button
              size="sm"
              variant="danger"
              className="mt-2"
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                try {
                  await api.unlockDelivery(order.id);
                  toast("success", tr("فُتحت الشحنة: يستطيع مندوب التوصيل المحاولة من جديد", "Unlocked: the delivery rep can try again"));
                } catch (e) {
                  toast("danger", errorText(e, tr));
                } finally {
                  setBusy(false);
                }
              }}
            >
              {tr("تحققت من المحل: افتح الشحنة", "I checked with the shop: unlock")}
            </Button>
          )}
        </div>
      )}
      {!d.locked && d.status === "out" && d.pin_attempts > 0 && role !== "shop" && (
        <p className="mt-2 text-xs text-warning">{tr(`رموز خاطئة حتى الآن: ${d.pin_attempts} من 5`, `Wrong PINs so far: ${d.pin_attempts} of 5`)}</p>
      )}
    </Card>
  );
}

/**
 * "I loaded it": the warehouse staff (or its keeper, or the manager) put the checked shipment into the
 * delivery rep's van. The rep is told, then scans its label and chooses his trip.
 * Shown only while the shipment waits at the warehouse and only to those jobs.
 */
export function LoadButton({ order, role, className, onDone }: { order: Order; role: Role; className?: string; onDone?: () => void }) {
  const { tr } = useFmt();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const d = order.delivery;
  if (!d || d.status !== "ready" || !["staff", "warehouse", "manager"].includes(role)) return null;
  if (d.loaded_at)
    return (
      <span className={cn("inline-flex items-center gap-1 rounded-full bg-success-soft px-2 py-0.5 text-[11px] font-semibold text-success", className && "justify-center")}>
        <Check className="size-3.5" /> {tr(`حمّلها ${d.loaded_by?.name ?? ""}`, `Loaded by ${d.loaded_by?.name ?? ""}`)}
      </span>
    );
  return (
    <Button
      size="sm"
      variant="action"
      className={className}
      loading={busy}
      onClick={async () => {
        setBusy(true);
        try {
          await api.loadShipment(order.id);
          toast("success", tr("سُجّل التحميل، وأُبلغ مندوب التوصيل", "Loaded. The delivery rep was told"));
          onDone?.();
        } catch (e) {
          toast("danger", errorText(e, tr));
        } finally {
          setBusy(false);
        }
      }}
    >
      <Container className="size-4" /> {tr("حمّلتها في السيارة", "Loaded in the van")}
    </Button>
  );
}

/** What the shop paid at the door: cash the delivery rep took (in his custody until he hands it over),
 *  or a Qi / ZainCash request: waiting for the shop owner, or paid. */
function DoorPaid({ payment: p, rep, role }: { payment: DoorPayment; rep: string; role: Role }) {
  const { tr } = useFmt();
  const gw = p.method === "zaincash" ? tr("زين كاش", "ZainCash") : p.method === "qi" ? "Qi" : tr("نقداً", "cash");
  const waiting = p.status === "requested";
  return (
    <p className={cn("flex flex-wrap items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-semibold", waiting ? "bg-warning-soft text-warning" : "bg-success-soft text-success")}>
      {waiting ? <Clock className="size-4" /> : <Banknote className="size-4" />}
      {p.method === "cash" ? (
        <>
          {tr("دُفع عند التسليم نقداً", "Paid in cash at the door")} <Money value={p.amount} />
          {role !== "shop" && <span className="font-normal">· {tr(`في عهدة ${rep}`, `in ${rep}'s custody`)}</span>}
        </>
      ) : waiting ? (
        <>
          {tr(`طلب دفع بـ${gw}`, `${gw} payment request`)} <Money value={p.amount} /> · {role === "shop" ? tr("ادفعه من هنا", "pay it below") : tr("بانتظار صاحب المحل", "waiting for the shop owner")}
        </>
      ) : (
        <>
          {tr(`دُفع بـ${gw}`, `Paid by ${gw}`)} <Money value={p.paid_amount ?? p.amount} />
        </>
      )}
    </p>
  );
}
