// Vehicles and loads: what a shipment weighs, how much a vehicle can still take, and how to split a big order
// across vehicles. Shared by the pages (the planner) and the API (its checks), so both count the same way.
// Weights are in kilograms; an item's weight is per piece.
import type { Item, Order, OrderLine, ShipmentLoad, Unit, Vehicle } from "./types";

/** An item's weight per piece, read from its name when it has none ("Basmati rice 5 kg" → 5, "Water 500 ml" → 0.5). */
export function guessWeight(nameEn: string): number {
  const m = /(\d+(?:\.\d+)?)\s*(kg|g|l|ml)\b/i.exec(nameEn);
  if (!m) return 0.5;
  const n = Number(m[1]);
  const unit = m[2].toLowerCase();
  // Liquids weigh about a kilogram a litre; the packaging adds a little.
  const kg = unit === "kg" || unit === "l" ? n : n / 1000;
  return Math.round(kg * 1.05 * 100) / 100;
}

export const pieceWeight = (item: Pick<Item, "weight_kg" | "name_en">) => item.weight_kg ?? guessWeight(item.name_en);

const piecesIn = (item: Pick<Item, "pieces_per_carton">, unit: Unit, qty: number) => (unit === "carton" ? qty * item.pieces_per_carton : qty);

/** The weight of some lines (kg, one decimal). */
export function linesWeight(lines: { item_id: number; unit: Unit; qty: number }[], itemOf: (id: number) => Pick<Item, "weight_kg" | "name_en" | "pieces_per_carton"> | undefined) {
  const kg = lines.reduce((s, l) => {
    const it = itemOf(l.item_id);
    return s + (it ? piecesIn(it, l.unit, l.qty) * pieceWeight(it) : 0);
  }, 0);
  return Math.round(kg * 10) / 10;
}

/** What is in a vehicle now: its shipments loaded at the warehouse or on the road (kg). */
export function vehicleLoad(vehicleId: number, orders: Order[], itemOf: Parameters<typeof linesWeight>[1], exceptOrderId?: number) {
  return orders
    .filter((o) => o.id !== exceptOrderId && o.delivery?.vehicle?.id === vehicleId && (o.delivery.status === "out" || (o.delivery.status === "ready" && !!o.delivery.loaded_at)))
    .reduce((s, o) => s + linesWeight(o.lines, itemOf), 0);
}

/**
 * Split an order's lines across vehicles: the first vehicle is filled up to its load, then the next one, and so
 * on (a line is split when it doesn't fit whole, by cartons or pieces as it was ordered). The vehicles are tried
 * in the order given (the planner puts the order's own vehicle first, then the ones with the most room).
 * Returns the loads; `left` is what no vehicle could take (more vehicles are needed).
 */
export function suggestLoads(
  lines: OrderLine[],
  vehicles: Pick<Vehicle, "id" | "capacity_kg">[],
  itemOf: Parameters<typeof linesWeight>[1],
): { loads: ShipmentLoad[]; left: { item_id: number; unit: Unit; qty: number }[] } {
  const queue = lines.map((l) => ({ item_id: l.item_id, unit: l.unit, qty: l.qty }));
  const loads: ShipmentLoad[] = [];
  for (const v of vehicles) {
    let room = v.capacity_kg;
    const load: ShipmentLoad = { vehicle_id: v.id, lines: [] };
    for (const l of queue) {
      if (l.qty <= 0) continue;
      const it = itemOf(l.item_id);
      const each = it ? piecesIn(it, l.unit, 1) * pieceWeight(it) : 0;
      const fit = each > 0 ? Math.min(l.qty, Math.floor(room / each + 1e-9)) : l.qty;
      if (fit <= 0) continue;
      load.lines.push({ item_id: l.item_id, unit: l.unit, qty: fit });
      l.qty -= fit;
      room -= fit * each;
    }
    if (load.lines.length) loads.push(load);
    if (queue.every((l) => l.qty <= 0)) break;
  }
  return { loads, left: queue.filter((l) => l.qty > 0) };
}
