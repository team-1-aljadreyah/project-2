"use client";

import { BarcodeScanner, ScanButton } from "@/components/barcode-scanner";

import { useRemembered } from "@/lib/remember";
import { useCustomColumns } from "@/components/custom-fields";

import { useRef, useState } from "react";
import { CalendarClock, AlertTriangle, ImagePlus, Package, Plus } from "lucide-react";
import { EditText } from "@/components/customize";
import { ItemForm } from "@/components/item-form";
import { useApp } from "@/components/shell";
import { useWarehouseFilter } from "@/components/warehouse-filter";
import { Badge, Button, Card, DataTable, Empty, Money, PageHeader, SearchBox, Segmented, Select, errorText, useToast, type Column } from "@/components/ui";
import { api } from "@/lib/api";
import { PriceScheduleDialog, ScheduledPrices } from "@/components/price-schedule";
import type { Item, ItemQuick } from "@/lib/api/types";
import { useFmt } from "@/lib/i18n";
import { soldUnits } from "@/lib/units";
import { shrinkImage } from "@/lib/image";
import { useCustomizing } from "@/lib/site";
import { daysUntil, matches, priceOf } from "@/lib/utils";

export default function ItemsPage() {
  const { tr, name, qty, money, lang, unit: un } = useFmt();
  const { user, items, lookups, reloadItems } = useApp();
  const toast = useToast();
  // Customize mode (manager): the name and the prices are changed in the list, and a photo column shows.
  const editing = useCustomizing() && user.role === "manager";
  const quick = (id: number, change: ItemQuick) =>
    api
      .quickItem(id, change)
      .then(() => {
        reloadItems();
        toast("success", tr("تم الحفظ، ويظهر التغيير في كل الصفحات", "Saved. The change shows on every page"));
      })
      .catch((e) => toast("danger", errorText(e, tr)));
  const [q, setQ] = useRemembered("items:q", "");
  // A scanned barcode goes into the search (it matches the barcode).
  const [scanning, setScanning] = useState(false);
  const [cat, setCat] = useRemembered("items:cat", "");
  const [f, setF] = useState<"all" | "low" | "inactive">("all");
  const [add, setAdd] = useState(false);
  const [schedule, setSchedule] = useState(false);
  const [tier, setTier] = useState(lookups.tiers[1]?.id ?? lookups.tiers[0].id);
  const wh = useWarehouseFilter();
  // The stock shown: the chosen warehouse only (manager / accountant filter), or both.
  const stockOf = (i: Item) => (wh ? (i.stock.by_warehouse.find((w) => w.warehouse_id === wh)?.qty ?? 0) : i.stock.total);
  const low = (i: Item) => stockOf(i) < (wh ? i.min_stock / 2 : i.min_stock);
  const rows = items.filter((i) => !i.deleted && (f === "all" ? i.active : f === "low" ? i.active && low(i) : !i.active) && (!cat || i.category === cat) && matches(q, i.name, i.name_en, i.barcode, i.category));
  const seesCost = user.role !== "rep";

  const extra = useCustomColumns<Item>("item");
  const columns: Column<Item>[] = [
    ...(editing ? [{ key: "ph", head: tr("الصورة", "Photo"), cell: (i: Item) => <PhotoCell item={i} onDone={reloadItems} /> }] : []),
    { key: "n", head: tr("المادة", "Item"), cell: (i) => <EditText value={name(i)} onSave={(v) => quick(i.id, lang === "ar" ? { name: v } : { name_en: v })} /> },
    { key: "c", head: tr("الصنف", "Category"), cell: (i) => <span className="text-muted">{i.category}</span> },
    {
      key: "p",
      head: tr("الوحدات", "Units"),
      cell: (i) => (
        <span className="text-xs whitespace-nowrap">
          {i.pieces_per_carton > 1 ? `${un(i, "carton")} = ${i.pieces_per_carton} ${un(i, "piece")}` : un(i, "piece")}
          {soldUnits(i).length === 1 && i.pieces_per_carton > 1 && <span className="block text-muted">{tr(`يُباع بال${un(i, soldUnits(i)[0])} فقط`, `${un(i, soldUnits(i)[0])} only`)}</span>}
        </span>
      ),
      align: "center",
      sort: (i) => i.pieces_per_carton,
    },
    {
      key: "pc",
      head: tr("سعر الوحدة الكبيرة", "Big pack price"),
      cell: (i) =>
        soldUnits(i).includes("carton") ? (
          <EditText numeric value={priceOf(i, tier, "carton")} onSave={(v) => quick(i.id, { tier_id: tier, carton_price: Number(v) })}>
            <Money value={priceOf(i, tier, "carton")} /> <span className="text-xs text-muted">/ {un(i, "carton", true)}</span>
          </EditText>
        ) : (
          <span className="text-faint">—</span>
        ),
      align: "end",
    },
    {
      key: "pp",
      head: tr("سعر الوحدة الصغيرة", "Single price"),
      cell: (i) =>
        soldUnits(i).includes("piece") ? (
          <EditText numeric value={priceOf(i, tier, "piece")} onSave={(v) => quick(i.id, { tier_id: tier, piece_price: Number(v) })}>
            <Money value={priceOf(i, tier, "piece")} /> <span className="text-xs text-muted">/ {un(i, "piece", true)}</span>
          </EditText>
        ) : (
          <span className="text-faint">—</span>
        ),
      align: "end",
    },
    ...(seesCost ? [{ key: "cost", head: tr("متوسط الشراء/قطعة", "Avg cost/pc"), cell: (i: Item) => <Money value={i.avg_cost} className="text-muted" />, align: "end" as const }] : []),
    {
      key: "s",
      head: tr("المتوفر للبيع", "Sellable"),
      cell: (i) => (
        <span className={low(i) ? "font-semibold text-danger" : ""}>
          {qty(stockOf(i), i.pieces_per_carton, i)} {low(i) && <AlertTriangle className="inline size-3.5" />}
        </span>
      ),
    },
    {
      key: "e",
      head: tr("أقرب صلاحية", "Nearest expiry"),
      cell: (i) => {
        if (!i.nearest_expiry) return "-";
        const d = daysUntil(i.nearest_expiry);
        return <span className={`num ${d <= 30 ? "text-warning font-medium" : "text-muted"}`}>{i.nearest_expiry}</span>;
      },
    },
    ...extra,
  ];

  return (
    <>
      <PageHeader
        title={tr("المواد والأسعار", "Items and prices")}
        subtitle={tr(
          `${items.filter((i) => i.active).length} مادة · الكمية المعروضة هي المتوفرة للبيع (بدون المنتهي والمحجوز)`,
          `${items.filter((i) => i.active).length} items · quantities are sellable stock (no expired, no held)`,
        )}
        actions={
          user.role === "manager" && (
            <>
              <Button onClick={() => setSchedule(true)}>
                <CalendarClock className="size-4" /> {tr("تغيير الأسعار من تاريخ", "Change prices from a day")}
              </Button>
              <Button variant="primary" onClick={() => setAdd(true)}>
                <Plus className="size-4" /> {tr("مادة جديدة", "New item")}
              </Button>
            </>
          )
        }
      />
      {/* The price changes waiting for their day («تغيير الأسعار من تاريخ»). */}
      {(user.role === "manager" || user.role === "accountant") && <ScheduledPrices />}
      {schedule && <PriceScheduleDialog onClose={() => setSchedule(false)} />}
      <Card>
        <div className="flex flex-col gap-3 border-b border-line p-3 xl:flex-row xl:items-center xl:justify-between">
          <Segmented
            value={f}
            onChange={setF}
            options={[
              { value: "all", label: tr("الفعّالة", "Active"), count: items.filter((i) => i.active).length },
              { value: "low", label: tr("تحت الحد الأدنى", "Below minimum"), count: items.filter((i) => i.active && low(i)).length },
              ...(user.role === "manager" ? [{ value: "inactive" as const, label: tr("الموقوفة", "Inactive"), count: items.filter((i) => !i.active && !i.deleted).length }] : []),
            ]}
          />
          <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
            <Select value={cat} onChange={(e) => setCat(e.target.value)} className="sm:w-40" aria-label={tr("الفئة", "Category")}>
              <option value="">{tr("كل الأصناف", "All categories")}</option>
              {lookups.categories.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </Select>
            <Select value={tier} onChange={(e) => setTier(Number(e.target.value))} className="sm:w-40" aria-label={tr("نوع السعر", "Price tier")}>
              {lookups.tiers.map((t) => (
                <option key={t.id} value={t.id}>
                  {tr("أسعار", "Prices")}: {name(t)}
                </option>
              ))}
            </Select>
            {/* The search takes what room is left, or a line of its own on a tablet (tight with the scan button). */}
            <div className="flex min-w-0 gap-2 sm:min-w-[18rem] sm:flex-1 xl:flex-none">
              <SearchBox value={q} onChange={setQ} placeholder={tr("الاسم أو الباركود", "Name or barcode")} className="min-w-0 flex-1 xl:w-64" />
              <ScanButton onClick={() => setScanning(true)} />
            </div>
          </div>
        </div>
        <DataTable
          rows={rows}
          columns={columns}
          rowKey={(i) => i.id}
          onRowHref={user.role === "rep" || editing ? undefined : (i) => `/items/${i.id}`}
          mobile={(i) => (
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="font-medium">{name(i)}</p>
                <p className="text-xs text-muted">
                  {i.category} · {i.pieces_per_carton > 1 ? `${un(i, "carton")} = ${i.pieces_per_carton} ${un(i, "piece")}` : un(i, "piece")}
                </p>
                <p className={`text-xs ${low(i) ? "text-danger" : "text-muted"}`}>{qty(stockOf(i), i.pieces_per_carton, i)}</p>
              </div>
              <div className="text-end text-sm">
                <p className="num font-semibold">{money(priceOf(i, tier, "carton"))}</p>
                <p className="num text-xs text-muted">
                  {money(priceOf(i, tier, "piece"))} / {tr("قطعة", "pc")}
                </p>
                {low(i) && <Badge tone="danger">{tr("قليل", "Low")}</Badge>}
              </div>
            </div>
          )}
          empty={<Empty icon={<Package className="size-6" />} title={tr("لا توجد مواد", "No items")} />}
        />
      </Card>
      {add && <ItemForm open onClose={() => setAdd(false)} />}
      {scanning && (
        <BarcodeScanner
          onClose={() => setScanning(false)}
          onCode={(code) => {
            setQ(code);
            setScanning(false);
          }}
        />
      )}
    </>
  );
}

/** Customize mode: the item's photo in the list. A click picks a new one. */
function PhotoCell({ item, onDone }: { item: Item; onDone: () => void }) {
  const { tr } = useFmt();
  const toast = useToast();
  const file = useRef<HTMLInputElement>(null);
  return (
    <>
      <button
        type="button"
        onClick={() => file.current?.click()}
        aria-label={tr("تغيير الصورة", "Change the photo")}
        className="flex size-10 items-center justify-center overflow-hidden rounded-lg bg-card-2 text-faint outline-1 outline-offset-2 outline-dashed outline-action/70 hover:bg-action/10"
      >
        {item.image ? (
          // A data URL or the backend's link: a plain <img> (next/image needs known hosts).
          // eslint-disable-next-line @next/next/no-img-element
          <img src={item.image} alt="" className="size-full object-cover" />
        ) : (
          <ImagePlus className="size-4" />
        )}
      </button>
      <input
        ref={file}
        type="file"
        accept="image/*"
        hidden
        onChange={async (e) => {
          const f = e.target.files?.[0];
          e.target.value = "";
          if (!f) return;
          try {
            await api.setItemImage(item.id, await shrinkImage(f));
            onDone();
            toast("success", tr("تم تغيير الصورة", "Photo changed"));
          } catch (err) {
            toast("danger", errorText(err, tr));
          }
        }}
      />
    </>
  );
}
