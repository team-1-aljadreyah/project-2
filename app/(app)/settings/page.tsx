"use client";

import { useState } from "react";
import { Plus, Save } from "lucide-react";
import { useApp } from "@/components/shell";
import { Button, Card, CardHeader, Field, Input, NumberInput, Switch, errorText, useToast, PageHeader } from "@/components/ui";
import { api } from "@/lib/api";
import type { Settings } from "@/lib/api/types";
import { useFmt } from "@/lib/i18n";

export default function SettingsPage() {
  const { tr } = useFmt();
  const { lookups } = useApp();
  const toast = useToast();
  const [s, setS] = useState<Settings>(lookups.settings);
  const [busy, setBusy] = useState(false);
  const [tiers, setTiers] = useState(lookups.tiers.map((t) => ({ ...t })));
  const [newTier, setNewTier] = useState({ name: "", name_en: "" });

  return (
    <>
      <PageHeader title={tr("الإعدادات", "Settings")} />
      <div className="grid max-w-5xl gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader title={tr("قواعد العمل", "Business rules")} />
          <div className="space-y-4 p-4">
            <Field label={tr("مدة حجز الطلب غير المثبّت (ساعة)", "Hold time for unconfirmed orders (hours)")} hint={tr("بعدها ترجع الكمية للمخزون تلقائياً", "After this the stock is released by itself")}>
              <NumberInput value={s.reservation_hours} onChange={(v) => setS({ ...s, reservation_hours: v === "" ? 0 : v })} />
            </Field>
            <Field label={tr("تنبيه قرب انتهاء الصلاحية (يوم)", "Expiry warning (days before)")} hint={tr("الزبون طلب شهر", "The client asked for one month")}>
              <NumberInput value={s.near_expiry_days} onChange={(v) => setS({ ...s, near_expiry_days: v === "" ? 0 : v })} />
            </Field>
            <Field label={tr("المادة راكدة إذا ما انباعت خلال (يوم)", "An item is slow if not sold in (days)")}>
              <NumberInput value={s.slow_moving_days} onChange={(v) => setS({ ...s, slow_moving_days: v === "" ? 0 : v })} />
            </Field>
            <Switch checked={s.auto_confirm_rep_orders} onChange={(v) => setS({ ...s, auto_confirm_rep_orders: v })} label={tr("تثبيت طلبات المندوبين تلقائياً (بدون مراجعة المخزن)", "Confirm rep orders automatically (no warehouse review)")} />
            <Button
              variant="primary"
              loading={busy}
              onClick={async () => {
                setBusy(true);
                try {
                  await api.saveSettings(s);
                  toast("success", tr("انحفظت الإعدادات", "Settings saved"));
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
          <CardHeader title={tr("أنواع الأسعار", "Price tiers")} subtitle={tr("مثلاً: جملة كبيرة تاخذ سعر أقل", "e.g. big wholesale customers get a lower price")} />
          <div className="space-y-3 p-4">
            {tiers.map((t, i) => (
              <div key={t.id} className="flex gap-2">
                <Input value={t.name} onChange={(e) => setTiers((x) => x.map((y, j) => (j === i ? { ...y, name: e.target.value } : y)))} />
                <Input dir="ltr" value={t.name_en} onChange={(e) => setTiers((x) => x.map((y, j) => (j === i ? { ...y, name_en: e.target.value } : y)))} />
                <Button
                  onClick={async () => {
                    try {
                      await api.saveTier(t.id, t.name, t.name_en);
                      toast("success", tr("انحفظ", "Saved"));
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
                    toast("success", tr("انضاف النوع بأسعار الجملة، عدّلها من صفحة المواد", "Added with wholesale prices. Edit them from the items page"));
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
    </>
  );
}
