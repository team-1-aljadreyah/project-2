// Turns the stock data into the shape the warehouse map needs:
// warehouses → zones (the warehouse's own layout, or one per category) → cells (one per item),
// plus who is working today and the numbers of the bottom bar.
import type { ShelfRow } from "@/lib/api";
import type { Batch, Invoice, Item, Order, Warehouse } from "@/lib/api/types";
import { layoutOf, zoneOfItem } from "@/lib/api/warehouse-layout";

export { layoutOf, nextZoneCode, zoneOfItem } from "@/lib/api/warehouse-layout";
import { dayOfIso, daysUntil, today } from "@/lib/utils";

export type CellStatus = "ok" | "low" | "near" | "expired" | "empty";

export interface MapCell {
  item: Item;
  /** Short code like on a real shelf label: Z06-A02 = zone 6, aisle 2. */
  code: string;
  onShelf: number; // pieces in this warehouse, expired included
  sellable: number; // not expired and not held by orders
  reserved: number; // held by orders that wait
  expired: number;
  near?: { pieces: number; days: number };
  status: CellStatus;
  pending: number; // waiting orders from this warehouse that contain the item
  neededBy: string[]; // reps of those orders
  otherSellable: number; // sellable in the other warehouse (for "transfer from")
}

export interface MapZone {
  code: string;
  index: number;
  category: string;
  cells: MapCell[];
  cartons: number;
  fill: number; // 0..1
  alerts: number;
  pending: number;
}

export interface MapWarehouse {
  wh: Warehouse;
  zones: MapZone[];
  cartons: number;
  reservedCartons: number;
  fill: number; // 0..1
  alerts: number;
  pending: number;
}

export interface Person {
  name: string;
  warehouseId: number;
  kind: "rep" | "staff";
}

const pad = (n: number) => String(n).padStart(2, "0");
const isOpen = (o: Order) => o.status === "pending" || o.status === "needs_approval" || (o.status === "approved" && !o.delivery);

export function buildMap({
  items,
  warehouses,
  shelf,
  batches,
  orders,
  reps,
}: {
  items: Item[];
  warehouses: Warehouse[];
  shelf: ShelfRow[];
  batches: Batch[];
  orders: Order[];
  reps: { id: number; name: string }[];
}): MapWarehouse[] {
  const active = items.filter((i) => i.active);
  const shelfBy = new Map(shelf.map((r) => [r.item_id, r]));
  const open = orders.filter(isOpen);
  const repName = (id: number) => reps.find((r) => r.id === id)?.name ?? "";

  return warehouses.map((wh) => {
    const layout = layoutOf(wh, items);
    const zoneOf = new Map(active.map((i) => [i.id, zoneOfItem(layout, i)]));
    const zones: MapZone[] = layout.zones.map((z, zi) => {
      const cells: MapCell[] = active
        .filter((i) => zoneOf.get(i.id) === z.code)
        .map((item, ai) => {
          const rows = shelfBy.get(item.id)?.by_warehouse ?? [];
          const here = rows.find((w) => w.warehouse_id === wh.id);
          const onShelf = here?.on_shelf ?? 0;
          const sellable = here?.sellable ?? 0;
          const reserved = here?.reserved ?? 0;
          const expired = here?.expired ?? 0;
          const otherSellable = rows.filter((w) => w.warehouse_id !== wh.id).reduce((s, w) => s + w.sellable, 0);

          // Pieces that expire soon in this warehouse, and how many days the first of them has left.
          const nearBatches = batches.filter((b) => b.item_id === item.id && b.warehouse_id === wh.id && b.qty_left > 0 && b.status === "near_expiry");
          const near = nearBatches.length ? { pieces: nearBatches.reduce((s, b) => s + b.qty_left, 0), days: Math.min(...nearBatches.map((b) => daysUntil(b.expiry_date))) } : undefined;

          const waiting = open.filter((o) => o.warehouse_id === wh.id && o.lines.some((l) => l.item_id === item.id));
          const neededBy = [...new Set(waiting.map((o) => repName(o.rep_id)).filter(Boolean))];
          const low = item.stock.total < item.min_stock;

          let status: CellStatus = "ok";
          if (onShelf === 0) status = low ? "low" : "empty";
          else if (expired > 0) status = "expired";
          else if (low) status = "low";
          else if (near) status = "near";

          return {
            item,
            code: `${z.code}-A${pad(ai + 1)}`,
            onShelf,
            sellable,
            reserved,
            expired,
            near,
            status,
            pending: waiting.length,
            neededBy,
            otherSellable,
          };
        });
      const cartons = cells.reduce((s, c) => s + c.onShelf / c.item.pieces_per_carton, 0);
      return {
        code: z.code,
        index: zi,
        // The zone's name (it was the category's name before warehouses could be arranged).
        category: z.name,
        cells,
        cartons,
        // Each zone gets an equal share of the warehouse space.
        fill: Math.min(1, cartons / (wh.capacity / layout.zones.length)),
        alerts: cells.filter((c) => c.status === "low" || c.status === "near" || c.status === "expired").length,
        pending: cells.reduce((s, c) => s + c.pending, 0),
      };
    });
    const cartons = zones.reduce((s, z) => s + z.cartons, 0);
    const reservedCartons = zones.reduce((s, z) => s + z.cells.reduce((a, c) => a + c.reserved / c.item.pieces_per_carton, 0), 0);
    return {
      wh,
      zones,
      cartons,
      reservedCartons,
      fill: wh.capacity ? Math.min(1, cartons / wh.capacity) : 0,
      alerts: zones.reduce((s, z) => s + z.alerts, 0),
      pending: open.filter((o) => o.warehouse_id === wh.id).length,
    };
  });
}

/** Who worked today: reps who took orders, and staff who issued invoices. */
export function peopleToday(orders: Order[], invoices: Invoice[], reps: { id: number; name: string }[]): Person[] {
  const t = today();
  const out = new Map<string, Person>();
  for (const o of orders) {
    if (o.status === "cancelled" || dayOfIso(o.created_at) !== t) continue;
    const rep = reps.find((r) => r.id === o.rep_id);
    if (rep && !out.has(rep.name)) out.set(rep.name, { name: rep.name, warehouseId: o.warehouse_id, kind: "rep" });
  }
  for (const inv of invoices) {
    if (dayOfIso(inv.date) !== t || out.has(inv.created_by.name)) continue;
    out.set(inv.created_by.name, { name: inv.created_by.name, warehouseId: inv.warehouse_id, kind: "staff" });
  }
  return [...out.values()];
}

export interface MapNumbers {
  used: number; // 0..1
  cartons: number;
  reservedCartons: number;
  people: number;
  ordersToday: number;
  ordersChange: number | null; // % vs yesterday
  turnover: number; // % of the stock sold in the last 7 days
  turnoverChange: number | null; // % vs the 7 days before
}

/** The numbers of the bottom bar, for one warehouse or all of them. */
export function mapNumbers(views: MapWarehouse[], scope: number[], orders: Order[], invoices: Invoice[], people: Person[]): MapNumbers {
  const ws = views.filter((v) => scope.includes(v.wh.id));
  const capacity = ws.reduce((s, v) => s + v.wh.capacity, 0);
  const cartons = ws.reduce((s, v) => s + v.cartons, 0);
  const inScope = (whId: number) => scope.includes(whId);
  const t = today();
  const y = today(-1);
  const countOn = (day: string) => orders.filter((o) => inScope(o.warehouse_id) && o.status !== "cancelled" && dayOfIso(o.created_at) === day).length;
  const soldBetween = (from: string, to: string) =>
    invoices
      .filter((i) => inScope(i.warehouse_id))
      .filter((i) => {
        const d = dayOfIso(i.date);
        return d >= from && d <= to;
      })
      .reduce((s, i) => s + i.lines.reduce((a, l) => a + l.pieces - l.returned_pieces, 0), 0);
  const onShelfPieces = ws.reduce((s, v) => s + v.zones.reduce((a, z) => a + z.cells.reduce((b, c) => b + c.onShelf, 0), 0), 0);
  const sold7 = soldBetween(today(-6), t);
  const prev7 = soldBetween(today(-13), today(-7));
  const change = (cur: number, prev: number) => (prev ? ((cur - prev) / prev) * 100 : null);
  const ordersToday = countOn(t);
  return {
    used: capacity ? Math.min(1, cartons / capacity) : 0,
    cartons,
    reservedCartons: ws.reduce((s, v) => s + v.reservedCartons, 0),
    people: people.filter((p) => inScope(p.warehouseId)).length,
    ordersToday,
    ordersChange: change(ordersToday, countOn(y)),
    turnover: onShelfPieces ? (sold7 / onShelfPieces) * 100 : 0,
    turnoverChange: change(sold7, prev7),
  };
}
