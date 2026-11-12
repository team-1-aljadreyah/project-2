"use client";

// Loads data for a screen and loads it again when the data changes anywhere (this screen, another screen,
// another tab, another user through the server; see live.ts). Old data stays on screen while new data loads,
// and a refresh that fails in the background keeps it too (a short network cut doesn't empty the page).
import { useCallback, useEffect, useRef, useState } from "react";
import { onDataChange } from "./live";

export type Load<T> = { status: "loading" } | { status: "error"; error: unknown } | { status: "ready"; data: T };

export function useLoad<T>(fetcher: () => Promise<T>, deps: unknown[] = []) {
  const ref = useRef(fetcher);
  useEffect(() => {
    ref.current = fetcher;
  });
  const [state, setState] = useState<Load<T>>({ status: "loading" });
  const [tick, setTick] = useState(0);
  const key = JSON.stringify(deps);

  // The deps the shown data was loaded for: a failed refresh of the same data keeps it on screen.
  const shownFor = useRef<string | null>(null);

  useEffect(() => {
    let alive = true;
    ref.current().then(
      (data) => {
        if (!alive) return;
        shownFor.current = key;
        setState({ status: "ready", data });
      },
      (error) => {
        if (!alive || shownFor.current === key) return;
        setState({ status: "error", error });
      },
    );
    return () => {
      alive = false;
    };
  }, [key, tick]);

  const reload = useCallback(() => setTick((t) => t + 1), []);

  // Live refresh: any saved change reloads open screens.
  useEffect(() => onDataChange(reload), [reload]);

  return { state, reload, data: state.status === "ready" ? state.data : undefined };
}
