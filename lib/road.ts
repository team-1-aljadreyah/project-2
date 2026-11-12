"use client";

// A route along the real streets (OpenStreetMap), with its distance and driving time, for the maps' lines.
// For now the free public OSRM server (no key); before launch the backend hosts its own OSRM or forwards to a
// paid service (docs/backend.md), and only ROUTER below changes. When it doesn't answer (offline, busy, 6 s),
// the maps keep their gentle curve and the straight-line estimate, so nothing breaks.
import { useEffect, useState } from "react";

export const ROUTER = "https://router.project-osrm.org/route/v1/driving";

export type LatLng = { lat: number; lng: number };
export type Road = { path: LatLng[]; km: number; min: number };

const cache = new Map<string, Promise<Road | null>>();
const keyOf = (pts: LatLng[]) => pts.map((p) => `${p.lng.toFixed(5)},${p.lat.toFixed(5)}`).join(";");

/** The road through these points in order (at most 25), or null if the router can't say. */
export function roadRoute(points: LatLng[]): Promise<Road | null> {
  const pts = points.slice(0, 25);
  if (pts.length < 2) return Promise.resolve(null);
  const key = keyOf(pts);
  const hit = cache.get(key);
  if (hit) return hit;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 6000);
  const p = fetch(`${ROUTER}/${key}?overview=full&geometries=geojson&steps=false`, { signal: ctrl.signal })
    .then((r) => (r.ok ? r.json() : null))
    .then((d: { code?: string; routes?: { distance: number; duration: number; geometry: { coordinates: [number, number][] } }[] } | null) => {
      const r = d?.code === "Ok" ? d.routes?.[0] : undefined;
      if (!r) return null;
      // The router's times are for empty streets: a little more for the city's traffic.
      return { path: r.geometry.coordinates.map(([lng, lat]) => ({ lat, lng })), km: r.distance / 1000, min: Math.max(1, Math.round((r.duration / 60) * 1.25)) };
    })
    .catch(() => null)
    .finally(() => clearTimeout(timer));
  // A failure isn't kept: the next look asks again.
  p.then((r) => r === null && cache.delete(key));
  cache.set(key, p);
  return p;
}

/** The road for these points (undefined while asking, null when unknown). Points null = nothing to ask. */
export function useRoadRoute(points: LatLng[] | null): Road | null | undefined {
  const key = points && points.length > 1 ? keyOf(points) : "";
  const [got, setGot] = useState<{ key: string; road: Road | null } | null>(null);
  useEffect(() => {
    if (!key || !points) return;
    let live = true;
    roadRoute(points).then((road) => live && setGot({ key, road }));
    return () => {
      live = false;
    };
    // The points are read through their key (same places = same request).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  if (!key) return null;
  return got?.key === key ? got.road : undefined;
}

/** How far along a road (0..1) a point is: the share of the road before its nearest vertex. */
export function shareAlong(path: LatLng[], at: LatLng) {
  if (path.length < 2) return 0;
  let best = 0;
  let bestD = Infinity;
  path.forEach((p, i) => {
    const d = (p.lat - at.lat) ** 2 + (p.lng - at.lng) ** 2;
    if (d < bestD) {
      bestD = d;
      best = i;
    }
  });
  return best / (path.length - 1);
}
