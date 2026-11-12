"use client";

// The delivery maps, on the 3D city map (components/map3d):
//   RepTripMap        the delivery rep: the warehouse, his stops in order, the glowing route, and where he is.
//   ShipmentTracker   the shop owner: his order coming, the rep moving toward his shop, and when it arrives.
//   DeliveriesOverview the manager / keeper: every shipment on the way and where each rep is now.
//
// Where the rep is: his phone sends it every few seconds while he has shipments on the way (useShareLocation),
// and it arrives live over the WebSocket (topic "location"). Before the first one arrives, the tracker
// estimates it from the time the shipment left (about 25 km/h in the city), and says so.
import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { Clock, LocateFixed, Navigation, Radio } from "lucide-react";
import { CityMap, type LatLng, type MapMarker } from "@/components/map3d/city-map";
import { OpenInMaps } from "@/components/open-in-maps";
import { shareAlong, useRoadRoute } from "@/lib/road";
import { api } from "@/lib/api";
import type { Customer, Order, Warehouse } from "@/lib/api/types";
import { useFmt } from "@/lib/i18n";
import { publish, useRealtime } from "@/lib/realtime";
import { useLoad } from "@/lib/use-load";
import { cn } from "@/lib/utils";

type Loc = { rep_id: number; lat: number; lng: number; at: string };

// ---------- small helpers ----------

/** Distance in km. */
export function km(a: LatLng, b: LatLng) {
  const r = (d: number) => (d * Math.PI) / 180;
  const h = Math.sin(r(b.lat - a.lat) / 2) ** 2 + Math.cos(r(a.lat)) * Math.cos(r(b.lat)) * Math.sin(r(b.lng - a.lng) / 2) ** 2;
  return 12742 * Math.asin(Math.sqrt(h));
}

/** A gentle curve between two places (a straight ruler line looks wrong over a city). */
export function curve(a: LatLng, b: LatLng, n = 24): LatLng[] {
  const mid = { lat: (a.lat + b.lat) / 2, lng: (a.lng + b.lng) / 2 };
  const off = { lat: -(b.lng - a.lng) * 0.18, lng: (b.lat - a.lat) * 0.18 };
  const c = { lat: mid.lat + off.lat, lng: mid.lng + off.lng };
  return Array.from({ length: n + 1 }, (_, i) => {
    const t = i / n;
    return {
      lat: (1 - t) ** 2 * a.lat + 2 * (1 - t) * t * c.lat + t ** 2 * b.lat,
      lng: (1 - t) ** 2 * a.lng + 2 * (1 - t) * t * c.lng + t ** 2 * b.lng,
    };
  });
}

/** The point at `t` (0..1) along a line of points. */
function along(pts: LatLng[], t: number): LatLng {
  if (pts.length < 2) return pts[0];
  const i = Math.min(pts.length - 2, Math.floor(t * (pts.length - 1)));
  const f = t * (pts.length - 1) - i;
  return {
    lat: pts[i].lat + (pts[i + 1].lat - pts[i].lat) * f,
    lng: pts[i].lng + (pts[i + 1].lng - pts[i].lng) * f,
  };
}

const placeOf = (x: { lat?: number; lng?: number } | undefined): LatLng | null => (x && x.lat !== undefined && x.lng !== undefined ? { lat: x.lat, lng: x.lng } : null);
export const shopPlace = (c: Customer | undefined) => placeOf(c?.address_info);
export const warehousePlace = (w: Warehouse | undefined) => placeOf(w);

// A clock that ticks every 3 seconds, for the moving estimate.
let tick = Date.now();
const tickers = new Set<() => void>();
let tickTimer: ReturnType<typeof setInterval> | undefined;
function useTick() {
  return useSyncExternalStore(
    (l) => {
      tickers.add(l);
      if (!tickTimer)
        tickTimer = setInterval(() => {
          tick = Date.now();
          tickers.forEach((x) => x());
        }, 3000);
      return () => {
        tickers.delete(l);
        if (!tickers.size && tickTimer) {
          clearInterval(tickTimer);
          tickTimer = undefined;
        }
      };
    },
    () => tick,
    () => 0,
  );
}

// ---------- where the reps are (live) ----------

export function useRepLocations() {
  const first = useLoad(() => api.repLocations().catch(() => [] as Loc[]), []);
  const [live, setLive] = useState<Record<number, Loc>>({});
  useRealtime(["location"], (e) => {
    const l = e.data as Loc | undefined;
    if (l && typeof l.lat === "number") setLive((m) => ({ ...m, [l.rep_id]: l }));
  });
  return useMemo(() => {
    const all: Record<number, Loc> = {};
    for (const l of first.data ?? []) all[l.rep_id] = l;
    for (const [id, l] of Object.entries(live)) if (!all[+id] || all[+id].at < l.at) all[+id] = l;
    return all;
  }, [first.data, live]);
}

/** The rep's phone sends where it is every ~10 s while `active` (shipments on the way with him). */
export function useShareLocation(active: boolean) {
  const [state, setState] = useState<"off" | "on" | "denied">("off");
  const [me, setMe] = useState<LatLng | null>(null);
  useEffect(() => {
    if (!active || typeof navigator === "undefined" || !navigator.geolocation) return;
    let last = 0;
    const id = navigator.geolocation.watchPosition(
      async (p) => {
        const here = { lat: p.coords.latitude, lng: p.coords.longitude };
        setMe(here);
        setState("on");
        if (Date.now() - last < 10_000) return;
        last = Date.now();
        try {
          const loc = await api.sendLocation(here.lat, here.lng);
          publish("location", "moved", loc);
        } catch {}
      },
      () => setState("denied"),
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 15000 },
    );
    return () => navigator.geolocation.clearWatch(id);
  }, [active]);
  return { state: active ? state : "off", me };
}

// ---------- the delivery rep ----------

export interface Stop {
  customer: Customer;
  done?: boolean;
  /** Its shipment is still at the warehouse. */
  waiting?: boolean;
}

export function RepTripMap({ stops, warehouse, sharing }: { stops: Stop[]; warehouse?: Warehouse; sharing: ReturnType<typeof useShareLocation> }) {
  const { tr, num } = useFmt();
  const start = warehousePlace(warehouse);
  const places = stops.map((s) => ({ s, p: shopPlace(s.customer) })).filter((x) => x.p) as { s: Stop; p: LatLng }[];
  const nextIdx = places.findIndex((x) => !x.s.done);
  const markers: MapMarker[] = [
    ...(start
      ? [
          {
            id: "wh",
            kind: "warehouse" as const,
            ...start,
            label: tr("المخزن", "Warehouse"),
          },
        ]
      : []),
    ...places.map((x, i) => ({
      id: `s${x.s.customer.id}`,
      kind: "shop" as const,
      ...x.p,
      index: i + 1,
      label: x.s.customer.name,
      active: i === nextIdx,
      done: x.s.done,
    })),
    ...(sharing.me ? [{ id: "me", kind: "me" as const, ...sharing.me }] : []),
  ];
  // The route: warehouse → stops in order, along the streets (a gentle curve per leg until the road is known).
  const pts = [...(start ? [start] : []), ...places.map((x) => x.p)];
  const road = useRoadRoute(pts.length > 1 ? pts : null);
  const route = road?.path ?? pts.slice(1).flatMap((p, i) => curve(pts[i], p, 16).slice(i ? 1 : 0));
  const doneShare = places.length ? places.filter((x) => x.s.done).length / places.length : 0;
  const total = road ? road.km : route.length > 1 ? route.slice(1).reduce((s, p, i) => s + km(route[i], p), 0) : 0;
  // What is left of the trip, for the navigation app: every stop not delivered yet, in order.
  const left = places.filter((x) => !x.s.done);
  const last = left[left.length - 1];
  return (
    <CityMap markers={markers} route={route} routeDone={doneShare} className="h-72 sm:h-80">
      {last && (
        <div className="absolute inset-x-3 bottom-3 z-10 flex justify-end">
          <OpenInMaps
            variant="action"
            className="shadow-lg"
            text={left.length > 1 ? tr(`ابدأ الطريق (${num(left.length)} محطات)`, `Start the way (${num(left.length)} stops)`) : tr("ابدأ الطريق", "Start the way")}
            to={{ ...last.p, label: last.s.customer.name }}
            via={left.slice(0, -1).map((x) => ({ ...x.p, label: x.s.customer.name }))}
          />
        </div>
      )}
      <div className="pointer-events-none absolute inset-x-3 top-3 z-10 flex flex-wrap items-center justify-between gap-2">
        <span className="rounded-full bg-black/65 px-3 py-1 text-xs font-semibold text-white backdrop-blur">
          {road
            ? tr(`${num(places.length)} محطات · ${num(Math.round(total * 10) / 10)} كم · ${num(road.min)} دقيقة بالسيارة`, `${num(places.length)} stops · ${num(Math.round(total * 10) / 10)} km · ${num(road.min)} min by car`)
            : tr(`${num(places.length)} محطات · ${num(Math.round(total * 10) / 10)} كم تقريباً`, `${num(places.length)} stops · about ${num(Math.round(total * 10) / 10)} km`)}
        </span>
        <span className={cn("flex items-center gap-1 rounded-full px-3 py-1 text-xs font-semibold backdrop-blur", sharing.state === "on" ? "bg-success/90 text-white" : "bg-black/65 text-white")}>
          {sharing.state === "on" ? <Radio className="size-3.5" /> : <LocateFixed className="size-3.5" />}
          {sharing.state === "on"
            ? tr("موقعك يظهر للمحلات", "Shops see where you are")
            : sharing.state === "denied"
              ? tr("اسمح بالموقع ليتابعك المحل", "Allow location so shops can follow")
              : tr("الموقع يُشارك عند الخروج", "Location is shared when out")}
        </span>
      </div>
    </CityMap>
  );
}

// ---------- the shop owner ----------

export function ShipmentTracker({ order, shop, warehouse, live }: { order: Order; shop?: Customer; warehouse?: Warehouse; live?: Loc }) {
  const { tr, num } = useFmt();
  const now = useTick();
  const from = warehousePlace(warehouse);
  const to = shopPlace(shop);
  const road = useRoadRoute(from && to ? [from, to] : null);
  const route = road?.path ?? (from && to ? curve(from, to) : []);
  if (!from || !to) return null;
  const d = order.delivery!;
  const dist = road?.km ?? km(from, to);
  // By the road's own time when known (plus a few minutes to park and hand over), else ~25 km/h.
  const minutes = road ? road.min + 3 : Math.max(8, Math.round((dist / 25) * 60) + 5);
  const out = d.status === "out" && d.out_at;
  // Live position if the rep's phone sent one in the last 10 minutes, otherwise an estimate from the time.
  const fresh = live && out && now - new Date(live.at).getTime() < 10 * 60_000 ? live : undefined;
  const elapsed = out && now ? (now - new Date(d.out_at!).getTime()) / 60_000 : 0;
  const t = out ? Math.max(0.03, Math.min(0.96, elapsed / minutes)) : 0;
  const at: LatLng = fresh ? { lat: fresh.lat, lng: fresh.lng } : out ? along(route, t) : from;
  // From a live position: the share of the road still ahead, at the road's pace (or ~25 km/h without it).
  const ahead = road ? 1 - shareAlong(road.path, at) : km(at, to) / Math.max(dist, 0.01);
  const left = out ? Math.max(1, Math.round(fresh ? (road ? ahead * road.min + 2 : (km(at, to) / 25) * 60 + 2) : minutes - elapsed)) : null;
  const markers: MapMarker[] = [
    { id: "wh", kind: "warehouse", ...from, label: tr("المخزن", "Warehouse") },
    {
      id: "shop",
      kind: "shop",
      ...to,
      label: tr("محلك", "Your shop"),
      active: true,
    },
    ...(out
      ? [
          {
            id: "rep",
            kind: "rep" as const,
            ...at,
            label: d.out_by?.name ?? d.rep?.name,
          },
        ]
      : []),
  ];
  return (
    <CityMap markers={markers} route={route} routeDone={fresh ? 1 - Math.min(1, ahead) : t} className="h-56 sm:h-64">
      {/* Where the rep is right now, in the phone's maps app (only from a live position). */}
      {out && fresh && (
        <div className="absolute end-3 top-3 z-10">
          <OpenInMaps className="shadow-lg" text={tr("أين المندوب؟", "Where's the rep?")} to={{ lat: fresh.lat, lng: fresh.lng, label: d.out_by?.name ?? d.rep?.name }} />
        </div>
      )}
      <div className="pointer-events-none absolute inset-x-3 bottom-3 z-10 flex flex-wrap items-center justify-between gap-2">
        <span className="flex items-center gap-1.5 rounded-2xl bg-card/95 px-3 py-2 text-sm font-bold shadow-lg backdrop-blur">
          <Clock className="size-4 text-action" />
          {out
            ? left !== null && left <= 1
              ? tr("يصل الآن", "Arriving now")
              : tr(`يصل خلال ${num(left ?? 0)} دقيقة تقريباً`, `Arrives in about ${num(left ?? 0)} min`)
            : tr("يُجهَّز في المخزن", "Being packed at the warehouse")}
        </span>
        {out && (
          <span className="flex items-center gap-1 rounded-full bg-black/65 px-2.5 py-1 text-[11px] font-semibold text-white backdrop-blur">
            {fresh ? <Radio className="size-3.5 text-success" /> : <Navigation className="size-3.5" />}
            {fresh ? tr("موقع مباشر", "Live location") : tr("موقع تقديري", "Estimated")}
          </span>
        )}
      </div>
    </CityMap>
  );
}

// ---------- the manager / keeper ----------

export function DeliveriesOverview({ orders, customers, warehouses, locations }: { orders: Order[]; customers: Map<number, Customer>; warehouses: Warehouse[]; locations: Record<number, Loc> }) {
  const { tr } = useFmt();
  const out = orders.filter((o) => o.delivery?.status === "out");
  const markers: MapMarker[] = [];
  for (const w of warehouses) {
    const p = warehousePlace(w);
    if (p)
      markers.push({
        id: `w${w.id}`,
        kind: "warehouse",
        ...p,
        label: w.name.split(" - ").pop(),
      });
  }
  for (const o of out) {
    const p = shopPlace(customers.get(o.customer_id));
    if (p)
      markers.push({
        id: `o${o.id}`,
        kind: "shop",
        ...p,
        label: customers.get(o.customer_id)?.name,
        active: !!o.delivery?.problem,
      });
  }
  for (const l of Object.values(locations)) markers.push({ id: `r${l.rep_id}`, kind: "rep", lat: l.lat, lng: l.lng });
  if (!markers.length) return null;
  return (
    <CityMap markers={markers} className="h-72">
      <span className="pointer-events-none absolute start-3 top-3 z-10 rounded-full bg-black/65 px-3 py-1 text-xs font-semibold text-white backdrop-blur">
        {tr(`${out.length} شحنة في الطريق`, `${out.length} shipments on the way`)}
      </span>
    </CityMap>
  );
}
