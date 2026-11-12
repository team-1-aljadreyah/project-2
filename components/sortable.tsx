"use client";

// Things you drag to a new place and hide with the eye (the manager's customize mode, lib/site.ts):
// the menu rows, the dashboard cards, the columns of every table, the categories.
// When the mode is off, SortArea and SortItem show their content as it is, with nothing added, and the drag
// library (sortable-dnd.tsx) isn't even loaded: it comes the moment the mode is turned on.
import { lazy, Suspense, type ReactNode } from "react";
import { useCustomizing } from "@/lib/site";

const DndArea = lazy(() => import("./sortable-dnd").then((m) => ({ default: m.DndArea })));
const SortItemOn = lazy(() => import("./sortable-dnd").then((m) => ({ default: m.SortItemOn })));

export function SortArea({
  ids,
  onOrder,
  grid,
  always,
  children,
}: {
  ids: string[];
  onOrder: (ids: string[], moved: string, onto: string) => void;
  grid?: boolean;
  always?: boolean;
  children: ReactNode;
}) {
  const mode = useCustomizing();
  if (!mode && !always) return <>{children}</>;
  // While the drag part loads (a moment), the content shows as it is.
  return (
    <Suspense fallback={<>{children}</>}>
      <DndArea ids={ids} onOrder={onOrder} grid={grid}>
        {children}
      </DndArea>
    </Suspense>
  );
}

export type SortItemProps = {
  id: string;
  /** Hidden things stay on screen in customize mode (faded), so they can be shown again. */
  hidden?: boolean;
  onHide?: () => void;
  /** The handle sits in the row, before the content (lists). Without it: small buttons on the corner (cards). */
  inline?: boolean;
  always?: boolean;
  className?: string;
  children: ReactNode;
};

export function SortItem(props: SortItemProps) {
  const mode = useCustomizing();
  if (!mode && !props.always) return props.hidden ? null : <div className={props.className}>{props.children}</div>;
  return (
    <Suspense fallback={<div className={props.className}>{props.children}</div>}>
      <SortItemOn {...props} />
    </Suspense>
  );
}

/** Add or remove one name from a list (the hidden pages, the hidden cards). */
export const toggleIn = (list: string[], id: string) => (list.includes(id) ? list.filter((x) => x !== id) : [...list, id]);
