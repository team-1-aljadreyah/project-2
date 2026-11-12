"use client";

// The rep's home on the phone, after the medicine-delivery app design Yasser chose for the rep:
// - "Hi" + search (his customers),
// - a dark banner with today's money and the two main buttons (new order, take payment),
// - "today's route": a drawn map with the shops worth visiting today, and a card for the next stop,
// - his customers as cards (like the design's "Popular" grid); a tap opens the customer sheet.
// Saved offline work and his commission stay on this page, like before.
import { useState } from "react";
import { motion } from "motion/react";
import { Percent, Route, Search, ShoppingCart, Truck, Wallet, WifiOff } from "lucide-react";
import { useNow } from "@/components/hall/live";
import { CustomerSheet, NextStopCard, RouteMap, buildStops, useVisits } from "@/components/rep-route";
import Link from "next/link";
import { useApp } from "@/components/shell";
import { repDoes } from "@/lib/api/types";
import { Button, Card, LimitBar, Notice, Skeleton } from "@/components/ui";
import { api } from "@/lib/api";
import type { Customer } from "@/lib/api/types";
import { useFmt } from "@/lib/i18n";
import { useQueue } from "@/lib/offline";
import { useLoad } from "@/lib/use-load";
import { cn, dayOfIso, matches, today } from "@/lib/utils";

export default function RepHome() {
  const { tr, money, num } = useFmt();
  const { user } = useApp();
  const now = useNow();
  const orders = useLoad(() => api.listOrders(), []);
  const customers = useLoad(() => api.listCustomers(), []);
  const payments = useLoad(() => api.listPayments(), []);
  const month = today().slice(0, 7);
  const comm = useLoad(() => api.commissions(month), [month]);
  const queue = useQueue();
  const visited = useVisits(user.id);
  const [q, setQ] = useState("");
  const [open, setOpen] = useState<Customer | null>(null);

  const t = today();
  const todayOrders = (orders.data ?? []).filter((o) => dayOfIso(o.created_at) === t && o.status !== "cancelled");
  const collected = (payments.data ?? []).filter((p) => dayOfIso(p.date) === t && !p.reversed && !p.reversal_of).reduce((s, p) => s + p.amount, 0);
  const all = (customers.data ?? []).slice().sort((a, b) => (b.balance ?? 0) - (a.balance ?? 0));
  const shown = all.filter((c) => matches(q, c.name, c.owner_name, c.area, c.phone));
  const stops = customers.data ? buildStops(customers.data, now) : [];
  const done = stops.filter((s) => visited.includes(s.customer.id)).length;
  const nextIdx = stops.findIndex((s) => !visited.includes(s.customer.id));
  const row = comm.data?.[0];
  // A rep who also delivers: his shipments today (with him or ready at the warehouse), for the delivery trip.
  const delivers = repDoes(user, "delivery");
  const myShipments = (orders.data ?? []).filter((o) => o.delivery?.rep?.id === user.id && (o.delivery.status === "out" || o.delivery.status === "ready"));
  const shipShops = new Set(myShipments.map((o) => o.customer_id)).size;

  return (
    <div className="mx-auto max-w-5xl space-y-5">
      {/* "Hi, …" */}
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-sm text-muted">{tr("أهلاً،", "Hi,")}</p>
          <h1 className="text-2xl font-bold">{user.name.split(" ")[0]}</h1>
        </div>
        <span className="flex size-12 items-center justify-center rounded-full bg-primary text-xl font-bold text-on-primary ring-4 ring-primary-soft">{user.name.trim()[0]}</span>
      </div>

      {/* While his orders load, the trip card's place is kept (the page below doesn't jump when it arrives). */}
      {delivers && orders.state.status === "loading" && <div aria-hidden className="h-20 rounded-3xl bg-card-2" />}
      {delivers && myShipments.length > 0 && (
        <Link href="/deliveries" className="brand-panel relative flex h-20 items-center gap-4 overflow-hidden rounded-3xl px-4">
          <span className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-action text-on-action">
            <Route className="size-6" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block font-bold">{tr("جولة التوصيل", "Delivery trip")}</span>
            <span className="block text-sm opacity-80">
              {tr(
                `${num(myShipments.length)} ${myShipments.length === 1 ? "شحنة" : myShipments.length === 2 ? "شحنتان" : myShipments.length <= 10 ? "شحنات" : "شحنة"} لـ ${num(shipShops)} ${shipShops <= 2 || shipShops > 10 ? "محل" : "محلات"}: اخترها لجولة واحدة`,
                `${num(myShipments.length)} shipments for ${num(shipShops)} shops: pick them for one trip`,
              )}
            </span>
          </span>
          <Truck className="size-5 shrink-0 opacity-70" />
          <span className="hazard absolute inset-x-0 bottom-0 h-1" aria-hidden />
        </Link>
      )}

      <div className="flex h-12 items-center gap-2 rounded-2xl border border-line-strong bg-card px-4 focus-within:border-action focus-within:ring-4 focus-within:ring-action/15">
        <Search className="size-5 text-faint" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={tr("ابحث عن زبون", "Search for a customer")}
          className="h-full flex-1 bg-transparent text-base outline-none placeholder:text-faint"
        />
      </div>

      {queue.length > 0 && (
        <Notice tone="warning" title={tr(`${queue.length} محفوظة على الجوال`, `${queue.length} saved on the phone`)} href="/orders">
          <span className="flex items-center gap-1">
            <WifiOff className="size-3.5" /> {tr("تُرسَل تلقائياً عند عودة الإنترنت", "They send by themselves when the internet is back")}
          </span>
        </Notice>
      )}

      {/* The banner, like "We will deliver your medicines" */}
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="brand-panel relative overflow-hidden rounded-3xl p-5 sm:p-6">
        <div className="brand-grid absolute inset-0" aria-hidden />
        <div className="relative flex items-center gap-4">
          <div className="min-w-0 flex-1">
            <p className="text-sm opacity-80">{tr("قبضت اليوم", "Collected today")}</p>
            <p className="num mt-1 text-3xl font-bold">{money(collected)}</p>
            <p className="mt-1 flex flex-wrap gap-x-3 text-xs opacity-80">
              <span>
                <b className="num">{num(todayOrders.length)}</b> {tr("طلبات اليوم", "orders today")}
              </span>
              <Link href="/commissions" className="-my-1 flex items-center gap-1 rounded-full bg-white/10 px-2.5 py-1 transition hover:bg-white/20 active:scale-[0.98]">
                <Percent className="size-3" /> {tr("عمولتي", "My commission")} <b className="num">{money(row?.net ?? 0)}</b>
              </Link>
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              <Button variant="action" href="/orders/new">
                <ShoppingCart className="size-4" /> {tr("طلب جديد", "New order")}
              </Button>
              <Button href="/payments/new" className="border-white/25 bg-white/10 text-white hover:bg-white/20">
                <Wallet className="size-4" /> {tr("استلام تسديد", "Take payment")}
              </Button>
            </div>
          </div>
          <Truck className="hidden size-28 shrink-0 -scale-x-100 text-[#f5b48a] opacity-90 sm:block rtl:scale-x-100" strokeWidth={1.2} />
        </div>
        <div className="hazard absolute inset-x-0 bottom-0 h-1.5" aria-hidden />
      </motion.div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
        {/* Today's route (the design's tracking screen) */}
        <Card className="overflow-hidden p-3">
          <div className="mb-2 flex items-center justify-between gap-2 px-1">
            <h2 className="flex items-center gap-1.5 font-bold">
              <Route className="size-4 text-action" /> {tr("جولة اليوم", "Today's route")}
            </h2>
            <span className="num rounded-full bg-card-2 px-2.5 py-0.5 text-xs font-semibold">
              {done}/{stops.length}
            </span>
          </div>
          {customers.data ? (
            stops.length ? (
              <>
                <RouteMap stops={stops} visited={visited} onPick={setOpen} />
                <div className="mt-3">
                  <NextStopCard stop={stops[nextIdx]} index={nextIdx} total={stops.length} done={done} userId={user.id} onOpen={setOpen} />
                </div>
                <p className="mt-2 px-1 text-[11px] text-faint">
                  {tr("المحلات مرتبة حسب الأهم: فوق السقف، قريب منه، ثم من لم يطلب منذ أسبوع.", "Shops in order of importance: over the limit, near it, then those with no order for a week.")}
                </p>
              </>
            ) : (
              <p className="py-10 text-center text-sm text-muted">{tr("لا توجد زيارات مهمة اليوم", "No important visits today")}</p>
            )
          ) : (
            <Skeleton className="aspect-[36/26] w-full" />
          )}
        </Card>

        {/* My customers (the design's "Popular" grid) */}
        <div>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-bold">{tr("زبائني", "My customers")}</h2>
            <Button size="sm" variant="ghost" href="/customers">
              {tr("الكل", "All")}
            </Button>
          </div>
          <div className="grid grid-cols-2 gap-3">
            {shown.slice(0, q ? 20 : 8).map((c, i) => {
              const bal = c.balance ?? 0;
              const lim = c.debt_limit ?? 0;
              const over = lim > 0 && bal >= lim;
              const near = !over && lim > 0 && bal / lim >= 0.7;
              return (
                <motion.button
                  key={c.id}
                  type="button"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: Math.min(i, 8) * 0.04 }}
                  whileTap={{ scale: 0.97 }}
                  onClick={() => setOpen(c)}
                  className="flex flex-col rounded-3xl border border-line bg-card p-3 text-start transition-[border-color,box-shadow] hover:border-line-strong hover:shadow-md"
                >
                  <span
                    className={cn(
                      "relative flex h-20 items-center justify-center rounded-2xl text-3xl font-bold",
                      over ? "bg-danger-soft text-danger" : near ? "bg-warning-soft text-warning" : "bg-card-2 text-primary-ink",
                    )}
                  >
                    {c.name.trim()[0]}
                    {visited.includes(c.id) && <span className="absolute end-2 top-2 size-2.5 rounded-full bg-success" title={tr("زرته اليوم", "Visited today")} />}
                  </span>
                  <span className="mt-2 truncate text-sm font-bold">{c.name}</span>
                  <span className="truncate text-[11px] text-muted">{c.area}</span>
                  <span className={cn("num mt-1.5 text-sm font-bold", over && "text-danger")}>{money(bal)}</span>
                  <span className="mt-1.5">
                    <LimitBar balance={bal} limit={lim} />
                  </span>
                </motion.button>
              );
            })}
          </div>
          {!shown.length && customers.data && <p className="py-8 text-center text-sm text-muted">{tr("لا يوجد زبون بهذا الاسم", "No customer by that name")}</p>}
        </div>
      </div>

      {open && <CustomerSheet customer={open} stop={stops.find((s) => s.customer.id === open.id)} visited={visited.includes(open.id)} userId={user.id} onClose={() => setOpen(null)} />}
    </div>
  );
}
