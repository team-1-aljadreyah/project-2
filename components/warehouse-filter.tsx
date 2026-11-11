"use client";

// The manager's and the accountant's warehouse filter: the first warehouse only, the second only, or both.
// Chosen once in the top bar; every page that shows warehouse work (orders, invoices, deliveries, stock,
// receipts, transfers, the dashboard and the reports) follows it. Kept on this device.
// The warehouse keeper and staff don't get it: they only ever see their own warehouse.
import { useSyncExternalStore } from "react";
import { Warehouse } from "lucide-react";
import type { User, Warehouse as Wh } from "@/lib/api/types";
import { useFmt } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { useApp } from "./shell";

const KEY = "nahrain.whfilter";
const EVENT = "nahrain-whfilter";

function read() {
  try {
    return localStorage.getItem(KEY) ?? "";
  } catch {
    return "";
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

export const hasWarehouseFilter = (u: Pick<User, "role">) => u.role === "manager" || u.role === "accountant";

/** The chosen warehouse id, or null for both. Always null for roles without the filter. */
export function useWarehouseFilter(): number | null {
  const { user } = useApp();
  const raw = useSyncExternalStore(subscribe, read, () => "");
  return hasWarehouseFilter(user) ? Number(raw) || null : null;
}

export function setWarehouseFilter(id: number | null) {
  try {
    if (id) localStorage.setItem(KEY, String(id));
    else localStorage.removeItem(KEY);
  } catch {}
  window.dispatchEvent(new Event(EVENT));
}

/** Does this row belong to the chosen warehouse? */
export const inWarehouse = (wh: number | null, warehouseId: number | undefined) => !wh || warehouseId === wh;

/** The switch in the top bar (outside the app's data, so it gets the warehouses from the shell). */
export function WarehouseFilterSwitch({ warehouses }: { warehouses: Wh[] }) {
  const { tr } = useFmt();
  const raw = useSyncExternalStore(subscribe, read, () => "");
  const wh = Number(raw) || null;
  // Short names: "الصناعة" / "الحر" (the part after " - " or the last word).
  const short = (n: string) => (n.includes(" - ") ? n.split(" - ").pop()! : n.split(" ").pop()!);
  const options = [{ id: null as number | null, ar: "كل المخازن", en: "All" }, ...warehouses.map((w) => ({ id: w.id as number | null, ar: short(w.name), en: short(w.name_en) }))];
  return (
    <div role="radiogroup" aria-label={tr("المخزن", "Warehouse")} className="inline-flex h-10 items-center gap-0.5 rounded-xl border border-line bg-card-2 p-1">
      <Warehouse className="mx-1 hidden size-4 text-muted sm:block" aria-hidden />
      {options.map((o) => (
        <button
          key={o.id ?? 0}
          type="button"
          role="radio"
          aria-checked={wh === o.id}
          onClick={() => setWarehouseFilter(o.id)}
          className={cn("h-full whitespace-nowrap rounded-lg px-2.5 text-xs font-semibold transition", wh === o.id ? "bg-action text-on-action shadow-sm" : "text-muted hover:text-text")}
        >
          {tr(o.ar, o.en)}
        </button>
      ))}
    </div>
  );
}
