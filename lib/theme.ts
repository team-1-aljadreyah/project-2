"use client";

// Day / night mode. The choice is saved in the browser; the first time it follows the phone's setting.
import { useSyncExternalStore } from "react";
import { THEME_KEY } from "./boot";

export type Theme = "light" | "dark";

const listeners = new Set<() => void>();

function readTheme(): Theme {
  return document.documentElement.classList.contains("dark") ? "dark" : "light";
}

function subscribe(l: () => void) {
  listeners.add(l);
  return () => listeners.delete(l);
}

export function setTheme(theme: Theme) {
  try {
    localStorage.setItem(THEME_KEY, theme);
  } catch {}
  document.documentElement.classList.toggle("dark", theme === "dark");
  listeners.forEach((l) => l());
}

export function useTheme(): Theme {
  return useSyncExternalStore(subscribe, readTheme, () => "light");
}
