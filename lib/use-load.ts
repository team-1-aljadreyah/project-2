"use client";

// Loads data for a screen and loads it again when the data changes anywhere
// (another screen, another tab, or the reservation timer). Old data stays on screen while new data loads.
import { useCallback, useEffect, useRef, useState } from "react";
import { onDbChange } from "./api/mock/db";
import { USE_MOCK } from "./config";

export type Load<T> = { status: "loading" } | { status: "error"; error: unknown } | { status: "ready"; data: T };

export function useLoad<T>(fetcher: () => Promise<T>, deps: unknown[] = []) {
  const ref = useRef(fetcher);
  useEffect(() => {
    ref.current = fetcher;
  });
  const [state, setState] = useState<Load<T>>({ status: "loading" });
  const [tick, setTick] = useState(0);
  const key = JSON.stringify(deps);

  useEffect(() => {
    let alive = true;
    ref.current().then(
      (data) => alive && setState({ status: "ready", data }),
      (error) => alive && setState({ status: "error", error }),
    );
    return () => {
      alive = false;
    };
  }, [key, tick]);

  const reload = useCallback(() => setTick((t) => t + 1), []);

  // Live refresh: any saved change reloads open screens.
  useEffect(() => {
    if (!USE_MOCK) return;
    return onDbChange(reload);
  }, [reload]);

  return { state, reload, data: state.status === "ready" ? state.data : undefined };
}
