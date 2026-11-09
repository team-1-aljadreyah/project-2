// The business rules of Al-Nahrain, written once. The fake backend (mock.ts) and the demo data (seed.ts)
// both use these functions, so the demo history follows the same rules as live use.
// The real backend must do the same things (see the client's requirements).
import { currentLocale } from "../../boot";
import { ApiError, type ErrorCode } from "../errors";
import type {
  AppNotification,
  AuditAction,
  AuditEntity,
  BatchStatus,
  CommissionRow,
  Invoice,
  InvoiceStatus,
  NewOrder,
  NewPayment,
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
import { nextId, type Db, type DbBatch, type DbBatchUse, type DbInvoice, type DbItem, type DbReturn, type DbUser } from "./db";

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
        summary: `انتهى حجز الطلب ${o.number} ورجعت الكمية للمخزون`,
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
  if (actor.role === "shop" && actor.customer_id !== customer.id) fail(403, "FORBIDDEN", "لا تستطيع الطلب لمحل آخر", "You can't order for another shop");
  if (!customer.active) fail(409, "BAD_STATE", "حساب هذا الزبون موقوف", "This customer is not active");

  const warehouseId = input.warehouse_id ?? db.warehouses[0].id;
  const lines = orderLines(db, customer.tier_id, input.lines);
  checkStock(db, warehouseId, lines, now);

  const total = lines.reduce((s, l) => s + l.total, 0);
  const overLimit = committedDebt(db, customer.id, now.toISOString()) + total > customer.debt_limit;
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
    status: overLimit ? "needs_approval" : "pending",
    lines,
    total,
    reserved_until: new Date(now.getTime() + db.settings.reservation_hours * 3_600_000).toISOString(),
    note: input.note?.trim() || undefined,
    created_at: now.toISOString(),
    created_by: person(actor),
  };
  db.orders.push(order);
  audit(db, actor, "create", "order", id, `طلب جديد ${order.number} لـ ${customer.name}`, `New order ${order.number} for ${customer.name}`, now);

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
  audit(db, actor, "approve", "order", o.id, `موافقة على تجاوز سقف الدين للطلب ${o.number}`, `Approved over-limit order ${o.number}`, now);
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
    paid: 0,
    returned: 0,
    cost,
    created_by: person(actor),
  };
  db.invoices.push(inv);
  o.status = "confirmed";
  o.invoice_id = invId;
  o.reserved_until = undefined;
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
  const shopUser = db.users.find((u) => u.role === "shop" && u.customer_id === o.customer_id);
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
    reversed: false,
  };
  db.payments.push(p);
  audit(db, actor, "create", "payment", id, `تسديد ${p.number} من ${customer.name}: ${input.amount.toLocaleString("en")} د.ع`, `Payment ${p.number} from ${customer.name}: ${input.amount.toLocaleString("en")} IQD`, now);
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
      lineAmount += Math.round((sl.total / sl.pieces) * take);
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
function invoiceRate(db: Db, inv: DbInvoice) {
  if (!inv.total) return 0;
  const weighted = inv.lines.reduce((s, l) => s + l.total * (itemOf(db, l.item_id).commission_percent / 100), 0);
  return weighted / inv.total;
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
