"use client";

// The shop's address card, made like a delivery app's "معلومات العنوان" sheet (the design Yasser sent):
// a map with the pin and an "تعديل" chip, then outlined boxes with the label sitting on the border:
// اسم العنوان*، تفاصيل العنوان*، رقم الاتصال* (+964)، اسم الشارع | رقم البناية، رقم الطابق | رقم الشقة، أقرب نقطة دالة،
// "حذف العنوان" and the big "تأكيد العنوان" button.
// AddressCard is what a form shows: the saved address in short, pressed to open the sheet.
import { useState } from "react";
import { Check, MapPin as PinIcon, Pencil, Phone, Plus, Trash2 } from "lucide-react";
import { Dialog } from "@/components/ui";
import type { ShopAddress } from "@/lib/api/types";
import { useFmt } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { MapPin } from "./map-pin";

const EMPTY: ShopAddress = { label: "", details: "", phone: "" };

/** The phone as typed after +964 (no leading 0) ↔ stored as 07xxxxxxxxx. */
const toLocal = (p: string) => p.replace(/^0/, "");
const toStored = (p: string) => {
  const d = p.replace(/\D/g, "").replace(/^964/, "");
  return d ? (d.startsWith("0") ? d : `0${d}`) : "";
};

export function AddressCard({
  value,
  onChange,
  error,
  defaultPhone,
  deletable,
}: {
  value: ShopAddress | null | undefined;
  onChange: (v: ShopAddress | null) => void;
  error?: string;
  /** The owner's phone, to fill the contact number the first time. */
  defaultPhone?: string;
  deletable?: boolean;
}) {
  const { tr } = useFmt();
  const [open, setOpen] = useState(false);
  return (
    <>
      {value ? (
        <button type="button" onClick={() => setOpen(true)} className="flex w-full items-start gap-3 rounded-2xl border border-line p-3 text-start hover:bg-card-2">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-action/15 text-action">
            <PinIcon className="size-5" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate font-semibold">{value.label}</span>
            <span className="block truncate text-xs text-muted">{[value.street, value.details, value.landmark && `${tr("قرب", "near")} ${value.landmark}`].filter(Boolean).join(" · ")}</span>
            <span className="mt-0.5 flex items-center gap-1 text-xs text-muted" dir="ltr">
              <Phone className="size-3" /> +964 {toLocal(value.phone)}
              {value.lat !== undefined && <span className="ms-2 text-success">● {tr("على الخريطة", "on the map")}</span>}
            </span>
          </span>
          <span className="flex shrink-0 items-center gap-1 rounded-full border border-line px-2.5 py-1 text-xs font-semibold">
            <Pencil className="size-3.5" /> {tr("تعديل", "Edit")}
          </span>
        </button>
      ) : (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className={cn("flex w-full items-center justify-center gap-2 rounded-2xl border-2 border-dashed p-4 text-sm font-semibold", error ? "border-danger text-danger" : "border-line-strong text-muted hover:border-action hover:text-text")}
        >
          <Plus className="size-4" /> {tr("أضف معلومات العنوان", "Add the address")}
        </button>
      )}
      {error && <p className="mt-1 text-xs text-danger">{error}</p>}
      {open && (
        <AddressSheet
          value={value ?? { ...EMPTY, phone: defaultPhone ?? "" }}
          onClose={() => setOpen(false)}
          onSave={(v) => {
            onChange(v);
            setOpen(false);
          }}
          onDelete={
            deletable && value
              ? () => {
                  onChange(null);
                  setOpen(false);
                }
              : undefined
          }
        />
      )}
    </>
  );
}

export function AddressSheet({ value, onClose, onSave, onDelete }: { value: ShopAddress; onClose: () => void; onSave: (v: ShopAddress) => void; onDelete?: () => void }) {
  const { tr } = useFmt();
  const [f, setF] = useState<ShopAddress>(value);
  const [phone, setPhone] = useState(toLocal(value.phone));
  const [editMap, setEditMap] = useState(value.lat === undefined);
  const [tried, setTried] = useState(false);
  const set = (p: Partial<ShopAddress>) => setF((x) => ({ ...x, ...p }));
  const missing = {
    label: !f.label.trim(),
    details: !f.details.trim(),
    phone: !/^7\d{9}$/.test(phone.replace(/\D/g, "")),
  };
  const bad = missing.label || missing.details || missing.phone;

  return (
    <Dialog
      open
      onClose={onClose}
      title={tr("معلومات العنوان", "Address details")}
      footer={
        <button
          type="button"
          onClick={() => {
            setTried(true);
            if (bad) return;
            onSave({ ...f, phone: toStored(phone) });
          }}
          className="flex h-13 w-full items-center justify-center gap-2 rounded-2xl bg-action py-3.5 text-base font-bold text-on-action hover:bg-action-hover"
        >
          <Check className="size-5" /> {tr("تأكيد العنوان", "Confirm the address")}
        </button>
      }
    >
      <div className="space-y-4">
        {/* The map with the pin, and the "تعديل" chip */}
        <div className="relative">
          <MapPin lat={f.lat} lng={f.lng} editable={editMap} onChange={(lat, lng) => set({ lat, lng })} className="h-44" />
          <button
            type="button"
            onClick={() => setEditMap((e) => !e)}
            className="absolute start-3 top-3 z-[500] flex items-center gap-1.5 rounded-full bg-card px-3 py-1.5 text-sm font-semibold shadow-md"
          >
            {editMap ? <Check className="size-4 text-success" /> : <Pencil className="size-4" />}
            {editMap ? tr("تم", "Done") : tr("تعديل", "Edit")}
          </button>
        </div>

        <Box label={tr("اسم العنوان", "Address name")} required error={tried && missing.label}>
          <input value={f.label} onChange={(e) => set({ label: e.target.value })} placeholder={tr("مثلاً: أسواق الكوثر - الفرع الأول", "e.g. Al-Kawthar, branch 1")} className={inputCls} />
        </Box>
        <Box label={tr("تفاصيل العنوان", "Address details")} required error={tried && missing.details}>
          <input value={f.details} onChange={(e) => set({ details: e.target.value })} placeholder={tr("المنطقة والمحلة", "Area and block")} className={inputCls} />
        </Box>
        <div className="flex gap-3" dir="ltr">
          <div className="flex h-14 w-20 shrink-0 items-center justify-center rounded-2xl border border-line-strong text-lg">+964</div>
          <div className="flex-1" dir="rtl">
            <Box label={tr("رقم الاتصال", "Contact number")} required error={tried && missing.phone}>
              <input value={phone} onChange={(e) => setPhone(e.target.value.replace(/[٠-٩]/g, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d))).replace(/[^\d]/g, "").replace(/^0/, "").slice(0, 10))} inputMode="tel" dir="ltr" placeholder="7xxxxxxxxx" className={cn(inputCls, "text-end")} />
            </Box>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Box label={tr("اسم الشارع", "Street")}>
            <input value={f.street ?? ""} onChange={(e) => set({ street: e.target.value })} className={inputCls} />
          </Box>
          <Box label={tr("رقم البناية", "Building")}>
            <input value={f.building ?? ""} onChange={(e) => set({ building: e.target.value })} className={inputCls} />
          </Box>
          <Box label={tr("رقم الطابق", "Floor")}>
            <input value={f.floor ?? ""} onChange={(e) => set({ floor: e.target.value })} className={inputCls} />
          </Box>
          <Box label={tr("رقم الشقة", "Apartment")}>
            <input value={f.apartment ?? ""} onChange={(e) => set({ apartment: e.target.value })} className={inputCls} />
          </Box>
        </div>
        <Box label={tr("أقرب نقطة دالة", "Nearest landmark")}>
          <input value={f.landmark ?? ""} onChange={(e) => set({ landmark: e.target.value })} placeholder={tr("مثلاً: مدخل شارع الصناعة", "e.g. the entrance of Al-Sinaa street")} className={inputCls} />
        </Box>
        {tried && bad && <p className="text-sm text-danger">{tr("أكمل الحقول المؤشرة بنجمة", "Fill the fields marked with a star")}</p>}

        {onDelete && (
          <button type="button" onClick={onDelete} className="mx-auto flex items-center gap-1.5 py-2 text-sm font-semibold text-danger">
            <Trash2 className="size-4" /> {tr("حذف العنوان", "Delete the address")}
          </button>
        )}
      </div>
    </Dialog>
  );
}

const inputCls = "h-full w-full bg-transparent px-4 text-base outline-none placeholder:text-faint";

/** An outlined box with its label sitting on the top border (and a red star when required). */
function Box({ label, required, error, children }: { label: string; required?: boolean; error?: boolean; children: React.ReactNode }) {
  return (
    <label className={cn("relative block h-14 rounded-2xl border transition focus-within:border-action", error ? "border-danger" : "border-line-strong")}>
      <span className="absolute -top-2.5 start-3 bg-card px-1.5 text-sm text-muted">
        {label}
        {required && <span className="ms-0.5 text-danger">*</span>}
      </span>
      {children}
    </label>
  );
}
