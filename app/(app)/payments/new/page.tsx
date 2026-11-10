"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { ArrowDownWideNarrow, CheckCircle2, WifiOff } from "lucide-react";
import { Button, Card, CardHeader, Field, LimitBar, Money, NumberInput, Notice, PageHeader, Segmented, Select, Textarea, errorText, useToast } from "@/components/ui";
import { api, ApiError } from "@/lib/api";
import type { NewPayment, PayMethod } from "@/lib/api/types";
import { useFmt } from "@/lib/i18n";
import { enqueue, isNetworkError, newClientRef, useOffline } from "@/lib/offline";
import { useLoad } from "@/lib/use-load";

export default function NewPaymentPage() {
  const { tr, money, date } = useFmt();
  const router = useRouter();
  const toast = useToast();
  const offline = useOffline();
  const customers = useLoad(() => api.listCustomers(), []);
  const [customerId, setCustomerId] = useState<number | "">(() => (typeof window !== "undefined" ? Number(new URLSearchParams(window.location.search).get("customer")) || "" : ""));
  const [amount, setAmount] = useState<number | "">("");
  const [method, setMethod] = useState<PayMethod>("cash");
  const [note, setNote] = useState("");
  const [ref] = useState(newClientRef);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<Record<string, string>>({});
  const [debounced, setDebounced] = useState(0);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(typeof amount === "number" ? amount : 0), 250);
    return () => clearTimeout(t);
  }, [amount]);

  const c = customers.data?.find((x) => x.id === customerId);
  const invoices = useLoad(() => (customerId ? api.listInvoices() : Promise.resolve([])), [customerId]);
  const open = (invoices.data ?? []).filter((i) => i.customer_id === customerId && i.remaining > 0).sort((a, b) => a.date.localeCompare(b.date));
  const preview = useLoad(() => (customerId && debounced > 0 ? api.previewAllocation(customerId, debounced) : Promise.resolve([])), [customerId, debounced]);
  const balance = c?.balance ?? 0;
  const tooMuch = typeof amount === "number" && amount > balance;

  async function submit() {
    if (!c || typeof amount !== "number" || amount <= 0) {
      setErr({ amount: tr("اكتب المبلغ", "Enter the amount") });
      return;
    }
    const body: NewPayment = { client_ref: ref, customer_id: c.id, amount, method, note: note || undefined };
    setBusy(true);
    try {
      const p = await api.createPayment(body);
      toast("success", tr(`تم حفظ التسديد ${money(amount)} من ${c.name}`, `Saved ${money(amount)} from ${c.name}`));
      router.push(`/payments/${p.id}`);
    } catch (e) {
      if (isNetworkError(e)) {
        enqueue({ kind: "payment", client_ref: ref, body, label: `${c.name} · ${money(amount)}`, saved_at: new Date().toISOString() });
        toast("primary", tr("بدون إنترنت: حُفظ التسديد على الجوال وسيُرسَل تلقائياً", "Offline: the payment is saved on the phone and will send by itself"));
        router.push("/payments");
      } else {
        if (e instanceof ApiError && e.errors) setErr(e.errors);
        toast("danger", errorText(e, tr));
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <PageHeader title={tr("استلام تسديد", "Take a payment")} back="/payments" />
      <div className="grid gap-4 lg:grid-cols-[1fr_380px]">
        <Card className="space-y-4 p-4">
          <Field label={tr("الزبون", "Customer")}>
            <Select
              value={customerId}
              onChange={(e) => {
                setCustomerId(Number(e.target.value) || "");
                setErr({});
              }}
            >
              <option value="">{tr("اختر المحل", "Choose the shop")}</option>
              {(customers.data ?? [])
                .filter((x) => (x.balance ?? 0) > 0 || x.id === customerId)
                .sort((a, b) => a.name.localeCompare(b.name, "ar"))
                .map((x) => (
                  <option key={x.id} value={x.id}>
                    {x.name} — {money(x.balance)}
                  </option>
                ))}
            </Select>
          </Field>
          {c && (
            <div className="rounded-xl bg-card-2 p-3">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted">{tr("الدين الحالي", "Current debt")}</span>
                <Money value={balance} className="text-lg font-bold" />
              </div>
              {c.debt_limit !== undefined && (
                <div className="mt-2">
                  <LimitBar balance={balance} limit={c.debt_limit} />
                  <p className="mt-1 text-xs text-muted">
                    {tr("السقف", "Limit")} {money(c.debt_limit)}
                  </p>
                </div>
              )}
            </div>
          )}
          <Field label={tr("المبلغ المستلم", "Amount received")} error={err.amount ?? (tooMuch ? tr(`أكثر من الدين (${money(balance)})`, `More than the debt (${money(balance)})`) : undefined)}>
            <NumberInput value={amount} onChange={(v) => { setAmount(v); setErr({}); }} suffix={tr("د.ع", "IQD")} invalid={!!err.amount || tooMuch} placeholder="250,000" />
          </Field>
          {c && balance > 0 && (
            <div className="flex flex-wrap gap-2">
              {[0.25, 0.5, 1].map((f) => {
                const v = f === 1 ? balance : Math.round((balance * f) / 5000) * 5000;
                return (
                  <Button key={f} size="sm" variant="soft" onClick={() => setAmount(v)}>
                    {f === 1 ? tr("كل الدين", "Full debt") : `${f * 100}%`} · <span className="num">{money(v, { bare: true })}</span>
                  </Button>
                );
              })}
            </div>
          )}
          <Field label={tr("طريقة الدفع", "Method")}>
            <Segmented
              value={method}
              onChange={setMethod}
              options={[
                { value: "cash", label: tr("نقداً", "Cash") },
                { value: "transfer", label: tr("تحويل / زين كاش", "Transfer") },
              ]}
            />
          </Field>
          <Field label={tr("ملاحظة", "Note")}>
            <Textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder={tr("اختياري", "Optional")} />
          </Field>
          {offline && <Notice tone="primary">{tr("بدون إنترنت: يُحفظ التسديد على الجوال ويُرسَل تلقائياً.", "Offline: the payment is saved on the phone and sent later.")}</Notice>}
          <Button variant="action" size="lg" className="w-full" loading={busy} disabled={!c || !amount || tooMuch} onClick={submit}>
            {offline ? <WifiOff className="size-5" /> : <CheckCircle2 className="size-5" />}
            {tr("حفظ التسديد", "Save payment")} {typeof amount === "number" && amount > 0 && <span className="num">· {money(amount)}</span>}
          </Button>
        </Card>

        <Card>
          <CardHeader title={<span className="flex items-center gap-2"><ArrowDownWideNarrow className="size-4" /> {tr("على أي الفواتير يُوزَّع المبلغ", "Where the money goes")}</span>} subtitle={tr("الأقدم أولاً، تلقائياً", "Oldest first, automatically")} />
          {!c ? (
            <p className="p-6 text-center text-sm text-muted">{tr("اختر الزبون", "Choose a customer")}</p>
          ) : !open.length ? (
            <p className="p-6 text-center text-sm text-muted">{tr("لا توجد فواتير عليها باقي", "No unpaid invoices")}</p>
          ) : (
            <ul className="divide-y divide-line text-sm">
              {open.map((i) => {
                const a = preview.data?.find((x) => x.invoice_id === i.id);
                const full = a && a.amount >= i.remaining;
                return (
                  <li key={i.id} className="flex items-center justify-between gap-2 px-4 py-2.5">
                    <div>
                      <p className="num font-medium">{i.number}</p>
                      <p className="text-xs text-muted">
                        {date(i.date)} · {tr("الباقي", "left")} <span className="num">{money(i.remaining)}</span>
                      </p>
                    </div>
                    {a ? (
                      <span className={full ? "text-success" : "text-warning"}>
                        <Money value={a.amount} className="font-semibold" />
                        <span className="block text-end text-[11px]">{full ? tr("تُسدَّد كاملة", "fully paid") : tr("جزئي", "partly")}</span>
                      </span>
                    ) : (
                      <span className="text-xs text-faint">—</span>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </Card>
      </div>
    </>
  );
}
