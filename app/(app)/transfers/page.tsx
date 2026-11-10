"use client";

import { useState } from "react";
import { ArrowLeftRight, Plus, Trash2 } from "lucide-react";
import { useApp } from "@/components/shell";
import { Button, Card, DataTable, Dialog, Empty, ErrorBox, Field, LoadingRows, Notice, PageHeader, Segmented, Select, Stepper, Textarea, errorText, useToast, type Column } from "@/components/ui";
import { api, ApiError } from "@/lib/api";
import type { Transfer, Unit } from "@/lib/api/types";
import { useFmt } from "@/lib/i18n";
import { newClientRef } from "@/lib/offline";
import { useLoad } from "@/lib/use-load";

export default function TransfersPage() {
  const { tr, dateTime, name, qty } = useFmt();
  const { lookups, itemById } = useApp();
  const list = useLoad(() => api.listTransfers(), []);
  const [open, setOpen] = useState(false);
  const wName = (id: number) => name(lookups.warehouses.find((w) => w.id === id));
  const columns: Column<Transfer>[] = [
    { key: "n", head: tr("الرقم", "No."), cell: (t) => <span className="num">{t.number}</span> },
    { key: "d", head: tr("الوقت", "Time"), cell: (t) => dateTime(t.created_at) },
    { key: "f", head: tr("من ← إلى", "From → to"), cell: (t) => `${wName(t.from_warehouse_id)} ${tr("←", "→")} ${wName(t.to_warehouse_id)}` },
    { key: "l", head: tr("المواد", "Items"), cell: (t) => t.lines.map((l) => `${itemById.get(l.item_id)?.name} (${qty(l.pieces, itemById.get(l.item_id)?.pieces_per_carton ?? 1)})`).join("، ") },
    { key: "b", head: tr("بواسطة", "By"), cell: (t) => t.created_by.name },
  ];
  return (
    <>
      <PageHeader
        title={tr("التحويل بين المخازن", "Transfers between warehouses")}
        subtitle={tr("التحويل يتم كاملاً أو لا يتم أبداً، فلا تضيع البضاعة ولا تُحسب مرتين", "A transfer happens fully or not at all, so goods are never lost or counted twice")}
        actions={
          <Button variant="action" onClick={() => setOpen(true)}>
            <Plus className="size-4" /> {tr("تحويل جديد", "New transfer")}
          </Button>
        }
      />
      <Card>
        {list.state.status === "loading" ? (
          <LoadingRows />
        ) : list.state.status === "error" ? (
          <ErrorBox error={list.state.error} onRetry={list.reload} />
        ) : (
          <DataTable rows={list.data ?? []} columns={columns} rowKey={(t) => t.id} empty={<Empty icon={<ArrowLeftRight className="size-6" />} title={tr("لا يوجد تحويل بعد", "No transfers yet")} />} />
        )}
      </Card>
      {open && <TransferDialog onClose={() => setOpen(false)} onDone={list.reload} />}
    </>
  );
}

function TransferDialog({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const { tr, name, qty } = useFmt();
  const { user, lookups, items, itemById, reloadItems } = useApp();
  const toast = useToast();
  const [from, setFrom] = useState(user.warehouse_id ?? lookups.warehouses[0].id);
  const [to, setTo] = useState(lookups.warehouses.find((w) => w.id !== (user.warehouse_id ?? lookups.warehouses[0].id))?.id ?? lookups.warehouses[1].id);
  const [lines, setLines] = useState<{ item_id: number | ""; unit: Unit; qty: number }[]>([{ item_id: "", unit: "carton", qty: 1 }]);
  const [note, setNote] = useState("");
  const [ref] = useState(newClientRef);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<Record<string, string>>({});
  const avail = (id: number) => itemById.get(id)?.stock.by_warehouse.find((w) => w.warehouse_id === from)?.qty ?? 0;

  async function save() {
    setBusy(true);
    setErr({});
    try {
      const t = await api.createTransfer({
        client_ref: ref,
        from_warehouse_id: from,
        to_warehouse_id: to,
        lines: lines.filter((l) => l.item_id && l.qty > 0).map((l) => ({ item_id: l.item_id as number, unit: l.unit, qty: l.qty })),
        note: note || undefined,
      });
      toast("success", tr(`تم التحويل ${t.number}`, `Transfer ${t.number} done`));
      reloadItems();
      onDone();
      onClose();
    } catch (e) {
      if (e instanceof ApiError && e.errors) setErr(e.errors);
      toast("danger", errorText(e, tr));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog
      open
      wide
      onClose={onClose}
      title={tr("تحويل جديد", "New transfer")}
      footer={
        <>
          <Button onClick={onClose}>{tr("إلغاء", "Cancel")}</Button>
          <Button variant="action" loading={busy} onClick={save} disabled={from === to || !lines.some((l) => l.item_id)}>
            {tr("تنفيذ التحويل", "Make transfer")}
          </Button>
        </>
      }
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label={tr("من مخزن", "From")}>
          <Select value={from} onChange={(e) => setFrom(Number(e.target.value))} disabled={user.role === "warehouse"}>
            {lookups.warehouses.map((w) => (
              <option key={w.id} value={w.id}>
                {name(w)}
              </option>
            ))}
          </Select>
        </Field>
        <Field label={tr("إلى مخزن", "To")} error={err.to_warehouse_id ?? (from === to ? tr("اختر مخزناً مختلفاً", "Choose another warehouse") : undefined)}>
          <Select value={to} onChange={(e) => setTo(Number(e.target.value))}>
            {lookups.warehouses.map((w) => (
              <option key={w.id} value={w.id}>
                {name(w)}
              </option>
            ))}
          </Select>
        </Field>
      </div>
      <div className="mt-4 space-y-3">
        {lines.map((l, i) => {
          const it = l.item_id ? itemById.get(l.item_id) : undefined;
          return (
            <div key={i} className="rounded-xl border border-line p-3">
              <div className="flex gap-2">
                <Select value={l.item_id} onChange={(e) => setLines((x) => x.map((y, j) => (j === i ? { ...y, item_id: Number(e.target.value) || "" } : y)))}>
                  <option value="">{tr("اختر المادة", "Choose item")}</option>
                  {items
                    .filter((x) => x.active && avail(x.id) > 0)
                    .map((x) => (
                      <option key={x.id} value={x.id}>
                        {name(x)} ({qty(avail(x.id), x.pieces_per_carton)})
                      </option>
                    ))}
                </Select>
                {lines.length > 1 && (
                  <button type="button" aria-label={tr("حذف", "Remove")} onClick={() => setLines((x) => x.filter((_, j) => j !== i))} className="flex size-11 shrink-0 items-center justify-center rounded-xl text-faint hover:bg-danger-soft hover:text-danger">
                    <Trash2 className="size-4" />
                  </button>
                )}
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <Segmented
                  value={l.unit}
                  onChange={(u) => setLines((x) => x.map((y, j) => (j === i ? { ...y, unit: u } : y)))}
                  options={[
                    { value: "carton", label: tr("كارتون", "Carton") },
                    { value: "piece", label: tr("قطعة", "Piece") },
                  ]}
                />
                <Stepper value={l.qty} min={0} onChange={(v) => setLines((x) => x.map((y, j) => (j === i ? { ...y, qty: v } : y)))} />
                {it && <span className="text-xs text-muted">{tr("المتوفر", "Available")} {qty(avail(it.id), it.pieces_per_carton)}</span>}
              </div>
              {err[`lines.${i}.qty`] && <p className="mt-1 text-xs text-danger">{err[`lines.${i}.qty`]}</p>}
            </div>
          );
        })}
        <Button size="sm" onClick={() => setLines((x) => [...x, { item_id: "", unit: "carton", qty: 1 }])}>
          <Plus className="size-4" /> {tr("مادة أخرى", "Another item")}
        </Button>
        <Field label={tr("ملاحظة", "Note")}>
          <Textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} />
        </Field>
        <Notice tone="primary">{tr("الدفعات تنتقل بتاريخ صلاحيتها وسعر شرائها نفسه.", "Batches move with the same expiry date and cost.")}</Notice>
      </div>
    </Dialog>
  );
}
