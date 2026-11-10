"use client";

// The delivery rep's QR reader: the phone's back camera, read many times a second.
// It uses the browser's own BarcodeDetector when there is one (Chrome on Android), and the jsQR library
// otherwise. A box to type the code by hand is always there: no camera permission, a scratched label, a PC.
import { useEffect, useRef, useState } from "react";
import jsQR from "jsqr";
import { CameraOff, Keyboard, ScanLine } from "lucide-react";
import { Button, Dialog, Input } from "@/components/ui";
import { useFmt } from "@/lib/i18n";

type Detector = { detect: (src: CanvasImageSource) => Promise<{ rawValue: string }[]> };

export function QrScanner({ onCode, onClose, busy }: { onCode: (code: string) => void; onClose: () => void; busy?: boolean }) {
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
    let raf = 0;
    let stopped = false;
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    const BD = (window as unknown as { BarcodeDetector?: new (o: { formats: string[] }) => Detector }).BarcodeDetector;
    const detector = BD ? new BD({ formats: ["qr_code"] }) : null;

    const found = (text: string) => {
      if (done.current || !text) return;
      done.current = true;
      navigator.vibrate?.(60);
      latest.current(text);
    };

    const tick = async () => {
      const v = video.current;
      if (stopped || !v) return;
      if (v.readyState >= 2 && v.videoWidth) {
        try {
          if (detector) {
            const codes = await detector.detect(v);
            if (codes[0]) found(codes[0].rawValue);
          } else if (ctx) {
            // A smaller picture is read faster, and is still enough for a QR held in front of the camera.
            const w = 480;
            const h = Math.round((v.videoHeight / v.videoWidth) * w);
            canvas.width = w;
            canvas.height = h;
            ctx.drawImage(v, 0, 0, w, h);
            const img = ctx.getImageData(0, 0, w, h);
            const code = jsQR(img.data, w, h, { inversionAttempts: "dontInvert" });
            if (code) found(code.data);
          }
        } catch {}
      }
      raf = requestAnimationFrame(tick);
    };

    (async () => {
      try {
        if (!navigator.mediaDevices?.getUserMedia) throw new Error("no-camera");
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" }, audio: false });
        if (stopped) return stream.getTracks().forEach((t) => t.stop());
        const v = video.current!;
        v.srcObject = stream;
        await v.play();
        raf = requestAnimationFrame(tick);
      } catch {
        setCamError(tr("لا يمكن فتح الكاميرا هنا (لم يُسمح بها، أو الاتصال غير آمن). اكتب الرمز المطبوع تحت QR.", "The camera can't open here (not allowed, or the connection isn't secure). Type the code printed under the QR."));
      }
    })();

    // Turn the camera off when the scanner closes (the light on the phone goes off).
    return () => {
      stopped = true;
      cancelAnimationFrame(raf);
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, [tr]);

  return (
    <Dialog open onClose={onClose} title={tr("امسح رمز QR للشحنة", "Scan the shipment's QR")}>
      {!camError ? (
        <div className="relative overflow-hidden rounded-2xl bg-black">
          <video ref={video} muted playsInline className="aspect-square w-full object-cover" />
          {/* The aiming frame with a moving line */}
          <div className="pointer-events-none absolute inset-[18%] rounded-2xl border-4 border-white/80 shadow-[0_0_0_999px_rgb(0_0_0/0.35)]">
            <ScanLine className="absolute inset-x-0 top-1/2 mx-auto size-10 -translate-y-1/2 animate-pulse text-action" />
          </div>
          <p className="absolute inset-x-0 bottom-3 text-center text-sm font-semibold text-white">{tr("وجّه الكاميرا نحو الملصق", "Point the camera at the label")}</p>
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
          if (typed.trim()) onCode(typed);
        }}
      >
        <div className="relative flex-1">
          <Keyboard className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-faint" />
          <Input dir="ltr" value={typed} onChange={(e) => setTyped(e.target.value.toUpperCase())} placeholder="ABCD-2345" className="num ps-9 tracking-widest" aria-label={tr("رمز الشحنة", "Shipment code")} />
        </div>
        <Button type="submit" variant="action" disabled={!typed.trim() || busy}>
          {tr("تأكيد", "Confirm")}
        </Button>
      </form>
    </Dialog>
  );
}
