"use client";

// "You haven't saved yet": a form with something typed in marks itself (useUnsaved). Then closing or reloading
// the window asks the browser's question, and a link inside the site asks ours (components/unsaved-guard.tsx).
import { useEffect } from "react";

const dirty = new Set<symbol>();

/** While `isDirty`, leaving this page asks first. */
export function useUnsaved(isDirty: boolean) {
  useEffect(() => {
    if (!isDirty) return;
    const id = Symbol("form");
    dirty.add(id);
    return () => {
      dirty.delete(id);
    };
  }, [isDirty]);
}

export const hasUnsaved = () => dirty.size > 0;

/** The person chose to leave without saving: nothing asks again on the way out. */
export function forgetUnsaved() {
  dirty.clear();
}
