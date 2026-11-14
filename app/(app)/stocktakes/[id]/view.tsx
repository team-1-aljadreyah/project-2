"use client";

import { BarcodeScanner, ScanButton } from "@/components/barcode-scanner";

import { useState } from "react";
import { flushSync } from "react-dom";
import { CheckCircle2, ClipboardList, Printer, Save } from "lucide-react";
import { useApp } from "@/components/shell";
import { Badge, Button, Card, ErrorBox, Input, LoadingRows, Notice, PageHeader, SearchBox, Segmented, errorText, useToast, Pager, usePages } from "@/components/ui";
import { api, ApiError } from "@/lib/api";
import type { Item, Stocktake, StocktakeLine } from "@/lib/api/types";
import { useBrand } from "@/lib/site";
import { useFmt } from "@/lib/i18n";
import { useLoad } from "@/lib/use-load";
import { cn, matches, useIdParam } from "@/lib/utils";
import { useMay } from "@/lib/use-rules";

export default function StocktakeView() {
  const id = useIdParam();
  const { tr, name, qty, dateTime } = useFmt();
  const { lookups, itemById, reloadItems } = useApp();
  const may = useMay();
  const toast = useToast();
  const st = useLoad(() => api.getStocktake(id), [id]);
  const [edits, setEdits] = useState<StocktakeLine[] | null>(null);
  const [q, setQ] = useState("");
  const [scanning, setScanning] = useState(false);
  const [f, setF] = useState<"all" | "todo" | "diff">("all");
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<Record<string, string>>({});
  // What goes on paper: the count as it is (with the system's quantities and the differences), or a sheet to
  // count by hand (no system quantities, empty boxes to write in).
  const [paper, setPaper] = useState<"report" | "blank">("report");

  // The pages of the list (before the "loading" screen: React needs the same hooks on every render).
  const pg = usePages(
    (edits ?? st.data?.lines ?? []).filter((l) => {
      const it = itemById.get(l.item_id);
      if (!matches(q, it?.name, it?.name_en, it?.barcode)) return false;
      if (f === "todo") return l.counted_qty === null;
      if (f === "diff") return l.counted_qty !== null && l.counted_qty !== l.system_qty;
      return true;
    }),
    25,
  );
  if (st.state.status === "loading") return <LoadingRows />;
  if (st.state.status === "error" || !st.data) return <ErrorBox error={st.state.status === "error" ? st.state.error : null} />;
  const s = st.data;
  // Edits stay on screen (lines); until the first edit, the saved count is shown.
  const lines = edits ?? s.lines;
  const open = s.status === "open";
  const set = (itemId: number, p: Partial<StocktakeLine>) => setEdits((ls) => (ls ?? s.lines).map((l) => (l.item_id === itemId ? { ...l, ...p } : l)));
  const diff = (l: StocktakeLine) => (l.counted_qty === null ? 0 : l.counted_qty - l.system_qty);
  const done = lines.filter((l) => l.counted_qty !== null).length;
  // The sheet is drawn for the chosen kind first, then the browser's print window opens.
  const print = (kind: "report" | "blank") => {
    flushSync(() => setPaper(kind));
    window.print();
  };

  async function save(close: boolean) {
    setBusy(close ? "close" : "save");
    setErr({});
    try {
      await api.saveStocktake(s.id, lines);
      if (close) {
        await api.closeStocktake(s.id);
        reloadItems();
        toast("success", tr("أُغلق الجرد وعُدّل المخزون، وحُفظت الفروقات مع أسبابها", "Count closed. Stock updated and differences saved with reasons"));
      } else toast("success", tr("تم حفظ العد", "Count saved"));
      st.reload();
      setEdits(null);
    } catch (e) {
      if (e instanceof ApiError && e.errors) setErr(e.errors);
      toast("danger", errorText(e, tr));
    } finally {
      setBusy(null);
    }
  }

  return (
    <>
      {/* On paper the sheet has its own header. */}
      <div className="print:hidden">
      <PageHeader
        back="/stocktakes"
        title={
          <span className="flex items-center gap-2">
            {tr("جرد", "Count")} <span className="num">{s.number}</span> {open ? <Badge tone="primary">{tr("مفتوح", "Open")}</Badge> : <Badge tone="success">{tr("مغلق", "Closed")}</Badge>}
          </span>
        }
        subtitle={`${name(lookups.warehouses.find((w) => w.id === s.warehouse_id))} · ${dateTime(s.created_at)}${s.closed_by ? ` · ${tr("أغلقه", "closed by")} ${s.closed_by.name}` : ""}`}
        actions={
          <>
            <Button onClick={() => print("report")}>
              <Printer className="size-4" /> {tr("طباعة", "Print")}
            </Button>
            {open && (
              <>
                <Button onClick={() => print("blank")}>
                  <ClipboardList className="size-4" /> {tr("ورقة عدّ فارغة", "Blank count sheet")}
                </Button>
                <Button loading={busy === "save"} onClick={() => save(false)}>
                  <Save className="size-4" /> {tr("حفظ العد", "Save count")}
                </Button>
                {may("close_stocktake") && (
                  <Button variant="action" loading={busy === "close"} onClick={() => save(true)}>
                    <CheckCircle2 className="size-4" /> {tr("إغلاق الجرد وتعديل المخزون", "Close and update stock")}
                  </Button>
                )}
              </>
            )}
          </>
        }
      />
      </div>
      <CountSheet s={s} lines={lines} kind={paper} />
      <div className="print:hidden">
      {open && !may("close_stocktake") && (
        <div className="mb-4">
          <Notice tone="primary">{tr("بعد انتهاء العد، يغلق المدير الجرد لتُعدَّل الكميات.", "When you finish counting, the manager closes the count to update the stock.")}</Notice>
        </div>
      )}
      {Object.keys(err).length > 0 && (
        <div className="mb-4">
          <Notice tone="danger">{tr("أكمل عد كل المواد واكتب سبب كل فرق", "Count every item and write a reason for every difference")}</Notice>
        </div>
      )}
      <Card>
        <div className="flex flex-col gap-3 border-b border-line p-3 lg:flex-row lg:items-center lg:justify-between">
          <Segmented
            value={f}
            onChange={setF}
            options={[
              { value: "all", label: tr("الكل", "All"), count: lines.length },
              { value: "todo", label: tr("لم يُعد", "Not counted"), count: lines.length - done },
              { value: "diff", label: tr("فيها فرق", "Differences"), count: lines.filter((l) => diff(l) !== 0).length },
            ]}
          />
          <div className="flex gap-2">
            <SearchBox value={q} onChange={setQ} placeholder={tr("ابحث عن مادة أو امسح الباركود", "Search an item or scan")} className="lg:w-64" />
            <ScanButton onClick={() => setScanning(true)} />
          </div>
          {scanning && (
            <BarcodeScanner
              onClose={() => setScanning(false)}
              onCode={(code) => {
                // The scanned item alone in the list, and its count box ready to type in.
                setQ(code);
                setScanning(false);
                setTimeout(() => document.querySelector<HTMLInputElement>("[data-count]")?.focus(), 200);
              }}
            />
          )}
        </div>
        <div className="h-1.5 bg-line">
          <div className="h-full bg-success transition-all" style={{ width: `${(done / Math.max(1, lines.length)) * 100}%` }} />
        </div>
        <ul className="divide-y divide-line">
          {pg.shown.map((l) => {
            const it = itemById.get(l.item_id);
            const ppc = it?.pieces_per_carton ?? 1;
            const d = diff(l);
            const e = err[`item.${l.item_id}`];
            return (
              <li key={l.item_id} className={cn("grid gap-3 px-4 py-3 md:grid-cols-[1.4fr_1fr_1.2fr_1.6fr] md:items-center", e && "bg-danger-soft/40")}>
                <div>
                  <p className="font-medium">{name(it)}</p>
                  <p className="text-xs text-muted">
                    {tr("في النظام", "System")}: {qty(l.system_qty, ppc)}
                  </p>
                </div>
                <div>
                  <label className="text-xs text-muted">{tr("الموجود على الرف (قطعة)", "On the shelf (pieces)")}</label>
                  <Input
                    data-count
                    inputMode="numeric"
                    dir="ltr"
                    disabled={!open}
                    className="num mt-1 text-start"
                    placeholder="—"
                    value={l.counted_qty ?? ""}
                    onChange={(ev) => {
                      const v = ev.target.value.replace(/[^\d]/g, "");
                      set(l.item_id, { counted_qty: v === "" ? null : Number(v) });
                    }}
                  />
                </div>
                <div className="text-sm">
                  {l.counted_qty === null ? (
                    <span className="text-faint">{tr("لم يُعد بعد", "Not counted")}</span>
                  ) : d === 0 ? (
                    <Badge tone="success">{tr("مطابق", "Matches")}</Badge>
                  ) : (
                    <Badge tone={d < 0 ? "danger" : "warning"}>
                      {d < 0 ? tr("نقص", "Short") : tr("زيادة", "Extra")} {qty(Math.abs(d), ppc)}
                    </Badge>
                  )}
                  {open && l.counted_qty === null && (
                    <button type="button" className="ms-2 text-xs text-primary-ink underline" onClick={() => set(l.item_id, { counted_qty: l.system_qty })}>
                      {tr("نفس النظام", "Same as system")}
                    </button>
                  )}
                </div>
                <div>
                  {d !== 0 && (
                    <>
                      <Input disabled={!open} value={l.reason ?? ""} onChange={(ev) => set(l.item_id, { reason: ev.target.value })} placeholder={tr("سبب الفرق (مطلوب)", "Reason (required)")} invalid={!!e} />
                      {e && <p className="mt-1 text-xs text-danger">{e}</p>}
                    </>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
        <Pager {...pg} className="border-t border-line" />
      </Card>
      </div>
    </>
  );
}

/** The count on paper (shown only when printing): every item on one table, not page by page. */
function CountSheet({ s, lines, kind }: { s: Stocktake; lines: StocktakeLine[]; kind: "report" | "blank" }) {
  const { tr, name, qty, dateTime, num, unit } = useFmt();
  const { lookups, itemById } = useApp();
  const brand = useBrand();
  const blank = kind === "blank";
  const rows = lines.map((l) => ({ l, it: itemById.get(l.item_id) })).sort((a, b) => (a.it?.category ?? "").localeCompare(b.it?.category ?? "") || name(a.it).localeCompare(name(b.it)));
  const counted = lines.filter((l) => l.counted_qty !== null).length;
  const diffs = lines.filter((l) => l.counted_qty !== null && l.counted_qty !== l.system_qty).length;
  const pcs = (n: number, it?: Item) => (it && it.pieces_per_carton > 1 ? `${num(n)} (${qty(n, it.pieces_per_carton, it)})` : num(n));
  const cell = "border border-black/40 px-2 py-1.5 align-top";
  return (
    <div className="hidden text-[12px] text-black print:block">
      <div className="mb-3 flex items-start justify-between gap-4 border-b-2 border-black pb-2">
        <div>
          <p className="text-base font-bold">{brand.company}</p>
          <p className="text-lg font-bold">
            {blank ? tr("ورقة عدّ", "Count sheet") : tr("تقرير جرد", "Stock count report")} <span className="num">{s.number}</span>
          </p>
        </div>
        <div className="text-end">
          <p>
            {tr("المخزن", "Warehouse")}: <b>{name(lookups.warehouses.find((w) => w.id === s.warehouse_id))}</b>
            {s.category && <> · {tr("الصنف", "Category")}: <b>{s.category}</b></>}
          </p>
          <p>
            {tr("فُتح", "Opened")}: <span className="num">{dateTime(s.created_at)}</span> · {s.created_by.name}
          </p>
          {s.closed_at && (
            <p>
              {tr("أُغلق", "Closed")}: <span className="num">{dateTime(s.closed_at)}</span>
              {s.closed_by && <> · {s.closed_by.name}</>}
            </p>
          )}
          {!blank && (
            <p>
              {tr(`عُدّ ${num(counted)} من ${num(lines.length)} · فيها فرق ${num(diffs)}`, `${num(counted)} of ${num(lines.length)} counted · ${num(diffs)} with a difference`)}
            </p>
          )}
        </div>
      </div>
      <table className="w-full border-collapse">
        <thead>
          <tr className="bg-black/5 text-start">
            <th className={`${cell} w-8`}>#</th>
            <th className={cell}>{tr("المادة", "Item")}</th>
            {!blank && <th className={cell}>{tr("في النظام (قطعة)", "System (pcs)")}</th>}
            <th className={cell}>{tr("المعدود على الرف (قطعة)", "Counted on the shelf (pcs)")}</th>
            {!blank && <th className={cell}>{tr("الفرق", "Difference")}</th>}
            <th className={cell}>{blank ? tr("ملاحظة", "Note") : tr("السبب", "Reason")}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(({ l, it }, i) => {
            const d = l.counted_qty === null ? null : l.counted_qty - l.system_qty;
            return (
              <tr key={l.item_id} className="break-inside-avoid">
                <td className={`${cell} num`}>{i + 1}</td>
                <td className={cell}>
                  <b>{name(it)}</b>
                  <span className="block text-[10px]">
                    {it?.category}
                    {it && it.pieces_per_carton > 1 && <> · {`${unit(it, "carton")} = ${it.pieces_per_carton} ${unit(it, "piece")}`}</>}
                    {it?.barcode && <> · <span className="num">{it.barcode}</span></>}
                  </span>
                </td>
                {!blank && <td className={`${cell} num`}>{pcs(l.system_qty, it)}</td>}
                <td className={`${cell} num ${blank ? "h-9 w-40" : ""}`}>{!blank && l.counted_qty !== null ? pcs(l.counted_qty, it) : ""}</td>
                {!blank && (
                  <td className={`${cell} num font-bold`}>
                    {d === null ? "—" : d === 0 ? tr("مطابق", "Matches") : `${d < 0 ? tr("نقص", "Short") : tr("زيادة", "Extra")} ${num(Math.abs(d))}`}
                  </td>
                )}
                <td className={`${cell} ${blank ? "w-48" : ""}`}>{!blank ? (l.reason ?? "") : ""}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <div className="mt-8 grid grid-cols-3 gap-6 text-center break-inside-avoid">
        {[tr("العادّ", "Counted by"), tr("أمين المخزن", "Warehouse keeper"), tr("المدير", "Manager")].map((t) => (
          <div key={t}>
            <p className="border-b border-black pb-8">{t}</p>
            <p className="mt-1 text-[10px]">{tr("الاسم والتوقيع والتاريخ", "Name, signature, date")}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
