// «قارب ينفد عندك؟»: from each shop's own orders the site learns how many days usually pass between its orders
// of each item. When that time has about come, the shop owner sees the item on his home with a button to add it
// (and gets one notification a day at most); the rep sees the shops later than usual with their next order.
// These are the backend's rules (docs/backend.md → «قارب ينفد عندك؟»).
import type { LateShop, Order, ReorderDue } from "../types";
import type { Db, DbUser } from "./db";
import { R, dayOf, need, notify } from "./rules";

const DAY = 86_400_000;
const days = (a: string, b: string) => Math.round((new Date(`${b}T12:00:00`).getTime() - new Date(`${a}T12:00:00`).getTime()) / DAY);
const counts = (o: Order) => o.status !== "cancelled" && o.status !== "expired" && !o.shipment_of && !o.counter;
/** Still open: ordered and not delivered yet (it is coming; no need to order it again). */
const open = (o: Order) => (o.status === "pending" || o.status === "needs_approval" || o.status === "approved" || (o.status === "confirmed" && o.delivery && o.delivery.status !== "delivered")) && !o.shipment_of;

/** The average gap between days (3 days at least needed: 2 gaps). */
function rhythm(list: string[]) {
  const d = [...new Set(list)].sort();
  if (d.length < 3) return null;
  const gaps = d.slice(1).map((x, i) => days(d[i], x));
  return { every: Math.max(1, Math.round(gaps.reduce((s, g) => s + g, 0) / gaps.length)), last: d[d.length - 1] };
}

/** A shop's items due about now: its time since the last order of it reached the usual gap (less a day), and not
 *  three times past it (then it likely stopped buying it). Items on an open order, stopped or deleted are left out. */
export function dueFor(db: Db, customerId: number, now: Date): ReorderDue[] {
  const today = dayOf(now);
  const mine = db.orders.filter((o) => o.customer_id === customerId && counts(o));
  const onTheWay = new Set(mine.filter(open).flatMap((o) => o.lines.map((l) => l.item_id)));
  const byItem = new Map<number, { days: string[]; last: { at: string; unit: ReorderDue["last_unit"]; qty: number } }>();
  for (const o of mine.sort((a, b) => a.created_at.localeCompare(b.created_at)))
    for (const l of o.lines) {
      const e = byItem.get(l.item_id) ?? { days: [], last: { at: o.created_at, unit: l.unit, qty: l.qty } };
      e.days.push(dayOf(new Date(o.created_at)));
      e.last = { at: o.created_at, unit: l.unit, qty: l.qty };
      byItem.set(l.item_id, e);
    }
  const out: ReorderDue[] = [];
  for (const [itemId, e] of byItem) {
    const it = db.items.find((x) => x.id === itemId);
    if (!it || !it.active || it.deleted || onTheWay.has(itemId)) continue;
    const r = rhythm(e.days);
    if (!r) continue;
    const since = days(r.last, today);
    // Reminded this many days before its usual time (the manager's setting; a day unless he changed it).
    if (since >= Math.max(1, r.every - R().reorder_early_days) && since <= r.every * 3) out.push({ item_id: itemId, every_days: r.every, days_since: since, last_at: e.last.at, last_unit: e.last.unit, last_qty: e.last.qty });
  }
  // The most overdue (for its own rhythm) first.
  return out.sort((a, b) => b.days_since / b.every_days - a.days_since / a.every_days).slice(0, 12);
}

/** The shop owner's: for the shop he works on now. */
export function myReorder(db: Db, a: DbUser, now: Date): ReorderDue[] {
  if (!R().features.reorder) return [];
  need(a, ["shop"]);
  return a.customer_id ? dueFor(db, a.customer_id, now) : [];
}

/** Shops later than usual with their next order: a quarter past their usual gap and two days at least.
 *  A rep: his own shops; the manager and the accountant: every shop. */
export function lateShops(db: Db, a: DbUser, now: Date): LateShop[] {
  if (!R().features.reorder) return [];
  need(a, ["rep", "manager", "accountant"]);
  const today = dayOf(now);
  const out: LateShop[] = [];
  for (const c of db.customers) {
    if (!c.active || c.pending || c.walk_in || (a.role === "rep" && c.rep_id !== a.id)) continue;
    const mine = db.orders.filter((o) => o.customer_id === c.id && counts(o));
    if (mine.some(open)) continue;
    const r = rhythm(mine.map((o) => dayOf(new Date(o.created_at))));
    if (!r) continue;
    const since = days(r.last, today);
    if (since > r.every * 1.25 && since >= r.every + 2) out.push({ customer: { id: c.id, name: c.name, area: c.area, phone: c.phone, rep_id: c.rep_id }, every_days: r.every, days_since: since, last_at: r.last });
  }
  return out.sort((x, y) => y.days_since / y.every_days - x.days_since / x.every_days);
}

/** Runs before every request: each shop owner with items due gets one reminder a day (from 9 in the morning). */
export function remindReorders(db: Db, now: Date) {
  if (!R().features.reorder || now.getHours() < 9) return;
  const today = dayOf(now);
  db.reorder_told ??= {};
  for (const u of db.users) {
    if (u.role !== "shop" || !u.active || !u.customer_id || db.reorder_told[u.id] === today) continue;
    db.reorder_told[u.id] = today;
    const due = dueFor(db, u.customer_id, now);
    if (!due.length) continue;
    const names = due.slice(0, 3).map((d) => db.items.find((i) => i.id === d.item_id)!);
    notify(
      db,
      {
        type: "reorder",
        roles: ["shop"],
        user_id: u.id,
        title: due.length === 1 ? `قارب ينفد عندك ${names[0].name}؟` : `قاربت ${due.length} مواد على النفاد عندك؟`,
        title_en: due.length === 1 ? `Running low on ${names[0].name_en}?` : `Running low on ${due.length} items?`,
        body: due.length === 1 ? "اعتدت أن تطلبه في مثل هذا الوقت. أضفه للسلة بضغطة." : `${names.map((x) => x.name).join("، ")}${due.length > 3 ? " وغيرها" : ""}. أضفها للسلة بضغطة.`,
        body_en: due.length === 1 ? "You usually order it about now. Add it to the bag in a tap." : `${names.map((x) => x.name_en).join(", ")}${due.length > 3 ? " and more" : ""}. Add them in a tap.`,
        link: "/shop#reorder",
      },
      now,
    );
  }
}
