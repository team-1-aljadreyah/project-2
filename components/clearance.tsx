"use client";

// «عروض التصريف» (the stock page → الصلاحية): the batches close to their expiry the site suggests to sell at a
// discount (more off as the days run out), the manager starts one in a tap (the percent is his to change), and
// the running ones with what is left and their countdown. A clearance ends by itself when its batch is sold or
// expires; the manager may stop it earlier.
import { useState } from "react";
import { Hourglass, Tag } from "lucide-react";
import { useApp } from "@/components/shell";
import { Button, Card, CardHeader, Dialog, Field, NumberInput, errorText, useToast } from "@/components/ui";
import { api } from "@/lib/api";
import type { Batch, NearExpiryRow } from "@/lib/api/types";
import { useFmt } from "@/lib/i18n";
import { clearPrice } from "@/lib/units";
import { suggestedClearance } from "@/lib/api/advanced";
import { useRules } from "@/lib/use-rules";
import { useLoad } from "@/lib/use-load";
import { cn } from "@/lib/utils";
import { useMay } from "@/lib/use-rules";

/** "يوم واحد / يومين / 5 أيام / 21 يوماً". */
const daysAr = (n: number) => (n === 1 ? "يوم واحد" : n === 2 ? "يومين" : n <= 10 ? `${n} أيام` : `${n} يوماً`);

export function ClearancePanel({ rows }: { rows: NearExpiryRow[] }) {
  const { tr, name, num, qty, date } = useFmt();
  const rules = useRules();
  const suggestClearance = (days: number) => suggestedClearance(rules.clearance, days);
  const toast = useToast();
  const { itemById, lookups } = useApp();
  const list = useLoad(() => api.listClearances(), []);
  const [start, setStart] = useState<NearExpiryRow | null>(null);
  const [busy, setBusy] = useState<number | null>(null);
  // Who starts a clearance: the manager's table (advanced settings → who may do what).
  const manager = useMay()("start_clearance");
  const running = (list.data ?? []).filter((c) => c.status === "active");
  const has = (b: Batch) => running.some((c) => c.item.id === b.item_id && c.warehouse_id === b.warehouse_id);
  // Worth clearing: not expired (a day left at least), pieces left, not held, no clearance on it yet.
  const ideas = rows.filter((r) => r.days_left >= 1 && r.batch.qty_left > 0 && !r.batch.held && !has(r.batch)).sort((a, b) => a.days_left - b.days_left);
  const whName = (id: number) => name(lookups.warehouses.find((w) => w.id === id));
  if (!list.data || (!ideas.length && !running.length)) return null;

  const stop = async (id: number) => {
    setBusy(id);
    try {
      await api.cancelClearance(id);
      toast("success", tr("أُوقف عرض التصريف", "Clearance stopped"));
    } catch (e) {
      toast("danger", errorText(e, tr));
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="mb-4 grid gap-4 lg:grid-cols-2">
      {ideas.length > 0 && (
        <Card>
          <CardHeader title={tr("اقتراحات التصريف", "Clearance ideas")} subtitle={tr("دفعات قاربت صلاحيتها على الانتهاء: بِعها بخصم قبل أن تتلف", "Batches close to their expiry: sell them at a discount before they spoil")} />
          <ul className="divide-y divide-line">
            {ideas.slice(0, 8).map((r) => {
              const it = itemById.get(r.batch.item_id);
              return (
                <li key={r.batch.id} className="flex items-center gap-3 px-4 py-3">
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-semibold">{name(it)}</span>
                    <span className="block truncate text-xs text-muted">
                      {qty(r.batch.qty_left, it?.pieces_per_carton ?? 1, it)} · {whName(r.batch.warehouse_id)} · <span className={cn(r.days_left <= 7 && "font-semibold text-danger")}>{tr(`تنتهي خلال ${daysAr(r.days_left)}`, `Expires in ${num(r.days_left)} days`)}</span>
                    </span>
                  </span>
                  {manager && (
                    <Button size="sm" variant="action" onClick={() => setStart(r)}>
                      <Tag className="size-4" /> {tr(`خصم ${num(suggestClearance(r.days_left))}%`, `${num(suggestClearance(r.days_left))}% off`)}
                    </Button>
                  )}
                </li>
              );
            })}
          </ul>
        </Card>
      )}
      {running.length > 0 && (
        <Card>
          <CardHeader title={tr("عروض التصريف الجارية", "Running clearances")} subtitle={tr("تنتهي وحدها حين تُباع الدفعة أو تنتهي صلاحيتها", "They end by themselves when the batch is sold or expires")} />
          <ul className="divide-y divide-line">
            {running.map((c) => {
              const it = itemById.get(c.item.id);
              const sold = c.qty ? Math.round(((c.qty - c.left) / c.qty) * 100) : 0;
              return (
                <li key={c.id} className="px-4 py-3">
                  <div className="flex items-center gap-3">
                    <span className="num shrink-0 rounded-full bg-danger px-2 py-0.5 text-xs font-bold text-white">−{c.percent}%</span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-semibold">{name(it) || c.item.name}</span>
                      <span className="flex items-center gap-1 truncate text-xs text-muted">
                        <Hourglass className="size-3" /> {tr(`حتى ${date(c.until)}`, `until ${date(c.until)}`)} · {whName(c.warehouse_id)}
                      </span>
                    </span>
                    {manager && (
                      <Button size="sm" variant="ghost" loading={busy === c.id} onClick={() => stop(c.id)}>
                        {tr("أوقفه", "Stop")}
                      </Button>
                    )}
                  </div>
                  <span className="mt-2 block h-1.5 overflow-hidden rounded-full bg-line">
                    <span className="block h-full rounded-full bg-success" style={{ width: `${sold}%` }} />
                  </span>
                  <p className="mt-1 text-[11px] text-muted">{tr(`بِيع ${num(sold)}% · باقي ${qty(c.left, it?.pieces_per_carton ?? 1, it)}`, `${num(sold)}% sold · ${qty(c.left, it?.pieces_per_carton ?? 1, it)} left`)}</p>
                </li>
              );
            })}
          </ul>
        </Card>
      )}
      {start && <StartDialog row={start} onClose={() => setStart(null)} />}
    </div>
  );
}

function StartDialog({ row, onClose }: { row: NearExpiryRow; onClose: () => void }) {
  const { tr, name, money, num, date, qty, unit } = useFmt();
  const rules = useRules();
  const suggestClearance = (days: number) => suggestedClearance(rules.clearance, days);
  const toast = useToast();
  const { itemById, lookups } = useApp();
  const it = itemById.get(row.batch.item_id);
  const [percent, setPercent] = useState<number | "">(suggestClearance(row.days_left));
  const [busy, setBusy] = useState(false);
  const p = typeof percent === "number" ? percent : 0;
  const ok = p >= 5 && p <= 70;
  const last = new Date(`${row.batch.expiry_date}T12:00:00`);
  last.setDate(last.getDate() - 1);
  return (
    <Dialog
      open
      onClose={onClose}
      title={tr(`تصريف ${name(it)}`, `Clear ${name(it)}`)}
      footer={
        <Button
          variant="action"
          className="w-full"
          disabled={!ok}
          loading={busy}
          onClick={async () => {
            setBusy(true);
            try {
              await api.startClearance({ batch_id: row.batch.id, percent: p });
              toast("success", tr("بدأ عرض التصريف ووصل إشعاره لأصحاب المحلات", "The clearance is on; the shop owners were told"));
              onClose();
            } catch (e) {
              toast("danger", errorText(e, tr));
            } finally {
              setBusy(false);
            }
          }}
        >
          <Tag className="size-4" /> {tr(`ابدأ العرض بخصم ${num(p)}%`, `Start at ${num(p)}% off`)}
        </Button>
      }
    >
      <p className="text-sm text-muted">
        {tr(
          `${qty(row.batch.qty_left, it?.pieces_per_carton ?? 1, it)} تنتهي صلاحيتها ${date(row.batch.expiry_date)}. يُباع بالخصم حتى ${date(last.toISOString())}، ثم ينتهي العرض وحده.`,
          `${qty(row.batch.qty_left, it?.pieces_per_carton ?? 1, it)} expire on ${date(row.batch.expiry_date)}. Sold at the discount until ${date(last.toISOString())}, then it ends by itself.`,
        )}
      </p>
      <p className="mb-2 mt-4 text-sm font-semibold">{tr("نسبة الخصم", "Discount")}</p>
      <div className="flex flex-wrap items-center gap-2">
        {[10, 20, 30, 40].map((x) => (
          <button
            key={x}
            type="button"
            onClick={() => setPercent(x)}
            className={cn("h-9 rounded-full border px-3 text-sm font-semibold", percent === x ? "border-action bg-action text-on-action" : "border-line-strong hover:bg-card-2")}
          >
            {num(x)}%{x === suggestClearance(row.days_left) && <span className="ms-1 text-[10px] opacity-80">{tr("(المقترح)", "(suggested)")}</span>}
          </button>
        ))}
        <Field className="w-28" error={percent !== "" && !ok ? tr("من 5 إلى 70", "5 to 70") : undefined}>
          <NumberInput value={percent} onChange={setPercent} suffix="%" aria-label={tr("نسبة أخرى", "Another percent")} />
        </Field>
      </div>
      {it && ok && (
        <div className="mt-4 overflow-hidden rounded-2xl border border-line">
          <p className="bg-card-2 px-3 py-2 text-xs font-semibold text-muted">{tr("السعر بعد الخصم", "The price after the discount")}</p>
          <ul className="divide-y divide-line text-sm">
            {it.prices.map((pr) => {
              const tier = lookups.tiers.find((t) => t.id === pr.tier_id);
              const u = it.pieces_per_carton > 1 ? "carton" : "piece";
              const base = u === "carton" ? pr.carton_price : pr.piece_price;
              return (
                <li key={pr.tier_id} className="flex items-center justify-between gap-2 px-3 py-2">
                  <span className="truncate text-muted">
                    {name(tier)} · {unit(it, u)}
                  </span>
                  <span className="num shrink-0">
                    <span className="me-2 text-faint line-through">{money(base)}</span>
                    <b className="text-danger">{money(clearPrice(base, p))}</b>
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </Dialog>
  );
}
