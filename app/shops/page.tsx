"use client";

// "لأصحاب المحلات": the page that convinces a shop owner to order from Al-Nahrain's website.
// Same dark, moving style as the main landing page. It talks to the shop owner about HIS day:
// what he struggles with now, what changes, why it is safe, how to start, and his questions.
import Link from "next/link";
import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import {
  ArrowLeft,
  ArrowRight,
  BadgePercent,
  Camera,
  Check,
  ChevronDown,
  Clock,
  CreditCard,
  FileText,
  Headset,
  KeyRound,
  MapPin,
  NotebookPen,
  PhoneOff,
  Printer,
  RotateCcw,
  ShieldCheck,
  ShoppingBag,
  Store,
  Tag,
  Truck,
  UserPlus,
  Wallet,
  X,
} from "lucide-react";
import { Eyebrow, Stars, WordReveal, rise } from "@/components/landing/shared";
import { LogoMark } from "@/components/logo";
import { FAQ } from "@/components/support/faq";
import { LanguageSwitch } from "@/components/switches";
import { homeOf, useSession } from "@/lib/auth";
import { useFmt } from "@/lib/i18n";
import { cn } from "@/lib/utils";

export default function ShopsPage() {
  const { tr, lang } = useFmt();
  const session = useSession();
  const Forward = lang === "ar" ? ArrowLeft : ArrowRight;
  const signedIn = !!session;
  const cta = signedIn ? homeOf(session.user.role, session.user.rep_kinds) : "/register";
  const ctaLabel = signedIn ? tr("ادخل إلى حسابك", "Go to my account") : tr("سجّل محلك مجاناً", "Register your shop for free");

  // Dark like the main landing page (the rest of the site keeps the user's day/night choice).
  useEffect(() => {
    const prev = document.body.style.background;
    document.body.style.background = "#0b0c0e";
    return () => {
      document.body.style.background = prev;
    };
  }, []);

  return (
    <div className="dark min-h-dvh bg-[#0b0c0e] text-text">
      {/* Top bar */}
      <header className="fixed inset-x-0 top-0 z-40 px-3 pt-3">
        <nav className="mx-auto flex max-w-6xl items-center justify-between gap-3 rounded-full border border-white/10 bg-[#0b0c0e]/70 px-3 py-2 shadow-lg backdrop-blur-xl sm:px-4">
          <Link href="/" className="flex items-center gap-2">
            <LogoMark size={34} />
            <span className="text-base font-bold">{tr("النهرين", "Al-Nahrain")}</span>
          </Link>
          <div className="hidden items-center gap-6 text-sm text-muted md:flex">
            <a href="#why" className="transition hover:text-text">
              {tr("لماذا النهرين", "Why us")}
            </a>
            <a href="#safe" className="transition hover:text-text">
              {tr("أمان طلبك", "Safe orders")}
            </a>
            <a href="#start" className="transition hover:text-text">
              {tr("كيف تبدأ", "How to start")}
            </a>
            <a href="#faq" className="transition hover:text-text">
              {tr("أسئلة", "Questions")}
            </a>
          </div>
          <div className="flex items-center gap-2">
            <LanguageSwitch onBrand />
            <Link href={cta} className="flex h-10 items-center rounded-full bg-action px-4 text-sm font-bold text-on-action transition hover:bg-action-hover">
              {signedIn ? tr("حسابي", "My account") : tr("سجّل محلك", "Register")}
            </Link>
          </div>
        </nav>
      </header>

      <main>
        <Hero cta={cta} ctaLabel={ctaLabel} Forward={Forward} />
        <BeforeAfter />
        <Benefits />
        <Safe />
        <Steps cta={cta} ctaLabel={ctaLabel} />
        <Questions />

        {/* Last call */}
        <section className="px-4 pb-16 pt-6">
          <motion.div {...rise()} className="relative mx-auto max-w-6xl overflow-hidden rounded-[36px] border border-white/10 bg-[radial-gradient(80%_120%_at_50%_0%,rgb(225_105_43/0.28),transparent_60%),linear-gradient(180deg,#16191e,#0b0c0e)] px-6 py-16 text-center sm:px-12">
            <div className="hero-beam pointer-events-none absolute -top-1/2 left-[30%] h-[200%] w-[40%]" aria-hidden />
            <Stars count={30} seed={21} />
            <div className="relative">
              <WordReveal text={tr("محلك يستحق مورّداً يعمل على جوالك", "Your shop deserves a supplier on your phone")} className="text-3xl font-bold sm:text-5xl" />
              <p className="mx-auto mt-4 max-w-xl text-muted">
                {tr("التسجيل مجاني ويأخذ دقيقتين. تراجع الشركة محلك، وتحدد أسعارك وسقف دينك، ثم تطلب متى شئت.", "Signing up is free and takes two minutes. The company reviews your shop, sets your prices and debt limit, then you order whenever you like.")}
              </p>
              <Link href={cta} className="mt-8 inline-flex h-12 items-center gap-2 rounded-full bg-action px-8 font-bold text-on-action shadow-[0_0_40px_rgb(225_105_43/0.45)] transition hover:bg-action-hover">
                {signedIn ? <Forward className="size-5" /> : <UserPlus className="size-5" />} {ctaLabel}
              </Link>
            </div>
          </motion.div>
        </section>
      </main>

      <footer className="border-t border-white/5">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-6 text-sm text-muted">
          <span className="flex items-center gap-2">
            <LogoMark size={24} /> {tr("© 2026 شركة النهرين للمواد الغذائية بالجملة", "© 2026 Al-Nahrain Wholesale Foods")}
          </span>
          <Link href="/" className="font-medium text-primary-ink hover:underline">
            {tr("الصفحة الرئيسية", "Home page")}
          </Link>
        </div>
      </footer>
    </div>
  );
}

// ---------- 1) Hero: the promise, and the store on a phone ----------

function Hero({ cta, ctaLabel, Forward }: { cta: string; ctaLabel: string; Forward: typeof ArrowLeft }) {
  const { tr } = useFmt();
  return (
    <section className="relative overflow-hidden px-4 pb-16 pt-32 sm:pt-36">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(60%_50%_at_70%_20%,rgb(225_105_43/0.22),transparent_70%)]" aria-hidden />
      <Stars count={50} seed={5} />
      <div className="relative mx-auto grid max-w-6xl items-center gap-12 lg:grid-cols-[1.1fr_0.9fr]">
        <div>
          <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
            <Eyebrow>{tr("لأصحاب المحلات والماركتات في كربلاء", "For shop and market owners in Karbala")}</Eyebrow>
          </motion.div>
          <WordReveal as="h1" onLoad text={tr("اطلب بضاعة محلك من جوالك، بأسعار الجملة", "Order your shop's goods from your phone, at wholesale prices")} className="mt-5 text-4xl font-bold leading-tight sm:text-6xl" />
          <motion.p initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.5 }} className="mt-5 max-w-xl text-lg text-muted">
            {tr(
              "لا اتصالات لا تنتهي، ولا دفاتر، ولا انتظار المندوب. ترى أسعارك ودينك وطلباتك في مكان واحد، ويصلك طلبك برمز استلام لا يعرفه غيرك.",
              "No endless calls, no notebooks, no waiting for the rep. See your prices, your debt and your orders in one place, and get your order with a delivery code only you know.",
            )}
          </motion.p>
          <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.7 }} className="mt-8 flex flex-wrap gap-3">
            <Link href={cta} className="group flex h-12 items-center gap-2 rounded-full bg-action px-7 text-base font-bold text-on-action shadow-[0_0_40px_rgb(225_105_43/0.45)] transition hover:bg-action-hover">
              {ctaLabel} <Forward className="size-5 transition group-hover:-translate-x-1 rtl:group-hover:translate-x-1" />
            </Link>
            <a href="#why" className="flex h-12 items-center rounded-full border border-white/15 bg-white/5 px-7 text-base font-semibold backdrop-blur transition hover:bg-white/10">
              {tr("لماذا النهرين؟", "Why Al-Nahrain?")}
            </a>
          </motion.div>
          <motion.ul initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.9 }} className="mt-8 flex flex-wrap gap-x-5 gap-y-2 text-sm text-muted">
            {[tr("التسجيل مجاني", "Free to sign up"), tr("بدون رسوم اشتراك", "No subscription fee"), tr("أسعار جملة حسب نوع محلك", "Wholesale prices for your shop type")].map((t) => (
              <li key={t} className="flex items-center gap-1.5">
                <Check className="size-4 text-success" /> {t}
              </li>
            ))}
          </motion.ul>
        </div>
        <PhoneMock />
      </div>
    </section>
  );
}

/** A drawn phone showing the shop owner's store: credit left, products, the bag, the PIN on the way. */
function PhoneMock() {
  const { tr } = useFmt();
  const products = [
    { n: tr("رز بسمتي 5 كغم", "Basmati rice 5 kg"), p: "42,750", c: "#e1692b" },
    { n: tr("سكر 2 كغم", "Sugar 2 kg"), p: "20,250", c: "#c99a2e" },
    { n: tr("زيت دوار الشمس", "Sunflower oil"), p: "26,000", c: "#4f8a5b" },
    { n: tr("معجون طماطم", "Tomato paste"), p: "24,000", c: "#b4533c" },
  ];
  return (
    <motion.div initial={{ opacity: 0, y: 40, rotate: -4 }} animate={{ opacity: 1, y: 0, rotate: -2 }} transition={{ delay: 0.3, duration: 0.8, ease: [0.22, 1, 0.36, 1] }} className="relative mx-auto w-full max-w-[320px]">
      <div className="absolute -inset-8 rounded-[60px] bg-action/20 blur-3xl" aria-hidden />
      <div className="relative rounded-[42px] border border-white/15 bg-[#121418] p-3 shadow-2xl">
        <div className="mx-auto mb-2 h-1.5 w-20 rounded-full bg-white/15" />
        <div className="space-y-3 rounded-[32px] bg-[#16191e] p-4">
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted">{tr("أهلاً بك", "Welcome")}</span>
            <ShoppingBag className="size-4 text-action" />
          </div>
          <div className="rounded-2xl bg-[linear-gradient(135deg,#2a2f37,#16191e)] p-3">
            <p className="text-[10px] text-muted">{tr("المتاح لك للطلب", "Available to order")}</p>
            <p className="num text-xl font-bold">3,750,000 {tr("د.ع", "IQD")}</p>
            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/10">
              <div className="h-full w-[38%] rounded-full bg-action" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            {products.map((x, i) => (
              <motion.div key={x.n} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.8 + i * 0.1 }} className="rounded-2xl bg-[#1c2026] p-2">
                <div className="mb-1.5 h-12 rounded-xl" style={{ background: `color-mix(in oklab, ${x.c} 30%, #1c2026)` }} />
                <p className="truncate text-[10px] font-semibold">{x.n}</p>
                <p className="num text-[10px] text-action">{x.p}</p>
              </motion.div>
            ))}
          </div>
          <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 1.3 }} className="rounded-2xl border border-action/40 bg-action/10 p-3">
            <p className="flex items-center gap-1 text-[10px] font-semibold text-action">
              <KeyRound className="size-3" /> {tr("طلبك في الطريق · رمز الاستلام", "On the way · delivery code")}
            </p>
            <p className="num mt-1 text-2xl font-bold tracking-[0.3em]" dir="ltr">
              7788
            </p>
          </motion.div>
        </div>
      </div>
    </motion.div>
  );
}

// ---------- 2) Before / with Al-Nahrain ----------

function BeforeAfter() {
  const { tr } = useFmt();
  const rows: { before: string; after: string; icon: typeof PhoneOff }[] = [
    { icon: PhoneOff, before: tr("تتصل وتعيد الاتصال لتعرف السعر والكمية", "You call again and again for prices and stock"), after: tr("ترى أسعارك والمتوفر الآن على جوالك", "See your prices and what's in stock, on your phone") },
    { icon: NotebookPen, before: tr("دينك مكتوب في دفتر لا تراه", "Your debt is in a notebook you never see"), after: tr("كشف حسابك وفواتيرك أمامك في أي وقت", "Your statement and invoices, any time") },
    { icon: Clock, before: tr("تنتظر مرور المندوب لتطلب", "You wait for the rep to pass by"), after: tr("تطلب ليلاً أو نهاراً، والطلب يصل الشركة فوراً", "Order day or night; it reaches the company at once") },
    { icon: Truck, before: tr("لا تعرف أين طلبك ومتى يصل", "You don't know where your order is"), after: tr("تتابعه: معتمد، جاهز، في الطريق، سُلِّم", "Follow it: approved, ready, on the way, delivered") },
  ];
  return (
    <section className="px-4 py-16">
      <div className="mx-auto max-w-6xl">
        <div className="text-center">
          <Eyebrow>{tr("يومك قبل وبعد", "Your day, before and after")}</Eyebrow>
          <WordReveal text={tr("نعرف كيف يمر يومك… وهذا ما يتغيّر", "We know your day… here's what changes")} className="mt-4 text-3xl font-bold sm:text-4xl" />
        </div>
        <div className="mt-10 space-y-3">
          {rows.map((r, i) => (
            <motion.div key={r.before} {...rise(i * 0.08)} className="grid items-stretch gap-3 md:grid-cols-[1fr_auto_1fr]">
              <div className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.03] p-4 text-muted">
                <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-danger/15 text-danger">
                  <X className="size-5" />
                </span>
                <span className="flex items-center gap-2">
                  <r.icon className="size-4 shrink-0 opacity-60" /> {r.before}
                </span>
              </div>
              <div className="hidden items-center justify-center md:flex">
                <ArrowLeft className="size-5 text-action rtl:rotate-0 ltr:rotate-180" />
              </div>
              <div className="flex items-center gap-3 rounded-2xl border border-action/30 bg-action/10 p-4 font-semibold">
                <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-success/20 text-success">
                  <Check className="size-5" />
                </span>
                {r.after}
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ---------- 3) What he gets ----------

function Benefits() {
  const { tr } = useFmt();
  const items: { icon: typeof Tag; t: string; b: string }[] = [
    { icon: Tag, t: tr("أسعار جملة لنوع محلك", "Wholesale prices for your shop"), b: tr("جملة كبير أو جملة أو تجزئة، وقد تحصل على سعر خاص لمواد تشتريها كثيراً.", "Big wholesale, wholesale or retail, and maybe a special price on items you buy a lot.") },
    { icon: ShoppingBag, t: tr("متجر سهل مثل التطبيقات", "A store as easy as an app"), b: tr("ابحث، اختر الكارتون أو القطعة، أضف إلى السلة، وأرسل. وتعدّل طلبك قبل اعتماده.", "Search, choose carton or piece, add to the bag, send. Change it before it's approved.") },
    { icon: Wallet, t: tr("دينك واضح دائماً", "Your debt, always clear"), b: tr("كم عليك، وكم يتبقى لك قبل السقف، وكل فاتورة وكل تسديد بالتاريخ.", "What you owe, how much is left before your limit, every invoice and payment by date.") },
    { icon: CreditCard, t: tr("ادفع كما تحب", "Pay your way"), b: tr("نقداً أو تحويلاً لمندوبك، أو أونلاين ببطاقة Qi من كشف حسابك.", "Cash or transfer to your rep, or online with your Qi card from your statement.") },
    { icon: Printer, t: tr("فواتير تطبعها", "Invoices you can print"), b: tr("كل فاتورة على جوالك، تطبعها أو ترسلها بضغطة.", "Every invoice on your phone, ready to print or share.") },
    { icon: Headset, t: tr("دعم مباشر", "Live support"), b: tr("محادثة مع موظفي الشركة من داخل الموقع، وأجوبة فورية للأسئلة الشائعة.", "Chat with the company's staff inside the site, and instant answers to common questions.") },
    { icon: Store, t: tr("أكثر من محل؟ حساب واحد", "More than one shop? One account"), b: tr("أضف محلاتك وتنقّل بينها، ولكل محل سلته وأسعاره ودينه.", "Add your shops and switch between them; each has its own bag, prices and debt.") },
    { icon: BadgePercent, t: tr("خصومات من مندوبك", "Discounts from your rep"), b: tr("يعطيك مندوبك خصماً على طلبك، ويظهر واضحاً في الفاتورة.", "Your rep can give you a discount, shown clearly on the invoice.") },
  ];
  return (
    <section id="why" className="scroll-mt-24 px-4 py-16">
      <div className="mx-auto max-w-6xl">
        <div className="text-center">
          <Eyebrow>{tr("ماذا تحصل", "What you get")}</Eyebrow>
          <WordReveal text={tr("كل ما يحتاجه محلك من مورّده، في مكان واحد", "Everything your shop needs from its supplier, in one place")} className="mt-4 text-3xl font-bold sm:text-4xl" />
        </div>
        <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {items.map((x, i) => (
            <motion.div key={x.t} {...rise(i * 0.05)} whileHover={{ y: -4 }} className="rounded-3xl border border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.05),rgba(255,255,255,0.01))] p-5">
              <span className="flex size-11 items-center justify-center rounded-2xl bg-action/15 text-action">
                <x.icon className="size-5" />
              </span>
              <h3 className="mt-4 font-bold">{x.t}</h3>
              <p className="mt-1.5 text-sm leading-6 text-muted">{x.b}</p>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ---------- 4) Why his order is safe ----------

function Safe() {
  const { tr } = useFmt();
  const points: { icon: typeof KeyRound; t: string; b: string }[] = [
    { icon: KeyRound, t: tr("رمز استلام لا يعرفه غيرك", "A delivery code only you know"), b: tr("لا يُسجَّل التسليم إلا بعد أن تتأكد من بضاعتك وتعطي الرمز للمندوب بنفسك.", "Delivery counts only after you check your goods and give the code yourself.") },
    { icon: Camera, t: tr("صورة لشحنتك عند الباب", "A photo of your packages at the door"), b: tr("يصوّر المندوب الشحنة عند محلك، فتبقى الصورة دليلاً على حالتها.", "The rep photographs the packages at your shop: proof of how they arrived.") },
    { icon: FileText, t: tr("الفاتورة على ما استلمته فقط", "The invoice is for what you took"), b: tr("استلمت جزءاً؟ تُكتب الفاتورة بما استلمته، والباقي يبقى طلباً أو يُلغى كما تريد.", "Took only part? The invoice is for that; the rest stays open or is cancelled, your choice.") },
    { icon: RotateCcw, t: tr("خطأ؟ مالك يعود إليك", "A mistake? Your money comes back"), b: tr("سعر خاطئ أو بضاعة تالفة: تُعوَّض في الفاتورة، ويُعاد لك رصيدك نقداً أو إلى بطاقتك.", "A wrong price or spoiled goods: it's credited, and your balance is refunded in cash or to your card.") },
  ];
  return (
    <section id="safe" className="scroll-mt-24 px-4 py-16">
      <div className="relative mx-auto max-w-6xl overflow-hidden rounded-[36px] border border-white/10 bg-[#111317] p-6 sm:p-10">
        <div className="pointer-events-none absolute -end-20 -top-20 size-72 rounded-full bg-success/10 blur-3xl" aria-hidden />
        <div className="relative grid gap-8 lg:grid-cols-[0.8fr_1.2fr] lg:items-center">
          <div>
            <span className="flex size-14 items-center justify-center rounded-2xl bg-success/15 text-success">
              <ShieldCheck className="size-7" />
            </span>
            <WordReveal text={tr("بضاعتك ومالك في أمان", "Your goods and your money are safe")} className="mt-5 text-3xl font-bold sm:text-4xl" />
            <p className="mt-3 text-muted">{tr("بنينا الموقع لكي لا يُسجَّل عليك شيء لم تستلمه، ولا تخسر ديناراً بسبب خطأ.", "We built it so nothing is charged that you didn't receive, and no mistake costs you a dinar.")}</p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {points.map((p, i) => (
              <motion.div key={p.t} {...rise(i * 0.08)} className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                <p.icon className="size-5 text-success" />
                <h3 className="mt-3 font-bold">{p.t}</h3>
                <p className="mt-1 text-sm leading-6 text-muted">{p.b}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

// ---------- 5) How to start ----------

function Steps({ cta, ctaLabel }: { cta: string; ctaLabel: string }) {
  const { tr, num } = useFmt();
  const steps = [
    { icon: UserPlus, t: tr("سجّل محلك", "Register your shop"), b: tr("الاسم والهاتف وعنوان المحل على الخريطة. دقيقتان فقط.", "Name, phone and your shop's address on the map. Two minutes.") },
    { icon: ShieldCheck, t: tr("نراجع ونوافق", "We review and approve"), b: tr("تحدد الشركة نوع أسعارك وسقف دينك ومندوبك، ويصلك إشعار بالموافقة.", "The company sets your prices, debt limit and rep; you get a notice when approved.") },
    { icon: Truck, t: tr("اطلب ويصلك", "Order and receive"), b: tr("اطلب من جوالك متى شئت، وتابع طلبك حتى يصل إلى باب محلك.", "Order from your phone any time and follow it to your shop's door.") },
  ];
  return (
    <section id="start" className="scroll-mt-24 px-4 py-16">
      <div className="mx-auto max-w-6xl">
        <div className="text-center">
          <Eyebrow>{tr("كيف تبدأ", "How to start")}</Eyebrow>
          <WordReveal text={tr("ثلاث خطوات وتطلب أول طلب", "Three steps to your first order")} className="mt-4 text-3xl font-bold sm:text-4xl" />
        </div>
        <div className="relative mt-12 grid gap-6 md:grid-cols-3">
          <div className="absolute inset-x-[16%] top-7 hidden h-px bg-[linear-gradient(90deg,transparent,rgb(225_105_43/0.6),transparent)] md:block" aria-hidden />
          {steps.map((s, i) => (
            <motion.div key={s.t} {...rise(i * 0.12)} className="relative text-center">
              <span className="relative mx-auto flex size-14 items-center justify-center rounded-full bg-action text-on-action shadow-[0_0_30px_rgb(225_105_43/0.45)]">
                <s.icon className="size-6" />
                <span className="num absolute -end-1 -top-1 flex size-6 items-center justify-center rounded-full bg-white text-xs font-bold text-[#0b0c0e]">{num(i + 1)}</span>
              </span>
              <h3 className="mt-4 text-lg font-bold">{s.t}</h3>
              <p className="mx-auto mt-1 max-w-xs text-sm leading-6 text-muted">{s.b}</p>
            </motion.div>
          ))}
        </div>
        <div className="mt-10 flex flex-wrap items-center justify-center gap-3">
          <Link href={cta} className="inline-flex h-12 items-center gap-2 rounded-full bg-action px-7 font-bold text-on-action transition hover:bg-action-hover">
            <UserPlus className="size-5" /> {ctaLabel}
          </Link>
          <span className="flex items-center gap-1.5 text-sm text-muted">
            <MapPin className="size-4 text-primary-ink" /> {tr("نوصل إلى محلات كربلاء من مخزنَي الصناعة والحر", "We deliver across Karbala from Al-Sinaa and Al-Hur")}
          </span>
        </div>
      </div>
    </section>
  );
}

// ---------- 6) Questions (the same answers as the support window) ----------

function Questions() {
  const { tr, lang } = useFmt();
  const [open, setOpen] = useState<number | null>(0);
  const i = lang === "ar" ? 0 : 1;
  return (
    <section id="faq" className="scroll-mt-24 px-4 py-16">
      <div className="mx-auto max-w-3xl">
        <div className="text-center">
          <Eyebrow>{tr("أسئلة أصحاب المحلات", "Shop owners ask")}</Eyebrow>
          <WordReveal text={tr("أسئلة تسمعها منا كثيراً", "Questions we hear a lot")} className="mt-4 text-3xl font-bold sm:text-4xl" />
        </div>
        <ul className="mt-8 space-y-2">
          {FAQ.map((f, n) => {
            const on = open === n;
            return (
              <motion.li key={n} {...rise(n * 0.04)} className="overflow-hidden rounded-2xl border border-white/10 bg-white/[0.03]">
                <button type="button" onClick={() => setOpen(on ? null : n)} aria-expanded={on} className="flex w-full items-center justify-between gap-3 px-4 py-3.5 text-start font-semibold">
                  {f.q[i]}
                  <ChevronDown className={cn("size-5 shrink-0 text-muted transition", on && "rotate-180")} />
                </button>
                <AnimatePresence initial={false}>
                  {on && (
                    <motion.p initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="px-4 pb-4 text-sm leading-7 text-muted">
                      {f.a[i]}
                    </motion.p>
                  )}
                </AnimatePresence>
              </motion.li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}
