"use client";

// «قارب ينفد عندك؟» — reorder reminders, learned from each shop's own orders:
// - ReorderCard (the shop owner's home): the items he usually orders again about now, each added in a tap with
//   the amount he took the last time, or all at once.
// - LateShops (the rep's home): his shops later than usual with their next order.
import { Check, Clock, Plus, RotateCcw } from "lucide-react";
import { useApp } from "@/components/shell";
import { Card, CardHeader } from "@/components/ui";
import { api } from "@/lib/api";
import type { Customer, Item, Unit } from "@/lib/api/types";
import { useFmt } from "@/lib/i18n";
import { soldUnits } from "@/lib/units";
import { useLoad } from "@/lib/use-load";
import { cn } from "@/lib/utils";

type Tr = (ar: string, en: string) => string;
/** "يوم واحد / يومين / 5 أيام / 12 يوماً". */
const daysWord = (n: number, tr: Tr) => (n === 1 ? tr("يوم واحد", "1 day") : n === 2 ? tr("يومين", "2 days") : tr(`${n} ${n <= 10 ? "أيام" : "يوماً"}`, `${n} days`));

export function ReorderCard({ available, inBag, onAdd }: { available: (it: Item) => number; inBag: (id: number) => boolean; onAdd: (it: Item, unit: Unit, qty: number) => void }) {
  const { tr, name, unit } = useFmt();
  const { itemById } = useApp();
  const r = useLoad(() => api.myReorder().catch(() => []), []);
  const list = (r.data ?? []).map((d) => ({ d, it: itemById.get(d.item_id) })).filter((x): x is { d: (typeof x)["d"]; it: Item } => !!x.it && available(x.it) > 0);
  if (!list.length) return null;
  // The last amount, in a unit it is still sold by, and never more than what is in stock.
  const amount = (it: Item, u: Unit, q: number) => {
    const unitOk: Unit = soldUnits(it).includes(u) ? u : soldUnits(it)[0];
    const room = unitOk === "carton" ? Math.floor(available(it) / it.pieces_per_carton) : available(it);
    return { unit: unitOk, qty: Math.max(1, Math.min(q, room)) };
  };
  const waiting = list.filter((x) => !inBag(x.it.id));
  return (
    <Card id="reorder" className="rise-item mt-4 scroll-mt-20 overflow-hidden">
      <CardHeader
        title={
          <span className="flex items-center gap-2">
            <RotateCcw className="size-4 text-action" /> {tr("قارب ينفد عندك؟", "Running low?")}
          </span>
        }
        subtitle={tr("مواد اعتدت أن تطلبها في مثل هذا الوقت", "Items you usually order about now")}
        action={
          waiting.length > 1 && (
            <button
              type="button"
              onClick={() => waiting.forEach(({ d, it }) => onAdd(it, amount(it, d.last_unit, d.last_qty).unit, amount(it, d.last_unit, d.last_qty).qty))}
              className="shrink-0 rounded-full bg-action px-3 py-1.5 text-xs font-bold text-on-action hover:bg-action-hover"
            >
              {tr("أضف الكل", "Add all")}
            </button>
          )
        }
      />
      <ul className="divide-y divide-line">
        {list.slice(0, 6).map(({ d, it }) => {
          const a = amount(it, d.last_unit, d.last_qty);
          const added = inBag(it.id);
          return (
            <li key={it.id} className="flex items-center gap-3 px-4 py-2.5">
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-semibold">{name(it)}</span>
                <span className="block truncate text-xs text-muted">
                  {tr(`تطلبه كل ${daysWord(d.every_days, tr)} تقريباً · آخر مرة قبل ${daysWord(d.days_since, tr)}`, `You order it about every ${daysWord(d.every_days, tr)} · last ${daysWord(d.days_since, tr)} ago`)}
                </span>
              </span>
              <button
                type="button"
                disabled={added}
                onClick={() => onAdd(it, a.unit, a.qty)}
                aria-label={tr(`أضف ${a.qty} ${unit(it, a.unit)} من ${name(it)}`, `Add ${a.qty} ${unit(it, a.unit)} of ${name(it)}`)}
                className={cn(
                  "flex h-9 shrink-0 items-center gap-1 rounded-xl px-3 text-xs font-bold transition active:scale-95",
                  added ? "bg-success-soft text-success" : "border border-line-strong hover:bg-card-2",
                )}
              >
                {added ? <Check className="size-3.5" /> : <Plus className="size-3.5" />}
                {added ? tr("في السلة", "In the bag") : <span className="num">{`${a.qty} ${unit(it, a.unit, true)}`}</span>}
              </button>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}

export function LateShops({ customers, onOpen }: { customers: Customer[]; onOpen: (c: Customer) => void }) {
  const { tr, num } = useFmt();
  const r = useLoad(() => api.lateShops().catch(() => []), []);
  const list = (r.data ?? []).map((l) => ({ l, c: customers.find((c) => c.id === l.customer.id) })).filter((x): x is { l: (typeof x)["l"]; c: Customer } => !!x.c);
  if (!list.length) return null;
  return (
    <Card className="overflow-hidden">
      <CardHeader
        title={
          <span className="flex items-center gap-2">
            <Clock className="size-4 text-warning" /> {tr("تأخّروا عن موعد طلبهم", "Late with their usual order")}
          </span>
        }
        subtitle={tr("محلات مرّ عليها أكثر من المعتاد بلا طلب: زُرها أو اتصل بها", "Shops past their usual gap: visit or call them")}
      />
      <ul className="divide-y divide-line">
        {list.slice(0, 6).map(({ l, c }) => (
          <li key={c.id}>
            <button type="button" onClick={() => onOpen(c)} className="flex w-full items-center gap-3 px-4 py-2.5 text-start hover:bg-card-2">
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-semibold">{c.name}</span>
                <span className="block truncate text-xs text-muted">
                  {c.area} · {tr(`يطلب كل ${daysWord(l.every_days, tr)} تقريباً`, `orders about every ${daysWord(l.every_days, tr)}`)}
                </span>
              </span>
              <span className="num shrink-0 rounded-full bg-warning-soft px-2.5 py-0.5 text-xs font-bold text-warning">{tr(`منذ ${daysWord(l.days_since, tr)}`, `${num(l.days_since)} days`)}</span>
            </button>
          </li>
        ))}
      </ul>
    </Card>
  );
}
