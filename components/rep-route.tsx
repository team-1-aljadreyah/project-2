"use client";

// The rep's "today's route", after the delivery-tracking screen of the medicine app Yasser chose for the rep:
// a drawn map of Karbala's areas with the day's stops on a route, a bubble on the next stop,
// and a card for the next shop (call, WhatsApp, "visited"). Plus the customer sheet (the design's product screen).
import { useSyncExternalStore } from "react";
import { motion, useReducedMotion } from "motion/react";
import { Check, CheckCircle2, MessageCircle, Phone, ShoppingCart, Store, Wallet } from "lucide-react";
import { Button, Dialog, LimitBar } from "@/components/ui";
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

// ---------- The drawn map ----------

const W = 360;
const H = 260;
// Places on the map for the areas (spread out, away from the edges and the river).
const SLOTS = [
  [70, 60], [150, 45], [240, 55], [310, 85], [55, 135], [130, 120], [215, 125], [295, 160],
  [80, 205], [160, 195], [240, 210], [315, 225],
] as const;
const DEPOT = { x: 185, y: 235 }; // the company's main warehouse, where the day starts

function hash(s: string) {
  let h = 0;
  for (const ch of s) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return h;
}

/** Every area gets a fixed place on the map (the same every day), without two areas on the same place. */
function areaPlaces(areas: string[]) {
  const used = new Set<number>();
  const out = new Map<string, { x: number; y: number }>();
  for (const a of [...areas].sort()) {
    let i = hash(a) % SLOTS.length;
    while (used.has(i)) i = (i + 1) % SLOTS.length;
    used.add(i);
    out.set(a, { x: SLOTS[i][0], y: SLOTS[i][1] });
  }
  return out;
}

/** A soft, wavy route through the points (like the design's GPS line). */
function wavy(points: { x: number; y: number }[]) {
  if (!points.length) return "";
  let d = `M ${points[0].x} ${points[0].y}`;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1];
    const b = points[i];
    const mx = (a.x + b.x) / 2;
    const my = (a.y + b.y) / 2;
    // Push the middle sideways a little, alternating, so the line bends like streets.
    const k = i % 2 ? 14 : -14;
    const len = Math.hypot(b.x - a.x, b.y - a.y) || 1;
    d += ` Q ${mx + (-(b.y - a.y) / len) * k} ${my + ((b.x - a.x) / len) * k} ${b.x} ${b.y}`;
  }
  return d;
}

export function RouteMap({ stops, visited, onPick }: { stops: Stop[]; visited: number[]; onPick: (c: Customer) => void }) {
  const { tr } = useFmt();
  const still = useReducedMotion();
  const places = areaPlaces([...new Set(stops.map((s) => s.customer.area))]);
  // Shops in the same area sit around the area's point, not on top of each other.
  const seen = new Map<string, number>();
  const pts = stops.map((s) => {
    const p = places.get(s.customer.area)!;
    const n = seen.get(s.customer.area) ?? 0;
    seen.set(s.customer.area, n + 1);
    return { x: p.x + (n % 2 ? 16 : -10) * Math.min(n, 1) + n * 4, y: p.y + n * 12 };
  });
  const nextIdx = stops.findIndex((s) => !visited.includes(s.customer.id));
  const route = wavy([DEPOT, ...pts]);
  // The van stands at the last visited shop (or at the warehouse before the first visit).
  const lastDone = [...stops.keys()].filter((i) => visited.includes(stops[i].customer.id)).pop();
  // Before the first visit it waits next to the warehouse (not on top of it).
  const van = lastDone === undefined ? { x: DEPOT.x + 30, y: DEPOT.y + 14 } : pts[lastDone];

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label={tr("خريطة جولة اليوم", "Today's route map")} style={{ direction: "ltr" }}>
      <rect width={W} height={H} rx="20" className="fill-[var(--iso-ground)]" />
      {/* The city: a river, two parks and some streets (drawn, not a real map) */}
      <path d="M -10 150 C 60 120, 110 175, 175 150 S 290 95, 370 120" fill="none" className="stroke-[var(--iso-glass)]" strokeWidth="16" strokeLinecap="round" opacity="0.7" />
      <ellipse cx="45" cy="225" rx="40" ry="22" className="fill-[var(--iso-tree)]" opacity="0.35" />
      <ellipse cx="300" cy="30" rx="45" ry="20" className="fill-[var(--iso-tree)]" opacity="0.35" />
      {[40, 100, 190, 270, 330].map((x) => (
        <line key={`v${x}`} x1={x} y1="0" x2={x + 20} y2={H} className="stroke-[var(--iso-road)]" strokeWidth="6" />
      ))}
      {[30, 95, 185, 245].map((y) => (
        <line key={`h${y}`} x1="0" y1={y} x2={W} y2={y - 12} className="stroke-[var(--iso-road)]" strokeWidth="6" />
      ))}

      {/* The route: grey for all of it, orange for the part already done */}
      <path d={route} fill="none" className="stroke-[var(--line-strong)]" strokeWidth="3" strokeDasharray="2 6" strokeLinecap="round" />
      {lastDone !== undefined && (
        <path d={wavy([DEPOT, ...pts.slice(0, lastDone + 1)])} fill="none" className="stroke-action" strokeWidth="3.5" strokeLinecap="round" />
      )}

      {/* The warehouse */}
      <g transform={`translate(${DEPOT.x} ${DEPOT.y})`}>
        <rect x="-11" y="-11" width="22" height="22" rx="6" className="fill-primary" />
        <path d="M -6 3 V -2 L 0 -6 L 6 -2 V 3 Z" className="fill-[var(--on-primary)]" />
      </g>

      {/* The stops */}
      {stops.map((s, i) => {
        const p = pts[i];
        const done = visited.includes(s.customer.id);
        const next = i === nextIdx;
        return (
          <g key={s.customer.id} transform={`translate(${p.x} ${p.y})`} onClick={() => onPick(s.customer)} className="cursor-pointer">
            <title>{s.customer.name}</title>
            {next && !still && (
              <circle r="14" className="fill-action" opacity="0.25">
                <animate attributeName="r" values="11;20;11" dur="1.8s" repeatCount="indefinite" />
              </circle>
            )}
            <circle r="10" className={done ? "fill-success" : next ? "fill-action" : "fill-[var(--card)] stroke-[var(--line-strong)]"} strokeWidth="2" />
            {done ? (
              <path d="M -4 0 L -1 3 L 4 -3" fill="none" className="stroke-white" strokeWidth="2" strokeLinecap="round" />
            ) : (
              <text y="4" textAnchor="middle" className={cn("text-[10px] font-bold", next ? "fill-[var(--on-action)]" : "fill-text")}>
                {i + 1}
              </text>
            )}
          </g>
        );
      })}

      {/* The van */}
      <motion.g initial={false} animate={{ x: van.x, y: van.y - 18 }} transition={{ type: "spring", stiffness: 120, damping: 16 }}>
        <rect x="-10" y="-7" width="20" height="13" rx="4" className="fill-primary stroke-[var(--iso-ground)]" strokeWidth="2" />
        <circle cx="-5" cy="7" r="2.5" className="fill-primary" />
        <circle cx="5" cy="7" r="2.5" className="fill-primary" />
      </motion.g>

      {/* The bubble on the next stop, like the design's "10 min" bubble */}
      {nextIdx >= 0 && (
        <g transform={`translate(${Math.min(W - 75, Math.max(75, pts[nextIdx].x))} ${Math.max(26, pts[nextIdx].y - 30)})`} className="pointer-events-none">
          <rect x="-70" y="-17" width="140" height="26" rx="13" className="fill-[var(--card)] stroke-[var(--line)]" />
          <circle cx="-56" cy="-4" r="9" className="fill-action" />
          <text x="-56" y="-0.5" textAnchor="middle" className="fill-[var(--on-action)] text-[10px] font-bold">
            {nextIdx + 1}
          </text>
          <text x="-42" y="0" className="fill-text text-[11px] font-bold">
            {(() => {
              const n = stops[nextIdx].customer.name;
              return n.length > 16 ? n.slice(0, 15) + "…" : n;
            })()}
          </text>
        </g>
      )}
    </svg>
  );
}

// ---------- The next-stop card (the design's courier card) ----------

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

