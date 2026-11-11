"use client";

import { useState } from "react";
import { Pencil } from "lucide-react";
import { ItemForm } from "@/components/item-form";
import { ItemPhoto } from "@/components/item-photo";
import { useApp } from "@/components/shell";
import { BatchStatusBadge } from "@/components/status";
import { Badge, Button, Card, CardHeader, DataTable, Empty, ErrorBox, KV, LoadingRows, Money, Notice, PageHeader, type Column } from "@/components/ui";
import { api } from "@/lib/api";
import type { Batch } from "@/lib/api/types";
import { useFmt } from "@/lib/i18n";
import { useLoad } from "@/lib/use-load";
import { daysUntil, useIdParam } from "@/lib/utils";

export default function ItemView() {
  const id = useIdParam();
  const { tr, name, qty, date } = useFmt();
  const { user, lookups, itemById } = useApp();
  const it = itemById.get(id);
  const batches = useLoad(() => api.itemBatches(id), [id]);
  const [edit, setEdit] = useState(false);
  if (!it) return <ErrorBox error={null} />;
  const live = (batches.data ?? []).filter((b) => b.qty_left > 0);
  const low = it.stock.total < it.min_stock;

  const columns: Column<Batch>[] = [
    { key: "id", head: tr("الدفعة", "Batch"), cell: (b) => <span className="num">#{b.id}</span> },
    { key: "w", head: tr("المخزن", "Warehouse"), cell: (b) => name(lookups.warehouses.find((w) => w.id === b.warehouse_id)) },
    { key: "e", head: tr("الصلاحية", "Expiry"), cell: (b) => <span className="num">{b.expiry_date}</span> },
    { key: "s", head: tr("الحالة", "Status"), cell: (b) => <BatchStatusBadge status={b.status} days={daysUntil(b.expiry_date)} /> },
    { key: "q", head: tr("الباقي", "Left"), cell: (b) => qty(b.qty_left, it.pieces_per_carton) },
    { key: "r", head: tr("المستلم", "Received"), cell: (b) => <span className="text-muted">{qty(b.qty_received, it.pieces_per_carton)}</span> },
    ...(user.role !== "rep" && user.role !== "staff" ? [{ key: "p", head: tr("سعر الشراء/قطعة", "Cost/pc"), cell: (b: Batch) => <Money value={b.purchase_price} />, align: "end" as const }] : []),
    { key: "d", head: tr("تاريخ الاستلام", "Received on"), cell: (b) => <span className="text-muted">{date(b.received_at)}</span> },
  ];

  return (
    <>
      <PageHeader
        back="/items"
        title={name(it)}
        subtitle={`${it.category} · ${tr("الكارتون", "Carton")} = ${it.pieces_per_carton} ${tr("قطعة", "pcs")}`}
        actions={
          user.role === "manager" && (
            <Button onClick={() => setEdit(true)}>
              <Pencil className="size-4" /> {tr("تعديل المادة والأسعار", "Edit item and prices")}
            </Button>
          )
        }
      />
      {low && (
        <div className="mb-4">
          <Notice tone="danger" title={tr("المخزون تحت الحد الأدنى", "Stock is below the minimum")}>
            {tr(`المتوفر ${qty(it.stock.total, it.pieces_per_carton)} والحد الأدنى ${qty(it.min_stock, it.pieces_per_carton)}`, `Available ${qty(it.stock.total, it.pieces_per_carton)}, minimum ${qty(it.min_stock, it.pieces_per_carton)}`)}
          </Notice>
        </div>
      )}
      <div className="mb-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <ItemPhoto item={it} />
        <Card className="p-4">
          <p className="text-xs text-muted">{tr("المتوفر للبيع", "Sellable")}</p>
          <p className="mt-1 text-2xl font-bold">{qty(it.stock.total, it.pieces_per_carton)}</p>
          <div className="mt-3 border-t border-line pt-2">
            {it.stock.by_warehouse.map((w) => (
              <KV key={w.warehouse_id} k={name(lookups.warehouses.find((x) => x.id === w.warehouse_id))} v={qty(w.qty, it.pieces_per_carton)} />
            ))}
            <KV k={tr("الحد الأدنى", "Minimum")} v={qty(it.min_stock, it.pieces_per_carton)} />
          </div>
        </Card>
        <Card className="p-4">
          <p className="mb-2 text-xs text-muted">{tr("الأسعار", "Prices")}</p>
          {it.prices.map((p) => (
            <KV
              key={p.tier_id}
              k={name(lookups.tiers.find((t) => t.id === p.tier_id))}
              v={
                <span>
                  <Money value={p.carton_price} /> <span className="text-xs text-muted">/ {tr("كارتون", "ctn")}</span> · <Money value={p.piece_price} /> <span className="text-xs text-muted">/ {tr("قطعة", "pc")}</span>
                </span>
              }
            />
          ))}
        </Card>
        <Card className="p-4">
          <KV k={tr("عمولة المندوب", "Rep commission")} v={<span className="num">{it.commission_percent}%</span>} />
          {it.avg_cost !== undefined && <KV k={tr("متوسط سعر الشراء/قطعة", "Avg cost/pc")} v={<Money value={it.avg_cost} />} />}
          <KV k={tr("أقرب صلاحية", "Nearest expiry")} v={<span className="num">{it.nearest_expiry ?? "-"}</span>} />
          <KV k={tr("الباركود", "Barcode")} v={<span className="num">{it.barcode ?? "-"}</span>} />
          <KV k={tr("الحالة", "Status")} v={it.active ? <Badge tone="success">{tr("فعّالة", "Active")}</Badge> : <Badge>{tr("موقوفة", "Inactive")}</Badge>} />
        </Card>
      </div>
      <Card>
        <CardHeader title={tr("الدفعات (الأقدم صلاحية أولاً)", "Batches (oldest expiry first)")} subtitle={tr("هذا هو الترتيب الذي تخرج به البضاعة عند البيع. المنتهية لا تُباع.", "Goods leave in this order when sold. Expired batches are never sold.")} />
        {batches.state.status === "loading" ? (
          <LoadingRows rows={3} />
        ) : (
          <DataTable
            rows={live}
            columns={columns}
            rowKey={(b) => b.id}
            mobile={(b) => (
              <div className="flex items-center justify-between gap-2">
                <div>
                  <p className="num font-medium">
                    #{b.id} · {b.expiry_date}
                  </p>
                  <p className="text-xs text-muted">{name(lookups.warehouses.find((w) => w.id === b.warehouse_id))}</p>
                </div>
                <div className="text-end">
                  <p className="text-sm font-semibold">{qty(b.qty_left, it.pieces_per_carton)}</p>
                  <BatchStatusBadge status={b.status} days={daysUntil(b.expiry_date)} />
                </div>
              </div>
            )}
            empty={<Empty title={tr("لا توجد دفعات في المخزن", "No batches in stock")} />}
          />
        )}
      </Card>
      {edit && <ItemForm open item={it} onClose={() => setEdit(false)} />}
    </>
  );
}
