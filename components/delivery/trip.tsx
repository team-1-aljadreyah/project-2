"use client";

// The delivery rep's trip: he picks several shops that have shipments on the way with him, and gets them as
// one ordered list (area by area, so he doesn't cross the city twice), with deliver / call / problem on each.
// The picked shops are kept on his phone (they survive closing the page), per rep.
import { useSyncExternalStore } from "react";
import { motion } from "motion/react";
import { AlertTriangle, Check, MapPin, PackageCheck, Phone, Route, X } from "lucide-react";
import { Button } from "@/components/ui";
import type { Customer, Order } from "@/lib/api/types";
import { useFmt } from "@/lib/i18n";
import { cn } from "@/lib/utils";

const EVENT = "nahrain-trip";
const keyOf = (userId: number) => `nahrain.trip.${userId}`;

function readRaw(userId: number) {
  try {
    return localStorage.getItem(keyOf(userId)) ?? "[]";
  } catch {
    return "[]";
  }
}
function subscribe(cb: () => void) {
  window.addEventListener(EVENT, cb);
  window.addEventListener("storage", cb);
  return () => {
    window.removeEventListener(EVENT, cb);
    window.removeEventListener("storage", cb);
  };
}

/** The shop ids in the trip, in the order he picked them. */
export function useTrip(userId: number): number[] {
  const raw = useSyncExternalStore(subscribe, () => readRaw(userId), () => "[]");
  try {
    return JSON.parse(raw) as number[];
  } catch {
    return [];
  }
}

export function saveTrip(userId: number, ids: number[]) {
  try {
    if (ids.length) localStorage.setItem(keyOf(userId), JSON.stringify(ids));
    else localStorage.removeItem(keyOf(userId));
  } catch {}
  window.dispatchEvent(new Event(EVENT));
}

export interface TripStop {
  customer: Customer;
  /** Still with him for this shop. */
  open: Order[];
  /** Already delivered (this trip's shops, today). */
  done: Order[];
}

/** The stops in driving order: the areas in the order he first picked them, his picks inside each area. */
export function buildTrip(ids: number[], orders: Order[], customers: Map<number, Customer>, todayIso: string): TripStop[] {
  const stops = ids
    .map((id) => customers.get(id))
    .filter((c): c is Customer => !!c)
    .map((c) => ({
      customer: c,
      open: orders.filter((o) => o.customer_id === c.id && o.delivery?.status === "out"),
      done: orders.filter((o) => o.customer_id === c.id && o.delivery?.status === "delivered" && (o.delivery.delivered_at ?? "").slice(0, 10) >= todayIso),
    }));
  const areas = [...new Set(stops.map((s) => s.customer.area))];
  return areas.flatMap((a) => stops.filter((s) => s.customer.area === a));
}

export function TripPanel({ stops, onDeliver, onProblem, onEnd }: { stops: TripStop[]; onDeliver: (o: Order) => void; onProblem: (orders: Order[]) => void; onEnd: () => void }) {
  const { tr, num } = useFmt();
  const left = stops.filter((s) => s.open.length);
  const doneCount = stops.length - left.length;
  const next = left[0];
  return (
    <section className="mb-4 overflow-hidden rounded-3xl border border-line bg-card">
      <header className="brand-panel relative flex items-center gap-3 px-4 py-3">
        <span className="flex size-10 items-center justify-center rounded-xl bg-action text-on-action">
          <Route className="size-5" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="font-bold">{tr("جولة التوصيل", "Delivery trip")}</p>
          <p className="text-xs opacity-80">{tr(`${num(doneCount)} من ${num(stops.length)} محلات سُلِّمت`, `${num(doneCount)} of ${num(stops.length)} shops done`)}</p>
        </div>
        <button type="button" onClick={onEnd} className="flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-semibold hover:bg-white/10">
          <X className="size-4" /> {left.length ? tr("إلغاء الجولة", "Cancel trip") : tr("إنهاء", "Finish")}
        </button>
        <span className="absolute inset-x-0 bottom-0 h-1 bg-white/10" aria-hidden>
          <motion.span className="block h-full bg-action" initial={false} animate={{ width: `${stops.length ? (doneCount / stops.length) * 100 : 0}%` }} />
        </span>
      </header>
      <ol className="divide-y divide-line">
        {stops.map((s, i) => {
          const done = !s.open.length;
          const isNext = s === next;
          const problem = s.open.find((o) => o.delivery?.problem);
          return (
            <li key={s.customer.id} className={cn("flex items-center gap-3 px-4 py-3", isNext && "bg-action/5")}>
              <span className={cn("flex size-8 shrink-0 items-center justify-center rounded-full text-sm font-bold", done ? "bg-success text-white" : isNext ? "bg-action text-on-action" : "bg-card-2 text-muted")}>
                {done ? <Check className="size-4" /> : num(i + 1)}
              </span>
              <div className="min-w-0 flex-1">
                <p className={cn("truncate text-sm font-semibold", done && "text-muted line-through")}>{s.customer.name}</p>
                <p className="flex items-center gap-1 text-xs text-muted">
                  <MapPin className="size-3" /> {s.customer.area}
                  {!done && ` · ${tr(`${num(s.open.length)} شحنة`, `${num(s.open.length)} shipment(s)`)}`}
                  {problem && <span className="ms-1 font-semibold text-danger">· {tr("فيها مشكلة", "has a problem")}</span>}
                </p>
              </div>
              {!done && (
                <div className="flex shrink-0 items-center gap-1">
                  <a href={`tel:${s.customer.phone}`} aria-label={tr(`اتصل بـ ${s.customer.name}`, `Call ${s.customer.name}`)} className="flex size-9 items-center justify-center rounded-lg border border-line hover:bg-card-2">
                    <Phone className="size-4" />
                  </a>
                  <button type="button" onClick={() => onProblem(s.open)} aria-label={tr("تعذّر التسليم", "Can't deliver")} className="flex size-9 items-center justify-center rounded-lg border border-line text-danger hover:bg-danger-soft">
                    <AlertTriangle className="size-4" />
                  </button>
                  <Button size="sm" variant={isNext ? "action" : "secondary"} disabled={!!s.open[0].delivery?.locked} onClick={() => onDeliver(s.open[0])}>
                    <PackageCheck className="size-4" /> {tr("تسليم", "Deliver")}
                  </Button>
                </div>
              )}
            </li>
          );
        })}
      </ol>
    </section>
  );
}
