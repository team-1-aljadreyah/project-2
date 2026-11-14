"use client";

// The shipment's QR code and the label the warehouse keeper sticks on the packages.
// The QR holds "NAHRAIN:DLV:<code>"; a Code 128 barcode under it holds the code itself (for a barcode reader),
// and the code is written out too, to type by hand if nothing can read it.
// Printing: «اطبع الملصق» sends the label alone (its own 100 × 70 mm page); «اطبع الصفحة» prints the screen.
import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { FileText, Printer, QrCode as QrIcon } from "lucide-react";
import { printHtml } from "@/components/thermal-receipt";
import { Button } from "@/components/ui";
import type { Order } from "@/lib/api/types";
import { code128Svg } from "@/lib/code128";
import { useFmt } from "@/lib/i18n";
import { useBrand } from "@/lib/site";

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
      {/* The same code as a barcode (the SVG is made here from our own code, not from user text). */}
      {code && <div className="mt-3 h-14 [&>svg]:h-full [&>svg]:w-full" role="img" aria-label={tr("باركود الشحنة", "Shipment barcode")} dangerouslySetInnerHTML={{ __html: code128Svg(code, { height: 56 }) }} />}
      <p className="mt-3 border-t border-neutral-200 pt-2 text-[11px] text-neutral-500">
        {tr("يمسحه مندوب التوصيل عند استلام الشحنة من المخزن. رمز الاستلام عند صاحب المحل فقط.", "The delivery rep scans it when he takes the shipment. The delivery PIN is with the shop owner only.")}
      </p>
    </div>
  );
}

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

/** Two ways to print: the label alone (QR + barcode, sized for a label printer), or the page as it is. */
export function PrintButton({ order, shop, rep, area }: { order?: Order; shop?: string; rep?: string; area?: string }) {
  const { tr, num, lang } = useFmt();
  const brand = useBrand();
  const code = order?.delivery?.code ?? "";
  const label = async () => {
    if (!order || !code) return;
    const qr = await QRCode.toString(qrValue(code), { type: "svg", margin: 0, errorCorrectionLevel: "M", color: { dark: "#000000", light: "#ffffff" } });
    const html = `<!doctype html><html lang="${lang}" dir="${lang === "ar" ? "rtl" : "ltr"}"><head><meta charset="utf-8"><title>${esc(order.number)}</title><style>
@page { size: 100mm 70mm; margin: 0; }
* { box-sizing: border-box; }
html, body { margin: 0; background: #fff; color: #000; }
body { width: 100mm; height: 70mm; padding: 4mm; font: 11px/1.35 Tahoma, "Segoe UI", Arial, sans-serif; display: flex; flex-direction: column; gap: 2mm; overflow: hidden; }
.top { display: flex; gap: 4mm; align-items: flex-start; }
.qr { width: 30mm; height: 30mm; flex: none; }
.qr svg, .bar svg { width: 100%; height: 100%; display: block; }
.who { min-width: 0; flex: 1; }
.brand { font-size: 9px; color: #333; }
.shop { font-size: 15px; font-weight: bold; margin: 0.5mm 0; }
.n { direction: ltr; unicode-bidi: isolate; white-space: nowrap; }
.code { font-size: 15px; font-weight: bold; letter-spacing: 2px; border: 1px solid #000; border-radius: 1.5mm; padding: 0.5mm 2mm; display: inline-block; margin-top: 1mm; }
.bar { height: 15mm; }
</style></head><body>
<div class="top"><div class="qr">${qr}</div><div class="who">
<div class="brand">${esc(brand.name)} · ${lang === "ar" ? "ملصق الشحنة" : "Shipment label"}</div>
<div class="shop">${esc(shop ?? "")}</div>${area ? `<div>${esc(area)}</div>` : ""}
<div><span class="n">${esc(order.number)}</span> · ${esc(num(order.lines.length))} ${lang === "ar" ? "مواد" : "items"}</div>
${rep ? `<div>${lang === "ar" ? "مندوب التوصيل" : "Delivery rep"}: <b>${esc(rep)}</b></div>` : ""}
<div class="code n">${esc(prettyCode(code))}</div>
</div></div>
<div class="bar">${code128Svg(code, { height: 60, stretch: true })}</div>
</body></html>`;
    printHtml(html);
  };
  return (
    <div className="no-print flex flex-wrap gap-2">
      {order && (
        <Button size="sm" variant="action" onClick={label} disabled={!code}>
          <Printer className="size-4" /> {tr("اطبع الملصق (QR والباركود)", "Print the label (QR and barcode)")}
        </Button>
      )}
      <Button size="sm" onClick={() => window.print()}>
        <FileText className="size-4" /> {tr("اطبع الصفحة", "Print the page")}
      </Button>
    </div>
  );
}
