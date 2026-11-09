"use client";

import { useState } from "react";
import { Download, Lock } from "lucide-react";
import { useApp } from "@/components/shell";
import { Badge, Button, Card, DataTable, Empty, ErrorBox, LoadingRows, Money, Notice, PageHeader, Select, errorText, useToast, type Column } from "@/components/ui";
import { api } from "@/lib/api";
import type { CommissionRow } from "@/lib/api/types";
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
        subtitle={tr("نسبة لكل مادة، وتنحسب على الفلوس المدفوعة فعلاً. البيع الآجل ما ينحسب إلا بعد ما الزبون يسدد.", "A rate per item, counted on money actually paid. Credit sales count only after the customer pays.")}
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
                  if (!confirm(tr(`إغلاق شهر ${monthName(month)}؟ بعد الإغلاق ما تتغير الأرقام.`, `Close ${monthName(month)}? Numbers won't change after closing.`))) return;
                  setBusy(true);
                  try {
                    await api.closeMonth(month);
                    toast("success", tr("انغلق الشهر", "Month closed"));
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
            {tr("الأرقام تتحدث مع كل تسديد ومرتجع. تقدر تغلقه بعد ما ينتهي.", "Numbers update with every payment and return. You can close it after it ends.")}
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
    </>
  );
}
