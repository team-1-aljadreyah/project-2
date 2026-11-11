"use client";

// One pin on the 3D city map (components/map3d): where the shop is.
// Read-only by default; with `editable` the pin moves by tapping the map or dragging it,
// and "موقعي" puts it where the phone is (when the browser allows it).
import { useMemo, useState } from "react";
import { LocateFixed } from "lucide-react";
import { useFmt } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { CityMap, KARBALA as CENTER, type MapMarker } from "./map3d/city-map";

export const KARBALA = CENTER;

export function MapPin({ lat, lng, editable, onChange, className }: { lat?: number; lng?: number; editable?: boolean; onChange?: (lat: number, lng: number) => void; className?: string }) {
  const { tr } = useFmt();
  const [locating, setLocating] = useState(false);
  const markers = useMemo<MapMarker[]>(() => (lat !== undefined && lng !== undefined ? [{ id: "pin", kind: "pin", lat, lng }] : []), [lat, lng]);
  return (
    <CityMap
      markers={markers}
      center={lat !== undefined && lng !== undefined ? { lat, lng } : CENTER}
      zoom={lat !== undefined ? 16.3 : 14.5}
      editable={editable}
      onPick={(p) => onChange?.(p.lat, p.lng)}
      className={cn("h-44", className)}
    >
      {editable && (
        <p className="pointer-events-none absolute inset-x-2 bottom-2 z-10 mx-auto w-fit rounded-full bg-black/60 px-3 py-1 text-[11px] text-white">
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
                onChange?.(p.coords.latitude, p.coords.longitude);
              },
              () => setLocating(false),
              { enableHighAccuracy: true, timeout: 8000 },
            );
          }}
          className="absolute bottom-2 end-2 z-10 flex size-9 items-center justify-center rounded-full bg-card text-text shadow-md disabled:opacity-50"
          aria-label={tr("موقعي", "My location")}
          title={tr("موقعي", "My location")}
        >
          <LocateFixed className={cn("size-4", locating && "animate-pulse")} />
        </button>
      )}
    </CityMap>
  );
}
