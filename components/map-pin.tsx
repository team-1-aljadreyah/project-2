"use client";

// A real map (OpenStreetMap, drawn by Leaflet) with one pin: where the shop is.
// Read-only by default; with `editable` the pin moves by tapping the map or dragging it,
// and "موقعي" puts it where the phone is (when the browser allows it).
// Leaflet touches `window`, so it is loaded only in the browser, after the page is shown.
import { useEffect, useRef, useState } from "react";
import "leaflet/dist/leaflet.css";
import { LocateFixed } from "lucide-react";
import { useFmt } from "@/lib/i18n";
import { cn } from "@/lib/utils";

/** Karbala, the city center: where the map opens before a pin is set. */
export const KARBALA = { lat: 32.616, lng: 44.0249 };

type Leaflet = typeof import("leaflet");

export function MapPin({
  lat,
  lng,
  editable,
  onChange,
  className,
}: {
  lat?: number;
  lng?: number;
  editable?: boolean;
  onChange?: (lat: number, lng: number) => void;
  className?: string;
}) {
  const { tr } = useFmt();
  const box = useRef<HTMLDivElement>(null);
  const map = useRef<import("leaflet").Map | null>(null);
  const pin = useRef<import("leaflet").Marker | null>(null);
  const L = useRef<Leaflet | null>(null);
  const change = useRef(onChange);
  // Edit mode, read by the map's click handler (Leaflet makes the pin's drag handler only once it is on the map).
  const editing = useRef(!!editable);
  const [locating, setLocating] = useState(false);
  useEffect(() => {
    change.current = onChange;
  }, [onChange]);

  // Make the map once.
  useEffect(() => {
    let dead = false;
    import("leaflet").then((leaflet) => {
      if (dead || !box.current || map.current) return;
      L.current = leaflet;
      const start = lat !== undefined && lng !== undefined ? { lat, lng } : KARBALA;
      const m = leaflet.map(box.current, { zoomControl: false, attributionControl: true }).setView(start, lat !== undefined ? 17 : 14);
      leaflet.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 19, attribution: "© OpenStreetMap" }).addTo(m);
      const icon = leaflet.divIcon({
        className: "",
        html: '<svg width="34" height="44" viewBox="0 0 34 44" xmlns="http://www.w3.org/2000/svg"><path d="M17 0C7.6 0 0 7.5 0 16.8 0 29.4 17 44 17 44s17-14.6 17-27.2C34 7.5 26.4 0 17 0z" fill="#e1692b"/><circle cx="17" cy="16.5" r="6.5" fill="#fff"/></svg>',
        iconSize: [34, 44],
        iconAnchor: [17, 44],
      });
      const marker = leaflet.marker(start, { icon, draggable: false });
      if (lat !== undefined) marker.addTo(m);
      marker.on("dragend", () => {
        const p = marker.getLatLng();
        change.current?.(p.lat, p.lng);
      });
      m.on("click", (e: import("leaflet").LeafletMouseEvent) => {
        if (!editing.current) return;
        marker.setLatLng(e.latlng).addTo(m);
        marker.dragging?.enable();
        change.current?.(e.latlng.lat, e.latlng.lng);
      });
      map.current = m;
      pin.current = marker;
    });
    return () => {
      dead = true;
      map.current?.remove();
      map.current = null;
    };
    // Made once; later changes are applied below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Editable or not: the pin can be dragged / placed.
  useEffect(() => {
    editing.current = !!editable;
    const m = map.current;
    const marker = pin.current;
    if (!m || !marker) return;
    if (editable) marker.dragging?.enable();
    else marker.dragging?.disable();
    m.getContainer().style.cursor = editable ? "crosshair" : "";
  }, [editable]);

  // The pin moved from outside (e.g. "موقعي").
  useEffect(() => {
    const m = map.current;
    const marker = pin.current;
    if (!m || !marker || lat === undefined || lng === undefined) return;
    const cur = marker.getLatLng();
    if (Math.abs(cur.lat - lat) > 1e-7 || Math.abs(cur.lng - lng) > 1e-7 || !m.hasLayer(marker)) {
      marker.setLatLng({ lat, lng }).addTo(m);
      if (editing.current) marker.dragging?.enable();
      m.panTo({ lat, lng });
    }
  }, [lat, lng]);

  return (
    <div className={cn("relative isolate overflow-hidden rounded-2xl border border-line bg-card-2", className)}>
      <div ref={box} className="size-full" aria-label={tr("الخريطة", "Map")} />
      {editable && (
        <p className="pointer-events-none absolute inset-x-2 bottom-2 z-[500] mx-auto w-fit rounded-full bg-black/60 px-3 py-1 text-[11px] text-white">
          {tr("اضغط على الخريطة أو اسحب الدبوس لمكان المحل", "Tap the map or drag the pin to the shop")}
        </p>
      )}
      {editable && (
        <button
          type="button"
          disabled={locating}
          onClick={() => {
            if (!navigator.geolocation) return;
            setLocating(true);
            navigator.geolocation.getCurrentPosition(
              (p) => {
                setLocating(false);
                change.current?.(p.coords.latitude, p.coords.longitude);
              },
              () => setLocating(false),
              { enableHighAccuracy: true, timeout: 8000 },
            );
          }}
          className="absolute bottom-2 end-2 z-[500] flex size-9 items-center justify-center rounded-full bg-card text-text shadow-md disabled:opacity-50"
          aria-label={tr("موقعي", "My location")}
          title={tr("موقعي", "My location")}
        >
          <LocateFixed className={cn("size-4", locating && "animate-pulse")} />
        </button>
      )}
    </div>
  );
}
