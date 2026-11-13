"use client";

// The product's short video on the item page (manager, warehouse keeper): upload a clip (up to 20 MB and 30 s)
// or paste a link. It plays in «منتجاتنا» of the shop owners' app in place of the picture.
import { useRef, useState } from "react";
import { Film, Link2, Loader2, Trash2, Upload } from "lucide-react";
import { useApp } from "@/components/shell";
import { Button, Card, Dialog, Field, Input, errorText, useToast } from "@/components/ui";
import { api } from "@/lib/api";
import type { Item } from "@/lib/api/types";
import { useFmt } from "@/lib/i18n";
import { putVideo, useVideoSrc, videoSeconds } from "@/lib/media-store";

const MAX_MB = 20;
const MAX_S = 30;

export function ItemVideo({ item }: { item: Item }) {
  const { tr } = useFmt();
  const { user, reloadItems } = useApp();
  const toast = useToast();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [linking, setLinking] = useState(false);
  const [link, setLink] = useState("");
  const src = useVideoSrc(item.video);
  const canEdit = user.role === "manager" || user.role === "warehouse";
  if (!canEdit && !item.video) return null;

  async function save(video: string | null) {
    setBusy(true);
    try {
      await api.setItemVideo(item.id, video);
      reloadItems();
      toast("success", video ? tr("حُفظ فيديو المادة: يظهر في «منتجاتنا»", "The video is saved: it plays in «Our products»") : tr("حُذف الفيديو", "The video is removed"));
      setLinking(false);
    } catch (e) {
      toast("danger", errorText(e, tr));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="overflow-hidden">
      <div className="relative flex aspect-[4/3] items-center justify-center bg-black">
        {src ? (
          <video src={src} poster={item.image} controls muted playsInline loop className="size-full object-contain" />
        ) : item.video ? (
          <p className="px-4 text-center text-xs text-white/70">{tr("الفيديو مرفوع من جهاز آخر (في التجربة يبقى الملف على الجهاز الذي رُفع منه)", "The video was uploaded from another device (in the demo the file stays on that device)")}</p>
        ) : (
          <p className="flex flex-col items-center gap-2 px-4 text-center text-xs text-white/70">
            <Film className="size-8" />
            {tr("فيديو قصير للمادة (اختياري): يُعرض في «منتجاتنا» بدل الصورة.", "A short video (optional): it plays in «Our products» in place of the picture.")}
          </p>
        )}
        {busy && (
          <span className="absolute inset-0 flex items-center justify-center bg-black/40">
            <Loader2 className="size-7 animate-spin text-white" />
          </span>
        )}
      </div>
      {canEdit && (
        <div className="flex gap-2 p-3">
          <input
            ref={input}
            type="file"
            accept="video/mp4,video/webm,video/quicktime"
            className="hidden"
            onChange={async (e) => {
              const f = e.target.files?.[0];
              e.target.value = "";
              if (!f) return;
              if (f.size > MAX_MB * 1024 * 1024) return toast("danger", tr(`الفيديو أكبر من ${MAX_MB} ميغابايت`, `The video is over ${MAX_MB} MB`));
              const s = await videoSeconds(f);
              if (Number.isFinite(s) && s > MAX_S + 0.5) return toast("danger", tr(`الفيديو أطول من ${MAX_S} ثانية`, `The video is longer than ${MAX_S} s`));
              setBusy(true);
              try {
                await save(await putVideo(f));
              } catch {
                toast("danger", tr("تعذّر حفظ الفيديو", "Couldn't keep the video"));
                setBusy(false);
              }
            }}
          />
          <Button size="sm" disabled={busy} onClick={() => input.current?.click()} className="flex-1">
            <Upload className="size-4" /> {item.video ? tr("تغيير الفيديو", "Change video") : tr("رفع فيديو", "Upload a video")}
          </Button>
          <Button size="sm" disabled={busy} onClick={() => setLinking(true)} aria-label={tr("رابط فيديو", "A video link")}>
            <Link2 className="size-4" />
          </Button>
          {item.video && (
            <Button size="sm" disabled={busy} onClick={() => save(null)} aria-label={tr("حذف الفيديو", "Remove the video")}>
              <Trash2 className="size-4" />
            </Button>
          )}
        </div>
      )}
      {linking && (
        <Dialog
          open
          onClose={() => setLinking(false)}
          title={tr("رابط فيديو", "A video link")}
          footer={
            <>
              <Button onClick={() => setLinking(false)}>{tr("إلغاء", "Cancel")}</Button>
              <Button variant="primary" disabled={!/^https:\/\/\S+$/.test(link.trim()) || busy} onClick={() => save(link.trim())}>
                {tr("حفظ", "Save")}
              </Button>
            </>
          }
        >
          <Field label={tr("رابط ملف الفيديو (mp4 أو webm)", "The video file's link (mp4 or webm)")} hint={tr("يبدأ بـ https://", "Starts with https://")}>
            <Input dir="ltr" value={link} onChange={(e) => setLink(e.target.value)} placeholder="https://…/video.mp4" />
          </Field>
        </Dialog>
      )}
    </Card>
  );
}
