"use client";

// Giving money back when something went wrong. Two steps, both written in the audit log and told to the manager
// and to the shop:
//   1) تعويض عن خطأ (credit note) on an invoice: overcharged, wrong price, goods short or spoiled… The shop owes
//      less; if it already paid, the difference becomes its credit.
//   2) إعادة المبلغ (refund): the shop's credit goes back to it, cash / transfer, or to the card of an
//      online payment (through the Qi gateway).
// A payment typed by mistake is not refunded: it is reversed from the payment page (عكس التسديد).
import { useState } from "react";
import { HandCoins, ReceiptText, RotateCcw } from "lucide-react";
import { Button, Dialog, Field, Money, NumberInput, Segmented, Select, Textarea, errorText, useToast } from "@/components/ui";
import { api, ApiError } from "@/lib/api";
import type { Invoice, Payment, Refund } from "@/lib/api/types";
import { useFmt } from "@/lib/i18n";
import { useLoad } from "@/lib/use-load";

const REASONS_AR = ["سعر خاطئ في الفاتورة", "بضاعة ناقصة عند التسليم", "بضاعة تالفة لم تُرجَع", "خصم متفق عليه لم يُطبَّق", "دفع الزبون أكثر من المطلوب"];

export function CreditNoteButton({ invoice, onDone }: { invoice: Invoice; onDone: () => void }) {
  const { tr, money } = useFmt();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const room = invoice.total - invoice.returned - (invoice.credited ?? 0);
  const [amount, setAmount] = useState<number | "">("");
  const [reason, setReason] = useState("");
  const [err, setErr] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  if (room <= 0) return null;
  return (
    <>
      <Button onClick={() => setOpen(true)}>
        <ReceiptText className="size-4" /> {tr("تعويض عن خطأ", "Credit for a mistake")}
      </Button>
      {open && (
        <Dialog
          open
          onClose={() => setOpen(false)}
          title={tr(`تعويض على ${invoice.number}`, `Credit on ${invoice.number}`)}
          footer={
            <Button
              variant="action"
              className="w-full"
              loading={busy}
              disabled={busy || amount === "" || !reason.trim()}
              onClick={async () => {
                setBusy(true);
                setErr({});
                try {
                  await api.creditInvoice(invoice.id, Number(amount), reason);
                  toast("success", tr("سُجّل التعويض، ونقص من الفاتورة", "Saved: it was taken off the invoice"));
                  setOpen(false);
                  onDone();
                } catch (e) {
                  if (e instanceof ApiError && e.errors) setErr(e.errors);
                  toast("danger", errorText(e, tr));
                } finally {
                  setBusy(false);
                }
              }}
            >
              {tr("سجّل التعويض", "Save the credit")}
            </Button>
          }
        >
          <p className="mb-3 text-sm text-muted">
            {tr("يُنقص هذا المبلغ مما يدين به المحل على هذه الفاتورة. وإذا كان قد دفعها، يصبح رصيداً له يُعاد إليه أو يُخصم من فاتورته القادمة.", "This is taken off what the shop owes on this invoice. If it already paid, it becomes its credit, to refund or use next time.")}
          </p>
          <div className="space-y-3">
            <Field label={tr("المبلغ", "Amount")} error={err.amount} hint={tr(`حتى ${money(room)}`, `Up to ${money(room)}`)}>
              <NumberInput value={amount} onChange={setAmount} suffix={tr("د.ع", "IQD")} />
            </Field>
            <Field label={tr("ما الخطأ؟", "What was the mistake?")} error={err.reason}>
              <Textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={2} />
            </Field>
            <div className="flex flex-wrap gap-1.5">
              {REASONS_AR.map((r) => (
                <button key={r} type="button" onClick={() => setReason(r)} className="rounded-full border border-line-strong px-2.5 py-1 text-xs text-muted hover:border-action hover:text-text">
                  {r}
                </button>
              ))}
            </div>
          </div>
        </Dialog>
      )}
    </>
  );
}

/** The shop's credit (what the company owes it), and the button that gives it back. */
export function RefundButton({ customerId, credit, onDone }: { customerId: number; credit: number; onDone: () => void }) {
  const { tr, money, date } = useFmt();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const payments = useLoad(() => (open ? api.listPayments() : Promise.resolve([] as Payment[])), [open]);
  const online = (payments.data ?? []).filter((p) => p.customer_id === customerId && p.method === "online" && p.amount > 0 && !p.reversed);
  const [amount, setAmount] = useState<number | "">(credit);
  const [method, setMethod] = useState<Refund["method"]>("cash");
  const [paymentId, setPaymentId] = useState<number | "">("");
  const [reason, setReason] = useState("");
  const [err, setErr] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  if (credit <= 0) return null;
  return (
    <>
      <Button variant="action" size="sm" onClick={() => setOpen(true)}>
        <HandCoins className="size-4" /> {tr("أعِد المبلغ للزبون", "Refund the shop")}
      </Button>
      {open && (
        <Dialog
          open
          onClose={() => setOpen(false)}
          title={tr("إعادة مبلغ للزبون", "Refund to the shop")}
          footer={
            <Button
              variant="action"
              className="w-full"
              loading={busy}
              disabled={busy || amount === "" || !reason.trim() || (method === "online" && paymentId === "")}
              onClick={async () => {
                setBusy(true);
                setErr({});
                try {
                  const r = await api.refundCustomer(customerId, { amount: Number(amount), method, ...(method === "online" ? { payment_id: Number(paymentId) } : {}), reason });
                  toast("success", tr(`أُعيد ${money(r.amount)} (${r.number})`, `Refunded ${money(r.amount)} (${r.number})`));
                  setOpen(false);
                  onDone();
                } catch (e) {
                  if (e instanceof ApiError && e.errors) setErr(e.errors);
                  toast("danger", errorText(e, tr));
                } finally {
                  setBusy(false);
                }
              }}
            >
              <RotateCcw className="size-4" /> {tr("أعِد المبلغ", "Refund")}
            </Button>
          }
        >
          <p className="mb-3 rounded-xl bg-success-soft p-3 text-sm text-success">
            {tr("رصيد الزبون عندنا", "The shop's credit with us")}: <Money value={credit} className="font-bold" />
          </p>
          <div className="space-y-3">
            <Field label={tr("المبلغ", "Amount")} error={err.amount}>
              <NumberInput value={amount} onChange={setAmount} suffix={tr("د.ع", "IQD")} />
            </Field>
            <Field label={tr("كيف يُعاد؟", "How?")} error={err.method}>
              <Segmented
                value={method}
                onChange={setMethod}
                options={[
                  { value: "cash", label: tr("نقداً", "Cash") },
                  { value: "transfer", label: tr("تحويل", "Transfer") },
                  { value: "online", label: tr("إلى بطاقة Qi", "To the Qi card") },
                ]}
              />
            </Field>
            {method === "online" && (
              <Field label={tr("التسديد الأونلاين الذي تُعاد إلى بطاقته", "The online payment to refund to")} error={err.payment_id}>
                <Select value={paymentId} onChange={(e) => setPaymentId(Number(e.target.value) || "")}>
                  <option value="">{online.length ? tr("اختر", "Choose") : tr("لا توجد تسديدات أونلاين لهذا الزبون", "No online payments")}</option>
                  {online.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.number} · {date(p.date)} · {money(p.amount)} · {p.gateway?.card ?? ""}
                    </option>
                  ))}
                </Select>
              </Field>
            )}
            <Field label={tr("السبب", "Reason")} error={err.reason}>
              <Textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={2} placeholder={tr("مثلاً: تعويض عن بضاعة تالفة", "e.g. credit for spoiled goods")} />
            </Field>
          </div>
        </Dialog>
      )}
    </>
  );
}
