"use client";

// The pieces of the manager's "customize mode" (see lib/site.ts):
// - EditText: a text or a number you click to change in its place.
// - SortArea + SortItem: things you drag to a new place, and hide with the eye.
// - CustomizeToggle (top bar), CustomizeBar (the strip that explains the mode), BrandDialog (name and logo).
// When the mode is off, all of these show their content as it is, with nothing added.
import { useId, useRef, useState, type ReactNode } from "react";
import { DndContext, KeyboardSensor, PointerSensor, closestCenter, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { SortableContext, arrayMove, rectSortingStrategy, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Check, Eye, EyeOff, GripVertical, ImagePlus, Paintbrush, RotateCcw, Trash2 } from "lucide-react";
import type { Brand, SiteCustom } from "@/lib/api/types";
import { useFmt } from "@/lib/i18n";
import { shrinkImage } from "@/lib/image";
import { DEFAULT_SITE, saveSite, setCustomizing, useCustomizing, useSite } from "@/lib/site";
import { cn } from "@/lib/utils";
import { LogoMark } from "./logo";
import { Button, Dialog, Field, Input, errorText, useToast } from "./ui";

/** Save a change to the customization, and say so if it fails. */
export function useSaveSite() {
  const toast = useToast();
  const { tr } = useFmt();
  return (change: (s: SiteCustom) => SiteCustom) => saveSite(change).catch((e) => toast("danger", errorText(e, tr)));
}

// ---------- a text you click to change ----------
export function EditText({
  value,
  onSave,
  numeric,
  always,
  className,
  children,
}: {
  /** The text that goes into the box when you click. */
  value: string | number;
  onSave: (v: string) => void | Promise<unknown>;
  numeric?: boolean;
  /** Editable even outside customize mode. */
  always?: boolean;
  className?: string;
  /** What shows when not editing (default: the value). */
  children?: ReactNode;
}) {
  const { tr } = useFmt();
  const mode = useCustomizing();
  const [text, setText] = useState<string | null>(null);
  const done = useRef(false);
  if (!mode && !always) return <>{children ?? value}</>;

  if (text === null)
    return (
      <span
        role="button"
        tabIndex={0}
        title={tr("اضغط للتعديل", "Click to edit")}
        className={cn("cursor-text rounded-md outline-1 outline-offset-2 outline-dashed outline-action/70 hover:bg-action/10", className)}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          done.current = false;
          setText(String(value));
        }}
        onKeyDown={(e) => {
          if (e.key !== "Enter") return;
          e.preventDefault();
          done.current = false;
          setText(String(value));
        }}
      >
        {children ?? value}
      </span>
    );

  const finish = (save: boolean) => {
    if (done.current) return;
    done.current = true;
    const v = text.trim();
    setText(null);
    if (save && v && v !== String(value)) void onSave(v);
  };
  return (
    <input
      autoFocus
      value={text}
      size={Math.max(4, text.length + 1)}
      inputMode={numeric ? "numeric" : undefined}
      dir={numeric ? "ltr" : undefined}
      aria-label={tr("النص الجديد", "New text")}
      className={cn("max-w-full rounded-md border border-action bg-card px-1.5 py-0.5 text-text outline-none", numeric && "num text-end", className)}
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
      }}
      onChange={(e) => setText(numeric ? e.target.value.replace(/[^\d.]/g, "") : e.target.value)}
      onFocus={(e) => e.target.select()}
      onBlur={() => finish(true)}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === "Enter") finish(true);
        if (e.key === "Escape") finish(false);
      }}
    />
  );
}

// ---------- things you drag ----------
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
      <div ref={setNodeRef} style={style} className={cn("flex items-center gap-1.5", isDragging && "relative z-20 opacity-80", className)}>
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

// ---------- the switch in the top bar ----------
export function CustomizeToggle() {
  const { tr } = useFmt();
  const mode = useCustomizing();
  return (
    <button
      type="button"
      onClick={() => setCustomizing(!mode)}
      aria-pressed={mode}
      className={cn("inline-flex h-10 items-center gap-1.5 rounded-xl px-2.5 text-sm font-medium transition", mode ? "bg-action text-white" : "text-muted hover:bg-card-2 hover:text-text")}
    >
      {mode ? <Check className="size-[18px]" /> : <Paintbrush className="size-[18px]" />}
      <span className="hidden sm:inline">{mode ? tr("تم", "Done") : tr("تخصيص", "Customize")}</span>
    </button>
  );
}

// ---------- the strip under the top bar ----------
export function CustomizeBar() {
  const { tr } = useFmt();
  const mode = useCustomizing();
  const save = useSaveSite();
  const [brand, setBrand] = useState(false);
  if (!mode) return null;
  return (
    <div className="no-print sticky top-14 z-20 flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-action/30 bg-action/10 px-4 py-2 text-sm backdrop-blur sm:top-16">
      <Paintbrush className="size-4 shrink-0 text-action" />
      <p className="min-w-0 flex-1 basis-64">
        <b>{tr("وضع التخصيص.", "Customize mode.")}</b>{" "}
        {tr(
          "اسحب المقبض لتغيير المكان، واضغط على أي نص أو رقم محاط بخط متقطّع لتعديله، واضغط العين للإخفاء. يُحفظ كل تغيير فوراً.",
          "Drag the handle to move things, click any text or number with a dashed outline to change it, and press the eye to hide. Every change is saved at once.",
        )}
        <span className="md:hidden"> {tr("ترتيب القائمة الجانبية يكون من الحاسوب.", "The side menu is arranged from a computer.")}</span>
      </p>
      <Button size="sm" onClick={() => setBrand(true)}>
        <ImagePlus className="size-4" /> {tr("الاسم والشعار", "Name and logo")}
      </Button>
      <Button
        size="sm"
        variant="ghost"
        onClick={() => {
          if (!confirm(tr("إرجاع القائمة ولوحة التحكم إلى شكلهما الأصلي؟ (الاسم والشعار يبقيان)", "Put the menu and the dashboard back as they were? (The name and logo stay)"))) return;
          void save((s) => ({ ...s, nav: DEFAULT_SITE.nav, dashboard: DEFAULT_SITE.dashboard }));
        }}
      >
        <RotateCcw className="size-4" /> {tr("إرجاع الأصل", "Reset")}
      </Button>
      <Button size="sm" variant="primary" onClick={() => setCustomizing(false)}>
        <Check className="size-4" /> {tr("تم", "Done")}
      </Button>
      {brand && <BrandDialog onClose={() => setBrand(false)} />}
    </div>
  );
}

// ---------- the company's name and logo ----------
export function BrandDialog({ onClose }: { onClose: () => void }) {
  const { tr } = useFmt();
  const toast = useToast();
  const site = useSite();
  const [b, setB] = useState<Brand>(site.brand);
  const [busy, setBusy] = useState(false);
  const file = useRef<HTMLInputElement>(null);
  const put = (p: Partial<Brand>) => setB((x) => ({ ...x, ...p }));

  async function save() {
    setBusy(true);
    try {
      await saveSite((s) => ({ ...s, brand: b }));
      toast("success", tr("تم الحفظ، ويظهر الاسم والشعار الآن في كل الصفحات والفواتير", "Saved. The name and logo now show on every page and invoice"));
      onClose();
    } catch (e) {
      toast("danger", errorText(e, tr));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog
      open
      onClose={onClose}
      title={tr("الاسم والشعار", "Name and logo")}
      footer={
        <>
          <Button onClick={onClose}>{tr("إلغاء", "Cancel")}</Button>
          <Button variant="primary" loading={busy} onClick={save}>
            {tr("حفظ", "Save")}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="flex items-center gap-4">
          <LogoMark size={64} logo={b.logo ?? null} />
          <div className="flex flex-wrap gap-2">
            <Button size="sm" onClick={() => file.current?.click()}>
              <ImagePlus className="size-4" /> {b.logo ? tr("تغيير الشعار", "Change logo") : tr("رفع شعار", "Upload a logo")}
            </Button>
            {b.logo && (
              <Button size="sm" variant="ghost" onClick={() => put({ logo: undefined })}>
                <Trash2 className="size-4" /> {tr("الشعار الأصلي", "Original mark")}
              </Button>
            )}
            <input
              ref={file}
              type="file"
              accept="image/*"
              hidden
              onChange={async (e) => {
                const f = e.target.files?.[0];
                e.target.value = "";
                if (!f) return;
                try {
                  put({ logo: await shrinkImage(f, 256, 0.85) });
                } catch {
                  toast("danger", tr("تعذّرت قراءة الصورة", "Couldn't read the picture"));
                }
              }}
            />
          </div>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label={tr("الاسم المختصر", "Short name")}>
            <Input value={b.name} onChange={(e) => put({ name: e.target.value })} />
          </Field>
          <Field label={tr("الاسم المختصر (إنجليزي)", "Short name (English)")}>
            <Input dir="ltr" value={b.name_en} onChange={(e) => put({ name_en: e.target.value })} />
          </Field>
          <Field label={tr("الوصف تحت الاسم", "Line under the name")}>
            <Input value={b.tagline} onChange={(e) => put({ tagline: e.target.value })} />
          </Field>
          <Field label={tr("الوصف (إنجليزي)", "Line (English)")}>
            <Input dir="ltr" value={b.tagline_en} onChange={(e) => put({ tagline_en: e.target.value })} />
          </Field>
          <Field label={tr("اسم الشركة في الفواتير", "Company name on invoices")}>
            <Input value={b.company} onChange={(e) => put({ company: e.target.value })} />
          </Field>
          <Field label={tr("اسم الشركة (إنجليزي)", "Company name (English)")}>
            <Input dir="ltr" value={b.company_en} onChange={(e) => put({ company_en: e.target.value })} />
          </Field>
          <Field label={tr("هاتف الشركة", "Company phone")} hint={tr("يُطبع في الفاتورة", "Printed on the invoice")}>
            <Input dir="ltr" inputMode="tel" value={b.phone} onChange={(e) => put({ phone: e.target.value })} />
          </Field>
        </div>
      </div>
    </Dialog>
  );
}
