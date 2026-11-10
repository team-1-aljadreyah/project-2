"use client";

// The photo of the packages at the shop. On a phone, capture="environment" opens the back camera directly.
// The picture is made smaller ON THE PHONE (900px, JPEG) before it is sent: a camera photo is several MB,
// which is slow on a weak connection; ~100 KB is enough to see the packages arrived in good shape.
import { useRef, useState } from "react";
import { Camera, Loader2, RotateCcw } from "lucide-react";
import { useFmt } from "@/lib/i18n";
import { cn } from "@/lib/utils";

async function shrink(file: File, max = 900, quality = 0.72): Promise<string> {
  const bmp = await createImageBitmap(file);
  const scale = Math.min(1, max / Math.max(bmp.width, bmp.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bmp.width * scale);
  canvas.height = Math.round(bmp.height * scale);
  canvas.getContext("2d")!.drawImage(bmp, 0, 0, canvas.width, canvas.height);
  bmp.close();
  return canvas.toDataURL("image/jpeg", quality);
}

export function PhotoCapture({ value, onChange, error }: { value: string | null; onChange: (dataUrl: string | null) => void; error?: string }) {
  const { tr } = useFmt();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  return (
    <div>
      <input
        ref={input}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={async (e) => {
          const f = e.target.files?.[0];
          e.target.value = "";
          if (!f) return;
          setBusy(true);
          try {
            onChange(await shrink(f));
          } finally {
            setBusy(false);
          }
        }}
      />
      {value ? (
        <div className="relative overflow-hidden rounded-2xl border border-line">
          {/* eslint-disable-next-line @next/next/no-img-element -- a local data URL, nothing for next/image to optimize */}
          <img src={value} alt={tr("صورة الشحنة", "Photo of the packages")} className="max-h-72 w-full object-cover" />
          <button type="button" onClick={() => input.current?.click()} className="absolute bottom-2 end-2 flex items-center gap-1 rounded-full bg-black/60 px-3 py-1.5 text-xs font-semibold text-white">
            <RotateCcw className="size-3.5" /> {tr("صورة أخرى", "Retake")}
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => input.current?.click()}
          className={cn("flex h-40 w-full flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed text-sm font-semibold transition hover:bg-card-2", error ? "border-danger text-danger" : "border-line-strong text-muted")}
        >
          {busy ? <Loader2 className="size-8 animate-spin" /> : <Camera className="size-8" />}
          {tr("صوّر الشحنة عند المحل", "Take a photo of the packages")}
          <span className="text-xs font-normal">{tr("تظهر البضاعة سليمة وكاملة", "Show the goods complete and in good shape")}</span>
        </button>
      )}
      {error && <p className="mt-1 text-xs text-danger">{error}</p>}
    </div>
  );
}
