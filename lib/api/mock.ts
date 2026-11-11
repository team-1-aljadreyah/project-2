// The fake backend. It has exactly the same functions as the real one (http.ts), follows the client's rules
// (rules.ts) and hides fields by role like a real server would. Pages never know which one they use.
import { getSession } from "../auth";
import { isOffline } from "../offline";
import { ApiError, NETWORK_ERROR } from "./errors";
import type { Api } from "./http";
import type {
  AuditEntry,
  OnlineStatus,
  Batch,
  Customer,
  DailySales,
  Dashboard,
  DebtRow,
  Item,
  NearExpiryRow,
  Payment,
  Receipt,
  Return,
  Role,
  SalesRow,
  Session,
  SlowItem,
  Statement,
  StatementRow,
} from "./types";
import { clearDb, emitChange, loadDb, nextId, saveDb, type Db, type DbBatch, type DbCustomer, type DbItem, type DbReturn, type DbUser } from "./mock/db";
import {
  approveOrder,
  setOrderDiscount,
  updateOrder,
  approveShop,
  allocate,
  audit,
  batchStatus,
  cancelOrder,
  closeMonth,
  closeStocktake,
  commissionRows,
  confirmOrder,
  createOrder,
  createPayment,
  createReceipt,
  createReturn,
  createStocktake,
  createTransfer,
  customerBalance,
  dayOf,
  daysBetween,
  fail,
  invoiceView,
  msg,
  need,
  onlineView,
  sendChat,
  replyChat,
  myChat,
  chatThreads,
  chatOf,
  markChatRead,
  orderView,
  dispatchDelivery,
  deliverOrder,
  reportDeliveryProblem,
  addShop,
  myShops,
  switchShop,
  returnToWarehouse,
  unlockDelivery,
  startOnline,
  physicalQty,
  registerShop,
  rejectShop,
  reversePayment,
  saveStocktake,
  sellableQty,
  sweep,
} from "./mock/rules";
import { makeSeed } from "./mock/seed";

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
const db0 = () => loadDb(() => makeSeed());

const COST_ROLES: Role[] = ["manager", "accountant", "warehouse"];
const PROFIT_ROLES: Role[] = ["manager", "accountant"];
const seesCost = (u: DbUser) => COST_ROLES.includes(u.role);
const seesProfit = (u: DbUser) => PROFIT_ROLES.includes(u.role);
// The warehouse people never see debts (keeper and staff).
const seesDebt = (u: DbUser) => u.role !== "warehouse" && u.role !== "staff";

function actorOf(db: Db): DbUser {
  const s = getSession();
  const id = s?.token?.startsWith("mock.") ? Number(s.token.slice(5)) : NaN;
  const u = db.users.find((x) => x.id === id);
  if (!u || !u.active) throw new ApiError(401, msg("انتهت الجلسة، سجّل الدخول من جديد", "Your session ended. Log in again"), undefined, "UNAUTHENTICATED");
  return u;
}

/** Read request: data comes from the phone's copy, so it also works offline. */
async function read<T>(fn: (db: Db, actor: DbUser, now: Date) => T): Promise<T> {
  await wait(120 + Math.random() * 180);
  const db = db0();
  const now = new Date();
  const before = db.audit.length + db.notifications.length;
  sweep(db, now);
  if (db.audit.length + db.notifications.length !== before) {
    saveDb(db);
    setTimeout(emitChange, 0);
  }
  return structuredClone(fn(db, actorOf(db), now));
}

/** Write request: runs on a copy and saves only if every rule passed (all or nothing). Needs the network. */
async function write<T>(fn: (db: Db, actor: DbUser, now: Date) => T, opts: { anonymous?: boolean } = {}): Promise<T> {
  await wait(250 + Math.random() * 250);
  if (isOffline()) throw new ApiError(NETWORK_ERROR, msg("لا يوجد اتصال بالإنترنت", "No internet connection"), undefined, "NETWORK");
  const draft = structuredClone(db0());
  const now = new Date();
  sweep(draft, now);
  const actor = opts.anonymous ? (null as unknown as DbUser) : actorOf(draft);
  const result = fn(draft, actor, now);
  saveDb(draft);
  emitChange();
  return structuredClone(result);
}

// ---------- views: what each role may see ----------

function itemView(db: Db, it: DbItem, actor: DbUser, now: Date): Item {
  const today = dayOf(now);
  const by_warehouse = db.warehouses.map((w) => ({ warehouse_id: w.id, qty: sellableQty(db, it.id, w.id, now) }));
  const live = db.batches.filter((b) => b.item_id === it.id && b.qty_left > 0 && b.expiry_date >= today);
  const nearest = live.map((b) => b.expiry_date).sort()[0];
  const pieces = live.reduce((s, b) => s + b.qty_left, 0);
  const avg = pieces ? Math.round(live.reduce((s, b) => s + b.qty_left * b.purchase_price, 0) / pieces) : undefined;
  let prices = it.prices;
  // A shop owner sees only his own price.
  if (actor.role === "shop") {
    const c = db.customers.find((x) => x.id === actor.customer_id);
    prices = it.prices.filter((p) => p.tier_id === c?.tier_id);
  }
  return {
    ...it,
    prices,
    stock: { total: by_warehouse.reduce((s, w) => s + w.qty, 0), by_warehouse },
    nearest_expiry: nearest,
    ...(seesCost(actor) && avg !== undefined ? { avg_cost: avg } : {}),
  };
}

function batchView(db: Db, b: DbBatch, actor: DbUser, now: Date): Batch {
  const { purchase_price, ...rest } = b;
  return { ...rest, status: batchStatus(db, b, dayOf(now)), ...(seesCost(actor) ? { purchase_price } : {}) };
}

function customerView(db: Db, c: DbCustomer, actor: DbUser): Customer {
  const last = db.orders.filter((o) => o.customer_id === c.id).map((o) => o.created_at).sort().pop();
  const { debt_limit, ...rest } = c;
  return { ...rest, last_order_at: last, ...(seesDebt(actor) ? { debt_limit, balance: customerBalance(db, c.id) } : {}) };
}

function canSeeCustomer(actor: DbUser, c: { id: number; rep_id: number }) {
  if (actor.role === "rep") return c.rep_id === actor.id;
  if (actor.role === "shop") return actor.customer_id === c.id;
  return true;
}

/** A delivery rep sees the shops he has shipments for (name, area, phone), even if they aren't his. */
function deliversTo(db: Db, actor: DbUser, customerId: number) {
  return actor.role === "rep" && db.orders.some((o) => o.customer_id === customerId && o.delivery?.rep?.id === actor.id && o.delivery.status !== "delivered");
}

function canSeeOrder(actor: DbUser, o: { customer_id: number; rep_id: number; warehouse_id: number; delivery?: { rep?: { id: number } } }) {
  // A rep sees his shops' orders, and the ones he delivers.
  if (actor.role === "rep") return o.rep_id === actor.id || o.delivery?.rep?.id === actor.id;
  if (actor.role === "shop") return o.customer_id === actor.customer_id;
  if (actor.role === "warehouse" || actor.role === "staff") return !actor.warehouse_id || actor.warehouse_id === o.warehouse_id;
  return true;
}

function receiptView(r: Receipt, actor: DbUser): Receipt {
  if (seesCost(actor)) return r;
  const { total_cost: _hidden, ...rest } = r;
  void _hidden;
  return { ...rest, lines: r.lines.map((l) => ({ ...l, purchase_price: 0 })) };
}

function returnView(r: DbReturn): Return {
  const { cost: _c, commission_base: _b, ...rest } = r;
  void _c;
  void _b;
  return rest;
}

function notFound(): never {
  return fail(404, "NOT_FOUND", "غير موجود", "Not found");
}

// ---------- reports ----------

function salesRows(db: Db, actor: DbUser, group: "rep" | "item" | "warehouse" | "customer", from: string, to: string, warehouseId?: number): SalesRow[] {
  const rows = new Map<string, SalesRow>();
  const showProfit = seesProfit(actor);
  const row = (key: string, label: string, label_en: string) => {
    let r = rows.get(key);
    if (!r) {
      r = { key, label, label_en, invoices: 0, pieces: 0, sales: 0, returns: 0, ...(showProfit ? { profit: 0 } : {}) };
      rows.set(key, r);
    }
    return r;
  };
  const labelOf = (g: typeof group, id: number): [string, string] => {
    if (g === "rep") {
      const u = db.users.find((x) => x.id === id);
      return [u?.name ?? "-", u?.name ?? "-"];
    }
    if (g === "warehouse") {
      const w = db.warehouses.find((x) => x.id === id);
      return [w?.name ?? "-", w?.name_en ?? "-"];
    }
    if (g === "customer") {
      const c = db.customers.find((x) => x.id === id);
      return [c?.name ?? "-", c?.name ?? "-"];
    }
    const it = db.items.find((x) => x.id === id);
    return [it?.name ?? "-", it?.name_en ?? "-"];
  };
  const inRange = (iso: string) => {
    const d = dayOf(new Date(iso));
    return d >= from && d <= to;
  };
  for (const inv of db.invoices) {
    if (!inRange(inv.date)) continue;
    if (warehouseId && inv.warehouse_id !== warehouseId) continue;
    if (group === "item") {
      for (const l of inv.lines) {
        const r = row(String(l.item_id), ...labelOf("item", l.item_id));
        r.invoices += 1;
        r.pieces += l.pieces;
        r.sales += l.total;
        if (r.profit !== undefined) r.profit += l.total - l.batches.reduce((s, b) => s + b.qty * b.purchase_price, 0);
      }
    } else {
      const id = group === "rep" ? inv.rep_id : group === "warehouse" ? inv.warehouse_id : inv.customer_id;
      const r = row(String(id), ...labelOf(group, id));
      r.invoices += 1;
      r.pieces += inv.lines.reduce((s, l) => s + l.pieces, 0);
      r.sales += inv.total;
      if (r.profit !== undefined) r.profit += inv.total - inv.cost;
    }
  }
  for (const ret of db.returns) {
    if (!inRange(ret.created_at)) continue;
    const inv = db.invoices.find((i) => i.id === ret.invoice_id);
    if (!inv) continue;
    if (warehouseId && inv.warehouse_id !== warehouseId) continue;
    if (group === "item") {
      for (const l of ret.lines) {
        const r = row(String(l.item_id), ...labelOf("item", l.item_id));
        r.returns += l.amount;
        if (r.profit !== undefined) r.profit -= l.amount;
      }
      if (showProfit) {
        // Give back the cost of returned pieces to the first item line (good enough for the item report).
        const first = rows.get(String(ret.lines[0]?.item_id));
        if (first?.profit !== undefined) first.profit += ret.cost;
      }
    } else {
      const id = group === "rep" ? inv.rep_id : group === "warehouse" ? inv.warehouse_id : inv.customer_id;
      const r = row(String(id), ...labelOf(group, id));
      r.returns += ret.amount;
      if (r.profit !== undefined) r.profit -= ret.amount - ret.cost;
    }
  }
  return [...rows.values()].sort((a, b) => b.sales - a.sales);
}

// ---------- the API ----------

export const mockApi: Api = {
  // Auth
  login: (phone, password) =>
    write(
      (db, _a, now): Session => {
        const clean = phone.replace(/\s/g, "");
        const u = db.users.find((x) => x.phone === clean);
        if (!u || u.password !== password) {
          fail(401, "UNAUTHENTICATED", "رقم الهاتف أو كلمة المرور غير صحيحة", "Wrong phone number or password");
        }
        if (!u.active) fail(403, "FORBIDDEN", "هذا الحساب موقوف، راجع المدير", "This account is disabled. Contact the manager");
        audit(db, u, "login", "user", u.id, `تسجيل دخول ${u.name}`, `${u.name} logged in`, now);
        const { password: _p, ...user } = u;
        void _p;
        return { token: `mock.${u.id}`, user };
      },
      { anonymous: true },
    ),
  register: (input) =>
    write(
      (db, _a, now): Session => {
        const { user } = registerShop(db, input, now);
        const { password: _p, ...rest } = user;
        void _p;
        return { token: `mock.${user.id}`, user: rest };
      },
      { anonymous: true },
    ),
  logout: async () => {
    await wait(100);
  },
  me: () =>
    read((_db, a) => {
      const { password: _p, ...user } = a;
      void _p;
      return user;
    }),

  // Lookups: names every screen needs (warehouses, tiers, staff names, categories)
  lookups: () =>
    read((db) => ({
      warehouses: db.warehouses,
      tiers: db.tiers,
      reps: db.users.filter((u) => u.role === "rep").map((u) => ({ id: u.id, name: u.name, phone: u.phone, ...(u.rep_kinds?.length ? { kinds: u.rep_kinds } : {}) })),
      categories: [...new Set(db.items.map((i) => i.category))],
      settings: db.settings,
    })),

  // Users
  listUsers: () =>
    read((db, a) => {
      need(a, ["manager"]);
      return db.users.map((u) => {
        const { password: _p, ...rest } = u;
        void _p;
        return rest;
      });
    }),
  saveUser: (id, input) =>
    write((db, a, now) => {
      need(a, ["manager"]);
      const phone = input.phone.replace(/\s/g, "");
      const errors: Record<string, string> = {};
      if (!input.name.trim()) errors.name = msg("الاسم مطلوب", "Name is required");
      if (!/^07\d{9}$/.test(phone)) errors.phone = msg("رقم عراقي من 11 رقم يبدأ بـ 07", "An 11-digit Iraqi number starting with 07");
      else if (db.users.some((u) => u.phone === phone && u.id !== id)) errors.phone = msg("هذا الرقم مستخدم", "This number is already used");
      if (!id && (!input.password || input.password.length < 6)) errors.password = msg("6 أحرف على الأقل", "At least 6 characters");
      if ((input.role === "warehouse" || input.role === "staff") && !input.warehouse_id) errors.warehouse_id = msg("اختر المخزن", "Choose the warehouse");
      if (input.role === "shop" && !input.customer_id) errors.customer_id = msg("اختر المحل", "Choose the shop");
      if (input.role === "rep" && input.rep_kinds && !input.rep_kinds.length) errors.rep_kinds = msg("اختر عمله: تسويق أو توصيل أو الاثنين", "Choose: marketing, delivery or both");
      // One warehouse keeper for each warehouse: he is the one who answers for its stock.
      const otherKeeper = input.role === "warehouse" && input.active && db.users.find((u) => u.id !== id && u.role === "warehouse" && u.active && u.warehouse_id === input.warehouse_id);
      if (otherKeeper) errors.warehouse_id = msg(`لهذا المخزن أمين مخزن: ${otherKeeper.name}. أوقف حسابه أولاً أو اختر مخزناً آخر.`, `This warehouse already has a keeper: ${otherKeeper.name}. Disable him first or choose another warehouse.`);
      if (id === a.id && (!input.active || input.role !== "manager")) errors.role = msg("لا تستطيع إيقاف حسابك أو تغيير دورك", "You can't disable yourself or change your own role");
      if (Object.keys(errors).length) fail(422, "VALIDATION", "تحقق من الحقول", "Check the fields", errors);
      const clean = {
        name: input.name.trim(),
        phone,
        role: input.role,
        warehouse_id: input.role === "warehouse" || input.role === "staff" ? input.warehouse_id : undefined,
        rep_kinds: input.role === "rep" ? (input.rep_kinds?.length ? input.rep_kinds : (["sales", "delivery"] as const).slice()) : undefined,
        customer_id: input.role === "shop" ? input.customer_id : undefined,
        active: input.active,
      };
      if (id) {
        const u = db.users.find((x) => x.id === id) ?? notFound();
        Object.assign(u, clean);
        if (input.password) u.password = input.password;
        audit(db, a, "update", "user", u.id, `تعديل المستخدم ${u.name}`, `Updated user ${u.name}`, now);
        const { password: _p, ...rest } = u;
        void _p;
        return rest;
      }
      const u: DbUser = { id: nextId(db, "user"), ...clean, password: input.password ?? "" };
      db.users.push(u);
      audit(db, a, "create", "user", u.id, `إضافة المستخدم ${u.name}`, `Added user ${u.name}`, now);
      const { password: _p, ...rest } = u;
      void _p;
      return rest;
    }),

  // Settings
  saveSettings: (s) =>
    write((db, a, now) => {
      need(a, ["manager"]);
      if (!(s.reservation_hours >= 1 && s.reservation_hours <= 72)) fail(422, "VALIDATION", "مدة الحجز بين 1 و 72 ساعة", "Reservation must be 1 to 72 hours", { reservation_hours: "1-72" });
      db.settings = s;
      audit(db, a, "update", "settings", 0, `تعديل الإعدادات: حجز ${s.reservation_hours} ساعة، تنبيه الصلاحية ${s.near_expiry_days} يوم`, `Settings: reservation ${s.reservation_hours}h, expiry alert ${s.near_expiry_days} days`, now);
      return s;
    }),
  saveTier: (id, name, name_en) =>
    write((db, a, now) => {
      need(a, ["manager"]);
      if (!name.trim()) fail(422, "VALIDATION", "الاسم مطلوب", "Name is required", { name: msg("مطلوب", "Required") });
      if (id) {
        const t = db.tiers.find((x) => x.id === id) ?? notFound();
        t.name = name.trim();
        t.name_en = name_en.trim() || name.trim();
        audit(db, a, "update", "settings", t.id, `تعديل نوع السعر ${t.name}`, `Updated price tier ${t.name_en}`, now);
        return t;
      }
      const t = { id: Math.max(0, ...db.tiers.map((x) => x.id)) + 1, name: name.trim(), name_en: name_en.trim() || name.trim() };
      db.tiers.push(t);
      // A new tier starts with the normal wholesale prices, the manager edits them after.
      for (const it of db.items) {
        const base = it.prices.find((p) => p.tier_id === 2) ?? it.prices[0];
        it.prices.push({ ...base, tier_id: t.id });
      }
      audit(db, a, "create", "settings", t.id, `إضافة نوع سعر ${t.name}`, `Added price tier ${t.name_en}`, now);
      return t;
    }),

  // Items and stock
  listItems: () => read((db, a, now) => db.items.map((it) => itemView(db, it, a, now))),
  getItem: (id) =>
    read((db, a, now) => {
      const it = db.items.find((x) => x.id === id) ?? notFound();
      return itemView(db, it, a, now);
    }),
  setItemImage: (id, image) =>
    write((db, a, now) => {
      need(a, ["manager", "warehouse"]);
      const it = db.items.find((x) => x.id === id) ?? notFound();
      if (image !== null) {
        if (!/^data:image\/(jpeg|png|webp);base64,/.test(image)) fail(422, "VALIDATION", "الملف ليس صورة", "The file is not a picture");
        // ~300 KB: the page shrinks the photo first, so a bigger one means it skipped that.
        if (image.length > 400_000) fail(422, "VALIDATION", "الصورة كبيرة جداً", "The picture is too big");
        it.image = image;
      } else delete it.image;
      return itemView(db, it, a, now);
    }),
  saveItem: (id, input) =>
    write((db, a, now) => {
      need(a, ["manager"]);
      const errors: Record<string, string> = {};
      if (!input.name.trim()) errors.name = msg("الاسم مطلوب", "Name is required");
      if (!(input.pieces_per_carton >= 1) || !Number.isInteger(input.pieces_per_carton)) errors.pieces_per_carton = msg("عدد صحيح من 1", "A whole number from 1");
      if (input.min_stock < 0) errors.min_stock = msg("لا يكون سالباً", "Can't be negative");
      if (input.commission_percent < 0 || input.commission_percent > 50) errors.commission_percent = msg("بين 0 و 50", "Between 0 and 50");
      input.prices.forEach((p) => {
        if (!(p.carton_price > 0)) errors[`prices.${p.tier_id}.carton_price`] = msg("مطلوب", "Required");
        if (!(p.piece_price > 0)) errors[`prices.${p.tier_id}.piece_price`] = msg("مطلوب", "Required");
      });
      if (db.items.some((x) => x.id !== id && x.name.trim() === input.name.trim())) errors.name = msg("توجد مادة بنفس الاسم", "An item with this name exists");
      if (Object.keys(errors).length) fail(422, "VALIDATION", "تحقق من الحقول", "Check the fields", errors);
      if (id) {
        const it = db.items.find((x) => x.id === id) ?? notFound();
        const changed = input.prices.filter((p) => {
          const old = it.prices.find((o) => o.tier_id === p.tier_id);
          return !old || old.carton_price !== p.carton_price || old.piece_price !== p.piece_price;
        });
        Object.assign(it, { ...input, name: input.name.trim(), name_en: input.name_en.trim() });
        if (changed.length) {
          const t = changed
            .map((p) => `${db.tiers.find((x) => x.id === p.tier_id)?.name}: ${p.carton_price.toLocaleString("en")}/${p.piece_price.toLocaleString("en")}`)
            .join("، ");
          audit(db, a, "price_change", "item", it.id, `تغيير سعر ${it.name} (${t}). الفواتير القديمة لا تتغير`, `Price change for ${it.name_en}. Old invoices keep their prices`, now);
        }
        audit(db, a, "update", "item", it.id, `تعديل المادة ${it.name}`, `Updated item ${it.name_en}`, now);
        return itemView(db, it, a, now);
      }
      const it: DbItem = { id: nextId(db, "item"), ...input, name: input.name.trim(), name_en: input.name_en.trim() };
      db.items.push(it);
      audit(db, a, "create", "item", it.id, `إضافة المادة ${it.name}`, `Added item ${it.name_en}`, now);
      return itemView(db, it, a, now);
    }),
  itemBatches: (itemId) =>
    read((db, a, now) => {
      need(a, ["manager", "warehouse", "accountant", "staff"]);
      return db.batches
        .filter((b) => b.item_id === itemId && (b.qty_left > 0 || b.qty_received > 0))
        .sort((x, y) => x.expiry_date.localeCompare(y.expiry_date))
        .map((b) => batchView(db, b, a, now));
    }),
  listBatches: (warehouseId) =>
    read((db, a, now) => {
      need(a, ["manager", "warehouse", "accountant", "staff"]);
      return db.batches
        .filter((b) => b.qty_left > 0 && (!warehouseId || b.warehouse_id === warehouseId))
        .sort((x, y) => x.expiry_date.localeCompare(y.expiry_date))
        .map((b) => batchView(db, b, a, now));
    }),
  shelfStock: () =>
    read((db, a, now) => {
      need(a, ["manager", "warehouse", "accountant", "staff"]);
      const today = dayOf(now);
      return db.items.map((it) => ({
        item_id: it.id,
        by_warehouse: db.warehouses.map((w) => {
          const live = physicalQty(db, it.id, w.id, today);
          const sellable = sellableQty(db, it.id, w.id, now);
          const expired = db.batches
            .filter((b) => b.item_id === it.id && b.warehouse_id === w.id && b.expiry_date < today)
            .reduce((s, b) => s + b.qty_left, 0);
          return { warehouse_id: w.id, on_shelf: live + expired, sellable, reserved: live - sellable, expired };
        }),
      }));
    }),

  // Receipts
  listReceipts: () =>
    read((db, a) => {
      need(a, ["manager", "warehouse", "accountant", "staff"]);
      return db.receipts
        .filter((r) => (a.role !== "warehouse" && a.role !== "staff") || !a.warehouse_id || r.warehouse_id === a.warehouse_id)
        .map((r) => receiptView(r, a))
        .reverse();
    }),
  getReceipt: (id) =>
    read((db, a) => {
      need(a, ["manager", "warehouse", "accountant", "staff"]);
      return receiptView(db.receipts.find((r) => r.id === id) ?? notFound(), a);
    }),
  createReceipt: (input) => write((db, a, now) => receiptView(createReceipt(db, a, input, now), a)),

  // Transfers
  listTransfers: () =>
    read((db, a) => {
      need(a, ["manager", "warehouse", "accountant", "staff"]);
      return [...db.transfers].reverse();
    }),
  createTransfer: (input) => write((db, a, now) => createTransfer(db, a, input, now)),

  // Stocktakes
  listStocktakes: () =>
    read((db, a) => {
      need(a, ["manager", "warehouse"]);
      return [...db.stocktakes].reverse();
    }),
  getStocktake: (id) =>
    read((db, a) => {
      need(a, ["manager", "warehouse"]);
      return db.stocktakes.find((s) => s.id === id) ?? notFound();
    }),
  createStocktake: (warehouseId) => write((db, a, now) => createStocktake(db, a, warehouseId, now)),
  saveStocktake: (id, lines) => write((db, a, now) => saveStocktake(db, a, id, lines, now)),
  closeStocktake: (id) => write((db, a, now) => closeStocktake(db, a, id, now)),
  listDamaged: () =>
    read((db, a) => {
      need(a, ["manager", "warehouse", "accountant"]);
      return [...db.damaged].reverse();
    }),

  // Customers
  listCustomers: () => read((db, a) => db.customers.filter((c) => canSeeCustomer(a, c) || deliversTo(db, a, c.id)).map((c) => customerView(db, c, a))),
  getCustomer: (id) =>
    read((db, a) => {
      const c = db.customers.find((x) => x.id === id);
      if (!c || !(canSeeCustomer(a, c) || deliversTo(db, a, c.id))) notFound();
      return customerView(db, c, a);
    }),
  saveCustomer: (id, input) =>
    write((db, a, now) => {
      need(a, ["manager"]);
      const phone = input.phone.replace(/\s/g, "");
      const errors: Record<string, string> = {};
      if (!input.name.trim()) errors.name = msg("اسم المحل مطلوب", "Shop name is required");
      if (!input.owner_name.trim()) errors.owner_name = msg("اسم صاحب المحل مطلوب", "Owner name is required");
      if (!/^07\d{9}$/.test(phone)) errors.phone = msg("رقم عراقي من 11 رقم يبدأ بـ 07", "An 11-digit Iraqi number starting with 07");
      if (!input.area.trim()) errors.area = msg("المنطقة مطلوبة", "Area is required");
      if (!(input.debt_limit >= 0)) errors.debt_limit = msg("أدخل سقف الدين", "Enter the debt limit");
      if (Object.keys(errors).length) fail(422, "VALIDATION", "تحقق من الحقول", "Check the fields", errors);
      const clean = { ...input, phone, name: input.name.trim(), owner_name: input.owner_name.trim(), area: input.area.trim(), address: input.address.trim() };
      if (id) {
        const c = db.customers.find((x) => x.id === id) ?? notFound();
        const wasPending = !!c.pending;
        const parts: string[] = [];
        if (c.debt_limit !== clean.debt_limit) parts.push(`سقف الدين ${c.debt_limit.toLocaleString("en")} ← ${clean.debt_limit.toLocaleString("en")}`);
        if (c.tier_id !== clean.tier_id) parts.push("نوع السعر");
        if (c.rep_id !== clean.rep_id) parts.push("مندوب التوصيل");
        Object.assign(c, clean);
        audit(db, a, "update", "customer", c.id, `تعديل الزبون ${c.name}${parts.length ? ` (${parts.join("، ")})` : ""}`, `Updated customer ${c.name}`, now);
        // A shop that signed up online: saving it as active is the approval.
        if (wasPending && c.active) approveShop(db, a, c, now);
        return customerView(db, c, a);
      }
      const c: DbCustomer = { id: nextId(db, "customer"), ...clean };
      db.customers.push(c);
      audit(db, a, "create", "customer", c.id, `إضافة الزبون ${c.name}`, `Added customer ${c.name}`, now);
      return customerView(db, c, a);
    }),
  rejectCustomer: (id, reason) => write((db, a, now) => customerView(db, rejectShop(db, a, id, reason, now), a)),
  statement: (customerId, from, to) =>
    read((db, a): Statement => {
      const c = db.customers.find((x) => x.id === customerId);
      if (!c || !canSeeCustomer(a, c)) notFound();
      need(a, ["manager", "rep", "accountant", "shop"]);
      type Row = Omit<StatementRow, "balance">;
      const rows: Row[] = [];
      for (const inv of db.invoices.filter((i) => i.customer_id === c.id)) {
        rows.push({ date: inv.date, type: "invoice", ref: inv.number, link: `/invoices/${inv.id}`, debit: inv.total, credit: 0 });
      }
      for (const p of db.payments.filter((x) => x.customer_id === c.id)) {
        if (p.amount >= 0) rows.push({ date: p.date, type: "payment", ref: p.number, link: `/payments/${p.id}`, debit: 0, credit: p.amount });
        else rows.push({ date: p.date, type: "reversal", ref: p.number, link: `/payments/${p.id}`, debit: -p.amount, credit: 0 });
      }
      for (const r of db.returns.filter((x) => x.customer_id === c.id)) {
        rows.push({ date: r.created_at, type: "return", ref: r.number, link: `/returns/${r.id}`, debit: 0, credit: r.amount });
      }
      rows.sort((x, y) => x.date.localeCompare(y.date));
      let balance = 0;
      const out: StatementRow[] = [];
      let opening = 0;
      for (const r of rows) {
        const d = dayOf(new Date(r.date));
        if (from && d < from) {
          opening += r.debit - r.credit;
          continue;
        }
        if (to && d > to) continue;
        if (!out.length && from) {
          balance = opening;
          out.push({ date: new Date(from + "T00:00:00").toISOString(), type: "opening", ref: "", debit: 0, credit: 0, balance });
        }
        balance += r.debit - r.credit;
        out.push({ ...r, balance });
      }
      if (!out.length && from) out.push({ date: new Date(from + "T00:00:00").toISOString(), type: "opening", ref: "", debit: 0, credit: 0, balance: opening });
      return {
        customer: customerView(db, c, a),
        rows: out,
        total_debit: out.reduce((s, r) => s + r.debit, 0),
        total_credit: out.reduce((s, r) => s + r.credit, 0),
        balance: out.length ? out[out.length - 1].balance : opening,
      };
    }),

  // Orders
  // orderView hides the delivery PIN from everyone except the shop owner of the order.
  listOrders: () => read((db, a) => db.orders.filter((o) => canSeeOrder(a, o)).map((o) => orderView(o, a)).reverse()),
  getOrder: (id) =>
    read((db, a) => {
      const o = db.orders.find((x) => x.id === id);
      if (!o || !canSeeOrder(a, o)) notFound();
      return orderView(o, a);
    }),

  // Support chat
  myChat: () => read((db, a) => myChat(db, a)),
  sendChat: (text) => write((db, a, now) => sendChat(db, a, text, now)),
  chatThreads: () => read((db, a) => chatThreads(db, a)),
  getChat: (customerId) => read((db, a) => chatOf(db, a, customerId)),
  replyChat: (customerId, text) => write((db, a, now) => replyChat(db, a, customerId, text, now)),
  markChatRead: (customerId) => write((db, a) => markChatRead(db, a, customerId)),

  // Delivery proof
  dispatchDelivery: (code) => write((db, a, now) => orderView(dispatchDelivery(db, a, code, now), a)),
  deliverOrder: (id, input) =>
    write((db, a, now) => {
      const r = deliverOrder(db, a, id, input, now);
      return r.ok ? { ...r, order: orderView(r.order, a) } : r;
    }),
  unlockDelivery: (id) => write((db, a, now) => orderView(unlockDelivery(db, a, id, now), a)),
  myShops: () => read((db, a) => myShops(db, a)),
  switchShop: (customerId) =>
    write((db, a) => {
      const { password: _p, ...user } = switchShop(db, a, customerId);
      void _p;
      return user;
    }),
  addShop: (input) => write((db, a, now) => addShop(db, a, input, now)),
  reportDeliveryProblem: (input) => write((db, a, now) => reportDeliveryProblem(db, a, input, now).map((o) => orderView(o, a))),
  returnToWarehouse: (id) => write((db, a, now) => orderView(returnToWarehouse(db, a, id, now), a)),
  getDeliveryPhoto: (id) =>
    read((db, a) => {
      const o = db.orders.find((x) => x.id === id);
      if (!o || !canSeeOrder(a, o)) notFound();
      return db.delivery_photos?.[id] ?? null;
    }),
  createOrder: (input) => write((db, a, now) => createOrder(db, a, input, now)),
  confirmOrder: (id) =>
    write((db, a, now) => {
      const inv = confirmOrder(db, a, id, now);
      return invoiceView(db, inv, seesProfit(a));
    }),
  approveOrder: (id) => write((db, a, now) => approveOrder(db, a, id, now)),
  updateOrder: (id, input) => write((db, a, now) => orderView(updateOrder(db, a, id, input, now), a)),
  setOrderDiscount: (id, percent) => write((db, a, now) => orderView(setOrderDiscount(db, a, id, percent, now), a)),
  cancelOrder: (id, reason) => write((db, a, now) => cancelOrder(db, a, id, reason, now)),

  // Invoices
  listInvoices: () =>
    read((db, a) => {
      need(a, ["manager", "rep", "accountant", "shop", "warehouse"]);
      return db.invoices
        .filter((i) => canSeeOrder(a, i))
        .map((i) => invoiceView(db, i, seesProfit(a)))
        .reverse();
    }),
  getInvoice: (id) =>
    read((db, a) => {
      const inv = db.invoices.find((x) => x.id === id);
      if (!inv || !canSeeOrder(a, inv)) notFound();
      const v = invoiceView(db, inv, seesProfit(a));
      // The warehouse sees which batches left, but not money owed.
      if (!seesDebt(a)) return { ...v, paid: 0, remaining: 0 };
      return v;
    }),

  // Payments
  listPayments: () =>
    read((db, a) => {
      need(a, ["manager", "rep", "accountant", "shop"]);
      return db.payments.filter((p) => {
        const c = db.customers.find((x) => x.id === p.customer_id);
        return !!c && canSeeCustomer(a, c);
      }).slice().reverse();
    }),
  getPayment: (id) =>
    read((db, a) => {
      const p = db.payments.find((x) => x.id === id);
      const c = p && db.customers.find((x) => x.id === p.customer_id);
      if (!p || !c || !canSeeCustomer(a, c) || !seesDebt(a)) notFound();
      return p;
    }),
  previewAllocation: (customerId, amount) =>
    read((db, a) => {
      const c = db.customers.find((x) => x.id === customerId);
      if (!c || !canSeeCustomer(a, c)) notFound();
      return allocate(db, customerId, Math.max(0, amount)).allocations;
    }),
  createPayment: (input) => write((db, a, now): Payment => createPayment(db, a, input, now)),

  // Online payment (Qi Card, demo gateway)
  startOnlinePayment: (input) => write((db, a, now) => startOnline(db, a, input, now)),
  getOnlinePayment: (id) =>
    read((db, a) => {
      const o = db.online_payments.find((x) => x.payment_id === id);
      if (!o || (a.role === "shop" && a.customer_id !== o.customer_id)) notFound();
      return onlineView(o);
    }),
  listOnlinePayments: () =>
    read((db, a) => {
      need(a, ["manager", "accountant", "shop"]);
      return db.online_payments
        .filter((o) => a.role !== "shop" || o.customer_id === a.customer_id)
        .map(onlineView)
        .sort((x, y) => y.created_at.localeCompare(x.created_at));
    }),
  reversePayment: (id, reason) => write((db, a, now) => reversePayment(db, a, id, reason, now)),

  // Returns
  listReturns: () =>
    read((db, a) => {
      need(a, ["manager", "rep", "accountant", "warehouse", "shop"]);
      return db.returns.filter((r) => canSeeOrder(a, { customer_id: r.customer_id, rep_id: r.rep_id, warehouse_id: db.invoices.find((i) => i.id === r.invoice_id)?.warehouse_id ?? 0 })).map(returnView).reverse();
    }),
  getReturn: (id) =>
    read((db, a) => {
      const r = db.returns.find((x) => x.id === id);
      if (!r) notFound();
      const inv = db.invoices.find((i) => i.id === r.invoice_id);
      if (!inv || !canSeeOrder(a, inv)) notFound();
      return returnView(r);
    }),
  createReturn: (input) => write((db, a, now) => returnView(createReturn(db, a, input, now))),

  // Commission
  commissions: (month) =>
    read((db, a) => {
      need(a, ["manager", "accountant", "rep"]);
      const rows = commissionRows(db, month);
      return a.role === "rep" ? rows.filter((r) => r.rep.id === a.id) : rows;
    }),
  closeMonth: (month) => write((db, a, now) => closeMonth(db, a, month, now)),
  closedMonths: () => read((db) => Object.keys(db.closed_months).sort()),

  // Reports
  dashboard: (warehouseId) =>
    read((db, a, now): Dashboard => {
      need(a, ["manager", "accountant", "warehouse"]);
      const today = dayOf(now);
      const month = today.slice(0, 7);
      const invDay = (i: { date: string }) => dayOf(new Date(i.date));
      // One warehouse only (the manager's / accountant's filter): its invoices, orders and batches.
      // Money (debts, payments) belongs to the shop, not to a warehouse, so it stays for the whole company.
      const wh = warehouseId || undefined;
      const invs = wh ? db.invoices.filter((i) => i.warehouse_id === wh) : db.invoices;
      const todays = invs.filter((i) => invDay(i) === today);
      const monthInv = invs.filter((i) => invDay(i).startsWith(month));
      const monthRet = db.returns.filter((r) => dayOf(new Date(r.created_at)).startsWith(month) && (!wh || invs.some((i) => i.id === r.invoice_id)));
      const balances = db.customers.map((c) => ({ c, b: customerBalance(db, c.id) }));
      const last7 = Array.from({ length: 7 }, (_, k) => {
        const d = new Date(now);
        d.setDate(d.getDate() - (6 - k));
        const ds = dayOf(d);
        return {
          date: ds,
          sales: invs.filter((i) => invDay(i) === ds).reduce((s, i) => s + i.total, 0),
          collected: db.payments.filter((p) => dayOf(new Date(p.date)) === ds).reduce((s, p) => s + p.amount, 0),
        };
      });
      const base: Dashboard = {
        today_sales: todays.reduce((s, i) => s + i.total, 0),
        today_invoices: todays.length,
        today_collected: db.payments.filter((p) => dayOf(new Date(p.date)) === today).reduce((s, p) => s + p.amount, 0),
        month_sales: monthInv.reduce((s, i) => s + i.total, 0) - monthRet.reduce((s, r) => s + r.amount, 0),
        total_debt: balances.reduce((s, x) => s + Math.max(0, x.b), 0),
        over_limit_customers: balances.filter((x) => x.b > x.c.debt_limit).length,
        pending_orders: db.orders.filter((o) => o.status === "pending" && canSeeOrder(a, o) && (!wh || o.warehouse_id === wh)).length,
        needs_approval: db.orders.filter((o) => o.status === "needs_approval" && (!wh || o.warehouse_id === wh)).length,
        // One warehouse: under half the minimum there (the minimum is for the whole company).
        low_stock: db.items.filter((it) => it.active && physicalQty(db, it.id, wh, today) < (wh ? it.min_stock / 2 : it.min_stock)).length,
        near_expiry: db.batches.filter((b) => b.qty_left > 0 && (!wh || b.warehouse_id === wh) && batchStatus(db, b, today) === "near_expiry").length,
        expired_batches: db.batches.filter((b) => b.qty_left > 0 && (!wh || b.warehouse_id === wh) && batchStatus(db, b, today) === "expired").length,
        last7,
      };
      if (seesProfit(a)) {
        base.month_profit =
          monthInv.reduce((s, i) => s + i.total - i.cost, 0) - monthRet.reduce((s, r) => s + r.amount - r.cost, 0);
      }
      if (!seesDebt(a)) {
        base.total_debt = 0;
        base.over_limit_customers = 0;
        base.today_collected = 0;
      }
      return base;
    }),
  dailySales: (date, warehouseId) =>
    read((db, a): DailySales => {
      need(a, ["manager", "accountant"]);
      const by_rep = salesRows(db, a, "rep", date, date, warehouseId || undefined);
      const by_warehouse = salesRows(db, a, "warehouse", date, date, warehouseId || undefined);
      return {
        date,
        sales: by_warehouse.reduce((s, r) => s + r.sales, 0),
        invoices: by_warehouse.reduce((s, r) => s + r.invoices, 0),
        returns: by_warehouse.reduce((s, r) => s + r.returns, 0),
        collected: db.payments.filter((p) => dayOf(new Date(p.date)) === date).reduce((s, p) => s + p.amount, 0),
        by_rep,
        by_warehouse,
      };
    }),
  salesReport: (group, from, to, warehouseId) =>
    read((db, a) => {
      need(a, ["manager", "accountant"]);
      return salesRows(db, a, group, from, to, warehouseId || undefined);
    }),
  slowMoving: (days) =>
    read((db, a, now): SlowItem[] => {
      need(a, ["manager", "warehouse", "accountant"]);
      const today = dayOf(now);
      return db.items
        .map((it) => {
          const last = db.invoices
            .filter((i) => i.lines.some((l) => l.item_id === it.id))
            .map((i) => dayOf(new Date(i.date)))
            .sort()
            .pop();
          const stock = physicalQty(db, it.id, undefined, today);
          return { item_id: it.id, last_sale: last, days: last ? daysBetween(last, today) : null, stock };
        })
        .filter((r) => r.stock > 0 && (r.days === null || r.days >= days))
        .sort((x, y) => (y.days ?? 9999) - (x.days ?? 9999));
    }),
  nearExpiry: (days) =>
    read((db, a, now): NearExpiryRow[] => {
      need(a, ["manager", "warehouse", "accountant", "staff"]);
      const today = dayOf(now);
      return db.batches
        .filter((b) => b.qty_left > 0 && daysBetween(today, b.expiry_date) <= days)
        .sort((x, y) => x.expiry_date.localeCompare(y.expiry_date))
        .map((b) => ({ batch: batchView(db, b, a, now), days_left: daysBetween(today, b.expiry_date) }));
    }),
  debts: () =>
    read((db, a): DebtRow[] => {
      need(a, ["manager", "accountant", "rep"]);
      return db.customers
        .filter((c) => canSeeCustomer(a, c))
        .map((c) => {
          const open = db.invoices.filter((i) => i.customer_id === c.id && i.total - i.paid - i.returned > 0);
          return {
            customer: customerView(db, c, a),
            oldest_open: open.map((i) => i.date).sort()[0],
            open_invoices: open.length,
          };
        })
        .filter((r) => (r.customer.balance ?? 0) > 0)
        .sort((x, y) => (y.customer.balance ?? 0) - (x.customer.balance ?? 0));
    }),

  // Audit and notifications
  listAudit: () =>
    read((db, a): AuditEntry[] => {
      need(a, ["manager"]);
      // Newest first, by time (some entries are written later than they happened, e.g. a timed-out hold).
      return [...db.audit].sort((x, y) => y.at.localeCompare(x.at) || y.id - x.id);
    }),
  listNotifications: () =>
    read((db, a) =>
      db.notifications
        .filter((n) => n.roles.includes(a.role) && (!n.user_id || n.user_id === a.id))
        .slice()
        .reverse(),
    ),
  markRead: (id) =>
    write((db) => {
      const n = db.notifications.find((x) => x.id === id);
      if (n) n.read = true;
      return null;
    }),
  markAllRead: () =>
    write((db, a) => {
      for (const n of db.notifications) if (n.roles.includes(a.role) && (!n.user_id || n.user_id === a.id)) n.read = true;
      return null;
    }),

  // Demo only
  resetDemo: async () => {
    await wait(300);
    clearDb();
    loadDb(() => makeSeed());
    emitChange();
  },
};

// ---------- The demo Qi Card gateway ----------
// A stand-in for the gateway's own website, only in the demo. With the real backend the customer goes to
// Qi's page and this is never used. It changes the stored data directly, like an outside service would.
export const demoGateway = {
  /** What the payment page shows: the amount, and whether it was already finished. */
  info: async (paymentId: string) => {
    await wait(300);
    const db = db0();
    db.online_payments ??= [];
    const o = db.online_payments.find((x) => x.payment_id === paymentId);
    if (!o) notFound();
    const customer = db.customers.find((c) => c.id === o.customer_id);
    return { amount: o.amount, shop: customer?.name ?? "", finished: !!o.outcome || o.status !== "created" };
  },
  /** The customer finished on the payment page. Returns the address to send them back to. */
  finish: async (paymentId: string, outcome: Exclude<OnlineStatus, "created">) => {
    await wait(600);
    const db = db0();
    const o = db.online_payments.find((x) => x.payment_id === paymentId);
    if (!o) notFound();
    // The gateway's notification reaches our server a moment after the customer is sent back.
    if (!o.outcome) Object.assign(o, { outcome, settles_at: Date.now() + 1500 });
    saveDb(db);
    emitChange();
    return `${o.return_url}${o.return_url.includes("?") ? "&" : "?"}payment=${encodeURIComponent(o.payment_id)}`;
  },
};
