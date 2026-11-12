"use client";

// The manager's own ads in the shop owners' store (settings): a picture, a title, and what it opens (a section,
// a brand, a product or a search). They come first in the store's carousel, before the automatic ones.
import { useState } from "react";
import { ArrowDown, ArrowUp, ImagePlus, Loader2, Megaphone, Plus, Trash2 } from "lucide-react";
import { useApp } from "@/components/shell";
import { useSaveSite } from "@/components/customize";
import { Button, Card, CardHeader, Dialog, Field, Input, Select, Switch, useToast } from "@/components/ui";
import type { ShopBanner } from "@/lib/api/types";
import { useFmt } from "@/lib/i18n";
import { shrinkImage } from "@/lib/image";
import { useSite } from "@/lib/site";

export function BannerSettings() {
  const { tr } = useFmt();
  const site = useSite();
  const save = useSaveSite();
  const [editing, setEditing] = useState<ShopBanner | "new" | null>(null);
  const list = site.banners;
  const put = (next: ShopBanner[]) => save((s) => ({ ...s, banners: next }));
  const move = (i: number, d: -1 | 1) => {
    const next = [...list];
    [next[i], next[i + d]] = [next[i + d], next[i]];
    put(next);
  };
  return (
    <Card className="lg:col-span-2">
      <CardHeader
        title={tr("إعلانات متجر المحلات", "Ads in the shops' store")}
        subtitle={tr("تظهر أولاً في أعلى متجر أصحاب المحلات، قبل العروض التلقائية", "They show first at the top of the shop owners' store, before the automatic ones")}
        action={
          <Button size="sm" variant="action" onClick={() => setEditing("new")} disabled={list.length >= 12}>
            <Plus className="size-4" /> {tr("إعلان جديد", "New ad")}
          </Button>
        }
      />
      {list.length ? (
        <ul className="divide-y divide-line">
          {list.map((b, i) => (
            <li key={b.id} className="flex items-center gap-3 p-3">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={b.image} alt="" className="h-14 w-24 shrink-0 rounded-xl object-cover" />
              <button type="button" onClick={() => setEditing(b)} className="min-w-0 flex-1 text-start">
                <span className="block truncate font-semibold">{b.title}</span>
                <span className="block truncate text-xs text-muted">{linkLabel(b, tr)}</span>
              </button>
              <Switch checked={b.active} onChange={(v) => put(list.map((x) => (x.id === b.id ? { ...x, active: v } : x)))} label={<span className="sr-only">{tr("ظاهر", "Shown")}</span>} />
              <span className="flex flex-col">
                <button type="button" disabled={i === 0} onClick={() => move(i, -1)} aria-label={tr("أعلى", "Up")} className="rounded p-1 text-muted hover:text-text disabled:opacity-30">
                  <ArrowUp className="size-4" />
                </button>
                <button type="button" disabled={i === list.length - 1} onClick={() => move(i, 1)} aria-label={tr("أسفل", "Down")} className="rounded p-1 text-muted hover:text-text disabled:opacity-30">
                  <ArrowDown className="size-4" />
                </button>
              </span>
              <button type="button" onClick={() => put(list.filter((x) => x.id !== b.id))} aria-label={tr(`احذف ${b.title}`, `Delete ${b.title}`)} className="rounded-lg p-2 text-muted hover:bg-danger-soft hover:text-danger">
                <Trash2 className="size-4" />
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="flex items-center gap-2 p-4 text-sm text-muted">
          <Megaphone className="size-4" /> {tr("لا إعلانات بعد. المتجر يعرض العروض التلقائية (الجديد، آخر طلب، الأقسام، التسديد).", "No ads yet. The store shows the automatic ones (new, last order, sections, paying).")}
        </p>
      )}
      {editing && (
        <BannerDialog
          banner={editing === "new" ? undefined : editing}
          onClose={() => setEditing(null)}
          onSave={(b) => {
            put(editing === "new" ? [...list, b] : list.map((x) => (x.id === b.id ? b : x)));
            setEditing(null);
          }}
        />
      )}
    </Card>
  );
}

function linkLabel(b: ShopBanner, tr: (a: string, e: string) => string) {
  const k = { category: tr("القسم", "Section"), brand: tr("العلامة", "Brand"), item: tr("المادة", "Item"), search: tr("بحث", "Search") }[b.link.kind];
  return `${k}: ${b.link.value}`;
}

function BannerDialog({ banner, onClose, onSave }: { banner?: ShopBanner; onClose: () => void; onSave: (b: ShopBanner) => void }) {
  const { tr, name } = useFmt();
  const { lookups, items } = useApp();
  const toast = useToast();
  const [b, setB] = useState<ShopBanner>(banner ?? { id: `bn_${crypto.randomUUID().slice(0, 8)}`, image: "", title: "", sub: "", link: { kind: "category", value: lookups.categories[0] ?? "" }, active: true });
  const [busy, setBusy] = useState(false);
  const brands = [...new Set(items.map((i) => i.brand).filter((x): x is string => !!x))];
  const ok = !!b.image && !!b.title.trim() && !!b.link.value;
  return (
    <Dialog
      open
      onClose={onClose}
      title={banner ? tr("تعديل الإعلان", "Edit the ad") : tr("إعلان جديد", "New ad")}
      footer={
        <>
          <Button onClick={onClose}>{tr("إلغاء", "Cancel")}</Button>
          <Button variant="primary" disabled={!ok} onClick={() => onSave({ ...b, title: b.title.trim(), sub: b.sub?.trim() || undefined })}>
            {tr("حفظ", "Save")}
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <label className="flex h-40 cursor-pointer items-center justify-center overflow-hidden rounded-2xl border-2 border-dashed border-line-strong bg-card-2 text-muted hover:border-action">
          {b.image ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={b.image} alt="" className="size-full object-cover" />
          ) : busy ? (
            <Loader2 className="size-6 animate-spin" />
          ) : (
            <span className="flex flex-col items-center gap-1 text-sm">
              <ImagePlus className="size-7" /> {tr("اختر صورة الإعلان (عريضة)", "Choose the ad's picture (wide)")}
            </span>
          )}
          <input
            type="file"
            accept="image/*"
            className="sr-only"
            onChange={async (e) => {
              const file = e.target.files?.[0];
              if (!file) return;
              setBusy(true);
              try {
                setB((x) => ({ ...x, image: "" }));
                const image = await shrinkImage(file, 1200, 0.75);
                setB((x) => ({ ...x, image }));
              } catch {
                toast("danger", tr("تعذّر قراءة الصورة", "Couldn't read the picture"));
              } finally {
                setBusy(false);
              }
            }}
          />
        </label>
        <Field label={tr("العنوان", "Title")}>
          <Input value={b.title} maxLength={60} onChange={(e) => setB({ ...b, title: e.target.value })} placeholder={tr("مثلاً: عروض الزيوت هذا الأسبوع", "e.g. Oils on offer this week")} />
        </Field>
        <Field label={tr("سطر تحته (اختياري)", "A line under it (optional)")}>
          <Input value={b.sub ?? ""} maxLength={80} onChange={(e) => setB({ ...b, sub: e.target.value })} />
        </Field>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label={tr("يفتح", "Opens")}>
            <Select
              value={b.link.kind}
              onChange={(e) => {
                const kind = e.target.value as ShopBanner["link"]["kind"];
                const value = kind === "category" ? (lookups.categories[0] ?? "") : kind === "brand" ? (brands[0] ?? "") : kind === "item" ? String(items[0]?.id ?? "") : "";
                setB({ ...b, link: { kind, value } });
              }}
            >
              <option value="category">{tr("قسماً", "A section")}</option>
              <option value="brand">{tr("علامة تجارية", "A brand")}</option>
              <option value="item">{tr("مادة", "An item")}</option>
              <option value="search">{tr("بحثاً بكلمة", "A search")}</option>
            </Select>
          </Field>
          <Field label={tr("ماذا", "Which")}>
            {b.link.kind === "search" ? (
              <Input value={b.link.value} onChange={(e) => setB({ ...b, link: { ...b.link, value: e.target.value } })} placeholder={tr("مثلاً: رز", "e.g. rice")} />
            ) : (
              <Select value={b.link.value} onChange={(e) => setB({ ...b, link: { ...b.link, value: e.target.value } })}>
                {(b.link.kind === "category" ? lookups.categories.map((c) => [c, c]) : b.link.kind === "brand" ? brands.map((x) => [x, x]) : items.filter((i) => i.active).map((i) => [String(i.id), name(i)])).map(([v, l]) => (
                  <option key={v} value={v}>
                    {l}
                  </option>
                ))}
              </Select>
            )}
          </Field>
        </div>
      </div>
    </Dialog>
  );
}
