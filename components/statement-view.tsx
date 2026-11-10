"use client";

// Customer statement: every invoice, payment, return and reverse entry, with the running balance.
import Link from "next/link";
import { useState } from "react";
import { Download, Printer } from "lucide-react";
import { api } from "@/lib/api";
import { useFmt } from "@/lib/i18n";
import { useLoad } from "@/lib/use-load";
import { downloadCsv, today } from "@/lib/utils";
import type { StatementType } from "@/lib/api/types";
import { Badge, Button, Card, ErrorBox, Input, LoadingRows, Money } from "./ui";

export function StatementView({ customerId, links = true }: { customerId: number; links?: boolean }) {
  const { tr, date } = useFmt();
  const [from, setFrom] = useState(today(-60));
  const [to, setTo] = useState(today());
  const st = useLoad(() => api.statement(customerId, from || undefined, to || undefined), [customerId, from, to]);
  const label = (t: StatementType) =>
    ({
      opening: tr("رصيد سابق", "Opening balance"),
      invoice: tr("فاتورة", "Invoice"),
      payment: tr("تسديد", "Payment"),
      return: tr("مرتجع", "Return"),
      reversal: tr("عكس تسديد", "Reversal"),
    })[t];
  const tone = (t: StatementType) => (t === "invoice" ? "primary" : t === "payment" ? "success" : t === "return" ? "warning" : t === "reversal" ? "danger" : "neutral");

  return (
    <Card className="print-area">
      <div className="flex flex-wrap items-end justify-between gap-3 border-b border-line p-3">
        <div className="flex flex-wrap items-end gap-2">
          <label className="text-xs text-muted">
            {tr("من", "From")}
            <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="mt-1 w-40" />
          </label>
          <label className="text-xs text-muted">
            {tr("إلى", "To")}
            <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="mt-1 w-40" />
          </label>
        </div>
        <div className="no-print flex gap-2">
          <Button
            size="sm"
            onClick={() =>
              st.data &&
              downloadCsv(`statement-${customerId}`, [
                [tr("التاريخ", "Date"), tr("الحركة", "Type"), tr("الرقم", "Ref"), tr("مدين", "Debit"), tr("دائن", "Credit"), tr("الرصيد", "Balance")],
                ...st.data.rows.map((r) => [date(r.date), label(r.type), r.ref, r.debit, r.credit, r.balance]),
              ])
            }
          >
            <Download className="size-4" /> Excel
          </Button>
          <Button size="sm" onClick={() => window.print()}>
            <Printer className="size-4" /> {tr("طباعة", "Print")}
          </Button>
        </div>
      </div>
      {st.state.status === "loading" && !st.data ? (
        <LoadingRows />
      ) : st.state.status === "error" ? (
        <ErrorBox error={st.state.error} onRetry={st.reload} />
      ) : st.data ? (
        <>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-line bg-card-2 text-xs text-muted">
                  <th className="px-3 py-2 text-start font-medium">{tr("التاريخ", "Date")}</th>
                  <th className="px-3 py-2 text-start font-medium">{tr("الحركة", "Entry")}</th>
                  <th className="px-3 py-2 text-end font-medium">{tr("عليه", "Debit")}</th>
                  <th className="px-3 py-2 text-end font-medium">{tr("له", "Credit")}</th>
                  <th className="px-3 py-2 text-end font-medium">{tr("الرصيد", "Balance")}</th>
                </tr>
              </thead>
              <tbody>
                {st.data.rows.map((r, i) => (
                  <tr key={i} className="border-b border-line last:border-0">
                    <td className="num whitespace-nowrap px-3 py-2.5 text-muted">{date(r.date)}</td>
                    <td className="px-3 py-2.5">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <Badge tone={tone(r.type)}>{label(r.type)}</Badge>
                        {r.link && (links || r.type === "invoice") ? (
                          <Link href={r.link} className="num text-xs text-primary-ink hover:underline">
                            {r.ref}
                          </Link>
                        ) : (
                          <span className="num text-xs">{r.ref}</span>
                        )}
                      </div>
                    </td>
                    <td className="px-3 py-2.5 text-end">{r.debit ? <Money value={r.debit} /> : ""}</td>
                    <td className="px-3 py-2.5 text-end">{r.credit ? <Money value={r.credit} className="text-success" /> : ""}</td>
                    <td className="px-3 py-2.5 text-end">
                      <Money value={r.balance} className="font-semibold" />
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-line bg-card-2 font-semibold">
                  <td className="px-3 py-3" colSpan={2}>
                    {tr("المجموع", "Totals")}
                  </td>
                  <td className="px-3 py-3 text-end">
                    <Money value={st.data.total_debit} />
                  </td>
                  <td className="px-3 py-3 text-end">
                    <Money value={st.data.total_credit} className="text-success" />
                  </td>
                  <td className="px-3 py-3 text-end">
                    <Money value={st.data.balance} className="text-base" />
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
          {!st.data.rows.length && <p className="p-6 text-center text-sm text-muted">{tr("لا توجد حركات في هذه الفترة", "No entries in this period")}</p>}
        </>
      ) : null}
    </Card>
  );
}
