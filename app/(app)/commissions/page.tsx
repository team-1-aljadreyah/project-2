"use client";

import Link from "next/link";
import { useState } from "react";
import { Download, Lock } from "lucide-react";
import { useApp } from "@/components/shell";
import { Badge, Button, Card, CardHeader, DataTable, Empty, ErrorBox, LoadingRows, Money, Notice, PageHeader, Select, errorText, useToast, type Column } from "@/components/ui";
import { api } from "@/lib/api";
import type { CommissionLine, CommissionRow } from "@/lib/api/types";
import { useFmt } from "@/lib/i18n";
import { useLoad } from "@/lib/use-load";
import { downloadCsv, today } from "@/lib/utils";

function lastMonths(n: number) {
  const out: string[] = [];
  const d = new Date();
  d.setDate(1);
  for (let i = 0; i < n; i++) {
    out.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
    d.setMonth(d.getMonth() - 1);
  }
  return out;
}

export default function CommissionsPage() {
  const { tr, monthName, money } = useFmt();
  const { user } = useApp();
  const toast = useToast();
  const months = lastMonths(6);
  const [month, setMonth] = useState(months[0]);
  const rows = useLoad(() => api.commissions(month), [month]);
  const [busy, setBusy] = useState(false);
  const current = month === today().slice(0, 7);
  const closed = rows.data?.some((r) => r.closed);
  const total = (k: keyof Pick<CommissionRow, "paid_sales" | "commission" | "returns_deducted" | "net">) => (rows.data ?? []).reduce((s, r) => s + r[k], 0);

  const columns: Column<CommissionRow>[] = [
    { key: "r", head: tr("المندوب", "Rep"), cell: (r) => <span className="font-medium">{r.rep.name}</span> },
    { key: "p", head: tr("المبالغ المقبوضة", "Money collected"), cell: (r) => <Money value={r.paid_sales} />, align: "end" },
    { key: "c", head: tr("العمولة", "Commission"), cell: (r) => <Money value={r.commission} />, align: "end" },
    { key: "d", head: tr("خصم المرتجعات", "Returns deducted"), cell: (r) => <Money value={-r.returns_deducted} className="text-danger" />, align: "end" },
    { key: "n", head: tr("الصافي المستحق", "Net due"), cell: (r) => <Money value={r.net} className="text-base font-bold" />, align: "end" },
  ];

  return (
    <>
      <PageHeader
        title={user.role === "rep" ? tr("عمولتي", "My commission") : tr("عمولات المندوبين", "Rep commission")}
        subtitle={tr("نسبة لكل مادة، تُحسب على المبالغ المدفوعة فعلاً. ولا يُحسب البيع الآجل إلا بعد أن يسدد الزبون.", "A rate per item, counted on money actually paid. Credit sales count only after the customer pays.")}
        actions={
          <>
            <Select value={month} onChange={(e) => setMonth(e.target.value)} className="w-48">
              {months.map((m) => (
                <option key={m} value={m}>
                  {monthName(m)}
                </option>
              ))}
            </Select>
            {rows.data && user.role !== "rep" && (
              <Button
                onClick={() =>
                  downloadCsv(`commission-${month}`, [
                    [tr("المندوب", "Rep"), tr("المقبوض", "Collected"), tr("العمولة", "Commission"), tr("المرتجعات", "Returns"), tr("الصافي", "Net")],
                    ...(rows.data ?? []).map((r) => [r.rep.name, r.paid_sales, r.commission, r.returns_deducted, r.net]),
                  ])
                }
              >
                <Download className="size-4" /> Excel
              </Button>
            )}
            {user.role === "manager" && !closed && !current && (
              <Button
                variant="action"
                loading={busy}
                onClick={async () => {
                  if (!confirm(tr(`إغلاق شهر ${monthName(month)}؟ بعد الإغلاق لا تتغير الأرقام.`, `Close ${monthName(month)}? Numbers won't change after closing.`))) return;
                  setBusy(true);
                  try {
                    await api.closeMonth(month);
                    toast("success", tr("أُغلق الشهر", "Month closed"));
                    rows.reload();
                  } catch (e) {
                    toast("danger", errorText(e, tr));
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                <Lock className="size-4" /> {tr("إغلاق الشهر", "Close month")}
              </Button>
            )}
          </>
        }
      />
      <div className="mb-4">
        {closed ? (
          <Notice tone="success" title={tr("الشهر مغلق", "This month is closed")}>
            {tr("هذه الأرقام نهائية ولا تتغير.", "These numbers are final.")}
          </Notice>
        ) : current ? (
          <Notice tone="primary" title={tr("الشهر الحالي", "Current month")}>
            {tr("تتحدّث الأرقام مع كل تسديد ومرتجع، ويمكنك إغلاقه بعد انتهائه.", "Numbers update with every payment and return. You can close it after it ends.")}
          </Notice>
        ) : null}
      </div>
      <Card>
        {rows.state.status === "loading" ? (
          <LoadingRows rows={3} />
        ) : rows.state.status === "error" ? (
          <ErrorBox error={rows.state.error} onRetry={rows.reload} />
        ) : (
          <DataTable
            rows={rows.data ?? []}
            columns={columns}
            rowKey={(r) => r.rep.id}
            mobile={(r) => (
              <div className="space-y-1">
                <div className="flex justify-between">
                  <span className="font-semibold">{r.rep.name}</span>
                  <Money value={r.net} className="font-bold" />
                </div>
                <p className="text-xs text-muted">
                  {tr("مقبوض", "Collected")} {money(r.paid_sales)} · {tr("مرتجعات", "returns")} -{money(r.returns_deducted)}
                </p>
                {r.closed && <Badge tone="success">{tr("مغلق", "Closed")}</Badge>}
              </div>
            )}
            footer={
              user.role !== "rep" && (rows.data ?? []).length > 1 ? (
                <tfoot>
                  <tr className="border-t-2 border-line bg-card-2 font-semibold">
                    <td className="px-4 py-3">{tr("المجموع", "Total")}</td>
                    <td className="px-4 py-3 text-end"><Money value={total("paid_sales")} /></td>
                    <td className="px-4 py-3 text-end"><Money value={total("commission")} /></td>
                    <td className="px-4 py-3 text-end"><Money value={-total("returns_deducted")} /></td>
                    <td className="px-4 py-3 text-end"><Money value={total("net")} /></td>
                  </tr>
                </tfoot>
              ) : undefined
            }
            empty={<Empty title={tr("لا توجد عمولات لهذا الشهر", "No commission for this month")} />}
          />
        )}
      </Card>

      {/* Every payment that earned commission: the rep sees the money come in shop by shop */}
      <PaymentsCommission month={month} showRep={user.role !== "rep"} />
    </>
  );
}

function PaymentsCommission({ month, showRep }: { month: string; showRep: boolean }) {
  const { tr, date, money } = useFmt();
  const { lookups } = useApp();
  const lines = useLoad(() => api.commissionLines(month), [month]);
  const rName = (id: number) => lookups.reps.find((r) => r.id === id)?.name ?? "-";
  const columns: Column<CommissionLine>[] = [
    { key: "d", head: tr("التاريخ", "Date"), cell: (l) => <span className="num">{date(l.date)}</span> },
    { key: "c", head: tr("المحل", "Shop"), cell: (l) => <span className="font-medium">{l.customer}</span> },
    ...(showRep ? [{ key: "r", head: tr("المندوب", "Rep"), cell: (l: CommissionLine) => rName(l.rep_id) }] : []),
    {
      key: "i",
      head: tr("الفاتورة", "Invoice"),
      cell: (l) => (
        <Link href={`/invoices/${l.invoice_id}`} className="num text-primary-ink hover:underline">
          {l.invoice_number}
        </Link>
      ),
    },
    { key: "a", head: tr("المدفوع", "Paid"), cell: (l) => <Money value={l.amount} />, align: "end" },
    { key: "p", head: tr("النسبة", "Rate"), cell: (l) => <span className="num">{l.rate}%</span>, align: "center" },
    { key: "m", head: tr("العمولة", "Commission"), cell: (l) => <Money value={l.commission} className="font-semibold text-success" />, align: "end" },
  ];
  return (
    <Card className="mt-4">
      <CardHeader
        title={tr("العمولة من كل تسديد", "Commission from each payment")}
        subtitle={tr("كلما دفع محل، تُحسب عمولة المندوب على ما دُفع فعلاً، بنسبة مواد تلك الفاتورة.", "Each time a shop pays, the rep earns on what was paid, at the rate of that invoice's items.")}
      />
      {lines.state.status === "loading" ? (
        <LoadingRows rows={3} />
      ) : (
        <DataTable
          rows={lines.data ?? []}
          columns={columns}
          rowKey={(l) => `${l.payment_id}-${l.invoice_id}`}
          mobile={(l) => (
            <div className="flex items-center justify-between gap-2">
              <div className="min-w-0">
                <p className="truncate font-medium">{l.customer}</p>
                <p className="text-xs text-muted">
                  <span className="num">{date(l.date)}</span> · {tr("دفع", "paid")} {money(l.amount)} · <span className="num">{l.rate}%</span>
                </p>
              </div>
              <Money value={l.commission} className="font-bold text-success" />
            </div>
          )}
          empty={<Empty title={tr("لا توجد تسديدات هذا الشهر", "No payments this month")} />}
        />
      )}
    </Card>
  );
}
