"use client";

// Scanning an item's barcode with the phone's camera (receiving, counting, writing an order, the items list).
// The browser's own reader when it has one (Chrome on Android: fast, no download); otherwise (iPhone, some
// computers) the ZXing library, loaded only when the scanner opens. Typing the number by hand always works.
import { useEffect, useRef, useState } from "react";
import { CameraOff, Keyboard, ScanBarcode, ScanLine } from "lucide-react";
import { Button, Dialog, Input } from "@/components/ui";
import type { Item } from "@/lib/api/types";
import { useFmt } from "@/lib/i18n";

type Detector = { detect: (src: CanvasImageSource) => Promise<{ rawValue: string }[]> };
const FORMATS = ["ean_13", "ean_8", "upc_a", "upc_e", "code_128", "code_39", "qr_code"];

/** The item with this barcode (digits only compared, so spaces or dashes on a label don't matter). */
export function itemByBarcode(items: Item[], code: string) {
  const c = code.replace(/\D/g, "");
  return c ? items.find((i) => (i.barcode ?? "").replace(/\D/g, "") === c) : undefined;
}

export function BarcodeScanner({ onCode, onClose, title }: { onCode: (code: string) => void; onClose: () => void; title?: string }) {
  const { tr } = useFmt();
  const video = useRef<HTMLVideoElement>(null);
  const [camError, setCamError] = useState<string | null>(null);
  const [typed, setTyped] = useState("");
  const done = useRef(false);
  const latest = useRef(onCode);
  useEffect(() => {
    latest.current = onCode;
  });

  useEffect(() => {
    let stream: MediaStream | null = null;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let stopped = false;
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d", { willReadFrequently: true });

    const found = (text: string) => {
      if (done.current || !text) return;
      done.current = true;
      navigator.vibrate?.(60);
      latest.current(text.trim());
    };

    (async () => {
      // 1) The reader: the browser's own, or ZXing (loaded now, only for this scanner).
      let read: (v: HTMLVideoElement) => Promise<string | null>;
      const BD = (window as unknown as { BarcodeDetector?: (new (o: { formats: string[] }) => Detector) & { getSupportedFormats?: () => Promise<string[]> } }).BarcodeDetector;
      const native = BD ? await BD.getSupportedFormats?.().catch(() => [] as string[]) : [];
      if (BD && native && native.some((f) => FORMATS.includes(f))) {
        const d = new BD({ formats: FORMATS.filter((f) => native.includes(f)) });
        read = async (v) => (await d.detect(v))[0]?.rawValue ?? null;
      } else {
        const z = await import("@zxing/library");
        const hints = new Map();
        hints.set(z.DecodeHintType.POSSIBLE_FORMATS, [z.BarcodeFormat.EAN_13, z.BarcodeFormat.EAN_8, z.BarcodeFormat.UPC_A, z.BarcodeFormat.UPC_E, z.BarcodeFormat.CODE_128, z.BarcodeFormat.CODE_39, z.BarcodeFormat.QR_CODE]);
        hints.set(z.DecodeHintType.TRY_HARDER, true);
        const reader = new z.MultiFormatReader();
        reader.setHints(hints);
        read = async (v) => {
          if (!ctx) return null;
          // The middle band of the picture, where the barcode is held: smaller is read faster.
          const w = 640;
          const h = Math.round((v.videoHeight / v.videoWidth) * w);
          canvas.width = w;
          canvas.height = h;
          ctx.drawImage(v, 0, 0, w, h);
          try {
            return reader.decode(new z.BinaryBitmap(new z.HybridBinarizer(new z.HTMLCanvasElementLuminanceSource(canvas)))).getText();
          } catch {
            return null;
          }
        };
      }
      // 2) The camera.
      try {
        if (!navigator.mediaDevices?.getUserMedia) throw new Error("no-camera");
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment", width: { ideal: 1280 } }, audio: false });
        if (stopped) return stream.getTracks().forEach((t) => t.stop());
        const v = video.current!;
        v.srcObject = stream;
        await v.play();
      } catch {
        setCamError(tr("لا يمكن فتح الكاميرا هنا (لم يُسمح بها، أو الاتصال غير آمن). اكتب رقم الباركود.", "The camera can't open here (not allowed, or the connection isn't secure). Type the barcode number."));
        return;
      }
      // 3) Read a few times a second until something is found.
      const tick = async () => {
        const v = video.current;
        if (stopped || !v) return;
        if (v.readyState >= 2 && v.videoWidth) {
          const code = await read(v).catch(() => null);
          if (code) return found(code);
        }
        timer = setTimeout(tick, 150);
      };
      tick();
    })();

    return () => {
      stopped = true;
      clearTimeout(timer);
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, [tr]);

  return (
    <Dialog open onClose={onClose} title={title ?? tr("امسح الباركود", "Scan the barcode")}>
      {!camError ? (
        <div className="relative overflow-hidden rounded-2xl bg-black">
          <video ref={video} muted playsInline className="aspect-[4/3] w-full object-cover" />
          {/* A wide aiming band, the shape of a barcode */}
          <div className="pointer-events-none absolute inset-x-[10%] top-1/2 h-[34%] -translate-y-1/2 rounded-2xl border-4 border-white/80 shadow-[0_0_0_999px_rgb(0_0_0/0.35)]">
            <ScanLine className="absolute inset-x-0 top-1/2 mx-auto size-10 -translate-y-1/2 animate-pulse text-action" />
          </div>
          <p className="absolute inset-x-0 bottom-3 text-center text-sm font-semibold text-white">{tr("ضع الباركود داخل الإطار", "Hold the barcode inside the frame")}</p>
        </div>
      ) : (
        <p className="flex items-start gap-2 rounded-xl bg-warning-soft p-3 text-sm text-warning">
          <CameraOff className="mt-0.5 size-4 shrink-0" /> {camError}
        </p>
      )}
      <form
        className="mt-4 flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (typed.trim()) onCode(typed.trim());
        }}
      >
        <div className="relative flex-1">
          <Keyboard className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-faint" />
          <Input dir="ltr" inputMode="numeric" value={typed} onChange={(e) => setTyped(e.target.value)} placeholder="6260000000000" className="num ps-9 tracking-widest" aria-label={tr("رقم الباركود", "Barcode number")} />
        </div>
        <Button type="submit" variant="action" disabled={!typed.trim()}>
          {tr("تأكيد", "Confirm")}
        </Button>
      </form>
    </Dialog>
  );
}

/** The small "scan" button that opens the scanner (next to a search box or an "add" button). */
export function ScanButton({ onClick, label }: { onClick: () => void; label?: string }) {
  const { tr } = useFmt();
  return (
    <Button onClick={onClick} aria-label={label ?? tr("مسح الباركود", "Scan a barcode")} title={label ?? tr("مسح الباركود", "Scan a barcode")}>
      <ScanBarcode className="size-4" /> <span className="hidden sm:inline">{label ?? tr("مسح الباركود", "Scan")}</span>
    </Button>
  );
}
