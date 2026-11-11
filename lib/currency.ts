"use client";

// Show every amount of the site in dollars instead of dinars, at the dollar rate of the day
// (the one the accountant sets every morning). Only the manager and the accountant have the switch,
// and it is their own view on this device: shop owners and reps keep seeing dinars, and the amounts
// themselves are never changed (prices and payments are still typed and saved in dinars).
const KEY = "nahrain.currency";

export type Currency = "IQD" | "USD";

let wanted: Currency = "IQD";
let rate = 0;
let allowed = false;
let started = false;
let version = 0;
const subs = new Set<() => void>();
const bump = () => {
  version++;
  subs.forEach((f) => f());
};

function start() {
  if (started || typeof window === "undefined") return;
  started = true;
  try {
    wanted = localStorage.getItem(KEY) === "USD" ? "USD" : "IQD";
  } catch {}
}

export function subscribeCurrency(fn: () => void) {
  start();
  subs.add(fn);
  return () => {
    subs.delete(fn);
  };
}
export const currencyVersion = () => version;

/** The person's choice (it shows in dollars only when it is allowed and there is a rate). */
export function wantedCurrency(): Currency {
  start();
  return wanted;
}

export function setCurrency(c: Currency) {
  wanted = c;
  try {
    localStorage.setItem(KEY, c);
  } catch {}
  bump();
}

/** Set by the app frame: today's rate, and whether this person may see dollars (manager, accountant). */
export function setCurrencyContext(next: { rate: number; allowed: boolean }) {
  start();
  if (next.rate === rate && next.allowed === allowed) return;
  rate = next.rate;
  allowed = next.allowed;
  bump();
}

/** The rate to divide by, or 0 for dinars. */
export function usdDivisor(): number {
  start();
  return allowed && wanted === "USD" && rate > 0 ? rate : 0;
}

/** The dollar rate in use (0 = never set). */
export const currentRate = () => rate;
