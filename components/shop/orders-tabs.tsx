"use client";

// «طلبياتي» in the shop owner's app: his orders, invoices and statement as three tabs of one place.
import Link from "next/link";
import { ClipboardList, FileText, ReceiptText } from "lucide-react";
import { useApp } from "@/components/shell";
import { useAppPath } from "@/lib/app-path";
import { useFmt } from "@/lib/i18n";
import { cn } from "@/lib/utils";

export function ShopOrdersTabs() {
  const { tr } = useFmt();
  const { user } = useApp();
  const { path } = useAppPath();
  if (user.role !== "shop") return null;
  const tabs = [
    { href: "/orders", label: tr("الطلبات", "Orders"), icon: ClipboardList },
    { href: "/invoices", label: tr("الفواتير", "Invoices"), icon: ReceiptText },
    { href: "/statement", label: tr("كشف الحساب", "Statement"), icon: FileText },
  ];
  return (
    <nav aria-label={tr("طلبياتي", "My orders")} className="-mx-3 mb-4 border-b border-line sm:-mx-5">
      <div className="mx-auto flex max-w-2xl">
        {tabs.map((t) => {
          const on = path === t.href;
          return (
            <Link key={t.href} href={t.href} aria-current={on ? "page" : undefined} className={cn("flex flex-1 items-center justify-center gap-1.5 border-b-2 py-3 text-sm font-semibold transition", on ? "border-action text-action" : "border-transparent text-muted hover:text-text")}>
              <t.icon className="size-4" /> {t.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
