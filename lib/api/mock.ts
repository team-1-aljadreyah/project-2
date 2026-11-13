// The fake backend. It has exactly the same functions as the real one (http.ts), follows the client's rules
// (rules.ts) and hides fields by role like a real server would. Pages never know which one they use.
import { publish } from "../realtime";
import { clearToken, getSession } from "../auth";
import { isOffline } from "../offline";
import { ApiError, NETWORK_ERROR } from "./errors";
import type { Api } from "./http";
import type {
  OnlinePayment,
  AuditEntry,
  Order,
  Warehouse,
  WarehouseInput,
  WarehouseCover,
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
  User,
  ProfileAction,
  Health,
  HealthCheck,
  LoginFail,
  SiteCustom,
  CustomField,
  CustomObject,
  CustomValue,
} from "./types";
import { EXPENSE_APPROVAL_ABOVE, RULE_FIELDS, inHours, repDoes, worksIn } from "./types";
import { clearDb, emitChange, loadDb, nextId, saveDb, type Db, type DbBatch, type DbCustomer, type DbItem, type DbReturn, type DbUser } from "./mock/db";
import {
  approveOrder,
  counterSale,
  settleZainCash,
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
  commissionLines,
  setUsdRate,
  usdRateOn,
  acceptOrder,
  createSupplyOrder,
  cancelSupplyOrder,
  creditInvoice,
  refundCustomer,
  cleanAddress,
  receiveTransfer,
  reviewTransfer,
  setSpecialPrice,
  holdBatch,
  releaseBatch,
  traceBatch,
  prepPlan,
  prepareOrder,
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
  planShipments,
  vehiclesOf,
  deliveryRepId,
  notify,
  person,
  startOnline,
  physicalQty,
  registerShop,
  rejectShop,
  reversePayment,
  saveStocktake,
  sellableQty,
  sweep,
  expensesOf,
  createExpense,
  decideExpense,
  cancelExpense,
  monthExpenses,
  runRules,
  setMyPhoto,
  changeMyPassword,
  removeMyShop,
  deleteMyAccount,
  deleteUser,
  removeUserPhoto,
} from "./mock/rules";
import { makeSeed } from "./mock/seed";
import { autoVisit, listVisits, recordVisit, setVisitDays, visitsReport } from "./mock/visits";
import { cancelHandover, confirmHandover, createHandover, custodyList, custodyLog } from "./mock/custody";
import { fullSite, ordered } from "./site-defaults";
import { guessWeight, linesWeight, vehicleLoad } from "./vehicles";
import { layoutOf, zoneOfItem } from "./warehouse-layout";
import { unitName } from "../units";
import { zcInit, zcInquiry, zcReadReturn, zcToOurs } from "../zaincash";
import { currentLocale } from "../boot";

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
const db0 = () => loadDb(() => makeSeed());

const COST_ROLES: Role[] = ["manager", "accountant", "warehouse"];
const PROFIT_ROLES: Role[] = ["manager", "accountant"];
const seesCost = (u: DbUser) => COST_ROLES.includes(u.role);
// A permission profile (advanced settings) can hide money, take actions away, make a person see-only, and
// set their login hours.
const profileFor = (u: DbUser) => (u.profile_id ? fullSite(db0().custom).profiles.find((x) => x.id === u.profile_id && x.role === u.role) : undefined);
const limitsOf = (u: DbUser) => profileFor(u)?.limits ?? {};
/** A profile took this action away: the server refuses it with the reason. */
function mayDo(u: DbUser, action: ProfileAction) {
  if (!profileFor(u)?.deny_actions?.includes(action)) return;
  const what: Record<ProfileAction, string> = { cancel_orders: "إلغاء الطلبات", discount: "إعطاء الخصم", payments: "تسجيل التسديدات", returns: "تسجيل المرتجعات", export: "التصدير" };
  fail(403, "FORBIDDEN", `ليس من صلاحيات ملفك: ${what[action]}`, "Your profile doesn't allow this");
}
/** Outside the profile's login hours: refused (and the session ends). */
function checkHours(u: DbUser, now: Date) {
  const h = profileFor(u)?.hours;
  if (h && !inHours(h, now)) {
    clearToken();
    fail(401, "UNAUTHENTICATED", `خارج ساعات الدخول المسموحة لك (${h.from} – ${h.to})`, `Outside your login hours (${h.from}–${h.to})`);
  }
}
const seesProfit = (u: DbUser) => PROFIT_ROLES.includes(u.role) && !limitsOf(u).no_profit;
// The warehouse people never see debts (keeper and staff).
const seesDebt = (u: DbUser) => u.role !== "warehouse" && u.role !== "staff" && !limitsOf(u).no_debt;

function actorOf(db: Db): DbUser {
  const s = getSession();
  const id = s?.token?.startsWith("mock.") ? Number(s.token.slice(5)) : NaN;
  const u = db.users.find((x) => x.id === id);
  if (!u || !u.active) {
    // A deleted or stopped account: back to the login page (not an endless error).
    clearToken();
    throw new ApiError(401, msg("انتهت الجلسة، سجّل الدخول من جديد", "Your session ended. Log in again"), undefined, "UNAUTHENTICATED");
  }
  checkHours(u, new Date());
  // A keeper who covers another warehouse now (temporary cover): known once for the whole request.
  if (u.role === "warehouse") {
    const nowIso = new Date().toISOString();
    const covering = db.warehouses.filter((w) => w.cover?.user_id === u.id && w.cover.until > nowIso).map((w) => w.id);
    if (covering.length) return { ...u, covering };
  }
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
async function write<T>(fn: (db: Db, actor: DbUser, now: Date) => T, opts: { anonymous?: boolean; self?: boolean } = {}): Promise<T> {
  await wait(250 + Math.random() * 250);
  if (isOffline()) throw new ApiError(NETWORK_ERROR, msg("لا يوجد اتصال بالإنترنت", "No internet connection"), undefined, "NETWORK");
  const draft = structuredClone(db0());
  const now = new Date();
  sweep(draft, now);
  const before = liveMarks(draft);
  const actor = opts.anonymous ? (null as unknown as DbUser) : actorOf(draft);
  // A see-only profile changes nothing but its own account and notifications (`self`).
  if (actor && !opts.self && profileFor(actor)?.read_only) fail(403, "FORBIDDEN", "ملفك للعرض فقط: لا يمكنك تغيير شيء", "Your profile is see-only");
  const result = fn(draft, actor, now);
  saveDb(draft);
  emitChange();
  // Tell the live layer what changed, as the real backend does over its WebSocket (lib/realtime.ts).
  const after = liveMarks(draft);
  if (after.notes !== before.notes) publish("notifications", "new");
  if (after.chat !== before.chat) publish("chat", "message", { customer_id: draft.chat?.at(-1)?.customer_id });
  if (after.orders !== before.orders) publish("orders", "changed");
  return structuredClone(result);
}

/** A change to the person's own things (account, notifications): allowed even for a see-only profile. */
const selfWrite = <T>(fn: (db: Db, actor: DbUser, now: Date) => T) => write(fn, { self: true });

/** Small marks to see what a write changed (for the live events). */
function liveMarks(db: Db) {
  return {
    notes: db.notifications.length,
    chat: db.chat?.length ?? 0,
    orders: db.orders.map((o) => `${o.id}${o.status[0]}${o.delivery?.status?.[0] ?? ""}${o.lines.length}`).join(""),
  };
}

// ---------- views: what each role may see ----------

function itemView(db: Db, it: DbItem, actor: DbUser, now: Date): Item {
  it = { ...it, weight_kg: it.weight_kg ?? guessWeight(it.name_en) };
  const today = dayOf(now);
  const by_warehouse = db.warehouses.map((w) => ({ warehouse_id: w.id, qty: sellableQty(db, it.id, w.id, now) }));
  const live = db.batches.filter((b) => b.item_id === it.id && b.qty_left > 0 && b.expiry_date >= today);
  const nearest = live.map((b) => b.expiry_date).sort()[0];
  const pieces = live.reduce((s, b) => s + b.qty_left, 0);
  const avg = pieces ? Math.round(live.reduce((s, b) => s + b.qty_left * b.purchase_price, 0) / pieces) : undefined;
  let prices = it.prices;
  // A shop owner sees only his own price (his special price for this item if he has one).
  if (actor.role === "shop") {
    const c = db.customers.find((x) => x.id === actor.customer_id);
    const sp = (db.special_prices ?? []).find((x) => x.customer_id === c?.id && x.item_id === it.id);
    prices = sp && c ? [{ tier_id: c.tier_id, carton_price: sp.carton_price, piece_price: sp.piece_price }] : it.prices.filter((p) => p.tier_id === c?.tier_id);
  }
  const custom = customOf(db, "item", it.id, actor);
  return {
    ...it,
    ...(custom ? { custom } : {}),
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
  const last = db.orders
    .filter((o) => o.customer_id === c.id)
    .map((o) => o.created_at)
    .sort()
    .pop();
  const { debt_limit, ...rest } = c;
  const custom = customOf(db, "customer", c.id, actor);
  return { ...rest, ...(custom ? { custom } : {}), last_order_at: last, ...(seesDebt(actor) ? { debt_limit, balance: customerBalance(db, c.id) } : {}) };
}

// ---------- the manager's own fields (advanced settings → object manager) ----------

const fieldsOf = (object: CustomObject) => fullSite(db0().custom).fields.filter((f) => f.active && f.object === object);
const mayView = (f: CustomField, actor: DbUser) => actor.role === "manager" || !f.view_roles.length || f.view_roles.includes(actor.role);
const mayEdit = (f: CustomField, actor: DbUser) => actor.role === "manager" || (mayView(f, actor) && f.edit_roles.includes(actor.role));

/** The values of a record's own fields this person may see (undefined = none). */
function customOf(db: Db, object: CustomObject, id: number, actor: DbUser) {
  const all = db.custom_values?.[`${object}:${id}`];
  if (!all) return undefined;
  const out: Record<string, CustomValue> = {};
  for (const f of fieldsOf(object)) if (f.id in all && mayView(f, actor)) out[f.id] = all[f.id];
  return Object.keys(out).length ? out : undefined;
}

const emptyValue = (v: unknown) => v === undefined || v === null || v === "";

/** One value, checked against its field's type. */
function cleanValue(f: CustomField, v: unknown): CustomValue | undefined {
  if (emptyValue(v)) return undefined;
  const bad = () => fail(422, "VALIDATION", `قيمة «${f.label}» غير صحيحة`, `${f.label_en || f.label}: not a valid value`, { [`custom.${f.id}`]: msg("قيمة غير صحيحة", "Not valid") });
  switch (f.type) {
    case "number": {
      const n = Number(v);
      return Number.isFinite(n) ? n : bad();
    }
    case "date":
      return typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : bad();
    case "yesno":
      return typeof v === "boolean" ? v : bad();
    case "list":
      return typeof v === "string" && (f.options ?? []).includes(v) ? v : bad();
    default: {
      const t = String(v).trim();
      if (t.length > 500) fail(422, "VALIDATION", `«${f.label}» طويل جداً`, "Too long", { [`custom.${f.id}`]: msg("حتى 500 حرف", "Up to 500 characters") });
      return t || undefined;
    }
  }
}

function canSeeCustomer(actor: DbUser, c: { id: number; rep_id: number }) {
  if (actor.role === "rep") return c.rep_id === actor.id;
  if (actor.role === "shop") return actor.customer_id === c.id;
  return true;
}

/** A rep sells only the categories the manager gave him (none set = all). */
function repMaySell(actor: DbUser, category: string) {
  return actor.role !== "rep" || !actor.rep_categories?.length || actor.rep_categories.includes(category);
}

/** The details of a new or changed warehouse, checked. `id` 0 = a new one. */
function checkWarehouse(db: Db, input: WarehouseInput, id: number): Omit<Warehouse, "id" | "layout"> {
  const errors: Record<string, string> = {};
  const name = input.name.trim();
  if (!name) errors.name = msg("الاسم مطلوب", "Name is required");
  else if (db.warehouses.some((w) => w.id !== id && w.name.trim() === name)) errors.name = msg("يوجد مخزن بهذا الاسم", "A warehouse with this name exists");
  if (!(input.capacity >= 1) || !Number.isInteger(input.capacity)) errors.capacity = msg("عدد صحيح من 1", "A whole number from 1");
  if (Object.keys(errors).length) fail(422, "VALIDATION", "تحقق من الحقول", "Check the fields", errors);
  const placed = input.lat !== undefined && input.lng !== undefined;
  return { name, name_en: input.name_en.trim() || name, capacity: input.capacity, ...(placed ? { lat: input.lat, lng: input.lng } : {}) };
}

/** A keeper / staff: batches, expiry dates and movements of their own warehouse only. */
function ownWarehouse(actor: DbUser, warehouseId: number) {
  return worksIn(actor, warehouseId);
}

/** A delivery rep sees the shops he has shipments for (name, area, phone), even if they aren't his. */
function deliversTo(db: Db, actor: DbUser, customerId: number) {
  return actor.role === "rep" && db.orders.some((o) => o.customer_id === customerId && o.delivery?.rep?.id === actor.id && o.delivery.status !== "delivered");
}

function canSeeOrder(actor: DbUser, o: { customer_id: number; rep_id: number; warehouse_id: number; delivery?: { rep?: { id: number } }; prep_parts?: { warehouse_id: number }[] }) {
  // A rep sees his shops' orders, and the ones he delivers.
  if (actor.role === "rep") return o.rep_id === actor.id || o.delivery?.rep?.id === actor.id;
  if (actor.role === "shop") return o.customer_id === actor.customer_id;
  if (actor.role === "warehouse" || actor.role === "staff") return worksIn(actor, o.warehouse_id) || !!o.prep_parts?.some((p) => worksIn(actor, p.warehouse_id));
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
      // Rep 0: the counter sales (sold at the warehouse, no rep).
      if (id === 0) return ["بيع مباشر", "Counter sales"];
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

/** An order as the pages get it, with the values of the manager's fields this person may see. */
function withCustom(db: Db, o: Order, a: DbUser): Order {
  const custom = customOf(db, "order", o.id, a);
  return custom ? { ...o, custom } : o;
}

/** The profile chosen in the users form: one of the same job, or none (also when the job changed). */
function setProfileFrom(db: Db, u: DbUser, id: string | null | undefined) {
  if (id === undefined && (!u.profile_id || fullSite(db.custom).profiles.find((p) => p.id === u.profile_id)?.role === u.role)) return;
  const p = id ? fullSite(db.custom).profiles.find((x) => x.id === id && x.role === u.role) : undefined;
  if (p) u.profile_id = p.id;
  else delete u.profile_id;
}

/** Advanced settings as saved: every profile and app must make sense (names, jobs, colors, pages). */
function checkAdvanced(s: SiteCustom) {
  // The store's ads: a picture (not too big), a title, a link to something in the store.
  if (s.banners.length > 12) fail(422, "VALIDATION", "12 إعلاناً على الأكثر", "12 ads at most");
  for (const b of s.banners) {
    if (!b.id || !b.title?.trim() || b.title.length > 60) fail(422, "VALIDATION", "عنوان الإعلان مطلوب (60 حرفاً على الأكثر)", "The ad needs a title (60 letters at most)");
    if (!/^data:image\/(jpeg|png|webp);base64,/.test(b.image ?? "") || b.image.length > 600_000) fail(422, "VALIDATION", "صورة الإعلان غير صحيحة أو كبيرة جداً", "The ad's picture is wrong or too big");
    if (!["category", "brand", "item", "search"].includes(b.link?.kind) || typeof b.link.value !== "string") fail(422, "VALIDATION", "اختر ما يفتحه الإعلان", "Choose what the ad opens");
  }
  const ids = new Set<string>();
  for (const p of s.profiles) {
    if (!p.id || ids.has(p.id)) fail(422, "VALIDATION", "ملف مكرر", "Duplicate profile");
    ids.add(p.id);
    if (!p.name?.trim()) fail(422, "VALIDATION", "اسم ملف الصلاحيات مطلوب", "The profile needs a name");
    if (!["warehouse", "staff", "rep", "accountant", "shop"].includes(p.role)) fail(422, "VALIDATION", "اختر وظيفة الملف", "Choose the profile's job");
    if (!Array.isArray(p.denied) || p.denied.some((h) => typeof h !== "string" || !h.startsWith("/"))) fail(422, "VALIDATION", "صفحات غير صحيحة", "Wrong pages");
  }
  const apps = new Set<string>();
  for (const x of s.apps) {
    if (!x.id || apps.has(x.id)) fail(422, "VALIDATION", "تطبيق مكرر", "Duplicate app");
    apps.add(x.id);
    if (!x.name?.trim()) fail(422, "VALIDATION", "اسم التطبيق مطلوب", "The app needs a name");
    if (!/^#[0-9a-f]{6}$/i.test(x.color)) fail(422, "VALIDATION", "لون التطبيق غير صحيح", "The app's color isn't valid");
    if (!x.pages.length) fail(422, "VALIDATION", `اختر صفحات «${x.name}»`, `Choose the pages of ${x.name}`);
    if (x.pages.some((h) => typeof h !== "string" || !h.startsWith("/"))) fail(422, "VALIDATION", "صفحات غير صحيحة", "Wrong pages");
  }
  for (const p of s.profiles) if (p.default_app && !apps.has(p.default_app)) delete p.default_app;
  const ruleIds = new Set<string>();
  for (const r of s.rules) {
    if (!r.id || ruleIds.has(r.id)) fail(422, "VALIDATION", "قاعدة مكررة", "Duplicate rule");
    ruleIds.add(r.id);
    if (!r.name?.trim()) fail(422, "VALIDATION", "اسم القاعدة مطلوب", "The rule needs a name");
    const offered = RULE_FIELDS[r.trigger];
    if (!offered) fail(422, "VALIDATION", "اختر متى تعمل القاعدة", "Choose when the rule runs");
    for (const c of r.conditions) {
      const f = offered.find((x) => x.key === c.field);
      if (!f) fail(422, "VALIDATION", `شرط غير صحيح في «${r.name}»`, `A wrong condition in ${r.name}`);
      if (!["gt", "gte", "lt", "eq", "neq"].includes(c.op)) fail(422, "VALIDATION", `شرط غير صحيح في «${r.name}»`, `A wrong condition in ${r.name}`);
      if (f.type === "number" && !Number.isFinite(Number(c.value))) fail(422, "VALIDATION", `اكتب رقماً في شرط «${f.ar}»`, `Write a number in ${f.en}`);
      if (f.type === "text" && !String(c.value).trim()) fail(422, "VALIDATION", `اكتب قيمة شرط «${f.ar}»`, `Write the value of ${f.en}`);
    }
    if (!r.notify.length && !r.approval) fail(422, "VALIDATION", `«${r.name}» لا تفعل شيئاً: اختر من يُبلَّغ أو اطلب الموافقة`, `${r.name} does nothing yet`);
  }
  const fields = new Set<string>();
  for (const f of s.fields) {
    if (!f.id || fields.has(f.id)) fail(422, "VALIDATION", "حقل مكرر", "Duplicate field");
    fields.add(f.id);
    if (!f.label?.trim()) fail(422, "VALIDATION", "اسم الحقل مطلوب", "The field needs a name");
    if (!["customer", "item", "order"].includes(f.object)) fail(422, "VALIDATION", "اختر مكان الحقل", "Choose where the field goes");
    if (!["text", "number", "date", "list", "yesno"].includes(f.type)) fail(422, "VALIDATION", "نوع الحقل غير صحيح", "Wrong field type");
    if (f.type === "list" && !(f.options ?? []).filter((o) => o.trim()).length) fail(422, "VALIDATION", `أضف خيارات «${f.label}»`, `Add the choices of ${f.label}`);
    if (s.fields.some((x) => x !== f && x.object === f.object && x.label.trim() === f.label.trim())) fail(422, "VALIDATION", `يوجد حقل باسم «${f.label}»`, "A field with this name exists");
  }
}

/** A user as the pages get it: no password, nothing worked out per request. */
function strip(u: DbUser): User {
  const { password: _p, covering: _c, ...user } = u;
  void _p;
  void _c;
  return user;
}

// ---------- the API ----------

export const mockApi: Api = {
  // Auth
  login: (phone, password) =>
    write(
      (db, _a, now): Session => {
        const clean = phone.replace(/\s/g, "");
        const u = db.users.find((x) => x.phone === clean);
        // A failed attempt is written down for the health page (outside this request, which is thrown away).
        const refuse = (reason: LoginFail, status: number, code: "UNAUTHENTICATED" | "FORBIDDEN", ar: string, en: string): never => {
          const live = db0();
          (live.login_log ??= []).push({ phone: clean, ...(u ? { user_id: u.id } : {}), ok: false, reason, at: now.toISOString() });
          live.login_log = live.login_log.slice(-2000);
          saveDb(live);
          return fail(status, code, ar, en);
        };
        if (!u || u.password !== password) return refuse("wrong", 401, "UNAUTHENTICATED", "رقم الهاتف أو كلمة المرور غير صحيحة", "Wrong phone number or password");
        if (!u.active) return refuse("stopped", 403, "FORBIDDEN", "هذا الحساب موقوف، راجع المدير", "This account is disabled. Contact the manager");
        const hours = profileFor(u)?.hours;
        if (hours && !inHours(hours, now)) return refuse("hours", 403, "FORBIDDEN", `لا يمكنك الدخول الآن: ساعات دخولك ${hours.from} – ${hours.to}`, `You can't log in now: your hours are ${hours.from}–${hours.to}`);
        (db.login_log ??= []).push({ phone: clean, user_id: u.id, ok: true, at: now.toISOString() });
        db.login_log = db.login_log.slice(-2000);
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
      // `covering` is worked out per request (the warehouses' covers are the truth): not part of the user.
      const { password: _p, covering: _c, ...user } = a;
      void _c;
      void _p;
      return user;
    }),

  // Lookups: names every screen needs (warehouses, tiers, staff names, categories)
  lookups: () =>
    read((db) => ({
      warehouses: db.warehouses,
      vehicles: vehiclesOf(db),
      tiers: db.tiers,
      reps: db.users.filter((u) => u.role === "rep" && !u.deleted).map((u) => ({ id: u.id, name: u.name, phone: u.phone, ...(u.rep_kinds?.length ? { kinds: u.rep_kinds } : {}) })),
      categories: ordered([...new Set(db.items.map((i) => i.category))], db.custom?.categories ?? [], (c) => c),
      settings: db.settings,
      usd_rate: usdRateOn(db, dayOf(new Date())) ?? null,
    })),
  usdRates: () =>
    read((db, a) => {
      need(a, ["accountant", "manager"]);
      return [...(db.usd_rates ?? [])].sort((x, y) => y.date.localeCompare(x.date)).slice(0, 30);
    }),
  setUsdRate: (rate) => write((db, a, now) => setUsdRate(db, a, rate, now)),
  commissionLines: (month) =>
    read((db, a) => {
      need(a, ["manager", "accountant", "rep"]);
      return commissionLines(db, month, a.role === "rep" ? a.id : undefined);
    }),

  // Expenses (صرفيات): the accountant and the manager
  listExpenses: () =>
    read((db, a) => {
      need(a, ["accountant", "manager"]);
      return [...expensesOf(db)].sort((x, y) => y.date.localeCompare(x.date) || y.id - x.id);
    }),
  getExpense: (id) =>
    read((db, a) => {
      need(a, ["accountant", "manager"]);
      return expensesOf(db).find((e) => e.id === id) ?? notFound();
    }),
  createExpense: (input) =>
    write((db, a, now) => {
      const e = createExpense(db, a, input, now);
      const wait = runRules(db, "expense_created", { amount: e.amount, category: e.category, method: e.method }, { number: e.number, link: `/expenses/${e.id}`, by: a.name }, now);
      // A rule asks for the manager's OK: an expense that would count at once waits for him first.
      if (wait.length && e.status === "approved" && a.role !== "manager") e.status = "pending";
      return e;
    }),
  decideExpense: (id, ok, reason) => write((db, a, now) => decideExpense(db, a, id, ok, reason ?? "", now)),
  cancelExpense: (id, reason) => write((db, a, now) => cancelExpense(db, a, id, reason, now)),

  // Your own account
  setMyPhoto: (photo) => write((db, a) => strip(setMyPhoto(db, a, photo)), { self: true }),
  changeMyPassword: (current, next) => write((db, a) => changeMyPassword(db, a, current, next), { self: true }),
  removeMyShop: (customerId, password) => write((db, a, now) => strip(removeMyShop(db, a, customerId, password, now)), { self: true }),
  deleteMyAccount: (password) => write((db, a, now) => deleteMyAccount(db, a, password, now), { self: true }),

  // Automation rules: what they did lately (the manager)
  ruleRuns: () =>
    read((db, a) => {
      need(a, ["manager"]);
      return [...(db.rule_runs ?? [])].reverse().slice(0, 100);
    }),

  // Health and security (the manager)
  health: () =>
    read((db, a, now): Health => {
      need(a, ["manager"]);
      const day = now.getTime() - 86_400_000;
      const log = (db.login_log ?? []).filter((x) => new Date(x.at).getTime() >= day);
      const failed = log.filter((x) => !x.ok);
      const reasons: Record<LoginFail, number> = { wrong: 0, stopped: 0, hours: 0 };
      for (const f of failed) reasons[f.reason ?? "wrong"]++;
      const live = db.users.filter((u) => !u.deleted);
      const active = live.filter((u) => u.active);
      // The last login of each person (from the logins written down, or the activity log).
      const last = new Map<number, string>();
      for (const x of db.login_log ?? []) if (x.ok && x.user_id) last.set(x.user_id, x.at);
      for (const e of db.audit) if (e.action === "login" && (!last.has(e.user.id) || last.get(e.user.id)! < e.at)) last.set(e.user.id, e.at);
      const person = (u: DbUser) => ({ id: u.id, name: u.name, role: u.role });
      const never = active.filter((u) => !last.has(u.id)).map(person);
      const idle = active.filter((u) => last.has(u.id) && now.getTime() - new Date(last.get(u.id)!).getTime() > 30 * 86_400_000).map((u) => ({ ...person(u), last: last.get(u.id)! }));
      const weak = active.filter((u) => u.password.length < 8 || /^(\d)\1+$/.test(u.password) || ["123456", "12345678", "password", "000000"].includes(u.password) || u.password === u.phone).map(person);
      const managers = active.filter((u) => u.role === "manager").length;
      const by_role = { manager: 0, accountant: 0, warehouse: 0, staff: 0, rep: 0, shop: 0 } as Record<Role, number>;
      for (const u of active) by_role[u.role]++;
      const site = fullSite(db.custom);
      const limit = db.settings.expense_approval_above ?? EXPENSE_APPROVAL_ABOVE;
      const rate = log.length ? failed.length / log.length : 0;
      const checks: HealthCheck[] = [
        {
          key: "passwords",
          ok: weak.length === 0,
          weight: 30,
          title: "كلمات مرور قوية",
          title_en: "Strong passwords",
          detail: weak.length ? `${weak.length} حساب بكلمة مرور سهلة التخمين (مثل 123456 أو رقم الهاتف). غيّرها من صفحة المستخدمين.` : "لا أحد يستعمل كلمة مرور سهلة.",
          detail_en: weak.length ? `${weak.length} accounts use an easy password.` : "Nobody uses an easy password.",
          fix: "/users",
        },
        {
          key: "managers",
          ok: managers <= 2,
          weight: 15,
          title: "عدد قليل من المدراء",
          title_en: "Few managers",
          detail: managers <= 2 ? `${managers} حساب مدير فقط.` : `${managers} حسابات مدير: المدير يرى ويغيّر كل شيء، فاجعلهم أقل ما يمكن.`,
          detail_en: `${managers} manager accounts.`,
          fix: "/users",
        },
        {
          key: "logins",
          ok: rate < 0.2 && failed.length < 10,
          weight: 20,
          title: "محاولات دخول فاشلة قليلة",
          title_en: "Few failed logins",
          detail: failed.length ? `${failed.length} محاولة فاشلة من ${log.length} في آخر 24 ساعة.` : "لا محاولات فاشلة في آخر 24 ساعة.",
          detail_en: `${failed.length} failed of ${log.length} in 24 hours.`,
          fix: "/settings/advanced?s=health",
        },
        {
          key: "idle",
          ok: idle.length === 0,
          weight: 15,
          title: "لا حسابات خاملة",
          title_en: "No idle accounts",
          detail: idle.length ? `${idle.length} حساب فعّال لم يدخل منذ أكثر من 30 يوماً: أوقفه إن لم يعد يعمل.` : "كل الحسابات الفعّالة مستعملة.",
          detail_en: `${idle.length} active accounts unused for 30+ days.`,
          fix: "/users",
        },
        {
          key: "expenses",
          ok: limit > 0 && limit <= 5_000_000,
          weight: 10,
          title: "حد موافقة الصرفيات",
          title_en: "Expense approval limit",
          detail: `الصرفيات فوق ${limit.toLocaleString("en-US")} د.ع تنتظر موافقتك${limit > 5_000_000 ? "، والحد مرتفع" : ""}.`,
          detail_en: `Expenses above ${limit} IQD wait for you.`,
          fix: "/settings",
        },
        {
          key: "profiles",
          ok: site.profiles.length > 0,
          weight: 10,
          title: "صلاحيات على قدر العمل",
          title_en: "Access fits the work",
          detail: site.profiles.length ? `${site.profiles.length} ملف صلاحيات مستعمل.` : "لا ملفات صلاحيات بعد: كل شخص يرى كل ما تسمح به وظيفته.",
          detail_en: `${site.profiles.length} permission profiles.`,
          fix: "/settings/advanced?s=profiles",
        },
      ];
      const total = checks.reduce((s, c) => s + c.weight, 0);
      const score = Math.round((checks.filter((c) => c.ok).reduce((s, c) => s + c.weight, 0) / total) * 100);
      const nameOf = (id?: number) => (id ? db.users.find((u) => u.id === id)?.name : undefined);
      return {
        logins: {
          ok: log.length - failed.length,
          failed: failed.length,
          reasons,
          recent: failed
            .slice(-10)
            .reverse()
            .map((f) => ({ phone: f.phone, ...(nameOf(f.user_id) ? { name: nameOf(f.user_id) } : {}), reason: f.reason ?? "wrong", at: f.at })),
        },
        score,
        checks,
        users: { active: active.length, stopped: live.length - active.length, managers, in_profiles: active.filter((u) => u.profile_id).length, by_role, never, idle, weak },
      };
    }),

  // Users
  setUserProfile: (id, profileId) =>
    write((db, a, now) => {
      need(a, ["manager"]);
      const u = db.users.find((x) => x.id === id && !x.deleted) ?? notFound();
      if (profileId) {
        const p = fullSite(db.custom).profiles.find((x) => x.id === profileId) ?? notFound();
        if (p.role !== u.role) fail(422, "VALIDATION", "هذا الملف لوظيفة أخرى", "This profile is for another job");
        u.profile_id = p.id;
        audit(db, a, "update", "user", u.id, `${u.name} في ملف الصلاحيات «${p.name}»`, `${u.name} → profile ${p.name}`, now);
      } else if (u.profile_id) {
        delete u.profile_id;
        audit(db, a, "update", "user", u.id, `${u.name} عاد إلى صلاحيات وظيفته المعتادة`, `${u.name} → the job's usual access`, now);
      }
      return strip(u);
    }),
  deleteUser: (id) => write((db, a, now) => deleteUser(db, a, id, now)),
  removeUserPhoto: (id) => write((db, a, now) => strip(removeUserPhoto(db, a, id, now))),
  listUsers: () =>
    read((db, a) => {
      need(a, ["manager"]);
      return db.users.filter((u) => !u.deleted).map((u) => {
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
      if (input.sales_target != null && !(input.sales_target >= 0 && input.sales_target < 1e13)) errors.sales_target = msg("الهدف غير صحيح", "The target is wrong");
      // One warehouse keeper for each warehouse: he is the one who answers for its stock.
      const otherKeeper = input.role === "warehouse" && input.active && db.users.find((u) => u.id !== id && u.role === "warehouse" && u.active && u.warehouse_id === input.warehouse_id);
      if (otherKeeper)
        errors.warehouse_id = msg(
          `لهذا المخزن أمين مخزن: ${otherKeeper.name}. أوقف حسابه أولاً أو اختر مخزناً آخر.`,
          `This warehouse already has a keeper: ${otherKeeper.name}. Disable him first or choose another warehouse.`,
        );
      if (id === a.id && (!input.active || input.role !== "manager")) errors.role = msg("لا تستطيع إيقاف حسابك أو تغيير دورك", "You can't disable yourself or change your own role");
      if (Object.keys(errors).length) fail(422, "VALIDATION", "تحقق من الحقول", "Check the fields", errors);
      const clean = {
        name: input.name.trim(),
        phone,
        role: input.role,
        warehouse_id: input.role === "warehouse" || input.role === "staff" ? input.warehouse_id : undefined,
        rep_kinds: input.role === "rep" ? (input.rep_kinds?.length ? input.rep_kinds : (["sales", "delivery"] as const).slice()) : undefined,
        rep_categories: input.role === "rep" && input.rep_categories?.length ? input.rep_categories : undefined,
        // Only a rep who markets has a sales target.
        sales_target: input.role === "rep" && input.sales_target && (!input.rep_kinds?.length || input.rep_kinds.includes("sales")) ? Math.round(input.sales_target) : undefined,
        customer_id: input.role === "shop" ? input.customer_id : undefined,
        active: input.active,
      };
      if (id) {
        const u = db.users.find((x) => x.id === id) ?? notFound();
        Object.assign(u, clean);
        if (input.password) u.password = input.password;
        setProfileFrom(db, u, input.profile_id);
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
      if (s.expense_approval_above !== undefined && !(s.expense_approval_above >= 0)) fail(422, "VALIDATION", "حد موافقة الصرفيات غير صحيح", "The expense limit is wrong", { expense_approval_above: "≥ 0" });
      db.settings = s;
      audit(
        db,
        a,
        "update",
        "settings",
        0,
        `تعديل الإعدادات: حجز ${s.reservation_hours} ساعة، تنبيه الصلاحية ${s.near_expiry_days} يوم`,
        `Settings: reservation ${s.reservation_hours}h, expiry alert ${s.near_expiry_days} days`,
        now,
      );
      return s;
    }),
  site: async () => {
    await wait(40);
    return structuredClone(db0().custom ?? null);
  },
  // The public catalog: anyone (no session). Only what a visitor may see: never prices, quantities or costs.
  catalog: async () => {
    await wait(150);
    const db = db0();
    const now = new Date();
    return db.items
      .filter((it) => it.active && !it.deleted)
      .map((it) => ({
        id: it.id,
        name: it.name,
        name_en: it.name_en,
        category: it.category,
        ...(it.brand ? { brand: it.brand } : {}),
        ...(it.image ? { image: it.image } : {}),
        pieces_per_carton: it.pieces_per_carton,
        ...(it.pack_name ? { pack_name: it.pack_name } : {}),
        ...(it.piece_name ? { piece_name: it.piece_name } : {}),
        ...(it.sells ? { sells: it.sells } : {}),
        in_stock: sellableQty(db, it.id, undefined, now) > 0,
      }));
  },
  saveSite: (s) =>
    write((db, a, now) => {
      need(a, ["manager"]);
      const next = fullSite(s);
      const b = next.brand;
      if (!b.name.trim() || !b.company.trim()) fail(422, "VALIDATION", "اسم الشركة مطلوب", "The company name is required", { name: msg("مطلوب", "Required") });
      if (b.logo) {
        if (!/^data:image\/(jpeg|png|webp);base64,/.test(b.logo)) fail(422, "VALIDATION", "الملف ليس صورة", "The file is not a picture");
        if (b.logo.length > 400_000) fail(422, "VALIDATION", "الصورة كبيرة جداً", "The picture is too big");
      }
      if (next.look.action && !/^#[0-9a-f]{6}$/i.test(next.look.action)) fail(422, "VALIDATION", "اللون غير صحيح", "The color isn't valid");
      checkAdvanced(next);
      const old = fullSite(db.custom);
      // A profile that is gone: its people go back to their job's usual access.
      const kept = new Set(next.profiles.map((p) => p.id));
      for (const u of db.users) if (u.profile_id && (!kept.has(u.profile_id) || next.profiles.find((p) => p.id === u.profile_id)?.role !== u.role)) delete u.profile_id;
      db.custom = next;
      // One line in the activity log for a change of identity or of names (not one for every drag).
      const names = (x: typeof next) => JSON.stringify([x.nav.labels, x.nav.group_labels, x.dashboard.labels, x.texts]);
      if (JSON.stringify(old.brand) !== JSON.stringify(b))
        audit(db, a, "update", "settings", 0, `تعديل هوية الموقع: ${b.name} (${b.company})`, `Site identity changed: ${b.name_en} (${b.company_en})`, now);
      else if (names(old) !== names(next)) audit(db, a, "update", "settings", 0, "تعديل نصوص في الموقع (وضع التخصيص)", "Site texts rewritten (customize mode)", now);
      // Advanced settings: one line for each profile or app added, changed or removed.
      const diff = <T extends { id: string; name: string }>(was: T[], now_: T[], kind: string, kindEn: string) => {
        for (const x of now_) {
          const before = was.find((y) => y.id === x.id);
          if (!before) audit(db, a, "create", "settings", 0, `${kind} جديد: ${x.name}`, `New ${kindEn}: ${x.name}`, now);
          else if (JSON.stringify(before) !== JSON.stringify(x)) audit(db, a, "update", "settings", 0, `تعديل ${kind}: ${x.name}`, `${kindEn} changed: ${x.name}`, now);
        }
        for (const x of was) if (!now_.some((y) => y.id === x.id)) audit(db, a, "cancel", "settings", 0, `حذف ${kind}: ${x.name}`, `${kindEn} removed: ${x.name}`, now);
      };
      diff(old.profiles, next.profiles, "ملف صلاحيات", "profile");
      diff(old.apps, next.apps, "تطبيق", "app");
      diff(
        old.fields.map((f) => ({ ...f, name: f.label })),
        next.fields.map((f) => ({ ...f, name: f.label })),
        "حقل",
        "field",
      );
      diff(old.rules, next.rules, "قاعدة أتمتة", "rule");
      return next;
    }),
  createWarehouse: (input) =>
    write((db, a, now) => {
      need(a, ["manager"]);
      const w: Warehouse = { id: Math.max(0, ...db.warehouses.map((x) => x.id)) + 1, ...checkWarehouse(db, input, 0) };
      db.warehouses.push(w);
      audit(db, a, "create", "settings", w.id, `إضافة مخزن جديد: ${w.name} (${w.capacity.toLocaleString("en")} كارتون)`, `New warehouse: ${w.name_en}`, now);
      return w;
    }),
  deleteWarehouse: (id) =>
    write((db, a, now) => {
      need(a, ["manager"]);
      const w = db.warehouses.find((x) => x.id === id) ?? notFound();
      if (db.warehouses.length <= 1) fail(409, "BAD_STATE", "لا يمكن حذف المخزن الوحيد", "The only warehouse can't be deleted");
      // Deleted only when nothing needs it: no goods, no open work, nobody working in it, and no past records
      // (an invoice or a receipt must always be able to say where its goods came from).
      const why: string[] = [];
      const goods = db.batches.filter((b) => b.warehouse_id === id && b.qty_left > 0).length;
      if (goods) why.push(`فيه بضاعة (${goods} دفعة)`);
      const usesIt = (o: Order) => o.warehouse_id === id || o.lines.some((l) => l.warehouse_id === id) || !!o.prep_parts?.some((p) => p.warehouse_id === id);
      const open = db.orders.filter((o) => usesIt(o) && o.status !== "confirmed" && o.status !== "cancelled").length;
      if (open) why.push(`عليه ${open} طلب مفتوح`);
      const moving = db.transfers.filter((t) => (t.from_warehouse_id === id || t.to_warehouse_id === id) && t.status === "sent").length;
      if (moving) why.push(`${moving} تحويل في الطريق`);
      const supply = (db.supply_orders ?? []).filter((x) => x.warehouse_id === id && (x.status === "sent" || x.status === "partial")).length;
      if (supply) why.push(`${supply} طلب توريد ينتظر`);
      const counting = db.stocktakes.filter((x) => x.warehouse_id === id && x.status === "open").length;
      if (counting) why.push("جرد مفتوح");
      const staff = db.users.filter((u) => u.active && u.warehouse_id === id).map((u) => u.name);
      if (staff.length) why.push(`يعمل فيه ${staff.join("، ")} (انقلهم إلى مخزن آخر من صفحة المستخدمين)`);
      const past =
        db.invoices.some((i) => i.warehouse_id === id) ||
        db.orders.some(usesIt) ||
        db.receipts.some((r) => r.warehouse_id === id) ||
        db.transfers.some((t) => t.from_warehouse_id === id || t.to_warehouse_id === id) ||
        db.batches.some((b) => b.warehouse_id === id);
      if (!why.length && past) why.push("له فواتير وحركات سابقة تبقى في السجلات، فلا يُحذف حفاظاً على الحسابات");
      if (why.length) fail(409, "BAD_STATE", `لا يمكن حذف ${w.name}: ${why.join("؛ ")}.`, `${w.name_en} can't be deleted: it still has goods, open work, staff or past records.`);
      db.warehouses = db.warehouses.filter((x) => x.id !== id);
      db.stocktakes = db.stocktakes.filter((x) => x.warehouse_id !== id);
      if (db.supply_orders) db.supply_orders = db.supply_orders.filter((x) => x.warehouse_id !== id);
      audit(db, a, "cancel", "settings", id, `حذف المخزن ${w.name}`, `Deleted warehouse ${w.name_en}`, now);
    }),
  saveWarehouse: (id, input) =>
    write((db, a, now) => {
      need(a, ["manager"]);
      const w = db.warehouses.find((x) => x.id === id) ?? notFound();
      Object.assign(w, checkWarehouse(db, input, id));
      audit(db, a, "update", "settings", w.id, `تعديل المخزن ${w.name}`, `Updated warehouse ${w.name_en}`, now);
      return w;
    }),
  saveLayout: (id, layout) =>
    write((db, a, now) => {
      need(a, ["manager", "warehouse"]);
      const w = db.warehouses.find((x) => x.id === id) ?? notFound();
      // A keeper arranges his own warehouse only.
      if (a.role === "warehouse" && !worksIn(a, id)) fail(403, "FORBIDDEN", "ترتّب مخزنك فقط", "You arrange your own warehouse only");
      const zones = layout.zones.map((z) => ({ code: z.code.trim().toUpperCase(), name: z.name.trim() }));
      if (!zones.length) fail(422, "VALIDATION", "يحتاج المخزن منطقة واحدة على الأقل", "A warehouse needs at least one zone");
      if (zones.some((z) => !z.name)) fail(422, "VALIDATION", "لكل منطقة اسم", "Every zone needs a name");
      if (zones.some((z) => !/^[A-Z0-9-]{1,8}$/.test(z.code))) fail(422, "VALIDATION", "رمز المنطقة حروف وأرقام قصيرة", "A zone code is a few letters and digits");
      if (new Set(zones.map((z) => z.code)).size !== zones.length) fail(422, "VALIDATION", "رمزان متشابهان لمنطقتين", "Two zones have the same code");
      const codes = new Set(zones.map((z) => z.code));
      const places: Record<string, string> = {};
      for (const [item, zone] of Object.entries(layout.places)) {
        if (!db.items.some((i) => String(i.id) === item)) continue;
        if (!codes.has(zone)) fail(422, "VALIDATION", "مادة في منطقة غير موجودة", "An item is in a zone that doesn't exist");
        places[item] = zone;
      }
      // Which items moved, for the activity log ("رز بسمتي: Z01 ← Z04"). Before the first layout, every item
      // was in the zone of its category: the same rule the map uses.
      const prev = layoutOf(w, db.items as unknown as Item[]);
      const before: Record<string, string> = Object.fromEntries(db.items.map((i) => [String(i.id), zoneOfItem(prev, i as unknown as Item)]));
      const moved = Object.entries(places).filter(([item, zone]) => before[item] && before[item] !== zone);
      w.layout = { zones, places };
      const names = moved
        .slice(0, 4)
        .map(([item, zone]) => `${db.items.find((i) => String(i.id) === item)?.name}: ${before[item]} ← ${zone}`)
        .join("، ");
      audit(
        db,
        a,
        "update",
        "settings",
        w.id,
        `ترتيب ${w.name}: ${zones.length} مناطق${moved.length ? `، نقل ${moved.length} مادة (${names}${moved.length > 4 ? "…" : ""})` : ""}`,
        `Arranged ${w.name_en}: ${zones.length} zones${moved.length ? `, ${moved.length} item(s) moved` : ""}`,
        now,
      );
      return w;
    }),
  saveVehicle: (id, input) =>
    write((db, a, now) => {
      need(a, ["manager"]);
      const list = vehiclesOf(db);
      const errors: Record<string, string> = {};
      if (!input.name.trim()) errors.name = msg("الاسم مطلوب", "Name is required");
      if (!(input.capacity_kg >= 50) || input.capacity_kg > 40_000) errors.capacity_kg = msg("بين 50 و 40,000 كغم", "Between 50 and 40,000 kg");
      if (input.driver_id && !db.users.some((u) => u.id === input.driver_id && u.role === "rep")) errors.driver_id = msg("اختر مندوب توصيل", "Choose a delivery rep");
      if (Object.keys(errors).length) fail(422, "VALIDATION", "تحقق من الحقول", "Check the fields", errors);
      const clean = { name: input.name.trim(), plate: input.plate?.trim() || undefined, capacity_kg: Math.round(input.capacity_kg), driver_id: input.driver_id || undefined, active: input.active };
      if (id) {
        const v = list.find((x) => x.id === id) ?? notFound();
        Object.assign(v, clean);
        audit(db, a, "update", "settings", v.id, `تعديل السيارة ${v.name}: حمولة ${v.capacity_kg} كغم`, `Vehicle ${v.name}: ${v.capacity_kg} kg`, now);
        return v;
      }
      const v = { id: Math.max(0, ...list.map((x) => x.id)) + 1, ...clean };
      list.push(v);
      audit(db, a, "create", "settings", v.id, `إضافة السيارة ${v.name}: حمولة ${v.capacity_kg} كغم`, `New vehicle ${v.name}: ${v.capacity_kg} kg`, now);
      return v;
    }),
  planShipments: (id, loads) => write((db, a, now) => orderView(planShipments(db, a, id, loads, now), a)),
  loadShipment: (id) =>
    write((db, a, now) => {
      need(a, ["staff", "warehouse", "manager"]);
      const o = db.orders.find((x) => x.id === id) ?? notFound();
      const d = o.delivery ?? fail(409, "BAD_STATE", "الطلب لم يُجهَّز بعد", "The order isn't prepared yet");
      if (!ownWarehouse(a, o.warehouse_id)) fail(403, "FORBIDDEN", "هذه الشحنة من مخزن آخر", "This shipment is from another warehouse");
      if (d.status !== "ready") fail(409, "BAD_STATE", "خرجت الشحنة من المخزن", "The shipment already left");
      if (d.loaded_at) return orderView(o, a); // pressed twice: nothing changes
      // The vehicle's maximum load: what is already in it, and this shipment.
      if (d.vehicle) {
        const v = vehiclesOf(db).find((x) => x.id === d.vehicle!.id);
        const itemOf = (iid: number) => db.items.find((i) => i.id === iid);
        const inside = vehicleLoad(d.vehicle.id, db.orders as Order[], itemOf, o.id);
        const kg = linesWeight(o.lines, itemOf);
        if (v && inside + kg > v.capacity_kg) {
          // The suggestion: the other vehicle with the most room left now.
          const room = (x: { id: number; capacity_kg: number }) => x.capacity_kg - vehicleLoad(x.id, db.orders as Order[], itemOf);
          const other = vehiclesOf(db)
            .filter((x) => x.active && x.id !== v.id && room(x) >= kg)
            .sort((x, y) => room(y) - room(x))[0];
          fail(
            409,
            "BAD_STATE",
            `${v.name} امتلأت: فيها ${Math.round(inside)} كغم وهذه الشحنة ${Math.round(kg)} كغم (الحمولة ${v.capacity_kg} كغم).${other ? ` اقتراح: ${other.name}.` : ""} غيّر السيارة من صفحة الطلب.`,
            `${v.name} is full: ${Math.round(inside)} kg in it plus ${Math.round(kg)} kg (max ${v.capacity_kg} kg).${other ? ` Try ${other.name}.` : ""}`,
          );
        }
      }
      d.loaded_at = now.toISOString();
      d.loaded_by = person(a);
      const customer = db.customers.find((c) => c.id === o.customer_id);
      audit(db, a, "update", "order", o.id, `تحميل الشحنة ${o.number} (${customer?.name ?? ""}) في سيارة التوصيل`, `Shipment ${o.number} loaded`, now);
      // The delivery rep: it is in his van, he scans its label and chooses his trip.
      notify(
        db,
        {
          type: "out_for_delivery",
          roles: ["rep"],
          user_id: deliveryRepId(o),
          title: `حُمّلت شحنة ${customer?.name ?? ""} في سيارتك`,
          title_en: `${customer?.name ?? ""}'s shipment is in your van`,
          body: `${o.number}: امسح ملصقها، ثم اختر محلات جولتك.`,
          body_en: `${o.number}: scan its label, then choose your trip.`,
          link: "/deliveries",
        },
        now,
      );
      return orderView(o, a);
    }),
  setCover: (warehouseId, cover) =>
    write((db, a, now) => {
      need(a, ["manager"]);
      const w = db.warehouses.find((x) => x.id === warehouseId) ?? notFound();
      if (!cover) {
        if (!w.cover) return w;
        const was = w.cover;
        delete w.cover;
        audit(db, a, "update", "user", was.user_id, `إنهاء تكليف ${was.name} بمخزن ${w.name}`, `${was.name}'s cover of ${w.name_en} ended`, now);
        notify(db, { type: "order_accepted", roles: ["warehouse"], user_id: was.user_id, title: `انتهى تكليفك بمخزن ${w.name}`, title_en: `Your cover of ${w.name_en} ended`, body: "يعود عملك إلى مخزنك فقط.", body_en: "You work in your own warehouse only again.", link: "/hall" }, now);
        return w;
      }
      const u = db.users.find((x) => x.id === cover.user_id && x.active && x.role === "warehouse") ?? fail(422, "VALIDATION", "اختر أمين مخزن فعّالاً", "Pick an active warehouse keeper", { user_id: msg("مطلوب", "Required") });
      if (u.warehouse_id === w.id) fail(422, "VALIDATION", "هذا أمين المخزن نفسه", "That is this warehouse's own keeper", { user_id: msg("اختر أميناً آخر", "Pick another keeper") });
      const until = new Date(cover.until);
      if (!(until.getTime() > now.getTime())) fail(422, "VALIDATION", "اختر وقت انتهاء بعد الآن", "Pick an end time after now", { until: msg("بعد الآن", "After now") });
      if (until.getTime() - now.getTime() > 31 * 86_400_000) fail(422, "VALIDATION", "التكليف المؤقت حتى شهر واحد", "A cover lasts at most one month", { until: msg("شهر واحد كحد أعلى", "One month at most") });
      const c: WarehouseCover = { user_id: u.id, name: u.name, until: until.toISOString(), by: a.name, at: now.toISOString() };
      w.cover = c;
      const day = c.until.slice(0, 10);
      audit(db, a, "update", "user", u.id, `تكليف ${u.name} مؤقتاً بمخزن ${w.name} حتى ${day}`, `${u.name} covers ${w.name_en} until ${day}`, now);
      notify(
        db,
        { type: "order_accepted", roles: ["warehouse"], user_id: u.id, title: `كُلّفت مؤقتاً بمخزن ${w.name}`, title_en: `You cover ${w.name_en} for now`, body: `حتى ${day}: تجهّز وتستلم وتحوّل لهذا المخزن أيضاً.`, body_en: `Until ${day}: you prepare, receive and transfer for it too.`, link: "/hall" },
        now,
      );
      return w;
    }),
  renameWarehouse: (id, name, name_en) =>
    write((db, a, now) => {
      need(a, ["manager"]);
      if (!name.trim()) fail(422, "VALIDATION", "الاسم مطلوب", "Name is required", { name: msg("مطلوب", "Required") });
      const w = db.warehouses.find((x) => x.id === id) ?? notFound();
      const was = w.name;
      w.name = name.trim();
      w.name_en = name_en.trim() || w.name_en;
      audit(db, a, "update", "settings", w.id, `تغيير اسم المخزن «${was}» إلى «${w.name}»`, `Warehouse renamed to ${w.name_en}`, now);
      return w;
    }),
  renameCategory: (from, to) =>
    write((db, a, now) => {
      need(a, ["manager"]);
      const name = to.trim();
      if (!name) fail(422, "VALIDATION", "الاسم مطلوب", "Name is required", { name: msg("مطلوب", "Required") });
      if (name === from) return;
      if (db.items.some((i) => i.category === name)) fail(422, "VALIDATION", "يوجد صنف بهذا الاسم", "A category with this name exists", { name: msg("موجود", "Exists") });
      const swap = (c: string) => (c === from ? name : c);
      // Everywhere the name is kept: the items, the reps' allowed categories, the counts, the saved order.
      for (const it of db.items) it.category = swap(it.category);
      for (const u of db.users) if (u.rep_categories) u.rep_categories = u.rep_categories.map(swap);
      for (const st of db.stocktakes) if (st.category) st.category = swap(st.category);
      if (db.custom) db.custom.categories = db.custom.categories.map(swap);
      audit(db, a, "update", "settings", 0, `تغيير اسم الصنف «${from}» إلى «${name}»`, `Category "${from}" renamed to "${name}"`, now);
    }),
  quickItem: (id, change) =>
    write((db, a, now) => {
      need(a, ["manager"]);
      const it = db.items.find((x) => x.id === id) ?? notFound();
      if (change.name !== undefined) {
        const n = change.name.trim();
        if (!n) fail(422, "VALIDATION", "الاسم مطلوب", "Name is required");
        if (db.items.some((x) => x.id !== id && x.name.trim() === n)) fail(422, "VALIDATION", "توجد مادة بنفس الاسم", "An item with this name exists");
        it.name = n;
      }
      if (change.name_en !== undefined && change.name_en.trim()) it.name_en = change.name_en.trim();
      if (change.name !== undefined || change.name_en !== undefined) audit(db, a, "update", "item", it.id, `تعديل اسم المادة ${it.name}`, `Renamed item ${it.name_en}`, now);
      if (change.tier_id !== undefined && (change.carton_price !== undefined || change.piece_price !== undefined)) {
        const p = it.prices.find((x) => x.tier_id === change.tier_id) ?? notFound();
        let carton = change.carton_price ?? p.carton_price;
        let piece = change.piece_price ?? p.piece_price;
        if (it.sells === "piece" || it.pieces_per_carton <= 1) carton = piece * it.pieces_per_carton;
        if (it.sells === "pack") piece = Math.round(carton / it.pieces_per_carton);
        if (!(carton > 0) || !(piece > 0)) fail(422, "VALIDATION", "السعر يجب أن يكون أكبر من صفر", "The price must be above zero");
        if (carton !== p.carton_price || piece !== p.piece_price) {
          // The old price is remembered, as in the full item form (an order written offline before now keeps it).
          db.price_changes ??= [];
          db.price_changes.push({ item_id: it.id, tier_id: p.tier_id, carton_price: p.carton_price, piece_price: p.piece_price, until: now.toISOString() });
          p.carton_price = carton;
          p.piece_price = piece;
          const t = db.tiers.find((x) => x.id === p.tier_id)?.name;
          audit(
            db,
            a,
            "price_change",
            "item",
            it.id,
            `تغيير سعر ${it.name} (${t}: ${carton.toLocaleString("en")}/${piece.toLocaleString("en")}). الفواتير القديمة لا تتغير`,
            `Price change for ${it.name_en}. Old invoices keep their prices`,
            now,
          );
        }
      }
      return itemView(db, it, a, now);
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
  listItems: () => read((db, a, now) => db.items.filter((it) => repMaySell(a, it.category)).map((it) => itemView(db, it, a, now))),
  getItem: (id) =>
    read((db, a, now) => {
      const it = db.items.find((x) => x.id === id) ?? notFound();
      if (!repMaySell(a, it.category)) notFound();
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
  setItemVideo: (id, video) =>
    write((db, a, now) => {
      need(a, ["manager", "warehouse"]);
      const it = db.items.find((x) => x.id === id) ?? notFound();
      if (video !== null) {
        // A link to the file (https), or a file kept on this device in the demo.
        if (!(/^https:\/\/\S+$/.test(video) || /^media:[0-9a-f-]{36}$/.test(video)) || video.length > 500) fail(422, "VALIDATION", "رابط الفيديو غير صحيح", "The video link isn't valid");
        it.video = video;
      } else delete it.video;
      audit(db, a, "update", "item", it.id, video ? `فيديو للمادة ${it.name}` : `حذف فيديو المادة ${it.name}`, `Video for ${it.name_en}`, now);
      return itemView(db, it, a, now);
    }),
  saveItem: (id, input) =>
    write((db, a, now) => {
      need(a, ["manager"]);
      const errors: Record<string, string> = {};
      if (!input.name.trim()) errors.name = msg("الاسم مطلوب", "Name is required");
      if (!(input.pieces_per_carton >= 1) || !Number.isInteger(input.pieces_per_carton)) errors.pieces_per_carton = msg("عدد صحيح من 1", "A whole number from 1");
      if (input.min_stock < 0) errors.min_stock = msg("لا يكون سالباً", "Can't be negative");
      if (input.weight_kg !== undefined && !(input.weight_kg > 0 && input.weight_kg <= 100)) errors.weight_kg = msg("بين 0.01 و 100 كغم", "Between 0.01 and 100 kg");
      if (input.commission_percent < 0 || input.commission_percent > 50) errors.commission_percent = msg("بين 0 و 50", "Between 0 and 50");
      if (input.brand && input.brand.trim().length > 40) errors.brand = msg("اسم قصير (40 حرفاً على الأكثر)", "A short name (40 letters at most)");
      // The quantity offer: a unit it is sold by, from 2 up, less than the lowest price of that unit.
      if (input.offer) {
        const o = input.offer;
        const lowest = Math.min(...input.prices.map((p) => (o.unit === "carton" ? p.carton_price : p.piece_price)).filter((x) => x > 0));
        if (!Number.isInteger(o.min) || o.min < 2) errors["offer.min"] = msg("عدد صحيح من 2 فأكثر", "A whole number from 2");
        if (!Number.isInteger(o.off) || o.off <= 0 || o.off >= lowest) errors["offer.off"] = msg(`أقل من أدنى سعر (${lowest.toLocaleString("en")} د.ع)`, `Less than the lowest price (${lowest.toLocaleString("en")} IQD)`);
        if (o.until && (!/^\d{4}-\d{2}-\d{2}$/.test(o.until) || o.until < dayOf(now))) errors["offer.until"] = msg("تاريخ اليوم أو بعده", "Today or later");
      }
      // The units: two names (a few letters each) and which are sold. A pack of one is the single itself.
      const pack_name = input.pack_name?.trim() || "كارتون";
      const piece_name = input.piece_name?.trim() || "قطعة";
      if (pack_name.length > 20) errors.pack_name = msg("اسم قصير (20 حرفاً على الأكثر)", "A short name (20 letters at most)");
      if (piece_name.length > 20) errors.piece_name = msg("اسم قصير (20 حرفاً على الأكثر)", "A short name (20 letters at most)");
      if (pack_name === piece_name && input.pieces_per_carton > 1) errors.piece_name = msg("اسم مختلف عن الوحدة الكبيرة", "A different name from the big pack");
      const sells: "both" | "pack" | "piece" = input.pieces_per_carton <= 1 ? "piece" : input.sells === "pack" || input.sells === "piece" ? input.sells : "both";
      // A price for each unit that is sold; the other one follows from it (kept for the old screens and reports).
      input.prices.forEach((p) => {
        if (sells !== "piece" && !(p.carton_price > 0)) errors[`prices.${p.tier_id}.carton_price`] = msg("مطلوب", "Required");
        if (sells !== "pack" && !(p.piece_price > 0)) errors[`prices.${p.tier_id}.piece_price`] = msg("مطلوب", "Required");
      });
      input = {
        ...input,
        brand: input.brand?.trim() || undefined,
        offer: input.offer ? { unit: input.offer.unit, min: input.offer.min, off: input.offer.off, ...(input.offer.until ? { until: input.offer.until } : {}) } : undefined,
        pack_name: pack_name === "كارتون" ? undefined : pack_name,
        piece_name: piece_name === "قطعة" ? undefined : piece_name,
        sells: sells === "both" ? undefined : sells,
        prices: input.prices.map((p) =>
          sells === "piece"
            ? { ...p, carton_price: p.piece_price * input.pieces_per_carton }
            : sells === "pack"
              ? { ...p, piece_price: Math.round(p.carton_price / input.pieces_per_carton) }
              : p,
        ),
      };
      if (db.items.some((x) => x.id !== id && x.name.trim() === input.name.trim())) errors.name = msg("توجد مادة بنفس الاسم", "An item with this name exists");
      if (Object.keys(errors).length) fail(422, "VALIDATION", "تحقق من الحقول", "Check the fields", errors);
      if (id) {
        const it = db.items.find((x) => x.id === id) ?? notFound();
        const changed = input.prices.filter((p) => {
          const old = it.prices.find((o) => o.tier_id === p.tier_id);
          return !old || old.carton_price !== p.carton_price || old.piece_price !== p.piece_price;
        });
        // Remember the old prices with the moment they stopped (an order written offline before now keeps them).
        db.price_changes ??= [];
        for (const p of changed) {
          const old = it.prices.find((o) => o.tier_id === p.tier_id);
          if (old) db.price_changes.push({ item_id: it.id, tier_id: p.tier_id, carton_price: old.carton_price, piece_price: old.piece_price, until: now.toISOString() });
        }
        Object.assign(it, { ...input, name: input.name.trim(), name_en: input.name_en.trim() });
        // Back to the usual names / both units: the old values go.
        for (const k of ["pack_name", "piece_name", "sells", "brand", "offer"] as const) if (input[k] === undefined) delete it[k];
        if (changed.length) {
          const t = changed.map((p) => `${db.tiers.find((x) => x.id === p.tier_id)?.name}: ${p.carton_price.toLocaleString("en")}/${p.piece_price.toLocaleString("en")}`).join("، ");
          audit(db, a, "price_change", "item", it.id, `تغيير سعر ${it.name} (${t}). الفواتير القديمة لا تتغير`, `Price change for ${it.name_en}. Old invoices keep their prices`, now);
        }
        audit(db, a, "update", "item", it.id, `تعديل المادة ${it.name}`, `Updated item ${it.name_en}`, now);
        return itemView(db, it, a, now);
      }
      const it: DbItem = { id: nextId(db, "item"), ...input, offer: input.offer ?? undefined, name: input.name.trim(), name_en: input.name_en.trim() };
      db.items.push(it);
      audit(db, a, "create", "item", it.id, `إضافة المادة ${it.name}`, `Added item ${it.name_en}`, now);
      return itemView(db, it, a, now);
    }),
  deleteItem: (id) =>
    write((db, a, now) => {
      need(a, ["manager"]);
      const it = db.items.find((x) => x.id === id && !x.deleted) ?? notFound();
      // Never lose goods: what is still in a warehouse leaves first (a count or damaged), and open orders end.
      const left = db.batches.filter((b) => b.item_id === id).reduce((t, b) => t + b.qty_left, 0);
      if (left > 0) fail(409, "BAD_STATE", `في المخازن منها ${left.toLocaleString("en")} ${unitName(it, "piece")}: أخرجها أولاً (بالجرد أو كتالف) ثم احذفها، أو أوقفها بدل الحذف`, `${left} pieces are still in stock: take them out first (count or damaged), or stop the item instead`);
      const open = db.orders.find((o) => (o.status === "pending" || o.status === "needs_approval" || o.status === "approved") && o.lines.some((l) => l.item_id === id));
      if (open) fail(409, "BAD_STATE", `عليها الطلب ${open.number} ولم يُسلَّم بعد: سلّمه أو ألغه أولاً`, `Order ${open.number} with it isn't delivered yet: deliver or cancel it first`);
      const supply = (db.supply_orders ?? []).find((s) => (s.status === "sent" || s.status === "partial") && s.lines.some((l) => l.item_id === id));
      if (supply) fail(409, "BAD_STATE", `عليها طلب التوريد ${supply.number} ولم يُستلم بعد: استلمه أو ألغه أولاً`, `Supply order ${supply.number} with it isn't received yet`);
      const used =
        db.batches.some((b) => b.item_id === id) ||
        db.orders.some((o) => o.lines.some((l) => l.item_id === id)) ||
        db.receipts.some((r) => r.lines.some((l) => l.item_id === id)) ||
        (db.supply_orders ?? []).some((s) => s.lines.some((l) => l.item_id === id)) ||
        db.transfers.some((t) => t.lines.some((l) => l.item_id === id)) ||
        db.stocktakes.some((s) => s.lines.some((l) => l.item_id === id));
      db.special_prices = db.special_prices.filter((p) => p.item_id !== id);
      if (!used) {
        // Never received nor sold: gone for good.
        db.items = db.items.filter((x) => x.id !== id);
        if (db.custom_values) delete db.custom_values[`item:${id}`];
        audit(db, a, "delete", "item", id, `حذف المادة ${it.name} نهائياً (لم تُستعمل)`, `Deleted item ${it.name_en} (never used)`, now);
        return { result: "removed" as const };
      }
      // Used before: hidden everywhere (it can't be sold, received or counted), the old records keep its name.
      it.deleted = true;
      it.active = false;
      audit(db, a, "delete", "item", id, `حذف المادة ${it.name} (لها سجلات قديمة: أُخفيت وبقي اسمها في الفواتير)`, `Deleted item ${it.name_en} (hidden; old records keep it)`, now);
      return { result: "hidden" as const };
    }),
  itemBatches: (itemId) =>
    read((db, a, now) => {
      need(a, ["manager", "warehouse", "accountant", "staff"]);
      return db.batches
        .filter((b) => b.item_id === itemId && (b.qty_left > 0 || b.qty_received > 0) && ownWarehouse(a, b.warehouse_id))
        .sort((x, y) => x.expiry_date.localeCompare(y.expiry_date))
        .map((b) => batchView(db, b, a, now));
    }),
  listBatches: (warehouseId) =>
    read((db, a, now) => {
      need(a, ["manager", "warehouse", "accountant", "staff"]);
      return db.batches
        .filter((b) => b.qty_left > 0 && (!warehouseId || b.warehouse_id === warehouseId) && ownWarehouse(a, b.warehouse_id))
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
          const expired = db.batches.filter((b) => b.item_id === it.id && b.warehouse_id === w.id && b.expiry_date < today).reduce((s, b) => s + b.qty_left, 0);
          if (!ownWarehouse(a, w.id)) return { warehouse_id: w.id, on_shelf: sellable, sellable, reserved: 0, expired: 0 };
          return { warehouse_id: w.id, on_shelf: live + expired, sellable, reserved: live - sellable, expired };
        }),
      }));
    }),

  // Receipts
  listReceipts: () =>
    read((db, a) => {
      need(a, ["manager", "warehouse", "accountant", "staff"]);
      return db.receipts
        .filter((r) => worksIn(a, r.warehouse_id))
        .map((r) => receiptView(r, a))
        .reverse();
    }),
  getReceipt: (id) =>
    read((db, a) => {
      need(a, ["manager", "warehouse", "accountant", "staff"]);
      return receiptView(db.receipts.find((r) => r.id === id) ?? notFound(), a);
    }),
  createReceipt: (input) => write((db, a, now) => receiptView(createReceipt(db, a, input, now), a)),

  // Supply orders: the accountant / manager see all; a keeper / staff, their own warehouse's.
  listSupplyOrders: () =>
    read((db, a) => {
      need(a, ["manager", "accountant", "warehouse", "staff"]);
      return [...(db.supply_orders ?? [])].filter((o) => ownWarehouse(a, o.warehouse_id)).reverse();
    }),
  getSupplyOrder: (id) =>
    read((db, a) => {
      need(a, ["manager", "accountant", "warehouse", "staff"]);
      const o = (db.supply_orders ?? []).find((x) => x.id === id);
      if (!o || !ownWarehouse(a, o.warehouse_id)) notFound();
      return o;
    }),
  createSupplyOrder: (input) => write((db, a, now) => createSupplyOrder(db, a, input, now)),
  cancelSupplyOrder: (id, reason) => write((db, a, now) => cancelSupplyOrder(db, a, id, reason, now)),

  // Transfers
  listTransfers: () =>
    read((db, a) => {
      need(a, ["manager", "warehouse", "accountant", "staff"]);
      return [...db.transfers].filter((t) => ownWarehouse(a, t.from_warehouse_id) || ownWarehouse(a, t.to_warehouse_id)).reverse();
    }),
  createTransfer: (input) => write((db, a, now) => createTransfer(db, a, input, now)),
  receiveTransfer: (id, received, reason) => write((db, a, now) => receiveTransfer(db, a, id, received, reason, now)),
  reviewTransfer: (id) => write((db, a, now) => reviewTransfer(db, a, id, now)),

  // Stocktakes
  listStocktakes: () =>
    read((db, a) => {
      need(a, ["manager", "warehouse"]);
      return [...db.stocktakes].filter((s) => ownWarehouse(a, s.warehouse_id)).reverse();
    }),
  getStocktake: (id) =>
    read((db, a) => {
      need(a, ["manager", "warehouse"]);
      const s = db.stocktakes.find((x) => x.id === id);
      if (!s || !ownWarehouse(a, s.warehouse_id)) notFound();
      return s;
    }),
  createStocktake: (warehouseId, category) => write((db, a, now) => createStocktake(db, a, warehouseId, now, category || undefined)),
  holdBatch: (id, reason) => write((db, a, now) => batchView(db, holdBatch(db, a, id, reason, now), a, now)),
  releaseBatch: (id) => write((db, a, now) => batchView(db, releaseBatch(db, a, id, now), a, now)),
  traceBatch: (id) => read((db, a) => traceBatch(db, a, id)),
  creditInvoice: (invoiceId, amount, reason) => write((db, a, now) => creditInvoice(db, a, invoiceId, amount, reason, now)),
  refundCustomer: (customerId, input) => write((db, a, now) => refundCustomer(db, a, customerId, input, now)),
  creditNotes: (customerId) =>
    read((db, a) => {
      const c = db.customers.find((x) => x.id === customerId);
      if (!c || !canSeeCustomer(a, c)) notFound();
      return (db.credit_notes ?? []).filter((n) => n.customer_id === customerId).reverse();
    }),
  refunds: (customerId) =>
    read((db, a) => {
      const c = db.customers.find((x) => x.id === customerId);
      if (!c || !canSeeCustomer(a, c)) notFound();
      return (db.refunds ?? []).filter((r) => r.customer_id === customerId).reverse();
    }),
  specialPrices: (customerId) =>
    read((db, a) => {
      const c = db.customers.find((x) => x.id === customerId);
      if (!c || !(canSeeCustomer(a, c) || deliversTo(db, a, c.id))) notFound();
      return (db.special_prices ?? []).filter((x) => x.customer_id === customerId);
    }),
  setSpecialPrice: (customerId, itemId, prices) => write((db, a, now) => setSpecialPrice(db, a, customerId, itemId, prices, now)),
  saveStocktake: (id, lines) => write((db, a, now) => saveStocktake(db, a, id, lines, now)),
  closeStocktake: (id) => write((db, a, now) => closeStocktake(db, a, id, now)),
  listDamaged: () =>
    read((db, a) => {
      need(a, ["manager", "warehouse", "accountant"]);
      return [...db.damaged].filter((d) => ownWarehouse(a, d.warehouse_id)).reverse();
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
      const addr = cleanAddress(input.address_info, false);
      const { address_info: _ai, ...rest } = input;
      void _ai;
      const clean = { ...rest, phone, name: input.name.trim(), owner_name: input.owner_name.trim(), area: input.area.trim(), address: addr.text || input.address.trim() };
      if (id) {
        const c = db.customers.find((x) => x.id === id) ?? notFound();
        const wasPending = !!c.pending;
        const parts: string[] = [];
        if (c.debt_limit !== clean.debt_limit) parts.push(`سقف الدين ${c.debt_limit.toLocaleString("en")} ← ${clean.debt_limit.toLocaleString("en")}`);
        if (c.tier_id !== clean.tier_id) parts.push("نوع السعر");
        if (c.rep_id !== clean.rep_id) parts.push("مندوب التوصيل");
        Object.assign(c, clean);
        if (input.address_info === null) delete c.address_info;
        else if (addr.info) c.address_info = addr.info;
        audit(db, a, "update", "customer", c.id, `تعديل الزبون ${c.name}${parts.length ? ` (${parts.join("، ")})` : ""}`, `Updated customer ${c.name}`, now);
        // A shop that signed up online: saving it as active is the approval.
        if (wasPending && c.active) approveShop(db, a, c, now);
        return customerView(db, c, a);
      }
      const c: DbCustomer = { id: nextId(db, "customer"), ...clean, ...(addr.info ? { address_info: addr.info } : {}) };
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
      for (const n of (db.credit_notes ?? []).filter((x) => x.customer_id === c.id)) {
        rows.push({ date: n.at, type: "credit_note", ref: n.number, link: `/invoices/${n.invoice_id}`, debit: 0, credit: n.amount });
      }
      for (const r of (db.refunds ?? []).filter((x) => x.customer_id === c.id)) {
        rows.push({ date: r.at, type: "refund", ref: r.number, debit: r.amount, credit: 0 });
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
  listOrders: () =>
    read((db, a) =>
      db.orders
        .filter((o) => canSeeOrder(a, o))
        .map((o) => withCustom(db, orderView(o, a), a))
        .reverse(),
    ),
  getOrder: (id) =>
    read((db, a) => {
      const o = db.orders.find((x) => x.id === id);
      if (!o || !canSeeOrder(a, o)) notFound();
      return withCustom(db, orderView(o, a), a);
    }),
  saveCustomValues: (object, id, values) =>
    write((db, a, now) => {
      // The record must exist and be one this person sees.
      const name =
        object === "customer"
          ? (() => {
              const c = db.customers.find((x) => x.id === id);
              if (!c || !(canSeeCustomer(a, c) || deliversTo(db, a, c.id))) notFound();
              return c.name;
            })()
          : object === "item"
            ? (db.items.find((x) => x.id === id) ?? notFound()).name
            : (() => {
                const o = db.orders.find((x) => x.id === id);
                if (!o || !canSeeOrder(a, o)) notFound();
                return o.number;
              })();
      db.custom_values ??= {};
      const key = `${object}:${id}`;
      const old = db.custom_values[key] ?? {};
      const next = { ...old };
      const changed: string[] = [];
      for (const f of fieldsOf(object)) {
        if (!(f.id in values)) continue;
        const v = cleanValue(f, values[f.id]);
        if (v === old[f.id]) continue;
        if (!mayEdit(f, a)) fail(403, "FORBIDDEN", `لا تملك تعديل «${f.label}»`, `You can't change ${f.label_en || f.label}`);
        if (v === undefined) delete next[f.id];
        else next[f.id] = v;
        changed.push(f.label);
      }
      const errors: Record<string, string> = {};
      for (const f of fieldsOf(object)) if (f.required && mayEdit(f, a) && emptyValue(next[f.id])) errors[`custom.${f.id}`] = msg(`«${f.label}» مطلوب`, `${f.label_en || f.label} is required`);
      if (Object.keys(errors).length) fail(422, "VALIDATION", "تحقق من الحقول", "Check the fields", errors);
      if (Object.keys(next).length) db.custom_values[key] = next;
      else delete db.custom_values[key];
      if (changed.length) audit(db, a, "update", object, id, `${name}: تعديل ${changed.join("، ")}`, `${name}: changed ${changed.length} fields`, now);
      return customOf(db, object, id, a) ?? {};
    }),

  // Support chat
  myChat: () => read((db, a) => myChat(db, a)),
  // «قوائمي»: a shop owner's lists, for the shop he works on now. Up to 30, each up to 80 lines, whole quantities.
  shopLists: () =>
    read((db, a) => {
      need(a, ["shop"]);
      return (db.shop_lists ?? []).filter((l) => l.customer_id === a.customer_id).sort((x, y) => y.updated_at.localeCompare(x.updated_at));
    }),
  saveShopList: (id, input) =>
    write((db, a, now) => {
      need(a, ["shop"]);
      db.shop_lists ??= [];
      const name = input.name?.trim();
      const errors: Record<string, string> = {};
      if (!name || name.length > 40) errors.name = msg("اسم القائمة مطلوب (40 حرفاً على الأكثر)", "The list needs a name (40 letters at most)");
      const lines = (input.lines ?? []).filter((l) => l.qty > 0);
      if (lines.length > 80) errors.lines = msg("80 مادة على الأكثر", "80 items at most");
      lines.forEach((l, i) => {
        const it = db.items.find((x) => x.id === l.item_id);
        if (!it || it.deleted) errors[`lines.${i}`] = msg("مادة غير موجودة", "Unknown item");
        if (!Number.isInteger(l.qty) || (l.unit !== "carton" && l.unit !== "piece")) errors[`lines.${i}`] = msg("كمية غير صحيحة", "Wrong quantity");
      });
      if (Object.keys(errors).length) fail(422, "VALIDATION", "تحقق من القائمة", "Check the list", errors);
      const clean = lines.map(({ item_id, unit, qty }) => ({ item_id, unit, qty }));
      if (id) {
        const l = db.shop_lists.find((x) => x.id === id && x.customer_id === a.customer_id) ?? notFound();
        Object.assign(l, { name, lines: clean, updated_at: now.toISOString() });
        return l;
      }
      if (db.shop_lists.filter((x) => x.customer_id === a.customer_id).length >= 30) fail(409, "BAD_STATE", "30 قائمة على الأكثر", "30 lists at most");
      const l = { id: nextId(db, "shop_list"), customer_id: a.customer_id!, name: name!, lines: clean, updated_at: now.toISOString() };
      db.shop_lists.push(l);
      return l;
    }),
  deleteShopList: (id) =>
    write((db, a) => {
      need(a, ["shop"]);
      const before = (db.shop_lists ?? []).length;
      db.shop_lists = (db.shop_lists ?? []).filter((x) => !(x.id === id && x.customer_id === a.customer_id));
      if (db.shop_lists.length === before) notFound();
      return null;
    }),
  sendChat: (text) => write((db, a, now) => sendChat(db, a, text, now)),
  chatThreads: () => read((db, a) => chatThreads(db, a)),
  getChat: (customerId) => read((db, a) => chatOf(db, a, customerId)),
  replyChat: (customerId, text) => write((db, a, now) => replyChat(db, a, customerId, text, now)),
  markChatRead: (customerId) => write((db, a) => markChatRead(db, a, customerId), { self: true }),

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
    selfWrite((db, a) => {
      const { password: _p, ...user } = switchShop(db, a, customerId);
      void _p;
      return user;
    }),
  addShop: (input) => write((db, a, now) => addShop(db, a, input, now)),
  // Where the delivery rep is (his phone sends it while shipments are on the way with him).
  sendLocation: (lat, lng) =>
    write((db, a, now) => {
      need(a, ["rep"]);
      if (!(Math.abs(lat) <= 90 && Math.abs(lng) <= 180)) fail(422, "VALIDATION", "موقع غير صحيح", "Not a valid location");
      db.rep_locations ??= {};
      const loc = { rep_id: a.id, lat, lng, at: now.toISOString() };
      db.rep_locations[a.id] = loc;
      return loc;
    }),
  repLocations: () =>
    read((db, a) => {
      need(a, ["manager", "warehouse", "accountant", "staff", "shop", "rep"]);
      const all = Object.values(db.rep_locations ?? {});
      // A shop owner sees only the rep who has his shipment on the way.
      if (a.role === "shop") {
        const reps = new Set(db.orders.filter((o) => o.customer_id === a.customer_id && o.delivery?.status === "out").map((o) => o.delivery?.rep?.id ?? o.rep_id));
        return all.filter((l) => reps.has(l.rep_id));
      }
      return all;
    }),
  reportDeliveryProblem: (input) => write((db, a, now) => reportDeliveryProblem(db, a, input, now).map((o) => orderView(o, a))),
  returnToWarehouse: (id) => write((db, a, now) => orderView(returnToWarehouse(db, a, id, now), a)),
  getDeliveryPhoto: (id) =>
    read((db, a) => {
      const o = db.orders.find((x) => x.id === id);
      if (!o || !canSeeOrder(a, o)) notFound();
      return db.delivery_photos?.[id] ?? null;
    }),
  createOrder: (input) =>
    write((db, a, now) => {
      if ((input.discount_percent ?? 0) > 0) mayDo(a, "discount");
      const o = createOrder(db, a, input, now);
      // A new order (not the same one sent twice): the manager's automation rules run on it.
      if (o.created_at !== now.toISOString()) return o;
      // The rep's order for a shop of his counts as visiting it today («خط السير»).
      autoVisit(db, a, o.customer_id, "order", now, o.id);
      const c = db.customers.find((x) => x.id === o.customer_id);
      const wait = runRules(db, "order_created", { total: o.total, discount: o.discount?.percent ?? 0, lines: o.lines.length, by_role: a.role, area: c?.area ?? "" }, { number: o.number, link: `/orders/${o.id}`, by: a.name, customer: c?.name }, now);
      const st = db.orders.find((x) => x.id === o.id);
      if (wait.length && st && (st.status === "pending" || st.status === "needs_approval")) {
        st.status = "needs_approval";
        st.approval_for = [...new Set([...(st.approval_for ?? []), "rule" as const])];
        st.rule_note = wait.join("، ");
        return st;
      }
      return o;
    }),
  // The keeper's counter sale: order, invoice (stock out) and payment in full, at once.
  counterSale: (input) =>
    write((db, a, now) => {
      const v = invoiceView(db, counterSale(db, a, input, now), seesProfit(a));
      return seesDebt(a) ? v : { ...v, paid: 0, remaining: 0 };
    }),
  acceptOrder: (id) => write((db, a, now) => orderView(acceptOrder(db, a, id, now), a)),
  rateDelivery: (id, input) =>
    write((db, a, now) => {
      need(a, ["shop"]);
      const o = db.orders.find((x) => x.id === id && x.customer_id === a.customer_id) ?? notFound();
      const d = o.delivery;
      if (!d || d.status !== "delivered" || !d.delivered_at) fail(409, "BAD_STATE", "يُقيَّم التوصيل بعد استلام الطلب", "A delivery is rated after it arrives");
      if (now.getTime() - new Date(d.delivered_at).getTime() > 7 * 86_400_000) fail(409, "BAD_STATE", "مضى أكثر من 7 أيام على التسليم", "More than 7 days since it arrived");
      const stars = Math.round(Number(input.stars));
      if (!(stars >= 1 && stars <= 5)) fail(422, "VALIDATION", "اختر من 1 إلى 5 نجوم", "Choose 1 to 5 stars", { stars: msg("1 إلى 5", "1 to 5") });
      const note = input.note?.trim().slice(0, 300) || undefined;
      const first = !o.rating;
      o.rating = { stars, ...(note ? { note } : {}), at: now.toISOString(), ...(d.delivered_by ?? d.rep ? { rep: d.delivered_by ?? d.rep } : {}) };
      const shopName = db.customers.find((c) => c.id === o.customer_id)?.name ?? "";
      audit(db, a, "update", "order", o.id, `تقييم توصيل ${o.number}: ${stars} من 5${note ? ` («${note}»)` : ""}`, `Delivery of ${o.number} rated ${stars}/5`, now);
      // A low one: the manager hears of it at once.
      if (stars <= 2)
        notify(db, { type: "needs_approval", roles: ["manager"], title: `تقييم منخفض للتوصيل: ${shopName}`, title_en: `Low delivery rating: ${shopName}`, body: `${o.number} · ${stars} من 5${note ? ` · ${note}` : ""}`, body_en: `${o.number} · ${stars}/5`, link: `/orders/${o.id}` }, now);
      else if (first && stars === 5 && o.rating.rep) notify(db, { type: "order_confirmed", roles: ["rep"], user_id: o.rating.rep.id, title: `⭐ 5 من 5 من ${shopName}`, title_en: `5/5 from ${shopName}`, body: note ?? o.number, body_en: note ?? o.number, link: `/orders/${o.id}` }, now);
      return orderView(o, a);
    }),
  ratingsReport: () =>
    read((db, a) => {
      need(a, ["manager", "accountant"]);
      const rated = db.orders.filter((o) => o.rating).sort((x, y) => y.rating!.at.localeCompare(x.rating!.at));
      const spread = [0, 0, 0, 0, 0];
      for (const o of rated) spread[o.rating!.stars - 1]++;
      const byRep = new Map<number, { rep: { id: number; name: string }; stars: number[] }>();
      for (const o of rated) {
        const r = o.rating!.rep;
        if (!r) continue;
        const e = byRep.get(r.id) ?? { rep: r, stars: [] };
        e.stars.push(o.rating!.stars);
        byRep.set(r.id, e);
      }
      const avg = (xs: number[]) => (xs.length ? Math.round((xs.reduce((t, x) => t + x, 0) / xs.length) * 10) / 10 : 0);
      return {
        count: rated.length,
        average: avg(rated.map((o) => o.rating!.stars)),
        spread,
        reps: [...byRep.values()].map((e) => ({ rep: e.rep, count: e.stars.length, average: avg(e.stars), low: e.stars.filter((x) => x <= 2).length })).sort((x, y) => y.average - x.average),
        latest: rated.slice(0, 30).map((o) => ({ order_id: o.id, number: o.number, customer_id: o.customer_id, customer: db.customers.find((c) => c.id === o.customer_id)?.name ?? "", rating: o.rating! })),
      };
    }),
  // «خط السير»
  listVisits: (day, repId) => read((db, a) => listVisits(db, a, day, repId)),
  recordVisit: (input) => write((db, a, now) => recordVisit(db, a, input, now)),
  setVisitDays: (customerId, days) => write((db, a) => customerView(db, setVisitDays(db, a, customerId, days), a)),
  visitsReport: (from, to) => read((db, a, now) => visitsReport(db, a, from, to, now)),
  // «العهدة»
  custody: () => read((db, a, now) => custodyList(db, a, now)),
  custodyLog: (repId) => read((db, a, now) => custodyLog(db, a, repId, now)),
  handOver: (input) => write((db, a, now) => createHandover(db, a, input, now)),
  confirmHandover: (id, received) => write((db, a, now) => confirmHandover(db, a, id, received, now)),
  cancelHandover: (id) => write((db, a, now) => cancelHandover(db, a, id, now)),
  prepPlan: (id) => read((db, a, now) => prepPlan(db, a, id, now)),
  prepareOrder: (id, warehouses) => write((db, a, now) => orderView(prepareOrder(db, a, id, warehouses, now), a)),
  approveOrder: (id) => write((db, a, now) => approveOrder(db, a, id, now)),
  updateOrder: (id, input) => write((db, a, now) => orderView(updateOrder(db, a, id, input, now), a)),
  setOrderDiscount: (id, percent) =>
    write((db, a, now) => {
      if (percent > 0) mayDo(a, "discount");
      return orderView(setOrderDiscount(db, a, id, percent, now), a);
    }),
  cancelOrder: (id, reason) =>
    write((db, a, now) => {
      mayDo(a, "cancel_orders");
      return cancelOrder(db, a, id, reason, now);
    }),

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
      return db.payments
        .filter((p) => {
          const c = db.customers.find((x) => x.id === p.customer_id);
          return !!c && canSeeCustomer(a, c);
        })
        .slice()
        .reverse();
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
  createPayment: (input) =>
    write((db, a, now): Payment => {
      mayDo(a, "payments");
      // The same payment sent twice (weak internet) comes back as the first one: the rules ran then.
      const isNew = !db.payments.some((x) => x.client_ref === input.client_ref);
      const p = createPayment(db, a, input, now);
      if (isNew) autoVisit(db, a, p.customer_id, "payment", now);
      if (isNew)
        runRules(db, "payment_created", { amount: p.amount, method: p.method }, { number: p.number, link: `/payments/${p.id}`, by: a.name, customer: db.customers.find((c) => c.id === p.customer_id)?.name }, now);
      return p;
    }),

  // Online payment (Qi Card, demo gateway)
  startOnlinePayment: async (input) => {
    const made = await write((db, a, now) => startOnline(db, a, input, now));
    if (made.provider !== "zaincash" || made.gateway_id || made.status !== "created") return made;
    // ZainCash: opened at ZainCash (its sandbox) — what the real backend does on the server. The customer comes
    // back to our page with the payment's id (ZainCash adds its own ?token=… after it).
    const back = `${window.location.origin}${input.return_url.startsWith("/") && !input.return_url.startsWith("//") ? input.return_url : "/"}`;
    let opened: { transactionId: string; redirectUrl: string };
    try {
      opened = await zcInit({
        amount: made.amount,
        orderId: made.payment_id,
        reference: crypto.randomUUID(),
        back: `${back}${back.includes("?") ? "&" : "?"}payment=${encodeURIComponent(made.payment_id)}&via=zaincash`,
        lang: currentLocale() === "en" ? "en" : "ar",
        service: "تسديد دين - النهرين",
      });
    } catch {
      await write((db) => {
        const o = db.online_payments.find((x) => x.payment_id === made.payment_id);
        if (o) o.status = "failed";
      });
      fail(502, "NETWORK", "تعذّر فتح الدفع في زين كاش. حاول بعد قليل", "Couldn't open the payment at ZainCash. Try again shortly");
    }
    return write((db) => {
      const o = db.online_payments.find((x) => x.payment_id === made.payment_id) ?? notFound();
      Object.assign(o, { gateway_id: opened.transactionId, gateway_url: opened.redirectUrl });
      return onlineView(o);
    });
  },
  getOnlinePayment: async (id) => {
    const o = await read((db, a) => {
      const x = db.online_payments.find((y) => y.payment_id === id);
      if (!x || (a.role === "shop" && a.customer_id !== x.customer_id)) notFound();
      return onlineView(x);
    });
    if (o.provider !== "zaincash" || o.status !== "created" || !o.gateway_id) return o;
    // ZainCash: the token on the way back (signature checked) for a quick answer, and ZainCash's own status.
    // One question at a time per payment, and not more than every 3 s (the page asks every second).
    const busy = zcAsking.get(id);
    if (busy) return busy;
    if (Date.now() - (zcChecked.get(id) ?? 0) < 3000) return o;
    zcChecked.set(id, Date.now());
    const asking = askZainCash(id, o).finally(() => zcAsking.delete(id));
    zcAsking.set(id, asking);
    return asking;
  },

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
      return db.returns
        .filter((r) => canSeeOrder(a, { customer_id: r.customer_id, rep_id: r.rep_id, warehouse_id: db.invoices.find((i) => i.id === r.invoice_id)?.warehouse_id ?? 0 }))
        .map((r) => ({ ...returnView(r), warehouse_id: db.invoices.find((i) => i.id === r.invoice_id)?.warehouse_id }))
        .reverse();
    }),
  getReturn: (id) =>
    read((db, a) => {
      const r = db.returns.find((x) => x.id === id);
      if (!r) notFound();
      const inv = db.invoices.find((i) => i.id === r.invoice_id);
      if (!inv || !canSeeOrder(a, inv)) notFound();
      return returnView(r);
    }),
  createReturn: (input) =>
    write((db, a, now) => {
      mayDo(a, "returns");
      const r = createReturn(db, a, input, now);
      runRules(db, "return_created", { amount: r.amount }, { number: r.number, link: `/returns/${r.id}`, by: a.name, customer: db.customers.find((c) => c.id === r.customer_id)?.name }, now);
      return returnView(r);
    }),

  // Commission
  commissions: (month) =>
    read((db, a) => {
      need(a, ["manager", "accountant", "rep"]);
      const rows = commissionRows(db, month);
      return a.role === "rep" ? rows.filter((r) => r.rep.id === a.id) : rows;
    }),
  closeMonth: (month) => write((db, a, now) => closeMonth(db, a, month, now)),
  closedMonths: () => read((db) => Object.keys(db.closed_months).sort()),
  // Rep targets: each marketing rep's month (invoices less the returns on his invoices) against his target.
  repTargets: (month) =>
    read((db, a) => {
      need(a, ["manager", "accountant", "rep"]);
      const inMonth = (iso: string) => dayOf(new Date(iso)).startsWith(month);
      const rows = db.users
        .filter((u) => repDoes(u, "sales") && u.active && !u.deleted)
        .map((u) => {
          const invs = db.invoices.filter((i) => i.rep_id === u.id && inMonth(i.date));
          const sales = invs.reduce((t, i) => t + i.total, 0);
          const returns = db.returns.filter((r) => inMonth(r.created_at) && db.invoices.find((i) => i.id === r.invoice_id)?.rep_id === u.id).reduce((t, r) => t + r.amount, 0);
          const target = u.sales_target ?? 0;
          const net = sales - returns;
          return { rep: person(u), month, target, sales, returns, net, invoices: invs.length, pct: target ? Math.round((net / target) * 100) : 0, rank: 0, of: 0 };
        });
      // Reps with a target first, by how much of it is done; then by what they sold.
      rows.sort((x, y) => Number(!!y.target) - Number(!!x.target) || y.pct - x.pct || y.net - x.net);
      rows.forEach((r, i) => Object.assign(r, { rank: i + 1, of: rows.length }));
      return a.role === "rep" ? rows.filter((r) => r.rep.id === a.id) : rows;
    }),

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
        base.month_profit = monthInv.reduce((s, i) => s + i.total - i.cost, 0) - monthRet.reduce((s, r) => s + r.amount - r.cost, 0);
        // What is left after this month's expenses (rent, salaries, fuel…): the real profit.
        base.month_expenses = monthExpenses(db, today.slice(0, 7), wh || undefined);
        base.month_net = base.month_profit - base.month_expenses;
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
  slowMoving: (days, warehouseId) =>
    read((db, a, now): SlowItem[] => {
      need(a, ["manager", "warehouse", "accountant"]);
      const today = dayOf(now);
      const wh = warehouseId || undefined;
      return db.items
        .map((it) => {
          const last = db.invoices
            .filter((i) => (!wh || i.warehouse_id === wh) && i.lines.some((l) => l.item_id === it.id))
            .map((i) => dayOf(new Date(i.date)))
            .sort()
            .pop();
          const stock = physicalQty(db, it.id, wh, today);
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
        .filter((b) => b.qty_left > 0 && daysBetween(today, b.expiry_date) <= days && ownWarehouse(a, b.warehouse_id))
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
    selfWrite((db) => {
      const n = db.notifications.find((x) => x.id === id);
      if (n) n.read = true;
      return null;
    }),
  savePushSubscription: (sub) =>
    write((db, a, now) => {
      if (!/^https:\/\//.test(sub?.endpoint ?? "") || !sub.keys?.p256dh || !sub.keys?.auth) fail(422, "VALIDATION", "اشتراك غير صحيح", "Wrong subscription");
      db.push_subs = (db.push_subs ?? []).filter((x) => x.endpoint !== sub.endpoint);
      db.push_subs.push({ user_id: a.id, endpoint: sub.endpoint, keys: sub.keys, at: now.toISOString() });
      return null;
    }),
  deletePushSubscription: (endpoint) =>
    write((db, a) => {
      db.push_subs = (db.push_subs ?? []).filter((x) => !(x.endpoint === endpoint && x.user_id === a.id));
      return null;
    }),
  markAllRead: () =>
    selfWrite((db, a) => {
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

/** When each ZainCash payment was last asked about, and the question still on its way. */
const zcChecked = new Map<string, number>();
const zcAsking = new Map<string, Promise<OnlinePayment>>();

/** Ask ZainCash about one payment (and read its token on the way back); a final answer is kept. */
async function askZainCash(id: string, o: OnlinePayment): Promise<OnlinePayment> {
  const jwt = new URLSearchParams(window.location.search).get("token");
  const back = jwt ? await zcReadReturn(jwt) : null;
  const asked = await zcInquiry(o.gateway_id!).catch(() => null);
  const final = asked && zcToOurs(asked.status) !== "created" ? zcToOurs(asked.status) : back && back.transactionId === o.gateway_id ? zcToOurs(back.status) : "created";
  if (final === "created") return o;
  return write((db, _a, at) => {
    settleZainCash(db, id, final, asked?.phone, at);
    return onlineView(db.online_payments.find((y) => y.payment_id === id)!);
  });
}

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
