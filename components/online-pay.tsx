"use client";

// The shop owner pays his debt online, with ZainCash (his wallet) or Qi Card (a card), from his statement page:
// 1. PayOnlineCard: choose the amount → our server creates the payment → go to the gateway's page.
// 2. OnlineReturn: back from the gateway with ?payment=…, ask our server until the result is final
//    (coming back does not mean it worked: only the gateway's notification decides, like in Project 1).
import { useSearchParams } from "next/navigation";
import { inApp, useAppPath, useAppRouter } from "@/lib/app-path";
import { useEffect, useState } from "react";
import { motion } from "motion/react";
import { CheckCircle2, CreditCard, Loader2, Lock, RotateCcw, Wallet, X, XCircle } from "lucide-react";
import { Button, Card, NumberInput, errorText } from "@/components/ui";
import { api, ApiError } from "@/lib/api";
import type { Customer, Gateway } from "@/lib/api/types";
import { ZAINCASH } from "@/lib/zaincash";
import { useFmt } from "@/lib/i18n";
import { newClientRef } from "@/lib/offline";
import { useLoad } from "@/lib/use-load";
import { cn } from "@/lib/utils";
import { onlineStatusLabel } from "./pay-method";
import { useRules } from "@/lib/use-rules";

/** `order`: paying for one delivered order (the delivery rep's door request, or the shop owner's own choice):
 *  the amount starts at what it asks, and the gateway brings him back to that order's page. */
export function PayOnlineCard(p: { customer: Customer; order?: { id: number; number: string; amount: number; provider?: Gateway } }) {
  // Hidden while the manager has online payment turned off (advanced settings → features).
  return useRules().features.online_pay ? <PayCard {...p} /> : null;
}

function PayCard({ customer, order }: { customer: Customer; order?: { id: number; number: string; amount: number; provider?: Gateway } }) {
  const { tr, money } = useFmt();
  const { prefix } = useAppPath();
  const owed = Math.max(0, customer.balance ?? 0);
  const start = order ? Math.min(order.amount, owed) : owed;
  const [amount, setAmount] = useState<number | "">(start || "");
  const [busy, setBusy] = useState<Gateway | null>(null);
  const [error, setError] = useState<string | null>(null);
  if (owed <= 0) return null;
  const zcLow = amount !== "" && amount < ZAINCASH.min;

  async function pay(provider: Gateway) {
    if (!amount) return;
    setBusy(provider);
    setError(null);
    try {
      // A new key for every attempt: after a failed try, "pay" again must open a NEW payment
      // (the same key would bring back the old, finished one). A double press is blocked by "busy".
      // The way back is this app's statement page (in the shop app: /client/statement).
      const back = order ? `/orders/${order.id}` : "/statement";
      const p = await api.startOnlinePayment({ customer_id: customer.id, amount, provider, key: newClientRef(), return_url: inApp(prefix, back), ...(order ? { order_id: order.id } : {}) });
      // The card is typed on the gateway's page, never on our site.
      window.location.assign(p.form_url);
    } catch (e) {
      setError(e instanceof ApiError && e.errors?.amount ? e.errors.amount : errorText(e, tr));
      setBusy(null);
    }
  }

  return (
    <Card className="mb-4 overflow-hidden">
      <div className="flex flex-wrap items-center gap-3 border-b border-line bg-[#1a1a1a] px-4 py-3 text-white">
        <span className="flex -space-x-2 rtl:space-x-reverse">
          <span className="flex size-9 items-center justify-center rounded-lg bg-[#6b2a8c] text-[10px] font-black text-white ring-2 ring-[#1a1a1a]">Zain</span>
          <span className="flex size-9 items-center justify-center rounded-lg bg-[#f7c600] text-sm font-black text-black ring-2 ring-[#1a1a1a]">Qi</span>
        </span>
        <div className="min-w-0 flex-1">
          <p className="font-bold">
            {order?.provider
              ? tr(`طلب المندوب الدفع بـ${order.provider === "zaincash" ? "زين كاش" : "Qi"}: ${money(order.amount)}`, `The rep asked you to pay ${money(order.amount)} by ${order.provider === "zaincash" ? "ZainCash" : "Qi"}`)
              : order
                ? tr(`ادفع الطلب ${order.number} أونلاين`, `Pay ${order.number} online`)
                : tr("سدّد أونلاين: زين كاش أو بطاقة Qi", "Pay online: ZainCash or Qi Card")}
          </p>
          <p className="text-xs opacity-75">{tr("يُسجَّل التسديد فوراً ويُخصم من أقدم فاتورة. يجوز دفع جزء من المبلغ.", "Recorded at once, applied to your oldest invoice. Paying part of it is fine.")}</p>
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
              ...(order && start < owed ? [{ l: tr("هذا الطلب", "This order"), v: start }] : []),
              { l: tr("كل الدين", "All of it"), v: owed },
              { l: tr("النصف", "Half"), v: Math.round(start / 2 / 250) * 250 },
            ].map((x) => (
              <button key={x.l} type="button" onClick={() => setAmount(x.v)} className={cn("rounded-full border px-3 py-1 text-xs font-semibold", amount === x.v ? "border-action bg-action/10 text-action" : "border-line-strong text-muted hover:text-text")}>
                {x.l} · <span className="num">{money(x.v)}</span>
              </button>
            ))}
          </div>
          {error && <p className="mt-2 text-xs text-danger">{error}</p>}
        </div>
        <div className="flex flex-col gap-2 sm:w-56">
          {/* ZainCash: from the customer's wallet, on ZainCash's own page (sandbox in the demo). */}
          <Button className={cn("h-12 border-0 bg-[#6b2a8c] px-6 text-white hover:bg-[#5a2276]", order?.provider === "qi" && "order-last")} disabled={!amount || !!busy || zcLow} onClick={() => pay("zaincash")}>
            {busy === "zaincash" ? <Loader2 className="size-4 animate-spin" /> : <Wallet className="size-4" />} {tr("ادفع بزين كاش", "Pay with ZainCash")}
          </Button>
          <Button variant="action" className="h-12 px-6" disabled={!amount || !!busy} onClick={() => pay("qi")}>
            {busy === "qi" ? <Loader2 className="size-4 animate-spin" /> : <CreditCard className="size-4" />} {tr("ادفع ببطاقة Qi", "Pay with Qi Card")}
          </Button>
          {zcLow && <p className="text-[11px] text-muted">{tr(`زين كاش من ${money(ZAINCASH.min)} فأكثر`, `ZainCash from ${money(ZAINCASH.min)}`)}</p>}
        </div>
      </div>
    </Card>
  );
}

/** After the gateway: shows the result, asking again every second while it is still being checked. */
/** `back`: the page it was opened from (the statement, or an order's page). */
export function OnlineReturn({ back = "/statement" }: { back?: string }) {
  const id = useSearchParams().get("payment");
  if (!id) return null;
  return <ReturnBanner key={id} id={id} back={back} />;
}

function ReturnBanner({ id, back }: { id: string; back: string }) {
  const { tr, money } = useFmt();
  const router = useAppRouter();
  const p = useLoad(() => api.getOnlinePayment(id), [id]);
  const status = p.data?.status;

  // Still "created" = the gateway's notification hasn't reached us yet: ask again shortly.
  useEffect(() => {
    if (status && status !== "created") return;
    const t = setInterval(p.reload, 1000);
    return () => clearInterval(t);
  }, [status, p.reload]);

  const close = () => router.replace(back);
  const ok = status === "success";
  const waiting = !status || status === "created";
  const zc = p.data?.provider === "zaincash";
  const gw = zc ? tr("زين كاش", "ZainCash") : "Qi";
  // ZainCash waits up to 15 minutes for the customer: back here without paying, he can finish it or leave it.
  const [long, setLong] = useState(false);
  useEffect(() => {
    if (!zc || !waiting) return;
    const t = setTimeout(() => setLong(true), 20000);
    return () => clearTimeout(t);
  }, [zc, waiting]);
  if (p.state.status === "error") return null;

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
          {waiting ? tr(`نتحقق من الدفع مع ${gw}…`, `Checking the payment with ${gw}…`) : ok ? tr("تم الدفع بنجاح", "Payment succeeded") : tr("لم يتم الدفع", "The payment didn't go through")}
        </p>
        <p className="text-sm text-muted">
          {waiting
            ? tr("لحظات فقط. لا تغلق الصفحة.", "Just a moment. Don't close the page.")
            : ok
              ? tr(`سُجّل تسديد ${money(p.data!.amount)} وخُصم من أقدم فواتيرك.`, `${money(p.data!.amount)} was recorded and applied to your oldest invoices.`)
              : zc
                ? tr(`${onlineStatusLabel(status!, tr)}. لم يُسحب أي مبلغ من محفظتك، ويمكنك المحاولة مرة أخرى.`, `${onlineStatusLabel(status!, tr)}. Nothing was taken from your wallet; you can try again.`)
                : tr(`${onlineStatusLabel(status!, tr)}. لم يُسحب أي مبلغ من بطاقتك، ويمكنك المحاولة مرة أخرى.`, `${onlineStatusLabel(status!, tr)}. Nothing was taken from your card; you can try again.`)}
        </p>
        {waiting && long && p.data && (
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <span className="text-xs text-muted">{tr("لم تُكمل الدفع بعد في زين كاش.", "You haven't finished paying at ZainCash yet.")}</span>
            <Button size="sm" className="border-0 bg-[#6b2a8c] text-white hover:bg-[#5a2276]" href={p.data.form_url}>
              {tr("أكمل الدفع في زين كاش", "Finish at ZainCash")}
            </Button>
            <Button size="sm" variant="ghost" onClick={close}>
              {tr("إلغاء", "Cancel")}
            </Button>
          </div>
        )}
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
