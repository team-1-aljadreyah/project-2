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
  /** The person's picture (a small JPEG data URL). Each person changes their own; only the manager removes one. */
  photo?: string;
  /** A deleted login: it can't log in, and it is no longer listed; its name stays on the records it made. */
  deleted?: boolean;
  /** The manager's permission profile for this person (advanced settings). None = the job's usual access. */
  profile_id?: string;
  /** Marketing rep: his monthly sales target in IQD (set by the manager). None = no target. */
  sales_target?: number;
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

/** An item's own units: what its big pack and its single are called, and which are sold (none = كارتون and
 *  قطعة, both sold). "carton" / "piece" in orders, prices and stock are these two levels. */
export interface ItemUnits {
  pack_name?: string;
  piece_name?: string;
  sells?: "both" | "pack" | "piece";
}

export interface Item extends ItemUnits {
  /** The manager's own fields (id → value), only the ones this person may see. */
  custom?: Record<string, CustomValue>;
  id: number;
  /** The weight of one piece in kg (for the vehicles' loads). None = read from the name ("5 kg", "1 L"). */
  weight_kg?: number;
  name: string;
  name_en: string;
  category: string;
  barcode?: string;
  /** The maker's name (Pepsi, Lay's, النخلة…): a row of brands and a filter in the shop owners' app. */
  brand?: string;
  pieces_per_carton: number;
  min_stock: number;
  commission_percent: number;
  prices: ItemPrice[];
  active: boolean;
  /** Deleted by the manager after it had been used: hidden everywhere, its name kept on the old records. */
  deleted?: boolean;
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
  /** The manager's own fields (id → value), only the ones this person may see. */
  custom?: Record<string, CustomValue>;
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
  /** The one «زبون مباشر» account the counter sales go under (people who come to the warehouse and pay on
   *  the spot). Not a shop: no rep, no debt, not listed with the customers. */
  walk_in?: boolean;
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
/** counter: sold at the warehouse to someone who came in and paid on the spot (بيع مباشر). */
export type OrderSource = "rep" | "shop" | "office" | "counter";

/** A counter sale's own details (on its order and invoice): who bought (if he gave it), the price level the
 *  keeper chose, how it was paid (in full, at once) and the cash handed over (for the change). */
export interface CounterInfo {
  buyer_name?: string;
  buyer_phone?: string;
  tier_id: number;
  method: "cash" | "transfer";
  /** Cash handed over by the buyer (≥ the total); the change is received - total. */
  received?: number;
}

/** The warehouse keeper sells to someone who came in: the goods leave now (oldest expiry first), the invoice is
 *  made and paid in full at once. Sent again with the same client_ref (weak internet): the first sale comes back. */
export interface CounterSaleInput {
  client_ref: string;
  warehouse_id: number;
  tier_id: number;
  lines: { item_id: number; unit: Unit; qty: number }[];
  buyer_name?: string;
  buyer_phone?: string;
  method: "cash" | "transfer";
  received?: number;
  note?: string;
}

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
  /** The manager's own fields (id → value), only the ones this person may see. */
  custom?: Record<string, CustomValue>;
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
  approval_for?: ("debt" | "discount" | "rule")[];
  /** A counter sale (source "counter"): the buyer, price level and payment. */
  counter?: CounterInfo;
  /** The automation rules that hold this order for the manager (their names). */
  rule_note?: string;
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
  /** The phone of the rep who took it out (the shop owner calls him from the tracker while it's on the way). */
  out_phone?: string;
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
  /** A counter sale (paid at the warehouse): the buyer, price level and payment. No rep. */
  counter?: CounterInfo;
  cost?: number;
  profit?: number;
  created_by: Person;
}

/** Local: cash (نقداً) or a transfer / Zain Cash (تحويل). Online: paid by card through the Qi Card gateway. */
export type PayMethod = "cash" | "transfer" | "online";

/** For an online payment: what the gateway told us. The full card number never reaches our site. */
export interface GatewayInfo {
  provider: "qi" | "zaincash";
  /** The gateway's own id for the payment (to find it in Qi's / ZainCash's dashboard). */
  payment_id: string;
  /** Qi: only the last 4 digits ("**** 0000"). ZainCash: the wallet number, hidden in the middle. */
  card: string;
}

/** The online gateways: Qi Card (a card), ZainCash (a ZainCash wallet). */
export type Gateway = "qi" | "zaincash";

// ---------- Online payment (shaped like the Qi Card gateway, as in Project 1) ----------
// Our server creates the payment, the customer pays on the gateway's own page and comes back.
// Coming back does NOT mean it worked: only the gateway's notification decides (the status below).
export type OnlineStatus = "created" | "success" | "failed" | "authentication_failed" | "canceled";

export interface OnlinePayment {
  payment_id: string;
  /** Which gateway (none = Qi Card, the older ones). */
  provider?: Gateway;
  /** The gateway's own id for it (ZainCash's transactionId). */
  gateway_id?: string;
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
  /** Qi Card (default) or ZainCash. */
  provider?: Gateway;
  /** Stops a double press from opening two payments. */
  key: string;
  /** Where the gateway sends the customer back to (a page of our site, as a path: "/client/statement"). */
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

/** A marketing rep's month against his target: what he sold (invoices less returns), and his place among the reps. */
export interface RepTarget {
  rep: Person;
  month: string;
  /** IQD; 0 = the manager set none. */
  target: number;
  sales: number;
  returns: number;
  /** sales - returns: what counts toward the target. */
  net: number;
  invoices: number;
  /** net / target, in percent (0 when there is no target). */
  pct: number;
  /** His place (1 = first): reps with a target first, by pct, then by net. */
  rank: number;
  of: number;
}

export type AuditAction = "create" | "update" | "delete" | "cancel" | "reverse" | "transfer" | "price_change" | "approve" | "confirm" | "close" | "login";

export type AuditEntity = "item" | "batch" | "receipt" | "order" | "invoice" | "payment" | "return" | "transfer" | "stocktake" | "customer" | "user" | "commission" | "settings" | "expense";

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
  | "supply_order"
  | "expense"
  | "rule";

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
  /** An expense above this (IQD) waits for the manager's OK. None = EXPENSE_APPROVAL_ABOVE. */
  expense_approval_above?: number;
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
  /** Advanced settings: permission profiles (narrower access inside a job). */
  profiles: Profile[];
  /** Advanced settings: apps (named sets of pages, opened from the app launcher). */
  apps: AppDef[];
  /** Advanced settings: the manager's own fields on customers, items and orders (object manager). */
  fields: CustomField[];
  /** Advanced settings: automation rules ("when this happens, if …, do that"). */
  rules: AutoRule[];
  /** The manager's own ads at the top of the shop owners' store (before the automatic ones). */
  banners: ShopBanner[];
}

/** An ad in the shop owners' store: a picture with a title, opening a category, a brand, an item or a search. */
export interface ShopBanner {
  id: string;
  /** A JPEG / PNG / WebP data URL (the real backend keeps a link). */
  image: string;
  title: string;
  title_en?: string;
  sub?: string;
  link: { kind: "category" | "brand" | "item" | "search"; value: string };
  active: boolean;
}

/** What starts a rule. */
export type RuleTrigger = "order_created" | "payment_created" | "expense_created" | "return_created";
export type RuleOp = "gt" | "gte" | "lt" | "eq" | "neq";
export interface RuleCondition {
  field: string;
  op: RuleOp;
  value: number | string;
}

/**
 * An automation rule the manager writes: when [something is made], if [every condition holds], then notify
 * these jobs and/or hold it for the manager's OK (orders and expenses). Runs on the server, for everyone.
 */
export interface AutoRule {
  id: string;
  name: string;
  active: boolean;
  trigger: RuleTrigger;
  conditions: RuleCondition[];
  notify: Role[];
  approval?: boolean;
  /** The notification's text; {number} {amount} {customer} {by} are filled in. */
  message?: string;
}

/** One time a rule ran (the rules' log). */
export interface RuleRun {
  id: number;
  rule_id: string;
  rule: string;
  at: string;
  record: string;
  link?: string;
  did: string;
}

/** The fields each trigger offers to the conditions. */
export const RULE_FIELDS: Record<RuleTrigger, { key: string; ar: string; en: string; type: "number" | "text"; options?: { value: string; ar: string; en: string }[] }[]> = {
  order_created: [
    { key: "total", ar: "مبلغ الطلب", en: "Order total", type: "number" },
    { key: "discount", ar: "نسبة الخصم %", en: "Discount %", type: "number" },
    { key: "lines", ar: "عدد المواد", en: "Number of items", type: "number" },
    {
      key: "by_role",
      ar: "من كتبه",
      en: "Written by",
      type: "text",
      options: [
        { value: "rep", ar: "مندوب", en: "Rep" },
        { value: "shop", ar: "صاحب محل", en: "Shop owner" },
        { value: "accountant", ar: "محاسب", en: "Accountant" },
        { value: "manager", ar: "المدير", en: "Manager" },
      ],
    },
    { key: "area", ar: "منطقة الزبون", en: "Customer's area", type: "text" },
  ],
  payment_created: [
    { key: "amount", ar: "مبلغ التسديد", en: "Amount", type: "number" },
    {
      key: "method",
      ar: "طريقة الدفع",
      en: "Method",
      type: "text",
      options: [
        { value: "cash", ar: "نقداً", en: "Cash" },
        { value: "transfer", ar: "تحويل", en: "Transfer" },
        { value: "online", ar: "أونلاين", en: "Online" },
      ],
    },
  ],
  expense_created: [
    { key: "amount", ar: "مبلغ الصرف", en: "Amount", type: "number" },
    { key: "category", ar: "البند", en: "Category", type: "text" },
    {
      key: "method",
      ar: "طريقة الدفع",
      en: "Method",
      type: "text",
      options: [
        { value: "cash", ar: "نقداً", en: "Cash" },
        { value: "transfer", ar: "تحويل", en: "Transfer" },
      ],
    },
  ],
  return_created: [{ key: "amount", ar: "مبلغ المرتجع", en: "Amount", type: "number" }],
};

/** The records that can have the manager's own fields. */
export type CustomObject = "customer" | "item" | "order";
export type CustomType = "text" | "number" | "date" | "list" | "yesno";
export type CustomValue = string | number | boolean;

/**
 * A field the manager added (like Salesforce's custom fields): it shows in the record's form, on its page,
 * and in its table if wanted. Who sees it and who changes it are chosen by job (field-level security).
 */
export interface CustomField {
  id: string;
  object: CustomObject;
  label: string;
  label_en?: string;
  type: CustomType;
  /** For a list: the choices. */
  options?: string[];
  /** Can't be left empty when the record is saved. */
  required?: boolean;
  /** A short hint under the box. */
  help?: string;
  /** Also a column in the record's table. */
  in_table?: boolean;
  /** Jobs that see it (empty = everyone who sees the record). */
  view_roles: Role[];
  /** Jobs that change it (the manager always can). */
  edit_roles: Role[];
  active: boolean;
}

/**
 * A permission profile (like Salesforce's profiles, simpler): built on one job, it takes pages away from the
 * people in it and can hide money they would otherwise see. It never gives more than the job has.
 */
export interface Profile {
  id: string;
  name: string;
  name_en?: string;
  description?: string;
  /** The job it is built on (not the manager). Only people of this job can be in it. */
  role: Exclude<Role, "manager">;
  /** Pages of that job the people in it can't open (gone from their menu too). */
  denied: string[];
  /** Money they don't see: purchase cost and profit, and the customers' debts. */
  limits: { no_profit?: boolean; no_debt?: boolean };
  /** See only: they open their pages but can't change anything (their own account and notifications still work). */
  read_only?: boolean;
  /** Login hours: outside them they can't log in, and an open session ends. Days: 0 = Sunday … 6 = Saturday. */
  hours?: { from: string; to: string; days: number[] };
  /** Things their job can do that this profile takes away. */
  deny_actions?: ProfileAction[];
  /** The app their menu opens on (see AppDef). */
  default_app?: string;
}

/** An app: a named set of pages with its color and icon. The people it is for switch to it from the launcher. */
export interface AppDef {
  id: string;
  name: string;
  name_en?: string;
  description?: string;
  /** #rrggbb */
  color: string;
  /** One of APP_ICONS. */
  icon: string;
  /** The pages, in the menu's order. Each person sees only the ones their job lets them open. */
  pages: string[];
  /** Who sees it: these jobs and these profiles. Both empty = nobody yet. */
  roles: Role[];
  profiles: string[];
  active: boolean;
}

/** Actions a profile can take away (each one is checked by the server, export by the pages). */
export type ProfileAction = "cancel_orders" | "discount" | "payments" | "returns" | "export";
export const PROFILE_ACTIONS: ProfileAction[] = ["cancel_orders", "discount", "payments", "returns", "export"];

/** Is this moment inside the profile's login hours? (no hours = always) */
export function inHours(hours: Profile["hours"], now: Date) {
  if (!hours) return true;
  if (!hours.days.includes(now.getDay())) return false;
  const hm = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
  return hours.from <= hours.to ? hm >= hours.from && hm < hours.to : hm >= hours.from || hm < hours.to;
}

export const APP_ICONS = ["grid", "cart", "wallet", "boxes", "truck", "chart", "users", "store", "star", "briefcase"] as const;

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
  /** This month's approved expenses (صرفيات), and the profit after them (who sees the profit only). */
  month_expenses?: number;
  month_net?: number;
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
  /** With a supply order: "the rest will not come", so the order closes with what arrived (short). */
  close_supply?: boolean;
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
  /** The keeper closed it although less arrived ("the rest will not come"): who and when. */
  closed_short?: { at: string; by: Person };
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

/** One product in the public catalog (the shop owners' landing page, no sign-in): what it is and whether it
 *  is in stock — never a price, a quantity or a cost (each shop's price depends on its level). */
export interface CatalogItem extends ItemUnits {
  id: number;
  name: string;
  name_en: string;
  category: string;
  brand?: string;
  image?: string;
  pieces_per_carton: number;
  in_stock: boolean;
}

export interface ItemInput extends ItemUnits {
  weight_kg?: number;
  brand?: string;
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
  /** A permission profile of the same job (advanced settings); none = the job's usual access. */
  profile_id?: string | null;
  /** Marketing rep: the monthly sales target in IQD; null or 0 = none. */
  sales_target?: number | null;
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

// ---------- Expenses (صرفيات): money paid out that isn't for goods (rent, salaries, fuel, generator…) ----------

/** approved: counted. pending: above the limit, waits for the manager. rejected / cancelled: not counted, kept. */
export type ExpenseStatus = "approved" | "pending" | "rejected" | "cancelled";

/** One payment voucher (سند صرف). Never deleted: cancelled with a reason, so the cash box always adds up. */
export interface Expense {
  id: number;
  number: string;
  /** The day it was paid (YYYY-MM-DD). */
  date: string;
  /** Rent, salaries, fuel… (one of EXPENSE_CATEGORIES, or a new one the accountant wrote). */
  category: string;
  amount: number;
  /** Paid from the cash box (cash) or from the bank / Zain Cash (transfer). */
  method: "cash" | "transfer";
  /** Who got the money: a person, a company, "the generator owner"… */
  paid_to: string;
  note?: string;
  /** The warehouse it was for (its rent, its generator…). None = the whole company. */
  warehouse_id?: number;
  /** The vehicle it was for (fuel, repair). */
  vehicle_id?: number;
  /** A picture of the bill or receipt (a small JPEG data URL). */
  photo?: string;
  status: ExpenseStatus;
  created_by: Person & { role: Role };
  created_at: string;
  /** The manager's answer to one above the limit. */
  decided_by?: Person;
  decided_at?: string;
  reject_reason?: string;
  cancelled_by?: Person;
  cancelled_at?: string;
  cancel_reason?: string;
}

export interface NewExpense {
  date: string;
  category: string;
  amount: number;
  method: "cash" | "transfer";
  paid_to: string;
  note?: string;
  warehouse_id?: number;
  vehicle_id?: number;
  photo?: string;
}

/** The usual kinds of expense of a food wholesaler in Iraq (the accountant can write a new one too). */
export const EXPENSE_CATEGORIES: { ar: string; en: string }[] = [
  { ar: "رواتب وأجور", en: "Salaries and wages" },
  { ar: "إيجار", en: "Rent" },
  { ar: "كهرباء ومولدة", en: "Electricity and generator" },
  { ar: "وقود السيارات", en: "Vehicle fuel" },
  { ar: "صيانة السيارات", en: "Vehicle repairs" },
  { ar: "أجور تحميل وتنزيل", en: "Loading labour" },
  { ar: "نقل وشحن", en: "Transport" },
  { ar: "صيانة المخازن", en: "Warehouse upkeep" },
  { ar: "إنترنت واتصالات", en: "Internet and phones" },
  { ar: "قرطاسية ومطبوعات", en: "Stationery and printing" },
  { ar: "ضيافة", en: "Hospitality" },
  { ar: "رسوم حكومية وضرائب", en: "Government fees and taxes" },
  { ar: "أخرى", en: "Other" },
];

/** The default limit: an expense above it waits for the manager (IQD). */
export const EXPENSE_APPROVAL_ABOVE = 1_000_000;

// ---------- Health and security (advanced settings, the manager) ----------

export type LoginFail = "wrong" | "stopped" | "hours";

/** One check of the security score: passed or not, how much it weighs, and where to fix it. */
export interface HealthCheck {
  key: string;
  ok: boolean;
  weight: number;
  title: string;
  title_en: string;
  detail: string;
  detail_en: string;
  fix?: string;
}

export interface Health {
  /** The last 24 hours. */
  logins: { ok: number; failed: number; reasons: Record<LoginFail, number>; recent: { phone: string; name?: string; reason: LoginFail; at: string }[] };
  /** 0–100, from the checks below. */
  score: number;
  checks: HealthCheck[];
  users: {
    active: number;
    stopped: number;
    managers: number;
    in_profiles: number;
    by_role: Record<Role, number>;
    /** Never logged in. */
    never: { id: number; name: string; role: Role }[];
    /** Last login more than 30 days ago. */
    idle: { id: number; name: string; role: Role; last: string }[];
    /** A password that is easy to guess (123456, the phone number, under 8 characters). Names only. */
    weak: { id: number; name: string; role: Role }[];
  };
}
