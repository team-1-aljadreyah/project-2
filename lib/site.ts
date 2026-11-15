"use client";

// The manager's customization of the site: the company's name and logo, the menu (order, names, hidden
// pages) and the dashboard (order, names, hidden cards). It is saved on the server, so everyone sees it.
// Also here: the "customize mode" switch. While it is on, the manager's pages show handles to drag,
// eyes to hide, and dashed outlines around every text that can be edited in place.
import { useSyncExternalStore } from "react";
import { api } from "./api";
import { getToken, onSessionChange } from "./auth";
import { DEFAULT_SITE, fullSite } from "./api/site-defaults";
import type { Label, SiteCustom } from "./api/types";
import { onDataChange } from "./live";
import { useFmt } from "./i18n";
import { setCurrencyNames, setTexts } from "./texts";
import { setInvoiceLine } from "./receipts";

export { DEFAULT_SITE, ordered } from "./api/site-defaults";

const KEY = "nahrain.site";
let site: SiteCustom = DEFAULT_SITE;
let started = false;
const subs = new Set<() => void>();

/** The color of the main buttons, on the whole page (the darker shade for hover is made from it). */
function applyLook(s: SiteCustom) {
  if (typeof document === "undefined") return;
  const style = document.documentElement.style;
  const c = s.look.action;
  if (c && /^#[0-9a-f]{6}$/i.test(c)) {
    style.setProperty("--action", c);
    style.setProperty("--action-hover", `color-mix(in srgb, ${c} 86%, black)`);
  } else {
    style.removeProperty("--action");
    style.removeProperty("--action-hover");
  }
}

/** Take a new copy into use: the store, the rewritten texts (lib/texts.ts) and the colors. */
function take(next: SiteCustom) {
  site = next;
  setTexts(next.texts);
  setCurrencyNames(next.live?.names.currency_ar, next.live?.names.currency_en);
  setInvoiceLine(next.live?.names.invoice_footer ?? "");
  applyLook(next);
}

function set(next: SiteCustom) {
  take(next);
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {}
  subs.forEach((f) => f());
}

// The last request, and for which login (so the login's own ask below doesn't ask twice).
let last: { token: string | null; done: Promise<void> } | null = null;

function load(): Promise<void> {
  const done = api
    .site()
    .then((s) => {
      const next = fullSite(s);
      if (JSON.stringify(next) !== JSON.stringify(site)) set(next);
    })
    .catch(() => {});
  last = { token: getToken(), done };
  return done;
}

/**
 * The site's settings for this login, and give them back (at most `wait` ms, then the copy there is). The
 * server gives the permission profiles (the pages taken away from a person) only to a signed-in person, so
 * the login waits for them before opening the first page: else that page and the menu wouldn't know them.
 * Signing in already asked (a change of person loads again): then its answer is awaited, not asked twice.
 */
export function reloadSite(wait = 3000): Promise<SiteCustom> {
  const done = last && last.token === getToken() ? last.done : load();
  return Promise.race([done.then(() => site), new Promise<SiteCustom>((r) => setTimeout(() => r(site), wait))]);
}

function subscribe(fn: () => void) {
  subs.add(fn);
  if (!started) {
    started = true;
    // The copy from the last visit shows at once; the fresh one replaces it when it arrives.
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) take(fullSite(JSON.parse(raw)));
    } catch {}
    load();
    onDataChange(load);
    onSessionChange(load);
  }
  return () => {
    subs.delete(fn);
  };
}

export function useSite(): SiteCustom {
  return useSyncExternalStore(
    subscribe,
    () => site,
    () => DEFAULT_SITE,
  );
}

/** Change the customization: the screen changes at once, and goes back if the server refuses. */
export async function saveSite(change: (s: SiteCustom) => SiteCustom) {
  const before = site;
  const next = change(site);
  set(next);
  try {
    set(fullSite(await api.saveSite(next)));
  } catch (e) {
    set(before);
    throw e;
  }
}

/** The company's name, slogan and logo in the chosen language. */
export function useBrand() {
  const { tr } = useFmt();
  const b = useSite().brand;
  return { name: tr(b.name, b.name_en), tagline: tr(b.tagline, b.tagline_en), company: tr(b.company, b.company_en), phone: b.phone, logo: b.logo };
}

/** A text the manager may have renamed: his name if there is one, the original if not. */
export function useLabel() {
  const { tr } = useFmt();
  return (over: Label | undefined, ar: string, en: string) => tr(over?.ar || ar, over?.en || en);
}

// ---------- customize mode ----------
let customizing = false;
const modeSubs = new Set<() => void>();

export function setCustomizing(v: boolean) {
  if (customizing === v) return;
  customizing = v;
  modeSubs.forEach((f) => f());
}

export function useCustomizing() {
  return useSyncExternalStore(
    (fn) => {
      modeSubs.add(fn);
      return () => {
        modeSubs.delete(fn);
      };
    },
    () => customizing,
    () => false,
  );
}
