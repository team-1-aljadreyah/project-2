"use client";

// Live updates: the server tells the open pages that something changed, at once, instead of each page asking
// again every few seconds.
//
// With NEXT_PUBLIC_WS_URL set, this is a WebSocket to that server (the backend, or realtime/server.mjs).
// It reconnects by itself, sends the login token, and listens only to the topics the open page needs.
// Without it (the demo), the same events go between the tabs of this browser (BroadcastChannel).
//
// Topics (see docs/realtime.md for the messages the backend sends):
//   notifications  a new notification for this user
//   chat           a new support message ({ customer_id })
//   orders         an order or its shipment changed ({ id })
//   location       where a delivery rep is ({ rep_id, lat, lng, at })
import { useEffect, useRef, useSyncExternalStore } from "react";
import { getToken } from "./auth";

export const WS_URL = (process.env.NEXT_PUBLIC_WS_URL ?? "").replace(/\/$/, "");

export type Topic = "notifications" | "chat" | "orders" | "location";
export interface RtEvent<T = unknown> {
  topic: Topic;
  type: string;
  data?: T;
  at: string;
}
type Listener = (e: RtEvent) => void;

const listeners = new Map<Topic, Set<Listener>>();
const isBrowser = typeof window !== "undefined";

// ---------- the connection state (for the small dot in the top bar) ----------
export type RtStatus = "local" | "connecting" | "open" | "offline";
let status: RtStatus = WS_URL ? "connecting" : "local";
const statusListeners = new Set<() => void>();
function setStatus(s: RtStatus) {
  if (status === s) return;
  status = s;
  statusListeners.forEach((l) => l());
}
/** The connection state now (outside React). */
export const realtimeStatus = () => status;

export function useRealtimeStatus(): RtStatus {
  return useSyncExternalStore(
    (l) => {
      statusListeners.add(l);
      return () => statusListeners.delete(l);
    },
    () => status,
    () => (WS_URL ? "connecting" : "local"),
  );
}

function dispatch(e: RtEvent) {
  listeners.get(e.topic)?.forEach((l) => {
    try {
      l(e);
    } catch {}
  });
}

// ---------- demo: between the tabs of this browser ----------
let channel: BroadcastChannel | null = null;
function localChannel() {
  if (!channel && isBrowser && "BroadcastChannel" in window) {
    channel = new BroadcastChannel("nahrain-realtime");
    channel.onmessage = (m) => dispatch(m.data as RtEvent);
  }
  return channel;
}

// ---------- WebSocket ----------
let ws: WebSocket | null = null;
let retry = 0;
let timer: ReturnType<typeof setTimeout> | undefined;
const outbox: string[] = [];

function topics() {
  return [...listeners.entries()].filter(([, s]) => s.size).map(([t]) => t);
}

function connect() {
  if (!WS_URL || !isBrowser || ws) return;
  setStatus("connecting");
  const token = getToken();
  const sock = new WebSocket(`${WS_URL}${WS_URL.includes("?") ? "&" : "?"}${token ? `token=${encodeURIComponent(token)}` : ""}`);
  ws = sock;
  sock.onopen = () => {
    retry = 0;
    setStatus("open");
    sock.send(JSON.stringify({ action: "subscribe", topics: topics() }));
    while (outbox.length) sock.send(outbox.shift()!);
  };
  sock.onmessage = (m) => {
    try {
      const e = JSON.parse(String(m.data)) as RtEvent;
      if (e && e.topic) dispatch(e);
    } catch {}
  };
  sock.onclose = () => {
    ws = null;
    setStatus("offline");
    // Try again: 1 s, 2 s, 4 s … up to 30 s.
    clearTimeout(timer);
    timer = setTimeout(connect, Math.min(30_000, 1000 * 2 ** retry++));
  };
  sock.onerror = () => sock.close();
}

function send(msg: object) {
  const text = JSON.stringify(msg);
  if (ws?.readyState === WebSocket.OPEN) ws.send(text);
  else outbox.push(text);
}

// ---------- the API ----------

/** Listen to a topic; returns "stop listening". */
export function subscribe(topic: Topic, fn: Listener) {
  if (!listeners.has(topic)) listeners.set(topic, new Set());
  const set = listeners.get(topic)!;
  const first = !set.size;
  set.add(fn);
  if (WS_URL) {
    connect();
    if (first && ws?.readyState === WebSocket.OPEN) send({ action: "subscribe", topics: [topic] });
  } else localChannel();
  return () => {
    set.delete(fn);
    if (WS_URL && !set.size && ws?.readyState === WebSocket.OPEN) send({ action: "unsubscribe", topics: [topic] });
  };
}

/** Tell the others (the server passes it on; in the demo, the other tabs). This page hears it too. */
export function publish<T>(topic: Topic, type: string, data?: T) {
  if (!isBrowser) return;
  const e: RtEvent<T> = { topic, type, data, at: new Date().toISOString() };
  if (WS_URL) {
    connect();
    send({ action: "publish", ...e });
  } else localChannel()?.postMessage(e);
  dispatch(e);
}

/** In a component: run `fn` for every event of these topics while the component is on screen. */
export function useRealtime(topicList: Topic[], fn: (e: RtEvent) => void) {
  const ref = useRef(fn);
  useEffect(() => {
    ref.current = fn;
  }, [fn]);
  const key = topicList.join(",");
  useEffect(() => {
    const offs = key.split(",").map((t) => subscribe(t as Topic, (e) => ref.current(e)));
    return () => offs.forEach((off) => off());
  }, [key]);
}
