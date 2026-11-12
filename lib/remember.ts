"use client";

// A page's filters, tabs, search and table sorting, remembered while the app is open (this tab's session):
// leave the orders list for an order and come back, and the list is as you left it.
// The pages behind the login are drawn only in the browser, so reading the session store at once is safe.
import { useCallback, useState, type Dispatch, type SetStateAction } from "react";
import { getSession } from "./auth";

const keyOf = (key: string) => `nahrain.keep.${getSession()?.user.id ?? 0}.${key}`;

function read<T>(key: string, initial: T | (() => T)): T {
  try {
    const raw = sessionStorage.getItem(keyOf(key));
    if (raw !== null) return JSON.parse(raw) as T;
  } catch {}
  return typeof initial === "function" ? (initial as () => T)() : initial;
}

/** Like useState, but the value is kept for this page (`key`) until the app is closed. */
export function useRemembered<T>(key: string, initial: T | (() => T)): [T, Dispatch<SetStateAction<T>>] {
  const [v, setV] = useState<T>(() => read(key, initial));
  const set = useCallback<Dispatch<SetStateAction<T>>>(
    (next) =>
      setV((old) => {
        const value = typeof next === "function" ? (next as (o: T) => T)(old) : next;
        try {
          sessionStorage.setItem(keyOf(key), JSON.stringify(value));
        } catch {}
        return value;
      }),
    [key],
  );
  return [v, set];
}
