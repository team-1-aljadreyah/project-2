"use client";

// Advanced settings at work: a person's permission profile (pages taken away) and the app they work in.
// The profiles and apps are part of the site's settings (lib/site.ts), so every open page gets the manager's
// change at once (live refresh), and the person's profile comes with their user (`profile_id`).
import { useSyncExternalStore } from "react";
import type { AppDef, Profile, SiteCustom, User } from "./api/types";
import { useSite } from "./site";

type Who = Pick<User, "id" | "role" | "profile_id">;

/** This person's profile (only one of their own job counts). */
export function profileOf(site: SiteCustom, user: Pick<User, "role" | "profile_id"> | null | undefined): Profile | undefined {
  if (!user?.profile_id) return undefined;
  const p = site.profiles.find((x) => x.id === user.profile_id);
  return p && p.role === user.role ? p : undefined;
}

// A page made of another page's data goes with it: the server refuses the data behind a page taken away (403),
// so «التوصيل» (the orders that have a delivery) can't open without «الطلبات».
const MADE_FROM: Record<string, string> = { "/deliveries": "/orders" };

/** The pages this person can't open (their profile's, and the pages made of their data). */
export function deniedOf(site: SiteCustom, user: Pick<User, "role" | "profile_id"> | null | undefined): string[] {
  const denied = profileOf(site, user)?.denied ?? [];
  const made = Object.entries(MADE_FROM).filter(([page, from]) => denied.includes(from) && !denied.includes(page));
  return made.length ? [...denied, ...made.map(([page]) => page)] : denied;
}

export function useDenied(user: Pick<User, "role" | "profile_id"> | null | undefined) {
  return deniedOf(useSite(), user);
}

/**
 * Is this part taken away from the person (its page is in their profile's «denied»)? The server refuses the
 * endpoints behind it (403), so a page that shows a bit of it (the staff's home: orders to prepare; the stock
 * page: near-expiry batches from the reports) leaves that bit out instead of asking.
 */
export function useBlocked(user: Pick<User, "role" | "profile_id"> | null | undefined) {
  const denied = useDenied(user);
  return (page: string) => denied.includes(page);
}

/** The apps this person may switch to: for their job, or for their profile. */
export function appsFor(site: SiteCustom, user: Pick<User, "role" | "profile_id">): AppDef[] {
  const p = profileOf(site, user);
  return site.apps.filter((a) => a.active && (a.roles.includes(user.role) || (!!p && a.profiles.includes(p.id))));
}

// ---------- the app chosen in the launcher (on this device, per person) ----------

const KEY = "nahrain.app";
const listeners = new Set<() => void>();
const read = (id: number) => {
  try {
    return localStorage.getItem(`${KEY}.${id}`) ?? "";
  } catch {
    return "";
  }
};
function subscribe(l: () => void) {
  listeners.add(l);
  const onStorage = (e: StorageEvent) => e.key?.startsWith(KEY) && l();
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(l);
    window.removeEventListener("storage", onStorage);
  };
}

/** Switch app ("all" = every page, the usual menu). */
export function chooseApp(userId: number, id: string) {
  try {
    localStorage.setItem(`${KEY}.${userId}`, id);
  } catch {}
  listeners.forEach((l) => l());
}

/** The app this person works in now: the one they chose, else their profile's default; null = every page. */
export function useCurrentApp(user: Who): AppDef | null {
  const site = useSite();
  const raw = useSyncExternalStore(subscribe, () => read(user.id), () => "");
  if (raw === "all") return null;
  const mine = appsFor(site, user);
  const id = raw || profileOf(site, user)?.default_app;
  return mine.find((a) => a.id === id) ?? null;
}
