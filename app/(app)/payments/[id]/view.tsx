"use client";

import { ShareWhatsApp } from "@/components/share";
import { ThermalReceiptButton } from "@/components/thermal-receipt";
import { paymentReceipt } from "@/lib/receipts";
import { useBrand } from "@/lib/site";

import { useState } from "react";
import { RotateCcw } from "lucide-react";
import { MethodChip } from "@/components/pay-method";
import { useApp } from "@/components/shell";
import { roleName } from "@/components/status";
import { Badge, Button, Card, CardHeader, Dialog, ErrorBox, errorText, Field, GoIcon, KV, LoadingRows, Money, Notice, NumberInput, PageHeader, RefLink, Textarea, useToast } from "@/components/ui";
import { api, ApiError } from "@/lib/api";
import { useFmt } from "@/lib/i18n";
import { useLoad } from "@/lib/use-load";
import { useIdParam } from "@/lib/utils";

export default function PaymentView() {
  const id = useIdParam();
  const fmt = useFmt();
  const { tr, dateTime, money } = fmt;
  const brand = useBrand();
  const { user, itemById } = useApp();
  const toast = useToast();
  const pay = useLoad(() => api.getPayment(id), [id]);
  const p = pay.data;
  const customer = useLoad(() => (p ? api.getCustomer(p.customer_id) : Promise.resolve(undefined)), [p?.customer_id]);
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  // How much to reverse: all that is left of it, or any part.
  const [amount, setAmount] = useState<number | "">("");
  const [amountErr, setAmountErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (pay.state.status === "loading") return <LoadingRows />;
  if (pay.state.status === "error" || !p) return <ErrorBox error={pay.state.status === "error" ? pay.state.error : null} onRetry={pay.reload} />;
  const canReverse = (user.role === "manager" || user.role === "accountant") && !p.reversed && !p.reversal_of;
  const left = p.amount - (p.reversed_amount ?? 0);

  return (
    <>
      <PageHeader
        back="/payments"
        title={
          <span className="flex flex-wrap items-center gap-2">
            {p.reversal_of ? tr("عملية عكسية", "Reverse entry") : tr("تسديد", "Payment")} <span className="num">{p.number}</span>
            {p.reversed && <Badge>{tr("معكوس", "Reversed")}</Badge>}
            {!p.reversed && !!p.reversed_amount && <Badge tone="warning">{tr("معكوس جزئياً", "Partly reversed")}</Badge>}
          </span>
        }
        actions={
          <>
            {/* The receipt on the thermal printer (the rep's pocket printer, the office's). */}
            {user.role !== "shop" && !p.reversed && !p.reversal_of && <ThermalReceiptButton company={brand.company} build={() => paymentReceipt(p, customer.data, { fmt, itemById })} />}
            {/* The receipt for the shop, in one tap. */}
            {user.role !== "shop" && !p.reversed && (
              <ShareWhatsApp
                phone={customer.data?.phone}
                text={() =>
                  [
                    brand.company,
                    tr(`وصل استلام ${p.number}`, `Receipt ${p.number}`),
                    `${customer.data?.name ?? ""}`,
                    `${tr("المبلغ", "Amount")}: ${money(p.amount)}`,
                    `${tr("التاريخ", "Date")}: ${dateTime(p.date)}`,
                    tr("شكراً لكم", "Thank you"),
                  ].join("\n")
                }
              />
            )}
            {canReverse && (
              <Button variant="danger" onClick={() => (setAmount(left), setOpen(true))}>
                <RotateCcw className="size-4" /> {tr("عكس التسديد", "Reverse payment")}
              </Button>
            )}
          </>
        }
      />
      <div className="grid max-w-4xl gap-4 lg:grid-cols-2">
        <Card className="p-4">
          <p className="text-xs text-muted">{tr("المبلغ", "Amount")}</p>
          <Money value={p.amount} className={`text-3xl font-bold ${p.amount < 0 ? "text-danger" : ""}`} />
          <div className="mt-3 border-t border-line pt-2">
            <KV k={tr("الزبون", "Customer")} href={customer.data && `/customers/${customer.data.id}`} v={customer.data?.name ?? "…"} />
            <KV k={tr("الوقت", "Time")} v={dateTime(p.date)} />
            <KV k={p.method === "online" ? tr("دفعه", "Paid by") : tr("سجّله", "Entered by")} v={`${p.received_by.name} (${roleName(p.received_by.role, tr)})`} />
            <KV k={tr("الطريقة", "Method")} v={<MethodChip m={p.method} tr={tr} gateway={p.gateway?.provider} />} />
            {p.note && <KV k={tr("ملاحظة", "Note")} v={p.note} />}
            {p.reason && <KV k={tr("سبب العكس", "Reason")} v={p.reason} />}
          </div>
          {/* Online payment: what the gateway told us (Qi: never the full card number; ZainCash: the wallet, hidden in the middle) */}
          {p.gateway && (
            <div className="mt-3 rounded-xl border border-line bg-card-2 p-3">
              <p className="mb-1 flex items-center gap-2 text-sm font-bold">
                {p.gateway.provider === "zaincash" ? (
                  <span className="flex size-6 items-center justify-center rounded-md bg-[#6b2a8c] text-[8px] font-black text-white">Zain</span>
                ) : (
                  <span className="flex size-6 items-center justify-center rounded-md bg-[#f7c600] text-[10px] font-black text-black">Qi</span>
                )}
                {tr("تفاصيل الدفع الأونلاين", "Online payment details")}
              </p>
              <KV k={tr("بوابة الدفع", "Gateway")} v={p.gateway.provider === "zaincash" ? tr("زين كاش", "ZainCash") : "Qi Card"} />
              <KV
                k={p.gateway.provider === "zaincash" ? tr("رقم العملية لدى زين كاش", "ZainCash reference") : tr("رقم العملية لدى Qi", "Qi reference")}
                v={
                  <span className="num text-xs" dir="ltr">
                    {p.gateway.payment_id}
                  </span>
                }
              />
              <KV
                k={p.gateway.provider === "zaincash" ? tr("المحفظة", "Wallet") : tr("البطاقة", "Card")}
                v={
                  <span className="num" dir="ltr">
                    {p.gateway.card}
                  </span>
                }
              />
              <KV k={tr("حالة البوابة", "Gateway status")} v={<span className="font-semibold text-success">{tr("نجح", "Succeeded")}</span>} />
              <p className="mt-2 text-[11px] text-muted">
                {p.gateway.provider === "zaincash"
                  ? tr("عند عكس تسديد أونلاين، يُرجَع المبلغ للزبون من زين كاش (إرجاع كامل أو جزئي).", "If an online payment is reversed, refund the customer through ZainCash (full or partial reverse).")
                  : tr("عند عكس تسديد أونلاين، يُرجَع المبلغ للزبون من لوحة Qi نفسها.", "If an online payment is reversed, refund the customer from Qi's own dashboard.")}
              </p>
            </div>
          )}
          {p.reversal_of && (
            <div className="mt-3">
              <Notice tone="primary" href={`/payments/${p.reversal_of}`}>
                {tr("هذه عملية عكسية تلغي أثر التسديد", "This reverse entry cancels payment")} <b className="num">#{p.reversal_of}</b>
              </Notice>
            </div>
          )}
          {!p.reversed && !!p.reversed_amount && p.reversed_by_id && (
            <div className="mt-3">
              <Notice tone="warning" href={`/payments/${p.reversed_by_id}`}>
                {tr("عُكس منه", "Reversed so far")} <Money value={p.reversed_amount} />، {tr("ويبقى منه", "what is left")} <Money value={left} />. {tr("آخر عملية عكسية", "Latest reverse entry")} <b className="num">#{p.reversed_by_id}</b>.
              </Notice>
            </div>
          )}
          {p.reversed && p.reversed_by_id && (
            <div className="mt-3">
              <Notice tone="warning" href={`/payments/${p.reversed_by_id}`}>
                {tr("تم عكس هذا التسديد بالعملية", "This payment was reversed by")} <b className="num">#{p.reversed_by_id}</b>.{" "}
                {tr("يبقى التسديد ظاهراً ولا يُحذف.", "It stays visible and is never deleted.")}
              </Notice>
            </div>
          )}
        </Card>
        <Card>
          <CardHeader title={tr("توزيع المبلغ على الفواتير", "Applied to invoices")} subtitle={tr("الأقدم أولاً", "Oldest first")} />
          <ul className="divide-y divide-line text-sm">
            {p.allocations.map((a) => (
              <li key={a.invoice_id} className="box-row flex items-center justify-between gap-3 px-4 py-2.5">
                <RefLink main href={`/invoices/${a.invoice_id}`} className="num">
                  {a.number}
                </RefLink>
                <span className="flex items-center gap-1.5">
                  <Money value={a.amount} className="font-medium" />
                  <GoIcon className="text-faint" />
                </span>
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
              disabled={!reason.trim() || !amount}
              onClick={async () => {
                if (!amount) return;
                setBusy(true);
                setAmountErr(null);
                try {
                  await api.reversePayment(p.id, reason, amount);
                  toast(
                    "success",
                    amount < left
                      ? tr(`عُكس ${money(amount)} من التسديد، وعاد على الزبون دينه`, `${money(amount)} reversed; that much is owed again`)
                      : tr("تم العكس، وعاد الدين على الزبون", "Reversed. The debt is back on the customer"),
                  );
                  setOpen(false);
                  setReason("");
                  pay.reload();
                } catch (e) {
                  if (e instanceof ApiError && e.errors?.amount) setAmountErr(e.errors.amount);
                  else toast("danger", errorText(e, tr));
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
          <Notice tone="primary">
            {tr(
              "التسديد لا يُحذف، بل ستُسجَّل عملية عكسية بالمبلغ الذي تختاره باسمك، وتظهر في كشف الحساب. يمكن عكس جزء منه الآن، والباقي لاحقاً.",
              "Payments are never deleted. A reverse entry for the amount you choose is saved under your name and shows in the statement. You can reverse part now and more later.",
            )}
          </Notice>
          <Field label={tr("المبلغ المعكوس", "Amount to reverse")} error={amountErr ?? undefined}>
            <NumberInput value={amount} onChange={(v) => (setAmount(v), setAmountErr(null))} suffix={tr("د.ع", "IQD")} invalid={!!amountErr} />
            <div className="mt-2 flex flex-wrap gap-1.5">
              {[
                { l: tr("كل ما بقي", "All that is left"), v: left },
                { l: tr("النصف", "Half"), v: Math.round(left / 2 / 250) * 250 },
              ].map((x) => (
                <button key={x.l} type="button" onClick={() => setAmount(x.v)} className={"rounded-full border px-3 py-1 text-xs font-semibold " + (amount === x.v ? "border-action bg-action/10 text-action" : "border-line-strong text-muted")}>
                  {x.l} · <Money value={x.v} />
                </button>
              ))}
            </div>
          </Field>
          <Field label={tr("السبب", "Reason")}>
            <Textarea value={reason} onChange={(e) => setReason(e.target.value)} placeholder={tr("مثلاً: سُجّل مرتين خطأً", "e.g. entered twice by mistake")} />
          </Field>
        </div>
      </Dialog>
    </>
  );
}
