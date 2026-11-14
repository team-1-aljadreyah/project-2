"use client";

// A batch with a problem (a complaint, a recall): stop selling what is left of it in both warehouses at once,
// and see which shops got it and how much, to call them. The manager can put it back on sale.
import { useState } from "react";
import { Ban, Phone, RotateCcw, Users } from "lucide-react";
import { Button, Dialog, DataTable, Empty, Field, LoadingRows, Textarea, errorText, useToast, type Column } from "@/components/ui";
import { api } from "@/lib/api";
import type { Batch, BatchTrace, Role } from "@/lib/api/types";
import { useFmt } from "@/lib/i18n";
import { useLoad } from "@/lib/use-load";
import { useMay } from "@/lib/use-rules";

export function BatchActions({ batch, piecesPerCarton, onChanged }: { batch: Batch; role?: Role; piecesPerCarton: number; onChanged: () => void }) {
  const { tr } = useFmt();
  const toast = useToast();
  const [stop, setStop] = useState(false);
  const [trace, setTrace] = useState(false);
  const [busy, setBusy] = useState(false);
  const may = useMay();
  const canHold = may("hold_batch");
  return (
    <div className="flex flex-wrap items-center justify-end gap-1">
      <Button size="sm" variant="ghost" onClick={() => setTrace(true)} title={tr("من استلم منها", "Who got it")}>
        <Users className="size-4" />
      </Button>
      {canHold && !batch.held && (
        <Button size="sm" variant="danger" onClick={() => setStop(true)}>
          <Ban className="size-4" /> {tr("أوقف البيع", "Stop selling")}
        </Button>
      )}
      {batch.held && may("hold_batch") && (
        <Button
          size="sm"
          loading={busy}
          onClick={async () => {
            setBusy(true);
            try {
              await api.releaseBatch(batch.id);
              toast("success", tr("عادت الدفعة إلى البيع", "The batch is on sale again"));
              onChanged();
            } catch (e) {
              toast("danger", errorText(e, tr));
            } finally {
              setBusy(false);
            }
          }}
        >
          <RotateCcw className="size-4" /> {tr("أعِدها للبيع", "Back on sale")}
        </Button>
      )}
      {stop && <StopDialog batch={batch} onClose={() => setStop(false)} onDone={onChanged} />}
      {trace && <TraceDialog batch={batch} piecesPerCarton={piecesPerCarton} onClose={() => setTrace(false)} />}
    </div>
  );
}

function StopDialog({ batch, onClose, onDone }: { batch: Batch; onClose: () => void; onDone: () => void }) {
  const { tr } = useFmt();
  const toast = useToast();
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <Dialog
      open
      onClose={onClose}
      title={tr(`إيقاف بيع الدفعة #${batch.id}`, `Stop selling batch #${batch.id}`)}
      footer={
        <Button
          variant="danger"
          className="w-full"
          loading={busy}
          disabled={busy || !reason.trim()}
          onClick={async () => {
            setBusy(true);
            try {
              await api.holdBatch(batch.id, reason);
              toast("success", tr("أُوقف بيع الباقي منها في المخزنين", "The rest of it is off sale in both warehouses"));
              onDone();
              onClose();
            } catch (e) {
              toast("danger", errorText(e, tr));
            } finally {
              setBusy(false);
            }
          }}
        >
          <Ban className="size-4" /> {tr("أوقف البيع فوراً", "Stop selling now")}
        </Button>
      }
    >
      <p className="mb-3 text-sm text-muted">{tr("لن يُباع شيء من الباقي من هذه الدفعة في أي مخزن، ولن تدخل في أي طلب جديد. يصل المدير وأمناء المخازن إشعار.", "Nothing more of this batch is sold in any warehouse or put in any new order. The manager and the keepers are told.")}</p>
      <Field label={tr("السبب", "Reason")}>
        <Textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={3} placeholder={tr("مثلاً: شكوى من محل عن طعم غريب", "e.g. a shop complained about the taste")} />
      </Field>
    </Dialog>
  );
}

function TraceDialog({ batch, piecesPerCarton, onClose }: { batch: Batch; piecesPerCarton: number; onClose: () => void }) {
  const { tr, date, qty } = useFmt();
  const rows = useLoad(() => api.traceBatch(batch.id), [batch.id]);
  const total = (rows.data ?? []).reduce((s, r) => s + r.pieces - r.returned, 0);
  const cols: Column<BatchTrace>[] = [
    { key: "c", head: tr("المحل", "Shop"), cell: (r) => <span className="font-medium">{r.customer}</span> },
    {
      key: "p",
      head: tr("الهاتف", "Phone"),
      cell: (r) => (
        <a href={`tel:${r.phone}`} className="num inline-flex items-center gap-1 text-primary-ink hover:underline" dir="ltr">
          <Phone className="size-3.5" /> {r.phone}
        </a>
      ),
    },
    { key: "i", head: tr("الفاتورة", "Invoice"), cell: (r) => <span className="num">{r.invoice_number}</span> },
    { key: "d", head: tr("التاريخ", "Date"), cell: (r) => <span className="num">{date(r.date)}</span> },
    { key: "q", head: tr("الكمية", "Qty"), cell: (r) => <span>{qty(r.pieces - r.returned, piecesPerCarton)}</span>, align: "end" },
  ];
  return (
    <Dialog open wide onClose={onClose} title={tr(`من استلم من الدفعة #${batch.id}`, `Who got batch #${batch.id}`)}>
      {rows.state.status === "loading" ? (
        <LoadingRows rows={3} />
      ) : (
        <>
          <p className="mb-2 text-sm text-muted">{tr(`${rows.data?.length ?? 0} فاتورة · المجموع عند المحلات ${qty(total, piecesPerCarton)}`, `${rows.data?.length ?? 0} invoices · ${qty(total, piecesPerCarton)} at the shops`)}</p>
          <DataTable rows={rows.data ?? []} columns={cols} rowKey={(r) => `${r.invoice_id}-${r.pieces}`} empty={<Empty title={tr("لم يُبع شيء من هذه الدفعة", "Nothing of this batch was sold")} />} />
        </>
      )}
    </Dialog>
  );
}
