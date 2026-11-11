"use client";

// "قراراتي اليوم" (my decisions today): the manager's morning page, after the "New workplace: choices &
// creation" illustration Yasser chose. The desk drawing at the top, then four stacks of cards (أ ب ج د):
// approvals, stock, money, work. Every card is one thing that waits for the manager, with a button that
// does it right here (approve, cancel, call…), or "remind me tomorrow". A done card flies off the desk.
import Link from "next/link";
import { useState, useSyncExternalStore } from "react";
import { AnimatePresence, motion } from "motion/react";
import { ArrowUpLeft, ArrowUpRight, BellOff, Check, CheckCircle2, Coffee, MessageCircle, Phone, X } from "lucide-react";
import { DeskArt } from "@/components/decisions/art";
import { LANES, buildDecisions, type Decision } from "@/components/decisions/data";
import { useNow } from "@/components/hall/live";
import { useApp } from "@/components/shell";
import { SortArea, SortItem, toggleIn } from "@/components/sortable";
import { inWarehouse, useWarehouseFilter } from "@/components/warehouse-filter";
import { Button, Dialog, ErrorBox, Skeleton, Textarea, errorText, useToast } from "@/components/ui";
import { api } from "@/lib/api";
import { useFmt } from "@/lib/i18n";
import { ordered, saveSite, useCustomizing, useSite } from "@/lib/site";
import { useLoad } from "@/lib/use-load";
import { today } from "@/lib/utils";

// ---------- "Remind me tomorrow": hidden ids, saved on this device for today only ----------
const SNOOZE_EVENT = "nahrain-decisions";
const snoozeKey = () => `nahrain.decisions.snooze.${today()}`;
const readSnooze = () => {
  try {
    return localStorage.getItem(snoozeKey()) ?? "[]";
  } catch {
    return "[]";
  }
};
function subscribeSnooze(cb: () => void) {
  window.addEventListener(SNOOZE_EVENT, cb);
  window.addEventListener("storage", cb);
  return () => {
    window.removeEventListener(SNOOZE_EVENT, cb);
    window.removeEventListener("storage", cb);
  };
}
function snooze(id: string) {
  const list = new Set<string>(JSON.parse(readSnooze()) as string[]);
  list.add(id);
  try {
    localStorage.setItem(snoozeKey(), JSON.stringify([...list]));
  } catch {}
  window.dispatchEvent(new Event(SNOOZE_EVENT));
}

export default function DecisionsPage() {
  const { tr, money, ago, monthName } = useFmt();
  const { user, lookups, items } = useApp();
  const toast = useToast();
  const now = useNow();
  const orders = useLoad(() => api.listOrders(), []);
  const whD = useWarehouseFilter();
  const customers = useLoad(() => api.listCustomers(), []);
  const expiring = useLoad(() => api.nearExpiry(lookups.settings.near_expiry_days), [lookups.settings.near_expiry_days]);
  const debts = useLoad(() => api.debts(), []);
  const stocktakes = useLoad(() => api.listStocktakes(), []);
  const closed = useLoad(() => api.closedMonths(), []);
  const online = useLoad(() => api.listOnlinePayments(), []);
  const snoozedRaw = useSyncExternalStore(subscribeSnooze, readSnooze, () => "[]");
  const snoozed = JSON.parse(snoozedRaw) as string[];
  const [cheer, setCheer] = useState(0);
  const [done, setDone] = useState(0);
  const [ask, setAsk] = useState<Decision | null>(null);
  // Customize mode: the four stacks are dragged to a new order and hidden with the eye.
  const customizing = useCustomizing();
  const lay = useSite().layouts.decisions;

  const loads = [orders, customers, expiring, debts, stocktakes, closed, online];
  const failed = loads.find((l) => l.state.status === "error");
  if (failed && failed.state.status === "error") return <ErrorBox error={failed.state.error} onRetry={failed.reload} />;
  const ready = loads.every((l) => l.data) && now > 0;

  const all = ready
    ? buildDecisions({
        orders: orders.data!.filter((o) => inWarehouse(whD, o.warehouse_id)),
        customers: customers.data!,
        items,
        expiring: expiring.data!.filter((r) => inWarehouse(whD, r.batch.warehouse_id)),
        debts: debts.data!,
        stocktakes: stocktakes.data!.filter((x) => inWarehouse(whD, x.warehouse_id)),
        closedMonths: closed.data!,
        online: online.data!,
        nearDays: lookups.settings.near_expiry_days,
        now,
        tr,
        money: (n) => money(n),
        ago: (iso) => ago(iso),
        monthName,
      })
    : [];
  const open = all.filter((d) => !snoozed.includes(d.id));
  const counts = Object.fromEntries(LANES.map((l) => [l.id, open.filter((d) => d.lane === l.id).length]));
  const later = all.length - open.length;
  const hiddenLanes = lay?.hidden ?? [];
  const sortedLanes = ordered(LANES, lay?.order ?? [], (l) => l.id);
  const lanes = customizing ? sortedLanes : sortedLanes.filter((l) => !hiddenLanes.includes(l.id));
  const saveLanes = (next: { order?: string[]; hidden?: string[] }) =>
    saveSite((s) => ({ ...s, layouts: { ...s.layouts, decisions: { order: lay?.order ?? [], hidden: hiddenLanes, ...next } } })).catch((e) => toast("danger", errorText(e, tr)));

  /** A decision was handled: the heart pops and the counter of "done today" goes up. */
  const finished = (text: string) => {
    setCheer((c) => c + 1);
    setDone((d) => d + 1);
    toast("success", text);
  };

  async function approve(d: Decision) {
    try {
      await api.approveOrder(d.ref);
      finished(tr("تمت الموافقة، والطلب صار بانتظار التجهيز", "Approved, the order now waits to be prepared"));
    } catch (e) {
      toast("danger", errorText(e, tr));
    }
  }

  // The time comes from the clock store (useNow), not Date.now(): rendering must not read the clock itself.
  const hello = now && new Date(now).getHours() >= 12 ? tr("مساء الخير", "Good evening") : tr("صباح الخير", "Good morning");

  return (
    <div className="space-y-6" style={{ "--dec-line": "var(--primary-ink)", "--dec-soft": "color-mix(in oklab, var(--action) 35%, var(--card))", "--dec-bubble": "#e1692b" } as React.CSSProperties}>
      {/* The desk */}
      <motion.section initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="relative overflow-hidden rounded-[28px] border border-line bg-card">
        <div className="pointer-events-none absolute inset-0 opacity-60 [background-image:radial-gradient(var(--line)_1px,transparent_1px)] [background-size:18px_18px]" aria-hidden />
        <div className="relative grid items-center gap-2 p-5 sm:p-8 lg:grid-cols-[1fr_1.15fr]">
          <div>
            <p className="text-sm text-muted">
              {hello}، {user.name.split(" ")[0]}
            </p>
            <h1 className="mt-1 text-3xl font-bold sm:text-4xl">{tr("قراراتي اليوم", "My decisions today")}</h1>
            {ready ? (
              <div className="mt-4 flex flex-wrap items-end gap-x-4 gap-y-2">
                {/* The new number drops in; the old one is simply replaced (no exit animation, so two numbers never overlap) */}
                <motion.span key={open.length} initial={{ y: -16, opacity: 0 }} animate={{ y: 0, opacity: 1 }} className="num text-6xl font-bold leading-none text-action">
                  {open.length}
                </motion.span>
                <span className="pb-1 text-base font-semibold">{open.length ? tr("قرارات بانتظارك", "decisions wait for you") : tr("لا شيء ينتظرك", "nothing waits for you")}</span>
              </div>
            ) : (
              <Skeleton className="mt-4 h-14 w-48" />
            )}
            <div className="mt-4 flex flex-wrap gap-2 text-xs">
              {done > 0 && (
                <span className="flex items-center gap-1 rounded-full bg-success-soft px-2.5 py-1 font-semibold text-success">
                  <CheckCircle2 className="size-3.5" /> {tr(`أنجزت ${done} الآن`, `${done} done just now`)}
                </span>
              )}
              {later > 0 && (
                <span className="flex items-center gap-1 rounded-full bg-card-2 px-2.5 py-1 font-semibold text-muted">
                  <BellOff className="size-3.5" /> {tr(`${later} مؤجلة لغدٍ`, `${later} for tomorrow`)}
                </span>
              )}
            </div>
          </div>
          <div className="mx-auto w-full max-w-[560px]">
            <DeskArt counts={counts} cheer={cheer} />
          </div>
        </div>
      </motion.section>

      {/* The four stacks */}
      {!ready ? (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
          {LANES.map((l) => (
            <Skeleton key={l.id} className="h-72" />
          ))}
        </div>
      ) : open.length === 0 ? (
        <motion.div
          initial={{ opacity: 0, scale: 0.97 }}
          animate={{ opacity: 1, scale: 1 }}
          className="flex flex-col items-center gap-3 rounded-[28px] border-2 border-dashed border-line-strong p-10 text-center"
        >
          <Coffee className="size-10 text-action" strokeWidth={1.5} />
          <p className="text-xl font-bold">{tr("مكتبك نظيف", "Your desk is clear")}</p>
          <p className="max-w-sm text-sm text-muted">
            {tr("لا يوجد قرار ينتظرك الآن. استمتع بشايك، وسنضع هنا أي جديد فور وصوله.", "Nothing waits for you now. Enjoy your tea; anything new will land here.")}
          </p>
        </motion.div>
      ) : (
        <SortArea ids={lanes.map((l) => l.id)} grid onOrder={(ids) => saveLanes({ order: ids })}>
          <div className="grid grid-cols-1 items-start gap-4 md:grid-cols-2 xl:grid-cols-4">
            {lanes.map((l) => {
              const list = open.filter((d) => d.lane === l.id);
              return (
                <SortItem key={l.id} id={l.id} hidden={hiddenLanes.includes(l.id)} onHide={() => saveLanes({ hidden: toggleIn(hiddenLanes, l.id) })}>
                  <section aria-label={tr(l.ar, l.en)}>
                    <div className="mb-3 flex items-center gap-2 px-1">
                      <span className="flex size-9 items-center justify-center rounded-lg text-lg font-bold text-white shadow-sm" style={{ background: l.color }}>
                        {l.letter}
                      </span>
                      <h2 className="font-bold">{tr(l.ar, l.en)}</h2>
                      <span className="num ms-auto rounded-full bg-card-2 px-2 py-0.5 text-xs font-semibold text-muted">{list.length}</span>
                    </div>
                    <div className="space-y-3">
                      {/* popLayout: a done card leaves the layout at once (the cards under it move up while it flies off) */}
                      <AnimatePresence initial={false} mode="popLayout">
                        {list.map((d, i) => (
                          <DecisionCard key={d.id} d={d} i={i} color={l.color} onApprove={approve} onAsk={setAsk} onSnooze={() => snooze(d.id)} />
                        ))}
                      </AnimatePresence>
                      {!list.length && (
                        <p className="flex items-center justify-center gap-1.5 rounded-2xl border-2 border-dashed border-line py-8 text-sm text-faint">
                          <Check className="size-4" /> {tr("لا شيء هنا", "Nothing here")}
                        </p>
                      )}
                    </div>
                  </section>
                </SortItem>
              );
            })}
          </div>
        </SortArea>
      )}

      {ask && <ReasonDialog d={ask} onClose={() => setAsk(null)} onDone={(t) => finished(t)} />}
    </div>
  );
}

/** One decision, drawn like a paper card on the desk (slightly turned; it straightens when you point at it). */
function DecisionCard({
  ref,
  d,
  i,
  color,
  onApprove,
  onAsk,
  onSnooze,
}: {
  /** AnimatePresence "popLayout" measures the leaving card through this ref (in React 19 ref is a normal prop). */
  ref?: React.Ref<HTMLElement>;
  d: Decision;
  i: number;
  color: string;
  onApprove: (d: Decision) => Promise<void>;
  onAsk: (d: Decision) => void;
  onSnooze: () => void;
}) {
  const { tr, money, lang } = useFmt();
  const [busy, setBusy] = useState(false);
  const Arrow = lang === "ar" ? ArrowUpLeft : ArrowUpRight;
  const tilt = i % 2 ? 0.8 : -0.8;
  const wa = d.phone?.replace(/^0/, "964");

  return (
    <motion.article
      ref={ref}
      layout
      initial={{ opacity: 0, y: 16, rotate: tilt }}
      animate={{ opacity: 1, y: 0, rotate: tilt }}
      exit={{ opacity: 0, y: -60, x: 40, rotate: 12, scale: 0.85, transition: { duration: 0.35 } }}
      whileHover={{ rotate: 0, y: -3 }}
      transition={{ type: "spring", stiffness: 260, damping: 24 }}
      // The whole card opens what it is about (its buttons keep their own job).
      className="box-link rounded-2xl border border-line bg-card p-4 shadow-[0_6px_20px_-12px_rgb(0_0_0/0.35)]"
    >
      {/* The colored block, like the A / B / C / D squares on the cards in the design */}
      <span className="absolute -top-2 start-4 h-4 w-10 rounded-sm" style={{ background: color }} aria-hidden />
      <div className="flex items-start justify-between gap-2">
        <h3 className="text-sm font-bold leading-6">{d.title}</h3>
        {d.href && (
          <Link href={d.href} aria-label={tr("فتح", "Open")} className="box-link-main flex size-8 shrink-0 items-center justify-center rounded-full bg-card-2 text-muted hover:text-text">
            <Arrow className="size-4" />
          </Link>
        )}
      </div>
      <p className="mt-1 text-xs leading-5 text-muted">{d.sub}</p>
      {d.amount !== undefined && d.amount > 0 && <p className="num mt-2 text-lg font-bold">{money(d.amount)}</p>}
      {/* A hand-drawn scribble, like the signatures on the design's cards */}
      <svg viewBox="0 0 60 12" className="mt-2 h-3 w-14 text-line-strong" aria-hidden>
        <path d="M 2 8 C 8 0 12 14 18 6 C 22 1 26 12 32 6 C 36 2 40 10 46 6 C 50 4 54 8 58 6" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      </svg>

      <div className="mt-3 flex flex-wrap gap-1.5">
        {d.kind === "over_limit" && (
          <>
            <Button
              size="sm"
              variant="action"
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                await onApprove(d);
                setBusy(false);
              }}
            >
              <Check className="size-3.5" /> {tr("موافقة", "Approve")}
            </Button>
            <Button size="sm" variant="danger" onClick={() => onAsk(d)}>
              <X className="size-3.5" /> {tr("إلغاء الطلب", "Cancel")}
            </Button>
          </>
        )}
        {d.kind === "new_shop" && (
          <>
            <Button size="sm" variant="action" href={d.href}>
              <Check className="size-3.5" /> {tr("مراجعة وموافقة", "Review")}
            </Button>
            <Button size="sm" variant="danger" onClick={() => onAsk(d)}>
              <X className="size-3.5" /> {tr("رفض", "Refuse")}
            </Button>
          </>
        )}
        {(d.kind === "expired" || d.kind === "near_expiry") && (
          <Button size="sm" variant="action" href="/transfers">
            {tr("نقل أو معالجة", "Move or handle")}
          </Button>
        )}
        {d.kind === "low_stock" && (
          <Button size="sm" variant="action" href="/receipts/new">
            {tr("استلام بضاعة", "Receive goods")}
          </Button>
        )}
        {(d.kind === "late_debt" || d.kind === "online_failed") && d.phone && (
          <>
            <Button size="sm" variant="action" href={`tel:${d.phone}`}>
              <Phone className="size-3.5" /> {tr("اتصال", "Call")}
            </Button>
            <a
              href={`https://wa.me/${wa}`}
              target="_blank"
              rel="noreferrer"
              className="inline-flex h-8 items-center gap-1 rounded-lg border border-line-strong px-2.5 text-xs font-medium hover:bg-card-2"
            >
              <MessageCircle className="size-3.5" /> {tr("واتساب", "WhatsApp")}
            </a>
          </>
        )}
        {d.kind === "delivery_locked" && (
          <Button size="sm" variant="action" href={d.href}>
            {tr("مراجعة وفتح الشحنة", "Review and unlock")}
          </Button>
        )}
        {(d.kind === "close_month" || d.kind === "stocktake" || d.kind === "waiting_orders") && (
          <Button size="sm" variant="action" href={d.href}>
            {d.kind === "close_month" ? tr("إغلاق الشهر", "Close the month") : d.kind === "stocktake" ? tr("فتح الجرد", "Open the count") : tr("عرض الطلبات", "Show orders")}
          </Button>
        )}
        {d.kind !== "over_limit" && d.kind !== "new_shop" && (
          <Button size="sm" variant="ghost" onClick={onSnooze} className="text-muted">
            <BellOff className="size-3.5" /> {tr("تذكيري غداً", "Remind me tomorrow")}
          </Button>
        )}
      </div>
    </motion.article>
  );
}

/** Cancelling an order or refusing a shop always needs a reason (it goes to the activity log). */
function ReasonDialog({ d, onClose, onDone }: { d: Decision; onClose: () => void; onDone: (text: string) => void }) {
  const { tr } = useFmt();
  const toast = useToast();
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const order = d.kind === "over_limit";
  return (
    <Dialog
      open
      onClose={onClose}
      title={order ? tr("إلغاء الطلب", "Cancel the order") : tr("رفض تسجيل المحل", "Refuse the shop")}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            {tr("رجوع", "Back")}
          </Button>
          <Button
            variant="danger"
            disabled={!reason.trim() || busy}
            onClick={async () => {
              setBusy(true);
              try {
                if (order) await api.cancelOrder(d.ref, reason.trim());
                else await api.rejectCustomer(d.ref, reason.trim());
                onClose();
                onDone(order ? tr("أُلغي الطلب وعادت الكمية إلى المخزون", "Order cancelled, stock released") : tr("رُفض التسجيل وأُغلق حساب المحل", "Sign-up refused, the shop's login is closed"));
              } catch (e) {
                toast("danger", errorText(e, tr));
                setBusy(false);
              }
            }}
          >
            {order ? tr("تأكيد الإلغاء", "Confirm cancel") : tr("تأكيد الرفض", "Confirm refuse")}
          </Button>
        </>
      }
    >
      <p className="mb-2 text-sm font-semibold">{d.title}</p>
      <Textarea value={reason} onChange={(e) => setReason(e.target.value)} placeholder={tr("اكتب السبب (يظهر في سجل التعديلات)", "Write the reason (shown in the activity log)")} rows={3} />
    </Dialog>
  );
}
