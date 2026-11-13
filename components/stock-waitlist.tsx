"use client";

// «ينتظرها أصحاب المحلات»: items that ran out and shop owners asked to be told about (the bell in their app).
// On the stock page, so the manager and the accountant buy what the shops are waiting for first.
import Link from "next/link";
import { BellRing, Wand2 } from "lucide-react";
import { useApp } from "@/components/shell";
import { Button, Card, CardHeader } from "@/components/ui";
import { api } from "@/lib/api";
import { useFmt } from "@/lib/i18n";
import { useLoad } from "@/lib/use-load";

export function StockWaitlist() {
  const { tr, num, ago, lang } = useFmt();
  const { user } = useApp();
  const r = useLoad(() => api.stockWaitlist(), []);
  const list = r.data ?? [];
  if (!list.length) return null;
  const canOrder = user.role === "manager" || user.role === "accountant";
  return (
    <Card className="mb-4 border-warning/40">
      <CardHeader
        title={
          <span className="flex items-center gap-2">
            <BellRing className="size-4 text-warning" /> {tr("ينتظرها أصحاب المحلات", "Shops are waiting for these")}
          </span>
        }
        subtitle={tr("مواد نفدت وطلب أصحاب المحلات أن نُعلمهم حين تتوفر", "Items that ran out; shop owners asked to be told when they're back")}
        action={
          canOrder && (
            <Button size="sm" href="/supply?low=1">
              <Wand2 className="size-4" /> {tr("اطلبها", "Order them")}
            </Button>
          )
        }
      />
      <ul className="divide-y divide-line">
        {list.map((w) => (
          <li key={w.item.id}>
            <Link href={user.role === "rep" ? "/items" : `/items/${w.item.id}`} className="flex items-center gap-3 px-4 py-2.5 hover:bg-card-2">
              <span className="min-w-0 flex-1">
                <span className="block truncate font-semibold">{lang === "en" ? w.item.name_en : w.item.name}</span>
                <span className="block truncate text-xs text-muted">
                  {w.customers.map((c) => c.name).join(tr("، ", ", "))} · {tr(`أول طلب ${ago(w.since)}`, `first asked ${ago(w.since)}`)}
                </span>
              </span>
              <span className="num shrink-0 rounded-full bg-warning-soft px-2.5 py-0.5 text-xs font-bold text-warning">
                {tr(`${num(w.shops)} ${w.shops === 1 ? "محل" : w.shops === 2 ? "محلان" : "محلات"}`, `${num(w.shops)} ${w.shops === 1 ? "shop" : "shops"}`)}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </Card>
  );
}
