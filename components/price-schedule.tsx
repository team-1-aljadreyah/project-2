"use client";

// «تغيير الأسعار من تاريخ»:
// - PriceScheduleDialog (manager): new prices from a day — many items by a percent (up or down), or one item's
//   exact prices. The shops that buy them are told (a rise at once, a fall on the day).
// - ScheduledPrices: the changes waiting for their day (and the last done ones), on the items page.
// - PriceHistoryCard: an item's prices over time and what is scheduled, on the item's page.
import { useState } from "react";
import { CalendarClock, History, TrendingDown, TrendingUp } from "lucide-react";
import { useApp } from "@/components/shell";
import { Button, Card, CardHeader, Dialog, Field, Input, NumberInput, SearchBox, Segmented, errorText, useToast } from "@/components/ui";
import { api } from "@/lib/api";
import type { Item, ItemPrice, ScheduledPrice } from "@/lib/api/types";
import { useFmt } from "@/lib/i18n";
import { soldUnits } from "@/lib/units";
import { useLoad } from "@/lib/use-load";
import { cn, matches, today } from "@/lib/utils";

const round = (n: number, to: number) => Math.max(to, Math.round(n / to) * to);

/** "مادة واحدة / مادتين / 5 مواد / 12 مادة". */
const itemsAr = (n: number) => (n === 1 ? "مادة واحدة" : n === 2 ? "مادتين" : n <= 10 ? `${n} مواد` : `${n} مادة`);

/** The same rounding as the server: the carton to 250 IQD, the piece to 50, then the item's unit rule. */
function after(it: Item, percent: number): ItemPrice[] {
  return it.prices.map((p) => {
    let carton = round(p.carton_price * (1 + percent / 100), 250);
    let piece = round(p.piece_price * (1 + percent / 100), 50);
    if (it.sells === "piece" || it.pieces_per_carton <= 1) carton = piece * it.pieces_per_carton;
    if (it.sells === "pack") piece = Math.round(carton / it.pieces_per_carton);
    return { tier_id: p.tier_id, carton_price: carton, piece_price: piece };
  });
}

export function PriceScheduleDialog({ preset = [], onClose }: { preset?: number[]; onClose: () => void }) {
  const { tr, name, money, num, date } = useFmt();
  const toast = useToast();
  const { items, lookups } = useApp();
  const live = items.filter((i) => i.active && !i.deleted);
  const [picked, setPicked] = useState<Set<number>>(new Set(preset));
  const [q, setQ] = useState("");
  const [mode, setMode] = useState<"percent" | "exact">("percent");
  const [dir, setDir] = useState<"up" | "down">("up");
  const [value, setValue] = useState<number | "">(5);
  const [start, setStart] = useState(today(1));
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const one = picked.size === 1 ? live.find((i) => picked.has(i.id)) : undefined;
  const [exact, setExact] = useState<ItemPrice[]>(() => (one ? one.prices.map((p) => ({ ...p })) : []));
  const exactMode = mode === "exact" && !!one;
  const percent = dir === "up" ? Number(value || 0) : -Number(value || 0);
  const list = live.filter((i) => matches(q, i.name, i.name_en, i.category, i.brand));
  const cats = [...new Set(live.map((i) => i.category))];
  const toggle = (id: number) =>
    setPicked((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      const only = n.size === 1 ? live.find((i) => n.has(i.id)) : undefined;
      if (only) setExact(only.prices.map((p) => ({ ...p })));
      return n;
    });
  const tier = lookups.tiers[1]?.id ?? lookups.tiers[0]?.id;
  const okPercent = typeof value === "number" && value > 0 && (dir === "up" ? value <= 100 : value <= 50);
  const ok = picked.size > 0 && start >= today() && (exactMode ? exact.every((p) => p.carton_price > 0 && p.piece_price > 0) : okPercent);
  const preview = live.filter((i) => picked.has(i.id)).slice(0, 6);

  const save = async () => {
    setBusy(true);
    try {
      const s = await api.schedulePrice({ item_ids: [...picked], start, ...(exactMode ? { prices: exact } : { percent }), ...(note.trim() ? { note: note.trim() } : {}) });
      toast(
        "success",
        s.status === "applied"
          ? tr(`تغيّرت الأسعار الآن${s.told ? `، ووصل إشعار لـ ${s.told} من أصحاب المحلات` : ""}`, `Prices changed now${s.told ? `; ${s.told} shop owners were told` : ""}`)
          : tr(`تتغيّر الأسعار يوم ${date(s.start)}${s.told ? `، ووصل إشعار لـ ${s.told} من أصحاب المحلات` : ""}`, `Prices change on ${date(s.start)}${s.told ? `; ${s.told} shop owners were told` : ""}`),
      );
      onClose();
    } catch (e) {
      toast("danger", errorText(e, tr));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog
      open
      wide
      onClose={onClose}
      title={tr("تغيير الأسعار من تاريخ", "Change prices from a day")}
      footer={
        <Button variant="action" className="w-full" disabled={!ok} loading={busy} onClick={save}>
          <CalendarClock className="size-4" />
          {start === today() ? tr(`غيّر أسعار ${itemsAr(picked.size)} الآن`, `Change ${num(picked.size)} items now`) : tr(`غيّر أسعار ${itemsAr(picked.size)} يوم ${date(start)}`, `Change ${num(picked.size)} items on ${date(start)}`)}
        </Button>
      }
    >
      <p className="mb-2 text-sm font-semibold">{tr("المواد", "Items")}</p>
      <SearchBox value={q} onChange={setQ} placeholder={tr("ابحث عن مادة", "Search an item")} />
      <div className="mt-2 flex flex-wrap gap-1.5">
        {cats.map((c) => {
          const ids = live.filter((i) => i.category === c).map((i) => i.id);
          const all = ids.every((id) => picked.has(id));
          return (
            <button
              key={c}
              type="button"
              onClick={() =>
                setPicked((s) => {
                  const n = new Set(s);
                  ids.forEach((id) => (all ? n.delete(id) : n.add(id)));
                  return n;
                })
              }
              className={cn("h-8 rounded-full border px-3 text-xs font-semibold", all ? "border-action bg-action text-on-action" : "border-line-strong hover:bg-card-2")}
            >
              {c}
            </button>
          );
        })}
      </div>
      <ul className="mt-2 max-h-48 divide-y divide-line overflow-y-auto rounded-xl border border-line">
        {list.map((i) => (
          <li key={i.id}>
            <label className="flex cursor-pointer items-center gap-2 px-3 py-2 text-sm hover:bg-card-2">
              <input type="checkbox" checked={picked.has(i.id)} onChange={() => toggle(i.id)} className="size-4 accent-[var(--action)]" />
              <span className="min-w-0 flex-1 truncate">{name(i)}</span>
              <span className="text-xs text-muted">{i.category}</span>
            </label>
          </li>
        ))}
      </ul>
      <p className="mt-1 text-xs text-muted">{tr(`المختار: ${num(picked.size)}`, `Picked: ${num(picked.size)}`)}</p>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <Field label={tr("يبدأ يوم", "Starts on")} hint={start === today() ? tr("اليوم: تتغيّر الأسعار الآن", "Today: the prices change now") : tr("تتغيّر الأسعار وحدها صباح ذلك اليوم", "The prices change by themselves that morning")}>
          <Input type="date" value={start} min={today()} max={today(90)} onChange={(e) => e.target.value && setStart(e.target.value)} />
        </Field>
        <Field label={tr("ملاحظة (اختياري)", "A note (optional)")}>
          <Input value={note} onChange={(e) => setNote(e.target.value)} maxLength={200} placeholder={tr("مثلاً: ارتفاع سعر المورد", "e.g. the supplier raised his price")} />
        </Field>
      </div>

      {one && (
        <Segmented
          className="mt-4"
          value={mode}
          onChange={setMode}
          options={[
            { value: "percent", label: tr("بنسبة", "By a percent") },
            { value: "exact", label: tr("أسعار محددة", "Exact prices") },
          ]}
        />
      )}
      {!exactMode ? (
        <div className="mt-3 flex flex-wrap items-end gap-2">
          <Segmented
            value={dir}
            onChange={setDir}
            options={[
              { value: "up", label: tr("رفع", "Raise") },
              { value: "down", label: tr("تخفيض", "Lower") },
            ]}
          />
          <Field className="w-32" error={value !== "" && !okPercent ? (dir === "up" ? tr("حتى 100", "Up to 100") : tr("حتى 50", "Up to 50")) : undefined}>
            <NumberInput value={value} onChange={setValue} suffix="%" aria-label={tr("النسبة", "Percent")} />
          </Field>
        </div>
      ) : (
        <ul className="mt-3 space-y-2">
          {exact.map((p, k) => (
            <li key={p.tier_id} className="grid grid-cols-[minmax(0,1fr)_7.5rem_7.5rem] items-center gap-2 text-sm">
              <span className="truncate text-muted">{name(lookups.tiers.find((t) => t.id === p.tier_id))}</span>
              <NumberInput value={p.carton_price} onChange={(v) => setExact((xs) => xs.map((x, j) => (j === k ? { ...x, carton_price: Number(v || 0) } : x)))} aria-label={tr("سعر الوحدة الكبيرة", "Big pack price")} disabled={!soldUnits(one!).includes("carton")} />
              <NumberInput value={p.piece_price} onChange={(v) => setExact((xs) => xs.map((x, j) => (j === k ? { ...x, piece_price: Number(v || 0) } : x)))} aria-label={tr("سعر الوحدة الصغيرة", "Single price")} disabled={!soldUnits(one!).includes("piece")} />
            </li>
          ))}
        </ul>
      )}

      {!exactMode && okPercent && preview.length > 0 && (
        <div className="mt-4 overflow-hidden rounded-2xl border border-line">
          <p className="bg-card-2 px-3 py-2 text-xs font-semibold text-muted">{tr(`المعاينة (${name(lookups.tiers.find((t) => t.id === tier))})`, `Preview (${name(lookups.tiers.find((t) => t.id === tier))})`)}</p>
          <ul className="divide-y divide-line text-sm">
            {preview.map((i) => {
              const u = soldUnits(i).includes("carton") ? "carton" : "piece";
              const before = i.prices.find((p) => p.tier_id === tier) ?? i.prices[0];
              const next = after(i, percent).find((p) => p.tier_id === before.tier_id)!;
              return (
                <li key={i.id} className="flex items-center justify-between gap-2 px-3 py-2">
                  <span className="truncate">{name(i)}</span>
                  <span className="num shrink-0">
                    <span className="me-2 text-faint line-through">{money(u === "carton" ? before.carton_price : before.piece_price)}</span>
                    <b className={percent > 0 ? "text-danger" : "text-success"}>{money(u === "carton" ? next.carton_price : next.piece_price)}</b>
                  </span>
                </li>
              );
            })}
          </ul>
          {picked.size > preview.length && <p className="px-3 py-1.5 text-xs text-muted">{tr(`و${itemsAr(picked.size - preview.length)} أخرى`, `and ${num(picked.size - preview.length)} more`)}</p>}
        </div>
      )}
      <p className="mt-3 text-xs text-muted">
        {tr(
          "أصحاب المحلات الذين اشتروا هذه المواد في آخر 60 يوماً يصلهم إشعار: عند الرفع الآن («اطلب قبله»)، وعند التخفيض يوم يبدأ. الطلبيات المكتوبة قبل ذلك اليوم تبقى بسعرها.",
          "Shop owners who bought these items in the last 60 days are told: a rise now (“order before it”), a fall on the day. Orders written before that day keep their prices.",
        )}
      </p>
    </Dialog>
  );
}

const statusText = (s: ScheduledPrice["status"], tr: (a: string, e: string) => string) => ({ scheduled: tr("مجدول", "Scheduled"), applied: tr("طُبّق", "Applied"), cancelled: tr("أُلغي", "Cancelled") })[s];

export function ScheduledPrices() {
  const { tr, num, date } = useFmt();
  const toast = useToast();
  const { user } = useApp();
  const r = useLoad(() => api.listScheduledPrices(), []);
  const [busy, setBusy] = useState<number | null>(null);
  const list = (r.data ?? []).filter((s) => s.status === "scheduled" || (s.applied_at && s.applied_at.slice(0, 10) >= today(-7)));
  if (!list.length) return null;
  const cancel = async (id: number) => {
    setBusy(id);
    try {
      await api.cancelScheduledPrice(id);
      toast("success", tr("أُلغي التغيير", "Change cancelled"));
    } catch (e) {
      toast("danger", errorText(e, tr));
    } finally {
      setBusy(null);
    }
  };
  return (
    <Card className="mb-4">
      <CardHeader title={tr("تغييرات الأسعار", "Price changes")} subtitle={tr("المجدولة، وما طُبّق في آخر أسبوع", "Scheduled, and the ones applied this week")} />
      <ul className="divide-y divide-line">
        {list.map((s) => {
          const up = s.percent ? s.percent > 0 : s.items[0]?.direction === "up";
          return (
            <li key={s.id} className="flex items-center gap-3 px-4 py-3">
              <span className={cn("flex size-9 shrink-0 items-center justify-center rounded-full", up ? "bg-danger-soft text-danger" : "bg-success-soft text-success")}>
                {up ? <TrendingUp className="size-4" /> : <TrendingDown className="size-4" />}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate font-semibold">
                  {s.items.length === 1 ? s.items[0].name : tr(itemsAr(s.items.length), `${num(s.items.length)} items`)}
                  {s.percent !== undefined && <span className="num ms-1.5">{s.percent > 0 ? "+" : ""}{num(s.percent)}%</span>}
                </span>
                <span className="block truncate text-xs text-muted">
                  {statusText(s.status, tr)} · {tr(`يوم ${date(s.start)}`, `on ${date(s.start)}`)}
                  {s.told > 0 && <> · {tr(`أُعلم ${num(s.told)} من أصحاب المحلات`, `${num(s.told)} shop owners told`)}</>}
                  {s.note && <> · «{s.note}»</>}
                </span>
              </span>
              {s.status === "scheduled" && user.role === "manager" && (
                <Button size="sm" variant="ghost" loading={busy === s.id} onClick={() => cancel(s.id)}>
                  {tr("ألغِه", "Cancel")}
                </Button>
              )}
            </li>
          );
        })}
      </ul>
    </Card>
  );
}

export function PriceHistoryCard({ itemId }: { itemId: number }) {
  const { tr, name, money, date } = useFmt();
  const { lookups, itemById } = useApp();
  const r = useLoad(() => api.priceHistory(itemId), [itemId]);
  const it = itemById.get(itemId);
  if (!r.data || !it) return null;
  const { rows, scheduled } = r.data;
  const u = soldUnits(it).includes("carton") ? "carton" : "piece";
  const tierName = (id: number) => name(lookups.tiers.find((t) => t.id === id));
  const price = (p: { carton_price: number; piece_price: number }) => money(u === "carton" ? p.carton_price : p.piece_price);
  return (
    <Card className="mb-4">
      <CardHeader
        title={
          <span className="flex items-center gap-2">
            <History className="size-4 text-muted" /> {tr("سجل الأسعار", "Price history")}
          </span>
        }
        subtitle={tr("كل سعر ومتى كان، والتغييرات المجدولة", "Every price and when it was, and the scheduled changes")}
      />
      <ul className="divide-y divide-line text-sm">
        {scheduled.map((s) =>
          s.next.map((p) => (
            <li key={`s${s.id}-${p.tier_id}`} className="flex items-center gap-3 bg-warning-soft/30 px-4 py-2.5">
              <CalendarClock className="size-4 shrink-0 text-warning" />
              <span className="min-w-0 flex-1 truncate">
                {tierName(p.tier_id)} · <span className="font-semibold text-warning">{tr(`من ${date(s.start)} (مجدول)`, `from ${date(s.start)} (scheduled)`)}</span>
              </span>
              <span className="num font-bold">{price(p)}</span>
            </li>
          )),
        )}
        {rows.map((x, k) => (
          <li key={k} className="flex items-center gap-3 px-4 py-2.5">
            <span className={cn("size-2 shrink-0 rounded-full", x.until ? "bg-line-strong" : "bg-success")} />
            <span className="min-w-0 flex-1 truncate">
              {tierName(x.tier_id)} ·{" "}
              <span className="text-muted">
                {x.until ? tr(`${x.from ? `من ${date(x.from)} ` : ""}حتى ${date(x.until)}`, `${x.from ? `from ${date(x.from)} ` : ""}until ${date(x.until)}`) : x.from ? tr(`الآن، منذ ${date(x.from)}`, `now, since ${date(x.from)}`) : tr("الآن", "now")}
              </span>
            </span>
            <span className={cn("num", x.until ? "text-muted" : "font-bold")}>{price(x)}</span>
          </li>
        ))}
      </ul>
    </Card>
  );
}
