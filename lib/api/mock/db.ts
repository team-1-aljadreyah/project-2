// The fake database of the prototype. It lives in the browser (localStorage), so the demo keeps its data
// after a refresh, and two tabs (for example a rep and the manager) see each other's changes.
import type { OtpPurpose, ScheduledPrice, CashHandover, Visit, ShopList, CustomValue, Expense, RuleRun, SiteCustom, Vehicle, SupplyOrder, UsdRate, SpecialPrice, CreditNote, Refund,
  AppNotification,
  AuditEntry,
  CommissionRow,
  Customer,
  DamagedRecord,
  Invoice,
  InvoiceBatchUse,
  InvoiceLine,
  ChatMessage,
  Item,
  OnlinePayment,
  OnlineStatus,
  Order,
  Payment,
  PriceTier,
  Receipt,
  Return,
  Settings,
  Stocktake,
  Transfer,
  User,
  Batch,
  Warehouse,
} from "../types";

/** `covering`: warehouses a keeper covers right now (worked out per request, never saved). */
export type DbUser = User & { password: string; covering?: number[] };
export type DbItem = Omit<Item, "stock" | "nearest_expiry" | "avg_cost">;
export type DbBatch = Omit<Batch, "status"> & { purchase_price: number };
export type DbCustomer = Omit<Customer, "balance" | "last_order_at"> & { debt_limit: number };
export type DbBatchUse = InvoiceBatchUse & { purchase_price: number; returned: number };
export type DbInvoiceLine = Omit<InvoiceLine, "batches"> & { batches: DbBatchUse[] };
export type DbInvoice = Omit<Invoice, "lines" | "remaining" | "status" | "cost" | "profit"> & {
  lines: DbInvoiceLine[];
  cost: number;
};
/** cost = purchase cost of the returned pieces; commission_base = the part of the return that was already paid. */
export type DbReturn = Return & { cost: number; commission_base: number };

export interface Db {
  version: number;
  seq: Record<string, number>;
  users: DbUser[];
  warehouses: Warehouse[];
  tiers: PriceTier[];
  items: DbItem[];
  batches: DbBatch[];
  receipts: Receipt[];
  supply_orders?: SupplyOrder[];
  /** Expenses (صرفيات). None (an older copy) = the demo ones (see expensesOf). */
  expenses?: Expense[];
  /** Values of the manager's own fields, by record ("customer:12" → field id → value). */
  custom_values?: Record<string, Record<string, CustomValue>>;
  /** Every login attempt (the health page counts the failed ones). */
  /** The automation rules' log (the last 300 runs). */
  rule_runs?: RuleRun[];
  login_log?: { phone: string; user_id?: number; ok: boolean; reason?: "wrong" | "stopped" | "hours"; at: string }[];
  customers: DbCustomer[];
  orders: Order[];
  invoices: DbInvoice[];
  payments: Payment[];
  returns: DbReturn[];
  transfers: Transfer[];
  stocktakes: Stocktake[];
  damaged: DamagedRecord[];
  audit: AuditEntry[];
  notifications: AppNotification[];
  settings: Settings;
  /** The delivery vehicles. None (an older copy) = the default ones (see vehiclesOf). */
  vehicles?: Vehicle[];
  /** The manager's customization of the site. None = the defaults. */
  custom?: SiteCustom;
  closed_months: Record<string, CommissionRow[]>;
  /** Batches that already got a near-expiry / expired notification (so it is sent once). */
  notified_batches: number[];
  /** Items that are below their minimum right now and were already notified. */
  notified_low: number[];
  /** Online payments started on the (demo) Qi gateway, finished or not. */
  online_payments: DbOnline[];
  /** Delivery photos, kept apart from the orders because they are big (order id → JPEG data URL). */
  delivery_photos: Record<number, string>;
  usd_rates: UsdRate[];
  /** The last place each delivery rep's phone sent (the shop owner's tracking map). */
  rep_locations?: Record<number, { rep_id: number; lat: number; lng: number; at: string }>;
  special_prices: SpecialPrice[];
  credit_notes: CreditNote[];
  refunds: Refund[];
  /** Old tier prices, each with the moment it stopped (to price an order recorded offline before a change). */
  price_changes: { item_id: number; tier_id: number; carton_price: number; piece_price: number; until: string }[];
  /** Support chat messages, all shops together. */
  chat: ChatMessage[];
  /** «خط السير»: the marketing reps' visits to their shops (one per shop per day). */
  visits?: Visit[];
  /** «العهدة»: the reps' cash handed to the accountant. */
  handovers?: CashHandover[];
  /** «أعلمني عند التوفر»: shop owners waiting for an item that ran out. */
  stock_alerts?: { customer_id: number; user_id: number; item_id: number; at: string }[];
  /** «عروض التصريف»: near-expiry batches sold at a discount. */
  clearances?: DbClearance[];
  /** «تغيير الأسعار من تاريخ»: price changes waiting for their day (and the done ones). */
  price_schedule?: ScheduledPrice[];
  /** «قارب ينفد عندك؟»: the day each shop owner last got his reorder reminder (one a day). */
  reorder_told?: Record<number, string>;
  /** «ملخص اليوم»: the last day its notification went out. */
  summary_told?: string;
  /** «رمز التحقق»: the codes sent in the last hour (the real server keeps them hashed). */
  otps?: { request_id: string; phone: string; purpose: OtpPurpose; code: string; at: string; tries: number; token?: string; token_until?: string; used?: boolean }[];
  /** «قوائمي»: the shops' saved lists. */
  shop_lists?: ShopList[];
  /** Phones that asked for push notifications (Web Push subscriptions), per person. */
  push_subs?: { user_id: number; endpoint: string; keys: { p256dh: string; auth: string }; at: string }[];
  /** The last message id each side has seen, per shop: { "<customer id>": { shop, staff } }. */
  chat_reads: Record<number, { shop: number; staff: number }>;
}

export interface DbClearance {
  id: number;
  item_id: number;
  batch_id: number;
  warehouse_id: number;
  percent: number;
  /** Pieces of the batch when it started. */
  qty: number;
  status: "active" | "sold" | "expired" | "cancelled";
  created_at: string;
  by: { id: number; name: string };
  ended_at?: string;
}

export type DbOnline = Omit<OnlinePayment, "form_url"> & {
  key: string;
  return_url: string;
  /** ZainCash: its payment page for this payment. */
  gateway_url?: string;
  /** What the gateway page decided; it becomes the status a moment later, like the gateway's notification. */
  outcome?: OnlineStatus;
  settles_at?: number;
  /** The delivery whose door request this pays (see markDoorPaid). */
  order_id?: number;
};

export const DB_VERSION = 36;
const KEY = "nahrain.db";

let current: Db | null = null;
const listeners = new Set<() => void>();

export function nextId(db: Db, name: string): number {
  db.seq[name] = (db.seq[name] ?? 0) + 1;
  return db.seq[name];
}

export function loadDb(make: () => Db): Db {
  if (current) return current;
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Db;
      if (parsed.version === DB_VERSION) {
        current = parsed;
        return current;
      }
    }
  } catch {}
  current = make();
  saveDb(current);
  return current;
}

export function saveDb(db: Db) {
  current = db;
  try {
    localStorage.setItem(KEY, JSON.stringify(db));
  } catch {}
}

export function clearDb() {
  current = null;
  try {
    localStorage.removeItem(KEY);
  } catch {}
}

/** Tell every open page that the data changed, so lists refresh. */
export function emitChange() {
  listeners.forEach((l) => l());
}

export function onDbChange(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

// Another tab saved new data: drop our copy and refresh the pages.
if (typeof window !== "undefined") {
  window.addEventListener("storage", (e) => {
    if (e.key === KEY) {
      current = null;
      emitChange();
    }
  });
}
