// Supply orders against what really arrived: shared by the receiving form, the order's details and the API,
// so the keeper, the accountant and the server count the difference the same way.
import type { Item, SupplyOrder, Unit } from "./types";

/** A quantity in another unit (cartons ↔ pieces), two decimals. */
export function toUnit(item: Pick<Item, "pieces_per_carton"> | undefined, qty: number, from: Unit, to: Unit) {
  if (from === to || !item) return qty;
  const pieces = from === "carton" ? qty * item.pieces_per_carton : qty;
  return Math.round((to === "carton" ? pieces / item.pieces_per_carton : pieces) * 100) / 100;
}

/** One line of the order: how much was ordered, how much arrived, the difference (negative = less arrived). */
export interface SupplyGap {
  item_id: number;
  unit: Unit;
  ordered: number;
  arrived: number;
  diff: number;
  /** The value of what is missing (or extra), at the order's price. */
  value: number;
}

export function supplyGaps(order: Pick<SupplyOrder, "lines">): SupplyGap[] {
  return order.lines.map((l) => {
    const diff = Math.round((l.received_qty - l.qty) * 100) / 100;
    return { item_id: l.item_id, unit: l.unit, ordered: l.qty, arrived: l.received_qty, diff, value: Math.round(diff * l.price) };
  });
}

/** The missing part of an order, in money (what wasn't delivered, at the agreed prices). */
export const missingValue = (order: Pick<SupplyOrder, "lines">) => supplyGaps(order).reduce((s, g) => s + (g.diff < 0 ? -g.value : 0), 0);
