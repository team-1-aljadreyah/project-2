"use client";

// Receipts for the small thermal printer (80 mm or 58 mm paper): the counter sale, a payment (وصل قبض) and the
// driver's delivery. A preview at the paper's width, then «اطبع»: the receipt alone goes to the printer (its own
// page in a hidden frame, sized to the roll), with a QR code that opens the invoice / payment / order.
// The paper width is kept on each device (the shop's printer is 80, the rep's pocket printer is often 58).
import { useEffect, useState, useSyncExternalStore } from "react";
import { Printer, ReceiptText } from "lucide-react";
import { Button, Dialog, Segmented } from "@/components/ui";
import { useFmt } from "@/lib/i18n";

export type Paper = "80" | "58";

export interface ReceiptData {
  /** «فاتورة بيع» / «وصل قبض» / «إيصال تسليم» */
  title: string;
  number: string;
  date: string;
  /** Lines of «name: value» under the title (the shop, the buyer, who received…). */
  info: [string, string][];
  /** Items: name, amount text, line total. */
  lines?: { name: string; qty: string; total: string }[];
  totals: [string, string, boolean?][];
  /** The page the QR opens (a path on this site). */
  qr: string;
  footer?: string;
}

const KEY = "nahrain.paper";
const EVENT = "nahrain-paper";
function readPaper(): Paper {
  try {
    return localStorage.getItem(KEY) === "58" ? "58" : "80";
  } catch {
    return "80";
  }
}
export function setPaper(p: Paper) {
  try {
    localStorage.setItem(KEY, p);
  } catch {}
  window.dispatchEvent(new Event(EVENT));
}
/** This device's receipt paper (80 mm unless set to 58). */
export function usePaper(): Paper {
  return useSyncExternalStore(
    (cb) => {
      window.addEventListener(EVENT, cb);
      window.addEventListener("storage", cb);
      return () => {
        window.removeEventListener(EVENT, cb);
        window.removeEventListener("storage", cb);
      };
    },
    readPaper,
    () => "80" as Paper,
  );
}

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

/** The receipt as its own small page (the same markup for the preview and the printer). */
function receiptHtml(r: ReceiptData, paper: Paper, company: string, qrSvg: string, lang: "ar" | "en") {
  const w = paper === "80" ? 72 : 48;
  const small = paper === "58";
  const rows = (list: [string, string, boolean?][]) => list.map(([k, v, bold]) => `<div class="row${bold ? " b" : ""}"><span>${esc(k)}</span><span class="n">${esc(v)}</span></div>`).join("");
  return `<!doctype html><html lang="${lang}" dir="${lang === "ar" ? "rtl" : "ltr"}"><head><meta charset="utf-8"><title>${esc(r.number)}</title><style>
@page { size: ${paper}mm auto; margin: 0; }
* { box-sizing: border-box; }
html, body { margin: 0; background: #fff; color: #000; }
body { width: ${w}mm; padding: 3mm ${paper === "80" ? 4 : 5}mm; font: ${small ? 10 : 11.5}px/1.45 Tahoma, "Segoe UI", Arial, sans-serif; }
.c { text-align: center; }
h1 { font-size: ${small ? 13 : 15}px; margin: 0; }
h2 { font-size: ${small ? 11 : 12.5}px; margin: 2mm 0 0; }
.muted { color: #333; }
.hr { border-top: 1px dashed #000; margin: 2mm 0; }
.row { display: flex; justify-content: space-between; gap: 2mm; }
.row span:first-child { min-width: 0; overflow-wrap: anywhere; }
.n { white-space: nowrap; direction: ltr; unicode-bidi: isolate; }
.b { font-weight: bold; font-size: ${small ? 11.5 : 13}px; }
.item { margin-bottom: 1mm; }
.item .q { color: #333; font-size: ${small ? 9 : 10}px; }
.qr { width: ${small ? 22 : 26}mm; margin: 2mm auto 0; }
.qr svg { width: 100%; height: auto; display: block; }
</style></head><body>
<div class="c"><h1>${esc(company)}</h1><h2>${esc(r.title)}</h2><div class="n muted">${esc(r.number)}</div><div class="muted">${esc(r.date)}</div></div>
<div class="hr"></div>
${rows(r.info.map(([k, v]) => [k, v]))}
${r.lines?.length ? `<div class="hr"></div>${r.lines.map((l) => `<div class="item"><div class="row"><span>${esc(l.name)}</span><span class="n">${esc(l.total)}</span></div><div class="q">${esc(l.qty)}</div></div>`).join("")}` : ""}
<div class="hr"></div>
${rows(r.totals)}
<div class="hr"></div>
<div class="qr">${qrSvg}</div>
<div class="c muted" style="font-size:${small ? 8.5 : 9.5}px">${lang === "ar" ? "امسح الرمز لترى التفاصيل" : "Scan for the details"}</div>
${r.footer ? `<div class="c" style="margin-top:2mm">${esc(r.footer)}</div>` : ""}
</body></html>`;
}

/** Print a page in a hidden frame (only that page goes to the printer, not the screen around it). */
export function printHtml(html: string) {
  const f = document.createElement("iframe");
  f.setAttribute("aria-hidden", "true");
  f.style.cssText = "position:fixed;inset-inline-end:0;bottom:0;width:0;height:0;border:0;visibility:hidden";
  document.body.appendChild(f);
  const doc = f.contentDocument!;
  doc.open();
  doc.write(html);
  doc.close();
  const go = () => {
    f.contentWindow?.focus();
    f.contentWindow?.print();
    setTimeout(() => f.remove(), 60_000);
  };
  // Wait for the fonts of the frame (Arabic shaping) before printing.
  setTimeout(go, 250);
}

/** «إيصال حراري»: a button that opens the preview and prints. */
export function ThermalReceiptButton({ build, company, size, label }: { build: () => ReceiptData; company: string; size?: "sm"; label?: string }) {
  const { tr } = useFmt();
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button size={size} onClick={() => setOpen(true)}>
        <ReceiptText className="size-4" /> {label ?? tr("إيصال حراري", "Thermal receipt")}
      </Button>
      {open && <ReceiptDialog data={build()} company={company} onClose={() => setOpen(false)} />}
    </>
  );
}

function ReceiptDialog({ data, company, onClose }: { data: ReceiptData; company: string; onClose: () => void }) {
  const { tr, lang } = useFmt();
  const paper = usePaper();
  const [qr, setQr] = useState("");
  useEffect(() => {
    let alive = true;
    import("qrcode").then((QR) =>
      QR.toString(new URL(data.qr, window.location.origin).href, { type: "svg", margin: 0, errorCorrectionLevel: "M", color: { dark: "#000000", light: "#ffffff" } }).then((svg) => alive && setQr(svg)),
    );
    return () => {
      alive = false;
    };
  }, [data.qr]);
  const html = receiptHtml(data, paper, company, qr, lang);
  return (
    <Dialog
      open
      onClose={onClose}
      title={tr("إيصال للطابعة الحرارية", "Receipt for the thermal printer")}
      footer={
        <Button variant="action" className="w-full" disabled={!qr} onClick={() => printHtml(html)}>
          <Printer className="size-4" /> {tr("اطبع", "Print")}
        </Button>
      }
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm text-muted">{tr("عرض الورق (يُحفظ على هذا الجهاز)", "Paper width (kept on this device)")}</span>
        <Segmented
          value={paper}
          onChange={setPaper}
          options={[
            { value: "80", label: tr("80 ملم", "80 mm") },
            { value: "58", label: tr("58 ملم", "58 mm") },
          ]}
        />
      </div>
      {/* The preview: the same page the printer gets, at its width (1 mm ≈ 3.78 px). */}
      <div className="mt-4 flex justify-center rounded-2xl bg-card-2 p-4">
        <iframe title={tr("معاينة الإيصال", "Receipt preview")} srcDoc={html} className="rounded bg-white shadow-lg" style={{ width: `${Number(paper) * 3.78}px`, height: "28rem", border: 0 }} />
      </div>
    </Dialog>
  );
}
