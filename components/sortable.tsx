"use client";

// Things you drag to a new place and hide with the eye (the manager's customize mode, lib/site.ts):
// the menu rows, the dashboard cards, the columns of every table, the categories.
// When the mode is off, SortArea and SortItem show their content as it is, with nothing added.
import { useId, type ReactNode } from "react";
import { DndContext, KeyboardSensor, PointerSensor, closestCenter, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { SortableContext, arrayMove, rectSortingStrategy, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Eye, EyeOff, GripVertical } from "lucide-react";
import { useFmt } from "@/lib/i18n";
import { useCustomizing } from "@/lib/site";
import { cn } from "@/lib/utils";

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
  const id = useId();
  // A small move starts the drag, so a plain click on the handle does nothing.
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }), useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }));
  if (!mode && !always) return <>{children}</>;
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

type SortItemProps = {
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
  return <SortItemOn {...props} />;
}

function SortItemOn({ id, hidden, onHide, inline, className, children }: SortItemProps) {
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

/** Add or remove one name from a list (the hidden pages, the hidden cards). */
export const toggleIn = (list: string[], id: string) => (list.includes(id) ? list.filter((x) => x !== id) : [...list, id]);
