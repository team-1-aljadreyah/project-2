# Al-Nahrain: what the backend must provide

This is everything the real backend has to do for the site to work as it works today on the demo data.

**The reference is already written.** The site runs today on a fake backend inside the browser
(`lib/api/mock.ts`, `lib/api/mock/rules.ts`, `lib/api/mock/seed.ts`). It has the same calls as the real one
(`lib/api/http.ts`: the paths, the bodies, the answers) and it applies every rule below. When a rule here is
not clear, read the matching function there: it is the exact behaviour the pages expect.

Switching the site to the backend: `NEXT_PUBLIC_USE_MOCK=false`, `NEXT_PUBLIC_API_URL=https://api…`,
`NEXT_PUBLIC_WS_URL=wss://api…/ws` (Cloudflare Pages → Settings → Environment variables), then rebuild.

---

## 1. The basics (every call)

| Topic | What the site expects |
|---|---|
| Base URL | `{NEXT_PUBLIC_API_URL}/api/v1` + the paths in section 10. JSON in, JSON out. |
| Success | `{ "success": true, "data": … }` (the site reads `data`). |
| Failure | `{ "success": false, "message": "نص للمستخدم", "code": "VALIDATION", "errors": { "field": "نص" } }` with the right HTTP status. `errors` keys are the form's field names (`lines.0.qty`, `custom.<fieldId>` …): the form shows each under its box. |
| Codes | `VALIDATION` 422 · `UNAUTHENTICATED` 401 · `FORBIDDEN` 403 · `NOT_FOUND` 404 · `BAD_STATE` 409 (not allowed in this state) · `OUT_OF_STOCK` · `DEBT_LIMIT` · `RETURN_TOO_MUCH` · `ALREADY_REVERSED` · `MONTH_CLOSED`. |
| Language | Every request has `Accept-Language: ar` or `en`. `message` and `errors` come in that language (Arabic: Fusha). |
| Login | `POST /auth/login {phone, password}` → `{ token, user }`. Every other call: `Authorization: Bearer <token>`. A `401` makes the site log the person out (so: wrong/expired token, stopped or deleted account, outside login hours). |
| Phones | Iraqi mobiles `07XXXXXXXXX` (11 digits); the site also strips spaces and turns Arabic digits into Latin. |
| Money | Whole Iraqi dinars (integers). USD only for display, by the day's rate (`/usd-rates`). |
| Dates | ISO 8601 with time zone; days `YYYY-MM-DD`. The business day is Baghdad time (UTC+3). |
| Sent twice | Orders, payments and transfers carry `client_ref` and the header `Idempotency-Key` (the rep's phone resends them when the internet comes back). The same key again must return the **first** result, never make a second record. |
| Passwords | Hashed (bcrypt/argon2). Rate-limit `/auth/login`. Never send `password` back. |
| CORS | Allow the site's domain(s) (the Cloudflare Pages domain and the final one). |
| Lists | The site loads whole lists today (small company). Paging can come later without changing the pages: return the same arrays. |

---

## 2. Jobs and who sees what

Jobs (`role`): `manager`, `accountant`, `warehouse` (keeper of one warehouse), `staff` (warehouse staff),
`rep` (`rep_kinds`: `sales` and/or `delivery`), `shop` (shop owner, may own several shops: `customer_ids`).

The server must filter and hide, not only the pages:

- **Purchase cost and profit** (`avg_cost`, `purchase_price`, `cost`, `profit`, `month_profit`): manager and accountant only.
- **Debts** (`balance`, `debt_limit`, collected money on the dashboard): not for `warehouse` and `staff`.
- **A rep** sees only his customers (`customer.rep_id`), their orders, invoices and payments; and only the item
  categories the manager gave him (`rep_categories`, empty = all).
- **A shop owner** sees only his current shop (`customer_id`): its orders, invoices, statement, chat; only his
  own price (his tier or his special price).
- **The delivery PIN** (`order.delivery.pin`) is sent only to that order's shop owner.
- **A keeper** works in his warehouse (`warehouse_id`) plus any warehouse he temporarily covers
  (`warehouse.cover` until its date): preparing, receiving, transfers, counts, layout.
- **Everything the manager can do**: manager only (users, settings, prices, profiles, apps, fields, rules…).

---

## 3. Advanced settings (the manager's Setup) — enforced by the server

All of these are saved in the site settings (`PATCH /settings/site`, `SiteCustom`) except where noted.
The pages read them, but the server must **apply** them:

1. **Permission profiles** (`SiteCustom.profiles`, `user.profile_id`). A profile belongs to one job.
   - `denied`: pages taken away → refuse the endpoints behind those pages for that person (403).
   - `limits.no_profit` / `limits.no_debt`: stop sending cost/profit or debts to that person.
   - `read_only`: refuse every change (403 «ملفك للعرض فقط») except the person's own account (photo,
     password, own shops, delete own account), notifications read, chat read, shop switch.
   - `hours {from, to, days}`: outside them refuse the login (403) and any request (401 → logged out).
   - `deny_actions`: `cancel_orders`, `discount`, `payments`, `returns` → 403 «ليس من صلاحيات ملفك: …»
     (`export` is blocked by the pages).
   - `POST /users/:id/profile {profile_id|null}` (must be a profile of the user's job).
2. **Apps** (`SiteCustom.apps`): only settings; nothing to enforce.
3. **Custom fields** (`SiteCustom.fields`) on customers, items, orders.
   - Values per record: `PATCH /custom/:object/:id {fieldId: value|null}` → the values the person may see.
   - Check the type (text ≤ 500, number, date `YYYY-MM-DD`, list = one of `options`, yes/no boolean),
     `required` (422 `custom.<id>`), `edit_roles` (403; the manager always may).
   - Every customer / item / order the server sends carries `custom: {fieldId: value}` with only the fields
     whose `view_roles` include the person (empty = everyone who sees the record).
4. **Automation rules** (`SiteCustom.rules`): after creating an order, a payment, an expense or a return, run
   the active rules of that trigger: all `conditions` (field/op/value) must hold → notify `notify` jobs with
   `message` ({number} {amount} {customer} {by} filled in), and if `approval`: an order becomes
   `needs_approval` with `approval_for` += `"rule"` and `rule_note` = the rules' names; an expense becomes
   `pending`. Write each run to a log: `GET /setup/rule-runs` (last 100).
5. **Health and security**: write every login attempt (ok / wrong password / stopped / outside hours).
   `GET /setup/health` returns the last 24 h logins, the users' access (never logged in, idle 30+ days, weak
   passwords: checked at login time and stored as a flag, never the password), and the 6 checks with their
   weights (see `health` in `lib/api/mock.ts`).

---

## 4. Business rules (the heart of it)

**Stock**
- Stock lives in **batches** (item, warehouse, expiry date, purchase price, quantity left). Selling takes the
  oldest expiry first (FEFO). Expired batches are never sold. Quantities are pieces; cartons = `pieces_per_carton`.
- An order **holds** its stock while `pending`/`needs_approval` for `settings.reservation_hours` (default 24 h);
  after that it becomes `expired` and the stock is free again (a job, see section 8).
- Receiving goods creates batches (`POST /receipts`). From a supply order it counts against it; `close_supply`
  closes it short. The difference (short / over / not ordered, value) is notified to the accountant.
- Transfers between warehouses (`sent` → reviewed by the receiving keeper), counts (`stocktakes`, close writes
  the differences), damaged records, held batches (`releaseBatch`).
- Item weight (`weight_kg`, or guessed from the name) is used for vehicle loads.

**Orders**
- Statuses: `pending` → (`needs_approval`) → `approved` (accepted / prepared) → `confirmed` (delivered) ·
  `cancelled` · `expired`. Who may create: manager, rep (his customers), shop (his shop), accountant.
- Over the customer's **debt limit** → `needs_approval` (`approval_for: ["debt"]`); the manager approves.
- **Discount**: a rep/accountant up to `STAFF_DISCOUNT_MAX` (3 %) alone, more needs the manager; never above
  `DISCOUNT_MAX` (30 %).
- The shop owner may change his order until it is confirmed (`PATCH /orders/:id`).
- Preparing (keeper): prepared lines, per-warehouse parts (`prep_parts`), vehicle chosen (the driver's vehicle).
- **Vehicles and loads**: each vehicle has `capacity_kg`. An order heavier than the vehicle is split into
  loads (`POST /orders/:id/shipments`): one child order per vehicle (`shipment_of`, number `ORD-…/2`), each
  with its own delivery, PIN, driver and invoice. Loading checks the room left (`/delivery/load`).
- **Delivery**: `ready` → loaded → `out` (the rep scans the QR) → `delivered` with the shop's PIN and a photo;
  3 wrong PINs lock it (manager unlocks); problems are reported (`/delivery/problem`). The rep's location is
  posted every few seconds and pushed live (section 5).
- Delivered = the **invoice** is made (lines, cost, rep, warehouse). The rest of a partly delivered load stays
  a load of the same order.

**Money**
- **Payments** are spread over the customer's open invoices oldest first (`previewAllocation` shows it before
  saving); method `cash` / `transfer` / `online` (Qi Card, section 7). A payment is never deleted: it is
  **reversed** with a reason (once).
- **Returns** against an invoice (≤ what was sold minus already returned), condition sellable/damaged
  (sellable goes back to stock); a return on a paid invoice gives the shop credit (credit note), money can be
  given back (refund).
- **Commissions**: each item has `commission_percent`; reps earn on their delivered sales per month.
- **Expenses**: payment vouchers; above `settings.expense_approval_above` (default 1,000,000) an accountant's
  expense is `pending` until the manager approves/rejects; never deleted, only cancelled with a reason; the
  dashboard's `month_net` = month profit − approved expenses.
- **Dollar rate**: the accountant sets it daily (`POST /usd-rates`).
- **Customer statement**: every invoice, payment, return, refund with the running balance.

**People and places**
- Users: one keeper per warehouse; a deleted user can't log in, his phone is free again, his name stays on his
  records; the manager can't delete himself or the only manager; a rep with shops/orders/shipments can't be
  deleted. Photos: everyone changes his own, only the manager removes one.
- Shops sign up themselves (`/auth/register`) → `pending` until the manager approves (sets tier, rep, limit) or
  rejects. An owner adds more shops (`/me/shops`, pending too), removes one (not with debt/credit/open orders),
  deletes his account (same conditions), changes his password (current one first).
- Warehouses: create, edit, arrange zones (layout), temporary cover, delete only an empty one (no goods, open
  orders, transfers, supply orders, counts, staff or past records; never the only one).
- Everything that changes money or stock is written to the **activity log** (`/audit`), which can't be edited.

---

## 5. Live updates

See `docs/realtime.md` (WebSocket at `NEXT_PUBLIC_WS_URL`, topics `notifications`, `chat`, `orders`,
`location`). After any change, push the topic to the people it concerns: the open pages reload by themselves
(and if the socket is down they also check every 45 s and when the tab comes back).

## 6. Pictures

Today they travel as small JPEG data URLs inside the JSON (made smaller on the phone): item photos
(`setItemImage`), the delivery photo, an expense's bill, user photos (`/me/photo`), the logo (site settings).
The backend may store them as files (S3 / Cloudflare R2) and return a URL in the same field.

## 7. Online payment (Qi Card)

`POST /payments/online {customer_id, amount}` → the server creates the payment at Qi and returns
`OnlinePayment { payment_id, form_url, status: "created" }`; the page sends the shop owner to `form_url`
(the card is typed on Qi's page, never on ours); Qi calls the server's webhook; the shop owner comes back to
`/statement?payment=<payment_id>` and the page asks `GET /payments/online/:id` until the status is final
(`success` / `failed` / `authentication_failed` / `canceled`). A successful one becomes a normal payment
(method `online`, `recorded_payment_id`, the card's last 4 digits only).

## 8. Jobs that run by themselves

| When | What |
|---|---|
| Every minute | Orders whose `reserved_until` passed → `expired`, stock freed, the rep/shop notified. |
| Every morning | Near-expiry batches (`settings.near_expiry_days`), expired batches, items under `min_stock` → notifications to the keepers and the manager. |
| Monthly | Commissions of the month closed (`MONTH_CLOSED` after that). |
| Always | Temporary covers end at their date; profiles' login hours checked on every request. |

## 9. Data

The shapes are in `lib/api/types.ts` (the same names in JSON): `User`, `Customer`, `Item` (with `prices` per
tier, `stock.by_warehouse`), `Batch`, `Warehouse` (`layout`, `cover`), `Vehicle`, `Order` (`lines`,
`delivery`, `discount`, `shipments`, `custom`), `Invoice`, `Payment` (`allocations`), `Return`, `CreditNote`,
`Refund`, `Receipt`, `SupplyOrder`, `Transfer`, `Stocktake`, `Expense`, `AppNotification`, `AuditEntry`,
`ChatMessage`, `Settings`, `SiteCustom` (with `profiles`, `apps`, `fields`, `rules`), `Health`, `RuleRun`.

## 10. Every endpoint
<!-- 131 endpoints, generated from lib/api/http.ts -->

### Login and own account

| Call | Method | Path | Takes | Returns | Notes |
|---|---|---|---|---|---|
| `login` | POST | `/auth/login` | `phone: string, password: string` | `Session` |  |
| `register` | POST | `/auth/register` | `input: RegisterInput` | `Session` |  |
| `logout` | POST | `/auth/logout` |  | `void` |  |
| `me` | GET | `/me` |  | `User` |  |
| `myShops` | GET | `/me/shops` |  | `MyShop[]` | A shop owner with several shops |
| `switchShop` | POST | `/me/shop` | `customerId: number` | `User` | Work on another of his shops; returns the user with the new customer_id. |
| `addShop` | POST | `/me/shops` | `input: NewShopInput` | `MyShop` |  |
| `setMyPhoto` | POST | `/me/photo` | `photo: string` | `User` | Your own picture (a small JPEG data URL). Everyone may change theirs; removing one is the manager's. |
| `changeMyPassword` | POST | `/me/password` | `current: string, next: string` | `void` | The shop owner: the current password, then the new one. |
| `removeMyShop` | POST | `/me/shops/:customerId/remove` | `customerId: number, password: string` | `User` | The shop owner removes one of his shops (not the only one), after his password. Refused while money or orders are open. |
| `deleteMyAccount` | POST | `/me/delete` | `password: string` | `void` | The shop owner deletes his whole account, after his password. Refused while money or orders are open. |

### Users, profiles, health and automation (manager)

| Call | Method | Path | Takes | Returns | Notes |
|---|---|---|---|---|---|
| `ruleRuns` | GET | `/setup/rule-runs` |  | `RuleRun[]` | What the automation rules did lately (the manager). |
| `health` | GET | `/setup/health` |  | `Health` | Health and security (the manager): login errors of the last 24 hours, the security score and its checks, the users' access. |
| `setUserProfile` | POST | `/users/:id/profile` | `id: number, profileId: string \| null` | `User` | The manager puts someone in a permission profile of their job (null = the job's usual access). |
| `deleteUser` | DELETE | `/users/:id` | `id: number` | `void` | The manager deletes a login (not his own). Its name stays on its records. |
| `removeUserPhoto` | DELETE | `/users/:id/photo` | `id: number` | `User` | The manager removes someone's picture. |
| `listUsers` | GET | `/users` |  | `User[]` |  |
| `saveUser` | POST (new) / PATCH :id | `/users` | `id: number \| null, input: UserInput` | `User` |  |

### Site settings, lookups and customization

| Call | Method | Path | Takes | Returns | Notes |
|---|---|---|---|---|---|
| `saveCustomValues` | PATCH | `/custom/:object/:id` | `object: CustomObject, id: number, values: Record<string, CustomValue \| null>` | `Record<string, CustomValue>` | The values of the manager's own fields on one record (only the ones this person may change). |
| `lookups` | GET | `/lookups` |  | `Lookups` |  |
| `saveSettings` | PATCH | `/settings` | `s: Settings` | `Settings` |  |
| `site` | GET | `/site` |  | `SiteCustom \| null` | The site's customization. Reading it needs no login (the login page shows the name and logo). |
| `saveSite` | PATCH | `/settings/site` | `s: SiteCustom` | `SiteCustom` |  |
| `renameCategory` | POST | `/categories/rename` | `from: string, to: string` | `void` |  |
| `saveTier` | POST (new) / PATCH :id | `/price-tiers` | `id: number \| null, name: string, name_en: string` | `PriceTier` |  |
| `usdRates` | GET | `/usd-rates` |  | `UsdRate[]` | The dollar rate (the accountant fixes it every day) |
| `setUsdRate` | POST | `/usd-rates` | `rate: number` | `UsdRate` |  |

### Warehouses and vehicles

| Call | Method | Path | Takes | Returns | Notes |
|---|---|---|---|---|---|
| `renameWarehouse` | PATCH | `/warehouses/:id` | `id: number, name: string, name_en: string` | `Warehouse` |  |
| `createWarehouse` | POST | `/warehouses` | `input: WarehouseInput` | `Warehouse` |  |
| `saveWarehouse` | PATCH | `/warehouses/:id` | `id: number, input: WarehouseInput` | `Warehouse` |  |
| `deleteWarehouse` | DELETE | `/warehouses/:id` | `id: number` | `void` | Only a warehouse with no goods, no open work, nobody in it and no past records (the manager). |
| `saveLayout` | PATCH | `/warehouses/:id/layout` | `id: number, layout: WarehouseLayout` | `Warehouse` | The zones and the place of every item (the manager, or the keeper of this warehouse). |
| `setCover` | POST | `/warehouses/:id/cover` | `id: number, cover: Pick<WarehouseCover, "user_id" \| "until"> \| null` | `Warehouse` | An absent keeper's warehouse given to another keeper until a time (null = end it). The manager. |
| `saveVehicle` | POST (new) / PATCH :id | `/vehicles` | `id: number \| null, input: VehicleInput` | `Vehicle` |  |

### Items and stock

| Call | Method | Path | Takes | Returns | Notes |
|---|---|---|---|---|---|
| `quickItem` | PATCH | `/items/:id/quick` | `id: number, change: ItemQuick` | `Item` |  |
| `listItems` | GET | `/items` |  | `Item[]` |  |
| `getItem` | GET | `/items/:id` | `id: number` | `Item` |  |
| `saveItem` | POST (new) / PATCH :id | `/items` | `id: number \| null, input: ItemInput` | `Item` |  |
| `setItemImage` | POST | `/items/:id/image` | `id: number, image: string \| null` | `Item` | image: a data URL from the page (the backend stores the file and returns its link in item.image), or null to remove. |
| `itemBatches` | GET | `/items/:itemId/batches` | `itemId: number` | `Batch[]` |  |
| `listBatches` | GET | `/batches` | `warehouseId?: number` | `Batch[]` |  |
| `shelfStock` | GET | `/stock` |  | `ShelfRow[]` |  |
| `holdBatch` | POST | `/batches/:id/hold` | `id: number, reason: string` | `Batch` | Stop selling the rest of a batch (both warehouses), put it back on sale, and see who got it. |
| `releaseBatch` | POST | `/batches/:id/release` | `id: number` | `Batch` |  |
| `traceBatch` | GET | `/batches/:id/trace` | `id: number` | `BatchTrace[]` |  |
| `listDamaged` | GET | `/damaged` |  | `DamagedRecord[]` |  |

### Receiving, supply orders, transfers, counts

| Call | Method | Path | Takes | Returns | Notes |
|---|---|---|---|---|---|
| `listReceipts` | GET | `/receipts` |  | `Receipt[]` |  |
| `getReceipt` | GET | `/receipts/:id` | `id: number` | `Receipt` |  |
| `createReceipt` | POST | `/receipts` | `input: NewReceipt` | `Receipt` |  |
| `listTransfers` | GET | `/transfers` |  | `Transfer[]` |  |
| `createTransfer` | POST | `/transfers` | `input: NewTransfer` | `Transfer` |  |
| `listStocktakes` | GET | `/stocktakes` |  | `Stocktake[]` |  |
| `getStocktake` | GET | `/stocktakes/:id` | `id: number` | `Stocktake` |  |
| `createStocktake` | POST | `/stocktakes` | `warehouseId: number, category?: string` | `Stocktake` | category: count only that category (only those items stop selling there meanwhile). |
| `listSupplyOrders` | GET | `/supply-orders` |  | `SupplyOrder[]` | Supply orders: the accountant orders goods for a warehouse; its keeper receives them (a receipt with supply_order_id). |
| `getSupplyOrder` | GET | `/supply-orders/:id` | `id: number` | `SupplyOrder` |  |
| `createSupplyOrder` | POST | `/supply-orders` | `input: NewSupplyOrder` | `SupplyOrder` |  |
| `cancelSupplyOrder` | POST | `/supply-orders/:id/cancel` | `id: number, reason: string` | `SupplyOrder` |  |
| `receiveTransfer` | POST | `/transfers/:id/receive` | `id: number, received: Record<number, number>, reason: string` | `Transfer` | The receiving keeper takes a transfer in: { item_id: pieces that arrived }; less needs a reason. |
| `reviewTransfer` | POST | `/transfers/:id/review` | `id: number` | `Transfer` |  |
| `saveStocktake` | PATCH | `/stocktakes/:id` | `id: number, lines: StocktakeLine[]` | `Stocktake` |  |
| `closeStocktake` | POST | `/stocktakes/:id/close` | `id: number` | `Stocktake` |  |

### Customers, statements, special prices

| Call | Method | Path | Takes | Returns | Notes |
|---|---|---|---|---|---|
| `refundCustomer` | POST | `/customers/:customerId/refunds` | `customerId: number, input: { amount: number; method: Refund["method"]; payment_id?: number; reason: string }` | `Refund` | Give money back to the shop (up to its credit): cash, transfer, or back to an online payment's card. |
| `creditNotes` | GET | `/customers/:customerId/credit-notes` | `customerId: number` | `CreditNote[]` |  |
| `refunds` | GET | `/customers/:customerId/refunds` | `customerId: number` | `Refund[]` |  |
| `specialPrices` | GET | `/customers/:customerId/prices` | `customerId: number` | `SpecialPrice[]` | A shop's own prices (manager sets them; they come before the tier price). null removes one. |
| `setSpecialPrice` | POST | `/customers/:customerId/prices` | `customerId: number, itemId: number, prices: { carton_price: number; piece_price: number } \| null` | `SpecialPrice[]` |  |
| `listCustomers` | GET | `/customers` |  | `Customer[]` |  |
| `getCustomer` | GET | `/customers/:id` | `id: number` | `Customer` |  |
| `saveCustomer` | POST (new) / PATCH :id | `/customers` | `id: number \| null, input: CustomerInput` | `Customer` |  |
| `rejectCustomer` | POST | `/customers/:id/reject` | `id: number, reason: string` | `Customer` |  |
| `statement` | GET | `/customers/:customerId/statement` | `customerId: number, from?: string, to?: string` | `Statement` |  |
| `previewAllocation` | GET | `/customers/:customerId/allocation` | `customerId: number, amount: number` | `Allocation[]` |  |

### Orders, delivery and loads

| Call | Method | Path | Takes | Returns | Notes |
|---|---|---|---|---|---|
| `listOrders` | GET | `/orders` |  | `Order[]` |  |
| `getOrder` | GET | `/orders/:id` | `id: number` | `Order` |  |
| `dispatchDelivery` | POST | `/deliveries/dispatch` | `code: string` | `Order` | Delivery proof. The backend keeps the PIN and only sends it to the order's shop owner. The delivery rep scanned the shipment's QR at the warehouse. |
| `deliverOrder` | POST | `/orders/:id/deliver` | `id: number, input: DeliverInput` | `{ ok: true; order: Order } \| { ok: false; left: number; locked: boolean }` | At the shop: the photo and the PIN. A wrong PIN comes back as { ok: false, left, locked }. |
| `unlockDelivery` | POST | `/orders/:id/delivery/unlock` | `id: number` | `Order` |  |
| `planShipments` | POST | `/orders/:id/shipments` | `id: number, loads: ShipmentLoad[]` | `Order` | Put a prepared order on vehicles: one load = that vehicle; more = one shipment per vehicle (same order). |
| `loadShipment` | POST | `/orders/:id/delivery/load` | `id: number` | `Order` | The warehouse staff loaded the shipment into the delivery rep's van. |
| `sendLocation` | POST | `/deliveries/location` | `lat: number, lng: number` | `{ rep_id: number; lat: number; lng: number; at: string }` | Where the delivery rep is. His phone sends it every few seconds while he has shipments on the way; the backend passes it on over the WebSocket (topic "location") to the manager and to those shops. |
| `repLocations` | GET | `/deliveries/locations` |  | `{ rep_id: number; lat: number; lng: number; at: string }[]` |  |
| `reportDeliveryProblem` | POST | `/deliveries/problem` | `input: ProblemInput` | `Order[]` | The delivery rep can't deliver (accident, shop closed...): marks the shipments and tells the manager. |
| `returnToWarehouse` | POST | `/orders/:id/delivery/return` | `id: number` | `Order` | Manager / warehouse keeper: the shipment is back at the warehouse ("ready" again). |
| `getDeliveryPhoto` | GET | `/orders/:id/delivery/photo` | `id: number` | `string \| null` |  |
| `createOrder` | POST | `/orders` | `input: NewOrder` | `Order` |  |
| `acceptOrder` | POST | `/orders/:id/accept` | `id: number` | `Order` | The accountant / manager approves the order (it stays held until delivered). |
| `prepPlan` | GET | `/orders/:id/prep-plan` | `id: number` | `PrepLine[]` | For the keeper: free stock per warehouse for each line, and the suggested warehouse. |
| `prepareOrder` | POST | `/orders/:id/prepare` | `id: number, warehouses: Record<number, number>` | `Order` | The keeper prepared it; warehouses = { item_id: warehouse_id }. Makes the shipment label. |
| `approveOrder` | POST | `/orders/:id/approve` | `id: number` | `Order` |  |
| `updateOrder` | PATCH | `/orders/:id` | `id: number, input: OrderEdit` | `Order` | The shop owner changes his order before it is confirmed. |
| `setOrderDiscount` | POST | `/orders/:id/discount` | `id: number, percent: number` | `Order` | 0 removes it. Rep / keeper above 3%: the order waits for the manager. |
| `cancelOrder` | POST | `/orders/:id/cancel` | `id: number, reason: string` | `Order` |  |

### Invoices, payments, returns, refunds, credit notes

| Call | Method | Path | Takes | Returns | Notes |
|---|---|---|---|---|---|
| `creditInvoice` | POST | `/invoices/:invoiceId/credit` | `invoiceId: number, amount: number, reason: string` | `CreditNote` | A mistake on an invoice: take an amount off it (a credit note). |
| `listInvoices` | GET | `/invoices` |  | `Invoice[]` |  |
| `getInvoice` | GET | `/invoices/:id` | `id: number` | `Invoice` |  |
| `listPayments` | GET | `/payments` |  | `Payment[]` |  |
| `getPayment` | GET | `/payments/:id` | `id: number` | `Payment` |  |
| `createPayment` | POST | `/payments` | `input: NewPayment` | `Payment` |  |
| `startOnlinePayment` | POST | `/payments/online` | `input: StartOnlinePayment` | `OnlinePayment` | Online payment (Qi Card): the backend creates the payment at Qi and returns Qi's page address (form_url). The result comes from Qi's notification to the backend, so the page asks again until it is final. |
| `getOnlinePayment` | GET | `/payments/online/:id` | `id: string` | `OnlinePayment` |  |
| `listOnlinePayments` | GET | `/payments/online` |  | `OnlinePayment[]` |  |
| `reversePayment` | POST | `/payments/:id/reverse` | `id: number, reason: string` | `Payment` |  |
| `listReturns` | GET | `/returns` |  | `Return[]` |  |
| `getReturn` | GET | `/returns/:id` | `id: number` | `Return` |  |
| `createReturn` | POST | `/returns` | `input: NewReturn` | `Return` |  |

### Expenses

| Call | Method | Path | Takes | Returns | Notes |
|---|---|---|---|---|---|
| `listExpenses` | GET | `/expenses` |  | `Expense[]` | Expenses (صرفيات): payment vouchers for rent, salaries, fuel… Above the limit they wait for the manager. |
| `getExpense` | GET | `/expenses/:id` | `id: number` | `Expense` |  |
| `createExpense` | POST | `/expenses` | `input: NewExpense` | `Expense` |  |
| `decideExpense` | POST | `/expenses/:id/decide` | `id: number, ok: boolean, reason?: string` | `Expense` | The manager: yes, or no with a reason. |
| `cancelExpense` | POST | `/expenses/:id/cancel` | `id: number, reason: string` | `Expense` | Never deleted: cancelled with a reason (it stays, struck out). |

### Commissions, dashboard and reports

| Call | Method | Path | Takes | Returns | Notes |
|---|---|---|---|---|---|
| `commissions` | GET | `/commissions` | `month: string` | `CommissionRow[]` |  |
| `closeMonth` | POST | `/commissions/close` | `month: string` | `CommissionRow[]` |  |
| `closedMonths` | GET | `/commissions/closed` |  | `string[]` |  |
| `commissionLines` | GET | `/commissions/lines` | `month: string` | `CommissionLine[]` | Every payment of the month on the rep's invoices and its commission (a rep gets only his). |
| `dashboard` | GET | `/dashboard` | `warehouseId?: number \| null` | `Dashboard` | warehouseId: one warehouse only (the manager's / accountant's filter); empty = both. |
| `dailySales` | GET | `/reports/daily-sales` | `date: string, warehouseId?: number \| null` | `DailySales` |  |
| `salesReport` | GET | `/reports/sales` | `group: SalesGroup, from: string, to: string, warehouseId?: number \| null` | `SalesRow[]` |  |
| `slowMoving` | GET | `/reports/slow-moving` | `days: number, warehouseId?: number \| null` | `SlowItem[]` |  |
| `nearExpiry` | GET | `/reports/near-expiry` | `days: number` | `NearExpiryRow[]` |  |
| `debts` | GET | `/reports/debts` |  | `DebtRow[]` |  |

### Notifications, chat and activity log

| Call | Method | Path | Takes | Returns | Notes |
|---|---|---|---|---|---|
| `myChat` | GET | `/chat/me` |  | `MyChat` | Support chat. The page asks again every few seconds (later the backend can push with WebSockets). |
| `sendChat` | POST | `/chat/me` | `text: string` | `ChatMessage` |  |
| `chatThreads` | GET | `/chat` |  | `ChatThread[]` |  |
| `getChat` | GET | `/chat/:customerId` | `customerId: number` | `ChatMessage[]` |  |
| `replyChat` | POST | `/chat/:customerId` | `customerId: number, text: string` | `ChatMessage` |  |
| `markChatRead` | POST | `/chat/:customerId/read` | `customerId: number` | `void` |  |
| `listAudit` | GET | `/audit` |  | `AuditEntry[]` |  |
| `listNotifications` | GET | `/notifications` |  | `AppNotification[]` |  |
| `markRead` | POST | `/notifications/:id/read` | `id: number` | `null` |  |
| `markAllRead` | POST | `/notifications/read-all` |  | `null` |  |

