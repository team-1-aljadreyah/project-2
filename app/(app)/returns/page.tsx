"use client";

import { useState } from "react";
import { Plus, Undo2 } from "lucide-react";
import { useApp } from "@/components/shell";
import { Badge, Button, Card, DataTable, Empty, ErrorBox, LoadingRows, Money, PageHeader, SearchBox, type Column } from "@/components/ui";
import { api } from "@/lib/api";
import type { Return } from "@/lib/api/types";
import { useFmt } from "@/lib/i18n";
import { useLoad } from "@/lib/use-load";
import { matches } from "@/lib/utils";

export default function ReturnsPage() {
  const { tr, dateTime, ago } = useFmt();
  const { user, itemById } = useApp();
  const list = useLoad(() => api.listReturns(), []);
  const customers = useLoad(() => api.listCustomers().catch(() => []), []);
  const [q, setQ] = useState("");
  const cName = (id: number) => customers.data?.find((c) => c.id === id)?.name ?? `#${id}`;
  const rows = (list.data ?? []).filter((r) => matches(q, r.number, cName(r.customer_id), r.note));
  const canCreate = ["manager", "accountant", "rep"].includes(user.role);
  const conditions = (r: Return) => {
    const good = r.lines.filter((l) => l.condition === "good").length;
    const bad = r.lines.length - good;
    return (
      <span className="flex gap-1">
        {good > 0 && <Badge tone="success">{tr("سليم", "Good")} {good}</Badge>}
        {bad > 0 && <Badge tone="danger">{tr("تالف", "Damaged")} {bad}</Badge>}
      </span>
    );
  };

  const columns: Column<Return>[] = [
    { key: "n", head: tr("الرقم", "No."), cell: (r) => <span className="num">{r.number}</span> },
    { key: "d", head: tr("الوقت", "Time"), cell: (r) => dateTime(r.created_at) },
    { key: "c", head: tr("الزبون", "Customer"), cell: (r) => cName(r.customer_id) },
    { key: "i", head: tr("المواد", "Items"), cell: (r) => r.lines.map((l) => itemById.get(l.item_id)?.name).join("، ") },
    { key: "k", head: tr("الحالة", "Condition"), cell: conditions },
    { key: "a", head: tr("المبلغ", "Amount"), cell: (r) => <Money value={r.amount} className="font-semibold" />, align: "end" },
  ];

  return (
    <>
      <PageHeader
        title={tr("المرتجعات", "Returns")}
        subtitle={tr("السليم يرجع للمخزون، والتالف ينسجل تالفاً وما ينباع. المرتجع ينقص من دين الزبون وعمولة المندوب.", "Good stock goes back on the shelf, damaged is written off. A return lowers the customer's debt and the rep's commission.")}
        actions={
          canCreate && (
            <Button variant="primary" href="/returns/new">
              <Plus className="size-4" /> {tr("مرتجع جديد", "New return")}
            </Button>
          )
        }
      />
      <Card>
        <div className="border-b border-line p-3">
          <SearchBox value={q} onChange={setQ} placeholder={tr("الرقم، الزبون أو الملاحظة", "No., customer or note")} className="max-w-sm" />
        </div>
        {list.state.status === "loading" ? (
          <LoadingRows />
        ) : list.state.status === "error" ? (
          <ErrorBox error={list.state.error} onRetry={list.reload} />
        ) : (
          <DataTable
            rows={rows}
            columns={columns}
            rowKey={(r) => r.id}
            onRowHref={(r) => `/returns/${r.id}`}
            mobile={(r) => (
              <div className="space-y-1">
                <div className="flex justify-between gap-2">
                  <span className="font-semibold">{cName(r.customer_id)}</span>
                  <Money value={r.amount} className="font-semibold" />
                </div>
                <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
                  <span className="num">{r.number}</span> · {ago(r.created_at)} {conditions(r)}
                </div>
              </div>
            )}
            empty={<Empty icon={<Undo2 className="size-6" />} title={tr("لا توجد مرتجعات", "No returns")} />}
          />
        )}
      </Card>
    </>
  );
}
