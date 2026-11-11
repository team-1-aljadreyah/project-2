"use client";

import { useState } from "react";
import { AlertTriangle, ArrowLeftRight, Boxes, ClipboardCheck, PackagePlus, PackageX } from "lucide-react";
import { useApp } from "@/components/shell";
import { hasWarehouseFilter, setWarehouseFilter, useWarehouseFilter } from "@/components/warehouse-filter";
import { BatchStatusBadge } from "@/components/status";
import { Badge, Button, Card, DataTable, Empty, ErrorBox, LoadingRows, PageHeader, SearchBox, Segmented, Select, Stat, type Column } from "@/components/ui";
import { api, type ShelfRow } from "@/lib/api";
import type { DamagedRecord, NearExpiryRow } from "@/lib/api/types";
import { useFmt } from "@/lib/i18n";
import { useLoad } from "@/lib/use-load";
import { matches } from "@/lib/utils";

type Tab = "stock" | "expiry" | "damaged";

export default function StockPage() {
  const { tr, name, qty, dateTime } = useFmt();
  const { user, lookups, itemById } = useApp();
  const [tab, setTab] = useState<Tab>("stock");
  // Keeper / staff: their own warehouse. Manager / accountant: the warehouse filter of the top bar.
  const globalWh = useWarehouseFilter();
  const [ownWh, setOwnWh] = useState<number | "">(user.role === "warehouse" || user.role === "staff" ? (user.warehouse_id ?? "") : "");
  const wh: number | "" = hasWarehouseFilter(user) ? (globalWh ?? "") : ownWh;
  const setWh = (v: number | "") => (hasWarehouseFilter(user) ? setWarehouseFilter(v || null) : setOwnWh(v));
  const [q, setQ] = useState("");
  const [onlyLow, setOnlyLow] = useState(false);
  const shelf = useLoad(() => api.shelfStock(), []);
  const expiry = useLoad(() => api.nearExpiry(lookups.settings.near_expiry_days), [lookups.settings.near_expiry_days]);
  const damaged = useLoad(() => api.listDamaged(), []);
  const orders = useLoad(() => api.listOrders(), []);
  const toIssue = (orders.data ?? []).filter((o) => o.status === "approved" && !o.delivery && (!wh || o.warehouse_id === wh)).length;

  const sum = (r: ShelfRow, k: "on_shelf" | "sellable" | "reserved" | "expired") => r.by_warehouse.filter((w) => !wh || w.warehouse_id === wh).reduce((s, w) => s + w[k], 0);
  const rows = (shelf.data ?? []).filter((r) => {
    const it = itemById.get(r.item_id);
    if (!it || !it.active) return false;
    if (onlyLow && !(it.stock.total < it.min_stock)) return false;
    return matches(q, it.name, it.name_en, it.barcode);
  });
  const exp = (expiry.data ?? []).filter((r) => !wh || r.batch.warehouse_id === wh);
  const dmg = (damaged.data ?? []).filter((d) => !wh || d.warehouse_id === wh);
  const lowCount = [...itemById.values()].filter((i) => i.active && i.stock.total < i.min_stock).length;

  const stockCols: Column<ShelfRow>[] = [
    { key: "n", head: tr("المادة", "Item"), cell: (r) => name(itemById.get(r.item_id)) },
    { key: "s", head: tr("على الرف", "On shelf"), cell: (r) => qty(sum(r, "on_shelf"), itemById.get(r.item_id)?.pieces_per_carton ?? 1) },
    { key: "res", head: tr("محجوز لطلبات", "Held"), cell: (r) => <span className="text-primary-ink">{sum(r, "reserved") ? qty(sum(r, "reserved"), itemById.get(r.item_id)?.pieces_per_carton ?? 1) : "-"}</span> },
    { key: "e", head: tr("منتهي", "Expired"), cell: (r) => (sum(r, "expired") ? <span className="text-danger">{qty(sum(r, "expired"), itemById.get(r.item_id)?.pieces_per_carton ?? 1)}</span> : "-") },
    {
      key: "a",
      head: tr("متوفر للبيع", "Sellable"),
      cell: (r) => {
        const it = itemById.get(r.item_id);
        const low = it && it.stock.total < it.min_stock;
        return (
          <span className={low ? "font-semibold text-danger" : "font-semibold"}>
            {qty(sum(r, "sellable"), it?.pieces_per_carton ?? 1)} {low && <AlertTriangle className="inline size-3.5" />}
          </span>
        );
      },
    },
  ];
  const expCols: Column<NearExpiryRow>[] = [
    { key: "n", head: tr("المادة", "Item"), cell: (r) => name(itemById.get(r.batch.item_id)) },
    { key: "b", head: tr("الدفعة", "Batch"), cell: (r) => <span className="num">#{r.batch.id}</span> },
    { key: "w", head: tr("المخزن", "Warehouse"), cell: (r) => name(lookups.warehouses.find((w) => w.id === r.batch.warehouse_id)) },
    { key: "e", head: tr("الصلاحية", "Expiry"), cell: (r) => <span className="num">{r.batch.expiry_date}</span> },
    { key: "q", head: tr("الكمية", "Qty"), cell: (r) => qty(r.batch.qty_left, itemById.get(r.batch.item_id)?.pieces_per_carton ?? 1) },
    { key: "s", head: tr("الحالة", "Status"), cell: (r) => <BatchStatusBadge status={r.batch.status} days={r.days_left} /> },
  ];
  const dmgCols: Column<DamagedRecord>[] = [
    { key: "t", head: tr("الوقت", "Time"), cell: (d) => dateTime(d.created_at) },
    { key: "n", head: tr("المادة", "Item"), cell: (d) => name(itemById.get(d.item_id)) },
    { key: "q", head: tr("الكمية", "Qty"), cell: (d) => qty(d.pieces, itemById.get(d.item_id)?.pieces_per_carton ?? 1) },
    { key: "s", head: tr("المصدر", "Source"), cell: (d) => <Badge tone={d.source === "return" ? "warning" : "danger"}>{d.source === "return" ? tr("مرتجع تالف", "Damaged return") : d.source === "stocktake" ? tr("نقص في الجرد", "Count shortage") : tr("منتهي", "Expired")}</Badge> },
    { key: "r", head: tr("المرجع", "Ref"), cell: (d) => <span className="text-muted">{d.ref}</span> },
  ];

  return (
    <>
      <PageHeader
        title={tr("المخزون", "Stock")}
        subtitle={user.role === "warehouse" || user.role === "staff" ? name(lookups.warehouses.find((w) => w.id === user.warehouse_id)) : tr("المخزنين: الصناعة والحر", "Both warehouses: Al-Sinaa and Al-Hur")}
        actions={
          user.role !== "accountant" && user.role !== "staff" && (
            <>
              <Button href="/stocktakes">
                <ClipboardCheck className="size-4" /> {tr("جرد", "Count")}
              </Button>
              <Button href="/transfers">
                <ArrowLeftRight className="size-4" /> {tr("تحويل", "Transfer")}
              </Button>
              <Button variant="action" href="/receipts/new">
                <PackagePlus className="size-4" /> {tr("استلام بضاعة", "Receive goods")}
              </Button>
            </>
          )
        }
      />
      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label={tr("مواد تحت الحد الأدنى", "Below minimum")} value={lowCount} tone="danger" icon={<AlertTriangle className="size-4" />} href="/items" />
        <Stat label={tr("دفعات قريبة الانتهاء", "Expiring batches")} value={exp.filter((r) => r.days_left >= 0).length} tone="warning" icon={<AlertTriangle className="size-4" />} />
        <Stat label={tr("دفعات منتهية (لا تُباع)", "Expired batches")} value={exp.filter((r) => r.days_left < 0).length} tone="danger" icon={<PackageX className="size-4" />} />
        <Stat label={tr("طلبات تنتظر التجهيز", "Orders to issue")} value={toIssue} icon={<Boxes className="size-4" />} href="/orders" />
      </div>
      <Card>
        <div className="flex flex-col gap-3 border-b border-line p-3 xl:flex-row xl:items-center xl:justify-between">
          <Segmented
            value={tab}
            onChange={setTab}
            options={[
              { value: "stock", label: tr("الكميات", "Quantities") },
              { value: "expiry", label: tr("الصلاحية", "Expiry"), count: exp.length },
              { value: "damaged", label: tr("التالف والنقص", "Damaged"), count: dmg.length },
            ]}
          />
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            {tab === "stock" && (
              <label className="flex items-center gap-2 text-sm text-muted">
                <input type="checkbox" checked={onlyLow} onChange={(e) => setOnlyLow(e.target.checked)} className="size-4 accent-[var(--primary)]" />
                {tr("تحت الحد الأدنى فقط", "Below minimum only")}
              </label>
            )}
            <Select value={wh} onChange={(e) => setWh(Number(e.target.value) || "")} disabled={user.role === "warehouse" || user.role === "staff"} className="sm:w-56">
              <option value="">{tr("كل المخازن", "All warehouses")}</option>
              {lookups.warehouses.map((w) => (
                <option key={w.id} value={w.id}>
                  {name(w)}
                </option>
              ))}
            </Select>
            {tab === "stock" && <SearchBox value={q} onChange={setQ} placeholder={tr("ابحث عن مادة", "Search item")} className="sm:w-56" />}
          </div>
        </div>
        {shelf.state.status === "loading" ? (
          <LoadingRows />
        ) : shelf.state.status === "error" ? (
          <ErrorBox error={shelf.state.error} onRetry={shelf.reload} />
        ) : tab === "stock" ? (
          <DataTable
            rows={rows}
            columns={stockCols}
            rowKey={(r) => r.item_id}
            onRowHref={(r) => `/items/${r.item_id}`}
            mobile={(r) => {
              const it = itemById.get(r.item_id);
              return (
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-medium">{name(it)}</p>
                    <p className="text-xs text-muted">
                      {tr("على الرف", "On shelf")} {qty(sum(r, "on_shelf"), it?.pieces_per_carton ?? 1)}
                      {sum(r, "expired") > 0 && <span className="text-danger"> · {tr("منتهي", "expired")} {sum(r, "expired")}</span>}
                    </p>
                  </div>
                  <p className={`text-sm font-semibold ${it && it.stock.total < it.min_stock ? "text-danger" : ""}`}>{qty(sum(r, "sellable"), it?.pieces_per_carton ?? 1)}</p>
                </div>
              );
            }}
            empty={<Empty title={tr("لا توجد مواد", "No items")} />}
          />
        ) : tab === "expiry" ? (
          <DataTable rows={exp} columns={expCols} rowKey={(r) => r.batch.id} onRowHref={(r) => `/items/${r.batch.item_id}`} empty={<Empty title={tr("لا توجد دفعات قريبة الانتهاء", "Nothing expiring soon")} />} />
        ) : (
          <DataTable rows={dmg} columns={dmgCols} rowKey={(d) => d.id} empty={<Empty title={tr("لا يوجد تالف", "Nothing damaged")} />} />
        )}
      </Card>
    </>
  );
}
