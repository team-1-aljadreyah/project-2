"use client";

import { useState } from "react";
import { CheckCircle2, Save } from "lucide-react";
import { useApp } from "@/components/shell";
import { Badge, Button, Card, ErrorBox, Input, LoadingRows, Notice, PageHeader, SearchBox, Segmented, errorText, useToast } from "@/components/ui";
import { api, ApiError } from "@/lib/api";
import type { StocktakeLine } from "@/lib/api/types";
import { useFmt } from "@/lib/i18n";
import { useLoad } from "@/lib/use-load";
import { cn, matches, useIdParam } from "@/lib/utils";

export default function StocktakeView() {
  const id = useIdParam();
  const { tr, name, qty, dateTime } = useFmt();
  const { user, lookups, itemById, reloadItems } = useApp();
  const toast = useToast();
  const st = useLoad(() => api.getStocktake(id), [id]);
  const [edits, setEdits] = useState<StocktakeLine[] | null>(null);
  const [q, setQ] = useState("");
  const [f, setF] = useState<"all" | "todo" | "diff">("all");
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<Record<string, string>>({});

  if (st.state.status === "loading") return <LoadingRows />;
  if (st.state.status === "error" || !st.data) return <ErrorBox error={st.state.status === "error" ? st.state.error : null} />;
  const s = st.data;
  // Edits stay on screen (lines); until the first edit, the saved count is shown.
  const lines = edits ?? s.lines;
  const open = s.status === "open";
  const set = (itemId: number, p: Partial<StocktakeLine>) => setEdits((ls) => (ls ?? s.lines).map((l) => (l.item_id === itemId ? { ...l, ...p } : l)));
  const diff = (l: StocktakeLine) => (l.counted_qty === null ? 0 : l.counted_qty - l.system_qty);
  const rows = lines.filter((l) => {
    const it = itemById.get(l.item_id);
    if (!matches(q, it?.name, it?.name_en, it?.barcode)) return false;
    if (f === "todo") return l.counted_qty === null;
    if (f === "diff") return diff(l) !== 0;
    return true;
  });
  const done = lines.filter((l) => l.counted_qty !== null).length;

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
      <PageHeader
        back="/stocktakes"
        title={
          <span className="flex items-center gap-2">
            {tr("جرد", "Count")} <span className="num">{s.number}</span> {open ? <Badge tone="primary">{tr("مفتوح", "Open")}</Badge> : <Badge tone="success">{tr("مغلق", "Closed")}</Badge>}
          </span>
        }
        subtitle={`${name(lookups.warehouses.find((w) => w.id === s.warehouse_id))} · ${dateTime(s.created_at)}${s.closed_by ? ` · ${tr("أغلقه", "closed by")} ${s.closed_by.name}` : ""}`}
        actions={
          open && (
            <>
              <Button loading={busy === "save"} onClick={() => save(false)}>
                <Save className="size-4" /> {tr("حفظ العد", "Save count")}
              </Button>
              {user.role === "manager" && (
                <Button variant="action" loading={busy === "close"} onClick={() => save(true)}>
                  <CheckCircle2 className="size-4" /> {tr("إغلاق الجرد وتعديل المخزون", "Close and update stock")}
                </Button>
              )}
            </>
          )
        }
      />
      {open && user.role !== "manager" && (
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
          <SearchBox value={q} onChange={setQ} placeholder={tr("ابحث عن مادة", "Search item")} className="lg:w-64" />
        </div>
        <div className="h-1.5 bg-line">
          <div className="h-full bg-success transition-all" style={{ width: `${(done / Math.max(1, lines.length)) * 100}%` }} />
        </div>
        <ul className="divide-y divide-line">
          {rows.map((l) => {
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
      </Card>
    </>
  );
}
