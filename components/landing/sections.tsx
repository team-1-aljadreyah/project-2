"use client";

// The middle sections of the landing page: the sliding strip, the "problems" with swinging labels,
// and the "one system" picture where cards send light along lines into the Al-Nahrain chip.
import { motion, useReducedMotion } from "motion/react";
import { Boxes, Candy, CookingPot, CupSoda, Droplets, HandCoins, Milk, Package, BarChart3, Truck, Wheat, type LucideIcon } from "lucide-react";
import { LogoMark } from "@/components/logo";
import { useFmt } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { Eyebrow, Stars, WordReveal, rise } from "./shared";

// ---------- 1. The strip of categories that slides forever ----------

export function CategoryStrip() {
  const { tr } = useFmt();
  const items: [LucideIcon, string][] = [
    [Wheat, tr("حبوب ورز", "Grains & rice")],
    [Package, tr("سكر وطحين", "Sugar & flour")],
    [Droplets, tr("زيوت وسمن", "Oils & ghee")],
    [Package, tr("معلبات", "Canned food")],
    [CupSoda, tr("مشروبات", "Drinks")],
    [Milk, tr("ألبان", "Dairy")],
    [Candy, tr("حلويات", "Sweets")],
    [CookingPot, tr("بهارات", "Spices")],
  ];
  // Two copies side by side: when the first copy has slid out, the second is exactly where the first started.
  const row = [...items, ...items];
  return (
    // dir="ltr" on the box too: in an Arabic page the strip would start from the right edge and leave a gap.
    <div dir="ltr" className="marquee relative overflow-hidden border-y border-white/5 py-7 [mask-image:linear-gradient(90deg,transparent,#000_12%,#000_88%,transparent)]">
      <div className="marquee-track flex w-max gap-12 pe-12">
        {row.map(([Icon, label], i) => (
          <span key={i} className="flex items-center gap-2.5 text-lg font-semibold text-muted transition hover:text-text" aria-hidden={i >= items.length}>
            <Icon className="size-6 text-action" />
            {label}
          </span>
        ))}
      </div>
    </div>
  );
}

// ---------- 2. The daily problems, hanging on threads ----------

export function Problems() {
  const { tr } = useFmt();
  const reduce = useReducedMotion();
  const labels = [
    { t: tr("بضاعة انتهت صلاحيتها في المخزن", "Stock expired on the shelf"), x: "6%", line: 40 },
    { t: tr("مادة بيعت وهي غير موجودة", "Sold what wasn't there"), x: "52%", line: 18 },
    { t: tr("النهرين ينظّمها كلها", "Al-Nahrain sorts it all"), x: "24%", line: 92, main: true },
    { t: tr("ديون لا نعرف مقدارها", "Debts nobody can count"), x: "60%", line: 110 },
    { t: tr("طلب ضاع لانقطاع الإنترنت", "Order lost with no internet"), x: "10%", line: 168 },
  ];
  return (
    <section className="mx-auto max-w-6xl px-4 py-20">
      <motion.div
        {...rise()}
        className="relative grid overflow-hidden rounded-[32px] border border-white/10 bg-[radial-gradient(120%_120%_at_0%_100%,rgb(225_105_43/0.18),transparent_55%),linear-gradient(135deg,#16191e,#101215)] p-8 sm:p-12 lg:grid-cols-[1fr_1.1fr] lg:items-center"
      >
        <Stars count={18} seed={21} />
        <div className="relative">
          <Eyebrow>{tr("قبل النهرين", "Before Al-Nahrain")}</Eyebrow>
          <WordReveal text={tr("مشكلات تحدث كل يوم", "Problems that happen every day")} className="mt-4 text-3xl font-bold sm:text-5xl" />
          <p className="mt-4 max-w-md text-muted">
            {tr("العمل كله على الدفاتر وإكسل: بضاعة تنتهي صلاحيتها، ومواد تُباع وهي غير موجودة، وديون على المحلات لا نعرفها بدقة. المشكلات لا تنتهي، لكن الفوضى تنتهي.", "Everything on notebooks and Excel: stock expires, items get sold that weren't there, and nobody knows the exact shop debts. Problems will come, but the chaos can end.")}
          </p>
        </div>

        {/* Labels swinging on their threads, like the reference design. */}
        <div className="relative mt-10 h-[300px] lg:mt-0" aria-hidden>
          {labels.map((l, i) => (
            <motion.div
              key={l.t}
              className="absolute top-0 flex flex-col items-center"
              // Higher labels sit on top, so lower threads pass behind them.
              style={{ insetInlineStart: l.x, transformOrigin: "50% 0%", zIndex: 300 - l.line }}
              initial={{ opacity: 0, y: -30 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.7, delay: 0.2 + i * 0.12, type: "spring", stiffness: 120, damping: 12 }}
            >
              <motion.div
                className="flex flex-col items-center"
                style={{ transformOrigin: "50% 0%" }}
                animate={reduce ? undefined : { rotate: [-3, 3, -3] }}
                transition={{ duration: 3.5 + i * 0.6, repeat: Infinity, ease: "easeInOut" }}
              >
                <span className="size-2 rounded-full bg-primary-ink shadow-[0_0_12px_3px_rgb(225_105_43/0.7)]" />
                <span className="w-px bg-gradient-to-b from-primary-ink/80 to-white/10" style={{ height: l.line }} />
                <span
                  className={cn(
                    "whitespace-nowrap rounded-xl border px-3 py-2 text-xs font-semibold backdrop-blur sm:text-sm",
                    l.main ? "border-transparent bg-action text-on-action shadow-[0_0_40px_rgb(225_105_43/0.5)]" : "border-white/10 bg-[#1b1f25] text-text shadow-lg",
                  )}
                >
                  {l.t}
                </span>
              </motion.div>
            </motion.div>
          ))}
        </div>
      </motion.div>
    </section>
  );
}

// ---------- 3. One system: four cards send light into the chip ----------

export function Platform() {
  const { tr, lang } = useFmt();
  const rtl = lang === "ar";
  const cards: { icon: LucideIcon; t: string; b: string }[] = [
    { icon: Boxes, t: tr("المخزون بالدفعات", "Stock by batches"), b: tr("صلاحية وسعر لكل دفعة", "Expiry and cost per batch") },
    { icon: Truck, t: tr("المندوبين", "Sales reps"), b: tr("طلبات من الجوال، حتى بدون إنترنت", "Phone orders, even offline") },
    { icon: HandCoins, t: tr("الديون والتسديد", "Debts and payments"), b: tr("سقف لكل محل، وأقدم فاتورة أولاً", "A limit per shop, oldest invoice first") },
    { icon: BarChart3, t: tr("التقارير والأرباح", "Reports and profit"), b: tr("يومية، لكل مندوب ومادة ومخزن", "Daily, by rep, item and warehouse") },
  ];
  // The drawing is 900 × 360. In Arabic everything is mirrored: cards on the right, the chip on the left.
  const W = 900;
  const fx = (x: number) => (rtl ? W - x : x);
  const cardY = [20, 108, 196, 284];
  const lines = cardY.map((y) => {
    const startX = fx(330);
    const midX = fx(500);
    const endX = fx(640);
    const cy = y + 34;
    // Out of the card, along, down/up to the chip's height, then into the chip.
    return `M${startX} ${cy} H${midX} V180 H${endX}`;
  });

  return (
    <section id="platform" className="relative mx-auto max-w-6xl scroll-mt-24 px-4 py-20">
      <div className="mx-auto max-w-2xl text-center">
        <Eyebrow>{tr("مع النهرين", "With Al-Nahrain")}</Eyebrow>
        <WordReveal text={tr("نظام واحد لكل العمل", "One system for all the work")} className="mt-4 text-3xl font-bold sm:text-5xl" />
        <motion.p {...rise(0.2)} className="mt-4 text-muted">
          {tr("من استلام البضاعة إلى آخر تسديد: يعمل المخزن والمندوب والمحاسب والمدير وصاحب المحل على الأرقام نفسها.", "From receiving goods to the last payment: warehouse, reps, accountant, manager and shop owners all work on the same numbers.")}
        </motion.p>
      </div>

      {/* Computer: the circuit picture */}
      <div className="relative mx-auto mt-14 hidden aspect-[900/360] max-w-4xl md:block">
        <svg viewBox={`0 0 ${W} 360`} className="absolute inset-0 size-full" aria-hidden>
          {lines.map((d, i) => (
            <g key={i}>
              <path d={d} fill="none" stroke="rgb(255 255 255 / 0.1)" strokeWidth="2" />
              <path d={d} fill="none" stroke="#e1692b" strokeWidth="2.5" strokeLinecap="round" className="pulse-line" style={{ animationDelay: `${i * 0.55}s` }} />
            </g>
          ))}
          {/* little "pins" around the chip */}
          {Array.from({ length: 10 }, (_, i) => {
            const cx = fx(715);
            const a = (i / 10) * Math.PI * 2;
            // Rounded, so the server and the browser get exactly the same numbers.
            const r = (v: number) => Math.round(v * 10) / 10;
            return <line key={i} x1={r(cx + Math.cos(a) * 95)} y1={r(180 + Math.sin(a) * 95)} x2={r(cx + Math.cos(a) * 125)} y2={r(180 + Math.sin(a) * 125)} stroke="rgb(225 105 43 / 0.35)" strokeWidth="1.5" strokeLinecap="round" />;
          })}
        </svg>
        {cards.map((c, i) => (
          <motion.div
            key={c.t}
            {...rise(0.1 + i * 0.1)}
            className="absolute flex h-[68px] w-[34%] items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.04] px-4 backdrop-blur"
            style={{ top: `${(cardY[i] / 360) * 100}%`, insetInlineStart: `${(20 / W) * 100}%` }}
          >
            <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary-soft text-primary-ink">
              <c.icon className="size-5" />
            </span>
            <span className="min-w-0">
              <span className="block truncate font-semibold">{c.t}</span>
              <span className="block truncate text-xs text-muted">{c.b}</span>
            </span>
          </motion.div>
        ))}
        <motion.div
          initial={{ opacity: 0, scale: 0.7 }}
          whileInView={{ opacity: 1, scale: 1 }}
          viewport={{ once: true }}
          transition={{ duration: 0.7, delay: 0.3, type: "spring" }}
          className="chip-glow absolute flex size-[150px] -translate-y-1/2 items-center justify-center rounded-[34px] bg-gradient-to-br from-[#2a2f37] to-[#121418]"
          style={{ top: "50%", insetInlineStart: `${((640 - 0) / W) * 100}%` }}
        >
          <LogoMark size={92} />
        </motion.div>
      </div>

      {/* Phone: the same idea, stacked */}
      <div className="mt-10 space-y-3 md:hidden">
        {cards.map((c, i) => (
          <motion.div key={c.t} {...rise(i * 0.08)} className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.04] p-4">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary-soft text-primary-ink">
              <c.icon className="size-5" />
            </span>
            <span>
              <span className="block font-semibold">{c.t}</span>
              <span className="block text-xs text-muted">{c.b}</span>
            </span>
          </motion.div>
        ))}
        <div className="flex justify-center pt-4">
          <div className="chip-glow flex size-28 items-center justify-center rounded-[28px] bg-gradient-to-br from-[#2a2f37] to-[#121418]">
            <LogoMark size={68} />
          </div>
        </div>
      </div>
    </section>
  );
}
