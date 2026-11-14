"use client";

import { useState } from "react";
import { ArrowLeftRight, Plus, Trash2 } from "lucide-react";
import { useApp } from "@/components/shell";
import { useMyWarehouses, useWarehouseFilter } from "@/components/warehouse-filter";
import {
  Badge,
  Button,
  Card,
  DataTable,
  Dialog,
  Empty,
  ErrorBox,
  Field,
  LoadingRows,
  Notice,
  PageHeader,
  Segmented,
  Select,
  Stepper,
  Textarea,
  errorText,
  useToast,
  type Column,
} from "@/components/ui";
import { api, ApiError } from "@/lib/api";
import type { Transfer, Unit } from "@/lib/api/types";
import { useFmt } from "@/lib/i18n";
import { unitName } from "@/lib/units";
import { newClientRef } from "@/lib/offline";
import { useLoad } from "@/lib/use-load";
import { useMay } from "@/lib/use-rules";

export default function TransfersPage() {
  const { tr, dateTime, name, qty } = useFmt();
  const { user, lookups, itemById } = useApp();
  const may = useMay();
  const toast = useToast();
  const list = useLoad(() => api.listTransfers(), []);
  const [receiving, setReceiving] = useState<Transfer | null>(null);
  const wh = useWarehouseFilter();
  const [open, setOpen] = useState(false);
  const wName = (id: number) => name(lookups.warehouses.find((w) => w.id === id));
  /** A transfer on the road that this person may receive (the manager, or the keeper it goes to). */
  const mine = useMyWarehouses();
  const canReceive = (t: Transfer) => t.status === "sent" && (user.role === "manager" || (user.role === "warehouse" && (!mine || mine.includes(t.to_warehouse_id))));
  const columns: Column<Transfer>[] = [
    { key: "n", head: tr("الرقم", "No."), cell: (t) => <span className="num">{t.number}</span> },
    { key: "d", head: tr("الوقت", "Time"), cell: (t) => dateTime(t.created_at) },
    { key: "f", head: tr("من ← إلى", "From → to"), cell: (t) => `${wName(t.from_warehouse_id)} ${tr("←", "→")} ${wName(t.to_warehouse_id)}` },
    { key: "l", head: tr("المواد", "Items"), cell: (t) => t.lines.map((l) => `${itemById.get(l.item_id)?.name} (${qty(l.pieces, itemById.get(l.item_id)?.pieces_per_carton ?? 1, itemById.get(l.item_id))})`).join("، ") },
    { key: "b", head: tr("بواسطة", "By"), cell: (t) => t.created_by.name },
    {
      key: "s",
      head: tr("الحالة", "Status"),
      cell: (t) =>
        !t.status || t.status === "received" ? (
          <Badge tone="success">{tr("استُلم", "Received")}</Badge>
        ) : t.status === "sent" ? (
          <Badge tone="warning">{tr("في الطريق", "On the road")}</Badge>
        ) : (
          <span title={t.diff_reason}>
            <Badge tone="danger">{t.reviewed_by ? tr("فرق · روجع", "Short · reviewed") : tr("وصل ناقصاً", "Arrived short")}</Badge>
          </span>
        ),
    },
    {
      key: "a",
      head: "",
      align: "end",
      cell: (t) =>
        canReceive(t) ? (
          <Button size="sm" variant="action" onClick={() => setReceiving(t)}>
            {tr("استلام", "Receive")}
          </Button>
        ) : t.status === "partial" && !t.reviewed_by && may("review_transfer") ? (
          <Button
            size="sm"
            onClick={async () => {
              try {
                await api.reviewTransfer(t.id);
                list.reload();
              } catch (e) {
                toast("danger", errorText(e, tr));
              }
            }}
          >
            {tr("راجعت الفرق", "Reviewed")}
          </Button>
        ) : null,
    },
  ];
  return (
    <>
      <PageHeader
        title={tr("التحويل بين المخازن", "Transfers between warehouses")}
        subtitle={tr(
          "الإرسال والاستلام خطوتان: ما في الطريق لا يُباع ولا يُحسب في أي مخزن حتى يستلمه أمين المخزن المستلم.",
          "Sending and receiving are two steps: what is on the road isn't sold or counted anywhere until the receiving keeper takes it in.",
        )}
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
          <DataTable
            rows={(list.data ?? []).filter((t) => !wh || t.from_warehouse_id === wh || t.to_warehouse_id === wh)}
            columns={columns}
            rowKey={(t) => t.id}
            rowAction={(t) => (canReceive(t) ? () => setReceiving(t) : undefined)}
            empty={<Empty icon={<ArrowLeftRight className="size-6" />} title={tr("لا يوجد تحويل بعد", "No transfers yet")} />}
          />
        )}
      </Card>
      {open && <TransferDialog onClose={() => setOpen(false)} onDone={list.reload} />}
      {receiving && <ReceiveDialog transfer={receiving} onClose={() => setReceiving(null)} onDone={list.reload} />}
    </>
  );
}

function TransferDialog({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const { tr, name, qty, lang } = useFmt();
  const { user, lookups, items, itemById, reloadItems } = useApp();
  const toast = useToast();
  const mine = useMyWarehouses();
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
          <Select value={from} onChange={(e) => setFrom(Number(e.target.value))} disabled={!!mine && mine.length < 2}>
            {lookups.warehouses.filter((w) => !mine || mine.includes(w.id)).map((w) => (
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
                        {name(x)} ({qty(avail(x.id), x.pieces_per_carton, x)})
                      </option>
                    ))}
                </Select>
                {lines.length > 1 && (
                  <button
                    type="button"
                    aria-label={tr("حذف", "Remove")}
                    onClick={() => setLines((x) => x.filter((_, j) => j !== i))}
                    className="flex size-11 shrink-0 items-center justify-center rounded-xl text-faint hover:bg-danger-soft hover:text-danger"
                  >
                    <Trash2 className="size-4" />
                  </button>
                )}
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <Segmented
                  value={l.unit}
                  onChange={(u) => setLines((x) => x.map((y, j) => (j === i ? { ...y, unit: u } : y)))}
                  options={[
                    { value: "carton", label: unitName(itemById.get(Number(l.item_id)), "carton", lang) },
                    { value: "piece", label: unitName(itemById.get(Number(l.item_id)), "piece", lang) },
                  ]}
                />
                <Stepper value={l.qty} min={0} onChange={(v) => setLines((x) => x.map((y, j) => (j === i ? { ...y, qty: v } : y)))} />
                {it && (
                  <span className="text-xs text-muted">
                    {tr("المتوفر", "Available")} {qty(avail(it.id), it.pieces_per_carton, it)}
                  </span>
                )}
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

/** The receiving keeper writes what really arrived; if less, why (the manager reviews it). */
function ReceiveDialog({ transfer, onClose, onDone }: { transfer: Transfer; onClose: () => void; onDone: () => void }) {
  const { tr, name, qty } = useFmt();
  const { itemById } = useApp();
  const toast = useToast();
  const [got, setGot] = useState<Record<number, number>>(() => Object.fromEntries(transfer.lines.map((l) => [l.item_id, l.pieces])));
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const short = transfer.lines.some((l) => (got[l.item_id] ?? l.pieces) < l.pieces);
  return (
    <Dialog
      open
      onClose={onClose}
      title={tr(`استلام ${transfer.number}`, `Receive ${transfer.number}`)}
      footer={
        <Button
          variant="action"
          className="w-full"
          loading={busy}
          disabled={busy || (short && !reason.trim())}
          onClick={async () => {
            setBusy(true);
            try {
              await api.receiveTransfer(transfer.id, got, reason);
              toast(
                "success",
                short ? tr("استُلم ناقصاً، ويراجعه المدير", "Received short; the manager reviews it") : tr("استُلم كاملاً وأُضيف إلى مخزنك", "Received in full and added to your warehouse"),
              );
              onDone();
              onClose();
            } catch (e) {
              toast("danger", errorText(e, tr));
            } finally {
              setBusy(false);
            }
          }}
        >
          {tr("تأكيد الاستلام", "Confirm receiving")}
        </Button>
      }
    >
      <p className="mb-3 text-sm text-muted">
        {tr("اكتب بالقطعة ما وصل فعلاً. يدخل مخزنك بنفس الصلاحية وسعر الشراء.", "Write in pieces what really arrived. It enters your warehouse with the same expiry and cost.")}
      </p>
      <ul className="space-y-2">
        {transfer.lines.map((l) => {
          const it = itemById.get(l.item_id);
          return (
            <li key={l.item_id} className="flex items-center justify-between gap-2 rounded-xl border border-line p-3">
              <span className="min-w-0 text-sm">
                <span className="block truncate font-medium">{name(it)}</span>
                <span className="text-xs text-muted">
                  {tr("أُرسل", "Sent")} {qty(l.pieces, it?.pieces_per_carton ?? 1, it)}
                </span>
              </span>
              <Stepper value={got[l.item_id] ?? l.pieces} onChange={(v) => setGot((g) => ({ ...g, [l.item_id]: v }))} min={0} max={l.pieces} />
            </li>
          );
        })}
      </ul>
      {short && (
        <Field label={tr("لماذا وصل أقل؟", "Why did less arrive?")} className="mt-3">
          <Textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={2} placeholder={tr("مثلاً: كارتونان تالفان في الطريق", "e.g. two cartons damaged on the road")} />
        </Field>
      )}
    </Dialog>
  );
}
