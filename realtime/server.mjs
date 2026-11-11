// A small WebSocket relay for trying the live updates between devices (two phones, two computers).
// Run:  npm run realtime   → ws://localhost:8787   then start the site with NEXT_PUBLIC_WS_URL=ws://localhost:8787
//
// It only passes events on: a page "subscribes" to topics, and every event "published" to a topic goes to
// the other pages listening to it. The real backend does the same over its own WebSocket and also decides
// who may hear what (by the login token), see docs/realtime.md. This relay checks nothing: use it to try
// things out on your own network only, never on the internet.
import { WebSocketServer } from "ws";

const PORT = Number(process.env.REALTIME_PORT ?? 8787);
const TOPICS = new Set(["notifications", "chat", "orders", "location"]);
const wss = new WebSocketServer({ port: PORT });

wss.on("connection", (socket, req) => {
  socket.topics = new Set();
  const who = new URL(req.url ?? "/", "http://x").searchParams.get("token") ? "with a login" : "without a login";
  console.log(`+ a page connected (${who}) · ${wss.clients.size} open`);

  socket.on("message", (raw) => {
    let msg;
    try {
      msg = JSON.parse(String(raw));
    } catch {
      return;
    }
    if (msg.action === "subscribe") for (const t of msg.topics ?? []) if (TOPICS.has(t)) socket.topics.add(t);
    if (msg.action === "unsubscribe") for (const t of msg.topics ?? []) socket.topics.delete(t);
    if (msg.action === "publish" && TOPICS.has(msg.topic)) {
      const out = JSON.stringify({ topic: msg.topic, type: String(msg.type ?? ""), data: msg.data, at: msg.at ?? new Date().toISOString() });
      for (const other of wss.clients) if (other !== socket && other.readyState === 1 && other.topics.has(msg.topic)) other.send(out);
    }
  });
  socket.on("close", () => console.log(`- a page left · ${wss.clients.size} open`));
});

console.log(`Live updates relay on ws://localhost:${PORT}`);
