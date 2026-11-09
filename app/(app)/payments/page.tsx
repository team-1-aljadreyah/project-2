"use client";

import { useState } from "react";
import { Plus, Wallet } from "lucide-react";
import { useApp } from "@/components/shell";
import { Badge, Button, Card, DataTable, Empty, ErrorBox, LoadingRows, Money, PageHeader, SearchBox, Segmented, Stat, type Column } from "@/components/ui";
import { api } from "@/lib/api";
import type { Payment } from "@/lib/api/types";
import { useFmt } from "@/lib/i18n";
import { useLoad } from "@/lib/use-load";
import { dayOfIso, matches, today } from "@/lib/utils";

export default function PaymentsPage() {
  const { tr, dateTime, ago } = useFmt();
  const { user } = useApp();
  const payments = useLoad(() => api.listPayments(), []);
  const customers = useLoad(() => api.listCustomers(), []);
  const [range, setRange] = useState<"today" | "week" | "all">("all");
  const [q, setQ] = useState("");
  const cName = (id: number) => customers.data?.find((c) => c.id === id)?.name ?? `#${id}`;
  const from = range === "today" ? today() : range === "week" ? today(-6) : "";
  const all = payments.data ?? [];
  const rows = all.filter((p) => (!from || dayOfIso(p.date) >= from) && matches(q, p.number, cName(p.customer_id), p.received_by.name));
  const sum = (list: Payment[]) => list.reduce((s, p) => s + p.amount, 0);

  const columns: Column<Payment>[] = [
    { key: "n", head: tr("الرقم", "No."), cell: (p) => <span className="num">{p.number}</span> },
    { key: "d", head: tr("الوقت", "Time"), cell: (p) => dateTime(p.date) },
    { key: "c", head: tr("الزبون", "Customer"), cell: (p) => cName(p.customer_id) },
    { key: "by", head: tr("استلمه", "Taken by"), cell: (p) => p.received_by.name },
    { key: "m", head: tr("الطريقة", "Method"), cell: (p) => (p.method === "cash" ? tr("نقداً", "Cash") : tr("تحويل", "Transfer")) },
    { key: "a", head: tr("المبلغ", "Amount"), cell: (p) => <Money value={p.amount} className={p.amount < 0 ? "text-danger font-semibold" : "font-semibold"} />, align: "end" },
    { key: "s", head: "", cell: (p) => (p.reversal_of ? <Badge tone="danger">{tr("عملية عكسية", "Reverse entry")}</Badge> : p.reversed ? <Badge>{tr("معكوس", "Reversed")}</Badge> : null) },
  ];

  return (
    <>
      <PageHeader
        title={tr("التسديدات", "Payments")}
        subtitle={tr("كل تسديد يروح على أقدم فاتورة أولاً، وما ينحذف أبداً", "Each payment goes to the oldest invoice first, and is never deleted")}
        actions={
          <Button variant="action" href="/payments/new">
            <Plus className="size-4" /> {tr("استلام تسديد", "Take a payment")}
          </Button>
        }
      />
      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-3">
        <Stat label={tr("اليوم", "Today")} value={<Money value={sum(all.filter((p) => dayOfIso(p.date) === today()))} />} />
        <Stat label={tr("آخر 7 أيام", "Last 7 days")} value={<Money value={sum(all.filter((p) => dayOfIso(p.date) >= today(-6)))} />} />
        {user.role !== "rep" && <Stat label={tr("عدد العمليات", "Entries")} value={all.length} />}
      </div>
      <Card>
        <div className="flex flex-col gap-3 border-b border-line p-3 lg:flex-row lg:items-center lg:justify-between">
          <Segmented
            value={range}
            onChange={setRange}
            options={[
              { value: "today", label: tr("اليوم", "Today") },
              { value: "week", label: tr("الأسبوع", "Week") },
              { value: "all", label: tr("الكل", "All") },
            ]}
          />
          <SearchBox value={q} onChange={setQ} placeholder={tr("الزبون، الرقم أو المستلم", "Customer, no. or taker")} className="lg:w-72" />
        </div>
        {payments.state.status === "loading" ? (
          <LoadingRows />
        ) : payments.state.status === "error" ? (
          <ErrorBox error={payments.state.error} onRetry={payments.reload} />
        ) : (
          <DataTable
            rows={rows}
            columns={columns}
            rowKey={(p) => p.id}
            onRowHref={(p) => `/payments/${p.id}`}
            mobile={(p) => (
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-semibold">{cName(p.customer_id)}</p>
                  <p className="text-xs text-muted">
                    <span className="num">{p.number}</span> · {ago(p.date)} · {p.received_by.name}
                  </p>
                  {p.reversal_of && <Badge tone="danger">{tr("عملية عكسية", "Reverse entry")}</Badge>}
                </div>
                <Money value={p.amount} className={p.amount < 0 ? "font-semibold text-danger" : "font-semibold"} />
              </div>
            )}
            empty={<Empty icon={<Wallet className="size-6" />} title={tr("لا توجد تسديدات", "No payments")} />}
          />
        )}
      </Card>
    </>
  );
}
