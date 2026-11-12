"use client";

// A shop owner can own several shops. The top bar shows the shop he is working on now; pressed, it lists
// all his shops (switch with one tap) and "add another shop". A new shop waits for the manager's approval,
// like a sign-up: its page shows "waiting" until then. Orders, the statement and the chat follow the chosen shop.
import { useEffect, useRef, useState } from "react";
import { useAppRouter } from "@/lib/app-path";
import { Check, ChevronDown, Clock, Plus, Store } from "lucide-react";
import { Button, Dialog, Field, Input, errorText, useToast } from "@/components/ui";
import { api, ApiError } from "@/lib/api";
import type { NewShopInput, User } from "@/lib/api/types";
import { updateUser } from "@/lib/auth";
import { AddressCard } from "./address-form";
import { useFmt } from "@/lib/i18n";
import { useLoad } from "@/lib/use-load";
import { cn } from "@/lib/utils";

const AREAS = ["حي الحسين", "سيف سعد", "حي العباس", "الإسكان", "حي الغدير", "باب بغداد", "حي الأسرة", "البلدية", "حي الموظفين", "حي النقيب", "عون", "حي رمضان", "المعملجي"];

export function ShopSwitcher({ user }: { user: User }) {
  const { tr } = useFmt();
  const router = useAppRouter();
  const toast = useToast();
  const shops = useLoad(() => api.myShops(), [user.id]);
  const [open, setOpen] = useState(false);
  const [adding, setAdding] = useState(false);
  const [busy, setBusy] = useState<number | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  const list = shops.data ?? [];
  const current = list.find((s) => s.id === user.customer_id);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as Node) && setOpen(false);
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  async function pick(id: number) {
    if (id === user.customer_id) return setOpen(false);
    setBusy(id);
    try {
      const u = await api.switchShop(id);
      updateUser(u);
      setOpen(false);
      toast("success", tr(`تعمل الآن على: ${list.find((s) => s.id === id)?.name ?? ""}`, `Now working on: ${list.find((s) => s.id === id)?.name ?? ""}`));
      router.push("/shop");
    } catch (e) {
      toast("danger", errorText(e, tr));
    } finally {
      setBusy(null);
    }
  }

  return (
    <div ref={ref} className="relative min-w-0">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex h-10 min-w-0 max-w-[11rem] items-center gap-1.5 rounded-xl border border-line px-2.5 text-sm font-semibold hover:bg-card-2 sm:max-w-[16rem]"
      >
        <Store className="size-4 shrink-0 text-action" />
        <span className="truncate">{current?.name ?? tr("محلاتي", "My shops")}</span>
        {list.length > 1 && <span className="num rounded-full bg-card-2 px-1.5 text-[10px] text-muted">{list.length}</span>}
        <ChevronDown className={cn("size-4 shrink-0 text-muted transition", open && "rotate-180")} />
      </button>
      {open && (
        <div className="absolute start-0 top-12 z-50 w-72 rounded-2xl border border-line bg-card p-2 shadow-xl max-sm:fixed max-sm:inset-x-3 max-sm:top-16 max-sm:w-auto">
          <p className="px-3 py-1.5 text-xs font-medium text-faint">{tr("محلاتي", "My shops")}</p>
          <ul>
            {list.map((s) => (
              <li key={s.id}>
                <button type="button" disabled={busy !== null} onClick={() => pick(s.id)} className={cn("flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-start hover:bg-card-2", s.id === user.customer_id && "bg-card-2")}>
                  <span className={cn("flex size-9 shrink-0 items-center justify-center rounded-full text-sm font-bold", s.id === user.customer_id ? "bg-action text-on-action" : "bg-card-2 text-primary-ink")}>{s.name.trim()[0]}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold">{s.name}</span>
                    <span className="flex items-center gap-1 text-xs text-muted">
                      {s.area}
                      {s.pending && (
                        <span className="inline-flex items-center gap-0.5 font-semibold text-warning">
                          · <Clock className="size-3" /> {tr("بانتظار الموافقة", "Waiting for approval")}
                        </span>
                      )}
                      {!s.pending && !s.active && <span className="font-semibold text-danger">· {tr("موقوف", "Off")}</span>}
                    </span>
                  </span>
                  {s.id === user.customer_id && <Check className="size-4 shrink-0 text-action" />}
                </button>
              </li>
            ))}
          </ul>
          <button
            type="button"
            onClick={() => {
              setOpen(false);
              setAdding(true);
            }}
            className="mt-1 flex w-full items-center gap-2 rounded-xl border border-dashed border-line-strong px-3 py-2.5 text-sm font-semibold text-muted hover:border-action hover:text-text"
          >
            <Plus className="size-4" /> {tr("إضافة محل آخر", "Add another shop")}
          </button>
        </div>
      )}
      {adding && (
        <AddShop
          onClose={() => setAdding(false)}
          onAdded={() => {
            setAdding(false);
            shops.reload();
          }}
        />
      )}
    </div>
  );
}

function AddShop({ onClose, onAdded }: { onClose: () => void; onAdded: () => void }) {
  const { tr } = useFmt();
  const toast = useToast();
  const [f, setF] = useState<NewShopInput>({ shop_name: "", area: "", address: "", phone: "" });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const set = (p: Partial<NewShopInput>) => setF((x) => ({ ...x, ...p }));

  async function save() {
    setBusy(true);
    setErrors({});
    try {
      const s = await api.addShop(f);
      toast("success", tr(`أُضيف ${s.name}، وينتظر موافقة الشركة`, `${s.name} was added and waits for the company's approval`));
      onAdded();
    } catch (e) {
      if (e instanceof ApiError && e.errors) setErrors(e.errors);
      toast("danger", errorText(e, tr));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog
      open
      onClose={onClose}
      title={tr("إضافة محل آخر", "Add another shop")}
      footer={
        <Button variant="action" className="w-full" loading={busy} disabled={busy} onClick={save}>
          <Plus className="size-4" /> {tr("أضف المحل", "Add the shop")}
        </Button>
      }
    >
      <div className="space-y-3">
        <p className="rounded-xl bg-card-2 p-3 text-xs text-muted">{tr("تراجع الشركة المحل الجديد وتحدد أسعاره وسقف دينه. بعد الموافقة تطلب له من نفس حسابك.", "The company reviews the new shop and sets its prices and debt limit. Once approved, you order for it from this same account.")}</p>
        <Field label={tr("اسم المحل", "Shop name")} error={errors.shop_name} htmlFor="ns-name">
          <Input id="ns-name" value={f.shop_name} onChange={(e) => set({ shop_name: e.target.value })} invalid={!!errors.shop_name} />
        </Field>
        <Field label={tr("المنطقة", "Area")} error={errors.area} htmlFor="ns-area">
          <Input id="ns-area" list="ns-areas" value={f.area} onChange={(e) => set({ area: e.target.value })} placeholder={tr("اختر أو اكتب", "Choose or type")} invalid={!!errors.area} />
          <datalist id="ns-areas">
            {AREAS.map((a) => (
              <option key={a} value={a} />
            ))}
          </datalist>
        </Field>
        <div>
          <p className="mb-1.5 text-sm font-medium">
            {tr("معلومات العنوان", "Address")} <span className="text-danger">*</span>
          </p>
          <AddressCard value={f.address_info} onChange={(v) => set({ address_info: v ?? undefined })} error={errors.address_info ?? (Object.keys(errors).some((k) => k.startsWith("address_info.")) ? tr("تحقق من معلومات العنوان", "Check the address") : undefined)} defaultPhone={f.phone} />
        </div>
        <Field label={tr("هاتف المحل", "Shop phone")} hint={tr("اتركه فارغاً لاستخدام رقمك", "Leave empty to use your number")} error={errors.phone} htmlFor="ns-phone">
          <Input id="ns-phone" dir="ltr" inputMode="tel" value={f.phone} onChange={(e) => set({ phone: e.target.value })} placeholder="07xxxxxxxxx" invalid={!!errors.phone} />
        </Field>
      </div>
    </Dialog>
  );
}
