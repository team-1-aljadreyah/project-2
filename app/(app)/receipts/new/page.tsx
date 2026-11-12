"use client";

import { BarcodeScanner, ScanButton, itemByBarcode } from "@/components/barcode-scanner";

import { useUnsaved } from "@/lib/unsaved";

import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { CheckCircle2, ClipboardCheck, Plus, Trash2 } from "lucide-react";
import { useApp } from "@/components/shell";
import { useMyWarehouses } from "@/components/warehouse-filter";
import { Button, Card, Field, Input, LoadingRows, Money, NumberInput, Notice, PageHeader, Segmented, Select, errorText, useToast } from "@/components/ui";
import { api, ApiError } from "@/lib/api";
import type { SupplyOrder, Unit } from "@/lib/api/types";
import { useLoad } from "@/lib/use-load";
import { useFmt } from "@/lib/i18n";
import { cn, today } from "@/lib/utils";
import { toUnit } from "@/lib/api/supply";

interface Row {
  key: number;
  item_id: number | "";
  unit: Unit;
  qty: number | "";
  expiry_date: string;
  price: number | ""; // per carton or per piece, following unit
  /** From a supply order: how much of this item is still expected, in the order's unit. */
  ordered?: { qty: number; unit: Unit };
}

let k = 0;
const blank = (): Row => ({ key: ++k, item_id: "", unit: "carton", qty: "", expiry_date: "", price: "" });

// ?supply=<id>: receiving the goods of a supply order. The form opens filled in with what is still missing.
export default function NewReceiptPage() {
  return (
    <Suspense fallback={<LoadingRows />}>
      <FromSupply />
    </Suspense>
  );
}

function FromSupply() {
  const id = Number(useSearchParams().get("supply")) || 0;
  const supply = useLoad(() => (id ? api.getSupplyOrder(id) : Promise.resolve(null)), [id]);
  if (id && supply.state.status === "loading") return <LoadingRows />;
  return <NewReceipt key={supply.data?.id ?? 0} supply={supply.data ?? null} />;
}

function NewReceipt({ supply }: { supply: SupplyOrder | null }) {
  const { tr, name, money, num, unit: un } = useFmt();
  const { user, lookups, items, itemById, reloadItems } = useApp();
  const router = useRouter();
  const toast = useToast();
  const mine = useMyWarehouses();
  const [warehouse, setWarehouse] = useState<number>(supply?.warehouse_id ?? user.warehouse_id ?? lookups.warehouses[0].id);
  const [supplier, setSupplier] = useState(supply?.supplier ?? "");
  // From a supply order: one line per item still expected. The keeper counts what really came and writes it
  // (empty = not counted yet, 0 = didn't come); the difference with the order shows on each line and below.
  const [rows, setRows] = useState<Row[]>(() =>
    supply
      ? supply.lines
          .filter((l) => l.received_qty < l.qty)
          .map((l) => {
            const left = Math.round((l.qty - l.received_qty) * 100) / 100;
            return { key: ++k, item_id: l.item_id, unit: l.unit, qty: "" as const, expiry_date: "", price: l.price, ordered: { qty: left, unit: l.unit } };
          })
      : [blank()],
  );
  // "The rest will not come": the order closes with what arrived (only asked when something is short).
  const [closeShort, setCloseShort] = useState(false);
  const [err, setErr] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const set = (key: number, p: Partial<Row>) => setRows((r) => r.map((x) => (x.key === key ? { ...x, ...p } : x)));
  // A scanned item: its line if it has one (the quantity box gets the cursor), or a new line for it.
  const [scanning, setScanning] = useState(false);
  function onScan(code: string) {
    setScanning(false);
    const it = itemByBarcode(items, code);
    if (!it) {
      toast("danger", tr(`لا مادة بالباركود ${code}`, `No item with barcode ${code}`));
      return;
    }
    const existing = rows.find((r) => r.item_id === it.id);
    const key = existing?.key ?? ++k;
    if (!existing) {
      // An empty line (nothing chosen yet) is replaced; otherwise the item comes as a new line.
      const line: Row = { ...blank(), key, item_id: it.id, price: it.avg_cost ? it.avg_cost * it.pieces_per_carton : "" };
      setRows((r) => [...r.filter((x) => x.item_id !== "" || x.qty !== "" || x.ordered), line]);
    }
    toast("success", existing ? tr(`${name(it)}: اكتب الكمية`, `${name(it)}: write the quantity`) : tr(`أُضيف سطر: ${name(it)}`, `Line added: ${name(it)}`));
    setTimeout(() => document.querySelector<HTMLInputElement>(`[data-row="${key}"] input[inputmode]`)?.focus(), 150);
  }

  // Sent: every chosen item, except the order's lines that didn't come (0 or not written).
  const filled = rows.filter((r) => r.item_id && (!r.ordered || (typeof r.qty === "number" && r.qty > 0)));
  // Something counted or chosen and not saved: leaving asks first.
  useUnsaved(!busy && rows.some((r) => (r.ordered ? r.qty !== "" : !!r.item_id) || r.expiry_date));
  // Each order line: what came, in the order's unit, and the difference (negative = less came).
  const arrivedOf = (r: Row) => {
    const it = r.item_id ? itemById.get(r.item_id) : undefined;
    return r.ordered ? toUnit(it, typeof r.qty === "number" ? r.qty : 0, r.unit, r.ordered.unit) : 0;
  };
  const diffOf = (r: Row) => (r.ordered ? Math.round((arrivedOf(r) - r.ordered.qty) * 100) / 100 : 0);
  const orderRows = rows.filter((r) => r.ordered);
  const counted = orderRows.every((r) => r.qty !== "");
  const shortRows = orderRows.filter((r) => diffOf(r) < 0);
  const overRows = orderRows.filter((r) => diffOf(r) > 0);
  const extraRows = supply ? rows.filter((r) => !r.ordered && r.item_id) : [];
  const perPiece = (r: Row) => {
    const it = r.item_id ? itemById.get(r.item_id) : undefined;
    if (!it || r.price === "") return 0;
    return r.unit === "carton" ? Math.round(r.price / it.pieces_per_carton) : r.price;
  };
  const total = filled.reduce((s, r) => s + (typeof r.qty === "number" && typeof r.price === "number" ? r.qty * r.price : 0), 0);

  async function save() {
    setBusy(true);
    setErr({});
    try {
      const rec = await api.createReceipt({
        warehouse_id: warehouse,
        supplier,
        ...(supply ? { supply_order_id: supply.id, ...(closeShort && shortRows.length ? { close_supply: true } : {}) } : {}),
        lines: filled.map((r) => ({
          item_id: r.item_id as number,
          unit: r.unit,
          qty: typeof r.qty === "number" ? r.qty : 0,
          expiry_date: r.expiry_date,
          purchase_price: perPiece(r),
        })),
      });
      toast("success", tr(`تم حفظ الاستلام ${rec.number} وأُضيفت الدفعات إلى المخزون`, `Saved ${rec.number}. Batches added to stock`));
      reloadItems();
      // From a supply order: back to the order, which now shows ordered against arrived.
      router.push(supply ? `/supply?open=${supply.id}` : `/receipts/${rec.id}`);
    } catch (e) {
      if (e instanceof ApiError && e.errors) setErr(e.errors);
      toast("danger", errorText(e, tr));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <PageHeader title={tr("استلام بضاعة", "Receive goods")} back={supply ? "/supply" : "/receipts"} subtitle={tr("كل سطر يصبح دفعة بتاريخ صلاحيته وسعر شرائه", "Each line becomes a batch with its own expiry and cost")} />
      {supply && (
        <div className="mb-4">
          <Notice tone="primary" title={tr(`استلام طلب التوريد ${supply.number}`, `Receiving supply order ${supply.number}`)}>
            {tr(
              "عُدّ ما وصل فعلاً واكتب كميته في كل سطر (0 إذا لم يصل)، مع تاريخ الصلاحية. يظهر الفرق عن الطلب تحت كل سطر وفي الملخص قبل الحفظ.",
              "Count what really came and write it on each line (0 if it didn't come), with the expiry date. The difference from the order shows on each line and in the summary before saving.",
            )}
          </Notice>
        </div>
      )}
      <Card className="mb-4 grid gap-3 p-4 sm:grid-cols-2">
        <Field label={tr("المخزن", "Warehouse")}>
          <Select value={warehouse} onChange={(e) => setWarehouse(Number(e.target.value))} disabled={!!mine && mine.length < 2}>
            {lookups.warehouses.filter((w) => !mine || mine.includes(w.id)).map((w) => (
              <option key={w.id} value={w.id}>
                {name(w)}
              </option>
            ))}
          </Select>
        </Field>
        <Field label={tr("المورد", "Supplier")}>
          <Input value={supplier} onChange={(e) => setSupplier(e.target.value)} placeholder={tr("اسم الشركة الموردة", "Supplier company")} />
        </Field>
      </Card>

      <div className="space-y-3">
        {rows.map((r, i) => {
          const it = r.item_id ? itemById.get(r.item_id) : undefined;
          const idx = filled.indexOf(r);
          const e = (f: string) => (idx >= 0 ? err[`lines.${idx}.${f}`] : undefined);
          return (
            <Card key={r.key} data-row={r.key} className={cn("p-4", idx >= 0 && Object.keys(err).some((x) => x.startsWith(`lines.${idx}.`)) && "border-danger")}>
              <div className="mb-3 flex items-center justify-between">
                <span className="text-sm font-semibold text-muted">
                  {tr("سطر", "Line")} {i + 1}
                </span>
                {r.ordered && <OrderedChip row={r} diff={diffOf(r)} />}
                {!r.ordered && rows.length > 1 && (
                  <button type="button" aria-label={tr("حذف", "Remove")} onClick={() => setRows((x) => x.filter((y) => y.key !== r.key))} className="flex size-8 items-center justify-center rounded-lg text-faint hover:bg-danger-soft hover:text-danger">
                    <Trash2 className="size-4" />
                  </button>
                )}
              </div>
              <div className="grid gap-3 md:grid-cols-[2fr_auto_1fr_1fr_1.2fr]">
                <Field label={tr("المادة", "Item")} error={e("item_id")}>
                  <Select value={r.item_id} disabled={!!r.ordered} onChange={(ev) => set(r.key, { item_id: Number(ev.target.value) || "" })}>
                    <option value="">{tr("اختر المادة", "Choose item")}</option>
                    {items
                      .filter((x) => x.active)
                      .map((x) => (
                        <option key={x.id} value={x.id}>
                          {name(x)}
                        </option>
                      ))}
                  </Select>
                </Field>
                <Field label={tr("الوحدة", "Unit")}>
                  <Segmented
                    value={r.unit}
                    onChange={(u) => set(r.key, { unit: u })}
                    options={[
                      { value: "carton", label: un(itemById.get(Number(r.item_id)), "carton") },
                      { value: "piece", label: un(itemById.get(Number(r.item_id)), "piece") },
                    ]}
                  />
                </Field>
                <Field
                  label={r.ordered ? tr("الواصل فعلاً", "Really arrived") : tr("الكمية", "Quantity")}
                  error={e("qty")}
                  hint={it && r.unit === "carton" && typeof r.qty === "number" ? `= ${r.qty * it.pieces_per_carton} ${tr("قطعة", "pcs")}` : undefined}
                >
                  <NumberInput value={r.qty} onChange={(v) => set(r.key, { qty: v })} invalid={!!e("qty")} placeholder={r.ordered ? tr("عُدّ واكتب", "Count it") : undefined} />
                  {r.ordered && r.qty === "" && (
                    <button type="button" className="mt-1 text-xs font-semibold text-primary-ink hover:underline" onClick={() => set(r.key, { qty: toUnit(it, r.ordered!.qty, r.ordered!.unit, r.unit) })}>
                      {tr("وصل كما طُلب", "Came as ordered")}
                    </button>
                  )}
                </Field>
                <Field label={tr("تاريخ الصلاحية", "Expiry date")} error={e("expiry_date")}>
                  <Input type="date" min={today(1)} value={r.expiry_date} onChange={(ev) => set(r.key, { expiry_date: ev.target.value })} invalid={!!e("expiry_date")} />
                </Field>
                <Field label={tr(`سعر شراء ال${un(itemById.get(Number(r.item_id)), r.unit)}`, `Cost per ${un(itemById.get(Number(r.item_id)), r.unit)}`)} error={e("purchase_price")} hint={it && r.unit === "carton" && r.price ? `${money(perPiece(r))} / ${tr("قطعة", "pc")}` : undefined}>
                  <NumberInput value={r.price} onChange={(v) => set(r.key, { price: v })} suffix={tr("د.ع", "IQD")} invalid={!!e("purchase_price")} />
                </Field>
              </div>
              {it && it.avg_cost && perPiece(r) > it.avg_cost * 1.15 && (
                <p className="mt-2 text-xs text-warning">{tr(`السعر أعلى من متوسط الشراء (${money(it.avg_cost)}/قطعة)`, `Higher than the average cost (${money(it.avg_cost)}/pc)`)}</p>
              )}
            </Card>
          );
        })}
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        <Button onClick={() => setRows((r) => [...r, blank()])}>
          <Plus className="size-4" /> {tr("أضف سطر", "Add line")}
        </Button>
        <ScanButton onClick={() => setScanning(true)} label={tr("امسح باركود مادة", "Scan an item")} />
      </div>
      {scanning && <BarcodeScanner onClose={() => setScanning(false)} onCode={onScan} />}

      {supply && (
        <Card className="mt-4 p-4">
          <h3 className="mb-3 flex items-center gap-2 font-bold">
            <ClipboardCheck className="size-5" /> {tr("المطلوب مقابل الواصل", "Ordered vs arrived")}
          </h3>
          <ul className="divide-y divide-line overflow-hidden rounded-xl border border-line text-sm">
            {orderRows.map((r) => {
              const it = r.item_id ? itemById.get(r.item_id) : undefined;
              const d = diffOf(r);
              return (
                <li key={r.key} className="flex items-center gap-3 px-3 py-2">
                  <span className="min-w-0 flex-1 truncate font-medium">{it ? name(it) : ""}</span>
                  <span className="text-xs text-muted">
                    {tr("طُلب", "Ordered")} <span className="num font-semibold text-text">{num(r.ordered!.qty)}</span> · {tr("وصل", "Arrived")}{" "}
                    <span className="num font-semibold text-text">{r.qty === "" ? "؟" : num(arrivedOf(r))}</span>
                  </span>
                  <DiffBadge diff={r.qty === "" ? null : d} unit={r.ordered!.unit} itemId={Number(r.item_id)} />
                </li>
              );
            })}
            {extraRows.map((r) => {
              const it = r.item_id ? itemById.get(r.item_id) : undefined;
              return (
                <li key={r.key} className="flex items-center gap-3 px-3 py-2">
                  <span className="min-w-0 flex-1 truncate font-medium">{it ? name(it) : ""}</span>
                  <span className="rounded-md bg-warning-soft px-1.5 py-0.5 text-[11px] font-bold text-warning">{tr("غير مطلوب في الطلب", "Not on the order")}</span>
                </li>
              );
            })}
          </ul>
          <p className="mt-3 text-sm">
            {!counted
              ? tr("اكتب الواصل في كل السطور لترى الفرق كاملاً.", "Write what arrived on every line to see the whole difference.")
              : !shortRows.length && !overRows.length && !extraRows.length
                ? tr("✓ وصل مطابقاً للطلب تماماً.", "✓ Arrived exactly as ordered.")
                : [
                    shortRows.length ? tr(`ناقص ${shortRows.length} من المواد`, `${shortRows.length} items short`) : "",
                    overRows.length ? tr(`زائد ${overRows.length}`, `${overRows.length} over`) : "",
                    extraRows.length ? tr(`${extraRows.length} غير مطلوبة`, `${extraRows.length} not ordered`) : "",
                  ]
                    .filter(Boolean)
                    .join(tr("، ", ", "))}
          </p>
          {shortRows.length > 0 && (
            <div className="mt-3">
              <p className="mb-1.5 text-xs font-medium text-muted">{tr("الناقص:", "What's short:")}</p>
              <Segmented
                value={closeShort ? "close" : "later"}
                onChange={(v) => setCloseShort(v === "close")}
                options={[
                  { value: "later", label: tr("يصل لاحقاً (يبقى الطلب مفتوحاً)", "Comes later (order stays open)") },
                  { value: "close", label: tr("لن يصل: أغلق الطلب بالنقص", "Won't come: close it short") },
                ]}
              />
            </div>
          )}
        </Card>
      )}

      {err.lines && (
        <div className="mt-3">
          <Notice tone="danger">{err.lines}</Notice>
        </div>
      )}
      <Card className="mt-4 flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-sm text-muted">
            {filled.length} {tr("مادة", "items")} · {tr("كلفة الاستلام", "Receipt cost")}
          </p>
          <Money value={total} className="text-xl font-bold" />
        </div>
        <Button variant="action" size="lg" loading={busy} disabled={!filled.length || (!!supply && !counted)} onClick={save}>
          <CheckCircle2 className="size-5" /> {tr("حفظ الاستلام", "Save receipt")}
        </Button>
      </Card>
    </>
  );
}

/** The difference of one order line: short (red), over (amber) or as ordered (green). */
function DiffBadge({ diff, unit, itemId }: { diff: number | null; unit: Unit; itemId: number }) {
  const { tr, num, unit: un } = useFmt();
  const u = un(useApp().itemById.get(itemId), unit, true);
  if (diff === null) return <span className="rounded-md bg-card-2 px-1.5 py-0.5 text-[11px] font-bold text-muted">{tr("لم يُعدّ", "Not counted")}</span>;
  if (diff === 0) return <span className="rounded-md bg-success-soft px-1.5 py-0.5 text-[11px] font-bold text-success">{tr("مطابق", "Matches")}</span>;
  return (
    <span className={cn("rounded-md px-1.5 py-0.5 text-[11px] font-bold", diff < 0 ? "bg-danger-soft text-danger" : "bg-warning-soft text-warning")}>
      {diff < 0 ? tr(`ناقص ${num(-diff)} ${u}`, `${num(-diff)} ${u} short`) : tr(`زائد ${num(diff)} ${u}`, `${num(diff)} ${u} over`)}
    </span>
  );
}

/** On an order line: "ordered N" and, once counted, the difference. */
function OrderedChip({ row, diff }: { row: Row; diff: number }) {
  const { tr, num, unit: un } = useFmt();
  const u = un(useApp().itemById.get(Number(row.item_id)), row.ordered!.unit, true);
  return (
    <span className="flex items-center gap-1.5 text-xs">
      <span className="text-muted">
        {tr("المطلوب", "Ordered")}: <span className="num font-semibold text-text">{num(row.ordered!.qty)}</span> {u}
      </span>
      <DiffBadge diff={row.qty === "" ? null : diff} unit={row.ordered!.unit} itemId={Number(row.item_id)} />
    </span>
  );
}
