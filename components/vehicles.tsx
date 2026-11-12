"use client";

// The delivery vehicles and their loads:
// - VehiclesCard (settings): the manager adds vehicles, sets each one's maximum load and its usual driver.
// - LoadPlanner: at the warehouse, a prepared order is put on one vehicle or split across several. Each load
//   shows its weight against the vehicle's maximum; a full vehicle turns red and a second one is suggested.
//   A split order stays one order for the shop: each vehicle's part is a shipment with its own invoice.
// The weights and the suggestion are worked out in lib/api/vehicles.ts (the API checks them the same way).
import Link from "next/link";
import { useState } from "react";
import { AlertTriangle, Plus, Sparkles, Trash2, Truck, Weight } from "lucide-react";
import { useApp } from "@/components/shell";
import { Badge, Button, Card, CardHeader, Dialog, Field, Input, Notice, NumberInput, Select, Switch, errorText, useToast } from "@/components/ui";
import { api, ApiError } from "@/lib/api";
import type { Order, ShipmentLoad, Unit, Vehicle, VehicleInput } from "@/lib/api/types";
import { linesWeight, suggestLoads, vehicleLoad } from "@/lib/api/vehicles";
import { useFmt } from "@/lib/i18n";
import { unitName } from "@/lib/units";
import { useLoad } from "@/lib/use-load";
import { cn } from "@/lib/utils";

/** "1,240 / 1,500 kg" as a bar: green, orange near the top, red over it. */
export function LoadBar({ kg, max, className }: { kg: number; max: number; className?: string }) {
  const { num, tr } = useFmt();
  const pct = max > 0 ? kg / max : 1;
  return (
    <div className={className}>
      <div className="flex items-center justify-between text-xs">
        <span className={cn("num font-semibold", pct > 1 ? "text-danger" : pct > 0.85 ? "text-warning" : "text-success")}>
          {num(Math.round(kg))} / {num(max)} {tr("كغم", "kg")}
        </span>
        {pct > 1 && <span className="font-semibold text-danger">{tr(`زيادة ${num(Math.round(kg - max))} كغم`, `${num(Math.round(kg - max))} kg over`)}</span>}
      </div>
      <div className="mt-1 h-2 overflow-hidden rounded-full bg-line">
        <div className={cn("h-full rounded-full transition-all", pct > 1 ? "bg-danger" : pct > 0.85 ? "bg-warning" : "bg-success")} style={{ width: `${Math.min(100, pct * 100)}%` }} />
      </div>
    </div>
  );
}

// ---------- the manager's vehicles ----------

export function VehiclesCard() {
  const { tr, num } = useFmt();
  const { lookups, itemById } = useApp();
  const orders = useLoad(() => api.listOrders(), []);
  const [editing, setEditing] = useState<Vehicle | "new" | null>(null);
  const repName = (id?: number) => lookups.reps.find((r) => r.id === id)?.name;
  return (
    <Card className="lg:col-span-2">
      <CardHeader
        title={tr("السيارات وحمولتها", "Vehicles and their loads")}
        subtitle={tr("لكل سيارة حمولة قصوى بالكيلوغرام. الطلب الأثقل منها يتوزع على أكثر من سيارة، ويبقى طلباً واحداً للزبون.", "Each vehicle has a maximum load in kg. A heavier order goes on more than one vehicle and stays one order for the shop.")}
        action={
          <Button size="sm" variant="action" onClick={() => setEditing("new")}>
            <Plus className="size-4" /> {tr("سيارة جديدة", "New vehicle")}
          </Button>
        }
      />
      <ul className="grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-3">
        {lookups.vehicles.map((v) => {
          const now = vehicleLoad(v.id, orders.data ?? [], (id) => itemById.get(id));
          return (
            <li key={v.id}>
              <button type="button" onClick={() => setEditing(v)} className={cn("w-full rounded-2xl border border-line p-4 text-start transition hover:border-line-strong hover:bg-card-2", !v.active && "opacity-50")}>
                <div className="flex items-start gap-3">
                  <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary-soft text-primary-ink">
                    <Truck className="size-5" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block font-bold">{v.name}</span>
                    <span className="block text-xs text-muted">
                      {v.plate && (
                        <span className="num" dir="ltr">
                          {v.plate} ·{" "}
                        </span>
                      )}
                      {repName(v.driver_id) ?? tr("بلا سائق ثابت", "No set driver")}
                    </span>
                  </span>
                  {!v.active && <Badge>{tr("موقوفة", "Stopped")}</Badge>}
                </div>
                <p className="mt-3 flex items-center gap-1.5 text-xs text-muted">
                  <Weight className="size-3.5" /> {tr("فيها الآن", "In it now")}
                </p>
                <LoadBar kg={now} max={v.capacity_kg} className="mt-1" />
                <p className="mt-2 text-[11px] text-faint">{tr(`الحمولة القصوى ${num(v.capacity_kg)} كغم`, `Max load ${num(v.capacity_kg)} kg`)}</p>
              </button>
            </li>
          );
        })}
      </ul>
      {editing && <VehicleForm vehicle={editing === "new" ? undefined : editing} onClose={() => setEditing(null)} />}
    </Card>
  );
}

function VehicleForm({ vehicle, onClose }: { vehicle?: Vehicle; onClose: () => void }) {
  const { tr } = useFmt();
  const { lookups, reloadLookups } = useApp();
  const toast = useToast();
  const [f, setF] = useState<VehicleInput>({ name: vehicle?.name ?? "", plate: vehicle?.plate ?? "", capacity_kg: vehicle?.capacity_kg ?? 1500, driver_id: vehicle?.driver_id, active: vehicle?.active ?? true });
  const [cap, setCap] = useState<number | "">(f.capacity_kg);
  const [err, setErr] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const drivers = lookups.reps.filter((r) => !r.kinds?.length || r.kinds.includes("delivery"));
  async function save() {
    setBusy(true);
    setErr({});
    try {
      await api.saveVehicle(vehicle?.id ?? null, { ...f, capacity_kg: cap === "" ? 0 : cap });
      toast("success", tr("حُفظت السيارة", "Vehicle saved"));
      reloadLookups();
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
      onClose={onClose}
      title={vehicle ? tr(`تعديل ${vehicle.name}`, `Edit ${vehicle.name}`) : tr("سيارة جديدة", "New vehicle")}
      footer={
        <>
          <Button onClick={onClose}>{tr("إلغاء", "Cancel")}</Button>
          <Button variant="primary" loading={busy} onClick={save}>
            {tr("حفظ", "Save")}
          </Button>
        </>
      }
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label={tr("اسم السيارة", "Vehicle name")} error={err.name}>
          <Input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder={tr("مثلاً: كيا بونكو 3", "e.g. Kia Bongo 3")} invalid={!!err.name} />
        </Field>
        <Field label={tr("رقم اللوحة", "Plate")}>
          <Input value={f.plate ?? ""} onChange={(e) => setF({ ...f, plate: e.target.value })} />
        </Field>
        <Field label={tr("الحمولة القصوى (كغم)", "Maximum load (kg)")} error={err.capacity_kg} hint={tr("الوزن الذي تحمله في الرحلة الواحدة", "The weight it carries in one trip")}>
          <NumberInput value={cap} onChange={setCap} invalid={!!err.capacity_kg} suffix={tr("كغم", "kg")} />
        </Field>
        <Field label={tr("السائق المعتاد", "Usual driver")} error={err.driver_id} hint={tr("مندوب التوصيل الذي يقودها", "The delivery rep who drives it")}>
          <Select value={f.driver_id ?? ""} onChange={(e) => setF({ ...f, driver_id: Number(e.target.value) || undefined })}>
            <option value="">{tr("بلا سائق ثابت", "No set driver")}</option>
            {drivers.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </Select>
        </Field>
      </div>
      <div className="mt-4">
        <Switch checked={f.active} onChange={(v) => setF({ ...f, active: v })} label={tr("السيارة في الخدمة", "In service")} />
      </div>
    </Dialog>
  );
}

// ---------- a prepared order on the vehicles ----------

type Draft = { vehicle_id: number | ""; qty: Record<string, number> };
const key = (l: { item_id: number; unit: Unit }) => `${l.item_id}:${l.unit}`;

/** Does this order need more room than its vehicle has? (For the warning on the order page.) */
export function useOverweight(order: Order) {
  const { lookups, itemById } = useApp();
  const v = lookups.vehicles.find((x) => x.id === order.delivery?.vehicle?.id);
  const kg = linesWeight(order.lines, (id) => itemById.get(id));
  return { kg, vehicle: v, over: !!v && kg > v.capacity_kg, none: !v };
}

export function LoadPlanner({ order, onClose, onDone }: { order: Order; onClose: () => void; onDone: () => void }) {
  const { tr, name, num, lang } = useFmt();
  const { lookups, itemById } = useApp();
  const toast = useToast();
  const itemOf = (id: number) => itemById.get(id);
  const vehicles = lookups.vehicles.filter((v) => v.active);
  const total = linesWeight(order.lines, itemOf);
  const first = order.delivery?.vehicle?.id ?? vehicles[0]?.id ?? "";
  const [loads, setLoads] = useState<Draft[]>([{ vehicle_id: first, qty: Object.fromEntries(order.lines.map((l) => [key(l), l.qty])) }]);
  const [busy, setBusy] = useState(false);

  const used = loads.map((l) => l.vehicle_id).filter((x): x is number => !!x);
  const weightOf = (d: Draft) => linesWeight(order.lines.map((l) => ({ ...l, qty: d.qty[key(l)] ?? 0 })), itemOf);
  const placed = (l: Order["lines"][number]) => loads.reduce((s, d) => s + (d.qty[key(l)] ?? 0), 0);
  const missing = order.lines.filter((l) => placed(l) !== l.qty);
  const overAny = loads.some((d) => {
    const v = vehicles.find((x) => x.id === d.vehicle_id);
    return !v || weightOf(d) > v.capacity_kg;
  });
  // The next vehicle to suggest: not used yet, the most room first.
  const nextVehicle = vehicles.filter((v) => !used.includes(v.id)).sort((a, b) => b.capacity_kg - a.capacity_kg)[0];

  /** Fill the vehicles one after another (this order's own vehicle first, then the biggest). */
  const autoSplit = () => {
    const order1 = [...vehicles].sort((a, b) => (a.id === first ? -1 : b.id === first ? 1 : b.capacity_kg - a.capacity_kg));
    const { loads: plan, left } = suggestLoads(order.lines, order1, itemOf);
    setLoads(plan.map((p) => ({ vehicle_id: p.vehicle_id, qty: Object.fromEntries(p.lines.map((l) => [key(l), l.qty])) })));
    if (left.length) toast("danger", tr("لا تكفي كل السيارات لهذا الطلب: أضف سيارة من الإعدادات، أو أرسل جزءاً في رحلة ثانية.", "All the vehicles together can't carry it: add a vehicle in settings, or send a part on a second trip."));
  };

  async function save() {
    setBusy(true);
    try {
      const body: ShipmentLoad[] = loads.filter((d) => d.vehicle_id).map((d) => ({ vehicle_id: Number(d.vehicle_id), lines: order.lines.map((l) => ({ item_id: l.item_id, unit: l.unit, qty: d.qty[key(l)] ?? 0 })).filter((x) => x.qty > 0) }));
      await api.planShipments(order.id, body);
      toast("success", body.length > 1 ? tr(`وُزّع الطلب على ${body.length} سيارات: لكل شحنة ملصقها وفاتورتها`, `Split across ${body.length} vehicles: each shipment has its label and invoice`) : tr("حُفظت السيارة", "Vehicle saved"));
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
      title={
        <span className="flex items-center gap-2">
          <Truck className="size-5 text-action" /> {tr(`السيارات والحمولة: ${order.number}`, `Vehicles and load: ${order.number}`)}
        </span>
      }
      footer={
        <>
          <Button onClick={onClose}>{tr("إلغاء", "Cancel")}</Button>
          <Button variant="primary" loading={busy} disabled={overAny || missing.length > 0} onClick={save}>
            {loads.length > 1 ? tr(`توزيع على ${loads.length} سيارات`, `Split across ${loads.length} vehicles`) : tr("حفظ", "Save")}
          </Button>
        </>
      }
    >
      <div className="mb-4 flex flex-wrap items-center gap-3 rounded-2xl bg-card-2 p-3">
        <Weight className="size-5 text-primary-ink" />
        <p className="flex-1 text-sm">
          {tr("وزن الطلب كله", "The whole order weighs")} <b className="num">{num(Math.round(total))}</b> {tr("كغم", "kg")}
        </p>
        <Button size="sm" onClick={autoSplit}>
          <Sparkles className="size-4" /> {tr("وزّعه تلقائياً", "Split it for me")}
        </Button>
      </div>

      <div className="space-y-3">
        {loads.map((d, i) => {
          const v = vehicles.find((x) => x.id === d.vehicle_id);
          const kg = weightOf(d);
          const full = !!v && kg > v.capacity_kg;
          return (
            <div key={i} className={cn("rounded-2xl border p-3", full ? "border-danger/50 bg-danger-soft/40" : "border-line")}>
              <div className="flex flex-wrap items-center gap-2">
                <span className="num flex size-7 items-center justify-center rounded-full bg-primary text-xs font-bold text-on-primary">{i + 1}</span>
                <Select value={d.vehicle_id} onChange={(e) => setLoads((x) => x.map((y, j) => (j === i ? { ...y, vehicle_id: Number(e.target.value) || "" } : y)))} className="w-auto min-w-48 flex-1">
                  <option value="">{tr("اختر سيارة", "Choose a vehicle")}</option>
                  {vehicles.map((x) => (
                    <option key={x.id} value={x.id} disabled={x.id !== d.vehicle_id && used.includes(x.id)}>
                      {x.name} · {num(x.capacity_kg)} {tr("كغم", "kg")}
                    </option>
                  ))}
                </Select>
                {loads.length > 1 && (
                  <Button size="sm" variant="ghost" aria-label={tr("احذف هذه الحمولة", "Remove this load")} onClick={() => setLoads((x) => x.filter((_, j) => j !== i))}>
                    <Trash2 className="size-4" />
                  </Button>
                )}
              </div>
              {v && <LoadBar kg={kg} max={v.capacity_kg} className="mt-3" />}
              {full && (
                <div className="mt-2">
                  <Notice tone="danger" title={tr(`${v!.name} امتلأت`, `${v!.name} is full`)}>
                    {nextVehicle
                      ? tr(`اقتراح: أضف ${nextVehicle.name} (${num(nextVehicle.capacity_kg)} كغم)، أو اضغط «وزّعه تلقائياً».`, `Suggestion: add ${nextVehicle.name} (${num(nextVehicle.capacity_kg)} kg), or press “Split it for me”.`)
                      : tr("لا سيارة أخرى متاحة: أضف سيارة من الإعدادات.", "No other vehicle: add one in settings.")}
                  </Notice>
                </div>
              )}
              <ul className="mt-3 divide-y divide-line rounded-xl border border-line">
                {order.lines.map((l) => {
                  const it = itemById.get(l.item_id);
                  return (
                    <li key={key(l)} className="flex items-center gap-2 px-3 py-2 text-sm">
                      <span className="min-w-0 flex-1 truncate">{name(it)}</span>
                      <span className="text-xs text-muted">{unitName(it, l.unit, lang, true)}</span>
                      <NumberInput
                        value={d.qty[key(l)] ?? 0}
                        onChange={(n) => setLoads((x) => x.map((y, j) => (j === i ? { ...y, qty: { ...y.qty, [key(l)]: Math.max(0, Math.min(l.qty, n === "" ? 0 : n)) } } : y)))}
                        className="w-24"
                        aria-label={tr(`كمية ${name(it)} في هذه السيارة`, `${name(it)} on this vehicle`)}
                      />
                    </li>
                  );
                })}
              </ul>
            </div>
          );
        })}
      </div>

      {nextVehicle && (
        <Button className="mt-3" onClick={() => setLoads((x) => [...x, { vehicle_id: nextVehicle.id, qty: {} }])}>
          <Plus className="size-4" /> {tr(`سيارة أخرى (${nextVehicle.name})`, `Another vehicle (${nextVehicle.name})`)}
        </Button>
      )}

      {missing.length > 0 && (
        <div className="mt-3">
          <Notice tone="warning" title={tr("التوزيع لا يطابق الطلب", "The loads don't match the order")}>
            {missing.map((l) => tr(`${name(itemById.get(l.item_id))}: ${placed(l)} من ${l.qty}`, `${name(itemById.get(l.item_id))}: ${placed(l)} of ${l.qty}`)).join(tr("، ", ", "))}
          </Notice>
        </div>
      )}
      {loads.length > 1 && !missing.length && !overAny && (
        <p className="mt-3 flex items-center gap-1.5 text-xs text-muted">
          <AlertTriangle className="size-3.5" /> {tr("يبقى طلباً واحداً للمحل، ويُسلَّم على دفعات: لكل سيارة ملصق ورمز استلام وفاتورة.", "It stays one order for the shop, delivered in loads: each vehicle has a label, a PIN and an invoice.")}
        </p>
      )}
    </Dialog>
  );
}

// ---------- on the order page ----------

/**
 * The prepared order's vehicle (before it is loaded): its name, the weight against its maximum load, a warning
 * when it doesn't fit, and the planner to change the vehicle or split the order across several.
 */
export function VehicleBox({ order, canPlan, onDone }: { order: Order; canPlan: boolean; onDone: () => void }) {
  const { tr, num } = useFmt();
  const [open, setOpen] = useState(false);
  const { kg, vehicle, over, none } = useOverweight(order);
  const d = order.delivery;
  if (!d) return null;
  return (
    <Card className={cn("p-4", over && "border-danger/50")}>
      <div className="flex flex-wrap items-center gap-3">
        <span className={cn("flex size-10 items-center justify-center rounded-xl", over ? "bg-danger-soft text-danger" : "bg-primary-soft text-primary-ink")}>
          <Truck className="size-5" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="font-bold">{vehicle ? vehicle.name : tr("لم تُحدَّد السيارة", "No vehicle yet")}</p>
          <p className="text-xs text-muted">
            {tr("وزن الشحنة", "Shipment weight")} <span className="num">{num(Math.round(kg))}</span> {tr("كغم", "kg")}
          </p>
        </div>
        {canPlan && d.status === "ready" && !d.loaded_at && (
          <Button size="sm" variant={over || none ? "action" : undefined} onClick={() => setOpen(true)}>
            <Truck className="size-4" /> {over ? tr("وزّع على السيارات", "Split across vehicles") : tr("السيارة والحمولة", "Vehicle and load")}
          </Button>
        )}
      </div>
      {vehicle && <LoadBar kg={kg} max={vehicle.capacity_kg} className="mt-3" />}
      {over && (
        <div className="mt-3">
          <Notice tone="danger" title={tr(`الطلب أثقل من حمولة ${vehicle!.name}`, `Heavier than ${vehicle!.name}'s load`)}>
            {tr("وزّعه على أكثر من سيارة: يبقى طلباً واحداً للمحل، ويُسلَّم على دفعات لكل منها فاتورتها.", "Split it across vehicles: it stays one order for the shop, delivered in loads, each with its invoice.")}
          </Notice>
        </div>
      )}
      {open && <LoadPlanner order={order} onClose={() => setOpen(false)} onDone={onDone} />}
    </Card>
  );
}

/** A big order's shipments (one per vehicle): where each one is, its vehicle and driver, and its invoice. */
export function ShipmentsCard({ order }: { order: Order }) {
  const { tr, num, money } = useFmt();
  const { itemById } = useApp();
  const all = useLoad(() => api.listOrders(), [order.id, order.shipments?.length]);
  const parts = (all.data ?? []).filter((x) => x.shipment_of === order.id).sort((a, b) => (a.shipment_no ?? 0) - (b.shipment_no ?? 0));
  const done = parts.filter((p) => p.status === "confirmed").length;
  return (
    <Card>
      <CardHeader
        title={tr(`يُسلَّم على ${num(order.shipments?.length ?? 0)} دفعات`, `Delivered in ${num(order.shipments?.length ?? 0)} loads`)}
        subtitle={tr(`سُلِّمت ${num(done)} من ${num(parts.length)}. لكل دفعة سيارتها ورمز استلامها وفاتورتها.`, `${num(done)} of ${num(parts.length)} delivered. Each load has its vehicle, PIN and invoice.`)}
      />
      <ul className="divide-y divide-line">
        {parts.map((p) => (
          <li key={p.id} className="box-row flex flex-wrap items-center gap-3 px-4 py-3">
            <span className="num flex size-8 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-bold text-on-primary">{p.shipment_no}</span>
            <span className="min-w-0 flex-1">
              <Link href={`/orders/${p.id}`} className="box-link-main block font-semibold">
                <span className="num">{p.number}</span> · {p.delivery?.vehicle?.name ?? "—"}
              </Link>
              <span className="block text-xs text-muted">
                {p.delivery?.rep?.name ?? ""} · <span className="num">{num(Math.round(linesWeight(p.lines, (id) => itemById.get(id))))}</span> {tr("كغم", "kg")} · {money(p.total)}
              </span>
            </span>
            <Badge tone={p.status === "confirmed" ? "success" : p.status === "cancelled" ? "neutral" : p.delivery?.status === "out" ? "warning" : "primary"}>
              {p.status === "confirmed"
                ? tr("سُلِّمت", "Delivered")
                : p.status === "cancelled"
                  ? tr("ملغاة", "Cancelled")
                  : p.delivery?.status === "out"
                    ? tr("في الطريق", "On the way")
                    : p.delivery?.loaded_at
                      ? tr("محمّلة", "Loaded")
                      : tr("في المخزن", "At the warehouse")}
            </Badge>
            {p.invoice_id && (
              <Link href={`/invoices/${p.invoice_id}`} className="text-xs font-semibold text-primary-ink underline-offset-2 hover:underline">
                {tr("الفاتورة", "Invoice")}
              </Link>
            )}
          </li>
        ))}
      </ul>
    </Card>
  );
}
