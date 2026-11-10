"use client";

// Where a shipment is, the same on every page, and the delivery block of the order page.
import { useState } from "react";
import { motion } from "motion/react";
import { Check, KeyRound, Lock, PackageCheck, ShieldCheck, Truck, Warehouse } from "lucide-react";
import { Button, Card, errorText, useToast } from "@/components/ui";
import { api } from "@/lib/api";
import type { Delivery, Order, Role } from "@/lib/api/types";
import { useFmt, type Tr } from "@/lib/i18n";
import { useLoad } from "@/lib/use-load";
import { cn } from "@/lib/utils";
import { PrintButton, ShipmentLabel } from "./qr";

export function deliveryLabel(d: Delivery, tr: Tr) {
  if (d.locked) return tr("مقفلة: رموز خاطئة", "Locked: wrong PINs");
  return { ready: tr("جاهزة في المخزن", "Ready at the warehouse"), out: tr("في الطريق", "On the way"), delivered: tr("تم التسليم", "Delivered") }[d.status];
}

export function DeliveryChip({ d, tr }: { d: Delivery; tr: Tr }) {
  const tone = d.locked ? "bg-danger-soft text-danger" : { ready: "bg-card-2 text-muted", out: "bg-warning-soft text-warning", delivered: "bg-success-soft text-success" }[d.status];
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
      <p className="mt-1 text-xs text-muted">{tr("أعطه لمندوب التوصيل فقط بعد أن تستلم البضاعة وتتأكد أنها سليمة وكاملة.", "Give it to the delivery rep only after you get the goods complete and in good shape.")}</p>
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
    { on: true, icon: Warehouse, t: tr("جاهزة في المخزن", "Ready at the warehouse"), s: tr("طُبع ملصق QR للشحنة", "The QR label was printed") },
    { on: d.status !== "ready", icon: Truck, t: tr("خرجت مع مندوب التوصيل", "Out with the delivery rep"), s: d.out_by ? `${d.out_by.name} · ${dateTime(d.out_at)} · ${tr("بمسح QR", "QR scanned")}` : tr("عند مسح QR في المخزن", "When the QR is scanned") },
    { on: d.status === "delivered", icon: PackageCheck, t: tr("تم التسليم للمحل", "Delivered to the shop"), s: d.delivered_by ? `${d.delivered_by.name} · ${dateTime(d.delivered_at)}` : tr("برمز الاستلام وصورة الشحنة", "With the PIN and a photo") },
  ];

  return (
    <Card className="p-4">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h3 className="flex items-center gap-1.5 font-bold">
          <Truck className="size-4 text-action" /> {tr("التوصيل", "Delivery")}
        </h3>
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
          {photo.data && (
            <motion.a initial={{ opacity: 0 }} animate={{ opacity: 1 }} href={photo.data} target="_blank" rel="noreferrer" className="block overflow-hidden rounded-xl border border-line">
              {/* eslint-disable-next-line @next/next/no-img-element -- a stored data URL */}
              <img src={photo.data} alt={tr("صورة الشحنة عند التسليم", "Photo of the packages at delivery")} className="max-h-64 w-full object-cover" />
            </motion.a>
          )}
        </div>
      )}

      {/* The shop owner: his PIN, while the goods are on the way */}
      {role === "shop" && d.pin && d.status !== "delivered" && (
        <div className="mt-3">
          <PinCard pin={d.pin} />
        </div>
      )}

      {/* The warehouse and the manager: the label to print and stick on the packages, until they leave */}
      {(role === "warehouse" || role === "manager") && d.status === "ready" && (
        <div className="mt-3 space-y-2">
          <ShipmentLabel order={order} shop={shop} rep={rep} area={area} />
          <PrintButton />
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
