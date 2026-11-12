"use client";

// One search for the whole site: the magnifier in the top bar, or Ctrl+K (⌘K) / "/" on a computer.
// It finds pages, customers, items, orders and invoices, and offers only what this person may open (their
// job and their permission profile). Arabic is matched loosely (أ/إ/آ = ا, ة = ه, ى = ي, Arabic digits).
import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { FileText, Package, Search, ShoppingCart, Store, X, type LucideIcon } from "lucide-react";
import { useMayOpen } from "@/components/ui";
import { api } from "@/lib/api";
import type { Item } from "@/lib/api/types";
import { useAppRouter } from "@/lib/app-path";
import { useFmt } from "@/lib/i18n";
import { cn } from "@/lib/utils";

/** Letters and digits as people type them, so «اسواق» finds «أسواق» and «١٢» finds 12. */
export function norm(s: string) {
  return s
    .toLowerCase()
    .replace(/[ً-ْـ]/g, "")
    .replace(/[أإآ]/g, "ا")
    .replace(/ة/g, "ه")
    .replace(/ى/g, "ي")
    .replace(/[٠-٩]/g, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d)))
    .trim();
}

interface Hit {
  key: string;
  group: string;
  title: string;
  sub?: string;
  href: string;
  icon: LucideIcon;
}

export interface SearchPage {
  href: string;
  ar: string;
  en: string;
  icon: LucideIcon;
}

export function QuickSearch({ pages }: { pages: SearchPage[] }) {
  const { tr } = useFmt();
  const [open, setOpen] = useState(false);
  // Ctrl+K / ⌘K anywhere; "/" when not typing in a box.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const typing = e.target instanceof HTMLElement && (e.target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(e.target.tagName));
      if ((e.key === "k" || e.key === "K" || e.key === "ك") && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        setOpen(true);
      } else if (e.key === "/" && !typing) {
        e.preventDefault();
        setOpen(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={tr("بحث في الموقع", "Search the site")}
        title={tr("بحث (Ctrl+K)", "Search (Ctrl+K)")}
        className="flex size-10 items-center justify-center rounded-xl text-muted hover:bg-card-2 hover:text-text"
      >
        <Search className="size-5" />
      </button>
      {open && <SearchBox pages={pages} onClose={() => setOpen(false)} />}
    </>
  );
}

function SearchBox({ pages, onClose }: { pages: SearchPage[]; onClose: () => void }) {
  const { tr, name, money } = useFmt();
  const router = useAppRouter();
  const may = useMayOpen();
  const [q, setQ] = useState("");
  const [at, setAt] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  // The lists are loaded once when the box opens (only the ones this person may open).
  // (The top bar is outside the pages' shared data, so the box loads what it searches by itself.)
  const [data, setData] = useState<{
    customers: { id: number; name: string; area: string; owner_name: string }[];
    orders: { id: number; number: string; customer_id: number; total: number }[];
    invoices: { id: number; number: string; customer_id: number; total: number }[];
    items: Item[];
  }>({ customers: [], orders: [], invoices: [], items: [] });
  useEffect(() => {
    input.current?.focus();
    let alive = true;
    const quiet = <T,>(p: Promise<T>, empty: T) => p.catch(() => empty);
    Promise.all([
      may("/customers/1") ? quiet(api.listCustomers(), []) : Promise.resolve([]),
      may("/orders/1") ? quiet(api.listOrders(), []) : Promise.resolve([]),
      may("/invoices/1") ? quiet(api.listInvoices(), []) : Promise.resolve([]),
      may("/items/1") ? quiet(api.listItems(), [] as Item[]) : Promise.resolve([] as Item[]),
    ]).then(([customers, orders, invoices, items]) => alive && setData({ customers, orders, invoices, items }));
    return () => {
      alive = false;
    };
    // Once, when the box opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const hits = useMemo<Hit[]>(() => {
    const n = norm(q);
    const has = (...xs: (string | undefined)[]) => xs.some((x) => x && norm(x).includes(n));
    const custName = (id: number) => data.customers.find((c) => c.id === id)?.name ?? "";
    const out: Hit[] = [];
    const pg = pages.filter((p) => !n || has(p.ar, p.en)).slice(0, n ? 6 : 8);
    out.push(...pg.map((p) => ({ key: `p${p.href}`, group: tr("الصفحات", "Pages"), title: tr(p.ar, p.en), href: p.href, icon: p.icon })));
    if (!n) return out;
    out.push(
      ...data.customers
        .filter((c) => has(c.name, c.owner_name, c.area))
        .slice(0, 6)
        .map((c) => ({ key: `c${c.id}`, group: tr("الزبائن", "Customers"), title: c.name, sub: `${c.owner_name} · ${c.area}`, href: `/customers/${c.id}`, icon: Store })),
    );
    if (may("/items/1"))
      out.push(
        ...data.items
          .filter((i) => has(i.name, i.name_en, i.barcode, i.category))
          // The name first, then the ones found only by their category.
          .sort((a, b) => Number(!has(a.name, a.name_en, a.barcode)) - Number(!has(b.name, b.name_en, b.barcode)))
          .slice(0, 6)
          .map((i) => ({ key: `i${i.id}`, group: tr("المواد", "Items"), title: name(i), sub: i.category, href: `/items/${i.id}`, icon: Package })),
      );
    out.push(
      ...data.orders
        .filter((o) => has(o.number, custName(o.customer_id)))
        .slice(0, 6)
        .map((o) => ({ key: `o${o.id}`, group: tr("الطلبات", "Orders"), title: o.number, sub: `${custName(o.customer_id)} · ${money(o.total)}`, href: `/orders/${o.id}`, icon: ShoppingCart })),
    );
    out.push(
      ...data.invoices
        .filter((i) => has(i.number, custName(i.customer_id)))
        .slice(0, 6)
        .map((i) => ({ key: `v${i.id}`, group: tr("الفواتير", "Invoices"), title: i.number, sub: `${custName(i.customer_id)} · ${money(i.total)}`, href: `/invoices/${i.id}`, icon: FileText })),
    );
    return out.filter((h) => may(h.href));
  }, [q, data, pages, may, tr, name, money]);

  const pick = (h: Hit | undefined) => {
    if (!h) return;
    onClose();
    router.push(h.href);
  };
  const cur = Math.min(at, Math.max(0, hits.length - 1));
  let lastGroup = "";

  return createPortal(
    <div className="fixed inset-0 z-[90] flex items-start justify-center bg-black/40 p-3 pt-[10vh] backdrop-blur-sm" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div role="dialog" aria-modal aria-label={tr("بحث في الموقع", "Search the site")} className="w-full max-w-xl overflow-hidden rounded-2xl border border-line bg-card shadow-2xl">
        <div className="flex items-center gap-3 border-b border-line px-4">
          <Search className="size-5 shrink-0 text-faint" />
          <input
            ref={input}
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setAt(0);
            }}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown") {
                e.preventDefault();
                setAt((x) => Math.min(x + 1, hits.length - 1));
              } else if (e.key === "ArrowUp") {
                e.preventDefault();
                setAt((x) => Math.max(x - 1, 0));
              } else if (e.key === "Enter") {
                e.preventDefault();
                pick(hits[cur]);
              } else if (e.key === "Escape") onClose();
            }}
            placeholder={tr(`ابحث عن زبون، مادة، رقم طلب أو فاتورة، أو صفحة…`, "Search a customer, item, order or invoice number, or a page…")}
            className="h-14 flex-1 bg-transparent text-base outline-none placeholder:text-faint"
          />
          <button type="button" onClick={onClose} aria-label={tr("إغلاق", "Close")} className="rounded-lg p-1.5 text-faint hover:bg-card-2">
            <X className="size-4" />
          </button>
        </div>
        <div className="max-h-[60vh] overflow-y-auto p-2">
          {hits.length === 0 ? (
            <p className="p-6 text-center text-sm text-muted">{tr("لا نتائج. جرّب كلمة أخرى.", "Nothing found. Try another word.")}</p>
          ) : (
            hits.map((h, i) => {
              const head = h.group !== lastGroup;
              lastGroup = h.group;
              return (
                <div key={h.key}>
                  {head && <p className="px-3 pb-1 pt-3 text-[11px] font-semibold text-faint">{h.group}</p>}
                  <button
                    type="button"
                    onMouseEnter={() => setAt(i)}
                    onClick={() => pick(h)}
                    className={cn("flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-start", i === cur ? "bg-primary-soft text-primary-ink" : "hover:bg-card-2")}
                  >
                    <h.icon className="size-[18px] shrink-0 text-muted" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">{h.title}</span>
                      {h.sub && <span className="block truncate text-xs text-muted">{h.sub}</span>}
                    </span>
                  </button>
                </div>
              );
            })
          )}
        </div>
        <p className="hidden border-t border-line px-4 py-2 text-[11px] text-faint sm:block">{tr("↑↓ للتنقل · Enter للفتح · Esc للإغلاق", "↑↓ to move · Enter to open · Esc to close")}</p>
      </div>
    </div>,
    document.body,
  );
}
