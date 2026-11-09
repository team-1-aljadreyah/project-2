"use client";

// One zone up close: a card per item (like the design's aisle cards), and a dashed picking path that
// joins the items the waiting orders need, with the reps' cursors next to the items they asked for.
import Link from "next/link";
import { useLayoutEffect, useRef, useState } from "react";
import { motion } from "motion/react";
import { AlertTriangle, ArrowLeftRight, Boxes, CheckCircle2, Clock, Eye, PackagePlus, PackageX, ShoppingCart, Zap } from "lucide-react";
import { useApp } from "@/components/shell";
import { useFmt } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { NamedCursor } from "./cursor";
import type { MapCell, MapWarehouse, MapZone } from "./data";
import { statusLabel, statusStyle } from "./zones";

interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export function ZoneDetail({ view, zone, showPath, other }: { view: MapWarehouse; zone: MapZone; showPath: boolean; other?: MapWarehouse }) {
  const { tr } = useFmt();
  const wrap = useRef<HTMLDivElement>(null);
  const cardEls = useRef(new Map<number, HTMLElement>());
  const [geo, setGeo] = useState<{ cards: Record<number, Rect> } | null>(null);

  // Measure where each card is, to draw the path between them, and again whenever the size changes.
  // offsetLeft/Top give the real place in the layout: they ignore animations and the camera zoom
  // (getBoundingClientRect would measure the cards while they are still small and moving).
  useLayoutEffect(() => {
    const box = wrap.current;
    if (!box) return;
    const measure = () => {
      const cards: Record<number, Rect> = {};
      cardEls.current.forEach((el, id) => {
        cards[id] = { x: el.offsetLeft, y: el.offsetTop, w: el.offsetWidth, h: el.offsetHeight };
      });
      setGeo({ cards });
    };
    const ro = new ResizeObserver(measure);
    ro.observe(box);
    return () => ro.disconnect();
  }, [zone.code]);

  // The picking path joins the items that waiting orders need, in shelf order.
  const picks = zone.cells.filter((c) => c.pending > 0);
  const rects = geo ? picks.map((c) => geo.cards[c.item.id]).filter(Boolean) : [];
  const bottom = geo ? Math.max(0, ...Object.values(geo.cards).map((r) => r.y + r.h)) : 0;
  const corridor = bottom + 40;
  const xs = rects.map((r) => r.x + r.w / 2);
  const minX = xs.length ? Math.min(...xs) - (xs.length === 1 ? 60 : 0) : 0;
  const maxX = xs.length ? Math.max(...xs) + (xs.length === 1 ? 60 : 0) : 0;

  // A cursor for each rep, next to the first item they are waiting for.
  const seen = new Set<string>();
  const cursors = picks.flatMap((c) =>
    c.neededBy
      .filter((n) => !seen.has(n) && seen.add(n))
      .map((n) => ({ name: n, rect: geo?.cards[c.item.id] })),
  );

  return (
    <div ref={wrap} className="relative px-2 pb-24 pt-10 sm:px-6">
      <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
        {zone.cells.map((c, i) => (
          <motion.div
            key={c.item.id}
            ref={(el) => {
              if (el) cardEls.current.set(c.item.id, el);
              else cardEls.current.delete(c.item.id);
            }}
            initial={{ opacity: 0, y: 30, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ delay: 0.1 + i * 0.07, duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
            className="relative z-10"
          >
            <ItemCard cell={c} zone={zone} view={view} other={other} />
          </motion.div>
        ))}
      </div>

      {/* The dashed path under the cards, with dashes that move (the direction of picking) */}
      {showPath && geo && rects.length > 0 && (
        <>
          <svg className="pointer-events-none absolute inset-0 z-0 size-full overflow-visible" aria-hidden>
            {rects.map((r, i) => (
              <motion.line
                key={i}
                x1={r.x + r.w / 2}
                y1={r.y + r.h}
                x2={r.x + r.w / 2}
                y2={corridor}
                stroke="var(--primary)"
                strokeWidth="2"
                className="marching"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.6 + i * 0.1 }}
              />
            ))}
            <motion.line x1={minX} y1={corridor} x2={maxX} y2={corridor} stroke="var(--primary)" strokeWidth="2" className="marching" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.8 }} />
          </svg>
          <motion.span
            initial={{ opacity: 0, scale: 0.6 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 1, type: "spring", stiffness: 300, damping: 18 }}
            className="absolute z-10 flex -translate-x-1/2 -translate-y-1/2 items-center gap-1.5 whitespace-nowrap rounded-full bg-success-soft px-3 py-1.5 text-xs font-bold text-success shadow"
            style={{ left: (minX + maxX) / 2, top: corridor }}
          >
            <Zap className="size-3.5" /> {tr("مسار التجهيز السريع", "Fast pick path")} · <span className="num">{picks.length}</span>
          </motion.span>
        </>
      )}
      {showPath && picks.length === 0 && (
        <p className="mt-6 flex items-center justify-center gap-2 text-sm text-muted">
          <CheckCircle2 className="size-4 text-success" /> {tr("لا توجد طلبات تنتظر مواد من هذه المنطقة", "No waiting orders need items from this zone")}
        </p>
      )}

      {cursors.map((c, i) =>
        c.rect ? (
          <NamedCursor
            key={c.name}
            unit="px"
            name={c.name.split(" ")[0]}
            tone={i % 2 === 0 ? "orange" : "green"}
            // On the top edge of the card, so it doesn't cover the item's name.
            path={[
              { x: c.rect.x + c.rect.w * 0.4, y: c.rect.y - 26 },
              { x: c.rect.x + c.rect.w * 0.55, y: c.rect.y - 22 },
              { x: c.rect.x + c.rect.w * 0.46, y: c.rect.y - 28 },
            ]}
            duration={5 + i}
          />
        ) : null,
      )}
    </div>
  );
}

/** The item card: the same parts as the design's aisle card, filled with Al-Nahrain's data. */
function ItemCard({ cell: c, zone, view, other }: { cell: MapCell; zone: MapZone; view: MapWarehouse; other?: MapWarehouse }) {
  const { tr, num, qty, name } = useFmt();
  const { user } = useApp();
  const ppc = c.item.pieces_per_carton;
  const cartons = (p: number) => Math.floor(p / ppc);
  const reservedPct = c.onShelf ? Math.min(100, Math.round((c.reserved / c.onShelf) * 100)) : 0;
  const minPct = c.item.min_stock ? Math.min(100, Math.round((c.item.stock.total / c.item.min_stock) * 100)) : 100;
  const canMove = user.role === "manager" || user.role === "warehouse";

  let chip: { icon: typeof AlertTriangle; text: string; cls: string } | null = null;
  if (c.status === "expired") chip = { icon: PackageX, text: tr(`${num(c.expired)} قطعة منتهية، ما تنباع`, `${num(c.expired)} pieces expired, not for sale`), cls: statusStyle.expired };
  else if (c.status === "low") chip = { icon: AlertTriangle, text: tr("مخزون قليل، تحت الحد الأدنى", "Low stock, under the minimum"), cls: statusStyle.low };
  else if (c.near) chip = { icon: Clock, text: tr(`${num(c.near.pieces)} قطعة تنتهي بعد ${c.near.days} يوم`, `${num(c.near.pieces)} pieces expire in ${c.near.days} days`), cls: statusStyle.near };

  // The button: what is most useful for this item right now.
  let action: { href: string; icon: typeof Eye; text: string } = { href: `/items/${c.item.id}`, icon: Eye, text: tr("عرض الدفعات", "See batches") };
  if (canMove && (c.status === "low" || c.status === "empty") && c.otherSellable > 0 && other) {
    action = { href: "/transfers", icon: ArrowLeftRight, text: tr(`حوّل من ${name(other.wh)}`, `Move from ${name(other.wh)}`) };
  } else if (canMove && c.status === "low") {
    action = { href: "/receipts/new", icon: PackagePlus, text: tr("استلام بضاعة", "Receive goods") };
  }

  return (
    <div className={cn("rounded-2xl border bg-card p-4 shadow-card", c.pending > 0 ? "border-primary/50" : "border-line", c.status === "empty" && "opacity-75")}>
      <div className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2.5">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-card-2 text-muted">
            <Boxes className="size-5" />
          </span>
          <div className="min-w-0">
            <p className="num text-sm font-bold" dir="ltr">
              {c.code}
            </p>
            <p className="truncate text-xs text-muted">{name(c.item)}</p>
          </div>
        </div>
        <span className="shrink-0 text-[11px] font-semibold text-muted">{zone.category}</span>
      </div>

      {chip ? (
        <p className={cn("mt-3 flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-semibold", chip.cls)}>
          <chip.icon className="size-3.5 shrink-0" /> {chip.text}
        </p>
      ) : (
        <p className={cn("mt-3 flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-semibold", statusStyle[c.status])}>
          <CheckCircle2 className="size-3.5" /> {statusLabel(c.status, tr)}
        </p>
      )}

      {/* Three small counters, like the design */}
      <div className="mt-3 grid grid-cols-3 gap-1.5 text-center">
        {[
          { icon: Boxes, v: cartons(c.onShelf), l: tr("على الرف", "On shelf") },
          { icon: ShoppingCart, v: cartons(c.reserved), l: tr("محجوز", "Held") },
          { icon: CheckCircle2, v: cartons(c.sellable), l: tr("للبيع", "Sellable") },
        ].map((s) => (
          <div key={s.l} className="rounded-lg border border-line bg-card-2/60 px-1 py-1.5" title={qty(s.v * ppc, ppc)}>
            <p className="num flex items-center justify-center gap-1 text-xs font-bold">
              <s.icon className="size-3 text-faint" /> {num(s.v)}
            </p>
            <p className="text-[10px] text-muted">{s.l}</p>
          </div>
        ))}
      </div>

      <Bar label={tr(`${c.pending} طلب ينتظر التجهيز`, `${c.pending} order(s) waiting`)} pct={reservedPct} tone="primary" />
      <Bar label={tr("مقابل الحد الأدنى", "Against the minimum")} pct={minPct} tone={minPct < 100 ? "danger" : "success"} />

      <Link
        href={action.href}
        className="mt-3 flex h-9 items-center justify-center gap-1.5 rounded-xl border border-line text-xs font-semibold transition hover:border-primary hover:text-primary-ink"
      >
        <action.icon className="size-3.5" /> {action.text}
      </Link>
      <span className="sr-only">
        {view.wh.name} {c.code}
      </span>
    </div>
  );
}

function Bar({ label, pct, tone }: { label: string; pct: number; tone: "primary" | "success" | "danger" }) {
  return (
    <div className="mt-3">
      <div className="mb-1 flex justify-between text-[11px]">
        <span className="text-muted">{label}</span>
        <span className="num font-semibold">{pct}%</span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-line">
        <motion.div
          className={cn("h-full rounded-full", tone === "primary" ? "bg-primary" : tone === "success" ? "bg-success" : "bg-danger")}
          initial={{ width: 0 }}
          animate={{ width: `${pct}%` }}
          transition={{ duration: 0.9, delay: 0.4 }}
        />
      </div>
    </div>
  );
}
