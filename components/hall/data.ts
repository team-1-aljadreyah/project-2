// The keeper's "picking hall": turns the open orders of his warehouse into "missions" (like the design's
// robot missions): which zones to visit, in what order, which batch to take, and how much time is left.
import type { Batch, Customer, Item, Order } from "@/lib/api/types";
import type { MapCell, MapWarehouse, MapZone } from "@/components/map/data";
import { piecesOf } from "@/lib/utils";

export type Urgency = "ok" | "soon" | "late" | "blocked";

export interface MissionLine {
  item: Item;
  pieces: number;
  zone: MapZone;
  cell: MapCell;
  /** The batch to take first: the oldest expiry that is not expired (FEFO), like the system will use. */
  batch?: Batch;
}

export interface Mission {
  order: Order;
  customer: string;
  rep: string;
  lines: MissionLine[];
  /** Zones to visit, in walking order (the same order as the numbered stops on the plan). */
  stops: MapZone[];
  cartons: number;
  urgency: Urgency;
  /** Minutes until the reservation ends (null when there is none). */
  minutesLeft: number | null;
}

/** "soon" = less than 2 hours left on the reservation. */
const SOON_MIN = 120;

export function buildMissions({
  view,
  orders,
  items,
  customers,
  reps,
  batches,
  now,
}: {
  view: MapWarehouse;
  orders: Order[];
  items: Item[];
  customers: Customer[];
  reps: { id: number; name: string }[];
  batches: Batch[];
  now: number;
}): Mission[] {
  // Where every item lives in this warehouse: its zone and its shelf cell.
  const where = new Map<number, { zone: MapZone; cell: MapCell }>();
  for (const zone of view.zones) for (const cell of zone.cells) where.set(cell.item.id, { zone, cell });

  const open = orders.filter((o) => o.warehouse_id === view.wh.id && ((o.status === "approved" && !o.delivery) || o.status === "pending" || o.status === "needs_approval"));

  const missions = open.map((order): Mission => {
    const lines: MissionLine[] = [];
    for (const l of order.lines) {
      const item = items.find((i) => i.id === l.item_id);
      const at = where.get(l.item_id);
      if (!item || !at) continue;
      const batch = batches
        .filter((b) => b.item_id === item.id && b.warehouse_id === view.wh.id && b.qty_left > 0 && b.status !== "expired")
        .sort((a, b) => a.expiry_date.localeCompare(b.expiry_date))[0];
      lines.push({ item, pieces: piecesOf(item, l.unit, l.qty), zone: at.zone, cell: at.cell, batch });
    }
    // Walk the hall from the receiving side to the loading dock, column by column, so the path never goes back.
    lines.sort((a, b) => walkOrder(a.zone.index) - walkOrder(b.zone.index) || a.cell.code.localeCompare(b.cell.code));
    const stops = [...new Map(lines.map((l) => [l.zone.code, l.zone])).values()];

    const minutesLeft = order.reserved_until ? Math.round((new Date(order.reserved_until).getTime() - now) / 60000) : null;
    let urgency: Urgency = "ok";
    // Only an approved order is prepared; the others wait for the accountant / manager.
    if (order.status !== "approved") urgency = "blocked";
    else if (minutesLeft !== null && minutesLeft <= 0) urgency = "late";
    else if (minutesLeft !== null && minutesLeft < SOON_MIN) urgency = "soon";

    return {
      order,
      customer: customers.find((c) => c.id === order.customer_id)?.name ?? "",
      rep: reps.find((r) => r.id === order.rep_id)?.name ?? "",
      lines,
      stops,
      cartons: lines.reduce((s, l) => s + l.pieces / l.item.pieces_per_carton, 0),
      urgency,
      minutesLeft,
    };
  });

  // Most urgent first; orders waiting for the manager go last (the keeper can't confirm them yet).
  const rank: Record<Urgency, number> = { late: 0, soon: 1, ok: 2, blocked: 3 };
  return missions.sort((a, b) => rank[a.urgency] - rank[b.urgency] || (a.minutesLeft ?? 1e9) - (b.minutesLeft ?? 1e9));
}

// ---------- The floor plan's layout (in plan units; the SVG scales it to the screen) ----------

export const PLAN = { w: 1000, h: 600, dockIn: { x: 30, w: 80 }, dockOut: { x: 890, w: 80 }, top: 60, bottom: 540 };
const COLS = 4;

/** A zone's place in the walk: its column first (left → right), then its row. */
export const walkOrder = (zoneIndex: number) => (zoneIndex % COLS) * 100 + Math.floor(zoneIndex / COLS);
const RACK_W = 150;
const STEP_X = 180; // rack width + vertical aisle
const AISLE_H = 70; // the main aisle between two rows of racks

export interface RackBox {
  zone: MapZone;
  x: number;
  y: number;
  w: number;
  h: number;
  /** The vertical aisle on the rack's right side, where the keeper stops to pick. */
  aisleX: number;
  /** The main aisle this rack is reached from. */
  mainY: number;
}

/** Places the zones on the floor: 4 per row, rows separated by a main aisle. */
export function layoutRacks(zones: MapZone[]): { racks: RackBox[]; mains: number[] } {
  const rows = Math.max(1, Math.ceil(zones.length / COLS));
  const rowH = (PLAN.bottom - PLAN.top - (rows - 1) * AISLE_H) / rows;
  const mains = Array.from({ length: Math.max(1, rows - 1) }, (_, r) => (rows === 1 ? PLAN.bottom - 20 : PLAN.top + (r + 1) * rowH + r * AISLE_H + AISLE_H / 2));
  const racks = zones.map((zone, i) => {
    const col = i % COLS;
    const row = Math.floor(i / COLS);
    const x = 150 + col * STEP_X;
    const y = PLAN.top + row * (rowH + AISLE_H);
    // Rows above a main aisle use the aisle below them; the last row uses the aisle above it.
    const mainY = mains[Math.min(row, mains.length - 1)];
    return { zone, x, y, w: RACK_W, h: rowH, aisleX: x + RACK_W + (STEP_X - RACK_W) / 2, mainY };
  });
  return { racks, mains };
}

/**
 * The walking path of a mission, with right angles like the design's routes:
 * leave the receiving side → along the main aisle → into the aisle next to each zone and back → the loading dock.
 */
export function routeOf(stops: MapZone[], racks: RackBox[]): { d: string; points: { x: number; y: number }[] } {
  // The stops already come in walking order (see walkOrder), so stop 1 on the plan = stop 1 in the checklist.
  const boxes = stops.map((z) => racks.find((r) => r.zone.code === z.code)).filter((r): r is RackBox => !!r);
  const startY = boxes[0]?.mainY ?? racks[0]?.mainY ?? PLAN.h / 2;
  const startX = PLAN.dockIn.x + PLAN.dockIn.w;
  let d = `M ${startX} ${startY}`;
  let y = startY;
  const points: { x: number; y: number }[] = [];
  for (const b of boxes) {
    if (b.mainY !== y) {
      // Change main aisle through this aisle.
      d += ` H ${b.aisleX} V ${b.mainY}`;
      y = b.mainY;
    }
    const mid = b.y + b.h / 2;
    d += ` H ${b.aisleX} V ${mid} V ${y}`;
    points.push({ x: b.aisleX, y: mid });
  }
  d += ` H ${PLAN.dockOut.x}`;
  return { d, points };
}
