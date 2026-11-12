"use client";

// The keeper's picking hall, after the "Warehouse Robodog" design Yasser chose for the warehouse keeper:
// - a missions panel (the open orders of his warehouse, most urgent first, each with a picking checklist),
// - a timeline of the day with a "now" marker,
// - the floor plan of his warehouse with the route of the selected order.
// The page opens in 3D and lies down flat, like the design's video. Only the warehouse keeper can open it.
import { useEffect, useMemo, useState } from "react";
import { motion } from "motion/react";
import Link from "next/link";
import { Box, ClipboardCheck, LayoutGrid, Minus, PackagePlus, Plus, Square, Truck, Warehouse as WarehouseIcon } from "lucide-react";
import { buildMap } from "@/components/map/data";
import { HallPanel, type Move } from "@/components/hall/panel";
import { HallPlan } from "@/components/hall/plan";
import { buildMissions, type Mission } from "@/components/hall/data";
import { useNow } from "@/components/hall/live";
import { useApp } from "@/components/shell";
import { useMyWarehouses } from "@/components/warehouse-filter";
import { LayoutEditor, canArrange } from "@/components/warehouse-layout";
import { Button, Card, Dialog, ErrorBox, PageHeader, Segmented, Skeleton } from "@/components/ui";
import { PrintButton, ShipmentLabel } from "@/components/delivery/qr";
import { api } from "@/lib/api";
import type { Order, Receipt } from "@/lib/api/types";
import { useFmt } from "@/lib/i18n";
import { useLoad } from "@/lib/use-load";
import { useRealtime } from "@/lib/realtime";
import { cn, dayOfIso, today } from "@/lib/utils";

const INTRO_KEY = "nahrain.hall-intro";

export default function HallPage() {
  const { tr, name, num, date } = useFmt();
  const { user, lookups, items } = useApp();
  const now = useNow();
  const shelf = useLoad(() => api.shelfStock(), []);
  const batches = useLoad(() => api.listBatches(), []);
  const orders = useLoad(() => api.listOrders(), []);
  useRealtime(["orders"], () => orders.reload());
  const invoices = useLoad(() => api.listInvoices(), []);
  const receipts = useLoad(() => api.listReceipts(), []);
  const transfers = useLoad(() => api.listTransfers(), []);
  const customers = useLoad(() => api.listCustomers(), []);
  // Supply orders the accountant sent for this warehouse: the goods on their way here.
  const supply = useLoad(() => api.listSupplyOrders(), []);

  const [picked, setPicked] = useState<number | null>(null);
  // Like the design: the hall shows in 3D for a moment, then lies down into the flat plan.
  // Only the first time in a session (the keeper opens this page many times a day, and waiting for
  // the same show every time slows the work), and never for people who turned animations off.
  const [threeD, setThreeD] = useState(() => {
    try {
      return !sessionStorage.getItem(INTRO_KEY) && !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    } catch {
      return false;
    }
  });
  const [zoom, setZoom] = useState(1);
  // The order just confirmed: its shipment label opens, to print and stick on the packages.
  const [labelFor, setLabelFor] = useState<number | null>(null);
  const [arranging, setArranging] = useState(false);
  const [intro] = useState(threeD);

  useEffect(() => {
    if (!intro) return;
    try {
      sessionStorage.setItem(INTRO_KEY, "1");
    } catch {}
    const t = setTimeout(() => setThreeD(false), 900);
    return () => clearTimeout(t);
  }, [intro]);

  // His own warehouse, or (covering for an absent keeper) the other one he picks above the plan.
  const mine = useMyWarehouses();
  const [pickedWh, setPickedWh] = useState<number | null>(null);
  const whId = pickedWh && mine?.includes(pickedWh) ? pickedWh : (user.warehouse_id ?? lookups.warehouses[0]?.id);
  const covers = lookups.warehouses.filter((w) => w.cover?.user_id === user.id && w.cover.until > new Date().toISOString());
  const view = useMemo(() => {
    if (!shelf.data || !batches.data || !orders.data) return null;
    return buildMap({ items, warehouses: lookups.warehouses, shelf: shelf.data, batches: batches.data, orders: orders.data, reps: lookups.reps }).find((v) => v.wh.id === whId) ?? null;
  }, [items, lookups, shelf.data, batches.data, orders.data, whId]);

  const missions = useMemo(
    () => (view && orders.data && batches.data ? buildMissions({ view, orders: orders.data, items, customers: customers.data ?? [], reps: lookups.reps, batches: batches.data, now }) : []),
    [view, orders.data, items, customers.data, lookups.reps, batches.data, now],
  );

  const failed = [shelf, batches, orders].find((l) => l.state.status === "error");
  if (failed && failed.state.status === "error") return <ErrorBox error={failed.state.error} onRetry={failed.reload} />;

  // The selected mission: the one the keeper clicked, or the most urgent one he can work on.
  const selected: Mission | undefined = missions.find((m) => m.order.id === picked) ?? (picked === null ? missions.find((m) => m.urgency !== "blocked") : undefined);
  const t = today();
  const custName = (id: number) => customers.data?.find((c) => c.id === id)?.name ?? "";

  // Today's movements in this warehouse: goods in, invoices out, transfers.
  const moves: Move[] = [
    ...(receipts.data ?? [])
      .filter((r) => r.warehouse_id === whId && dayOfIso(r.created_at) === t)
      .map((r): Move => ({
        kind: "in",
        at: r.created_at,
        title: tr(`استلام ${r.number}`, `Receipt ${r.number}`),
        sub: tr(`${r.supplier} · ${r.lines.length} مواد`, `${r.supplier} · ${r.lines.length} items`),
      })),
    ...(invoices.data ?? [])
      .filter((i) => i.warehouse_id === whId && dayOfIso(i.date) === t)
      .map((i): Move => ({ kind: "out", at: i.date, title: tr(`فاتورة ${i.number}`, `Invoice ${i.number}`), sub: custName(i.customer_id) })),
    ...(transfers.data ?? [])
      .filter((x) => (x.from_warehouse_id === whId || x.to_warehouse_id === whId) && dayOfIso(x.created_at) === t)
      .map((x): Move => {
        const toHere = x.to_warehouse_id === whId;
        const other = lookups.warehouses.find((w) => w.id === (toHere ? x.from_warehouse_id : x.to_warehouse_id));
        return {
          kind: "transfer",
          at: x.created_at,
          title: tr(`تحويل ${x.number}`, `Transfer ${x.number}`),
          sub: toHere ? tr(`وارد من ${other?.name ?? ""}`, `In from ${other?.name_en ?? ""}`) : tr(`صادر إلى ${other?.name ?? ""}`, `Out to ${other?.name_en ?? ""}`),
        };
      }),
  ].sort((a, b) => b.at.localeCompare(a.at));

  const alerts = view ? view.zones.flatMap((z) => z.cells.filter((c) => c.status === "expired" || c.status === "low" || c.status === "near").map((cell) => ({ cell, zone: z.category }))) : [];
  const todayOrders = (orders.data ?? []).filter((o) => o.warehouse_id === whId && dayOfIso(o.created_at) === t);
  const todayReceipts = (receipts.data ?? []).filter((r) => r.warehouse_id === whId && dayOfIso(r.created_at) === t);
  const linesToPick = missions.filter((m) => m.urgency !== "blocked").reduce((s, m) => s + m.lines.length, 0);

  return (
    <>
      <PageHeader
        title={tr("قاعة التجهيز", "Picking hall")}
        subtitle={tr("طلبات مخزنك ومسار تجهيز كل طلب على المخطط", "Your warehouse's orders and the picking route of each one")}
        actions={
          <>
            {view && canArrange(user, view.wh.id, lookups.warehouses) && (
              <Button onClick={() => setArranging(true)}>
                <LayoutGrid className="size-4" /> {tr("ترتيب المخزن", "Arrange the warehouse")}
              </Button>
            )}
            <Button variant="action" href="/receipts/new">
              <PackagePlus className="size-4" /> {tr("استلام بضاعة", "Receive goods")}
            </Button>
          </>
        }
      />
      {arranging && view && <LayoutEditor warehouse={view.wh} onClose={() => setArranging(false)} />}
      {covers.length > 0 && mine && (
        <div className="mb-4 flex flex-wrap items-center gap-3 rounded-2xl border border-action/30 bg-action/10 p-3">
          <p className="min-w-0 flex-1 text-sm">
            <b>{tr("تكليف مؤقت:", "Temporary cover:")}</b>{" "}
            {covers.map((w) => tr(`تعمل أيضاً في ${w.name} حتى ${date(w.cover!.until)}`, `you also work in ${w.name_en} until ${date(w.cover!.until)}`)).join(tr("، ", ", "))}
          </p>
          <Segmented
            value={String(whId)}
            onChange={(v) => setPickedWh(Number(v))}
            options={lookups.warehouses.filter((w) => mine.includes(w.id)).map((w) => ({ value: String(w.id), label: name(w) }))}
          />
        </div>
      )}

      {(() => {
        // Still loading: keep the strip's place, so the hall below doesn't jump down when it arrives.
        if (supply.state.status === "loading") return <div aria-hidden className="mb-4 h-[9.5rem] animate-pulse rounded-2xl bg-card-2" />;
        const coming = (supply.data ?? []).filter((o) => o.warehouse_id === whId && (o.status === "sent" || o.status === "partial"));
        if (!coming.length) return null;
        return (
          <section className="mb-4 rounded-2xl border border-primary/25 bg-card p-3">
            <div className="mb-2 flex items-center gap-2 px-1">
              <Truck className="size-4 text-primary-ink" />
              <p className="text-sm font-bold">{tr("بضاعة قادمة: طلبات توريد من المحاسب", "Goods on the way: supply orders from the accountant")}</p>
              <span className="num rounded-full bg-primary px-2 py-0.5 text-xs font-bold text-on-primary">{coming.length}</span>
              <Link href="/supply" className="ms-auto text-xs font-semibold text-primary-ink hover:underline">
                {tr("كل الطلبات", "All orders")}
              </Link>
            </div>
            <div className="flex gap-2 overflow-x-auto pb-1">
              {coming.map((o) => {
                const late = o.expected_date && o.expected_date < t;
                return (
                  <Link
                    key={o.id}
                    href={`/receipts/new?supply=${o.id}`}
                    className="box-row group flex min-w-64 shrink-0 flex-col gap-1 rounded-xl border border-line bg-card-2/50 p-3 transition hover:border-primary"
                  >
                    <span className="flex items-center gap-2">
                      <span className="num font-semibold">{o.number}</span>
                      {o.status === "partial" && <span className="rounded-md bg-warning-soft px-1.5 py-0.5 text-[11px] font-bold text-warning">{tr("وصل جزء منه", "Part arrived")}</span>}
                    </span>
                    <span className="truncate text-sm">{o.supplier}</span>
                    <span className={cn("text-xs", late ? "text-danger" : "text-muted")}>
                      {num(o.lines.length)} {tr("مواد", "items")}
                      {o.expected_date ? ` · ${tr("يصل", "expected")} ${date(o.expected_date)}` : ""}
                    </span>
                    <span className="mt-1 flex items-center gap-1.5 text-xs font-bold text-primary-ink">
                      <ClipboardCheck className="size-4" /> {tr("افحص واستلم", "Check and receive")}
                    </span>
                  </Link>
                );
              })}
            </div>
          </section>
        );
      })()}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[380px_minmax(0,1fr)]">
        {/* Missions panel */}
        <Card className="p-3 lg:sticky lg:top-20 lg:self-start">
          <div className="mb-3 flex items-center gap-2 px-1">
            <span className="flex size-8 items-center justify-center rounded-lg bg-primary text-on-primary">
              <WarehouseIcon className="size-4" />
            </span>
            <div className="min-w-0">
              <p className="truncate text-sm font-bold">{view ? name(view.wh) : "…"}</p>
              <p className="text-[11px] text-muted">
                {tr("أمين المخزن", "Warehouse keeper")}: {user.name}
              </p>
            </div>
          </div>
          {view ? (
            <HallPanel missions={missions} moves={moves} alerts={alerts} selectedId={selected?.order.id ?? null} onSelect={setPicked} onConfirmed={setLabelFor} />
          ) : (
            <div className="space-y-2">
              {[0, 1, 2].map((i) => (
                <Skeleton key={i} className="h-28" />
              ))}
            </div>
          )}
        </Card>

        {/* The hall */}
        <Card className="min-w-0 overflow-hidden">
          <div className="flex flex-wrap items-center gap-2 border-b border-line p-3">
            <Chip label={tr("طلبات تنتظر", "Waiting")} value={num(missions.length)} />
            <Chip label={tr("سطور للتجهيز", "Lines to pick")} value={num(linesToPick)} />
            <Chip label={tr("تنبيهات", "Alerts")} value={num(alerts.length)} tone={alerts.length ? "danger" : undefined} />
            <span className="ms-auto flex items-center gap-1.5 rounded-full bg-action px-2.5 py-1 text-xs font-bold text-on-action">
              <span className="relative flex size-2">
                <span className="absolute inline-flex size-full animate-ping rounded-full bg-on-action opacity-60" />
                <span className="relative inline-flex size-2 rounded-full bg-on-action" />
              </span>
              {tr("مباشر", "Live")}
            </span>
          </div>

          <Timeline now={now} orders={todayOrders} receipts={todayReceipts} selected={selected?.order.id} onPick={setPicked} />

          <div className="relative overflow-auto bg-bg/40 p-3">
            {view ? (
              <div className="[perspective:1800px]" style={{ width: `${zoom * 100}%`, minWidth: 720 }}>
                <motion.div
                  initial={false}
                  animate={threeD ? { rotateX: 50, rotateZ: -28, scale: 0.78, y: -20 } : { rotateX: 0, rotateZ: 0, scale: 1, y: 0 }}
                  transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
                  style={{ transformStyle: "preserve-3d" }}
                  className={cn(threeD && "drop-shadow-[0_30px_30px_rgb(0_0_0/0.25)]")}
                >
                  <HallPlan
                    view={view}
                    missions={missions}
                    selected={selected}
                    inPallets={todayReceipts.reduce((s, r) => s + r.lines.length, 0)}
                    outPallets={moves.filter((m) => m.kind === "out").length}
                  />
                </motion.div>
              </div>
            ) : (
              <Skeleton className="aspect-[5/3] w-full" />
            )}
          </div>

          {/* Bottom bar: color key, 2D / 3D, zoom (like the design's map controls) */}
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-line p-3 text-xs text-muted">
            <Key cls="bg-action" label={tr("مسار الطلب المختار", "Selected route")} line />
            <Key cls="bg-success" label={tr("ضمن الوقت", "On time")} line />
            <Key cls="bg-warning" label={tr("قريب الانتهاء", "Ending soon")} line />
            <Key cls="bg-danger" label={tr("انتهى الحجز", "Ended")} line />
            <Key cls="bg-[var(--iso-glass)]" label={tr("بضاعة على الرف", "Stock on shelf")} />
            <div className="ms-auto flex items-center gap-1.5">
              <div className="flex rounded-lg border border-line-strong p-0.5">
                {[
                  { v: false, l: "2D", I: Square },
                  { v: true, l: "3D", I: Box },
                ].map(({ v, l, I }) => (
                  <button
                    key={l}
                    type="button"
                    onClick={() => setThreeD(v)}
                    aria-pressed={threeD === v}
                    className={cn("flex items-center gap-1 rounded-md px-2 py-1 text-xs font-semibold transition", threeD === v ? "bg-primary text-on-primary" : "text-muted hover:text-text")}
                  >
                    <I className="size-3.5" /> {l}
                  </button>
                ))}
              </div>
              <button
                type="button"
                aria-label={tr("تصغير", "Zoom out")}
                onClick={() => setZoom((z) => Math.max(1, +(z - 0.25).toFixed(2)))}
                disabled={zoom <= 1}
                className="flex size-8 items-center justify-center rounded-lg border border-line-strong hover:bg-card-2 disabled:opacity-40"
              >
                <Minus className="size-4" />
              </button>
              <span className="num w-10 text-center font-semibold">{Math.round(zoom * 100)}%</span>
              <button
                type="button"
                aria-label={tr("تكبير", "Zoom in")}
                onClick={() => setZoom((z) => Math.min(2, +(z + 0.25).toFixed(2)))}
                disabled={zoom >= 2}
                className="flex size-8 items-center justify-center rounded-lg border border-line-strong hover:bg-card-2 disabled:opacity-40"
              >
                <Plus className="size-4" />
              </button>
            </div>
          </div>
        </Card>
      </div>
      {labelFor && <LabelDialog orderId={labelFor} onClose={() => setLabelFor(null)} />}
    </>
  );
}

/** The shipment label of an order just confirmed. */
function LabelDialog({ orderId, onClose }: { orderId: number; onClose: () => void }) {
  const { tr } = useFmt();
  const { lookups } = useApp();
  const order = useLoad(() => api.getOrder(orderId), [orderId]);
  const customer = useLoad(() => (order.data ? api.getCustomer(order.data.customer_id) : Promise.resolve(undefined)), [order.data?.customer_id]);
  const o = order.data;
  return (
    <Dialog open onClose={onClose} title={tr("ملصق الشحنة: اطبعه والصقه على البضاعة", "Shipment label: print it and stick it on the goods")} footer={<PrintButton />}>
      {o?.delivery ? (
        <ShipmentLabel order={o} shop={customer.data?.name ?? ""} area={customer.data?.area} rep={o.delivery?.rep?.name ?? lookups.reps.find((r) => r.id === o.rep_id)?.name ?? ""} />
      ) : (
        <Skeleton className="h-44" />
      )}
    </Dialog>
  );
}

function Chip({ label, value, tone }: { label: string; value: string; tone?: "danger" }) {
  return (
    <span className={cn("flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs", tone === "danger" ? "border-danger/30 bg-danger-soft text-danger" : "border-line bg-card-2")}>
      <b className="num">{value}</b> {label}
    </span>
  );
}

function Key({ cls, label, line }: { cls: string; label: string; line?: boolean }) {
  return (
    <span className="flex items-center gap-1.5">
      <span className={cn(line ? "h-1 w-4 rounded-full" : "size-2.5 rounded-sm", cls)} />
      {label}
    </span>
  );
}

/**
 * The day as a ruler, like the design's timeline: hour ticks, a dot for every order made today
 * (click it to select that order) and a square for every receipt, plus the "now" marker.
 */
function Timeline({ now, orders, receipts, selected, onPick }: { now: number; orders: Order[]; receipts: Receipt[]; selected?: number; onPick: (id: number) => void }) {
  const { tr, time } = useFmt();
  const hourOf = (iso: string) => {
    const d = new Date(iso);
    return d.getHours() + d.getMinutes() / 60;
  };
  const pos = (h: number) => `${(h / 24) * 100}%`;
  const nowH = now ? hourOf(new Date(now).toISOString()) : null;
  const tone = (o: Order) =>
    o.status === "pending" || o.status === "approved" ? "bg-action" : o.status === "needs_approval" ? "bg-warning" : o.status === "cancelled" ? "bg-line-strong" : "bg-success";
  return (
    <div className="border-b border-line px-4 pb-3 pt-2" dir="ltr">
      <div className="relative h-12">
        {/* Hour ticks every 2 hours */}
        {Array.from({ length: 13 }, (_, i) => i * 2).map((h) => (
          // On phones only every 4 hours, so the labels don't touch.
          <span key={h} className={cn("absolute top-0 flex -translate-x-1/2 flex-col items-center", h % 4 !== 0 && "max-sm:hidden")} style={{ left: pos(h) }}>
            <span className="num text-[10px] text-faint">{String(h % 24).padStart(2, "0")}:00</span>
            <span className="mt-0.5 h-1.5 w-px bg-line-strong" />
          </span>
        ))}
        <span className="absolute inset-x-0 top-[30px] h-px bg-line-strong" />
        {receipts.map((r) => (
          <span
            key={`r${r.id}`}
            title={`${r.number} · ${time(r.created_at)}`}
            className="absolute top-[26px] size-2.5 -translate-x-1/2 rotate-45 rounded-[2px] bg-[var(--iso-glass-2)]"
            style={{ left: pos(hourOf(r.created_at)) }}
          />
        ))}
        {orders.map((o) => (
          <button
            key={o.id}
            type="button"
            onClick={() => onPick(o.id)}
            title={`${o.number} · ${time(o.created_at)}`}
            aria-label={o.number}
            className={cn("absolute top-[25px] size-3 -translate-x-1/2 rounded-full border-2 border-card transition hover:scale-125", tone(o), selected === o.id && "scale-150 ring-2 ring-action")}
            style={{ left: pos(hourOf(o.created_at)) }}
          />
        ))}
        {nowH !== null && (
          <span className="absolute top-0 flex h-full -translate-x-1/2 flex-col items-center" style={{ left: pos(nowH) }}>
            <span className="num rounded bg-primary px-1.5 text-[10px] font-bold text-on-primary">{time(new Date(now).toISOString())}</span>
            <span className="w-0.5 flex-1 bg-primary" />
          </span>
        )}
      </div>
      <p className="mt-1 flex gap-3 text-[10px] text-faint" dir={undefined}>
        <span className="flex items-center gap-1">
          <span className="size-2 rounded-full bg-action" /> {tr("طلب اليوم", "Order today")}
        </span>
        <span className="flex items-center gap-1">
          <span className="size-2 rotate-45 rounded-[1px] bg-[var(--iso-glass-2)]" /> {tr("استلام", "Receipt")}
        </span>
      </p>
    </div>
  );
}
