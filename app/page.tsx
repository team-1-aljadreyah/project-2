"use client";

// The public landing page: what Al-Nahrain's system does, for whom, and a way in.
import Link from "next/link";
import { motion } from "motion/react";
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  BarChart3,
  Boxes,
  Calculator,
  CalendarClock,
  CheckCircle2,
  ClipboardCheck,
  HandCoins,
  History,
  LayoutDashboard,
  MapPin,
  PackageCheck,
  Percent,
  Phone,
  ShieldCheck,
  Store,
  Truck,
  Undo2,
  Warehouse,
  WifiOff,
  type LucideIcon,
} from "lucide-react";
import { LogoMark } from "@/components/logo";
import { LanguageSwitch, ThemeToggle } from "@/components/switches";
import { homeOf, useSession } from "@/lib/auth";
import { useFmt, type Tr } from "@/lib/i18n";

// Each section slides up a little when it scrolls into view (only once).
const reveal = {
  initial: { opacity: 0, y: 24 },
  whileInView: { opacity: 1, y: 0 },
  viewport: { once: true, margin: "-80px" },
  transition: { duration: 0.5, ease: "easeOut" as const },
};

function features(tr: Tr): { icon: LucideIcon; title: string; body: string }[] {
  return [
    { icon: CalendarClock, title: tr("الأقدم صلاحية أولاً", "Oldest expiry first"), body: tr("كل دفعة بتاريخ صلاحيتها وسعر شرائها. النظام يصرف الأقدم تلقائياً، والمنتهي ما ينباع أبداً.", "Every batch has its own expiry and cost. The system sends the oldest first, and expired goods are never sold.") },
    { icon: WifiOff, title: tr("يشتغل بدون إنترنت", "Works offline"), body: tr("المندوب يسجل الطلب والتسديد حتى بمنطقة النت بيها ضعيف، وينرسل لوحده لما يرجع النت.", "Reps take orders and payments even with weak internet. They send by themselves when it comes back.") },
    { icon: HandCoins, title: tr("سقف دين لكل محل", "A debt limit per shop"), body: tr("إذا وصل المحل سقفه، الطلب الجديد يتوقف لحد ما يوافق المدير.", "When a shop reaches its limit, new orders wait for the manager's approval.") },
    { icon: ShieldCheck, title: tr("تسديد ما ينحذف", "Payments never deleted"), body: tr("التسديد يروح على أقدم فاتورة، والغلط يتصلح بعملية عكسية باسم صاحبها.", "Payments go to the oldest invoice. Mistakes are fixed by a reverse entry with a name.") },
    { icon: Boxes, title: tr("مخزنين بدون ضياع", "Two warehouses, nothing lost"), body: tr("تحويل كامل أو ما يتم، وجرد يسجل كل فرق مع سببه.", "Transfers happen fully or not at all, and counts save every difference with its reason.") },
    { icon: Undo2, title: tr("مرتجعات مضبوطة", "Returns done right"), body: tr("ما يرجع أكثر من اللي انباع. السليم يرجع للمخزون، والتالف ينسجل.", "No one returns more than was sold. Good stock goes back, damaged is written off.") },
    { icon: Percent, title: tr("عمولة بدون حساب باليد", "Commission without hand counting"), body: tr("نسبة لكل مادة على الفلوس المدفوعة فعلاً، وإغلاق الشهر بضغطة.", "A rate per item on money actually paid, and the month closes in one tap.") },
    { icon: BarChart3, title: tr("تقارير وأرباح حقيقية", "Reports and real profit"), body: tr("مبيعات يومية، لكل مندوب ومادة ومخزن، والربح حسب سعر الدفعة المباعة.", "Daily sales, by rep, item and warehouse, and profit by the batch actually sold.") },
  ];
}

function roles(tr: Tr): { icon: LucideIcon; title: string; body: string }[] {
  return [
    { icon: LayoutDashboard, title: tr("المدير", "Manager"), body: tr("يشوف كل شي، ويتحكم بالأسعار والديون والمندوبين.", "Sees everything and controls prices, debts and reps.") },
    { icon: Warehouse, title: tr("أمين المخزن", "Warehouse keeper"), body: tr("يستلم البضاعة ويصرفها ويسوي الجرد.", "Receives goods, issues them and counts stock.") },
    { icon: Truck, title: tr("المندوب", "Sales rep"), body: tr("يلف على المحلات ويسجل الطلبات والتسديدات من جواله.", "Visits shops and takes orders and payments on his phone.") },
    { icon: Calculator, title: tr("المحاسب", "Accountant"), body: tr("يتابع الفواتير والديون والتسديدات.", "Follows invoices, debts and payments.") },
    { icon: Store, title: tr("صاحب المحل", "Shop owner"), body: tr("يطلب بنفسه ويشوف كشف حسابه.", "Orders by himself and sees his own statement.") },
  ];
}

export default function LandingPage() {
  const { tr, lang } = useFmt();
  const session = useSession();
  const Forward = lang === "ar" ? ArrowLeft : ArrowRight;
  const enter = session ? homeOf(session.user.role) : "/login";
  const enterLabel = session ? tr("ادخل لحسابك", "Go to my account") : tr("تسجيل الدخول", "Log in");

  const steps = [
    { icon: PackageCheck, title: tr("البضاعة توصل", "Goods arrive"), body: tr("أمين المخزن يستلمها كدفعة بصلاحيتها وسعرها", "The keeper receives a batch with its expiry and cost") },
    { icon: Truck, title: tr("المندوب يطلب", "The rep orders"), body: tr("من جواله، بسعر المحل، والكمية تنحجز", "From his phone, at the shop's price, stock is held") },
    { icon: ClipboardCheck, title: tr("المخزن يجهّز", "The warehouse issues"), body: tr("الأقدم صلاحية يطلع، وتصدر الفاتورة", "Oldest expiry leaves first, the invoice is made") },
    { icon: HandCoins, title: tr("الزبون يسدد", "The shop pays"), body: tr("على أقدم فاتورة، وكشف الحساب واضح", "Oldest invoice first, with a clear statement") },
  ];

  return (
    <div className="min-h-dvh bg-bg">
      {/* ---------- Hero ---------- */}
      <header className="brand-panel relative overflow-hidden">
        <div className="brand-grid absolute inset-0" aria-hidden />
        <nav className="relative mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-4 sm:px-6">
          <Link href="/" className="flex items-center gap-2.5">
            <LogoMark size={40} />
            <span className="leading-tight">
              <span className="block text-lg font-bold">{tr("النهرين", "Al-Nahrain")}</span>
              <span className="hidden text-xs opacity-75 sm:block">{tr("للمواد الغذائية بالجملة", "Wholesale foods")}</span>
            </span>
          </Link>
          <div className="hidden items-center gap-6 text-sm font-medium opacity-90 md:flex">
            <a href="#features" className="hover:opacity-100 hover:underline">
              {tr("المميزات", "Features")}
            </a>
            <a href="#how" className="hover:underline">
              {tr("كيف يشتغل", "How it works")}
            </a>
            <a href="#contact" className="hover:underline">
              {tr("تواصل معنا", "Contact")}
            </a>
          </div>
          <div className="flex items-center gap-2">
            <LanguageSwitch onBrand />
            <ThemeToggle onBrand />
            <Link href={enter} className="hidden h-10 items-center gap-1.5 rounded-xl bg-white px-4 text-sm font-bold text-[#0b4a35] transition hover:bg-white/90 sm:flex">
              {enterLabel}
            </Link>
          </div>
        </nav>

        <div className="relative mx-auto grid max-w-6xl items-center gap-12 px-4 pb-20 pt-10 sm:px-6 lg:grid-cols-[1.1fr_1fr] lg:pb-28 lg:pt-16">
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6 }}>
            <span className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3 py-1 text-xs font-medium">
              <MapPin className="size-3.5" /> {tr("كربلاء · المخزن الرئيسي بالصناعة ومخزن الحر", "Karbala · Al-Sinaa and Al-Hur warehouses")}
            </span>
            <h1 className="mt-5 text-4xl font-bold leading-[1.25] sm:text-5xl lg:text-6xl">
              {tr("جملة المواد الغذائية،", "Food wholesale,")}
              <span className="block text-[#f8b170]">{tr("بدون دفاتر ولا ضياع", "without notebooks or losses")}</span>
            </h1>
            <p className="mt-5 max-w-xl text-base leading-relaxed opacity-85 sm:text-lg">
              {tr(
                "نظام شركة النهرين يرتب المخزون بالدفعات، وطلبات المندوبين، وديون المحلات والتسديد، من الجوال أو الكمبيوتر.",
                "Al-Nahrain's system keeps stock by batches, reps' orders, shop debts and payments in order, on phone or computer.",
              )}
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link href={enter} className="flex h-12 items-center gap-2 rounded-xl bg-action px-6 text-base font-bold text-on-action transition hover:bg-action-hover">
                {enterLabel} <Forward className="size-5" />
              </Link>
              <a href="#features" className="flex h-12 items-center rounded-xl border border-white/25 px-6 text-base font-semibold transition hover:bg-white/10">
                {tr("شوف المميزات", "See features")}
              </a>
            </div>
            <dl className="mt-10 grid max-w-md grid-cols-3 gap-4">
              {[
                ["2", tr("مخزن", "warehouses")],
                ["5", tr("أدوار", "roles")],
                ["24/7", tr("حتى بدون نت", "even offline")],
              ].map(([n, l]) => (
                <div key={l}>
                  <dt className="num text-2xl font-bold sm:text-3xl">{n}</dt>
                  <dd className="text-xs opacity-75 sm:text-sm">{l}</dd>
                </div>
              ))}
            </dl>
          </motion.div>

          <HeroPicture />
        </div>
      </header>

      {/* ---------- Features ---------- */}
      <section id="features" className="mx-auto max-w-6xl scroll-mt-6 px-4 py-20 sm:px-6">
        <motion.div {...reveal} className="max-w-2xl">
          <p className="text-sm font-semibold text-primary-ink">{tr("ليش النهرين؟", "Why Al-Nahrain?")}</p>
          <h2 className="mt-2 text-3xl font-bold sm:text-4xl">{tr("كل مشكلة بالدفاتر، إلها حل", "Every notebook problem, solved")}</h2>
          <p className="mt-3 text-muted">{tr("بضاعة تنتهي بالمخزن، مواد تنباع وهي مو موجودة، وديون ما نعرف كمها. هسه كلها واضحة.", "Stock expiring on the shelf, items sold that weren't there, debts nobody could count. Now it's all clear.")}</p>
        </motion.div>
        <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {features(tr).map((f, i) => (
            <motion.div key={f.title} {...reveal} transition={{ ...reveal.transition, delay: (i % 4) * 0.06 }} className="group rounded-2xl border border-line bg-card p-5 shadow-card transition hover:-translate-y-1 hover:border-primary/40">
              <span className="flex size-11 items-center justify-center rounded-xl bg-primary-soft text-primary-ink transition group-hover:bg-primary group-hover:text-on-primary">
                <f.icon className="size-5" />
              </span>
              <h3 className="mt-4 font-bold">{f.title}</h3>
              <p className="mt-1.5 text-sm leading-relaxed text-muted">{f.body}</p>
            </motion.div>
          ))}
        </div>
      </section>

      {/* ---------- How it works ---------- */}
      <section id="how" className="scroll-mt-6 border-y border-line bg-card">
        <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
          <motion.h2 {...reveal} className="text-3xl font-bold sm:text-4xl">
            {tr("من المخزن للمحل، بأربع خطوات", "From warehouse to shop, in four steps")}
          </motion.h2>
          <ol className="mt-10 grid gap-6 md:grid-cols-4">
            {steps.map((s, i) => (
              <motion.li key={s.title} {...reveal} transition={{ ...reveal.transition, delay: i * 0.08 }} className="relative">
                <div className="flex items-center gap-3">
                  <span className="num flex size-10 items-center justify-center rounded-full bg-action text-base font-bold text-on-action">{i + 1}</span>
                  {i < steps.length - 1 && <span className="hidden h-px flex-1 bg-line-strong md:block" aria-hidden />}
                </div>
                <s.icon className="mt-5 size-6 text-primary-ink" />
                <h3 className="mt-2 text-lg font-bold">{s.title}</h3>
                <p className="mt-1 text-sm text-muted">{s.body}</p>
              </motion.li>
            ))}
          </ol>
        </div>
      </section>

      {/* ---------- Roles ---------- */}
      <section className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
        <motion.div {...reveal} className="max-w-2xl">
          <h2 className="text-3xl font-bold sm:text-4xl">{tr("كل واحد يشوف شغله بس", "Everyone sees only their part")}</h2>
          <p className="mt-3 text-muted">{tr("المندوب ما يشوف سعر الشراء، وأمين المخزن ما يشوف ديون الزبائن، والمدير يشوف منو عدّل شنو ومتى.", "Reps never see cost, the warehouse never sees debts, and the manager sees who changed what and when.")}</p>
        </motion.div>
        <div className="mt-10 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          {roles(tr).map((r, i) => (
            <motion.div key={r.title} {...reveal} transition={{ ...reveal.transition, delay: i * 0.05 }} className="rounded-2xl border border-line bg-card p-5">
              <r.icon className="size-6 text-primary-ink" />
              <h3 className="mt-3 font-bold">{r.title}</h3>
              <p className="mt-1 text-sm text-muted">{r.body}</p>
            </motion.div>
          ))}
        </div>
        <motion.div {...reveal} className="mt-6 flex items-center gap-3 rounded-2xl border border-line bg-card-2 p-4 text-sm text-muted">
          <History className="size-5 shrink-0 text-primary-ink" />
          {tr("كل تعديل، إلغاء أو تحويل ينسجل باسم صاحبه ووقته. السجل ما ينعدل وما ينمسح.", "Every edit, cancel or transfer is logged with a name and time. The log can't be edited or deleted.")}
        </motion.div>
      </section>

      {/* ---------- Call to action + contact ---------- */}
      <section id="contact" className="scroll-mt-6 px-4 pb-20 sm:px-6">
        <motion.div {...reveal} className="brand-panel relative mx-auto max-w-6xl overflow-hidden rounded-3xl p-8 sm:p-12">
          <div className="brand-grid absolute inset-0" aria-hidden />
          <div className="relative grid gap-8 lg:grid-cols-[1.4fr_1fr] lg:items-center">
            <div>
              <h2 className="text-3xl font-bold sm:text-4xl">{tr("صاحب محل؟ اطلب بضاعتك بنفسك", "A shop owner? Order by yourself")}</h2>
              <p className="mt-3 opacity-85">{tr("ادخل بحسابك، شوف أسعارك الخاصة، اطلب، وتابع كشف حسابك بأي وقت. الطلب يوصل للشركة ولمندوبك.", "Log in, see your own prices, order, and follow your statement any time. The order reaches the company and your rep.")}</p>
              <Link href={enter} className="mt-6 inline-flex h-12 items-center gap-2 rounded-xl bg-action px-6 font-bold text-on-action transition hover:bg-action-hover">
                {enterLabel} <Forward className="size-5" />
              </Link>
            </div>
            <ul className="space-y-3 text-sm">
              <li className="flex items-center gap-3 rounded-xl bg-white/10 p-3">
                <MapPin className="size-5 shrink-0" /> {tr("كربلاء - المنطقة الصناعية (المخزن الرئيسي)", "Karbala - industrial area (main warehouse)")}
              </li>
              <li className="flex items-center gap-3 rounded-xl bg-white/10 p-3">
                <Warehouse className="size-5 shrink-0" /> {tr("كربلاء - الحر (المخزن الثاني)", "Karbala - Al-Hur (second warehouse)")}
              </li>
              <li className="flex items-center gap-3 rounded-xl bg-white/10 p-3">
                <Phone className="size-5 shrink-0" /> <span dir="ltr" className="num">0780 100 0001</span>
              </li>
            </ul>
          </div>
        </motion.div>
      </section>

      <footer className="border-t border-line">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-6 text-sm text-muted sm:px-6">
          <span className="flex items-center gap-2">
            <LogoMark size={24} /> {tr("© 2026 شركة النهرين للمواد الغذائية بالجملة", "© 2026 Al-Nahrain Wholesale Foods")}
          </span>
          <Link href={enter} className="font-medium text-primary-ink hover:underline">
            {enterLabel}
          </Link>
        </div>
      </footer>
    </div>
  );
}

/** The hero picture: three floating cards that show what the system does. */
function HeroPicture() {
  const { tr } = useFmt();
  return (
    <motion.div initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.7, delay: 0.15 }} className="relative mx-auto h-[380px] w-full max-w-md" aria-hidden>
      {/* Order card */}
      <div className="float absolute inset-x-6 top-0 rounded-2xl border border-white/10 bg-white p-4 text-[#17201b] shadow-2xl">
        <div className="flex items-center justify-between">
          <span className="text-sm font-bold">{tr("طلب جديد", "New order")}</span>
          <span className="rounded-full bg-[#e2f1ea] px-2 py-0.5 text-[11px] font-semibold text-[#0a573d]">{tr("الكمية محجوزة", "Stock held")}</span>
        </div>
        <p className="mt-1 text-xs text-[#56625b]">{tr("أسواق الكوثر · جملة كبيرة", "Al-Kawthar · big wholesale")}</p>
        {[
          [tr("رز بسمتي 5 كغم", "Basmati rice 5 kg"), "3", "132,750"],
          [tr("زيت دوار الشمس", "Sunflower oil"), "2", "52,000"],
          [tr("معجون طماطم", "Tomato paste"), "4", "92,000"],
        ].map(([n, q, p]) => (
          <div key={n} className="mt-2 flex items-center justify-between border-t border-[#efede6] pt-2 text-sm">
            <span>{n}</span>
            <span className="num text-[#56625b]">
              {q} × · <b className="text-[#17201b]">{p}</b>
            </span>
          </div>
        ))}
        <div className="mt-3 flex h-10 items-center justify-center rounded-xl bg-[#f28c38] text-sm font-bold text-[#2b1404]">{tr("إرسال الطلب", "Send order")}</div>
      </div>

      {/* Debt card */}
      <div className="float-slow absolute -start-2 bottom-6 w-56 rounded-2xl border border-white/10 bg-white p-4 text-[#17201b] shadow-2xl sm:-start-8">
        <p className="text-xs text-[#56625b]">{tr("الدين / السقف", "Debt / limit")}</p>
        <p className="num mt-1 text-lg font-bold">
          3,200,000 <span className="text-xs font-normal text-[#8a938d]">/ 5,000,000</span>
        </p>
        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-[#e5e2d8]">
          <div className="h-full w-[64%] rounded-full bg-[#2f6b10]" />
        </div>
      </div>

      {/* Expiry alert */}
      <div className="float absolute -end-2 bottom-0 w-60 rounded-2xl border border-white/10 bg-white p-3 text-[#17201b] shadow-2xl [animation-delay:1.5s] sm:-end-6">
        <div className="flex items-start gap-2">
          <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-[#fbedd9] text-[#8a4b06]">
            <AlertTriangle className="size-4" />
          </span>
          <div>
            <p className="text-sm font-bold">{tr("قريب الانتهاء", "Expiring soon")}</p>
            <p className="text-xs text-[#56625b]">{tr("جبن مثلثات · باقي 12 يوم", "Cheese · 12 days left")}</p>
          </div>
        </div>
        <p className="mt-2 flex items-center gap-1 text-[11px] text-[#2f6b10]">
          <CheckCircle2 className="size-3" /> {tr("يطلع أول بالبيع", "Sold first")}
        </p>
      </div>
    </motion.div>
  );
}
