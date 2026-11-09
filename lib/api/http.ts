import { http } from "./axios";
import type {
  AppNotification,
  AuditEntry,
  Allocation,
  Batch,
  CommissionRow,
  Customer,
  CustomerInput,
  DailySales,
  DamagedRecord,
  Dashboard,
  DebtRow,
  Invoice,
  Item,
  ItemInput,
  NearExpiryRow,
  NewOrder,
  NewPayment,
  NewReceipt,
  NewReturn,
  NewTransfer,
  Order,
  Payment,
  PriceTier,
  Receipt,
  Return,
  SalesRow,
  Session,
  Settings,
  SlowItem,
  Statement,
  Stocktake,
  StocktakeLine,
  Transfer,
  User,
  UserInput,
  Warehouse,
} from "./types";

export interface Lookups {
  warehouses: Warehouse[];
  tiers: PriceTier[];
  reps: { id: number; name: string; phone: string }[];
  categories: string[];
  settings: Settings;
}

export interface ShelfRow {
  item_id: number;
  by_warehouse: { warehouse_id: number; on_shelf: number; sellable: number; reserved: number; expired: number }[];
}

export type SalesGroup = "rep" | "item" | "warehouse" | "customer";

// Helpers: GET / POST / PATCH that return only the data part of the answer.
const get = <T>(url: string, params?: object) => http.get<T>(url, { params }).then((r) => r.data);
const post = <T>(url: string, body?: unknown, key?: string) =>
  http.post<T>(url, body, key ? { headers: { "Idempotency-Key": key } } : undefined).then((r) => r.data);
const patch = <T>(url: string, body: unknown) => http.patch<T>(url, body).then((r) => r.data);
const save = <T>(base: string, id: number | null, body: unknown) => (id ? patch<T>(`${base}/${id}`, body) : post<T>(base, body));

// The real backend. One function for each endpoint. The fake one (mock.ts) must have the same functions.
export const httpApi = {
  login: (phone: string, password: string) => post<Session>("/auth/login", { phone, password }),
  logout: () => post<void>("/auth/logout"),
  me: () => get<User>("/me"),
  lookups: () => get<Lookups>("/lookups"),

  listUsers: () => get<User[]>("/users"),
  saveUser: (id: number | null, input: UserInput) => save<User>("/users", id, input),
  saveSettings: (s: Settings) => patch<Settings>("/settings", s),
  saveTier: (id: number | null, name: string, name_en: string) => save<PriceTier>("/price-tiers", id, { name, name_en }),

  listItems: () => get<Item[]>("/items"),
  getItem: (id: number) => get<Item>(`/items/${id}`),
  saveItem: (id: number | null, input: ItemInput) => save<Item>("/items", id, input),
  itemBatches: (itemId: number) => get<Batch[]>(`/items/${itemId}/batches`),
  listBatches: (warehouseId?: number) => get<Batch[]>("/batches", { warehouse_id: warehouseId }),
  shelfStock: () => get<ShelfRow[]>("/stock"),

  listReceipts: () => get<Receipt[]>("/receipts"),
  getReceipt: (id: number) => get<Receipt>(`/receipts/${id}`),
  createReceipt: (input: NewReceipt) => post<Receipt>("/receipts", input),

  listTransfers: () => get<Transfer[]>("/transfers"),
  createTransfer: (input: NewTransfer) => post<Transfer>("/transfers", input, input.client_ref),

  listStocktakes: () => get<Stocktake[]>("/stocktakes"),
  getStocktake: (id: number) => get<Stocktake>(`/stocktakes/${id}`),
  createStocktake: (warehouseId: number) => post<Stocktake>("/stocktakes", { warehouse_id: warehouseId }),
  saveStocktake: (id: number, lines: StocktakeLine[]) => patch<Stocktake>(`/stocktakes/${id}`, { lines }),
  closeStocktake: (id: number) => post<Stocktake>(`/stocktakes/${id}/close`),
  listDamaged: () => get<DamagedRecord[]>("/damaged"),

  listCustomers: () => get<Customer[]>("/customers"),
  getCustomer: (id: number) => get<Customer>(`/customers/${id}`),
  saveCustomer: (id: number | null, input: CustomerInput) => save<Customer>("/customers", id, input),
  statement: (customerId: number, from?: string, to?: string) => get<Statement>(`/customers/${customerId}/statement`, { from, to }),

  listOrders: () => get<Order[]>("/orders"),
  getOrder: (id: number) => get<Order>(`/orders/${id}`),
  createOrder: (input: NewOrder) => post<Order>("/orders", input, input.client_ref),
  confirmOrder: (id: number) => post<Invoice>(`/orders/${id}/confirm`),
  approveOrder: (id: number) => post<Order>(`/orders/${id}/approve`),
  cancelOrder: (id: number, reason: string) => post<Order>(`/orders/${id}/cancel`, { reason }),

  listInvoices: () => get<Invoice[]>("/invoices"),
  getInvoice: (id: number) => get<Invoice>(`/invoices/${id}`),

  listPayments: () => get<Payment[]>("/payments"),
  getPayment: (id: number) => get<Payment>(`/payments/${id}`),
  previewAllocation: (customerId: number, amount: number) => get<Allocation[]>(`/customers/${customerId}/allocation`, { amount }),
  createPayment: (input: NewPayment) => post<Payment>("/payments", input, input.client_ref),
  reversePayment: (id: number, reason: string) => post<Payment>(`/payments/${id}/reverse`, { reason }),

  listReturns: () => get<Return[]>("/returns"),
  getReturn: (id: number) => get<Return>(`/returns/${id}`),
  createReturn: (input: NewReturn) => post<Return>("/returns", input, input.client_ref),

  commissions: (month: string) => get<CommissionRow[]>("/commissions", { month }),
  closeMonth: (month: string) => post<CommissionRow[]>("/commissions/close", { month }),
  closedMonths: () => get<string[]>("/commissions/closed"),

  dashboard: () => get<Dashboard>("/dashboard"),
  dailySales: (date: string) => get<DailySales>("/reports/daily-sales", { date }),
  salesReport: (group: SalesGroup, from: string, to: string) => get<SalesRow[]>("/reports/sales", { group_by: group, from, to }),
  slowMoving: (days: number) => get<SlowItem[]>("/reports/slow-moving", { days }),
  nearExpiry: (days: number) => get<NearExpiryRow[]>("/reports/near-expiry", { days }),
  debts: () => get<DebtRow[]>("/reports/debts"),

  listAudit: () => get<AuditEntry[]>("/audit"),
  listNotifications: () => get<AppNotification[]>("/notifications"),
  markRead: (id: number) => post<null>(`/notifications/${id}/read`),
  markAllRead: () => post<null>("/notifications/read-all"),

  /** Demo only: the real backend has no such thing. */
  resetDemo: async () => {},
};

export type Api = typeof httpApi;
