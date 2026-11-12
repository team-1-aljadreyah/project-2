"use client";

// Pieces of the expenses (صرفيات) pages: the status badge, the category names, and the "new expense" form.
import { useState } from "react";
import { useApp } from "@/components/shell";
import { PhotoCapture } from "@/components/delivery/photo";
import { Badge, Button, Dialog, errorText, Field, Input, Notice, NumberInput, Segmented, Select, Textarea, useToast } from "@/components/ui";
import { api, ApiError } from "@/lib/api";
import { EXPENSE_APPROVAL_ABOVE, EXPENSE_CATEGORIES, type Expense, type ExpenseStatus, type NewExpense } from "@/lib/api/types";
import { useFmt, type Tr } from "@/lib/i18n";
import { today } from "@/lib/utils";

export function ExpenseBadge({ status }: { status: ExpenseStatus }) {
  const { tr } = useFmt();
  if (status === "approved") return <Badge tone="success">{tr("مصروف", "Paid")}</Badge>;
  if (status === "pending") return <Badge tone="warning">{tr("بانتظار المدير", "Waiting for the manager")}</Badge>;
  if (status === "rejected") return <Badge tone="danger">{tr("مرفوض", "Rejected")}</Badge>;
  return <Badge>{tr("ملغي", "Cancelled")}</Badge>;
}

/** A category in the page's language (the usual ones have an English name; a new one shows as written). */
export function categoryName(c: string, tr: Tr) {
  const known = EXPENSE_CATEGORIES.find((x) => x.ar === c);
  return known ? tr(known.ar, known.en) : c;
}

const NEW = "__new";

/** "صرف جديد": one payment voucher. Above the limit it goes to the manager first. */
export function NewExpenseDialog({ categories, onClose, onDone }: { categories: string[]; onClose: () => void; onDone: (e: Expense) => void }) {
  const { tr, name, money } = useFmt();
  const { user, lookups } = useApp();
  const toast = useToast();
  const [f, setF] = useState<NewExpense>({ date: today(), category: "", amount: 0, method: "cash", paid_to: "" });
  const [amount, setAmount] = useState<number | "">("");
  const [pickNew, setPickNew] = useState(false);
  const [photo, setPhoto] = useState<string | null>(null);
  const [err, setErr] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const set = (p: Partial<NewExpense>) => setF((x) => ({ ...x, ...p }));
  const limit = lookups.settings.expense_approval_above ?? EXPENSE_APPROVAL_ABOVE;
  const waits = user.role !== "manager" && typeof amount === "number" && amount > limit;
  // Fuel and repairs are for a vehicle: the vehicle box comes first for them.
  const forVehicle = /وقود|صيانة السيارات/.test(f.category);

  async function save() {
    setBusy(true);
    setErr({});
    try {
      const e = await api.createExpense({ ...f, amount: typeof amount === "number" ? amount : 0, ...(photo ? { photo } : {}) });
      toast("success", e.status === "pending" ? tr(`سُجّل ${e.number} وأُرسل للمدير للموافقة`, `${e.number} saved and sent to the manager`) : tr(`سُجّل سند الصرف ${e.number}`, `Saved ${e.number}`));
      onDone(e);
      onClose();
    } catch (e) {
      if (e instanceof ApiError && e.errors) setErr(e.errors);
      toast("danger", errorText(e, tr));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog
      open
      wide
      onClose={onClose}
      title={tr("صرف جديد (سند صرف)", "New expense (payment voucher)")}
      footer={
        <>
          <Button onClick={onClose}>{tr("إلغاء", "Cancel")}</Button>
          <Button variant="action" loading={busy} onClick={save}>
            {waits ? tr("أرسل للمدير", "Send to the manager") : tr("سجّل الصرف", "Save the expense")}
          </Button>
        </>
      }
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label={tr("المبلغ", "Amount")} error={err.amount}>
          <NumberInput value={amount} onChange={setAmount} suffix={tr("د.ع", "IQD")} invalid={!!err.amount} autoFocus />
        </Field>
        <Field label={tr("التاريخ", "Date")} error={err.date}>
          <Input type="date" max={today()} value={f.date} onChange={(e) => set({ date: e.target.value })} invalid={!!err.date} />
        </Field>
        <Field label={tr("البند", "Category")} error={err.category}>
          {!pickNew ? (
            <Select
              value={f.category}
              invalid={!!err.category}
              onChange={(e) => {
                if (e.target.value === NEW) {
                  setPickNew(true);
                  set({ category: "" });
                } else set({ category: e.target.value });
              }}
            >
              <option value="">{tr("اختر البند", "Choose")}</option>
              {categories.map((c) => (
                <option key={c} value={c}>
                  {categoryName(c, tr)}
                </option>
              ))}
              <option value={NEW}>{tr("+ بند جديد…", "+ A new category…")}</option>
            </Select>
          ) : (
            <Input value={f.category} onChange={(e) => set({ category: e.target.value })} placeholder={tr("اسم البند الجديد", "The new category")} autoFocus invalid={!!err.category} />
          )}
        </Field>
        <Field label={tr("دُفع إلى", "Paid to")} error={err.paid_to}>
          <Input value={f.paid_to} onChange={(e) => set({ paid_to: e.target.value })} placeholder={tr("شخص، شركة، صاحب المولدة…", "A person, a company…")} invalid={!!err.paid_to} />
        </Field>
        <Field label={tr("طريقة الدفع", "Paid by")}>
          <Segmented
            value={f.method}
            onChange={(m) => set({ method: m })}
            options={[
              { value: "cash", label: tr("نقداً من الصندوق", "Cash from the box") },
              { value: "transfer", label: tr("تحويل / زين كاش", "Transfer") },
            ]}
          />
        </Field>
        <Field label={tr("المخزن", "Warehouse")} hint={tr("اتركه «عام» إذا كان للشركة كلها", "Leave it “general” if it's for the whole company")}>
          <Select value={f.warehouse_id ?? ""} onChange={(e) => set({ warehouse_id: Number(e.target.value) || undefined })}>
            <option value="">{tr("عام (للشركة كلها)", "General (whole company)")}</option>
            {lookups.warehouses.map((w) => (
              <option key={w.id} value={w.id}>
                {name(w)}
              </option>
            ))}
          </Select>
        </Field>
        {(forVehicle || f.vehicle_id) && (
          <Field label={tr("السيارة", "Vehicle")} error={err.vehicle_id}>
            <Select value={f.vehicle_id ?? ""} onChange={(e) => set({ vehicle_id: Number(e.target.value) || undefined })}>
              <option value="">{tr("بدون", "None")}</option>
              {lookups.vehicles.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.name}
                  {v.plate ? ` · ${v.plate}` : ""}
                </option>
              ))}
            </Select>
          </Field>
        )}
        <Field label={tr("ملاحظة", "Note")} className="sm:col-span-2">
          <Textarea rows={2} value={f.note ?? ""} onChange={(e) => set({ note: e.target.value })} placeholder={tr("مثال: اشتراك المولدة لشهر 11، 20 أمبير", "e.g. generator for November")} />
        </Field>
        <div className="sm:col-span-2">
          <p className="mb-1.5 text-sm font-medium">{tr("صورة الفاتورة أو الوصل (مستحسنة)", "A picture of the bill (recommended)")}</p>
          <PhotoCapture value={photo} onChange={setPhoto} error={err.photo} />
        </div>
      </div>
      {waits && (
        <div className="mt-3">
          <Notice tone="warning" title={tr("يحتاج موافقة المدير", "Needs the manager's OK")}>
            {tr(`المبلغ أكبر من ${money(limit)}: يُحسب بعد أن يوافق المدير.`, `More than ${money(limit)}: it counts once the manager agrees.`)}
          </Notice>
        </div>
      )}
    </Dialog>
  );
}

/** "Why?": the short reason box for rejecting or cancelling a voucher. */
export function ReasonDialog({ title, action, onClose, onSubmit }: { title: string; action: string; onClose: () => void; onSubmit: (reason: string) => Promise<void> }) {
  const { tr } = useFmt();
  const toast = useToast();
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <Dialog
      open
      onClose={onClose}
      title={title}
      footer={
        <>
          <Button onClick={onClose}>{tr("تراجع", "Back")}</Button>
          <Button
            variant="danger"
            loading={busy}
            disabled={reason.trim().length < 3}
            onClick={async () => {
              setBusy(true);
              try {
                await onSubmit(reason.trim());
                onClose();
              } catch (e) {
                toast("danger", errorText(e, tr));
              } finally {
                setBusy(false);
              }
            }}
          >
            {action}
          </Button>
        </>
      }
    >
      <Field label={tr("السبب", "Why")}>
        <Textarea rows={3} value={reason} onChange={(e) => setReason(e.target.value)} autoFocus />
      </Field>
    </Dialog>
  );
}
