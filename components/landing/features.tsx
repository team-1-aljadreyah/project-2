"use client";

// The last sections: the feature grid (bento) and the tilted role cards.
import Link from "next/link";
import { useEffect, useState } from "react";
import { AnimatePresence, animate, motion, useInView, useMotionValue, useTransform } from "motion/react";
import { useRef } from "react";
import { ArrowLeft, ArrowRight, Calculator, CheckCircle2, CloudOff, LayoutDashboard, Store, Truck, Warehouse, WifiOff, type LucideIcon } from "lucide-react";
import { useFmt } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { Eyebrow, Stars, WordReveal, rise } from "./shared";

// ---------- Bento: four boxes, each with its own small animation ----------

export function Bento({ enter }: { enter: string }) {
  const { tr } = useFmt();
  return (
    <section id="features" className="mx-auto max-w-6xl scroll-mt-24 px-4 py-20">
      <div className="mx-auto max-w-2xl text-center">
        <Eyebrow>{tr("المميزات", "Features")}</Eyebrow>
        <WordReveal text={tr("كل ما تحتاجه في مكان واحد", "Everything you need in one place")} className="mt-4 text-3xl font-bold sm:text-5xl" />
      </div>
      <div className="mt-12 grid gap-4 lg:grid-cols-3">
        <ExpiryCard />
        <StatementCard />
        <OfflineCard />
        <CommissionCard enter={enter} />
      </div>
    </section>
  );
}

const box = "relative overflow-hidden rounded-[28px] border border-white/10 p-6 sm:p-8";

/** Green box: batches lined up by expiry date, the expired one crossed out. */
function ExpiryCard() {
  const { tr } = useFmt();
  const batches = [
    { d: "2026-11-22", n: tr("دفعة #19 · 12 يوماً", "Batch #19 · 12 days"), tone: "bg-[#f2b75a]" },
    { d: "2027-01-08", n: tr("دفعة #44 · شهران", "Batch #44 · 2 months"), tone: "bg-white/70" },
    { d: "2027-05-30", n: tr("دفعة #71 · 6 أشهر", "Batch #71 · 6 months"), tone: "bg-white/70" },
  ];
  return (
    <motion.div {...rise()} className={cn(box, "bg-gradient-to-br from-[#2a2f37] to-[#121418] text-white")}>
      <Stars count={22} seed={3} />
      <h3 className="relative text-2xl font-bold leading-snug sm:text-3xl">{tr("الأقدم صلاحيةً يخرج أولاً، تلقائياً", "Oldest expiry leaves first, by itself")}</h3>
      <p className="relative mt-3 text-sm opacity-80">{tr("أمين المخزن لا يختار؛ فالنظام يصرف الأقرب انتهاءً، ولا يُباع المنتهي أبداً.", "The keeper doesn't choose. The system sends the nearest expiry, and expired stock never sells.")}</p>
      <ol className="relative mt-6 space-y-2">
        <motion.li initial={{ opacity: 0 }} whileInView={{ opacity: 1 }} viewport={{ once: true }} className="flex items-center justify-between rounded-xl bg-black/20 px-3 py-2 text-sm line-through opacity-60">
          <span>{tr("دفعة #7 · منتهية", "Batch #7 · expired")}</span>
          <span className="num text-xs">2026-11-06</span>
        </motion.li>
        {batches.map((b, i) => (
          <motion.li
            key={b.d}
            initial={{ opacity: 0, x: 30 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            transition={{ delay: 0.2 + i * 0.12 }}
            className={cn("flex items-center justify-between rounded-xl px-3 py-2 text-sm", i === 0 ? "bg-action text-on-action font-bold" : "bg-white/10")}
          >
            <span className="flex items-center gap-2">
              <span className={cn("size-2 rounded-full", b.tone)} />
              {b.n}
            </span>
            <span className="num text-xs">{i === 0 ? tr("يخرج أولاً", "goes first") : b.d}</span>
          </motion.li>
        ))}
      </ol>
    </motion.div>
  );
}

/** Wide box: a statement with the debt-limit bar filling up. */
function StatementCard() {
  const { tr } = useFmt();
  const rows = [
    { t: tr("فاتورة", "Invoice"), r: "INV-000231", v: "+342,500", c: "text-text" },
    { t: tr("تسديد", "Payment"), r: "PAY-000118", v: "-250,000", c: "text-[#97c459]" },
    { t: tr("مرتجع", "Return"), r: "RET-000012", v: "-18,000", c: "text-[#f2b75a]" },
  ];
  return (
    <motion.div {...rise(0.1)} className={cn(box, "bg-white/[0.04] lg:col-span-2")}>
      <div className="grid gap-6 sm:grid-cols-2 sm:items-center">
        <div>
          <h3 className="text-2xl font-bold sm:text-3xl">{tr("سقف دين وكشف حساب واضح", "A debt limit and a clear statement")}</h3>
          <p className="mt-3 text-sm text-muted">{tr("يُخصم التسديد من أقدم فاتورة، وإذا بلغ المحل سقفه يتوقف الطلب حتى يوافق المدير. ولا يُحذف التسديد أبداً.", "Payments go to the oldest invoice. At the limit, new orders wait for the manager. Payments are never deleted.")}</p>
        </div>
        <div className="rounded-2xl border border-white/10 bg-[#101215] p-4">
          <div className="flex items-center justify-between text-sm">
            <span className="font-semibold">{tr("أسواق الكوثر", "Al-Kawthar Market")}</span>
            <span className="num text-muted">3,200,000 / 5,000,000</span>
          </div>
          <div className="mt-2 h-2 overflow-hidden rounded-full bg-white/10">
            <motion.div initial={{ width: 0 }} whileInView={{ width: "64%" }} viewport={{ once: true }} transition={{ duration: 1.2, ease: "easeOut", delay: 0.3 }} className="h-full rounded-full bg-gradient-to-l from-[#e1692b] to-[#f5b48a]" />
          </div>
          <ul className="mt-4 space-y-2 text-sm">
            {rows.map((r, i) => (
              <motion.li key={r.r} initial={{ opacity: 0, y: 10 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ delay: 0.5 + i * 0.15 }} className="flex items-center justify-between rounded-lg bg-white/[0.03] px-3 py-2">
                <span>
                  {r.t} <span className="num text-xs text-muted">{r.r}</span>
                </span>
                <span className={cn("num font-semibold", r.c)}>{r.v}</span>
              </motion.li>
            ))}
          </ul>
        </div>
      </div>
    </motion.div>
  );
}

/** Wide box: orders from reps appear one after another, first "saved on phone", then "sent". */
function OfflineCard() {
  const { tr } = useFmt();
  const all = [
    { who: tr("حسين علي", "Hussein Ali"), shop: tr("ماركت الزهراء", "Al-Zahraa Market"), v: "73,000" },
    { who: tr("عباس فاضل", "Abbas Fadhil"), shop: tr("أسواق السلام", "Al-Salam Market"), v: "135,000" },
    { who: tr("محمد رضا", "Mohammed Ridha"), shop: tr("محلات الأمانة", "Al-Amana Shops"), v: "248,500" },
    { who: tr("حسين علي", "Hussein Ali"), shop: tr("بقالة الوفاء", "Al-Wafaa Grocery"), v: "41,250" },
  ];
  const [tick, setTick] = useState(0);
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref);
  // Every 2.2 seconds a new order arrives (only while the box is on screen).
  useEffect(() => {
    if (!inView) return;
    const t = setInterval(() => setTick((x) => x + 1), 2200);
    return () => clearInterval(t);
  }, [inView]);
  const shown = [0, 1, 2].map((k) => ({ ...all[(tick + k) % all.length], key: tick + k, sent: k > 0 }));
  return (
    <motion.div ref={ref} {...rise()} className={cn(box, "bg-white/[0.04] lg:col-span-2")}>
      <div className="grid gap-6 sm:grid-cols-2 sm:items-center">
        <div className="order-2 sm:order-1">
          <div className="relative h-[220px] overflow-hidden">
            <AnimatePresence initial={false}>
              {shown.map((o, i) => (
                <motion.div
                  key={o.key}
                  layout
                  initial={{ opacity: 0, y: -40, scale: 0.95 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: 40, scale: 0.95 }}
                  transition={{ type: "spring", stiffness: 200, damping: 24 }}
                  className="absolute inset-x-0 rounded-2xl border border-white/10 bg-[#101215] p-3"
                  style={{ top: i * 72 }}
                >
                  <div className="flex items-center justify-between text-sm">
                    <span className="font-semibold">{o.shop}</span>
                    <span className="num">{o.v}</span>
                  </div>
                  <div className="mt-1 flex items-center justify-between text-xs text-muted">
                    <span>{o.who}</span>
                    {o.sent ? (
                      <span className="flex items-center gap-1 text-[#97c459]">
                        <CheckCircle2 className="size-3.5" /> {tr("تم الإرسال", "Sent")}
                      </span>
                    ) : (
                      <span className="flex items-center gap-1 text-[#f2b75a]">
                        <CloudOff className="size-3.5" /> {tr("محفوظ على الجوال", "Saved on phone")}
                      </span>
                    )}
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        </div>
        <div className="order-1 sm:order-2">
          <span className="flex size-11 items-center justify-center rounded-xl bg-[#3a2a10] text-[#f2b75a]">
            <WifiOff className="size-5" />
          </span>
          <h3 className="mt-4 text-2xl font-bold sm:text-3xl">{tr("الطلب لا يضيع حتى بدون إنترنت", "No order is lost, even offline")}</h3>
          <p className="mt-3 text-sm text-muted">{tr("يُكمل مندوب التوصيل عمله في المناطق ضعيفة الإنترنت؛ إذ يُحفظ الطلب على الجوال ويُرسَل تلقائياً عند عودة الإنترنت، دون أن يتكرر.", "Delivery reps keep working where the internet is weak. Orders are saved on the phone and sent by themselves later, never twice.")}</p>
        </div>
      </div>
    </motion.div>
  );
}

/** Box with a number that counts up: the rep's commission at the end of the month. */
function CommissionCard({ enter }: { enter: string }) {
  const { tr, lang } = useFmt();
  const Forward = lang === "ar" ? ArrowLeft : ArrowRight;
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true });
  const n = useMotionValue(0);
  const text = useTransform(n, (v) => Math.round(v).toLocaleString("en-US"));
  useEffect(() => {
    if (!inView) return;
    const c = animate(n, 166911, { duration: 1.8, ease: "easeOut" });
    return () => c.stop();
  }, [inView, n]);
  return (
    <motion.div ref={ref} {...rise(0.1)} className={cn(box, "flex flex-col justify-between bg-gradient-to-br from-[#2a1a0b] to-[#120c06]")}>
      <div>
        <h3 className="text-2xl font-bold sm:text-3xl">{tr("عمولات وأرباح بلا حساب يدوي", "Commission and profit, no hand counting")}</h3>
        <p className="mt-3 text-sm text-muted">{tr("العمولة على المبالغ المدفوعة فعلاً، والربح حسب سعر الدفعة المباعة.", "Commission on money actually paid, profit by the batch sold.")}</p>
      </div>
      <div className="mt-8">
        <p className="text-xs text-muted">{tr("عمولات الشهر", "This month's commission")}</p>
        <p className="num text-4xl font-bold text-[#f5b48a]">
          <motion.span>{text}</motion.span> <span className="text-base">{tr("د.ع", "IQD")}</span>
        </p>
        <Link href={enter} className="mt-6 inline-flex h-11 items-center gap-2 rounded-full bg-action px-5 text-sm font-bold text-on-action transition hover:bg-action-hover">
          {tr("جرّبه", "Try it")} <Forward className="size-4" />
        </Link>
      </div>
    </motion.div>
  );
}

// ---------- Roles: tilted cards that settle when they appear ----------

export function Roles() {
  const { tr } = useFmt();
  const roles: { icon: LucideIcon; t: string; b: string; tilt: number; main?: boolean }[] = [
    { icon: Truck, t: tr("مندوب التوصيل", "Delivery rep"), b: tr("طلبات وتسديدات من الجوال", "Orders and payments by phone"), tilt: -6 },
    { icon: Warehouse, t: tr("أمين المخزن", "Warehouse keeper"), b: tr("استلام، صرف، تحويل وجرد", "Receive, issue, transfer, count"), tilt: 4 },
    { icon: LayoutDashboard, t: tr("المدير", "Manager"), b: tr("يرى كل شيء ويتحكم في الأسعار والديون", "Sees all, controls prices and debts"), tilt: -2, main: true },
    { icon: Calculator, t: tr("المحاسب", "Accountant"), b: tr("الفواتير والديون والتسديدات", "Invoices, debts and payments"), tilt: 5 },
    { icon: Store, t: tr("صاحب المحل", "Shop owner"), b: tr("يطلب بنفسه ويطّلع على كشف حسابه", "Orders and sees his statement"), tilt: -4 },
  ];
  return (
    <section className="mx-auto max-w-6xl px-4 py-20">
      <div className="mx-auto max-w-2xl text-center">
        <Eyebrow>{tr("الصلاحيات", "Roles")}</Eyebrow>
        <WordReveal text={tr("كلٌّ يرى عمله فقط", "Everyone sees only their part")} className="mt-4 text-3xl font-bold sm:text-5xl" />
        <motion.p {...rise(0.2)} className="mt-4 text-muted">
          {tr("مندوب التوصيل لا يرى سعر الشراء، وأمين المخزن لا يرى الديون، وكل تعديل يُسجَّل باسم صاحبه.", "Delivery reps never see cost, the warehouse never sees debts, and every change is logged by name.")}
        </motion.p>
      </div>
      <div className="mt-14 flex flex-wrap justify-center gap-4">
        {roles.map((r, i) => (
          <motion.div
            key={r.t}
            initial={{ opacity: 0, y: 60, rotate: r.tilt * 3 }}
            whileInView={{ opacity: 1, y: 0, rotate: r.tilt }}
            whileHover={{ rotate: 0, y: -8, scale: 1.04 }}
            viewport={{ once: true, margin: "-40px" }}
            transition={{ type: "spring", stiffness: 140, damping: 16, delay: i * 0.08 }}
            className={cn(
              "flex w-[200px] flex-col items-center rounded-3xl border p-6 text-center",
              r.main ? "border-transparent bg-gradient-to-br from-[#e1692b] to-[#b8521c] text-[#1a0b03] shadow-[0_20px_60px_-20px_rgb(225_105_43/0.6)]" : "border-white/10 bg-white/[0.04]",
            )}
          >
            <span className={cn("flex size-14 items-center justify-center rounded-2xl", r.main ? "bg-black/10" : "bg-primary-soft text-primary-ink")}>
              <r.icon className="size-7" />
            </span>
            <p className="mt-4 font-bold">{r.t}</p>
            <p className={cn("mt-1 text-xs", r.main ? "opacity-80" : "text-muted")}>{r.b}</p>
          </motion.div>
        ))}
      </div>
    </section>
  );
}
