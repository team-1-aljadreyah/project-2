"use client";

// Warehouse map, after the "Warehouse management" design Yasser chose:
// site in 3D → click a warehouse (zoom in) → its zones in 3D, then flat → click a zone → item cards and the picking path.
// A bar with the main numbers stays at the bottom, and a small rail of buttons sits on the side.
import Link from "next/link";
import { useMemo, useState, useSyncExternalStore } from "react";
import { AnimatePresence, motion, type Variants } from "motion/react";
import { ChevronLeft, ChevronRight, ClipboardList, Home, Layers, Package, PackagePlus, Route, Truck, X } from "lucide-react";
import { buildMap, mapNumbers, peopleToday, type MapZone } from "@/components/map/data";
import { SiteScene } from "@/components/map/scene";
import { MapStats } from "@/components/map/stats";
import { ZoneDetail } from "@/components/map/zone-detail";
import { ZonesView } from "@/components/map/zones";
import { useApp } from "@/components/shell";
import { Button, ErrorBox, PageHeader, Skeleton } from "@/components/ui";
import { api } from "@/lib/api";
import { useFmt } from "@/lib/i18n";
import { useLoad } from "@/lib/use-load";
import { cn } from "@/lib/utils";

type Level = { name: "site" } | { name: "warehouse"; id: number } | { name: "zone"; id: number; zone: string };

interface Camera {
  dir: number; // 1 = going in (zoom in), -1 = going out
  ox: number; // where the zoom starts, 0..1 of the box
  oy: number;
}

// Moving between levels feels like a camera: going in, the old view grows and blurs away from the point you
// clicked while the new one grows into place; going out, the opposite.
const levels: Variants = {
  enter: (c: Camera) => ({ opacity: 0, scale: c.dir > 0 ? 0.6 : 1.5, filter: "blur(8px)" }),
  center: { opacity: 1, scale: 1, filter: "blur(0px)", transition: { duration: 0.55, ease: [0.22, 1, 0.36, 1] } },
  exit: (c: Camera) => ({
    opacity: 0,
    scale: c.dir > 0 ? 2 : 0.6,
    filter: "blur(8px)",
    transformOrigin: `${c.ox * 100}% ${c.oy * 100}%`,
    transition: { duration: 0.42, ease: [0.4, 0, 1, 1] },
  }),
};

// Big screens get the 3D view; on phones the flat view is easier to read.
const wideQuery = "(min-width: 768px)";
function useWide() {
  return useSyncExternalStore(
    (cb) => {
      const m = window.matchMedia(wideQuery);
      m.addEventListener("change", cb);
      return () => m.removeEventListener("change", cb);
    },
    () => window.matchMedia(wideQuery).matches,
    () => true,
  );
}

export default function MapPage() {
  const { tr, name, lang } = useFmt();
  const { user, lookups, items } = useApp();
  const wide = useWide();
  const shelf = useLoad(() => api.shelfStock(), []);
  const batches = useLoad(() => api.listBatches(), []);
  const orders = useLoad(() => api.listOrders(), []);
  const invoices = useLoad(() => api.listInvoices(), []);

  const [level, setLevel] = useState<Level>({ name: "site" });
  const [camera, setCamera] = useState<Camera>({ dir: 1, ox: 0.5, oy: 0.5 });
  const [threeD, setThreeD] = useState(true);
  const [showPath, setShowPath] = useState(true);
  const [hoverZone, setHoverZone] = useState<string | null>(null);
  const view3d = threeD && wide;
  const Sep = lang === "ar" ? ChevronLeft : ChevronRight;

  const views = useMemo(
    () =>
      shelf.data && batches.data && orders.data
        ? buildMap({ items, warehouses: lookups.warehouses, shelf: shelf.data, batches: batches.data, orders: orders.data, reps: lookups.reps })
        : null,
    [items, lookups, shelf.data, batches.data, orders.data],
  );
  const people = useMemo(() => peopleToday(orders.data ?? [], invoices.data ?? [], lookups.reps), [orders.data, invoices.data, lookups.reps]);

  const failed = [shelf, batches, orders].find((l) => l.state.status === "error");
  if (failed && failed.state.status === "error") return <ErrorBox error={failed.state.error} onRetry={failed.reload} />;

  const current = level.name === "site" ? undefined : views?.find((v) => v.wh.id === level.id);
  const zone = level.name === "zone" ? current?.zones.find((z) => z.code === level.zone) : undefined;
  const other = current ? views?.find((v) => v.wh.id !== current.wh.id) : undefined;
  const scope = current ? [current.wh.id] : lookups.warehouses.map((w) => w.id);
  const numbers = views ? mapNumbers(views, scope, orders.data ?? [], invoices.data ?? [], people) : null;
  const waiting = (orders.data ?? []).filter((o) => o.status === "pending").length;
  const canMove = user.role === "manager" || user.role === "warehouse";

  const go = (next: Level, cam: Camera) => {
    setCamera(cam);
    setHoverZone(null);
    setLevel(next);
  };
  const up = () => {
    if (level.name === "zone") go({ name: "warehouse", id: level.id }, { dir: -1, ox: 0.5, oy: 0.5 });
    else if (level.name === "warehouse") go({ name: "site" }, { dir: -1, ox: 0.5, oy: 0.5 });
  };
  // Clicking a zone in 3D: first the floor lies down flat (like the design), then the camera goes into the zone.
  const pickZone = (z: MapZone, el: HTMLElement) => {
    if (level.name !== "warehouse") return;
    const box = el.closest("[data-map-stage]")?.getBoundingClientRect();
    const r = el.getBoundingClientRect();
    const cam = box ? { dir: 1, ox: (r.left + r.width / 2 - box.left) / box.width, oy: (r.top + r.height / 2 - box.top) / box.height } : { dir: 1, ox: 0.5, oy: 0.5 };
    const open = () => go({ name: "zone", id: level.id, zone: z.code }, cam);
    if (view3d) {
      setThreeD(false);
      setTimeout(open, 650);
    } else open();
  };

  const crumbs: { label: string; onClick?: () => void }[] = [{ label: tr("المخازن", "Warehouses"), onClick: level.name !== "site" ? () => go({ name: "site" }, { dir: -1, ox: 0.5, oy: 0.5 }) : undefined }];
  if (current) crumbs.push({ label: name(current.wh), onClick: level.name === "zone" ? up : undefined });
  if (zone) crumbs.push({ label: `${zone.code} · ${zone.category}` });

  const rail: { icon: typeof Home; label: string; onClick?: () => void; href?: string; active?: boolean; disabled?: boolean }[] = [
    { icon: Home, label: tr("كل المخازن", "All warehouses"), onClick: () => go({ name: "site" }, { dir: -1, ox: 0.5, oy: 0.5 }), active: level.name === "site" },
    { icon: Layers, label: view3d ? tr("عرض مسطّح", "Flat view") : tr("عرض مجسّم", "3D view"), onClick: () => setThreeD((v) => !v), active: view3d, disabled: level.name !== "warehouse" || !wide },
    { icon: Route, label: tr("مسار التجهيز", "Picking path"), onClick: () => setShowPath((v) => !v), active: showPath, disabled: level.name !== "zone" },
    ...(canMove ? [{ icon: Truck, label: tr("التحويل بين المخازن", "Transfers"), href: "/transfers" }] : []),
    { icon: Package, label: tr("جدول المخزون", "Stock table"), href: "/stock" },
  ];

  return (
    <>
      <PageHeader
        title={tr("خريطة المخازن", "Warehouse map")}
        subtitle={tr("اضغط على المخزن حتى تدخل له، وعلى المنطقة حتى تشوف موادها", "Click a warehouse to go inside, and a zone to see its items")}
        actions={
          <>
            <Button href="/orders">
              <ClipboardList className="size-4" /> {tr("طلبات تنتظر", "Waiting orders")} <span className="num rounded-md bg-primary-soft px-1.5 text-xs text-primary-ink">{waiting}</span>
            </Button>
            {canMove && (
              <Button variant="action" href="/receipts/new">
                <PackagePlus className="size-4" /> {tr("استلام بضاعة", "Receive goods")}
              </Button>
            )}
          </>
        }
      />

      {/* isolate: the map's layers stay inside it, so nothing here can slide over the sticky top bar */}
      <div className="map-canvas relative isolate overflow-hidden rounded-3xl border border-line">
        {/* Top bar: where you are, and a button to go back up */}
        <div className="relative z-30 flex items-center justify-between gap-3 px-4 pt-4 sm:px-6">
          <nav aria-label={tr("مكانك بالخريطة", "Where you are")} className="flex min-w-0 flex-wrap items-center gap-1 text-sm">
            {crumbs.map((c, i) => (
              <span key={i} className="flex items-center gap-1">
                {i > 0 && <Sep className="size-4 text-faint" />}
                {c.onClick ? (
                  <button type="button" onClick={c.onClick} className="rounded-lg px-1.5 py-0.5 text-muted hover:bg-card hover:text-text">
                    {c.label}
                  </button>
                ) : (
                  <span className="px-1.5 font-semibold">{c.label}</span>
                )}
              </span>
            ))}
          </nav>
          {level.name !== "site" && (
            <button type="button" onClick={up} aria-label={tr("رجوع لمستوى أعلى", "Back up one level")} className="flex size-9 items-center justify-center rounded-xl border border-line bg-card text-muted shadow-sm hover:text-text">
              <X className="size-4" />
            </button>
          )}
        </div>

        <div className="flex">
          {/* The rail of map buttons, like the design's slim side bar */}
          <div className="relative z-30 hidden flex-col gap-1.5 p-3 sm:flex">
            {rail.map((b) => {
              const cls = cn(
                "flex size-10 items-center justify-center rounded-xl transition",
                b.active ? "bg-text text-bg" : "bg-card text-muted shadow-sm hover:text-text",
                b.disabled && "pointer-events-none opacity-35",
              );
              return b.href ? (
                <Link key={b.label} href={b.href} className={cls} title={b.label} aria-label={b.label}>
                  <b.icon className="size-[18px]" />
                </Link>
              ) : (
                <button key={b.label} type="button" onClick={b.onClick} className={cls} title={b.label} aria-label={b.label} aria-pressed={b.active} disabled={b.disabled}>
                  <b.icon className="size-[18px]" />
                </button>
              );
            })}
          </div>

          {/* The stage: one level at a time, with the camera move between them */}
          <div data-map-stage className="relative min-h-[300px] min-w-0 flex-1 md:min-h-[560px]">
            {!views ? (
              <div className="p-6">
                <Skeleton className="h-[480px]" />
              </div>
            ) : (
              <AnimatePresence mode="wait" custom={camera}>
                <motion.div
                  key={level.name === "site" ? "site" : level.name === "warehouse" ? `wh-${level.id}` : `zone-${level.id}-${level.zone}`}
                  custom={camera}
                  variants={levels}
                  initial="enter"
                  animate="center"
                  exit="exit"
                  className="will-change-transform"
                >
                  {level.name === "site" && (
                    <div className="px-2 pb-4 pt-2 sm:px-6">
                      <SiteScene
                        warehouses={views}
                        people={people}
                        myWarehouseId={user.role === "warehouse" ? user.warehouse_id : undefined}
                        onEnter={(id, o) => go({ name: "warehouse", id }, { dir: 1, ox: o.x, oy: o.y })}
                      />
                    </div>
                  )}
                  {level.name === "warehouse" && current && (
                    <ZonesView view={current} view3d={view3d} hovered={hoverZone} onHover={setHoverZone} onPick={pickZone} />
                  )}
                  {level.name === "zone" && current && zone && <ZoneDetail view={current} zone={zone} showPath={showPath} other={other} />}
                </motion.div>
              </AnimatePresence>
            )}
          </div>
        </div>

        {/* The numbers bar stays at the bottom while you move around */}
        <div className="relative z-30 border-t border-line bg-card/60 p-3 backdrop-blur sm:p-4">
          {numbers ? <MapStats n={numbers} /> : <Skeleton className="h-20" />}
        </div>
      </div>
    </>
  );
}
