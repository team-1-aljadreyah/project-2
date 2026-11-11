// The inside of a warehouse: its zones and the zone of every item. Shared by the pages (the map, the
// picking hall, the layout editor) and the API (to check and log a new layout), so both agree.
import type { Item, Warehouse, WarehouseLayout } from "./types";

const pad = (n: number) => String(n).padStart(2, "0");

/** A warehouse's inside: the one its manager or keeper arranged, or (before that) one zone per category. */
export function layoutOf(wh: Warehouse, items: Item[]): WarehouseLayout {
  if (wh.layout?.zones.length) return wh.layout;
  const categories = [...new Set(items.filter((i) => i.active).map((i) => i.category))];
  return { zones: categories.map((c, i) => ({ code: `Z${pad(i + 1)}`, name: c })), places: {} };
}

/** The zone an item is kept in: where it was put, else the zone named like its category, else the first zone. */
export function zoneOfItem(layout: WarehouseLayout, item: Item): string {
  const put = layout.places[String(item.id)];
  if (put && layout.zones.some((z) => z.code === put)) return put;
  return (layout.zones.find((z) => z.name === item.category) ?? layout.zones[0])?.code ?? "";
}

/** The next free zone code (Z01, Z02…). */
export function nextZoneCode(zones: { code: string }[]) {
  for (let n = 1; ; n++) if (!zones.some((z) => z.code === `Z${pad(n)}`)) return `Z${pad(n)}`;
}
