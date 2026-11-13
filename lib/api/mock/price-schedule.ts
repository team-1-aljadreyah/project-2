// «تغيير الأسعار من تاريخ»: the manager sets new prices that start on a day (one item or many, by a percent; or
// one item's exact prices). The shops that bought those items in the last 60 days are told: a rise at once
// («يرتفع السعر يوم … اطلب قبله»), a fall on the day («انخفض السعر»). On the day the prices change by themselves;
// the old ones are kept (each item's price history), and orders written before keep their price.
// These are the backend's rules (docs/backend.md → «تغيير الأسعار من تاريخ»).
import type { ItemPrice, PriceHistory, ScheduledPrice, ScheduledPriceInput } from "../types";
import { nextId, type Db, type DbItem, type DbUser } from "./db";
import { addDays, audit, dayOf, fail, msg, need, notify, person, shopsOf } from "./rules";

const round = (n: number, to: number) => Math.max(to, Math.round(n / to) * to);

/** An item's prices after the change: a percent (carton to 250 IQD, piece to 50), or the exact ones; then the
 *  item's own unit rule (sold by the single only / by the pack only). */
function newPrices(it: DbItem, s: { percent?: number; prices?: ItemPrice[] }): ItemPrice[] {
  return it.prices.map((p) => {
    const exact = s.prices?.find((x) => x.tier_id === p.tier_id);
    let carton = exact ? exact.carton_price : round(p.carton_price * (1 + (s.percent ?? 0) / 100), 250);
    let piece = exact ? exact.piece_price : round(p.piece_price * (1 + (s.percent ?? 0) / 100), 50);
    if (it.sells === "piece" || it.pieces_per_carton <= 1) carton = piece * it.pieces_per_carton;
    if (it.sells === "pack") piece = Math.round(carton / it.pieces_per_carton);
    return { tier_id: p.tier_id, carton_price: carton, piece_price: piece };
  });
}

const direction = (before: ItemPrice[], after: ItemPrice[]): "up" | "down" | "mixed" => {
  const ups = after.filter((p, i) => p.carton_price > before[i].carton_price || p.piece_price > before[i].piece_price).length;
  const downs = after.filter((p, i) => p.carton_price < before[i].carton_price || p.piece_price < before[i].piece_price).length;
  return ups && !downs ? "up" : downs && !ups ? "down" : "mixed";
};

export function listScheduledPrices(db: Db, a: DbUser): ScheduledPrice[] {
  need(a, ["manager", "accountant"]);
  return (db.price_schedule ?? [])
    .sort((x, y) => Number(y.status === "scheduled") - Number(x.status === "scheduled") || x.start.localeCompare(y.start) || y.id - x.id)
    .slice(0, 60);
}

/** The shop owners (their logins) of the shops that bought any of these items in the last 60 days. */
function buyersOf(db: Db, itemIds: number[], now: Date) {
  const since = addDays(now, -60).toISOString();
  const ids = new Set(itemIds);
  const shops = new Set(db.orders.filter((o) => o.created_at >= since && o.status !== "cancelled" && o.status !== "expired" && o.lines.some((l) => ids.has(l.item_id))).map((o) => o.customer_id));
  const owners = db.users.filter((u) => u.role === "shop" && u.active && shopsOf(u).some((c) => shops.has(c)));
  return owners.map((u) => ({ user: u, items: itemIds.filter((id) => db.orders.some((o) => shopsOf(u).includes(o.customer_id) && o.created_at >= since && o.lines.some((l) => l.item_id === id))) }));
}

/** "السبت 15/11" */
function dayText(day: string) {
  const d = new Date(`${day}T12:00:00`);
  const names = ["الأحد", "الاثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت"];
  return `${names[d.getDay()]} ${d.getDate()}/${d.getMonth() + 1}`;
}

function tell(db: Db, s: ScheduledPrice, kind: "up" | "down", now: Date) {
  const moving = s.items.filter((x) => x.direction === kind).map((x) => x.id);
  if (!moving.length) return 0;
  const people = buyersOf(db, moving, now);
  for (const p of people) {
    if (!p.items.length) continue;
    const names = p.items.map((id) => s.items.find((x) => x.id === id)!);
    const one = names.length === 1 ? names[0] : null;
    const link = one ? `/search?item=${one.id}` : "/search";
    if (kind === "up")
      notify(
        db,
        {
          type: "price_change",
          roles: ["shop"],
          user_id: p.user.id,
          title: one ? `يرتفع سعر ${one.name} يوم ${dayText(s.start)}` : `يرتفع سعر ${names.length} مواد تشتريها يوم ${dayText(s.start)}`,
          title_en: one ? `${one.name_en} goes up on ${s.start}` : `${names.length} items you buy go up on ${s.start}`,
          body: one ? "اطلب قبله بالسعر الحالي" : `${names.map((x) => x.name).join("، ")}. اطلب قبله بالسعر الحالي`,
          body_en: one ? "Order before it at today's price" : `${names.map((x) => x.name_en).join(", ")}. Order before it at today's price`,
          link,
        },
        now,
      );
    else
      notify(
        db,
        {
          type: "price_change",
          roles: ["shop"],
          user_id: p.user.id,
          title: one ? `انخفض سعر ${one.name}` : `انخفض سعر ${names.length} مواد تشتريها`,
          title_en: one ? `${one.name_en} costs less now` : `${names.length} items you buy cost less now`,
          body: one ? "السعر الجديد في التطبيق الآن" : names.map((x) => x.name).join("، "),
          body_en: one ? "The new price is in the app now" : names.map((x) => x.name_en).join(", "),
          link,
        },
        now,
      );
  }
  return people.length;
}

/** The manager sets a change: items (1–200), a start day (today to 90 days ahead), and a percent (−50 to +100,
 *  not 0) or, for one item, its exact prices. An item already waiting for a change can't take a second one. */
export function schedulePrice(db: Db, a: DbUser, input: ScheduledPriceInput, now: Date): ScheduledPrice {
  need(a, ["manager"]);
  const today = dayOf(now);
  const errors: Record<string, string> = {};
  const ids = [...new Set(input.item_ids ?? [])];
  const items = ids.map((id) => db.items.find((x) => x.id === id && !x.deleted));
  if (!ids.length || ids.length > 200 || items.some((x) => !x)) errors.item_ids = msg("اختر المواد (200 على الأكثر)", "Pick the items (200 at most)");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.start ?? "") || input.start < today || input.start > dayOf(addDays(now, 90))) errors.start = msg("من اليوم إلى 90 يوماً", "Today to 90 days ahead");
  const exact = !!input.prices?.length;
  if (exact) {
    if (ids.length !== 1) errors.prices = msg("الأسعار المحددة لمادة واحدة فقط", "Exact prices are for one item only");
    else if (input.prices!.some((p) => !(p.carton_price > 0) || !(p.piece_price > 0) || !items[0]!.prices.some((o) => o.tier_id === p.tier_id)))
      errors.prices = msg("كل الأسعار أكبر من صفر", "Every price above zero");
  } else if (typeof input.percent !== "number" || !Number.isFinite(input.percent) || input.percent === 0 || input.percent < -50 || input.percent > 100)
    errors.percent = msg("النسبة من −50% إلى +100%", "The percent is −50% to +100%");
  if ((input.note ?? "").length > 200) errors.note = msg("200 حرف على الأكثر", "200 letters at most");
  if (Object.keys(errors).length) fail(422, "VALIDATION", "تحقق من التغيير", "Check the change", errors);
  const waiting = new Set((db.price_schedule ?? []).filter((s) => s.status === "scheduled").flatMap((s) => s.items.map((x) => x.id)));
  const twice = items.filter((x) => waiting.has(x!.id));
  if (twice.length) fail(409, "BAD_STATE", `لـ ${twice.map((x) => x!.name).join("، ")} تغيير مجدول من قبل`, `${twice.map((x) => x!.name_en).join(", ")} already wait for a change`);
  const spec = exact ? { prices: input.prices } : { percent: Math.round(input.percent! * 10) / 10 };
  db.price_schedule ??= [];
  const s: ScheduledPrice = {
    id: nextId(db, "price_schedule"),
    start: input.start,
    items: items.map((it) => ({ id: it!.id, name: it!.name, name_en: it!.name_en, direction: direction(it!.prices, newPrices(it!, spec)) })),
    ...spec,
    status: "scheduled",
    ...(input.note?.trim() ? { note: input.note.trim() } : {}),
    created_at: now.toISOString(),
    by: person(a),
    told: 0,
  };
  db.price_schedule.push(s);
  audit(db, a, "price_change", "item", ids.length === 1 ? ids[0] : 0, `تغيير أسعار مجدول يوم ${s.start}: ${s.items.length} مادة ${exact ? "(أسعار محددة)" : `(${s.percent! > 0 ? "+" : ""}${s.percent}%)`}`, `Price change on ${s.start}: ${s.items.length} items`, now);
  // A rise: the shops that buy them hear now, so they can order before it.
  s.told = tell(db, s, "up", now);
  if (s.start <= today) applyScheduledPrices(db, now);
  return s;
}

export function cancelScheduledPrice(db: Db, a: DbUser, id: number, now: Date): ScheduledPrice {
  need(a, ["manager"]);
  const s = (db.price_schedule ?? []).find((x) => x.id === id) ?? fail(404, "NOT_FOUND", "غير موجود", "Not found");
  if (s.status !== "scheduled") fail(409, "BAD_STATE", "طُبّق هذا التغيير أو أُلغي", "This change was applied or cancelled");
  s.status = "cancelled";
  audit(db, a, "price_change", "item", s.items.length === 1 ? s.items[0].id : 0, `إلغاء تغيير الأسعار المجدول يوم ${s.start}`, `Cancelled the price change of ${s.start}`, now);
  return s;
}

/** Runs before every request: a change whose day came is applied (the old prices go to the history). */
export function applyScheduledPrices(db: Db, now: Date) {
  const today = dayOf(now);
  for (const s of db.price_schedule ?? []) {
    if (s.status !== "scheduled" || s.start > today) continue;
    for (const ref of s.items) {
      const it = db.items.find((x) => x.id === ref.id);
      if (!it || it.deleted) continue;
      const next = newPrices(it, s);
      db.price_changes ??= [];
      for (const p of it.prices) {
        const n = next.find((x) => x.tier_id === p.tier_id)!;
        if (n.carton_price === p.carton_price && n.piece_price === p.piece_price) continue;
        db.price_changes.push({ item_id: it.id, tier_id: p.tier_id, carton_price: p.carton_price, piece_price: p.piece_price, until: now.toISOString() });
        p.carton_price = n.carton_price;
        p.piece_price = n.piece_price;
      }
    }
    s.status = "applied";
    s.applied_at = now.toISOString();
    audit(db, { ...s.by, role: "manager" }, "price_change", "item", s.items.length === 1 ? s.items[0].id : 0, `طُبّق تغيير الأسعار المجدول (${s.items.length} مادة). الفواتير القديمة لا تتغير`, `Scheduled price change applied (${s.items.length} items)`, now);
    // A fall: the shops that buy them hear on the day.
    s.told += tell(db, s, "down", now);
  }
}

/** One item's prices over time: the ones before (from the kept old prices), now, and what is scheduled. */
export function priceHistory(db: Db, a: DbUser, itemId: number): PriceHistory {
  need(a, ["manager", "accountant"]);
  const it = db.items.find((x) => x.id === itemId) ?? fail(404, "NOT_FOUND", "غير موجود", "Not found");
  const rows: PriceHistory["rows"] = [];
  for (const p of it.prices) {
    const old = (db.price_changes ?? []).filter((c) => c.item_id === it.id && c.tier_id === p.tier_id).sort((x, y) => x.until.localeCompare(y.until));
    old.forEach((c, i) => rows.push({ tier_id: p.tier_id, carton_price: c.carton_price, piece_price: c.piece_price, ...(i ? { from: old[i - 1].until } : {}), until: c.until }));
    rows.push({ tier_id: p.tier_id, carton_price: p.carton_price, piece_price: p.piece_price, ...(old.length ? { from: old[old.length - 1].until } : {}) });
  }
  const scheduled = (db.price_schedule ?? [])
    .filter((s) => s.status === "scheduled" && s.items.some((x) => x.id === it.id))
    .map((s) => ({ ...s, next: newPrices(it, s) }));
  return { item_id: it.id, rows: rows.sort((x, y) => (y.from ?? "").localeCompare(x.from ?? "") || x.tier_id - y.tier_id), scheduled };
}
