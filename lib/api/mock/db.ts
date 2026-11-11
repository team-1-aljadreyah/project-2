// The fake database of the prototype. It lives in the browser (localStorage), so the demo keeps its data
// after a refresh, and two tabs (for example a rep and the manager) see each other's changes.
import type { UsdRate,
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

export type DbUser = User & { password: string };
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
  /** Support chat messages, all shops together. */
  chat: ChatMessage[];
  /** The last message id each side has seen, per shop: { "<customer id>": { shop, staff } }. */
  chat_reads: Record<number, { shop: number; staff: number }>;
}

export type DbOnline = Omit<OnlinePayment, "form_url"> & {
  key: string;
  return_url: string;
  /** What the gateway page decided; it becomes the status a moment later, like the gateway's notification. */
  outcome?: OnlineStatus;
  settles_at?: number;
};

export const DB_VERSION = 17;
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
