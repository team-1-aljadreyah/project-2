"use client";

// The hero: a sweeping beam of light, stars, the headline, and a dashboard that is tilted back in 3D
// and stands up straight as you scroll.
import Link from "next/link";
import { useRef } from "react";
import { motion, useReducedMotion, useScroll, useTransform } from "motion/react";
import { AlertTriangle, ArrowLeft, ArrowRight, Bell, PackageX, ShieldAlert, TrendingUp, Wallet } from "lucide-react";
import { LogoMark } from "@/components/logo";
import { useFmt } from "@/lib/i18n";
import { Stars } from "./shared";

export function Hero({ enter, enterLabel }: { enter: string; enterLabel: string }) {
  const { tr, lang } = useFmt();
  const Forward = lang === "ar" ? ArrowLeft : ArrowRight;
  const ref = useRef<HTMLDivElement>(null);
  const reduce = useReducedMotion();

  // 0 when the dashboard's top enters the bottom of the screen, 1 when it reaches the top.
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start end", "start 0.2"] });
  const rotateX = useTransform(scrollYProgress, [0, 1], reduce ? [0, 0] : [32, 0]);
  const scale = useTransform(scrollYProgress, [0, 1], reduce ? [1, 1] : [0.86, 1]);
  const y = useTransform(scrollYProgress, [0, 1], reduce ? [0, 0] : [60, 0]);

  return (
    <section className="relative overflow-hidden pb-10 pt-36 sm:pt-40">
      {/* light */}
      <div className="pointer-events-none absolute inset-0" aria-hidden>
        <div className="hero-beam absolute -top-1/3 left-[20%] h-[120%] w-[55%]" />
        <div className="absolute left-1/2 top-[-20%] h-[60%] w-[80%] -translate-x-1/2 rounded-full bg-[radial-gradient(closest-side,rgb(225_105_43/0.18),transparent)]" />
      </div>
      <Stars count={50} />

      <div className="relative mx-auto max-w-4xl px-4 text-center">
        <motion.h1
          initial={{ opacity: 0, y: 24, filter: "blur(8px)" }}
          animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
          transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
          className="text-4xl font-bold leading-[1.2] sm:text-6xl lg:text-7xl"
        >
          {tr("جملة المواد الغذائية", "Food wholesale,")}
          <span className="mt-2 block bg-gradient-to-l from-[#ffffff] via-[#f5b48a] to-[#e1692b] bg-clip-text pb-2 text-transparent">
            {tr("بدون ضياع ولا دفاتر", "without losses or notebooks")}
          </span>
        </motion.h1>
        <motion.p
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, delay: 0.2 }}
          className="mx-auto mt-6 max-w-2xl text-base leading-relaxed text-muted sm:text-lg"
        >
          {tr(
            "مخزون بالدفعات والأقدم صلاحية يطلع أول، مندوبين يطلبون من الجوال حتى بدون نت، وديون وتسديد واضح لكل محل. شركة النهرين، كربلاء.",
            "Stock by batches with the oldest expiry first, reps ordering from their phones even offline, and clear debts and payments for every shop. Al-Nahrain, Karbala.",
          )}
        </motion.p>
        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.7, delay: 0.35 }} className="mt-9 flex flex-wrap justify-center gap-3">
          <Link href={enter} className="group flex h-12 items-center gap-2 rounded-full bg-action px-7 text-base font-bold text-on-action shadow-[0_0_40px_rgb(225_105_43/0.45)] transition hover:bg-action-hover">
            {enterLabel}
            <Forward className="size-5 transition group-hover:-translate-x-1 ltr:group-hover:translate-x-1" />
          </Link>
          <a href="#platform" className="flex h-12 items-center rounded-full border border-white/15 bg-white/5 px-7 text-base font-semibold backdrop-blur transition hover:bg-white/10">
            {tr("شوف كيف يشتغل", "See how it works")}
          </a>
        </motion.div>
      </div>

      {/* The dashboard in 3D */}
      <div ref={ref} className="relative mx-auto mt-16 max-w-5xl px-4 [perspective:1400px]">
        <motion.div style={{ rotateX, scale, y, transformOrigin: "50% 0%" }} className="will-change-transform">
          <div className="pointer-events-none absolute -inset-x-10 -top-10 bottom-0 rounded-[40px] bg-[radial-gradient(closest-side,rgb(225_105_43/0.25),transparent)] blur-2xl" aria-hidden />
          <DashboardMock />
        </motion.div>
      </div>
    </section>
  );
}

/** A small, not-real copy of the manager's dashboard (only for the picture). */
function DashboardMock() {
  const { tr } = useFmt();
  const bars = [42, 58, 35, 70, 52, 88, 64];
  return (
    <div className="relative overflow-hidden rounded-3xl border border-white/10 bg-[#121418]/95 p-3 shadow-[0_40px_120px_-30px_rgb(0_0_0/0.8)] sm:p-5" aria-hidden>
      {/* top bar */}
      <div className="flex items-center justify-between gap-3 border-b border-white/5 pb-3">
        <div className="flex items-center gap-2">
          <LogoMark size={28} />
          <span className="text-sm font-bold">{tr("النهرين", "Al-Nahrain")}</span>
        </div>
        <div className="hidden gap-1 rounded-full bg-white/5 p-1 text-xs sm:flex">
          {[tr("لوحة التحكم", "Dashboard"), tr("الطلبات", "Orders"), tr("المخزون", "Stock"), tr("الزبائن", "Customers")].map((t, i) => (
            <span key={t} className={i === 0 ? "rounded-full bg-white/10 px-3 py-1 text-text" : "px-3 py-1 text-muted"}>
              {t}
            </span>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <span className="relative flex size-8 items-center justify-center rounded-full bg-white/5">
            <Bell className="size-4 text-muted" />
            <span className="absolute -end-0.5 -top-0.5 size-2.5 rounded-full bg-action" />
          </span>
          <span className="flex size-8 items-center justify-center rounded-full bg-primary text-xs font-bold text-on-primary">ح</span>
        </div>
      </div>

      <div className="mt-4 grid gap-3 lg:grid-cols-[1fr_260px]">
        <div className="space-y-3">
          <p className="text-start text-lg font-bold sm:text-xl">
            {tr("صباح الخير، ", "Good morning, ")}
            <span className="text-primary-ink">{tr("حيدر", "Haider")}</span>
          </p>
          <div className="grid grid-cols-3 gap-2 sm:gap-3">
            {[
              { l: tr("مبيعات اليوم", "Sales today"), v: "1,146,250", icon: TrendingUp, c: "text-primary-ink" },
              { l: tr("المقبوض", "Collected"), v: "405,000", icon: Wallet, c: "text-[#f5b48a]" },
              { l: tr("الديون", "Debts"), v: "8,996,392", icon: ShieldAlert, c: "text-[#f39a92]" },
            ].map((s) => (
              <div key={s.l} className="rounded-2xl border border-white/5 bg-white/[0.03] p-2.5 text-start sm:p-3">
                <div className="flex items-center justify-between text-[10px] text-muted sm:text-xs">
                  {s.l}
                  <s.icon className={`size-3.5 ${s.c}`} />
                </div>
                <p className="num mt-1 text-sm font-bold sm:text-xl">{s.v}</p>
              </div>
            ))}
          </div>
          <div className="rounded-2xl border border-white/5 bg-white/[0.03] p-3">
            <div className="mb-3 flex items-center justify-between text-xs text-muted">
              <span>{tr("آخر 7 أيام", "Last 7 days")}</span>
              <span className="flex gap-3">
                <span className="flex items-center gap-1">
                  <i className="size-2 rounded-sm bg-primary" />
                  {tr("المبيعات", "Sales")}
                </span>
                <span className="flex items-center gap-1">
                  <i className="size-2 rounded-sm bg-action" />
                  {tr("المقبوض", "Collected")}
                </span>
              </span>
            </div>
            <div className="flex h-28 items-end gap-2 sm:h-36 sm:gap-3">
              {bars.map((h, i) => (
                <div key={i} className="flex h-full flex-1 items-end gap-1">
                  {/* The bar has its real height; it grows from the bottom (scaleY 0 → 1). */}
                  <motion.div initial={{ scaleY: 0 }} whileInView={{ scaleY: 1 }} viewport={{ once: true }} transition={{ duration: 0.8, delay: 0.3 + i * 0.07 }} style={{ height: `${h}%`, transformOrigin: "bottom" }} className="flex-1 rounded-t-md bg-primary" />
                  <motion.div initial={{ scaleY: 0 }} whileInView={{ scaleY: 1 }} viewport={{ once: true }} transition={{ duration: 0.8, delay: 0.4 + i * 0.07 }} style={{ height: `${h * 0.7}%`, transformOrigin: "bottom" }} className="flex-1 rounded-t-md bg-action" />
                </div>
              ))}
            </div>
          </div>
        </div>
        <div className="hidden space-y-2 lg:block">
          <p className="text-start text-sm font-semibold">{tr("تنبيهات", "Alerts")}</p>
          {[
            { icon: AlertTriangle, t: tr("قريب الانتهاء", "Expiring soon"), b: tr("جبن مثلثات · باقي 12 يوم", "Cheese · 12 days left"), c: "bg-[#3a2a10] text-[#f2b75a]" },
            { icon: PackageX, t: tr("مخزون قليل", "Low stock"), b: tr("لبن 1 لتر · تحت الحد الأدنى", "Laban 1 L · below minimum"), c: "bg-[#3d1a18] text-[#f39a92]" },
            { icon: ShieldAlert, t: tr("يتجاوز سقف الدين", "Over debt limit"), b: tr("محلات الأمانة · ينتظر موافقتك", "Al-Amana · waiting for you"), c: "bg-[#3a2a10] text-[#f2b75a]" },
          ].map((a, i) => (
            <motion.div
              key={a.t}
              initial={{ opacity: 0, x: 20 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
              transition={{ delay: 0.6 + i * 0.15 }}
              className="flex items-start gap-2 rounded-2xl border border-white/5 bg-white/[0.03] p-3 text-start"
            >
              <span className={`flex size-8 shrink-0 items-center justify-center rounded-lg ${a.c}`}>
                <a.icon className="size-4" />
              </span>
              <span>
                <span className="block text-sm font-semibold">{a.t}</span>
                <span className="block text-xs text-muted">{a.b}</span>
              </span>
            </motion.div>
          ))}
        </div>
      </div>
    </div>
  );
}
