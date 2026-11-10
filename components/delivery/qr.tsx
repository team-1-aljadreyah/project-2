"use client";

// The shipment's QR code and the label the warehouse keeper sticks on the packages.
// The QR holds "NAHRAIN:DLV:<code>". The same code is printed under it, to type by hand if a camera can't read it.
import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { Printer, QrCode as QrIcon } from "lucide-react";
import { Button } from "@/components/ui";
import type { Order } from "@/lib/api/types";
import { useFmt } from "@/lib/i18n";

export const qrValue = (code: string) => `NAHRAIN:DLV:${code}`;
/** "ABCD2345" → "ABCD-2345": easier to read and type. */
export const prettyCode = (code: string) => code.replace(/(.{4})(?=.)/g, "$1-");

/** The QR as an SVG picture (made in the browser by the "qrcode" library). */
export function QrCode({ value, size = 160 }: { value: string; size?: number }) {
  const [svg, setSvg] = useState("");
  useEffect(() => {
    let alive = true;
    QRCode.toString(value, { type: "svg", margin: 1, errorCorrectionLevel: "M", color: { dark: "#111317", light: "#ffffff" } }).then((s) => alive && setSvg(s));
    return () => {
      alive = false;
    };
  }, [value]);
  return (
    <div
      role="img"
      aria-label="QR"
      className="rounded-xl bg-white p-2 [&>svg]:h-full [&>svg]:w-full"
      style={{ width: size, height: size }}
      // The SVG comes from the qrcode library (our own value), not from user text.
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
}

/** The label for the packages: QR + code + who it is for. Printed by the keeper and stuck on the shipment. */
export function ShipmentLabel({ order, shop, rep, area }: { order: Order; shop: string; rep: string; area?: string }) {
  const { tr, num } = useFmt();
  const code = order.delivery?.code ?? "";
  const cartons = order.lines.length;
  return (
    <div className="print-area rounded-2xl border-2 border-dashed border-line-strong bg-white p-4 text-[#111317]">
      <div className="flex items-start gap-4">
        <QrCode value={qrValue(code)} size={132} />
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-1 text-[11px] font-semibold text-neutral-500">
            <QrIcon className="size-3.5" /> {tr("ملصق الشحنة · النهرين", "Shipment label · Al-Nahrain")}
          </p>
          <p className="mt-1 text-lg font-bold leading-6">{shop}</p>
          {area && <p className="text-xs text-neutral-500">{area}</p>}
          <p className="mt-2 text-xs">
            <span className="num font-semibold" dir="ltr">
              {order.number}
            </span>{" "}
            · {num(cartons)} {tr("مواد", "items")}
          </p>
          <p className="text-xs">
            {tr("مندوب التوصيل", "Delivery rep")}: <b>{rep}</b>
          </p>
          <p className="num mt-2 inline-block rounded-md bg-neutral-100 px-2 py-1 text-sm font-bold tracking-widest" dir="ltr">
            {prettyCode(code)}
          </p>
        </div>
      </div>
      <p className="mt-3 border-t border-neutral-200 pt-2 text-[11px] text-neutral-500">
        {tr("يمسحه مندوب التوصيل عند استلام الشحنة من المخزن. رمز الاستلام عند صاحب المحل فقط.", "The delivery rep scans it when he takes the shipment. The delivery PIN is with the shop owner only.")}
      </p>
    </div>
  );
}

export function PrintButton() {
  const { tr } = useFmt();
  return (
    <Button size="sm" onClick={() => window.print()} className="no-print">
      <Printer className="size-4" /> {tr("طباعة الملصق", "Print the label")}
    </Button>
  );
}
