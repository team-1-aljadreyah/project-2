"use client";

// Inside a warehouse: one block per zone (category), each with a small cell per item, colored by its state.
// The floor can be seen in 3D (tilted, with thick blocks) or flat, and it moves smoothly between the two,
// like the design: the 3D floor that lies down flat.
// In 3D, every zone also gets an upright label that floats above it and always faces you,
// so its name stays easy to read however the floor is turned.
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

/** Stronger colors for the item cells on the floor: a clear border, so the state shows even when small. */
const cellStyle: Record<CellStatus, string> = {
  ok: "bg-success-soft text-success border-success/45",
  near: "bg-warning-soft text-warning border-warning/55",
  low: "bg-danger-soft text-danger border-danger/55",
  expired: "bg-danger text-white border-danger dark:text-[#1a0b03]",
  empty: "bg-card-2 text-faint border-line-strong",
};

/** The colored dot used in the key and on the floating labels. */
const dotStyle: Record<CellStatus, string> = {
  ok: "bg-success",
  near: "bg-warning",
  low: "bg-danger",
  expired: "bg-danger",
  empty: "bg-faint",
};

export function statusLabel(s: CellStatus, tr: Tr) {
  return {
    ok: tr("سليم", "OK"),
    near: tr("قريب الانتهاء", "Expiring soon"),
    low: tr("مخزون قليل", "Low stock"),
    expired: tr("فيها مواد منتهية", "Has expired stock"),
    empty: tr("فارغ هنا", "Empty here"),
  }[s];
}

/** The worst state inside a zone: it colors the zone's top edge and the dot on its label. */
function health(z: MapZone): CellStatus {
  const has = (s: CellStatus) => z.cells.some((c) => c.status === s);
  if (has("expired")) return "expired";
  if (has("low")) return "low";
  if (has("near")) return "near";
  return z.cells.length ? "ok" : "empty";
}

// How the floor turns in 3D. The floating labels use the same numbers to turn back and face you.
const TILT = 48; // leans back (rotateX)
const TURN = 34; // turns around (rotateZ)
const SHRINK = 0.8; // smaller so the turned floor still fits
const EASE = "cubic-bezier(0.22, 1, 0.36, 1)";

/** Thick 3D edge under each block, made of thin shadows stacked on top of each other. */
function extrude(rtl: boolean) {
  const dir = rtl ? -1 : 1;
  return Array.from({ length: 10 }, (_, i) => `${dir * (i + 1)}px ${i + 1}px 0 var(--iso-left)`).join(", ") + ", 0 26px 34px -12px rgb(0 0 0 / 0.35)";
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
  const turn = rtl ? TURN : -TURN;

  return (
    <div className="relative flex min-h-[560px] items-center justify-center px-2 pb-16 pt-10 lg:px-10">
      <div className="w-full [perspective:2200px]">
        <motion.div
          // 3D: the floor turns and leans back, like looking at it from a corner. Flat: straight from above.
          animate={view3d ? { rotateX: TILT, rotateZ: turn, scale: SHRINK, y: 6 } : { rotateX: 0, rotateZ: 0, scale: 1, y: 0 }}
          transition={{ duration: 0.9, ease: [0.22, 1, 0.36, 1] }}
          style={{ transformStyle: "preserve-3d" }}
          className="mx-auto grid max-w-5xl grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4"
        >
          {view.zones.map((z, i) => {
            const h = health(z);
            const on = hovered === z.code;
            return (
              <motion.button
                key={z.code}
                type="button"
                initial={{ opacity: 0, y: 40 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.15 + i * 0.06, duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
                // In 3D a block lifts off the floor when you point at it.
                whileHover={view3d ? { z: 30 } : { y: -4 }}
                onMouseEnter={() => onHover(z.code)}
                onMouseLeave={() => onHover(null)}
                onFocus={() => onHover(z.code)}
                onBlur={() => onHover(null)}
                onClick={(e) => onPick(z, e.currentTarget)}
                aria-label={`${z.code} · ${z.category} · ${statusLabel(h, tr)}`}
                className={cn(
                  "relative rounded-2xl border-2 bg-[var(--iso-top)] p-3 text-start transition-[border-color,box-shadow] duration-300",
                  on ? "border-action" : "border-line-strong",
                )}
                style={{ boxShadow: view3d ? extrude(rtl) : "var(--shadow)", transformStyle: "preserve-3d" }}
              >
                {/* Colored top edge: the worst state inside this zone */}
                <span className={cn("absolute inset-x-3 top-0 h-1 rounded-b-full", dotStyle[h])} aria-hidden />

                <div className="flex items-center justify-between gap-2">
                  <span className="flex min-w-0 items-center gap-2">
                    <span className="num rounded-md bg-primary px-1.5 py-0.5 text-[11px] font-bold text-on-primary" dir="ltr">
                      {z.code}
                    </span>
                    <span className="truncate text-sm font-bold">{z.category}</span>
                  </span>
                  <span className="num text-xs font-semibold text-muted">{Math.round(z.fill * 100)}%</span>
                </div>
                <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-line">
                  <motion.div
                    className={cn("h-full rounded-full", z.fill >= 0.85 ? "bg-action" : "bg-primary")}
                    initial={{ width: 0 }}
                    animate={{ width: `${z.fill * 100}%` }}
                    transition={{ delay: 0.4 + i * 0.06, duration: 0.8 }}
                  />
                </div>
                {/* One cell per item: its color says its state */}
                <div className="mt-3 grid grid-cols-3 gap-1.5">
                  {z.cells.map((c) => (
                    <span key={c.item.id} title={`${c.code} · ${c.item.name}`} className={cn("truncate rounded-md border px-1.5 py-1 text-center text-[11px] font-semibold", cellStyle[c.status])}>
                      {c.item.name.split(" ")[0]}
                    </span>
                  ))}
                </div>
                <div className="mt-3 flex min-h-5 flex-wrap gap-1.5 text-[11px]">
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

                <FloatingLabel zone={z} health={h} on={on} show={view3d} turn={turn} />
              </motion.button>
            );
          })}
        </motion.div>
      </div>

      {/* The card that pops up for the zone you point at. It sits in the empty corner, away from the blocks. */}
      <AnimatePresence>{zone && <ZonePopCard key={zone.code} zone={zone} />}</AnimatePresence>

      {/* The color key, so every color on the floor has a meaning */}
      {!zone && (
        <div className="pointer-events-none absolute bottom-3 left-1/2 hidden -translate-x-1/2 items-center gap-3 whitespace-nowrap rounded-full border border-line bg-card/95 px-4 py-1.5 text-xs shadow md:flex">
          {(["ok", "near", "low", "expired"] as CellStatus[]).map((s) => (
            <span key={s} className="flex items-center gap-1.5 text-muted">
              <span className={cn("size-2.5 rounded-full", dotStyle[s])} />
              {statusLabel(s, tr)}
            </span>
          ))}
          <span className="h-4 w-px bg-line" />
          <span className="text-faint">{tr("اضغط على أي منطقة لعرض موادها", "Click any zone to see its items")}</span>
        </div>
      )}
    </div>
  );
}

/**
 * The upright label above a zone in 3D.
 * The floor is turned with "scale, rotateX(TILT), rotateZ(turn)". A child that does the exact opposite,
 * "rotateZ(-turn) rotateX(-TILT) scale(1 / SHRINK)", ends up flat on the screen again: it faces you.
 * translateZ first lifts it above the block, and a thin pole stands from the block up to it.
 */
function FloatingLabel({ zone, health: h, on, show, turn }: { zone: MapZone; health: CellStatus; on: boolean; show: boolean; turn: number }) {
  const lift = on ? 92 : 70;
  const t = `transform 0.9s ${EASE}, opacity 0.4s ease`;
  return (
    <span className="pointer-events-none absolute left-1/2 top-1/2 size-0" style={{ transformStyle: "preserve-3d" }} aria-hidden>
      {/* The pole: a thin line standing up from the floor (turned 90° so it points out of the block) */}
      <span
        className="absolute bottom-0 left-0 w-0.5 -translate-x-1/2 bg-primary/60"
        style={{ height: lift, transformOrigin: "bottom", transform: "rotateX(-90deg)", opacity: show ? 1 : 0, transition: `${t}, height 0.3s ease` }}
      />
      <span
        className="absolute left-0 top-0"
        style={{
          transform: show ? `translateZ(${lift}px) rotateZ(${-turn}deg) rotateX(${-TILT}deg) scale(${1 / SHRINK})` : "translateZ(0px)",
          opacity: show ? 1 : 0,
          // Turning to 3D: slow, with the floor. Back to flat: the label fades out quickly first.
          transition: show ? t : "transform 0.3s ease, opacity 0.2s ease",
        }}
      >
        <span
          className={cn(
            "absolute bottom-0 left-0 flex -translate-x-1/2 items-center gap-2 whitespace-nowrap rounded-xl px-3 py-1.5 text-sm font-bold shadow-lg transition-colors",
            on ? "bg-action text-on-action" : "bg-primary text-on-primary",
          )}
        >
          <span className={cn("size-2.5 shrink-0 rounded-full ring-2 ring-white/70", dotStyle[h])} />
          <span className="num text-xs opacity-80" dir="ltr">
            {zone.code}
          </span>
          {zone.category}
          <span className="num text-xs opacity-80">{Math.round(zone.fill * 100)}%</span>
        </span>
      </span>
    </span>
  );
}

function ZonePopCard({ zone }: { zone: MapZone }) {
  const { tr, num, lang } = useFmt();
  const Forward = lang === "ar" ? ArrowLeft : ArrowRight;
  const count = (s: CellStatus) => zone.cells.filter((c) => c.status === s).length;
  return (
    <motion.div
      initial={{ opacity: 0, y: 12, scale: 0.94 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 12, scale: 0.94 }}
      transition={{ type: "spring", stiffness: 320, damping: 26 }}
      className="pointer-events-none absolute bottom-3 end-3 z-20 hidden w-72 rounded-2xl border border-line bg-card p-4 shadow-xl md:block"
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
        {tr("اضغط لفتح المنطقة", "Click to open the zone")} <Forward className="size-3.5" />
      </p>
    </motion.div>
  );
}
