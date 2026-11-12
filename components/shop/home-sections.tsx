"use client";

// The top of the shop owner's home: the ads carousel (the manager's own, then automatic ones made from our data),
// the categories as tiles, and the brands row. Our look (the brand panel, the orange, the clay tiles), not a copy.
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ArrowLeft, ArrowRight, CreditCard, RotateCcw, Sparkles } from "lucide-react";
import { Art, ACCENTS } from "@/components/product-art";
import type { Item, ShopBanner } from "@/lib/api/types";
import { useFmt } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { itemsWord } from "@/components/shop/kit";

export type Slide =
  | { kind: "manager"; banner: ShopBanner }
  | { kind: "new"; items: Item[] }
  | { kind: "last"; number: string; count: number; onClick: () => void }
  | { kind: "category"; category: string; items: Item[]; count: number; index: number }
  | { kind: "pay"; owed: number };

/** Where a manager's ad goes. */
export function bannerHref(b: ShopBanner) {
  const v = encodeURIComponent(b.link.value);
  return b.link.kind === "category" ? `/search?cat=${v}` : b.link.kind === "brand" ? `/search?brand=${v}` : b.link.kind === "item" ? `/search?item=${v}` : `/search?q=${v}`;
}

export function Banners({ slides, catIndex }: { slides: Slide[]; catIndex: (c: string) => number }) {
  const { tr, lang } = useFmt();
  const box = useRef<HTMLDivElement>(null);
  const [at, setAt] = useState(0);
  const [paused, setPaused] = useState(false);
  // Turn by itself every 5 s (not while touched, nor for someone who asked for less motion).
  useEffect(() => {
    if (paused || slides.length < 2 || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const t = setInterval(() => go((at + 1) % slides.length), 5000);
    return () => clearInterval(t);
  });
  function go(i: number) {
    const el = box.current?.children[i] as HTMLElement | undefined;
    if (el && box.current) box.current.scrollTo({ left: el.offsetLeft - box.current.offsetLeft - (box.current.clientWidth - el.clientWidth) / 2, behavior: "smooth" });
  }
  const onScroll = () => {
    const b = box.current;
    if (!b) return;
    const mid = b.scrollLeft + b.clientWidth / 2;
    let best = 0;
    [...b.children].forEach((c, i) => {
      const el = c as HTMLElement;
      if (Math.abs(el.offsetLeft - b.offsetLeft + el.clientWidth / 2 - mid) < Math.abs((b.children[best] as HTMLElement).offsetLeft - b.offsetLeft + (b.children[best] as HTMLElement).clientWidth / 2 - mid)) best = i;
    });
    setAt(best);
  };
  if (!slides.length) return null;
  const Fwd = lang === "ar" ? ArrowLeft : ArrowRight;
  return (
    <section aria-label={tr("العروض", "Offers")} className="mt-4" onPointerEnter={() => setPaused(true)} onPointerLeave={() => setPaused(false)} onTouchStart={() => setPaused(true)}>
      <div ref={box} onScroll={onScroll} className="-mx-3 sm:-mx-5 flex snap-x snap-mandatory gap-3 overflow-x-auto px-3 pb-1 sm:px-5 [scrollbar-width:none]">
        {slides.map((s, i) => (
          <div key={i} className="w-[88%] shrink-0 snap-center sm:w-[70%] lg:w-[48%]">
            <SlideCard s={s} catIndex={catIndex} Fwd={Fwd} />
          </div>
        ))}
      </div>
      {slides.length > 1 && (
        <div className="mt-2 flex justify-center gap-1.5">
          {slides.map((_, i) => (
            <button key={i} type="button" onClick={() => go(i)} aria-label={tr(`العرض ${i + 1}`, `Offer ${i + 1}`)} aria-current={i === at} className="flex h-6 items-center px-0.5">
              <span className={cn("block h-1.5 rounded-full transition-all", i === at ? "w-6 bg-action" : "w-1.5 bg-line-strong")} />
            </button>
          ))}
        </div>
      )}
    </section>
  );
}

function SlideCard({ s, catIndex, Fwd }: { s: Slide; catIndex: (c: string) => number; Fwd: typeof ArrowLeft }) {
  const { tr, money, lang } = useFmt();
  const base = "relative flex h-40 overflow-hidden rounded-3xl sm:h-44";
  if (s.kind === "manager") {
    const b = s.banner;
    return (
      <Link href={bannerHref(b)} className={cn(base, "items-end bg-card-2")}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={b.image} alt="" className="absolute inset-0 size-full object-cover" />
        <span className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/10 to-transparent" aria-hidden />
        <span className="relative p-4 text-white">
          <span className="block text-lg font-bold leading-6">{lang === "en" && b.title_en ? b.title_en : b.title}</span>
          {b.sub && <span className="block text-sm opacity-85">{b.sub}</span>}
        </span>
      </Link>
    );
  }
  // The automatic ones: the brand panel, words on one side, a few products standing on the other.
  const content =
    s.kind === "new"
      ? { eyebrow: tr("جديد عندنا", "New here"), title: tr("وصل حديثاً إلى المخزن", "Just arrived at the warehouse"), cta: tr("شاهدها", "See them"), href: "/search?sort=new", items: s.items, icon: Sparkles }
      : s.kind === "category"
        ? { eyebrow: itemsWord(s.count, tr), title: tr(`كل ما تحتاجه من ${s.category}`, `All your ${s.category}`), cta: tr("تصفّح", "Browse"), href: `/search?cat=${encodeURIComponent(s.category)}`, items: s.items, icon: Sparkles }
        : s.kind === "pay"
          ? { eyebrow: tr("سدّد من جوالك", "Pay from your phone"), title: tr(`دينك ${money(s.owed)}: سدّده بزين كاش أو Qi`, `You owe ${money(s.owed)}: pay with ZainCash or Qi`), cta: tr("سدّد الآن", "Pay now"), href: "/statement", items: [], icon: CreditCard }
          : { eyebrow: itemsWord(s.count, tr), title: tr("اطلب مثل آخر مرة بضغطة", "Order like last time, in one tap"), cta: tr("إلى السلة", "To the bag"), href: "", items: [], icon: RotateCcw };
  const Icon = content.icon;
  const inner = (
    <>
      <span className="brand-grid absolute inset-0" aria-hidden />
      <span className="relative flex min-w-0 flex-1 flex-col justify-center p-4">
        <span className="flex items-center gap-1 text-xs font-semibold text-[#f5b48a]">
          <Icon className="size-3.5" /> {content.eyebrow}
        </span>
        <span className="mt-1 line-clamp-2 text-lg font-bold leading-6">{content.title}</span>
        <span className="mt-3 inline-flex w-fit items-center gap-1 rounded-full bg-action px-3 py-1.5 text-xs font-bold text-on-action">
          {content.cta} <Fwd className="size-3.5" />
        </span>
      </span>
      {content.items.length > 0 ? (
        <span className="relative flex w-[42%] shrink-0 items-center justify-center" aria-hidden>
          {content.items.slice(0, 3).map((it, i) => (
            <span key={it.id} className={cn("absolute w-20 drop-shadow-xl", i === 0 ? "z-10 -translate-y-1 scale-110" : i === 1 ? "-translate-x-10 translate-y-4 -rotate-6" : "translate-x-10 translate-y-4 rotate-6")}>
              <Art category={it.category} index={catIndex(it.category)} image={it.image} size="sm" />
            </span>
          ))}
        </span>
      ) : (
        <span className="relative flex w-[34%] shrink-0 items-center justify-center" aria-hidden>
          <Icon className="size-20 text-[#f5b48a] opacity-80" strokeWidth={1.2} />
        </span>
      )}
      <span className="hazard absolute inset-x-0 bottom-0 h-1" aria-hidden />
    </>
  );
  if (s.kind === "last")
    return (
      <button type="button" onClick={s.onClick} className={cn(base, "brand-panel w-full text-start")}>
        {inner}
      </button>
    );
  return (
    <Link href={content.href} className={cn(base, "brand-panel")}>
      {inner}
    </Link>
  );
}

/** «تصفّح الأقسام»: a tile per category (its picture tile and name). */
export function CategoryTiles({ categories, counts, catIndex, onPick }: { categories: string[]; counts: Map<string, number>; catIndex: (c: string) => number; onPick: (c: string) => void }) {
  const { tr } = useFmt();
  return (
    <div className="-mx-3 flex gap-2.5 overflow-x-auto px-3 pb-1 [scrollbar-width:none] sm:-mx-5 sm:px-5 md:mx-0 md:grid md:grid-cols-6 md:overflow-visible md:px-0 lg:grid-cols-8">
      {categories.map((c, i) => (
        <button key={c} type="button" onClick={() => onPick(c)} style={{ animationDelay: `${i * 0.04}s` }} className="rise-item w-24 shrink-0 rounded-2xl border border-line bg-card p-2 text-center md:w-auto transition hover:border-action active:scale-95">
          <Art category={c} index={catIndex(c)} size="sm" />
          <span className="mt-1.5 block truncate text-xs font-bold">{c}</span>
          <span className="num block text-[10px] text-muted">{itemsWord(counts.get(c) ?? 0, tr)}</span>
        </button>
      ))}
    </div>
  );
}

/** «العلامات التجارية»: a round badge per brand (its first letters, in a color of its own). */
export function BrandRow({ brands }: { brands: string[] }) {
  return (
    <div className="-mx-3 flex gap-2.5 overflow-x-auto px-3 pb-1 [scrollbar-width:none] sm:-mx-5 sm:px-5 md:mx-0 md:grid md:grid-cols-6 md:overflow-visible md:px-0 lg:grid-cols-8">
      {brands.map((b, i) => {
        const color = ACCENTS[(i * 3) % ACCENTS.length];
        return (
          <Link key={b} href={`/search?brand=${encodeURIComponent(b)}`} className="flex w-24 shrink-0 flex-col items-center gap-1.5 rounded-2xl border border-line bg-card p-2.5 md:w-auto transition hover:border-action active:scale-95">
            <span className="flex size-14 items-center justify-center rounded-full text-lg font-black text-white shadow-inner" style={{ background: `linear-gradient(140deg, ${color}, color-mix(in oklab, ${color} 55%, black))` }}>
              {b.replace(/^ال/, "").trim().slice(0, 2)}
            </span>
            <span className="w-full truncate text-center text-xs font-semibold">{b}</span>
          </Link>
        );
      })}
    </div>
  );
}
