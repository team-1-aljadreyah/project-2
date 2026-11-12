"use client";

// Monthly rep targets. The manager sets each marketing rep's monthly sales target (the user form); the rep
// sees his month as a bar on his home page (how much is done, what is left a day, his place among the reps),
// and the manager and accountant see the reps ranked on the dashboard. What counts: the month's invoices
// less the returns on them (the server works it out: GET /reps/targets).
import Link from "next/link";
import type { ReactNode } from "react";
import { Target, Trophy } from "lucide-react";
import { useApp } from "@/components/shell";
import { Button, Card, CardHeader, Skeleton } from "@/components/ui";
import { api } from "@/lib/api";
import type { RepTarget } from "@/lib/api/types";
import { useFmt } from "@/lib/i18n";
import { useLoad } from "@/lib/use-load";
import { cn, today } from "@/lib/utils";

/** Where the month is: the day, the month's days, and the share of it gone (the "pace" mark on the bar). */
function monthPace() {
  const [y, m, d] = today().split("-").map(Number);
  const days = new Date(y, m, 0).getDate();
  return { day: d, days, left: days - d + 1, pace: Math.round((d / days) * 100) };
}

function Bar({ pct, pace, big, label }: { pct: number; pace?: number; big?: boolean; label: string }) {
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuenow={pct}
      aria-valuemin={0}
      aria-valuemax={100}
      className={cn("relative w-full overflow-hidden rounded-full bg-line", big ? "h-3" : "h-1.5")}
    >
      <div className={cn("h-full rounded-full transition-all duration-700", pct >= 100 ? "bg-success" : "bg-action")} style={{ width: `${Math.min(100, Math.max(0, pct))}%` }} />
      {/* Where he should be by today, if the month's target is spread evenly. */}
      {pace !== undefined && pace < 100 && <span aria-hidden className="absolute inset-y-0 w-0.5 bg-text/50" style={{ insetInlineStart: `${pace}%` }} />}
    </div>
  );
}

/** The rep's own month on his home page. */
export function MyTarget() {
  const { tr, money, num } = useFmt();
  const month = today().slice(0, 7);
  const t = useLoad(() => api.repTargets(month), [month]);
  const r = t.data?.[0];
  // Its place is kept while it loads (the page below doesn't jump).
  if (!r) return t.state.status === "error" ? null : <div aria-hidden className="h-[8.75rem] rounded-3xl bg-card-2" />;
  const { left, pace } = monthPace();
  const remaining = Math.max(0, r.target - r.net);
  // A round figure to aim for each day (to the thousand).
  const perDay = Math.ceil(remaining / left / 1000) * 1000;
  const days = (n: number) => `${num(n)} ${n === 1 ? "يوم" : n === 2 ? "يومين" : n <= 10 ? "أيام" : "يوماً"}`;

  return (
    <Card className="min-h-[8.75rem] rounded-3xl p-4 sm:p-5">
      <div className="flex items-center justify-between gap-2">
        <h2 className="flex items-center gap-1.5 font-bold">
          <Target className="size-4 text-action" /> {tr("هدف هذا الشهر", "This month's target")}
        </h2>
        {r.target > 0 && r.of > 1 && (
          <span className="flex items-center gap-1 rounded-full bg-card-2 px-2.5 py-0.5 text-xs font-semibold">
            <Trophy className={cn("size-3.5", r.rank === 1 ? "text-action" : "text-faint")} />
            {tr(`ترتيبك ${num(r.rank)} من ${num(r.of)}`, `You're ${num(r.rank)} of ${num(r.of)}`)}
          </span>
        )}
      </div>
      {r.target > 0 ? (
        <>
          <p className="mt-2 flex flex-wrap items-baseline gap-x-2">
            <b className="num text-2xl">{money(r.net)}</b>
            <span className="text-sm text-muted">{tr(`من ${money(r.target)}`, `of ${money(r.target)}`)}</span>
            <b className={cn("num ms-auto text-lg", r.pct >= 100 ? "text-success" : "text-action")}>{num(r.pct)}%</b>
          </p>
          <div className="mt-2">
            <Bar big pct={r.pct} pace={pace} label={tr("نسبة إنجاز الهدف", "Target done")} />
          </div>
          <p className="mt-2 text-xs text-muted">
            {remaining > 0
              ? tr(
                  `باقٍ ${money(remaining)} خلال ${days(left)}: نحو ${money(perDay)} في اليوم. ${r.pct >= pace ? "أنت على المسار." : "أنت متأخر قليلاً عن المسار."}`,
                  `${money(remaining)} left in ${num(left)} days: about ${money(perDay)} a day. ${r.pct >= pace ? "You're on track." : "You're a little behind."}`,
                )
              : tr("أتممت هدف هذا الشهر. أحسنت!", "You've reached this month's target. Well done!")}
          </p>
        </>
      ) : (
        <p className="mt-3 text-sm text-muted">
          {tr(`مبيعاتك هذا الشهر ${money(r.net)}. لم يحدّد المدير هدفاً لك بعد.`, `Your sales this month: ${money(r.net)}. The manager hasn't set a target for you yet.`)}
        </p>
      )}
    </Card>
  );
}

/** The reps ranked on the dashboard (manager, accountant). A row opens that rep's form (the manager sets the target there). */
export function TargetRanking({ title }: { title: ReactNode }) {
  const { tr, money, num } = useFmt();
  const { user } = useApp();
  const month = today().slice(0, 7);
  const t = useLoad(() => api.repTargets(month), [month]);
  const { pace } = monthPace();
  const manager = user.role === "manager";
  const rows: RepTarget[] = t.data ?? [];

  return (
    <Card className="h-full">
      <CardHeader
        title={title}
        subtitle={tr("بالترتيب حسب نسبة الإنجاز. الخط الرفيع: أين ينبغي أن يكونوا اليوم", "Ranked by how much is done. The thin line: where they should be today")}
        action={
          manager && (
            <Button size="sm" variant="ghost" href="/users">
              {tr("الأهداف", "Targets")}
            </Button>
          )
        }
      />
      <ul className="divide-y divide-line">
        {!t.data &&
          Array.from({ length: 3 }, (_, i) => (
            <li key={i} className="px-4 py-3">
              <Skeleton className="h-10" />
            </li>
          ))}
        {rows.map((r) => (
          <li key={r.rep.id}>
            <Link href={manager ? `/users?edit=${r.rep.id}` : "/commissions"} className="flex items-center gap-3 px-4 py-3 hover:bg-card-2">
              <span
                className={cn(
                  "num flex size-8 shrink-0 items-center justify-center rounded-full text-sm font-bold",
                  r.target && r.rank === 1 ? "bg-action text-on-action" : r.target && r.rank <= 3 ? "bg-primary-soft text-text" : "bg-card-2 text-muted",
                )}
              >
                {num(r.rank)}
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex items-center justify-between gap-2">
                  <span className="truncate text-sm font-medium">{r.rep.name}</span>
                  <span className={cn("num text-sm font-bold", r.pct >= 100 ? "text-success" : "")}>{r.target ? `${num(r.pct)}%` : "—"}</span>
                </span>
                <span className="mt-1.5 block">
                  <Bar pct={r.target ? r.pct : 0} pace={r.target ? pace : undefined} label={tr(`إنجاز ${r.rep.name}`, `${r.rep.name}: done`)} />
                </span>
                <span className="mt-1 block text-xs text-muted">
                  <span className="num">{money(r.net)}</span> {r.target ? tr(`من ${money(r.target)}`, `of ${money(r.target)}`) : tr("· بلا هدف", "· no target")}
                </span>
              </span>
            </Link>
          </li>
        ))}
        {t.data && !rows.length && <li className="p-6 text-center text-sm text-muted">{tr("لا يوجد مندوبو تسويق بعد", "No marketing reps yet")}</li>}
      </ul>
    </Card>
  );
}
