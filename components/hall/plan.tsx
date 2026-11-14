"use client";

// The floor plan of one warehouse, seen from above, like the design's production hall:
// receiving on one side, the loading dock on the other, a rack block for every zone (its small boxes
// colored by state), the routes of the open orders, and the selected order's route with numbered stops
// and a trolley that walks it.
import { useReducedMotion } from "motion/react";
import type { MapWarehouse } from "@/components/map/data";
import { useFmt } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { PLAN, layoutRacks, routeOf, type Mission, type Urgency } from "./data";

const SLOT_COLS = 6;
const SLOT_ROWS = 4;

const slotFill = {
  ok: "fill-success",
  near: "fill-warning",
  low: "fill-danger",
  expired: "fill-danger",
  empty: "fill-[var(--line-strong)]",
} as const;

export const urgencyStroke: Record<Urgency, string> = {
  ok: "stroke-success",
  soon: "stroke-warning",
  late: "stroke-danger",
  blocked: "stroke-[var(--faint)]",
};

export function HallPlan({
  view,
  missions,
  selected,
  inPallets,
  outPallets,
}: {
  view: MapWarehouse;
  missions: Mission[];
  selected: Mission | undefined;
  inPallets: number;
  outPallets: number;
}) {
  const { tr } = useFmt();
  const still = useReducedMotion();
  const { racks, mains } = layoutRacks(view.zones);
  const route = selected ? routeOf(selected.stops, racks) : null;
  const pickItems = new Set(selected?.lines.map((l) => l.item.id));
  const pickZones = new Set(selected?.stops.map((z) => z.code));

  return (
    <svg viewBox={`0 0 ${PLAN.w} ${PLAN.h}`} className="h-auto w-full select-none" role="img" aria-label={tr("مخطط المخزن", "Warehouse floor plan")} style={{ direction: "ltr" }}>
      <defs>
        <pattern id="hall-dots" width="20" height="20" patternUnits="userSpaceOnUse">
          <circle cx="1.5" cy="1.5" r="1.2" className="fill-[var(--line-strong)]" />
        </pattern>
        {/* Safety-tape stripes for the two docks, like the .hazard class */}
        <pattern id="hall-hazard" width="14" height="14" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <rect width="7" height="14" fill="#e1692b" />
          <rect x="7" width="7" height="14" fill="#1d2127" />
        </pattern>
      </defs>

      {/* The hall: floor, dotted grid, pillars */}
      <rect x="8" y="8" width={PLAN.w - 16} height={PLAN.h - 16} rx="26" className="fill-[var(--iso-ground)] stroke-[var(--line-strong)]" strokeWidth="2" />
      <rect x="8" y="8" width={PLAN.w - 16} height={PLAN.h - 16} rx="26" fill="url(#hall-dots)" opacity="0.6" />
      {[130, 310, 490, 670, 850].flatMap((x) =>
        [18, PLAN.h - 34].map((y) => <rect key={`${x}-${y}`} x={x} y={y} width="16" height="16" rx="3" className="fill-[var(--iso-left)] stroke-[var(--line-strong)]" />),
      )}

      {/* Main aisles: a soft lane with a dashed middle line */}
      {mains.map((y) => (
        <g key={y}>
          <rect x={PLAN.dockIn.x + PLAN.dockIn.w} y={y - 18} width={PLAN.dockOut.x - PLAN.dockIn.x - PLAN.dockIn.w} height="36" className="fill-[var(--iso-road)]" />
          <line x1={PLAN.dockIn.x + PLAN.dockIn.w} x2={PLAN.dockOut.x} y1={y} y2={y} className="stroke-[var(--iso-road-line)]" strokeWidth="2" strokeDasharray="10 10" />
        </g>
      ))}

      {/* The two docks, with their pallets */}
      <Dock x={PLAN.dockIn.x} label={tr("الاستلام", "Receiving")} count={inPallets} tone="in" />
      <Dock x={PLAN.dockOut.x} label={tr("التحميل", "Loading")} count={outPallets} tone="out" />

      {/* The racks: one block per zone */}
      {racks.map((r) => {
        const on = pickZones.has(r.zone.code);
        const slotW = (r.w - 20 - (SLOT_COLS - 1) * 4) / SLOT_COLS;
        const slotH = (r.h - 48 - (SLOT_ROWS - 1) * 4) / SLOT_ROWS;
        const total = SLOT_COLS * SLOT_ROWS;
        const filled = Math.round(r.zone.fill * total);
        return (
          <g key={r.zone.code}>
            <title>{`${r.zone.code} · ${r.zone.category} · ${Math.round(r.zone.fill * 100)}%`}</title>
            <rect x={r.x + 4} y={r.y + 6} width={r.w} height={r.h} rx="12" className="fill-[var(--iso-right)]" />
            <rect
              x={r.x}
              y={r.y}
              width={r.w}
              height={r.h}
              rx="12"
              className={cn("fill-[var(--iso-top)] transition-[stroke]", on ? "stroke-action" : "stroke-[var(--line-strong)]")}
              strokeWidth={on ? 3 : 1.5}
            />
            <rect x={r.x + 8} y={r.y + 8} width="40" height="22" rx="6" className={on ? "fill-action" : "fill-primary"} />
            <text x={r.x + 28} y={r.y + 23.5} textAnchor="middle" className={cn("text-[13px] font-bold", on ? "fill-[var(--on-action)]" : "fill-[var(--on-primary)]")}>
              {r.zone.code}
            </text>
            {/* The section's name stays inside its box, after the code badge: a long one ends with «…»
                (the full name is in the box's title, on hover). SVG text has no width limit, so it is HTML here. */}
            <foreignObject x={r.x + 54} y={r.y + 7} width={Math.max(0, r.w - 62)} height="24">
              <div dir="rtl" className="truncate text-end text-[16px] leading-6 font-bold text-text">
                {r.zone.category}
              </div>
            </foreignObject>
            {Array.from({ length: total }, (_, i) => {
              const cell = r.zone.cells[i];
              const x = r.x + 10 + (i % SLOT_COLS) * (slotW + 4);
              const y = r.y + 40 + Math.floor(i / SLOT_COLS) * (slotH + 4);
              const pick = cell && pickItems.has(cell.item.id);
              return (
                <rect
                  key={i}
                  x={x}
                  y={y}
                  width={slotW}
                  height={slotH}
                  rx="2.5"
                  className={cn(
                    cell ? slotFill[cell.status] : i < filled ? "fill-[var(--iso-glass)]" : "fill-transparent stroke-[var(--line-strong)]",
                    pick && "stroke-action",
                  )}
                  strokeWidth={pick ? 3 : 1}
                  opacity={cell || i < filled ? 1 : 0.7}
                >
                  {cell && <title>{`${cell.code} · ${cell.item.name}`}</title>}
                  {pick && !still && <animate attributeName="opacity" values="1;0.45;1" dur="1.4s" repeatCount="indefinite" />}
                </rect>
              );
            })}
          </g>
        );
      })}

      {/* Routes of the other open orders: thin lines colored by how urgent they are */}
      {missions
        .filter((m) => m !== selected)
        .map((m) => (
          <path key={m.order.id} d={routeOf(m.stops, racks).d} fill="none" className={urgencyStroke[m.urgency]} strokeWidth="2" opacity="0.4" strokeLinejoin="round" />
        ))}

      {/* The selected order: a thick route, numbered stops, a start dot and a trolley walking it */}
      {route && selected && (
        <g key={selected.order.id}>
          <path d={route.d} fill="none" className="stroke-[var(--iso-top)]" strokeWidth="9" strokeLinejoin="round" strokeLinecap="round" />
          <path d={route.d} fill="none" className="stroke-action" strokeWidth="4.5" strokeLinejoin="round" strokeLinecap="round" pathLength={1} strokeDasharray="1" strokeDashoffset="1">
            {/* The route draws itself from the start to the dock */}
            <animate attributeName="stroke-dashoffset" from="1" to="0" dur={still ? "0.01s" : "1.1s"} fill="freeze" />
          </path>
          {route.points.map((p, i) => (
            <g key={i}>
              <circle cx={p.x} cy={p.y} r="13" className="fill-action stroke-[var(--iso-top)]" strokeWidth="3" />
              <text x={p.x} y={p.y + 4.5} textAnchor="middle" className="fill-[var(--on-action)] text-[12px] font-bold">
                {i + 1}
              </text>
            </g>
          ))}
          {!still && (
            <g>
              <rect x="-11" y="-8" width="22" height="16" rx="4" className="fill-primary stroke-[var(--iso-top)]" strokeWidth="2" />
              <circle cx="-5" cy="9" r="2.5" className="fill-primary" />
              <circle cx="5" cy="9" r="2.5" className="fill-primary" />
              <animateMotion dur={`${4 + route.points.length * 1.5}s`} begin="1.1s" repeatCount="indefinite" path={route.d} />
            </g>
          )}
        </g>
      )}
    </svg>
  );
}

function Dock({ x, label, count, tone }: { x: number; label: string; count: number; tone: "in" | "out" }) {
  const shown = Math.min(count, 14);
  return (
    <g>
      <rect x={x} y={PLAN.top} width={PLAN.dockIn.w} height={PLAN.bottom - PLAN.top} rx="12" className="fill-[var(--card-2)] stroke-[var(--line-strong)]" strokeDasharray="6 5" strokeWidth="1.5" />
      <rect x={x} y={PLAN.top} width={PLAN.dockIn.w} height="8" rx="3" fill="url(#hall-hazard)" />
      <text x={x + PLAN.dockIn.w / 2} y={PLAN.top + 34} textAnchor="middle" className="fill-text text-[15px] font-bold">
        {label}
      </text>
      <text x={x + PLAN.dockIn.w / 2} y={PLAN.top + 52} textAnchor="middle" className="fill-[var(--muted)] text-[14px] font-semibold">
        {count}
      </text>
      {Array.from({ length: shown }, (_, i) => (
        <rect
          key={i}
          x={x + 12 + (i % 2) * 30}
          y={PLAN.top + 70 + Math.floor(i / 2) * 32}
          width="26"
          height="26"
          rx="4"
          className={tone === "out" ? "fill-success" : "fill-[var(--iso-glass)]"}
          opacity={0.9}
        />
      ))}
    </g>
  );
}
