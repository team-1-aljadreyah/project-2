"use client";

// «قوائمي»: the shop owner's saved lists (his weekly order, Friday's order…). Each shows what it costs today
// (today's prices and offers), goes into the bag in one tap (what is there now: an item that stopped or
// ran out is named), and can be renamed, changed or deleted. Kept on the server: they follow him to any phone.
import { useState } from "react";
import { ListChecks, Pencil, Plus, ShoppingBag, Trash2 } from "lucide-react";
import { Art } from "@/components/product-art";
import { ShopOrdersTabs } from "@/components/shop/orders-tabs";
import { bagTotal, itemsWord, useMyShop } from "@/components/shop/kit";
import { Button, Dialog, Empty, ErrorBox, Field, Input, LoadingRows, Select, Stepper, errorText, useToast } from "@/components/ui";
import { api } from "@/lib/api";
import type { ShopList, Unit } from "@/lib/api/types";
import { useAppRouter } from "@/lib/app-path";
import { useFmt } from "@/lib/i18n";
import { useLoad } from "@/lib/use-load";
import { firstUnit, soldUnits } from "@/lib/units";

type Lines = ShopList["lines"];

export function ShopLists() {
  const { tr, money, name, ago } = useFmt();
  const shop = useMyShop();
  const toast = useToast();
  const router = useAppRouter();
  const lists = useLoad(() => api.shopLists(), [shop.customer?.id]);
  const [editing, setEditing] = useState<ShopList | "new" | null>(null);
  const [removing, setRemoving] = useState<ShopList | null>(null);
  if (lists.state.status === "error") return <ErrorBox error={lists.state.error} onRetry={lists.reload} />;
  if (!shop.customer || !lists.data) return <LoadingRows />;
  const byId = (id: number) => shop.active.find((i) => i.id === id);

  /** The list into the bag: each item that can be ordered now (its unit sold, some in stock). */
  function toBag(l: ShopList) {
    const missing: string[] = [];
    let added = 0;
    shop.setBag((b) => {
      const lines = [...b.lines];
      for (const x of l.lines) {
        const it = byId(x.item_id);
        if (!it || !soldUnits(it).includes(x.unit) || shop.available(it) <= 0) {
          if (it) missing.push(name(it));
          continue;
        }
        const at = lines.findIndex((y) => y.item_id === x.item_id);
        if (at >= 0) lines[at] = { ...lines[at], unit: x.unit, qty: Math.max(lines[at].qty, x.qty) };
        else lines.push({ ...x });
        added++;
      }
      return { ...b, lines };
    });
    if (missing.length) toast("danger", tr(`غير متوفرة الآن: ${missing.join("، ")}`, `Not available now: ${missing.join(", ")}`));
    if (added) {
      toast("success", tr(`أُضيفت ${itemsWord(added, tr)} إلى السلة`, `${added} items are in the bag`));
      router.push("/shop?bag=1");
    }
  }

  return (
    <>
      <ShopOrdersTabs />
      <div className="mx-auto max-w-3xl pb-28">
        <div className="mb-4 flex items-center justify-between gap-3">
          <div>
            <h1 className="text-lg font-bold">{tr("قوائمي", "My lists")}</h1>
            <p className="text-sm text-muted">{tr("احفظ ما تطلبه دائماً، وأرسله إلى السلة بلمسة.", "Save what you always order, and send it to the bag in one tap.")}</p>
          </div>
          <Button variant="action" onClick={() => setEditing("new")}>
            <Plus className="size-4" /> {tr("قائمة جديدة", "New list")}
          </Button>
        </div>

        {!lists.data.length ? (
          <div className="rounded-3xl border border-line bg-card">
            <Empty icon={<ListChecks className="size-6" />} title={tr("لا قوائم بعد", "No lists yet")} body={tr("املأ السلة ثم اضغط «احفظ كقائمة»، أو أنشئ قائمة هنا.", "Fill the bag and press «Save as a list», or make one here.")} />
          </div>
        ) : (
          <ul className="grid gap-3 sm:grid-cols-2">
            {lists.data.map((l) => {
              const items = l.lines.map((x) => byId(x.item_id)).filter(Boolean);
              return (
                <li key={l.id} className="flex flex-col rounded-3xl border border-line bg-card p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate text-base font-bold">{l.name}</p>
                      <p className="text-xs text-muted">
                        {itemsWord(l.lines.length, tr)} · {tr("آخر تعديل", "Changed")} {ago(l.updated_at)}
                      </p>
                    </div>
                    <span className="flex shrink-0 gap-1">
                      <button type="button" onClick={() => setEditing(l)} aria-label={tr(`عدّل ${l.name}`, `Edit ${l.name}`)} className="rounded-lg p-2 text-muted hover:bg-card-2 hover:text-text">
                        <Pencil className="size-4" />
                      </button>
                      <button type="button" onClick={() => setRemoving(l)} aria-label={tr(`احذف ${l.name}`, `Delete ${l.name}`)} className="rounded-lg p-2 text-muted hover:bg-danger-soft hover:text-danger">
                        <Trash2 className="size-4" />
                      </button>
                    </span>
                  </div>
                  <div className="mt-3 flex -space-x-2 rtl:space-x-reverse">
                    {items.slice(0, 5).map((it) => (
                      <span key={it!.id} className="w-11 overflow-hidden rounded-xl ring-2 ring-card">
                        <Art category={it!.category} index={shop.catIndex(it!.category)} image={it!.image} size="sm" />
                      </span>
                    ))}
                    {items.length > 5 && <span className="num flex size-11 items-center justify-center rounded-xl bg-card-2 text-xs font-bold ring-2 ring-card">+{items.length - 5}</span>}
                  </div>
                  <p className="mt-2 line-clamp-2 text-xs text-muted">{items.map((it) => name(it!)).join("، ")}</p>
                  <div className="mt-auto flex items-center justify-between gap-2 pt-3">
                    <span>
                      <span className="block text-[11px] text-muted">{tr("بسعر اليوم", "At today's prices")}</span>
                      <span className="num font-bold">{money(bagTotal(l.lines, byId, shop.price))}</span>
                    </span>
                    <Button variant="action" onClick={() => toBag(l)} disabled={!l.lines.length}>
                      <ShoppingBag className="size-4" /> {tr("إلى السلة", "To the bag")}
                    </Button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {editing && (
        <ListEditor
          list={editing === "new" ? undefined : editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            lists.reload();
          }}
        />
      )}
      {removing && (
        <Dialog
          open
          onClose={() => setRemoving(null)}
          title={tr(`حذف «${removing.name}»؟`, `Delete «${removing.name}»?`)}
          footer={
            <>
              <Button onClick={() => setRemoving(null)}>{tr("تراجع", "Back")}</Button>
              <Button
                variant="danger"
                onClick={async () => {
                  try {
                    await api.deleteShopList(removing.id);
                    lists.reload();
                    toast("success", tr("حُذفت القائمة", "The list is deleted"));
                  } catch (e) {
                    toast("danger", errorText(e, tr));
                  }
                  setRemoving(null);
                }}
              >
                <Trash2 className="size-4" /> {tr("احذف", "Delete")}
              </Button>
            </>
          }
        >
          <p className="text-sm text-muted">{tr("تُحذف القائمة فقط؛ طلباتك لا تتغير.", "Only the list goes; your orders don't change.")}</p>
        </Dialog>
      )}
    </>
  );
}

/** Make or change a list: its name, its items and amounts. `initial`: from the bag («احفظ كقائمة»). */
export function ListEditor({ list, initial, onClose, onSaved }: { list?: ShopList; initial?: Lines; onClose: () => void; onSaved: () => void }) {
  const { tr, name, unit: unitOf } = useFmt();
  const shop = useMyShop();
  const toast = useToast();
  const [title, setTitle] = useState(list?.name ?? "");
  const [lines, setLines] = useState<Lines>(list?.lines ?? initial ?? []);
  const [pick, setPick] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const byId = (id: number) => shop.active.find((i) => i.id === id);
  const set = (i: number, p: Partial<Lines[number]>) => setLines((ls) => ls.map((l, k) => (k === i ? { ...l, ...p } : l)));
  async function save() {
    setBusy(true);
    setErr(null);
    try {
      await api.saveShopList(list?.id ?? null, { name: title, lines });
      toast("success", tr("حُفظت القائمة", "The list is saved"));
      onSaved();
    } catch (e) {
      setErr(errorText(e, tr));
    } finally {
      setBusy(false);
    }
  }
  return (
    <Dialog
      open
      onClose={onClose}
      title={list ? tr("تعديل القائمة", "Edit the list") : tr("قائمة جديدة", "New list")}
      footer={
        <>
          <Button onClick={onClose}>{tr("إلغاء", "Cancel")}</Button>
          <Button variant="primary" loading={busy} disabled={!title.trim()} onClick={save}>
            {tr("حفظ", "Save")}
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <Field label={tr("اسم القائمة", "The list's name")} error={err ?? undefined}>
          <Input value={title} maxLength={40} onChange={(e) => setTitle(e.target.value)} placeholder={tr("مثلاً: طلب الأسبوع", "e.g. The weekly order")} autoFocus />
        </Field>
        <ul className="space-y-2">
          {lines.map((l, i) => {
            const it = byId(l.item_id);
            if (!it) return null;
            return (
              <li key={`${l.item_id}-${i}`} className="flex items-center gap-2 rounded-2xl border border-line p-2">
                <span className="w-12 shrink-0">
                  <Art category={it.category} index={shop.catIndex(it.category)} image={it.image} size="sm" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold">{name(it)}</span>
                  {soldUnits(it).length > 1 ? (
                    <select value={l.unit} onChange={(e) => set(i, { unit: e.target.value as Unit })} aria-label={tr("الوحدة", "Unit")} className="mt-0.5 rounded-lg border border-line bg-card px-1.5 py-0.5 text-xs">
                      {soldUnits(it).map((u) => (
                        <option key={u} value={u}>
                          {unitOf(it, u)}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <span className="text-xs text-muted">{unitOf(it, l.unit)}</span>
                  )}
                </span>
                <Stepper value={l.qty} min={1} onChange={(v) => set(i, { qty: v })} />
                <button type="button" onClick={() => setLines((ls) => ls.filter((_, k) => k !== i))} aria-label={tr(`أزل ${name(it)}`, `Remove ${name(it)}`)} className="rounded-lg p-2 text-muted hover:bg-danger-soft hover:text-danger">
                  <Trash2 className="size-4" />
                </button>
              </li>
            );
          })}
        </ul>
        {/* Add an item */}
        <div className="flex gap-2">
          <Select value={pick} onChange={(e) => setPick(e.target.value)} aria-label={tr("أضف مادة", "Add an item")} className="min-w-0 flex-1">
            <option value="">{tr("أضف مادة…", "Add an item…")}</option>
            {shop.active
              .filter((it) => !lines.some((l) => l.item_id === it.id))
              .map((it) => (
                <option key={it.id} value={it.id}>
                  {name(it)}
                </option>
              ))}
          </Select>
          <Button
            disabled={!pick}
            onClick={() => {
              const it = byId(Number(pick));
              if (it) setLines((ls) => [...ls, { item_id: it.id, unit: firstUnit(it), qty: 1 }]);
              setPick("");
            }}
          >
            <Plus className="size-4" /> {tr("أضف", "Add")}
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
