"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { CheckCircle2, Plus, Trash2 } from "lucide-react";
import { useApp } from "@/components/shell";
import { Button, Card, Field, Input, Money, NumberInput, Notice, PageHeader, Segmented, Select, errorText, useToast } from "@/components/ui";
import { api, ApiError } from "@/lib/api";
import type { Unit } from "@/lib/api/types";
import { useFmt } from "@/lib/i18n";
import { cn, today } from "@/lib/utils";

interface Row {
  key: number;
  item_id: number | "";
  unit: Unit;
  qty: number | "";
  expiry_date: string;
  price: number | ""; // per carton or per piece, following unit
}

let k = 0;
const blank = (): Row => ({ key: ++k, item_id: "", unit: "carton", qty: "", expiry_date: "", price: "" });

export default function NewReceiptPage() {
  const { tr, name, money } = useFmt();
  const { user, lookups, items, itemById, reloadItems } = useApp();
  const router = useRouter();
  const toast = useToast();
  const [warehouse, setWarehouse] = useState<number>(user.warehouse_id ?? lookups.warehouses[0].id);
  const [supplier, setSupplier] = useState("");
  const [rows, setRows] = useState<Row[]>([blank()]);
  const [err, setErr] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const set = (key: number, p: Partial<Row>) => setRows((r) => r.map((x) => (x.key === key ? { ...x, ...p } : x)));

  const filled = rows.filter((r) => r.item_id);
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
      router.push(`/receipts/${rec.id}`);
    } catch (e) {
      if (e instanceof ApiError && e.errors) setErr(e.errors);
      toast("danger", errorText(e, tr));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <PageHeader title={tr("استلام بضاعة", "Receive goods")} back="/receipts" subtitle={tr("كل سطر يصبح دفعة بتاريخ صلاحيته وسعر شرائه", "Each line becomes a batch with its own expiry and cost")} />
      <Card className="mb-4 grid gap-3 p-4 sm:grid-cols-2">
        <Field label={tr("المخزن", "Warehouse")}>
          <Select value={warehouse} onChange={(e) => setWarehouse(Number(e.target.value))} disabled={user.role === "warehouse"}>
            {lookups.warehouses.map((w) => (
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
            <Card key={r.key} className={cn("p-4", idx >= 0 && Object.keys(err).some((x) => x.startsWith(`lines.${idx}.`)) && "border-danger")}>
              <div className="mb-3 flex items-center justify-between">
                <span className="text-sm font-semibold text-muted">
                  {tr("سطر", "Line")} {i + 1}
                </span>
                {rows.length > 1 && (
                  <button type="button" aria-label={tr("حذف", "Remove")} onClick={() => setRows((x) => x.filter((y) => y.key !== r.key))} className="flex size-8 items-center justify-center rounded-lg text-faint hover:bg-danger-soft hover:text-danger">
                    <Trash2 className="size-4" />
                  </button>
                )}
              </div>
              <div className="grid gap-3 md:grid-cols-[2fr_auto_1fr_1fr_1.2fr]">
                <Field label={tr("المادة", "Item")} error={e("item_id")}>
                  <Select value={r.item_id} onChange={(ev) => set(r.key, { item_id: Number(ev.target.value) || "" })}>
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
                      { value: "carton", label: tr("كارتون", "Carton") },
                      { value: "piece", label: tr("قطعة", "Piece") },
                    ]}
                  />
                </Field>
                <Field label={tr("الكمية", "Quantity")} error={e("qty")} hint={it && r.unit === "carton" && typeof r.qty === "number" ? `= ${r.qty * it.pieces_per_carton} ${tr("قطعة", "pcs")}` : undefined}>
                  <NumberInput value={r.qty} onChange={(v) => set(r.key, { qty: v })} invalid={!!e("qty")} />
                </Field>
                <Field label={tr("تاريخ الصلاحية", "Expiry date")} error={e("expiry_date")}>
                  <Input type="date" min={today(1)} value={r.expiry_date} onChange={(ev) => set(r.key, { expiry_date: ev.target.value })} invalid={!!e("expiry_date")} />
                </Field>
                <Field label={r.unit === "carton" ? tr("سعر شراء الكارتون", "Cost per carton") : tr("سعر شراء القطعة", "Cost per piece")} error={e("purchase_price")} hint={it && r.unit === "carton" && r.price ? `${money(perPiece(r))} / ${tr("قطعة", "pc")}` : undefined}>
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
      <Button className="mt-3" onClick={() => setRows((r) => [...r, blank()])}>
        <Plus className="size-4" /> {tr("أضف سطر", "Add line")}
      </Button>

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
        <Button variant="action" size="lg" loading={busy} disabled={!filled.length} onClick={save}>
          <CheckCircle2 className="size-5" /> {tr("حفظ الاستلام", "Save receipt")}
        </Button>
      </Card>
    </>
  );
}
