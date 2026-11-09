"use client";

// Arabic first, English second. Texts are written next to each other in the code: tr("المواد", "Items"),
// so a screen can never miss a translation, and you read both while you work.
import { useCallback, useEffect, useMemo, useSyncExternalStore } from "react";
import { LOCALE_KEY } from "./boot";

export type Lang = "ar" | "en";

const listeners = new Set<() => void>();

function readLang(): Lang {
  try {
    return localStorage.getItem(LOCALE_KEY) === "en" ? "en" : "ar";
  } catch {
    return "ar";
  }
}

function subscribe(l: () => void) {
  listeners.add(l);
  return () => listeners.delete(l);
}

export function setLang(lang: Lang) {
  try {
    localStorage.setItem(LOCALE_KEY, lang);
  } catch {}
  document.documentElement.lang = lang;
  document.documentElement.dir = lang === "ar" ? "rtl" : "ltr";
  listeners.forEach((l) => l());
}

export type Tr = (ar: string, en: string) => string;

export interface Fmt {
  lang: Lang;
  tr: Tr;
  /** 1250000 -> "1,250,000 د.ع" */
  money: (n: number | undefined | null, opts?: { sign?: boolean; bare?: boolean }) => string;
  num: (n: number | undefined | null) => string;
  /** pieces -> "3 كارتون + 4 قطعة" */
  qty: (pieces: number, perCarton: number) => string;
  date: (iso: string | undefined) => string;
  dateTime: (iso: string | undefined) => string;
  time: (iso: string | undefined) => string;
  ago: (iso: string | undefined) => string;
  monthName: (month: string) => string;
  /** Picks the name in the current language from objects with name / name_en. */
  name: (o: { name: string; name_en?: string } | undefined | null) => string;
}

export function makeFmt(lang: Lang): Fmt {
  const tr: Tr = (ar, en) => (lang === "ar" ? ar : en);
  const nf = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });
  const locale = lang === "ar" ? "ar-IQ-u-nu-latn" : "en-GB";
  const dateF = new Intl.DateTimeFormat(locale, { day: "2-digit", month: "2-digit", year: "numeric" });
  const dtF = new Intl.DateTimeFormat(locale, { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
  const tF = new Intl.DateTimeFormat(locale, { hour: "2-digit", minute: "2-digit" });
  const mF = new Intl.DateTimeFormat(locale, { month: "long", year: "numeric" });
  const toDate = (iso: string) => (iso.length === 10 ? new Date(iso + "T00:00:00") : new Date(iso));
  return {
    lang,
    tr,
    num: (n) => (n === undefined || n === null ? "-" : nf.format(n)),
    money: (n, opts) => {
      if (n === undefined || n === null) return "-";
      const v = nf.format(Math.abs(n));
      const sign = n < 0 ? "-" : opts?.sign && n > 0 ? "+" : "";
      if (opts?.bare) return `${sign}${v}`;
      return lang === "ar" ? `${sign}${v} د.ع` : `${sign}${v} IQD`;
    },
    qty: (pieces, perCarton) => {
      const neg = pieces < 0;
      const p = Math.abs(pieces);
      if (perCarton <= 1) return `${neg ? "-" : ""}${nf.format(p)} ${tr("قطعة", "pcs")}`;
      const c = Math.floor(p / perCarton);
      const r = p % perCarton;
      const parts: string[] = [];
      if (c) parts.push(`${nf.format(c)} ${tr("كارتون", "ctn")}`);
      if (r || !c) parts.push(`${nf.format(r)} ${tr("قطعة", "pcs")}`);
      return (neg ? "-" : "") + parts.join(" + ");
    },
    date: (iso) => (iso ? dateF.format(toDate(iso)) : "-"),
    dateTime: (iso) => (iso ? dtF.format(toDate(iso)) : "-"),
    time: (iso) => (iso ? tF.format(toDate(iso)) : "-"),
    ago: (iso) => {
      if (!iso) return "-";
      const s = Math.round((Date.now() - toDate(iso).getTime()) / 1000);
      if (s < 60) return tr("الآن", "just now");
      const m = Math.round(s / 60);
      if (m < 60) return tr(`قبل ${m} دقيقة`, `${m} min ago`);
      const h = Math.round(m / 60);
      if (h < 24) return tr(`قبل ${h} ساعة`, `${h} h ago`);
      const d = Math.round(h / 24);
      if (d < 30) return tr(`قبل ${d} يوم`, `${d} days ago`);
      return dateF.format(toDate(iso));
    },
    monthName: (month) => mF.format(new Date(month + "-01T00:00:00")),
    name: (o) => (!o ? "-" : lang === "en" && o.name_en ? o.name_en : o.name),
  };
}

/** Everything a screen needs to show text, money and dates in the chosen language. */
export function useFmt(): Fmt {
  const lang = useSyncExternalStore(subscribe, readLang, () => "ar" as Lang);
  return useMemo(() => makeFmt(lang), [lang]);
}

/** Keeps <html lang dir> in sync when the language changes. */
export function LangSync() {
  const { lang } = useFmt();
  useEffect(() => {
    document.documentElement.lang = lang;
    document.documentElement.dir = lang === "ar" ? "rtl" : "ltr";
  }, [lang]);
  return null;
}

export function useToggleLang() {
  const { lang } = useFmt();
  return useCallback(() => setLang(lang === "ar" ? "en" : "ar"), [lang]);
}
