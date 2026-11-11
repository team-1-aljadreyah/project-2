# Live updates (WebSocket)

The site listens for live events instead of asking the server again every few seconds.
The client is `lib/realtime.ts`. It connects to `NEXT_PUBLIC_WS_URL` when that is set.

## Connecting

```
wss://api.example.com/ws?token=<the login token, as in "Authorization: Bearer">
```

The server checks the token. An invalid token closes the socket, and the client tries again later.
If the connection drops, the client reconnects by itself after 1 s, 2 s, 4 s … up to 30 s.

## From the page to the server

```json
{ "action": "subscribe",   "topics": ["notifications", "chat"] }
{ "action": "unsubscribe", "topics": ["chat"] }
{ "action": "publish", "topic": "location", "type": "moved", "data": { "rep_id": 4, "lat": 32.61, "lng": 44.02, "at": "…" }, "at": "…" }
```

With the real backend, the page publishes only `location` (the delivery rep's phone). It also posts the same
location to `POST /deliveries/location`. Everything else comes from the server when data changes.

## From the server to the page

Every message has the same shape:

```json
{ "topic": "orders", "type": "changed", "data": { "id": 268 }, "at": "2026-11-11T10:00:00Z" }
```

| topic | when | data | who receives it |
| --- | --- | --- | --- |
| `notifications` | a new notification for this user | `{ "id": 12 }` (optional) | only that user |
| `chat` | a new support message | `{ "customer_id": 1 }` | the shop's owner, the staff, the manager |
| `orders` | an order or its shipment changed status | `{ "id": 268 }` | the people who can see that order |
| `location` | the delivery rep's phone moved | `{ "rep_id": 4, "lat": 32.61, "lng": 44.02, "at": "…" }` | the manager, the keepers, the shops whose shipment is on the way with him |

When the page gets an event, it loads the data again from the normal API. So an event only needs to say
*what* changed, not carry the new data. The one exception is `location`, which carries the position.

## Trying it without the backend

```bash
npm run realtime
```

That starts the small relay `realtime/server.mjs` at `ws://localhost:8787`. Then put
`NEXT_PUBLIC_WS_URL=ws://localhost:8787` in `.env` and restart `npm run dev`.

With the demo data, each browser keeps its own data. Only the delivery rep's live location really travels
between devices (open التوصيل as the rep on a phone, and the shop owner's order on another device).

Without `NEXT_PUBLIC_WS_URL`, the same events pass between the tabs of one browser.
