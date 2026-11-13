// «عروض التصريف», the part the prices need (kept apart so the order rules can use it without a loop of imports).
import type { ItemClearance } from "../types";
import type { Db } from "./db";

/** The day before a day (yyyy-mm-dd). */
const dayBefore = (day: string) => {
  const d = new Date(`${day}T12:00:00`);
  d.setDate(d.getDate() - 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

/** The clearance running on an item in a warehouse today: its batch still has pieces and isn't expired. */
export function clearanceFor(db: Db, itemId: number, warehouseId: number | undefined, day: string): ItemClearance | undefined {
  for (const c of db.clearances ?? []) {
    if (c.status !== "active" || c.item_id !== itemId || (warehouseId && c.warehouse_id !== warehouseId)) continue;
    const b = db.batches.find((x) => x.id === c.batch_id);
    if (!b || b.qty_left <= 0 || b.held) continue;
    const until = dayBefore(b.expiry_date);
    if (until < day) continue;
    return { id: c.id, percent: c.percent, warehouse_id: c.warehouse_id, until, left: b.qty_left };
  }
  return undefined;
}

export { dayBefore };
