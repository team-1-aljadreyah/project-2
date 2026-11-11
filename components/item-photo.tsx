"use client";

// The product photo on the item page. The manager and the warehouse keeper can choose a new one or remove it;
// it is what the shop owner sees on the item's tile in his store. The others only see it.
// The photo is made smaller on the device first (800px JPEG, about 60–120 KB).
import { useRef, useState } from "react";
import { ImagePlus, Loader2, Trash2 } from "lucide-react";
import { useApp } from "@/components/shell";
import { Button, Card, errorText, useToast } from "@/components/ui";
import { api } from "@/lib/api";
import type { Item } from "@/lib/api/types";
import { useFmt } from "@/lib/i18n";
import { shrinkImage } from "@/lib/image";

export function ItemPhoto({ item }: { item: Item }) {
  const { tr, name } = useFmt();
  const { user, reloadItems } = useApp();
  const toast = useToast();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const canEdit = user.role === "manager" || user.role === "warehouse";

  async function save(image: string | null) {
    setBusy(true);
    try {
      await api.setItemImage(item.id, image);
      reloadItems();
      toast("success", image ? tr("تم تغيير صورة المادة", "The item photo was changed") : tr("حُذفت صورة المادة", "The item photo was removed"));
    } catch (e) {
      toast("danger", errorText(e, tr));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="overflow-hidden">
      <div className="relative flex aspect-[4/3] items-center justify-center bg-card-2">
        {item.image ? (
          // A data URL or the backend's link: a plain <img> (next/image needs known hosts).
          // eslint-disable-next-line @next/next/no-img-element
          <img src={item.image} alt={name(item)} className="size-full object-cover" />
        ) : (
          <p className="px-4 text-center text-xs text-muted">{tr("لا توجد صورة. يظهر للزبون مربع ملوّن بأيقونة الصنف.", "No photo. The shop sees a colored tile with the category icon.")}</p>
        )}
        {busy && (
          <span className="absolute inset-0 flex items-center justify-center bg-black/30">
            <Loader2 className="size-7 animate-spin text-white" />
          </span>
        )}
      </div>
      {canEdit && (
        <div className="flex gap-2 p-3">
          <input
            ref={input}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="hidden"
            onChange={async (e) => {
              const f = e.target.files?.[0];
              e.target.value = "";
              if (!f) return;
              try {
                await save(await shrinkImage(f, 800, 0.78));
              } catch {
                toast("danger", tr("تعذّر قراءة الصورة", "Couldn't read the picture"));
              }
            }}
          />
          <Button size="sm" disabled={busy} onClick={() => input.current?.click()} className="flex-1">
            <ImagePlus className="size-4" /> {item.image ? tr("تغيير الصورة", "Change photo") : tr("إضافة صورة", "Add photo")}
          </Button>
          {item.image && (
            <Button size="sm" disabled={busy} onClick={() => save(null)} aria-label={tr("حذف الصورة", "Remove photo")}>
              <Trash2 className="size-4" />
            </Button>
          )}
        </div>
      )}
    </Card>
  );
}
