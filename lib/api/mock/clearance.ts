// «عروض التصريف»: the manager sells a near-expiry batch at a discount. The site suggests the batches and a
// percent (more off as the days run out); the shops see the item with its discount and a countdown, and the
// discount ends by itself when the batch is sold or reaches its expiry (or the manager stops it).
// These are the backend's rules (docs/backend.md → «عروض التصريف»).
import type { Clearance } from "../types";
import { nextId, type Db, type DbClearance, type DbUser } from "./db";
import { clearanceFor, dayBefore } from "./clearance-price";
import { audit, dayOf, fail, msg, need, notify, person } from "./rules";

function view(db: Db, c: DbClearance): Clearance {
  const it = db.items.find((x) => x.id === c.item_id);
  const b = db.batches.find((x) => x.id === c.batch_id);
  return {
    id: c.id,
    item: { id: c.item_id, name: it?.name ?? "-", name_en: it?.name_en ?? "-" },
    batch_id: c.batch_id,
    warehouse_id: c.warehouse_id,
    percent: c.percent,
    qty: c.qty,
    left: b?.qty_left ?? 0,
    until: b ? dayBefore(b.expiry_date) : "",
    expiry_date: b?.expiry_date ?? "",
    status: c.status,
    created_at: c.created_at,
    by: c.by,
    ...(c.ended_at ? { ended_at: c.ended_at } : {}),
  };
}

/** All of them, the running ones first (manager, accountant, keepers). */
export function listClearances(db: Db, a: DbUser): Clearance[] {
  need(a, ["manager", "accountant", "warehouse", "staff"]);
  return (db.clearances ?? [])
    .map((c) => view(db, c))
    .sort((x, y) => Number(y.status === "active") - Number(x.status === "active") || y.created_at.localeCompare(x.created_at))
    .slice(0, 100);
}

/** The manager starts one on a batch: 5–70% off, the batch not expired, not held, with pieces left; one at a time
 *  per item and warehouse. Every shop owner is told. */
export function startClearance(db: Db, a: DbUser, input: { batch_id: number; percent: number }, now: Date): Clearance {
  need(a, ["manager"]);
  const b = db.batches.find((x) => x.id === input.batch_id) ?? fail(404, "NOT_FOUND", "الدفعة غير موجودة", "Batch not found");
  const today = dayOf(now);
  const it = db.items.find((x) => x.id === b.item_id && x.active && !x.deleted) ?? fail(409, "BAD_STATE", "المادة موقوفة", "The item is not active");
  if (!Number.isInteger(input.percent) || input.percent < 5 || input.percent > 70)
    fail(422, "VALIDATION", "نسبة الخصم من 5% إلى 70%", "The discount is 5% to 70%", { percent: msg("من 5 إلى 70", "5 to 70") });
  if (b.qty_left <= 0) fail(409, "BAD_STATE", "نفدت هذه الدفعة", "This batch is sold out");
  if (b.held) fail(409, "BAD_STATE", "هذه الدفعة موقوفة عن البيع", "This batch is held");
  if (dayBefore(b.expiry_date) < today) fail(409, "BAD_STATE", "انتهت صلاحية هذه الدفعة", "This batch has expired");
  if (clearanceFor(db, b.item_id, b.warehouse_id, today)) fail(409, "BAD_STATE", "لهذه المادة عرض تصريف جارٍ في هذا المخزن", "This item already has a clearance in this warehouse");
  db.clearances ??= [];
  const c: DbClearance = {
    id: nextId(db, "clearance"),
    item_id: it.id,
    batch_id: b.id,
    warehouse_id: b.warehouse_id,
    percent: input.percent,
    qty: b.qty_left,
    status: "active",
    created_at: now.toISOString(),
    by: person(a),
  };
  db.clearances.push(c);
  const until = dayBefore(b.expiry_date);
  audit(db, a, "price_change", "item", it.id, `عرض تصريف: ${it.name} بخصم ${c.percent}% حتى ${until}`, `Clearance: ${it.name_en} ${c.percent}% off until ${until}`, now);
  // The shops order from the first warehouse: they hear of the ones there.
  if (b.warehouse_id === db.warehouses[0]?.id)
    notify(
      db,
      {
        type: "clearance",
        roles: ["shop"],
        title: `عرض تصريف: ${it.name} بخصم ${c.percent}%`,
        title_en: `Clearance: ${it.name_en} ${c.percent}% off`,
        body: `لكمية محدودة، حتى ${until}`,
        body_en: `Limited amount, until ${until}`,
        link: `/search?item=${it.id}`,
      },
      now,
    );
  return view(db, c);
}

/** The manager stops one early. */
export function cancelClearance(db: Db, a: DbUser, id: number, now: Date): Clearance {
  need(a, ["manager"]);
  const c = (db.clearances ?? []).find((x) => x.id === id) ?? fail(404, "NOT_FOUND", "غير موجود", "Not found");
  if (c.status !== "active") fail(409, "BAD_STATE", "انتهى هذا العرض", "This clearance is over");
  c.status = "cancelled";
  c.ended_at = now.toISOString();
  const it = db.items.find((x) => x.id === c.item_id);
  audit(db, a, "price_change", "item", c.item_id, `إيقاف عرض التصريف: ${it?.name ?? ""}`, `Clearance stopped: ${it?.name_en ?? ""}`, now);
  return view(db, c);
}

/** Runs before every request: a clearance whose batch is sold or expired ends by itself. */
export function checkClearances(db: Db, now: Date) {
  const today = dayOf(now);
  for (const c of db.clearances ?? []) {
    if (c.status !== "active") continue;
    const b = db.batches.find((x) => x.id === c.batch_id);
    if (!b || b.qty_left <= 0) c.status = "sold";
    else if (dayBefore(b.expiry_date) < today) c.status = "expired";
    else continue;
    c.ended_at = now.toISOString();
  }
}
