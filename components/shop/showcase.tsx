"use client";

// «منتجاتنا»: the products one by one, full screen, swiped up and down — each one alive: its picture breathing
// in and out and floating, a slow turning glow behind it, little sparks rising, its name sliding in when it comes.
// A double tap likes it (♥ = a favourite, as everywhere in the app); «أضف إلى السلة» puts one in the bag;
// «التفاصيل» opens the product window. CSS motion only (no library); less motion for those who ask for it.
import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import Link from "next/link";
import { ChevronDown, ChevronUp, Heart, Info, Plus, Share2, ShoppingBag, Volume2, VolumeX } from "lucide-react";
import { useVideoSrc } from "@/lib/media-store";
import { ItemSheet } from "@/components/shop-store";
import { NotifyMe } from "@/components/shop/notify-me";
import { useMyShop } from "@/components/shop/kit";
import { ACCENTS, CatIcon } from "@/components/product-art";
import { ErrorBox, LoadingRows, useToast } from "@/components/ui";
import type { Item } from "@/lib/api/types";
import { useFmt } from "@/lib/i18n";
import { firstUnit, offerOn } from "@/lib/units";
import { cn, today } from "@/lib/utils";

// The sparks: the same places every time (no random in drawing).
const SPARKS = Array.from({ length: 14 }, (_, i) => ({ left: (i * 37) % 100, size: 3 + ((i * 7) % 5), delay: (i * 0.73) % 6, dur: 6 + ((i * 5) % 5) }));

export function Showcase() {
  const { tr, name, money, unit } = useFmt();
  const shop = useMyShop();
  const toast = useToast();
  const box = useRef<HTMLDivElement>(null);
  const [at, setAt] = useState(0);
  const [cat, setCat] = useState("all");
  const [open, setOpen] = useState<Item | null>(null);
  const [burst, setBurst] = useState<number | null>(null);
  // Videos start muted (the browser's rule for playing by itself); one tap turns the sound on for all.
  const [muted, setMuted] = useState(true);
  // The keyboard's arrows move between products at once (the box takes the focus when it opens).
  useEffect(() => {
    box.current?.focus({ preventScroll: true });
  }, [shop.customer?.id]);
  const step = (d: 1 | -1) => box.current?.scrollBy({ top: d * box.current.clientHeight, behavior: "smooth" });

  // New arrivals first, what is in stock before what is out.
  const list = useMemo(
    () => shop.active.filter((i) => cat === "all" || i.category === cat).sort((a, b) => Number(shop.available(b) > 0) - Number(shop.available(a) > 0) || b.id - a.id),
    // The list changes with the items and the section.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [shop.active, cat],
  );
  if (shop.state.status === "error") return <ErrorBox error={shop.state.error} onRetry={shop.reload} />;
  if (!shop.customer) return <LoadingRows />;

  const onScroll = () => {
    const b = box.current;
    if (b) setAt(Math.round(b.scrollTop / Math.max(1, b.clientHeight)));
  };
  const lineOf = (id: number) => shop.bag.lines.find((l) => l.item_id === id);
  const count = shop.bag.lines.reduce((s, l) => s + l.qty, 0);
  function add(it: Item) {
    const l = lineOf(it.id);
    shop.setLine(it.id, { unit: l?.unit ?? firstUnit(it), qty: (l?.qty ?? 0) + 1 });
    toast("success", tr(`أُضيفت إلى السلة: ${name(it)}`, `Added to the bag: ${name(it)}`));
  }
  function like(it: Item, i: number) {
    if (!shop.favs.has(it.id)) shop.toggleFav(it.id);
    setBurst(i);
    setTimeout(() => setBurst((b) => (b === i ? null : b)), 900);
  }
  async function share(it: Item) {
    const url = `${window.location.origin}/client/search?item=${it.id}`;
    try {
      if (navigator.share) await navigator.share({ title: name(it), text: name(it), url });
      else {
        await navigator.clipboard.writeText(url);
        toast("success", tr("نُسخ رابط المادة", "The item's link is copied"));
      }
    } catch {}
  }

  return (
    <>
      <div
        ref={box}
        onScroll={onScroll}
        tabIndex={0}
        aria-label={tr("منتجاتنا", "Our products")}
        className="reels fixed inset-x-0 bottom-[calc(68px+env(safe-area-inset-bottom))] top-14 z-20 snap-y snap-mandatory overflow-y-auto bg-[#0b0c0f] outline-none [scrollbar-width:none] sm:top-16"
      >
        {list.map((it, i) => {
          const accent = ACCENTS[shop.catIndex(it.category) % ACCENTS.length];
          const out = shop.available(it) <= 0;
          const fav = shop.favs.has(it.id);
          const near = Math.abs(i - at) <= 1;
          const u = firstUnit(it);
          return (
            <section
              key={it.id}
              data-active={i === at || undefined}
              className="reel relative flex h-full snap-start snap-always flex-col overflow-hidden text-white"
              style={{ background: `radial-gradient(120% 80% at 50% 38%, color-mix(in oklab, ${accent} 42%, #0b0c0f), #0b0c0f 72%)` } as CSSProperties}
              onDoubleClick={() => like(it, i)}
            >
              {/* The sparks and the turning glow (drawn only near the one in view) */}
              {near && (
                <>
                  <span className="reel-glow absolute left-1/2 top-[38%] size-[78vmin] -translate-x-1/2 -translate-y-1/2 rounded-full opacity-60" style={{ background: `conic-gradient(from 0deg, transparent, ${accent}66, transparent 40%, ${accent}33, transparent 75%)` }} aria-hidden />
                  {SPARKS.map((s, k) => (
                    <span
                      key={k}
                      className="reel-spark absolute bottom-0 rounded-full bg-white/70"
                      style={{ left: `${s.left}%`, width: s.size, height: s.size, animationDelay: `${s.delay}s`, animationDuration: `${s.dur}s` }}
                      aria-hidden
                    />
                  ))}
                </>
              )}

              {/* The stage: the whole width on a phone, a centred column on a computer */}
              <div className="relative mx-auto flex h-full w-full max-w-xl flex-col">
              {/* The product */}
              <div className="relative flex flex-1 items-center justify-center px-10 pt-14">
                {it.video ? (
                  <ReelVideo video={it.video} poster={it.image} active={i === at} muted={muted} label={name(it)} />
                ) : (
                <div className="reel-art relative">
                  {it.image ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={it.image} alt={name(it)} loading={near ? "eager" : "lazy"} className="max-h-[42vh] max-w-[70vw] rounded-3xl object-contain drop-shadow-[0_30px_40px_rgba(0,0,0,0.55)] sm:max-w-sm" />
                  ) : (
                    <div className="flex size-[46vmin] max-h-72 max-w-72 items-center justify-center rounded-[2.5rem] border border-white/15 shadow-[0_30px_60px_rgba(0,0,0,0.5)]" style={{ background: `linear-gradient(150deg, color-mix(in oklab, ${accent} 70%, white), ${accent} 55%, color-mix(in oklab, ${accent} 60%, black))` }}>
                      <CatIcon category={it.category} className="size-1/2 text-white drop-shadow-lg" strokeWidth={1.3} />
                    </div>
                  )}
                  <span className="reel-shadow absolute -bottom-8 left-1/2 h-4 w-3/4 -translate-x-1/2 rounded-[50%] bg-black/50 blur-md" aria-hidden />
                </div>
                )}
                {burst === i && <Heart className="reel-burst absolute size-28 fill-[#e11d48] text-[#e11d48]" aria-hidden />}
              </div>

              {/* The side buttons */}
              <div className="absolute bottom-40 end-3 z-10 flex flex-col items-center gap-4">
                {it.video && (
                  <Side label={muted ? tr("شغّل الصوت", "Sound on") : tr("اكتم الصوت", "Sound off")} onClick={() => setMuted((m) => !m)} text={muted ? tr("الصوت", "Sound") : tr("كتم", "Mute")}>
                    {muted ? <VolumeX className="size-6" /> : <Volume2 className="size-6" />}
                  </Side>
                )}
                <Side label={fav ? tr("أزل من المفضلة", "Remove from favourites") : tr("أعجبني", "Like")} onClick={() => shop.toggleFav(it.id)} text={fav ? tr("مفضلة", "Liked") : tr("أعجبني", "Like")}>
                  <Heart className={cn("size-6", fav && "fill-[#e11d48] text-[#e11d48]")} />
                </Side>
                <Side label={tr("التفاصيل", "Details")} onClick={() => setOpen(it)} text={tr("التفاصيل", "Details")}>
                  <Info className="size-6" />
                </Side>
                <Side label={tr("شارك", "Share")} onClick={() => share(it)} text={tr("شارك", "Share")}>
                  <Share2 className="size-6" />
                </Side>
                <Link href="/shop?bag=1" aria-label={tr(`السلة: ${count}`, `Bag: ${count}`)} className="flex flex-col items-center gap-1 text-[11px] font-semibold">
                  <span className="relative flex size-12 items-center justify-center rounded-full bg-white/12 backdrop-blur">
                    <ShoppingBag className="size-6" />
                    {count > 0 && <span className="num absolute -end-1 -top-1 flex size-5 items-center justify-center rounded-full bg-action text-[10px] font-bold text-on-action">{count}</span>}
                  </span>
                  {tr("السلة", "Bag")}
                </Link>
              </div>

              {/* Its name and price, sliding in when it comes */}
              <div className="reel-text relative z-10 bg-gradient-to-t from-black/85 via-black/45 to-transparent px-4 pb-4 pt-10 pe-20">
                <span className="flex flex-wrap gap-1.5">
                  {it.brand && <span className="inline-block rounded-full border border-white/25 px-2.5 py-0.5 text-[11px] font-semibold text-white/85">{it.brand}</span>}
                  {it.offer && offerOn(it, today()) && (
                    <span className="inline-block rounded-full bg-success px-2.5 py-0.5 text-[11px] font-bold text-white">
                      {tr(`وفّر ${money(it.offer.off)} عند ${it.offer.min}+ ${unit(it, it.offer.unit)}`, `Save ${money(it.offer.off)} on ${it.offer.min}+`)}
                    </span>
                  )}
                </span>
                <h2 className="mt-1.5 text-2xl font-bold leading-8">{name(it)}</h2>
                <p className="mt-0.5 text-sm text-white/70">
                  {it.category} · {u === "carton" ? `${unit(it, "carton")} = ${it.pieces_per_carton} ${unit(it, "piece")}` : unit(it, "piece")}
                </p>
                <div className="mt-3 flex items-center gap-3">
                  <p className="min-w-0">
                    <span className="num block text-xl font-bold">{money(shop.price(it, u))}</span>
                    <span className="text-xs text-white/60">/ {unit(it, u)}</span>
                  </p>
                  {out ? (
                    <NotifyMe item={it} size="lg" className="ms-auto flex-none rounded-2xl px-5 shadow-lg" />
                  ) : (
                    <button type="button" onClick={() => add(it)} className="ms-auto flex h-12 items-center gap-2 rounded-2xl bg-action px-5 font-bold text-on-action shadow-lg transition active:scale-95">
                      <Plus className="size-5" /> {tr("أضف إلى السلة", "Add to bag")}
                    </button>
                  )}
                </div>
              </div>
              </div>
            </section>
          );
        })}
        {!list.length && <p className="flex h-full items-center justify-center text-white/60">{tr("لا مواد في هذا القسم", "No items in this section")}</p>}
      </div>

      {/* Sections, and where you are, over the top of the slides */}
      <div className="fixed inset-x-0 top-14 z-30 sm:top-16">
        <div className="flex gap-1.5 overflow-x-auto bg-gradient-to-b from-black/60 to-transparent px-3 pb-6 pt-3 [scrollbar-width:none]">
          {["all", ...shop.categories].map((c) => (
            <button
              key={c}
              type="button"
              aria-pressed={cat === c}
              onClick={() => {
                setCat(c);
                setAt(0);
                box.current?.scrollTo({ top: 0 });
              }}
              className={cn("h-8 shrink-0 rounded-full px-3 text-xs font-semibold backdrop-blur transition", cat === c ? "bg-white text-black" : "bg-white/15 text-white hover:bg-white/25")}
            >
              {c === "all" ? tr("الكل", "All") : c}
            </button>
          ))}
          <span className="num ms-auto shrink-0 self-center rounded-full bg-black/40 px-2.5 py-1 text-[11px] font-semibold text-white">
            {list.length ? `${Math.min(at + 1, list.length)} / ${list.length}` : "0"}
          </span>
        </div>
      </div>

      {/* On a computer: up / down (also the keyboard's arrows, and the mouse wheel) */}
      <div className="fixed end-6 top-1/2 z-30 hidden -translate-y-1/2 flex-col gap-2 md:flex">
        <button type="button" onClick={() => step(-1)} disabled={at <= 0} aria-label={tr("المنتج السابق", "Previous product")} className="flex size-12 items-center justify-center rounded-full bg-white/15 text-white backdrop-blur transition hover:bg-white/25 disabled:opacity-30">
          <ChevronUp className="size-6" />
        </button>
        <button type="button" onClick={() => step(1)} disabled={at >= list.length - 1} aria-label={tr("المنتج التالي", "Next product")} className="flex size-12 items-center justify-center rounded-full bg-white/15 text-white backdrop-blur transition hover:bg-white/25 disabled:opacity-30">
          <ChevronDown className="size-6" />
        </button>
      </div>

      {open && (
        <ItemSheet
          key={open.id}
          item={open}
          index={shop.catIndex(open.category)}
          similar={shop.active.filter((i) => i.category === open.category && i.id !== open.id).slice(0, 10)}
          priceOf={(x) => shop.price(x, firstUnit(x))}
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
    </>
  );
}

function Side({ label, onClick, text, children }: { label: string; onClick: () => void; text: string; children: React.ReactNode }) {
  return (
    <button type="button" aria-label={label} onClick={onClick} className="flex flex-col items-center gap-1 text-[11px] font-semibold transition active:scale-90">
      <span className="flex size-12 items-center justify-center rounded-full bg-white/12 backdrop-blur">{children}</span>
      {text}
    </button>
  );
}

/** A product's video: plays only on the slide in view (the others wait, paused), loops, its picture as the cover.
 *  If the file isn't on this device (demo), nothing plays and the cover stays. */
function ReelVideo({ video, poster, active, muted, label }: { video: string; poster?: string; active: boolean; muted: boolean; label: string }) {
  const src = useVideoSrc(video);
  const ref = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    const v = ref.current;
    if (!v) return;
    if (active) v.play().catch(() => {});
    else v.pause();
  }, [active, src]);
  return (
    <div className="relative overflow-hidden rounded-3xl shadow-[0_30px_60px_rgba(0,0,0,0.55)]">
      <video
        ref={ref}
        src={src ?? undefined}
        poster={poster}
        muted={muted}
        loop
        playsInline
        preload={active ? "auto" : "metadata"}
        aria-label={label}
        className="max-h-[52vh] max-w-[78vw] bg-black object-contain sm:max-w-md"
      />
    </div>
  );
}
