// The business rules of Al-Nahrain, written once. The fake backend (mock.ts) and the demo data (seed.ts)
// both use these functions, so the demo history follows the same rules as live use.
// The real backend must do the same things (see the client's requirements).
import { currentLocale } from "../../boot";
import { ApiError, type ErrorCode } from "../errors";
import { DISCOUNT_MAX, STAFF_DISCOUNT_MAX, workWarehouses, worksIn, type ShipmentLoad, type Vehicle } from "../types";
import { linesWeight } from "../vehicles";
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
  NewSupplyOrder,
  SupplyOrder,
  CreditNote,
  Refund,
  ShopAddress,
  PrepLine,
  BatchTrace,
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
  (o.status === "approved" && !o.shipments?.length) || ((o.status === "pending" || o.status === "needs_approval") && !!o.reserved_until && o.reserved_until > nowIso);

/** Pieces held by orders that are not confirmed yet. */
export function reservedQty(db: Db, itemId: number, warehouseId: number | undefined, nowIso: string, exceptOrderId?: number) {
  let n = 0;
  for (const o of db.orders) {
    if (o.id === exceptOrderId || !holdsStock(o, nowIso)) continue;
    for (const l of o.lines) {
      if (warehouseId && (l.warehouse_id ?? o.warehouse_id) !== warehouseId) continue;
      if (l.item_id === itemId) n += piecesOf(itemOf(db, l.item_id), l.unit, l.qty);
    }
  }
  return n;
}

export function sellableQty(db: Db, itemId: number, warehouseId: number | undefined, now: Date, exceptOrderId?: number) {
  const today = dayOf(now);
  let free = physicalQty(db, itemId, warehouseId, today) - reservedQty(db, itemId, warehouseId, now.toISOString(), exceptOrderId);
  // Held batches (a problem) aren't sold anywhere.
  free -= db.batches.filter((b) => b.held && b.item_id === itemId && (!warehouseId || b.warehouse_id === warehouseId) && b.qty_left > 0 && b.expiry_date >= today).reduce((s, b) => s + b.qty_left, 0);
  // An item being counted isn't sold from that warehouse until its count ends.
  for (const w of db.warehouses) {
    if (warehouseId && w.id !== warehouseId) continue;
    if (countLocked(db, itemId, w.id)) free -= Math.max(0, physicalQty(db, itemId, w.id, today) - db.batches.filter((b) => b.held && b.item_id === itemId && b.warehouse_id === w.id && b.qty_left > 0 && b.expiry_date >= today).reduce((s, b) => s + b.qty_left, 0));
  }
  return Math.max(0, free);
}

/** Is this item in an open stocktake of this warehouse? (Then it isn't sold from there for now.) */
export function countLocked(db: Db, itemId: number, warehouseId: number) {
  return db.stocktakes.some((s) => s.status === "open" && s.warehouse_id === warehouseId && s.lines.some((l) => l.item_id === itemId));
}

/** Batches to sell from, nearest expiry first (FEFO). Expired batches are skipped. */
function fefoBatches(db: Db, itemId: number, warehouseId: number, today: string) {
  return db.batches
    .filter((b) => b.item_id === itemId && b.warehouse_id === warehouseId && b.qty_left > 0 && b.expiry_date >= today && !b.held)
    .sort((a, b) => a.expiry_date.localeCompare(b.expiry_date) || a.id - b.id);
}

/** Take pieces from the batches, oldest expiry first. Returns which batches were used. */
function takeFefo(db: Db, itemId: number, warehouseId: number, pieces: number, today: string): DbBatchUse[] {
  if (countLocked(db, itemId, warehouseId)) {
    const item = itemOf(db, itemId);
    fail(409, "OUT_OF_STOCK", `${item.name} قيد الجرد في هذا المخزن: يُباع بعد انتهاء الجرد`, `${item.name_en} is being counted in this warehouse`);
  }
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

export function invoiceRemaining(inv: Pick<DbInvoice, "total" | "paid" | "returned"> & { credited?: number }) {
  return inv.total - inv.paid - inv.returned - (inv.credited ?? 0);
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
  // Money given back to the shop uses up its credit.
  for (const r of db.refunds ?? []) if (r.customer_id === customerId) b += r.amount;
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
  if (actor.role === "warehouse" && !worksIn(actor, input.warehouse_id)) {
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
    ...(input.supply_order_id ? { supply_order_id: input.supply_order_id } : {}),
    warehouse_id: input.warehouse_id,
    supplier: input.supplier.trim(),
    lines,
    total_cost: lines.reduce((s, l) => s + l.pieces * l.purchase_price, 0),
    created_at: now.toISOString(),
    created_by: person(actor),
  };
  db.receipts.push(receipt);
  for (const l of lines) checkLowStock(db, l.item_id, now);
  if (input.supply_order_id) receiveSupply(db, actor, input.supply_order_id, receipt, now);
  audit(db, actor, "create", "receipt", id, `استلام بضاعة ${receipt.number} (${lines.length} مواد)`, `Received goods ${receipt.number} (${lines.length} items)`, now);
  return receipt;
}

// ---------- orders ----------

/** The price of an item for a shop: its own special price first, then its tier, then the general (first) price.
 *  at: the moment the order was recorded (an offline order keeps the price of the moment it was written). */
export function shopPrice(db: Db, customerId: number, tierId: number, itemId: number, unit: Unit, at?: string) {
  const sp = (db.special_prices ?? []).find((x) => x.customer_id === customerId && x.item_id === itemId);
  if (sp) return unit === "carton" ? sp.carton_price : sp.piece_price;
  const item = itemOf(db, itemId);
  if (at) {
    // The tier price that was in force then (the first change after that moment holds the old price).
    const tid = item.prices.some((p) => p.tier_id === tierId) ? tierId : item.prices[0]?.tier_id;
    const old = (db.price_changes ?? []).filter((c) => c.item_id === itemId && c.tier_id === tid && c.until > at).sort((a, b) => a.until.localeCompare(b.until))[0];
    if (old) return unit === "carton" ? old.carton_price : old.piece_price;
  }
  return priceFor(item, tierId, unit);
}

function orderLines(db: Db, tierId: number, lines: NewOrder["lines"], customerId?: number, at?: string) {
  const errors: Record<string, string> = {};
  if (!lines.length) errors["lines"] = msg("أضف مادة واحدة على الأقل", "Add at least one item");
  const out = lines.map((l, i) => {
    const item = itemOf(db, l.item_id);
    if (!item.active) errors[`lines.${i}.item_id`] = msg("هذه المادة موقوفة", "This item is not active");
    if (!(l.qty > 0) || !Number.isInteger(l.qty)) errors[`lines.${i}.qty`] = msg("الكمية يجب أن تكون عدداً صحيحاً", "Quantity must be a whole number");
    const unit_price = customerId ? shopPrice(db, customerId, tierId, l.item_id, l.unit, at) : priceFor(item, tierId, l.unit);
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
  // A rep sells only the categories the manager gave him.
  if (actor.role === "rep" && actor.rep_categories?.length) {
    const outside = input.lines.map((l) => itemOf(db, l.item_id)).filter((it) => !actor.rep_categories!.includes(it.category));
    if (outside.length) fail(403, "FORBIDDEN", `خارج أصنافك: ${outside.map((i) => i.name).join("، ")}`, `Outside your categories: ${outside.map((i) => i.name_en).join(", ")}`);
  }
  if (actor.role === "shop" && actor.customer_id !== customer.id) fail(403, "FORBIDDEN", "لا تستطيع الطلب لمحل آخر", "You can't order for another shop");
  if (!customer.active) {
    if (customer.pending) fail(409, "BAD_STATE", "الحساب بانتظار موافقة الشركة، ويمكنك الطلب بعد الموافقة", "This account is waiting for approval. You can order after it is approved");
    fail(409, "BAD_STATE", "حساب هذا الزبون موقوف", "This customer is not active");
  }

  const warehouseId = input.warehouse_id ?? db.warehouses[0].id;
  // The price is fixed when the order is recorded (offline: the moment on the rep's phone, at most 3 days back).
  const recordedAt = input.recorded_at && input.recorded_at < now.toISOString() && input.recorded_at > new Date(now.getTime() - 3 * 86_400_000).toISOString() ? input.recorded_at : undefined;
  let lines = orderLines(db, customer.tier_id, input.lines, customer.id, recordedAt);
  // Written offline: we never sell more than is there. What is there goes ahead; the rest waits for the goods.
  let waiting: typeof lines = [];
  if (input.offline) {
    const left = new Map<number, number>();
    const ok: typeof lines = [];
    for (const l of lines) {
      const item = itemOf(db, l.item_id);
      const free = left.get(l.item_id) ?? sellableQty(db, l.item_id, warehouseId, now);
      const per = l.unit === "carton" ? item.pieces_per_carton : 1;
      const can = Math.min(l.qty, Math.floor(free / per));
      left.set(l.item_id, free - can * per);
      if (can > 0) ok.push({ ...l, qty: can, total: can * l.unit_price });
      if (can < l.qty) waiting.push({ ...l, qty: l.qty - can, total: (l.qty - can) * l.unit_price });
    }
    lines = ok;
    if (!lines.length) {
      // Nothing is there: the whole order waits for the goods.
      lines = waiting;
      waiting = [];
      return waitingOrder(db, actor, input, customer, warehouseId, lines, now, null);
    }
  } else {
    checkStock(db, warehouseId, lines, now);
  }

  const subtotal = lines.reduce((s, l) => s + l.total, 0);
  const discount = makeDiscount(actor, subtotal, input.discount_percent ?? 0, now);
  const [total, rounding] = roundTotal(subtotal - (discount?.amount ?? 0));
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
    ...(rounding ? { rounding } : {}),
    ...(approval_for.length ? { approval_for: [...approval_for] } : {}),
    reserved_until: new Date(now.getTime() + db.settings.reservation_hours * 3_600_000).toISOString(),
    note: input.note?.trim() || undefined,
    created_at: now.toISOString(),
    created_by: person(actor),
  };
  db.orders.push(order);
  audit(db, actor, "create", "order", id, `طلب جديد ${order.number} لـ ${customer.name}`, `New order ${order.number} for ${customer.name}`, now);

  if (discount) {
    audit(db, actor, "update", "order", id, `خصم ${discount.percent}% (${discount.amount.toLocaleString("en")} د.ع) على ${order.number} أعطاه ${actor.name}`, `${discount.percent}% discount on ${order.number} by ${actor.name}`, now);
  }
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
  if (waiting.length) waitingOrder(db, actor, { ...input, client_ref: `${input.client_ref}-rest` }, customer, warehouseId, waiting, now, order);
  // Every order (rep or shop) waits for the accountant or the manager to approve it.
  if (order.status === "pending") {
    notify(
      db,
      { type: "order_review", roles: ["accountant"], title: `طلب بانتظار الاعتماد: ${customer.name}`, title_en: `Order to approve: ${customer.name}`, body: `${order.number} · ${order.total.toLocaleString("en")} د.ع`, body_en: `${order.number}`, link: `/orders/${id}` },
      now,
    );
  }
  // Over the debt limit: the shop is told it is being reviewed (not refused).
  if (overLimit) {
    const owner = shopOwnerOf(db, customer.id);
    if (owner) {
      notify(
        db,
        { type: "order_review", roles: ["shop"], user_id: owner.id, title: `طلبك ${order.number} قيد المراجعة`, title_en: `Your order ${order.number} is being reviewed`, body: "تجاوز سقف دينك، وتراجعه الإدارة. الكمية محجوزة لك حتى ذلك الحين.", body_en: "It passes your debt limit; the company is reviewing it. The goods are held for you.", link: `/orders/${id}` },
        now,
      );
    }
  }
  return order;
}

/** An order (or the rest of one) written offline whose goods weren't there when it synced. It holds nothing;
 *  the accountant / manager approves it when the goods come (the stock is checked again then). */
function waitingOrder(db: Db, actor: DbUser, input: NewOrder, customer: DbCustomer, warehouseId: number, lines: Order["lines"], now: Date, parent: Order | null): Order {
  const id = nextId(db, "order");
  const subtotal = lines.reduce((s, l) => s + l.total, 0);
  const o: Order = {
    id,
    number: `ORD-${pad(id)}`,
    client_ref: input.client_ref,
    customer_id: customer.id,
    rep_id: customer.rep_id,
    warehouse_id: warehouseId,
    source: actor.role === "shop" ? "shop" : actor.role === "rep" ? "rep" : "office",
    status: "expired",
    waiting_stock: true,
    lines,
    total: subtotal,
    note: parent ? `باقي الطلب المبدئي ${parent.number}: بانتظار توفر البضاعة` : "طلب مبدئي: البضاعة غير متوفرة عند المزامنة",
    ...(parent ? { parent_id: parent.id } : {}),
    created_at: now.toISOString(),
    created_by: person(actor),
  };
  setTotal(o, subtotal);
  db.orders.push(o);
  const names = lines.map((l) => itemOf(db, l.item_id).name).join("، ");
  audit(db, actor, "create", "order", id, `${o.number} بانتظار توفر البضاعة: ${names}`, `${o.number} waits for stock`, now);
  notify(
    db,
    {
      type: "low_stock",
      roles: ["rep"],
      user_id: customer.rep_id,
      title: parent ? `نقصت كمية طلبك المبدئي ${parent.number}` : `طلبك المبدئي لـ ${customer.name} بانتظار البضاعة`,
      title_en: parent ? `Your offline order ${parent.number} was short` : `Your offline order for ${customer.name} waits for stock`,
      body: `غير متوفر عند المزامنة: ${names}. بقي معلّقاً في ${o.number}.`,
      body_en: `Not in stock when it synced. It waits in ${o.number}.`,
      link: `/orders/${id}`,
    },
    now,
  );
  return o;
}

export function approveOrder(db: Db, actor: DbUser, id: number, now: Date): Order {
  need(actor, ["manager"]);
  const o = db.orders.find((x) => x.id === id) ?? fail(404, "NOT_FOUND", "الطلب غير موجود", "Order not found");
  if (o.status !== "needs_approval") fail(409, "BAD_STATE", "هذا الطلب لا يحتاج موافقة", "This order doesn't need approval");
  checkStock(db, o.warehouse_id, o.lines, now, o.id);
  // His OK is for this order only (the shop's limit stays the same), and it approves the order too.
  o.status = "approved";
  o.approved_by = person(actor);
  o.accepted_by = person(actor);
  o.accepted_at = now.toISOString();
  o.reserved_until = undefined;
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

// ---------- special prices ----------

export function setSpecialPrice(db: Db, actor: DbUser, customerId: number, itemId: number, prices: { carton_price: number; piece_price: number } | null, now: Date) {
  need(actor, ["manager"]);
  const c = db.customers.find((x) => x.id === customerId) ?? fail(404, "NOT_FOUND", "الزبون غير موجود", "Customer not found");
  const item = itemOf(db, itemId);
  db.special_prices ??= [];
  db.special_prices = db.special_prices.filter((x) => !(x.customer_id === customerId && x.item_id === itemId));
  if (prices) {
    if (!(prices.carton_price > 0) || !(prices.piece_price > 0)) fail(422, "VALIDATION", "اكتب سعر الكارتون والقطعة", "Enter the carton and piece prices");
    db.special_prices.push({ customer_id: customerId, item_id: itemId, carton_price: Math.round(prices.carton_price), piece_price: Math.round(prices.piece_price), by: person(actor), at: now.toISOString() });
    audit(db, actor, "price_change", "customer", customerId, `سعر خاص لـ ${c.name}: ${item.name} ${prices.carton_price.toLocaleString("en")}/${prices.piece_price.toLocaleString("en")}`, `Special price for ${c.name}: ${item.name_en}`, now);
  } else {
    audit(db, actor, "price_change", "customer", customerId, `إلغاء السعر الخاص لـ ${c.name}: ${item.name}`, `Removed special price for ${c.name}: ${item.name_en}`, now);
  }
  return db.special_prices.filter((x) => x.customer_id === customerId);
}

// ---------- a batch with a problem ----------

/** Stop selling what is left of a batch, in every warehouse, at once. */
export function holdBatch(db: Db, actor: DbUser, batchId: number, reason: string, now: Date) {
  need(actor, ["manager", "warehouse"]);
  const b = db.batches.find((x) => x.id === batchId) ?? fail(404, "NOT_FOUND", "الدفعة غير موجودة", "Batch not found");
  if (actor.role === "warehouse" && !worksIn(actor, b.warehouse_id)) fail(403, "FORBIDDEN", "هذه الدفعة في مخزن آخر: يوقفها أمينه أو المدير", "This batch is in another warehouse");
  if (!reason.trim()) fail(422, "VALIDATION", "اكتب سبب الإيقاف", "Write the reason", { reason: msg("السبب مطلوب", "Required") });
  const item = itemOf(db, b.item_id);
  // The same batch number may sit in both warehouses (a transfer splits it): stop every part of it.
  const same = db.batches.filter((x) => x.id === b.id || (x.item_id === b.item_id && x.expiry_date === b.expiry_date && x.receipt_id && x.receipt_id === b.receipt_id));
  for (const x of same) x.held = { reason: reason.trim(), at: now.toISOString(), by: person(actor) };
  audit(db, actor, "update", "batch", b.id, `إيقاف بيع الدفعة #${b.id} (${item.name}): ${reason.trim()}`, `Stopped selling batch #${b.id}: ${reason.trim()}`, now);
  notify(db, { type: "expired", roles: ["manager", "warehouse"], title: `أُوقف بيع دفعة: ${item.name} #${b.id}`, title_en: `Batch stopped: ${item.name_en} #${b.id}`, body: reason.trim(), body_en: reason.trim(), link: `/items/${item.id}` }, now);
  return b;
}

export function releaseBatch(db: Db, actor: DbUser, batchId: number, now: Date) {
  need(actor, ["manager"]);
  const b = db.batches.find((x) => x.id === batchId) ?? fail(404, "NOT_FOUND", "الدفعة غير موجودة", "Batch not found");
  for (const x of db.batches.filter((x) => x.held && (x.id === b.id || (x.item_id === b.item_id && x.expiry_date === b.expiry_date && x.receipt_id === b.receipt_id)))) delete x.held;
  audit(db, actor, "update", "batch", b.id, `إعادة بيع الدفعة #${b.id}`, `Batch #${b.id} back on sale`, now);
  return b;
}

/** Which shops got pieces of this batch (from the invoices), how many, and how many came back. */
export function traceBatch(db: Db, actor: DbUser, batchId: number) {
  need(actor, ["manager", "warehouse", "accountant"]);
  const b = db.batches.find((x) => x.id === batchId) ?? fail(404, "NOT_FOUND", "الدفعة غير موجودة", "Batch not found");
  if (actor.role === "warehouse" && !worksIn(actor, b.warehouse_id)) fail(403, "FORBIDDEN", "هذه الدفعة في مخزن آخر", "This batch is in another warehouse");
  const ids = new Set(db.batches.filter((x) => x.id === b.id || (x.item_id === b.item_id && x.expiry_date === b.expiry_date && x.receipt_id && x.receipt_id === b.receipt_id)).map((x) => x.id));
  const out: BatchTrace[] = [];
  for (const inv of db.invoices) {
    for (const l of inv.lines) {
      for (const u of l.batches) {
        if (!ids.has(u.batch_id)) continue;
        const c = db.customers.find((x) => x.id === inv.customer_id);
        out.push({ customer_id: inv.customer_id, customer: c?.name ?? "", phone: c?.phone ?? "", invoice_id: inv.id, invoice_number: inv.number, date: inv.date, pieces: u.qty, returned: u.returned });
      }
    }
  }
  return out.sort((x, y) => y.date.localeCompare(x.date));
}

// ---------- rounding ----------
// The total of an order (and its invoice) is rounded to the nearest 250 IQD, the smallest note in use.

export function roundTotal(raw: number): [number, number] {
  const total = Math.round(raw / 250) * 250;
  return [total, total - raw];
}
function setTotal(o: Order, raw: number) {
  const [total, rounding] = roundTotal(raw);
  o.total = total;
  if (rounding) o.rounding = rounding;
  else delete o.rounding;
}

// ---------- discounts ----------
// The delivery rep (his own shops) and the warehouse keeper (his warehouse's orders) give up to 3% by themselves.
// More than that, the order waits for the manager. The manager gives any discount up to 30% with no approval.

function makeDiscount(actor: DbUser, subtotal: number, percent: number, now: Date): Order["discount"] {
  const p = Math.round((Number(percent) || 0) * 10) / 10;
  if (p === 0) return undefined;
  if (!["manager", "rep", "accountant"].includes(actor.role)) fail(403, "FORBIDDEN", "لا تستطيع إعطاء خصم", "You can't give a discount");
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
  const customer = db.customers.find((c) => c.id === o.customer_id)!;
  const lines = orderLines(db, customer.tier_id, wanted, customer.id);
  // Its own held stock doesn't count against it.
  checkStock(db, o.warehouse_id, lines, now, o.id);
  const subtotal = lines.reduce((s, l) => s + l.total, 0);
  o.lines = lines;
  if (o.discount) {
    // Same percent on the new lines (and the same approval state).
    o.discount = { ...o.discount, amount: Math.round((subtotal * o.discount.percent) / 100) };
    o.subtotal = subtotal;
  }
  setTotal(o, subtotal - (o.discount?.amount ?? 0));
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
  need(actor, ["manager", "rep", "accountant"]);
  const o = db.orders.find((x) => x.id === id) ?? fail(404, "NOT_FOUND", "الطلب غير موجود", "Order not found");
  if (o.status !== "pending" && o.status !== "needs_approval") fail(409, "BAD_STATE", "لا يتغير خصم طلب مثبّت", "A confirmed order's discount can't change");
  if (actor.role === "rep" && o.rep_id !== actor.id) fail(403, "FORBIDDEN", "هذا الطلب ليس لأحد زبائنك", "This order isn't for one of your shops");
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
  setTotal(o, subtotal - (discount?.amount ?? 0));
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
  audit(db, actor, "update", "order", o.id, discount ? `خصم ${discount.percent}% (${discount.amount.toLocaleString("en")} د.ع) على ${o.number} أعطاه ${actor.name}` : `إلغاء خصم ${o.number}`, discount ? `${discount.percent}% discount on ${o.number}` : `Removed the discount of ${o.number}`, now);
  if (discount?.needs_approval) notifyDiscount(db, o, customer.name, now);
  return o;
}

export function cancelOrder(db: Db, actor: DbUser, id: number, reason: string, now: Date): Order {
  const o = db.orders.find((x) => x.id === id) ?? fail(404, "NOT_FOUND", "الطلب غير موجود", "Order not found");
  const own = o.created_by.id === actor.id;
  const notDelivered = o.status === "pending" || o.status === "needs_approval" || o.status === "approved" || o.status === "expired";
  if (!(actor.role === "manager" || actor.role === "accountant" || (own && (o.status === "pending" || o.status === "needs_approval")))) {
    fail(403, "FORBIDDEN", "لا تستطيع إلغاء هذا الطلب", "You can't cancel this order");
  }
  if (!notDelivered) fail(409, "BAD_STATE", "سُلِّم هذا الطلب: ما يعود منه يُسجَّل مرتجعاً", "This order was delivered: what comes back is a return");
  if (o.delivery?.status === "out" && actor.role !== "manager") fail(409, "BAD_STATE", "الشحنة في الطريق: يلغيها المدير فقط", "The shipment is on the way: only the manager can cancel it");
  const wasWaiting = o.status === "needs_approval";
  if (!reason.trim()) fail(422, "VALIDATION", "اكتب سبب الإلغاء", "Write the reason", { reason: msg("السبب مطلوب", "Reason is required") });
  o.status = "cancelled";
  o.cancel_reason = reason.trim();
  // Before delivery nothing was owed: the held goods simply go back to the stock.
  delete o.delivery;
  // A big order on several vehicles: its shipments not delivered yet are cancelled with it (the delivered ones stay).
  if (o.shipments?.length) {
    let delivered = false;
    for (const sid of o.shipments) {
      const part = db.orders.find((x) => x.id === sid);
      if (!part) continue;
      if (part.status === "confirmed") delivered = true;
      else if (part.status !== "cancelled") {
        part.status = "cancelled";
        part.cancel_reason = o.cancel_reason;
        delete part.delivery;
      }
    }
    if (delivered) o.status = "confirmed";
  }
  syncShipments(db, o);
  audit(db, actor, "cancel", "order", o.id, `${wasWaiting && actor.role === "manager" ? "رفض" : "إلغاء"} الطلب ${o.number}: ${o.cancel_reason}`, `Cancelled ${o.number}: ${o.cancel_reason}`, now);
  const owner = shopOwnerOf(db, o.customer_id);
  const n = {
    type: "order_rejected" as const,
    title: wasWaiting ? `رُفض الطلب ${o.number}` : `أُلغي الطلب ${o.number}`,
    title_en: wasWaiting ? `Order ${o.number} was refused` : `Order ${o.number} was cancelled`,
    body: o.cancel_reason,
    body_en: o.cancel_reason,
    link: `/orders/${o.id}`,
  };
  if (owner && actor.id !== owner.id) notify(db, { ...n, roles: ["shop"], user_id: owner.id }, now);
  if (actor.id !== o.rep_id) notify(db, { ...n, roles: ["rep"], user_id: o.rep_id }, now);
  return o;
}

// ---------- the order's way: approve → prepare → deliver (invoice at delivery) ----------

/** The accountant or the manager approves the order (the rep alone can't). It stays held until delivered. */
export function acceptOrder(db: Db, actor: DbUser, id: number, now: Date): Order {
  need(actor, ["accountant", "manager"]);
  const o = db.orders.find((x) => x.id === id) ?? fail(404, "NOT_FOUND", "الطلب غير موجود", "Order not found");
  if (o.status === "needs_approval") fail(409, "BAD_STATE", "الطلب يحتاج موافقة المدير أولاً", "The manager must OK this order first");
  if (o.status !== "pending" && o.status !== "expired") fail(409, "BAD_STATE", "الطلب ليس بانتظار الاعتماد", "This order isn't waiting for approval");
  // An expired hold is checked again: the stock may be gone now.
  checkStock(db, o.warehouse_id, o.lines, now, o.id);
  o.status = "approved";
  o.accepted_by = person(actor);
  o.accepted_at = now.toISOString();
  o.reserved_until = undefined;
  delete o.waiting_stock;
  audit(db, actor, "approve", "order", o.id, `اعتماد الطلب ${o.number}`, `Approved ${o.number}`, now);
  const customer = db.customers.find((c) => c.id === o.customer_id);
  notify(db, { type: "order_accepted", roles: ["warehouse"], title: `طلب معتمد للتجهيز: ${customer?.name ?? ""}`, title_en: `Approved order to prepare: ${customer?.name ?? ""}`, body: o.number, body_en: o.number, link: `/orders/${o.id}` }, now);
  const owner = shopOwnerOf(db, o.customer_id);
  if (owner) notify(db, { type: "order_accepted", roles: ["shop"], user_id: owner.id, title: `اعتُمد طلبك ${o.number}`, title_en: `Your order ${o.number} is approved`, body: "يُجهَّز الآن، وتصدر الفاتورة عند التسليم.", body_en: "It is being prepared; the invoice is made on delivery.", link: `/orders/${o.id}` }, now);
  if (actor.id !== o.rep_id) notify(db, { type: "order_accepted", roles: ["rep"], user_id: o.rep_id, title: `اعتُمد ${o.number}`, title_en: `${o.number} approved`, body: customer?.name ?? "", body_en: customer?.name ?? "", link: `/orders/${o.id}` }, now);
  return o;
}

/** For the keeper: each line, the free stock in each warehouse, and the suggested one (oldest expiry first). */
export function prepPlan(db: Db, actor: DbUser, id: number, now: Date): PrepLine[] {
  need(actor, ["warehouse", "manager"]);
  const o = db.orders.find((x) => x.id === id) ?? fail(404, "NOT_FOUND", "الطلب غير موجود", "Order not found");
  if (actor.role === "warehouse" && !worksIn(actor, o.warehouse_id) && !o.prep_parts?.some((p) => worksIn(actor, p.warehouse_id))) {
    fail(403, "FORBIDDEN", "هذا الطلب من مخزن آخر", "This order is for another warehouse");
  }
  const today = dayOf(now);
  return o.lines.map((l) => {
    const pieces = piecesOf(itemOf(db, l.item_id), l.unit, l.qty);
    const free = db.warehouses.map((w) => {
      const live = db.batches.filter((b) => b.item_id === l.item_id && b.warehouse_id === w.id && b.qty_left > 0 && b.expiry_date >= today && !b.held);
      return { warehouse_id: w.id, pieces: sellableQty(db, l.item_id, w.id, now, o.id), nearest_expiry: live.map((b) => b.expiry_date).sort()[0] };
    });
    const ok = free.filter((f) => f.pieces >= pieces && f.nearest_expiry).sort((a, b) => a.nearest_expiry!.localeCompare(b.nearest_expiry!));
    return { item_id: l.item_id, unit: l.unit, qty: l.qty, suggested_warehouse_id: ok[0]?.warehouse_id ?? null, free };
  });
}

/** Preparing an approved order.
 *  First time (the keeper of the order's warehouse, or the manager): he decides the warehouse of each line
 *  (one order can come from both) and his own part is prepared.
 *  A part in the other warehouse is prepared by THAT warehouse's keeper only (later call, warehouses ignored).
 *  When every part is ready, the shipment label (QR) and the shop's PIN are made. Nothing is invoiced yet. */
export function prepareOrder(db: Db, actor: DbUser, id: number, warehouses: Record<number, number>, now: Date): Order {
  need(actor, ["warehouse", "manager"]);
  const o = db.orders.find((x) => x.id === id) ?? fail(404, "NOT_FOUND", "الطلب غير موجود", "Order not found");
  if (o.status !== "approved") fail(409, "BAD_STATE", o.status === "pending" ? "الطلب لم يُعتمد بعد: يعتمده المحاسب أو المدير" : "الطلب ليس معتمداً للتجهيز", "The order isn't approved for preparing");
  if (o.delivery) fail(409, "BAD_STATE", "جُهّز هذا الطلب من قبل", "This order is already prepared");
  // The warehouses this keeper works in now: his own, and one he covers for an absent keeper.
  const keeperWhs = actor.role === "warehouse" ? workWarehouses(actor) : undefined;
  const whName = (wid: number) => db.warehouses.find((w) => w.id === wid)?.name ?? "";

  let decided = false;
  if (!o.prep_parts) {
    decided = true;
    // Deciding where each line comes from: the keeper of the order's own warehouse (or the manager).
    if (keeperWhs && !keeperWhs.includes(o.warehouse_id)) fail(403, "FORBIDDEN", "يجهّز هذا الطلب أمين مخزنه", "The keeper of this order's warehouse prepares it");
    const ids = new Set(db.warehouses.map((w) => w.id));
    const next = o.lines.map((l) => ({ ...l, warehouse_id: ids.has(warehouses?.[l.item_id]) ? warehouses[l.item_id] : (l.warehouse_id ?? o.warehouse_id) }));
    // Enough free stock in each chosen warehouse (its own hold doesn't count against it).
    for (const w of db.warehouses) {
      const mine = next.filter((l) => l.warehouse_id === w.id);
      if (mine.length) checkStock(db, w.id, mine, now, o.id);
    }
    o.lines = next;
    const used = [...new Set(next.map((l) => l.warehouse_id!))];
    o.prep_parts = used.map((wid) => ({ warehouse_id: wid }));
  }

  // Which parts this person prepares now: a keeper only his own warehouse's part; the manager every open part.
  const mine = o.prep_parts.filter((p) => !p.prepared_by && (!keeperWhs || keeperWhs.includes(p.warehouse_id)));
  // He put every line on the other warehouse: his decision is saved, and that keeper prepares it.
  if (!mine.length && decided) {
    audit(db, actor, "update", "order", o.id, `${o.number} يُجهَّز من ${o.prep_parts.map((p) => whName(p.warehouse_id)).join(" + ")}`, `${o.number} goes to the other warehouse`, now);
    notify(db, { type: "order_accepted", roles: ["warehouse"], title: `${o.number} ينتظر تجهيزك`, title_en: `${o.number} waits for you`, body: `من ${o.prep_parts.map((p) => whName(p.warehouse_id)).join(" + ")}`, body_en: o.number, link: `/orders/${o.id}` }, now);
    return o;
  }
  if (!mine.length) fail(403, "FORBIDDEN", keeperWhs ? "لا يوجد جزء من هذا الطلب في مخزنك ينتظر التجهيز" : "جُهّزت كل الأجزاء", "Nothing of this order waits in your warehouse");
  for (const p of mine) Object.assign(p, { prepared_by: person(actor), at: now.toISOString() });
  audit(db, actor, "update", "order", o.id, `تجهيز ${o.number} من ${mine.map((p) => whName(p.warehouse_id)).join(" + ")}`, `Prepared ${o.number}`, now);

  const waiting = o.prep_parts.filter((p) => !p.prepared_by);
  if (waiting.length) {
    // The other warehouse's keeper is told: his part waits for him.
    notify(db, { type: "order_accepted", roles: ["warehouse"], title: `جزء من ${o.number} ينتظر تجهيزك`, title_en: `Part of ${o.number} waits for you`, body: `من ${waiting.map((p) => whName(p.warehouse_id)).join(" + ")}`, body_en: o.number, link: `/orders/${o.id}` }, now);
    return o;
  }
  // Every part is ready: the shipment label, the PIN, and the delivery rep.
  o.delivery = newDelivery();
  const carrier = deliveryRepFor(db, o.rep_id);
  if (carrier) o.delivery.rep = person(carrier);
  // The vehicle of that delivery rep carries it. Too heavy for it: the warehouse and the manager are told,
  // and the order page suggests how to split it across vehicles (it stays one order for the shop).
  const vehicle = vehiclesOf(db).find((v) => v.active && v.driver_id === carrier?.id);
  if (vehicle) o.delivery.vehicle = { id: vehicle.id, name: vehicle.name };
  const kg = linesWeight(o.lines, (id) => db.items.find((i) => i.id === id));
  if (vehicle && kg > vehicle.capacity_kg) {
    const n = {
      type: "order_accepted" as const,
      title: `${o.number} أثقل من حمولة ${vehicle.name}`,
      title_en: `${o.number} is heavier than ${vehicle.name}'s load`,
      body: `${Math.round(kg)} كغم والحمولة ${vehicle.capacity_kg} كغم: وزّعه على أكثر من سيارة من صفحة الطلب.`,
      body_en: `${Math.round(kg)} kg for a ${vehicle.capacity_kg} kg load: split it across vehicles from the order page.`,
      link: `/orders/${o.id}`,
    };
    notify(db, { ...n, roles: ["warehouse"] }, now);
    notify(db, { ...n, roles: ["manager"] }, now);
  }
  return o;
}

// ---------- Vehicles: the load of each, and a big order on more than one ----------

/** The delivery vehicles (an older copy of the data has none yet: three default ones, one per delivery rep). */
export function vehiclesOf(db: Db): Vehicle[] {
  if (!db.vehicles) {
    const drivers = db.users.filter((u) => u.role === "rep" && (!u.rep_kinds?.length || u.rep_kinds.includes("delivery")));
    const kinds: [string, string, number][] = [
      ["كيا بونكو 1", "12345 كربلاء", 1500],
      ["كيا بونكو 2", "23456 كربلاء", 1500],
      ["إيسوزو 4 طن", "34567 كربلاء", 4000],
    ];
    db.vehicles = kinds.map(([name, plate, capacity_kg], i) => ({ id: i + 1, name, plate, capacity_kg, driver_id: drivers[i]?.id, active: true }));
  }
  return db.vehicles;
}

/**
 * Put a prepared order on vehicles (before it is loaded).
 * - One load: that vehicle (and its driver) carries the whole order.
 * - More: the order becomes one shipment per vehicle, each an order of its own (`shipment_of`) with its own label,
 *   PIN, delivery rep and, at delivery, its own invoice. The shop keeps seeing this one order.
 * Every load must fit its vehicle's maximum load, and together they carry exactly the order.
 */
export function planShipments(db: Db, actor: DbUser, id: number, loads: ShipmentLoad[], now: Date): Order {
  need(actor, ["manager", "warehouse", "staff"]);
  const o = db.orders.find((x) => x.id === id) ?? fail(404, "NOT_FOUND", "الطلب غير موجود", "Order not found");
  if ((actor.role === "warehouse" || actor.role === "staff") && !worksIn(actor, o.warehouse_id)) fail(403, "FORBIDDEN", "هذا الطلب من مخزن آخر", "This order is from another warehouse");
  const d = o.delivery;
  if (!d || d.status !== "ready") fail(409, "BAD_STATE", "يُوزَّع الطلب على السيارات بعد تجهيزه وقبل خروجه", "An order is put on vehicles after it is prepared and before it leaves");
  if (d.loaded_at) fail(409, "BAD_STATE", "حُمّلت الشحنة من قبل: لا يمكن توزيعها الآن", "The shipment is already loaded");
  const vehicles = vehiclesOf(db);
  const itemOf = (iid: number) => db.items.find((i) => i.id === iid);
  const clean = loads.map((l) => ({ vehicle_id: l.vehicle_id, lines: l.lines.filter((x) => x.qty > 0) })).filter((l) => l.lines.length);
  if (!clean.length) fail(422, "VALIDATION", "ضع الطلب على سيارة واحدة على الأقل", "Put the order on one vehicle at least");
  if (new Set(clean.map((l) => l.vehicle_id)).size !== clean.length) fail(422, "VALIDATION", "سيارة مكررة: اجمع حمولتها في سطر واحد", "A vehicle twice: put its load in one place");
  // Together the loads carry exactly the order: every line, all of it.
  for (const l of o.lines) {
    const put = clean.reduce((s, x) => s + x.lines.filter((y) => y.item_id === l.item_id && y.unit === l.unit).reduce((a, y) => a + y.qty, 0), 0);
    if (put !== l.qty) fail(422, "VALIDATION", `${itemOf(l.item_id)?.name ?? ""}: وُزّع ${put} من ${l.qty}`, `${itemOf(l.item_id)?.name_en ?? ""}: ${put} of ${l.qty} placed`);
  }
  for (const x of clean) for (const y of x.lines) if (!o.lines.some((l) => l.item_id === y.item_id && l.unit === y.unit)) fail(422, "VALIDATION", "مادة ليست في الطلب", "An item that isn't in the order");
  // Each load fits its vehicle (its maximum load set by the manager).
  for (const x of clean) {
    const v = vehicles.find((y) => y.id === x.vehicle_id && y.active) ?? fail(422, "VALIDATION", "سيارة غير موجودة أو موقوفة", "Unknown or stopped vehicle");
    const kg = linesWeight(x.lines, itemOf);
    if (kg > v.capacity_kg) {
      fail(422, "VALIDATION", `${v.name} لا تتسع: ${Math.round(kg)} كغم والحمولة القصوى ${v.capacity_kg} كغم. أضف سيارة ثانية.`, `${v.name} is full: ${Math.round(kg)} kg for a ${v.capacity_kg} kg load. Add another vehicle.`);
    }
  }
  const driverOf = (v: Vehicle) => (v.driver_id ? db.users.find((u) => u.id === v.driver_id && u.active) : undefined);

  if (clean.length === 1) {
    const v = vehicles.find((y) => y.id === clean[0].vehicle_id)!;
    d.vehicle = { id: v.id, name: v.name };
    const driver = driverOf(v);
    if (driver) d.rep = person(driver);
    audit(db, actor, "update", "order", o.id, `${o.number} على ${v.name}${driver ? ` مع ${driver.name}` : ""}`, `${o.number} on ${v.name}`, now);
    return o;
  }

  // More than one vehicle: one shipment (an order of its own) per vehicle.
  const priceOf = (iid: number, unit: string) => o.lines.find((l) => l.item_id === iid && l.unit === unit)!;
  o.shipments = clean.map((x, k) => {
    const v = vehicles.find((y) => y.id === x.vehicle_id)!;
    const driver = driverOf(v);
    const sid = nextId(db, "order");
    const lines = x.lines.map((y) => {
      const base = priceOf(y.item_id, y.unit);
      return { ...base, qty: y.qty, total: y.qty * base.unit_price };
    });
    const sub = lines.reduce((a, l) => a + l.total, 0);
    const delivery = newDelivery();
    delivery.vehicle = { id: v.id, name: v.name };
    delivery.rep = driver ? person(driver) : d.rep;
    const part: Order = {
      id: sid,
      number: `${o.number}/${k + 1}`,
      client_ref: `${o.client_ref}-s${k + 1}`,
      customer_id: o.customer_id,
      rep_id: o.rep_id,
      warehouse_id: o.warehouse_id,
      source: o.source,
      status: "approved",
      lines,
      total: sub,
      ...(o.discount ? { discount: { ...o.discount, amount: Math.round((sub * o.discount.percent) / 100) }, subtotal: sub } : {}),
      shipment_of: o.id,
      shipment_no: k + 1,
      accepted_by: o.accepted_by,
      accepted_at: o.accepted_at,
      prep_parts: o.prep_parts,
      delivery,
      note: o.note,
      created_at: now.toISOString(),
      created_by: person(actor),
    };
    setTotal(part, sub - (part.discount?.amount ?? 0));
    db.orders.push(part);
    if (delivery.rep) {
      notify(db, { type: "order_accepted", roles: ["rep"], user_id: delivery.rep.id, title: `شحنة جديدة لك: ${part.number}`, title_en: `A new shipment for you: ${part.number}`, body: `على ${v.name} · ${Math.round(linesWeight(lines, itemOf))} كغم`, body_en: `On ${v.name}`, link: "/deliveries" }, now);
    }
    return sid;
  });
  delete o.delivery;
  const names = clean.map((x) => vehicles.find((y) => y.id === x.vehicle_id)!.name).join(" + ");
  audit(db, actor, "update", "order", o.id, `توزيع ${o.number} على ${clean.length} سيارات: ${names}`, `${o.number} split across ${clean.length} vehicles`, now);
  const owner = shopOwnerOf(db, o.customer_id);
  if (owner) {
    notify(db, { type: "order_accepted", roles: ["shop"], user_id: owner.id, title: `طلبك ${o.number} يصلك على ${clean.length} دفعات`, title_en: `Your order ${o.number} comes in ${clean.length} loads`, body: "كل دفعة لها رمز استلام وفاتورة خاصة بها.", body_en: "Each load has its own PIN and invoice.", link: `/orders/${o.id}` }, now);
  }
  return o;
}

/** A shipment was delivered or cancelled: the big order it belongs to is done when all of them are. */
export function syncShipments(db: Db, part: Order) {
  if (!part.shipment_of) return;
  const parent = db.orders.find((x) => x.id === part.shipment_of);
  if (!parent?.shipments) return;
  const all = parent.shipments.map((sid) => db.orders.find((x) => x.id === sid)).filter((x): x is Order => !!x);
  if (all.every((x) => x.status === "confirmed" || x.status === "cancelled")) parent.status = all.some((x) => x.status === "confirmed") ? "confirmed" : "cancelled";
}

/** At delivery: the invoice for what the shop took, the stock leaves (oldest expiry first), the debt counts. */
function invoiceDelivery(db: Db, actor: DbUser, o: Order, delivered: Order["lines"], now: Date): DbInvoice {
  const today = dayOf(now);
  const lines = delivered.map((l) => {
    const item = itemOf(db, l.item_id);
    const pieces = piecesOf(item, l.unit, l.qty);
    const batches = takeFefo(db, l.item_id, l.warehouse_id ?? o.warehouse_id, pieces, today);
    return { ...l, pieces, returned_pieces: 0, batches };
  });
  const cost = lines.reduce((s, l) => s + l.batches.reduce((a, b) => a + b.qty * b.purchase_price, 0), 0);
  const subtotal = lines.reduce((s, l) => s + l.total, 0);
  const discount = o.discount ? Math.round((subtotal * o.discount.percent) / 100) : 0;
  const [total, rounding] = roundTotal(subtotal - discount);
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
    total,
    ...(o.discount ? { subtotal, discount, discount_percent: o.discount.percent } : {}),
    ...(rounding ? { rounding } : {}),
    ...(usdRateOn(db, today) ? { usd_rate: usdRateOn(db, today)!.rate } : {}),
    paid: 0,
    returned: 0,
    cost,
    created_by: person(actor),
  };
  db.invoices.push(inv);
  for (const l of lines) checkLowStock(db, l.item_id, now);
  return inv;
}

/** Confirm = issue the goods: take stock oldest expiry first, and make the invoice with the prices of the order.
 *  Used only to build the demo history at once (approve + prepare + invoice); people go through the steps above. */
export function confirmOrder(db: Db, actor: DbUser, id: number, now: Date, auto = false): DbInvoice {
  if (!auto) need(actor, ["manager", "warehouse", "accountant"]);
  const o = db.orders.find((x) => x.id === id) ?? fail(404, "NOT_FOUND", "الطلب غير موجود", "Order not found");
  if (o.status === "needs_approval") fail(409, "BAD_STATE", "الطلب يحتاج موافقة المدير أولاً", "The manager must approve this order first");
  if (o.status !== "pending" && o.status !== "expired" && o.status !== "approved") fail(409, "BAD_STATE", "الطلب ليس بانتظار التثبيت", "This order isn't waiting for confirmation");
  if (actor.role === "warehouse" && !worksIn(actor, o.warehouse_id)) {
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
    ...(o.rounding ? { rounding: o.rounding } : {}),
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
  if (actor.role === "warehouse" && !worksIn(actor, input.from_warehouse_id)) {
    fail(403, "FORBIDDEN", "تستطيع التحويل من مخزنك فقط", "You can only transfer out of your own warehouse");
  }
  const lines = input.lines.filter((l) => l.qty > 0);
  if (!lines.length) fail(422, "VALIDATION", "أضف مادة واحدة على الأقل", "Add at least one item", { lines: msg("فارغ", "Empty") });
  checkStock(db, input.from_warehouse_id, lines, now);

  // Work on a copy first: if anything fails, the real data is untouched.
  // Sending and receiving are two steps: now the goods leave the sending warehouse and are "on the road":
  // not sold and not counted in any warehouse until the receiving keeper takes them in.
  const today = dayOf(now);
  const draft: Db = JSON.parse(JSON.stringify(db));
  const outLines: Transfer["lines"] = [];
  for (const l of lines) {
    const item = itemOf(draft, l.item_id);
    const pieces = piecesOf(item, l.unit, l.qty);
    const used = takeFefo(draft, l.item_id, input.from_warehouse_id, pieces, today);
    const batches = used.map((u) => ({ from_batch_id: u.batch_id, qty: u.qty, expiry_date: u.expiry_date, purchase_price: u.purchase_price, receipt_id: draft.batches.find((b) => b.id === u.batch_id)?.receipt_id }));
    outLines.push({ ...l, pieces, batches });
  }
  const id = nextId(draft, "transfer");
  const t: Transfer = {
    id,
    number: `TRF-${pad(id, 5)}`,
    client_ref: input.client_ref,
    from_warehouse_id: input.from_warehouse_id,
    to_warehouse_id: input.to_warehouse_id,
    status: "sent",
    lines: outLines,
    note: input.note?.trim() || undefined,
    created_at: now.toISOString(),
    created_by: person(actor),
  };
  draft.transfers.push(t);
  notify(draft, { type: "low_stock", roles: ["warehouse"], title: `تحويل في الطريق إليك: ${t.number}`, title_en: `Transfer on the way: ${t.number}`, body: "استلمه عند وصوله واكتب الكمية التي وصلت.", body_en: "Receive it when it arrives and write what came.", link: "/transfers" }, now);
  const from = draft.warehouses.find((w) => w.id === input.from_warehouse_id);
  const to = draft.warehouses.find((w) => w.id === input.to_warehouse_id);
  audit(draft, actor, "transfer", "transfer", id, `تحويل ${t.number} من ${from?.name} إلى ${to?.name}`, `Transfer ${t.number} from ${from?.name_en} to ${to?.name_en}`, now);
  Object.assign(db, draft);
  return t;
}

/** The receiving keeper takes the transfer in: what arrived goes on his shelf (same expiry and cost).
 *  Less than sent: he writes why, and the manager is told to review. */
export function receiveTransfer(db: Db, actor: DbUser, id: number, received: Record<number, number>, reason: string, now: Date): Transfer {
  need(actor, ["warehouse", "manager"]);
  const t = db.transfers.find((x) => x.id === id) ?? fail(404, "NOT_FOUND", "التحويل غير موجود", "Transfer not found");
  if (t.status && t.status !== "sent") fail(409, "BAD_STATE", "استُلم هذا التحويل من قبل", "This transfer was already received");
  if (actor.role === "warehouse" && !worksIn(actor, t.to_warehouse_id)) fail(403, "FORBIDDEN", "يستلمه أمين المخزن المستلم", "The receiving warehouse's keeper takes it in");
  let short = false;
  for (const l of t.lines) {
    const got = Math.max(0, Math.round(received?.[l.item_id] ?? l.pieces));
    if (got > l.pieces) fail(422, "VALIDATION", "لا يُستلم أكثر مما أُرسل", "You can't receive more than was sent");
    if (got < l.pieces) short = true;
  }
  if (short && !reason.trim()) fail(422, "VALIDATION", "وصل أقل مما أُرسل: اكتب السبب", "Less arrived than was sent: write why", { reason: msg("السبب مطلوب", "Required") });
  for (const l of t.lines) {
    let left = Math.max(0, Math.round(received?.[l.item_id] ?? l.pieces));
    l.received_pieces = left;
    // The oldest expiry goes on the shelf first, as it was sent.
    for (const b of [...(l.batches ?? [])].sort((a, c) => a.expiry_date.localeCompare(c.expiry_date))) {
      if (left <= 0) break;
      const n = Math.min(b.qty, left);
      left -= n;
      db.batches.push({
        id: nextId(db, "batch"),
        item_id: l.item_id,
        warehouse_id: t.to_warehouse_id,
        expiry_date: b.expiry_date,
        qty_received: n,
        qty_left: n,
        purchase_price: b.purchase_price,
        received_at: now.toISOString(),
        received_by: person(actor),
        ...(b.receipt_id ? { receipt_id: b.receipt_id } : {}),
      } as DbBatch);
    }
  }
  t.status = short ? "partial" : "received";
  t.received_at = now.toISOString();
  t.received_by = person(actor);
  if (short) t.diff_reason = reason.trim();
  audit(db, actor, "transfer", "transfer", t.id, `استلام ${t.number}${short ? ` ناقصاً: ${reason.trim()}` : " كاملاً"}`, `Received ${t.number}${short ? " (short)" : ""}`, now);
  if (short) {
    notify(db, { type: "low_stock", roles: ["manager"], title: `فرق في التحويل ${t.number}`, title_en: `Difference in ${t.number}`, body: `وصل أقل مما أُرسل: ${reason.trim()}`, body_en: `Less arrived: ${reason.trim()}`, link: "/transfers" }, now);
  }
  return t;
}

export function reviewTransfer(db: Db, actor: DbUser, id: number, now: Date): Transfer {
  need(actor, ["manager"]);
  const t = db.transfers.find((x) => x.id === id) ?? fail(404, "NOT_FOUND", "التحويل غير موجود", "Transfer not found");
  if (t.status !== "partial") fail(409, "BAD_STATE", "لا يوجد فرق لمراجعته", "Nothing to review");
  t.reviewed_by = person(actor);
  audit(db, actor, "approve", "transfer", t.id, `راجع المدير فرق التحويل ${t.number}`, `Reviewed ${t.number}`, now);
  return t;
}

// ---------- supply orders ----------
// The accountant (or the manager) orders goods from a supplier for one warehouse. That warehouse's keeper is
// told and gets it as an Excel / CSV file; when the goods arrive he receives them against it (a receipt).

export function createSupplyOrder(db: Db, actor: DbUser, input: NewSupplyOrder, now: Date): SupplyOrder {
  need(actor, ["accountant", "manager"]);
  const wh = db.warehouses.find((w) => w.id === input.warehouse_id) ?? fail(422, "VALIDATION", "اختر المخزن", "Choose the warehouse", { warehouse_id: msg("مطلوب", "Required") });
  const errors: Record<string, string> = {};
  if (!input.supplier?.trim()) errors.supplier = msg("اكتب اسم المورّد", "Write the supplier's name");
  const lines = (input.lines ?? []).filter((l) => l.item_id && l.qty > 0);
  if (!lines.length) errors.lines = msg("أضف مادة واحدة على الأقل", "Add at least one item");
  lines.forEach((l, i) => {
    itemOf(db, l.item_id);
    if (!Number.isInteger(l.qty)) errors[`lines.${i}.qty`] = msg("عدد صحيح", "A whole number");
    if (!(l.price > 0)) errors[`lines.${i}.price`] = msg("سعر الشراء مطلوب", "The purchase price is required");
  });
  if (input.expected_date && input.expected_date < dayOf(now)) errors.expected_date = msg("تاريخ في الماضي", "A date in the past");
  if (Object.keys(errors).length) fail(422, "VALIDATION", "تحقق من الحقول", "Check the fields", errors);
  db.supply_orders ??= [];
  const id = nextId(db, "supply_order");
  const o: SupplyOrder = {
    id,
    number: `SUP-${pad(id, 4)}`,
    warehouse_id: wh.id,
    supplier: input.supplier.trim(),
    ...(input.supplier_phone?.trim() ? { supplier_phone: input.supplier_phone.trim() } : {}),
    lines: lines.map((l) => ({ item_id: l.item_id, unit: l.unit, qty: l.qty, price: Math.round(l.price), received_qty: 0 })),
    total: lines.reduce((s, l) => s + Math.round(l.price) * l.qty, 0),
    ...(input.expected_date ? { expected_date: input.expected_date } : {}),
    ...(input.note?.trim() ? { note: input.note.trim() } : {}),
    status: "sent",
    receipt_ids: [],
    created_at: now.toISOString(),
    created_by: { ...person(actor), role: actor.role },
  };
  db.supply_orders.push(o);
  audit(db, actor, "create", "receipt", id, `طلب توريد ${o.number} إلى ${wh.name} من ${o.supplier} (${o.total.toLocaleString("en")} د.ع)`, `Supply order ${o.number} to ${wh.name_en}`, now);
  // The keeper(s) of that warehouse get it.
  for (const k of db.users.filter((u) => u.role === "warehouse" && u.active && u.warehouse_id === wh.id)) {
    notify(
      db,
      {
        type: "supply_order",
        roles: ["warehouse"],
        user_id: k.id,
        title: `طلب توريد جديد: ${o.number}`,
        title_en: `New supply order: ${o.number}`,
        body: `${o.supplier} · ${lines.length} مواد${o.expected_date ? ` · يصل ${o.expected_date}` : ""}. نزّل الملف واستلم البضاعة عند وصولها.`,
        body_en: `${o.supplier} · ${lines.length} items. Download the file and receive the goods when they come.`,
        link: "/supply",
      },
      now,
    );
  }
  return o;
}

export function cancelSupplyOrder(db: Db, actor: DbUser, id: number, reason: string, now: Date): SupplyOrder {
  need(actor, ["accountant", "manager"]);
  const o = (db.supply_orders ?? []).find((x) => x.id === id) ?? fail(404, "NOT_FOUND", "طلب التوريد غير موجود", "Supply order not found");
  if (o.status !== "sent") fail(409, "BAD_STATE", "وصل شيء من هذا الطلب: لا يُلغى", "Part of it already arrived: it can't be cancelled");
  if (!reason.trim()) fail(422, "VALIDATION", "اكتب السبب", "Write the reason", { reason: msg("مطلوب", "Required") });
  o.status = "cancelled";
  o.cancel_reason = reason.trim();
  audit(db, actor, "cancel", "receipt", o.id, `إلغاء طلب التوريد ${o.number}: ${o.cancel_reason}`, `Cancelled ${o.number}`, now);
  for (const k of db.users.filter((u) => u.role === "warehouse" && u.active && u.warehouse_id === o.warehouse_id)) {
    notify(db, { type: "supply_order", roles: ["warehouse"], user_id: k.id, title: `أُلغي طلب التوريد ${o.number}`, title_en: `${o.number} was cancelled`, body: o.cancel_reason, body_en: o.cancel_reason, link: "/supply" }, now);
  }
  return o;
}

/** A receipt brought goods of this supply order: count them, and say if it is now complete. */
function receiveSupply(db: Db, actor: DbUser, id: number, receipt: Receipt, now: Date) {
  const o = (db.supply_orders ?? []).find((x) => x.id === id) ?? fail(404, "NOT_FOUND", "طلب التوريد غير موجود", "Supply order not found");
  if (o.status === "cancelled" || o.status === "received") fail(409, "BAD_STATE", "طلب التوريد مغلق", "This supply order is closed");
  if (o.warehouse_id !== receipt.warehouse_id) fail(422, "VALIDATION", "طلب التوريد لمخزن آخر", "The supply order is for another warehouse");
  for (const rl of receipt.lines) {
    const sl = o.lines.find((l) => l.item_id === rl.item_id && l.unit === rl.unit) ?? o.lines.find((l) => l.item_id === rl.item_id);
    if (!sl) continue;
    const item = itemOf(db, sl.item_id);
    // Count in the supply line's unit (cartons or pieces).
    const inUnit = sl.unit === rl.unit ? rl.qty : sl.unit === "carton" ? rl.pieces / item.pieces_per_carton : rl.pieces;
    sl.received_qty = Math.round((sl.received_qty + inUnit) * 100) / 100;
  }
  o.receipt_ids.push(receipt.id);
  const complete = o.lines.every((l) => l.received_qty >= l.qty);
  o.status = complete ? "received" : "partial";
  if (actor.role !== "accountant") {
    notify(
      db,
      {
        type: "supply_order",
        roles: ["accountant", "manager"],
        title: complete ? `وصل طلب التوريد ${o.number} كاملاً` : `وصل جزء من طلب التوريد ${o.number}`,
        title_en: complete ? `${o.number} arrived in full` : `Part of ${o.number} arrived`,
        body: `${receipt.number} · ${actor.name}`,
        body_en: receipt.number,
        link: "/supply",
      },
      now,
    );
  }
}

// ---------- stocktake ----------

export function createStocktake(db: Db, actor: DbUser, warehouseId: number, now: Date, category?: string): Stocktake {
  need(actor, ["manager", "warehouse"]);
  if (actor.role === "warehouse" && !worksIn(actor, warehouseId)) {
    fail(403, "FORBIDDEN", "تستطيع جرد مخزنك فقط", "You can only count your own warehouse");
  }
  if (db.stocktakes.some((s) => s.warehouse_id === warehouseId && s.status === "open")) {
    fail(409, "BAD_STATE", "يوجد جرد مفتوح لهذا المخزن", "There is already an open count for this warehouse");
  }
  const id = nextId(db, "stocktake");
  // A whole warehouse, or one category: only the counted items stop selling there until the count ends.
  const lines: StocktakeLine[] = db.items
    .filter((i) => i.active && (!category || i.category === category))
    .map((i) => ({ item_id: i.id, system_qty: shelfQty(db, i.id, warehouseId), counted_qty: null }));
  if (!lines.length) fail(422, "VALIDATION", "لا توجد مواد في هذا الصنف", "No items in this category");
  const s: Stocktake = {
    id,
    number: `CNT-${pad(id, 4)}`,
    warehouse_id: warehouseId,
    ...(category ? { category } : {}),
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
  if (actor.role === "warehouse" && !worksIn(actor, s.warehouse_id)) fail(403, "FORBIDDEN", "هذا جرد مخزن آخر", "This is another warehouse's count");
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

  const addr = cleanAddress(input.address_info, true);
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
    address: addr.text || input.address?.trim() || `كربلاء - ${area}`,
    ...(addr.info ? { address_info: addr.info } : {}),
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

// ---------- mistakes: credit notes and refunds ----------

/** A mistake on an invoice: take `amount` off what the shop owes on it (never more than is left of it
 *  after returns and earlier notes). Already paid → it becomes the shop's credit, to refund or to use. */
export function creditInvoice(db: Db, actor: DbUser, invoiceId: number, amount: number, reason: string, now: Date): CreditNote {
  need(actor, ["accountant", "manager"]);
  const inv = db.invoices.find((x) => x.id === invoiceId) ?? fail(404, "NOT_FOUND", "الفاتورة غير موجودة", "Invoice not found");
  const a = Math.round(Number(amount));
  const room = inv.total - inv.returned - (inv.credited ?? 0);
  if (!(a > 0)) fail(422, "VALIDATION", "اكتب المبلغ", "Enter the amount", { amount: msg("مبلغ صحيح بالدينار", "A whole amount") });
  if (a > room) fail(422, "VALIDATION", `أكثر ما يمكن تعويضه ${room.toLocaleString("en")} د.ع`, `At most ${room.toLocaleString("en")} IQD`, { amount: msg(`حتى ${room.toLocaleString("en")}`, `Up to ${room}`) });
  if (!reason.trim()) fail(422, "VALIDATION", "اكتب ما الخطأ", "Write what the mistake was", { reason: msg("السبب مطلوب", "Required") });
  db.credit_notes ??= [];
  const id = nextId(db, "credit_note");
  const n: CreditNote = { id, number: `CN-${pad(id, 4)}`, invoice_id: inv.id, customer_id: inv.customer_id, amount: a, reason: reason.trim(), by: { ...person(actor), role: actor.role }, at: now.toISOString() };
  db.credit_notes.push(n);
  inv.credited = (inv.credited ?? 0) + a;
  const c = db.customers.find((x) => x.id === inv.customer_id);
  audit(db, actor, "update", "invoice", inv.id, `تعويض ${n.number} على ${inv.number} (${c?.name ?? ""}): ${a.toLocaleString("en")} د.ع. ${n.reason}`, `Credit note ${n.number} on ${inv.number}: ${a} IQD`, now);
  if (actor.role !== "manager") notify(db, { type: "refund", roles: ["manager"], title: `تعويض على ${inv.number}: ${a.toLocaleString("en")} د.ع`, title_en: `Credit note on ${inv.number}`, body: `${actor.name}: ${n.reason}`, body_en: n.reason, link: `/invoices/${inv.id}` }, now);
  const owner = shopOwnerOf(db, inv.customer_id);
  if (owner) notify(db, { type: "refund", roles: ["shop"], user_id: owner.id, title: `خُصم ${a.toLocaleString("en")} د.ع من فاتورتك ${inv.number}`, title_en: `${a} IQD taken off invoice ${inv.number}`, body: n.reason, body_en: n.reason, link: `/invoices/${inv.id}` }, now);
  return n;
}

/** Give money back to the shop, up to its credit. Online: back to the card of one of its online payments. */
export function refundCustomer(db: Db, actor: DbUser, customerId: number, input: { amount: number; method: Refund["method"]; payment_id?: number; reason: string }, now: Date): Refund {
  need(actor, ["accountant", "manager"]);
  const c = db.customers.find((x) => x.id === customerId) ?? fail(404, "NOT_FOUND", "الزبون غير موجود", "Customer not found");
  const credit = -customerBalance(db, customerId);
  const a = Math.round(Number(input.amount));
  if (credit <= 0) fail(409, "BAD_STATE", "ليس للزبون رصيد يُعاد: سجّل تعويضاً على الفاتورة أولاً", "The shop has no credit: make a credit note on the invoice first");
  if (!(a > 0)) fail(422, "VALIDATION", "اكتب المبلغ", "Enter the amount", { amount: msg("مبلغ صحيح بالدينار", "A whole amount") });
  if (a > credit) fail(422, "VALIDATION", `رصيد الزبون ${credit.toLocaleString("en")} د.ع فقط`, `The shop's credit is ${credit} IQD`, { amount: msg(`حتى ${credit.toLocaleString("en")}`, `Up to ${credit}`) });
  if (!input.reason?.trim()) fail(422, "VALIDATION", "اكتب السبب", "Write the reason", { reason: msg("السبب مطلوب", "Required") });
  if (!["cash", "transfer", "online"].includes(input.method)) fail(422, "VALIDATION", "اختر طريقة الإعادة", "Choose how", { method: msg("مطلوب", "Required") });
  let payment: Payment | undefined;
  if (input.method === "online") {
    payment = db.payments.find((p) => p.id === input.payment_id && p.customer_id === customerId && p.method === "online" && !p.reversed && p.amount > 0);
    if (!payment) fail(422, "VALIDATION", "اختر التسديد الأونلاين الذي تُعاد إلى بطاقته", "Choose the online payment to refund to", { payment_id: msg("مطلوب", "Required") });
    const already = (db.refunds ?? []).filter((r) => r.payment_id === payment!.id).reduce((s, r) => s + r.amount, 0);
    if (a > payment.amount - already) fail(422, "VALIDATION", `لا يُعاد إلى البطاقة أكثر مما دُفع بها (${(payment.amount - already).toLocaleString("en")} د.ع)`, "Not more than was paid by that card", { amount: msg("أكثر من المدفوع بالبطاقة", "More than the card paid") });
  }
  db.refunds ??= [];
  const id = nextId(db, "refund");
  const r: Refund = {
    id,
    number: `RF-${pad(id, 4)}`,
    customer_id: customerId,
    amount: a,
    method: input.method,
    ...(payment ? { payment_id: payment.id } : {}),
    reason: input.reason.trim(),
    by: { ...person(actor), role: actor.role },
    at: now.toISOString(),
  };
  db.refunds.push(r);
  const how = input.method === "cash" ? "نقداً" : input.method === "transfer" ? "بتحويل" : `إلى بطاقة ${payment?.gateway?.card ?? ""}`;
  audit(db, actor, "create", "payment", id, `إعادة ${a.toLocaleString("en")} د.ع إلى ${c.name} ${how} (${r.number}): ${r.reason}`, `Refund ${r.number} to ${c.name}: ${a} IQD`, now);
  if (actor.role !== "manager") notify(db, { type: "refund", roles: ["manager"], title: `إعادة مبلغ لـ ${c.name}: ${a.toLocaleString("en")} د.ع`, title_en: `Refund to ${c.name}`, body: `${actor.name} · ${how} · ${r.reason}`, body_en: r.reason, link: `/customers/${c.id}` }, now);
  const owner = shopOwnerOf(db, customerId);
  if (owner) notify(db, { type: "refund", roles: ["shop"], user_id: owner.id, title: `أُعيد لك ${a.toLocaleString("en")} د.ع`, title_en: `${a} IQD refunded to you`, body: `${how} · ${r.reason}`, body_en: r.reason, link: "/statement" }, now);
  return r;
}

// ---------- the shop's address card ----------

/** Checks and cleans the address card; returns it with the short text for the old `address` field. */
export function cleanAddress(a: ShopAddress | null | undefined, required: boolean): { info?: ShopAddress; text?: string } {
  if (!a) {
    if (required) fail(422, "VALIDATION", "أكمل معلومات العنوان", "Complete the address", { address_info: msg("العنوان مطلوب", "The address is required") });
    return {};
  }
  const t = (v?: string) => (v ?? "").trim().slice(0, 160);
  const digits = (a.phone ?? "").replace(/\s/g, "").replace(/[٠-٩]/g, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d))).replace(/^\+?964/, "0");
  const phone = digits.startsWith("7") ? `0${digits}` : digits;
  const errors: Record<string, string> = {};
  if (!t(a.label)) errors["address_info.label"] = msg("اسم العنوان مطلوب", "Required");
  if (!t(a.details)) errors["address_info.details"] = msg("تفاصيل العنوان مطلوبة", "Required");
  if (!/^07\d{9}$/.test(phone)) errors["address_info.phone"] = msg("رقم عراقي يبدأ بـ 7 بعد +964", "An Iraqi number starting with 7 after +964");
  const lat = Number(a.lat), lng = Number(a.lng);
  // Iraq, roughly: a pin far away is a mistake.
  const pin = Number.isFinite(lat) && Number.isFinite(lng) && lat > 29 && lat < 38 && lng > 38 && lng < 49;
  if (Object.keys(errors).length) fail(422, "VALIDATION", "تحقق من معلومات العنوان", "Check the address", errors);
  const info: ShopAddress = {
    label: t(a.label),
    details: t(a.details),
    phone,
    ...(t(a.street) ? { street: t(a.street) } : {}),
    ...(t(a.building) ? { building: t(a.building) } : {}),
    ...(t(a.floor) ? { floor: t(a.floor) } : {}),
    ...(t(a.apartment) ? { apartment: t(a.apartment) } : {}),
    ...(t(a.landmark) ? { landmark: t(a.landmark) } : {}),
    ...(pin ? { lat: Math.round(lat * 1e6) / 1e6, lng: Math.round(lng * 1e6) / 1e6 } : {}),
  };
  const text = [info.label, info.street, info.details !== info.label ? info.details : "", info.landmark ? `قرب ${info.landmark}` : ""].filter(Boolean).join(" - ");
  return { info, text };
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

  const addr = cleanAddress(input.address_info, true);
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
    address: addr.text || input.address?.trim() || `كربلاء - ${area}`,
    ...(addr.info ? { address_info: addr.info } : {}),
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

  // What the shop took: everything, or less (never more than the order).
  const wanted = input.lines ?? o.lines;
  const delivered: Order["lines"] = [];
  const short: Order["lines"] = [];
  for (const l of o.lines) {
    const got = Math.max(0, Math.min(l.qty, wanted.find((x) => x.item_id === l.item_id && x.unit === l.unit)?.qty ?? 0));
    if (got > 0) delivered.push({ ...l, qty: got, total: got * l.unit_price });
    if (got < l.qty) short.push({ ...l, qty: l.qty - got, total: (l.qty - got) * l.unit_price });
  }
  if (!delivered.length) fail(422, "VALIDATION", "لم يُسلَّم شيء: إذا رفض المحل البضاعة، استخدم «تعذّر التسليم»", "Nothing delivered: if the shop refused it, use “Can't deliver”");

  Object.assign(d, { status: "delivered", delivered_at: now.toISOString(), delivered_by: person(actor), has_photo: true });
  delete d.problem;
  db.delivery_photos[o.id] = input.photo;
  const customer = db.customers.find((c) => c.id === o.customer_id);
  // The invoice is made now, for what was delivered; the debt counts from now.
  if (!o.invoice_id) {
    const inv = invoiceDelivery(db, actor, o, delivered, now);
    o.invoice_id = inv.id;
  }
  o.status = "confirmed";
  if (short.length) {
    o.short_lines = short;
    o.lines = delivered;
    const subtotal = delivered.reduce((s, l) => s + l.total, 0);
    if (o.discount) {
      o.discount = { ...o.discount, amount: Math.round((subtotal * o.discount.percent) / 100) };
      o.subtotal = subtotal;
    }
    setTotal(o, subtotal - (o.discount?.amount ?? 0));
    if (input.rest === "keep") {
      // The rest stays an open (approved) order: prepared and delivered later, held meanwhile.
      const rid = nextId(db, "order");
      const rsub = short.reduce((s, l) => s + l.total, 0);
      const rest: Order = {
        id: rid,
        number: `ORD-${pad(rid)}`,
        client_ref: `rest-${o.id}`,
        customer_id: o.customer_id,
        rep_id: o.rep_id,
        warehouse_id: o.warehouse_id,
        source: o.source,
        status: "approved",
        lines: short,
        total: rsub,
        ...(o.discount ? { discount: { ...o.discount, amount: Math.round((rsub * o.discount.percent) / 100) }, subtotal: rsub } : {}),
        note: `باقي الطلب ${o.number}`,
        parent_id: o.id,
        accepted_by: o.accepted_by,
        accepted_at: now.toISOString(),
        created_at: now.toISOString(),
        created_by: person(actor),
      };
      setTotal(rest, rsub - (rest.discount?.amount ?? 0));
      // The rest of one vehicle's shipment stays a shipment of the same big order (the shop sees one order).
      const parent = o.shipment_of ? db.orders.find((x) => x.id === o.shipment_of) : undefined;
      if (parent?.shipments) {
        rest.shipment_of = parent.id;
        rest.shipment_no = parent.shipments.length + 1;
        rest.number = `${parent.number}/${rest.shipment_no}`;
        parent.shipments.push(rid);
      }
      db.orders.push(rest);
      o.rest_order_id = rid;
      audit(db, actor, "create", "order", rid, `باقي الطلب ${o.number} بقي طلباً مفتوحاً (${rest.number})`, `The rest of ${o.number} stays open as ${rest.number}`, now);
    } else {
      audit(db, actor, "cancel", "order", o.id, `أُلغي ما لم يُسلَّم من ${o.number} برغبة المحل`, `What wasn't delivered of ${o.number} was cancelled`, now);
    }
  }
  syncShipments(db, o);
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
  if (actor.role === "warehouse" && !worksIn(actor, o.warehouse_id)) fail(403, "FORBIDDEN", "هذه الشحنة من مخزن آخر", "This shipment is from another warehouse");
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
