"use client";

// The bar at the bottom of the map, like the design: space used (a striped bar), cartons on the shelves,
// people working today, today's orders and stock turnover, each with ↑ / ↓ against the time before.
import { useEffect } from "react";
import { animate, motion, useMotionValue, useTransform } from "motion/react";
import { ArrowDown, ArrowUp, Boxes, ClipboardList, RefreshCw, Users, Warehouse } from "lucide-react";
import { useFmt } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import type { MapNumbers } from "./data";

/** A number that counts up to its value (and moves smoothly when the value changes). */
export function CountUp({ value, decimals = 0, suffix = "" }: { value: number; decimals?: number; suffix?: string }) {
  const n = useMotionValue(0);
  const text = useTransform(n, (v) => `${v.toLocaleString("en-US", { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}${suffix}`);
  useEffect(() => {
    const c = animate(n, value, { duration: 1.2, ease: "easeOut" });
    return () => c.stop();
  }, [value, n]);
  return <motion.span className="num">{text}</motion.span>;
}

function Change({ value }: { value: number | null }) {
  if (value === null || !Number.isFinite(value)) return null;
  const up = value >= 0;
  return (
    <span className={cn("num flex items-center gap-0.5 text-[11px] font-semibold", up ? "text-success" : "text-danger")}>
      {up ? <ArrowUp className="size-3" /> : <ArrowDown className="size-3" />}
      {Math.abs(Math.round(value))}%
    </span>
  );
}

export function MapStats({ n }: { n: MapNumbers }) {
  const { tr } = useFmt();
  const used = Math.round(n.used * 100);
  const cells: { icon: typeof Boxes; label: string; value: React.ReactNode; sub?: React.ReactNode; change?: number | null }[] = [
    { icon: Boxes, label: tr("على الرفوف", "On the shelves"), value: <CountUp value={Math.round(n.cartons)} />, sub: tr(`كارتون · محجوز ${Math.round(n.reservedCartons)}`, `cartons · ${Math.round(n.reservedCartons)} held`) },
    { icon: Users, label: tr("يعملون اليوم", "Working today"), value: <CountUp value={n.people} />, sub: tr("مندوبون وموظفون", "reps and staff") },
    { icon: ClipboardList, label: tr("طلبات اليوم", "Orders today"), value: <CountUp value={n.ordersToday} />, change: n.ordersChange, sub: tr("مقابل أمس", "vs yesterday") },
    { icon: RefreshCw, label: tr("دوران المخزون", "Stock turnover"), value: <CountUp value={n.turnover} decimals={1} suffix="%" />, change: n.turnoverChange, sub: tr("آخر 7 أيام", "last 7 days") },
  ];
  return (
    <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-[1.25fr_1fr_1fr_1fr_1fr]">
      {/* Space used: the design's striped bar */}
      <div className="rounded-2xl border border-line bg-card p-3 shadow-card">
        <p className="flex items-center gap-1.5 text-xs text-muted">
          <Warehouse className="size-3.5" /> {tr("المساحة المستخدمة", "Space used")}
        </p>
        <div className="mt-2 flex h-9 overflow-hidden rounded-xl bg-card-2">
          <motion.div
            className={cn("stripes flex items-center rounded-xl px-2.5 text-sm font-bold", used >= 85 ? "bg-action text-on-action" : "bg-primary text-on-primary")}
            initial={{ width: "0%" }}
            animate={{ width: `${Math.max(used, 18)}%` }}
            transition={{ duration: 1.1, ease: [0.22, 1, 0.36, 1] }}
          >
            <CountUp value={used} suffix="%" />
          </motion.div>
          <span className="num flex flex-1 items-center justify-center text-xs font-semibold text-muted">
            {100 - used}% {tr("فارغ", "free")}
          </span>
        </div>
      </div>
      {cells.map((c) => (
        <div key={c.label} className="rounded-2xl border border-line bg-card p-3 shadow-card">
          <p className="flex items-center gap-1.5 text-xs text-muted">
            <c.icon className="size-3.5" /> {c.label}
          </p>
          <div className="mt-1.5 flex items-baseline gap-2">
            <span className="text-xl font-bold">{c.value}</span>
            {c.change !== undefined && <Change value={c.change} />}
          </div>
          {c.sub && <p className="text-[11px] text-faint">{c.sub}</p>}
        </div>
      ))}
    </div>
  );
}
