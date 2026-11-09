"use client";

// Rep orders and payments must never be lost when the internet is weak or cut.
// If sending fails with "no network", the request is saved on the phone (this queue)
// and sent again by itself when the internet comes back. Each request keeps its client_ref,
// so sending it twice never makes two orders.
import { useSyncExternalStore } from "react";
import { ApiError, NETWORK_ERROR } from "./api/errors";
import type { NewOrder, NewPayment } from "./api/types";

export type QueuedJob =
  | { kind: "order"; client_ref: string; body: NewOrder; label: string; saved_at: string; error?: string }
  | { kind: "payment"; client_ref: string; body: NewPayment; label: string; saved_at: string; error?: string };

const QUEUE_KEY = "nahrain.queue";
const SIM_KEY = "nahrain.simulate-offline";
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

let queueRaw: string | null | undefined;
let queueCache: QueuedJob[] = [];

function readQueue(): QueuedJob[] {
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(QUEUE_KEY);
  } catch {}
  if (raw === queueRaw) return queueCache;
  queueRaw = raw;
  try {
    queueCache = raw ? (JSON.parse(raw) as QueuedJob[]) : [];
  } catch {
    queueCache = [];
  }
  return queueCache;
}

function writeQueue(q: QueuedJob[]) {
  try {
    localStorage.setItem(QUEUE_KEY, JSON.stringify(q));
  } catch {}
  emit();
}

export function enqueue(job: QueuedJob) {
  const q = readQueue().filter((j) => j.client_ref !== job.client_ref);
  writeQueue([...q, job]);
}

export function removeJob(clientRef: string) {
  writeQueue(readQueue().filter((j) => j.client_ref !== clientRef));
}

/** Demo switch: pretend there is no internet, to show the offline queue to the client. */
export function isSimulatedOffline() {
  try {
    return localStorage.getItem(SIM_KEY) === "1";
  } catch {
    return false;
  }
}

export function setSimulatedOffline(on: boolean) {
  try {
    if (on) localStorage.setItem(SIM_KEY, "1");
    else localStorage.removeItem(SIM_KEY);
  } catch {}
  emit();
}

export function isOffline() {
  return isSimulatedOffline() || (typeof navigator !== "undefined" && !navigator.onLine);
}

export const isNetworkError = (e: unknown) => e instanceof ApiError && e.status === NETWORK_ERROR;

function subscribe(l: () => void) {
  listeners.add(l);
  window.addEventListener("online", l);
  window.addEventListener("offline", l);
  const onStorage = (e: StorageEvent) => (e.key === QUEUE_KEY || e.key === SIM_KEY) && l();
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(l);
    window.removeEventListener("online", l);
    window.removeEventListener("offline", l);
    window.removeEventListener("storage", onStorage);
  };
}

const EMPTY: QueuedJob[] = [];
export function useQueue() {
  return useSyncExternalStore(subscribe, readQueue, () => EMPTY);
}

export function useOffline() {
  return useSyncExternalStore(subscribe, isOffline, () => false);
}

let flushing = false;

/**
 * Send every saved request. Stops at the first network error (still offline).
 * A request the server refuses (for example out of stock) stays in the list with its error, so the rep can see and fix it.
 */
export async function flushQueue(send: (job: QueuedJob) => Promise<unknown>) {
  if (flushing || isOffline()) return { sent: 0 };
  flushing = true;
  let sent = 0;
  try {
    for (const job of readQueue()) {
      if (job.error) continue;
      try {
        await send(job);
        removeJob(job.client_ref);
        sent++;
      } catch (e) {
        if (isNetworkError(e)) break;
        const q = readQueue().map((j) => (j.client_ref === job.client_ref ? { ...j, error: e instanceof Error ? e.message : String(e) } : j));
        writeQueue(q);
      }
    }
  } finally {
    flushing = false;
  }
  return { sent };
}

export function retryJob(clientRef: string) {
  writeQueue(readQueue().map((j) => (j.client_ref === clientRef ? { ...j, error: undefined } : j)));
}

/** A new id made on the phone for each order or payment. */
export function newClientRef() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}
