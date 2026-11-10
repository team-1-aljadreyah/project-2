"use client";

import { useMemo, useState } from "react";
import { Download, ReceiptText } from "lucide-react";
import { useApp } from "@/components/shell";
import { InvoiceStatusBadge } from "@/components/status";
import { Button, Card, DataTable, Empty, ErrorBox, LoadingRows, Money, PageHeader, SearchBox, Segmented, type Column } from "@/components/ui";
import { api } from "@/lib/api";
import type { Invoice, InvoiceStatus } from "@/lib/api/types";
import { useFmt } from "@/lib/i18n";
import { useLoad } from "@/lib/use-load";
import { downloadCsv, matches } from "@/lib/utils";

export default function InvoicesPage() {
  const { tr, date, money } = useFmt();
  const { user, lookups } = useApp();
  const invoices = useLoad(() => api.listInvoices(), []);
  const customers = useLoad(() => api.listCustomers().catch(() => []), []);
  const [status, setStatus] = useState<InvoiceStatus | "all" | "unpaid">("all");
  const [q, setQ] = useState("");
  // A Map finds a name in one step, instead of searching the whole customer list for every row.
  const names = useMemo(() => new Map((customers.data ?? []).map((c) => [c.id, c.name])), [customers.data]);
  const cName = (id: number) => names.get(id) ?? `#${id}`;
  const rName = (id: number) => lookups.reps.find((r) => r.id === id)?.name ?? "-";
  const all = invoices.data ?? [];
  const pass = (i: Invoice, s: typeof status) => s === "all" || (s === "unpaid" ? i.status !== "paid" : i.status === s);
  const rows = all.filter((i) => pass(i, status) && matches(q, i.number, cName(i.customer_id), rName(i.rep_id)));
  const showProfit = user.role === "manager" || user.role === "accountant";

  const columns: Column<Invoice>[] = [
    { key: "n", head: tr("الرقم", "No."), cell: (i) => <span className="num">{i.number}</span> },
    { key: "d", head: tr("التاريخ", "Date"), cell: (i) => date(i.date) },
    { key: "c", head: tr("الزبون", "Customer"), cell: (i) => cName(i.customer_id) },
    { key: "r", head: tr("المندوب", "Rep"), cell: (i) => rName(i.rep_id) },
    { key: "t", head: tr("المبلغ", "Total"), cell: (i) => <Money value={i.total} />, align: "end" },
    { key: "p", head: tr("المسدد", "Paid"), cell: (i) => <Money value={i.paid + i.returned} className="text-muted" />, align: "end" },
    { key: "rem", head: tr("الباقي", "Left"), cell: (i) => <Money value={Math.max(0, i.remaining)} className="font-semibold" />, align: "end" },
    ...(showProfit ? [{ key: "pr", head: tr("الربح", "Profit"), cell: (i: Invoice) => <Money value={i.profit} className="text-success" />, align: "end" as const }] : []),
    { key: "s", head: tr("الحالة", "Status"), cell: (i) => <InvoiceStatusBadge status={i.status} /> },
  ];

  return (
    <>
      <PageHeader
        title={tr("الفواتير", "Invoices")}
        subtitle={tr("الفاتورة تحفظ السعر وقت البيع، تغيير الأسعار لاحقاً لا يغيّرها", "An invoice keeps the price at the time of sale. Later price changes don't touch it")}
        actions={
          rows.length > 0 && (
            <Button
              onClick={() =>
                downloadCsv("invoices", [
                  [tr("الرقم", "No."), tr("التاريخ", "Date"), tr("الزبون", "Customer"), tr("المندوب", "Rep"), tr("المبلغ", "Total"), tr("الباقي", "Left")],
                  ...rows.map((i) => [i.number, date(i.date), cName(i.customer_id), rName(i.rep_id), i.total, Math.max(0, i.remaining)]),
                ])
              }
            >
              <Download className="size-4" /> {tr("تصدير Excel", "Export Excel")}
            </Button>
          )
        }
      />
      <Card>
        <div className="flex flex-col gap-3 border-b border-line p-3 lg:flex-row lg:items-center lg:justify-between">
          <Segmented
            value={status}
            onChange={setStatus}
            options={[
              { value: "all", label: tr("الكل", "All"), count: all.length },
              { value: "unpaid", label: tr("عليها باقي", "With balance"), count: all.filter((i) => pass(i, "unpaid")).length },
              { value: "paid", label: tr("مسددة", "Paid"), count: all.filter((i) => i.status === "paid").length },
            ]}
          />
          <SearchBox value={q} onChange={setQ} placeholder={tr("رقم الفاتورة أو الزبون", "Invoice no. or customer")} className="lg:w-72" />
        </div>
        {invoices.state.status === "loading" ? (
          <LoadingRows />
        ) : invoices.state.status === "error" ? (
          <ErrorBox error={invoices.state.error} onRetry={invoices.reload} />
        ) : (
          <DataTable
            rows={rows}
            columns={columns}
            rowKey={(i) => i.id}
            onRowHref={(i) => `/invoices/${i.id}`}
            mobile={(i) => (
              <div className="space-y-1">
                <div className="flex justify-between gap-2">
                  <span className="font-semibold">{cName(i.customer_id)}</span>
                  <Money value={i.total} className="font-semibold" />
                </div>
                <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
                  <span className="num">{i.number}</span> · {date(i.date)} <InvoiceStatusBadge status={i.status} />
                  {i.remaining > 0 && (
                    <span>
                      {tr("الباقي", "Left")} <span className="num">{money(i.remaining)}</span>
                    </span>
                  )}
                </div>
              </div>
            )}
            empty={<Empty icon={<ReceiptText className="size-6" />} title={tr("لا توجد فواتير", "No invoices")} />}
          />
        )}
      </Card>
    </>
  );
}
