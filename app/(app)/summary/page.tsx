"use client";

// «ملخص اليوم» (manager, accountant): one page for the end of the day — sales, cash collected, the shops' new
// debt, orders, returns (and the profit for who sees it), each against yesterday and the same day last week;
// the best rep, the deliveries late now, the items under their minimum. Sent on WhatsApp in a tap, or printed.
// Its notification comes at the hour the manager set in the settings (9 in the evening unless changed).
import Link from "next/link";
import { useState } from "react";
import { AlertTriangle, Award, Printer, Truck } from "lucide-react";
import { openWhatsApp } from "@/components/share";
import { useApp } from "@/components/shell";
import { Button, Card, CardHeader, ErrorBox, Input, LoadingRows, Money, PageHeader } from "@/components/ui";
import { api } from "@/lib/api";
import type { DayNumbers } from "@/lib/api/types";
import { useFmt } from "@/lib/i18n";
import { useSite } from "@/lib/site";
import { useLoad } from "@/lib/use-load";
import { cn, today } from "@/lib/utils";

const DAY_AR = ["الأحد", "الاثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت"];
const DAY_EN = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

/** −12% / +30% against a day before (none when that day had nothing). */
const change = (now: number, before: number) => (before ? Math.round(((now - before) / Math.abs(before)) * 100) : null);

export default function SummaryPage() {
  const { tr, money, num, date: fmtDate, ago, lang, qty } = useFmt();
  const site = useSite();
  const { itemById } = useApp();
  const [date, setDate] = useState(today());
  const r = useLoad(() => api.daySummary(date), [date]);
  const d = r.data;
  const wd = new Date(`${date}T12:00:00`).getDay();
  const dayName = tr(DAY_AR[wd], DAY_EN[wd]);
  const soFar = date === today() && d && new Date().getHours() < d.hour;

  // [key, label, lower is better]
  const rows: [keyof DayNumbers, string, boolean, boolean][] = [
    ["sales", tr("المبيعات", "Sales"), false, true],
    ["collected", tr("المقبوض", "Collected"), false, true],
    ["new_debt", tr("الديون الجديدة", "New debt"), true, true],
    ["orders", tr("الطلبات", "Orders"), false, false],
    ["invoices", tr("الفواتير", "Invoices"), false, false],
    ["returns", tr("المرتجعات", "Returns"), true, true],
    ...(d?.day.profit !== undefined ? ([["profit", tr("الربح", "Profit"), false, true]] as [keyof DayNumbers, string, boolean, boolean][]) : []),
  ];
  const show = (v: number | undefined, isMoney: boolean) => (isMoney ? money(v ?? 0) : num(v ?? 0));

  const whatsapp = () => {
    if (!d) return;
    const lines = [
      tr(`ملخص يوم ${dayName} ${fmtDate(date)} — ${site.brand.name}`, `${dayName} ${fmtDate(date)} summary — ${site.brand.name_en || site.brand.name}`),
      ...rows.map(([k, label, , isMoney]) => `${label}: ${show(d.day[k], isMoney)} (${tr("أمس", "yesterday")} ${show(d.yesterday[k], isMoney)})`),
      ...(d.best_rep ? [tr(`أفضل مندوب: ${d.best_rep.name} (${money(d.best_rep.sales)})`, `Best rep: ${d.best_rep.name} (${money(d.best_rep.sales)})`)] : []),
      tr(`توصيلات متأخرة: ${d.late.length}`, `Late deliveries: ${d.late.length}`),
      tr(`مواد تحت الحد الأدنى: ${d.low.length}`, `Items below minimum: ${d.low.length}`),
    ];
    openWhatsApp(lines.join("\n"));
  };

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader
        title={tr("ملخص اليوم", "Day summary")}
        subtitle={`${dayName} ${fmtDate(date)}${soFar ? tr(" · حتى الآن", " · so far") : ""}`}
        actions={
          <>
            <Input type="date" value={date} max={today()} onChange={(e) => e.target.value && setDate(e.target.value)} className="w-44" aria-label={tr("اليوم", "Day")} />
            <Button onClick={whatsapp} disabled={!d}>
              {tr("أرسل عبر واتساب", "Send on WhatsApp")}
            </Button>
            <Button variant="ghost" onClick={() => window.print()} aria-label={tr("اطبع", "Print")}>
              <Printer className="size-4" />
            </Button>
          </>
        }
      />
      {r.state.status === "error" ? (
        <ErrorBox error={r.state.error} onRetry={r.reload} />
      ) : !d ? (
        <LoadingRows rows={5} />
      ) : (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {rows.map(([k, label, lowerBetter, isMoney]) => {
              const v = d.day[k] ?? 0;
              const vs = [
                { t: tr("أمس", "Yesterday"), b: d.yesterday[k] ?? 0 },
                { t: tr(`${DAY_AR[wd]} الماضي`, `Last ${DAY_EN[wd]}`), b: d.last_week[k] ?? 0 },
              ];
              return (
                <Card key={k} className="p-4">
                  <p className="text-sm text-muted">{label}</p>
                  <p className={cn("num mt-1 text-xl font-bold sm:text-2xl", k === "new_debt" && v < 0 && "text-success")}>{show(v, isMoney)}</p>
                  <div className="mt-2 space-y-0.5">
                    {vs.map((x) => {
                      const c = change(v, x.b);
                      const good = c !== null && (lowerBetter ? c < 0 : c > 0);
                      return (
                        <p key={x.t} className="flex items-center justify-between gap-2 text-[11px] text-muted">
                          <span className="truncate">
                            {x.t}: <span className="num">{show(x.b, isMoney)}</span>
                          </span>
                          {c !== null && c !== 0 && (
                            <span className={cn("num shrink-0 font-bold", good ? "text-success" : "text-danger")} dir="ltr">
                              {c > 0 ? "▲" : "▼"} {Math.abs(c)}%
                            </span>
                          )}
                        </p>
                      );
                    })}
                  </div>
                </Card>
              );
            })}
          </div>

          <div className="grid gap-4 lg:grid-cols-3">
            <Card className="p-4">
              <p className="flex items-center gap-1.5 text-sm text-muted">
                <Award className="size-4 text-[#f5b301]" /> {tr("أفضل مندوب", "Best rep")}
              </p>
              {d.best_rep ? (
                <>
                  <p className="mt-1 text-lg font-bold">{d.best_rep.name}</p>
                  <p className="num text-sm text-muted">{tr(`صافي مبيعاته ${money(d.best_rep.sales)}`, `Net sales ${money(d.best_rep.sales)}`)}</p>
                </>
              ) : (
                <p className="mt-1 text-sm text-muted">{tr("لا مبيعات للمندوبين هذا اليوم", "No rep sales that day")}</p>
              )}
              {d.counter_sales > 0 && (
                <p className="mt-3 border-t border-line pt-2 text-sm">
                  {tr("البيع المباشر", "Counter sales")}: <Money value={d.counter_sales} />
                </p>
              )}
            </Card>
            <Card>
              <CardHeader
                title={
                  <span className="flex items-center gap-1.5">
                    <Truck className="size-4 text-warning" /> {tr(`توصيلات متأخرة (${num(d.late.length)})`, `Late deliveries (${num(d.late.length)})`)}
                  </span>
                }
                subtitle={tr("الآن: لم تُسلَّم بعد مرور يوم على طلبها", "Now: not delivered a day after the order")}
              />
              {!d.late.length ? (
                <p className="p-4 text-sm text-muted">{tr("لا شيء متأخر", "Nothing late")}</p>
              ) : (
                <ul className="divide-y divide-line">
                  {d.late.map((o) => (
                    <li key={o.order_id}>
                      <Link href={`/orders/${o.order_id}`} className="flex items-center justify-between gap-2 px-4 py-2 text-sm hover:bg-card-2">
                        <span className="min-w-0 truncate">
                          <span className="num" dir="ltr">
                            {o.number}
                          </span>{" "}
                          · {o.customer}
                        </span>
                        <span className="shrink-0 text-xs text-warning">{ago(o.since)}</span>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
            <Card>
              <CardHeader
                title={
                  <span className="flex items-center gap-1.5">
                    <AlertTriangle className="size-4 text-danger" /> {tr(`تحت الحد الأدنى (${num(d.low.length)})`, `Below minimum (${num(d.low.length)})`)}
                  </span>
                }
                subtitle={tr("الآن، في كل المخازن", "Now, in all warehouses")}
              />
              {!d.low.length ? (
                <p className="p-4 text-sm text-muted">{tr("المخزون كافٍ", "Stock is fine")}</p>
              ) : (
                <ul className="divide-y divide-line">
                  {d.low.map((x) => (
                    <li key={x.item_id}>
                      <Link href={`/items/${x.item_id}`} className="flex items-center justify-between gap-2 px-4 py-2 text-sm hover:bg-card-2">
                        <span className="min-w-0 truncate">{lang === "en" ? x.name_en : x.name}</span>
                        <span className="shrink-0 text-xs text-danger">
                          {qty(x.qty, itemById.get(x.item_id)?.pieces_per_carton ?? 1, itemById.get(x.item_id))}
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
              {d.low.length > 0 && (
                <div className="border-t border-line p-3">
                  <Button size="sm" href="/supply?low=1" className="w-full">
                    {tr("اطلب الناقص", "Order what's low")}
                  </Button>
                </div>
              )}
            </Card>
          </div>
          <p className="text-xs text-faint">
            {tr(`يصل إشعار الملخص للمدير والمحاسب كل يوم الساعة ${num(d.hour)}:00 (تُغيَّر من الإعدادات).`, `The summary's notification reaches the manager and the accountant daily at ${num(d.hour)}:00 (change it in the settings).`)}
          </p>
        </div>
      )}
    </div>
  );
}
