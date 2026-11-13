"use client";

// «أعلمني عند التوفر»: on an item that ran out, the shop owner taps the bell; the moment it is back he gets a
// notification (with the sound, and on his phone), and the bell turns off by itself.
// The list is loaded once for all the bells on the page, and refreshed when the data changes.
import { useEffect, useState, useSyncExternalStore } from "react";
import { Bell, BellRing } from "lucide-react";
import { errorText, useToast } from "@/components/ui";
import { api } from "@/lib/api";
import type { Item } from "@/lib/api/types";
import { useFmt } from "@/lib/i18n";
import { onDataChange } from "@/lib/live";
import { cn } from "@/lib/utils";

let ids: number[] | null = null;
let loading = false;
let stopLive: (() => void) | null = null;
const subs = new Set<() => void>();
const emit = () => subs.forEach((f) => f());

function load() {
  if (loading) return;
  loading = true;
  api
    .myStockAlerts()
    .then((x) => {
      ids = x;
      emit();
    })
    .catch(() => {})
    .finally(() => {
      loading = false;
    });
}

function subscribe(cb: () => void) {
  subs.add(cb);
  stopLive ??= onDataChange(load);
  return () => {
    subs.delete(cb);
    if (!subs.size) {
      stopLive?.();
      stopLive = null;
    }
  };
}

/** The items this shop owner waits for, and a switch for one. */
export function useStockAlerts() {
  const list = useSyncExternalStore(
    subscribe,
    () => ids,
    () => null,
  );
  useEffect(() => {
    if (ids === null) load();
  }, []);
  return {
    on: (id: number) => !!list?.includes(id),
    set: async (id: number, on: boolean) => {
      const before = ids;
      ids = on ? [...(ids ?? []), id] : (ids ?? []).filter((x) => x !== id);
      emit();
      try {
        ids = await api.setStockAlert(id, on);
        emit();
      } catch (e) {
        ids = before;
        emit();
        throw e;
      }
    },
  };
}

/** The bell. `size`: "sm" on a product card, "lg" (a full button) in the product window. */
export function NotifyMe({ item, size = "sm", className }: { item: Item; size?: "sm" | "lg"; className?: string }) {
  const { tr, name } = useFmt();
  const toast = useToast();
  const alerts = useStockAlerts();
  const [busy, setBusy] = useState(false);
  const on = alerts.on(item.id);
  const click = async () => {
    setBusy(true);
    try {
      await alerts.set(item.id, !on);
      toast("success", on ? tr("لن نُعلمك بها", "We won't tell you") : tr(`سنُعلمك حين تتوفر ${name(item)}`, `We'll tell you when ${name(item)} is back`));
    } catch (e) {
      toast("danger", errorText(e, tr));
    } finally {
      setBusy(false);
    }
  };
  if (size === "lg")
    return (
      <button
        type="button"
        onClick={click}
        disabled={busy}
        aria-pressed={on}
        className={cn(
          "flex h-12 flex-1 items-center justify-center gap-2 rounded-xl text-base font-bold transition active:scale-[0.98] disabled:opacity-60",
          on ? "border border-success bg-success-soft text-success" : "bg-primary text-on-primary hover:bg-primary-hover",
          className,
        )}
      >
        {on ? <BellRing className="size-5" /> : <Bell className="size-5" />}
        {on ? tr("سنُعلمك حين تتوفر", "We'll tell you when it's back") : tr("أعلمني عند التوفر", "Tell me when it's back")}
      </button>
    );
  return (
    <button
      type="button"
      onClick={click}
      disabled={busy}
      aria-pressed={on}
      aria-label={on ? tr(`لا تُعلمني بـ ${name(item)}`, `Stop telling me about ${name(item)}`) : tr(`أعلمني حين تتوفر ${name(item)}`, `Tell me when ${name(item)} is back`)}
      className={cn(
        "relative z-10 flex h-8 items-center gap-1 rounded-full px-2.5 text-[11px] font-semibold transition active:scale-95 disabled:opacity-60",
        on ? "bg-success-soft text-success" : "bg-card-2 text-muted hover:text-text",
        className,
      )}
    >
      {on ? <BellRing className="size-3.5" /> : <Bell className="size-3.5" />}
      {on ? tr("سنُعلمك", "Will tell you") : tr("أعلمني", "Notify me")}
    </button>
  );
}
