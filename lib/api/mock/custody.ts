// «العهدة»: the cash the reps hold. Every cash payment a rep takes from a shop goes into his custody; he hands it
// to the accountant, who counts it and confirms what he received. A shortage stays in the rep's custody (and the
// manager is told). The accountant may also take cash from a rep directly (counted at once).
// These are the backend's rules (docs/backend.md → «العهدة»).
import { netPaid, type CashHandover, type CustodyEntry, type CustodyLog, type CustodyRow } from "../types";
import { nextId, type Db, type DbUser } from "./db";
import { audit, dayOf, fail, msg, need, notify, person, pre } from "./rules";

const pad = (n: number) => String(n).padStart(6, "0");
const fmt = (n: number) => n.toLocaleString("en");

/** The cash payments a rep took (reversed ones left out), oldest first. */
const cashOf = (db: Db, repId: number) =>
  db.payments
    .filter((p) => p.received_by.id === repId && p.received_by.role === "rep" && p.method === "cash" && !p.reversed && !p.reversal_of)
    // A partly reversed payment counts for what is left of it.
    .map((p) => ({ ...p, amount: netPaid(p) }))
    .sort((a, b) => a.date.localeCompare(b.date));

const handoversOf = (db: Db, repId: number) => (db.handovers ?? []).filter((h) => h.rep.id === repId);

export function custodyRow(db: Db, rep: DbUser, now: Date): CustodyRow {
  const cash = cashOf(db, rep.id);
  const hs = handoversOf(db, rep.id);
  const collected = cash.reduce((s, p) => s + p.amount, 0);
  const done = hs.filter((h) => h.status === "confirmed");
  const handed = done.reduce((s, h) => s + (h.received ?? 0), 0);
  // The oldest cash not covered yet: walk the payments, oldest first, until the handed total runs out.
  let left = handed;
  const oldest = cash.find((p) => {
    left -= p.amount;
    return left < 0;
  });
  const today = dayOf(now);
  return {
    rep: { ...person(rep), phone: rep.phone },
    collected,
    handed,
    holding: collected - handed,
    today: cash.filter((p) => dayOf(new Date(p.date)) === today).reduce((s, p) => s + p.amount, 0),
    pending: hs.find((h) => h.status === "pending"),
    short_total: done.reduce((s, h) => s + (h.short ?? 0), 0),
    oldest_at: oldest?.date,
    last_handover_at: done.map((h) => h.confirmed_at!).sort().pop(),
  };
}

const salesReps = (db: Db) => db.users.filter((u) => u.role === "rep");

/** Everyone's custody (manager, accountant: the reps who ever held cash), or the rep's own. */
export function custodyList(db: Db, a: DbUser, now: Date): CustodyRow[] {
  need(a, ["manager", "accountant", "rep"]);
  if (a.role === "rep") return [custodyRow(db, a, now)];
  return salesReps(db)
    .map((u) => custodyRow(db, u, now))
    .filter((r) => r.collected || r.pending)
    .sort((x, y) => y.holding - x.holding);
}

/** One rep's movements: cash in (each payment) and out (each handover counted), newest first. */
export function custodyLog(db: Db, a: DbUser, repId: number, now: Date): CustodyLog {
  need(a, ["manager", "accountant", "rep"]);
  if (a.role === "rep" && a.id !== repId) fail(403, "FORBIDDEN", "ليست لديك صلاحية لهذه العملية", "You don't have permission for this");
  const rep = db.users.find((u) => u.id === repId && u.role === "rep") ?? fail(404, "NOT_FOUND", "غير موجود", "Not found");
  const entries: CustodyEntry[] = [
    ...cashOf(db, repId).map((p) => ({ at: p.date, kind: "cash" as const, amount: p.amount, number: p.number, customer: db.customers.find((c) => c.id === p.customer_id)?.name, link: `/payments/${p.id}` })),
    ...handoversOf(db, repId)
      .filter((h) => h.status === "confirmed")
      .map((h) => ({ at: h.confirmed_at!, kind: "handover" as const, amount: -(h.received ?? 0), number: h.number, declared: h.declared, ...(h.short ? { short: h.short } : {}) })),
  ].sort((x, y) => y.at.localeCompare(x.at));
  return { row: custodyRow(db, rep, now), entries: entries.slice(0, 200), handovers: handoversOf(db, repId).sort((x, y) => y.created_at.localeCompare(x.created_at)).slice(0, 60) };
}

/**
 * A handover. The rep: «سلّمت للمحاسب» (pending until counted; one at a time, not more than he holds).
 * The accountant or the manager with `rep_id`: cash taken from the rep in person, counted at once.
 */
export function createHandover(db: Db, a: DbUser, input: { rep_id?: number; amount: number; note?: string }, now: Date): CashHandover {
  need(a, ["rep", "accountant", "manager"]);
  const rep = a.role === "rep" ? a : (db.users.find((u) => u.id === input.rep_id && u.role === "rep") ?? fail(404, "NOT_FOUND", "اختر المندوب", "Pick the rep"));
  const row = custodyRow(db, rep, now);
  const amount = input.amount;
  if (!Number.isInteger(amount) || amount <= 0) fail(422, "VALIDATION", "المبلغ غير صحيح", "Not a valid amount", { amount: msg("اكتب مبلغاً صحيحاً بالدينار", "Enter a whole amount in dinars") });
  if (amount > row.holding) fail(422, "VALIDATION", "أكثر من العهدة", "More than the custody", { amount: msg(`عهدته ${fmt(row.holding)} د.ع`, `Custody is ${fmt(row.holding)} IQD`) });
  if ((input.note ?? "").length > 200) fail(422, "VALIDATION", "تحقق من الملاحظة", "Check the note", { note: msg("200 حرف على الأكثر", "200 letters at most") });
  if (row.pending) fail(409, "BAD_STATE", "لديه تسليم ينتظر تأكيد المحاسب", "A handover is already waiting for the accountant");
  db.handovers ??= [];
  const id = nextId(db, "handover");
  const h: CashHandover = {
    id,
    number: `${pre("handover")}-${pad(id)}`,
    rep: person(rep),
    declared: amount,
    status: "pending",
    note: input.note?.trim() || undefined,
    created_at: now.toISOString(),
  };
  if (!h.note) delete h.note;
  db.handovers.push(h);
  if (a.role === "rep") {
    notify(
      db,
      {
        type: "custody",
        roles: ["accountant"],
        title: `${rep.name} يسلّم عهدته`,
        title_en: `${rep.name} hands over his cash`,
        body: `${fmt(amount)} د.ع نقداً؛ عدّها وأكّد الاستلام`,
        body_en: `${fmt(amount)} IQD in cash; count it and confirm`,
        link: "/custody",
      },
      now,
    );
    return h;
  }
  return confirm(db, a, h, amount, now);
}

/** The accountant counted the cash: what he received (≤ what was declared). */
export function confirmHandover(db: Db, a: DbUser, id: number, received: number, now: Date): CashHandover {
  need(a, ["accountant", "manager"]);
  const h = (db.handovers ?? []).find((x) => x.id === id) ?? fail(404, "NOT_FOUND", "غير موجود", "Not found");
  if (h.status !== "pending") fail(409, "BAD_STATE", "هذا التسليم ليس بانتظار التأكيد", "This handover isn't waiting");
  if (!Number.isInteger(received) || received < 0 || received > h.declared)
    fail(422, "VALIDATION", "المبلغ المستلم غير صحيح", "Not a valid amount", { received: msg(`من 0 إلى ${fmt(h.declared)} د.ع`, `0 to ${fmt(h.declared)} IQD`) });
  return confirm(db, a, h, received, now);
}

function confirm(db: Db, a: DbUser, h: CashHandover, received: number, now: Date) {
  h.status = "confirmed";
  h.received = received;
  h.confirmed_at = now.toISOString();
  h.confirmed_by = person(a);
  const short = h.declared - received;
  if (short > 0) h.short = short;
  audit(
    db,
    a,
    "confirm",
    "custody",
    h.id,
    `استلام عهدة ${h.rep.name} ${h.number}: ${fmt(received)} د.ع${short ? ` (نقص ${fmt(short)})` : ""}`,
    `Took ${h.rep.name}'s cash ${h.number}: ${fmt(received)} IQD${short ? ` (${fmt(short)} short)` : ""}`,
    now,
  );
  notify(
    db,
    {
      type: "custody",
      roles: ["rep"],
      user_id: h.rep.id,
      title: short ? `استُلم ${fmt(received)} من ${fmt(h.declared)} د.ع` : `استلم المحاسب ${fmt(received)} د.ع`,
      title_en: short ? `${fmt(received)} of ${fmt(h.declared)} IQD received` : `The accountant received ${fmt(received)} IQD`,
      body: short ? `النقص ${fmt(short)} د.ع باقٍ في عهدتك` : "خرج المبلغ من عهدتك",
      body_en: short ? `The ${fmt(short)} IQD short stays in your custody` : "It left your custody",
      link: "/custody",
    },
    now,
  );
  if (short)
    notify(
      db,
      {
        type: "custody",
        roles: ["manager"],
        title: `نقص في عهدة ${h.rep.name}`,
        title_en: `${h.rep.name}'s cash is short`,
        body: `سلّم ${fmt(received)} من ${fmt(h.declared)} د.ع؛ النقص ${fmt(short)} د.ع باقٍ عليه`,
        body_en: `Handed ${fmt(received)} of ${fmt(h.declared)} IQD; ${fmt(short)} IQD stays on him`,
        link: "/custody",
      },
      now,
    );
  return h;
}

/** The rep takes back his handover before it is counted; the accountant may refuse one (not handed in fact). */
export function cancelHandover(db: Db, a: DbUser, id: number, now: Date): CashHandover {
  need(a, ["rep", "accountant", "manager"]);
  const h = (db.handovers ?? []).find((x) => x.id === id && (a.role !== "rep" || x.rep.id === a.id)) ?? fail(404, "NOT_FOUND", "غير موجود", "Not found");
  if (h.status !== "pending") fail(409, "BAD_STATE", "هذا التسليم ليس بانتظار التأكيد", "This handover isn't waiting");
  h.status = "cancelled";
  if (a.role !== "rep")
    notify(db, { type: "custody", roles: ["rep"], user_id: h.rep.id, title: `لم يُستلم التسليم ${h.number}`, title_en: `${h.number} was not taken`, body: `المحاسب ${a.name} ألغى التسليم؛ العهدة كما هي`, body_en: `${a.name} cancelled it; your custody is unchanged`, link: "/custody" }, now);
  return h;
}
