"use client";

// The warehouse staff's home: what matters to them today, in the order they act on it.
// 1. Shops waiting for an answer in the support chat (they answer it).
// 2. Shipments ready to hand to the delivery reps, each with the rep who must take it.
// 3. Orders waiting to be prepared in their warehouse, and the stock alerts of their warehouse.
// They see, but don't change: confirming orders and receiving goods stay with the warehouse keeper.
import Link from "next/link";
import { motion } from "motion/react";
import { AlertTriangle, ArrowUpLeft, ArrowUpRight, ClipboardList, Headset, PackageCheck, Truck, Warehouse } from "lucide-react";
import { DeliveryChip } from "@/components/delivery/status";
import { useApp } from "@/components/shell";
import { Button, Card, Skeleton } from "@/components/ui";
import { api } from "@/lib/api";
import { useFmt } from "@/lib/i18n";
import { useLoad } from "@/lib/use-load";
import { useRealtime } from "@/lib/realtime";
import { cn } from "@/lib/utils";

const rise = { hidden: { opacity: 0, y: 12 }, show: { opacity: 1, y: 0 } };

export default function StaffHome() {
  const { tr, ago, name, num, lang } = useFmt();
  const { user, lookups, items } = useApp();
  const threads = useLoad(() => api.chatThreads(), []);
  const orders = useLoad(() => api.listOrders(), []);
  useRealtime(["orders"], () => orders.reload());
  const customers = useLoad(() => api.listCustomers(), []);
  const expiring = useLoad(() => api.nearExpiry(lookups.settings.near_expiry_days), [lookups.settings.near_expiry_days]);
  const Arrow = lang === "ar" ? ArrowUpLeft : ArrowUpRight;
  const wh = lookups.warehouses.find((w) => w.id === user.warehouse_id);
  const cust = new Map((customers.data ?? []).map((c) => [c.id, c]));
  const repName = (id: number) => lookups.reps.find((r) => r.id === id)?.name ?? "";

  const waitingChats = (threads.data ?? []).filter((t) => t.waiting);
  const mine = (orders.data ?? []).filter((o) => !user.warehouse_id || o.warehouse_id === user.warehouse_id);
  const toPrepare = mine.filter((o) => o.status === "approved" && !o.delivery);
  const ready = mine.filter((o) => o.delivery?.status === "ready");
  const onWay = mine.filter((o) => o.delivery?.status === "out");
  const stockAlerts = [
    ...(expiring.data ?? [])
      .filter((r) => !user.warehouse_id || r.batch.warehouse_id === user.warehouse_id)
      .map((r) => ({ key: `b${r.batch.id}`, item: items.find((i) => i.id === r.batch.item_id)?.name ?? "", text: r.days_left < 0 ? tr("منتهية", "Expired") : tr(`تنتهي بعد ${r.days_left} يوم`, `${r.days_left} days left`), bad: r.days_left < 0 })),
    ...items
      .filter((i) => i.active && (i.stock.by_warehouse.find((w) => w.warehouse_id === user.warehouse_id)?.qty ?? 0) < i.min_stock / 2)
      .map((i) => ({ key: `l${i.id}`, item: i.name, text: tr("مخزون قليل", "Low stock"), bad: false })),
  ].slice(0, 6);
  const loading = !threads.data || !orders.data;

  return (
    <motion.div initial="hidden" animate="show" transition={{ staggerChildren: 0.06 }} className="space-y-5">
      <motion.div variants={rise} className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-sm text-muted">{tr("أهلاً،", "Hi,")}</p>
          <h1 className="text-2xl font-bold">{user.name.split(" ")[0]}</h1>
          <p className="flex items-center gap-1.5 text-sm text-muted">
            <Warehouse className="size-4" /> {name(wh)}
          </p>
        </div>
      </motion.div>

      {/* 1. Support: the most urgent thing for them */}
      <motion.section variants={rise} className="brand-panel relative overflow-hidden rounded-3xl p-5 sm:p-6">
        <div className="brand-grid absolute inset-0" aria-hidden />
        <div className="relative grid gap-4 lg:grid-cols-[auto_1fr] lg:items-center">
          <div className="flex items-center gap-4">
            <span className="flex size-14 items-center justify-center rounded-2xl bg-action text-on-action">
              <Headset className="size-7" />
            </span>
            <div>
              <p className="text-sm opacity-80">{tr("محادثات الدعم", "Support chats")}</p>
              <p className="text-2xl font-bold">
                {loading ? "…" : waitingChats.length ? tr(`${num(waitingChats.length)} تنتظر ردك`, `${num(waitingChats.length)} waiting for you`) : tr("لا شيء ينتظر", "Nothing waiting")}
              </p>
            </div>
          </div>
          <div className="space-y-2">
            {waitingChats.slice(0, 3).map((t) => (
              <Link key={t.customer_id} href={`/support?shop=${t.customer_id}`} className="flex items-center gap-3 rounded-2xl bg-white/10 px-3 py-2 hover:bg-white/15">
                <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-white/15 text-sm font-bold">{t.customer.trim()[0]}</span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold">{t.customer}</span>
                  <span className="block truncate text-xs opacity-75">{t.last.text}</span>
                </span>
                <span className="shrink-0 text-[11px] opacity-70">{ago(t.last.at)}</span>
              </Link>
            ))}
            <Button variant="action" href="/support" className="w-full sm:w-auto">
              <Headset className="size-4" /> {tr("افتح صندوق الدعم", "Open the support inbox")}
            </Button>
          </div>
        </div>
        <div className="hazard absolute inset-x-0 bottom-0 h-1.5" aria-hidden />
      </motion.section>

      {/* The numbers of their warehouse today */}
      <motion.div variants={rise} className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Tile icon={ClipboardList} label={tr("طلبات تنتظر التجهيز", "Orders to prepare")} value={toPrepare.length} href="/orders" loading={loading} />
        <Tile icon={PackageCheck} label={tr("شحنات جاهزة للتسليم", "Shipments ready")} value={ready.length} href="/deliveries" loading={loading} tone="action" />
        <Tile icon={Truck} label={tr("في الطريق", "On the way")} value={onWay.length} href="/deliveries" loading={loading} />
        <Tile icon={AlertTriangle} label={tr("تنبيهات المخزون", "Stock alerts")} value={stockAlerts.length} href="/stock" loading={!expiring.data} tone={stockAlerts.length ? "danger" : undefined} />
      </motion.div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        {/* 2. Shipments to hand out: the right package to the right delivery rep */}
        <motion.div variants={rise}>
          <Card className="p-4">
            <h2 className="mb-1 font-bold">{tr("شحنات جاهزة لمندوبي التوصيل", "Shipments ready for the delivery reps")}</h2>
            <p className="mb-3 text-xs text-muted">{tr("سلّم كل شحنة لمندوبها، وهو يمسح ملصقها عند الاستلام.", "Hand each shipment to its rep; he scans its label when he takes it.")}</p>
            {loading ? (
              <Skeleton className="h-32" />
            ) : !ready.length ? (
              <p className="py-6 text-center text-sm text-muted">{tr("لا توجد شحنات جاهزة الآن", "No shipments ready now")}</p>
            ) : (
              <ul className="space-y-2">
                {ready.map((o) => (
                  <li key={o.id}>
                    <Link href={`/orders/${o.id}`} className="flex items-center gap-3 rounded-2xl border border-line p-3 hover:bg-card-2">
                      <PackageCheck className="size-5 shrink-0 text-action" />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-semibold">{cust.get(o.customer_id)?.name}</span>
                        <span className="block text-xs text-muted">
                          <span className="num" dir="ltr">
                            {o.number}
                          </span>{" "}
                          · {tr("مندوب التوصيل", "Delivery rep")}: <b>{o.delivery?.rep?.name ?? repName(o.rep_id)}</b>
                        </span>
                      </span>
                      <DeliveryChip d={o.delivery!} tr={tr} />
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </motion.div>

        <div className="space-y-5">
          {/* 3. Orders to prepare */}
          <motion.div variants={rise}>
            <Card className="p-4">
              <div className="mb-3 flex items-center justify-between">
                <h2 className="font-bold">{tr("طلبات تنتظر التجهيز", "Orders to prepare")}</h2>
                <Link href="/orders" className="flex items-center gap-1 text-xs font-semibold text-muted hover:text-text">
                  {tr("الكل", "All")} <Arrow className="size-3.5" />
                </Link>
              </div>
              {loading ? (
                <Skeleton className="h-24" />
              ) : !toPrepare.length ? (
                <p className="py-4 text-center text-sm text-muted">{tr("كل الطلبات مجهزة", "Everything is prepared")}</p>
              ) : (
                <ul className="divide-y divide-line">
                  {toPrepare.slice(0, 5).map((o) => (
                    <li key={o.id}>
                      <Link href={`/orders/${o.id}`} className="flex items-center justify-between gap-2 py-2.5 hover:text-primary-ink">
                        <span className="min-w-0">
                          <span className="block truncate text-sm font-semibold">{cust.get(o.customer_id)?.name}</span>
                          <span className="num text-xs text-muted" dir="ltr">
                            {o.number}
                          </span>
                        </span>
                        <span className="shrink-0 text-xs text-faint">{ago(o.created_at)}</span>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </motion.div>

          {/* Stock alerts of their warehouse */}
          <motion.div variants={rise}>
            <Card className="p-4">
              <h2 className="mb-3 font-bold">{tr("تنبيهات مخزنك", "Your warehouse alerts")}</h2>
              {!stockAlerts.length ? (
                <p className="py-4 text-center text-sm text-muted">{tr("لا توجد تنبيهات", "No alerts")}</p>
              ) : (
                <ul className="space-y-1.5">
                  {stockAlerts.map((a) => (
                    <li key={a.key} className="flex items-center gap-2 text-sm">
                      <AlertTriangle className={cn("size-4 shrink-0", a.bad ? "text-danger" : "text-warning")} />
                      <span className="min-w-0 flex-1 truncate">{a.item}</span>
                      <span className={cn("shrink-0 text-xs font-semibold", a.bad ? "text-danger" : "text-warning")}>{a.text}</span>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </motion.div>
        </div>
      </div>
    </motion.div>
  );
}

function Tile({ icon: Icon, label, value, href, loading, tone }: { icon: typeof Truck; label: string; value: number; href: string; loading: boolean; tone?: "action" | "danger" }) {
  const { num } = useFmt();
  return (
    <Link href={href} className="rounded-2xl border border-line bg-card p-4 transition hover:-translate-y-0.5 hover:shadow-md">
      <span className={cn("flex size-9 items-center justify-center rounded-xl", tone === "action" ? "bg-action/15 text-action" : tone === "danger" ? "bg-danger-soft text-danger" : "bg-card-2 text-primary-ink")}>
        <Icon className="size-4" />
      </span>
      <p className="num mt-3 text-2xl font-bold">{loading ? "…" : num(value)}</p>
      <p className="text-xs text-muted">{label}</p>
    </Link>
  );
}
