"use client";

// The 3D city map used everywhere the site shows a real place (see style.ts for the look).
// - markers: shops, warehouses, the delivery rep (live), "me", or a pin to place.
// - route: a glowing line through points (the part already driven turns grey).
// - editable + onPick: tap the map to place the pin, or drag it.
// MapLibre needs the browser (WebGL), so it is loaded only there, after the page is shown (its styles too).
import { useEffect, useRef, useState } from "react";
import type { GeoJSONSource, Map as MlMap, Marker } from "maplibre-gl";
import { useTheme } from "@/lib/theme";
import { useFmt } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { ROUTE, mapStyle } from "./style";

export type LatLng = { lat: number; lng: number };

export interface MapMarker {
  id: string;
  lat: number;
  lng: number;
  kind: "shop" | "warehouse" | "rep" | "pin" | "me";
  /** Short text under the marker. */
  label?: string;
  /** A number in the marker (the stop's order in a trip). */
  index?: number;
  /** Highlighted (the next stop). */
  active?: boolean;
  /** Greyed out (delivered). */
  done?: boolean;
  onClick?: () => void;
}

/** Karbala, the city center (the Imam Hussein shrine area): where the map opens without a place. */
export const KARBALA: LatLng = { lat: 32.616, lng: 44.0249 };

const ICON: Record<MapMarker["kind"], string> = {
  // Simple shapes drawn here, so they look the same everywhere (lucide-like strokes).
  shop: '<path d="M4 9h16l-1.5-5h-13z"/><path d="M5 9v10h14V9"/><path d="M10 19v-5h4v5"/>',
  warehouse: '<path d="M3 21V8l9-5 9 5v13"/><path d="M7 21v-8h10v8"/><path d="M7 17h10"/>',
  rep: '<path d="M3 7h11v9H3z"/><path d="M14 10h4l3 3v3h-7z"/><circle cx="7" cy="17.5" r="1.7"/><circle cx="17" cy="17.5" r="1.7"/>',
  pin: "",
  me: "",
};

function markerElement(m: MapMarker): HTMLElement {
  const el = document.createElement("button");
  el.type = "button";
  el.className = "map3d-marker";
  el.dataset.kind = m.kind;
  if (m.active) el.dataset.active = "1";
  if (m.done) el.dataset.done = "1";
  // With a label shown under it, the label's words name the button; without one, a spoken name.
  if (!m.label) el.setAttribute("aria-label", m.kind === "me" ? "موقعي" : m.kind);
  const inner =
    m.kind === "pin"
      ? '<svg width="34" height="44" viewBox="0 0 34 44"><path d="M17 0C7.6 0 0 7.5 0 16.8 0 29.4 17 44 17 44s17-14.6 17-27.2C34 7.5 26.4 0 17 0z" fill="#e1692b"/><circle cx="17" cy="16.5" r="6.5" fill="#fff"/></svg>'
      : m.kind === "me"
        ? '<span class="map3d-me"></span>'
        : `<span class="map3d-badge">${m.index !== undefined ? `<b>${m.index}</b>` : `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${ICON[m.kind]}</svg>`}</span>`;
  el.innerHTML = inner + (m.label ? `<span class="map3d-label">${m.label.replace(/[<>&]/g, "")}</span>` : "");
  if (m.onClick) el.addEventListener("click", m.onClick);
  return el;
}

// The map is heavy for a phone (its code and 3D drawing keep it busy for seconds). It starts on the person's
// first touch, click, wheel or key on the page (not a scroll: the site itself scrolls to the top when a page
// opens), not while the page is still opening: the page shows at once,
// and someone who never looks at the map never pays for it. A map opened by a tap (in a dialog) starts at once.
let interacted = false;
const waiting = new Set<() => void>();
function onFirstInteraction(fn: () => void) {
  if (interacted || typeof window === "undefined") {
    fn();
    return () => {};
  }
  waiting.add(fn);
  return () => {
    waiting.delete(fn);
  };
}
if (typeof window !== "undefined") {
  const go = () => {
    if (interacted) return;
    interacted = true;
    for (const ev of ["pointerdown", "keydown", "wheel", "touchstart"]) window.removeEventListener(ev, go, true);
    waiting.forEach((f) => f());
    waiting.clear();
  };
  for (const ev of ["pointerdown", "keydown", "wheel", "touchstart"]) window.addEventListener(ev, go, { capture: true, passive: true });
}

export function CityMap({
  markers = [],
  route,
  routeDone = 0,
  center,
  zoom = 15.4,
  pitch = 58,
  bearing = -24,
  fit = true,
  editable,
  onPick,
  orbit,
  className,
  children,
}: {
  markers?: MapMarker[];
  /** The way to draw: points in order. */
  route?: LatLng[];
  /** How much of the route is already driven (0..1): that part turns grey. */
  routeDone?: number;
  center?: LatLng;
  zoom?: number;
  pitch?: number;
  bearing?: number;
  /** Move the camera to show every marker. */
  fit?: boolean;
  /** Tapping the map places the "pin" marker (and it can be dragged). */
  editable?: boolean;
  onPick?: (p: LatLng) => void;
  /** Turn slowly around, like the design's video (for a map you look at, not one you use). */
  orbit?: boolean;
  className?: string;
  children?: React.ReactNode;
}) {
  const box = useRef<HTMLDivElement>(null);
  const map = useRef<MlMap | null>(null);
  const lib = useRef<typeof import("maplibre-gl") | null>(null);
  const shown = useRef<Marker[]>([]);
  const pick = useRef(onPick);
  const edit = useRef(!!editable);
  const theme = useTheme();
  const { tr } = useFmt();
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  // false until the person first touches the page (see onFirstInteraction above).
  const [go, setGo] = useState(false);
  useEffect(() => onFirstInteraction(() => setGo(true)), []);
  useEffect(() => {
    pick.current = onPick;
    edit.current = !!editable;
  }, [onPick, editable]);

  // Make the map once (after the first touch on the page).
  useEffect(() => {
    if (!go) return;
    let dead = false;
    // The map's code and its styles come only with a map (not on every page of the site).
    Promise.all([import("maplibre-gl"), import("maplibre-gl/dist/maplibre-gl.css")])
      .then(([ml]) => {
        if (dead || !box.current || map.current) return;
        lib.current = ml;
        const start = center ?? markers[0] ?? KARBALA;
        const m = new ml.Map({
          container: box.current,
          style: mapStyle(theme),
          center: [start.lng, start.lat],
          zoom,
          pitch,
          bearing,
          maxPitch: 70,
          // The tiles bring their own credit (OpenFreeMap, OpenMapTiles, OpenStreetMap).
          attributionControl: { compact: true },
          dragRotate: true,
        });
        // Ready as soon as the style is in (markers and the route can go on); the tiles keep coming after.
        const onReady = () => {
          if (dead) return;
          addRouteLayers(m);
          setReady(true);
        };
        if (m.isStyleLoaded()) onReady();
        else m.once("style.load", onReady);
        m.on("click", (e) => {
          if (!edit.current) return;
          pick.current?.({ lat: e.lngLat.lat, lng: e.lngLat.lng });
        });
        map.current = m;
      })
      .catch(() => setFailed(true));
    return () => {
      dead = true;
      map.current?.remove();
      map.current = null;
    };
    // Made once; the effects below follow the changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [go]);

  // Day / night.
  useEffect(() => {
    const m = map.current;
    if (!m || !ready) return;
    m.setStyle(mapStyle(theme));
    m.once("style.load", () => {
      addRouteLayers(m);
      setRoute(m, route, routeDone);
    });
    // Only the theme changes the style.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [theme]);

  // The markers: drawn again only when what they show changes (pages may pass a new array every render).
  const markersKey = markers.map((m) => `${m.id}|${m.kind}|${m.lat.toFixed(6)}|${m.lng.toFixed(6)}|${m.label ?? ""}|${m.index ?? ""}|${m.active ? 1 : 0}|${m.done ? 1 : 0}`).join(";");
  const markersRef = useRef(markers);
  useEffect(() => {
    markersRef.current = markers;
  });
  useEffect(() => {
    const m = map.current;
    const ml = lib.current;
    if (!m || !ml || !ready) return;
    shown.current.forEach((x) => x.remove());
    shown.current = markersRef.current.map((mk) => {
      const marker = new ml.Marker({
        element: markerElement(mk),
        anchor: mk.kind === "pin" ? "bottom" : "center",
        draggable: mk.kind === "pin" && !!editable,
      })
        .setLngLat([mk.lng, mk.lat])
        .addTo(m);
      if (mk.kind === "pin")
        marker.on("dragend", () =>
          pick.current?.({
            lat: marker.getLngLat().lat,
            lng: marker.getLngLat().lng,
          }),
        );
      return marker;
    });
  }, [markersKey, ready, editable]);

  // The route (compared by content).
  const routeKey = (route ?? []).map((p) => `${p.lat.toFixed(5)},${p.lng.toFixed(5)}`).join(";");
  const routeRef = useRef(route);
  useEffect(() => {
    routeRef.current = route;
  });
  useEffect(() => {
    if (map.current && ready) setRoute(map.current, routeRef.current, routeDone);
  }, [routeKey, routeDone, ready]);

  // The camera shows everything (once the markers are known, and when their set changes).
  const placesKey = markers.map((m) => `${m.id}:${m.lat.toFixed(4)},${m.lng.toFixed(4)}`).join("|");
  useEffect(() => {
    const m = map.current;
    const ml = lib.current;
    if (!m || !ml || !ready || !fit) return;
    const pts = [...markers.map((x) => [x.lng, x.lat] as [number, number]), ...(route ?? []).map((p) => [p.lng, p.lat] as [number, number])];
    if (!pts.length) return;
    if (pts.length === 1) {
      m.easeTo({
        center: pts[0],
        zoom: Math.max(m.getZoom(), 15.5),
        duration: 800,
      });
      return;
    }
    const b = new ml.LngLatBounds(pts[0], pts[0]);
    pts.forEach((p) => b.extend(p));
    m.fitBounds(b, {
      padding: 70,
      pitch,
      bearing,
      maxZoom: 16.5,
      duration: 900,
    });
    // Only when the places change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [placesKey, ready, fit]);

  // A slow turn around, like the design's video.
  useEffect(() => {
    const m = map.current;
    if (!m || !ready || !orbit) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let raf = 0;
    let last = performance.now();
    const step = (t: number) => {
      const dt = t - last;
      last = t;
      if (!m.isMoving()) m.setBearing(m.getBearing() + dt * 0.003);
      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    const stop = () => cancelAnimationFrame(raf);
    m.once("mousedown", stop);
    m.once("touchstart", stop);
    return stop;
  }, [orbit, ready]);

  return (
    <div className={cn("map3d relative isolate overflow-hidden rounded-2xl border border-line bg-card-2", className)}>
      <div ref={box} className="size-full" />
      {/* Until the map starts: a light picture of a street grid, and a tap starts it too. */}
      {!go && (
        <button type="button" onClick={() => setGo(true)} className="map3d-wait absolute inset-0 flex items-end justify-center p-3 text-xs font-semibold text-muted">
          <span className="rounded-full bg-card/90 px-3 py-1.5 shadow-sm">{tr("المس لعرض الخريطة", "Touch to show the map")}</span>
        </button>
      )}
      {failed && <p className="absolute inset-0 flex items-center justify-center p-4 text-center text-sm text-muted">{tr("تعذّر عرض الخريطة على هذا الجهاز", "The map can't show on this device")}</p>}
      {children}
    </div>
  );
}

function addRouteLayers(m: MlMap) {
  if (m.getSource("route")) return;
  m.addSource("route", {
    type: "geojson",
    data: { type: "FeatureCollection", features: [] },
    lineMetrics: true,
  });
  // A wide soft glow, then the bright core, as in the design.
  m.addLayer({
    id: "route-glow",
    type: "line",
    source: "route",
    layout: { "line-cap": "round", "line-join": "round" },
    paint: {
      "line-color": ROUTE.glow,
      "line-width": 14,
      "line-blur": 10,
      "line-opacity": 0.45,
    },
  });
  m.addLayer({
    id: "route-core",
    type: "line",
    source: "route",
    layout: { "line-cap": "round", "line-join": "round" },
    paint: { "line-color": ROUTE.core, "line-width": 3.2 },
  });
}

function setRoute(m: MlMap, route: LatLng[] | undefined, done: number) {
  const src = m.getSource("route") as GeoJSONSource | undefined;
  if (!src) return;
  src.setData({
    type: "FeatureCollection",
    features:
      route && route.length > 1
        ? [
            {
              type: "Feature",
              properties: {},
              geometry: {
                type: "LineString",
                coordinates: route.map((p) => [p.lng, p.lat]),
              },
            },
          ]
        : [],
  });
  // The part already driven turns grey (a gradient along the line).
  const d = Math.max(0, Math.min(0.999, done));
  const grad = d > 0 ? ["step", ["line-progress"], ROUTE.done, d, ROUTE.core] : ROUTE.core;
  m.setPaintProperty("route-core", "line-gradient", grad as unknown as string);
}
