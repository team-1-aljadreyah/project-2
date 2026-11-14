// «أعلمني عند التوفر»: a shop owner asks to be told when an item that ran out is back. The moment it can be
// sold again from the shops' warehouse, he gets a notification (with the sound and on his phone) and the ask is
// done. The manager, the accountant and the keepers see what the shops are waiting for (to buy it first).
// These are the backend's rules (docs/backend.md → «أعلمني عند التوفر»).
import type { StockWait } from "../types";
import type { Db, DbUser } from "./db";
import { R, fail, need, notify, sellableQty } from "./rules";

/** The shops order from the first warehouse (as the shop owner's app does). */
const shopWarehouse = (db: Db) => db.warehouses[0]?.id;

/** The items this shop owner asked about (for the shop he works on now). */
export function myStockAlerts(db: Db, a: DbUser): number[] {
  need(a, ["shop"]);
  return (db.stock_alerts ?? []).filter((x) => x.customer_id === a.customer_id && x.user_id === a.id).map((x) => x.item_id);
}

/** Ask (on) or stop asking (off). Only for an item that is out now; at most 50 asks per shop. */
export function setStockAlert(db: Db, a: DbUser, itemId: number, on: boolean, now: Date): number[] {
  need(a, ["shop"]);
  if (on && !R().features.notify_me) fail(403, "FEATURE_OFF", "«أعلمني عند التوفر» متوقف الآن", "“Notify me” is turned off");
  db.stock_alerts ??= [];
  const mine = (x: { customer_id: number; user_id: number; item_id: number }) => x.customer_id === a.customer_id && x.user_id === a.id;
  if (!on) {
    db.stock_alerts = db.stock_alerts.filter((x) => !(mine(x) && x.item_id === itemId));
    return myStockAlerts(db, a);
  }
  const it = db.items.find((x) => x.id === itemId && x.active && !x.deleted);
  if (!it) fail(404, "NOT_FOUND", "المادة غير موجودة", "Item not found");
  if (sellableQty(db, itemId, shopWarehouse(db), now) > 0) fail(409, "BAD_STATE", "المادة متوفرة الآن، اطلبها", "It is in stock now: order it");
  if (!db.stock_alerts.some((x) => mine(x) && x.item_id === itemId)) {
    if (db.stock_alerts.filter(mine).length >= 50) fail(409, "BAD_STATE", "50 مادة على الأكثر", "50 items at most");
    db.stock_alerts.push({ customer_id: a.customer_id!, user_id: a.id, item_id: itemId, at: now.toISOString() });
  }
  return myStockAlerts(db, a);
}

/** Runs before every request: an item back in stock tells everyone who asked (once), then the asks are done. */
export function checkStockAlerts(db: Db, now: Date) {
  if (!db.stock_alerts?.length || !R().features.notify_me) return;
  const wh = shopWarehouse(db);
  const back = new Map<number, boolean>();
  const isBack = (id: number) => {
    if (!back.has(id)) back.set(id, sellableQty(db, id, wh, now) > 0);
    return back.get(id)!;
  };
  const keep: typeof db.stock_alerts = [];
  for (const x of db.stock_alerts) {
    const it = db.items.find((i) => i.id === x.item_id);
    if (!it || it.deleted || !it.active) continue; // gone: nothing to wait for
    if (!isBack(x.item_id)) {
      keep.push(x);
      continue;
    }
    notify(
      db,
      {
        type: "back_in_stock",
        roles: ["shop"],
        user_id: x.user_id,
        title: `توفّرت «${it.name}» من جديد`,
        title_en: `${it.name_en} is back in stock`,
        body: "اطلبها قبل أن تنفد مرة أخرى",
        body_en: "Order it before it runs out again",
        link: `/search?item=${it.id}`,
      },
      now,
    );
  }
  db.stock_alerts = keep;
}

/** What the shops are waiting for: most shops first (manager, accountant, keepers, staff). */
export function stockWaitlist(db: Db, a: DbUser): StockWait[] {
  need(a, ["manager", "accountant", "warehouse", "staff"]);
  const by = new Map<number, StockWait>();
  for (const x of db.stock_alerts ?? []) {
    const it = db.items.find((i) => i.id === x.item_id);
    if (!it) continue;
    const w = by.get(it.id) ?? { item: { id: it.id, name: it.name, name_en: it.name_en }, shops: 0, since: x.at, customers: [] };
    if (!w.customers.some((c) => c.id === x.customer_id)) {
      const c = db.customers.find((y) => y.id === x.customer_id);
      w.customers.push({ id: x.customer_id, name: c?.name ?? "-" });
      w.shops = w.customers.length;
    }
    if (x.at < w.since) w.since = x.at;
    by.set(it.id, w);
  }
  return [...by.values()].sort((p, q) => q.shops - p.shops || p.since.localeCompare(q.since));
}
