"use client";

import { motion } from "motion/react";
import { Check, Clock, PhoneCall, ShoppingCart, XCircle } from "lucide-react";
import { ShopStore } from "@/components/shop-store";
import { useApp } from "@/components/shell";
import { Button, Card, ErrorBox, LoadingRows, Notice } from "@/components/ui";
import { api } from "@/lib/api";
import type { Customer } from "@/lib/api/types";
import { useFmt } from "@/lib/i18n";
import { useLoad } from "@/lib/use-load";
import { cn } from "@/lib/utils";

// The shop owner orders by himself, in a store made after the coffee-shop app design (components/shop-store.tsx).
// The order goes to the manager and to the shop's rep.
// A shop that signed up on the website sees a "waiting for approval" screen until the manager approves it;
// the screen turns into the order page by itself as soon as that happens.
export default function ShopOrderPage() {
  const { tr } = useFmt();
  const { user } = useApp();
  const id = user.customer_id ?? 0;
  const c = useLoad(() => api.getCustomer(id), [id]);

  if (!user.customer_id) return <Notice tone="danger">{tr("حسابك غير مرتبط بمحل، راجع الشركة", "Your account isn't linked to a shop. Contact the company")}</Notice>;
  if (c.state.status === "loading") return <LoadingRows />;
  if (c.state.status === "error" || !c.data) return <ErrorBox error={c.state.status === "error" ? c.state.error : null} onRetry={c.reload} />;
  if (c.data.pending) return <PendingAccount customer={c.data} />;
  if (!c.data.active) {
    return (
      <Card className="mx-auto mt-10 max-w-lg p-8 text-center">
        <XCircle className="mx-auto size-10 text-danger" />
        <h1 className="mt-3 text-xl font-bold">{tr("حسابك موقوف", "Your account is off")}</h1>
        <p className="mt-2 text-sm text-muted">{tr("لا يمكنك الطلب حالياً. تواصل مع الشركة.", "You can't order right now. Please contact the company.")}</p>
      </Card>
    );
  }
  return <ShopStore customer={c.data} />;
}

function PendingAccount({ customer }: { customer: Customer }) {
  const { tr } = useFmt();
  const { lookups } = useApp();
  const rep = lookups.reps.find((r) => r.id === customer.rep_id);
  const steps = [
    { done: true, now: false, t: tr("سجّلت محلك", "You registered your shop"), b: tr(`${customer.name} · ${customer.area}`, `${customer.name} · ${customer.area}`) },
    { done: false, now: true, t: tr("الشركة تراجع معلوماتك", "The company checks your details"), b: tr("تحدد أسعارك وسقف الدين ومندوب توصيلك", "It sets your prices, debt limit and delivery rep") },
    { done: false, now: false, t: tr("تطلب بضاعتك من الموقع", "You order your goods here"), b: tr("في أي وقت، من جوالك", "Any time, from your phone") },
  ];
  return (
    <div className="mx-auto max-w-xl py-6">
      <Card className="relative overflow-hidden p-6 sm:p-8">
        <div className="hazard absolute inset-x-0 top-0 h-1.5" aria-hidden />
        <motion.div initial={{ scale: 0.6, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ type: "spring", stiffness: 260, damping: 18 }} className="mx-auto flex size-16 items-center justify-center rounded-2xl bg-warning-soft text-warning">
          <Clock className="size-8" />
        </motion.div>
        <h1 className="mt-4 text-center text-2xl font-bold">{tr("حسابك قيد المراجعة", "Your account is being checked")}</h1>
        <p className="mx-auto mt-2 max-w-md text-center text-sm text-muted">
          {tr("تم تسجيلك بنجاح. تراجع شركة النهرين معلومات محلك وتحدد أسعارك، ثم يمكنك الطلب مباشرة. تتحدّث هذه الصفحة تلقائياً.", "You're registered. Al-Nahrain checks your shop's details and sets your prices, then you can order right away. This page updates by itself.")}
        </p>

        <ol className="mt-8 space-y-0">
          {steps.map((s, i) => (
            <motion.li key={s.t} initial={{ opacity: 0, x: 16 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.2 + i * 0.12 }} className="relative flex gap-4 pb-6 last:pb-0">
              {i < steps.length - 1 && <span className={cn("absolute start-[17px] top-9 h-[calc(100%-36px)] w-0.5", s.done ? "bg-success" : "bg-line")} aria-hidden />}
              <span
                className={cn(
                  "relative flex size-9 shrink-0 items-center justify-center rounded-full text-sm font-bold",
                  s.done ? "bg-success text-white" : s.now ? "bg-action text-on-action" : "bg-card-2 text-faint",
                )}
              >
                {s.done ? <Check className="size-4" /> : s.now ? <span className="size-2.5 animate-ping rounded-full bg-on-action" /> : i + 1}
              </span>
              <div className="pt-1.5">
                <p className={cn("font-semibold", !s.done && !s.now && "text-muted")}>{s.t}</p>
                <p className="text-xs text-muted">{s.b}</p>
              </div>
            </motion.li>
          ))}
        </ol>

        <div className="mt-8 grid gap-2 sm:grid-cols-2">
          {rep && (
            <Button href={`tel:${rep.phone}`}>
              <PhoneCall className="size-4" /> {tr(`اتصل بمندوب توصيلك: ${rep.name}`, `Call your delivery rep: ${rep.name}`)}
            </Button>
          )}
          <Button variant="soft" disabled className={cn(!rep && "sm:col-span-2")}>
            <ShoppingCart className="size-4" /> {tr("الطلب يتفعّل بعد الموافقة", "Ordering opens after approval")}
          </Button>
        </div>
      </Card>
    </div>
  );
}
