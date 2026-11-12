"use client";

// «منتجاتنا» on the shop owners' landing page: every product on sale, with its picture, for anyone (no sign-in).
// No prices: each shop's price depends on its level (and a public list would show them to anyone), so a
// product says «سجّل لترى سعرك». Search, categories, «متوفر / نفد», and a window with the big picture, the
// packing and items of the same kind. The data: GET /catalog (lib/api), loaded when the section comes near.
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Search, Store, UserPlus, X } from "lucide-react";
import { Art } from "@/components/product-art";
import { api } from "@/lib/api";
import type { CatalogItem } from "@/lib/api/types";
import { useFmt } from "@/lib/i18n";
import { soldUnits } from "@/lib/units";
import { cn, matches } from "@/lib/utils";

const PAGE = 12;

export function PublicCatalog({ color, signedIn, home }: { color: string; signedIn: boolean; home: string }) {
  const { tr, name, unit } = useFmt();
  const box = useRef<HTMLElement>(null);
  const [list, setList] = useState<CatalogItem[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [q, setQ] = useState("");
  const [cat, setCat] = useState("all");
  const [more, setMore] = useState(PAGE);
  const [open, setOpen] = useState<CatalogItem | null>(null);

  // Loaded when the section is about to show (the page itself opens without it).
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const io = new IntersectionObserver(
      ([e]) => {
        if (!e.isIntersecting) return;
        io.disconnect();
        api.catalog().then(setList, () => setFailed(true));
      },
      { rootMargin: "600px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  const cats = [...new Set((list ?? []).map((i) => i.category))];
  const idx = (c: string) => Math.max(0, cats.indexOf(c));
  const shown = (list ?? [])
    .filter((i) => (cat === "all" || i.category === cat) && matches(q, i.name, i.name_en, i.category))
    .sort((a, b) => Number(b.in_stock) - Number(a.in_stock));
  const packing = (i: CatalogItem) =>
    i.pieces_per_carton > 1 && soldUnits(i).includes("carton") ? `${unit(i, "carton")} = ${i.pieces_per_carton} ${unit(i, "piece")}` : unit(i, "piece");
  const cta = signedIn ? { href: home, label: tr("اطلب من التطبيق", "Order in the app"), icon: Store } : { href: "/register", label: tr("سجّل لترى سعرك", "Register to see your price"), icon: UserPlus };

  return (
    <section ref={box} id="products" className="scroll-mt-24 px-4 py-16">
      <div className="mx-auto max-w-2xl text-center">
        <span className="inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-semibold" style={{ borderColor: `${color}55`, background: `${color}14`, color }}>
          <span className="size-1.5 rounded-full" style={{ background: color }} />
          {tr("منتجاتنا", "Our products")}
        </span>
        <h2 className="mt-4 text-3xl font-bold sm:text-4xl">{tr("كل ما نبيعه، بصوره", "Everything we sell, with pictures")}</h2>
        <p className="mt-3 text-white/70">{tr("تصفّح المواد قبل أن تسجّل. الأسعار تظهر لمحلك بعد التسجيل، حسب نوع محلك.", "Browse before you register. Prices show for your shop once registered, by your shop's level.")}</p>
      </div>

      <div className="mx-auto mt-8 max-w-6xl">
        {/* Search and categories */}
        <div className="flex flex-col gap-3">
          <label className="relative block">
            <Search className="pointer-events-none absolute inset-y-0 start-3 my-auto size-4 text-white/50" aria-hidden />
            <input
              type="search"
              value={q}
              onChange={(e) => {
                setQ(e.target.value);
                setMore(PAGE);
              }}
              placeholder={tr("ابحث عن مادة", "Search a product")}
              aria-label={tr("ابحث عن مادة", "Search a product")}
              className="h-12 w-full rounded-2xl border border-white/15 bg-white/5 ps-10 pe-3 text-base text-white outline-none placeholder:text-white/40 focus:border-white/40"
            />
          </label>
          <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none]">
            {["all", ...cats].map((c) => (
              <button
                key={c}
                type="button"
                aria-pressed={cat === c}
                onClick={() => {
                  setCat(c);
                  setMore(PAGE);
                }}
                className={cn("h-10 shrink-0 rounded-full border px-4 text-sm font-semibold transition", cat === c ? "border-transparent text-black" : "border-white/15 text-white/75 hover:text-white")}
                style={cat === c ? { background: color } : undefined}
              >
                {c === "all" ? tr("الكل", "All") : c}
              </button>
            ))}
          </div>
        </div>

        {/* The products */}
        {!list && !failed && (
          <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4" aria-hidden>
            {Array.from({ length: 8 }, (_, i) => (
              <div key={i} className="h-56 animate-pulse rounded-3xl bg-white/5" />
            ))}
          </div>
        )}
        {failed && <p className="mt-8 text-center text-white/60">{tr("تعذّر عرض المنتجات الآن. حاول بعد قليل.", "The products can't show right now. Try again shortly.")}</p>}
        {list && (
          <>
            <ul className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
              {shown.slice(0, more).map((i) => (
                <li key={i.id}>
                  <button type="button" onClick={() => setOpen(i)} className="block h-full w-full rounded-3xl border border-white/10 bg-white/[0.04] p-2 text-start transition hover:border-white/30 active:scale-[0.99]">
                    <Art category={i.category} index={idx(i.category)} image={i.image} />
                    <span className="mt-2 line-clamp-2 block min-h-10 px-1 text-sm font-bold leading-5">{name(i)}</span>
                    <span className="mt-1 flex items-center justify-between gap-2 px-1 pb-1">
                      <span className="truncate text-[11px] text-white/60">{packing(i)}</span>
                      <span className={cn("shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold", i.in_stock ? "bg-emerald-400/15 text-emerald-300" : "bg-white/10 text-white/50")}>
                        {i.in_stock ? tr("متوفر", "In stock") : tr("نفد", "Out")}
                      </span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
            {!shown.length && <p className="mt-8 text-center text-white/60">{tr("لا مادة بهذا الاسم", "No product by that name")}</p>}
            {shown.length > more && (
              <div className="mt-6 text-center">
                <button type="button" onClick={() => setMore((m) => m + PAGE)} className="h-11 rounded-full border border-white/20 px-6 text-sm font-semibold text-white hover:bg-white/10">
                  {tr(`أظهر المزيد (${shown.length - more})`, `Show more (${shown.length - more})`)}
                </button>
              </div>
            )}
          </>
        )}
      </div>

      {open && (
        <ProductWindow
          key={open.id}
          item={open}
          index={idx(open.category)}
          packing={packing(open)}
          similar={(list ?? []).filter((x) => x.category === open.category && x.id !== open.id).sort((a, b) => Number(b.in_stock) - Number(a.in_stock)).slice(0, 10)}
          onOpen={setOpen}
          onClose={() => setOpen(null)}
          color={color}
          cta={cta}
        />
      )}
    </section>
  );
}

function ProductWindow({
  item,
  index,
  packing,
  similar,
  onOpen,
  onClose,
  color,
  cta,
}: {
  item: CatalogItem;
  index: number;
  packing: string;
  similar: CatalogItem[];
  onOpen: (i: CatalogItem) => void;
  onClose: () => void;
  color: string;
  cta: { href: string; label: string; icon: typeof Store };
}) {
  const { tr, name, unit } = useFmt();
  const [zoom, setZoom] = useState(false);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && (zoom ? setZoom(false) : onClose());
    window.addEventListener("keydown", onKey);
    const o = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = o;
    };
  }, [zoom, onClose]);
  const Cta = cta.icon;
  return (
    <div className="fixed inset-0 z-[80] flex items-end justify-center bg-black/70 sm:items-center sm:p-6" onClick={onClose}>
      <div role="dialog" aria-modal aria-label={name(item)} onClick={(e) => e.stopPropagation()} className="max-h-[92dvh] w-full max-w-lg overflow-y-auto rounded-t-3xl border border-white/10 bg-[#121418] p-4 text-white sm:rounded-3xl">
        <div className="mb-3 flex items-center justify-between gap-2">
          <p className="truncate font-bold">{name(item)}</p>
          <button type="button" onClick={onClose} aria-label={tr("إغلاق", "Close")} className="flex size-10 items-center justify-center rounded-full hover:bg-white/10">
            <X className="size-5" />
          </button>
        </div>
        <button type="button" onClick={() => item.image && setZoom(true)} className={cn("block w-full", item.image ? "cursor-zoom-in" : "cursor-default")} aria-label={item.image ? tr("كبّر الصورة", "Enlarge the picture") : name(item)}>
          <Art category={item.category} index={index} image={item.image} size="xl" />
        </button>
        <div className="mt-4 flex items-start justify-between gap-3">
          <div>
            <p className="text-lg font-bold">{name(item)}</p>
            <p className="text-sm text-white/60">{item.category}</p>
          </div>
          <span className={cn("shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold", item.in_stock ? "bg-emerald-400/15 text-emerald-300" : "bg-white/10 text-white/60")}>
            {item.in_stock ? tr("متوفر", "In stock") : tr("نفد حالياً", "Out for now")}
          </span>
        </div>
        <dl className="mt-4 divide-y divide-white/10 rounded-2xl border border-white/10 text-sm">
          {[
            [tr("التعبئة", "Packing"), packing],
            [tr("يُباع بـ", "Sold by"), soldUnits(item).map((u) => unit(item, u)).join(tr(" و", " and "))],
            [tr("السعر", "Price"), tr("يظهر لمحلك بعد التسجيل", "Shows for your shop once registered")],
          ].map(([k, v]) => (
            <div key={k} className="flex items-center justify-between gap-3 px-3 py-2">
              <dt className="text-white/60">{k}</dt>
              <dd className="text-end font-medium">{v}</dd>
            </div>
          ))}
        </dl>
        <Link href={cta.href} className="mt-4 flex h-12 items-center justify-center gap-2 rounded-2xl text-base font-bold text-black" style={{ background: color }}>
          <Cta className="size-5" /> {cta.label}
        </Link>
        {similar.length > 0 && (
          <>
            <h3 className="mt-5 text-sm font-bold">{tr(`من نفس النوع · ${item.category}`, `Of the same kind · ${item.category}`)}</h3>
            <ul className="-mx-1 mt-2 flex snap-x gap-2.5 overflow-x-auto px-1 pb-2">
              {similar.map((s) => (
                <li key={s.id} className="w-32 shrink-0 snap-start">
                  <button type="button" onClick={() => onOpen(s)} className="block w-full rounded-2xl border border-white/10 p-1.5 text-start hover:border-white/30">
                    <Art category={s.category} index={index} image={s.image} size="sm" />
                    <span className="mt-1.5 line-clamp-2 block min-h-8 px-0.5 text-xs font-semibold leading-4">{name(s)}</span>
                  </button>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
      {zoom && item.image && (
        <button type="button" onClick={(e) => (e.stopPropagation(), setZoom(false))} className="fixed inset-0 z-[90] flex items-center justify-center bg-black/90 p-4" aria-label={tr("إغلاق الصورة", "Close the picture")}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={item.image} alt={name(item)} className="max-h-full max-w-full rounded-2xl object-contain" />
          <X className="absolute end-4 top-4 size-8 text-white" />
        </button>
      )}
    </div>
  );
}
