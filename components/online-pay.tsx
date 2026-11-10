"use client";

// The shop owner pays his debt online with Qi Card, from his statement page:
// 1. PayOnlineCard: choose the amount → our server creates the payment → go to the gateway's page.
// 2. OnlineReturn: back from the gateway with ?payment=…, ask our server until the result is final
//    (coming back does not mean it worked: only the gateway's notification decides, like in Project 1).
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { motion } from "motion/react";
import { CheckCircle2, CreditCard, Loader2, Lock, RotateCcw, X, XCircle } from "lucide-react";
import { Button, Card, NumberInput, errorText } from "@/components/ui";
import { api, ApiError } from "@/lib/api";
import type { Customer } from "@/lib/api/types";
import { useFmt } from "@/lib/i18n";
import { newClientRef } from "@/lib/offline";
import { useLoad } from "@/lib/use-load";
import { cn } from "@/lib/utils";
import { onlineStatusLabel } from "./pay-method";

export function PayOnlineCard({ customer }: { customer: Customer }) {
  const { tr, money } = useFmt();
  const owed = Math.max(0, customer.balance ?? 0);
  const [amount, setAmount] = useState<number | "">(owed || "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (owed <= 0) return null;

  async function pay() {
    if (!amount) return;
    setBusy(true);
    setError(null);
    try {
      // A new key for every attempt: after a failed try, "pay" again must open a NEW payment
      // (the same key would bring back the old, finished one). A double press is blocked by "busy".
      const p = await api.startOnlinePayment({ customer_id: customer.id, amount, key: newClientRef(), return_url: "/statement" });
      // The card is typed on the gateway's page, never on our site.
      window.location.assign(p.form_url);
    } catch (e) {
      setError(e instanceof ApiError && e.errors?.amount ? e.errors.amount : errorText(e, tr));
      setBusy(false);
    }
  }

  return (
    <Card className="mb-4 overflow-hidden">
      <div className="flex flex-wrap items-center gap-3 border-b border-line bg-[#1a1a1a] px-4 py-3 text-white">
        <span className="flex size-9 items-center justify-center rounded-lg bg-[#f7c600] text-sm font-black text-black">Qi</span>
        <div className="min-w-0 flex-1">
          <p className="font-bold">{tr("سدّد أونلاين ببطاقة Qi", "Pay online with Qi Card")}</p>
          <p className="text-xs opacity-75">{tr("يُسجَّل التسديد فوراً ويُخصم من أقدم فاتورة", "Recorded at once, applied to your oldest invoice")}</p>
        </div>
        <Lock className="size-4 opacity-70" />
      </div>
      <div className="grid gap-3 p-4 sm:grid-cols-[1fr_auto] sm:items-end">
        <div>
          <label htmlFor="online-amount" className="mb-1.5 block text-sm font-medium">
            {tr("المبلغ", "Amount")}
          </label>
          <NumberInput id="online-amount" value={amount} onChange={setAmount} suffix={tr("د.ع", "IQD")} invalid={!!error} />
          <div className="mt-2 flex flex-wrap gap-1.5">
            {[
              { l: tr("كل الدين", "All of it"), v: owed },
              { l: tr("النصف", "Half"), v: Math.round(owed / 2 / 250) * 250 },
            ].map((x) => (
              <button key={x.l} type="button" onClick={() => setAmount(x.v)} className={cn("rounded-full border px-3 py-1 text-xs font-semibold", amount === x.v ? "border-action bg-action/10 text-action" : "border-line-strong text-muted hover:text-text")}>
                {x.l} · <span className="num">{money(x.v)}</span>
              </button>
            ))}
          </div>
          {error && <p className="mt-2 text-xs text-danger">{error}</p>}
        </div>
        <Button variant="action" className="h-12 px-6" disabled={!amount || busy} onClick={pay}>
          {busy ? <Loader2 className="size-4 animate-spin" /> : <CreditCard className="size-4" />} {tr("ادفع عبر Qi", "Pay with Qi")}
        </Button>
      </div>
    </Card>
  );
}

/** After the gateway: shows the result, asking again every second while it is still being checked. */
export function OnlineReturn() {
  const id = useSearchParams().get("payment");
  if (!id) return null;
  return <ReturnBanner key={id} id={id} />;
}

function ReturnBanner({ id }: { id: string }) {
  const { tr, money } = useFmt();
  const router = useRouter();
  const p = useLoad(() => api.getOnlinePayment(id), [id]);
  const status = p.data?.status;

  // Still "created" = the gateway's notification hasn't reached us yet: ask again shortly.
  useEffect(() => {
    if (status && status !== "created") return;
    const t = setInterval(p.reload, 1000);
    return () => clearInterval(t);
  }, [status, p.reload]);

  const close = () => router.replace("/statement");
  if (p.state.status === "error") return null;
  const ok = status === "success";
  const waiting = !status || status === "created";

  return (
    <motion.div
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      role="status"
      className={cn("mb-4 flex items-start gap-3 rounded-2xl border p-4", waiting ? "border-line bg-card" : ok ? "border-success/30 bg-success-soft" : "border-danger/30 bg-danger-soft")}
    >
      <span className={cn("mt-0.5 shrink-0", waiting ? "text-muted" : ok ? "text-success" : "text-danger")}>
        {waiting ? <Loader2 className="size-6 animate-spin" /> : ok ? <CheckCircle2 className="size-6" /> : <XCircle className="size-6" />}
      </span>
      <div className="min-w-0 flex-1">
        <p className="font-bold">
          {waiting ? tr("نتحقق من الدفع مع Qi…", "Checking the payment with Qi…") : ok ? tr("تم الدفع بنجاح", "Payment succeeded") : tr("لم يتم الدفع", "The payment didn't go through")}
        </p>
        <p className="text-sm text-muted">
          {waiting
            ? tr("لحظات فقط. لا تغلق الصفحة.", "Just a moment. Don't close the page.")
            : ok
              ? tr(`سُجّل تسديد ${money(p.data!.amount)} وخُصم من أقدم فواتيرك.`, `${money(p.data!.amount)} was recorded and applied to your oldest invoices.`)
              : tr(`${onlineStatusLabel(status!, tr)}. لم يُسحب أي مبلغ من بطاقتك، ويمكنك المحاولة مرة أخرى.`, `${onlineStatusLabel(status!, tr)}. Nothing was taken from your card; you can try again.`)}
        </p>
        {!waiting && !ok && (
          <Button size="sm" className="mt-2" onClick={close}>
            <RotateCcw className="size-3.5" /> {tr("حاول مرة أخرى", "Try again")}
          </Button>
        )}
      </div>
      {!waiting && (
        <button type="button" onClick={close} aria-label={tr("إغلاق", "Close")} className="shrink-0 rounded-lg p-1 text-muted hover:bg-card-2">
          <X className="size-4" />
        </button>
      )}
    </motion.div>
  );
}
