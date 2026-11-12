"use client";

import { useUnsaved } from "@/lib/unsaved";
import { CustomInputs, missingRequired, saveCustom, useFields } from "@/components/custom-fields";

// Add / edit an item (manager): its units (the big pack and the single, their names, which are sold),
// minimum stock, commission and a price for every tier; and delete it.
import { useState } from "react";
import { api, ApiError } from "@/lib/api";
import type { Item, ItemInput } from "@/lib/api/types";
import { useFmt } from "@/lib/i18n";
import { useApp } from "./shell";
import { Button, Dialog, Field, Input, NumberInput, Notice, Segmented, Switch, errorText, useToast } from "./ui";
import { Trash2 } from "lucide-react";
import { PACK_NAMES, PIECE_NAMES } from "@/lib/units";

export function ItemForm({ open, onClose, item, onSaved, onDeleted }: { open: boolean; onClose: () => void; item?: Item; onSaved?: (i: Item) => void; onDeleted?: () => void }) {
  const { tr, name } = useFmt();
  const { lookups, reloadItems, items } = useApp();
  const toast = useToast();
  const [f, setF] = useState<ItemInput>(() => ({
    name: item?.name ?? "",
    name_en: item?.name_en ?? "",
    category: item?.category ?? lookups.categories[0] ?? "",
    barcode: item?.barcode ?? "",
    pieces_per_carton: item?.pieces_per_carton ?? 12,
    pack_name: item?.pack_name ?? "كارتون",
    piece_name: item?.piece_name ?? "قطعة",
    sells: item?.sells ?? "both",
    min_stock: item?.min_stock ?? 120,
    commission_percent: item?.commission_percent ?? 2,
    weight_kg: item?.weight_kg,
    brand: item?.brand ?? "",
    prices: lookups.tiers.map((t) => item?.prices.find((p) => p.tier_id === t.id) ?? { tier_id: t.id, carton_price: 0, piece_price: 0 }),
    active: item?.active ?? true,
  }));
  const [err, setErr] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const set = (p: Partial<ItemInput>) => setF((x) => ({ ...x, ...p }));
  // Changed and not saved: leaving the page asks first.
  const [start] = useState(() => JSON.stringify(f));
  useUnsaved(open && !busy && JSON.stringify(f) !== start);
  const setPrice = (tier: number, p: { carton_price?: number; piece_price?: number }) => set({ prices: f.prices.map((x) => (x.tier_id === tier ? { ...x, ...p } : x)) });
  // The manager's own fields (advanced settings), saved right after the item.
  const [cv, setCv] = useState<Record<string, string | number | boolean | null>>(() => ({ ...item?.custom }));
  const { editable } = useFields("item");

  // The names as typed (empty = the usual ones), for the labels below.
  const pack = f.pack_name?.trim() || "كارتون";
  const piece = f.piece_name?.trim() || "قطعة";
  const single = f.pieces_per_carton <= 1;
  const sells = single ? "piece" : (f.sells ?? "both");
  const [confirmDelete, setConfirmDelete] = useState(false);

  async function remove() {
    if (!item) return;
    setBusy(true);
    try {
      const r = await api.deleteItem(item.id);
      toast(
        "success",
        r.result === "removed"
          ? tr(`حُذفت ${item.name} نهائياً`, `${item.name_en || item.name} deleted`)
          : tr(`حُذفت ${item.name}: لها فواتير قديمة فبقي اسمها فيها`, `${item.name_en || item.name} deleted; old invoices keep its name`),
      );
      reloadItems();
      setConfirmDelete(false);
      onClose();
      onDeleted?.();
    } catch (e) {
      setConfirmDelete(false);
      toast("danger", errorText(e, tr));
    } finally {
      setBusy(false);
    }
  }

  async function save() {
    const missing = missingRequired(editable, cv);
    if (missing.length) {
      setErr(Object.fromEntries(missing.map((m) => [`custom.${m.id}`, tr("مطلوب", "Required")])));
      return;
    }
    setBusy(true);
    setErr({});
    try {
      const it = await api.saveItem(item?.id ?? null, f);
      await saveCustom("item", it.id, item?.custom, cv);
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
          {item && (
            <Button variant="ghost" className="me-auto text-danger" onClick={() => setConfirmDelete(true)} disabled={busy}>
              <Trash2 className="size-4" /> {tr("حذف المادة", "Delete item")}
            </Button>
          )}
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
        <Field label={tr("العلامة التجارية", "Brand")} error={err.brand} hint={tr("تظهر للمحلات في صف العلامات وفي البحث", "Shops see it in the brands row and in search")}>
          <Input list="brands" value={f.brand ?? ""} onChange={(e) => set({ brand: e.target.value })} invalid={!!err.brand} />
          <datalist id="brands">
            {[...new Set(items.map((i) => i.brand).filter(Boolean))].map((b) => (
              <option key={b} value={b} />
            ))}
          </datalist>
        </Field>
        <Field label={tr("الباركود", "Barcode")}>
          <Input dir="ltr" inputMode="numeric" value={f.barcode} onChange={(e) => set({ barcode: e.target.value })} />
        </Field>
        {/* The units: rice in 5 kg bags is «كيس» (and maybe «شوال» of 10), oil is «كارتون» of 12 «قنينة». */}
        <div className="grid gap-3 rounded-xl border border-line bg-card-2/50 p-3 sm:col-span-2 sm:grid-cols-3">
          <p className="text-sm font-semibold sm:col-span-3">{tr("وحدات البيع", "Selling units")}</p>
          <Field label={tr("الوحدة الصغيرة", "The single")} error={err.piece_name} hint={tr("قطعة، كيس، علبة، قنينة…", "piece, bag, can, bottle…")}>
            <Input list="piece-names" aria-label={tr("الوحدة الصغيرة", "The single")} value={f.piece_name} onChange={(e) => set({ piece_name: e.target.value })} invalid={!!err.piece_name} />
            <datalist id="piece-names">
              {PIECE_NAMES.map((n) => (
                <option key={n} value={n} />
              ))}
            </datalist>
          </Field>
          <Field label={tr("الوحدة الكبيرة", "The big pack")} error={err.pack_name} hint={tr("كارتون، شوال، صندوق، ربطة…", "carton, sack, box, bundle…")}>
            <Input list="pack-names" aria-label={tr("الوحدة الكبيرة", "The big pack")} value={f.pack_name} onChange={(e) => set({ pack_name: e.target.value })} invalid={!!err.pack_name} disabled={single} />
            <datalist id="pack-names">
              {PACK_NAMES.map((n) => (
                <option key={n} value={n} />
              ))}
            </datalist>
          </Field>
          <Field label={tr(`كم ${piece} في ال${pack}؟`, `${piece} in a ${pack}`)} error={err.pieces_per_carton} hint={tr("1 = لا وحدة كبيرة", "1 = no big pack")}>
            <NumberInput value={f.pieces_per_carton} onChange={(v) => set({ pieces_per_carton: v === "" ? 0 : v })} invalid={!!err.pieces_per_carton} />
          </Field>
          <div className="sm:col-span-3">
            <p className="mb-1.5 text-sm">{tr("تُباع بـ", "Sold by")}</p>
            {single ? (
              <p className="text-sm text-muted">{tr(`${piece} فقط (لا وحدة كبيرة)`, `${piece} only (no big pack)`)}</p>
            ) : (
              <Segmented
                className="flex-wrap"
                value={sells}
                onChange={(v) => set({ sells: v })}
                options={[
                  { value: "both", label: tr(`${pack} و${piece}`, `${pack} and ${piece}`) },
                  { value: "pack", label: tr(`${pack} فقط`, `${pack} only`) },
                  { value: "piece", label: tr(`${piece} فقط`, `${piece} only`) },
                ]}
              />
            )}
          </div>
        </div>
        <Field label={tr(`الحد الأدنى (بال${piece})`, `Minimum stock (${piece})`)} error={err.min_stock} hint={tr("إذا نزل المخزون عنه يصلك إشعار", "You get a notification below this")}>
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
          <span>{tr(`سعر ال${pack}`, `${pack} price`)}</span>
          <span>{tr(`سعر ال${piece}`, `${piece} price`)}</span>
        </div>
        {f.prices.map((p) => (
          <div key={p.tier_id} className="grid grid-cols-[1fr_1fr_1fr] items-center gap-2 border-t border-line px-3 py-2">
            <span className="text-sm font-medium">{name(lookups.tiers.find((t) => t.id === p.tier_id))}</span>
            {/* A unit that isn't sold has no price to type (it follows from the other one). */}
            <NumberInput aria-label={tr(`سعر ال${pack}`, `${pack} price`)} disabled={sells === "piece"} placeholder={sells === "piece" ? "—" : undefined} value={sells === "piece" ? "" : p.carton_price || ""} onChange={(v) => setPrice(p.tier_id, { carton_price: v === "" ? 0 : v })} invalid={!!err[`prices.${p.tier_id}.carton_price`]} />
            <NumberInput aria-label={tr(`سعر ال${piece}`, `${piece} price`)} disabled={sells === "pack"} placeholder={sells === "pack" ? "—" : undefined} value={sells === "pack" ? "" : p.piece_price || ""} onChange={(v) => setPrice(p.tier_id, { piece_price: v === "" ? 0 : v })} invalid={!!err[`prices.${p.tier_id}.piece_price`]} />
          </div>
        ))}
      </div>
      {item && (
        <div className="mt-3">
          <Notice tone="primary">{tr("تغيير السعر يسري على الطلبات الجديدة فقط. الفواتير القديمة تبقى بسعرها.", "A new price applies to new orders only. Old invoices keep their price.")}</Notice>
        </div>
      )}
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <CustomInputs object="item" values={cv} onChange={setCv} errors={err} />
      </div>
      {item && confirmDelete && (
        <Dialog
          open
          onClose={() => setConfirmDelete(false)}
          title={tr(`حذف ${item.name}؟`, `Delete ${item.name_en || item.name}?`)}
          footer={
            <>
              <Button onClick={() => setConfirmDelete(false)}>{tr("تراجع", "Back")}</Button>
              <Button variant="danger" loading={busy} onClick={remove}>
                <Trash2 className="size-4" /> {tr("نعم، احذف", "Yes, delete")}
              </Button>
            </>
          }
        >
          <p className="text-sm">
            {tr(
              "إن لم تُستلم هذه المادة ولم تُبع أبداً تُحذف نهائياً. وإن كانت لها فواتير أو استلامات قديمة تختفي من كل القوائم والمتجر، ويبقى اسمها في سجلاتها القديمة. لا تُحذف وفي المخازن منها شيء، أو عليها طلب لم يُسلَّم.",
              "Never received nor sold: it is deleted for good. With old invoices or receipts: it disappears from every list and the store, and the old records keep its name. It can't be deleted while some is in stock or on an undelivered order.",
            )}
          </p>
        </Dialog>
      )}
    </Dialog>
  );
}
