// The shapes of the data. The real backend will send the same shapes.
// Money = whole Iraqi dinars. Quantity = pieces (cartons are converted with pieces_per_carton).

export type Role = "manager" | "warehouse" | "rep" | "accountant" | "shop";
export type Unit = "carton" | "piece";

export interface Person {
  id: number;
  name: string;
}

export interface User {
  id: number;
  name: string;
  phone: string;
  role: Role;
  warehouse_id?: number;
  customer_id?: number;
  active: boolean;
}

export interface Session {
  token: string;
  user: User;
}

export interface Warehouse {
  id: number;
  name: string;
  name_en: string;
  /** How many cartons the warehouse can hold (for the "space used" numbers). */
  capacity: number;
}

export interface PriceTier {
  id: number;
  name: string;
  name_en: string;
}

export interface ItemPrice {
  tier_id: number;
  carton_price: number;
  piece_price: number;
}

export interface Item {
  id: number;
  name: string;
  name_en: string;
  category: string;
  barcode?: string;
  pieces_per_carton: number;
  min_stock: number;
  commission_percent: number;
  prices: ItemPrice[];
  active: boolean;
  /** Sellable pieces: not expired and not reserved by other orders. */
  stock: { total: number; by_warehouse: { warehouse_id: number; qty: number }[] };
  nearest_expiry?: string;
  /** Average purchase price per piece. Only manager and accountant get it. */
  avg_cost?: number;
}

export type BatchStatus = "ok" | "near_expiry" | "expired";

export interface Batch {
  id: number;
  item_id: number;
  warehouse_id: number;
  expiry_date: string;
  qty_received: number;
  qty_left: number;
  purchase_price?: number;
  received_at: string;
  received_by: Person;
  receipt_id?: number;
  status: BatchStatus;
}

export interface ReceiptLine {
  item_id: number;
  unit: Unit;
  qty: number;
  expiry_date: string;
  purchase_price: number; // per piece
}

export interface Receipt {
  id: number;
  number: string;
  warehouse_id: number;
  supplier: string;
  lines: (ReceiptLine & { batch_id: number; pieces: number })[];
  total_cost?: number;
  created_at: string;
  created_by: Person;
}

export interface Customer {
  id: number;
  name: string;
  owner_name: string;
  phone: string;
  area: string;
  address: string;
  tier_id: number;
  rep_id: number;
  debt_limit?: number;
  balance?: number;
  active: boolean;
  /** Signed up on the website and waiting for the manager to approve it. */
  pending?: boolean;
  last_order_at?: string;
}

export type OrderStatus = "pending" | "needs_approval" | "confirmed" | "cancelled" | "expired";
export type OrderSource = "rep" | "shop" | "office";

export interface OrderLine {
  item_id: number;
  unit: Unit;
  qty: number;
  unit_price: number;
  total: number;
}

export interface Order {
  id: number;
  number: string;
  client_ref: string;
  customer_id: number;
  rep_id: number;
  warehouse_id: number;
  source: OrderSource;
  status: OrderStatus;
  lines: OrderLine[];
  total: number;
  reserved_until?: string;
  note?: string;
  cancel_reason?: string;
  approved_by?: Person;
  created_at: string;
  created_by: Person;
  invoice_id?: number;
}

export interface InvoiceBatchUse {
  batch_id: number;
  qty: number;
  expiry_date: string;
  purchase_price?: number;
}

export interface InvoiceLine extends OrderLine {
  pieces: number;
  returned_pieces: number;
  batches?: InvoiceBatchUse[];
}

export type InvoiceStatus = "open" | "partial" | "paid";

export interface Invoice {
  id: number;
  number: string;
  order_id: number;
  customer_id: number;
  rep_id: number;
  warehouse_id: number;
  date: string;
  lines: InvoiceLine[];
  total: number;
  paid: number;
  returned: number;
  remaining: number;
  status: InvoiceStatus;
  cost?: number;
  profit?: number;
  created_by: Person;
}

export type PayMethod = "cash" | "transfer";

export interface Allocation {
  invoice_id: number;
  number: string;
  amount: number;
}

export interface Payment {
  id: number;
  number: string;
  client_ref: string;
  customer_id: number;
  amount: number;
  method: PayMethod;
  received_by: Person & { role: Role };
  date: string;
  note?: string;
  allocations: Allocation[];
  reversed: boolean;
  reversal_of?: number;
  reversed_by_id?: number;
  reason?: string;
}

export type Condition = "good" | "damaged";

export interface ReturnLine {
  item_id: number;
  unit: Unit;
  qty: number;
  condition: Condition;
}

export interface Return {
  id: number;
  number: string;
  client_ref: string;
  invoice_id: number;
  customer_id: number;
  rep_id: number;
  lines: (ReturnLine & { pieces: number; amount: number })[];
  amount: number;
  note?: string;
  created_at: string;
  created_by: Person;
}

export interface Transfer {
  id: number;
  number: string;
  client_ref: string;
  from_warehouse_id: number;
  to_warehouse_id: number;
  lines: { item_id: number; unit: Unit; qty: number; pieces: number }[];
  note?: string;
  created_at: string;
  created_by: Person;
}

export interface StocktakeLine {
  item_id: number;
  system_qty: number;
  counted_qty: number | null;
  reason?: string;
}

export interface Stocktake {
  id: number;
  number: string;
  warehouse_id: number;
  status: "open" | "done";
  lines: StocktakeLine[];
  created_at: string;
  created_by: Person;
  closed_at?: string;
  closed_by?: Person;
}

export interface DamagedRecord {
  id: number;
  item_id: number;
  warehouse_id: number;
  pieces: number;
  source: "return" | "stocktake" | "expired";
  ref: string;
  created_at: string;
}

export type StatementType = "opening" | "invoice" | "payment" | "return" | "reversal";

export interface StatementRow {
  date: string;
  type: StatementType;
  ref: string;
  link?: string;
  debit: number;
  credit: number;
  balance: number;
}

export interface Statement {
  customer: Customer;
  rows: StatementRow[];
  total_debit: number;
  total_credit: number;
  balance: number;
}

export interface CommissionRow {
  rep: Person;
  month: string;
  paid_sales: number;
  commission: number;
  returns_deducted: number;
  net: number;
  closed: boolean;
}

export type AuditAction =
  | "create"
  | "update"
  | "cancel"
  | "reverse"
  | "transfer"
  | "price_change"
  | "approve"
  | "confirm"
  | "close"
  | "login";

export type AuditEntity =
  | "item"
  | "batch"
  | "receipt"
  | "order"
  | "invoice"
  | "payment"
  | "return"
  | "transfer"
  | "stocktake"
  | "customer"
  | "user"
  | "commission"
  | "settings";

export interface AuditEntry {
  id: number;
  at: string;
  user: Person & { role: Role };
  action: AuditAction;
  entity: AuditEntity;
  entity_id: number;
  summary: string;
  summary_en: string;
}

export type NotificationType = "low_stock" | "near_expiry" | "expired" | "needs_approval" | "shop_order" | "order_confirmed" | "new_shop" | "account_approved";

export interface AppNotification {
  id: number;
  type: NotificationType;
  title: string;
  title_en: string;
  body: string;
  body_en: string;
  link?: string;
  read: boolean;
  created_at: string;
  roles: Role[];
  user_id?: number;
}

export interface Settings {
  reservation_hours: number;
  near_expiry_days: number;
  slow_moving_days: number;
  auto_confirm_rep_orders: boolean;
}

export interface Page<T> {
  items: T[];
  page: number;
  per_page: number;
  total: number;
}

export interface Dashboard {
  today_sales: number;
  today_invoices: number;
  today_collected: number;
  month_sales: number;
  month_profit?: number;
  total_debt: number;
  over_limit_customers: number;
  pending_orders: number;
  needs_approval: number;
  low_stock: number;
  near_expiry: number;
  expired_batches: number;
  last7: { date: string; sales: number; collected: number }[];
}

export interface SalesRow {
  key: string;
  label: string;
  label_en: string;
  invoices: number;
  pieces: number;
  sales: number;
  returns: number;
  profit?: number;
}

export interface DailySales {
  date: string;
  sales: number;
  invoices: number;
  collected: number;
  returns: number;
  by_rep: SalesRow[];
  by_warehouse: SalesRow[];
}

export interface SlowItem {
  item_id: number;
  last_sale?: string;
  days: number | null;
  stock: number;
}

export interface NearExpiryRow {
  batch: Batch;
  days_left: number;
}

export interface DebtRow {
  customer: Customer;
  oldest_open?: string;
  open_invoices: number;
}

export interface NewOrder {
  client_ref: string;
  customer_id: number;
  warehouse_id?: number;
  lines: { item_id: number; unit: Unit; qty: number }[];
  note?: string;
}

export interface NewPayment {
  client_ref: string;
  customer_id: number;
  amount: number;
  method: PayMethod;
  note?: string;
}

export interface NewReceipt {
  warehouse_id: number;
  supplier: string;
  lines: ReceiptLine[];
}

export interface NewReturn {
  client_ref: string;
  invoice_id: number;
  lines: ReturnLine[];
  note?: string;
}

export interface NewTransfer {
  client_ref: string;
  from_warehouse_id: number;
  to_warehouse_id: number;
  lines: { item_id: number; unit: Unit; qty: number }[];
  note?: string;
}

export interface ItemInput {
  name: string;
  name_en: string;
  category: string;
  barcode?: string;
  pieces_per_carton: number;
  min_stock: number;
  commission_percent: number;
  prices: ItemPrice[];
  active: boolean;
}

export interface CustomerInput {
  name: string;
  owner_name: string;
  phone: string;
  area: string;
  address: string;
  tier_id: number;
  rep_id: number;
  debt_limit: number;
  active: boolean;
}

/** A shop owner signing up on the website. */
export interface RegisterInput {
  shop_name: string;
  owner_name: string;
  phone: string;
  area: string;
  address?: string;
  password: string;
}

export interface UserInput {
  name: string;
  phone: string;
  role: Role;
  warehouse_id?: number;
  customer_id?: number;
  active: boolean;
  password?: string;
}
