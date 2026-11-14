"use client";

import { BarcodeScanner, ScanButton, itemByBarcode } from "@/components/barcode-scanner";

// The order screen. Built for the rep's phone: big buttons, search, carton/piece switch, live stock,
// the customer's own prices, a debt-limit warning, a saved draft, and it keeps working without internet.
import { useAppRouter } from "@/lib/app-path";
import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, ChevronDown, PackageX, ShoppingCart, Trash2, WifiOff } from "lucide-react";
import { api, ApiError } from "@/lib/api";
import type { Customer, Item, NewOrder, Unit } from "@/lib/api/types";
import { useFmt } from "@/lib/i18n";
import { afterOffer, firstUnit, offerOn, soldUnits } from "@/lib/units";
import { enqueue, isNetworkError, newClientRef, useOffline } from "@/lib/offline";
import { useLoad } from "@/lib/use-load";
import { cn, matches, piecesOf, priceOf as tierPrice, today } from "@/lib/utils";
import { isPhoneApp } from "./nav";
import { useApp } from "./shell";
import { DiscountPicker, canDiscount } from "./discount";
import { Badge, Button, Card, Dialog, Empty, LimitBar, Money, Notice, SearchBox, Segmented, Select, Stepper, Textarea, errorText, useToast, Pager, usePages } from "./ui";
import { useRules } from "@/lib/use-rules";

interface Line {
  item_id: number;
  unit: Unit;
  qty: number;
}

interface Draft {
  customer_id: number | null;
  warehouse_id: number;
  lines: Line[];
  note: string;
  client_ref: string;
  /** Rep / manager: the discount percent on this order. */
  discount?: number;
}

const draftKey = (userId: number) => `nahrain.draft.${userId}`;

function readDraft(userId: number, fallbackWarehouse: number, customerId: number | null): Draft {
  try {
    const raw = localStorage.getItem(draftKey(userId));
    if (raw) {
      const d = JSON.parse(raw) as Draft;
      if (customerId && d.customer_id !== customerId) d.customer_id = customerId;
      return d;
    }
  } catch {}
  return { customer_id: customerId, warehouse_id: fallbackWarehouse, lines: [], note: "", client_ref: newClientRef() };
}

export function OrderBuilder({ fixedCustomerId, preselectCustomerId }: { fixedCustomerId?: number; preselectCustomerId?: number }) {
  const { tr, money, qty: fmtQty, name, unit: unitOf } = useFmt();
  const { user, lookups, items, itemById, reloadItems } = useApp();
  const router = useAppRouter();
  const toast = useToast();
  // Saved on the phone when there is no internet: only if the manager allows working offline.
  const offlineOk = useRules().features.offline;
  const offline = useOffline();
  const customers = useLoad(() => api.listCustomers().then((cs) => cs.filter((c) => !c.walk_in)), []);

  const [draft, setDraft] = useState<Draft>(() => readDraft(user.id, lookups.warehouses[0].id, fixedCustomerId ?? preselectCustomerId ?? null));
  const [q, setQ] = useState("");
  const [cat, setCat] = useState("all");
  // Scanning an item's barcode adds it to the order (one carton, or one more if it's already there).
  const [scanning, setScanning] = useState(false);
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [pickCustomer, setPickCustomer] = useState(false);
  const [cartOpen, setCartOpen] = useState(false);

  // Save the draft on the phone after every change, so nothing is lost if the page closes.
  useEffect(() => {
    try {
      localStorage.setItem(draftKey(user.id), JSON.stringify(draft));
    } catch {}
  }, [draft, user.id]);

  const customer: Customer | undefined = customers.data?.find((c) => c.id === draft.customer_id);
  const tierId = customer?.tier_id;
  const update = (patch: Partial<Draft>) => setDraft((d) => ({ ...d, ...patch }));

  function onScan(code: string) {
    setScanning(false);
    const it = itemByBarcode(items, code);
    if (!it) {
      toast("danger", tr(`لا مادة بالباركود ${code}`, `No item with barcode ${code}`));
      return;
    }
    const l = draft.lines.find((x) => x.item_id === it.id);
    setLine(it.id, l ? { qty: l.qty + 1 } : {});
    toast("success", tr(`أُضيفت: ${name(it)}`, `Added: ${name(it)}`));
  }
  const lineOf = (itemId: number) => draft.lines.find((l) => l.item_id === itemId);
  const setLine = (itemId: number, patch: Partial<Line> | null) => {
    setErrors({});
    setDraft((d) => {
      const exists = d.lines.some((l) => l.item_id === itemId);
      let lines: Line[];
      if (patch === null) lines = d.lines.filter((l) => l.item_id !== itemId);
      else if (exists) lines = d.lines.map((l) => (l.item_id === itemId ? { ...l, ...patch } : l)).filter((l) => l.qty > 0);
      else lines = [...d.lines, { item_id: itemId, unit: firstUnit(itemById.get(itemId)), qty: 1, ...patch }];
      return { ...d, lines };
    });
  };

  const available = (it: Item) => it.stock.by_warehouse.find((w) => w.warehouse_id === draft.warehouse_id)?.qty ?? 0;
  // The shop's special prices come first (special → tier → general).
  const special = useLoad(() => (customer ? api.specialPrices(customer.id).catch(() => []) : Promise.resolve([])), [customer?.id]);
  const priceOf = (it: Item, tier: number | undefined, unit: Unit) => {
    const sp = special.data?.find((x) => x.item_id === it.id);
    return sp ? (unit === "carton" ? sp.carton_price : sp.piece_price) : tierPrice(it, tier, unit);
  };
  // Each line after the quantity offer (the server applies the same).
  const lineUnit = (it: Item, l: { unit: Unit; qty: number }) => afterOffer(priceOf(it, tierId, l.unit), it, l.unit, l.qty, today());
  const subtotal = draft.lines.reduce((s, l) => {
    const it = itemById.get(l.item_id);
    return it ? s + lineUnit(it, l) * l.qty : s;
  }, 0);
  const pct = canDiscount(user.role) ? (draft.discount ?? 0) : 0;
  const total = subtotal - Math.round((subtotal * pct) / 100);
  const balance = customer?.balance ?? 0;
  const limit = customer?.debt_limit;
  const overLimit = limit !== undefined && customer && balance + total > limit;

  // In the manager's order (lookups), only the categories that have something to sell.
  const categories = useMemo(() => lookups.categories.filter((c) => items.some((i) => i.active && i.category === c)), [items, lookups.categories]);
  const shown = items.filter((i) => i.active && (cat === "all" || i.category === cat) && matches(q, i.name, i.name_en, i.barcode));
  const pg = usePages(shown, 10);
  const linesOver = draft.lines.filter((l) => {
    const it = itemById.get(l.item_id);
    return it && piecesOf(it, l.unit, l.qty) > available(it);
  });

  async function submit() {
    if (!customer) {
      setPickCustomer(true);
      return;
    }
    if (!draft.lines.length) return;
    const body: NewOrder = {
      client_ref: draft.client_ref,
      customer_id: customer.id,
      warehouse_id: draft.warehouse_id,
      lines: draft.lines,
      note: draft.note || undefined,
      ...(pct ? { discount_percent: pct } : {}),
      // Written now: if it waits on the phone (no internet), the price stays the one of this moment.
      recorded_at: new Date().toISOString(),
    };
    setBusy(true);
    setErrors({});
    const fresh = () => setDraft({ customer_id: fixedCustomerId ?? null, warehouse_id: draft.warehouse_id, lines: [], note: "", client_ref: newClientRef() });
    try {
      const order = await api.createOrder(body);
      fresh();
      reloadItems();
      toast(
        "success",
        order.status === "needs_approval"
          ? order.approval_for?.includes("discount") && !order.approval_for.includes("debt")
            ? tr("أُرسل الطلب، وينتظر موافقة المدير على الخصم", "Order sent. It waits for the manager to OK the discount")
            : tr("أُرسل الطلب، وينتظر موافقة المدير", "Order sent. It waits for the manager")
          : tr("أُرسل الطلب وحُجزت الكمية", "Order sent and stock reserved"),
      );
      router.push(`/orders/${order.id}`);
    } catch (e) {
      if (isNetworkError(e) && offlineOk) {
        enqueue({ kind: "order", client_ref: body.client_ref, body: { ...body, offline: true, recorded_at: body.recorded_at ?? new Date().toISOString() }, label: `${customer.name} · ${money(total)}`, saved_at: new Date().toISOString() });
        fresh();
        toast("primary", tr("لا يوجد إنترنت: حُفظ «طلباً مبدئياً» على الجوال. أعطِ الزبون أنه مبدئي: يصبح ملزماً بعد المزامنة وفحص المخزون.", "No internet: saved as a provisional order. Tell the shop it becomes binding after it syncs and the stock is checked."));
        router.push(fixedCustomerId ? "/orders" : "/rep");
      } else {
        if (e instanceof ApiError && e.errors) setErrors(e.errors);
        if (e instanceof ApiError && e.code === "OUT_OF_STOCK") reloadItems();
        toast("danger", errorText(e, tr));
      }
    } finally {
      setBusy(false);
    }
  }

  const cartList = (
    <div className="space-y-3">
      {draft.lines.map((l, i) => {
        const it = itemById.get(l.item_id);
        if (!it) return null;
        const avail = available(it);
        const over = piecesOf(it, l.unit, l.qty) > avail;
        return (
          <div key={l.item_id} className={cn("rounded-xl border p-3", over || errors[`lines.${i}.qty`] ? "border-danger bg-danger-soft/40" : "border-line")}>
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="font-medium leading-snug">{name(it)}</p>
                <p className="mt-0.5 text-xs text-muted">
                  {money(priceOf(it, tierId, l.unit))} / {unitOf(it, l.unit)} · {tr("المتوفر", "available")} {fmtQty(avail, it.pieces_per_carton, it)}
                </p>
              </div>
              <button type="button" aria-label={tr("حذف", "Remove")} onClick={() => setLine(l.item_id, null)} className="flex size-9 items-center justify-center rounded-lg text-faint hover:bg-danger-soft hover:text-danger">
                <Trash2 className="size-4" />
              </button>
            </div>
            <div className="mt-2 flex items-center justify-between gap-2">
              {/* Only the units this item is sold by (rice in bags: «كيس» alone, no choice). */}
              {soldUnits(it).length > 1 ? (
                <Segmented value={l.unit} onChange={(u) => setLine(l.item_id, { unit: u })} options={soldUnits(it).map((u) => ({ value: u, label: unitOf(it, u) }))} />
              ) : (
                <span className="text-sm font-medium text-muted">{unitOf(it, l.unit)}</span>
              )}
              <Stepper value={l.qty} min={0} onChange={(v) => setLine(l.item_id, { qty: v })} />
            </div>
            {(over || errors[`lines.${i}.qty`]) && (
              <p className="mt-2 text-xs font-medium text-danger">{errors[`lines.${i}.qty`] ?? tr(`الكمية أكثر من المتوفر (${fmtQty(avail, it.pieces_per_carton, it)})`, `More than available (${fmtQty(avail, it.pieces_per_carton, it)})`)}</p>
            )}
            <p className="num mt-1 text-end text-sm font-semibold">{money(lineUnit(it, l) * l.qty)}</p>
            {it.offer && offerOn(it, today()) && it.offer.unit === l.unit && (
              <p className={cn("mt-0.5 text-end text-[11px] font-semibold", l.qty >= it.offer.min ? "text-success" : "text-muted")}>
                {l.qty >= it.offer.min
                  ? tr(`عرض الكمية: وفّر ${money(it.offer.off * l.qty)}`, `Quantity offer: ${money(it.offer.off * l.qty)} off`)
                  : tr(`عرض: من ${it.offer.min} ${unitOf(it, l.unit)} يوفّر ${money(it.offer.off)} على كل واحد`, `Offer: from ${it.offer.min}, ${money(it.offer.off)} off each`)}
              </p>
            )}
          </div>
        );
      })}
      <Textarea placeholder={tr("ملاحظة للمخزن (اختياري)", "Note for the warehouse (optional)")} value={draft.note} onChange={(e) => update({ note: e.target.value })} rows={2} />
    </div>
  );

  const summary = (
    <div className="space-y-3">
      {customer && limit !== undefined && (
        <div className="space-y-1.5">
          <div className="flex justify-between text-xs text-muted">
            <span>
              {tr("الدين بعد الطلب", "Debt after order")}: <Money value={balance + total} className="font-semibold text-text" />
            </span>
            <span>
              {tr("السقف", "Limit")} <Money value={limit} />
            </span>
          </div>
          <LimitBar balance={balance + total} limit={limit} />
        </div>
      )}
      {overLimit && (
        <Notice tone="warning" title={tr("الطلب يتجاوز سقف الدين", "This order passes the debt limit")}>
          {tr("يمكن إرساله، لكنه يبقى معلّقاً حتى يوافق المدير.", "You can send it, but it waits until the manager approves.")}
        </Notice>
      )}
      {offline && (
        <Notice tone="primary" title={tr("بدون إنترنت", "Offline")}>
          {tr("يُحفظ الطلب على الجوال ويُرسَل عند عودة الإنترنت.", "The order is saved on the phone and sent when the internet is back.")}
        </Notice>
      )}
      {canDiscount(user.role) && draft.lines.length > 0 && (
        <div>
          <p className="mb-1.5 text-sm font-semibold">{tr("خصم", "Discount")}</p>
          <DiscountPicker value={pct} onChange={(v) => update({ discount: v })} subtotal={subtotal} role={user.role} />
        </div>
      )}
      {pct > 0 && (
        <div className="flex items-center justify-between text-sm text-muted">
          <span>{tr("قبل الخصم", "Before discount")}</span>
          <Money value={subtotal} />
        </div>
      )}
      <div className="flex items-center justify-between">
        <span className="text-sm text-muted">
          {tr("المجموع", "Total")} · {draft.lines.length} {tr("مادة", "items")}
        </span>
        <Money value={total} className="text-xl font-bold" />
      </div>
      <Button variant="action" size="lg" className="w-full" loading={busy} disabled={!draft.lines.length || linesOver.length > 0} onClick={submit}>
        {offline ? <WifiOff className="size-5" /> : <CheckCircle2 className="size-5" />}
        {!customer ? tr("اختر الزبون أولاً", "Choose the customer first") : offline ? tr("احفظ الطلب على الجوال", "Save order on phone") : tr("إرسال الطلب", "Send order")}
      </Button>
      {linesOver.length > 0 && <p className="text-center text-xs text-danger">{tr("عدّل الكميات المؤشرة بالأحمر", "Fix the quantities marked in red")}</p>}
    </div>
  );

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_380px]">
      <div className="min-w-0 space-y-3">
        {/* Customer and warehouse */}
        <Card className="p-3">
          <div className="grid gap-3 sm:grid-cols-[1fr_220px]">
            {fixedCustomerId ? (
              <div>
                <p className="text-xs text-muted">{tr("المحل", "Shop")}</p>
                <p className="font-semibold">{customer?.name ?? "…"}</p>
              </div>
            ) : (
              <button type="button" onClick={() => setPickCustomer(true)} className="flex min-h-11 items-center justify-between gap-3 rounded-xl border border-line-strong px-3 py-2 text-start hover:border-primary">
                <span className="min-w-0">
                  <span className="block text-xs text-muted">{tr("الزبون", "Customer")}</span>
                  <span className="block truncate font-semibold">{customer ? customer.name : tr("اضغط لاختيار المحل", "Tap to choose the shop")}</span>
                  {customer && (
                    <span className="block text-xs text-muted">
                      {customer.area} · {name(lookups.tiers.find((t) => t.id === customer.tier_id))}
                    </span>
                  )}
                </span>
                <ChevronDown className="size-4 shrink-0 text-faint" />
              </button>
            )}
            {!fixedCustomerId && (
              <div>
                <label className="mb-1 block text-xs text-muted" htmlFor="wh">
                  {tr("يخرج من", "From")}
                </label>
                <Select id="wh" value={draft.warehouse_id} onChange={(e) => update({ warehouse_id: Number(e.target.value) })}>
                  {lookups.warehouses.map((w) => (
                    <option key={w.id} value={w.id}>
                      {name(w)}
                    </option>
                  ))}
                </Select>
              </div>
            )}
          </div>
        </Card>

        {/* Search and categories */}
        <div className="sticky top-14 z-20 -mx-3 space-y-2 bg-bg/95 px-3 py-2 backdrop-blur sm:top-16 sm:-mx-5 sm:px-5">
          <div className="flex gap-2">
            <div className="min-w-0 flex-1">
              <SearchBox value={q} onChange={setQ} placeholder={tr("ابحث عن مادة بالاسم أو الباركود", "Search by name or barcode")} />
            </div>
            <ScanButton onClick={() => setScanning(true)} />
          </div>
          {scanning && <BarcodeScanner onClose={() => setScanning(false)} onCode={onScan} />}
          <div className="flex gap-1.5 overflow-x-auto pb-1">
            {["all", ...categories].map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setCat(c)}
                className={cn("h-8 shrink-0 rounded-full border px-3 text-xs font-medium transition", cat === c ? "border-primary bg-primary text-on-primary" : "border-line bg-card text-muted hover:text-text")}
              >
                {c === "all" ? tr("الكل", "All") : c}
              </button>
            ))}
          </div>
        </div>

        {/* Items */}
        <Card>
          {shown.length === 0 ? (
            <Empty icon={<PackageX className="size-6" />} title={tr("لا توجد مادة بهذا الاسم", "No item matches")} />
          ) : (
            <>
            <ul className="divide-y divide-line">
              {pg.shown.map((it) => {
                const avail = available(it);
                const line = lineOf(it.id);
                const low = avail > 0 && avail < it.pieces_per_carton * 3;
                return (
                  <li key={it.id} className={cn("flex items-center gap-3 px-3 py-3", line && "bg-primary-soft/40")}>
                    <div className="min-w-0 flex-1">
                      <p className="font-medium leading-snug">{name(it)}</p>
                      <p className="mt-0.5 text-xs text-muted">
                        {soldUnits(it).map((u, k) => (
                          <span key={u}>
                            {k > 0 && " · "}
                            <span className={cn("num", k === 0 && "font-semibold text-text")}>{money(priceOf(it, tierId, u))}</span> {unitOf(it, u, true)}
                            {u === "carton" && ` (${it.pieces_per_carton} ${unitOf(it, "piece", true)})`}
                          </span>
                        ))}
                      </p>
                      <p className={cn("mt-0.5 text-xs", avail === 0 ? "text-danger" : low ? "text-warning" : "text-faint")}>
                        {avail === 0 ? tr("نفد من هذا المخزن", "Out of stock here") : `${tr("المتوفر", "Available")}: ${fmtQty(avail, it.pieces_per_carton, it)}`}
                      </p>
                    </div>
                    {line ? (
                      <div className="flex flex-col items-end gap-1">
                        <Stepper value={line.qty} min={0} onChange={(v) => setLine(it.id, { qty: v })} />
                        <span className="text-[11px] text-muted">{unitOf(it, line.unit)}</span>
                      </div>
                    ) : (
                      <Button variant="soft" disabled={avail === 0} onClick={() => setLine(it.id, { unit: soldUnits(it).length > 1 ? (avail >= it.pieces_per_carton ? "carton" : "piece") : firstUnit(it), qty: 1 })}>
                        {tr("أضف", "Add")}
                      </Button>
                    )}
                  </li>
                );
              })}
            </ul>
            <Pager {...pg} className="border-t border-line" />
            </>
          )}
        </Card>
      </div>

      {/* Cart: side panel on computer, bottom bar on phone */}
      <div className="hidden lg:block">
        <Card className="sticky top-20 p-4">
          <h2 className="mb-3 flex items-center gap-2 font-semibold">
            <ShoppingCart className="size-5" /> {tr("الطلب", "Order")}
          </h2>
          {draft.lines.length ? cartList : <p className="py-6 text-center text-sm text-muted">{tr("أضف مواد من القائمة", "Add items from the list")}</p>}
          <div className="mt-4 border-t border-line pt-4">{summary}</div>
        </Card>
      </div>
      {draft.lines.length > 0 && (
        <div className={cn("fixed inset-x-0 z-30 border-t border-line bg-card p-3 shadow-[0_-4px_16px_rgba(0,0,0,0.06)] lg:hidden", isPhoneApp(user.role) ? "bottom-[calc(68px+env(safe-area-inset-bottom))]" : "bottom-16 pb-[calc(env(safe-area-inset-bottom)+12px)] md:bottom-0")}>
          <div className="mx-auto flex max-w-lg items-center gap-3">
            <button type="button" onClick={() => setCartOpen(true)} className="flex min-w-0 flex-1 items-center gap-2 text-start">
              <span className="relative flex size-11 items-center justify-center rounded-xl bg-primary-soft text-primary-ink">
                <ShoppingCart className="size-5" />
                <span className="num absolute -end-1 -top-1 flex size-5 items-center justify-center rounded-full bg-action text-[11px] font-bold text-on-action">{draft.lines.length}</span>
              </span>
              <span className="min-w-0">
                <Money value={total} className="block text-lg font-bold" />
                <span className="block text-xs text-muted">{overLimit ? <span className="text-warning">{tr("يتجاوز السقف", "Over limit")}</span> : tr("اضغط لمراجعة الطلب", "Tap to review")}</span>
              </span>
            </button>
            <Button variant="action" size="lg" onClick={() => setCartOpen(true)}>
              {tr("مراجعة وإرسال", "Review & send")}
            </Button>
          </div>
        </div>
      )}

      <Dialog open={cartOpen} onClose={() => setCartOpen(false)} title={customer ? `${tr("طلب", "Order for")} ${customer.name}` : tr("الطلب", "Order")} footer={<div className="w-full">{summary}</div>}>
        {draft.lines.length ? cartList : <p className="py-6 text-center text-sm text-muted">{tr("الطلب فارغ", "The order is empty")}</p>}
      </Dialog>

      <CustomerPicker
        open={pickCustomer}
        customers={customers.data ?? []}
        onClose={() => setPickCustomer(false)}
        onPick={(c) => {
          update({ customer_id: c.id });
          setPickCustomer(false);
        }}
      />
    </div>
  );
}

function CustomerPicker({ open, customers, onClose, onPick }: { open: boolean; customers: Customer[]; onClose: () => void; onPick: (c: Customer) => void }) {
  const { tr } = useFmt();
  const rep = useApp().user.role === "rep";
  const [q, setQ] = useState("");
  const list = customers.filter((c) => c.active && matches(q, c.name, c.owner_name, c.area, c.phone));
  return (
    <Dialog open={open} onClose={onClose} title={tr("اختر الزبون", "Choose customer")}>
      <SearchBox value={q} onChange={setQ} placeholder={tr("اسم المحل، صاحبه أو المنطقة", "Shop, owner or area")} />
      <ul className="mt-3 divide-y divide-line">
        {list.map((c) => {
          const over = c.debt_limit !== undefined && (c.balance ?? 0) >= c.debt_limit;
          return (
            <li key={c.id}>
              <button type="button" onClick={() => onPick(c)} className="w-full py-3 text-start hover:bg-card-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium">{c.name}</span>
                  {over ? <Badge tone="danger">{tr("بلغ السقف", "At limit")}</Badge> : null}
                </div>
                <p className="text-xs text-muted">
                  {c.owner_name} · {c.area}
                </p>
                {c.debt_limit !== undefined && (
                  <div className="mt-1.5 flex items-center gap-2">
                    <LimitBar balance={c.balance ?? 0} limit={c.debt_limit} />
                    <Money value={c.balance} className="shrink-0 text-xs text-muted" />
                  </div>
                )}
              </button>
            </li>
          );
        })}
        {!list.length && <li className="py-6 text-center text-sm text-muted">{tr("لا يوجد زبون بهذا الاسم", "No customer found")}</li>}
      </ul>
      {rep && (
        <p className="mt-2 flex items-center gap-1 text-xs text-faint">
          <AlertTriangle className="size-3" /> {tr("ترى زبائنك فقط", "You see your own customers only")}
        </p>
      )}
    </Dialog>
  );
}
