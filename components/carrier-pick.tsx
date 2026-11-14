"use client";

// Who takes a shipment out: the delivery rep (السائق) and the vehicle (optional). The keeper picks them while
// preparing, and may change them on the order page until the shipment is loaded. Picking a vehicle puts its own
// driver in (he can still pick another); picking a driver alone leaves the vehicle as chosen.
import { useState } from "react";
import { Truck, UserRound } from "lucide-react";
import { useApp } from "@/components/shell";
import { Button, Dialog, Field, Notice, Select, errorText, useToast } from "@/components/ui";
import { api } from "@/lib/api";
import type { CarrierPick, Order } from "@/lib/api/types";
import { linesWeight } from "@/lib/api/vehicles";
import { useFmt } from "@/lib/i18n";
import { cn } from "@/lib/utils";

/** The delivery reps (reps who deliver) and the active vehicles, from the lookups. */
export function useCarriers() {
  const { lookups } = useApp();
  const drivers = lookups.reps.filter((r) => !r.kinds?.length || r.kinds.includes("delivery"));
  const vehicles = lookups.vehicles.filter((v) => v.active);
  return { drivers, vehicles };
}

/** The two choices. `value.rep_id` none = «تلقائي» (the usual one); `vehicle_id` none = no vehicle / its driver's. */
export function CarrierFields({ value, onChange, order, auto = true, stack }: { value: CarrierPick; onChange: (v: CarrierPick) => void; order: Order; auto?: boolean; /** One column (a narrow panel). */ stack?: boolean }) {
  const { tr, num } = useFmt();
  const { itemById } = useApp();
  const { drivers, vehicles } = useCarriers();
  const kg = linesWeight(order.lines, (id) => itemById.get(id));
  const v = vehicles.find((x) => x.id === value.vehicle_id);
  return (
    <div className={cn("grid gap-3", !stack && "sm:grid-cols-2")}>
      <Field label={tr("السيارة (اختياري)", "Vehicle (optional)")} hint={v ? tr(`حمولتها ${num(v.capacity_kg)} كغم · الطلب ${num(Math.round(kg))} كغم`, `Takes ${num(v.capacity_kg)} kg · the order ${num(Math.round(kg))} kg`) : undefined}>
        <Select
          value={value.vehicle_id ?? ""}
          onChange={(e) => {
            const id = Number(e.target.value) || null;
            const car = vehicles.find((x) => x.id === id);
            // A vehicle brings its own driver in (if it has one); he can still be changed.
            onChange({ ...value, vehicle_id: id, ...(car?.driver_id ? { rep_id: car.driver_id } : {}) });
          }}
        >
          <option value="">{auto ? tr("تلقائي: سيارة السائق", "Automatic: the driver's vehicle") : tr("بلا سيارة محددة", "No vehicle set")}</option>
          {vehicles.map((x) => (
            <option key={x.id} value={x.id}>
              {x.name}
              {x.plate ? ` · ${x.plate}` : ""} · {num(x.capacity_kg)} {tr("كغم", "kg")}
            </option>
          ))}
        </Select>
      </Field>
      <Field label={tr("السائق (مندوب التوصيل)", "Driver (delivery rep)")}>
        <Select value={value.rep_id ?? ""} onChange={(e) => onChange({ ...value, rep_id: Number(e.target.value) || undefined })}>
          {auto && <option value="">{tr("تلقائي: مندوب الطلب أو الأقل انشغالاً", "Automatic: the order's rep or the least busy")}</option>}
          {!auto && !value.rep_id && <option value="">{tr("اختر السائق", "Pick the driver")}</option>}
          {drivers.map((d) => (
            <option key={d.id} value={d.id}>
              {d.name}
              {vehicles.find((x) => x.driver_id === d.id) ? ` · ${vehicles.find((x) => x.driver_id === d.id)!.name}` : ""}
            </option>
          ))}
        </Select>
      </Field>
      {v && kg > v.capacity_kg && (
        <div className={cn(!stack && "sm:col-span-2")}>
          <Notice tone="warning" title={tr(`الطلب أثقل من حمولة ${v.name}`, `Heavier than ${v.name}'s load`)}>
            {tr("يمكنك توزيعه على أكثر من سيارة من صفحة الطلب بعد التجهيز.", "You can split it across vehicles from the order page after preparing.")}
          </Notice>
        </div>
      )}
    </div>
  );
}

/** On the order page: change the driver and the vehicle of a prepared shipment (before it is loaded). */
export function CarrierDialog({ order, onClose, onDone }: { order: Order; onClose: () => void; onDone: () => void }) {
  const { tr } = useFmt();
  const toast = useToast();
  const [pick, setPick] = useState<CarrierPick>({ rep_id: order.delivery?.rep?.id, vehicle_id: order.delivery?.vehicle?.id ?? null });
  const [busy, setBusy] = useState(false);
  return (
    <Dialog
      open
      onClose={onClose}
      title={
        <span className="flex items-center gap-2">
          <Truck className="size-5 text-action" /> {tr(`السائق والسيارة: ${order.number}`, `Driver and vehicle: ${order.number}`)}
        </span>
      }
      footer={
        <>
          <Button onClick={onClose}>{tr("إلغاء", "Cancel")}</Button>
          <Button
            variant="primary"
            loading={busy}
            disabled={!pick.rep_id}
            onClick={async () => {
              setBusy(true);
              try {
                await api.setCarrier(order.id, pick);
                toast("success", tr("حُفظ السائق والسيارة، ووصله إشعار", "Driver and vehicle saved; he was told"));
                onDone();
                onClose();
              } catch (e) {
                toast("danger", errorText(e, tr));
              } finally {
                setBusy(false);
              }
            }}
          >
            <UserRound className="size-4" /> {tr("حفظ", "Save")}
          </Button>
        </>
      }
    >
      <CarrierFields value={pick} onChange={setPick} order={order} auto={false} />
    </Dialog>
  );
}
