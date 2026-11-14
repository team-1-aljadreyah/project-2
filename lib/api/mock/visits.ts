// «خط السير»: the manager plans which days each marketing rep visits each of his shops, the rep records every
// visit from the shop (where his phone was, and what came out of it), and the manager sees the visits missed.
// These are the backend's rules (docs/backend.md → «خط السير»).
import type { NoOrderReason, Visit, VisitInput, VisitOutcome, VisitsReport, WeekDay } from "../types";
import { repDoes } from "../types";
import { nextId, type Db, type DbCustomer, type DbUser } from "./db";
import { R, addDays, dayOf, fail, msg, need, notify } from "./rules";
import { metres } from "../../geo";

const OUTCOMES: VisitOutcome[] = ["order", "payment", "no_order", "closed"];
const REASONS: NoOrderReason[] = ["stocked", "no_money", "price", "other"];
/** An order beats a payment, a payment beats "no order" (one visit per shop per day keeps the best). */
const RANK: Record<VisitOutcome, number> = { closed: 0, no_order: 1, payment: 2, order: 3 };

/** The weekday of a yyyy-mm-dd day (0 = Sunday). */
export const weekDayOf = (day: string) => new Date(`${day}T12:00:00`).getDay() as WeekDay;

/** Is this shop on its rep's plan that day? */
const plannedOn = (c: DbCustomer, day: string) => !!c.visit_days?.includes(weekDayOf(day));

/** The shops the rep has on his plan for that day (active shops only). */
export function plannedFor(db: Db, repId: number, day: string) {
  return db.customers.filter((c) => c.rep_id === repId && c.active && !c.pending && !c.walk_in && plannedOn(c, day));
}

/** The visits of one day: a rep gets his own, the manager everyone's (or one rep's). */
export function listVisits(db: Db, a: DbUser, day: string, repId?: number): Visit[] {
  need(a, ["manager", "rep"]);
  const who = a.role === "rep" ? a.id : repId;
  return (db.visits ?? []).filter((v) => v.day === day && (!who || v.rep.id === who));
}

/** The rep records a visit at a shop of his. A second one the same day changes it (the better outcome stays when it
 *  came from an order or a payment). */
export function recordVisit(db: Db, a: DbUser, input: VisitInput, now: Date): Visit {
  need(a, ["rep"]);
  if (!repDoes(a, "sales")) fail(403, "FORBIDDEN", "الزيارات لمندوبي التسويق", "Visits are for marketing reps");
  const c = db.customers.find((x) => x.id === input.customer_id && x.rep_id === a.id && !x.walk_in);
  if (!c) fail(404, "NOT_FOUND", "هذا المحل ليس من محلاتك", "This shop isn't one of yours");
  const errors: Record<string, string> = {};
  if (!OUTCOMES.includes(input.outcome)) errors.outcome = msg("اختر نتيجة الزيارة", "Pick what came out of the visit");
  if (input.outcome === "no_order" && input.reason && !REASONS.includes(input.reason)) errors.reason = msg("سبب غير معروف", "Unknown reason");
  if ((input.note ?? "").length > 200) errors.note = msg("200 حرف على الأكثر", "200 letters at most");
  const hasPlace = typeof input.lat === "number" && typeof input.lng === "number";
  if (hasPlace && !(Math.abs(input.lat!) <= 90 && Math.abs(input.lng!) <= 180)) errors.lat = msg("موقع غير صحيح", "Not a valid location");
  if (Object.keys(errors).length) fail(422, "VALIDATION", "تحقق من الزيارة", "Check the visit", errors);
  const pin = c.address_info?.lat !== undefined && c.address_info?.lng !== undefined ? { lat: c.address_info.lat, lng: c.address_info.lng } : null;
  const distance = hasPlace && pin ? metres({ lat: input.lat!, lng: input.lng! }, pin) : undefined;
  const far = distance !== undefined ? distance > R().visit_near_m : undefined;
  // The manager asked to hear of a far visit at once.
  if (far && R().far_visit_alert) {
    notify(
      db,
      {
        type: "needs_approval",
        roles: ["manager"],
        title: `زيارة بعيدة عن المحل: ${c.name}`,
        title_en: `A visit far from the shop: ${c.name}`,
        body: `${a.name} سجّلها على بعد ${Math.round(distance!).toLocaleString("en")} م من موقع المحل`,
        body_en: `${a.name} recorded it ${Math.round(distance!).toLocaleString("en")} m from the shop's pin`,
        link: "/routes",
      },
      now,
    );
  }
  return put(db, a, c, now, {
    outcome: input.outcome,
    reason: input.outcome === "no_order" ? (input.reason ?? "other") : undefined,
    note: input.note?.trim() || undefined,
    distance_m: distance,
    far,
  });
}

/** An order or a payment the rep made for a shop of his counts as visiting it today (without a location). */
export function autoVisit(db: Db, a: DbUser, customerId: number, outcome: "order" | "payment", now: Date, orderId?: number) {
  if (a.role !== "rep" || !repDoes(a, "sales")) return;
  const c = db.customers.find((x) => x.id === customerId && x.rep_id === a.id && !x.walk_in);
  if (!c) return;
  const day = dayOf(now);
  const old = (db.visits ?? []).find((v) => v.day === day && v.customer.id === c.id && v.rep.id === a.id);
  if (old && RANK[old.outcome] > RANK[outcome]) return;
  if (old && old.outcome === outcome) {
    if (orderId) old.order_id ??= orderId;
    return;
  }
  put(db, a, c, now, { outcome, order_id: orderId, distance_m: old?.distance_m, far: old?.far });
}

function put(db: Db, a: DbUser, c: DbCustomer, now: Date, fields: Partial<Visit> & { outcome: VisitOutcome }): Visit {
  db.visits ??= [];
  const day = dayOf(now);
  const old = db.visits.find((v) => v.day === day && v.customer.id === c.id && v.rep.id === a.id);
  if (old) {
    Object.assign(old, { ...fields, at: now.toISOString(), order_id: fields.order_id ?? old.order_id });
    if (fields.outcome !== "no_order") delete old.reason;
    return old;
  }
  const v: Visit = {
    id: nextId(db, "visit"),
    rep: { id: a.id, name: a.name },
    customer: { id: c.id, name: c.name, area: c.area },
    day,
    at: now.toISOString(),
    planned: plannedOn(c, day),
    ...fields,
  };
  for (const k of Object.keys(v) as (keyof Visit)[]) if (v[k] === undefined) delete v[k];
  db.visits.push(v);
  // Keep the last 120 days.
  const cut = dayOf(addDays(now, -120));
  if (db.visits.length > 3000) db.visits = db.visits.filter((x) => x.day >= cut);
  return v;
}

/** The manager sets the days a shop is visited (its own rep). */
export function setVisitDays(db: Db, a: DbUser, customerId: number, days: number[]) {
  need(a, ["manager"]);
  const c = db.customers.find((x) => x.id === customerId && !x.walk_in);
  if (!c) fail(404, "NOT_FOUND", "غير موجود", "Not found");
  if (!Array.isArray(days) || days.some((d) => !Number.isInteger(d) || d < 0 || d > 6)) fail(422, "VALIDATION", "أيام غير صحيحة", "Not valid days");
  const clean = [...new Set(days)].sort() as WeekDay[];
  if (clean.length) c.visit_days = clean;
  else delete c.visit_days;
  return c;
}

/** Planned against done, per rep, between two days (at most 62 days; up to today). */
export function visitsReport(db: Db, a: DbUser, from: string, to: string, now: Date): VisitsReport {
  need(a, ["manager"]);
  const today = dayOf(now);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to) || from > to) fail(422, "VALIDATION", "اختر فترة صحيحة", "Pick a valid period");
  const end = to > today ? today : to;
  const days: string[] = [];
  for (let d = new Date(`${from}T12:00:00`); dayOf(d) <= end && days.length < 62; d = addDays(d, 1)) days.push(dayOf(d));
  const visits = (db.visits ?? []).filter((v) => v.day >= from && v.day <= end);
  const done = new Set(visits.map((v) => `${v.day}:${v.customer.id}`));
  type Row = VisitsReport["reps"][number];
  const reps = new Map<number, Row>();
  const rowOf = (id: number) => {
    let r = reps.get(id);
    if (!r) {
      const u = db.users.find((x) => x.id === id);
      r = { rep: { id, name: u?.name ?? "-" }, planned: 0, visited: 0, missed: 0, remaining: 0, extra: 0, far: 0, orders: 0 };
      reps.set(id, r);
    }
    return r;
  };
  const missed: VisitsReport["missed"] = [];
  for (const day of days)
    for (const c of db.customers) {
      if (!c.active || c.pending || c.walk_in || !c.rep_id || !plannedOn(c, day)) continue;
      const r = rowOf(c.rep_id);
      r.planned += 1;
      if (done.has(`${day}:${c.id}`)) r.visited += 1;
      else if (day === today) r.remaining += 1;
      else {
        r.missed += 1;
        missed.push({ day, rep: r.rep, customer: { id: c.id, name: c.name, area: c.area } });
      }
    }
  const reasons: Record<NoOrderReason, number> = { stocked: 0, no_money: 0, price: 0, other: 0 };
  for (const v of visits) {
    const r = rowOf(v.rep.id);
    if (!v.planned) r.extra += 1;
    if (v.far) r.far += 1;
    if (v.outcome === "order") r.orders += 1;
    if (v.outcome === "no_order") reasons[v.reason ?? "other"] += 1;
  }
  const list = [...reps.values()].sort((x, y) => y.missed - x.missed || x.rep.name.localeCompare(y.rep.name));
  const sum = (k: keyof Omit<Row, "rep">) => list.reduce((s, r) => s + r[k], 0);
  return {
    from,
    to: end,
    totals: { planned: sum("planned"), visited: sum("visited"), missed: sum("missed"), remaining: sum("remaining"), extra: sum("extra"), far: sum("far"), orders: sum("orders") },
    reps: list,
    reasons,
    missed: missed.sort((x, y) => y.day.localeCompare(x.day)).slice(0, 150),
    far: visits.filter((v) => v.far).sort((x, y) => y.at.localeCompare(x.at)).slice(0, 50),
  };
}
