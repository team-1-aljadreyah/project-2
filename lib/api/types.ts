// The shapes of the data. The real backend will send the same shapes.
// Money = whole Iraqi dinars. Quantity = pieces (cartons are converted with pieces_per_carton).

/** staff = warehouse staff (موظف المخزن): works in one warehouse, sees it read-only, and answers the support chat. */
export type Role = "manager" | "warehouse" | "staff" | "rep" | "accountant" | "shop";
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
  /** Shop owner: the shop he is working on now (orders, statement, chat are for this shop). */
  customer_id?: number;
  /** Shop owner: every shop he owns (he switches between them from the top bar). */
  customer_ids?: number[];
  /** Rep: what he does. Marketing (visits shops, takes orders, collects), delivery (takes shipments to the
   *  shops), or both. Not set = both. */
  rep_kinds?: RepKind[];
  /** Rep: the item categories he may sell (set by the manager). Empty = all. Others don't even show to him. */
  rep_categories?: string[];
  active: boolean;
}

export type RepKind = "sales" | "delivery";

/** Does this rep do marketing / delivery? (Not a rep: false.) */
export function repDoes(u: { role: Role; rep_kinds?: RepKind[] }, kind: RepKind) {
  return u.role === "rep" && (!u.rep_kinds?.length || u.rep_kinds.includes(kind));
}

/** A shop in the owner's switcher. */
export interface MyShop {
  id: number;
  name: string;
  area: string;
  pending?: boolean;
  active: boolean;
}

/** The owner adds one more shop: it waits for the manager's approval, like a new sign-up. */
export interface NewShopInput {
  address_info?: ShopAddress;
  shop_name: string;
  area: string;
  address?: string;
  /** The shop's own phone; empty = the owner's. */
  phone?: string;
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
  /** Where it is (the start of every delivery trip). */
  lat?: number;
  lng?: number;
  /** How the goods are placed inside (set by the manager or its keeper). None = one zone per category. */
  layout?: WarehouseLayout;
  /** Its keeper is away: the manager gave the warehouse to another keeper until a time (a temporary cover). */
  cover?: WarehouseCover;
}

/** A delivery vehicle: its maximum load (set by the manager) and its usual driver (a delivery rep). */
export interface Vehicle {
  id: number;
  name: string;
  plate?: string;
  capacity_kg: number;
  driver_id?: number;
  active: boolean;
}

export type VehicleInput = Omit<Vehicle, "id">;

/** One vehicle's part of an order: which lines (and how much of each) it carries. */
export interface ShipmentLoad {
  vehicle_id: number;
  lines: { item_id: number; unit: Unit; qty: number }[];
}

/** A temporary cover: another keeper works in this warehouse too, until `until`. */
export interface WarehouseCover {
  user_id: number;
  name: string;
  until: string;
  /** Who gave it (the manager), and when. */
  by: string;
  at: string;
}

/**
 * The warehouses a keeper (or warehouse staff) works in right now: his own, and those he covers until their
 * end time. `undefined` = every warehouse (the office jobs, or a keeper with no warehouse set).
 * `covering`: already worked out (the API does it once per request); else it is read from `warehouses`.
 */
export function workWarehouses(
  user: { id: number; role: Role; warehouse_id?: number; covering?: number[] },
  warehouses?: { id: number; cover?: WarehouseCover }[],
  nowIso = new Date().toISOString(),
): number[] | undefined {
  if ((user.role !== "warehouse" && user.role !== "staff") || !user.warehouse_id) return undefined;
  const covering = user.covering ?? (warehouses ?? []).filter((w) => w.cover?.user_id === user.id && w.cover.until > nowIso).map((w) => w.id);
  return [user.warehouse_id, ...covering.filter((id) => id !== user.warehouse_id)];
}

/** Does this person work in this warehouse now? (Always yes for the office jobs.) */
export const worksIn = (user: Parameters<typeof workWarehouses>[0], warehouseId: number, warehouses?: Parameters<typeof workWarehouses>[1]) => {
  const list = workWarehouses(user, warehouses);
  return !list || list.includes(warehouseId);
};

/** A zone of a warehouse: a rack or an area on the floor ("Z03 · زيوت"). */
export interface WarehouseZone {
  /** Short code on the shelf labels, like Z03. Never changes, even when the zone is renamed or moved. */
  code: string;
  name: string;
}

/** The inside of a warehouse: its zones in walking order, and the zone of every item. */
export interface WarehouseLayout {
  zones: WarehouseZone[];
  /** Item id → zone code. An item not listed goes to the zone named like its category (or the first one). */
  places: Record<string, string>;
}

/** A new warehouse, or the changes to one (the manager). */
export interface WarehouseInput {
  name: string;
  name_en: string;
  /** How many cartons it can hold. */
  capacity: number;
  lat?: number;
  lng?: number;
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
  /** The weight of one piece in kg (for the vehicles' loads). None = read from the name ("5 kg", "1 L"). */
  weight_kg?: number;
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
  /** The product photo the shop owner sees in the store (a link; the fake backend keeps a data URL).
   *  Set by the manager or the warehouse keeper. None = the colored category tile. */
  image?: string;
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
  /** A batch with a problem (a complaint, a recall): nothing more of it is sold, in any warehouse. */
  held?: { reason: string; at: string; by: Person };
}

/** A price for one shop and one item (set by the manager). It comes before the shop's tier price. */
export interface SpecialPrice {
  customer_id: number;
  item_id: number;
  carton_price: number;
  piece_price: number;
  by: Person;
  at: string;
}

/** Which shops got pieces of a batch, and how many (to call them back). */
export interface BatchTrace {
  customer_id: number;
  customer: string;
  phone: string;
  invoice_id: number;
  invoice_number: string;
  date: string;
  pieces: number;
  returned: number;
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
  /** The supply order it received (if any). */
  supply_order_id?: number;
  warehouse_id: number;
  supplier: string;
  lines: (ReceiptLine & { batch_id: number; pieces: number })[];
  total_cost?: number;
  created_at: string;
  created_by: Person;
}

/** Where the shop is, like a delivery app's address card: a pin on the map and the details a driver needs. */
export interface ShopAddress {
  /** A short name for the place ("الجامعة التكنولوجية"). */
  label: string;
  /** How to find it. */
  details: string;
  /** The number to call at the shop (07xxxxxxxxx). */
  phone: string;
  street?: string;
  building?: string;
  floor?: string;
  apartment?: string;
  landmark?: string;
  /** The pin. */
  lat?: number;
  lng?: number;
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
  /** The full address with the map pin (newer shops). `address` stays the short text of it. */
  address_info?: ShopAddress;
  last_order_at?: string;
}

/** pending: sent, held 24 h, waits for the accountant / manager to approve it.
 *  needs_approval: over the debt limit or a big discount: waits for the manager.
 *  approved: approved, held until it is delivered; the warehouse keeper prepares it.
 *  confirmed: delivered to the shop: the invoice is made, the stock leaves, the debt counts.
 *  cancelled / expired: nothing held, nothing owed. */
export type OrderStatus = "pending" | "needs_approval" | "approved" | "confirmed" | "cancelled" | "expired";
export type OrderSource = "rep" | "shop" | "office";

export interface OrderLine {
  /** The warehouse this line is taken from (the keeper chooses it when preparing; else the order's). */
  warehouse_id?: number;
  item_id: number;
  unit: Unit;
  qty: number;
  unit_price: number;
  total: number;
}

export interface Order {
  id: number;
  /** A big order carried by more than one vehicle: the order of each vehicle load (a "shipment"). The shop sees
   *  this order; each shipment has its own label, PIN and invoice. */
  shipments?: number[];
  /** This order is one vehicle load (shipment number `shipment_no`) of the order `shipment_of`. */
  shipment_of?: number;
  shipment_no?: number;
  number: string;
  client_ref: string;
  customer_id: number;
  rep_id: number;
  warehouse_id: number;
  source: OrderSource;
  status: OrderStatus;
  lines: OrderLine[];
  /** What the shop pays: the lines minus the discount. */
  total: number;
  /** The lines before the discount (only when there is a discount). */
  subtotal?: number;
  /** The total is rounded to the nearest 250 IQD: what that changed (+ or -). */
  rounding?: number;
  discount?: OrderDiscount;
  /** Why the order waits for the manager: over the debt limit, a discount above 3%, or both. */
  approval_for?: ("debt" | "discount")[];
  /** The shop owner changed it after sending (before it was confirmed). */
  edited_at?: string;
  /** Approved by the accountant / manager (the warehouse can prepare it). */
  accepted_by?: Person;
  accepted_at?: string;
  /** Partly delivered: what wasn't delivered, and the order that carries it on (if the shop still wants it). */
  short_lines?: OrderLine[];
  rest_order_id?: number;
  /** This order carries on the rest of another one. */
  parent_id?: number;
  /** Written offline but the goods weren't there when it synced: it waits for the goods (nothing held). */
  waiting_stock?: boolean;
  /** Prepared from more than one warehouse: each warehouse's keeper prepares his own part. The shipment
   *  label is made when every part is ready. A keeper never prepares the other warehouse's part. */
  prep_parts?: { warehouse_id: number; prepared_by?: Person; at?: string }[];
  reserved_until?: string;
  note?: string;
  cancel_reason?: string;
  approved_by?: Person;
  created_at: string;
  created_by: Person;
  invoice_id?: number;
  /** Made when the order is confirmed: the trip from the warehouse to the shop. */
  delivery?: Delivery;
}

// ---------- Delivery proof (no fake deliveries) ----------
// ready → the delivery rep scans the shipment's QR at the warehouse → out → at the shop he takes a photo of
// the packages and types the PIN that only the shop owner can see → delivered.
export type DeliveryStatus = "ready" | "out" | "delivered";

export interface Delivery {
  status: DeliveryStatus;
  /** What the QR on the shipment label holds (also printed under it, to type by hand if the camera can't read). */
  code: string;
  /** The delivery rep who takes it to the shop (set on confirm). Older shipments: the order's rep. */
  rep?: Person;
  /** The 4-digit delivery PIN. Sent ONLY to the shop owner of this order; everyone else gets it hidden. */
  pin?: string;
  /** The vehicle that carries it (chosen at the warehouse; its driver is the delivery rep). */
  vehicle?: { id: number; name: string };
  /** The warehouse staff loaded it into the delivery rep's van (the step before he scans it and leaves). */
  loaded_at?: string;
  loaded_by?: Person;
  out_at?: string;
  out_by?: Person;
  delivered_at?: string;
  delivered_by?: Person;
  /** A photo of the packages at the shop exists (loaded on its own, it's big). */
  has_photo?: boolean;
  /** Wrong PINs typed so far. At 5 the delivery is locked until the manager opens it again. */
  pin_attempts: number;
  locked?: boolean;
  /** The delivery rep reported he can't deliver it (an accident, the shop closed...). Cleared when it is
   *  delivered or the manager / warehouse keeper takes it back into the warehouse. */
  problem?: DeliveryProblem;
}

export type ProblemReason = "accident" | "vehicle" | "shop_closed" | "no_answer" | "refused" | "other";

export interface DeliveryProblem {
  reason: ProblemReason;
  note?: string;
  at: string;
  by: Person;
}

/* No limit on the size of one order (the company's decision, 2026-11-12): a big order is split across
   vehicles at the warehouse (see Vehicle and splitShipments), and the shop keeps one order. */

export interface ProblemInput {
  /** The shipments it is about: one, the ones he picked, or all he has on the way (an accident). */
  order_ids: number[];
  reason: ProblemReason;
  note?: string;
}

export interface DeliverInput {
  pin: string;
  /** The photo of the packages, as a small JPEG data URL (made smaller on the phone before sending). */
  photo: string;
  /** Only some of it was delivered: what the shop took. Missing = everything. */
  lines?: { item_id: number; unit: Unit; qty: number }[];
  /** What happens to what wasn't delivered: stays as an open order, or is cancelled (the shop decides). */
  rest?: "keep" | "cancel";
}

/** Preparing an order: from which warehouse each line is taken. */
export interface PrepLine {
  item_id: number;
  unit: Unit;
  qty: number;
  /** The warehouse the system suggests: enough stock and the oldest expiry first. */
  suggested_warehouse_id: number | null;
  /** Free pieces in each warehouse (not held by other orders). */
  free: { warehouse_id: number; pieces: number; nearest_expiry?: string }[];
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
  rounding?: number;
  /** Taken off for mistakes (credit notes). */
  credited?: number;
  /** The dollar rate of the day it was made (to show it in dollars too). */
  usd_rate?: number;
  /** Before the discount, and the discount itself (from the order). */
  subtotal?: number;
  discount?: number;
  discount_percent?: number;
  paid: number;
  returned: number;
  remaining: number;
  status: InvoiceStatus;
  cost?: number;
  profit?: number;
  created_by: Person;
}

/** Local: cash (نقداً) or a transfer / Zain Cash (تحويل). Online: paid by card through the Qi Card gateway. */
export type PayMethod = "cash" | "transfer" | "online";

/** For an online payment: what the gateway told us. The full card number never reaches our site. */
export interface GatewayInfo {
  provider: "qi";
  /** The gateway's own id for the payment (to find it in Qi's dashboard). */
  payment_id: string;
  /** Only the last 4 digits, like "**** 0000". */
  card: string;
}

// ---------- Online payment (shaped like the Qi Card gateway, as in Project 1) ----------
// Our server creates the payment, the customer pays on the gateway's own page and comes back.
// Coming back does NOT mean it worked: only the gateway's notification decides (the status below).
export type OnlineStatus = "created" | "success" | "failed" | "authentication_failed" | "canceled";

export interface OnlinePayment {
  payment_id: string;
  customer_id: number;
  amount: number;
  status: OnlineStatus;
  /** The gateway's payment page. The card is typed there, never on our site. */
  form_url: string;
  created_at: string;
  by: Person & { role: Role };
  /** Our payment record, once the gateway said "success". */
  recorded_payment_id?: number;
  note?: string;
}

export interface StartOnlinePayment {
  customer_id: number;
  amount: number;
  /** Stops a double press from opening two payments. */
  key: string;
  /** Where the gateway sends the customer back to (a page of our site). */
  return_url: string;
}

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
  /** Only for online payments. */
  gateway?: GatewayInfo;
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
  /** The warehouse of its invoice (the goods go back there). */
  warehouse_id?: number;
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

/** sent: left the sending warehouse and is on the road (sold nowhere, counted nowhere).
 *  received: the receiving keeper took it all. partial: he took less and wrote why (the manager reviews). */
export type TransferStatus = "sent" | "received" | "partial";

export interface Transfer {
  id: number;
  number: string;
  client_ref: string;
  from_warehouse_id: number;
  to_warehouse_id: number;
  status?: TransferStatus;
  lines: {
    item_id: number;
    unit: Unit;
    qty: number;
    pieces: number;
    /** What arrived (set on receiving). */
    received_pieces?: number;
    /** The batches on the road (their expiry and cost go with them). */
    batches?: { from_batch_id: number; qty: number; expiry_date: string; purchase_price: number; receipt_id?: number }[];
  }[];
  note?: string;
  created_at: string;
  created_by: Person;
  received_at?: string;
  received_by?: Person;
  /** Why less arrived (needed when it is less). */
  diff_reason?: string;
  reviewed_by?: Person;
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
  /** Counting only some items (a category): only those stop selling in this warehouse until it ends. */
  category?: string;
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

export type StatementType = "opening" | "invoice" | "payment" | "return" | "reversal" | "credit_note" | "refund";

/** A mistake on an invoice (overcharged, wrong price, goods short or spoiled but not brought back):
 *  the company takes this much off what the shop owes. If the shop already paid, it becomes the shop's credit. */
export interface CreditNote {
  id: number;
  number: string;
  invoice_id: number;
  customer_id: number;
  amount: number;
  reason: string;
  by: Person & { role: Role };
  at: string;
}

/** Money given back to the shop (its credit: from a return on a paid invoice, a credit note, paying too much).
 *  Cash or transfer by hand, or back to the card of an online payment (through the Qi gateway). */
export interface Refund {
  id: number;
  number: string;
  customer_id: number;
  amount: number;
  method: "cash" | "transfer" | "online";
  /** Online: the payment it goes back to (its card). */
  payment_id?: number;
  reason: string;
  by: Person & { role: Role };
  at: string;
}

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

/** The dollar rate of one day: how many dinars one dollar is. The accountant fixes it each morning. */
export interface UsdRate {
  date: string;
  rate: number;
  by: Person;
  at: string;
}

/** One payment's share of a rep's commission: the money paid on his invoice × the invoice's rate. */
export interface CommissionLine {
  payment_id: number;
  payment_number: string;
  date: string;
  customer_id: number;
  customer: string;
  invoice_id: number;
  invoice_number: string;
  /** What was paid on this invoice by this payment. */
  amount: number;
  /** Percent, e.g. 2.4. */
  rate: number;
  commission: number;
  rep_id: number;
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

export type AuditAction = "create" | "update" | "cancel" | "reverse" | "transfer" | "price_change" | "approve" | "confirm" | "close" | "login";

export type AuditEntity = "item" | "batch" | "receipt" | "order" | "invoice" | "payment" | "return" | "transfer" | "stocktake" | "customer" | "user" | "commission" | "settings";

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

export type NotificationType =
  | "low_stock"
  | "near_expiry"
  | "expired"
  | "needs_approval"
  | "shop_order"
  | "order_confirmed"
  | "new_shop"
  | "account_approved"
  | "out_for_delivery"
  | "delivered"
  | "delivery_locked"
  | "support_message"
  | "support_reply"
  | "delivery_problem"
  | "commission_earned"
  | "usd_rate"
  | "order_accepted"
  | "order_rejected"
  | "order_review"
  | "refund"
  | "supply_order";

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

/** A name in the two languages (only the ones the manager changed). */
export interface Label {
  ar?: string;
  en?: string;
}

/** The company's identity, shown in the menu, the login page, the invoices and the files. */
export interface Brand {
  name: string;
  name_en: string;
  tagline: string;
  tagline_en: string;
  /** The full name printed on invoices. */
  company: string;
  company_en: string;
  phone: string;
  /** The logo picture (a small data URL). None = the drawn mark. */
  logo?: string;
}

/** What the manager customized (see lib/site.ts). */
export interface SiteCustom {
  brand: Brand;
  nav: {
    /** Page addresses in the manager's order. */
    order: string[];
    /** Pages hidden from the manager's menu. */
    hidden: string[];
    /** Pages the manager moved to another group (address → group). */
    groups: Record<string, string>;
    /** New names for pages (for everyone). */
    labels: Record<string, Label>;
    group_labels: Record<string, Label>;
  };
  dashboard: { order: string[]; hidden: string[]; labels: Record<string, Label> };
  /** The item categories in the manager's order. */
  categories: string[];
  /** Texts the manager rewrote, by their Arabic original (see lib/texts.ts). */
  texts: Record<string, Label>;
  /** The order and the hidden parts of a table's columns or a page's blocks ("table:/orders", "decisions"). */
  layouts: Record<string, { order: string[]; hidden: string[] }>;
  /** Colors. `action`: the color of the main buttons (#rrggbb). None = the orange. */
  look: { action?: string };
}

/** A quick change to an item from the list (customize mode). */
export interface ItemQuick {
  name?: string;
  name_en?: string;
  tier_id?: number;
  carton_price?: number;
  piece_price?: number;
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
  /** When it was written on the phone. The price is the one of that moment. */
  recorded_at?: string;
  /** Written without internet ("طلب مبدئي"): sent later by the phone. If the stock is short when it arrives,
   *  only what is there goes ahead; the rest waits for the goods and the rep is told. */
  offline?: boolean;
  customer_id: number;
  warehouse_id?: number;
  lines: { item_id: number; unit: Unit; qty: number }[];
  note?: string;
  /** Rep / accountant / manager. Above 3% (not the manager) the order waits for the manager. */
  discount_percent?: number;
}

/** The shop owner changes his order before it is confirmed (the whole new list of lines). */
export interface OrderEdit {
  lines: { item_id: number; unit: Unit; qty: number }[];
  note?: string;
}

/** The rep and the accountant give up to this by themselves; more needs the manager. The warehouse keeper
 *  gives no discounts (his work is the stock, not the prices). */
export const STAFF_DISCOUNT_MAX = 3;
/** Nobody gives more than this on one order. */
export const DISCOUNT_MAX = 30;

export interface OrderDiscount {
  percent: number;
  /** In dinars, taken off the lines' total. */
  amount: number;
  by: Person & { role: Role };
  at: string;
  /** Above 3% by a rep / keeper: waits for the manager. */
  needs_approval?: boolean;
  approved_by?: Person;
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
  /** Receiving the goods of a supply order: what arrives is counted against it. */
  supply_order_id?: number;
}

// ---------- Supply orders (the accountant orders goods for a warehouse) ----------

/** sent: the keeper has it (as an Excel / CSV file too). partial: part arrived. received: all arrived. */
export type SupplyStatus = "sent" | "partial" | "received" | "cancelled";

export interface SupplyLine {
  item_id: number;
  unit: Unit;
  qty: number;
  /** Purchase price per carton or per piece (following `unit`), as agreed with the supplier. */
  price: number;
  /** How much of it the keeper received so far (same unit). */
  received_qty: number;
}

export interface SupplyOrder {
  id: number;
  number: string;
  warehouse_id: number;
  supplier: string;
  supplier_phone?: string;
  lines: SupplyLine[];
  total: number;
  /** When the supplier should bring it. */
  expected_date?: string;
  note?: string;
  status: SupplyStatus;
  /** The receipts that brought its goods in. */
  receipt_ids: number[];
  created_at: string;
  created_by: Person & { role: Role };
  cancel_reason?: string;
}

export interface NewSupplyOrder {
  warehouse_id: number;
  supplier: string;
  supplier_phone?: string;
  lines: { item_id: number; unit: Unit; qty: number; price: number }[];
  expected_date?: string;
  note?: string;
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
  weight_kg?: number;
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
  /** null = remove the address card. */
  address_info?: ShopAddress | null;
  tier_id: number;
  rep_id: number;
  debt_limit: number;
  active: boolean;
}

/** A shop owner signing up on the website. */
export interface RegisterInput {
  address_info?: ShopAddress;
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
  rep_kinds?: RepKind[];
  rep_categories?: string[];
  warehouse_id?: number;
  customer_id?: number;
  active: boolean;
  password?: string;
}

// ---------- Support chat (shop owner ↔ warehouse staff / manager) ----------
export interface ChatMessage {
  id: number;
  customer_id: number;
  /** Who wrote it: the shop, or the company (staff or manager). */
  from: "shop" | "staff";
  by: Person & { role: Role };
  text: string;
  at: string;
}

/** One shop's conversation, as the staff's inbox lists it. */
export interface ChatThread {
  customer_id: number;
  customer: string;
  area: string;
  last: ChatMessage;
  /** The shop wrote last: it waits for an answer. */
  waiting: boolean;
  /** Messages from the shop the company hasn't opened yet. */
  unread: number;
  /** The last company person who answered (shown to the shop as "talking with you"). */
  answered_by?: Person;
}

/** The shop owner's own conversation. */
export interface MyChat {
  messages: ChatMessage[];
  /** Answers from the company he hasn't seen yet (the red dot on the chat circle). */
  unread: number;
}
