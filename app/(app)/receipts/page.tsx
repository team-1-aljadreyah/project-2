"use client";

import { PackagePlus } from "lucide-react";
import { useApp } from "@/components/shell";
import { Button, Card, DataTable, Empty, ErrorBox, LoadingRows, Money, PageHeader, type Column } from "@/components/ui";
import { api } from "@/lib/api";
import type { Receipt } from "@/lib/api/types";
import { useFmt } from "@/lib/i18n";
import { useLoad } from "@/lib/use-load";

export default function ReceiptsPage() {
  const { tr, dateTime, name } = useFmt();
  const { lookups } = useApp();
  const list = useLoad(() => api.listReceipts(), []);
  const columns: Column<Receipt>[] = [
    { key: "n", head: tr("الرقم", "No."), cell: (r) => <span className="num">{r.number}</span> },
    { key: "d", head: tr("الوقت", "Time"), cell: (r) => dateTime(r.created_at) },
    { key: "w", head: tr("المخزن", "Warehouse"), cell: (r) => name(lookups.warehouses.find((w) => w.id === r.warehouse_id)) },
    { key: "s", head: tr("المورد", "Supplier"), cell: (r) => r.supplier || "-" },
    { key: "l", head: tr("المواد", "Items"), cell: (r) => <span className="num">{r.lines.length}</span>, align: "center" },
    { key: "c", head: tr("الكلفة", "Cost"), cell: (r) => <Money value={r.total_cost} />, align: "end" },
    { key: "b", head: tr("استلمه", "Received by"), cell: (r) => r.created_by.name },
  ];
  return (
    <>
      <PageHeader
        title={tr("استلام البضاعة", "Receiving goods")}
        subtitle={tr("كل استلام يصير دفعة لها تاريخ صلاحية وسعر شراء خاص بها", "Every receipt becomes a batch with its own expiry date and purchase price")}
        actions={
          <Button variant="action" href="/receipts/new">
            <PackagePlus className="size-4" /> {tr("استلام جديد", "New receipt")}
          </Button>
        }
      />
      <Card>
        {list.state.status === "loading" ? (
          <LoadingRows />
        ) : list.state.status === "error" ? (
          <ErrorBox error={list.state.error} onRetry={list.reload} />
        ) : (
          <DataTable
            rows={list.data ?? []}
            columns={columns}
            rowKey={(r) => r.id}
            onRowHref={(r) => `/receipts/${r.id}`}
            mobile={(r) => (
              <div className="flex justify-between gap-2">
                <div>
                  <p className="num font-semibold">{r.number}</p>
                  <p className="text-xs text-muted">
                    {dateTime(r.created_at)} · {name(lookups.warehouses.find((w) => w.id === r.warehouse_id))}
                  </p>
                </div>
                <div className="text-end text-sm">
                  <Money value={r.total_cost} />
                  <p className="text-xs text-muted">
                    {r.lines.length} {tr("مادة", "items")}
                  </p>
                </div>
              </div>
            )}
            empty={<Empty icon={<PackagePlus className="size-6" />} title={tr("لا يوجد استلام بعد", "No receipts yet")} />}
          />
        )}
      </Card>
    </>
  );
}
