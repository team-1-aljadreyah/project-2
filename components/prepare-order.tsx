"use client";

// The warehouse keeper prepares an approved order: for each line he chooses the warehouse it is taken from.
// The system suggests the one with enough free stock and the oldest expiry (so old goods leave first).
// One order can come from both warehouses; the shop still gets one invoice, at delivery.
import { useState } from "react";
import { PackageCheck, Sparkles, Truck } from "lucide-react";
import { CarrierFields } from "@/components/carrier-pick";
import { Button, Dialog, LoadingRows, Select, errorText, useToast } from "@/components/ui";
import { api } from "@/lib/api";
import type { CarrierPick, Order } from "@/lib/api/types";
import { useFmt } from "@/lib/i18n";
import { useLoad } from "@/lib/use-load";
import { cn, piecesOf } from "@/lib/utils";
import { useApp } from "./shell";

export function PrepareOrder({ order, onClose, onDone }: { order: Order; onClose: () => void; onDone: () => void }) {
  const { tr, name, qty, date } = useFmt();
  const { lookups, itemById } = useApp();
  const toast = useToast();
  const plan = useLoad(() => api.prepPlan(order.id), [order.id]);
  const [pick, setPick] = useState<Record<number, number>>({});
  const [busy, setBusy] = useState(false);
  // Who takes it out: the driver and the vehicle (both optional; none = the usual one).
  const [carrier, setCarrier] = useState<CarrierPick>({ vehicle_id: order.carrier_pick?.vehicle_id ?? null, rep_id: order.carrier_pick?.rep_id });
  const chosen = (itemId: number, suggested: number | null) => pick[itemId] ?? suggested ?? order.warehouse_id;

  async function save() {
    if (!plan.data) return;
    setBusy(true);
    try {
      const map = Object.fromEntries(plan.data.map((l) => [l.item_id, chosen(l.item_id, l.suggested_warehouse_id)]));
      await api.prepareOrder(order.id, map, { ...(carrier.rep_id ? { rep_id: carrier.rep_id } : {}), ...(carrier.vehicle_id ? { vehicle_id: carrier.vehicle_id } : {}) });
      const after = await api.getOrder(order.id).catch(() => null);
      toast(
        "success",
        after && !after.delivery
          ? tr(`جُهّز جزء مخزنك من ${order.number}، وأُبلغ أمين المخزن الآخر بجزئه`, `Your part of ${order.number} is ready; the other keeper was told`)
          : tr(`جُهّز ${order.number}: اطبع ملصق الشحنة والصقه على البضاعة`, `${order.number} prepared: print the shipment label`),
      );
      onDone();
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
      wide
      onClose={onClose}
      title={tr(`تجهيز ${order.number}`, `Prepare ${order.number}`)}
      footer={
        <Button variant="action" className="w-full" loading={busy} disabled={busy || !plan.data} onClick={save}>
          <PackageCheck className="size-4" /> {tr("تم التجهيز: أنشئ ملصق الشحنة", "Prepared: make the shipment label")}
        </Button>
      }
    >
      <p className="mb-3 flex items-center gap-1.5 rounded-xl bg-card-2 p-3 text-xs text-muted">
        <Sparkles className="size-4 shrink-0 text-action" />
        {tr("اقترح النظام المخزن الذي فيه الأقدم صلاحية والكمية كافية. يمكنك تغييره لكل مادة. ما تختاره من المخزن الآخر يجهّزه أمينه هو، لا أنت.", "The system suggests the warehouse with the oldest expiry and enough stock. What you put on the other warehouse is prepared by its own keeper, not you.")}
      </p>
      {/* Who takes it out */}
      <div className="mb-4 rounded-2xl border border-line p-3">
        <p className="mb-2 flex items-center gap-1.5 text-sm font-bold">
          <Truck className="size-4 text-action" /> {tr("التوصيل", "Delivery")}
        </p>
        <CarrierFields value={carrier} onChange={setCarrier} order={order} />
      </div>
      {!plan.data ? (
        <LoadingRows rows={3} />
      ) : (
        <ul className="space-y-3">
          {plan.data.map((l) => {
            const it = itemById.get(l.item_id);
            const need = it ? piecesOf(it, l.unit, l.qty) : 0;
            const w = chosen(l.item_id, l.suggested_warehouse_id);
            const free = l.free.find((f) => f.warehouse_id === w)?.pieces ?? 0;
            return (
              <li key={`${l.item_id}-${l.unit}`} className="rounded-xl border border-line p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-semibold">{name(it)}</p>
                    <p className="text-xs text-muted">{it && qty(need, it.pieces_per_carton, it)}</p>
                  </div>
                  <Select value={w} onChange={(e) => setPick((p) => ({ ...p, [l.item_id]: Number(e.target.value) }))} className="w-56">
                    {lookups.warehouses.map((wh) => (
                      <option key={wh.id} value={wh.id}>
                        {name(wh)}
                        {wh.id === l.suggested_warehouse_id ? ` · ${tr("مقترح", "suggested")}` : ""}
                      </option>
                    ))}
                  </Select>
                </div>
                <div className="mt-2 flex flex-wrap gap-1.5 text-[11px]">
                  {l.free.map((f) => (
                    <span key={f.warehouse_id} className={cn("rounded-full px-2 py-0.5", f.warehouse_id === w ? "bg-action/15 text-text" : "bg-card-2 text-muted")}>
                      {name(lookups.warehouses.find((x) => x.id === f.warehouse_id))}: {it ? qty(f.pieces, it.pieces_per_carton, it) : f.pieces}
                      {f.nearest_expiry ? ` · ${tr("أقدم صلاحية", "oldest")} ${date(f.nearest_expiry)}` : ""}
                    </span>
                  ))}
                </div>
                {free < need && <p className="mt-1 text-xs font-medium text-danger">{tr("الكمية الحرة في هذا المخزن لا تكفي", "Not enough free stock in this warehouse")}</p>}
              </li>
            );
          })}
        </ul>
      )}
    </Dialog>
  );
}
