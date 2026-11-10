"use client";

// How a payment method and an online payment's status look, the same on every page.
// Local payments: cash (نقداً) and transfer / Zain Cash (تحويل). Online: by card through Qi Card.
import { Banknote, CreditCard, Landmark } from "lucide-react";
import type { OnlineStatus, PayMethod } from "@/lib/api/types";
import type { Tr } from "@/lib/i18n";
import { cn } from "@/lib/utils";

export function methodLabel(m: PayMethod, tr: Tr) {
  return { cash: tr("نقداً", "Cash"), transfer: tr("تحويل / زين كاش", "Transfer"), online: tr("أونلاين · Qi", "Online · Qi") }[m];
}

/** The method's icon. A switch with fixed icons, because React wants every component known before rendering. */
export function MethodIcon({ m, className }: { m: PayMethod; className?: string }) {
  switch (m) {
    case "online":
      return <CreditCard className={className} aria-hidden />;
    case "transfer":
      return <Landmark className={className} aria-hidden />;
    default:
      return <Banknote className={className} aria-hidden />;
  }
}

export const methodTone: Record<PayMethod, string> = {
  cash: "bg-success-soft text-success",
  transfer: "bg-primary-soft text-primary-ink",
  // Qi Card's yellow, darkened for reading on light backgrounds.
  online: "bg-[#f7c600]/20 text-[#7a5f00] dark:text-[#f7d24a]",
};

export function MethodChip({ m, tr, className }: { m: PayMethod; tr: Tr; className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-semibold", methodTone[m], className)}>
      <MethodIcon m={m} className="size-3" /> {methodLabel(m, tr)}
    </span>
  );
}

export function onlineStatusLabel(s: OnlineStatus, tr: Tr) {
  return {
    created: tr("بانتظار الدفع", "Waiting"),
    success: tr("نجح", "Succeeded"),
    failed: tr("رُفضت البطاقة", "Card declined"),
    authentication_failed: tr("رمز التحقق خطأ", "Wrong bank code"),
    canceled: tr("ألغاه الزبون", "Cancelled"),
  }[s];
}

export const onlineStatusTone: Record<OnlineStatus, string> = {
  created: "bg-warning-soft text-warning",
  success: "bg-success-soft text-success",
  failed: "bg-danger-soft text-danger",
  authentication_failed: "bg-danger-soft text-danger",
  canceled: "bg-card-2 text-muted",
};

export function OnlineStatusChip({ s, tr }: { s: OnlineStatus; tr: Tr }) {
  return <span className={cn("inline-flex whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-semibold", onlineStatusTone[s])}>{onlineStatusLabel(s, tr)}</span>;
}
