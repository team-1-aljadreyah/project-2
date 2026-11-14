import { http } from "./axios";
import type {
  AppNotification,
  AuditEntry,
  Allocation,
  Batch,
  CommissionRow,
  RatingsReport,
  Visit,
  VisitInput,
  CashHandover,
  CustodyLog,
  CustodyRow,
  StockWait,
  Clearance,
  PriceHistory,
  ScheduledPrice,
  ScheduledPriceInput,
  LateShop,
  ReorderDue,
  DaySummary,
  VisitsReport,
  ShopList,
  ShopListInput,
  CatalogItem,
  CounterSaleInput,
  RepTarget,
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
  RegisterInput,
  Receipt,
  Return,
  SalesRow,
  Session,
  Settings,
  SiteCustom,
  ItemQuick,
  SlowItem,
  Statement,
  Stocktake,
  StocktakeLine,
  Transfer,
  User,
  UserInput,
  Warehouse,
  Vehicle,
  VehicleInput,
  ShipmentLoad,
  CarrierPick,
  OtpPurpose,
  OtpSent,
  OtpVerified,
  WarehouseInput,
  WarehouseLayout,
  WarehouseCover,
  OnlinePayment,
  StartOnlinePayment,
  DeliverInput,
  ProblemInput,
  OrderEdit,
  NewSupplyOrder,
  SupplyOrder,
  CreditNote,
  Refund,
  PrepLine,
  BatchTrace,
  SpecialPrice,
  UsdRate,
  CommissionLine,
  RepKind,
  MyShop,
  NewShopInput,
  ChatMessage,
  ChatThread,
  MyChat,
  Expense,
  NewExpense,
  CustomObject,
  CustomValue,
  Health,
  RuleRun,
} from "./types";

export interface Lookups {
  warehouses: Warehouse[];
  vehicles: Vehicle[];
  tiers: PriceTier[];
  reps: { id: number; name: string; phone: string; kinds?: RepKind[] }[];
  categories: string[];
  settings: Settings;
  /** Today's dollar rate (or the last one set); null = never set. */
  usd_rate: UsdRate | null;
}

export interface ShelfRow {
  item_id: number;
  by_warehouse: { warehouse_id: number; on_shelf: number; sellable: number; reserved: number; expired: number }[];
}

export type SalesGroup = "rep" | "item" | "warehouse" | "customer";

// Helpers: GET / POST / PATCH / DELETE that return only the data part of the answer.
const get = <T>(url: string, params?: object) => http.get<T>(url, { params }).then((r) => r.data);
const del = <T>(url: string) => http.delete<T>(url).then((r) => r.data);
const post = <T>(url: string, body?: unknown, key?: string) => http.post<T>(url, body, key ? { headers: { "Idempotency-Key": key } } : undefined).then((r) => r.data);
const patch = <T>(url: string, body: unknown) => http.patch<T>(url, body).then((r) => r.data);
const save = <T>(base: string, id: number | null, body: unknown) => (id ? patch<T>(`${base}/${id}`, body) : post<T>(base, body));

// The real backend. One function for each endpoint. The fake one (mock.ts) must have the same functions.
export const httpApi = {
  login: (phone: string, password: string) => post<Session>("/auth/login", { phone, password }),
  register: (input: RegisterInput) => post<Session>("/auth/register", input),
  // «رمز التحقق» (OTP): WhatsApp, then Telegram, then SMS (the server sends it through Wevlix).
  /** Send a code to a phone. register / reset: no sign-in; phone: the signed-in person's new number. */
  sendOtp: (phone: string, purpose: OtpPurpose) => post<OtpSent>("/otp/send", { phone, purpose }),
  /** Check the code: the right one gives a token for the next request. */
  verifyOtp: (requestId: string, code: string) => post<OtpVerified>("/otp/verify", { request_id: requestId, code }),
  /** A forgotten password: a new one, with the token of a code sent to that phone (purpose reset). */
  resetPassword: (input: { phone: string; otp_token: string; password: string }) => post<null>("/auth/reset-password", input),
  /** Change my phone number (my login), with the token of a code sent to the new number (purpose phone). */
  changeMyPhone: (input: { phone: string; otp_token: string }) => post<User>("/me/phone", input),
  logout: () => post<void>("/auth/logout"),
  me: () => get<User>("/me"),
  /** The values of the manager's own fields on one record (only the ones this person may change). */
  saveCustomValues: (object: CustomObject, id: number, values: Record<string, CustomValue | null>) => patch<Record<string, CustomValue>>(`/custom/${object}/${id}`, values),
  /** What the automation rules did lately (the manager). */
  ruleRuns: () => get<RuleRun[]>("/setup/rule-runs"),
  /** Health and security (the manager): login errors of the last 24 hours, the security score and its checks, the users' access. */
  health: () => get<Health>("/setup/health"),
  /** The manager puts someone in a permission profile of their job (null = the job's usual access). */
  setUserProfile: (id: number, profileId: string | null) => post<User>(`/users/${id}/profile`, { profile_id: profileId }),
  /** The manager deletes a login (not his own). Its name stays on its records. */
  deleteUser: (id: number) => del<void>(`/users/${id}`),
  /** The manager removes someone's picture. */
  removeUserPhoto: (id: number) => del<User>(`/users/${id}/photo`),
  lookups: () => get<Lookups>("/lookups"),

  listUsers: () => get<User[]>("/users"),
  saveUser: (id: number | null, input: UserInput) => save<User>("/users", id, input),
  saveSettings: (s: Settings) => patch<Settings>("/settings", s),
  // The site's customization. Reading it needs no login (the login page shows the name and logo).
  site: () => get<SiteCustom | null>("/site"),
  saveSite: (s: SiteCustom) => patch<SiteCustom>("/settings/site", s),
  renameWarehouse: (id: number, name: string, name_en: string) => patch<Warehouse>(`/warehouses/${id}`, { name, name_en }),
  createWarehouse: (input: WarehouseInput) => post<Warehouse>("/warehouses", input),
  saveWarehouse: (id: number, input: WarehouseInput) => patch<Warehouse>(`/warehouses/${id}`, input),
  /** Only a warehouse with no goods, no open work, nobody in it and no past records (the manager). */
  deleteWarehouse: (id: number) => del<void>(`/warehouses/${id}`),
  /** The zones and the place of every item (the manager, or the keeper of this warehouse). */
  saveLayout: (id: number, layout: WarehouseLayout) => patch<Warehouse>(`/warehouses/${id}/layout`, layout),
  /** An absent keeper's warehouse given to another keeper until a time (null = end it). The manager. */
  setCover: (id: number, cover: Pick<WarehouseCover, "user_id" | "until"> | null) => post<Warehouse>(`/warehouses/${id}/cover`, { cover }),
  renameCategory: (from: string, to: string) => post<void>("/categories/rename", { from, to }),
  quickItem: (id: number, change: ItemQuick) => patch<Item>(`/items/${id}/quick`, change),
  saveTier: (id: number | null, name: string, name_en: string) => save<PriceTier>("/price-tiers", id, { name, name_en }),

  listItems: () => get<Item[]>("/items"),
  getItem: (id: number) => get<Item>(`/items/${id}`),
  saveItem: (id: number | null, input: ItemInput) => save<Item>("/items", id, input),
  /** The public catalog (no sign-in): the products on sale with their pictures, no prices. */
  catalog: () => get<CatalogItem[]>("/catalog"),
  /** Delete an item (manager). Never used: removed for good ("removed"). Used before: hidden everywhere, its
   *  name kept on the old records ("hidden"). Refused while it has stock or is on an open order. */
  deleteItem: (id: number) => del<{ result: "removed" | "hidden" }>(`/items/${id}`),
  /** image: a data URL from the page (the backend stores the file and returns its link in item.image), or null to remove. */
  setItemImage: (id: number, image: string | null) => post<Item>(`/items/${id}/image`, { image }),
  /** video: the uploaded file's link (the backend takes the file: multipart, ≤ 20 MB, ≤ 30 s) or null to remove. */
  setItemVideo: (id: number, video: string | null) => post<Item>(`/items/${id}/video`, { video }),
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
  /** category: count only that category (only those items stop selling there meanwhile). */
  createStocktake: (warehouseId: number, category?: string) => post<Stocktake>("/stocktakes", { warehouse_id: warehouseId, ...(category ? { category } : {}) }),
  // Expenses (صرفيات): payment vouchers for rent, salaries, fuel… Above the limit they wait for the manager.
  listExpenses: () => get<Expense[]>("/expenses"),
  getExpense: (id: number) => get<Expense>(`/expenses/${id}`),
  createExpense: (input: NewExpense) => post<Expense>("/expenses", input),
  /** The manager: yes, or no with a reason. */
  decideExpense: (id: number, ok: boolean, reason?: string) => post<Expense>(`/expenses/${id}/decide`, { ok, reason }),
  /** Never deleted: cancelled with a reason (it stays, struck out). */
  cancelExpense: (id: number, reason: string) => post<Expense>(`/expenses/${id}/cancel`, { reason }),

  // Supply orders: the accountant orders goods for a warehouse; its keeper receives them (a receipt with supply_order_id).
  listSupplyOrders: () => get<SupplyOrder[]>("/supply-orders"),
  getSupplyOrder: (id: number) => get<SupplyOrder>(`/supply-orders/${id}`),
  createSupplyOrder: (input: NewSupplyOrder) => post<SupplyOrder>("/supply-orders", input),
  cancelSupplyOrder: (id: number, reason: string) => post<SupplyOrder>(`/supply-orders/${id}/cancel`, { reason }),
  /** The receiving keeper takes a transfer in: { item_id: pieces that arrived }; less needs a reason. */
  receiveTransfer: (id: number, received: Record<number, number>, reason: string) => post<Transfer>(`/transfers/${id}/receive`, { received, reason }),
  reviewTransfer: (id: number) => post<Transfer>(`/transfers/${id}/review`),
  /** A mistake on an invoice: take an amount off it (a credit note). */
  creditInvoice: (invoiceId: number, amount: number, reason: string) => post<CreditNote>(`/invoices/${invoiceId}/credit`, { amount, reason }),
  /** Give money back to the shop (up to its credit): cash, transfer, or back to an online payment's card. */
  refundCustomer: (customerId: number, input: { amount: number; method: Refund["method"]; payment_id?: number; reason: string }) => post<Refund>(`/customers/${customerId}/refunds`, input),
  creditNotes: (customerId: number) => get<CreditNote[]>(`/customers/${customerId}/credit-notes`),
  refunds: (customerId: number) => get<Refund[]>(`/customers/${customerId}/refunds`),
  /** A shop's own prices (manager sets them; they come before the tier price). null removes one. */
  specialPrices: (customerId: number) => get<SpecialPrice[]>(`/customers/${customerId}/prices`),
  setSpecialPrice: (customerId: number, itemId: number, prices: { carton_price: number; piece_price: number } | null) =>
    post<SpecialPrice[]>(`/customers/${customerId}/prices`, { item_id: itemId, prices }),
  /** Stop selling the rest of a batch (both warehouses), put it back on sale, and see who got it. */
  holdBatch: (id: number, reason: string) => post<Batch>(`/batches/${id}/hold`, { reason }),
  releaseBatch: (id: number) => post<Batch>(`/batches/${id}/release`),
  traceBatch: (id: number) => get<BatchTrace[]>(`/batches/${id}/trace`),
  saveStocktake: (id: number, lines: StocktakeLine[]) => patch<Stocktake>(`/stocktakes/${id}`, { lines }),
  closeStocktake: (id: number) => post<Stocktake>(`/stocktakes/${id}/close`),
  listDamaged: () => get<DamagedRecord[]>("/damaged"),

  listCustomers: () => get<Customer[]>("/customers"),
  getCustomer: (id: number) => get<Customer>(`/customers/${id}`),
  saveCustomer: (id: number | null, input: CustomerInput) => save<Customer>("/customers", id, input),
  rejectCustomer: (id: number, reason: string) => post<Customer>(`/customers/${id}/reject`, { reason }),
  statement: (customerId: number, from?: string, to?: string) => get<Statement>(`/customers/${customerId}/statement`, { from, to }),

  listOrders: () => get<Order[]>("/orders"),
  getOrder: (id: number) => get<Order>(`/orders/${id}`),
  // Support chat. The page asks again every few seconds (later the backend can push with WebSockets).
  myChat: () => get<MyChat>("/chat/me"),
  // «قوائمي»: the shop's saved lists (only its own).
  shopLists: () => get<ShopList[]>("/shop-lists"),
  saveShopList: (id: number | null, input: ShopListInput) => save<ShopList>("/shop-lists", id, input),
  deleteShopList: (id: number) => del<null>(`/shop-lists/${id}`),
  sendChat: (text: string) => post<ChatMessage>("/chat/me", { text }),
  chatThreads: () => get<ChatThread[]>("/chat"),
  getChat: (customerId: number) => get<ChatMessage[]>(`/chat/${customerId}`),
  replyChat: (customerId: number, text: string) => post<ChatMessage>(`/chat/${customerId}`, { text }),
  markChatRead: (customerId: number) => post<void>(`/chat/${customerId}/read`),
  // Delivery proof. The backend keeps the PIN and only sends it to the order's shop owner.
  /** The delivery rep scanned the shipment's QR at the warehouse. */
  dispatchDelivery: (code: string) => post<Order>("/deliveries/dispatch", { code }),
  /** At the shop: the photo and the PIN. A wrong PIN comes back as { ok: false, left, locked }. */
  deliverOrder: (id: number, input: DeliverInput) => post<{ ok: true; order: Order } | { ok: false; left: number; locked: boolean }>(`/orders/${id}/deliver`, input),
  unlockDelivery: (id: number) => post<Order>(`/orders/${id}/delivery/unlock`),
  saveVehicle: (id: number | null, input: VehicleInput) => save<Vehicle>("/vehicles", id, input),
  /** Put a prepared order on vehicles: one load = that vehicle; more = one shipment per vehicle (same order). */
  planShipments: (id: number, loads: ShipmentLoad[]) => post<Order>(`/orders/${id}/shipments`, { loads }),
  /** The warehouse staff loaded the shipment into the delivery rep's van. */
  loadShipment: (id: number) => post<Order>(`/orders/${id}/delivery/load`),
  // Where the delivery rep is. His phone sends it every few seconds while he has shipments on the way;
  // the backend passes it on over the WebSocket (topic "location") to the manager and to those shops.
  sendLocation: (lat: number, lng: number) => post<{ rep_id: number; lat: number; lng: number; at: string }>("/deliveries/location", { lat, lng }),
  repLocations: () => get<{ rep_id: number; lat: number; lng: number; at: string }[]>("/deliveries/locations"),
  // A shop owner with several shops
  myShops: () => get<MyShop[]>("/me/shops"),
  /** Work on another of his shops; returns the user with the new customer_id. */
  switchShop: (customerId: number) => post<User>("/me/shop", { customer_id: customerId }),
  addShop: (input: NewShopInput) => post<MyShop>("/me/shops", input),
  /** Your own picture (a small JPEG data URL). Everyone may change theirs; removing one is the manager's. */
  setMyPhoto: (photo: string) => post<User>("/me/photo", { photo }),
  /** The shop owner: the current password, then the new one. */
  changeMyPassword: (current: string, next: string) => post<void>("/me/password", { current, next }),
  /** The shop owner removes one of his shops (not the only one), after his password. Refused while money or orders are open. */
  removeMyShop: (customerId: number, password: string) => post<User>(`/me/shops/${customerId}/remove`, { password }),
  /** The shop owner deletes his whole account, after his password. Refused while money or orders are open. */
  deleteMyAccount: (password: string) => post<void>("/me/delete", { password }),
  /** The delivery rep can't deliver (accident, shop closed...): marks the shipments and tells the manager. */
  reportDeliveryProblem: (input: ProblemInput) => post<Order[]>("/deliveries/problem", input),
  /** Manager / warehouse keeper: the shipment is back at the warehouse ("ready" again). */
  returnToWarehouse: (id: number) => post<Order>(`/orders/${id}/delivery/return`),
  getDeliveryPhoto: (id: number) => get<string | null>(`/orders/${id}/delivery/photo`),
  createOrder: (input: NewOrder) => post<Order>("/orders", input, input.client_ref),
  /** The keeper's counter sale: the invoice, already paid in full (the goods left the warehouse). */
  counterSale: (input: CounterSaleInput) => post<Invoice>("/counter-sales", input, input.client_ref),
  /** The accountant / manager approves the order (it stays held until delivered). */
  acceptOrder: (id: number) => post<Order>(`/orders/${id}/accept`),
  /** The shop owner rates the delivery of his order (1–5, a note), within 7 days of it; again to change it. */
  rateDelivery: (id: number, input: { stars: number; note?: string }) => post<Order>(`/orders/${id}/rating`, input),
  /** Delivery ratings (manager, accountant): the average, per delivery rep, the latest. */
  ratingsReport: () => get<RatingsReport>("/reports/delivery-ratings"),
  // «خط السير»: the marketing reps' weekly visits.
  /** One day's visits (a rep: his own; the manager: everyone's, or one rep's). */
  listVisits: (day: string, repId?: number) => get<Visit[]>("/visits", { day, rep_id: repId }),
  /** The rep records a visit at one of his shops (a second one the same day changes it). */
  recordVisit: (input: VisitInput) => post<Visit>("/visits", input),
  /** The manager sets the days a shop is visited by its rep (0 = Sunday … 6 = Saturday; [] = none). */
  setVisitDays: (customerId: number, days: number[]) => post<Customer>(`/customers/${customerId}/visit-days`, { days }),
  /** Planned against done, per rep, the visits missed and the ones far from the shop (manager). */
  visitsReport: (from: string, to: string) => get<VisitsReport>("/reports/visits", { from, to }),
  // «العهدة»: the cash the reps hold.
  /** What each rep holds now (manager, accountant), or the rep's own. */
  custody: () => get<CustodyRow[]>("/custody"),
  /** One rep's cash in and out, and his handovers. */
  custodyLog: (repId: number) => get<CustodyLog>(`/custody/${repId}`),
  /** The rep hands cash to the accountant (waits to be counted); the accountant / manager with rep_id: taken and counted at once. */
  handOver: (input: { rep_id?: number; amount: number; note?: string }) => post<CashHandover>("/custody/handovers", input),
  /** The accountant counted it: what he received (≤ declared; the shortage stays on the rep). */
  confirmHandover: (id: number, received: number) => post<CashHandover>(`/custody/handovers/${id}/confirm`, { received }),
  /** The rep takes back his handover before it is counted, or the accountant refuses it. */
  cancelHandover: (id: number) => post<CashHandover>(`/custody/handovers/${id}/cancel`),
  // «أعلمني عند التوفر»
  /** The items this shop owner waits for (the shop he works on now). */
  myStockAlerts: () => get<number[]>("/stock-alerts"),
  /** Ask to be told when an item that ran out is back (on), or stop (off). Returns his list. */
  setStockAlert: (itemId: number, on: boolean) => post<number[]>("/stock-alerts", { item_id: itemId, on }),
  /** What the shops are waiting for, most shops first (manager, accountant, keepers). */
  stockWaitlist: () => get<StockWait[]>("/stock-alerts/waitlist"),
  // «عروض التصريف»
  /** The clearances, running ones first (manager, accountant, keepers). The running one also comes on its item. */
  listClearances: () => get<Clearance[]>("/clearances"),
  /** The manager sells a near-expiry batch at a discount (5–70%) until it is sold or expires. */
  startClearance: (input: { batch_id: number; percent: number }) => post<Clearance>("/clearances", input),
  /** The manager stops a clearance early. */
  cancelClearance: (id: number) => post<Clearance>(`/clearances/${id}/cancel`),
  // «تغيير الأسعار من تاريخ»
  /** The price changes set for a day: waiting first (manager, accountant). */
  listScheduledPrices: () => get<ScheduledPrice[]>("/price-schedule"),
  /** The manager sets new prices from a day (a percent for many items, or one item's exact prices). */
  schedulePrice: (input: ScheduledPriceInput) => post<ScheduledPrice>("/price-schedule", input),
  /** The manager drops a change before its day. */
  cancelScheduledPrice: (id: number) => post<ScheduledPrice>(`/price-schedule/${id}/cancel`),
  /** One item's prices over time, and what is scheduled (manager, accountant). */
  priceHistory: (itemId: number) => get<PriceHistory>(`/items/${itemId}/price-history`),
  // «قارب ينفد عندك؟»
  /** The shop owner's items he usually orders again about now (from his own orders). */
  myReorder: () => get<ReorderDue[]>("/reorder/due"),
  /** Shops later than usual with their next order (a rep: his own; manager, accountant: all). */
  lateShops: () => get<LateShop[]>("/reorder/late-shops"),
  /** «ملخص اليوم»: a day's numbers against the day before and the same day last week, best rep, late deliveries
   *  and low stock now (manager, accountant; the profit only for who sees it). */
  daySummary: (date: string) => get<DaySummary>("/reports/day-summary", { date }),
  /** For the keeper: free stock per warehouse for each line, and the suggested warehouse. */
  prepPlan: (id: number) => get<PrepLine[]>(`/orders/${id}/prep-plan`),
  /** The keeper prepared it; warehouses = { item_id: warehouse_id }. Makes the shipment label. */
  /** carrier: the delivery rep and the vehicle the keeper chose (optional; none = the usual). */
  prepareOrder: (id: number, warehouses: Record<number, number>, carrier?: CarrierPick) => post<Order>(`/orders/${id}/prepare`, { warehouses, ...carrier }),
  /** Change who takes a prepared shipment out (before it is loaded): the delivery rep, and the vehicle or none. */
  setCarrier: (id: number, carrier: CarrierPick) => post<Order>(`/orders/${id}/delivery/carrier`, carrier),
  approveOrder: (id: number) => post<Order>(`/orders/${id}/approve`),
  /** The shop owner changes his order before it is confirmed. */
  updateOrder: (id: number, input: OrderEdit) => patch<Order>(`/orders/${id}`, input),
  /** 0 removes it. Rep / keeper above 3%: the order waits for the manager. */
  setOrderDiscount: (id: number, percent: number) => post<Order>(`/orders/${id}/discount`, { percent }),
  cancelOrder: (id: number, reason: string) => post<Order>(`/orders/${id}/cancel`, { reason }),

  listInvoices: () => get<Invoice[]>("/invoices"),
  getInvoice: (id: number) => get<Invoice>(`/invoices/${id}`),

  listPayments: () => get<Payment[]>("/payments"),
  getPayment: (id: number) => get<Payment>(`/payments/${id}`),
  previewAllocation: (customerId: number, amount: number) => get<Allocation[]>(`/customers/${customerId}/allocation`, { amount }),
  createPayment: (input: NewPayment) => post<Payment>("/payments", input, input.client_ref),
  // Online payment (Qi Card): the backend creates the payment at Qi and returns Qi's page address (form_url).
  // The result comes from Qi's notification to the backend, so the page asks again until it is final.
  startOnlinePayment: (input: StartOnlinePayment) => post<OnlinePayment>("/payments/online", input, input.key),
  getOnlinePayment: (id: string) => get<OnlinePayment>(`/payments/online/${id}`),
  listOnlinePayments: () => get<OnlinePayment[]>("/payments/online"),
  reversePayment: (id: number, reason: string) => post<Payment>(`/payments/${id}/reverse`, { reason }),

  listReturns: () => get<Return[]>("/returns"),
  getReturn: (id: number) => get<Return>(`/returns/${id}`),
  createReturn: (input: NewReturn) => post<Return>("/returns", input, input.client_ref),

  commissions: (month: string) => get<CommissionRow[]>("/commissions", { month }),
  closeMonth: (month: string) => post<CommissionRow[]>("/commissions/close", { month }),
  closedMonths: () => get<string[]>("/commissions/closed"),
  /** Each marketing rep's month against his monthly target, ranked (a rep gets only his own row). */
  repTargets: (month: string) => get<RepTarget[]>("/reps/targets", { month }),

  // The dollar rate (the accountant fixes it every day)
  usdRates: () => get<UsdRate[]>("/usd-rates"),
  setUsdRate: (rate: number) => post<UsdRate>("/usd-rates", { rate }),
  /** Every payment of the month on the rep's invoices and its commission (a rep gets only his). */
  commissionLines: (month: string) => get<CommissionLine[]>("/commissions/lines", { month }),
  /** warehouseId: one warehouse only (the manager's / accountant's filter); empty = both. */
  dashboard: (warehouseId?: number | null) => get<Dashboard>("/dashboard", warehouseId ? { warehouse_id: warehouseId } : undefined),
  dailySales: (date: string, warehouseId?: number | null) => get<DailySales>("/reports/daily-sales", { date, ...(warehouseId ? { warehouse_id: warehouseId } : {}) }),
  salesReport: (group: SalesGroup, from: string, to: string, warehouseId?: number | null) =>
    get<SalesRow[]>("/reports/sales", { group_by: group, from, to, ...(warehouseId ? { warehouse_id: warehouseId } : {}) }),
  slowMoving: (days: number, warehouseId?: number | null) => get<SlowItem[]>("/reports/slow-moving", { days, ...(warehouseId ? { warehouse_id: warehouseId } : {}) }),
  nearExpiry: (days: number) => get<NearExpiryRow[]>("/reports/near-expiry", { days }),
  debts: () => get<DebtRow[]>("/reports/debts"),

  listAudit: () => get<AuditEntry[]>("/audit"),
  listNotifications: () => get<AppNotification[]>("/notifications"),
  markRead: (id: number) => post<null>(`/notifications/${id}/read`),
  markAllRead: () => post<null>("/notifications/read-all"),
  /** This phone's Web Push address (the browser's subscription): the server sends each new notification to it. */
  savePushSubscription: (sub: { endpoint: string; keys: { p256dh: string; auth: string } }) => post<null>("/push-subscriptions", sub),
  deletePushSubscription: (endpoint: string) => post<null>("/push-subscriptions/delete", { endpoint }),

  /** Demo only: the real backend has no such thing. */
  resetDemo: async () => {},
};

export type Api = typeof httpApi;
