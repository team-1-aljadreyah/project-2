"use client";

// Discounts: the delivery rep and the warehouse keeper give up to 3% by themselves; more waits for the manager.
// The manager gives up to 30% with no approval. Used in the order builder (new order) and on the order page.
import { useState } from "react";
import { BadgePercent, Clock, ShieldCheck } from "lucide-react";
import { Button, Dialog, Input, Money, errorText, useToast } from "@/components/ui";
import { api } from "@/lib/api";
import { DISCOUNT_MAX, STAFF_DISCOUNT_MAX, type Order, type Role } from "@/lib/api/types";
import { useFmt } from "@/lib/i18n";
import { cn } from "@/lib/utils";

export const canDiscount = (role: Role) => role === "manager" || role === "rep" || role === "warehouse";

/** The percent field with quick chips, and what it means (amount, needs approval or not). */
export function DiscountPicker({ value, onChange, subtotal, role }: { value: number; onChange: (v: number) => void; subtotal: number; role: Role }) {
  const { tr, money } = useFmt();
  const needsOk = role !== "manager" && value > STAFF_DISCOUNT_MAX;
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-1.5">
        {[0, 1, 2, 3, 5].map((p) => (
          <button
            key={p}
            type="button"
            onClick={() => onChange(p)}
            aria-pressed={value === p}
            className={cn("num rounded-full border px-3 py-1 text-xs font-semibold", value === p ? "border-action bg-action/15 text-text" : "border-line-strong text-muted hover:text-text")}
          >
            {p === 0 ? tr("بدون", "None") : `${p}%`}
          </button>
        ))}
        <div className="relative w-24">
          <Input
            type="number"
            inputMode="decimal"
            min={0}
            max={DISCOUNT_MAX}
            step={0.5}
            dir="ltr"
            value={value || ""}
            onChange={(e) => onChange(Math.max(0, Math.min(DISCOUNT_MAX, Number(e.target.value) || 0)))}
            placeholder="0"
            aria-label={tr("نسبة الخصم", "Discount percent")}
            className="h-9 pe-7 text-center"
          />
          <span className="pointer-events-none absolute end-2.5 top-1/2 -translate-y-1/2 text-xs text-muted">%</span>
        </div>
      </div>
      {value > 0 && (
        <p className={cn("text-xs", needsOk ? "text-warning" : "text-muted")}>
          {tr(`الخصم ${money(Math.round((subtotal * value) / 100))}`, `Discount ${money(Math.round((subtotal * value) / 100))}`)}
          {" · "}
          {needsOk
            ? tr(`أكثر من ${STAFF_DISCOUNT_MAX}%: ينتظر الطلب موافقة المدير`, `More than ${STAFF_DISCOUNT_MAX}%: the order waits for the manager`)
            : role === "manager"
              ? tr("بدون موافقة", "No approval needed")
              : tr(`حتى ${STAFF_DISCOUNT_MAX}% بدون موافقة`, `Up to ${STAFF_DISCOUNT_MAX}% with no approval`)}
        </p>
      )}
    </div>
  );
}

/** The totals of an order with its discount, and (who may) the button to change the discount. */
export function OrderTotals({ order, role, canEdit, onChanged }: { order: Order; role: Role; canEdit: boolean; onChanged: () => void }) {
  const { tr } = useFmt();
  const [edit, setEdit] = useState(false);
  const d = order.discount;
  return (
    <div className="border-t border-line px-4 py-3">
      {d && (
        <div className="mb-2 space-y-1 text-sm">
          <div className="flex justify-between text-muted">
            <span>{tr("قبل الخصم", "Before discount")}</span>
            <Money value={order.subtotal} />
          </div>
          <div className="flex items-center justify-between gap-2">
            <span className="flex flex-wrap items-center gap-1.5">
              <BadgePercent className="size-4 text-action" />
              {tr(`خصم ${d.percent}%`, `${d.percent}% discount`)}
              <span className="text-xs text-muted">· {d.by.name}</span>
              {d.needs_approval ? (
                <span className="inline-flex items-center gap-0.5 rounded-full bg-warning-soft px-2 py-0.5 text-[10px] font-semibold text-warning">
                  <Clock className="size-3" /> {tr("ينتظر موافقة المدير", "Waiting for the manager")}
                </span>
              ) : d.approved_by ? (
                <span className="inline-flex items-center gap-0.5 rounded-full bg-success-soft px-2 py-0.5 text-[10px] font-semibold text-success">
                  <ShieldCheck className="size-3" /> {tr(`وافق ${d.approved_by.name}`, `OK by ${d.approved_by.name}`)}
                </span>
              ) : null}
            </span>
            <Money value={-d.amount} className="text-success" />
          </div>
        </div>
      )}
      <div className="flex items-center justify-between">
        <span className="font-semibold">{tr("المجموع", "Total")}</span>
        <Money value={order.total} className="text-lg font-bold" />
      </div>
      {canEdit && (
        <Button size="sm" className="mt-2" onClick={() => setEdit(true)}>
          <BadgePercent className="size-4" /> {d ? tr("تعديل الخصم", "Change discount") : tr("إضافة خصم", "Add a discount")}
        </Button>
      )}
      {edit && <EditDiscount order={order} role={role} onClose={() => setEdit(false)} onChanged={onChanged} />}
    </div>
  );
}

function EditDiscount({ order, role, onClose, onChanged }: { order: Order; role: Role; onClose: () => void; onChanged: () => void }) {
  const { tr } = useFmt();
  const toast = useToast();
  const [p, setP] = useState(order.discount?.percent ?? 0);
  const [busy, setBusy] = useState(false);
  const subtotal = order.subtotal ?? order.total;
  return (
    <Dialog
      open
      onClose={onClose}
      title={tr(`خصم على ${order.number}`, `Discount on ${order.number}`)}
      footer={
        <Button
          variant="action"
          className="w-full"
          loading={busy}
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            try {
              const o = await api.setOrderDiscount(order.id, p);
              toast("success", o.discount?.needs_approval ? tr("حُفظ الخصم، وينتظر موافقة المدير", "Saved. It waits for the manager") : p ? tr("حُفظ الخصم", "Discount saved") : tr("أُلغي الخصم", "Discount removed"));
              onChanged();
              onClose();
            } catch (e) {
              toast("danger", errorText(e, tr));
            } finally {
              setBusy(false);
            }
          }}
        >
          <BadgePercent className="size-4" /> {tr("احفظ", "Save")}
        </Button>
      }
    >
      <DiscountPicker value={p} onChange={setP} subtotal={subtotal} role={role} />
      <div className="mt-4 flex items-center justify-between rounded-xl bg-card-2 px-3 py-2 text-sm">
        <span>{tr("المجموع بعد الخصم", "Total after discount")}</span>
        <Money value={subtotal - Math.round((subtotal * p) / 100)} className="font-bold" />
      </div>
    </Dialog>
  );
}
