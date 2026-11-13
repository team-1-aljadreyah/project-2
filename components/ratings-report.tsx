"use client";

// Reports → «تقييم التوصيل» (manager, accountant): what the shops say about their deliveries — the average and the
// spread of stars, each delivery rep's average (the low ones counted), and the latest ratings with their notes.
import Link from "next/link";
import { Star } from "lucide-react";
import { Stars } from "@/components/rate-delivery";
import { Card, CardHeader, Empty, ErrorBox, LoadingRows } from "@/components/ui";
import { api } from "@/lib/api";
import { useFmt } from "@/lib/i18n";
import { useLoad } from "@/lib/use-load";
import { cn } from "@/lib/utils";

/** "تقييم واحد / تقييمان / 5 تقييمات / 12 تقييماً". */
const ratingsWord = (n: number, tr: (a: string, e: string) => string) =>
  n === 1 ? tr("تقييم واحد", "1 rating") : n === 2 ? tr("تقييمان", "2 ratings") : tr(`${n} ${n <= 10 ? "تقييمات" : "تقييماً"}`, `${n} ratings`);

export function RatingsReport() {
  const { tr, num, ago } = useFmt();
  const r = useLoad(() => api.ratingsReport(), []);
  if (r.state.status === "error") return <ErrorBox error={r.state.error} onRetry={r.reload} />;
  if (!r.data) return <LoadingRows />;
  const d = r.data;
  if (!d.count) return <Empty icon={<Star className="size-6" />} title={tr("لا تقييمات بعد", "No ratings yet")} body={tr("يقيّم صاحب المحل التوصيل بعد استلام طلبه.", "Shop owners rate a delivery after it arrives.")} />;
  const most = Math.max(...d.spread, 1);
  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
      <div className="space-y-4">
        <Card className="p-5">
          <p className="text-sm text-muted">{tr("متوسط التقييم", "Average rating")}</p>
          <p className="mt-1 flex items-center gap-3">
            <span className="num text-4xl font-bold">{d.average.toFixed(1)}</span>
            <Stars value={Math.round(d.average)} />
          </p>
          <p className="mt-1 text-xs text-muted">{tr(`من ${ratingsWord(d.count, tr)}`, `from ${num(d.count)} ratings`)}</p>
          <div className="mt-4 space-y-1.5">
            {[5, 4, 3, 2, 1].map((s) => (
              <div key={s} className="flex items-center gap-2 text-xs">
                <span className="num w-3">{s}</span>
                <Star className="size-3.5 fill-[#f5b301] text-[#f5b301]" />
                <span className="h-2 flex-1 overflow-hidden rounded-full bg-line">
                  <span className={cn("block h-full rounded-full", s <= 2 ? "bg-danger" : "bg-[#f5b301]")} style={{ width: `${(d.spread[s - 1] / most) * 100}%` }} />
                </span>
                <span className="num w-6 text-end text-muted">{d.spread[s - 1]}</span>
              </div>
            ))}
          </div>
        </Card>
        <Card>
          <CardHeader title={tr("حسب مندوب التوصيل", "By delivery rep")} />
          <ul className="divide-y divide-line">
            {d.reps.map((x) => (
              <li key={x.rep.id} className="flex items-center gap-3 px-4 py-3">
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-semibold">{x.rep.name}</span>
                  <span className="text-xs text-muted">
                    {ratingsWord(x.count, tr)}
                    {x.low > 0 && <span className="text-danger"> · {tr(`منخفضة: ${num(x.low)}`, `${num(x.low)} low`)}</span>}
                  </span>
                </span>
                <span className="num text-lg font-bold">{x.average.toFixed(1)}</span>
                <Star className="size-4 fill-[#f5b301] text-[#f5b301]" />
              </li>
            ))}
          </ul>
        </Card>
      </div>
      <Card>
        <CardHeader title={tr("آخر التقييمات", "Latest ratings")} subtitle={tr("المنخفضة باللون الأحمر", "The low ones in red")} />
        <ul className="divide-y divide-line">
          {d.latest.map((x) => (
            <li key={x.order_id} className={cn("box-row px-4 py-3 hover:bg-card-2", x.rating.stars <= 2 && "bg-danger-soft/40")}>
              <div className="flex items-center justify-between gap-2">
                <Link href={`/orders/${x.order_id}`} className="box-link-main min-w-0 truncate font-semibold">
                  {x.customer}
                </Link>
                <Stars value={x.rating.stars} size="sm" />
              </div>
              <p className="text-xs text-muted">
                <span className="num" dir="ltr">
                  {x.number}
                </span>
                {x.rating.rep && <> · {x.rating.rep.name}</>} · {ago(x.rating.at)}
              </p>
              {x.rating.note && <p className="mt-1 text-sm">«{x.rating.note}»</p>}
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
