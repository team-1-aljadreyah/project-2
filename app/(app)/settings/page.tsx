"use client";

import Link from "next/link";
import { SlidersHorizontal } from "lucide-react";

import { useState } from "react";
import { LayoutGrid, MapPin as MapPinIcon, Paintbrush, Pencil, Plus, Save, Trash2, UserCheck } from "lucide-react";
import { BrandDialog, EditText, SortArea, SortItem } from "@/components/customize";
import { LogoMark } from "@/components/logo";
import { CoverDialog, DeleteWarehouse, LayoutEditor, WarehouseForm, coverActive } from "@/components/warehouse-layout";
import { VehiclesCard } from "@/components/vehicles";
import { useApp } from "@/components/shell";
import { Button, Card, CardHeader, Field, Input, NumberInput, errorText, useToast, PageHeader } from "@/components/ui";
import { api } from "@/lib/api";
import type { Settings, Warehouse } from "@/lib/api/types";
import { EXPENSE_APPROVAL_ABOVE } from "@/lib/api/types";
import { useFmt } from "@/lib/i18n";
import { saveSite, setCustomizing, useBrand } from "@/lib/site";

export default function SettingsPage() {
  const { tr, lang, name, date } = useFmt();
  const { lookups, reloadItems } = useApp();
  const toast = useToast();
  const brand = useBrand();
  const [brandOpen, setBrandOpen] = useState(false);
  // The warehouse being added ("new") or edited, and the one whose inside is being arranged.
  const [whForm, setWhForm] = useState<Warehouse | "new" | null>(null);
  const [arranging, setArranging] = useState<Warehouse | null>(null);
  const [covering, setCovering] = useState<Warehouse | null>(null);
  const [deleting, setDeleting] = useState<Warehouse | null>(null);
  const fail = (e: unknown) => toast("danger", errorText(e, tr));
  const [s, setS] = useState<Settings>(lookups.settings);
  const [busy, setBusy] = useState(false);
  const [tiers, setTiers] = useState(lookups.tiers.map((t) => ({ ...t })));
  const [newTier, setNewTier] = useState({ name: "", name_en: "" });

  return (
    <>
      <PageHeader title={tr("الإعدادات", "Settings")} />
      <div className="grid max-w-5xl gap-4 lg:grid-cols-2">
        {/* The way into the advanced settings (profiles, apps), like Salesforce's Setup. */}
        <Link href="/settings/advanced" className="box-row group flex items-center gap-4 rounded-2xl border border-primary/30 bg-gradient-to-l from-primary-soft to-card p-4 transition hover:border-primary lg:col-span-2">
          <span className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-primary text-on-primary">
            <SlidersHorizontal className="size-6" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-base font-bold">{tr("الإعدادات المتقدمة", "Advanced settings")}</span>
            <span className="block text-sm text-muted">{tr("ملفات الصلاحيات والتطبيقات: أضفها بنفسك بلا مبرمج، وتصل إلى الجميع فوراً.", "Permission profiles and apps: add them yourself, no developer; they reach everyone at once.")}</span>
          </span>
          <span className="text-sm font-semibold text-primary-ink">{tr("ادخل ←", "Open →")}</span>
        </Link>
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

        <VehiclesCard />

        <Card>
          <CardHeader
            title={tr("المخازن", "Warehouses")}
            subtitle={tr("اضغط على الاسم لتغييره. «ترتيب» يفتح مناطق المخزن ومكان كل مادة فيه", "Click a name to change it. “Arrange” opens its zones and the place of every item")}
            action={
              <Button size="sm" variant="action" onClick={() => setWhForm("new")}>
                <Plus className="size-4" /> {tr("مخزن جديد", "New warehouse")}
              </Button>
            }
          />
          <ul className="divide-y divide-line">
            {lookups.warehouses.map((w) => (
              <li key={w.id} className="flex flex-wrap items-center gap-2 px-4 py-3 text-sm">
                <span className="min-w-0 flex-1">
                  <span className="block font-medium">
                    <EditText always value={name(w)} onSave={(v) => api.renameWarehouse(w.id, lang === "ar" ? v : w.name, lang === "ar" ? w.name_en : v).catch(fail)} />
                  </span>
                  <span className="flex items-center gap-1 text-xs text-muted">
                    <span className="num">{w.capacity.toLocaleString("en")}</span> {tr("كارتون", "cartons")}
                    {w.layout && <> · {tr(`${w.layout.zones.length} مناطق`, `${w.layout.zones.length} zones`)}</>}
                    {coverActive(w) && (
                      <span className="flex items-center gap-0.5 font-semibold text-action">
                        · <UserCheck className="size-3" /> {tr(`مكلّف: ${w.cover!.name} حتى ${date(w.cover!.until)}`, `Covered by ${w.cover!.name} until ${date(w.cover!.until)}`)}
                      </span>
                    )}
                    {w.lat === undefined && (
                      <span className="flex items-center gap-0.5 text-warning">
                        · <MapPinIcon className="size-3" /> {tr("بلا موقع", "no location")}
                      </span>
                    )}
                  </span>
                </span>
                <Button size="sm" variant="ghost" onClick={() => setCovering(w)} title={tr("تكليف مؤقت عند غياب الأمين", "Temporary cover while the keeper is away")}>
                  <UserCheck className="size-4" /> <span className="max-sm:hidden">{tr("تكليف مؤقت", "Cover")}</span>
                </Button>
                <Button size="sm" onClick={() => setArranging(w)}>
                  <LayoutGrid className="size-4" /> {tr("ترتيب", "Arrange")}
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setWhForm(w)} aria-label={tr(`تعديل ${w.name}`, `Edit ${w.name_en}`)}>
                  <Pencil className="size-4" />
                </Button>
                {lookups.warehouses.length > 1 && (
                  <Button size="sm" variant="ghost" className="text-danger" onClick={() => setDeleting(w)} aria-label={tr(`حذف ${w.name}`, `Delete ${w.name_en}`)} title={tr("حذف المخزن", "Delete the warehouse")}>
                    <Trash2 className="size-4" />
                  </Button>
                )}
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
            <Field label={tr("الصرفيات: يحتاج موافقتك ما يزيد على (د.ع)", "Expenses: above this needs your OK (IQD)")} hint={tr("صرفيات المحاسب الأكبر من هذا المبلغ تنتظر موافقتك", "The accountant's bigger expenses wait for you")}>
              <NumberInput value={s.expense_approval_above ?? EXPENSE_APPROVAL_ABOVE} onChange={(v) => setS({ ...s, expense_approval_above: v === "" ? 0 : v })} suffix={tr("د.ع", "IQD")} />
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
      {whForm && <WarehouseForm warehouse={whForm === "new" ? undefined : whForm} onClose={() => setWhForm(null)} onSaved={(w) => whForm === "new" && setArranging(w)} />}
      {arranging && <LayoutEditor warehouse={arranging} onClose={() => setArranging(null)} />}
      {covering && <CoverDialog warehouse={covering} onClose={() => setCovering(null)} />}
      {deleting && <DeleteWarehouse warehouse={deleting} onClose={() => setDeleting(null)} />}
    </>
  );
}
