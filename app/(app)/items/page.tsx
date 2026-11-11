"use client";

import { useState } from "react";
import { AlertTriangle, Package, Plus } from "lucide-react";
import { ItemForm } from "@/components/item-form";
import { useApp } from "@/components/shell";
import { useWarehouseFilter } from "@/components/warehouse-filter";
import { Badge, Button, Card, DataTable, Empty, Money, PageHeader, SearchBox, Segmented, Select, type Column } from "@/components/ui";
import type { Item } from "@/lib/api/types";
import { useFmt } from "@/lib/i18n";
import { daysUntil, matches, priceOf } from "@/lib/utils";

export default function ItemsPage() {
  const { tr, name, qty, money } = useFmt();
  const { user, items, lookups } = useApp();
  const [q, setQ] = useState("");
  const [cat, setCat] = useState("");
  const [f, setF] = useState<"all" | "low" | "inactive">("all");
  const [add, setAdd] = useState(false);
  const [tier, setTier] = useState(lookups.tiers[1]?.id ?? lookups.tiers[0].id);
  const wh = useWarehouseFilter();
  // The stock shown: the chosen warehouse only (manager / accountant filter), or both.
  const stockOf = (i: Item) => (wh ? (i.stock.by_warehouse.find((w) => w.warehouse_id === wh)?.qty ?? 0) : i.stock.total);
  const low = (i: Item) => stockOf(i) < (wh ? i.min_stock / 2 : i.min_stock);
  const rows = items.filter(
    (i) => (f === "all" ? i.active : f === "low" ? i.active && low(i) : !i.active) && (!cat || i.category === cat) && matches(q, i.name, i.name_en, i.barcode, i.category),
  );
  const seesCost = user.role !== "rep";

  const columns: Column<Item>[] = [
    { key: "n", head: tr("المادة", "Item"), cell: (i) => name(i) },
    { key: "c", head: tr("الصنف", "Category"), cell: (i) => <span className="text-muted">{i.category}</span> },
    { key: "p", head: tr("بالكارتون", "Per carton"), cell: (i) => <span className="num">{i.pieces_per_carton}</span>, align: "center" },
    { key: "pc", head: tr("سعر الكارتون", "Carton price"), cell: (i) => <Money value={priceOf(i, tier, "carton")} />, align: "end" },
    { key: "pp", head: tr("سعر القطعة", "Piece price"), cell: (i) => <Money value={priceOf(i, tier, "piece")} />, align: "end" },
    ...(seesCost ? [{ key: "cost", head: tr("متوسط الشراء/قطعة", "Avg cost/pc"), cell: (i: Item) => <Money value={i.avg_cost} className="text-muted" />, align: "end" as const }] : []),
    {
      key: "s",
      head: tr("المتوفر للبيع", "Sellable"),
      cell: (i) => (
        <span className={low(i) ? "font-semibold text-danger" : ""}>
          {qty(stockOf(i), i.pieces_per_carton)} {low(i) && <AlertTriangle className="inline size-3.5" />}
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
  ];

  return (
    <>
      <PageHeader
        title={tr("المواد والأسعار", "Items and prices")}
        subtitle={tr(`${items.filter((i) => i.active).length} مادة · الكمية المعروضة هي المتوفرة للبيع (بدون المنتهي والمحجوز)`, `${items.filter((i) => i.active).length} items · quantities are sellable stock (no expired, no held)`)}
        actions={
          user.role === "manager" && (
            <Button variant="primary" onClick={() => setAdd(true)}>
              <Plus className="size-4" /> {tr("مادة جديدة", "New item")}
            </Button>
          )
        }
      />
      <Card>
        <div className="flex flex-col gap-3 border-b border-line p-3 xl:flex-row xl:items-center xl:justify-between">
          <Segmented
            value={f}
            onChange={setF}
            options={[
              { value: "all", label: tr("الفعّالة", "Active"), count: items.filter((i) => i.active).length },
              { value: "low", label: tr("تحت الحد الأدنى", "Below minimum"), count: items.filter((i) => i.active && low(i)).length },
              ...(user.role === "manager" ? [{ value: "inactive" as const, label: tr("الموقوفة", "Inactive"), count: items.filter((i) => !i.active).length }] : []),
            ]}
          />
          <div className="flex flex-col gap-2 sm:flex-row">
            <Select value={cat} onChange={(e) => setCat(e.target.value)} className="sm:w-40">
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
            <SearchBox value={q} onChange={setQ} placeholder={tr("الاسم أو الباركود", "Name or barcode")} className="sm:w-64" />
          </div>
        </div>
        <DataTable
          rows={rows}
          columns={columns}
          rowKey={(i) => i.id}
          onRowHref={user.role === "rep" ? undefined : (i) => `/items/${i.id}`}
          mobile={(i) => (
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="font-medium">{name(i)}</p>
                <p className="text-xs text-muted">
                  {i.category} · {i.pieces_per_carton} {tr("بالكارتون", "per carton")}
                </p>
                <p className={`text-xs ${low(i) ? "text-danger" : "text-muted"}`}>{qty(stockOf(i), i.pieces_per_carton)}</p>
              </div>
              <div className="text-end text-sm">
                <p className="num font-semibold">{money(priceOf(i, tier, "carton"))}</p>
                <p className="num text-xs text-muted">{money(priceOf(i, tier, "piece"))} / {tr("قطعة", "pc")}</p>
                {low(i) && <Badge tone="danger">{tr("قليل", "Low")}</Badge>}
              </div>
            </div>
          )}
          empty={<Empty icon={<Package className="size-6" />} title={tr("لا توجد مواد", "No items")} />}
        />
      </Card>
      {add && <ItemForm open onClose={() => setAdd(false)} />}
    </>
  );
}
