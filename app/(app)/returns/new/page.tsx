"use client";

import { useAppRouter } from "@/lib/app-path";
import { useMemo, useState } from "react";
import { CheckCircle2, PackageCheck, PackageX } from "lucide-react";
import { useApp } from "@/components/shell";
import { Button, Card, CardHeader, Field, Money, Notice, PageHeader, Segmented, Select, Stepper, Textarea, errorText, useToast } from "@/components/ui";
import { api, ApiError } from "@/lib/api";
import type { Condition, Unit } from "@/lib/api/types";
import { useFmt } from "@/lib/i18n";
import { newClientRef } from "@/lib/offline";
import { useLoad } from "@/lib/use-load";
import { cn } from "@/lib/utils";

interface RLine {
  item_id: number;
  unit: Unit;
  qty: number;
  condition: Condition;
}

export default function NewReturnPage() {
  const { tr, money, date, qty: fmtQty, name } = useFmt();
  const { itemById } = useApp();
  const router = useAppRouter();
  const toast = useToast();
  const invoices = useLoad(() => api.listInvoices(), []);
  const customers = useLoad(() => api.listCustomers(), []);
  const [invoiceId, setInvoiceId] = useState<number | "">(() => (typeof window !== "undefined" ? Number(new URLSearchParams(window.location.search).get("invoice")) || "" : ""));
  const [customerId, setCustomerId] = useState<number | "">("");
  const [lines, setLines] = useState<Record<number, RLine>>({});
  const [note, setNote] = useState("");
  const [ref] = useState(newClientRef);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<Record<string, string>>({});

  const inv = invoices.data?.find((i) => i.id === invoiceId);
  const cid = inv?.customer_id ?? customerId;
  const custInvoices = (invoices.data ?? []).filter((i) => i.customer_id === cid && i.lines.some((l) => l.pieces > l.returned_pieces));

  // One row per item on the invoice: how many pieces can still come back, and their price per piece.
  const rows = useMemo(() => {
    if (!inv) return [];
    const m = new Map<number, { item_id: number; can: number; perPiece: number }>();
    for (const l of inv.lines) {
      const r = m.get(l.item_id) ?? { item_id: l.item_id, can: 0, perPiece: l.total / l.pieces };
      r.can += l.pieces - l.returned_pieces;
      m.set(l.item_id, r);
    }
    return [...m.values()];
  }, [inv]);

  const pieces = (l: RLine) => {
    const it = itemById.get(l.item_id);
    return it && l.unit === "carton" ? l.qty * it.pieces_per_carton : l.qty;
  };
  const chosen = Object.values(lines).filter((l) => l.qty > 0);
  const amount = chosen.reduce((s, l) => s + Math.round((rows.find((r) => r.item_id === l.item_id)?.perPiece ?? 0) * pieces(l)), 0);
  const setLine = (itemId: number, p: Partial<RLine>) =>
    setLines((x) => ({ ...x, [itemId]: { ...(x[itemId] ?? { item_id: itemId, unit: "piece", qty: 0, condition: "good" }), ...p } }));

  async function submit() {
    if (!inv || !chosen.length) return;
    setBusy(true);
    setErr({});
    try {
      const r = await api.createReturn({ client_ref: ref, invoice_id: inv.id, lines: chosen, note: note || undefined });
      toast("success", tr(`تم حفظ المرتجع ${money(r.amount)}`, `Return saved: ${money(r.amount)}`));
      router.push(`/returns/${r.id}`);
    } catch (e) {
      if (e instanceof ApiError && e.errors) setErr(e.errors);
      toast("danger", errorText(e, tr));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <PageHeader title={tr("مرتجع جديد", "New return")} back="/returns" />
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_340px]">
        <div className="space-y-4">
          <Card className="grid gap-3 p-4 sm:grid-cols-2">
            <Field label={tr("الزبون", "Customer")}>
              <Select
                value={cid}
                onChange={(e) => {
                  setCustomerId(Number(e.target.value) || "");
                  setInvoiceId("");
                  setLines({});
                }}
              >
                <option value="">{tr("اختر", "Choose")}</option>
                {(customers.data ?? []).map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label={tr("الفاتورة", "Invoice")} hint={tr("المرتجع دائماً على فاتورة، كي لا يُرجَع أكثر من المباع", "A return is always on an invoice, so no one returns more than was sold")}>
              <Select
                value={invoiceId}
                onChange={(e) => {
                  setInvoiceId(Number(e.target.value) || "");
                  setLines({});
                }}
                disabled={!cid}
              >
                <option value="">{tr("اختر الفاتورة", "Choose invoice")}</option>
                {custInvoices.map((i) => (
                  <option key={i.id} value={i.id}>
                    {i.number} · {date(i.date)} · {money(i.total)}
                  </option>
                ))}
              </Select>
            </Field>
          </Card>

          {inv && (
            <Card>
              <CardHeader title={tr("ماذا أُرجع؟", "What came back?")} subtitle={tr("اختر الكمية وحالة البضاعة لكل مادة", "Choose quantity and condition for each item")} />
              <ul className="divide-y divide-line">
                {rows.map((r) => {
                  const it = itemById.get(r.item_id);
                  const l = lines[r.item_id];
                  const p = l ? pieces(l) : 0;
                  const over = p > r.can;
                  const idx = chosen.findIndex((c) => c.item_id === r.item_id);
                  const serverErr = idx >= 0 ? err[`lines.${idx}.qty`] : undefined;
                  return (
                    <li key={r.item_id} className={cn("space-y-2 px-4 py-3", (over || serverErr) && "bg-danger-soft/40")}>
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <p className="font-medium">{name(it)}</p>
                          <p className="text-xs text-muted">
                            {tr("يمكن إرجاع حتى", "Can return up to")} {it && fmtQty(r.can, it.pieces_per_carton)} · {money(Math.round(r.perPiece))} / {tr("قطعة", "pc")}
                          </p>
                        </div>
                        {p > 0 && <Money value={Math.round(r.perPiece * p)} className="font-semibold" />}
                      </div>
                      {r.can > 0 ? (
                        <div className="flex flex-wrap items-center gap-2">
                          <Segmented
                            value={l?.unit ?? "piece"}
                            onChange={(u) => setLine(r.item_id, { unit: u })}
                            options={[
                              { value: "piece", label: tr("قطعة", "Piece") },
                              ...(it && r.can >= it.pieces_per_carton ? [{ value: "carton" as Unit, label: tr("كارتون", "Carton") }] : []),
                            ]}
                          />
                          <Stepper value={l?.qty ?? 0} onChange={(v) => setLine(r.item_id, { qty: v })} />
                          <Segmented
                            value={l?.condition ?? "good"}
                            onChange={(c) => setLine(r.item_id, { condition: c })}
                            options={[
                              { value: "good", label: <span className="flex items-center gap-1"><PackageCheck className="size-4" />{tr("سليم", "Good")}</span> },
                              { value: "damaged", label: <span className="flex items-center gap-1"><PackageX className="size-4" />{tr("تالف", "Damaged")}</span> },
                            ]}
                          />
                        </div>
                      ) : (
                        <p className="text-xs text-faint">{tr("أُرجعت الكمية كلها من قبل", "Everything was already returned")}</p>
                      )}
                      {(over || serverErr) && <p className="text-xs font-medium text-danger">{serverErr ?? tr("أكثر مما بيع في هذه الفاتورة", "More than was sold on this invoice")}</p>}
                    </li>
                  );
                })}
              </ul>
            </Card>
          )}
        </div>

        <Card className="self-start p-4">
          <h2 className="mb-3 font-semibold">{tr("الملخص", "Summary")}</h2>
          <div className="space-y-2 text-sm">
            {chosen.map((l) => (
              <div key={l.item_id} className="flex justify-between gap-2">
                <span>
                  {itemById.get(l.item_id)?.name} <span className={l.condition === "good" ? "text-success" : "text-danger"}>({l.condition === "good" ? tr("سليم", "good") : tr("تالف", "damaged")})</span>
                </span>
                <span className="num">{l.qty}</span>
              </div>
            ))}
          </div>
          <div className="mt-3 flex items-center justify-between border-t border-line pt-3">
            <span className="text-sm text-muted">{tr("يُخصم من دين الزبون", "Taken off the debt")}</span>
            <Money value={amount} className="text-xl font-bold" />
          </div>
          <Field label={tr("السبب / ملاحظة", "Reason / note")} className="mt-3">
            <Textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder={tr("مثلاً: تالف أثناء النقل", "e.g. damaged in transport")} />
          </Field>
          {chosen.some((l) => l.condition === "damaged") && (
            <div className="mt-3">
              <Notice tone="warning">{tr("التالف لا يعود إلى البيع، بل يُسجَّل في سجل التالف.", "Damaged goods won't be sold again; they go to the damaged log.")}</Notice>
            </div>
          )}
          <Button
            variant="action"
            size="lg"
            className="mt-4 w-full"
            loading={busy}
            disabled={!chosen.length || chosen.some((l) => pieces(l) > (rows.find((r) => r.item_id === l.item_id)?.can ?? 0))}
            onClick={submit}
          >
            <CheckCircle2 className="size-5" /> {tr("حفظ المرتجع", "Save return")}
          </Button>
        </Card>
      </div>
    </>
  );
}
