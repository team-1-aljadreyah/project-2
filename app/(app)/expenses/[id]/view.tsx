"use client";

// One payment voucher (سند صرف): what was paid, to whom, for what, and the bill's picture. It prints as a
// voucher to sign. The manager approves or rejects one above the limit; a wrong one is cancelled with a reason.
import { useState } from "react";
import { Ban, Check, Printer, X } from "lucide-react";
import { useApp } from "@/components/shell";
import { ExpenseBadge, ReasonDialog, categoryName } from "@/components/expenses";
import { useBrand } from "@/lib/site";
import { Button, Card, ErrorBox, KV, LoadingRows, Money, Notice, PageHeader, errorText, useToast } from "@/components/ui";
import { api } from "@/lib/api";
import { useFmt } from "@/lib/i18n";
import { useLoad } from "@/lib/use-load";
import { useIdParam } from "@/lib/utils";

export default function ExpenseView() {
  const id = useIdParam();
  const { tr, date, dateTime, name } = useFmt();
  const { user, lookups } = useApp();
  const brand = useBrand();
  const toast = useToast();
  const x = useLoad(() => api.getExpense(id), [id]);
  const [asking, setAsking] = useState<"reject" | "cancel" | null>(null);
  const [busy, setBusy] = useState(false);
  if (x.state.status === "loading") return <LoadingRows />;
  if (x.state.status === "error" || !x.data) return <ErrorBox error={x.state.status === "error" ? x.state.error : null} />;
  const e = x.data;
  const vehicle = lookups.vehicles.find((v) => v.id === e.vehicle_id);
  const canDecide = user.role === "manager" && e.status === "pending";
  // A voucher the manager approved: only he cancels it.
  const canCancel = (e.status === "approved" || e.status === "pending") && (user.role === "manager" || !e.decided_by);

  async function approve() {
    setBusy(true);
    try {
      await api.decideExpense(e.id, true);
      toast("success", tr(`وافقت على ${e.number}`, `${e.number} approved`));
    } catch (err) {
      toast("danger", errorText(err, tr));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <PageHeader
        back="/expenses"
        title={
          <span className="flex flex-wrap items-center gap-2">
            {tr("سند صرف", "Payment voucher")} <span className="num">{e.number}</span> <ExpenseBadge status={e.status} />
          </span>
        }
        subtitle={`${dateTime(e.created_at)} · ${e.created_by.name}`}
        actions={
          <>
            {canDecide && (
              <>
                <Button variant="action" loading={busy} onClick={approve}>
                  <Check className="size-4" /> {tr("موافقة", "Approve")}
                </Button>
                <Button variant="danger" onClick={() => setAsking("reject")}>
                  <X className="size-4" /> {tr("رفض", "Reject")}
                </Button>
              </>
            )}
            {canCancel && !canDecide && (
              <Button onClick={() => setAsking("cancel")}>
                <Ban className="size-4" /> {tr("إلغاء السند", "Cancel it")}
              </Button>
            )}
            <Button onClick={() => window.print()}>
              <Printer className="size-4" /> {tr("طباعة", "Print")}
            </Button>
          </>
        }
      />

      {e.status === "pending" && (
        <div className="no-print mb-4 max-w-3xl">
          <Notice tone="warning" title={tr("ينتظر موافقة المدير", "Waiting for the manager")}>
            {tr("المبلغ أكبر من حد الموافقة: لا يُحسب في الصرفيات حتى يوافق المدير.", "Above the limit: it doesn't count until the manager agrees.")}
          </Notice>
        </div>
      )}
      {e.status === "rejected" && (
        <div className="mb-4 max-w-3xl">
          <Notice tone="danger" title={tr(`رفضه ${e.decided_by?.name ?? ""}`, `Rejected by ${e.decided_by?.name ?? ""}`)}>
            {e.reject_reason}
          </Notice>
        </div>
      )}
      {e.status === "cancelled" && (
        <div className="mb-4 max-w-3xl">
          <Notice tone="danger" title={tr(`ألغاه ${e.cancelled_by?.name ?? ""} في ${e.cancelled_at ? date(e.cancelled_at) : ""}`, `Cancelled by ${e.cancelled_by?.name ?? ""}`)}>
            {e.cancel_reason}
          </Notice>
        </div>
      )}

      {/* The voucher itself: this is what prints. */}
      <Card className="print-area max-w-3xl p-5">
        <div className="mb-4 flex items-start justify-between gap-4 border-b border-line pb-4">
          <div>
            <p className="text-lg font-bold">{brand.name}</p>
            <p className="text-sm text-muted">{tr("سند صرف", "Payment voucher")}</p>
          </div>
          <div className="text-end">
            <p className="num text-lg font-bold">{e.number}</p>
            <p className="num text-sm text-muted">{date(e.date)}</p>
          </div>
        </div>
        <div className="mb-4 rounded-2xl bg-card-2 p-4 text-center">
          <p className="text-sm text-muted">{tr("المبلغ", "Amount")}</p>
          <Money value={e.amount} className="text-3xl font-bold" />
        </div>
        <div className="grid gap-x-8 sm:grid-cols-2">
          <KV k={tr("دُفع إلى", "Paid to")} v={e.paid_to} />
          <KV k={tr("البند", "Category")} v={categoryName(e.category, tr)} />
          <KV k={tr("طريقة الدفع", "Paid by")} v={e.method === "cash" ? tr("نقداً من الصندوق", "Cash from the box") : tr("تحويل / زين كاش", "Transfer")} />
          <KV k={tr("المخزن", "Warehouse")} v={e.warehouse_id ? name(lookups.warehouses.find((w) => w.id === e.warehouse_id)) : tr("عام (للشركة كلها)", "General")} />
          {vehicle && <KV k={tr("السيارة", "Vehicle")} v={`${vehicle.name}${vehicle.plate ? ` · ${vehicle.plate}` : ""}`} />}
          <KV k={tr("كتبه", "Written by")} v={e.created_by.name} />
          {e.decided_by && e.status === "approved" && <KV k={tr("وافق عليه", "Approved by")} v={`${e.decided_by.name} · ${e.decided_at ? date(e.decided_at) : ""}`} />}
        </div>
        {e.note && <p className="mt-3 rounded-xl bg-card-2 p-3 text-sm">{e.note}</p>}
        {e.photo && (
          <div className="mt-4">
            <p className="mb-1.5 text-sm font-medium">{tr("صورة الفاتورة", "The bill")}</p>
            <a href={e.photo} target="_blank" rel="noreferrer" className="block overflow-hidden rounded-2xl border border-line">
              {/* eslint-disable-next-line @next/next/no-img-element -- a local data URL, nothing for next/image to optimize */}
              <img src={e.photo} alt={tr("صورة الفاتورة", "The bill")} className="max-h-96 w-full object-contain" />
            </a>
          </div>
        )}
        {/* Signatures on the printed voucher. */}
        <div className="mt-8 hidden grid-cols-3 gap-6 text-center text-sm print:grid">
          <p className="border-t border-line pt-2">{tr("المستلم", "Received by")}</p>
          <p className="border-t border-line pt-2">{tr("المحاسب", "Accountant")}</p>
          <p className="border-t border-line pt-2">{tr("المدير", "Manager")}</p>
        </div>
      </Card>

      {asking === "reject" && (
        <ReasonDialog
          title={tr(`رفض ${e.number}`, `Reject ${e.number}`)}
          action={tr("رفض", "Reject")}
          onClose={() => setAsking(null)}
          onSubmit={async (r) => {
            await api.decideExpense(e.id, false, r);
            toast("success", tr("رُفض السند وأُخبر المحاسب", "Rejected; the accountant was told"));
          }}
        />
      )}
      {asking === "cancel" && (
        <ReasonDialog
          title={tr(`إلغاء ${e.number}`, `Cancel ${e.number}`)}
          action={tr("إلغاء السند", "Cancel it")}
          onClose={() => setAsking(null)}
          onSubmit={async (r) => {
            await api.cancelExpense(e.id, r);
            toast("success", tr("أُلغي السند ويبقى في السجل", "Cancelled; it stays on record"));
          }}
        />
      )}
    </>
  );
}
