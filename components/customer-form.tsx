"use client";

// Add / edit a customer (manager only): shop details, price tier, rep and debt limit.
import { useState } from "react";
import { api, ApiError } from "@/lib/api";
import type { Customer, CustomerInput } from "@/lib/api/types";
import { useFmt } from "@/lib/i18n";
import { useApp } from "./shell";
import { Button, Dialog, Field, Input, Notice, NumberInput, Select, Switch, errorText, useToast } from "./ui";

export function CustomerForm({ open, onClose, customer, onSaved }: { open: boolean; onClose: () => void; customer?: Customer; onSaved?: (c: Customer) => void }) {
  const { tr, name } = useFmt();
  const { lookups } = useApp();
  const toast = useToast();
  const [f, setF] = useState<Omit<CustomerInput, "debt_limit"> & { debt_limit: number | "" }>(() => ({
    name: customer?.name ?? "",
    owner_name: customer?.owner_name ?? "",
    phone: customer?.phone ?? "",
    area: customer?.area ?? "",
    address: customer?.address ?? "",
    tier_id: customer?.tier_id ?? lookups.tiers[1]?.id ?? lookups.tiers[0].id,
    rep_id: customer?.rep_id ?? lookups.reps[0]?.id ?? 0,
    // A shop that signed up online starts with no credit; suggest a first limit for the manager to adjust.
    debt_limit: customer?.pending && !customer.debt_limit ? 1_000_000 : (customer?.debt_limit ?? 2_000_000),
    // Approving = saving it as active, so the switch starts on.
    active: customer?.pending ? true : (customer?.active ?? true),
  }));
  const [err, setErr] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const set = (p: Partial<typeof f>) => setF((x) => ({ ...x, ...p }));

  async function save() {
    setBusy(true);
    setErr({});
    try {
      const c = await api.saveCustomer(customer?.id ?? null, { ...f, debt_limit: f.debt_limit === "" ? -1 : f.debt_limit });
      toast("success", tr("تم حفظ الزبون", "Customer saved"));
      onSaved?.(c);
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
      open={open}
      onClose={onClose}
      title={customer?.pending ? tr("مراجعة محل جديد", "Review a new shop") : customer ? tr("تعديل الزبون", "Edit customer") : tr("زبون جديد", "New customer")}
      footer={
        <>
          <Button onClick={onClose}>{tr("إلغاء", "Cancel")}</Button>
          <Button variant="primary" loading={busy} onClick={save}>
            {customer?.pending && f.active ? tr("موافقة وتفعيل", "Approve and activate") : tr("حفظ", "Save")}
          </Button>
        </>
      }
    >
      {customer?.pending && (
        <div className="mb-4">
          <Notice tone="warning" title={tr("هذا المحل سجّل من الموقع وينتظر موافقتك", "This shop signed up online and waits for your approval")}>
            {tr("تأكد من المعلومات، واختر نوع السعر ومندوب التوصيل وسقف الدين، ثم اضغط موافقة. سيصل إشعار إلى صاحب المحل ويستطيع الطلب مباشرة.", "Check the details, choose the price tier, delivery rep and debt limit, then approve. The owner gets a notification and can order at once.")}
          </Notice>
        </div>
      )}
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label={tr("اسم المحل", "Shop name")} error={err.name}>
          <Input value={f.name} onChange={(e) => set({ name: e.target.value })} invalid={!!err.name} />
        </Field>
        <Field label={tr("صاحب المحل", "Owner")} error={err.owner_name}>
          <Input value={f.owner_name} onChange={(e) => set({ owner_name: e.target.value })} invalid={!!err.owner_name} />
        </Field>
        <Field label={tr("رقم الهاتف", "Phone")} error={err.phone}>
          <Input dir="ltr" inputMode="tel" className="text-start" value={f.phone} onChange={(e) => set({ phone: e.target.value })} placeholder="07812345678" invalid={!!err.phone} />
        </Field>
        <Field label={tr("المنطقة", "Area")} error={err.area}>
          <Input value={f.area} onChange={(e) => set({ area: e.target.value })} placeholder={tr("حي الحسين", "Hay Al-Hussein")} invalid={!!err.area} />
        </Field>
        <Field label={tr("العنوان", "Address")} className="sm:col-span-2">
          <Input value={f.address} onChange={(e) => set({ address: e.target.value })} />
        </Field>
        <Field label={tr("نوع السعر", "Price tier")} hint={tr("كل نوع له أسعاره", "Each tier has its own prices")}>
          <Select value={f.tier_id} onChange={(e) => set({ tier_id: Number(e.target.value) })}>
            {lookups.tiers.map((t) => (
              <option key={t.id} value={t.id}>
                {name(t)}
              </option>
            ))}
          </Select>
        </Field>
        <Field label={tr("مندوب التوصيل", "Delivery")}>
          <Select value={f.rep_id} onChange={(e) => set({ rep_id: Number(e.target.value) })}>
            {lookups.reps.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label={tr("سقف الدين", "Debt limit")} error={err.debt_limit} hint={tr("إذا بلغه، يحتاج الطلب الجديد إلى موافقتك", "At this limit, new orders need your approval")} className="sm:col-span-2">
          <NumberInput value={f.debt_limit} onChange={(v) => set({ debt_limit: v })} suffix={tr("د.ع", "IQD")} invalid={!!err.debt_limit} />
        </Field>
        <div className="sm:col-span-2">
          <Switch checked={f.active} onChange={(v) => set({ active: v })} label={tr("الحساب فعّال (يستطيع الطلب)", "Active (can order)")} />
        </div>
      </div>
    </Dialog>
  );
}
