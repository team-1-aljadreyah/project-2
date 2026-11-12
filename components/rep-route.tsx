"use client";

// The rep's "today's route", after the delivery-tracking screen of the medicine app Yasser chose for the rep:
// a drawn map of Karbala's areas with the day's stops on a route, a bubble on the next stop,
// and a card for the next shop (call, WhatsApp, "visited"). Plus the customer sheet (the design's product screen).
import { useSyncExternalStore } from "react";
import { motion } from "motion/react";
import { Check, CheckCircle2, MessageCircle, Phone, ShoppingCart, Store, Wallet } from "lucide-react";
import { Button, Dialog, LimitBar } from "@/components/ui";
import { curve, shopPlace, warehousePlace } from "@/components/delivery/live-map";
import { OpenInMaps } from "@/components/open-in-maps";
import { useRoadRoute } from "@/lib/road";
import { CityMap, type LatLng, type MapMarker } from "@/components/map3d/city-map";
import { useApp } from "@/components/shell";
import type { Customer } from "@/lib/api/types";
import { useFmt } from "@/lib/i18n";
import { cn, today } from "@/lib/utils";

// ---------- Which shops to visit today, and why ----------

export type Reason = "over" | "near" | "quiet" | "debt";

export interface Stop {
  customer: Customer;
  reason: Reason;
  /** Days since the last order (for "quiet" shops). */
  days?: number;
}

const DAY = 86_400_000;

/**
 * The day's stops: shops over their debt limit (collect), near it, shops that stopped ordering for a week,
 * then the biggest debts. At most 8, grouped by area so the rep doesn't cross the city twice.
 */
export function buildStops(customers: Customer[], now: number): Stop[] {
  const scored = customers
    .filter((c) => c.active && !c.pending)
    .map((c) => {
      const bal = c.balance ?? 0;
      const lim = c.debt_limit ?? 0;
      const days = c.last_order_at && now ? Math.floor((now - new Date(c.last_order_at).getTime()) / DAY) : undefined;
      let reason: Reason | null = null;
      let score = 0;
      if (lim > 0 && bal >= lim) [reason, score] = ["over", 400 + bal / lim];
      else if (lim > 0 && bal / lim >= 0.7) [reason, score] = ["near", 300 + bal / lim];
      else if (days !== undefined && days >= 7) [reason, score] = ["quiet", 200 + days];
      else if (bal > 0) [reason, score] = ["debt", 100 + bal / 1_000_000];
      return reason ? { stop: { customer: c, reason, days } as Stop, score } : null;
    })
    .filter((x): x is { stop: Stop; score: number } => !!x)
    .sort((a, b) => b.score - a.score)
    .slice(0, 8)
    .map((x) => x.stop);
  // Keep the most urgent area first, then walk area by area.
  const areas = [...new Set(scored.map((s) => s.customer.area))];
  return areas.flatMap((a) => scored.filter((s) => s.customer.area === a));
}

export function reasonText(s: Stop, tr: (ar: string, en: string) => string) {
  return {
    over: tr("فوق السقف: تحصيل", "Over the limit: collect"),
    near: tr("قريب من السقف", "Near the limit"),
    quiet: tr(`لم يطلب منذ ${s.days} يوم`, `No order for ${s.days} days`),
    debt: tr("عليه دين", "Has debt"),
  }[s.reason];
}

export const reasonTone: Record<Reason, string> = {
  over: "bg-danger-soft text-danger",
  near: "bg-warning-soft text-warning",
  quiet: "bg-primary-soft text-primary-ink",
  debt: "bg-card-2 text-muted",
};

// ---------- Visited shops (saved on the rep's phone, for today only) ----------

const EVENT = "nahrain-visits";
const keyOf = (userId: number) => `nahrain.visits.${userId}.${today()}`;
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

/** The ids of the shops visited today. The snapshot is the saved text, so React compares it by value. */
export function useVisits(userId: number): number[] {
  const raw = useSyncExternalStore(
    subscribe,
    () => readRaw(userId),
    () => "[]",
  );
  try {
    return JSON.parse(raw) as number[];
  } catch {
    return [];
  }
}

export function toggleVisit(userId: number, customerId: number) {
  const list = new Set<number>(JSON.parse(readRaw(userId)) as number[]);
  if (list.has(customerId)) list.delete(customerId);
  else list.add(customerId);
  try {
    localStorage.setItem(keyOf(userId), JSON.stringify([...list]));
  } catch {}
  window.dispatchEvent(new Event(EVENT));
}

// ---------- The map of the day's route ----------
// The same 3D city map as everywhere (components/map3d): the warehouse, the day's shops numbered in order,
// the next one highlighted, the visited ones greyed, and the glowing route between them. Tap a shop to open it.

export function RouteMap({ stops, visited, onPick }: { stops: Stop[]; visited: number[]; onPick: (c: Customer) => void }) {
  const { tr, num } = useFmt();
  const { lookups } = useApp();
  const start = warehousePlace(lookups.warehouses[0]);
  const places = stops.map((s) => ({ s, p: shopPlace(s.customer) })).filter((x) => x.p) as { s: Stop; p: LatLng }[];
  const nextIdx = places.findIndex((x) => !visited.includes(x.s.customer.id));
  const markers: MapMarker[] = [
    ...(start ? [{ id: "wh", kind: "warehouse" as const, ...start, label: tr("المخزن", "Warehouse") }] : []),
    ...places.map((x, i) => ({
      id: `s${x.s.customer.id}`,
      kind: "shop" as const,
      ...x.p,
      index: i + 1,
      label: x.s.customer.name,
      active: i === nextIdx,
      done: visited.includes(x.s.customer.id),
      onClick: () => onPick(x.s.customer),
    })),
  ];
  const pts = [...(start ? [start] : []), ...places.map((x) => x.p)];
  // Along the streets once the road is known (a gentle curve per leg until then).
  const road = useRoadRoute(pts.length > 1 ? pts : null);
  const route = road?.path ?? pts.slice(1).flatMap((p, i) => curve(pts[i], p, 16).slice(i ? 1 : 0));
  const done = places.length ? places.filter((x) => visited.includes(x.s.customer.id)).length / places.length : 0;
  if (!places.length) return <p className="py-10 text-center text-sm text-muted">{tr("لا توجد محلات بموقع على الخريطة اليوم", "No shops with a map location today")}</p>;
  return (
    <CityMap markers={markers} route={route} routeDone={done} className="h-80">
      <span className="pointer-events-none absolute start-3 top-3 z-10 rounded-full bg-black/65 px-3 py-1 text-xs font-semibold text-white backdrop-blur">
        {tr(`${num(places.length)} محلات اليوم`, `${num(places.length)} shops today`)}
        {road && tr(` · ${num(Math.round(road.km * 10) / 10)} كم · ${num(road.min)} دقيقة`, ` · ${num(Math.round(road.km * 10) / 10)} km · ${num(road.min)} min`)}
      </span>
    </CityMap>
  );
}

export function NextStopCard({ stop, index, total, done, userId, onOpen }: { stop?: Stop; index: number; total: number; done: number; userId: number; onOpen: (c: Customer) => void }) {
  const { tr, money } = useFmt();
  if (!stop) {
    return (
      <div className="flex items-center gap-3 rounded-2xl bg-success-soft p-4 text-success">
        <CheckCircle2 className="size-6 shrink-0" />
        <div>
          <p className="font-bold">{tr("أكملت جولة اليوم", "Today's route is done")}</p>
          <p className="text-xs">{tr(`زرت ${done} من ${total} محلات`, `You visited ${done} of ${total} shops`)}</p>
        </div>
      </div>
    );
  }
  const c = stop.customer;
  const wa = c.phone.replace(/^0/, "964");
  return (
    <motion.div key={c.id} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="rounded-2xl border border-line bg-card p-3 shadow-sm">
      <div className="flex items-center gap-3">
        <button type="button" onClick={() => onOpen(c)} className="flex min-w-0 flex-1 items-center gap-3 text-start">
          <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-action text-lg font-bold text-on-action">{index + 1}</span>
          <span className="min-w-0">
            <span className="block text-[11px] text-muted">{tr("المحطة التالية", "Next stop")}</span>
            <span className="block truncate font-bold">{c.name}</span>
            <span className="block truncate text-xs text-muted">
              {c.area} · <span className="num">{money(c.balance ?? 0)}</span>
            </span>
          </span>
        </button>
        {shopPlace(c) && <OpenInMaps compact variant="action" className="size-10 rounded-full" text={tr(`الطريق إلى ${c.name}`, `The way to ${c.name}`)} to={{ ...shopPlace(c)!, label: c.name }} />}
        <a href={`tel:${c.phone}`} aria-label={tr("اتصال", "Call")} className="flex size-10 shrink-0 items-center justify-center rounded-full bg-card-2 text-primary-ink hover:bg-line">
          <Phone className="size-4" />
        </a>
      </div>
      <span className={cn("mt-2 inline-block rounded-full px-2 py-0.5 text-[11px] font-semibold", reasonTone[stop.reason])}>{reasonText(stop, tr)}</span>
      <div className="mt-3 flex gap-2">
        <a href={`https://wa.me/${wa}`} target="_blank" rel="noreferrer" className="flex h-10 flex-1 items-center gap-2 rounded-xl bg-card-2 px-3 text-sm text-muted hover:text-text">
          <MessageCircle className="size-4" /> {tr("راسل المحل", "Message the shop")}
        </a>
        <button type="button" onClick={() => toggleVisit(userId, c.id)} className="flex h-10 items-center gap-1.5 rounded-xl bg-primary px-3 text-sm font-semibold text-on-primary hover:bg-primary-hover">
          <Check className="size-4" /> {tr("تمت الزيارة", "Visited")}
        </button>
      </div>
    </motion.div>
  );
}

// ---------- The customer sheet (the design's product screen) ----------

export function CustomerSheet({ customer, stop, onClose, visited, userId }: { customer: Customer; stop?: Stop; onClose: () => void; visited: boolean; userId: number }) {
  const { tr, money, ago } = useFmt();
  const bal = customer.balance ?? 0;
  const lim = customer.debt_limit ?? 0;
  const left = Math.max(0, lim - bal);
  const pct = lim ? Math.min(100, Math.round((bal / lim) * 100)) : 0;
  return (
    <Dialog
      open
      onClose={onClose}
      title={customer.name}
      footer={
        <div className="grid w-full grid-cols-2 gap-2">
          <Button variant="primary" href={`/payments/new?customer=${customer.id}`} className="h-12">
            <Wallet className="size-4" /> {tr("استلام تسديد", "Take payment")}
          </Button>
          <Button variant="action" href={`/orders/new?customer=${customer.id}`} className="h-12">
            <ShoppingCart className="size-4" /> {tr("طلب جديد", "New order")}
          </Button>
        </div>
      }
    >
      {/* The big picture: the shop's letter on a soft tile, like the design's big pill */}
      <div className="relative flex h-40 items-center justify-center overflow-hidden rounded-2xl bg-gradient-to-br from-action/25 to-action/5">
        <span className="absolute -start-6 -top-6 size-24 rounded-full bg-action/15" aria-hidden />
        <span className="flex size-20 items-center justify-center rounded-3xl bg-card text-4xl font-bold text-action shadow-lg">{customer.name.trim()[0]}</span>
        {visited && (
          <span className="absolute end-3 top-3 flex items-center gap-1 rounded-full bg-success px-2 py-0.5 text-[11px] font-bold text-white">
            <Check className="size-3" /> {tr("زرته اليوم", "Visited today")}
          </span>
        )}
      </div>
      <div className="mt-4 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-lg font-bold">{customer.name}</p>
          <p className="text-sm text-muted">
            {customer.owner_name} · {customer.area}
          </p>
        </div>
        {stop && <span className={cn("shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold", reasonTone[stop.reason])}>{reasonText(stop, tr)}</span>}
      </div>

      {/* Debt with a bar, like the design's price + "in stock" bar */}
      <div className="mt-4 flex items-center gap-4">
        <p className="num text-2xl font-bold">{money(bal)}</p>
        <div className="flex-1">
          <p className="mb-1 text-[11px] text-muted">{tr(`${pct}% من السقف`, `${pct}% of the limit`)}</p>
          <LimitBar balance={bal} limit={lim} />
        </div>
      </div>

      {/* The info grid, like the design's dosage / manufacturer grid */}
      <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
        <Info k={tr("سقف الدين", "Debt limit")} v={money(lim)} />
        <Info k={tr("المتاح للطلب", "Can still order")} v={money(left)} />
        <Info k={tr("آخر طلب", "Last order")} v={customer.last_order_at ? ago(customer.last_order_at) : tr("لم يطلب بعد", "No orders yet")} />
        <Info k={tr("الهاتف", "Phone")} v={<span dir="ltr">{customer.phone}</span>} />
      </dl>

      <div className="mt-4 flex gap-2">
        <a href={`tel:${customer.phone}`} className="flex h-10 flex-1 items-center justify-center gap-1.5 rounded-xl border border-line-strong text-sm font-semibold hover:bg-card-2">
          <Phone className="size-4" /> {tr("اتصال", "Call")}
        </a>
        <button type="button" onClick={() => toggleVisit(userId, customer.id)} className={cn("flex h-10 flex-1 items-center justify-center gap-1.5 rounded-xl border text-sm font-semibold", visited ? "border-success bg-success-soft text-success" : "border-line-strong hover:bg-card-2")}>
          <Check className="size-4" /> {visited ? tr("زرته اليوم", "Visited today") : tr("تمت الزيارة", "Mark visited")}
        </button>
      </div>
      {shopPlace(customer) && <OpenInMaps className="mt-2 w-full" size="md" text={tr("الطريق إلى المحل", "The way to the shop")} to={{ ...shopPlace(customer)!, label: customer.name }} />}
      <Button variant="ghost" size="sm" href={`/customers/${customer.id}`} className="mt-2 w-full">
        <Store className="size-4" /> {tr("ملف الزبون الكامل", "Full customer file")}
      </Button>
    </Dialog>
  );
}

function Info({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div>
      <dt className="text-[11px] text-muted">{k}</dt>
      <dd className="num font-bold">{v}</dd>
    </div>
  );
}

