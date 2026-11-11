"use client";

// The shop owner's store, after the coffee-shop app design Yasser chose for the shop owner:
// a greeting and search at the top, a banner (here: the credit he has left), category chips,
// product cards with a "+" button, a product sheet (carton / piece like the design's sizes),
// and a bag sheet like the design's checkout: address, items, payment summary, "send order".
// Orders go through the same api.createOrder as everywhere else, and keep working without internet.
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useMemo, useState, useSyncExternalStore } from "react";
import { AnimatePresence, motion } from "motion/react";
import {
  AlertTriangle,
  Candy,
  CreditCard,
  Croissant,
  CupSoda,
  Droplets,
  FileText,
  Leaf,
  Loader2,
  MapPin,
  Milk,
  Minus,
  Package,
  Pencil,
  Plus,
  Search,
  ShoppingBag,
  Soup,
  Trash2,
  Truck,
  Wheat,
} from "lucide-react";
import { useApp } from "@/components/shell";
import { Dialog, Segmented, Stepper, errorText, useToast, Pager, usePages } from "@/components/ui";
import { api, ApiError } from "@/lib/api";
import { SHOP_MAX_QTY, orderCount, type Customer, type Item, type NewOrder, type Unit } from "@/lib/api/types";
import { useFmt } from "@/lib/i18n";
import { enqueue, isNetworkError, newClientRef } from "@/lib/offline";
import { cn, matches, piecesOf, priceOf } from "@/lib/utils";

// ---------- How an item looks: its photo, or (no photo yet) a colored tile with the category icon ----------
const KINDS = [/حبوب|رز/, /سكر|طحين/, /زيوت|سمن/, /معلبات/, /مشروبات/, /ألبان/, /حلويات/, /بهارات/];
const ACCENTS = ["#e1692b", "#c99a2e", "#4f8a5b", "#3f6f9e", "#b4533c", "#8a6bb0", "#2f8f8a", "#9a7b4f"];

/** The icon of a category. A switch with fixed icons (not "pick a component, then render it"),
 *  because React wants every component to be known before rendering. */
function CatIcon({ category, ...props }: { category: string; className?: string; style?: React.CSSProperties; strokeWidth?: number }) {
  switch (KINDS.findIndex((re) => re.test(category))) {
    case 0:
      return <Wheat {...props} />;
    case 1:
      return <Croissant {...props} />;
    case 2:
      return <Droplets {...props} />;
    case 3:
      return <Soup {...props} />;
    case 4:
      return <CupSoda {...props} />;
    case 5:
      return <Milk {...props} />;
    case 6:
      return <Candy {...props} />;
    case 7:
      return <Leaf {...props} />;
    default:
      return <Package {...props} />;
  }
}

/** The colored tile: the accent mixed into the card color, so it works in day and night mode. */
function Art({ category, index, image, size = "md" }: { category: string; index: number; image?: string; size?: "md" | "lg" }) {
  const accent = ACCENTS[index % ACCENTS.length];
  // The real photo, when the manager or the warehouse keeper added one.
  if (image)
    return (
      <div className={cn("overflow-hidden rounded-2xl bg-card-2", size === "lg" ? "h-48" : "aspect-[4/3]")}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={image} alt="" loading="lazy" className="size-full object-cover" />
      </div>
    );
  return (
    <div
      className={cn("relative flex items-center justify-center overflow-hidden rounded-2xl", size === "lg" ? "h-48" : "aspect-[4/3]")}
      style={{ background: `radial-gradient(circle at 30% 25%, color-mix(in oklab, ${accent} 30%, var(--card)), color-mix(in oklab, ${accent} 12%, var(--card)) 70%)` }}
    >
      <span className="absolute -bottom-6 -end-6 size-24 rounded-full opacity-25" style={{ background: accent }} aria-hidden />
      <CatIcon category={category} className={size === "lg" ? "size-20" : "size-12"} style={{ color: accent }} strokeWidth={1.5} />
    </div>
  );
}

// ---------- The bag (saved on the phone, so nothing is lost if the page closes) ----------
interface Line {
  item_id: number;
  unit: Unit;
  qty: number;
}
interface Bag {
  lines: Line[];
  note: string;
  client_ref: string;
  /** Changing an order that was sent but isn't confirmed yet: "send" saves the change to it. */
  edit?: { id: number; number: string };
}

/** From the order page: put the order's lines into the bag, to change them in the store. */
export function editOrderInBag(userId: number, customerId: number, order: { id: number; number: string; lines: Line[]; note?: string }) {
  const bag: Bag = { lines: order.lines.map(({ item_id, unit, qty }) => ({ item_id, unit, qty })), note: order.note ?? "", client_ref: newClientRef(), edit: { id: order.id, number: order.number } };
  writeBag(userId, customerId, bag);
}

// The bag lives on the phone (localStorage) and the page only reads it, so it is the same everywhere: after
// "change the order" on the order page, and when Next shows a store page it kept in memory.
const BAG_EVENT = "nahrain-bag";
// One bag per shop: an owner of two shops fills each one on its own (their prices can differ too).
const bagKey = (userId: number, customerId: number) => `nahrain.shopbag.${userId}.${customerId}`;
const EMPTY = "";
function readRaw(userId: number, customerId: number) {
  try {
    return localStorage.getItem(bagKey(userId, customerId)) ?? EMPTY;
  } catch {
    return EMPTY;
  }
}
function parseBag(raw: string): Bag {
  try {
    if (raw) return JSON.parse(raw) as Bag;
  } catch {}
  return { lines: [], note: "", client_ref: "" };
}
function writeBag(userId: number, customerId: number, bag: Bag) {
  // The order's id for "sent twice" is made with the bag's first line, and kept until it is sent.
  const next = bag.lines.length && !bag.client_ref ? { ...bag, client_ref: newClientRef() } : bag;
  try {
    if (next.lines.length || next.note || next.edit) localStorage.setItem(bagKey(userId, customerId), JSON.stringify(next));
    else localStorage.removeItem(bagKey(userId, customerId));
  } catch {}
  window.dispatchEvent(new Event(BAG_EVENT));
}
function subscribeBag(cb: () => void) {
  window.addEventListener(BAG_EVENT, cb);
  window.addEventListener("storage", cb);
  return () => {
    window.removeEventListener(BAG_EVENT, cb);
    window.removeEventListener("storage", cb);
  };
}

export function ShopStore({ customer }: { customer: Customer }) {
  const { tr, money, name } = useFmt();
  const { user, lookups, items, itemById, reloadItems } = useApp();
  const router = useRouter();
  const toast = useToast();

  const raw = useSyncExternalStore(subscribeBag, () => readRaw(user.id, customer.id), () => EMPTY);
  const bag = useMemo(() => parseBag(raw), [raw]);
  const setBag = useCallback(
    (u: Bag | ((b: Bag) => Bag)) => writeBag(user.id, customer.id, typeof u === "function" ? u(parseBag(readRaw(user.id, customer.id))) : u),
    [user.id, customer.id],
  );
  const [q, setQ] = useState("");
  const [cat, setCat] = useState("all");
  const [open, setOpen] = useState<Item | null>(null);
  const [bagOpen, setBagOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  // Orders come from the main warehouse (the shop doesn't choose; the company does).
  const warehouseId = lookups.warehouses[0].id;
  const available = (it: Item) => it.stock.by_warehouse.find((w) => w.warehouse_id === warehouseId)?.qty ?? 0;
  const price = (it: Item, unit: Unit) => priceOf(it, customer.tier_id, unit);

  const active = items.filter((i) => i.active);
  const categories = useMemo(() => [...new Set(items.filter((i) => i.active).map((i) => i.category))], [items]);
  const catIndex = (c: string) => Math.max(0, categories.indexOf(c));
  const shown = active.filter((i) => (cat === "all" || i.category === cat) && matches(q, i.name, i.name_en, i.barcode));
  const pg = usePages(shown, 12);

  const lineOf = (id: number) => bag.lines.find((l) => l.item_id === id);
  /** Change one line of the bag: null or 0 removes it, a new item goes at the end, an old one keeps its place. */
  const tooBig = () =>
    toast("danger", tr(`الحد الأعلى للطلب الواحد ${SHOP_MAX_QTY} (كل المواد معاً). للكميات الأكبر تواصل مع مندوبك.`, `Up to ${SHOP_MAX_QTY} in one order (all items together). For more, contact your rep.`));
  /** Change one line of the bag: null or 0 removes it. More than the order limit in all is refused. */
  const setLine = (id: number, line: Omit<Line, "item_id"> | null) => {
    if (line && line.qty > 0 && orderCount(bag.lines.filter((l) => l.item_id !== id)) + line.qty > SHOP_MAX_QTY) {
      tooBig();
      return false;
    }
    setBag((b) => {
      if (!line || line.qty <= 0) return { ...b, lines: b.lines.filter((l) => l.item_id !== id) };
      const exists = b.lines.some((l) => l.item_id === id);
      return { ...b, lines: exists ? b.lines.map((l) => (l.item_id === id ? { item_id: id, ...line } : l)) : [...b.lines, { item_id: id, ...line }] };
    });
    return true;
  };
  const addOne = (it: Item) => {
    const l = lineOf(it.id);
    setLine(it.id, { unit: l?.unit ?? "carton", qty: (l?.qty ?? 0) + 1 });
  };

  const total = bag.lines.reduce((s, l) => {
    const it = itemById.get(l.item_id);
    return it ? s + price(it, l.unit) * l.qty : s;
  }, 0);
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

      {/* Search */}
      <div className="mt-4 flex h-12 items-center gap-2 rounded-2xl border border-line-strong bg-card px-4 focus-within:border-action focus-within:ring-4 focus-within:ring-action/15">
        <Search className="size-5 text-faint" />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={tr("ابحث عن مادة", "Search for an item")} className="h-full flex-1 bg-transparent text-base outline-none placeholder:text-faint" />
      </div>

      {/* The banner: in the design it's a discount; for a wholesale shop the useful thing is the credit left */}
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="brand-panel relative mt-4 overflow-hidden rounded-3xl p-5 sm:p-6">
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
      </motion.div>

      {/* Category chips */}
      <div className="-mx-4 mt-5 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none]">
        {["all", ...categories].map((c) => {
          const on = cat === c;
          return (
            <button
              key={c}
              type="button"
              onClick={() => setCat(c)}
              aria-pressed={on}
              className={cn("flex shrink-0 items-center gap-1.5 rounded-full border px-4 py-2 text-sm font-semibold transition", on ? "border-primary bg-primary text-on-primary" : "border-line-strong bg-card hover:bg-card-2")}
            >
              {c === "all" ? <Package className="size-4" /> : <CatIcon category={c} className="size-4" />} {c === "all" ? tr("الكل", "All") : c}
            </button>
          );
        })}
      </div>

      {/* Products */}
      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {pg.shown.map((it, i) => {
          const l = lineOf(it.id);
          const out = available(it) <= 0;
          return (
            <motion.div key={it.id} layout initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: Math.min(i, 12) * 0.03 }} className="flex flex-col rounded-3xl border border-line bg-card p-2.5">
              <button type="button" onClick={() => setOpen(it)} className="text-start">
                <Art category={it.category} index={catIndex(it.category)} image={it.image} />
                <p className="mt-2 line-clamp-2 min-h-10 px-1 text-sm font-bold leading-5">{name(it)}</p>
                <p className="px-1 text-[11px] text-muted">
                  {tr("كارتون", "Carton")} · {it.pieces_per_carton} {tr("قطعة", "pcs")}
                </p>
              </button>
              <div className="mt-auto flex items-center justify-between gap-1 px-1 pt-2">
                <span className="num text-sm font-bold">{money(price(it, "carton"))}</span>
                {out ? (
                  <span className="rounded-full bg-card-2 px-2 py-1 text-[11px] font-semibold text-faint">{tr("نفد", "Out")}</span>
                ) : l ? (
                  <span className="flex items-center gap-1" dir="ltr">
                    <RoundBtn label={tr("أقل", "Less")} onClick={() => setLine(it.id, { unit: l.unit, qty: l.qty - 1 })}>
                      <Minus className="size-3.5" />
                    </RoundBtn>
                    <span className="num w-5 text-center text-sm font-bold">{l.qty}</span>
                    <RoundBtn label={tr("أكثر", "More")} onClick={() => addOne(it)} solid>
                      <Plus className="size-3.5" />
                    </RoundBtn>
                  </span>
                ) : (
                  <RoundBtn label={tr("أضف إلى السلة", "Add to bag")} onClick={() => addOne(it)} solid>
                    <Plus className="size-4" />
                  </RoundBtn>
                )}
              </div>
            </motion.div>
          );
        })}
      </div>
      <Pager {...pg} sizes={[12, 24, 48]} className="mt-3" />
      {!shown.length && <p className="mt-10 text-center text-sm text-muted">{tr("لا توجد مادة بهذا الاسم", "No item by that name")}</p>}

      {/* The floating bag bar */}
      <AnimatePresence>
        {count > 0 && !bagOpen && (
          <motion.button
            type="button"
            initial={{ y: 80, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 80, opacity: 0 }}
            onClick={() => setBagOpen(true)}
            className="fixed inset-x-4 bottom-20 z-30 mx-auto flex max-w-md items-center gap-3 rounded-2xl bg-primary px-4 py-3 text-on-primary shadow-2xl lg:bottom-6"
          >
            <span className="relative">
              <ShoppingBag className="size-6" />
              <span className="num absolute -end-2 -top-2 flex size-5 items-center justify-center rounded-full bg-action text-[11px] font-bold text-on-action">{count}</span>
            </span>
            <span className="flex-1 text-start text-sm font-semibold">{tr("السلة", "Bag")}</span>
            <span className="num text-base font-bold">{money(total)}</span>
          </motion.button>
        )}
      </AnimatePresence>

      {open && (
        <ItemSheet
          item={open}
          index={catIndex(open.category)}
          line={lineOf(open.id)}
          available={available(open)}
          price={(u) => price(open, u)}
          onClose={() => setOpen(null)}
          room={SHOP_MAX_QTY - orderCount(bag.lines.filter((l) => l.item_id !== open.id))}
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
                      {money(price(it, l.unit))} / {l.unit === "carton" ? tr("كارتون", "carton") : tr("قطعة", "piece")}
                    </p>
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
    <motion.button
      type="button"
      whileTap={{ scale: 0.85 }}
      aria-label={label}
      onClick={onClick}
      className={cn("flex size-8 items-center justify-center rounded-full transition", solid ? "bg-action text-on-action hover:bg-action-hover" : "border border-line-strong bg-card hover:bg-card-2")}
    >
      {children}
    </motion.button>
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

/** The product sheet: like the design's detail screen, with carton / piece in place of S / M / L. */
function ItemSheet({
  item,
  index,
  line,
  available,
  room,
  price,
  onClose,
  onSave,
}: {
  item: Item;
  index: number;
  line?: Line;
  available: number;
  /** How much more the order can take (the limit minus the other lines). */
  room: number;
  price: (u: Unit) => number;
  onClose: () => void;
  onSave: (line: Omit<Line, "item_id"> | null) => void;
}) {
  const { tr, money, name, qty: fmtQty } = useFmt();
  const [unit, setUnit] = useState<Unit>(line?.unit ?? "carton");
  const [n, setN] = useState(line?.qty ?? 1);
  // What is in stock, and never more than what is left of the order's limit.
  const max = Math.min(Math.max(0, room), unit === "carton" ? Math.floor(available / item.pieces_per_carton) : available);
  const tooMuch = piecesOf(item, unit, n) > available;
  return (
    <Dialog
      open
      onClose={onClose}
      title={name(item)}
      footer={
        <div className="flex w-full items-center gap-3">
          <div className="min-w-0">
            <p className="text-[11px] text-muted">{tr("السعر", "Price")}</p>
            <p className="num text-lg font-bold">{money(price(unit) * n)}</p>
          </div>
          <button
            type="button"
            disabled={n < 1 || tooMuch}
            onClick={() => onSave({ unit, qty: n })}
            className="flex h-12 flex-1 items-center justify-center gap-2 rounded-xl bg-action text-base font-bold text-on-action transition hover:bg-action-hover disabled:opacity-50"
          >
            <ShoppingBag className="size-5" /> {line ? tr("تحديث السلة", "Update bag") : tr("أضف إلى السلة", "Add to bag")}
          </button>
        </div>
      }
    >
      <Art category={item.category} index={index} image={item.image} size="lg" />
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
        {tr(`الكارتون فيه ${item.pieces_per_carton} قطعة. المتوفر الآن ${fmtQty(available, item.pieces_per_carton)}.`, `A carton has ${item.pieces_per_carton} pieces. Available now: ${fmtQty(available, item.pieces_per_carton)}.`)}
      </p>

      <p className="mt-4 text-sm font-bold">{tr("الوحدة", "Unit")}</p>
      <Segmented
        className="mt-2 w-full"
        value={unit}
        onChange={(u) => {
          setUnit(u);
          setN(1);
        }}
        options={[
          { value: "carton", label: `${tr("كارتون", "Carton")} · ${money(price("carton"))}` },
          { value: "piece", label: `${tr("قطعة", "Piece")} · ${money(price("piece"))}` },
        ]}
      />

      <div className="mt-4 flex items-center justify-between gap-3">
        <p className="text-sm font-bold">{tr("الكمية", "Quantity")}</p>
        <Stepper value={n} onChange={setN} min={1} max={Math.max(1, max)} />
      </div>
      <p className="mt-1 text-end text-[11px] text-faint">{tr(`الطلب كله حتى ${SHOP_MAX_QTY} · باقٍ لك ${Math.max(0, room)}`, `The whole order up to ${SHOP_MAX_QTY} · ${Math.max(0, room)} left`)}</p>
      {line && (
        <button type="button" onClick={() => onSave(null)} className="mt-3 flex items-center gap-1.5 text-xs font-semibold text-danger">
          <Trash2 className="size-3.5" /> {tr("احذف من السلة", "Remove from bag")}
        </button>
      )}
    </Dialog>
  );
}
