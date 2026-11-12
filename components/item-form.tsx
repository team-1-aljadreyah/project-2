"use client";

// Add / edit an item (manager): carton size, minimum stock, commission and a price for every tier.
import { useState } from "react";
import { api, ApiError } from "@/lib/api";
import type { Item, ItemInput } from "@/lib/api/types";
import { useFmt } from "@/lib/i18n";
import { useApp } from "./shell";
import { Button, Dialog, Field, Input, NumberInput, Notice, Switch, errorText, useToast } from "./ui";

export function ItemForm({ open, onClose, item, onSaved }: { open: boolean; onClose: () => void; item?: Item; onSaved?: (i: Item) => void }) {
  const { tr, name } = useFmt();
  const { lookups, reloadItems } = useApp();
  const toast = useToast();
  const [f, setF] = useState<ItemInput>(() => ({
    name: item?.name ?? "",
    name_en: item?.name_en ?? "",
    category: item?.category ?? lookups.categories[0] ?? "",
    barcode: item?.barcode ?? "",
    pieces_per_carton: item?.pieces_per_carton ?? 12,
    min_stock: item?.min_stock ?? 120,
    commission_percent: item?.commission_percent ?? 2,
    weight_kg: item?.weight_kg,
    prices: lookups.tiers.map((t) => item?.prices.find((p) => p.tier_id === t.id) ?? { tier_id: t.id, carton_price: 0, piece_price: 0 }),
    active: item?.active ?? true,
  }));
  const [err, setErr] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const set = (p: Partial<ItemInput>) => setF((x) => ({ ...x, ...p }));
  const setPrice = (tier: number, p: { carton_price?: number; piece_price?: number }) => set({ prices: f.prices.map((x) => (x.tier_id === tier ? { ...x, ...p } : x)) });

  async function save() {
    setBusy(true);
    setErr({});
    try {
      const it = await api.saveItem(item?.id ?? null, f);
      toast("success", tr("تم حفظ المادة", "Item saved"));
      reloadItems();
      onSaved?.(it);
      onClose();
    } catch (e) {
      if (e instanceof ApiError && e.errors) setErr(e.errors);
      toast("danger", errorText(e, tr));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      wide
      title={item ? tr("تعديل المادة", "Edit item") : tr("مادة جديدة", "New item")}
      footer={
        <>
          <Button onClick={onClose}>{tr("إلغاء", "Cancel")}</Button>
          <Button variant="primary" loading={busy} onClick={save}>
            {tr("حفظ", "Save")}
          </Button>
        </>
      }
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label={tr("اسم المادة", "Item name")} error={err.name}>
          <Input value={f.name} onChange={(e) => set({ name: e.target.value })} invalid={!!err.name} />
        </Field>
        <Field label={tr("الاسم بالإنكليزي", "English name")}>
          <Input dir="ltr" value={f.name_en} onChange={(e) => set({ name_en: e.target.value })} />
        </Field>
        <Field label={tr("الصنف", "Category")}>
          <Input list="cats" value={f.category} onChange={(e) => set({ category: e.target.value })} />
          <datalist id="cats">
            {lookups.categories.map((c) => (
              <option key={c} value={c} />
            ))}
          </datalist>
        </Field>
        <Field label={tr("الباركود", "Barcode")}>
          <Input dir="ltr" inputMode="numeric" value={f.barcode} onChange={(e) => set({ barcode: e.target.value })} />
        </Field>
        <Field label={tr("عدد القطع في الكارتون", "Pieces per carton")} error={err.pieces_per_carton}>
          <NumberInput value={f.pieces_per_carton} onChange={(v) => set({ pieces_per_carton: v === "" ? 0 : v })} invalid={!!err.pieces_per_carton} />
        </Field>
        <Field label={tr("الحد الأدنى (بالقطعة)", "Minimum stock (pieces)")} error={err.min_stock} hint={tr("إذا نزل المخزون عنه يصلك إشعار", "You get a notification below this")}>
          <NumberInput value={f.min_stock} onChange={(v) => set({ min_stock: v === "" ? 0 : v })} />
        </Field>
        <Field label={tr("وزن القطعة (كغم)", "Weight of one piece (kg)")} error={err.weight_kg} hint={tr("لحساب حمولة السيارات", "For the vehicles' loads")}>
          <Input type="number" step="0.01" min={0} dir="ltr" value={f.weight_kg ?? ""} onChange={(e) => set({ weight_kg: e.target.value === "" ? undefined : Number(e.target.value) })} />
        </Field>
        <Field label={tr("عمولة المندوب %", "Rep commission %")} error={err.commission_percent} hint={tr("على المبلغ المدفوع فعلاً", "On money actually paid")}>
          <Input type="number" step="0.5" min={0} max={50} dir="ltr" value={f.commission_percent} onChange={(e) => set({ commission_percent: Number(e.target.value) })} />
        </Field>
        <div className="flex items-end">
          <Switch checked={f.active} onChange={(v) => set({ active: v })} label={tr("المادة فعّالة (تظهر للبيع)", "Active (can be sold)")} />
        </div>
      </div>

      <h3 className="mb-2 mt-5 text-sm font-semibold">{tr("الأسعار حسب نوع الزبون", "Prices by customer tier")}</h3>
      <div className="overflow-hidden rounded-xl border border-line">
        <div className="grid grid-cols-[1fr_1fr_1fr] gap-2 bg-card-2 px-3 py-2 text-xs text-muted">
          <span>{tr("النوع", "Tier")}</span>
          <span>{tr("سعر الكارتون", "Carton price")}</span>
          <span>{tr("سعر القطعة", "Piece price")}</span>
        </div>
        {f.prices.map((p) => (
          <div key={p.tier_id} className="grid grid-cols-[1fr_1fr_1fr] items-center gap-2 border-t border-line px-3 py-2">
            <span className="text-sm font-medium">{name(lookups.tiers.find((t) => t.id === p.tier_id))}</span>
            <NumberInput value={p.carton_price || ""} onChange={(v) => setPrice(p.tier_id, { carton_price: v === "" ? 0 : v })} invalid={!!err[`prices.${p.tier_id}.carton_price`]} />
            <NumberInput value={p.piece_price || ""} onChange={(v) => setPrice(p.tier_id, { piece_price: v === "" ? 0 : v })} invalid={!!err[`prices.${p.tier_id}.piece_price`]} />
          </div>
        ))}
      </div>
      {item && (
        <div className="mt-3">
          <Notice tone="primary">{tr("تغيير السعر يسري على الطلبات الجديدة فقط. الفواتير القديمة تبقى بسعرها.", "A new price applies to new orders only. Old invoices keep their price.")}</Notice>
        </div>
      )}
    </Dialog>
  );
}
