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
  categories the manager gave him (`rep_categories`, empty = all). His monthly target (`sales_target`, set by
  the manager on the user) is counted by `GET /reps/targets`: the month's invoices with his `rep_id` less the
  returns on them; he gets only his own row (with his rank), the manager and accountant get every marketing rep.
- **Quantity offers** (`item.offer = {unit, min, off, until?}`, set in the item form): every sale (shop, rep,
  office, counter) takes `off` IQD off each unit of a line in that `unit` with `qty ≥ min`, until the end of
  `until` (by the day the order is recorded), never below zero; the line keeps `offer_off` (its `unit_price` is
  after it). Check: `min ≥ 2`, `0 < off <` the lowest price of that unit, `until ≥ today`.
- **«قوائمي»** (`GET/POST/PUT /shop-lists`, `DELETE /shop-lists/:id`, shop owners only, for the shop they work on
  now): `{id, customer_id, name ≤ 40, lines ≤ 80 [{item_id, unit, qty}], updated_at}`, up to 30 per shop. Putting
  a list in the bag happens in the app (only what can be ordered now).
- **Product videos** (`POST /items/:id/video`, manager and keeper): take the file (multipart, mp4/webm/mov,
  ≤ 20 MB, ≤ 30 s), store it (CDN) and keep its https link in `item.video`; `{video: null}` removes it. The demo
  keeps an uploaded file in the browser (IndexedDB, `media:<key>`), so only that device plays it; a link plays
  everywhere.
- **Phone notifications (Web Push).** The app registers `public/sw.js` and, when `NEXT_PUBLIC_VAPID_KEY` is set,
  sends the phone's subscription to `POST /push-subscriptions` (`{endpoint, keys: {p256dh, auth}}`; remove with
  `POST /push-subscriptions/delete {endpoint}`). Keep them per person; whenever a notification is made for a
  person (and a support message for the other side), send `{title, body, url, tag}` to each of their
  subscriptions with the VAPID private key (e.g. the `web-push` library); drop one that answers 404/410. Without
  it, the app still shows them on the phone while it is open in the background.
- **Delivery ratings** (`POST /orders/:id/rating {stars 1–5, note ≤ 300}`, the order's shop owner, within 7 days
  of the delivery, again to change it): kept on the order (`rating`, with the rep who delivered); 1–2 stars →
  a notification to the manager. `GET /reports/delivery-ratings` (manager, accountant): average, spread,
  per delivery rep (count, average, low ones), the latest 30.
- **Brands and the store's ads.** An item may have `brand` (≤ 40 letters, saved with the item; also in
  `GET /catalog`): the shop owners' app shows a brands row and filters by it. The manager's ads live in the
  site settings (`SiteCustom.banners`, saved with `PUT /site`): up to 12, each `{id, image (JPEG/PNG/WebP,
  ≤ 600 KB as a data URL — keep a file link instead), title ≤ 60, sub?, link: {kind: category|brand|item|search,
  value}, active}`; check them like the rest of the site settings. The store's automatic slides (new arrivals,
  last order, big sections, paying the debt) are made by the app from data it already has.
- **The public catalog** (`GET /catalog`, no sign-in): every active item that isn't deleted, with only `id`,
  the names, category, picture, packing (`pieces_per_carton`, the unit names, `sells`) and `in_stock` (sellable
  pieces > 0 anywhere). Never a price, a quantity, a cost or a barcode: the shop owners' landing page shows it
  to anyone. Cache it for a few minutes; pictures through a CDN.
- **ZainCash** (the shop pays its debt from its wallet; `provider: "zaincash"` on `POST /payments/online`, from
  1,000 IQD; Qi Card stays the default). Payment gateway API v2: keep `client_id` / `client_secret` in the
  server's environment only (the demo uses ZainCash's public UAT test keys in `lib/zaincash.ts`, never real ones).
  1) `POST {base}/oauth2/token` (form: `grant_type=client_credentials`, the id and secret, `scope=payment:read
  payment:write`) → `access_token` (~24 h, cache it). 2) `POST {base}/api/v2/payment-gateway/transaction/init`
  (Bearer) with `{language, externalReferenceId (uuid), orderId: our payment_id, amount: {value, currency:
  "IQD"}, serviceType, redirectUrls: {successUrl, failureUrl}}` → save `transactionDetails.transactionId` as
  `gateway_id`, send the customer to `redirectUrl` (our `form_url`). 3) The way back has `?token=` (JWT HS256
  signed with the client secret): verify it, read `data.currentStatus` / `transactionId`. 4) Before recording,
  ask `GET {base}/api/v2/payment-gateway/transaction/inquiry/{transactionId}` (`status`: SUCCESS, FAILED,
  PENDING, EXPIRED…). SUCCESS → one payment, method `online`, `gateway: {provider: "zaincash", payment_id:
  transactionId, card: the wallet hidden}`, on the oldest invoices (only what is still owed); FAILED → failed;
  EXPIRED / CANCELLED → canceled; PENDING → keep asking (the payment page lives 15 minutes). Refunds: ZainCash's
  full / partial reverse. Base: UAT `https://pg-api-uat.zaincash.iq`, live `https://pg-api.zaincash.iq`.
- **Road routes** (`lib/road.ts`): the maps draw the trip along the real streets with its km and minutes from
  an OSRM server. The demo calls the free public `router.project-osrm.org` straight from the browser; it has no
  guarantee and sends the shops' points to a third party, so before launch host OSRM (Iraq extract of
  OpenStreetMap) or add `GET /route?points=lng,lat;lng,lat…` that forwards to a paid router, and change `ROUTER`.
  Same answer shape as OSRM (`routes[0].geometry.coordinates`, `distance` m, `duration` s); cache it per point list.
  The «افتح في» buttons (Google Maps / Waze / Apple Maps / Android's geo: chooser) need nothing from the server.
- **The rep's phone on a shipment** (`delivery.out_phone`): saved when he scans it out (`POST /deliveries/dispatch`),
  so the shop owner's tracker can show «اتصل بالمندوب» while it is on the way.
- **The keeper picks the driver and the vehicle.** `POST /orders/:id/prepare {warehouses, rep_id?, vehicle_id?}`:
  both optional. `rep_id` = an active rep who delivers (422 on `rep_id` otherwise); `vehicle_id` = an active
  vehicle (422 on `vehicle_id`). A vehicle with no rep chosen brings its own driver; a rep with no vehicle gets his
  own vehicle (if he has one); neither = as before (the order's rep if he delivers, else the least busy, and his
  vehicle). Prepared from two warehouses: a choice given before the last part is kept on the order
  (`carrier_pick`) and used when the label is made. A chosen driver is told («شحنة لك: …»). After preparing,
  until the shipment is loaded (and not split): `POST /orders/:id/delivery/carrier {rep_id, vehicle_id | null}`
  (manager; keeper / staff of that warehouse): the rep is required, `vehicle_id: null` = no vehicle; a new rep is
  told; both go to the activity log. Splitting across vehicles (`POST /orders/:id/shipments`): each load may carry
  `driver_id` (a delivery rep); none = the vehicle's own driver.
- **«رمز التحقق» (OTP), sent through Wevlix.** `POST /otp/send {phone, purpose}` (no sign-in for `register` /
  `reset`; signed in for `phone`): phone `07` + 9 digits. `register`: 409 if the number has an account; `phone`:
  not your current number, not another account's (409); `reset`: the same answer whether the number has an
  account or not (nothing is sent when it doesn't: nobody learns which numbers exist). Limits: 60 s before another
  code for the same number and purpose (429 `RATE_LIMITED`), 5 codes an hour per number (429). The server calls
  Wevlix `POST https://api.wevlix.com/v1/otp/send` (header `X-API-Key`, server-side only; `to` in E.164: `07…` →
  `+9647…`; `otpMode: "generated"`; `locale: "ar"`; `clientMessageId` = our `request_id`), keeps Wevlix's `messageId`
  with our `request_id`, and answers `{request_id, expires_at (+5 min), resend_at (+60 s)}` — never the code.
  WhatsApp first, then Telegram, then SMS: set in the Wevlix project's fallback settings (not in the request).
  `POST /otp/verify {request_id, code}`: Wevlix `POST /v1/otp/verify {messageId, code}`; wrong → 422 on `code`
  («الرمز غير صحيح، باقي n محاولات»), 5 wrong → 429, after 5 min → 410; right → `{otp_token, expires_at (+15 min)}`,
  a token for that phone and purpose, usable once. It is required by: `POST /auth/register` (`otp_token`, purpose
  `register`, for the form's phone), `POST /auth/reset-password {phone, otp_token, password ≥ 6}` (purpose
  `reset`: sets that account's password; the old sessions should end), and `POST /me/phone {phone, otp_token}`
  (purpose `phone`: the signed-in person's login phone; returns the user). Missing / wrong token → 422 on
  `otp_token`. Development: a Wevlix development key (sandbox: `simulated: true`, only to its test numbers, no
  charge). The demo instead returns `sandbox_code` and shows it on the screen — the real server never sends it.
  Until `/otp/send` exists the site lets sign-up go on without a token (any 404 there).
- **Map names**: the map draws Arabic street, area and place names from OpenFreeMap's tiles and fonts (no key);
  the Arabic text plugin is served by the site itself (`public/vendor/mapbox-gl-rtl-text.min.js`, BSD licence).
- **Item units** (`pack_name`, `piece_name`, `sells` on the item; none = كارتون / قطعة, both sold): the two levels
  stay `carton` (the big pack) and `piece` (the single) everywhere. Save: names up to 20 letters and different
  from each other; `pieces_per_carton` 1 means the single only; a price is required only for a unit that is
  sold, the other follows (`carton = piece × n`, or `piece = round(carton / n)`), also on the quick price edit.
  Every sale (`POST /orders`, `/counter-sales`, the shop's order edit) refuses a line in a unit the item isn't
  sold by (422 on `lines.i.unit`); receiving, supply orders and transfers may use either level.
- **Deleting an item** (`DELETE /items/:id`, manager): refused (409) while any piece is in a warehouse, or it is on
  an order not delivered or a supply order not received. Never received, ordered, moved or counted: removed for
  good (`{result: "removed"}`). Otherwise `deleted: true` and `active: false` (`{result: "hidden"}`): still sent
  in `GET /items` so old invoices show its name, but refused in receipts and supply orders, and the pages hide it.
- **Counter sale** (`POST /counter-sales`, the warehouse keeper only, from a warehouse he works in): someone
  who came to the warehouse pays on the spot. One request does it all: the order (`source: "counter"`, no rep:
  `rep_id` 0), the invoice (stock out, oldest expiry first, the price of the `tier_id` he chose, total rounded to
  250) and the payment in full on that invoice (`cash` or `transfer`). Every counter sale goes under one customer
  with `walk_in: true` («زبون مباشر», made the first time, debt limit 0); it is not a shop: hide it from the
  customer lists and pickers, and refuse it in `POST /orders`. `counter` on the order and the invoice keeps the
  buyer's optional name and phone (07 + 9 digits), the level, the method and the cash handed over (≥ total).
  Same `client_ref` again = the same invoice back. No delivery trip, no notifications to a rep.
- **«خط السير» (the marketing reps' weekly visits).** `visit_days` on the customer (0 = Sunday … 6 = Saturday;
  none = not planned), set by the manager only (`POST /customers/:id/visit-days {days}`); it plans the shop's
  own rep (`rep_id`). A visit (`POST /visits`, a marketing rep, a shop of his own only, not the walk-in one):
  `{customer_id, outcome: order | payment | no_order | closed, reason?: stocked | no_money | price | other
  (no_order only; none = other), note? ≤ 200, lat?, lng?}`. One visit per rep, shop and day: a second one
  changes it. The server works out `distance_m` from the shop's pin (`address_info.lat/lng`; none when either is
  missing) and `far` when it is over 200 m — the visit is still recorded, only marked. `planned` = the shop was on
  the plan that day (kept on the visit). An order (`POST /orders`) or a payment (`POST /payments`) a marketing rep
  makes for a shop of his records that day's visit by itself (outcome `order` with `order_id`, or `payment`;
  an order beats a payment, a payment beats no order / closed; the location of an earlier visit that day is
  kept). `GET /visits?day=&rep_id=`: a rep gets his own, the manager everyone's or one rep's.
  `GET /reports/visits?from=&to=` (manager, at most 62 days, up to today): per rep planned / visited (planned
  ones only) / missed (planned, not visited, before today) / remaining (today's not yet visited) / extra (visits
  off the plan) / far / orders, the no-order reasons, the missed list and the far ones. The demo works the plan
  out from today's `visit_days`; the backend should keep each day's plan (a nightly copy) so changing the plan
  later doesn't rewrite the past. Keep visits at least 120 days.
- **«العهدة» (the cash the reps hold).** A rep's custody = the cash payments he received (`method: cash`,
  `received_by` him, each minus what was reversed of it) − what the accountant counted from his handovers. `GET /custody`: the manager
  and the accountant get every rep who ever held cash (`holding`, `today`, `pending`, `short_total`, `oldest_at` =
  the first payment the handovers don't cover yet, oldest first), the rep only his own row. `GET /custody/:repId`:
  his cash in and out (newest first) and his handovers. `POST /custody/handovers {amount, note?}` by the rep:
  pending (one at a time; amount a whole number, > 0, ≤ what he holds) → a notification to the accountant.
  The same call by the accountant or the manager with `rep_id`: cash taken from the rep in person, counted at once.
  `POST /custody/handovers/:id/confirm {received}` (accountant, manager): 0 ≤ received ≤ declared; the
  shortage (`short` = declared − received) stays in his custody, notifies the manager and the rep; full →
  notifies the rep. `POST /custody/handovers/:id/cancel`: the rep takes his back, or the accountant refuses it
  (the rep is told). Every confirm goes to the activity log (entity `custody`). Numbers `HND-000001`.
- **«أعلمني عند التوفر».** A shop owner asks to be told when an item that ran out is back:
  `POST /stock-alerts {item_id, on}` (shop owners only; returns his list of item ids, as `GET /stock-alerts`).
  On: only an active item that can't be sold now from the shops' warehouse (the first one; 409 if it can), at most
  50 per shop; per shop owner and his current shop. Off: removed. Whenever an item's sellable stock in that
  warehouse goes above 0 (a receipt, a transfer in, a return in good condition, a count, a reservation freed),
  each one waiting gets a notification `back_in_stock` (title «توفّرت «…» من جديد», link `/search?item=<id>`, also by
  Web Push) and his ask is removed. An item deleted or stopped drops its asks. `GET /stock-alerts/waitlist`
  (manager, accountant, keepers, staff): per item the shops waiting, the first ask, the shop names; most shops
  first. The supply order's «اطلب الناقص» fill adds these items too.
- **«عروض التصريف» (near-expiry batches at a discount).** `POST /clearances {batch_id, percent}` (manager):
  5–70% (the page suggests 30% with 7 days or less to the expiry, 20% with 14, else 10%); the batch has pieces
  left, isn't held and isn't expired; one running per item and warehouse. It runs until the day before the
  batch's expiry; it ends by itself (`sold` / `expired`) when the batch has no pieces left or that day passes, or
  the manager stops it (`POST /clearances/:id/cancel`). Every item sent with one running in a warehouse carries
  `clearance {id, percent, warehouse_id, until, left}` (a shop owner: only for the shops' warehouse, the first
  one). Pricing (`POST /orders`, the order edit, `/counter-sales`): for an order from that warehouse, a line whose
  pieces fit in what is left of the batch costs `round250(price × (1 − percent/100))` per unit; a bigger line is all
  at the usual price; the bigger of the clearance and the quantity offer applies, never both (`offer_off` +
  `clearance: true` on the line). Starting one in the shops' warehouse notifies every shop owner (`clearance`, link
  `/search?item=<id>`); it goes to the activity log as a price change. `GET /clearances` (manager, accountant,
  keepers, staff): the last 100, running first, with `left`.
- **«تغيير الأسعار من تاريخ».** `POST /price-schedule {item_ids, start, percent? | prices?, note?}` (manager):
  1–200 items not deleted; `start` from today to 90 days ahead; `percent` −50…+100 and not 0 (every tier: the
  carton rounded to 250 IQD, the piece to 50, then the item's unit rule), or `prices` (per tier, all > 0) for exactly
  one item. An item already waiting for a change refuses a second (409). Each item gets `direction` up / down /
  mixed. On its day (start ≤ today, checked before every request, so at the first request of the morning) the
  prices change: every old tier price goes to the price history (`price_changes` with `until`), the change becomes
  `applied`, and it goes to the activity log. Shop owners who ordered any of the items in the last 60 days
  (not cancelled / expired) get one `price_change` notification each, naming only their items: a rise when it is
  set («يرتفع سعر … يوم … · اطلب قبله»), a fall on its day («انخفض سعر …»); `told` counts them. `POST
  /price-schedule/:id/cancel` before its day. An order changed later is priced as of the moment it was written
  (`created_at`), so open orders written before the day keep the old prices. `GET /items/:id/price-history`
  (manager, accountant): per tier the old prices with `from`/`until`, the current one, and the scheduled ones with
  their `next` prices. `GET /price-schedule`: the last 60, waiting first.
- **«قارب ينفد عندك؟» (reorder reminders).** Learned from each shop's own orders (not cancelled / expired, no
  counter sales, no split shipments). Per item: the distinct days the shop ordered it; with 3 or more, `every_days`
  = the average gap (rounded, ≥ 1). `GET /reorder/due` (the shop owner, his current shop): items where the days
  since the last order of it ≥ every − 1 and ≤ every × 3, leaving out items stopped / deleted and items on one of
  its open orders (not delivered yet); with the last unit and amount; the most overdue for its own rhythm first,
  12 at most. Once a day from 9 in the morning each shop owner with any due gets one `reorder` notification
  (link `/shop#reorder`). `GET /reorder/late-shops` (a rep: his shops; manager, accountant: all): shops with
  no open order whose days since their last order (same rhythm over all their orders) > every × 1.25 and ≥ every + 2.
- **«ملخص اليوم».** `GET /reports/day-summary?date=` (manager, accountant): for the day, the day before and the
  same weekday a week before: `sales`, `invoices`, `returns` (as the sales report counts them), `collected`
  (payments that day, reversals subtracting), `new_debt` = sales − returns − collected, `orders` written that day
  (no split shipments), and `profit` only for who sees the profit. Also the best rep that day (net of returns;
  the counter sales apart as `counter_sales`), and now: deliveries not delivered a day after their order (10 at
  most, oldest first) and items under their minimum in all warehouses (10, the furthest under first).
  `settings.summary_hour` (0–23, none = 21): from that hour each day the manager and the accountant get one
  `day_summary` notification (sales, collected, orders; link `/summary`).
- **Thermal receipts (80 / 58 mm).** Printed by the browser from data the pages already have (the invoice, the
  payment with its `allocations`, the delivered order); the paper width is kept on each device. Nothing new from
  the server. The QR code opens `/invoices/:id`, `/payments/:id` or `/orders/:id` on the site, so these pages must
  stay reachable at those addresses (after sign-in).
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
6. **The company's rules** (`Settings.advanced`, saved with `PATCH /settings`). Every value, its default (what
   the site did before) and its limits are in **`lib/api/advanced.ts`** (`DEFAULT_RULES`, `checkRules`): use the
   same file's numbers. Save only what differs from the defaults; refuse a wrong set with 422 and
   `errors` = `checkRules`'s keys. A login that fails over these: 423 `LOCKED`; a switched-off feature: 403
   `FEATURE_OFF`. What each one changes on the server:
   - **Orders:** `staff_discount_max` / `discount_max` (replace the 3% / 30%); `auto_confirm_rep_orders` (a rep's
     order with nothing else holding it is approved at once, by «اعتماد تلقائي»); `offline_max_days` (replaces the
     3 days); `round_to` (0 / 50 / 100 / 250 / 500 / 1000; replaces 250 in every total); `shop_edit_minutes`
     (0 = until approved; else a shop owner's change after that many minutes → 409 `EDIT_CLOSED`);
     `min_shop_order` (a shop owner's new order under it → 422 `MIN_ORDER`); `over_limit`: `approval` (as now),
     `block` (409 `DEBT_LIMIT`, nothing saved), `allow` (no approval; notify the manager «سُمح به»).
   - **New shops:** `features.self_signup` false → `POST /auth/register` 403 `SIGNUP_CLOSED`; `signup_tier_id`
     (null = the last tier), `signup_debt_limit`, `signup_auto_approve` (active at once, not pending) — also for
     an owner's added shop; `max_shops_per_account` (replaces 10).
   - **Delivery:** `pin_tries` (replaces 5); `photo_required` false → `photo` optional on deliver (`has_photo`
     false without one); `low_rating_stars` (0 = never; replaces «≤ 2»); `door_methods` (a method not in it, or
     Qi / ZainCash while `features.online_pay` is off → 403 `FEATURE_OFF`).
   - **Money:** `custody_cap` (0 = none): a rep who takes cash while holding more → notify accountant + manager,
     at most once a day per rep; `reverse_roles` (always has manager); `reverse_days` (0 = any age; an older
     payment → only the manager, else 403 `TOO_OLD`).
   - **Visits:** `visit_near_m` (replaces 200 m); `far_visit_alert` → notify the manager of a far visit.
   - **Stock:** `clearance {near_days, near_percent, mid_days, mid_percent, far_percent}` (the suggested %);
     `reorder_early_days` (replaces the 1 day); `features.clearance` off → no clearance price anywhere and
     starting one 403; `features.reorder` off → no reminders, empty lists.
   - **Security:** `otp {code_minutes, resend_seconds, per_hour, tries}` (replace 5 / 60 / 5 / 5);
     `login_lock_after` (0 = never) + `login_lock_minutes`: that many wrong passwords in a row since the last
     good login → refuse even the right one until the minutes pass (write it to the login log as `locked`);
     `password_min` (sign-up, reset, change, new users; replaces 6).
   - **Features** (`features.*`, all on by default): `online_pay` (`POST /payments/online` 403), `ratings`
     (`POST /orders/:id/rating` 403), `notify_me` (`POST /stock-alerts` with `on: true` 403; no back-in-stock notices), `support_chat`
     (`POST /chat/me` 403), `offline` (the pages stop queueing), `clearance`, `reorder`, `self_signup` (above).
   - **Notification matrix** `notify_matrix {type: Role[]}`: a type not in it → as always. In it: send the
     notification only to the listed jobs (one aimed at a person goes only if his job is listed); a job listed
     that the type never had gets its own copy for everyone in that job, once per event.
   - **Banner** `announcement {text, text_en?, roles (empty = everyone), tone, until?}` and **maintenance**
     `{on, message, message_en?}`: while on, a shop owner's new order → 503 `MAINTENANCE` (staff as usual).
   - **Public part:** `GET /site` also returns `live = {self_signup, features, maintenance, announcement,
     password_min}` (no login needed: the login, sign-up and shop pages read it).
   - **History:** every save writes who changed which setting from → to (a setting of several parts, by part;
     `how`: `import` / `reset` sent with the save). `GET /settings/history` (manager), newest first.

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
- **Paid at the door (optional).** `POST /orders/:id/deliver` may carry `payment: {method: "cash" | "qi" |
  "zaincash", amount}` (a whole number > 0, ZainCash ≥ 1,000; checked before the PIN). After the invoice is made,
  amount ≤ the shop's whole debt (this invoice included), else 422 `errors.payment` and nothing is saved.
  `cash`: a normal payment (method `cash`, `client_ref: "door:<order id>"`) in the **delivery rep's** name — even
  when the shop isn't his (it isn't the sales rep's check) — so it is in his custody. `qi` / `zaincash`: nothing is
  paid yet; the shop owner gets a request (notification linking `/orders/:id?pay=1`) and pays from that page with
  `POST /payments/online {…, order_id}`. Kept on the shipment: `delivery.payment {method, amount, status: "paid" |
  "requested", at, payment_id?, paid_amount?, paid_at?}`. When the gateway reports success for an online payment
  with `order_id` whose shipment is "requested": mark it paid and notify the delivery rep (type `door_payment`).

**Money**
- **Payments** are spread over the customer's open invoices oldest first (`previewAllocation` shows it before
  saving); method `cash` / `transfer` / `online` (Qi Card, section 7). A payment is never deleted: it is
  **reversed** with a reason — all of it or any part: `POST /payments/:id/reverse {reason, amount?}` (missing =
  all that is left; a whole number, ≤ what is left, else 422 `errors.amount`). It can be reversed again until
  nothing is left. Each reverse is its own entry (negative amount, `reversal_of`), taken back from the newest
  invoice the payment paid first. On the payment: `reversed_amount` (the sum so far), `reversed_by_id` (the
  latest), `reversed` = true only when all of it is reversed. Totals count each payment as amount −
  reversed_amount.
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
With `order_id` (paying the delivery rep's door request, section 6) the shop owner comes back to
`/orders/<order_id>?payment=<payment_id>` instead, and a success marks that shipment's `delivery.payment` paid.

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
`ChatMessage`, `RepTarget`, `OtpSent`, `OtpVerified`, `CarrierPick`, `DaySummary`, `DayNumbers`, `ReorderDue`, `LateShop`, `ScheduledPrice`, `PriceHistory`, `Clearance`, `ItemClearance`, `StockWait`, `CashHandover`, `CustodyRow`, `CustodyLog`, `Visit`, `VisitsReport`, `Settings`, `SiteCustom` (with `profiles`, `apps`, `fields`, `rules`), `Health`, `RuleRun`.

## 10. Every endpoint
<!-- 170 endpoints, generated from lib/api/http.ts -->

### Login and own account

| Call | Method | Path | Takes | Returns | Notes |
|---|---|---|---|---|---|
| `login` | POST | `/auth/login` | `phone: string, password: string` | `Session` |  |
| `register` | POST | `/auth/register` | `input: RegisterInput` | `Session` |  |
| `sendOtp` | POST | `/otp/send` | `phone: string, purpose: OtpPurpose` | `OtpSent` | «رمز التحقق» (OTP): WhatsApp, then Telegram, then SMS (the server sends it through Wevlix). Send a code to a phone. register / reset: no sign-in; phone: the signed-in person's new number. |
| `verifyOtp` | POST | `/otp/verify` | `requestId: string, code: string` | `OtpVerified` | Check the code: the right one gives a token for the next request. |
| `resetPassword` | POST | `/auth/reset-password` | `input: { phone: string; otp_token: string; password: string }` | `null` | A forgotten password: a new one, with the token of a code sent to that phone (purpose reset). |
| `changeMyPhone` | POST | `/me/phone` | `input: { phone: string; otp_token: string }` | `User` | Change my phone number (my login), with the token of a code sent to the new number (purpose phone). |
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
| `saveSettings` | PATCH | `/settings` | `s: Settings, how?: "import" \| "reset"` | `Settings` | With `advanced` (the company's rules, section 3.6): checked whole, saved as what differs from the defaults, written to the history. |
| `settingsHistory` | GET | `/settings/history` |  | `SettingsChange[]` | Who changed which setting and when (manager), newest first. |
| `site` | GET | `/site` |  | `SiteCustom \| null` | The site's customization. Reading it needs no login (the login page shows the name and logo). Also `live`: the public part of the company's rules (section 3.6). |
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
| `deleteItem` | DELETE | `/items/:id` | `id: number` | `{ result: "removed" \| "hidden" }` | Delete an item (manager). Never used: removed for good ("removed"). Used before: hidden everywhere, its name kept on the old records ("hidden"). Refused while it has stock or is on an open order. |
| `setItemImage` | POST | `/items/:id/image` | `id: number, image: string \| null` | `Item` | image: a data URL from the page (the backend stores the file and returns its link in item.image), or null to remove. |
| `setItemVideo` | POST | `/items/:id/video` | `id: number, video: string \| null` | `Item` | video: the uploaded file's link (the backend takes the file: multipart, ≤ 20 MB, ≤ 30 s) or null to remove. |
| `itemBatches` | GET | `/items/:itemId/batches` | `itemId: number` | `Batch[]` |  |
| `listBatches` | GET | `/batches` | `warehouseId?: number` | `Batch[]` |  |
| `shelfStock` | GET | `/stock` |  | `ShelfRow[]` |  |
| `holdBatch` | POST | `/batches/:id/hold` | `id: number, reason: string` | `Batch` | Stop selling the rest of a batch (both warehouses), put it back on sale, and see who got it. |
| `releaseBatch` | POST | `/batches/:id/release` | `id: number` | `Batch` |  |
| `traceBatch` | GET | `/batches/:id/trace` | `id: number` | `BatchTrace[]` |  |
| `listDamaged` | GET | `/damaged` |  | `DamagedRecord[]` |  |
| `myStockAlerts` | GET | `/stock-alerts` |  | `number[]` | «أعلمني عند التوفر» The items this shop owner waits for (the shop he works on now). |
| `setStockAlert` | POST | `/stock-alerts` | `itemId: number, on: boolean` | `number[]` | Ask to be told when an item that ran out is back (on), or stop (off). Returns his list. |
| `stockWaitlist` | GET | `/stock-alerts/waitlist` |  | `StockWait[]` | What the shops are waiting for, most shops first (manager, accountant, keepers). |
| `listClearances` | GET | `/clearances` |  | `Clearance[]` | «عروض التصريف» The clearances, running ones first (manager, accountant, keepers). The running one also comes on its item. |
| `startClearance` | POST | `/clearances` | `input: { batch_id: number; percent: number }` | `Clearance` | The manager sells a near-expiry batch at a discount (5–70%) until it is sold or expires. |
| `cancelClearance` | POST | `/clearances/:id/cancel` | `id: number` | `Clearance` | The manager stops a clearance early. |
| `listScheduledPrices` | GET | `/price-schedule` |  | `ScheduledPrice[]` | «تغيير الأسعار من تاريخ» The price changes set for a day: waiting first (manager, accountant). |
| `schedulePrice` | POST | `/price-schedule` | `input: ScheduledPriceInput` | `ScheduledPrice` | The manager sets new prices from a day (a percent for many items, or one item's exact prices). |
| `cancelScheduledPrice` | POST | `/price-schedule/:id/cancel` | `id: number` | `ScheduledPrice` | The manager drops a change before its day. |
| `priceHistory` | GET | `/items/:itemId/price-history` | `itemId: number` | `PriceHistory` | One item's prices over time, and what is scheduled (manager, accountant). |

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

### Customers, statements, special prices, visits

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
| `listVisits` | GET | `/visits` | `day: string, repId?: number` | `Visit[]` | «خط السير»: the marketing reps' weekly visits. One day's visits (a rep: his own; the manager: everyone's, or one rep's). |
| `recordVisit` | POST | `/visits` | `input: VisitInput` | `Visit` | The rep records a visit at one of his shops (a second one the same day changes it). |
| `setVisitDays` | POST | `/customers/:customerId/visit-days` | `customerId: number, days: number[]` | `Customer` | The manager sets the days a shop is visited by its rep (0 = Sunday … 6 = Saturday; [] = none). |
| `previewAllocation` | GET | `/customers/:customerId/allocation` | `customerId: number, amount: number` | `Allocation[]` |  |

### Orders, delivery and loads

| Call | Method | Path | Takes | Returns | Notes |
|---|---|---|---|---|---|
| `listOrders` | GET | `/orders` |  | `Order[]` |  |
| `getOrder` | GET | `/orders/:id` | `id: number` | `Order` |  |
| `dispatchDelivery` | POST | `/deliveries/dispatch` | `code: string` | `Order` | Delivery proof. The backend keeps the PIN and only sends it to the order's shop owner. The delivery rep scanned the shipment's QR at the warehouse. |
| `deliverOrder` | POST | `/orders/:id/deliver` | `id: number, input: DeliverInput` | `{ ok: true; order: Order } \| { ok: false; left: number; locked: boolean }` | At the shop: the photo and the PIN. A wrong PIN comes back as { ok: false, left, locked }. Optional `payment {method, amount}`: paid at the door (section 6). |
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
| `rateDelivery` | POST | `/orders/:id/rating` | `id: number, input: { stars: number; note?: string }` | `Order` | The shop owner rates the delivery of his order (1–5, a note), within 7 days of it; again to change it. |
| `myReorder` | GET | `/reorder/due` |  | `ReorderDue[]` | «قارب ينفد عندك؟» The shop owner's items he usually orders again about now (from his own orders). |
| `lateShops` | GET | `/reorder/late-shops` |  | `LateShop[]` | Shops later than usual with their next order (a rep: his own; manager, accountant: all). |
| `prepPlan` | GET | `/orders/:id/prep-plan` | `id: number` | `PrepLine[]` | For the keeper: free stock per warehouse for each line, and the suggested warehouse. |
| `prepareOrder` | POST | `/orders/:id/prepare` | `id: number, warehouses: Record<number, number>, carrier?: CarrierPick` | `Order` | The keeper prepared it; warehouses = { item_id: warehouse_id }. Makes the shipment label. carrier: the delivery rep and the vehicle the keeper chose (optional; none = the usual). |
| `setCarrier` | POST | `/orders/:id/delivery/carrier` | `id: number, carrier: CarrierPick` | `Order` | Change who takes a prepared shipment out (before it is loaded): the delivery rep, and the vehicle or none. |
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
| `startOnlinePayment` | POST | `/payments/online` | `input: StartOnlinePayment` | `OnlinePayment` | Online payment (Qi Card): the backend creates the payment at Qi and returns Qi's page address (form_url). The result comes from Qi's notification to the backend, so the page asks again until it is final. Optional `order_id`: paying a delivery's door request. |
| `getOnlinePayment` | GET | `/payments/online/:id` | `id: string` | `OnlinePayment` |  |
| `listOnlinePayments` | GET | `/payments/online` |  | `OnlinePayment[]` |  |
| `reversePayment` | POST | `/payments/:id/reverse` | `id: number, reason: string, amount?: number` | `Payment` | Reverse all of a payment, or a part (amount; missing = all that is left). |
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

### Cash custody

| Call | Method | Path | Takes | Returns | Notes |
|---|---|---|---|---|---|
| `custody` | GET | `/custody` |  | `CustodyRow[]` | «العهدة»: the cash the reps hold. What each rep holds now (manager, accountant), or the rep's own. |
| `custodyLog` | GET | `/custody/:repId` | `repId: number` | `CustodyLog` | One rep's cash in and out, and his handovers. |
| `handOver` | POST | `/custody/handovers` | `input: { rep_id?: number; amount: number; note?: string }` | `CashHandover` | The rep hands cash to the accountant (waits to be counted); the accountant / manager with rep_id: taken and counted at once. |
| `confirmHandover` | POST | `/custody/handovers/:id/confirm` | `id: number, received: number` | `CashHandover` | The accountant counted it: what he received (≤ declared; the shortage stays on the rep). |
| `cancelHandover` | POST | `/custody/handovers/:id/cancel` | `id: number` | `CashHandover` | The rep takes back his handover before it is counted, or the accountant refuses it. |

### Commissions, dashboard and reports

| Call | Method | Path | Takes | Returns | Notes |
|---|---|---|---|---|---|
| `ratingsReport` | GET | `/reports/delivery-ratings` |  | `RatingsReport` | Delivery ratings (manager, accountant): the average, per delivery rep, the latest. |
| `visitsReport` | GET | `/reports/visits` | `from: string, to: string` | `VisitsReport` | Planned against done, per rep, the visits missed and the ones far from the shop (manager). |
| `daySummary` | GET | `/reports/day-summary` | `date: string` | `DaySummary` | «ملخص اليوم»: a day's numbers against the day before and the same day last week, best rep, late deliveries and low stock now (manager, accountant; the profit only for who sees it). |
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

### Other

| Call | Method | Path | Takes | Returns | Notes |
|---|---|---|---|---|---|
| `catalog` | GET | `/catalog` |  | `CatalogItem[]` | The public catalog (no sign-in): the products on sale with their pictures, no prices. |
| `shopLists` | GET | `/shop-lists` |  | `ShopList[]` | «قوائمي»: the shop's saved lists (only its own). |
| `saveShopList` | POST (new) / PATCH :id | `/shop-lists` | `id: number \| null, input: ShopListInput` | `ShopList` |  |
| `deleteShopList` | DELETE | `/shop-lists/:id` | `id: number` | `null` |  |
| `counterSale` | POST | `/counter-sales` | `input: CounterSaleInput` | `Invoice` | The keeper's counter sale: the invoice, already paid in full (the goods left the warehouse). |
| `repTargets` | GET | `/reps/targets` | `month: string` | `RepTarget[]` | Each marketing rep's month against his monthly target, ranked (a rep gets only his own row). |
| `savePushSubscription` | POST | `/push-subscriptions` | `sub: { endpoint: string; keys: { p256dh: string; auth: string } }` | `null` | This phone's Web Push address (the browser's subscription): the server sends each new notification to it. |
| `deletePushSubscription` | POST | `/push-subscriptions/delete` | `endpoint: string` | `null` |  |
