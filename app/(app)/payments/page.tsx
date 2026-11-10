"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Plus, Wallet } from "lucide-react";
import { MethodChip, MethodIcon, OnlineStatusChip, methodLabel, methodTone } from "@/components/pay-method";
import { useApp } from "@/components/shell";
import { Badge, Button, Card, DataTable, Empty, ErrorBox, LoadingRows, Money, PageHeader, SearchBox, Segmented, type Column } from "@/components/ui";
import { api } from "@/lib/api";
import type { OnlinePayment, Payment, PayMethod } from "@/lib/api/types";
import { useFmt } from "@/lib/i18n";
import { useLoad } from "@/lib/use-load";
import { cn, dayOfIso, matches, today } from "@/lib/utils";

// Payments: local (cash, transfer / Zain Cash) and online (Qi Card).
// The manager and the accountant also see every online attempt, including the ones that didn't go through.
export default function PaymentsPage() {
  const { tr, dateTime, ago, money } = useFmt();
  const { user } = useApp();
  const staff = user.role === "manager" || user.role === "accountant";
  const payments = useLoad(() => api.listPayments(), []);
  const customers = useLoad(() => api.listCustomers(), []);
  const online = useLoad(() => (staff ? api.listOnlinePayments() : Promise.resolve([] as OnlinePayment[])), [staff]);
  const [tab, setTab] = useState<"payments" | "online">("payments");
  const [range, setRange] = useState<"today" | "week" | "all">("all");
  const [kind, setKind] = useState<"all" | "local" | "online">("all");
  const [q, setQ] = useState("");
  const names = useMemo(() => new Map((customers.data ?? []).map((c) => [c.id, c.name])), [customers.data]);
  const cName = (id: number) => names.get(id) ?? `#${id}`;
  const from = range === "today" ? today() : range === "week" ? today(-6) : "";
  const all = payments.data ?? [];
  const inRange = all.filter((p) => !from || dayOfIso(p.date) >= from);
  const rows = inRange.filter((p) => (kind === "all" || (kind === "online" ? p.method === "online" : p.method !== "online")) && matches(q, p.number, cName(p.customer_id), p.received_by.name));
  // Money that really came in: reversed payments and their reverse entries cancel each other, so both are left out.
  const counted = inRange.filter((p) => !p.reversed && !p.reversal_of);
  const sumOf = (m: PayMethod) => counted.filter((p) => p.method === m).reduce((s, p) => s + p.amount, 0);
  const total = counted.reduce((s, p) => s + p.amount, 0);
  const attempts = (online.data ?? []).filter((o) => (!from || dayOfIso(o.created_at) >= from) && matches(q, o.payment_id, cName(o.customer_id)));
  const failedCount = attempts.filter((o) => o.status !== "success" && o.status !== "created").length;

  const columns: Column<Payment>[] = [
    { key: "n", head: tr("الرقم", "No."), cell: (p) => <span className="num">{p.number}</span> },
    { key: "d", head: tr("الوقت", "Time"), cell: (p) => dateTime(p.date) },
    { key: "c", head: tr("الزبون", "Customer"), cell: (p) => cName(p.customer_id) },
    { key: "by", head: tr("استلمه", "Taken by"), cell: (p) => (p.method === "online" ? <span className="text-muted">{tr("بوابة Qi", "Qi gateway")}</span> : p.received_by.name) },
    { key: "m", head: tr("الطريقة", "Method"), cell: (p) => <MethodChip m={p.method} tr={tr} /> },
    { key: "a", head: tr("المبلغ", "Amount"), cell: (p) => <Money value={p.amount} className={p.amount < 0 ? "text-danger font-semibold" : "font-semibold"} />, align: "end" },
    { key: "s", head: "", cell: (p) => (p.reversal_of ? <Badge tone="danger">{tr("عملية عكسية", "Reverse entry")}</Badge> : p.reversed ? <Badge>{tr("معكوس", "Reversed")}</Badge> : null) },
  ];

  const attemptColumns: Column<OnlinePayment>[] = [
    { key: "t", head: tr("الوقت", "Time"), cell: (o) => dateTime(o.created_at) },
    { key: "c", head: tr("الزبون", "Customer"), cell: (o) => cName(o.customer_id) },
    { key: "a", head: tr("المبلغ", "Amount"), cell: (o) => <Money value={o.amount} className="font-semibold" />, align: "end" },
    { key: "s", head: tr("النتيجة", "Result"), cell: (o) => <OnlineStatusChip s={o.status} tr={tr} /> },
    { key: "id", head: tr("رقم العملية لدى Qi", "Qi reference"), cell: (o) => <span className="num text-xs text-muted" dir="ltr">{o.payment_id}</span> },
    {
      key: "p",
      head: tr("التسديد", "Payment"),
      cell: (o) =>
        o.recorded_payment_id ? (
          <Link href={`/payments/${o.recorded_payment_id}`} className="font-semibold text-primary-ink hover:underline">
            {tr("عرض", "Open")}
          </Link>
        ) : (
          <span className="text-faint">—</span>
        ),
    },
  ];

  return (
    <>
      <PageHeader
        title={tr("التسديدات", "Payments")}
        subtitle={tr("محلياً (نقداً أو تحويل) أو أونلاين ببطاقة Qi. كل تسديد يُخصم من أقدم فاتورة أولاً، ولا يُحذف أبداً", "Local (cash or transfer) or online with Qi Card. Each payment goes to the oldest invoice first, and is never deleted")}
        actions={
          <Button variant="action" href="/payments/new">
            <Plus className="size-4" /> {tr("استلام تسديد", "Take a payment")}
          </Button>
        }
      />

      {/* What came in, by method (for the chosen period) */}
      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Card className="p-4">
          <p className="text-xs text-muted">{tr("المجموع", "Total")}</p>
          <Money value={total} className="text-xl font-bold" />
          <p className="mt-0.5 text-[11px] text-faint">{range === "today" ? tr("اليوم", "Today") : range === "week" ? tr("آخر 7 أيام", "Last 7 days") : tr("كل الفترة", "All time")}</p>
        </Card>
        {(["cash", "transfer", "online"] as PayMethod[]).map((m) => (
          <Card key={m} className="p-4">
            <p className="flex items-center gap-1.5 text-xs text-muted">
              <span className={cn("flex size-5 items-center justify-center rounded-md", methodTone[m])}>
                <MethodIcon m={m} className="size-3" />
              </span>
              {methodLabel(m, tr)}
            </p>
            <Money value={sumOf(m)} className="text-xl font-bold" />
            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-line">
              <div className={cn("h-full rounded-full", m === "cash" ? "bg-success" : m === "transfer" ? "bg-primary" : "bg-[#f7c600]")} style={{ width: `${total ? (sumOf(m) / total) * 100 : 0}%` }} />
            </div>
          </Card>
        ))}
      </div>

      <Card>
        <div className="flex flex-col gap-3 border-b border-line p-3 lg:flex-row lg:flex-wrap lg:items-center lg:justify-between">
          <div className="flex flex-wrap gap-2">
            {staff && (
              <Segmented
                value={tab}
                onChange={setTab}
                options={[
                  { value: "payments", label: tr("التسديدات", "Payments") },
                  { value: "online", label: tr("محاولات أونلاين", "Online attempts"), count: failedCount || undefined },
                ]}
              />
            )}
            <Segmented
              value={range}
              onChange={setRange}
              options={[
                { value: "today", label: tr("اليوم", "Today") },
                { value: "week", label: tr("الأسبوع", "Week") },
                { value: "all", label: tr("الكل", "All") },
              ]}
            />
            {tab === "payments" && (
              <Segmented
                value={kind}
                onChange={setKind}
                options={[
                  { value: "all", label: tr("كل الطرق", "All methods") },
                  { value: "local", label: tr("محلي", "Local") },
                  { value: "online", label: tr("أونلاين", "Online") },
                ]}
              />
            )}
          </div>
          <SearchBox value={q} onChange={setQ} placeholder={tab === "online" ? tr("الزبون أو رقم Qi", "Customer or Qi ref") : tr("الزبون، الرقم أو المستلم", "Customer, no. or taker")} className="lg:w-72" />
        </div>

        {tab === "online" ? (
          online.state.status === "loading" ? (
            <LoadingRows />
          ) : (
            <>
              <p className="border-b border-line bg-card-2 px-4 py-2 text-xs text-muted">
                {tr("كل محاولة دفع ببطاقة Qi تظهر هنا. المحاولة الفاشلة لا تسحب أي مبلغ ولا تُسجَّل تسديداً.", "Every Qi Card attempt shows here. A failed attempt takes no money and records no payment.")}
              </p>
              <DataTable
                rows={attempts}
                columns={attemptColumns}
                rowKey={(o) => o.payment_id}
                mobile={(o) => (
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-semibold">{cName(o.customer_id)}</p>
                      <p className="text-xs text-muted">{ago(o.created_at)}</p>
                    </div>
                    <div className="flex flex-col items-end gap-1">
                      <span className="num font-semibold">{money(o.amount)}</span>
                      <OnlineStatusChip s={o.status} tr={tr} />
                    </div>
                  </div>
                )}
                empty={<Empty icon={<Wallet className="size-6" />} title={tr("لا توجد محاولات دفع أونلاين", "No online attempts")} />}
              />
            </>
          )
        ) : payments.state.status === "loading" ? (
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
                    <span className="num">{p.number}</span> · {ago(p.date)}
                  </p>
                  <div className="mt-1 flex flex-wrap gap-1">
                    <MethodChip m={p.method} tr={tr} />
                    {p.reversal_of && <Badge tone="danger">{tr("عملية عكسية", "Reverse entry")}</Badge>}
                  </div>
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
