"use client";

import { ShareWhatsApp, pageLink } from "@/components/share";

import { Suspense } from "react";
import { OnlineReturn, PayOnlineCard } from "@/components/online-pay";
import { useApp } from "@/components/shell";
import { StatementView } from "@/components/statement-view";
import { Card, LimitBar, Money, Notice, PageHeader } from "@/components/ui";
import { api } from "@/lib/api";
import { useFmt } from "@/lib/i18n";
import { useLoad } from "@/lib/use-load";

// The shop owner's own account: what he owes, his limit, every movement, and paying online (ZainCash or Qi Card).
export default function MyStatementPage() {
  const { tr, money } = useFmt();
  const { user } = useApp();
  const id = user.customer_id ?? 0;
  const c = useLoad(() => api.getCustomer(id), [id]);
  return (
    <>
      <PageHeader
        title={tr("كشف حسابي", "My statement")}
        subtitle={c.data?.name}
        actions={
          c.data && (
            <ShareWhatsApp
              text={() =>
                [
                  tr(`كشف حساب ${c.data!.name}`, `Statement of ${c.data!.name}`),
                  `${tr("الدين الحالي", "Owed now")}: ${money(c.data!.balance ?? 0)}`,
                  `${tr("سقف الدين", "Limit")}: ${money(c.data!.debt_limit ?? 0)}`,
                  pageLink("/client/statement"),
                ].join("\n")
              }
            />
          )
        }
      />
      {/* Back from the Qi gateway: the result of the online payment */}
      <Suspense fallback={null}>
        <OnlineReturn />
      </Suspense>
      {c.data?.pending && (
        <div className="mb-4">
          <Notice tone="warning" title={tr("حسابك قيد المراجعة", "Your account is being checked")}>
            {tr("كشف حسابك يبدأ بعد موافقة الشركة وأول طلب.", "Your statement starts after the company approves you and your first order.")}
          </Notice>
        </div>
      )}
      {c.data && (
        <Card className="mb-4 p-4">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="text-xs text-muted">{tr("المطلوب منك", "You owe")}</p>
              <Money value={c.data.balance} className="text-3xl font-bold" />
            </div>
            <div className="text-end">
              <p className="text-xs text-muted">{tr("سقف الدين", "Debt limit")}</p>
              <Money value={c.data.debt_limit} className="text-lg font-semibold" />
            </div>
          </div>
          <div className="mt-3">
            <LimitBar balance={c.data.balance ?? 0} limit={c.data.debt_limit ?? 0} />
          </div>
        </Card>
      )}
      {c.data && !c.data.pending && c.data.active && <PayOnlineCard customer={c.data} />}
      <StatementView customerId={id} links={false} />
    </>
  );
}
