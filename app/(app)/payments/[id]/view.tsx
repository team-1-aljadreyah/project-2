"use client";

import Link from "next/link";
import { useState } from "react";
import { RotateCcw } from "lucide-react";
import { useApp } from "@/components/shell";
import { roleName } from "@/components/status";
import { Badge, Button, Card, CardHeader, Dialog, ErrorBox, Field, KV, LoadingRows, Money, Notice, PageHeader, Textarea, errorText, useToast } from "@/components/ui";
import { api } from "@/lib/api";
import { useFmt } from "@/lib/i18n";
import { useLoad } from "@/lib/use-load";
import { useIdParam } from "@/lib/utils";

export default function PaymentView() {
  const id = useIdParam();
  const { tr, dateTime } = useFmt();
  const { user } = useApp();
  const toast = useToast();
  const pay = useLoad(() => api.getPayment(id), [id]);
  const p = pay.data;
  const customer = useLoad(() => (p ? api.getCustomer(p.customer_id) : Promise.resolve(undefined)), [p?.customer_id]);
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);

  if (pay.state.status === "loading") return <LoadingRows />;
  if (pay.state.status === "error" || !p) return <ErrorBox error={pay.state.status === "error" ? pay.state.error : null} onRetry={pay.reload} />;
  const canReverse = (user.role === "manager" || user.role === "accountant") && !p.reversed && !p.reversal_of;

  return (
    <>
      <PageHeader
        back="/payments"
        title={
          <span className="flex flex-wrap items-center gap-2">
            {p.reversal_of ? tr("عملية عكسية", "Reverse entry") : tr("تسديد", "Payment")} <span className="num">{p.number}</span>
            {p.reversed && <Badge>{tr("معكوس", "Reversed")}</Badge>}
          </span>
        }
        actions={
          canReverse && (
            <Button variant="danger" onClick={() => setOpen(true)}>
              <RotateCcw className="size-4" /> {tr("عكس التسديد", "Reverse payment")}
            </Button>
          )
        }
      />
      <div className="grid max-w-4xl gap-4 lg:grid-cols-2">
        <Card className="p-4">
          <p className="text-xs text-muted">{tr("المبلغ", "Amount")}</p>
          <Money value={p.amount} className={`text-3xl font-bold ${p.amount < 0 ? "text-danger" : ""}`} />
          <div className="mt-3 border-t border-line pt-2">
            <KV k={tr("الزبون", "Customer")} v={customer.data ? <Link className="text-primary-ink hover:underline" href={`/customers/${customer.data.id}`}>{customer.data.name}</Link> : "…"} />
            <KV k={tr("الوقت", "Time")} v={dateTime(p.date)} />
            <KV k={tr("سجّله", "Entered by")} v={`${p.received_by.name} (${roleName(p.received_by.role, tr)})`} />
            <KV k={tr("الطريقة", "Method")} v={p.method === "cash" ? tr("نقداً", "Cash") : tr("تحويل", "Transfer")} />
            {p.note && <KV k={tr("ملاحظة", "Note")} v={p.note} />}
            {p.reason && <KV k={tr("سبب العكس", "Reason")} v={p.reason} />}
          </div>
          {p.reversal_of && (
            <div className="mt-3">
              <Notice tone="primary">
                {tr("هذه عملية عكسية تلغي أثر التسديد", "This reverse entry cancels payment")}{" "}
                <Link className="font-semibold underline" href={`/payments/${p.reversal_of}`}>
                  #{p.reversal_of}
                </Link>
              </Notice>
            </div>
          )}
          {p.reversed && p.reversed_by_id && (
            <div className="mt-3">
              <Notice tone="warning">
                {tr("تم عكس هذا التسديد بالعملية", "This payment was reversed by")}{" "}
                <Link className="font-semibold underline" href={`/payments/${p.reversed_by_id}`}>
                  #{p.reversed_by_id}
                </Link>
                . {tr("يبقى التسديد ظاهراً ولا يُحذف.", "It stays visible and is never deleted.")}
              </Notice>
            </div>
          )}
        </Card>
        <Card>
          <CardHeader title={tr("توزيع المبلغ على الفواتير", "Applied to invoices")} subtitle={tr("الأقدم أولاً", "Oldest first")} />
          <ul className="divide-y divide-line text-sm">
            {p.allocations.map((a) => (
              <li key={a.invoice_id} className="flex justify-between px-4 py-2.5">
                <Link href={`/invoices/${a.invoice_id}`} className="num text-primary-ink hover:underline">
                  {a.number}
                </Link>
                <Money value={a.amount} className="font-medium" />
              </li>
            ))}
          </ul>
        </Card>
      </div>

      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title={tr("عكس التسديد", "Reverse payment")}
        footer={
          <>
            <Button onClick={() => setOpen(false)}>{tr("رجوع", "Back")}</Button>
            <Button
              variant="danger"
              loading={busy}
              disabled={!reason.trim()}
              onClick={async () => {
                setBusy(true);
                try {
                  await api.reversePayment(p.id, reason);
                  toast("success", tr("تم العكس، وعاد الدين على الزبون", "Reversed. The debt is back on the customer"));
                  setOpen(false);
                  pay.reload();
                } catch (e) {
                  toast("danger", errorText(e, tr));
                } finally {
                  setBusy(false);
                }
              }}
            >
              {tr("تأكيد العكس", "Confirm reverse")}
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <Notice tone="primary">{tr("التسديد لا يُحذف، بل ستُسجَّل عملية عكسية بالمبلغ نفسه باسمك، وتظهر في كشف الحساب.", "Payments are never deleted. A reverse entry with the same amount is saved under your name and shows in the statement.")}</Notice>
          <Field label={tr("السبب", "Reason")}>
            <Textarea value={reason} onChange={(e) => setReason(e.target.value)} placeholder={tr("مثلاً: سُجّل مرتين خطأً", "e.g. entered twice by mistake")} />
          </Field>
        </div>
      </Dialog>
    </>
  );
}
