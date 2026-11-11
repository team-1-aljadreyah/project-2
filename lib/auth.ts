"use client";

// The logged-in person, saved in the browser so a refresh keeps you logged in.
import { useSyncExternalStore } from "react";
import type { RepKind, Role, Session, User } from "./api/types";

const KEY = "nahrain.session";
const listeners = new Set<() => void>();
let cachedRaw: string | null | undefined;
let cachedSession: Session | null = null;

function read(): Session | null {
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(KEY);
  } catch {}
  // useSyncExternalStore needs the same object back while nothing changed.
  if (raw === cachedRaw) return cachedSession;
  cachedRaw = raw;
  try {
    cachedSession = raw ? (JSON.parse(raw) as Session) : null;
  } catch {
    cachedSession = null;
  }
  return cachedSession;
}

const emit = () => listeners.forEach((l) => l());

export function getSession() {
  return read();
}

export function getToken(): string | null {
  return read()?.token ?? null;
}

export function setSession(session: Session) {
  loggingOut = false;
  try {
    localStorage.setItem(KEY, JSON.stringify(session));
  } catch {}
  emit();
}

export function updateUser(user: User) {
  const s = read();
  if (s) setSession({ ...s, user });
}

export function clearToken() {
  try {
    localStorage.removeItem(KEY);
  } catch {}
  emit();
}

/**
 * The "log out" button. Unlike a session that simply ended (then we remember the page, to come back
 * after logging in), a chosen logout remembers nothing: the next person on this device starts at
 * their own home page, not at the page the last person left.
 */
export function signOut() {
  loggingOut = true;
  try {
    sessionStorage.removeItem(NEXT_KEY);
  } catch {}
  clearToken();
}

function subscribe(l: () => void) {
  listeners.add(l);
  const onStorage = (e: StorageEvent) => e.key === KEY && l();
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(l);
    window.removeEventListener("storage", onStorage);
  };
}

/** undefined = still reading (first paint), null = logged out. */
export function useSession(): Session | null | undefined {
  return useSyncExternalStore(subscribe, read, () => undefined);
}

/** The home page of each role after login. */
export function homeOf(role: Role, kinds?: RepKind[]) {
  switch (role) {
    case "rep":
      // Delivery only: his shipments. Marketing (or both): his day's route of shops.
      return kinds?.length && !kinds.includes("sales") ? "/deliveries" : "/rep";
    case "shop":
      return "/shop";
    case "warehouse":
      return "/hall";
    case "staff":
      return "/staff";
    case "accountant":
      return "/accounts";
    case "manager":
      return "/decisions";
    default:
      return "/dashboard";
  }
}

// ---- The page to return to after logging in ----
// Kept in this tab (sessionStorage), not in the address, so the login address stays a clean "/login".
const NEXT_KEY = "nahrain.next";

/** Only pages of this site ("/..."), never another website ("//evil.com"). */
const safe = (p: string | null | undefined) => (p && p.startsWith("/") && !p.startsWith("//") && !p.startsWith("/login") ? p : null);

let loggingOut = false;

export function rememberNext(path: string) {
  if (loggingOut) return;
  try {
    if (safe(path)) sessionStorage.setItem(NEXT_KEY, path);
  } catch {}
}

/** The page to go to after login (also reads an old "?next=" link), then forgets it. */
export function takeNext(): string | null {
  let p: string | null = null;
  try {
    p = new URLSearchParams(window.location.search).get("next") ?? sessionStorage.getItem(NEXT_KEY);
    sessionStorage.removeItem(NEXT_KEY);
  } catch {}
  return safe(p);
}
