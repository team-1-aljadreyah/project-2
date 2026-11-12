"use client";

// The drag part of sortable.tsx (dnd-kit), in its own file: it is loaded only when something can be dragged
// (the manager's customize mode, or a list that is always sortable), not on every page for everyone.
import { useId, type ReactNode } from "react";
import { DndContext, KeyboardSensor, PointerSensor, closestCenter, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { SortableContext, arrayMove, rectSortingStrategy, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Eye, EyeOff, GripVertical } from "lucide-react";
import { useFmt } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import type { SortItemProps } from "./sortable";

export function DndArea({ ids, onOrder, grid, children }: { ids: string[]; onOrder: (ids: string[], moved: string, onto: string) => void; grid?: boolean; children: ReactNode }) {
  const id = useId();
  // A small move starts the drag, so a plain click on the handle does nothing.
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }), useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }));
  const end = (e: DragEndEvent) => {
    const from = ids.indexOf(String(e.active.id));
    const to = e.over ? ids.indexOf(String(e.over.id)) : -1;
    if (from < 0 || to < 0 || from === to) return;
    onOrder(arrayMove(ids, from, to), ids[from], ids[to]);
  };
  return (
    <DndContext id={id} sensors={sensors} collisionDetection={closestCenter} onDragEnd={end}>
      <SortableContext items={ids} strategy={grid ? rectSortingStrategy : verticalListSortingStrategy}>
        {children}
      </SortableContext>
    </DndContext>
  );
}

export function SortItemOn({ id, hidden, onHide, inline, className, children }: SortItemProps) {
  const { tr } = useFmt();
  const { setNodeRef, setActivatorNodeRef, attributes, listeners, transform, transition, isDragging } = useSortable({ id });
  const style = { transform: CSS.Translate.toString(transform), transition };
  const chip = "flex size-7 shrink-0 items-center justify-center rounded-lg border border-line bg-card text-muted shadow-sm hover:text-text";
  const handle = (
    <button
      type="button"
      ref={setActivatorNodeRef}
      {...attributes}
      {...listeners}
      aria-label={tr("اسحب لتغيير المكان", "Drag to move")}
      className={cn(chip, "cursor-grab touch-none active:cursor-grabbing")}
    >
      <GripVertical className="size-4" />
    </button>
  );
  const eye = onHide && (
    <button type="button" onClick={onHide} aria-label={hidden ? tr("إظهار", "Show") : tr("إخفاء", "Hide")} aria-pressed={!!hidden} className={chip}>
      {hidden ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
    </button>
  );
  if (inline)
    return (
      <div ref={setNodeRef} style={style} data-cz-row className={cn("flex items-center gap-1.5", isDragging && "relative z-20 opacity-80", className)}>
        {handle}
        <div className={cn("min-w-0 flex-1", hidden && "opacity-40")}>{children}</div>
        {eye}
      </div>
    );
  return (
    <div ref={setNodeRef} style={style} className={cn("relative", isDragging && "z-20 opacity-80", className)}>
      <div className={cn("h-full rounded-2xl outline-1 outline-offset-2 outline-dashed outline-action/50", hidden && "opacity-40")}>{children}</div>
      <div className="absolute -top-2.5 end-2 z-10 flex gap-1">
        {handle}
        {eye}
      </div>
    </div>
  );
}
