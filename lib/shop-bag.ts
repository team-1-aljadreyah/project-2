"use client";

// The shop owner's bag and favourites, kept on his phone (per owner and shop) and shared by every page of his
// app: the store, search, «منتجاتنا». A page only reads them, so a change on one page shows on the others.
import { useCallback, useMemo, useSyncExternalStore } from "react";
import type { Unit } from "@/lib/api/types";
import { newClientRef } from "@/lib/offline";

// ---------- The bag (saved on the phone, so nothing is lost if the page closes) ----------
export interface Line {
  item_id: number;
  unit: Unit;
  qty: number;
}
export interface Bag {
  lines: Line[];
  note: string;
  client_ref: string;
  /** Changing an order that was sent but isn't confirmed yet: "send" saves the change to it. */
  edit?: { id: number; number: string };
}

/** From the order page: put the order's lines into the bag, to change them in the store. */
export function editOrderInBag(userId: number, customerId: number, order: { id: number; number: string; lines: Line[]; note?: string }) {
  const bag: Bag = { lines: order.lines.map(({ item_id, unit, qty }) => ({ item_id, unit, qty })), note: order.note ?? "", client_ref: newClientRef(), edit: { id: order.id, number: order.number } };
  writeBag(userId, customerId, bag);
}

// The bag lives on the phone (localStorage) and the page only reads it, so it is the same everywhere: after
// "change the order" on the order page, and when Next shows a store page it kept in memory.
const BAG_EVENT = "nahrain-bag";
// One bag per shop: an owner of two shops fills each one on its own (their prices can differ too).
const bagKey = (userId: number, customerId: number) => `nahrain.shopbag.${userId}.${customerId}`;
export const EMPTY = "";
export function readRaw(userId: number, customerId: number) {
  try {
    return localStorage.getItem(bagKey(userId, customerId)) ?? EMPTY;
  } catch {
    return EMPTY;
  }
}
export function parseBag(raw: string): Bag {
  try {
    if (raw) return JSON.parse(raw) as Bag;
  } catch {}
  return { lines: [], note: "", client_ref: "" };
}
export function writeBag(userId: number, customerId: number, bag: Bag) {
  // The order's id for "sent twice" is made with the bag's first line, and kept until it is sent.
  const next = bag.lines.length && !bag.client_ref ? { ...bag, client_ref: newClientRef() } : bag;
  try {
    if (next.lines.length || next.note || next.edit) localStorage.setItem(bagKey(userId, customerId), JSON.stringify(next));
    else localStorage.removeItem(bagKey(userId, customerId));
  } catch {}
  window.dispatchEvent(new Event(BAG_EVENT));
}
export function subscribeBag(cb: () => void) {
  window.addEventListener(BAG_EVENT, cb);
  window.addEventListener("storage", cb);
  return () => {
    window.removeEventListener(BAG_EVENT, cb);
    window.removeEventListener("storage", cb);
  };
}

// Favourite items: a heart on each card, kept on the phone (per owner and shop). They come first in the store.
const FAV_EVENT = "nahrain-fav";
const favKey = (userId: number, customerId: number) => `nahrain.fav.${userId}.${customerId}`;
export function readFav(userId: number, customerId: number) {
  try {
    return localStorage.getItem(favKey(userId, customerId)) ?? "";
  } catch {
    return "";
  }
}
export function subscribeFav(cb: () => void) {
  window.addEventListener(FAV_EVENT, cb);
  window.addEventListener("storage", cb);
  return () => {
    window.removeEventListener(FAV_EVENT, cb);
    window.removeEventListener("storage", cb);
  };
}
export function toggleFav(userId: number, customerId: number, itemId: number) {
  const now = readFav(userId, customerId).split(",").filter(Boolean).map(Number);
  const next = now.includes(itemId) ? now.filter((x) => x !== itemId) : [...now, itemId];
  try {
    localStorage.setItem(favKey(userId, customerId), next.join(","));
  } catch {}
  window.dispatchEvent(new Event(FAV_EVENT));
}

/** The bag and favourites of this owner's shop, live (another page's change shows here at once). */
export function useShopBag(userId: number, customerId: number) {
  const raw = useSyncExternalStore(subscribeBag, () => readRaw(userId, customerId), () => EMPTY);
  const bag = useMemo(() => parseBag(raw), [raw]);
  const setBag = useCallback(
    (u: Bag | ((b: Bag) => Bag)) => writeBag(userId, customerId, typeof u === "function" ? u(parseBag(readRaw(userId, customerId))) : u),
    [userId, customerId],
  );
  const favRaw = useSyncExternalStore(subscribeFav, () => readFav(userId, customerId), () => "");
  const favs = useMemo(() => new Set(favRaw.split(",").filter(Boolean).map(Number)), [favRaw]);
  /** One line of the bag: null or 0 removes it; a new item goes at the end, an old one keeps its place. */
  const setLine = useCallback(
    (itemId: number, line: { unit: Unit; qty: number } | null) =>
      setBag((b) => {
        if (!line || line.qty <= 0) return { ...b, lines: b.lines.filter((l) => l.item_id !== itemId) };
        const at = b.lines.findIndex((l) => l.item_id === itemId);
        const lines = [...b.lines];
        if (at >= 0) lines[at] = { item_id: itemId, ...line };
        else lines.push({ item_id: itemId, ...line });
        return { ...b, lines };
      }),
    [setBag],
  );
  return { bag, setBag, setLine, favs, toggleFav: (itemId: number) => toggleFav(userId, customerId, itemId) };
}
