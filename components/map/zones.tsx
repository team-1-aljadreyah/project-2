"use client";

// Inside a warehouse: one block per zone (category), each with a small cell per item, colored by its state.
// The floor can be seen in 3D (tilted, with thick blocks) or flat, and it moves smoothly between the two,
// like the design: the 3D floor that lies down flat.
import { AnimatePresence, motion } from "motion/react";
import { AlertTriangle, ArrowLeft, ArrowRight, ClipboardList, Package } from "lucide-react";
import { useFmt, type Tr } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import type { CellStatus, MapWarehouse, MapZone } from "./data";

export const statusStyle: Record<CellStatus, string> = {
  ok: "bg-success-soft text-success",
  near: "bg-warning-soft text-warning",
  low: "bg-danger-soft text-danger",
  expired: "bg-danger-soft text-danger",
  empty: "bg-card-2 text-faint",
};

export function statusLabel(s: CellStatus, tr: Tr) {
  return {
    ok: tr("سليم", "OK"),
    near: tr("قريب الانتهاء", "Expiring soon"),
    low: tr("مخزون قليل", "Low stock"),
    expired: tr("فيه منتهي", "Has expired stock"),
    empty: tr("فارغ هنا", "Empty here"),
  }[s];
}

/** Thick 3D edge under each block, made of thin shadows stacked on top of each other. */
function extrude(rtl: boolean) {
  const dir = rtl ? -1 : 1;
  return Array.from({ length: 10 }, (_, i) => `${dir * (i + 1)}px ${i + 1}px 0 var(--iso-right)`).join(", ") + ", 0 22px 30px -10px rgb(0 0 0 / 0.25)";
}

export function ZonesView({
  view,
  view3d,
  hovered,
  onHover,
  onPick,
}: {
  view: MapWarehouse;
  view3d: boolean;
  hovered: string | null;
  onHover: (code: string | null) => void;
  onPick: (zone: MapZone, el: HTMLElement) => void;
}) {
  const { tr, lang } = useFmt();
  const rtl = lang === "ar";
  const zone = view.zones.find((z) => z.code === hovered);

  return (
    <div className="relative flex min-h-[520px] items-center justify-center px-2 py-8 lg:px-10">
      <div className="w-full [perspective:2200px]">
        <motion.div
          // 3D: the floor turns 38° and leans back 50°, like looking at it from a corner. Flat: straight from above.
          animate={view3d ? { rotateX: 50, rotateZ: rtl ? 38 : -38, scale: 0.74, y: -10 } : { rotateX: 0, rotateZ: 0, scale: 1, y: 0 }}
          transition={{ duration: 0.9, ease: [0.22, 1, 0.36, 1] }}
          style={{ transformStyle: "preserve-3d" }}
          className="mx-auto grid max-w-5xl grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4"
        >
          {view.zones.map((z, i) => (
            <motion.button
              key={z.code}
              type="button"
              initial={{ opacity: 0, y: 40 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.15 + i * 0.06, duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
              // In 3D a block lifts off the floor when you point at it.
              whileHover={view3d ? { z: 34 } : { y: -4 }}
              onMouseEnter={() => onHover(z.code)}
              onMouseLeave={() => onHover(null)}
              onFocus={() => onHover(z.code)}
              onBlur={() => onHover(null)}
              onClick={(e) => onPick(z, e.currentTarget)}
              className={cn(
                "rounded-2xl border bg-card/95 p-3 text-start transition-[border-color,box-shadow] duration-300",
                hovered === z.code ? "border-primary ring-4 ring-primary/20" : "border-line",
              )}
              style={{ boxShadow: view3d ? extrude(rtl) : "var(--shadow)" }}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="flex min-w-0 items-center gap-2">
                  <span className="num rounded-md bg-primary-soft px-1.5 py-0.5 text-[11px] font-bold text-primary-ink" dir="ltr">
                    {z.code}
                  </span>
                  <span className="truncate text-sm font-bold">{z.category}</span>
                </span>
                <span className="num text-xs font-semibold text-muted">{Math.round(z.fill * 100)}%</span>
              </div>
              <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-line">
                <motion.div
                  className={cn("h-full rounded-full", z.fill >= 0.85 ? "bg-action" : "bg-primary")}
                  initial={{ width: 0 }}
                  animate={{ width: `${z.fill * 100}%` }}
                  transition={{ delay: 0.4 + i * 0.06, duration: 0.8 }}
                />
              </div>
              {/* One small cell per item: its color says its state */}
              <div className="mt-3 grid grid-cols-3 gap-1.5">
                {z.cells.map((c) => (
                  <span key={c.item.id} title={`${c.code} · ${c.item.name}`} className={cn("truncate rounded-md px-1.5 py-1 text-center text-[10px] font-semibold", statusStyle[c.status])}>
                    {c.item.name.split(" ")[0]}
                  </span>
                ))}
              </div>
              <div className="mt-3 flex flex-wrap gap-1.5 text-[11px]">
                {z.alerts > 0 && (
                  <span className="flex items-center gap-1 rounded-full bg-danger-soft px-2 py-0.5 font-semibold text-danger">
                    <AlertTriangle className="size-3" /> <span className="num">{z.alerts}</span>
                  </span>
                )}
                {z.pending > 0 && (
                  <span className="flex items-center gap-1 rounded-full bg-primary-soft px-2 py-0.5 font-semibold text-primary-ink">
                    <ClipboardList className="size-3" /> <span className="num">{z.pending}</span>
                  </span>
                )}
              </div>
            </motion.button>
          ))}
        </motion.div>
      </div>

      {/* The card that pops up for the zone you point at, like the design's floating zone card */}
      <AnimatePresence>
        {zone && <ZonePopCard key={zone.code} zone={zone} />}
      </AnimatePresence>

      {!zone && (
        <p className="pointer-events-none absolute bottom-3 left-1/2 hidden -translate-x-1/2 rounded-full bg-card/90 px-3 py-1 text-xs text-muted shadow md:block">
          {tr("اضغط على أي منطقة حتى تشوف المواد", "Click any zone to see its items")}
        </p>
      )}
    </div>
  );
}

function ZonePopCard({ zone }: { zone: MapZone }) {
  const { tr, num, lang } = useFmt();
  const Forward = lang === "ar" ? ArrowLeft : ArrowRight;
  const count = (s: CellStatus) => zone.cells.filter((c) => c.status === s).length;
  return (
    <motion.div
      initial={{ opacity: 0, y: -12, scale: 0.94 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -12, scale: 0.94 }}
      transition={{ type: "spring", stiffness: 320, damping: 26 }}
      className="pointer-events-none absolute end-3 top-3 z-20 hidden w-72 rounded-2xl border border-line bg-card p-4 shadow-xl md:block"
    >
      <div className="flex items-center gap-3">
        <span className="flex size-10 items-center justify-center rounded-xl bg-primary-soft text-primary-ink">
          <Package className="size-5" />
        </span>
        <div className="min-w-0">
          <p className="num font-bold" dir="ltr">
            {zone.code}
          </p>
          <p className="truncate text-xs text-muted">{zone.category}</p>
        </div>
      </div>
      <div className="mt-3 grid grid-cols-3 gap-2 text-center">
        {[
          [tr("مواد", "Items"), zone.cells.length],
          [tr("كارتون", "Cartons"), Math.round(zone.cartons)],
          [tr("امتلاء", "Full"), `${Math.round(zone.fill * 100)}%`],
        ].map(([l, v]) => (
          <div key={String(l)} className="rounded-xl bg-card-2 py-2">
            <p className="num text-sm font-bold">{typeof v === "number" ? num(v) : v}</p>
            <p className="text-[10px] text-muted">{l}</p>
          </div>
        ))}
      </div>
      <div className="mt-3 flex flex-wrap gap-1.5 text-[11px]">
        {(["low", "expired", "near", "ok"] as CellStatus[])
          .filter((s) => count(s) > 0)
          .map((s) => (
            <span key={s} className={cn("rounded-full px-2 py-0.5 font-semibold", statusStyle[s])}>
              {statusLabel(s, tr)} <span className="num">{count(s)}</span>
            </span>
          ))}
      </div>
      {zone.pending > 0 && (
        <p className="mt-3 text-xs text-muted">
          <span className="num font-semibold text-text">{zone.pending}</span> {tr("طلب ينتظر مواد من هذه المنطقة", "waiting orders need items from here")}
        </p>
      )}
      <p className="mt-3 flex items-center gap-1 text-xs font-semibold text-primary-ink">
        {tr("اضغط حتى تفتح المنطقة", "Click to open the zone")} <Forward className="size-3.5" />
      </p>
    </motion.div>
  );
}
