"use client";

// The shop owner's store, after the coffee-shop app design Yasser chose for the shop owner:
// a greeting and search at the top, a banner (here: the credit he has left), category chips,
// product cards with a "+" button, a product sheet (carton / piece like the design's sizes),
// and a bag sheet like the design's checkout: address, items, payment summary, "send order".
// Orders go through the same api.createOrder as everywhere else, and keep working without internet.
import Link from "next/link";
import { useAppRouter } from "@/lib/app-path";
import { useCallback, useEffect, useMemo, useState, useSyncExternalStore, type ReactNode } from "react";
import {
  AlertTriangle,
  CreditCard,
  FileText,
  Heart,
  Loader2,
  MapPin,
  Minus,
  Package,
  Pencil,
  Plus,
  Search,
  ShoppingBag,
  Trash2,
  Truck,
  X,
} from "lucide-react";
import { useApp } from "@/components/shell";
import { Dialog, Segmented, Stepper, errorText, useToast, Pager, usePages } from "@/components/ui";
import { api, ApiError } from "@/lib/api";
import { type Customer, type Item, type NewOrder, type Order, type Unit } from "@/lib/api/types";
import { useFmt } from "@/lib/i18n";
import { firstUnit, soldUnits } from "@/lib/units";
import { Art, CatIcon } from "@/components/product-art";
import { EMPTY, parseBag, readFav, readRaw, subscribeBag, subscribeFav, toggleFav, writeBag, type Bag, type Line } from "@/lib/shop-bag";
import { Banners, BrandRow, CategoryTiles, type Slide } from "@/components/shop/home-sections";
import { ProductCard, RowHead, bagTotal, orderedCounts } from "@/components/shop/kit";
import { afterOffer, clearPrice, clearanceOn, offerOff, offerOn } from "@/lib/units";
import { useSite } from "@/lib/site";
import { ListEditor } from "@/components/shop/lists";
import { NotifyMe } from "@/components/shop/notify-me";
import { ReorderCard } from "@/components/reorder";
import { ListChecks, SlidersHorizontal } from "lucide-react";
import { enqueue, isNetworkError } from "@/lib/offline";
import { cn, piecesOf, priceOf, today } from "@/lib/utils";

export function ShopStore({ customer, orders }: { customer: Customer; orders: Order[] }) {
  const { tr, money, name, unit: unitOf } = useFmt();
  const { user, lookups, items, itemById, reloadItems } = useApp();
  const router = useAppRouter();
  const toast = useToast();

  const raw = useSyncExternalStore(subscribeBag, () => readRaw(user.id, customer.id), () => EMPTY);
  const bag = useMemo(() => parseBag(raw), [raw]);
  const setBag = useCallback(
    (u: Bag | ((b: Bag) => Bag)) => writeBag(user.id, customer.id, typeof u === "function" ? u(parseBag(readRaw(user.id, customer.id))) : u),
    [user.id, customer.id],
  );
  const [cat, setCat] = useState("all");
  const [open, setOpen] = useState<Item | null>(null);
  const [bagOpen, setBagOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  // From another page's bag button (/shop?bag=1): the bag opens here.
  useEffect(() => {
    // Reading the address once, after the page shows (the static page has no address of its own).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (new URLSearchParams(window.location.search).get("bag") === "1") setBagOpen(true);
  }, []);
  const site = useSite();
  const [busy, setBusy] = useState(false);

  // Orders come from the main warehouse (the shop doesn't choose; the company does).
  const warehouseId = lookups.warehouses[0].id;
  const available = (it: Item) => it.stock.by_warehouse.find((w) => w.warehouse_id === warehouseId)?.qty ?? 0;
  // His price; with a clearance running («عرض تصريف»), after its discount.
  const basePrice = (it: Item, unit: Unit) => priceOf(it, customer.tier_id, unit);
  const price = (it: Item, unit: Unit) => {
    const c = clearanceOn(it, today());
    return c ? clearPrice(basePrice(it, unit), c.percent) : basePrice(it, unit);
  };

  const favRaw = useSyncExternalStore(subscribeFav, () => readFav(user.id, customer.id), () => "");
  const favs = useMemo(() => new Set(favRaw.split(",").filter(Boolean).map(Number)), [favRaw]);
  // His last order (not cancelled): «اطلب مثل آخر مرة» puts it back in the bag in one tap.
  const last = orders.filter((o) => o.customer_id === customer.id && o.status !== "cancelled" && !o.shipment_of).sort((a, b) => b.created_at.localeCompare(a.created_at))[0];

  const active = items.filter((i) => i.active);
  // In the manager's order (lookups), only the categories that have something to sell.
  const categories = useMemo(() => lookups.categories.filter((c) => items.some((i) => i.active && i.category === c)), [items, lookups.categories]);
  const catIndex = (c: string) => Math.max(0, categories.indexOf(c));
  // His favourites first (in "all"), or only them (the ♥ chip).
  const shown = active
    .filter((i) => cat === "all" || (cat === "fav" ? favs.has(i.id) : i.category === cat))
    .sort((a, b) => Number(favs.has(b.id)) - Number(favs.has(a.id)));

  /** «اطلب مثل آخر مرة»: the last order's items into the bag (what is there now; less if less is left). */
  function orderLikeLast() {
    if (!last) return;
    let added = 0;
    const missing: string[] = [];
    setBag((b) => {
      const lines = [...b.lines];
      for (const l of last.lines) {
        const it = itemById.get(l.item_id);
        // Gone, stopped, or no longer sold in that unit (the manager changed it): named as missing.
        if (!it || !it.active || !soldUnits(it).includes(l.unit)) {
          if (it) missing.push(name(it));
          continue;
        }
        const room = available(it) * (l.unit === "carton" ? 1 : it.pieces_per_carton);
        const qty = Math.min(l.qty, Math.floor(room));
        if (qty <= 0) {
          missing.push(name(it));
          continue;
        }
        const at = lines.findIndex((x) => x.item_id === l.item_id);
        if (at >= 0) lines[at] = { ...lines[at], unit: l.unit, qty: Math.max(lines[at].qty, qty) };
        else lines.push({ item_id: l.item_id, unit: l.unit, qty });
        added++;
      }
      return { ...b, lines };
    });
    toast(added ? "success" : "danger", added ? tr(`أُضيفت ${added} مواد من طلبك الأخير إلى السلة: عدّل الكميات ثم أرسل`, `${added} items from your last order are in the bag`) : tr("مواد طلبك الأخير غير متوفرة الآن", "Your last order's items aren't available now"));
    if (missing.length) toast("danger", tr(`غير متوفرة الآن: ${missing.join("، ")}`, `Not available now: ${missing.join(", ")}`));
    if (added) setBagOpen(true);
  }
  const pg = usePages(shown, 12);

  const lineOf = (id: number) => bag.lines.find((l) => l.item_id === id);
  /**
   * Change one line of the bag: null or 0 removes it, a new item goes at the end, an old one keeps its place.
   * No limit on the size of an order (the company's decision): a big order is carried by more than one
   * vehicle, and stays one order for the shop.
   */
  const setLine = (id: number, line: Omit<Line, "item_id"> | null) => {
    setBag((b) => {
      if (!line || line.qty <= 0) return { ...b, lines: b.lines.filter((l) => l.item_id !== id) };
      const exists = b.lines.some((l) => l.item_id === id);
      return { ...b, lines: exists ? b.lines.map((l) => (l.item_id === id ? { item_id: id, ...line } : l)) : [...b.lines, { item_id: id, ...line }] };
    });
    return true;
  };
  const addOne = (it: Item) => {
    const l = lineOf(it.id);
    setLine(it.id, { unit: l?.unit ?? firstUnit(it), qty: (l?.qty ?? 0) + 1 });
  };

  // After the quantity offers (the server applies the same).
  const total = bagTotal(bag.lines, (id) => itemById.get(id), price);
  const count = bag.lines.reduce((s, l) => s + l.qty, 0);
  const balance = customer.balance ?? 0;
  const limit = customer.debt_limit ?? 0;
  const left = Math.max(0, limit - balance);
  const over = limit > 0 && balance + total > limit;
  const rep = lookups.reps.find((r) => r.id === customer.rep_id);

  async function send() {
    if (!bag.lines.length) return;
    const body: NewOrder = { client_ref: bag.client_ref, customer_id: customer.id, warehouse_id: warehouseId, lines: bag.lines, note: bag.note || undefined };
    setBusy(true);
    const fresh = () => setBag({ lines: [], note: "", client_ref: "" });
    if (bag.edit) {
      try {
        const order = await api.updateOrder(bag.edit.id, { lines: bag.lines, note: bag.note });
        fresh();
        reloadItems();
        setBagOpen(false);
        toast("success", order.status === "needs_approval" ? tr("حُفظ التعديل، وينتظر الطلب موافقة المدير", "Saved. The order waits for the manager") : tr("حُفظ تعديل الطلب", "Your order was changed"));
        router.push(`/orders/${order.id}`);
      } catch (e) {
        if (e instanceof ApiError && e.code === "OUT_OF_STOCK") reloadItems();
        toast("danger", errorText(e, tr));
      } finally {
        setBusy(false);
      }
      return;
    }
    try {
      const order = await api.createOrder(body);
      fresh();
      reloadItems();
      setBagOpen(false);
      toast(
        "success",
        order.status === "needs_approval" ? tr("أُرسل الطلب، وينتظر موافقة المدير لأنه يتجاوز سقف الدين", "Order sent. It waits for the manager because it passes the debt limit") : tr("أُرسل الطلب وحُجزت الكمية", "Order sent and stock reserved"),
      );
      router.push(`/orders/${order.id}`);
    } catch (e) {
      if (isNetworkError(e)) {
        enqueue({ kind: "order", client_ref: body.client_ref, body: { ...body, offline: true, recorded_at: body.recorded_at ?? new Date().toISOString() }, label: `${customer.name} · ${money(total)}`, saved_at: new Date().toISOString() });
        fresh();
        setBagOpen(false);
        toast("primary", tr("لا يوجد إنترنت: حُفظ الطلب على الجوال وسيُرسَل تلقائياً", "No internet: the order is saved on the phone and will send by itself"));
      } else {
        if (e instanceof ApiError && e.code === "OUT_OF_STOCK") reloadItems();
        toast("danger", errorText(e, tr));
      }
    } finally {
      setBusy(false);
    }
  }

  // ----- the home's parts -----
  const catCounts = new Map(categories.map((c) => [c, active.filter((i) => i.category === c).length]));
  const brands = [...new Set(active.map((i) => i.brand).filter((b): b is string => !!b))];
  const inStock = active.filter((i) => available(i) > 0);
  const counts = orderedCounts(orders, customer.id);
  const newest = [...inStock].sort((a, b) => b.id - a.id).slice(0, 10);
  const mostOrdered = [...active].filter((i) => counts.has(i.id)).sort((a, b) => (counts.get(b.id) ?? 0) - (counts.get(a.id) ?? 0)).slice(0, 10);
  const picked = [...active.filter((i) => favs.has(i.id)), ...mostOrdered.filter((i) => !favs.has(i.id))].slice(0, 10);
  // Near-expiry batches at a discount, the soonest to end first.
  const clearing = inStock.filter((i) => clearanceOn(i, today())).sort((a, b) => a.clearance!.until.localeCompare(b.clearance!.until));
  const rows = [
    { key: "clear", title: tr("عروض التصريف", "Clearance"), href: "/search?clear=1", list: clearing },
    { key: "picked", title: tr("مختارات لك", "Picked for you"), href: "/search?fav=1", list: picked },
    { key: "new", title: tr("وصل حديثاً", "Just arrived"), href: "/search?sort=new", list: newest },
    { key: "top", title: tr("الأكثر طلباً عندك", "What you order most"), href: "/search?sort=top", list: mostOrdered },
  ];
  const owed = Math.max(0, customer.balance ?? 0);
  const bigCats = [...categories].sort((a, b) => (catCounts.get(b) ?? 0) - (catCounts.get(a) ?? 0)).slice(0, 2);
  const slides: Slide[] = [
    ...site.banners.filter((b) => b.active).map((banner) => ({ kind: "manager" as const, banner })),
    ...(newest.length ? [{ kind: "new" as const, items: newest.slice(0, 3) }] : []),
    ...(last && !bag.edit ? [{ kind: "last" as const, number: last.number, count: last.lines.length, onClick: orderLikeLast }] : []),
    ...bigCats.map((c) => ({ kind: "category" as const, category: c, count: catCounts.get(c) ?? 0, index: catIndex(c), items: inStock.filter((i) => i.category === c).slice(0, 3) })),
    ...(owed > 0 ? [{ kind: "pay" as const, owed }] : []),
  ];
  const card = (it: Item, i: number, className?: string) => {
    const l = lineOf(it.id);
    return (
      <ProductCard
        key={it.id}
        it={it}
        index={catIndex(it.category)}
        price={price(it, firstUnit(it))}
        was={basePrice(it, firstUnit(it))}
        out={available(it) <= 0}
        qty={l?.qty}
        fav={favs.has(it.id)}
        onOpen={() => setOpen(it)}
        onAdd={() => addOne(it)}
        onLess={() => l && setLine(it.id, { unit: l.unit, qty: l.qty - 1 })}
        onFav={() => toggleFav(user.id, customer.id, it.id)}
        className={className}
        delay={Math.min(i, 12) * 0.03}
      />
    );
  };

  return (
    <div className="mx-auto max-w-5xl pb-28">
      {/* Greeting, like the design's "Hey, …" header */}
      <div className="flex items-center gap-3">
        <span className="flex size-12 items-center justify-center rounded-full bg-primary text-xl font-bold text-on-primary ring-4 ring-primary-soft">{customer.owner_name.trim()[0]}</span>
        <div className="min-w-0 flex-1">
          <p className="text-xs text-muted">{tr("أهلاً بك", "Welcome")}</p>
          <h1 className="truncate text-lg font-bold">{customer.owner_name}</h1>
        </div>
      </div>

      {/* Changing a sent order */}
      {bag.edit && (
        <div className="mt-4 flex items-center gap-3 rounded-2xl border border-action bg-action/10 p-3">
          <Pencil className="size-5 shrink-0 text-action" />
          <p className="min-w-0 flex-1 text-sm">
            {tr("تعدّل الطلب", "Changing order")}{" "}
            <b className="num" dir="ltr">
              {bag.edit.number}
            </b>
            {tr(": غيّر الكميات أو أضف مواد، ثم احفظ من السلة.", ": change amounts or add items, then save from the bag.")}
          </p>
          <button type="button" onClick={() => setBag({ lines: [], note: "", client_ref: "" })} className="shrink-0 rounded-lg px-2 py-1 text-xs font-semibold text-muted hover:bg-card-2 hover:text-text">
            {tr("إلغاء التعديل", "Stop changing")}
          </button>
        </div>
      )}

      {/* Search: the search page (with its filters) */}
      <div className="mt-4 flex gap-2">
        <Link href="/search" className="flex h-12 min-w-0 flex-1 items-center gap-2 rounded-2xl border border-line-strong bg-card px-4 text-faint transition hover:border-action">
          <Search className="size-5" />
          <span className="truncate text-base">{tr("ابحث عن مادة أو علامة تجارية", "Search an item or a brand")}</span>
        </Link>
        <Link href="/search?filters=1" aria-label={tr("تصفية البحث", "Search filters")} className="flex size-12 shrink-0 items-center justify-center rounded-2xl border border-line-strong bg-card text-muted transition hover:border-action hover:text-action">
          <SlidersHorizontal className="size-5" />
        </Link>
      </div>

      {/* The ads: the manager's own first, then ours (new arrivals, last order, a category, paying online) */}
      <Banners slides={slides} catIndex={catIndex} />

      {/* The banner: in the design it's a discount; for a wholesale shop the useful thing is the credit left */}
      <div className="rise-item brand-panel relative mt-4 overflow-hidden rounded-3xl p-5 sm:p-6">
        <div className="brand-grid absolute inset-0" aria-hidden />
        <div className="relative flex items-center justify-between gap-4">
          <div className="min-w-0">
            <p className="text-sm opacity-80">{tr("المتاح لك للطلب", "Credit you have left")}</p>
            <p className="num mt-1 text-3xl font-bold sm:text-4xl">{money(left)}</p>
            <p className="num mt-1 text-xs opacity-75">
              {tr("دينك", "Your debt")} {money(balance)} · {tr("السقف", "Limit")} {money(limit)}
            </p>
            <div className="mt-3 h-1.5 w-56 max-w-full overflow-hidden rounded-full bg-white/15">
              <div className="h-full rounded-full bg-[#f5b48a]" style={{ width: `${limit ? Math.min(100, (balance / limit) * 100) : 0}%` }} />
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              <Link href="/statement" className="inline-flex items-center gap-1.5 rounded-full bg-action px-4 py-2 text-sm font-bold text-on-action transition hover:bg-action-hover">
                <FileText className="size-4" /> {tr("كشف حسابي", "My statement")}
              </Link>
              {balance > 0 && (
                <Link href="/statement" className="inline-flex items-center gap-1.5 rounded-full bg-[#f7c600] px-4 py-2 text-sm font-bold text-black transition hover:brightness-95">
                  <CreditCard className="size-4" /> {tr("ادفع أونلاين", "Pay online")}
                </Link>
              )}
            </div>
          </div>
          <ShoppingBag className="hidden size-28 shrink-0 rotate-[-8deg] text-[#f5b48a] opacity-90 sm:block" strokeWidth={1.2} />
        </div>
        <div className="hazard absolute inset-x-0 bottom-0 h-1.5" aria-hidden />
      </div>

      <RowHead title={tr("تصفّح الأقسام", "Browse the sections")} />
      <CategoryTiles
        categories={categories}
        counts={catCounts}
        catIndex={catIndex}
        onPick={(c) => {
          setCat(c);
          document.getElementById("all-items")?.scrollIntoView({ behavior: "smooth", block: "start" });
        }}
      />
      {/* «قارب ينفد عندك؟»: what he usually orders again about now */}
      {!bag.edit && <ReorderCard available={available} inBag={(id) => !!lineOf(id)} onAdd={(it, unit, qty) => setLine(it.id, { unit, qty })} />}

      {brands.length > 0 && (
        <>
          <RowHead title={tr("العلامات التجارية", "Brands")} href="/search?by=brand" />
          <BrandRow brands={brands} />
        </>
      )}
      {rows.map((r) =>
        r.list.length ? (
          <div key={r.key}>
            <RowHead title={r.title} href={r.href} />
            {/* A strip to swipe on phones; on a computer two full rows (nothing cut at the edge) */}
            <div className="-mx-3 flex snap-x gap-3 overflow-x-auto px-3 pb-2 [scrollbar-width:none] sm:-mx-5 sm:px-5 md:mx-0 md:grid md:grid-cols-4 md:overflow-visible md:px-0 lg:grid-cols-5">
              {r.list.map((it, i) => card(it, i, "w-44 shrink-0 snap-start sm:w-52 md:w-auto"))}
            </div>
          </div>
        ) : null,
      )}

      <div id="all-items" className="scroll-mt-20">
        <RowHead title={tr("كل المواد", "All items")} href="/search" more={tr("ابحث وصفِّ", "Search and filter")} />
      </div>
      {/* Category chips */}
      <div className="-mx-3 sm:-mx-5 flex gap-2 overflow-x-auto px-3 pb-1 sm:px-5 [scrollbar-width:none]">
        {["all", ...(favs.size ? ["fav"] : []), ...categories].map((c) => {
          const on = cat === c;
          return (
            <button
              key={c}
              type="button"
              onClick={() => setCat(c)}
              aria-pressed={on}
              className={cn("flex shrink-0 items-center gap-1.5 rounded-full border px-4 py-2 text-sm font-semibold transition", on ? "border-primary bg-primary text-on-primary" : "border-line-strong bg-card hover:bg-card-2")}
            >
              {c === "all" ? <Package className="size-4" /> : c === "fav" ? <Heart className="size-4 fill-current" /> : <CatIcon category={c} className="size-4" />}{" "}
              {c === "all" ? tr("الكل", "All") : c === "fav" ? tr(`المفضلة (${favs.size})`, `Favourites (${favs.size})`) : c}
            </button>
          );
        })}
      </div>

      {/* Products */}
      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">{pg.shown.map((it, i) => card(it, i))}</div>
      <Pager {...pg} sizes={[12, 24, 48]} className="mt-3" />
      {!shown.length && <p className="mt-10 text-center text-sm text-muted">{tr("لا توجد مادة بهذا الاسم", "No item by that name")}</p>}

      {/* The floating bag bar */}
      {count > 0 && !bagOpen && (
          <button
            type="button"
            onClick={() => setBagOpen(true)}
            className="anim-bag-in fixed inset-x-4 bottom-[calc(76px+env(safe-area-inset-bottom))] z-30 mx-auto flex max-w-md items-center gap-3 rounded-2xl bg-primary px-4 py-3 text-on-primary shadow-2xl"
          >
            <span className="relative">
              <ShoppingBag className="size-6" />
              <span className="num absolute -end-2 -top-2 flex size-5 items-center justify-center rounded-full bg-action text-[11px] font-bold text-on-action">{count}</span>
            </span>
            <span className="flex-1 text-start text-sm font-semibold">{tr("السلة", "Bag")}</span>
            <span className="num text-base font-bold">{money(total)}</span>
          </button>
        )}

      {saving && (
        <ListEditor
          initial={bag.lines.map(({ item_id, unit, qty }) => ({ item_id, unit, qty }))}
          onClose={() => setSaving(false)}
          onSaved={() => setSaving(false)}
        />
      )}

      {open && (
        <ItemSheet
          key={open.id}
          item={open}
          index={catIndex(open.category)}
          // Same kind: the same category, what is in stock first, the shop's favourites before the rest.
          similar={active
            .filter((i) => i.category === open.category && i.id !== open.id)
            .sort((a, b) => Number(available(b) > 0) - Number(available(a) > 0) || Number(favs.has(b.id)) - Number(favs.has(a.id)))
            .slice(0, 10)}
          priceOf={(it) => price(it, firstUnit(it))}
          inBag={(id) => !!lineOf(id)}
          onOpen={setOpen}
          line={lineOf(open.id)}
          available={available(open)}
          price={(u) => price(open, u)}
          onClose={() => setOpen(null)}
          onSave={(line) => {
            if (setLine(open.id, line)) setOpen(null);
          }}
        />
      )}

      <Dialog
        open={bagOpen}
        onClose={() => setBagOpen(false)}
        title={tr("سلتي", "My bag")}
        footer={
          <button
            type="button"
            disabled={!bag.lines.length || busy}
            onClick={send}
            className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-action text-base font-bold text-on-action transition hover:bg-action-hover disabled:opacity-50"
          >
            {busy ? <Loader2 className="size-5 animate-spin" /> : <Truck className="size-5" />}
            {bag.edit ? tr("احفظ التعديل", "Save the change") : tr("أرسل الطلب", "Send the order")} · <span className="num">{money(total)}</span>
          </button>
        }
      >
        <div className="space-y-4">
          {/* Delivery, like the design's address block */}
          <div className="rounded-2xl border border-line p-3">
            <p className="text-xs font-semibold text-muted">{tr("التوصيل إلى", "Deliver to")}</p>
            <p className="mt-1 flex items-center gap-1.5 text-sm font-bold">
              <MapPin className="size-4 text-action" /> {customer.name}
            </p>
            <p className="text-xs text-muted">{customer.address || customer.area}</p>
            {rep && (
              <p className="mt-2 flex items-center gap-1.5 text-xs text-muted">
                <Truck className="size-3.5" /> {tr("مندوبك", "Your rep")}: {rep.name}
              </p>
            )}
            <input
              value={bag.note}
              onChange={(e) => setBag((b) => ({ ...b, note: e.target.value }))}
              placeholder={tr("أضف ملاحظة للمخزن (اختياري)", "Add a note for the warehouse (optional)")}
              className="mt-3 h-10 w-full rounded-xl border border-line bg-card-2 px-3 text-sm outline-none focus:border-action"
            />
          </div>

          {/* Keep this bag as a list («قوائمي»), to send it again another day in one tap */}
          {bag.lines.length > 0 && (
            <button type="button" onClick={() => setSaving(true)} className="flex w-full items-center justify-center gap-1.5 rounded-xl border border-dashed border-line-strong py-2 text-sm font-semibold text-muted hover:border-action hover:text-action">
              <ListChecks className="size-4" /> {tr("احفظ السلة كقائمة", "Save the bag as a list")}
            </button>
          )}

          {/* Items */}
          <ul className="space-y-2">
            {bag.lines.map((l) => {
              const it = itemById.get(l.item_id);
              if (!it) return null;
              return (
                <li key={l.item_id} className="flex items-center gap-3 rounded-2xl border border-line p-2">
                  <div className="w-16 shrink-0">
                    <Art category={it.category} index={catIndex(it.category)} image={it.image} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-bold">{name(it)}</p>
                    <p className="num text-xs text-muted">
                      {offerOff(it, l.unit, l.qty, today()) > 0 && <s className="me-1 opacity-70">{money(price(it, l.unit))}</s>}
                      {money(afterOffer(price(it, l.unit), it, l.unit, l.qty, today()))} / {unitOf(it, l.unit)}
                    </p>
                    {offerOff(it, l.unit, l.qty, today()) > 0 ? (
                      <p className="text-[11px] font-semibold text-success">{tr(`وفّرت ${money(offerOff(it, l.unit, l.qty, today()) * l.qty)}`, `You save ${money(offerOff(it, l.unit, l.qty, today()) * l.qty)}`)}</p>
                    ) : it.offer && offerOn(it, today()) && it.offer.unit === l.unit && l.qty < it.offer.min ? (
                      <p className="text-[11px] text-muted">{tr(`أضف ${it.offer.min - l.qty} لتوفّر ${money(it.offer.off)} على كل ${unitOf(it, l.unit)}`, `Add ${it.offer.min - l.qty} to save ${money(it.offer.off)} each`)}</p>
                    ) : null}
                  </div>
                  <span className="flex items-center gap-1" dir="ltr">
                    <RoundBtn label={tr("أقل", "Less")} onClick={() => setLine(it.id, { unit: l.unit, qty: l.qty - 1 })}>
                      {l.qty === 1 ? <Trash2 className="size-3.5" /> : <Minus className="size-3.5" />}
                    </RoundBtn>
                    <span className="num w-6 text-center text-sm font-bold">{l.qty}</span>
                    <RoundBtn label={tr("أكثر", "More")} onClick={() => setLine(it.id, { unit: l.unit, qty: l.qty + 1 })} solid>
                      <Plus className="size-3.5" />
                    </RoundBtn>
                  </span>
                </li>
              );
            })}
            {!bag.lines.length && <li className="py-6 text-center text-sm text-muted">{tr("السلة فارغة", "The bag is empty")}</li>}
          </ul>

          {/* Payment summary */}
          <div className="rounded-2xl bg-card-2 p-3 text-sm">
            <p className="mb-2 font-bold">{tr("ملخص الطلب", "Order summary")}</p>
            <Row k={tr("مجموع الطلب", "Order total")} v={money(total)} />
            <Row k={tr("دينك الحالي", "Your current debt")} v={money(balance)} />
            <Row k={tr("دينك بعد الطلب", "Debt after this order")} v={money(balance + total)} strong tone={over ? "danger" : undefined} />
            <Row k={tr("سقف الدين", "Debt limit")} v={money(limit)} />
            {over && (
              <p className="mt-2 flex items-start gap-1.5 rounded-xl bg-warning-soft p-2 text-xs text-warning">
                <AlertTriangle className="mt-0.5 size-3.5 shrink-0" /> {tr("الطلب يتجاوز سقف دينك: سيُرسَل ويحتاج موافقة المدير قبل التجهيز", "This order passes your debt limit: it will be sent and needs the manager's approval")}
              </p>
            )}
          </div>
        </div>
      </Dialog>
    </div>
  );
}

function RoundBtn({ label, onClick, solid, children }: { label: string; onClick: () => void; solid?: boolean; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      className={cn("flex size-8 items-center justify-center rounded-full transition active:scale-[0.85]", solid ? "bg-action text-on-action hover:bg-action-hover" : "border border-line-strong bg-card hover:bg-card-2")}
    >
      {children}
    </button>
  );
}

function Row({ k, v, strong, tone }: { k: string; v: string; strong?: boolean; tone?: "danger" }) {
  return (
    <div className={cn("flex items-center justify-between py-1", strong && "border-t border-line pt-2 font-bold", tone === "danger" && "text-danger")}>
      <span className={strong ? "" : "text-muted"}>{k}</span>
      <span className="num">{v}</span>
    </div>
  );
}

/** The product sheet: like the design's detail screen, with carton / piece in place of S / M / L. A big
 *  picture (a tap shows it on the whole screen), the item's details, and items of the same kind under it
 *  (a tap opens one here). */
export function ItemSheet({
  item,
  index,
  line,
  available,
  price,
  base,
  onClose,
  onSave,
  similar,
  priceOf: priceOfItem,
  inBag,
  onOpen,
}: {
  item: Item;
  index: number;
  line?: Line;
  available: number;
  similar: Item[];
  priceOf: (it: Item) => number;
  inBag: (id: number) => boolean;
  onOpen: (it: Item) => void;
  /** How much more the order can take (the limit minus the other lines). */
  price: (u: Unit) => number;
  /** The usual price (with a clearance running, `price` is the lower one). */
  base?: (u: Unit) => number;
  onClose: () => void;
  onSave: (line: Omit<Line, "item_id"> | null) => void;
}) {
  const { tr, money, name, qty: fmtQty, unit: unitOf, date } = useFmt();
  const [unit, setUnit] = useState<Unit>(line?.unit ?? firstUnit(item));
  const [zoom, setZoom] = useState(false);
  const details: [string, ReactNode][] = [
    [tr("الصنف", "Category"), item.category],
    [tr("التعبئة", "Packing"), soldUnits(item).includes("carton") || item.pieces_per_carton > 1 ? `${unitOf(item, "carton")} = ${item.pieces_per_carton} ${unitOf(item, "piece")}` : unitOf(item, "piece")],
    [tr("يُباع بـ", "Sold by"), soldUnits(item).map((u) => unitOf(item, u)).join(tr(" و", " and "))],
    ...(item.weight_kg ? ([[tr("الوزن", "Weight"), `${item.weight_kg} ${tr("كغم", "kg")} / ${unitOf(item, "piece")}`]] as [string, ReactNode][]) : []),
    ...(item.nearest_expiry ? ([[tr("صالح حتى", "Good until"), date(item.nearest_expiry)]] as [string, ReactNode][]) : []),
    ...(item.barcode
      ? ([
          [
            tr("الباركود", "Barcode"),
            <span key="b" className="num" dir="ltr">
              {item.barcode}
            </span>,
          ],
        ] as [string, ReactNode][])
      : []),
  ];
  const [n, setN] = useState(line?.qty ?? 1);
  // What is in stock, and never more than what is left of the order's limit.
  const max = unit === "carton" ? Math.floor(available / item.pieces_per_carton) : available;
  const tooMuch = piecesOf(item, unit, n) > available;
  // A clearance: its price for what is left of the batch; a bigger amount is all at the usual price.
  const clr = clearanceOn(item, today());
  const overClear = !!clr && piecesOf(item, unit, n) > clr.left;
  const unitPrice = overClear && base ? base(unit) : price(unit);
  return (
    <Dialog
      open
      onClose={onClose}
      title={name(item)}
      footer={
        <div className="flex w-full items-center gap-3">
          <div className="min-w-0">
            <p className="text-[11px] text-muted">{tr("السعر", "Price")}</p>
            <p className="num text-lg font-bold">{money(afterOffer(unitPrice, item, unit, n, today()) * n)}</p>
          </div>
          {/* Out of stock (and not in the bag): «أعلمني عند التوفر» instead of adding. */}
          {available <= 0 && !line ? (
            <NotifyMe item={item} size="lg" />
          ) : (
            <button
              type="button"
              disabled={n < 1 || tooMuch}
              onClick={() => onSave({ unit, qty: n })}
              className="flex h-12 flex-1 items-center justify-center gap-2 rounded-xl bg-action text-base font-bold text-on-action transition hover:bg-action-hover disabled:opacity-50"
            >
              <ShoppingBag className="size-5" /> {line ? tr("تحديث السلة", "Update bag") : tr("أضف إلى السلة", "Add to bag")}
            </button>
          )}
        </div>
      }
    >
      {/* The picture, big; a tap shows it on the whole screen (a real photo). */}
      <button type="button" onClick={() => item.image && setZoom(true)} className={cn("block w-full", item.image ? "cursor-zoom-in" : "cursor-default")} aria-label={item.image ? tr("كبّر الصورة", "Enlarge the picture") : name(item)}>
        <Art category={item.category} index={index} image={item.image} size="xl" />
      </button>
      {zoom && item.image && (
        <button type="button" onClick={() => setZoom(false)} className="fixed inset-0 z-[90] flex items-center justify-center bg-black/90 p-4" aria-label={tr("إغلاق الصورة", "Close the picture")}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={item.image} alt={name(item)} className="max-h-full max-w-full rounded-2xl object-contain" />
          <X className="absolute end-4 top-4 size-8 text-white" />
        </button>
      )}
      <div className="mt-4 flex items-start justify-between gap-3">
        <div>
          <p className="text-lg font-bold">{name(item)}</p>
          <p className="text-sm text-muted">{item.category}</p>
        </div>
        <span className={cn("shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold", available > 0 ? "bg-success-soft text-success" : "bg-danger-soft text-danger")}>
          {available > 0 ? tr("متوفر", "In stock") : tr("نفد", "Out of stock")}
        </span>
      </div>
      <p className="mt-3 text-sm text-muted">
        {soldUnits(item).includes("carton") && tr(`${unitOf(item, "carton")} فيه ${item.pieces_per_carton} ${unitOf(item, "piece")}. `, `A ${unitOf(item, "carton")} has ${item.pieces_per_carton} ${unitOf(item, "piece")}. `)}
        {tr(`المتوفر الآن ${fmtQty(available, item.pieces_per_carton, item)}.`, `Available now: ${fmtQty(available, item.pieces_per_carton, item)}.`)}
      </p>
      {clr && (
        <div className="mt-3 rounded-2xl border border-danger/30 bg-danger-soft p-3 text-sm text-danger">
          <p className="font-bold">
            {tr(`عرض تصريف: خصم ${clr.percent}% حتى ${date(clr.until)}`, `Clearance: ${clr.percent}% off until ${date(clr.until)}`)}
            {base && (
              <span className="num ms-2 font-normal text-faint line-through">
                {money(base(unit))}
              </span>
            )}
          </p>
          <p className="mt-0.5 text-xs">
            {overClear
              ? tr(`الخصم لـ ${fmtQty(clr.left, item.pieces_per_carton, item)} فقط؛ هذه الكمية كلها بالسعر العادي.`, `The discount is for ${fmtQty(clr.left, item.pieces_per_carton, item)} only; this amount is all at the usual price.`)
              : tr(`لكمية محدودة: باقي ${fmtQty(clr.left, item.pieces_per_carton, item)} بهذا السعر.`, `Limited: ${fmtQty(clr.left, item.pieces_per_carton, item)} left at this price.`)}
          </p>
        </div>
      )}

      <p className="mt-4 text-sm font-bold">{tr("الوحدة", "Unit")}</p>
      {soldUnits(item).length > 1 ? (
        <Segmented
          className="mt-2 w-full"
          value={unit}
          onChange={(u) => {
            setUnit(u);
            setN(1);
          }}
          options={soldUnits(item).map((u) => ({ value: u, label: `${unitOf(item, u)} · ${money(price(u))}` }))}
        />
      ) : (
        <p className="mt-2 text-sm">
          {unitOf(item, unit)} · <span className="num font-semibold">{money(price(unit))}</span>
        </p>
      )}

      {item.offer && offerOn(item, today()) && (
        <p className="mt-3 rounded-xl bg-success-soft px-3 py-2 text-sm font-semibold text-success">
          {tr(`عرض: وفّر ${money(item.offer.off)} لكل ${unitOf(item, item.offer.unit)} عند شراء ${item.offer.min} فأكثر`, `Offer: save ${money(item.offer.off)} a ${unitOf(item, item.offer.unit)} on ${item.offer.min} or more`)}
          {item.offer.until && <span className="block text-xs font-normal">{tr(`حتى ${item.offer.until}`, `Until ${item.offer.until}`)}</span>}
        </p>
      )}
      <div className="mt-4 flex items-center justify-between gap-3">
        <p className="text-sm font-bold">{tr("الكمية", "Quantity")}</p>
        <Stepper value={n} onChange={setN} min={1} max={Math.max(1, max)} />
      </div>
      {line && (
        <button type="button" onClick={() => onSave(null)} className="mt-3 flex items-center gap-1.5 text-xs font-semibold text-danger">
          <Trash2 className="size-3.5" /> {tr("احذف من السلة", "Remove from bag")}
        </button>
      )}

      {/* The details */}
      <h3 className="mt-5 text-sm font-bold">{tr("تفاصيل المادة", "Details")}</h3>
      <dl className="mt-2 divide-y divide-line rounded-2xl border border-line">
        {details.map(([k, v]) => (
          <div key={k} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
            <dt className="text-muted">{k}</dt>
            <dd className="text-end font-medium">{v}</dd>
          </div>
        ))}
      </dl>

      {/* Of the same kind: a row to swipe; a tap opens it in this window */}
      {similar.length > 0 && (
        <>
          <h3 className="mt-5 text-sm font-bold">{tr(`من نفس النوع · ${item.category}`, `Of the same kind · ${item.category}`)}</h3>
          <ul className="-mx-1 mt-2 flex snap-x gap-2.5 overflow-x-auto px-1 pb-2 [scrollbar-width:thin]">
            {similar.map((it) => (
              <li key={it.id} className="w-32 shrink-0 snap-start">
                <button type="button" onClick={() => onOpen(it)} className="block w-full rounded-2xl border border-line bg-card p-1.5 text-start transition hover:border-action active:scale-[0.98]">
                  <Art category={it.category} index={index} image={it.image} size="sm" />
                  <span className="mt-1.5 line-clamp-2 block min-h-8 px-0.5 text-xs font-semibold leading-4">{name(it)}</span>
                  <span className="mt-1 flex items-center justify-between px-0.5">
                    <span className="num text-xs font-bold">{money(priceOfItem(it))}</span>
                    {inBag(it.id) && <ShoppingBag className="size-3.5 text-action" aria-label={tr("في السلة", "In the bag")} />}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
    </Dialog>
  );
}
