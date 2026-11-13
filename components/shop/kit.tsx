"use client";

// Pieces shared by the shop owner's app pages (home, search, «منتجاتنا», account): his shop and its prices,
// the product card, and the floating bag button. The bag itself is lib/shop-bag.ts (one per shop, on the phone).
import Link from "next/link";
import { Heart, Hourglass, Minus, Play, Plus, ShoppingBag } from "lucide-react";
import { useApp } from "@/components/shell";
import { Art } from "@/components/product-art";
import { api } from "@/lib/api";
import type { Customer, Item, Order, Unit } from "@/lib/api/types";
import { useFmt } from "@/lib/i18n";
import { useRealtime } from "@/lib/realtime";
import { useShopBag } from "@/lib/shop-bag";
import { firstUnit } from "@/lib/units";
import { useLoad } from "@/lib/use-load";
import { cn, priceOf, today } from "@/lib/utils";
import { afterOffer, clearPrice, clearanceOn, offerOn } from "@/lib/units";
import { NotifyMe } from "@/components/shop/notify-me";

/** His shop (the one he works on now), his orders, and what the pages need around them. */
export function useMyShop() {
  const { user, items, lookups } = useApp();
  const id = user.customer_id ?? 0;
  const c = useLoad(() => api.getCustomer(id), [id]);
  const orders = useLoad(() => api.listOrders().catch(() => [] as Order[]), [id]);
  useRealtime(["orders"], () => orders.reload());
  const customer: Customer | undefined = c.data;
  // Orders come from the main warehouse (the company decides).
  const warehouseId = lookups.warehouses[0]?.id;
  const available = (it: Item) => it.stock.by_warehouse.find((w) => w.warehouse_id === warehouseId)?.qty ?? 0;
  // His price; with a clearance running («عرض تصريف»), after its discount.
  const base = (it: Item, unit: Unit) => (customer ? priceOf(it, customer.tier_id, unit) : 0);
  const price = (it: Item, unit: Unit) => {
    const c = clearanceOn(it, today());
    return c ? clearPrice(base(it, unit), c.percent) : base(it, unit);
  };
  const active = items.filter((i) => i.active);
  const categories = lookups.categories.filter((cat) => active.some((i) => i.category === cat));
  const catIndex = (cat: string) => Math.max(0, categories.indexOf(cat));
  const brands = [...new Set(active.map((i) => i.brand).filter((b): b is string => !!b))].sort((a, b) => a.localeCompare(b, "ar"));
  const bag = useShopBag(user.id, id);
  return { user, customer, state: c.state, reload: c.reload, orders: orders.data ?? [], active, categories, catIndex, brands, available, price, base, ...bag };
}

/** How many times this shop ordered each item (its own orders, not cancelled): "what you order most". */
export function orderedCounts(orders: Order[], customerId: number) {
  const n = new Map<number, number>();
  for (const o of orders) if (o.customer_id === customerId && o.status !== "cancelled") for (const l of o.lines) n.set(l.item_id, (n.get(l.item_id) ?? 0) + 1);
  return n;
}

/** A product: its picture, name, packing, price, and the bag (+ / − in place). The whole card opens it. */
export function ProductCard({
  it,
  index,
  price,
  out,
  qty,
  was,
  fav,
  onOpen,
  onAdd,
  onLess,
  onFav,
  className,
  delay = 0,
}: {
  it: Item;
  index: number;
  price: number;
  out: boolean;
  qty?: number;
  fav: boolean;
  /** The usual price, when a clearance shows a lower one (struck through). */
  was?: number;
  onOpen: () => void;
  onAdd: () => void;
  onLess: () => void;
  onFav: () => void;
  className?: string;
  delay?: number;
}) {
  const { tr, money, name, unit, num } = useFmt();
  const u = firstUnit(it);
  const clr = clearanceOn(it, today());
  const daysLeft = clr ? Math.max(0, Math.round((new Date(`${clr.until}T12:00:00`).getTime() - new Date(`${today()}T12:00:00`).getTime()) / 86_400_000)) : 0;
  return (
    <div style={{ animationDelay: `${delay}s` }} className={cn("rise-item box-row relative flex flex-col rounded-3xl border border-line bg-card p-2.5 transition hover:border-action/40 hover:shadow-md", className)}>
      <button
        type="button"
        onClick={onFav}
        aria-pressed={fav}
        aria-label={fav ? tr("أزل من المفضلة", "Remove from favourites") : tr("أضف إلى المفضلة", "Add to favourites")}
        className="absolute end-4 top-4 z-10 flex size-8 items-center justify-center rounded-full bg-card/90 shadow-sm backdrop-blur transition active:scale-90"
      >
        <Heart className={cn("size-4", fav ? "fill-[#e11d48] text-[#e11d48]" : "text-muted")} />
      </button>
      <button type="button" onClick={onOpen} className="box-link-main text-start">
        <span className="relative block">
          <Art category={it.category} index={index} image={it.image} />
          {clr && (
            <span className="absolute start-2 top-2 rounded-full bg-danger px-2 py-0.5 text-[11px] font-bold text-white shadow">
              {tr(`تصريف −${num(clr.percent)}%`, `Clearance −${num(clr.percent)}%`)}
            </span>
          )}
          {it.video && (
            <span className="absolute bottom-2 start-2 flex items-center gap-1 rounded-full bg-black/60 px-2 py-0.5 text-[10px] font-semibold text-white">
              <Play className="size-3 fill-current" /> {tr("فيديو", "Video")}
            </span>
          )}
        </span>
        {it.brand && <span className="mt-2 block truncate px-1 text-[11px] font-semibold text-action">{it.brand}</span>}
        <span className={cn("line-clamp-2 block min-h-10 px-1 text-sm font-bold leading-5", !it.brand && "mt-2")}>{name(it)}</span>
      </button>
      {/* The quantity offer, when one is running */}
      {offerOn(it, today()) && it.offer && (
        <span className="mx-1 mt-1.5 block rounded-lg bg-success-soft px-2 py-1 text-[11px] font-bold leading-4 text-success">
          {tr(`وفّر ${money(it.offer.off)} لكل ${unit(it, it.offer.unit)} عند شراء ${it.offer.min}+`, `Save ${money(it.offer.off)} a ${unit(it, it.offer.unit)} on ${it.offer.min}+`)}
        </span>
      )}
      {/* The packing, as small chips */}
      <span className="mt-1 flex flex-wrap gap-1 px-1">
        <span className="num rounded-md bg-card-2 px-1.5 py-0.5 text-[10px] text-muted">{u === "carton" ? `${it.pieces_per_carton} ${unit(it, "piece", true)}/${unit(it, "carton", true)}` : unit(it, "piece")}</span>
        {it.weight_kg ? <span className="num rounded-md bg-card-2 px-1.5 py-0.5 text-[10px] text-muted">{it.weight_kg} {tr("كغم", "kg")}</span> : null}
      </span>
      <div className="mt-auto flex items-center justify-between gap-1 border-t border-line px-1 pt-2 mt-2">
        <span className="min-w-0">
          <span className={cn("num block text-sm font-bold", clr ? "text-danger" : "text-text")}>{money(price)}</span>
          {clr && was !== undefined && was > price && <span className="num block text-[10px] text-faint line-through">{money(was)}</span>}
          {clr && !out && (
            <span className="flex items-center gap-0.5 text-[10px] font-semibold text-danger">
              <Hourglass className="size-3" />
              {daysLeft === 0 ? tr("آخر يوم", "Last day") : daysLeft === 1 ? tr("ينتهي غداً", "Ends tomorrow") : daysLeft === 2 ? tr("ينتهي خلال يومين", "Ends in 2 days") : tr(`ينتهي خلال ${num(daysLeft)} ${daysLeft <= 10 ? "أيام" : "يوماً"}`, `Ends in ${num(daysLeft)} days`)}
            </span>
          )}
          {out ? <span className="block text-[10px] font-semibold text-danger">{tr("نفد حالياً", "Out for now")}</span> : <span className="block text-[10px] text-muted">/ {unit(it, u)}</span>}
        </span>
        {out ? (
          <NotifyMe item={it} />
        ) : qty ? (
          <span className="relative z-10 flex items-center gap-1" dir="ltr">
            <Round label={tr("أقل", "Less")} onClick={onLess}>
              <Minus className="size-3.5" />
            </Round>
            <span className="num w-5 text-center text-sm font-bold">{qty}</span>
            <Round label={tr("أكثر", "More")} onClick={onAdd} solid>
              <Plus className="size-3.5" />
            </Round>
          </span>
        ) : (
          <Round label={tr(`أضف ${name(it)} إلى السلة`, `Add ${name(it)} to the bag`)} onClick={onAdd} solid big>
            <Plus className="size-4" />
          </Round>
        )}
      </div>
    </div>
  );
}

function Round({ label, onClick, solid, big, children }: { label: string; onClick: () => void; solid?: boolean; big?: boolean; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      className={cn(
        "relative z-10 flex items-center justify-center rounded-xl transition active:scale-90",
        big ? "size-10" : "size-8",
        solid ? "bg-action text-on-action hover:bg-action-hover" : "border border-line-strong bg-card hover:bg-card-2",
      )}
    >
      {children}
    </button>
  );
}

/** The bag, floating above the bottom bar on the other pages: it opens the bag on the home page. */
export function BagPill({ count, total }: { count: number; total: number }) {
  const { tr, money } = useFmt();
  if (!count) return null;
  return (
    <Link
      href="/shop?bag=1"
      className="anim-bag-in fixed inset-x-4 bottom-[calc(80px+env(safe-area-inset-bottom))] z-30 mx-auto flex max-w-md items-center gap-3 rounded-2xl bg-primary px-4 py-3 text-on-primary shadow-2xl"
    >
      <span className="relative">
        <ShoppingBag className="size-6" />
        <span className="num absolute -end-2 -top-2 flex size-5 items-center justify-center rounded-full bg-action text-[11px] font-bold text-on-action">{count}</span>
      </span>
      <span className="flex-1 text-sm font-semibold">{tr("السلة", "Bag")}</span>
      <span className="num text-base font-bold">{money(total)}</span>
    </Link>
  );
}

/** One section's title, with «عرض الكل» to its full list. */
export function RowHead({ title, href, more }: { title: string; href?: string; more?: string }) {
  const { tr } = useFmt();
  return (
    <div className="mb-3 mt-7 flex items-end justify-between gap-3">
      <h2 className="text-lg font-bold">{title}</h2>
      {href && (
        <Link href={href} className="text-sm font-semibold text-muted hover:text-action">
          {more ?? tr("عرض الكل", "See all")}
        </Link>
      )}
    </div>
  );
}

/** "5 مواد" / "12 مادة" / "مادة واحدة": the Arabic plural of "item" for a count. */
export function itemsWord(n: number, tr: (a: string, e: string) => string) {
  if (n === 1) return tr("مادة واحدة", "1 item");
  if (n === 2) return tr("مادتان", "2 items");
  return tr(`${n} ${n >= 3 && n <= 10 ? "مواد" : "مادة"}`, `${n} items`);
}

/** What a bag costs for this shop: each line at its price after the quantity offer. */
export function bagTotal(lines: { item_id: number; unit: Unit; qty: number }[], byId: (id: number) => Item | undefined, price: (it: Item, u: Unit) => number) {
  const day = today();
  return lines.reduce((s, l) => {
    const it = byId(l.item_id);
    return it ? s + afterOffer(price(it, l.unit), it, l.unit, l.qty, day) * l.qty : s;
  }, 0);
}
