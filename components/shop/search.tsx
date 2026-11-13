"use client";

// «بحث» in the shop owner's app: words, and a filter sheet (section, brand, price, in stock, order). The results
// come in groups — by section or by brand — four of each, «عرض المزيد» for the rest. A tap opens the product
// window; + puts it in the bag (the same bag as the home). Opened from the home's links with what to show:
// ?cat= ?brand= ?q= ?sort=new|top ?fav=1 ?item= ?by=brand ?filters=1.
import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Search, SlidersHorizontal, X } from "lucide-react";
import { ItemSheet } from "@/components/shop-store";
import { BagPill, ProductCard, bagTotal, itemsWord, orderedCounts, useMyShop } from "@/components/shop/kit";
import { Dialog, ErrorBox, Field, LoadingRows, NumberInput, Segmented, Select, Switch } from "@/components/ui";
import type { Item } from "@/lib/api/types";
import { useFmt } from "@/lib/i18n";
import { firstUnit } from "@/lib/units";
import { cn, matches } from "@/lib/utils";

type Sort = "best" | "new" | "top" | "low" | "high";
type Filters = { cat: string; brand: string; min: number | ""; max: number | ""; inStock: boolean; sort: Sort; fav: boolean };
const NONE: Filters = { cat: "", brand: "", min: "", max: "", inStock: false, sort: "best", fav: false };

export function ShopSearch() {
  const { tr, money } = useFmt();
  const shop = useMyShop();
  const params = useSearchParams();
  const [q, setQ] = useState(params.get("q") ?? "");
  const [f, setF] = useState<Filters>(() => ({
    ...NONE,
    cat: params.get("cat") ?? "",
    brand: params.get("brand") ?? "",
    sort: (["new", "top", "low", "high"].includes(params.get("sort") ?? "") ? params.get("sort") : "best") as Sort,
    fav: params.get("fav") === "1",
  }));
  const [by, setBy] = useState<"cat" | "brand">(params.get("by") === "brand" || params.get("brand") ? "brand" : "cat");
  const [sheet, setSheet] = useState(params.get("filters") === "1");
  const [more, setMore] = useState<Set<string>>(new Set());
  const [open, setOpen] = useState<Item | null>(null);
  const input = useRef<HTMLInputElement>(null);

  // ?item=… (a banner, a link): that product's window opens.
  const itemParam = Number(params.get("item")) || 0;
  useEffect(() => {
    const it = itemParam ? shop.active.find((i) => i.id === itemParam) : undefined;
    // Opening the window of the product the link named, once the items are known.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (it) setOpen(it);
    // Once, for the address's item.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [itemParam, shop.active.length]);

  const c = shop.customer;
  const counts = useMemo(() => (c ? orderedCounts(shop.orders, c.id) : new Map<number, number>()), [shop.orders, c]);
  if (shop.state.status === "error") return <ErrorBox error={shop.state.error} onRetry={shop.reload} />;
  if (!c) return <LoadingRows />;

  const priceOf = (it: Item) => shop.price(it, firstUnit(it));
  const results = shop.active
    .filter((it) => matches(q, it.name, it.name_en, it.brand, it.category, it.barcode))
    .filter((it) => !f.cat || it.category === f.cat)
    .filter((it) => !f.brand || it.brand === f.brand)
    .filter((it) => !f.inStock || shop.available(it) > 0)
    .filter((it) => !f.fav || shop.favs.has(it.id))
    .filter((it) => (f.min === "" || priceOf(it) >= f.min) && (f.max === "" || priceOf(it) <= f.max))
    .sort((a, b) => {
      if (f.sort === "new") return b.id - a.id;
      if (f.sort === "top") return (counts.get(b.id) ?? 0) - (counts.get(a.id) ?? 0);
      if (f.sort === "low") return priceOf(a) - priceOf(b);
      if (f.sort === "high") return priceOf(b) - priceOf(a);
      // The best first: in stock, his favourites, what he orders.
      return Number(shop.available(b) > 0) - Number(shop.available(a) > 0) || Number(shop.favs.has(b.id)) - Number(shop.favs.has(a.id)) || (counts.get(b.id) ?? 0) - (counts.get(a.id) ?? 0);
    });
  const keyOf = (it: Item) => (by === "brand" ? it.brand || tr("بلا علامة", "No brand") : it.category);
  const groups = [...new Set(results.map(keyOf))].map((k) => ({ k, list: results.filter((it) => keyOf(it) === k) }));
  const active = [
    f.cat && { k: "cat", label: f.cat },
    f.brand && { k: "brand", label: f.brand },
    (f.min !== "" || f.max !== "") && { k: "price", label: `${f.min === "" ? "" : money(f.min)} – ${f.max === "" ? "" : money(f.max)}` },
    f.inStock && { k: "inStock", label: tr("المتوفر فقط", "In stock only") },
    f.fav && { k: "fav", label: tr("المفضلة", "Favourites") },
    f.sort !== "best" && { k: "sort", label: sortLabel(f.sort, tr) },
  ].filter(Boolean) as { k: string; label: string }[];
  const clear = (k: string) => setF((x) => (k === "price" ? { ...x, min: "", max: "" } : k === "sort" ? { ...x, sort: "best" } : { ...x, [k]: NONE[k as keyof Filters] }));

  const total = bagTotal(shop.bag.lines, (id) => shop.active.find((i) => i.id === id), shop.price);
  const count = shop.bag.lines.reduce((s, l) => s + l.qty, 0);
  const lineOf = (id: number) => shop.bag.lines.find((l) => l.item_id === id);
  const addOne = (it: Item) => {
    const l = lineOf(it.id);
    shop.setLine(it.id, { unit: l?.unit ?? firstUnit(it), qty: (l?.qty ?? 0) + 1 });
  };

  return (
    <div className="mx-auto max-w-5xl pb-28">
      {/* The words, and the filters */}
      <div className="sticky top-14 z-20 -mx-3 sm:-mx-5 bg-bg/95 px-3 pb-3 sm:px-5 pt-1 backdrop-blur">
        <div className="flex gap-2">
          <label className="flex h-12 min-w-0 flex-1 items-center gap-2 rounded-2xl border border-line-strong bg-card px-4 focus-within:border-action focus-within:ring-4 focus-within:ring-action/15">
            <Search className="size-5 shrink-0 text-faint" />
            <input
              ref={input}
              type="search"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              autoFocus={!params.toString()}
              placeholder={tr("ابحث عن مادة أو علامة تجارية", "Search an item or a brand")}
              aria-label={tr("ابحث عن مادة أو علامة تجارية", "Search an item or a brand")}
              className="h-full min-w-0 flex-1 bg-transparent text-base outline-none placeholder:text-faint"
            />
            {q && (
              <button type="button" onClick={() => setQ("")} aria-label={tr("امسح", "Clear")} className="text-faint hover:text-text">
                <X className="size-4" />
              </button>
            )}
          </label>
          <button
            type="button"
            onClick={() => setSheet(true)}
            aria-label={tr("تصفية البحث", "Search filters")}
            className={cn("relative flex size-12 shrink-0 items-center justify-center rounded-2xl border transition", active.length ? "border-action bg-action/10 text-action" : "border-line-strong bg-card text-muted hover:text-text")}
          >
            <SlidersHorizontal className="size-5" />
            {active.length > 0 && <span className="num absolute -end-1 -top-1 flex size-5 items-center justify-center rounded-full bg-action text-[11px] font-bold text-on-action">{active.length}</span>}
          </button>
        </div>
        <Segmented
          className="mt-3 w-full [&>button]:flex-1 [&>button]:justify-center"
          value={by}
          onChange={setBy}
          options={[
            { value: "cat", label: tr("حسب القسم", "By section") },
            { value: "brand", label: tr("حسب العلامة", "By brand") },
          ]}
        />
        {active.length > 0 && (
          <div className="-mx-3 sm:-mx-5 mt-2 flex gap-1.5 overflow-x-auto px-3 sm:px-5 [scrollbar-width:none]">
            {active.map((a) => (
              <button key={a.k} type="button" onClick={() => clear(a.k)} className="flex shrink-0 items-center gap-1 rounded-full bg-action/10 px-3 py-1 text-xs font-semibold text-action">
                {a.label} <X className="size-3" />
              </button>
            ))}
            <button type="button" onClick={() => setF(NONE)} className="shrink-0 px-2 text-xs font-semibold text-muted hover:text-text">
              {tr("مسح الكل", "Clear all")}
            </button>
          </div>
        )}
      </div>

      <p className="mt-2 text-xs text-muted">{itemsWord(results.length, tr)}</p>
      {groups.map((g) => {
        const all = more.has(g.k);
        const shown = all ? g.list : g.list.slice(0, 4);
        return (
          <section key={g.k} className="mt-5">
            <div className="mb-2.5 flex items-end justify-between gap-3">
              <h2 className="text-lg font-bold">
                {g.k} <span className="num text-sm font-normal text-muted">({g.list.length})</span>
              </h2>
              {g.list.length > 4 && (
                <button type="button" onClick={() => setMore((m) => new Set(all ? [...m].filter((x) => x !== g.k) : [...m, g.k]))} className="text-sm font-semibold text-muted hover:text-action">
                  {all ? tr("عرض أقل", "Show less") : tr(`عرض المزيد (${g.list.length - 4})`, `Show more (${g.list.length - 4})`)}
                </button>
              )}
            </div>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
              {shown.map((it, i) => {
                const l = lineOf(it.id);
                return (
                  <ProductCard
                    key={it.id}
                    it={it}
                    index={shop.catIndex(it.category)}
                    price={priceOf(it)}
                    out={shop.available(it) <= 0}
                    qty={l?.qty}
                    fav={shop.favs.has(it.id)}
                    onOpen={() => setOpen(it)}
                    onAdd={() => addOne(it)}
                    onLess={() => l && shop.setLine(it.id, l.qty > 1 ? { unit: l.unit, qty: l.qty - 1 } : null)}
                    onFav={() => shop.toggleFav(it.id)}
                    delay={Math.min(i, 8) * 0.03}
                  />
                );
              })}
            </div>
          </section>
        );
      })}
      {!results.length && (
        <div className="mt-16 text-center">
          <Search className="mx-auto size-10 text-faint" />
          <p className="mt-3 font-semibold">{tr("لا نتائج", "No results")}</p>
          <p className="text-sm text-muted">{tr("جرّب كلمة أخرى أو امسح التصفية.", "Try another word or clear the filters.")}</p>
        </div>
      )}

      <BagPill count={count} total={total} />

      {sheet && <FilterSheet value={f} categories={shop.categories} brands={shop.brands} onClose={() => setSheet(false)} onApply={(v) => (setF(v), setSheet(false))} />}

      {open && (
        <ItemSheet
          key={open.id}
          item={open}
          index={shop.catIndex(open.category)}
          similar={shop.active.filter((i) => i.category === open.category && i.id !== open.id).sort((a, b) => Number(shop.available(b) > 0) - Number(shop.available(a) > 0)).slice(0, 10)}
          priceOf={priceOf}
          inBag={(id) => !!lineOf(id)}
          onOpen={setOpen}
          line={lineOf(open.id)}
          available={shop.available(open)}
          price={(u) => shop.price(open, u)}
          onClose={() => setOpen(null)}
          onSave={(line) => {
            shop.setLine(open.id, line);
            setOpen(null);
          }}
        />
      )}
    </div>
  );
}

function sortLabel(s: Sort, tr: (a: string, b: string) => string) {
  return { best: tr("الأنسب", "Best match"), new: tr("الأحدث", "Newest"), top: tr("الأكثر طلباً عندك", "You order most"), low: tr("السعر: الأقل", "Price: low"), high: tr("السعر: الأعلى", "Price: high") }[s];
}

/** «تصفية البحث»: a sheet from the bottom; nothing changes until «تطبيق». */
function FilterSheet({ value, categories, brands, onClose, onApply }: { value: Filters; categories: string[]; brands: string[]; onClose: () => void; onApply: (f: Filters) => void }) {
  const { tr } = useFmt();
  const [d, setD] = useState(value);
  const set = (p: Partial<Filters>) => setD((x) => ({ ...x, ...p }));
  return (
    <Dialog
      open
      onClose={onClose}
      title={tr("تصفية البحث", "Search filters")}
      footer={
        <div className="grid w-full grid-cols-2 gap-2">
          <button type="button" onClick={() => setD(NONE)} className="h-12 rounded-xl border border-line-strong font-semibold hover:bg-card-2">
            {tr("مسح", "Clear")}
          </button>
          <button type="button" onClick={() => onApply(d)} className="h-12 rounded-xl bg-action font-bold text-on-action hover:bg-action-hover">
            {tr("تطبيق", "Apply")}
          </button>
        </div>
      }
    >
      <div className="space-y-4">
        <Field label={tr("القسم", "Section")}>
          <Select value={d.cat} onChange={(e) => set({ cat: e.target.value })} aria-label={tr("القسم", "Section")}>
            <option value="">{tr("كل الأقسام", "All sections")}</option>
            {categories.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </Select>
        </Field>
        <Field label={tr("العلامة التجارية", "Brand")}>
          <Select value={d.brand} onChange={(e) => set({ brand: e.target.value })} aria-label={tr("العلامة التجارية", "Brand")}>
            <option value="">{tr("كل العلامات", "All brands")}</option>
            {brands.map((b) => (
              <option key={b}>{b}</option>
            ))}
          </Select>
        </Field>
        <Field label={tr("السعر (د.ع)", "Price (IQD)")} hint={tr("سعرك أنت للوحدة الأولى", "Your own price for the first unit")}>
          <div className="grid grid-cols-2 gap-2">
            <NumberInput value={d.min} onChange={(v) => set({ min: v })} placeholder={tr("من", "From")} aria-label={tr("السعر من", "Price from")} />
            <NumberInput value={d.max} onChange={(v) => set({ max: v })} placeholder={tr("إلى", "To")} aria-label={tr("السعر إلى", "Price to")} />
          </div>
        </Field>
        <Field label={tr("الترتيب", "Order")}>
          <Select value={d.sort} onChange={(e) => set({ sort: e.target.value as Sort })} aria-label={tr("الترتيب", "Order")}>
            {(["best", "new", "top", "low", "high"] as Sort[]).map((s) => (
              <option key={s} value={s}>
                {sortLabel(s, tr)}
              </option>
            ))}
          </Select>
        </Field>
        <div className="rounded-xl bg-card-2 px-3 py-1">
          <Switch checked={d.inStock} onChange={(v) => set({ inStock: v })} label={tr("المتوفر فقط", "In stock only")} />
          <Switch checked={d.fav} onChange={(v) => set({ fav: v })} label={tr("المفضلة فقط", "Favourites only")} />
        </div>
      </div>
    </Dialog>
  );
}
