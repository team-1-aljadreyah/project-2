"use client";

// The logged-in person, saved in the browser so a refresh keeps you logged in.
import { useSyncExternalStore } from "react";
import type { Role, Session, User } from "./api/types";

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
export function homeOf(role: Role) {
  switch (role) {
    case "rep":
      return "/rep";
    case "shop":
      return "/shop";
    case "warehouse":
      return "/stock";
    default:
      return "/dashboard";
  }
}
