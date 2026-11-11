"use client";

// "I can't deliver": the delivery rep reports an accident, a broken vehicle, a closed shop... for one shipment,
// the ones he picked, or everything he has on the way. The manager gets an urgent notification.
// ProblemNote: the red note on the shipment, and the button that takes it back into the warehouse.
import { useState } from "react";
import { AlertTriangle, Car, CircleSlash, DoorClosed, HelpCircle, PhoneOff, Undo2, Wrench } from "lucide-react";
import { Button, Dialog, Textarea, errorText, useToast } from "@/components/ui";
import { api } from "@/lib/api";
import type { Delivery, Order, ProblemReason, Role } from "@/lib/api/types";
import { useFmt, type Tr } from "@/lib/i18n";
import { cn } from "@/lib/utils";

export function problemText(r: ProblemReason, tr: Tr) {
  return {
    accident: tr("تعرّضت لحادث", "I had an accident"),
    vehicle: tr("عطل في السيارة", "Vehicle broke down"),
    shop_closed: tr("المحل مغلق", "The shop is closed"),
    no_answer: tr("صاحب المحل لا يرد", "The owner doesn't answer"),
    refused: tr("رفض المحل الاستلام", "The shop refused the goods"),
    other: tr("سبب آخر", "Another reason"),
  }[r];
}

const REASONS: { r: ProblemReason; icon: typeof Car; urgent?: boolean }[] = [
  { r: "accident", icon: Car, urgent: true },
  { r: "vehicle", icon: Wrench, urgent: true },
  { r: "shop_closed", icon: DoorClosed },
  { r: "no_answer", icon: PhoneOff },
  { r: "refused", icon: CircleSlash },
  { r: "other", icon: HelpCircle },
];

export function ReportProblem({ orders, onClose, onDone }: { orders: Order[]; onClose: () => void; onDone?: () => void }) {
  const { tr } = useFmt();
  const toast = useToast();
  const [reason, setReason] = useState<ProblemReason | null>(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const many = orders.length > 1;

  async function send() {
    if (!reason) return;
    setBusy(true);
    try {
      await api.reportDeliveryProblem({ order_ids: orders.map((o) => o.id), reason, note: note.trim() || undefined });
      toast("success", reason === "accident" ? tr("وصل البلاغ للمدير، وسيتصل بك الآن. اهتم بسلامتك أولاً.", "The manager got it and will call you. Your safety comes first.") : tr("وصل البلاغ للمدير", "The manager got your report"));
      onDone?.();
      onClose();
    } catch (e) {
      toast("danger", errorText(e, tr));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog
      open
      onClose={onClose}
      title={many ? tr(`تعذّر التسليم · ${orders.length} شحنات`, `Can't deliver · ${orders.length} shipments`) : tr(`تعذّر التسليم · ${orders[0]?.number ?? ""}`, `Can't deliver · ${orders[0]?.number ?? ""}`)}
      footer={
        <Button variant="danger" size="lg" className="w-full" disabled={!reason || busy || (reason === "other" && !note.trim())} loading={busy} onClick={send}>
          <AlertTriangle className="size-5" /> {tr("أرسل البلاغ للمدير", "Send to the manager")}
        </Button>
      }
    >
      <p className="mb-3 text-sm text-muted">{tr("ماذا حدث؟ تبقى الشحنات معك حتى يقرر المدير أو تُعيدها إلى المخزن.", "What happened? The shipments stay with you until the manager decides, or you bring them back.")}</p>
      <div className="grid grid-cols-2 gap-2">
        {REASONS.map(({ r, icon: Icon, urgent }) => (
          <button
            key={r}
            type="button"
            onClick={() => setReason(r)}
            aria-pressed={reason === r}
            className={cn(
              "flex items-center gap-2 rounded-xl border p-3 text-start text-sm font-semibold transition",
              reason === r ? (urgent ? "border-danger bg-danger-soft text-danger" : "border-action bg-action/10") : "border-line hover:bg-card-2",
            )}
          >
            <Icon className={cn("size-5 shrink-0", urgent ? "text-danger" : "text-muted")} />
            {problemText(r, tr)}
          </button>
        ))}
      </div>
      <label className="mt-4 block text-sm font-semibold">
        {tr("ملاحظة", "Note")} {reason !== "other" && <span className="font-normal text-muted">{tr("(اختيارية)", "(optional)")}</span>}
        <Textarea value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} rows={3} className="mt-1" placeholder={tr("مثلاً: المحل مغلق حتى الساعة 4", "e.g. the shop is closed until 4")} />
      </label>
    </Dialog>
  );
}

/** The red note on a shipment with a problem; the manager / its warehouse keeper can take it back. */
export function ProblemNote({ order, role, onChanged, className }: { order: Order; role: Role; onChanged?: () => void; className?: string }) {
  const { tr, ago } = useFmt();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const d: Delivery = order.delivery!;
  if (!d.problem) return null;
  const canTakeBack = role === "manager" || role === "warehouse";
  return (
    <div className={cn("rounded-xl bg-danger-soft p-3 text-sm text-danger", className)}>
      <p className="flex items-center gap-1.5 font-semibold">
        <AlertTriangle className="size-4 shrink-0" /> {problemText(d.problem.reason, tr)}
      </p>
      <p className="mt-0.5 text-xs opacity-90">
        {d.problem.by.name} · {ago(d.problem.at)}
        {d.problem.note ? ` · ${d.problem.note}` : ""}
      </p>
      {canTakeBack && (
        <Button
          size="sm"
          className="mt-2"
          loading={busy}
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            try {
              await api.returnToWarehouse(order.id);
              toast("success", tr(`أُعيدت ${order.number} إلى المخزن: تخرج من جديد بمسح QR`, `${order.number} is back at the warehouse`));
              onChanged?.();
            } catch (e) {
              toast("danger", errorText(e, tr));
            } finally {
              setBusy(false);
            }
          }}
        >
          <Undo2 className="size-4" /> {tr("أُعيدت إلى المخزن", "Back at the warehouse")}
        </Button>
      )}
    </div>
  );
}
