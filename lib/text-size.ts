"use client";

// The text size (account menu): normal, large, larger. The whole site is measured from the page's base size
// (rem), so changing it makes everything bigger together: text, buttons, spaces. Kept on this device; the
// boot script (lib/boot.ts) applies it before the page paints, so there is no jump.
import { useSyncExternalStore } from "react";
import { TEXT_SIZE_KEY } from "./boot";

export type TextSize = "normal" | "large" | "xl";
export const TEXT_SIZES: Record<TextSize, string> = { normal: "100%", large: "112.5%", xl: "125%" };

const listeners = new Set<() => void>();

function read(): TextSize {
  try {
    const v = localStorage.getItem(TEXT_SIZE_KEY);
    return v === "large" || v === "xl" ? v : "normal";
  } catch {
    return "normal";
  }
}

export function setTextSize(size: TextSize) {
  try {
    if (size === "normal") localStorage.removeItem(TEXT_SIZE_KEY);
    else localStorage.setItem(TEXT_SIZE_KEY, size);
  } catch {}
  document.documentElement.style.fontSize = size === "normal" ? "" : TEXT_SIZES[size];
  listeners.forEach((l) => l());
}

export function useTextSize(): TextSize {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    read,
    () => "normal",
  );
}
