// The texts the manager rewrote (customize mode). Every text on the site goes through tr("عربي", "English")
// in lib/i18n.tsx, so changing a text here changes it on every page, for everyone.
//
// A text is known by its Arabic original, with its numbers taken out: "3 طلبات تنتظر" → "{n} طلبات تنتظر".
// So one rewrite works for every number: "{n} طلبات بانتظار المخزن" shows as "5 طلبات بانتظار المخزن".
//
// While customize mode is on, every text shown is also remembered (`shown`), so a click on the page can
// find which original it came from.
import type { Label } from "./api/types";

export type TextMap = Record<string, Label>;

const NUM = /\d[\d,.]*\d|\d/g;
let texts: TextMap = {};
let any = false;
let recording = false;
let version = 0;
const subs = new Set<() => void>();
/** Text on screen → its original (only while customize mode is on). */
const shown = new Map<string, string>();

const bump = () => {
  version++;
  subs.forEach((f) => f());
};

export function subscribeTexts(fn: () => void) {
  subs.add(fn);
  return () => {
    subs.delete(fn);
  };
}
export const textsVersion = () => version;

export function setTexts(next: TextMap) {
  if (JSON.stringify(next) === JSON.stringify(texts)) return;
  texts = next;
  any = Object.keys(next).length > 0;
  bump();
}

/** Customize mode on/off: when on, the pages draw again and every text is remembered. */
export function setRecording(v: boolean) {
  if (recording === v) return;
  recording = v;
  shown.clear();
  bump();
}

export const keyOf = (ar: string) => ar.replace(NUM, "{n}");

/** The text to show: the manager's version if he wrote one, with today's numbers put back in. */
export function translate(ar: string, en: string, lang: "ar" | "en"): string {
  const base = lang === "ar" ? ar : en;
  if (!any && !recording) return base;
  const key = keyOf(ar);
  const over = texts[key]?.[lang];
  let out = base;
  if (over) {
    const nums = base.match(NUM) ?? [];
    let i = 0;
    out = over.replace(/\{n\}/g, () => nums[i++] ?? "");
  }
  if (recording && out.trim()) shown.set(out.trim(), key);
  return out;
}

/** Which original is this text on screen? (customize mode) */
export const originalOf = (text: string) => shown.get(text.trim());

/**
 * Turn what the manager typed into what is saved: its numbers become {n} again.
 * The text must keep as many numbers as it had (they change by themselves); null = it doesn't.
 */
export function toTemplate(typed: string, onScreen: string): string | null {
  const before = onScreen.match(NUM) ?? [];
  if (!before.length) return typed;
  const after = typed.match(NUM) ?? [];
  if (after.length !== before.length) return null;
  return typed.replace(NUM, "{n}");
}
