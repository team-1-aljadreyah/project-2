import { clsx, type ClassValue } from "clsx";
import { useParams } from "next/navigation";
import { twMerge } from "tailwind-merge";
import type { Item, Unit } from "./api/types";

// Joins CSS class names and lets later Tailwind classes win: cn("p-2", isBig && "p-4") -> "p-4"
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** The number in the address, e.g. 12 in /orders/12. */
export function useIdParam(): number {
  const p = useParams<{ id: string }>();
  return Number(p.id);
}

/** Price of one carton or one piece for a price tier. */
export function priceOf(item: Item, tierId: number | undefined, unit: Unit) {
  const p = item.prices.find((x) => x.tier_id === tierId) ?? item.prices[0];
  if (!p) return 0;
  return unit === "carton" ? p.carton_price : p.piece_price;
}

export const piecesOf = (item: Pick<Item, "pieces_per_carton">, unit: Unit, qty: number) => (unit === "carton" ? qty * item.pieces_per_carton : qty);

/** Today as YYYY-MM-DD in local time. */
export function today(offsetDays = 0) {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export const dayOfIso = (iso: string) => {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

export function daysUntil(day: string) {
  return Math.round((new Date(day + "T00:00:00").getTime() - new Date(today() + "T00:00:00").getTime()) / 86_400_000);
}

/** Simple search that ignores Arabic letter forms (أ إ آ ا, ة ه, ى ي) and case. */
export function normalize(s: string) {
  return s
    .toLowerCase()
    .replace(/[أإآ]/g, "ا")
    .replace(/ة/g, "ه")
    .replace(/ى/g, "ي")
    .replace(/[ًٌٍَُِّْ]/g, "")
    .trim();
}

export function matches(q: string, ...fields: (string | undefined | null)[]) {
  const n = normalize(q);
  if (!n) return true;
  return fields.some((f) => f && normalize(f).includes(n));
}

/** Download rows as a CSV file that Excel opens (with Arabic). */
export function downloadCsv(name: string, rows: (string | number)[][]) {
  const csv = rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\r\n");
  const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `${name}.csv`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
