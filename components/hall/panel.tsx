"use client";

// The side panel of the picking hall, like the design's "missions" list:
// tabs for the open orders (missions), today's movements, and the shelf alerts.
// The selected mission opens into a checklist the keeper ticks while he picks, then confirms.
import { AnimatePresence, motion } from "motion/react";
import { AlertTriangle, ArrowDownToLine, ArrowLeftRight, ArrowUpFromLine, Check, CheckCircle2, ClipboardList, Clock, Lock, Loader2, Package, Truck } from "lucide-react";
import { useState } from "react";
import { CarrierFields } from "@/components/carrier-pick";
import type { MapCell } from "@/components/map/data";
import { statusLabel } from "@/components/map/zones";
import { Button, Segmented, errorText, useToast } from "@/components/ui";
import { api } from "@/lib/api";
import type { CarrierPick } from "@/lib/api/types";
import { useFmt } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import type { Mission, Urgency } from "./data";
import { clearPicked, togglePicked, usePicked } from "./live";

export interface Move {
  kind: "in" | "out" | "transfer";
  at: string;
  title: string;
  sub: string;
}

const urgencyTone: Record<Urgency, string> = {
  ok: "text-success",
  soon: "text-warning",
  late: "text-danger",
  blocked: "text-faint",
};

/** Three little bars, like the design's signal icon: more filled bars = more urgent. */
function Bars({ u }: { u: Urgency }) {
  const n = { ok: 1, soon: 2, late: 3, blocked: 0 }[u];
  return (
    <span className={cn("flex items-end gap-0.5", urgencyTone[u])} aria-hidden>
      {[0, 1, 2].map((i) => (
        <span key={i} className={cn("w-[3px] rounded-full", i < n ? "bg-current" : "bg-line-strong")} style={{ height: 6 + i * 3 }} />
      ))}
    </span>
  );
}

export function HallPanel({
  missions,
  moves,
  alerts,
  selectedId,
  onSelect,
  onConfirmed,
}: {
  missions: Mission[];
  moves: Move[];
  alerts: { cell: MapCell; zone: string }[];
  selectedId: number | null;
  onSelect: (id: number | null) => void;
  /** An order was confirmed here: the page shows its shipment label to print. */
  onConfirmed?: (orderId: number) => void;
}) {
  const { tr } = useFmt();
  const [tab, setTab] = useState<"missions" | "moves" | "alerts">("missions");
  return (
    <div className="flex min-h-0 flex-col">
      <Segmented
        value={tab}
        onChange={setTab}
        className="w-full"
        options={[
          { value: "missions", label: tr("المهام", "Missions"), count: missions.length },
          { value: "moves", label: tr("الحركة", "Movements"), count: moves.length },
          { value: "alerts", label: tr("التنبيهات", "Alerts"), count: alerts.length },
        ]}
      />
      <div className="mt-3 min-h-0 flex-1 space-y-2 overflow-y-auto pe-1 lg:max-h-[640px]">
        {tab === "missions" &&
          (missions.length ? (
            missions.map((m, i) => (
              <MissionCard key={m.order.id} m={m} i={i} open={m.order.id === selectedId} onToggle={() => onSelect(m.order.id === selectedId ? null : m.order.id)} onConfirmed={onConfirmed} />
            ))
          ) : (
            <EmptyNote icon={<CheckCircle2 className="size-6 text-success" />} text={tr("كل الطلبات تم تجهيزها", "All orders are prepared")} />
          ))}
        {tab === "moves" &&
          (moves.length ? (
            moves.map((mv, i) => <MoveRow key={i} mv={mv} />)
          ) : (
            <EmptyNote icon={<Clock className="size-6 text-faint" />} text={tr("لا توجد حركة اليوم بعد", "No movements today yet")} />
          ))}
        {tab === "alerts" &&
          (alerts.length ? (
            alerts.map(({ cell, zone }) => (
              <div key={cell.item.id} className="flex items-center gap-3 rounded-xl border border-line bg-card p-3">
                <AlertTriangle className={cn("size-4 shrink-0", cell.status === "near" ? "text-warning" : "text-danger")} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold">{cell.item.name}</p>
                  <p className="text-xs text-muted">
                    <span className="num" dir="ltr">
                      {cell.code}
                    </span>{" "}
                    · {zone} · {statusLabel(cell.status, tr)}
                  </p>
                </div>
              </div>
            ))
          ) : (
            <EmptyNote icon={<CheckCircle2 className="size-6 text-success" />} text={tr("لا توجد تنبيهات على الرفوف", "No shelf alerts")} />
          ))}
      </div>
    </div>
  );
}

function EmptyNote({ icon, text }: { icon: React.ReactNode; text: string }) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-line-strong py-10 text-sm text-muted">
      {icon}
      {text}
    </div>
  );
}

function MoveRow({ mv }: { mv: Move }) {
  const { time } = useFmt();
  const Icon = mv.kind === "in" ? ArrowDownToLine : mv.kind === "out" ? ArrowUpFromLine : ArrowLeftRight;
  return (
    <div className="flex items-center gap-3 rounded-xl border border-line bg-card p-3">
      <span className={cn("flex size-8 shrink-0 items-center justify-center rounded-lg", mv.kind === "out" ? "bg-success-soft text-success" : "bg-primary-soft text-primary-ink")}>
        <Icon className="size-4" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold">{mv.title}</p>
        <p className="truncate text-xs text-muted">{mv.sub}</p>
      </div>
      <span className="num shrink-0 text-xs text-faint">{time(mv.at)}</span>
    </div>
  );
}

function MissionCard({ m, i, open, onToggle, onConfirmed }: { m: Mission; i: number; open: boolean; onToggle: () => void; onConfirmed?: (orderId: number) => void }) {
  const { tr, qty, num } = useFmt();
  const toast = useToast();
  const picked = new Set(usePicked()[m.order.id] ?? []);
  const done = m.lines.filter((l) => picked.has(l.item.id)).length;
  const all = m.lines.length > 0 && done === m.lines.length;
  const pct = m.lines.length ? done / m.lines.length : 0;
  const [busy, setBusy] = useState(false);
  // Who takes it out (chosen here while picking; none = the usual driver and his vehicle).
  const [carrier, setCarrier] = useState<CarrierPick>({ vehicle_id: null });

  const left =
    m.urgency === "blocked"
      ? m.order.status === "needs_approval"
        ? tr("ينتظر موافقة المدير", "Waiting for the manager")
        : tr("ينتظر اعتماد المحاسب أو المدير", "Waiting for approval")
      : m.minutesLeft === null
        ? tr("بدون حجز", "No reservation")
        : m.minutesLeft <= 0
          ? tr("انتهى وقت الحجز", "Reservation ended")
          : m.minutesLeft < 60
            ? tr(`باقي ${m.minutesLeft} دقيقة`, `${m.minutesLeft} min left`)
            : tr(`باقي ${Math.floor(m.minutesLeft / 60)} س ${m.minutesLeft % 60} د`, `${Math.floor(m.minutesLeft / 60)} h ${m.minutesLeft % 60} min left`);

  async function confirm() {
    setBusy(true);
    try {
      // In the hall he picked everything from his own shelves: every line from his warehouse.
      // (To split an order with the other warehouse, he uses the order page.)
      await api.prepareOrder(
        m.order.id,
        Object.fromEntries(m.order.lines.map((l) => [l.item_id, l.warehouse_id ?? m.order.warehouse_id])),
        { ...(carrier.rep_id ? { rep_id: carrier.rep_id } : {}), ...(carrier.vehicle_id ? { vehicle_id: carrier.vehicle_id } : {}) },
      );
      clearPicked(m.order.id);
      onConfirmed?.(m.order.id);
      toast("success", tr(`تم تجهيز ${m.order.number}: الفاتورة تصدر عند التسليم`, `${m.order.number} prepared: the invoice comes at delivery`));
    } catch (e) {
      toast("danger", errorText(e, tr));
      setBusy(false);
    }
  }

  return (
    <motion.div
      layout
      initial={{ opacity: 0, x: 12 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay: Math.min(i, 8) * 0.04 }}
      className={cn("rounded-2xl border bg-card transition-[border-color,box-shadow]", open ? "border-action shadow-[0_0_0_4px_rgb(225_105_43/0.15)]" : "border-line hover:border-line-strong")}
    >
      <button type="button" onClick={onToggle} aria-expanded={open} className="w-full p-3 text-start">
        <div className="flex items-center gap-2">
          <span className={cn("flex size-7 shrink-0 items-center justify-center rounded-lg", open ? "bg-action text-on-action" : "bg-primary text-on-primary")}>
            <ClipboardList className="size-3.5" />
          </span>
          <span className="num text-sm font-bold" dir="ltr">
            {m.order.number}
          </span>
          <Bars u={m.urgency} />
          <span className="ms-auto truncate text-xs text-muted">{m.customer}</span>
        </div>

        {/* From the first zone to the loading dock, with the picking progress on the line */}
        <div className="mt-3 flex items-center gap-2 text-xs">
          <span className="num shrink-0 font-semibold" dir="ltr">
            {m.stops[0]?.code ?? "—"}
          </span>
          <span className="relative h-1.5 flex-1 rounded-full bg-line">
            <span className="absolute inset-y-0 start-0 rounded-full bg-action transition-[width] duration-500" style={{ width: `${pct * 100}%` }} />
            <span
              className="absolute top-1/2 size-3 -translate-y-1/2 rounded-full border-2 border-card bg-action shadow transition-[inset-inline-start] duration-500"
              style={{ insetInlineStart: `calc(${pct * 100}% - 6px)` }}
            />
          </span>
          <span className="shrink-0 font-semibold">{tr("التحميل", "Loading")}</span>
        </div>
        <div className="mt-1 flex items-center justify-between text-[11px]">
          <span className={cn("font-semibold", urgencyTone[m.urgency])}>{left}</span>
          <span className="text-faint">
            {m.stops.length} {tr("محطات", "stops")}
          </span>
        </div>

        <div className="mt-2.5 flex flex-wrap items-center gap-1.5 text-[11px]">
          <span className="flex items-center gap-1 rounded-md bg-card-2 px-1.5 py-0.5 font-medium">
            <Truck className="size-3" /> {m.rep}
          </span>
          <span className="num flex items-center gap-1 rounded-md bg-card-2 px-1.5 py-0.5 font-medium">
            <Check className="size-3" /> {done}/{m.lines.length}
          </span>
          <span className="num flex items-center gap-1 rounded-md bg-card-2 px-1.5 py-0.5 font-medium">
            <Package className="size-3" /> {num(Math.round(m.cartons))} {tr("كارتون", "ctn")}
          </span>
        </div>
      </button>

      {/* The checklist: one row per line, in walking order */}
      <AnimatePresence initial={false}>
        {open && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
            <div className="space-y-1.5 border-t border-line p-3">
              {m.lines.map((l, n) => {
                const ok = picked.has(l.item.id);
                return (
                  <label
                    key={l.item.id}
                    className={cn("flex cursor-pointer items-center gap-2.5 rounded-xl border p-2 transition", ok ? "border-success/40 bg-success-soft" : "border-line hover:bg-card-2")}
                  >
                    <input type="checkbox" checked={ok} onChange={() => togglePicked(m.order.id, l.item.id)} className="size-4 shrink-0 accent-[var(--action)]" />
                    <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-action text-[10px] font-bold text-on-action">
                      {m.stops.findIndex((z) => z.code === l.zone.code) + 1}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className={cn("block truncate text-sm font-semibold", ok && "line-through opacity-60")}>{l.item.name}</span>
                      <span className="block truncate text-[11px] text-muted">
                        <span className="num" dir="ltr">
                          {l.cell.code}
                        </span>
                        {l.batch && (
                          <>
                            {" · "}
                            {tr(`الدفعة #${l.batch.id} تنتهي ${l.batch.expiry_date}`, `batch #${l.batch.id}, expires ${l.batch.expiry_date}`)}
                          </>
                        )}
                      </span>
                    </span>
                    <span className="num shrink-0 text-xs font-bold">{qty(l.pieces, l.item.pieces_per_carton, l.item)}</span>
                    <span className="sr-only">{n + 1}</span>
                  </label>
                );
              })}
              {m.urgency === "blocked" ? (
                <p className="flex items-center gap-1.5 rounded-xl bg-card-2 p-2.5 text-xs text-muted">
                  <Lock className="size-3.5" /> {tr("يتجاوز سقف الدين: يُجهَّز بعد موافقة المدير", "Over the debt limit: prepare after the manager approves")}
                </p>
              ) : (
                <>
                {/* Who takes it out: the driver and the vehicle (optional; none = the usual one) */}
                <div className="mt-1 rounded-xl border border-line p-2.5">
                  <p className="mb-1.5 flex items-center gap-1 text-xs font-bold">
                    <Truck className="size-3.5 text-action" /> {tr("التوصيل", "Delivery")}
                  </p>
                  <CarrierFields value={carrier} onChange={setCarrier} order={m.order} stack />
                </div>
                <Button variant="action" className="mt-1 w-full" disabled={!all || busy} onClick={confirm}>
                  {busy ? <Loader2 className="size-4 animate-spin" /> : <CheckCircle2 className="size-4" />}
                  {all ? tr("تثبيت وإصدار فاتورة", "Confirm and invoice") : tr(`أكمل التجهيز (${done}/${m.lines.length})`, `Finish picking (${done}/${m.lines.length})`)}
                </Button>
                </>
              )}
              <Button variant="ghost" size="sm" className="w-full text-muted" href={`/orders/${m.order.id}`}>
                {tr("فتح صفحة الطلب", "Open the order's page")}
              </Button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
