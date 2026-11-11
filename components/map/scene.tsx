"use client";

// The site in 3D: Al-Nahrain's two warehouses in Karbala, drawn from above at an angle.
// Al-Sinaa (main) has a big storage hall, an office tower and grain silos. Al-Hur is a smaller hall.
// Each warehouse shows how full it is, with a red dot for its alerts. (No moving truck or cursors: they
// distracted from the numbers that matter.)
// Click a warehouse to go inside.
import { useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { AlertTriangle, ArrowLeft, ArrowRight, ClipboardList } from "lucide-react";
import { useFmt } from "@/lib/i18n";
import { Iso } from "@/lib/iso";
import { cn } from "@/lib/utils";
import type { MapWarehouse } from "./data";

// ---------- the drawing (made once, it never changes) ----------

type Shape =
  | { k: "poly"; d: string; f: string; o?: number }
  | { k: "ell"; cx: number; cy: number; rx: number; ry: number; f: string; o?: number }
  | { k: "rect"; x: number; y: number; w: number; h: number; f: string; o?: number };

interface Obj {
  key: string;
  depth: number; // farther things have a smaller x + y and are drawn first
  wh?: number; // which warehouse it belongs to (for hover and click)
  main?: boolean; // the one part that can get keyboard focus
  shapes: Shape[];
}

const TOP = "var(--iso-top)";
const LEFT = "var(--iso-left)";
const RIGHT = "var(--iso-right)";
const GLASS = "var(--iso-glass)";
const GLASS2 = "var(--iso-glass-2)";
const ACTION = "var(--action)";

function buildScene() {
  const iso = new Iso(24);
  const objs: Obj[] = [];
  const add = (key: string, depth: number, shapes: Shape[], wh?: number, main?: boolean) => objs.push({ key, depth, shapes, wh, main });

  const solid = (x: number, y: number, z: number, w: number, d: number, h: number, c = { top: TOP, left: LEFT, right: RIGHT }): Shape[] => {
    const f = iso.box(x, y, z, w, d, h);
    return [
      { k: "poly", d: f.right, f: c.right },
      { k: "poly", d: f.left, f: c.left },
      { k: "poly", d: f.top, f: c.top },
    ];
  };

  const cylinder = (cx: number, cy: number, r: number, h: number): Shape[] => {
    const [bx, by] = iso.p([cx, cy, 0]);
    const [, ty] = iso.p([cx, cy, h]);
    // A circle on the ground looks like a flat ellipse from this angle.
    const rx = r * iso.s * 1.2247;
    const ry = r * iso.s * 0.7071;
    return [
      { k: "ell", cx: bx, cy: by, rx, ry, f: RIGHT },
      { k: "rect", x: bx - rx, y: ty, w: rx * 2, h: by - ty, f: LEFT },
      { k: "rect", x: bx, y: ty, w: rx, h: by - ty, f: RIGHT, o: 0.7 },
      { k: "ell", cx: bx, cy: ty, rx, ry, f: TOP },
      { k: "ell", cx: bx, cy: ty, rx: rx * 0.5, ry: ry * 0.5, f: GLASS, o: 0.8 },
    ];
  };

  const tree = (x: number, y: number): Shape[] => {
    const [gx, gy] = iso.p([x, y, 0]);
    const [cx, cy] = iso.p([x, y, 1.2]);
    const r = 0.62 * iso.s;
    return [
      { k: "ell", cx: gx, cy: gy, rx: r * 0.9, ry: r * 0.45, f: "var(--iso-ground-side)" },
      { k: "rect", x: gx - 1.5, y: cy, w: 3, h: gy - cy, f: "var(--iso-trunk)" },
      { k: "ell", cx, cy, rx: r, ry: r, f: "var(--iso-tree-2)" },
      { k: "ell", cx: cx - r * 0.18, cy: cy - r * 0.2, rx: r * 0.78, ry: r * 0.78, f: "var(--iso-tree)" },
    ];
  };

  const truck = (x: number, y: number): Shape[] => [...solid(x, y, 0.05, 1.5, 0.7, 0.75), ...solid(x + 1.5, y + 0.02, 0.05, 0.55, 0.66, 0.6, { top: "#f5b48a", left: ACTION, right: "#b8521c" })];

  // Ground and roads
  add("ground", -100, solid(0, 0, -0.8, 28, 21, 0.8, { top: "var(--iso-ground)", left: "var(--iso-ground-side)", right: "var(--iso-ground-side)" }));
  const road: Shape[] = [
    { k: "poly", d: iso.flat(1, 17, 26, 1.6), f: "var(--iso-road)" },
    { k: "poly", d: iso.flat(15.4, 1, 1.6, 16), f: "var(--iso-road)" },
    { k: "poly", d: iso.flat(13, 8.4, 2.4, 2.4), f: "var(--iso-road)" },
    { k: "poly", d: iso.flat(17, 8.6, 5.8, 1.4), f: "var(--iso-road)" },
  ];
  for (let t = 1.6; t < 26.5; t += 1.4) road.push({ k: "poly", d: iso.flat(t, 17.74, 0.6, 0.12), f: "var(--iso-road-line)" });
  for (let t = 1.4; t < 16.6; t += 1.4) road.push({ k: "poly", d: iso.flat(16.14, t, 0.12, 0.6), f: "var(--iso-road-line)" });
  add("roads", -99, road);

  // Al-Sinaa: the main storage hall
  add(
    "sinaa-hall",
    8,
    [
      ...solid(3, 5, 0, 10, 7, 2.6),
      { k: "poly", d: iso.leftBand(3.4, 12.6, 12, 0.6, 1.05), f: GLASS, o: 0.9 },
      { k: "poly", d: iso.leftBand(3.4, 12.6, 12, 1.5, 1.95), f: GLASS, o: 0.9 },
      { k: "poly", d: iso.leftBand(4.5, 11.5, 12, 2.15, 2.42), f: GLASS2 },
      { k: "poly", d: iso.rightBand(13, 6.2, 7.0, 0, 1.25), f: ACTION },
      { k: "poly", d: iso.rightBand(13, 8.7, 9.5, 0, 1.25), f: ACTION },
      { k: "poly", d: iso.rightBand(13, 9.9, 10.7, 0, 1.25), f: ACTION },
      ...solid(5, 6.4, 2.6, 1.1, 1.1, 0.45),
      ...solid(7.4, 6.4, 2.6, 1.1, 1.1, 0.45),
      ...solid(9.8, 9.6, 2.6, 1.6, 1.1, 0.4),
    ],
    1,
    true,
  );
  // Al-Sinaa: the office tower with glass floors
  const tower: Shape[] = [...solid(4, 12.8, 0, 3.2, 3, 5.6)];
  for (let k = 0; k < 6; k++) {
    const z1 = 0.25 + k * 0.92;
    tower.push({ k: "poly", d: iso.leftBand(4.25, 6.95, 15.8, z1, z1 + 0.6), f: GLASS, o: 0.95 });
    tower.push({ k: "poly", d: iso.rightBand(7.2, 13.05, 15.55, z1, z1 + 0.6), f: GLASS2, o: 0.75 });
  }
  tower.push(...solid(4.4, 13.2, 5.6, 2.4, 2.2, 0.25));
  add("sinaa-tower", 16.8, tower, 1);
  // Al-Sinaa: grain silos
  add("silo-1", 14.2, cylinder(12.6, 1.6, 0.62, 3.2), 1);
  add("silo-2", 15.6, cylinder(14.0, 1.6, 0.62, 3.2), 1);
  add("silo-3", 16.3, cylinder(13.3, 3.0, 0.62, 3.2), 1);
  add("truck-sinaa", 22.2, truck(13.3, 8.9), 1);

  // Al-Hur: the second hall
  add(
    "hur-hall",
    22.5,
    [
      ...solid(19, 3.5, 0, 6, 5, 2.1),
      { k: "poly", d: iso.leftBand(19.4, 24.6, 8.5, 0.75, 1.2), f: GLASS, o: 0.9 },
      { k: "poly", d: iso.leftBand(19.7, 20.7, 8.5, 0, 1.1), f: ACTION },
      { k: "poly", d: iso.leftBand(21.1, 22.1, 8.5, 0, 1.1), f: ACTION },
      { k: "poly", d: iso.leftBand(22.6, 24.6, 8.5, 1.45, 1.75), f: GLASS2 },
      ...solid(20.3, 4.4, 2.1, 1.0, 1.0, 0.4),
      ...solid(22.8, 5.5, 2.1, 1.3, 1.0, 0.35),
    ],
    2,
    true,
  );
  add("truck-hur", 26.3, truck(17.3, 9.0), 2);

  // Trees
  const trees: [number, number][] = [
    [1.2, 1.2],
    [2.5, 1.0],
    [1.0, 2.7],
    [1.3, 4.3],
    [1.2, 6.6],
    [1.4, 8.7],
    [1.2, 10.9],
    [1.6, 13.2],
    [2.6, 14.7],
    [3, 19.6],
    [5.2, 19.8],
    [7.4, 19.5],
    [9.6, 19.7],
    [12, 19.6],
    [19, 19.6],
    [21.5, 19.8],
    [24, 19.6],
    [26.5, 19.4],
    [26.8, 2],
    [26.6, 4.6],
    [26.8, 7.1],
    [26.5, 10],
    [26.7, 12.6],
    [26.6, 15.2],
    [9.8, 14],
    [11.3, 15.1],
    [12.7, 13.8],
    [18.6, 12.4],
    [20.6, 13.6],
    [22.7, 12.3],
    [24.6, 13.8],
    [19.3, 1.2],
    [21.6, 1.0],
    [23.9, 1.3],
  ];
  trees.forEach(([x, y], i) => add(`tree-${i}`, x + y, tree(x, y)));

  objs.sort((a, b) => a.depth - b.depth);

  // Where the % badges go (also counted in the frame).
  const badge = { 1: iso.p([8, 8.5, 3.6]), 2: iso.p([22, 6, 2.9]) } as Record<number, [number, number]>;

  const vb = { x: iso.minX - 30, y: iso.minY - 80, w: iso.maxX - iso.minX + 60, h: iso.maxY - iso.minY + 110 };
  return { objs, badge, vb };
}

const SCENE = buildScene();
const { vb } = SCENE;
/** Screen point → % of the picture, for things drawn in HTML on top of the SVG. */
const pct = ([X, Y]: [number, number]) => ({ x: ((X - vb.x) / vb.w) * 100, y: ((Y - vb.y) / vb.h) * 100 });

function ShapeEl({ s }: { s: Shape }) {
  if (s.k === "poly") return <polygon points={s.d} fill={s.f} opacity={s.o} />;
  if (s.k === "ell") return <ellipse cx={s.cx} cy={s.cy} rx={s.rx} ry={s.ry} fill={s.f} opacity={s.o} />;
  return <rect x={s.x} y={s.y} width={s.w} height={s.h} fill={s.f} opacity={s.o} />;
}

// ---------- the component ----------

export function SiteScene({ warehouses, myWarehouseId, onEnter }: { warehouses: MapWarehouse[]; myWarehouseId?: number; onEnter: (id: number, origin: { x: number; y: number }) => void }) {
  const { tr, name, num, lang } = useFmt();
  const reduce = useReducedMotion();
  const [hover, setHover] = useState<number | null>(null);
  const Forward = lang === "ar" ? ArrowLeft : ArrowRight;

  const enter = (id: number) => {
    const at = SCENE.badge[id];
    if (!at) return onEnter(id, { x: 0.5, y: 0.5 });
    const b = pct(at);
    onEnter(id, { x: b.x / 100, y: (b.y + 12) / 100 });
  };
  // The drawing has the first two warehouses. Any warehouse added later shows as a card under it.
  const drawn = warehouses.filter((w) => SCENE.badge[w.wh.id]);
  const extra = warehouses.filter((w) => !SCENE.badge[w.wh.id]);

  return (
    <div className="relative mx-auto w-full max-w-5xl select-none">
      <svg viewBox={`${vb.x} ${vb.y} ${vb.w} ${vb.h}`} className="h-auto w-full" role="img" aria-label={tr("خريطة مخازن النهرين", "Map of Al-Nahrain's warehouses")}>
        {SCENE.objs.map((o, i) => {
          const w = o.wh ? warehouses.find((x) => x.wh.id === o.wh) : undefined;
          if (!w) {
            return (
              <motion.g key={o.key} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.5, delay: Math.min(0.9, i * 0.012) }}>
                {o.shapes.map((s, j) => (
                  <ShapeEl key={j} s={s} />
                ))}
              </motion.g>
            );
          }
          // Parts of a warehouse rise from the ground, light up together and open it on click.
          return (
            <motion.g
              key={o.key}
              initial={reduce ? false : { opacity: 0, y: 40 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.7, delay: 0.2 + (o.wh === 2 ? 0.25 : 0) + i * 0.01, ease: [0.22, 1, 0.36, 1] }}
              className="cursor-pointer outline-none"
              style={{ filter: hover === o.wh ? "drop-shadow(0 0 14px rgb(225 105 43 / 0.7))" : undefined, transition: "filter .25s" }}
              onMouseEnter={() => setHover(o.wh ?? null)}
              onMouseLeave={() => setHover(null)}
              onClick={() => enter(w.wh.id)}
              {...(o.main
                ? {
                    role: "button",
                    tabIndex: 0,
                    "aria-label": `${name(w.wh)}: ${Math.round(w.fill * 100)}%`,
                    onFocus: () => setHover(w.wh.id),
                    onBlur: () => setHover(null),
                    onKeyDown: (e: React.KeyboardEvent) => (e.key === "Enter" || e.key === " ") && enter(w.wh.id),
                  }
                : {})}
            >
              {o.shapes.map((s, j) => (
                <ShapeEl key={j} s={s} />
              ))}
            </motion.g>
          );
        })}
      </svg>

      {/* How full each warehouse is, floating above it */}
      {drawn.map((w) => {
        const b = pct(SCENE.badge[w.wh.id]);
        const full = w.fill >= 0.85;
        return (
          <motion.button
            key={w.wh.id}
            type="button"
            onClick={() => enter(w.wh.id)}
            onMouseEnter={() => setHover(w.wh.id)}
            onMouseLeave={() => setHover(null)}
            initial={{ opacity: 0, scale: 0.6 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.9 + w.wh.id * 0.15, type: "spring", stiffness: 260, damping: 18 }}
            className="float absolute z-10 flex -translate-x-1/2 -translate-y-full flex-col items-center gap-1"
            style={{ left: `${b.x}%`, top: `${b.y}%` }}
            tabIndex={-1}
            aria-hidden
          >
            <span
              className={cn(
                "num relative flex size-12 items-center justify-center rounded-full text-sm font-bold shadow-lg ring-4 sm:size-14 sm:text-base",
                full ? "bg-action text-on-action ring-action/25" : "bg-primary text-on-primary ring-primary/25",
              )}
            >
              {Math.round(w.fill * 100)}%{/* The alerts count sits on the circle's edge (it used to sit on the edge of the whole label, far away) */}
              {w.alerts > 0 && (
                <span className="num absolute -end-1.5 -top-1.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-danger px-1 text-[10px] font-bold text-white ring-2 ring-card">
                  {w.alerts}
                </span>
              )}
            </span>
            <span className="whitespace-nowrap rounded-full bg-card/90 px-2.5 py-0.5 text-[11px] font-semibold text-text shadow backdrop-blur">
              {name(w.wh)}
              {myWarehouseId === w.wh.id && <span className="text-primary-ink"> · {tr("مخزنك", "yours")}</span>}
            </span>
          </motion.button>
        );
      })}

      {/* Details when you point at a warehouse */}
      <AnimatePresence>
        {hover !== null &&
          (() => {
            const w = drawn.find((x) => x.wh.id === hover);
            if (!w) return null;
            const b = pct(SCENE.badge[w.wh.id]);
            return (
              <motion.div
                key={hover}
                initial={{ opacity: 0, y: 8, scale: 0.96 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 8, scale: 0.96 }}
                transition={{ duration: 0.18 }}
                className="pointer-events-none absolute z-30 hidden w-64 -translate-x-1/2 rounded-2xl border border-line bg-card p-4 shadow-xl md:block"
                style={{ left: `${Math.min(80, Math.max(20, b.x))}%`, top: `calc(${b.y}% + 16px)` }}
              >
                <p className="font-bold">{name(w.wh)}</p>
                <div className="mt-2 h-2 overflow-hidden rounded-full bg-line">
                  <div className={cn("h-full rounded-full", w.fill >= 0.85 ? "bg-action" : "bg-primary")} style={{ width: `${w.fill * 100}%` }} />
                </div>
                <p className="mt-1 text-xs text-muted">
                  <span className="num">{num(Math.round(w.cartons))}</span> / <span className="num">{num(w.wh.capacity)}</span> {tr("كارتون", "cartons")}
                </p>
                <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                  <span className="flex items-center gap-1.5 rounded-lg bg-warning-soft px-2 py-1.5 text-warning">
                    <AlertTriangle className="size-3.5" /> <span className="num">{w.alerts}</span> {tr("تنبيه", "alerts")}
                  </span>
                  <span className="flex items-center gap-1.5 rounded-lg bg-primary-soft px-2 py-1.5 text-primary-ink">
                    <ClipboardList className="size-3.5" /> <span className="num">{w.pending}</span> {tr("طلب ينتظر", "waiting")}
                  </span>
                </div>
                <p className="mt-3 flex items-center gap-1 text-xs font-semibold text-primary-ink">
                  {tr("اضغط للدخول", "Click to go inside")} <Forward className="size-3.5" />
                </p>
              </motion.div>
            );
          })()}
      </AnimatePresence>

      {extra.length > 0 && (
        <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {extra.map((w) => (
            <button
              key={w.wh.id}
              type="button"
              onClick={() => enter(w.wh.id)}
              className="flex items-center gap-3 rounded-2xl border border-line bg-card p-3 text-start shadow-sm transition hover:-translate-y-0.5 hover:border-line-strong hover:shadow-md"
            >
              <span className={cn("num flex size-11 shrink-0 items-center justify-center rounded-full text-sm font-bold", w.fill >= 0.85 ? "bg-action text-on-action" : "bg-primary text-on-primary")}>
                {Math.round(w.fill * 100)}%
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate font-bold">
                  {name(w.wh)}
                  {myWarehouseId === w.wh.id && <span className="text-primary-ink"> · {tr("مخزنك", "yours")}</span>}
                </span>
                <span className="block text-xs text-muted">
                  <span className="num">{num(Math.round(w.cartons))}</span> / <span className="num">{num(w.wh.capacity)}</span> {tr("كارتون", "cartons")} · <span className="num">{w.alerts}</span>{" "}
                  {tr("تنبيه", "alerts")}
                </span>
              </span>
              <Forward className="size-4 shrink-0 text-faint" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
