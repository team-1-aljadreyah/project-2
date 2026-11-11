"use client";

import { useState } from "react";
import { Paintbrush, Plus, Save } from "lucide-react";
import { BrandDialog, EditText, SortArea, SortItem } from "@/components/customize";
import { LogoMark } from "@/components/logo";
import { useApp } from "@/components/shell";
import { Button, Card, CardHeader, Field, Input, NumberInput, errorText, useToast, PageHeader } from "@/components/ui";
import { api } from "@/lib/api";
import type { Settings } from "@/lib/api/types";
import { useFmt } from "@/lib/i18n";
import { saveSite, setCustomizing, useBrand } from "@/lib/site";

export default function SettingsPage() {
  const { tr, lang, name } = useFmt();
  const { lookups, reloadItems } = useApp();
  const toast = useToast();
  const brand = useBrand();
  const [brandOpen, setBrandOpen] = useState(false);
  const fail = (e: unknown) => toast("danger", errorText(e, tr));
  const [s, setS] = useState<Settings>(lookups.settings);
  const [busy, setBusy] = useState(false);
  const [tiers, setTiers] = useState(lookups.tiers.map((t) => ({ ...t })));
  const [newTier, setNewTier] = useState({ name: "", name_en: "" });

  return (
    <>
      <PageHeader title={tr("الإعدادات", "Settings")} />
      <div className="grid max-w-5xl gap-4 lg:grid-cols-2">
        <Card className="lg:col-span-2">
          <CardHeader
            title={tr("هوية الموقع", "Site identity")}
            subtitle={tr("الاسم والشعار يظهران في القائمة وصفحة الدخول والفواتير والملفات", "The name and logo show in the menu, the login page, the invoices and the files")}
          />
          <div className="flex flex-wrap items-center gap-4 p-4">
            <LogoMark size={56} />
            <div className="min-w-0 flex-1">
              <p className="text-lg font-bold">{brand.name}</p>
              <p className="text-sm text-muted">
                {brand.tagline} · {brand.company}
              </p>
            </div>
            <Button onClick={() => setBrandOpen(true)}>{tr("تعديل الاسم والشعار", "Edit name and logo")}</Button>
            <Button variant="soft" onClick={() => setCustomizing(true)}>
              <Paintbrush className="size-4" /> {tr("تخصيص القائمة ولوحة التحكم", "Customize the menu and dashboard")}
            </Button>
          </div>
        </Card>

        <Card>
          <CardHeader title={tr("المخازن", "Warehouses")} subtitle={tr("اضغط على الاسم لتغييره. يتغيّر في كل الصفحات", "Click a name to change it. It changes on every page")} />
          <ul className="divide-y divide-line">
            {lookups.warehouses.map((w) => (
              <li key={w.id} className="px-4 py-3 text-sm font-medium">
                <EditText always value={name(w)} onSave={(v) => api.renameWarehouse(w.id, lang === "ar" ? v : w.name, lang === "ar" ? w.name_en : v).catch(fail)} />
              </li>
            ))}
          </ul>
        </Card>

        <Card>
          <CardHeader
            title={tr("الأصناف", "Categories")}
            subtitle={tr(
              "اسحب لتغيير الترتيب، واضغط على الاسم لتغييره. الترتيب والاسم يظهران في المتجر والطلبات",
              "Drag to reorder, click a name to change it. The order and the name show in the store and in orders",
            )}
          />
          <div className="space-y-1 p-3">
            <SortArea always ids={lookups.categories} onOrder={(ids) => saveSite((s) => ({ ...s, categories: ids })).catch(fail)}>
              {lookups.categories.map((c) => (
                <SortItem key={c} id={c} always inline className="rounded-xl px-1 py-1.5 text-sm font-medium">
                  <EditText always value={c} onSave={(v) => api.renameCategory(c, v).then(reloadItems).catch(fail)} />
                </SortItem>
              ))}
            </SortArea>
          </div>
        </Card>

        <Card>
          <CardHeader title={tr("قواعد العمل", "Business rules")} />
          <div className="space-y-4 p-4">
            <Field
              label={tr("مدة حجز الطلب غير المثبّت (ساعة)", "Hold time for unconfirmed orders (hours)")}
              hint={tr("بعدها تعود الكمية إلى المخزون تلقائياً", "After this the stock is released by itself")}
            >
              <NumberInput value={s.reservation_hours} onChange={(v) => setS({ ...s, reservation_hours: v === "" ? 0 : v })} />
            </Field>
            <Field label={tr("تنبيه قرب انتهاء الصلاحية (يوم)", "Expiry warning (days before)")} hint={tr("طلب الزبون شهراً", "The client asked for one month")}>
              <NumberInput value={s.near_expiry_days} onChange={(v) => setS({ ...s, near_expiry_days: v === "" ? 0 : v })} />
            </Field>
            <Field label={tr("تُعدّ المادة راكدة إذا لم تُبع خلال (يوم)", "An item is slow if not sold in (days)")}>
              <NumberInput value={s.slow_moving_days} onChange={(v) => setS({ ...s, slow_moving_days: v === "" ? 0 : v })} />
            </Field>
            <Button
              variant="primary"
              loading={busy}
              onClick={async () => {
                setBusy(true);
                try {
                  await api.saveSettings(s);
                  toast("success", tr("تم حفظ الإعدادات", "Settings saved"));
                } catch (e) {
                  toast("danger", errorText(e, tr));
                } finally {
                  setBusy(false);
                }
              }}
            >
              <Save className="size-4" /> {tr("حفظ", "Save")}
            </Button>
          </div>
        </Card>

        <Card>
          <CardHeader title={tr("أنواع الأسعار", "Price tiers")} subtitle={tr("مثلاً: جملة كبيرة تأخذ سعراً أقل", "e.g. big wholesale customers get a lower price")} />
          <div className="space-y-3 p-4">
            {tiers.map((t, i) => (
              <div key={t.id} className="flex gap-2">
                <Input value={t.name} onChange={(e) => setTiers((x) => x.map((y, j) => (j === i ? { ...y, name: e.target.value } : y)))} />
                <Input dir="ltr" value={t.name_en} onChange={(e) => setTiers((x) => x.map((y, j) => (j === i ? { ...y, name_en: e.target.value } : y)))} />
                <Button
                  onClick={async () => {
                    try {
                      await api.saveTier(t.id, t.name, t.name_en);
                      toast("success", tr("تم الحفظ", "Saved"));
                    } catch (e) {
                      toast("danger", errorText(e, tr));
                    }
                  }}
                >
                  <Save className="size-4" />
                </Button>
              </div>
            ))}
            <div className="flex gap-2 border-t border-line pt-3">
              <Input placeholder={tr("نوع جديد", "New tier")} value={newTier.name} onChange={(e) => setNewTier({ ...newTier, name: e.target.value })} />
              <Input dir="ltr" placeholder="English" value={newTier.name_en} onChange={(e) => setNewTier({ ...newTier, name_en: e.target.value })} />
              <Button
                variant="soft"
                onClick={async () => {
                  try {
                    const t = await api.saveTier(null, newTier.name, newTier.name_en);
                    setTiers((x) => [...x, t]);
                    setNewTier({ name: "", name_en: "" });
                    toast("success", tr("أُضيف النوع بأسعار الجملة، ويمكنك تعديلها من صفحة المواد", "Added with wholesale prices. Edit them from the items page"));
                  } catch (e) {
                    toast("danger", errorText(e, tr));
                  }
                }}
              >
                <Plus className="size-4" />
              </Button>
            </div>
          </div>
        </Card>
      </div>
      {brandOpen && <BrandDialog onClose={() => setBrandOpen(false)} />}
    </>
  );
}
