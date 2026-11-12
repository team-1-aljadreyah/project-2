"use client";

import { Printer } from "lucide-react";
import { useApp } from "@/components/shell";
import { Button, Card, ClickRow, ErrorBox, KV, LoadingRows, Money, PageHeader, RefLink } from "@/components/ui";
import { api } from "@/lib/api";
import { useFmt } from "@/lib/i18n";
import { useLoad } from "@/lib/use-load";
import { useIdParam } from "@/lib/utils";

export default function ReceiptView() {
  const id = useIdParam();
  const { tr, dateTime, name, qty } = useFmt();
  const { lookups, itemById } = useApp();
  const r = useLoad(() => api.getReceipt(id), [id]);
  if (r.state.status === "loading") return <LoadingRows />;
  if (r.state.status === "error" || !r.data) return <ErrorBox error={r.state.status === "error" ? r.state.error : null} />;
  const x = r.data;
  return (
    <>
      <PageHeader
        back="/receipts"
        title={
          <span>
            {tr("استلام", "Receipt")} <span className="num">{x.number}</span>
          </span>
        }
        subtitle={`${dateTime(x.created_at)} · ${x.created_by.name}`}
        actions={
          <Button onClick={() => window.print()}>
            <Printer className="size-4" /> {tr("طباعة", "Print")}
          </Button>
        }
      />
      <Card className="print-area mb-4 max-w-4xl p-4">
        <KV k={tr("المخزن", "Warehouse")} v={name(lookups.warehouses.find((w) => w.id === x.warehouse_id))} />
        <KV k={tr("المورد", "Supplier")} v={x.supplier || "-"} />
        <KV k={tr("الكلفة الكلية", "Total cost")} v={<Money value={x.total_cost} />} />
      </Card>
      <Card className="max-w-4xl overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-line bg-card-2 text-xs text-muted">
              <th className="px-4 py-2 text-start font-medium">{tr("المادة", "Item")}</th>
              <th className="px-4 py-2 text-start font-medium">{tr("الدفعة", "Batch")}</th>
              <th className="px-4 py-2 text-start font-medium">{tr("الكمية", "Qty")}</th>
              <th className="px-4 py-2 text-start font-medium">{tr("الصلاحية", "Expiry")}</th>
              <th className="px-4 py-2 text-end font-medium">{tr("الشراء/قطعة", "Cost/pc")}</th>
            </tr>
          </thead>
          <tbody>
            {x.lines.map((l) => {
              const it = itemById.get(l.item_id);
              return (
                <ClickRow key={l.batch_id} href={`/items/${l.item_id}`} className="border-b border-line last:border-0">
                  <td className="px-4 py-3">
                    <RefLink href={`/items/${l.item_id}`}>{name(it)}</RefLink>
                  </td>
                  <td className="num px-4 py-3">#{l.batch_id}</td>
                  <td className="px-4 py-3">{it && qty(l.pieces, it.pieces_per_carton, it)}</td>
                  <td className="num px-4 py-3">{l.expiry_date}</td>
                  <td className="px-4 py-3 text-end">
                    <Money value={l.purchase_price} />
                  </td>
                </ClickRow>
              );
            })}
          </tbody>
        </table>
      </Card>
    </>
  );
}
