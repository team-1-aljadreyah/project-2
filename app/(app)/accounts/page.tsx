"use client";

import { useRemembered } from "@/lib/remember";

// The accountant's "account file", after the "Accountity" design Yasser chose for the accountant:
// three numbers at the top, the shop's profile card and details on the side, its invoices as colored tiles,
// a chart of what it bought against what it paid, and its latest payments. Only the accountant opens it.
import Link from "next/link";
import { useMemo, useState } from "react";
import { motion } from "motion/react";
import { AlertTriangle, ArrowUpRight, BadgeCheck, Calendar, FileText, MapPin, MessageCircle, Phone, ReceiptText, Store, Truck, User, Wallet, type LucideIcon } from "lucide-react";
import { CustomerPicker, InvoiceTiles, MoneyChart, PaymentList, monthRows } from "@/components/accounts";
import { useApp } from "@/components/shell";
import { inWarehouse, useWarehouseFilter } from "@/components/warehouse-filter";
import { UsdRateCard } from "@/components/usd-rate";
import { Button, Card, ErrorBox, LimitBar, RefLink, Skeleton } from "@/components/ui";
import { api } from "@/lib/api";
import { netPaid } from "@/lib/api/types";
import { useFmt } from "@/lib/i18n";
import { useLoad } from "@/lib/use-load";
import { cn, today } from "@/lib/utils";

const stagger = { hidden: {}, show: { transition: { staggerChildren: 0.06 } } };
const rise = { hidden: { opacity: 0, y: 14 }, show: { opacity: 1, y: 0, transition: { type: "spring" as const, stiffness: 260, damping: 24 } } };

export default function AccountsPage() {
  const { tr, money, num, name, date, ago, lang } = useFmt();
  const { lookups } = useApp();
  const customers = useLoad(() => api.listCustomers(), []);
  const invoicesAll = useLoad(() => api.listInvoices(), []);
  const whA = useWarehouseFilter();
  const invoices = { ...invoicesAll, data: invoicesAll.data?.filter((i) => inWarehouse(whA, i.warehouse_id)) };
  const payments = useLoad(() => api.listPayments(), []);

  // The shop to show: from the link (?customer=ID), or the one the accountant picks. Default: the most debt.
  const [chosen, setChosen] = useState<number | null>(() => (typeof window !== "undefined" ? Number(new URLSearchParams(window.location.search).get("customer")) || null : null));
  const [month, setMonth] = useRemembered("accounts:month", () => today().slice(0, 7));

  const all = useMemo(() => (customers.data ?? []).filter((c) => !c.pending), [customers.data]);
  const c = all.find((x) => x.id === chosen) ?? [...all].sort((a, b) => (b.balance ?? 0) - (a.balance ?? 0))[0];
  const myInvoices = useMemo(() => (invoices.data ?? []).filter((i) => i.customer_id === c?.id), [invoices.data, c]);
  const myPayments = useMemo(() => (payments.data ?? []).filter((p) => p.customer_id === c?.id), [payments.data, c]);

  const failed = [customers, invoices, payments].find((l) => l.state.status === "error");
  if (failed && failed.state.status === "error") return <ErrorBox error={failed.state.error} onRetry={failed.reload} />;

  const pick = (id: number) => {
    setChosen(id);
    // Keep it in the address, so a refresh or a shared link opens the same shop.
    window.history.replaceState(null, "", `?customer=${id}`);
  };

  // ---- The three numbers at the top (all shops) ----
  const thisMonth = today().slice(0, 7);
  const lastMonth = (() => {
    const [y, m] = thisMonth.split("-").map(Number);
    const d = new Date(y, m - 2, 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  })();
  const collected = (key: string) => (payments.data ?? []).filter((p) => p.date.startsWith(key)).reduce((s, p) => s + netPaid(p), 0);
  const now = collected(thisMonth);
  const before = collected(lastMonth);
  const change = before ? Math.round(((now - before) / before) * 100) : null;
  const overLimit = all.filter((x) => (x.balance ?? 0) > (x.debt_limit ?? Infinity)).length;
  const openInv = (invoices.data ?? []).filter((i) => i.status !== "paid");

  // ---- The chosen shop ----
  const tier = lookups.tiers.find((t) => t.id === c?.tier_id);
  const rep = lookups.reps.find((r) => r.id === c?.rep_id);
  const tiles = [...myInvoices]
    .sort((a, b) => {
      // Unpaid first (oldest first: those need a call), then the latest paid ones.
      const rank = (s: string) => (s === "paid" ? 1 : 0);
      return rank(a.status) - rank(b.status) || (a.status === "paid" ? b.date.localeCompare(a.date) : a.date.localeCompare(b.date));
    })
    .slice(0, 6);
  const rows = monthRows(myInvoices, myPayments, lang);
  const sum = rows.reduce((s, r) => ({ bought: s.bought + r.bought, paid: s.paid + r.paid }), { bought: 0, paid: 0 });
  const ratio = sum.bought ? Math.round((sum.paid / sum.bought) * 100) : null;
  const latestPayments = [...myPayments].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 5);
  const firstInvoice = [...myInvoices].sort((a, b) => a.date.localeCompare(b.date))[0];
  const phone = c?.phone.replace(/^0/, "964");
  const loading = !customers.data || !invoices.data || !payments.data;

  return (
    <motion.div variants={stagger} initial="hidden" animate="show" className="space-y-4">
      {/* Title and the three numbers, like the design's header */}
      <motion.div variants={rise} className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">{tr("ملف الحساب", "Account file")}</h1>
          <p className="text-sm text-muted">{tr("فواتير الزبون وتسديداته ودينه في صفحة واحدة", "A customer's invoices, payments and debt on one page")}</p>
        </div>
        <CustomerPicker customers={all} value={c} onChange={pick} />
      </motion.div>

      {/* The accountant fixes the dollar rate every morning */}
      <motion.div variants={rise}>
        <UsdRateCard />
      </motion.div>

      <motion.div variants={rise} className="grid gap-3 sm:grid-cols-3">
        <TopStat
          icon={Wallet}
          value={money(now)}
          label={tr("المقبوض هذا الشهر", "Collected this month")}
          badge={change === null ? undefined : `${change >= 0 ? "+" : ""}${change}%`}
          tone={change !== null && change < 0 ? "danger" : "success"}
          href="/payments"
        />
        <TopStat
          icon={AlertTriangle}
          value={num(overLimit)}
          label={tr("زبائن فوق سقف الدين", "Customers over the limit")}
          badge={overLimit ? tr("راجعهم", "Review") : undefined}
          tone="danger"
          href="/customers"
        />
        <TopStat
          icon={ReceiptText}
          value={num(openInv.length)}
          label={tr("فواتير غير مسددة", "Unpaid invoices")}
          badge={money(openInv.reduce((s, i) => s + i.remaining, 0))}
          tone="action"
          href="/invoices"
        />
      </motion.div>

      {loading || !c ? (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[340px_1fr]">
          <Skeleton className="h-[520px]" />
          <Skeleton className="h-[520px]" />
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[340px_minmax(0,1fr)]">
          {/* Side: profile card + details */}
          <div className="space-y-4">
            <motion.div variants={rise} key={`p${c.id}`}>
              <Card className="relative overflow-hidden p-5 text-center">
                <div className="hazard absolute inset-x-0 top-0 h-1.5" aria-hidden />
                <div className="relative mx-auto mt-2 flex size-20 items-center justify-center rounded-full bg-primary text-3xl font-bold text-on-primary ring-4 ring-primary-soft">
                  {c.name.trim()[0]}
                  <span
                    className={cn("absolute bottom-1 end-1 size-4 rounded-full border-2 border-card", c.active ? "bg-success" : "bg-danger")}
                    title={c.active ? tr("فعّال", "Active") : tr("موقوف", "Stopped")}
                  />
                </div>
                <h2 className="mt-3 text-lg font-bold">
                  <RefLink href={`/customers/${c.id}`}>{c.name}</RefLink>
                </h2>
                <p className="text-sm text-muted">{c.owner_name}</p>
                {tier && (
                  <span className="mt-2 inline-flex items-center gap-1 rounded-full bg-action/15 px-3 py-1 text-xs font-bold text-action dark:text-[#f5b48a]">
                    <BadgeCheck className="size-3.5" /> {name(tier)}
                  </span>
                )}
                {/* Quick actions, like the design's row of small icons */}
                <div className="mt-4 flex justify-center gap-2">
                  <IconLink href={`tel:${c.phone}`} icon={Phone} label={tr("اتصال", "Call")} />
                  <IconLink href={`https://wa.me/${phone}`} icon={MessageCircle} label={tr("واتساب", "WhatsApp")} external />
                  <IconLink href={`/payments/new?customer=${c.id}`} icon={Wallet} label={tr("تسديد جديد", "New payment")} />
                  <IconLink href={`/customers/${c.id}`} icon={FileText} label={tr("كشف الحساب", "Statement")} />
                </div>

                {/* The debt against its limit */}
                <div className="mt-5 rounded-2xl bg-card-2 p-3 text-start">
                  <div className="flex items-end justify-between gap-2">
                    <span className="text-xs text-muted">{tr("الدين الحالي", "Current debt")}</span>
                    <span className={cn("num text-lg font-bold", (c.balance ?? 0) > (c.debt_limit ?? Infinity) && "text-danger")}>{money(c.balance ?? 0)}</span>
                  </div>
                  <div className="mt-2">
                    <LimitBar balance={c.balance ?? 0} limit={c.debt_limit ?? 0} />
                  </div>
                  <p className="num mt-1.5 text-[11px] text-muted">
                    {tr("السقف", "Limit")} {money(c.debt_limit ?? 0)}
                  </p>
                </div>
              </Card>
            </motion.div>

            <motion.div variants={rise} key={`d${c.id}`}>
              <Card className="p-4">
                <h3 className="mb-3 text-sm font-bold">{tr("التفاصيل", "Details")}</h3>
                <div className="space-y-1">
                  <Detail icon={User} k={tr("صاحب المحل", "Owner")} v={c.owner_name} />
                  <Detail icon={Phone} k={tr("الهاتف", "Phone")} v={<span dir="ltr">{c.phone}</span>} href={`tel:${c.phone}`} />
                  <Detail icon={MapPin} k={tr("المنطقة", "Area")} v={c.area} />
                  <Detail icon={Store} k={tr("العنوان", "Address")} v={c.address || "—"} />
                  <Detail icon={Truck} k={tr("المندوب", "Rep")} v={rep?.name ?? "—"} />
                  <Detail icon={Calendar} k={tr("زبون منذ", "Customer since")} v={firstInvoice ? date(firstInvoice.date) : "—"} />
                  <Detail icon={ReceiptText} k={tr("آخر طلب", "Last order")} v={c.last_order_at ? ago(c.last_order_at) : "—"} />
                </div>
              </Card>
            </motion.div>
          </div>

          {/* Main: invoices, chart, payments */}
          <div className="min-w-0 space-y-4">
            <motion.div variants={rise} key={`i${c.id}`}>
              <Card className="p-4">
                <div className="mb-3 flex items-center justify-between gap-2">
                  <h3 className="text-sm font-bold">{tr("الفواتير", "Invoices")}</h3>
                  <Button size="sm" variant="ghost" href="/invoices">
                    {tr("كل الفواتير", "All invoices")} <ArrowUpRight className="size-3.5 rtl:-scale-x-100" />
                  </Button>
                </div>
                <InvoiceTiles invoices={tiles} />
              </Card>
            </motion.div>

            <div className="grid gap-4 xl:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
              <motion.div variants={rise} key={`c${c.id}`}>
                <Card className="h-full p-4">
                  <div className="mb-1 flex items-start justify-between gap-2">
                    <h3 className="text-sm font-bold">{tr("المشتريات والتسديد", "Bought and paid")}</h3>
                    <span className="text-[11px] text-muted">{tr("شهرياً", "Monthly")}</span>
                  </div>
                  <MoneyChart rows={rows} selected={month} onSelect={setMonth} />
                  {ratio !== null && (
                    <p className="mt-2 text-xs text-muted">
                      {tr("سدّد", "Paid")} <b className={cn("num", ratio >= 80 ? "text-success" : ratio >= 50 ? "text-warning" : "text-danger")}>{ratio}%</b>{" "}
                      {tr("مما اشتراه خلال هذه الفترة", "of what it bought in this period")}
                    </p>
                  )}
                </Card>
              </motion.div>

              <motion.div variants={rise} key={`y${c.id}`}>
                <Card className="h-full p-4">
                  <div className="mb-3 flex items-center justify-between gap-2">
                    <h3 className="text-sm font-bold">{tr("آخر التسديدات", "Latest payments")}</h3>
                    <Button size="sm" variant="action" href={`/payments/new?customer=${c.id}`}>
                      <Wallet className="size-3.5" /> {tr("تسديد", "Pay")}
                    </Button>
                  </div>
                  <PaymentList payments={latestPayments} />
                </Card>
              </motion.div>
            </div>
          </div>
        </div>
      )}
    </motion.div>
  );
}

function TopStat({ icon: Icon, value, label, badge, tone, href }: { icon: LucideIcon; value: string; label: string; badge?: string; tone: "success" | "danger" | "action"; href: string }) {
  const badgeCls = { success: "bg-success text-white dark:text-[#0e1013]", danger: "bg-danger text-white dark:text-[#0e1013]", action: "bg-action text-on-action" }[tone];
  return (
    <Link href={href} className="block rounded-card">
      <Card className="flex h-full items-center gap-3 p-4 transition duration-150 hover:-translate-y-0.5 hover:border-line-strong hover:shadow-md active:translate-y-0 active:shadow-none">
        <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-card-2">
          <Icon className="size-5 text-primary-ink" />
        </span>
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="num text-xl font-bold">{value}</span>
            {badge && <span className={cn("num rounded-full px-2 py-0.5 text-[10px] font-bold", badgeCls)}>{badge}</span>}
          </div>
          <p className="truncate text-xs text-muted">{label}</p>
        </div>
      </Card>
    </Link>
  );
}

function IconLink({ href, icon: Icon, label, external }: { href: string; icon: LucideIcon; label: string; external?: boolean }) {
  const cls = "flex size-10 items-center justify-center rounded-xl border border-line-strong text-muted transition hover:-translate-y-0.5 hover:border-action hover:text-action active:translate-y-0";
  // A page of the site opens in place (no full reload); a phone number or WhatsApp is a plain link.
  if (href.startsWith("/"))
    return (
      <Link href={href} title={label} aria-label={label} className={cls}>
        <Icon className="size-4" />
      </Link>
    );
  return (
    <a href={href} title={label} aria-label={label} {...(external ? { target: "_blank", rel: "noreferrer" } : {})} className={cls}>
      <Icon className="size-4" />
    </a>
  );
}

function Detail({ icon: Icon, k, v, href }: { icon: LucideIcon; k: string; v: React.ReactNode; /** The whole line is this link (the phone number calls). */ href?: string }) {
  const inside = (
    <>
      <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-card-2 text-muted">
        <Icon className="size-4" />
      </span>
      <div className="min-w-0">
        <p className="text-[11px] text-faint">{k}</p>
        <p className="truncate text-sm font-semibold">{v}</p>
      </div>
    </>
  );
  if (href)
    return (
      <a href={href} className="flex items-center gap-3 rounded-xl px-2 py-2 transition-colors hover:bg-card-2 active:bg-primary-soft">
        {inside}
      </a>
    );
  return <div className="flex items-center gap-3 rounded-xl px-2 py-2">{inside}</div>;
}
