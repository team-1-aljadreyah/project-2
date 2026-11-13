"use client";

// «خط السير»: the marketing reps' weekly visits.
// - VisitSheet: the rep at a shop records his visit — where his phone is (how far from the shop's pin) and
//   what came out of it: an order, a payment, no order (and why) or the shop closed.
// - VisitPlan: the manager picks the days each shop is visited by its rep (Saturday to Friday).
// - VisitsReport: planned against done per rep, the visits missed, the ones far from the shop, why shops didn't order.
import Link from "next/link";
import { useEffect, useState } from "react";
import { AlertTriangle, CalendarDays, Check, DoorClosed, MapPin, MapPinOff, Route, ShoppingCart, Wallet, XCircle } from "lucide-react";
import { shopPlace } from "@/components/delivery/live-map";
import { useApp } from "@/components/shell";
import { Button, Card, CardHeader, Dialog, Empty, ErrorBox, Input, LoadingRows, Segmented, Stat, errorText, useToast } from "@/components/ui";
import { api } from "@/lib/api";
import { VISIT_NEAR_M, type Customer, type NoOrderReason, type VisitOutcome, type WeekDay } from "@/lib/api/types";
import { metres } from "@/lib/geo";
import { useFmt } from "@/lib/i18n";
import { useLoad } from "@/lib/use-load";
import { useAppRouter } from "@/lib/app-path";
import { cn, downloadCsv, today } from "@/lib/utils";

type Tr = (ar: string, en: string) => string;

/** The working week in Iraq: Saturday first, Friday last. */
export const WEEK: WeekDay[] = [6, 0, 1, 2, 3, 4, 5];
const DAY_AR = ["الأحد", "الاثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت"];
const DAY_EN = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
export const dayName = (d: number, tr: Tr) => tr(DAY_AR[d], DAY_EN[d]);
/** The weekday of a yyyy-mm-dd day. */
export const weekDayOf = (day: string) => new Date(`${day}T12:00:00`).getDay() as WeekDay;

export const outcomeText = (o: VisitOutcome, tr: Tr) =>
  ({ order: tr("طلبية", "Order"), payment: tr("تسديد", "Payment"), no_order: tr("لا طلبية", "No order"), closed: tr("المحل مغلق", "Shop closed") })[o];
export const reasonText = (r: NoOrderReason, tr: Tr) =>
  ({ stocked: tr("عنده بضاعة تكفي", "Still has stock"), no_money: tr("لا يملك نقوداً الآن", "No money now"), price: tr("السعر", "The price"), other: tr("سبب آخر", "Another reason") })[r];
const outcomeTone: Record<VisitOutcome, string> = {
  order: "bg-success-soft text-success",
  payment: "bg-primary-soft text-primary-ink",
  no_order: "bg-warning-soft text-warning",
  closed: "bg-card-2 text-muted",
};
export function OutcomeBadge({ outcome }: { outcome: VisitOutcome }) {
  const { tr } = useFmt();
  return <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-semibold", outcomeTone[outcome])}>{outcomeText(outcome, tr)}</span>;
}

// ---------- The rep records a visit ----------

type Place = "wait" | "none" | { lat: number; lng: number };

export function VisitSheet({ customer, onClose }: { customer: Customer; onClose: () => void }) {
  const { tr, num } = useFmt();
  const toast = useToast();
  // Inside the reps' app (/driver/…) the order and payment pages open in the app.
  const router = useAppRouter();
  // Where the phone is (asked once when the sheet opens; the rep may refuse — the visit is still recorded).
  const [place, setPlace] = useState<Place>(() => (typeof navigator !== "undefined" && "geolocation" in navigator ? "wait" : "none"));
  const [outcome, setOutcome] = useState<VisitOutcome | null>(null);
  const [reason, setReason] = useState<NoOrderReason>("stocked");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!("geolocation" in navigator)) return;
    navigator.geolocation.getCurrentPosition(
      (p) => setPlace({ lat: p.coords.latitude, lng: p.coords.longitude }),
      () => setPlace("none"),
      { enableHighAccuracy: true, timeout: 10_000, maximumAge: 60_000 },
    );
  }, []);
  const pin = shopPlace(customer);
  const away = typeof place === "object" && pin ? metres(place, pin) : null;
  const far = away !== null && away > VISIT_NEAR_M;
  const distanceText = (m: number) => (m >= 1000 ? tr(`${num(Math.round(m / 100) / 10)} كم`, `${num(Math.round(m / 100) / 10)} km`) : tr(`${num(m)} م`, `${num(m)} m`));

  const save = async () => {
    if (!outcome) return;
    setBusy(true);
    try {
      await api.recordVisit({
        customer_id: customer.id,
        outcome,
        ...(outcome === "no_order" ? { reason } : {}),
        ...(note.trim() ? { note: note.trim() } : {}),
        ...(typeof place === "object" ? { lat: place.lat, lng: place.lng } : {}),
      });
      toast("success", tr(`سُجّلت زيارة ${customer.name}`, `Visit to ${customer.name} recorded`));
      onClose();
      if (outcome === "order") router.push(`/orders/new?customer=${customer.id}`);
      if (outcome === "payment") router.push(`/payments/new?customer=${customer.id}`);
    } catch (e) {
      toast("danger", errorText(e, tr));
    } finally {
      setBusy(false);
    }
  };

  const choices: { value: VisitOutcome; icon: React.ReactNode; label: string }[] = [
    { value: "order", icon: <ShoppingCart className="size-5" />, label: tr("أخذت طلبية", "Took an order") },
    { value: "payment", icon: <Wallet className="size-5" />, label: tr("استلمت تسديداً", "Took a payment") },
    { value: "no_order", icon: <XCircle className="size-5" />, label: tr("لا طلبية", "No order") },
    { value: "closed", icon: <DoorClosed className="size-5" />, label: tr("المحل مغلق", "Shop closed") },
  ];
  return (
    <Dialog
      open
      onClose={onClose}
      title={tr(`زيارة ${customer.name}`, `Visit to ${customer.name}`)}
      footer={
        <Button variant="action" className="h-12 w-full" disabled={!outcome} loading={busy} onClick={save}>
          <Check className="size-4" />
          {outcome === "order" ? tr("سجّل وافتح الطلب", "Record and open the order") : outcome === "payment" ? tr("سجّل وافتح التسديد", "Record and open the payment") : tr("سجّل الزيارة", "Record the visit")}
        </Button>
      }
    >
      {/* Where the phone is */}
      <div
        className={cn(
          "flex items-center gap-2 rounded-2xl p-3 text-sm",
          place === "wait" ? "bg-card-2 text-muted" : far ? "bg-warning-soft text-warning" : typeof place === "object" ? "bg-success-soft text-success" : "bg-card-2 text-muted",
        )}
      >
        {place === "none" ? <MapPinOff className="size-5 shrink-0" /> : far ? <AlertTriangle className="size-5 shrink-0" /> : <MapPin className="size-5 shrink-0" />}
        <span>
          {place === "wait"
            ? tr("نحدد موقعك…", "Finding where you are…")
            : place === "none"
              ? tr("لم نحصل على موقعك؛ تُسجَّل الزيارة بدونه.", "No location from your phone; the visit is recorded without it.")
              : away === null
                ? tr("أخذنا موقعك (المحل بلا موقع على الخريطة).", "Got your location (the shop has no pin on the map).")
                : far
                  ? tr(`أنت على بعد ${distanceText(away)} من المحل؛ تُسجَّل الزيارة مع علامة «بعيد عن المحل».`, `You are ${distanceText(away)} from the shop; the visit is marked “far from the shop”.`)
                  : tr(`أنت عند المحل (${distanceText(away)}).`, `You are at the shop (${distanceText(away)}).`)}
        </span>
      </div>

      <p className="mb-2 mt-4 text-sm font-semibold">{tr("ماذا حصل؟", "What happened?")}</p>
      <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label={tr("نتيجة الزيارة", "Visit outcome")}>
        {choices.map((c) => (
          <button
            key={c.value}
            type="button"
            role="radio"
            aria-checked={outcome === c.value}
            onClick={() => setOutcome(c.value)}
            className={cn(
              "flex h-16 items-center gap-2 rounded-2xl border px-3 text-start text-sm font-semibold transition active:scale-[0.98]",
              outcome === c.value ? "border-action bg-action/10 text-action" : "border-line-strong hover:bg-card-2",
            )}
          >
            {c.icon}
            {c.label}
          </button>
        ))}
      </div>

      {outcome === "no_order" && (
        <div className="mt-3 flex flex-wrap gap-2" role="radiogroup" aria-label={tr("السبب", "Reason")}>
          {(["stocked", "no_money", "price", "other"] as NoOrderReason[]).map((r) => (
            <button
              key={r}
              type="button"
              role="radio"
              aria-checked={reason === r}
              onClick={() => setReason(r)}
              className={cn("h-9 rounded-full border px-3 text-xs font-semibold", reason === r ? "border-action bg-action text-on-action" : "border-line-strong hover:bg-card-2")}
            >
              {reasonText(r, tr)}
            </button>
          ))}
        </div>
      )}
      {outcome && outcome !== "order" && outcome !== "payment" && (
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          rows={2}
          maxLength={200}
          placeholder={tr("ملاحظة (اختياري)", "A note (optional)")}
          aria-label={tr("ملاحظة", "Note")}
          className="mt-3 w-full resize-none rounded-xl border border-line-strong bg-card px-3 py-2 text-sm outline-none focus:border-action"
        />
      )}
    </Dialog>
  );
}

// ---------- The manager's weekly plan ----------

export function VisitPlan() {
  const { tr, num } = useFmt();
  const toast = useToast();
  const { lookups } = useApp();
  const reps = lookups.reps.filter((r) => !r.kinds?.length || r.kinds.includes("sales"));
  const [repId, setRepId] = useState(String(reps[0]?.id ?? ""));
  const customers = useLoad(() => api.listCustomers(), []);
  // Changes made here, shown at once (the server's answer replaces them).
  const [mine, setMine] = useState<Record<number, WeekDay[]>>({});
  if (customers.state.status === "error") return <ErrorBox error={customers.state.error} onRetry={customers.reload} />;
  if (!reps.length) return <Empty icon={<Route className="size-6" />} title={tr("لا يوجد مندوب تسويق", "No marketing rep")} />;
  const shops = (customers.data ?? []).filter((c) => String(c.rep_id) === repId && c.active && !c.pending && !c.walk_in).sort((a, b) => a.area.localeCompare(b.area) || a.name.localeCompare(b.name));
  const daysOf = (c: Customer) => mine[c.id] ?? c.visit_days ?? [];
  const perDay = (d: WeekDay) => shops.filter((c) => daysOf(c).includes(d)).length;
  const none = shops.filter((c) => !daysOf(c).length).length;

  const toggle = async (c: Customer, d: WeekDay) => {
    const before = daysOf(c);
    const next = (before.includes(d) ? before.filter((x) => x !== d) : [...before, d]).sort() as WeekDay[];
    setMine((m) => ({ ...m, [c.id]: next }));
    try {
      await api.setVisitDays(c.id, next);
    } catch (e) {
      setMine((m) => ({ ...m, [c.id]: before }));
      toast("danger", errorText(e, tr));
    }
  };

  return (
    <div className="space-y-4">
      <Segmented value={repId} onChange={setRepId} options={reps.map((r) => ({ value: String(r.id), label: r.name }))} />
      {/* How many shops each day */}
      <div className="grid grid-cols-4 gap-2 sm:grid-cols-7">
        {WEEK.map((d) => (
          <div key={d} className={cn("rounded-2xl border border-line bg-card p-2 text-center", d === 5 && "opacity-60")}>
            <p className="text-[11px] text-muted">{dayName(d, tr)}</p>
            <p className="num text-lg font-bold">{num(perDay(d))}</p>
          </div>
        ))}
      </div>
      <Card>
        <CardHeader
          title={tr("محلات المندوب وأيام زيارتها", "The rep's shops and their visit days")}
          subtitle={none ? tr(`${num(none)} بلا يوم زيارة`, `${num(none)} with no visit day`) : tr("اضغط اليوم لإضافته أو إزالته", "Tap a day to add or remove it")}
        />
        {!customers.data ? (
          <LoadingRows />
        ) : !shops.length ? (
          <Empty title={tr("لا محلات لهذا المندوب", "This rep has no shops")} />
        ) : (
          <ul className="divide-y divide-line">
            {shops.map((c) => {
              const days = daysOf(c);
              return (
                <li key={c.id} className={cn("flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center", !days.length && "bg-warning-soft/30")}>
                  <Link href={`/customers/${c.id}`} className="min-w-0 flex-1 hover:underline">
                    <span className="block truncate font-semibold">{c.name}</span>
                    <span className="block truncate text-xs text-muted">{c.area}</span>
                  </Link>
                  <div className="flex flex-wrap gap-1">
                    {WEEK.map((d) => {
                      const on = days.includes(d);
                      return (
                        <button
                          key={d}
                          type="button"
                          aria-pressed={on}
                          aria-label={tr(`${dayName(d, tr)}: ${c.name}`, `${dayName(d, tr)}: ${c.name}`)}
                          onClick={() => toggle(c, d)}
                          className={cn(
                            "h-9 min-w-[3.25rem] rounded-xl border px-2 text-xs font-semibold transition active:scale-95",
                            on ? "border-action bg-action text-on-action" : "border-line-strong text-muted hover:bg-card-2",
                          )}
                        >
                          {dayName(d, tr)}
                        </button>
                      );
                    })}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Card>
    </div>
  );
}

// ---------- The visits report ----------

export function VisitsReport() {
  const { tr, num, date, ago } = useFmt();
  const [from, setFrom] = useState(today(-6));
  const [to, setTo] = useState(today());
  const r = useLoad(() => api.visitsReport(from, to), [from, to]);
  const d = r.data;
  const pct = (a: number, b: number) => (b ? Math.round((a / b) * 100) : 0);
  const exportCsv = () =>
    d &&
    downloadCsv(`visits-${from}-${to}`, [
      [tr("المندوب", "Rep"), tr("المخطط", "Planned"), tr("تمت", "Visited"), tr("فائتة", "Missed"), tr("باقية اليوم", "Left today"), tr("خارج الخطة", "Off the plan"), tr("بعيدة عن المحل", "Far"), tr("طلبيات", "Orders")],
      ...d.reps.map((x) => [x.rep.name, x.planned, x.visited, x.missed, x.remaining, x.extra, x.far, x.orders]),
    ]);
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-2">
        <label className="text-xs text-muted">
          {tr("من", "From")}
          <Input type="date" value={from} max={to} onChange={(e) => e.target.value && setFrom(e.target.value)} className="mt-1 w-44" />
        </label>
        <label className="text-xs text-muted">
          {tr("إلى", "To")}
          <Input type="date" value={to} min={from} max={today()} onChange={(e) => e.target.value && setTo(e.target.value)} className="mt-1 w-44" />
        </label>
        <Button variant="ghost" size="sm" onClick={exportCsv} disabled={!d}>
          CSV
        </Button>
      </div>
      {r.state.status === "error" ? (
        <ErrorBox error={r.state.error} onRetry={r.reload} />
      ) : !d ? (
        <LoadingRows rows={4} />
      ) : !d.totals.planned && !d.reps.length ? (
        <Empty icon={<CalendarDays className="size-6" />} title={tr("لا زيارات مخططة في هذه الفترة", "No planned visits in this period")} body={tr("حدد أيام زيارة المحلات من «الخطة».", "Set the shops' visit days under “The plan”.")} />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Stat label={tr("الزيارات المخططة", "Planned visits")} value={num(d.totals.planned)} hint={d.totals.remaining ? tr(`${num(d.totals.remaining)} باقية اليوم`, `${num(d.totals.remaining)} left today`) : undefined} />
            <Stat label={tr("تمت", "Done")} value={`${pct(d.totals.visited, d.totals.planned - d.totals.remaining)}%`} hint={tr(`${num(d.totals.visited)} زيارة · ${num(d.totals.extra)} خارج الخطة`, `${num(d.totals.visited)} visits · ${num(d.totals.extra)} off the plan`)} tone="success" />
            <Stat label={tr("فائتة", "Missed")} value={num(d.totals.missed)} tone="danger" />
            <Stat label={tr("بعيدة عن المحل", "Far from the shop")} value={num(d.totals.far)} hint={tr(`أبعد من ${VISIT_NEAR_M} م`, `Over ${VISIT_NEAR_M} m`)} tone="warning" />
          </div>

          <div className="grid gap-4 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
            <Card>
              <CardHeader title={tr("حسب المندوب", "By rep")} subtitle={tr("المنجز من المخطط حتى أمس", "Done of planned, up to yesterday")} />
              <ul className="divide-y divide-line">
                {d.reps.map((x) => {
                  const p = pct(x.visited, x.planned - x.remaining);
                  return (
                    <li key={x.rep.id} className="px-4 py-3">
                      <div className="flex items-center justify-between gap-2">
                        <span className="truncate font-semibold">{x.rep.name}</span>
                        <span className="num text-sm font-bold">{p}%</span>
                      </div>
                      <span className="mt-1.5 block h-2 overflow-hidden rounded-full bg-line">
                        <span className={cn("block h-full rounded-full", p >= 85 ? "bg-success" : p >= 65 ? "bg-[#f5b301]" : "bg-danger")} style={{ width: `${p}%` }} />
                      </span>
                      <p className="mt-1.5 flex flex-wrap gap-x-3 text-xs text-muted">
                        <span>{tr(`${num(x.visited)} من ${num(x.planned)}`, `${num(x.visited)} of ${num(x.planned)}`)}</span>
                        {x.remaining > 0 && <span>{tr(`باقية اليوم ${num(x.remaining)}`, `${num(x.remaining)} left today`)}</span>}
                        {x.missed > 0 && <span className="text-danger">{tr(`فائتة ${num(x.missed)}`, `${num(x.missed)} missed`)}</span>}
                        {x.far > 0 && <span className="text-warning">{tr(`بعيدة ${num(x.far)}`, `${num(x.far)} far`)}</span>}
                        <span>{tr(`طلبيات ${num(x.orders)}`, `${num(x.orders)} orders`)}</span>
                        {x.extra > 0 && <span>{tr(`خارج الخطة ${num(x.extra)}`, `${num(x.extra)} off the plan`)}</span>}
                      </p>
                    </li>
                  );
                })}
              </ul>
            </Card>
            <Card>
              <CardHeader title={tr("لماذا لم يطلبوا؟", "Why no order?")} />
              <div className="space-y-2 p-4">
                {(Object.keys(d.reasons) as NoOrderReason[]).map((k) => {
                  const most = Math.max(1, ...Object.values(d.reasons));
                  return (
                    <div key={k} className="flex items-center gap-2 text-sm">
                      <span className="w-36 shrink-0 truncate">{reasonText(k, tr)}</span>
                      <span className="h-2 flex-1 overflow-hidden rounded-full bg-line">
                        <span className="block h-full rounded-full bg-warning" style={{ width: `${(d.reasons[k] / most) * 100}%` }} />
                      </span>
                      <span className="num w-6 text-end text-muted">{d.reasons[k]}</span>
                    </div>
                  );
                })}
              </div>
            </Card>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader title={tr("الزيارات الفائتة", "Missed visits")} subtitle={tr("محل في الخطة لم يُزر في يومه", "A planned shop not visited on its day")} />
              {!d.missed.length ? (
                <p className="p-6 text-center text-sm text-muted">{tr("لا زيارة فائتة", "No visit missed")}</p>
              ) : (
                <ul className="max-h-[28rem] divide-y divide-line overflow-y-auto">
                  {d.missed.map((m) => (
                    <li key={`${m.day}-${m.customer.id}`}>
                      <Link href={`/customers/${m.customer.id}`} className="flex items-center gap-3 px-4 py-2.5 hover:bg-card-2">
                        <span className="w-20 shrink-0 text-xs text-muted">
                          {dayName(weekDayOf(m.day), tr)}
                          <span className="num block">{date(m.day)}</span>
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate font-semibold">{m.customer.name}</span>
                          <span className="block truncate text-xs text-muted">
                            {m.customer.area} · {m.rep.name}
                          </span>
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
            <Card>
              <CardHeader title={tr("سُجّلت بعيداً عن المحل", "Recorded far from the shop")} subtitle={tr(`الهاتف أبعد من ${VISIT_NEAR_M} م عن موقع المحل`, `The phone over ${VISIT_NEAR_M} m from the shop's pin`)} />
              {!d.far.length ? (
                <p className="p-6 text-center text-sm text-muted">{tr("لا شيء", "None")}</p>
              ) : (
                <ul className="max-h-[28rem] divide-y divide-line overflow-y-auto">
                  {d.far.map((v) => (
                    <li key={v.id}>
                      <Link href={`/customers/${v.customer.id}`} className="flex items-center gap-3 px-4 py-2.5 hover:bg-card-2">
                        <span className="min-w-0 flex-1">
                          <span className="block truncate font-semibold">{v.customer.name}</span>
                          <span className="block truncate text-xs text-muted">
                            {v.rep.name} · {ago(v.at)}
                          </span>
                        </span>
                        <OutcomeBadge outcome={v.outcome} />
                        <span className="num shrink-0 text-sm font-bold text-warning">{v.distance_m! >= 1000 ? tr(`${(v.distance_m! / 1000).toFixed(1)} كم`, `${(v.distance_m! / 1000).toFixed(1)} km`) : tr(`${v.distance_m} م`, `${v.distance_m} m`)}</span>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </div>
        </>
      )}
    </div>
  );
}
