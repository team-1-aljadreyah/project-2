"use client";

// "The data changed": one signal that every open screen listens to (through useLoad), so lists, counts and
// pages show the new state by themselves, without pressing refresh.
//
// Where the signal comes from:
//   - this tab saved something (any POST / PATCH / DELETE that worked, see api/axios.ts);
//   - another tab of this browser saved something (BroadcastChannel);
//   - the server says something changed for this user: an order, a notification, a chat message (realtime);
//   - the tab comes back after being hidden for a while, or the internet comes back;
//   - no live connection to the server: a quiet check every 45 seconds while the tab is on screen.
// In the demo (fake data in this browser) the fake database already says when it changes, in this tab and in
// the others, so that is the only source there.
//
// Many changes close together become one refresh (a short wait), so a screen never loads ten times in a row.
import { onDbChange } from "./api/mock/db";
import { USE_MOCK } from "./config";
import { realtimeStatus, subscribe as listenTo } from "./realtime";

const listeners = new Set<() => void>();
let wait: ReturnType<typeof setTimeout> | undefined;

function fire() {
  clearTimeout(wait);
  wait = setTimeout(() => {
    listeners.forEach((l) => {
      try {
        l();
      } catch {}
    });
  }, 80);
}

let channel: BroadcastChannel | null = null;

/** This tab saved something on the server: refresh this tab's screens and tell the other tabs. */
export function dataChanged() {
  fire();
  try {
    channel?.postMessage("changed");
  } catch {}
}

let started = false;
function start() {
  if (started || typeof window === "undefined") return;
  started = true;
  if (USE_MOCK) {
    onDbChange(fire);
    return;
  }
  if ("BroadcastChannel" in window) {
    channel = new BroadcastChannel("nahrain-live");
    channel.onmessage = fire;
  }
  // Rep locations move every few seconds: the map listens to them itself; they don't reload the screens.
  listenTo("orders", fire);
  listenTo("notifications", fire);
  listenTo("chat", fire);

  let hiddenAt = 0;
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) hiddenAt = Date.now();
    else if (hiddenAt && Date.now() - hiddenAt > 10_000) fire();
  });
  window.addEventListener("online", fire);
  setInterval(() => {
    if (!document.hidden && realtimeStatus() !== "open") fire();
  }, 45_000);
}

/** Run `fn` whenever the data may have changed; returns "stop". */
export function onDataChange(fn: () => void) {
  start();
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}
