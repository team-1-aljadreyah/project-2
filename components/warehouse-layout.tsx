"use client";

// Warehouses you can shape:
// - WarehouseForm: the manager adds a warehouse, or changes its name, size and place on the map.
// - LayoutEditor: the manager, or the warehouse's own keeper, arranges the inside: the zones (add, rename,
//   put in walking order, remove) and where every item is kept. Items are dragged from one zone to
//   another (or moved with the small list on each one, easier on a phone).
// The warehouse map, the picking hall and the shelf codes (Z03-A02) follow the new layout at once.
import { useMemo, useState } from "react";
import { DndContext, DragOverlay, KeyboardSensor, PointerSensor, useDraggable, useDroppable, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { ArrowDown, ArrowUp, GripVertical, LayoutGrid, Plus, RotateCcw, Search, Trash2 } from "lucide-react";
import { layoutOf, nextZoneCode, zoneOfItem } from "@/components/map/data";
import { MapPin } from "@/components/map-pin";
import { useApp } from "@/components/shell";
import { Button, Dialog, Field, Input, NumberInput, errorText, useToast } from "@/components/ui";
import { api, ApiError } from "@/lib/api";
import type { Item, User, Warehouse, WarehouseInput, WarehouseZone } from "@/lib/api/types";
import { useFmt } from "@/lib/i18n";
import { cn, matches } from "@/lib/utils";

/** May this person arrange this warehouse? The manager: every one. A keeper: his own. */
export const canArrange = (user: Pick<User, "role" | "warehouse_id">, warehouseId: number) =>
  user.role === "manager" || (user.role === "warehouse" && (!user.warehouse_id || user.warehouse_id === warehouseId));

// ---------- a new warehouse, or its details ----------

export function WarehouseForm({ warehouse, onClose, onSaved }: { warehouse?: Warehouse; onClose: () => void; onSaved?: (w: Warehouse) => void }) {
  const { tr } = useFmt();
  const { reloadLookups, reloadItems } = useApp();
  const toast = useToast();
  const [f, setF] = useState<WarehouseInput>({
    name: warehouse?.name ?? "",
    name_en: warehouse?.name_en ?? "",
    capacity: warehouse?.capacity ?? 5000,
    lat: warehouse?.lat,
    lng: warehouse?.lng,
  });
  const [cap, setCap] = useState<number | "">(f.capacity);
  const [err, setErr] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  async function save() {
    setBusy(true);
    setErr({});
    try {
      const input = { ...f, capacity: cap === "" ? 0 : cap };
      const w = warehouse ? await api.saveWarehouse(warehouse.id, input) : await api.createWarehouse(input);
      toast(
        "success",
        warehouse
          ? tr("حُفظ المخزن", "Warehouse saved")
          : tr(`أُضيف ${w.name}. رتّب مناطقه، واختر أمين مخزن له من صفحة المستخدمين.`, `${w.name_en} added. Arrange its zones, and give it a keeper from the users page.`),
      );
      reloadLookups();
      // The items carry their stock per warehouse: the new one must show (with 0) everywhere.
      reloadItems();
      onSaved?.(w);
      onClose();
    } catch (e) {
      if (e instanceof ApiError && e.errors) setErr(e.errors);
      toast("danger", errorText(e, tr));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog
      open
      plain
      onClose={onClose}
      title={warehouse ? tr(`تعديل ${warehouse.name}`, `Edit ${warehouse.name_en}`) : tr("مخزن جديد", "New warehouse")}
      footer={
        <>
          <Button onClick={onClose}>{tr("إلغاء", "Cancel")}</Button>
          <Button variant="primary" loading={busy} onClick={save}>
            {warehouse ? tr("حفظ", "Save") : tr("إضافة المخزن", "Add the warehouse")}
          </Button>
        </>
      }
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label={tr("الاسم", "Name")} error={err.name}>
          <Input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder={tr("مثلاً: مخزن الحسينية", "e.g. Al-Husainiya store")} invalid={!!err.name} />
        </Field>
        <Field label={tr("الاسم بالإنجليزية", "Name in English")}>
          <Input dir="ltr" value={f.name_en} onChange={(e) => setF({ ...f, name_en: e.target.value })} />
        </Field>
        <Field label={tr("السعة (كارتون)", "Capacity (cartons)")} error={err.capacity} hint={tr("لحساب نسبة امتلاء المخزن على الخريطة", "For how full it is on the map")}>
          <NumberInput value={cap} onChange={setCap} invalid={!!err.capacity} />
        </Field>
      </div>
      <Field label={tr("مكانه على الخريطة", "Where it is")} hint={tr("منه تبدأ جولات التوصيل", "Delivery trips start from here")} className="mt-3">
        <MapPin lat={f.lat} lng={f.lng} editable onChange={(lat, lng) => setF({ ...f, lat, lng })} className="h-56" />
      </Field>
    </Dialog>
  );
}

// ---------- the inside: zones and the place of every item ----------

export function LayoutEditor({ warehouse, onClose }: { warehouse: Warehouse; onClose: () => void }) {
  const { tr } = useFmt();
  const { items, reloadLookups } = useApp();
  const toast = useToast();
  const active = useMemo(() => items.filter((i) => i.active), [items]);
  const start = layoutOf(warehouse, items);
  const [zones, setZones] = useState<WarehouseZone[]>(() => start.zones.map((z) => ({ ...z })));
  // Every item gets a written place, so renaming a zone never moves goods by itself.
  const [places, setPlaces] = useState<Record<string, string>>(() => Object.fromEntries(active.map((i) => [String(i.id), zoneOfItem(start, i)])));
  const [q, setQ] = useState("");
  const [dragging, setDragging] = useState<Item | null>(null);
  const [busy, setBusy] = useState(false);
  // A small move starts a drag (so the zone list on an item still opens with a click); arrows work too.
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }), useSensor(KeyboardSensor));
  const moved = active.filter((i) => places[String(i.id)] !== zoneOfItem(start, i)).length;

  const move = (itemId: number, zone: string) => setPlaces((p) => ({ ...p, [String(itemId)]: zone }));
  const end = (e: DragEndEvent) => {
    setDragging(null);
    const to = e.over?.id ? String(e.over.id) : "";
    if (to.startsWith("zone:")) move(Number(String(e.active.id).slice(5)), to.slice(5));
  };
  const shift = (i: number, by: -1 | 1) =>
    setZones((zs) => {
      const j = i + by;
      if (j < 0 || j >= zs.length) return zs;
      const next = [...zs];
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });
  const remove = (code: string) => {
    const rest = zones.filter((z) => z.code !== code);
    const here = active.filter((i) => places[String(i.id)] === code);
    if (here.length && !confirm(tr(`في هذه المنطقة ${here.length} مادة: تنتقل إلى ${rest[0].name}. متابعة؟`, `${here.length} item(s) here move to ${rest[0].name}. Go on?`))) return;
    setZones(rest);
    setPlaces((p) => Object.fromEntries(Object.entries(p).map(([k, v]) => [k, v === code ? rest[0].code : v])));
  };
  const add = () => setZones((zs) => [...zs, { code: nextZoneCode(zs), name: tr("منطقة جديدة", "New zone") }]);
  const byCategory = () => {
    if (!confirm(tr("إرجاع المخزن إلى منطقة لكل صنف؟ تُفقد التغييرات غير المحفوظة.", "Back to one zone per category? Unsaved changes are lost."))) return;
    const fresh = layoutOf({ ...warehouse, layout: undefined }, items);
    setZones(fresh.zones);
    setPlaces(Object.fromEntries(active.map((i) => [String(i.id), zoneOfItem(fresh, i)])));
  };

  async function save() {
    setBusy(true);
    try {
      await api.saveLayout(warehouse.id, { zones, places });
      toast("success", tr("حُفظ ترتيب المخزن، وتغيّرت الخريطة وقاعة التجهيز معه", "Saved. The map and the picking hall follow it"));
      reloadLookups();
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
      plain
      wide
      onClose={onClose}
      title={
        <span className="flex items-center gap-2">
          <LayoutGrid className="size-5 text-action" /> {tr(`ترتيب ${warehouse.name}`, `Arrange ${warehouse.name_en}`)}
        </span>
      }
      footer={
        <>
          <span className="me-auto self-center text-xs text-muted">
            {moved ? tr(`${moved} مادة نُقلت`, `${moved} item(s) moved`) : tr("اسحب المادة إلى منطقة أخرى لنقلها", "Drag an item to another zone to move it")}
          </span>
          <Button onClick={onClose}>{tr("إلغاء", "Cancel")}</Button>
          <Button variant="primary" loading={busy} onClick={save}>
            {tr("حفظ الترتيب", "Save the layout")}
          </Button>
        </>
      }
    >
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="flex h-10 min-w-48 flex-1 items-center gap-2 rounded-xl border border-line-strong bg-card px-3">
          <Search className="size-4 text-faint" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={tr("ابحث عن مادة لتجدها", "Find an item")} className="h-full flex-1 bg-transparent text-sm outline-none" />
        </div>
        <Button size="sm" onClick={add}>
          <Plus className="size-4" /> {tr("منطقة جديدة", "New zone")}
        </Button>
        <Button size="sm" variant="ghost" onClick={byCategory}>
          <RotateCcw className="size-4" /> {tr("منطقة لكل صنف", "One per category")}
        </Button>
      </div>
      <p className="mb-3 text-xs text-muted">
        {tr(
          "المناطق مرتبة كما يمشي أمين المخزن من الاستلام إلى التحميل: الأسهم تغيّر ترتيبها. اسحب المادة من المقبض إلى منطقة أخرى، أو اختر منطقتها من القائمة.",
          "Zones are in walking order, from receiving to loading: the arrows change it. Drag an item by its handle to another zone, or pick its zone from the list.",
        )}
      </p>
      <DndContext sensors={sensors} onDragStart={(e) => setDragging(active.find((i) => `item:${i.id}` === e.active.id) ?? null)} onDragEnd={end} onDragCancel={() => setDragging(null)}>
        <div className="grid gap-3 sm:grid-cols-2">
          {zones.map((z, i) => (
            <ZoneBox
              key={z.code}
              zone={z}
              first={i === 0}
              last={i === zones.length - 1}
              canRemove={zones.length > 1}
              items={active.filter((it) => places[String(it.id)] === z.code)}
              zones={zones}
              q={q}
              onRename={(name) => setZones((zs) => zs.map((x) => (x.code === z.code ? { ...x, name } : x)))}
              onShift={(by) => shift(i, by)}
              onRemove={() => remove(z.code)}
              onMove={move}
            />
          ))}
        </div>
        <DragOverlay>{dragging && <Chip item={dragging} overlay />}</DragOverlay>
      </DndContext>
    </Dialog>
  );
}

function ZoneBox({
  zone,
  first,
  last,
  canRemove,
  items,
  zones,
  q,
  onRename,
  onShift,
  onRemove,
  onMove,
}: {
  zone: WarehouseZone;
  first: boolean;
  last: boolean;
  canRemove: boolean;
  items: Item[];
  zones: WarehouseZone[];
  q: string;
  onRename: (name: string) => void;
  onShift: (by: -1 | 1) => void;
  onRemove: () => void;
  onMove: (itemId: number, zone: string) => void;
}) {
  const { tr } = useFmt();
  const { setNodeRef, isOver } = useDroppable({ id: `zone:${zone.code}` });
  const icon = "flex size-8 shrink-0 items-center justify-center rounded-lg text-muted hover:bg-card-2 hover:text-text disabled:opacity-30";
  return (
    <section ref={setNodeRef} className={cn("flex flex-col rounded-2xl border-2 bg-card-2/40 p-2 transition-colors", isOver ? "border-action bg-action/10" : "border-line")}>
      <div className="mb-2 flex items-center gap-1">
        <span className="num shrink-0 rounded-md bg-primary px-1.5 py-0.5 text-[11px] font-bold text-on-primary">{zone.code}</span>
        <input
          value={zone.name}
          onChange={(e) => onRename(e.target.value)}
          aria-label={tr("اسم المنطقة", "Zone name")}
          className="h-8 min-w-0 flex-1 rounded-lg border border-transparent bg-transparent px-1.5 text-sm font-bold outline-none hover:border-line focus:border-action focus:bg-card"
        />
        <span className="num shrink-0 text-xs text-muted">{items.length}</span>
        <button type="button" className={icon} disabled={first} onClick={() => onShift(-1)} aria-label={tr("قبلها في المسار", "Earlier on the walk")}>
          <ArrowUp className="size-4" />
        </button>
        <button type="button" className={icon} disabled={last} onClick={() => onShift(1)} aria-label={tr("بعدها في المسار", "Later on the walk")}>
          <ArrowDown className="size-4" />
        </button>
        <button type="button" className={cn(icon, "hover:text-danger")} disabled={!canRemove} onClick={onRemove} aria-label={tr("حذف المنطقة", "Remove the zone")}>
          <Trash2 className="size-4" />
        </button>
      </div>
      <ul className="min-h-12 space-y-1.5">
        {items.map((it) => (
          <li key={it.id}>
            <DraggableChip item={it} zones={zones} zone={zone.code} dim={!!q && !matches(q, it.name, it.name_en, it.barcode)} onMove={onMove} />
          </li>
        ))}
        {!items.length && <li className="rounded-xl border border-dashed border-line-strong p-3 text-center text-xs text-faint">{tr("أفلِت المواد هنا", "Drop items here")}</li>}
      </ul>
    </section>
  );
}

function DraggableChip({ item, zones, zone, dim, onMove }: { item: Item; zones: WarehouseZone[]; zone: string; dim: boolean; onMove: (itemId: number, zone: string) => void }) {
  const { tr } = useFmt();
  const { setNodeRef, listeners, attributes, isDragging } = useDraggable({ id: `item:${item.id}` });
  return (
    <div ref={setNodeRef} className={cn("transition-opacity", isDragging && "opacity-30", dim && "opacity-30")}>
      <Chip
        item={item}
        handle={
          <button
            type="button"
            {...listeners}
            {...attributes}
            aria-label={tr(`اسحب ${item.name}`, `Drag ${item.name_en}`)}
            className="flex size-7 shrink-0 cursor-grab touch-none items-center justify-center rounded-md text-faint hover:bg-card-2 hover:text-text active:cursor-grabbing"
          >
            <GripVertical className="size-4" />
          </button>
        }
      >
        <select
          value={zone}
          onChange={(e) => onMove(item.id, e.target.value)}
          aria-label={tr(`منطقة ${item.name}`, `Zone of ${item.name_en}`)}
          className="h-7 max-w-24 shrink-0 rounded-md border border-line bg-card px-1 text-[11px] text-muted outline-none focus:border-action"
        >
          {zones.map((z) => (
            <option key={z.code} value={z.code}>
              {z.code} · {z.name}
            </option>
          ))}
        </select>
      </Chip>
    </div>
  );
}

function Chip({ item, handle, overlay, children }: { item: Item; handle?: React.ReactNode; overlay?: boolean; children?: React.ReactNode }) {
  const { name } = useFmt();
  return (
    <div className={cn("flex items-center gap-1.5 rounded-xl border border-line bg-card p-1.5 text-sm", overlay && "cursor-grabbing border-action shadow-xl")}>
      {handle ?? <GripVertical className="size-4 shrink-0 text-faint" />}
      <span className="min-w-0 flex-1 truncate font-medium">{name(item)}</span>
      {children}
    </div>
  );
}
