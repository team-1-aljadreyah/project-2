"use client";

// بيع مباشر (counter sale): someone comes to the warehouse and buys on the spot. The keeper finds the items
// (search or scan), picks the price level, takes the money (cash, with the change worked out, or a transfer)
// and the goods leave now: the invoice is made and paid in full at once (POST /counter-sales). No shop, no
// rep, no debt; the buyer's name and phone are optional and printed on the invoice.
import { useState } from "react";
import Link from "next/link";
import { Banknote, CheckCircle2, HandCoins, Minus, Plus, Printer, ReceiptText, Smartphone, Trash2, UserRound } from "lucide-react";
import { BarcodeScanner, ScanButton, itemByBarcode } from "@/components/barcode-scanner";
import { useApp } from "@/components/shell";
import { openWhatsApp } from "@/components/share";
import { Button, Card, Empty, errorText, Field, Input, NumberInput, PageHeader, SearchBox, Segmented, Select, useToast } from "@/components/ui";
import { api, ApiError } from "@/lib/api";
import { workWarehouses, type Invoice, type Item, type Unit } from "@/lib/api/types";
import { useFmt } from "@/lib/i18n";
import { firstUnit, soldUnits } from "@/lib/units";
import { useUnsaved } from "@/lib/unsaved";
import { useLoad } from "@/lib/use-load";
import { cn, dayOfIso, matches, today } from "@/lib/utils";

type Line = { item_id: number; unit: Unit; qty: number };
const newRef = () => `counter-${crypto.randomUUID()}`;

export default function CounterPage() {
  const { tr, money, name, num, qty: qtyText, dateTime, unit: unitOf } = useFmt();
  const { user, lookups, items, itemById, reloadItems } = useApp();
  const toast = useToast();
  const mine = workWarehouses(user, lookups.warehouses) ?? lookups.warehouses.map((w) => w.id);
  const [wh, setWh] = useState(mine[0]);
  // The small shops' price by default (the last level: a walk-in never gets better than the shops).
  const [tier, setTier] = useState(lookups.tiers[lookups.tiers.length - 1]?.id ?? 1);
  const [q, setQ] = useState("");
  const [lines, setLines] = useState<Line[]>([]);
  const [buyerName, setBuyerName] = useState("");
  const [buyerPhone, setBuyerPhone] = useState("");
  const [method, setMethod] = useState<"cash" | "transfer">("cash");
  const [received, setReceived] = useState<number | "">("");
  const [scanning, setScanning] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<Record<string, string>>({});
  // One id per sale: sent again after a weak connection, the server gives back the same sale (never two).
  const [ref, setRef] = useState(newRef);
  const [done, setDone] = useState<Invoice | null>(null);
  const sales = useLoad(() => api.listInvoices().catch(() => [] as Invoice[]), []);
  useUnsaved(lines.length > 0 && !done);

  const price = (it: Item, unit: Unit) => {
    const p = it.prices.find((x) => x.tier_id === tier) ?? it.prices[0];
    return unit === "carton" ? p.carton_price : p.piece_price;
  };
  const inStock = (it: Item) => it.stock.by_warehouse.find((w) => w.warehouse_id === wh)?.qty ?? 0;
  const piecesOf = (l: Line) => (l.unit === "carton" ? (itemById.get(l.item_id)?.pieces_per_carton ?? 1) : 1) * l.qty;
  const subtotal = lines.reduce((t, l) => t + price(itemById.get(l.item_id)!, l.unit) * l.qty, 0);
  // The invoice total is rounded to the nearest 250 (the smallest note), like every invoice.
  const total = Math.round(subtotal / 250) * 250;
  const change = method === "cash" && received !== "" ? received - total : null;

  const found = q.trim() ? items.filter((it) => it.active && matches(q, it.name, it.name_en, it.barcode, it.category)).slice(0, 8) : [];

  function add(it: Item) {
    const unit: Unit = firstUnit(it);
    setLines((ls) => (ls.some((l) => l.item_id === it.id && l.unit === unit) ? ls.map((l) => (l.item_id === it.id && l.unit === unit ? { ...l, qty: l.qty + 1 } : l)) : [...ls, { item_id: it.id, unit, qty: 1 }]));
    setQ("");
    setErr({});
  }
  const change1 = (i: number, p: Partial<Line>) => setLines((ls) => ls.map((l, k) => (k === i ? { ...l, ...p } : l)));

  function onScan(code: string) {
    setScanning(false);
    const it = itemByBarcode(items, code);
    if (!it || !it.active) return toast("danger", tr(`لا مادة بالباركود ${code}`, `No item with barcode ${code}`));
    add(it);
    toast("success", tr(`أُضيفت: ${name(it)}`, `Added: ${name(it)}`));
  }

  async function sell() {
    setBusy(true);
    setErr({});
    try {
      const inv = await api.counterSale({
        client_ref: ref,
        warehouse_id: wh,
        tier_id: tier,
        lines,
        buyer_name: buyerName.trim() || undefined,
        buyer_phone: buyerPhone.trim() || undefined,
        method,
        received: method === "cash" && received !== "" ? received : undefined,
      });
      setDone(inv);
      reloadItems();
      sales.reload();
      toast("success", tr(`تم البيع: ${inv.number}`, `Sold: ${inv.number}`));
    } catch (e) {
      if (e instanceof ApiError && e.errors) setErr(e.errors);
      toast("danger", errorText(e, tr));
    } finally {
      setBusy(false);
    }
  }

  function again() {
    setLines([]);
    setBuyerName("");
    setBuyerPhone("");
    setReceived("");
    setMethod("cash");
    setDone(null);
    setErr({});
    setRef(newRef());
  }

  const todays = (sales.data ?? []).filter((i) => i.counter && dayOfIso(i.date) === today() && mine.includes(i.warehouse_id));

  // ----- after the sale: the receipt -----
  if (done) {
    const back = done.counter?.received ? done.counter.received - done.total : 0;
    return (
      <>
        <PageHeader title={tr("بيع مباشر", "Counter sale")} />
        <Card className="mx-auto max-w-lg p-6 text-center">
          <CheckCircle2 className="mx-auto size-14 text-success" />
          <h2 className="mt-3 text-xl font-bold">{tr("تم البيع وسُلّمت البضاعة", "Sold, the goods are handed over")}</h2>
          <p className="num mt-1 text-muted">{done.number}</p>
          <p className="num mt-4 text-3xl font-bold">{money(done.total)}</p>
          <p className="mt-1 text-sm text-muted">{done.counter?.method === "transfer" ? tr("دُفع بالتحويل", "Paid by transfer") : tr("دُفع نقداً", "Paid in cash")}</p>
          {back > 0 && (
            <p className="mt-3 rounded-xl bg-action/10 p-3 text-lg font-bold">
              {tr("الباقي للزبون", "Change to give")}: <span className="num">{money(back)}</span>
            </p>
          )}
          <div className="mt-6 flex flex-wrap justify-center gap-2">
            <Button href={`/invoices/${done.id}?print=1`}>
              <Printer className="size-4" /> {tr("اطبع الفاتورة", "Print the invoice")}
            </Button>
            {done.counter?.buyer_phone && (
              <Button
                onClick={() =>
                  openWhatsApp(
                    `فاتورة ${done.number}\n${done.lines.map((l) => `- ${itemById.get(l.item_id)?.name}: ${l.qty} ${unitOf(itemById.get(l.item_id), l.unit)} = ${money(l.total)}`).join("\n")}\nالمجموع: ${money(done.total)} (مدفوع)`,
                    done.counter?.buyer_phone,
                  )
                }
              >
                <Smartphone className="size-4" /> {tr("أرسلها واتساب", "Send on WhatsApp")}
              </Button>
            )}
            <Button variant="action" onClick={again}>
              <Plus className="size-4" /> {tr("بيع جديد", "New sale")}
            </Button>
          </div>
        </Card>
      </>
    );
  }

  return (
    <>
      <PageHeader
        title={tr("بيع مباشر", "Counter sale")}
        subtitle={tr("لمن يأتي إلى المخزن ويدفع في الحال: تخرج البضاعة الآن وتصدر الفاتورة مدفوعة", "For someone who comes to the warehouse and pays now: the goods leave and the invoice is paid at once")}
      />
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="min-w-0 space-y-4">
          {/* Where from, at which price */}
          <Card className="grid gap-3 p-4 xl:grid-cols-[auto_minmax(0,1fr)]">
            {mine.length > 1 ? (
              <Field label={tr("من مخزن", "From warehouse")}>
                <Select value={wh} onChange={(e) => setWh(Number(e.target.value))}>
                  {mine.map((id) => (
                    <option key={id} value={id}>
                      {name(lookups.warehouses.find((w) => w.id === id))}
                    </option>
                  ))}
                </Select>
              </Field>
            ) : (
              <Field label={tr("من مخزن", "From warehouse")}>
                <p className="flex h-11 items-center font-semibold">{name(lookups.warehouses.find((w) => w.id === wh))}</p>
              </Field>
            )}
            <Field label={tr("مستوى السعر", "Price level")} error={err.tier_id}>
              <Segmented className="flex-wrap" value={String(tier)} onChange={(v) => setTier(Number(v))} options={lookups.tiers.map((t) => ({ value: String(t.id), label: name(t) }))} />
            </Field>
          </Card>

          {/* Find the items */}
          <Card className="p-4">
            <div className="flex gap-2">
              <SearchBox value={q} onChange={setQ} placeholder={tr("ابحث عن مادة بالاسم أو الباركود", "Search an item by name or barcode")} className="min-w-0 flex-1" />
              <ScanButton onClick={() => setScanning(true)} />
            </div>
            {found.length > 0 && (
              <ul className="mt-2 divide-y divide-line overflow-hidden rounded-xl border border-line">
                {found.map((it) => (
                  <li key={it.id}>
                    <button type="button" onClick={() => add(it)} className="flex w-full items-center gap-3 px-3 py-2.5 text-start hover:bg-card-2">
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-medium">{name(it)}</span>
                        <span className={cn("block text-xs", inStock(it) > 0 ? "text-muted" : "text-danger")}>
                          {tr("في المخزن", "In stock")}: {qtyText(inStock(it), it.pieces_per_carton, it)}
                        </span>
                      </span>
                      <span className="text-sm">
                        <span className="num font-semibold">{money(price(it, firstUnit(it)))}</span> <span className="text-xs text-muted">/ {unitOf(it, firstUnit(it))}</span>
                      </span>
                      <Plus className="size-4 text-action" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
            {q.trim() && !found.length && <p className="mt-3 text-center text-sm text-muted">{tr("لا مادة بهذا الاسم", "No item by that name")}</p>}
          </Card>

          {/* What he takes */}
          {lines.length ? (
            <div className="space-y-2">
              {lines.map((l, i) => {
                const it = itemById.get(l.item_id)!;
                const short = piecesOf(l) > inStock(it);
                return (
                  <Card key={`${l.item_id}-${l.unit}`} className="flex flex-wrap items-center gap-3 p-3">
                    <span className="min-w-0 flex-1 basis-40">
                      <span className="block truncate font-medium">{name(it)}</span>
                      <span className={cn("block text-xs", short || err[`lines.${i}.qty`] ? "text-danger" : "text-muted")}>
                        {err[`lines.${i}.qty`] ?? (short ? tr(`المتوفر ${qtyText(inStock(it), it.pieces_per_carton, it)} فقط`, `Only ${qtyText(inStock(it), it.pieces_per_carton, it)}`) : `${money(price(it, l.unit))} / ${unitOf(it, l.unit)}`)}
                      </span>
                    </span>
                    {soldUnits(it).length > 1 ? (
                      <Segmented value={l.unit} onChange={(u) => change1(i, { unit: u })} options={soldUnits(it).map((u) => ({ value: u, label: unitOf(it, u) }))} />
                    ) : (
                      <span className="text-sm font-medium text-muted">{unitOf(it, l.unit)}</span>
                    )}
                    <span className="inline-flex h-11 items-center rounded-xl border border-line-strong" dir="ltr">
                      <button type="button" aria-label={tr("أقل", "Less")} className="flex size-11 items-center justify-center" onClick={() => (l.qty > 1 ? change1(i, { qty: l.qty - 1 }) : setLines((ls) => ls.filter((_, k) => k !== i)))}>
                        <Minus className="size-4" />
                      </button>
                      <input
                        inputMode="numeric"
                        aria-label={tr("الكمية", "Quantity")}
                        className="num w-14 bg-transparent text-center font-semibold outline-none"
                        value={l.qty}
                        onChange={(e) => change1(i, { qty: Math.max(1, Number(e.target.value.replace(/\D/g, "")) || 1) })}
                      />
                      <button type="button" aria-label={tr("أكثر", "More")} className="flex size-11 items-center justify-center" onClick={() => change1(i, { qty: l.qty + 1 })}>
                        <Plus className="size-4" />
                      </button>
                    </span>
                    <span className="num w-28 text-end font-bold">{money(price(it, l.unit) * l.qty)}</span>
                    <button type="button" aria-label={tr("احذف السطر", "Remove the line")} className="flex size-10 items-center justify-center rounded-lg text-muted hover:bg-danger-soft hover:text-danger" onClick={() => setLines((ls) => ls.filter((_, k) => k !== i))}>
                      <Trash2 className="size-4" />
                    </button>
                  </Card>
                );
              })}
            </div>
          ) : (
            <Card>
              <Empty icon={<HandCoins className="size-6" />} title={tr("لم تُضف مواد بعد", "No items yet")} body={tr("ابحث عن المادة أو امسح الباركود لإضافتها", "Search for the item or scan its barcode to add it")} />
            </Card>
          )}
        </div>

        {/* The money (stays in view on a computer) */}
        <div className="space-y-4 lg:sticky lg:top-20 lg:self-start">
          <Card className="space-y-3 p-4">
            <p className="flex items-center gap-1.5 text-sm font-semibold">
              <UserRound className="size-4 text-action" /> {tr("المشتري (اختياري)", "Buyer (optional)")}
            </p>
            <Input value={buyerName} onChange={(e) => setBuyerName(e.target.value)} placeholder={tr("الاسم", "Name")} aria-label={tr("اسم المشتري", "Buyer's name")} />
            <Field error={err.buyer_phone}>
              <Input dir="ltr" inputMode="tel" value={buyerPhone} onChange={(e) => setBuyerPhone(e.target.value)} placeholder="07XXXXXXXXX" aria-label={tr("هاتف المشتري", "Buyer's phone")} className="num" invalid={!!err.buyer_phone} />
            </Field>
          </Card>
          <Card className="space-y-3 p-4">
            <div className="flex items-baseline justify-between">
              <span className="text-sm text-muted">{tr("المجموع", "Total")}</span>
              <b className="num text-2xl">{money(total)}</b>
            </div>
            {total !== subtotal && (
              <p className="text-xs text-muted">
                {tr("مقرّب لأقرب 250 دينار من", "Rounded to 250 from")} <span className="num">{money(subtotal)}</span>
              </p>
            )}
            <Segmented
              value={method}
              onChange={setMethod}
              className="w-full [&>button]:flex-1 [&>button]:justify-center"
              options={[
                { value: "cash", label: (<><Banknote className="size-4" /> {tr("نقداً", "Cash")}</>) },
                { value: "transfer", label: (<><Smartphone className="size-4" /> {tr("تحويل", "Transfer")}</>) },
              ]}
            />
            {method === "cash" && (
              <Field label={tr("المبلغ المستلم من الزبون", "Cash handed over")} hint={tr("اختياري: لحساب الباقي", "Optional: to work out the change")} error={err.received}>
                <NumberInput aria-label={tr("المبلغ المستلم من الزبون", "Cash handed over")} value={received} onChange={setReceived} suffix={tr("د.ع", "IQD")} invalid={!!err.received || (change !== null && change < 0)} />
              </Field>
            )}
            {change !== null && (
              <p className={cn("rounded-xl p-3 text-center font-bold", change < 0 ? "bg-danger-soft text-danger" : "bg-action/10")}>
                {change < 0 ? tr(`ينقص ${money(-change)}`, `${money(-change)} short`) : tr(`الباقي للزبون: ${money(change)}`, `Change: ${money(change)}`)}
              </p>
            )}
            <Button variant="action" className="h-12 w-full text-base" disabled={!lines.length || busy || (change !== null && change < 0)} onClick={sell}>
              <HandCoins className="size-5" /> {busy ? tr("جارٍ البيع…", "Selling…") : tr(`بِع واستلم ${money(total)}`, `Sell and take ${money(total)}`)}
            </Button>
          </Card>

          {/* Today's counter sales at this warehouse */}
          <Card className="p-4">
            <p className="mb-2 flex items-center gap-1.5 text-sm font-semibold">
              <ReceiptText className="size-4 text-action" /> {tr("مبيعات اليوم المباشرة", "Today's counter sales")}
              <span className="num ms-auto text-muted">{num(todays.length)}</span>
            </p>
            {todays.length ? (
              <ul className="divide-y divide-line">
                {todays
                  .slice()
                  .reverse()
                  .slice(0, 6)
                  .map((i) => (
                    <li key={i.id}>
                      <Link href={`/invoices/${i.id}`} className="-mx-2 flex items-center justify-between gap-2 rounded-lg px-2 py-2 text-sm hover:bg-card-2">
                        <span className="min-w-0">
                          <span className="num block">{i.number}</span>
                          <span className="block truncate text-xs text-muted">
                            {i.counter?.buyer_name || tr("زبون مباشر", "Walk-in")} · {dateTime(i.date)}
                          </span>
                        </span>
                        <b className="num">{money(i.total)}</b>
                      </Link>
                    </li>
                  ))}
              </ul>
            ) : (
              <p className="py-3 text-center text-sm text-muted">{tr("لا مبيعات مباشرة اليوم بعد", "No counter sales yet today")}</p>
            )}
          </Card>
        </div>
      </div>
      {scanning && <BarcodeScanner onClose={() => setScanning(false)} onCode={onScan} />}
    </>
  );
}
