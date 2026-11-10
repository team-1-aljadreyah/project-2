"use client";

// Two small "stores" for the picking hall, read with useSyncExternalStore (the React way to read
// something that lives outside React, without effects and without a hydration mismatch):
// 1. the clock, which ticks every 30 seconds (for "time left" and the timeline's "now" marker);
// 2. which lines the keeper already ticked as picked, saved on this device.
import { useSyncExternalStore } from "react";

// ---------- The clock ----------
let now = Date.now();
const clockListeners = new Set<() => void>();
let timer: ReturnType<typeof setInterval> | undefined;

function subscribeClock(cb: () => void) {
  clockListeners.add(cb);
  if (!timer) {
    now = Date.now();
    timer = setInterval(() => {
      now = Date.now();
      clockListeners.forEach((l) => l());
    }, 30_000);
  }
  return () => {
    clockListeners.delete(cb);
    if (!clockListeners.size && timer) {
      clearInterval(timer);
      timer = undefined;
    }
  };
}

/** The current time in ms, refreshed every 30 seconds. 0 on the server (nothing time-based is shown there). */
export function useNow() {
  return useSyncExternalStore(
    subscribeClock,
    () => now,
    () => 0,
  );
}

// ---------- Picked lines ----------
// Saved as {"<order id>": [item ids]}. Only on this device: it is the keeper's own checklist while he walks;
// the real result is the "confirm" button, which the server checks again.
const KEY = "nahrain-hall-picked";
const EVENT = "nahrain-hall-picked";
type Picked = Record<string, number[]>;

function readRaw() {
  try {
    return localStorage.getItem(KEY) ?? "{}";
  } catch {
    return "{}";
  }
}

function subscribePicked(cb: () => void) {
  window.addEventListener(EVENT, cb);
  window.addEventListener("storage", cb); // another tab changed it
  return () => {
    window.removeEventListener(EVENT, cb);
    window.removeEventListener("storage", cb);
  };
}

/** The saved text is the snapshot (a string compares by value, so React re-renders only on a real change). */
export function usePicked(): Picked {
  const raw = useSyncExternalStore(subscribePicked, readRaw, () => "{}");
  try {
    return JSON.parse(raw) as Picked;
  } catch {
    return {};
  }
}

export function togglePicked(orderId: number, itemId: number) {
  let all: Picked = {};
  try {
    all = JSON.parse(readRaw()) as Picked;
  } catch {}
  const list = new Set(all[orderId] ?? []);
  if (list.has(itemId)) list.delete(itemId);
  else list.add(itemId);
  all[orderId] = [...list];
  try {
    localStorage.setItem(KEY, JSON.stringify(all));
  } catch {}
  window.dispatchEvent(new Event(EVENT));
}

/** Forget an order's checklist (after it is confirmed). */
export function clearPicked(orderId: number) {
  try {
    const all = JSON.parse(readRaw()) as Picked;
    delete all[orderId];
    localStorage.setItem(KEY, JSON.stringify(all));
  } catch {}
  window.dispatchEvent(new Event(EVENT));
}
