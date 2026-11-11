// The business rules of Al-Nahrain, written once. The fake backend (mock.ts) and the demo data (seed.ts)
// both use these functions, so the demo history follows the same rules as live use.
// The real backend must do the same things (see the client's requirements).
import { currentLocale } from "../../boot";
import { ApiError, type ErrorCode } from "../errors";
import { DISCOUNT_MAX, SHOP_MAX_QTY, STAFF_DISCOUNT_MAX, orderCount } from "../types";
import type {
  AppNotification,
  RegisterInput,
  AuditAction,
  AuditEntity,
  BatchStatus,
  CommissionRow,
  Invoice,
  InvoiceStatus,
  NewOrder,
  NewPayment,
  ChatMessage,
  ChatThread,
  MyChat,
  DeliverInput,
  OrderEdit,
  CommissionLine,
  UsdRate,
  RepKind,
  MyShop,
  NewShopInput,
  ProblemInput,
  ProblemReason,
  Delivery,
  OnlinePayment,
  GatewayInfo,
  StartOnlinePayment,
  NewReceipt,
  NewReturn,
  NewTransfer,
  Order,
  Payment,
  Person,
  Receipt,
  Role,
  Stocktake,
  StocktakeLine,
  Transfer,
  Unit,
} from "../types";
import { nextId, type Db, type DbOnline, type DbBatch, type DbBatchUse, type DbCustomer, type DbInvoice, type DbItem, type DbReturn, type DbUser } from "./db";

// ---------- small helpers ----------

export const msg = (ar: string, en: string) => (currentLocale() === "en" ? en : ar);

export function fail(status: number, code: ErrorCode, ar: string, en: string, errors?: Record<string, string>): never {
  throw new ApiError(status, msg(ar, en), errors, code);
}

/** Local calendar day "YYYY-MM-DD" (Iraq time on the user's phone). */
export function dayOf(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function addDays(d: Date, days: number): Date {
  const x = new Date(d);
  x.setDate(x.getDate() + days);
  return x;
}

export function daysBetween(fromDay: string, toDay: string): number {
  const a = new Date(fromDay + "T00:00:00");
  const b = new Date(toDay + "T00:00:00");
  return Math.round((b.getTime() - a.getTime()) / 86_400_000);
}

const pad = (n: number, size = 6) => String(n).padStart(size, "0");

export const person = (u: { id: number; name: string }): Person => ({ id: u.id, name: u.name });

export function need(actor: DbUser, roles: Role[]) {
  if (!roles.includes(actor.role)) {
    fail(403, "FORBIDDEN", "ليست لديك صلاحية لهذه العملية", "You don't have permission for this");
  }
}

export function itemOf(db: Db, id: number): DbItem {
  return db.items.find((i) => i.id === id) ?? fail(404, "NOT_FOUND", "المادة غير موجودة", "Item not found");
}

export function piecesOf(item: DbItem, unit: Unit, qty: number) {
  return unit === "carton" ? qty * item.pieces_per_carton : qty;
}

export function batchStatus(db: Db, b: { expiry_date: string }, today: string): BatchStatus {
  const left = daysBetween(today, b.expiry_date);
  if (left < 0) return "expired";
  if (left <= db.settings.near_expiry_days) return "near_expiry";
  return "ok";
}

// ---------- stock ----------

/** Pieces on the shelf that may be sold (expired batches never count). */
export function physicalQty(db: Db, itemId: number, warehouseId: number | undefined, today: string) {
  let n = 0;
  for (const b of db.batches) {
    if (b.item_id !== itemId || b.qty_left <= 0) continue;
    if (warehouseId && b.warehouse_id !== warehouseId) continue;
    if (b.expiry_date < today) continue;
    n += b.qty_left;
  }
  return n;
}

/** Everything on the shelf in a warehouse, expired included (what a stocktake counts). */
export function shelfQty(db: Db, itemId: number, warehouseId: number) {
  return db.batches
    .filter((b) => b.item_id === itemId && b.warehouse_id === warehouseId)
    .reduce((s, b) => s + b.qty_left, 0);
}

const holdsStock = (o: Order, nowIso: string) =>
  (o.status === "pending" || o.status === "needs_approval") && !!o.reserved_until && o.reserved_until > nowIso;

/** Pieces held by orders that are not confirmed yet. */
export function reservedQty(db: Db, itemId: number, warehouseId: number | undefined, nowIso: string, exceptOrderId?: number) {
  let n = 0;
  for (const o of db.orders) {
    if (o.id === exceptOrderId || !holdsStock(o, nowIso)) continue;
    if (warehouseId && o.warehouse_id !== warehouseId) continue;
    for (const l of o.lines) {
      if (l.item_id === itemId) n += piecesOf(itemOf(db, l.item_id), l.unit, l.qty);
    }
  }
  return n;
}

export function sellableQty(db: Db, itemId: number, warehouseId: number | undefined, now: Date, exceptOrderId?: number) {
  const free = physicalQty(db, itemId, warehouseId, dayOf(now)) - reservedQty(db, itemId, warehouseId, now.toISOString(), exceptOrderId);
  return Math.max(0, free);
}

/** Batches to sell from, nearest expiry first (FEFO). Expired batches are skipped. */
function fefoBatches(db: Db, itemId: number, warehouseId: number, today: string) {
  return db.batches
    .filter((b) => b.item_id === itemId && b.warehouse_id === warehouseId && b.qty_left > 0 && b.expiry_date >= today)
    .sort((a, b) => a.expiry_date.localeCompare(b.expiry_date) || a.id - b.id);
}

/** Take pieces from the batches, oldest expiry first. Returns which batches were used. */
function takeFefo(db: Db, itemId: number, warehouseId: number, pieces: number, today: string): DbBatchUse[] {
  const used: DbBatchUse[] = [];
  let left = pieces;
  for (const b of fefoBatches(db, itemId, warehouseId, today)) {
    if (left <= 0) break;
    const take = Math.min(b.qty_left, left);
    b.qty_left -= take;
    left -= take;
    used.push({ batch_id: b.id, qty: take, expiry_date: b.expiry_date, purchase_price: b.purchase_price, returned: 0 });
  }
  if (left > 0) {
    const item = itemOf(db, itemId);
    fail(409, "OUT_OF_STOCK", `الكمية غير كافية: ${item.name}`, `Not enough stock: ${item.name_en}`);
  }
  return used;
}

// ---------- customers and invoices ----------

export function invoiceRemaining(inv: Pick<DbInvoice, "total" | "paid" | "returned">) {
  return inv.total - inv.paid - inv.returned;
}

export function invoiceStatus(inv: Pick<DbInvoice, "total" | "paid" | "returned">): InvoiceStatus {
  const rem = invoiceRemaining(inv);
  if (rem <= 0) return "paid";
  if (inv.paid > 0 || inv.returned > 0) return "partial";
  return "open";
}

/** What the customer owes now (negative = the company owes him, e.g. after a return on a paid invoice). */
export function customerBalance(db: Db, customerId: number) {
  let b = 0;
  for (const inv of db.invoices) if (inv.customer_id === customerId) b += invoiceRemaining(inv);
  return b;
}

/** Balance + orders that are waiting (they will become debt when confirmed). */
function committedDebt(db: Db, customerId: number, nowIso: string, exceptOrderId?: number) {
  let b = customerBalance(db, customerId);
  for (const o of db.orders) {
    if (o.customer_id === customerId && o.id !== exceptOrderId && holdsStock(o, nowIso) && o.status === "pending") b += o.total;
  }
  return b;
}

export function priceFor(item: DbItem, tierId: number, unit: Unit) {
  const p = item.prices.find((x) => x.tier_id === tierId) ?? item.prices[0];
  return unit === "carton" ? p.carton_price : p.piece_price;
}

// ---------- audit and notifications ----------

export function audit(
  db: Db,
  actor: { id: number; name: string; role: Role },
  action: AuditAction,
  entity: AuditEntity,
  entityId: number,
  ar: string,
  en: string,
  now: Date,
) {
  db.audit.push({
    id: nextId(db, "audit"),
    at: now.toISOString(),
    user: { id: actor.id, name: actor.name, role: actor.role },
    action,
    entity,
    entity_id: entityId,
    summary: ar,
    summary_en: en,
  });
}

export function notify(db: Db, n: Omit<AppNotification, "id" | "read" | "created_at">, now: Date) {
  db.notifications.push({ ...n, id: nextId(db, "notification"), read: false, created_at: now.toISOString() });
}

/** Alert the manager and the warehouse when an item goes under its minimum (once, until it is refilled). */
export function checkLowStock(db: Db, itemId: number, now: Date) {
  const item = itemOf(db, itemId);
  const qty = physicalQty(db, itemId, undefined, dayOf(now));
  const low = qty < item.min_stock;
  const already = db.notified_low.includes(itemId);
  if (low && !already) {
    db.notified_low.push(itemId);
    notify(
      db,
      {
        type: "low_stock",
        roles: ["manager", "warehouse"],
        title: `مخزون قليل: ${item.name}`,
        title_en: `Low stock: ${item.name_en}`,
        body: `باقي ${qty} قطعة، والحد الأدنى ${item.min_stock}`,
        body_en: `${qty} pieces left, minimum is ${item.min_stock}`,
        link: `/items/${item.id}`,
      },
      now,
    );
  }
  if (!low && already) db.notified_low = db.notified_low.filter((id) => id !== itemId);
}

/** Runs before every request: frees expired reservations and sends expiry alerts once per batch. */
export function sweep(db: Db, now: Date) {
  settleOnline(db, now);
  const nowIso = now.toISOString();
  const today = dayOf(now);
  for (const o of db.orders) {
    if ((o.status === "pending" || o.status === "needs_approval") && o.reserved_until && o.reserved_until <= nowIso) {
      o.status = "expired";
      db.audit.push({
        id: nextId(db, "audit"),
        at: o.reserved_until,
        user: { id: 0, name: "النظام", role: "manager" },
        action: "cancel",
        entity: "order",
        entity_id: o.id,
        summary: `انتهى حجز الطلب ${o.number} وعادت الكمية إلى المخزون`,
        summary_en: `Reservation of ${o.number} ended, stock released`,
      });
    }
  }
  for (const b of db.batches) {
    if (b.qty_left <= 0 || db.notified_batches.includes(b.id)) continue;
    const st = batchStatus(db, b, today);
    if (st === "ok") continue;
    const item = itemOf(db, b.item_id);
    const wh = db.warehouses.find((w) => w.id === b.warehouse_id);
    db.notified_batches.push(b.id);
    const left = daysBetween(today, b.expiry_date);
    notify(
      db,
      st === "expired"
        ? {
            type: "expired",
            roles: ["manager", "warehouse"],
            title: `منتهي الصلاحية: ${item.name}`,
            title_en: `Expired: ${item.name_en}`,
            body: `${b.qty_left} قطعة في ${wh?.name} انتهت بتاريخ ${b.expiry_date} ولن تُباع`,
            body_en: `${b.qty_left} pieces in ${wh?.name_en} expired on ${b.expiry_date} and won't be sold`,
            link: `/items/${item.id}`,
          }
        : {
            type: "near_expiry",
            roles: ["manager", "warehouse"],
            title: `قريب الانتهاء: ${item.name}`,
            title_en: `Expiring soon: ${item.name_en}`,
            body: `${b.qty_left} قطعة في ${wh?.name} تنتهي بعد ${left} يوم (${b.expiry_date})`,
            body_en: `${b.qty_left} pieces in ${wh?.name_en} expire in ${left} days (${b.expiry_date})`,
            link: `/items/${item.id}`,
          },
      now,
    );
  }
}

// ---------- receiving goods ----------

export function createReceipt(db: Db, actor: DbUser, input: NewReceipt, now: Date): Receipt {
  need(actor, ["manager", "warehouse"]);
  if (actor.role === "warehouse" && actor.warehouse_id && actor.warehouse_id !== input.warehouse_id) {
    fail(403, "FORBIDDEN", "تستطيع الاستلام في مخزنك فقط", "You can only receive into your own warehouse");
  }
  const errors: Record<string, string> = {};
  if (!input.lines.length) errors["lines"] = msg("أضف مادة واحدة على الأقل", "Add at least one item");
  input.lines.forEach((l, i) => {
    if (!(l.qty > 0)) errors[`lines.${i}.qty`] = msg("الكمية مطلوبة", "Quantity is required");
    if (!l.expiry_date) errors[`lines.${i}.expiry_date`] = msg("تاريخ الصلاحية مطلوب", "Expiry date is required");
    else if (l.expiry_date <= dayOf(now)) errors[`lines.${i}.expiry_date`] = msg("هذه البضاعة منتهية الصلاحية", "This stock is already expired");
    if (!(l.purchase_price > 0)) errors[`lines.${i}.purchase_price`] = msg("سعر الشراء مطلوب", "Purchase price is required");
  });
  if (Object.keys(errors).length) fail(422, "VALIDATION", "تحقق من الحقول المؤشرة", "Check the marked fields", errors);

  const id = nextId(db, "receipt");
  const lines: Receipt["lines"] = input.lines.map((l) => {
    const item = itemOf(db, l.item_id);
    const pieces = piecesOf(item, l.unit, l.qty);
    const batch: DbBatch = {
      id: nextId(db, "batch"),
      item_id: item.id,
      warehouse_id: input.warehouse_id,
      expiry_date: l.expiry_date,
      qty_received: pieces,
      qty_left: pieces,
      purchase_price: l.purchase_price,
      received_at: now.toISOString(),
      received_by: person(actor),
      receipt_id: id,
    };
    db.batches.push(batch);
    return { ...l, batch_id: batch.id, pieces };
  });
  const receipt: Receipt = {
    id,
    number: `RCV-${pad(id, 5)}`,
    warehouse_id: input.warehouse_id,
    supplier: input.supplier.trim(),
    lines,
    total_cost: lines.reduce((s, l) => s + l.pieces * l.purchase_price, 0),
    created_at: now.toISOString(),
    created_by: person(actor),
  };
  db.receipts.push(receipt);
  for (const l of lines) checkLowStock(db, l.item_id, now);
  audit(db, actor, "create", "receipt", id, `استلام بضاعة ${receipt.number} (${lines.length} مواد)`, `Received goods ${receipt.number} (${lines.length} items)`, now);
  return receipt;
}

// ---------- orders ----------

function orderLines(db: Db, tierId: number, lines: NewOrder["lines"]) {
  const errors: Record<string, string> = {};
  if (!lines.length) errors["lines"] = msg("أضف مادة واحدة على الأقل", "Add at least one item");
  const out = lines.map((l, i) => {
    const item = itemOf(db, l.item_id);
    if (!item.active) errors[`lines.${i}.item_id`] = msg("هذه المادة موقوفة", "This item is not active");
    if (!(l.qty > 0) || !Number.isInteger(l.qty)) errors[`lines.${i}.qty`] = msg("الكمية يجب أن تكون عدداً صحيحاً", "Quantity must be a whole number");
    const unit_price = priceFor(item, tierId, l.unit);
    return { item_id: l.item_id, unit: l.unit, qty: l.qty, unit_price, total: unit_price * l.qty };
  });
  if (Object.keys(errors).length) fail(422, "VALIDATION", "تحقق من المواد", "Check the items", errors);
  return out;
}

/** Same item twice in one order is checked together. */
function checkStock(db: Db, warehouseId: number, lines: { item_id: number; unit: Unit; qty: number }[], now: Date, exceptOrderId?: number) {
  const need = new Map<number, number>();
  for (const l of lines) need.set(l.item_id, (need.get(l.item_id) ?? 0) + piecesOf(itemOf(db, l.item_id), l.unit, l.qty));
  const errors: Record<string, string> = {};
  for (const [itemId, pieces] of need) {
    const free = sellableQty(db, itemId, warehouseId, now, exceptOrderId);
    if (pieces > free) {
      const item = itemOf(db, itemId);
      lines.forEach((l, i) => {
        if (l.item_id === itemId) errors[`lines.${i}.qty`] = msg(`المتوفر ${free} قطعة فقط`, `Only ${free} pieces available`);
      });
      errors[`item.${itemId}`] = msg(`${item.name}: المتوفر ${free} قطعة`, `${item.name_en}: ${free} pieces available`);
    }
  }
  if (Object.keys(errors).length) {
    fail(409, "OUT_OF_STOCK", "بعض المواد كميتها غير كافية", "Some items don't have enough stock", errors);
  }
}

export function createOrder(db: Db, actor: DbUser, input: NewOrder, now: Date, source?: Order["source"]): Order {
  need(actor, ["manager", "rep", "shop", "accountant"]);
  // Same phone request sent twice (weak internet): give back the first order.
  const same = db.orders.find((o) => o.client_ref === input.client_ref);
  if (same) return same;

  const customer = db.customers.find((c) => c.id === input.customer_id) ?? fail(404, "NOT_FOUND", "الزبون غير موجود", "Customer not found");
  if (actor.role === "rep" && customer.rep_id !== actor.id) fail(403, "FORBIDDEN", "هذا الزبون ليس من زبائنك", "This customer isn't yours");
  if (actor.role === "rep" && actor.rep_kinds?.length && !actor.rep_kinds.includes("sales")) fail(403, "FORBIDDEN", "أنت مندوب توصيل فقط: الطلبات يأخذها مندوب التسويق", "You only deliver: the marketing rep takes orders");
  if (actor.role === "shop" && actor.customer_id !== customer.id) fail(403, "FORBIDDEN", "لا تستطيع الطلب لمحل آخر", "You can't order for another shop");
  if (!customer.active) {
    if (customer.pending) fail(409, "BAD_STATE", "الحساب بانتظار موافقة الشركة، ويمكنك الطلب بعد الموافقة", "This account is waiting for approval. You can order after it is approved");
    fail(409, "BAD_STATE", "حساب هذا الزبون موقوف", "This customer is not active");
  }

  if (actor.role === "shop" && orderCount(input.lines) > SHOP_MAX_QTY) {
    fail(422, "VALIDATION", `الحد الأعلى للطلب الواحد ${SHOP_MAX_QTY} (كل المواد معاً)`, `Up to ${SHOP_MAX_QTY} in one order (all items together)`);
  }
  const warehouseId = input.warehouse_id ?? db.warehouses[0].id;
  const lines = orderLines(db, customer.tier_id, input.lines);
  checkStock(db, warehouseId, lines, now);

  const subtotal = lines.reduce((s, l) => s + l.total, 0);
  const discount = makeDiscount(actor, subtotal, input.discount_percent ?? 0, now);
  const total = subtotal - (discount?.amount ?? 0);
  const overLimit = committedDebt(db, customer.id, now.toISOString()) + total > customer.debt_limit;
  const approval_for = [...(overLimit ? (["debt"] as const) : []), ...(discount?.needs_approval ? (["discount"] as const) : [])];
  const src: Order["source"] = source ?? (actor.role === "shop" ? "shop" : actor.role === "rep" ? "rep" : "office");
  const id = nextId(db, "order");
  const order: Order = {
    id,
    number: `ORD-${pad(id)}`,
    client_ref: input.client_ref,
    customer_id: customer.id,
    rep_id: customer.rep_id,
    warehouse_id: warehouseId,
    source: src,
    status: approval_for.length ? "needs_approval" : "pending",
    lines,
    total,
    ...(discount ? { subtotal, discount } : {}),
    ...(approval_for.length ? { approval_for: [...approval_for] } : {}),
    reserved_until: new Date(now.getTime() + db.settings.reservation_hours * 3_600_000).toISOString(),
    note: input.note?.trim() || undefined,
    created_at: now.toISOString(),
    created_by: person(actor),
  };
  db.orders.push(order);
  audit(db, actor, "create", "order", id, `طلب جديد ${order.number} لـ ${customer.name}`, `New order ${order.number} for ${customer.name}`, now);

  if (discount?.needs_approval) notifyDiscount(db, order, customer.name, now);
  if (overLimit) {
    notify(
      db,
      {
        type: "needs_approval",
        roles: ["manager"],
        title: `طلب يتجاوز سقف الدين: ${customer.name}`,
        title_en: `Order over debt limit: ${customer.name}`,
        body: `${order.number} بانتظار موافقتك`,
        body_en: `${order.number} is waiting for your approval`,
        link: `/orders/${id}`,
      },
      now,
    );
  }
  if (src === "shop") {
    const msgBase = {
      type: "shop_order" as const,
      title: `طلب من المحل: ${customer.name}`,
      title_en: `Shop order: ${customer.name}`,
      body: `${order.number} طلبه صاحب المحل من الموقع`,
      body_en: `${order.number} was placed by the shop owner online`,
      link: `/orders/${id}`,
    };
    notify(db, { ...msgBase, roles: ["manager"] }, now);
    notify(db, { ...msgBase, roles: ["rep"], user_id: customer.rep_id }, now);
  }
  if (order.status === "pending" && src === "rep" && db.settings.auto_confirm_rep_orders) {
    confirmOrder(db, actor, id, now, true);
  }
  return order;
}

export function approveOrder(db: Db, actor: DbUser, id: number, now: Date): Order {
  need(actor, ["manager"]);
  const o = db.orders.find((x) => x.id === id) ?? fail(404, "NOT_FOUND", "الطلب غير موجود", "Order not found");
  if (o.status !== "needs_approval") fail(409, "BAD_STATE", "هذا الطلب لا يحتاج موافقة", "This order doesn't need approval");
  checkStock(db, o.warehouse_id, o.lines, now, o.id);
  o.status = "pending";
  o.approved_by = person(actor);
  o.reserved_until = new Date(now.getTime() + db.settings.reservation_hours * 3_600_000).toISOString();
  const why = o.approval_for ?? ["debt"];
  if (o.discount?.needs_approval) {
    delete o.discount.needs_approval;
    o.discount.approved_by = person(actor);
  }
  delete o.approval_for;
  const ar = why.map((w) => (w === "debt" ? "تجاوز سقف الدين" : `خصم ${o.discount?.percent ?? ""}%`)).join(" و");
  audit(db, actor, "approve", "order", o.id, `موافقة على ${ar} للطلب ${o.number}`, `Approved ${why.join(" + ")} for ${o.number}`, now);
  return o;
}

// ---------- discounts ----------
// The delivery rep (his own shops) and the warehouse keeper (his warehouse's orders) give up to 3% by themselves.
// More than that, the order waits for the manager. The manager gives any discount up to 30% with no approval.

function makeDiscount(actor: DbUser, subtotal: number, percent: number, now: Date): Order["discount"] {
  const p = Math.round((Number(percent) || 0) * 10) / 10;
  if (p === 0) return undefined;
  if (!["manager", "rep", "warehouse"].includes(actor.role)) fail(403, "FORBIDDEN", "لا تستطيع إعطاء خصم", "You can't give a discount");
  if (p < 0 || p > DISCOUNT_MAX) fail(422, "VALIDATION", `الخصم بين 0 و ${DISCOUNT_MAX}%`, `The discount is between 0 and ${DISCOUNT_MAX}%`, { discount_percent: msg(`حتى ${DISCOUNT_MAX}%`, `Up to ${DISCOUNT_MAX}%`) });
  const needsOk = actor.role !== "manager" && p > STAFF_DISCOUNT_MAX;
  return {
    percent: p,
    amount: Math.round((subtotal * p) / 100),
    by: { ...person(actor), role: actor.role },
    at: now.toISOString(),
    ...(needsOk ? { needs_approval: true } : {}),
  };
}

function notifyDiscount(db: Db, o: Order, customerName: string, now: Date) {
  notify(
    db,
    {
      type: "needs_approval",
      roles: ["manager"],
      title: `خصم ${o.discount!.percent}% يحتاج موافقتك: ${customerName}`,
      title_en: `${o.discount!.percent}% discount needs your OK: ${customerName}`,
      body: `${o.discount!.by.name} أعطى خصماً أكثر من ${STAFF_DISCOUNT_MAX}% على ${o.number}`,
      body_en: `${o.discount!.by.name} gave more than ${STAFF_DISCOUNT_MAX}% on ${o.number}`,
      link: `/orders/${o.id}`,
    },
    now,
  );
}

/** The shop owner (or the manager) changes an order that isn't confirmed yet: the new lines replace the old
 *  ones, at today's prices, the stock is held again, and the limit / discount are checked again. */
export function updateOrder(db: Db, actor: DbUser, id: number, input: OrderEdit, now: Date): Order {
  need(actor, ["shop", "manager"]);
  const o = db.orders.find((x) => x.id === id) ?? fail(404, "NOT_FOUND", "الطلب غير موجود", "Order not found");
  if (actor.role === "shop" && actor.customer_id !== o.customer_id) fail(403, "FORBIDDEN", "هذا الطلب ليس لمحلك", "This order isn't for your shop");
  if (o.status !== "pending" && o.status !== "needs_approval") fail(409, "BAD_STATE", "ثُبّت الطلب أو أُلغي، ولا يمكن تعديله الآن", "The order was confirmed or cancelled; it can't change now");
  const wanted = (input.lines ?? []).filter((l) => l.qty > 0);
  if (!wanted.length) fail(422, "VALIDATION", "الطلب فارغ. لإلغائه استخدم زر الإلغاء", "The order is empty. To drop it, cancel it");
  if (actor.role === "shop" && orderCount(wanted) > SHOP_MAX_QTY) {
    fail(422, "VALIDATION", `الحد الأعلى للطلب الواحد ${SHOP_MAX_QTY} (كل المواد معاً)`, `Up to ${SHOP_MAX_QTY} in one order (all items together)`);
  }
  const customer = db.customers.find((c) => c.id === o.customer_id)!;
  const lines = orderLines(db, customer.tier_id, wanted);
  // Its own held stock doesn't count against it.
  checkStock(db, o.warehouse_id, lines, now, o.id);
  const subtotal = lines.reduce((s, l) => s + l.total, 0);
  o.lines = lines;
  if (o.discount) {
    // Same percent on the new lines (and the same approval state).
    o.discount = { ...o.discount, amount: Math.round((subtotal * o.discount.percent) / 100) };
    o.subtotal = subtotal;
  }
  o.total = subtotal - (o.discount?.amount ?? 0);
  if (input.note !== undefined) o.note = input.note.trim() || undefined;
  const overLimit = committedDebt(db, customer.id, now.toISOString(), o.id) + o.total > customer.debt_limit;
  const reasons = [...(overLimit ? (["debt"] as const) : []), ...(o.discount?.needs_approval ? (["discount"] as const) : [])];
  if (reasons.length) {
    o.status = "needs_approval";
    o.approval_for = [...reasons];
    // A bigger order needs the manager's OK again.
    if (overLimit) delete o.approved_by;
  } else {
    o.status = "pending";
    delete o.approval_for;
  }
  o.reserved_until = new Date(now.getTime() + db.settings.reservation_hours * 3_600_000).toISOString();
  o.edited_at = now.toISOString();
  audit(db, actor, "update", "order", o.id, `تعديل الطلب ${o.number} قبل التثبيت`, `Changed ${o.number} before confirming`, now);
  if (actor.role === "shop") {
    const n = {
      type: "shop_order" as const,
      title: `${customer.name} عدّل طلبه ${o.number}`,
      title_en: `${customer.name} changed order ${o.number}`,
      body: `المجموع الآن ${o.total.toLocaleString("en-US")} د.ع${o.status === "needs_approval" ? " · ينتظر موافقة المدير" : ""}`,
      body_en: `New total ${o.total.toLocaleString("en-US")} IQD`,
      link: `/orders/${o.id}`,
    };
    notify(db, { ...n, roles: ["manager"] }, now);
    notify(db, { ...n, roles: ["rep"], user_id: o.rep_id }, now);
  }
  return o;
}

/** Give, change or remove (0) the discount of an order that isn't confirmed yet. */
export function setOrderDiscount(db: Db, actor: DbUser, id: number, percent: number, now: Date): Order {
  need(actor, ["manager", "rep", "warehouse"]);
  const o = db.orders.find((x) => x.id === id) ?? fail(404, "NOT_FOUND", "الطلب غير موجود", "Order not found");
  if (o.status !== "pending" && o.status !== "needs_approval") fail(409, "BAD_STATE", "لا يتغير خصم طلب مثبّت", "A confirmed order's discount can't change");
  if (actor.role === "rep" && o.rep_id !== actor.id) fail(403, "FORBIDDEN", "هذا الطلب ليس لأحد زبائنك", "This order isn't for one of your shops");
  if (actor.role === "warehouse" && actor.warehouse_id && actor.warehouse_id !== o.warehouse_id) fail(403, "FORBIDDEN", "هذا الطلب من مخزن آخر", "This order is for another warehouse");
  const customer = db.customers.find((c) => c.id === o.customer_id)!;
  const subtotal = o.lines.reduce((s, l) => s + l.total, 0);
  const discount = makeDiscount(actor, subtotal, percent, now);
  if (discount) {
    o.discount = discount;
    o.subtotal = subtotal;
  } else {
    delete o.discount;
    delete o.subtotal;
  }
  o.total = subtotal - (discount?.amount ?? 0);
  // Ask again why the order would wait: the new total may be under (or over) the debt limit now.
  const overLimit = committedDebt(db, customer.id, now.toISOString(), o.id) + o.total > customer.debt_limit;
  const debtWasOk = o.approved_by && !(o.approval_for ?? []).includes("debt");
  const reasons = [...(overLimit && !debtWasOk ? (["debt"] as const) : []), ...(discount?.needs_approval ? (["discount"] as const) : [])];
  if (reasons.length) {
    o.status = "needs_approval";
    o.approval_for = [...reasons];
  } else {
    o.status = "pending";
    delete o.approval_for;
  }
  audit(db, actor, "update", "order", o.id, discount ? `خصم ${discount.percent}% على ${o.number}` : `إلغاء خصم ${o.number}`, discount ? `${discount.percent}% discount on ${o.number}` : `Removed the discount of ${o.number}`, now);
  if (discount?.needs_approval) notifyDiscount(db, o, customer.name, now);
  return o;
}

export function cancelOrder(db: Db, actor: DbUser, id: number, reason: string, now: Date): Order {
  const o = db.orders.find((x) => x.id === id) ?? fail(404, "NOT_FOUND", "الطلب غير موجود", "Order not found");
  const own = o.created_by.id === actor.id;
  if (!(actor.role === "manager" || (own && (o.status === "pending" || o.status === "needs_approval")))) {
    fail(403, "FORBIDDEN", "لا تستطيع إلغاء هذا الطلب", "You can't cancel this order");
  }
  if (o.status !== "pending" && o.status !== "needs_approval") fail(409, "BAD_STATE", "لا يمكن إلغاء طلب مثبّت", "A confirmed order can't be cancelled");
  if (!reason.trim()) fail(422, "VALIDATION", "اكتب سبب الإلغاء", "Write the reason", { reason: msg("السبب مطلوب", "Reason is required") });
  o.status = "cancelled";
  o.cancel_reason = reason.trim();
  audit(db, actor, "cancel", "order", o.id, `إلغاء الطلب ${o.number}: ${o.cancel_reason}`, `Cancelled ${o.number}: ${o.cancel_reason}`, now);
  return o;
}

/** Confirm = issue the goods: take stock oldest expiry first, and make the invoice with the prices of the order. */
export function confirmOrder(db: Db, actor: DbUser, id: number, now: Date, auto = false): DbInvoice {
  if (!auto) need(actor, ["manager", "warehouse", "accountant"]);
  const o = db.orders.find((x) => x.id === id) ?? fail(404, "NOT_FOUND", "الطلب غير موجود", "Order not found");
  if (o.status === "needs_approval") fail(409, "BAD_STATE", "الطلب يحتاج موافقة المدير أولاً", "The manager must approve this order first");
  if (o.status !== "pending" && o.status !== "expired") fail(409, "BAD_STATE", "الطلب ليس بانتظار التثبيت", "This order isn't waiting for confirmation");
  if (actor.role === "warehouse" && actor.warehouse_id && actor.warehouse_id !== o.warehouse_id) {
    fail(403, "FORBIDDEN", "هذا الطلب من مخزن آخر", "This order is for another warehouse");
  }
  // An expired reservation is checked again: the stock may be gone now.
  checkStock(db, o.warehouse_id, o.lines, now, o.id);
  const today = dayOf(now);
  const lines = o.lines.map((l) => {
    const item = itemOf(db, l.item_id);
    const pieces = piecesOf(item, l.unit, l.qty);
    const batches = takeFefo(db, l.item_id, o.warehouse_id, pieces, today);
    return { ...l, pieces, returned_pieces: 0, batches };
  });
  const cost = lines.reduce((s, l) => s + l.batches.reduce((a, b) => a + b.qty * b.purchase_price, 0), 0);
  const invId = nextId(db, "invoice");
  const inv: DbInvoice = {
    id: invId,
    number: `INV-${now.getFullYear()}-${pad(invId)}`,
    order_id: o.id,
    customer_id: o.customer_id,
    rep_id: o.rep_id,
    warehouse_id: o.warehouse_id,
    date: now.toISOString(),
    lines,
    total: o.total,
    ...(o.discount ? { subtotal: o.subtotal, discount: o.discount.amount, discount_percent: o.discount.percent } : {}),
    ...(usdRateOn(db, dayOf(now)) ? { usd_rate: usdRateOn(db, dayOf(now))!.rate } : {}),
    paid: 0,
    returned: 0,
    cost,
    created_by: person(actor),
  };
  db.invoices.push(inv);
  o.status = "confirmed";
  o.invoice_id = invId;
  o.reserved_until = undefined;
  // The trip to the shop starts here: a QR code for the shipment label and a PIN for the shop owner,
  // and the delivery rep who takes it.
  o.delivery = newDelivery();
  const carrier = deliveryRepFor(db, o.rep_id);
  if (carrier) o.delivery.rep = person(carrier);
  audit(db, actor, "confirm", "order", o.id, `تثبيت الطلب ${o.number} وإصدار الفاتورة ${inv.number}`, `Confirmed ${o.number}, invoice ${inv.number}`, now);
  for (const l of lines) checkLowStock(db, l.item_id, now);
  const customer = db.customers.find((c) => c.id === o.customer_id);
  notify(
    db,
    {
      type: "order_confirmed",
      roles: ["rep"],
      user_id: o.rep_id,
      title: `تم تثبيت ${o.number}`,
      title_en: `${o.number} confirmed`,
      body: `فاتورة ${inv.number} لـ ${customer?.name}`,
      body_en: `Invoice ${inv.number} for ${customer?.name}`,
      link: `/invoices/${invId}`,
    },
    now,
  );
  const shopUser = shopOwnerOf(db, o.customer_id);
  if (shopUser) {
    notify(
      db,
      {
        type: "order_confirmed",
        roles: ["shop"],
        user_id: shopUser.id,
        title: `تم تثبيت طلبك ${o.number}`,
        title_en: `Your order ${o.number} is confirmed`,
        body: `فاتورة ${inv.number}`,
        body_en: `Invoice ${inv.number}`,
        link: `/invoices/${invId}`,
      },
      now,
    );
  }
  return inv;
}

// ---------- payments ----------

/** Which invoices a payment would cover: the oldest open invoice first. */
export function allocate(db: Db, customerId: number, amount: number) {
  const open = db.invoices
    .filter((i) => i.customer_id === customerId && invoiceRemaining(i) > 0)
    .sort((a, b) => a.date.localeCompare(b.date) || a.id - b.id);
  const out: { invoice_id: number; number: string; amount: number }[] = [];
  let left = amount;
  for (const inv of open) {
    if (left <= 0) break;
    const take = Math.min(invoiceRemaining(inv), left);
    out.push({ invoice_id: inv.id, number: inv.number, amount: take });
    left -= take;
  }
  return { allocations: out, left };
}

export function createPayment(db: Db, actor: DbUser, input: NewPayment, now: Date): Payment {
  need(actor, ["manager", "rep", "accountant"]);
  // Online payments are never typed in by hand: only the gateway's "success" records them.
  if (input.method === "online") fail(422, "VALIDATION", "الدفع الأونلاين يُسجَّل تلقائياً من بوابة الدفع", "Online payments are recorded by the payment gateway");
  return addPayment(db, actor, input, now);
}

/** Records money received (no role check: createPayment checks people, the gateway is checked by its session). */
export function addPayment(db: Db, actor: DbUser, input: NewPayment, now: Date, gateway?: GatewayInfo): Payment {
  const same = db.payments.find((p) => p.client_ref === input.client_ref);
  if (same) return same;
  const customer = db.customers.find((c) => c.id === input.customer_id) ?? fail(404, "NOT_FOUND", "الزبون غير موجود", "Customer not found");
  if (actor.role === "rep" && customer.rep_id !== actor.id) fail(403, "FORBIDDEN", "هذا الزبون ليس من زبائنك", "This customer isn't yours");
  const balance = customerBalance(db, customer.id);
  if (!(input.amount > 0) || !Number.isInteger(input.amount)) {
    fail(422, "VALIDATION", "المبلغ غير صحيح", "Amount is not valid", { amount: msg("اكتب مبلغاً صحيحاً بالدينار", "Enter a whole amount in dinars") });
  }
  if (input.amount > balance) {
    fail(422, "VALIDATION", "المبلغ أكبر من الدين", "Amount is more than the debt", {
      amount: msg(`الدين الحالي ${balance.toLocaleString("en")} د.ع`, `Current debt is ${balance.toLocaleString("en")} IQD`),
    });
  }
  const { allocations } = allocate(db, customer.id, input.amount);
  for (const a of allocations) {
    const inv = db.invoices.find((i) => i.id === a.invoice_id);
    if (inv) inv.paid += a.amount;
  }
  const id = nextId(db, "payment");
  const p: Payment = {
    id,
    number: `PAY-${pad(id)}`,
    client_ref: input.client_ref,
    customer_id: customer.id,
    amount: input.amount,
    method: input.method,
    received_by: { ...person(actor), role: actor.role },
    date: now.toISOString(),
    note: input.note?.trim() || undefined,
    allocations,
    ...(gateway ? { gateway } : {}),
    reversed: false,
  };
  db.payments.push(p);
  audit(db, actor, "create", "payment", id, `تسديد ${p.number} من ${customer.name}: ${input.amount.toLocaleString("en")} د.ع`, `Payment ${p.number} from ${customer.name}: ${input.amount.toLocaleString("en")} IQD`, now);
  // The rep earns his commission when the shop pays (not when it buys on credit): tell him what he earned.
  const earned = new Map<number, number>();
  for (const a of allocations) {
    const inv = db.invoices.find((i) => i.id === a.invoice_id);
    if (inv) earned.set(inv.rep_id, (earned.get(inv.rep_id) ?? 0) + a.amount * invoiceRate(db, inv));
  }
  for (const [repId, sum] of earned) {
    const c = Math.round(sum);
    if (c <= 0) continue;
    notify(
      db,
      {
        type: "commission_earned",
        roles: ["rep"],
        user_id: repId,
        title: `عمولتك من تسديد ${customer.name}: ${c.toLocaleString("en")} د.ع`,
        title_en: `Your commission from ${customer.name}'s payment: ${c.toLocaleString("en")} IQD`,
        body: `دفع ${input.amount.toLocaleString("en")} د.ع${p.method === "online" ? " أونلاين" : ""}`,
        body_en: `Paid ${input.amount.toLocaleString("en")} IQD`,
        link: "/commissions",
      },
      now,
    );
  }
  return p;
}

/** A payment is never deleted: a reverse entry cancels it, and both stay in the statement. */
export function reversePayment(db: Db, actor: DbUser, id: number, reason: string, now: Date): Payment {
  need(actor, ["manager", "accountant"]);
  const p = db.payments.find((x) => x.id === id) ?? fail(404, "NOT_FOUND", "التسديد غير موجود", "Payment not found");
  if (p.reversal_of) fail(409, "BAD_STATE", "هذه عملية عكسية أصلاً", "This is already a reverse entry");
  if (p.reversed) fail(409, "ALREADY_REVERSED", "تم عكس هذا التسديد من قبل", "This payment was already reversed");
  if (!reason.trim()) fail(422, "VALIDATION", "اكتب سبب العكس", "Write the reason", { reason: msg("السبب مطلوب", "Reason is required") });
  for (const a of p.allocations) {
    const inv = db.invoices.find((i) => i.id === a.invoice_id);
    if (inv) inv.paid -= a.amount;
  }
  const rid = nextId(db, "payment");
  const r: Payment = {
    id: rid,
    number: `PAY-${pad(rid)}`,
    client_ref: `reverse-${p.id}`,
    customer_id: p.customer_id,
    amount: -p.amount,
    method: p.method,
    received_by: { ...person(actor), role: actor.role },
    date: now.toISOString(),
    allocations: p.allocations.map((a) => ({ ...a, amount: -a.amount })),
    reversed: false,
    reversal_of: p.id,
    reason: reason.trim(),
  };
  p.reversed = true;
  p.reversed_by_id = rid;
  db.payments.push(r);
  audit(db, actor, "reverse", "payment", p.id, `عكس التسديد ${p.number} (${p.amount.toLocaleString("en")} د.ع): ${r.reason}`, `Reversed ${p.number} (${p.amount.toLocaleString("en")} IQD): ${r.reason}`, now);
  return r;
}

// ---------- returns ----------

export function createReturn(db: Db, actor: DbUser, input: NewReturn, now: Date): DbReturn {
  need(actor, ["manager", "rep", "accountant"]);
  const same = db.returns.find((r) => r.client_ref === input.client_ref);
  if (same) return same;
  const inv = db.invoices.find((i) => i.id === input.invoice_id) ?? fail(404, "NOT_FOUND", "الفاتورة غير موجودة", "Invoice not found");
  if (actor.role === "rep" && inv.rep_id !== actor.id) fail(403, "FORBIDDEN", "هذه الفاتورة ليست لزبائنك", "This invoice isn't for your customers");
  const errors: Record<string, string> = {};
  const lines = input.lines.filter((l) => l.qty > 0);
  if (!lines.length) errors["lines"] = msg("اختر مادة واحدة على الأقل", "Choose at least one item");

  // Check every line: never more than was sold minus what was already returned.
  const wanted = new Map<number, number>();
  lines.forEach((l, i) => {
    const item = itemOf(db, l.item_id);
    const pieces = piecesOf(item, l.unit, l.qty);
    const sold = inv.lines.filter((x) => x.item_id === l.item_id);
    const can = sold.reduce((s, x) => s + x.pieces - x.returned_pieces, 0);
    const total = (wanted.get(l.item_id) ?? 0) + pieces;
    wanted.set(l.item_id, total);
    if (!sold.length) errors[`lines.${i}.item_id`] = msg("هذه المادة ليست في الفاتورة", "This item is not on the invoice");
    else if (total > can) errors[`lines.${i}.qty`] = msg(`أقصى إرجاع ${can} قطعة`, `You can return ${can} pieces at most`);
  });
  if (errors["lines"]) fail(422, "VALIDATION", errors["lines"], errors["lines"], errors);
  if (Object.keys(errors).length) fail(409, "RETURN_TOO_MUCH", "لا يمكن إرجاع أكثر مما تم بيعه", "You can't return more than was sold", errors);

  const remainingBefore = Math.max(0, invoiceRemaining(inv));
  let amount = 0;
  let cost = 0;
  const outLines: DbReturn["lines"] = [];
  for (const l of lines) {
    const item = itemOf(db, l.item_id);
    let pieces = piecesOf(item, l.unit, l.qty);
    let lineAmount = 0;
    for (const sl of inv.lines.filter((x) => x.item_id === l.item_id)) {
      if (pieces <= 0) break;
      const can = sl.pieces - sl.returned_pieces;
      const take = Math.min(can, pieces);
      if (take <= 0) continue;
      sl.returned_pieces += take;
      pieces -= take;
      // What the shop really paid for these pieces: after the invoice's discount.
      lineAmount += Math.round((sl.total / sl.pieces) * take * (1 - (inv.discount_percent ?? 0) / 100));
      // Put good pieces back into the batches they came from (latest expiry first), damaged ones are written off.
      let back = take;
      for (const use of [...sl.batches].reverse()) {
        if (back <= 0) break;
        const room = use.qty - use.returned;
        const n = Math.min(room, back);
        if (n <= 0) continue;
        use.returned += n;
        back -= n;
        cost += n * use.purchase_price;
        if (l.condition === "good") {
          const b = db.batches.find((x) => x.id === use.batch_id);
          if (b) b.qty_left += n;
        }
      }
    }
    const piecesTotal = piecesOf(item, l.unit, l.qty);
    amount += lineAmount;
    outLines.push({ ...l, pieces: piecesTotal, amount: lineAmount });
  }
  inv.returned += amount;
  const id = nextId(db, "return");
  const ret: DbReturn = {
    id,
    number: `RET-${pad(id)}`,
    client_ref: input.client_ref,
    invoice_id: inv.id,
    customer_id: inv.customer_id,
    rep_id: inv.rep_id,
    lines: outLines,
    amount,
    note: input.note?.trim() || undefined,
    created_at: now.toISOString(),
    created_by: person(actor),
    cost,
    // Only the part that was already paid had earned commission, so only that part is taken back.
    commission_base: Math.max(0, amount - remainingBefore),
  };
  db.returns.push(ret);
  for (const l of outLines) {
    if (l.condition === "damaged") {
      db.damaged.push({
        id: nextId(db, "damaged"),
        item_id: l.item_id,
        warehouse_id: inv.warehouse_id,
        pieces: l.pieces,
        source: "return",
        ref: ret.number,
        created_at: now.toISOString(),
      });
    } else {
      checkLowStock(db, l.item_id, now);
    }
  }
  const customer = db.customers.find((c) => c.id === inv.customer_id);
  audit(db, actor, "create", "return", id, `مرتجع ${ret.number} من ${customer?.name} على ${inv.number}: ${amount.toLocaleString("en")} د.ع`, `Return ${ret.number} from ${customer?.name} on ${inv.number}: ${amount.toLocaleString("en")} IQD`, now);
  return ret;
}

// ---------- transfers ----------

/** Move stock between warehouses. All lines move, or nothing moves. */
export function createTransfer(db: Db, actor: DbUser, input: NewTransfer, now: Date): Transfer {
  need(actor, ["manager", "warehouse"]);
  const same = db.transfers.find((t) => t.client_ref === input.client_ref);
  if (same) return same;
  if (input.from_warehouse_id === input.to_warehouse_id) {
    fail(422, "VALIDATION", "اختر مخزنين مختلفين", "Choose two different warehouses", { to_warehouse_id: msg("نفس المخزن", "Same warehouse") });
  }
  if (actor.role === "warehouse" && actor.warehouse_id && actor.warehouse_id !== input.from_warehouse_id) {
    fail(403, "FORBIDDEN", "تستطيع التحويل من مخزنك فقط", "You can only transfer out of your own warehouse");
  }
  const lines = input.lines.filter((l) => l.qty > 0);
  if (!lines.length) fail(422, "VALIDATION", "أضف مادة واحدة على الأقل", "Add at least one item", { lines: msg("فارغ", "Empty") });
  checkStock(db, input.from_warehouse_id, lines, now);

  // Work on a copy first: if anything fails, the real data is untouched.
  const today = dayOf(now);
  const draft: Db = JSON.parse(JSON.stringify(db));
  const outLines: Transfer["lines"] = [];
  for (const l of lines) {
    const item = itemOf(draft, l.item_id);
    const pieces = piecesOf(item, l.unit, l.qty);
    const used = takeFefo(draft, l.item_id, input.from_warehouse_id, pieces, today);
    for (const u of used) {
      draft.batches.push({
        ...(draft.batches.find((b) => b.id === u.batch_id) as DbBatch),
        id: nextId(draft, "batch"),
        warehouse_id: input.to_warehouse_id,
        qty_received: u.qty,
        qty_left: u.qty,
        received_at: now.toISOString(),
        received_by: person(actor),
      });
    }
    outLines.push({ ...l, pieces });
  }
  const id = nextId(draft, "transfer");
  const t: Transfer = {
    id,
    number: `TRF-${pad(id, 5)}`,
    client_ref: input.client_ref,
    from_warehouse_id: input.from_warehouse_id,
    to_warehouse_id: input.to_warehouse_id,
    lines: outLines,
    note: input.note?.trim() || undefined,
    created_at: now.toISOString(),
    created_by: person(actor),
  };
  draft.transfers.push(t);
  const from = draft.warehouses.find((w) => w.id === input.from_warehouse_id);
  const to = draft.warehouses.find((w) => w.id === input.to_warehouse_id);
  audit(draft, actor, "transfer", "transfer", id, `تحويل ${t.number} من ${from?.name} إلى ${to?.name}`, `Transfer ${t.number} from ${from?.name_en} to ${to?.name_en}`, now);
  Object.assign(db, draft);
  return t;
}

// ---------- stocktake ----------

export function createStocktake(db: Db, actor: DbUser, warehouseId: number, now: Date): Stocktake {
  need(actor, ["manager", "warehouse"]);
  if (actor.role === "warehouse" && actor.warehouse_id && actor.warehouse_id !== warehouseId) {
    fail(403, "FORBIDDEN", "تستطيع جرد مخزنك فقط", "You can only count your own warehouse");
  }
  if (db.stocktakes.some((s) => s.warehouse_id === warehouseId && s.status === "open")) {
    fail(409, "BAD_STATE", "يوجد جرد مفتوح لهذا المخزن", "There is already an open count for this warehouse");
  }
  const id = nextId(db, "stocktake");
  const lines: StocktakeLine[] = db.items
    .filter((i) => i.active)
    .map((i) => ({ item_id: i.id, system_qty: shelfQty(db, i.id, warehouseId), counted_qty: null }));
  const s: Stocktake = {
    id,
    number: `CNT-${pad(id, 4)}`,
    warehouse_id: warehouseId,
    status: "open",
    lines,
    created_at: now.toISOString(),
    created_by: person(actor),
  };
  db.stocktakes.push(s);
  audit(db, actor, "create", "stocktake", id, `بدء جرد ${s.number}`, `Started count ${s.number}`, now);
  return s;
}

export function saveStocktake(db: Db, actor: DbUser, id: number, lines: StocktakeLine[], now: Date): Stocktake {
  need(actor, ["manager", "warehouse"]);
  const s = db.stocktakes.find((x) => x.id === id) ?? fail(404, "NOT_FOUND", "الجرد غير موجود", "Count not found");
  if (s.status !== "open") fail(409, "BAD_STATE", "هذا الجرد مغلق", "This count is closed");
  for (const l of lines) {
    const row = s.lines.find((x) => x.item_id === l.item_id);
    if (row) {
      row.counted_qty = l.counted_qty;
      row.reason = l.reason?.trim() || undefined;
    }
  }
  void now;
  return s;
}

/** Closing sets the stock to what was counted. Every difference is saved with its reason, nothing is erased. */
export function closeStocktake(db: Db, actor: DbUser, id: number, now: Date): Stocktake {
  need(actor, ["manager"]);
  const s = db.stocktakes.find((x) => x.id === id) ?? fail(404, "NOT_FOUND", "الجرد غير موجود", "Count not found");
  if (s.status !== "open") fail(409, "BAD_STATE", "هذا الجرد مغلق", "This count is closed");
  const errors: Record<string, string> = {};
  s.lines.forEach((l) => {
    if (l.counted_qty === null) errors[`item.${l.item_id}`] = msg("لم يُعد بعد", "Not counted yet");
    else if (l.counted_qty !== l.system_qty && !l.reason) errors[`item.${l.item_id}`] = msg("اكتب سبب الفرق", "Write the reason for the difference");
  });
  if (Object.keys(errors).length) fail(422, "VALIDATION", "أكمل العد واكتب سبب كل فرق", "Count every item and explain every difference", errors);

  const changed: string[] = [];
  for (const l of s.lines) {
    // Stock may have moved since the count started, so apply the difference, not the raw number.
    const diff = (l.counted_qty ?? 0) - l.system_qty;
    if (!diff) continue;
    const item = itemOf(db, l.item_id);
    changed.push(`${item.name} ${diff > 0 ? "+" : ""}${diff}`);
    if (diff < 0) {
      let left = -diff;
      const batches = db.batches
        .filter((b) => b.item_id === l.item_id && b.warehouse_id === s.warehouse_id && b.qty_left > 0)
        .sort((a, b) => a.expiry_date.localeCompare(b.expiry_date));
      for (const b of batches) {
        if (left <= 0) break;
        const take = Math.min(b.qty_left, left);
        b.qty_left -= take;
        left -= take;
      }
      db.damaged.push({
        id: nextId(db, "damaged"),
        item_id: l.item_id,
        warehouse_id: s.warehouse_id,
        pieces: -diff,
        source: "stocktake",
        ref: `${s.number}: ${l.reason}`,
        created_at: now.toISOString(),
      });
    } else {
      const last = db.batches
        .filter((b) => b.item_id === l.item_id && b.warehouse_id === s.warehouse_id)
        .sort((a, b) => b.expiry_date.localeCompare(a.expiry_date))[0];
      if (last) last.qty_left += diff;
      else {
        db.batches.push({
          id: nextId(db, "batch"),
          item_id: l.item_id,
          warehouse_id: s.warehouse_id,
          expiry_date: dayOf(addDays(now, 180)),
          qty_received: diff,
          qty_left: diff,
          purchase_price: 0,
          received_at: now.toISOString(),
          received_by: person(actor),
        });
      }
    }
    checkLowStock(db, l.item_id, now);
  }
  s.status = "done";
  s.closed_at = now.toISOString();
  s.closed_by = person(actor);
  audit(
    db,
    actor,
    "close",
    "stocktake",
    s.id,
    `إغلاق الجرد ${s.number}${changed.length ? `، الفروقات: ${changed.join("، ")}` : " بدون فروقات"}`,
    `Closed count ${s.number}${changed.length ? `, differences: ${changed.length}` : ", no differences"}`,
    now,
  );
  return s;
}

// ---------- commission ----------

/** Commission rate of an invoice = the mix of its items' rates, weighted by money. */
export function invoiceRate(db: Db, inv: DbInvoice) {
  const lines = inv.lines.reduce((s, l) => s + l.total, 0);
  if (!lines) return 0;
  const weighted = inv.lines.reduce((s, l) => s + l.total * (itemOf(db, l.item_id).commission_percent / 100), 0);
  return weighted / lines;
}

/** Each payment on the reps' invoices in a month, and the commission it earned. */
export function commissionLines(db: Db, month: string, repId?: number): CommissionLine[] {
  const out: CommissionLine[] = [];
  for (const p of db.payments) {
    if (!p.date.startsWith(month)) continue;
    for (const a of p.allocations) {
      const inv = db.invoices.find((i) => i.id === a.invoice_id);
      if (!inv || (repId && inv.rep_id !== repId)) continue;
      const rate = invoiceRate(db, inv);
      out.push({
        payment_id: p.id,
        payment_number: p.number,
        date: p.date,
        customer_id: inv.customer_id,
        customer: db.customers.find((c) => c.id === inv.customer_id)?.name ?? "",
        invoice_id: inv.id,
        invoice_number: inv.number,
        amount: a.amount,
        rate: Math.round(rate * 1000) / 10,
        commission: Math.round(a.amount * rate),
        rep_id: inv.rep_id,
      });
    }
  }
  return out.sort((x, y) => y.date.localeCompare(x.date));
}

// ---------- the dollar rate ----------

/** The accountant (or the manager) fixes today's rate: "$1 = 1,700 IQD". Set again the same day = changed. */
export function setUsdRate(db: Db, actor: DbUser, rate: number, now: Date): UsdRate {
  need(actor, ["accountant", "manager"]);
  const r = Math.round(Number(rate));
  if (!(r >= 500 && r <= 5000)) fail(422, "VALIDATION", "سعر غير معقول: اكتب كم ديناراً يساوي الدولار الواحد", "Not a sensible rate: how many dinars is one dollar", { rate: msg("بين 500 و 5000", "Between 500 and 5000") });
  db.usd_rates ??= [];
  const date = dayOf(now);
  const old = db.usd_rates.find((x) => x.date === date);
  const entry: UsdRate = { date, rate: r, by: person(actor), at: now.toISOString() };
  if (old) Object.assign(old, entry);
  else db.usd_rates.push(entry);
  audit(db, actor, "update", "settings", 0, `سعر الصرف ${date}: 1$ = ${r.toLocaleString("en")} د.ع${old ? ` (كان ${old.rate.toLocaleString("en")})` : ""}`, `USD rate ${date}: $1 = ${r} IQD`, now);
  if (actor.role !== "manager") {
    notify(
      db,
      {
        type: "usd_rate",
        roles: ["manager"],
        title: `سعر الصرف اليوم: 1$ = ${r.toLocaleString("en")} د.ع`,
        title_en: `Today's rate: $1 = ${r.toLocaleString("en")} IQD`,
        body: `ثبّته ${actor.name}${old ? ` بدل ${old.rate.toLocaleString("en")}` : ""}`,
        body_en: `Set by ${actor.name}`,
        link: "/accounts",
      },
      now,
    );
  }
  return entry;
}

/** The rate of a day: that day's, or the last one before it. */
export function usdRateOn(db: Db, date: string): UsdRate | undefined {
  return [...(db.usd_rates ?? [])].filter((x) => x.date <= date).sort((a, b) => b.date.localeCompare(a.date))[0];
}

export function commissionRows(db: Db, month: string): CommissionRow[] {
  if (db.closed_months[month]) return db.closed_months[month];
  const reps = db.users.filter((u) => u.role === "rep");
  const rows = new Map<number, CommissionRow>();
  for (const r of reps) {
    rows.set(r.id, { rep: person(r), month, paid_sales: 0, commission: 0, returns_deducted: 0, net: 0, closed: false });
  }
  // Counted when the money is paid (credit sales count only after payment). Reverse entries subtract.
  for (const p of db.payments) {
    if (!p.date.startsWith(month)) continue;
    for (const a of p.allocations) {
      const inv = db.invoices.find((i) => i.id === a.invoice_id);
      const row = inv && rows.get(inv.rep_id);
      if (!inv || !row) continue;
      row.paid_sales += a.amount;
      row.commission += a.amount * invoiceRate(db, inv);
    }
  }
  for (const r of db.returns) {
    if (!r.created_at.startsWith(month) || !r.commission_base) continue;
    const inv = db.invoices.find((i) => i.id === r.invoice_id);
    const row = inv && rows.get(inv.rep_id);
    if (!inv || !row) continue;
    row.returns_deducted += r.commission_base * invoiceRate(db, inv);
  }
  return [...rows.values()].map((r) => ({
    ...r,
    commission: Math.round(r.commission),
    returns_deducted: Math.round(r.returns_deducted),
    net: Math.round(r.commission) - Math.round(r.returns_deducted),
  }));
}

export function closeMonth(db: Db, actor: DbUser, month: string, now: Date) {
  need(actor, ["manager"]);
  if (db.closed_months[month]) fail(409, "MONTH_CLOSED", "هذا الشهر مغلق من قبل", "This month is already closed");
  if (month >= dayOf(now).slice(0, 7)) fail(409, "BAD_STATE", "لا يمكن إغلاق الشهر قبل انتهائه", "You can't close a month before it ends");
  const rows = commissionRows(db, month).map((r) => ({ ...r, closed: true }));
  db.closed_months[month] = rows;
  audit(db, actor, "close", "commission", 0, `إغلاق عمولات شهر ${month}`, `Closed commissions for ${month}`, now);
  return rows;
}

// ---------- shop owners signing up on the website ----------

/**
 * A shop owner makes an account by himself. The shop is saved as "waiting for approval": he can log in
 * and see that his account is being checked, but he can't order until the manager sets his price tier,
 * rep and debt limit and approves him. A wholesale company sells on credit, so nobody orders before that.
 */
export function registerShop(db: Db, input: RegisterInput, now: Date) {
  const phone = input.phone.replace(/\s/g, "").replace(/[٠-٩]/g, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d)));
  const errors: Record<string, string> = {};
  if (input.shop_name.trim().length < 3) errors.shop_name = msg("اكتب اسم المحل", "Enter the shop name");
  if (input.owner_name.trim().length < 3) errors.owner_name = msg("اكتب اسمك الكامل", "Enter your full name");
  if (!/^07\d{9}$/.test(phone)) errors.phone = msg("رقم عراقي من 11 رقم يبدأ بـ 07", "An 11-digit Iraqi number starting with 07");
  else if (db.users.some((u) => u.phone === phone) || db.customers.some((c) => c.phone === phone)) {
    errors.phone = msg("هذا الرقم مسجّل من قبل، سجّل الدخول", "This number already has an account. Log in instead");
  }
  if (!input.area.trim()) errors.area = msg("اختر المنطقة", "Choose the area");
  if (input.password.length < 6) errors.password = msg("6 أحرف على الأقل", "At least 6 characters");
  if (Object.keys(errors).length) fail(422, "VALIDATION", "تحقق من الحقول المؤشرة", "Check the marked fields", errors);

  // The new shop goes to the rep who already serves that area (or the rep with the fewest shops).
  const area = input.area.trim();
  const reps = db.users.filter((u) => u.role === "rep" && u.active);
  const ranked = reps
    .map((r) => ({
      r,
      same: db.customers.filter((c) => c.rep_id === r.id && c.area === area).length,
      all: db.customers.filter((c) => c.rep_id === r.id).length,
    }))
    .sort((a, b) => b.same - a.same || a.all - b.all);
  const rep = ranked[0]?.r;
  // The careful start: small-shop prices and no credit, until the manager decides.
  const tier = db.tiers.find((t) => t.id === 3) ?? db.tiers[db.tiers.length - 1];

  const customer: DbCustomer = {
    id: nextId(db, "customer"),
    name: input.shop_name.trim(),
    owner_name: input.owner_name.trim(),
    phone,
    area,
    address: input.address?.trim() || `كربلاء - ${area}`,
    tier_id: tier.id,
    rep_id: rep?.id ?? 0,
    debt_limit: 0,
    active: false,
    pending: true,
  };
  const user: DbUser = { id: nextId(db, "user"), name: customer.owner_name, phone, role: "shop", customer_id: customer.id, active: true, password: input.password };
  db.customers.push(customer);
  db.users.push(user);
  audit(db, user, "create", "customer", customer.id, `تسجيل محل جديد من الموقع: ${customer.name} (${area})`, `New shop signed up online: ${customer.name} (${area})`, now);
  notify(
    db,
    {
      type: "new_shop",
      roles: ["manager"],
      title: `محل جديد سجّل من الموقع: ${customer.name}`,
      title_en: `New shop signed up: ${customer.name}`,
      body: `${customer.owner_name} · ${area}. حدد نوع السعر وسقف الدين ووافق عليه`,
      body_en: `${customer.owner_name} · ${area}. Set the price tier and debt limit, then approve`,
      link: `/customers/${customer.id}`,
    },
    now,
  );
  if (rep) {
    notify(
      db,
      {
        type: "new_shop",
        roles: ["rep"],
        user_id: rep.id,
        title: `محل جديد في منطقتك: ${customer.name}`,
        title_en: `New shop in your area: ${customer.name}`,
        body: `سجّل من الموقع وينتظر موافقة المدير · ${phone}`,
        body_en: `Signed up online, waiting for the manager · ${phone}`,
        link: `/customers/${customer.id}`,
      },
      now,
    );
  }
  return { user, customer };
}

// ---------- A shop owner with several shops ----------

/** Every shop of this owner (older accounts only have customer_id). */
export function shopsOf(u: DbUser): number[] {
  return [...new Set([...(u.customer_ids ?? []), ...(u.customer_id ? [u.customer_id] : [])])];
}

/** The owner's login of a shop. */
export function shopOwnerOf(db: Db, customerId: number): DbUser | undefined {
  return db.users.find((u) => u.role === "shop" && shopsOf(u).includes(customerId));
}

export function myShops(db: Db, actor: DbUser): MyShop[] {
  need(actor, ["shop"]);
  return shopsOf(actor)
    .map((id) => db.customers.find((c) => c.id === id))
    .filter((c): c is DbCustomer => !!c)
    .map((c) => ({ id: c.id, name: c.name, area: c.area, active: c.active, ...(c.pending ? { pending: true } : {}) }));
}

/** Work on another of his shops: everything after this (orders, statement, chat) is for that shop. */
export function switchShop(db: Db, actor: DbUser, customerId: number): DbUser {
  need(actor, ["shop"]);
  if (!shopsOf(actor).includes(customerId)) fail(403, "FORBIDDEN", "هذا المحل ليس لك", "This shop isn't yours");
  actor.customer_ids = shopsOf(actor);
  actor.customer_id = customerId;
  return actor;
}

/** The owner adds another shop. Like a sign-up from the website: it waits for the manager (prices, limit). */
export function addShop(db: Db, actor: DbUser, input: NewShopInput, now: Date): MyShop {
  need(actor, ["shop"]);
  const errors: Record<string, string> = {};
  const name = (input.shop_name ?? "").trim();
  const area = (input.area ?? "").trim();
  const phone = (input.phone ?? "").replace(/\s/g, "").replace(/[٠-٩]/g, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d))) || actor.phone;
  if (name.length < 3) errors.shop_name = msg("اكتب اسم المحل", "Enter the shop name");
  else if (db.customers.some((c) => c.name.trim() === name)) errors.shop_name = msg("يوجد محل بهذا الاسم", "A shop with this name exists");
  if (!area) errors.area = msg("اختر المنطقة", "Choose the area");
  if (!/^07\d{9}$/.test(phone)) errors.phone = msg("رقم عراقي من 11 رقم يبدأ بـ 07", "An 11-digit Iraqi number starting with 07");
  if (shopsOf(actor).length >= 10) errors.shop_name = msg("حتى 10 محلات لكل حساب", "Up to 10 shops per account");
  if (Object.keys(errors).length) fail(422, "VALIDATION", "تحقق من الحقول المؤشرة", "Check the marked fields", errors);

  // The same choice of delivery rep as a sign-up: the one who already serves that area.
  const reps = db.users.filter((u) => u.role === "rep" && u.active);
  const rep = reps
    .map((r) => ({ r, same: db.customers.filter((c) => c.rep_id === r.id && c.area === area).length, all: db.customers.filter((c) => c.rep_id === r.id).length }))
    .sort((a, b) => b.same - a.same || a.all - b.all)[0]?.r;
  const tier = db.tiers.find((t) => t.id === 3) ?? db.tiers[db.tiers.length - 1];
  const c: DbCustomer = {
    id: nextId(db, "customer"),
    name,
    owner_name: actor.name,
    phone,
    area,
    address: input.address?.trim() || `كربلاء - ${area}`,
    tier_id: tier.id,
    rep_id: rep?.id ?? 0,
    debt_limit: 0,
    active: false,
    pending: true,
  };
  db.customers.push(c);
  actor.customer_ids = [...shopsOf(actor), c.id];
  audit(db, actor, "create", "customer", c.id, `${actor.name} أضاف محلاً آخر: ${c.name} (${area})`, `${actor.name} added another shop: ${c.name}`, now);
  notify(
    db,
    {
      type: "new_shop",
      roles: ["manager"],
      title: `محل إضافي لـ ${actor.name}: ${c.name}`,
      title_en: `Another shop for ${actor.name}: ${c.name}`,
      body: `${area}. صاحبه زبون لديكم. حدد نوع السعر وسقف الدين ووافق عليه`,
      body_en: `${area}. The owner is already a customer. Set the tier and limit, then approve`,
      link: `/customers/${c.id}`,
    },
    now,
  );
  return { id: c.id, name: c.name, area: c.area, active: false, pending: true };
}

/** The manager approved the shop (from the customer form, with its tier, rep and limit). */
export function approveShop(db: Db, actor: DbUser, customer: DbCustomer, now: Date) {
  customer.pending = false;
  customer.active = true;
  audit(db, actor, "approve", "customer", customer.id, `موافقة على المحل ${customer.name} وتفعيل حسابه`, `Approved shop ${customer.name}`, now);
  const owner = shopOwnerOf(db, customer.id);
  if (owner) {
    notify(
      db,
      {
        type: "account_approved",
        roles: ["shop"],
        user_id: owner.id,
        title: "تمت الموافقة على حسابك",
        title_en: "Your account is approved",
        body: "يمكنك الآن طلب بضاعتك من الموقع",
        body_en: "You can order your goods on the website now",
        link: "/shop",
      },
      now,
    );
  }
}

/** The manager refused the sign-up: the shop stays off and its login is closed. Nothing is deleted. */
export function rejectShop(db: Db, actor: DbUser, id: number, reason: string, now: Date) {
  need(actor, ["manager"]);
  const c = db.customers.find((x) => x.id === id) ?? fail(404, "NOT_FOUND", "الزبون غير موجود", "Customer not found");
  if (!c.pending) fail(409, "BAD_STATE", "هذا المحل ليس بانتظار الموافقة", "This shop isn't waiting for approval");
  if (!reason.trim()) fail(422, "VALIDATION", "اكتب سبب الرفض", "Write the reason", { reason: msg("السبب مطلوب", "Reason is required") });
  c.pending = false;
  c.active = false;
  // His login closes only if this was his only shop.
  for (const u of db.users) {
    if (u.role !== "shop" || !shopsOf(u).includes(c.id)) continue;
    const others = shopsOf(u).filter((id) => id !== c.id && db.customers.some((x) => x.id === id && x.active));
    if (!others.length) u.active = false;
    else if (u.customer_id === c.id) u.customer_id = others[0];
  }
  audit(db, actor, "cancel", "customer", c.id, `رفض تسجيل المحل ${c.name}: ${reason.trim()}`, `Refused sign-up of ${c.name}: ${reason.trim()}`, now);
  return c;
}

// ---------- reading helpers used by mock.ts ----------

export function invoiceView(db: Db, inv: DbInvoice, showCost: boolean): Invoice {
  const remaining = invoiceRemaining(inv);
  const returnedCost = db.returns.filter((r) => r.invoice_id === inv.id).reduce((s, r) => s + r.cost, 0);
  const { cost: rawCost, ...rest } = inv;
  return {
    ...rest,
    lines: inv.lines.map((l) => ({
      ...l,
      batches: l.batches.map((b) => ({
        batch_id: b.batch_id,
        qty: b.qty,
        expiry_date: b.expiry_date,
        ...(showCost ? { purchase_price: b.purchase_price } : {}),
      })),
    })),
    remaining,
    status: invoiceStatus(inv),
    ...(showCost ? { cost: rawCost - returnedCost, profit: inv.total - inv.returned - (rawCost - returnedCost) } : {}),
  };
}

// ---------- Online payment (Qi Card gateway, demo) ----------
// Same flow as Project 1: we create the payment, the customer pays on the gateway's page and comes back,
// and only the gateway's notification (a moment later) makes it final.

export function onlineView(o: DbOnline): OnlinePayment {
  const { key: _k, return_url: _r, outcome: _o, settles_at: _s, ...rest } = o;
  void _k;
  void _r;
  void _o;
  void _s;
  // The real gateway's page is on Qi's site. The demo one is a page of ours.
  return { ...rest, form_url: `/pay/qi?payment=${o.payment_id}` };
}

export function startOnline(db: Db, actor: DbUser, input: StartOnlinePayment, now: Date): OnlinePayment {
  need(actor, ["shop", "manager", "accountant"]);
  // A second press (or a retry) gives back the same payment, never a second one.
  const same = db.online_payments.find((o) => o.key === input.key);
  if (same) return onlineView(same);
  const customer = db.customers.find((c) => c.id === input.customer_id) ?? fail(404, "NOT_FOUND", "الزبون غير موجود", "Customer not found");
  if (actor.role === "shop" && actor.customer_id !== customer.id) fail(403, "FORBIDDEN", "لا تستطيع الدفع عن محل آخر", "You can't pay for another shop");
  const balance = customerBalance(db, customer.id);
  if (!(input.amount > 0) || !Number.isInteger(input.amount)) {
    fail(422, "VALIDATION", "المبلغ غير صحيح", "Amount is not valid", { amount: msg("اكتب مبلغاً صحيحاً بالدينار", "Enter a whole amount in dinars") });
  }
  if (input.amount > balance) {
    fail(422, "VALIDATION", "المبلغ أكبر من الدين", "Amount is more than the debt", {
      amount: msg(`الدين الحالي ${balance.toLocaleString("en")} د.ع`, `Current debt is ${balance.toLocaleString("en")} IQD`),
    });
  }
  // Only pages of our own site can be the way back (never another website).
  const back = input.return_url.startsWith("/") && !input.return_url.startsWith("//") ? input.return_url : "/";
  const o: DbOnline = {
    payment_id: `qi_${crypto.randomUUID().replace(/-/g, "").slice(0, 20)}`,
    customer_id: customer.id,
    amount: input.amount,
    status: "created",
    created_at: now.toISOString(),
    by: { ...person(actor), role: actor.role },
    key: input.key,
    return_url: back,
  };
  db.online_payments.push(o);
  return onlineView(o);
}

/** The gateway's notification "arrived": the result becomes final, and a success is recorded as a payment. */
export function settleOnline(db: Db, now: Date) {
  db.online_payments ??= [];
  for (const o of db.online_payments) {
    if (o.status !== "created" || !o.outcome || (o.settles_at ?? 0) > now.getTime()) continue;
    o.status = o.outcome;
    if (o.status !== "success") continue;
    const customer = db.customers.find((c) => c.id === o.customer_id);
    const user = db.users.find((u) => u.id === o.by.id);
    if (!customer || !user) continue;
    // The debt may have been paid in cash meanwhile: take only what is still owed.
    const amount = Math.min(o.amount, customerBalance(db, customer.id));
    if (amount <= 0) {
      o.note = "nothing_owed";
      continue;
    }
    const p = addPayment(
      db,
      user,
      { client_ref: `gateway:${o.payment_id}`, customer_id: customer.id, amount, method: "online", note: "Qi Card" },
      now,
      { provider: "qi", payment_id: o.payment_id, card: "**** 0000" },
    );
    o.recorded_payment_id = p.id;
  }
}

// ---------- Delivery proof (no fake deliveries) ----------

const MAX_PIN_TRIES = 5;

/** A random number from the browser's secure random source (Math.random can be guessed). */
function secureInt(max: number) {
  const a = new Uint32Array(1);
  crypto.getRandomValues(a);
  return a[0] % max;
}

/** Who delivers an order: its own rep if he does delivery, otherwise the delivery rep with the fewest
 *  shipments still waiting or on the way. */
export function deliveryRepFor(db: Db, orderRepId: number): DbUser | undefined {
  const does = (u: DbUser, k: RepKind) => u.role === "rep" && u.active && (!u.rep_kinds?.length || u.rep_kinds.includes(k));
  const own = db.users.find((u) => u.id === orderRepId);
  if (own && does(own, "delivery")) return own;
  const load = (id: number) => db.orders.filter((x) => x.delivery && x.delivery.status !== "delivered" && deliveryRepId(x) === id).length;
  return db.users.filter((u) => does(u, "delivery")).sort((a, b) => load(a.id) - load(b.id))[0];
}

/** The rep who delivers this order. */
export function deliveryRepId(o: Order) {
  return o.delivery?.rep?.id ?? o.rep_id;
}

export function newDelivery(): Delivery {
  // Letters and digits that can't be mixed up when typed by hand (no 0/O, 1/I).
  const abc = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const code = Array.from({ length: 8 }, () => abc[secureInt(abc.length)]).join("");
  return { status: "ready", code, pin: String(1000 + secureInt(9000)), pin_attempts: 0 };
}

/** What a QR or a typed code becomes: "NAHRAIN:DLV:ab12-cd34" → "AB12CD34". */
export function normalizeCode(raw: string) {
  return raw.trim().toUpperCase().replace(/^NAHRAIN:DLV:/, "").replace(/[^A-Z0-9]/g, "");
}

/** At the warehouse: the delivery rep scans the shipment's QR, and the packages are "out" with him. */
export function dispatchDelivery(db: Db, actor: DbUser, rawCode: string, now: Date): Order {
  need(actor, ["rep", "manager"]);
  const code = normalizeCode(rawCode);
  const o = db.orders.find((x) => x.delivery?.code === code) ?? fail(404, "NOT_FOUND", "رمز شحنة غير معروف", "Unknown shipment code");
  const d = o.delivery!;
  if (actor.role === "rep" && deliveryRepId(o) !== actor.id) fail(403, "FORBIDDEN", "هذه الشحنة لمندوب توصيل آخر", "This shipment belongs to another delivery rep");
  if (d.status === "delivered") fail(409, "BAD_STATE", "هذه الشحنة سُلِّمت من قبل", "This shipment was already delivered");
  if (d.status === "out") return o; // scanned twice: nothing changes
  Object.assign(d, { status: "out", out_at: now.toISOString(), out_by: person(actor) });
  const customer = db.customers.find((c) => c.id === o.customer_id);
  audit(db, actor, "update", "order", o.id, `خروج الشحنة ${o.number} مع ${actor.name} إلى ${customer?.name ?? ""}`, `Shipment ${o.number} out with ${actor.name}`, now);
  // Only the shop owner gets the PIN, in his own notification.
  const shopUser = shopOwnerOf(db, o.customer_id);
  if (shopUser) {
    notify(
      db,
      {
        type: "out_for_delivery",
        roles: ["shop"],
        user_id: shopUser.id,
        title: `طلبك ${o.number} في الطريق إليك`,
        title_en: `Your order ${o.number} is on its way`,
        body: `مع ${actor.name}. رمز الاستلام ${d.pin}: أعطه له فقط بعد أن تستلم البضاعة سليمة.`,
        body_en: `With ${actor.name}. Delivery PIN ${d.pin}: give it only after you get the goods in good shape.`,
        link: `/orders/${o.id}`,
      },
      now,
    );
  }
  return o;
}

export type DeliverResult = { ok: true; order: Order } | { ok: false; left: number; locked: boolean };

/**
 * At the shop: the delivery rep sends the photo and the PIN the shop owner gave him.
 * A wrong PIN is RETURNED, not thrown: a thrown error saves nothing, and the wrong try must be counted.
 */
export function deliverOrder(db: Db, actor: DbUser, id: number, input: DeliverInput, now: Date): DeliverResult {
  need(actor, ["rep"]);
  const o = db.orders.find((x) => x.id === id) ?? fail(404, "NOT_FOUND", "الطلب غير موجود", "Order not found");
  const d = o.delivery ?? fail(409, "BAD_STATE", "هذا الطلب ليس له شحنة", "This order has no shipment");
  if (deliveryRepId(o) !== actor.id) fail(403, "FORBIDDEN", "هذه الشحنة لمندوب توصيل آخر", "This shipment belongs to another delivery rep");
  if (d.status === "ready") fail(409, "BAD_STATE", "امسح رمز QR للشحنة في المخزن أولاً", "Scan the shipment's QR at the warehouse first");
  if (d.status === "delivered") fail(409, "BAD_STATE", "هذه الشحنة سُلِّمت من قبل", "This shipment was already delivered");
  if (d.locked) return { ok: false, left: 0, locked: true };
  if (!/^data:image\/(jpeg|png|webp);base64,/.test(input.photo ?? "")) {
    fail(422, "VALIDATION", "صوّر الشحنة عند المحل أولاً", "Take a photo of the packages first", { photo: msg("الصورة مطلوبة", "A photo is required") });
  }
  if (input.photo.length > 600_000) fail(422, "VALIDATION", "الصورة كبيرة جداً", "The photo is too big", { photo: msg("التقط الصورة مرة أخرى", "Take the photo again") });

  if (input.pin.trim() !== d.pin) {
    d.pin_attempts += 1;
    const left = Math.max(0, MAX_PIN_TRIES - d.pin_attempts);
    if (left === 0) {
      d.locked = true;
      const customer = db.customers.find((c) => c.id === o.customer_id);
      audit(db, actor, "update", "order", o.id, `قُفلت شحنة ${o.number}: ${MAX_PIN_TRIES} رموز استلام خاطئة`, `Shipment ${o.number} locked: ${MAX_PIN_TRIES} wrong PINs`, now);
      notify(
        db,
        {
          type: "delivery_locked",
          roles: ["manager"],
          title: `شحنة مقفلة: ${o.number}`,
          title_en: `Shipment locked: ${o.number}`,
          body: `${actor.name} أدخل رمز استلام خاطئاً ${MAX_PIN_TRIES} مرات عند ${customer?.name ?? ""}. تحقق قبل فتحها.`,
          body_en: `${actor.name} typed a wrong PIN ${MAX_PIN_TRIES} times at ${customer?.name ?? ""}. Check before unlocking.`,
          link: `/orders/${o.id}`,
        },
        now,
      );
    }
    return { ok: false, left, locked: !!d.locked };
  }

  Object.assign(d, { status: "delivered", delivered_at: now.toISOString(), delivered_by: person(actor), has_photo: true });
  delete d.problem;
  db.delivery_photos[o.id] = input.photo;
  const customer = db.customers.find((c) => c.id === o.customer_id);
  audit(db, actor, "update", "order", o.id, `تسليم ${o.number} إلى ${customer?.name ?? ""} برمز الاستلام وصورة`, `${o.number} delivered with PIN and photo`, now);
  const shopUser = shopOwnerOf(db, o.customer_id);
  if (shopUser) {
    notify(db, { type: "delivered", roles: ["shop"], user_id: shopUser.id, title: `تم تسليم طلبك ${o.number}`, title_en: `Order ${o.number} delivered`, body: `سلّمه ${actor.name}`, body_en: `Delivered by ${actor.name}`, link: `/orders/${o.id}` }, now);
  }
  return { ok: true, order: o };
}

/** The manager checked what happened and opens a locked shipment again. */
export function unlockDelivery(db: Db, actor: DbUser, id: number, now: Date): Order {
  need(actor, ["manager"]);
  const o = db.orders.find((x) => x.id === id) ?? fail(404, "NOT_FOUND", "الطلب غير موجود", "Order not found");
  if (!o.delivery?.locked) fail(409, "BAD_STATE", "الشحنة ليست مقفلة", "The shipment isn't locked");
  Object.assign(o.delivery!, { locked: false, pin_attempts: 0 });
  audit(db, actor, "update", "order", o.id, `فتح الشحنة المقفلة ${o.number}`, `Unlocked shipment ${o.number}`, now);
  return o;
}

// ---------- Problems on the way ----------

const PROBLEM_TEXT: Record<ProblemReason, [string, string]> = {
  accident: ["تعرّض لحادث", "had an accident"],
  vehicle: ["عطل في السيارة", "vehicle broke down"],
  shop_closed: ["المحل مغلق", "the shop is closed"],
  no_answer: ["صاحب المحل لا يرد", "the shop owner doesn't answer"],
  refused: ["رفض المحل الاستلام", "the shop refused the goods"],
  other: ["سبب آخر", "another reason"],
};

/** The delivery rep can't deliver: an accident, the shop closed... The shipments stay with him ("out"),
 *  marked with the problem, and the manager is told at once (an accident is urgent). */
export function reportDeliveryProblem(db: Db, actor: DbUser, input: ProblemInput, now: Date): Order[] {
  need(actor, ["rep"]);
  const ids = [...new Set(input.order_ids ?? [])];
  if (!ids.length) fail(422, "VALIDATION", "اختر شحنة واحدة على الأقل", "Pick at least one shipment");
  if (!PROBLEM_TEXT[input.reason]) fail(422, "VALIDATION", "اختر السبب", "Choose the reason", { reason: msg("مطلوب", "Required") });
  const note = (input.note ?? "").trim().slice(0, 500);
  if (input.reason === "other" && !note) fail(422, "VALIDATION", "اكتب ما حدث", "Write what happened", { note: msg("مطلوب عند اختيار سبب آخر", "Needed for another reason") });
  const orders = ids.map((id) => {
    const o = db.orders.find((x) => x.id === id) ?? fail(404, "NOT_FOUND", "الطلب غير موجود", "Order not found");
    if (deliveryRepId(o) !== actor.id) fail(403, "FORBIDDEN", "هذه الشحنة لمندوب توصيل آخر", "This shipment belongs to another delivery rep");
    if (o.delivery?.status !== "out") fail(409, "BAD_STATE", `الشحنة ${o.number} ليست في الطريق معك`, `Shipment ${o.number} isn't out with you`);
    return o;
  });
  const [ar, en] = PROBLEM_TEXT[input.reason];
  const names = orders.map((o) => db.customers.find((c) => c.id === o.customer_id)?.name ?? "").filter(Boolean);
  for (const o of orders) {
    o.delivery!.problem = { reason: input.reason, ...(note ? { note } : {}), at: now.toISOString(), by: person(actor) };
    audit(db, actor, "update", "order", o.id, `تعذّر تسليم ${o.number}: ${ar}${note ? ` (${note})` : ""}`, `Couldn't deliver ${o.number}: ${en}`, now);
  }
  const urgent = input.reason === "accident" || input.reason === "vehicle";
  notify(
    db,
    {
      type: "delivery_problem",
      roles: ["manager"],
      title: urgent ? `عاجل: ${actor.name} ${ar}` : `تعذّر التسليم: ${ar}`,
      title_en: urgent ? `Urgent: ${actor.name} ${en}` : `Couldn't deliver: ${en}`,
      body: `${orders.length} شحنة: ${names.join("، ")}.${note ? ` ${note}` : ""}${urgent ? " اتصل به الآن." : ""}`,
      body_en: `${orders.length} shipment(s): ${names.join(", ")}.${note ? ` ${note}` : ""}${urgent ? " Call him now." : ""}`,
      link: orders.length === 1 ? `/orders/${orders[0].id}` : "/deliveries",
    },
    now,
  );
  return orders;
}

/** The shipment comes back to the warehouse (after a problem, or any shipment that is out): it is "ready"
 *  again, to go out later with a new QR scan. The PIN stays the same. */
export function returnToWarehouse(db: Db, actor: DbUser, id: number, now: Date): Order {
  need(actor, ["manager", "warehouse"]);
  const o = db.orders.find((x) => x.id === id) ?? fail(404, "NOT_FOUND", "الطلب غير موجود", "Order not found");
  if (actor.role === "warehouse" && actor.warehouse_id && actor.warehouse_id !== o.warehouse_id) fail(403, "FORBIDDEN", "هذه الشحنة من مخزن آخر", "This shipment is from another warehouse");
  const d = o.delivery ?? fail(409, "BAD_STATE", "هذا الطلب ليس له شحنة", "This order has no shipment");
  if (d.status !== "out") fail(409, "BAD_STATE", "الشحنة ليست في الطريق", "The shipment isn't on the way");
  const why = d.problem ? PROBLEM_TEXT[d.problem.reason][0] : "";
  Object.assign(d, { status: "ready", pin_attempts: 0, locked: false });
  delete d.out_at;
  delete d.out_by;
  delete d.problem;
  audit(db, actor, "update", "order", o.id, `أُعيدت الشحنة ${o.number} إلى المخزن${why ? `: ${why}` : ""}`, `Shipment ${o.number} back at the warehouse`, now);
  return o;
}

/** Everyone except the shop owner of the order gets the PIN hidden. */
export function orderView(o: Order, actor: DbUser): Order {
  if (!o.delivery || (actor.role === "shop" && actor.customer_id === o.customer_id)) return o;
  const { pin: _hidden, ...d } = o.delivery;
  void _hidden;
  return { ...o, delivery: d };
}

// ---------- Support chat ----------
// The shop owner writes from the chat circle; the warehouse staff (and the manager) answer from the inbox.

const MAX_CHAT = 1000;

function chatText(text: string) {
  const t = (text ?? "").trim();
  if (!t) fail(422, "VALIDATION", "اكتب رسالة", "Write a message", { text: msg("الرسالة فارغة", "The message is empty") });
  if (t.length > MAX_CHAT) fail(422, "VALIDATION", "الرسالة طويلة جداً", "The message is too long", { text: msg(`حتى ${MAX_CHAT} حرف`, `Up to ${MAX_CHAT} characters`) });
  return t;
}

function readsOf(db: Db, customerId: number) {
  db.chat_reads ??= {};
  return (db.chat_reads[customerId] ??= { shop: 0, staff: 0 });
}

function addChat(db: Db, actor: DbUser, customerId: number, from: "shop" | "staff", text: string, now: Date): ChatMessage {
  db.chat ??= [];
  const before = db.chat.filter((m) => m.customer_id === customerId).pop();
  const m: ChatMessage = { id: nextId(db, "chat"), customer_id: customerId, from, by: { ...person(actor), role: actor.role }, text: chatText(text), at: now.toISOString() };
  db.chat.push(m);
  // You have seen your own message.
  readsOf(db, customerId)[from] = m.id;
  const customer = db.customers.find((c) => c.id === customerId);
  // One notification when a conversation starts waiting (not one per message, that would flood the bell).
  if (from === "shop" && (!before || before.from === "staff")) {
    notify(
      db,
      {
        type: "support_message",
        roles: ["staff", "manager"],
        title: `رسالة دعم من ${customer?.name ?? ""}`,
        title_en: `Support message from ${customer?.name ?? ""}`,
        body: m.text.slice(0, 120),
        body_en: m.text.slice(0, 120),
        link: `/support?shop=${customerId}`,
      },
      now,
    );
  }
  if (from === "staff" && before?.from === "shop") {
    const shopUser = shopOwnerOf(db, customerId);
    if (shopUser) {
      notify(db, { type: "support_reply", roles: ["shop"], user_id: shopUser.id, title: `ردّ الدعم: ${actor.name}`, title_en: `Support replied: ${actor.name}`, body: m.text.slice(0, 120), body_en: m.text.slice(0, 120) }, now);
    }
  }
  return m;
}

/** The shop owner sends a message. */
export function sendChat(db: Db, actor: DbUser, text: string, now: Date): ChatMessage {
  need(actor, ["shop"]);
  if (!actor.customer_id) fail(403, "FORBIDDEN", "حسابك غير مرتبط بمحل", "Your account isn't linked to a shop");
  return addChat(db, actor, actor.customer_id, "shop", text, now);
}

/** The staff or the manager answers a shop. */
export function replyChat(db: Db, actor: DbUser, customerId: number, text: string, now: Date): ChatMessage {
  need(actor, ["staff", "manager"]);
  if (!db.customers.some((c) => c.id === customerId)) fail(404, "NOT_FOUND", "الزبون غير موجود", "Customer not found");
  return addChat(db, actor, customerId, "staff", text, now);
}

export function myChat(db: Db, actor: DbUser): MyChat {
  need(actor, ["shop"]);
  const messages = (db.chat ?? []).filter((m) => m.customer_id === actor.customer_id);
  const seen = readsOf(db, actor.customer_id ?? 0).shop;
  return { messages, unread: messages.filter((m) => m.from === "staff" && m.id > seen).length };
}

export function chatThreads(db: Db, actor: DbUser): ChatThread[] {
  need(actor, ["staff", "manager"]);
  const ids = [...new Set((db.chat ?? []).map((m) => m.customer_id))];
  return ids
    .map((cid): ChatThread => {
      const list = db.chat.filter((m) => m.customer_id === cid);
      const last = list[list.length - 1];
      const c = db.customers.find((x) => x.id === cid);
      const seen = readsOf(db, cid).staff;
      const answer = [...list].reverse().find((m) => m.from === "staff");
      return {
        customer_id: cid,
        customer: c?.name ?? `#${cid}`,
        area: c?.area ?? "",
        last,
        waiting: last.from === "shop",
        unread: list.filter((m) => m.from === "shop" && m.id > seen).length,
        answered_by: answer ? { id: answer.by.id, name: answer.by.name } : undefined,
      };
    })
    .sort((a, b) => Number(b.waiting) - Number(a.waiting) || b.last.at.localeCompare(a.last.at));
}

export function chatOf(db: Db, actor: DbUser, customerId: number): ChatMessage[] {
  need(actor, ["staff", "manager"]);
  return (db.chat ?? []).filter((m) => m.customer_id === customerId);
}

/** Someone opened the conversation: everything in it counts as seen for their side. */
export function markChatRead(db: Db, actor: DbUser, customerId: number) {
  const side = actor.role === "shop" ? "shop" : "staff";
  if (side === "shop" && actor.customer_id !== customerId) fail(403, "FORBIDDEN", "لا تستطيع", "Not allowed");
  if (side === "staff") need(actor, ["staff", "manager"]);
  const last = (db.chat ?? []).filter((m) => m.customer_id === customerId).pop();
  if (last) readsOf(db, customerId)[side] = last.id;
}
