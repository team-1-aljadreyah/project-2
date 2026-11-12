"use client";

// The shop owners' landing page (/client), opened from the main site in a new tab. Its job: convince a
// shop owner in Karbala to order from his phone. It talks about HIS day: what tires him now, what changes,
// how much time he gets back, why his money and goods are safe, how to start, and his questions.
// Colorful and moving on purpose; made for a phone first (one column, buttons at the thumb).
import { useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import {
  ArrowLeft,
  ArrowRight,
  BadgePercent,
  BellRing,
  Camera,
  Check,
  Clock,
  CreditCard,
  FileText,
  Headset,
  KeyRound,
  MapPinned,
  NotebookPen,
  PhoneOff,
  Printer,
  ReceiptText,
  ShieldCheck,
  ShoppingBag,
  Sparkles,
  Tag,
  Truck,
  UserPlus,
  Wallet,
  X,
} from "lucide-react";
import { useFmt } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { AppFooter, AppHeader, BigButton, Blobs, CountUp, GradientText, InstallCard, Marquee, PhoneDemo, Questions, SectionHead, StickyActions, useAppEntry } from "./kit";

// The page's colors: orange (the brand), pink, amber, green, violet, sky.
const C = { orange: "#ff7a3d", pink: "#ff4f8b", amber: "#ffc23d", green: "#34d399", violet: "#a78bfa", sky: "#38bdf8" };

export function ClientLanding() {
  const { tr, lang } = useFmt();
  const { session, mine, home } = useAppEntry("client");
  const Forward = lang === "ar" ? ArrowLeft : ArrowRight;
  const main = mine ? { href: home, label: tr("افتح التطبيق", "Open the app") } : session ? { href: home, label: tr("حسابي", "My account") } : { href: "/register", label: tr("سجّل محلك مجاناً", "Register free") };

  return (
    <div className="dark min-h-dvh bg-[#08090b] pb-28 text-white lg:pb-0">
      <AppHeader
        app="client"
        links={[
          { href: "#why", label: tr("لماذا", "Why") },
          { href: "#save", label: tr("وفّر وقتك", "Save time") },
          { href: "#safe", label: tr("أمان طلبك", "Safety") },
          { href: "#faq", label: tr("أسئلة", "Questions") },
        ]}
        cta={main}
      />

      <main>
        {/* ---------- 1) Hero ---------- */}
        <section className="relative overflow-hidden px-4 pb-14 pt-28 sm:pt-32">
          <Blobs colors={[C.orange, C.pink, C.amber, C.violet]} />
          <div className="brand-grid absolute inset-0 opacity-30" aria-hidden />
          <div className="relative mx-auto grid max-w-6xl items-center gap-12 lg:grid-cols-[1.1fr_0.9fr]">
            <div className="text-center lg:text-start">
              <motion.span initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3 py-1 text-xs font-semibold backdrop-blur">
                <Sparkles className="size-3.5 text-amber-300" /> {tr("لأصحاب المحلات والماركتات في كربلاء", "For shop and market owners in Karbala")}
              </motion.span>
              <motion.h1 initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.08, duration: 0.7 }} className="mt-5 text-4xl font-bold leading-[1.15] sm:text-6xl">
                {tr("بضاعة محلك كلها", "All your shop's goods")}
                <br />
                <GradientText from={C.amber} via={C.orange} to={C.pink}>
                  {tr("بضغطة من جوالك", "in one tap on your phone")}
                </GradientText>
              </motion.h1>
              <motion.p initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }} className="mx-auto mt-5 max-w-xl text-lg leading-8 text-white/75 lg:mx-0">
                {tr(
                  "بلا اتصالات لا تنتهي ولا دفاتر ولا انتظار للمندوب. أسعار الجملة الخاصة بمحلك، وطلبك يصل إلى بابك وتتابعه على الخريطة، وكشف حسابك في جيبك.",
                  "No endless calls, no notebooks, no waiting for the rep. Your shop's own wholesale prices, your order to your door followed on the map, and your statement in your pocket.",
                )}
              </motion.p>
              <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.32 }} className="mt-8 hidden flex-wrap justify-center gap-3 sm:flex lg:justify-start">
                <BigButton href={main.href} color={C.orange}>
                  {!session && <UserPlus className="size-5" />} {main.label} {session && <Forward className="size-5" />}
                </BigButton>
                {!session && (
                  <BigButton href="/login" ghost>
                    {tr("عندي حساب", "I have an account")}
                  </BigButton>
                )}
              </motion.div>
              <motion.ul initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.45 }} className="mt-7 flex flex-wrap justify-center gap-2 text-sm lg:justify-start">
                {[
                  { t: tr("التسجيل مجاني", "Free to join"), c: C.green },
                  { t: tr("بلا رسوم اشتراك", "No fees"), c: C.amber },
                  { t: tr("أسعار حسب نوع محلك", "Prices for your shop"), c: C.sky },
                ].map((x) => (
                  <li key={x.t} className="flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.06] px-3 py-1.5">
                    <Check className="size-4" style={{ color: x.c }} /> {x.t}
                  </li>
                ))}
              </motion.ul>
            </div>
            <PhoneDemo glow={`linear-gradient(135deg, ${C.orange}, ${C.pink})`} screens={useScreens()} />
          </div>
        </section>

        <Marquee
          items={[
            { icon: Tag, t: tr("أسعار الجملة", "Wholesale prices"), c: C.orange },
            { icon: MapPinned, t: tr("تتبّع مباشر", "Live tracking"), c: C.sky },
            { icon: CreditCard, t: tr("دفع بكي كارد", "Pay with Qi Card"), c: C.amber },
            { icon: FileText, t: tr("كشف حساب واضح", "A clear statement"), c: C.green },
            { icon: PhoneOff, t: tr("بلا اتصالات", "No phone calls"), c: C.pink },
            { icon: Printer, t: tr("فواتير تُطبع", "Printable invoices"), c: C.violet },
            { icon: KeyRound, t: tr("استلام برمزك", "Hand-over with your PIN"), c: C.orange },
            { icon: Headset, t: tr("دعم مباشر", "Live support"), c: C.sky },
          ]}
        />

        {/* ---------- 2) Numbers ---------- */}
        <section className="px-4 py-10">
          <div className="mx-auto grid max-w-5xl grid-cols-2 gap-3 lg:grid-cols-4">
            {[
              { n: 24, s: "/7", t: tr("تطلب متى شئت، حتى بعد إغلاق المحل", "Order any time, even after closing"), c: C.orange },
              { n: 0, s: tr(" د.ع", " IQD"), t: tr("رسوم اشتراك أو تسجيل", "Fees to join or use it"), c: C.green },
              { n: 2, s: tr(" دقيقة", " min"), t: tr("يكفيان لتسجيل محلك", "Are enough to register"), c: C.amber },
              { n: 100, s: "%", t: tr("من فواتيرك مكتوبة وواضحة", "Of your invoices clear and written"), c: C.sky },
            ].map((x, i) => (
              <motion.div
                key={x.t}
                initial={{ opacity: 0, y: 24 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.08 }}
                className="rounded-3xl border border-white/10 p-5"
                style={{ background: `linear-gradient(160deg, ${x.c}26, transparent 70%)` }}
              >
                <p className="text-4xl font-bold" style={{ color: x.c }}>
                  <CountUp to={x.n} />
                  <span className="text-2xl">{x.s}</span>
                </p>
                <p className="mt-2 text-sm text-white/70">{x.t}</p>
              </motion.div>
            ))}
          </div>
        </section>

        <BeforeAfter />
        <Features />
        <SaveTime />
        <Safe />
        <Start mainHref={main.href} mainLabel={main.label} />

        <section id="faq" className="scroll-mt-24 px-4 py-16">
          <SectionHead eyebrow={tr("أسئلة أصحاب المحلات", "Shop owners ask")} title={tr("قبل أن تبدأ", "Before you start")} color={C.violet} />
          <Questions
            color={C.violet}
            items={[
              { q: tr("هل التسجيل مجاني فعلاً؟", "Is it really free?"), a: tr("نعم. لا رسوم تسجيل ولا اشتراك شهري، وتدفع فقط ثمن البضاعة التي تطلبها.", "Yes. No sign-up fee and no monthly fee: you pay only for the goods you order.") },
              { q: tr("كيف تُحدد أسعاري؟", "How are my prices set?"), a: tr("تراجع الشركة محلك وتضعه في نوع السعر المناسب (جملة، جملة كبيرة…)، وقد تكون لك أسعار خاصة ببعض المواد. ترى سعرك أنت فقط.", "The company checks your shop and gives it the right price tier, sometimes with special prices on some items. You see only your own price.") },
              { q: tr("هل أستطيع الشراء بالآجل؟", "Can I buy on credit?"), a: tr("نعم، ضمن سقف دين تحدده الشركة لمحلك. ترى دينك والمتاح لك قبل أن تطلب، وتسدد نقداً للمندوب أو ببطاقة كي كارد من جوالك.", "Yes, within a debt limit the company sets for your shop. You see your debt and what is left before you order, and pay cash to the rep or with Qi Card.") },
              { q: tr("ماذا لو وصلت البضاعة ناقصة أو تالفة؟", "What if goods arrive short or damaged?"), a: tr("لا تعطِ رمز الاستلام. يُسجَّل ما سُلِّم فقط وتُصدر الفاتورة عليه، والباقي يبقى طلباً مفتوحاً أو يُلغى كما تريد.", "Don't give your PIN. Only what was delivered is recorded and invoiced; the rest stays an open order or is cancelled as you wish.") },
              { q: tr("هل أحتاج إلى تحميل تطبيق من المتجر؟", "Do I need to download an app?"), a: tr("لا. يعمل من المتصفح، ويمكنك وضعه على شاشة جوالك بأيقونته كأي تطبيق.", "No. It works in the browser, and you can put it on your home screen with its own icon.") },
            ]}
          />
        </section>

        <section className="px-4 pb-10">
          <InstallCard app="client" color={C.orange} />
        </section>

        {/* ---------- Last call ---------- */}
        <section className="px-4 pb-16 pt-4">
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="relative mx-auto max-w-5xl overflow-hidden rounded-[36px] p-8 text-center sm:p-14"
            style={{ background: `linear-gradient(135deg, ${C.orange}, ${C.pink} 60%, ${C.violet})` }}
          >
            <Blobs colors={["#ffffff", C.amber]} className="opacity-40" />
            <div className="relative">
              <h2 className="text-3xl font-bold leading-tight sm:text-5xl">{tr("محلك يستحق مورّداً يعمل على جوالك", "Your shop deserves a supplier on your phone")}</h2>
              <p className="mx-auto mt-4 max-w-xl text-white/90">
                {tr("سجّل في دقيقتين. تراجع الشركة محلك وتحدد أسعارك وسقف دينك، ثم تطلب متى شئت.", "Sign up in two minutes. The company checks your shop and sets your prices and limit; then order whenever you like.")}
              </p>
              <div className="mt-8 flex flex-wrap justify-center gap-3">
                <BigButton href={main.href} color="#ffffff">
                  {!session && <UserPlus className="size-5" />} {main.label}
                </BigButton>
              </div>
            </div>
          </motion.div>
        </section>
      </main>

      <AppFooter other={{ href: "/driver", label: tr("تطبيق المندوبين", "The reps' app") }} />

      <StickyActions>
        <BigButton href={main.href} color={C.orange} className="flex-1">
          {!session && <UserPlus className="size-5" />} {main.label}
        </BigButton>
        {!session && (
          <BigButton href="/login" ghost className="px-4 text-sm">
            {tr("دخول", "Log in")}
          </BigButton>
        )}
      </StickyActions>
    </div>
  );
}

// ---------- the phone's screens ----------

function useScreens() {
  const { tr } = useFmt();
  const products = [
    { n: tr("رز بسمتي 5 كغم", "Basmati rice 5 kg"), p: "42,750", c: C.orange },
    { n: tr("سكر 2 كغم", "Sugar 2 kg"), p: "20,250", c: C.amber },
    { n: tr("زيت دوار الشمس", "Sunflower oil"), p: "26,000", c: C.green },
    { n: tr("معجون طماطم", "Tomato paste"), p: "24,000", c: C.pink },
  ];
  return [
    {
      key: "store",
      label: tr("المتجر: أسعارك والمتاح لك", "The store: your prices and your credit"),
      body: (
        <div className="space-y-3">
          <div className="rounded-2xl p-3" style={{ background: `linear-gradient(135deg, ${C.orange}, ${C.pink})` }}>
            <p className="text-[10px] opacity-85">{tr("المتاح لك للطلب", "Available to order")}</p>
            <p className="num text-xl font-bold">3,750,000 {tr("د.ع", "IQD")}</p>
            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/25">
              <motion.div initial={{ width: 0 }} animate={{ width: "62%" }} transition={{ duration: 1.2, delay: 0.2 }} className="h-full rounded-full bg-white" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            {products.map((x, i) => (
              <motion.div key={x.n} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 + i * 0.08 }} className="rounded-2xl bg-white/[0.06] p-2.5">
                <div className="mb-2 h-12 rounded-xl" style={{ background: `linear-gradient(135deg, ${x.c}, ${x.c}55)` }} />
                <p className="truncate text-[11px] font-semibold">{x.n}</p>
                <div className="mt-1 flex items-center justify-between">
                  <span className="num text-[11px] text-white/70">{x.p}</span>
                  <motion.span animate={i === 0 ? { scale: [1, 1.3, 1] } : undefined} transition={{ delay: 1, duration: 0.5 }} className="flex size-5 items-center justify-center rounded-full text-[13px] font-bold text-[#0b0c0e]" style={{ background: x.c }}>
                    +
                  </motion.span>
                </div>
              </motion.div>
            ))}
          </div>
          <motion.div initial={{ y: 40, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 1.1 }} className="flex items-center gap-2 rounded-2xl bg-white px-3 py-2.5 text-[#0b0c0e]">
            <ShoppingBag className="size-4" />
            <span className="flex-1 text-xs font-bold">{tr("السلة · 3 مواد", "Basket · 3 items")}</span>
            <span className="num text-xs font-bold">89,000</span>
          </motion.div>
        </div>
      ),
    },
    {
      key: "track",
      label: tr("تتبّع طلبك حتى باب محلك", "Follow your order to your door"),
      body: (
        <div className="space-y-3">
          <p className="text-sm font-bold">{tr("طلبك في الطريق إليك", "Your order is on its way")}</p>
          <div className="relative h-56 overflow-hidden rounded-2xl bg-[#1d2128]">
            <svg viewBox="0 0 260 220" className="absolute inset-0 size-full" aria-hidden>
              <path d="M0 60 H260 M0 150 H260 M70 0 V220 M190 0 V220" stroke="#2c323b" strokeWidth="14" />
              <path d="M40 190 L70 190 L70 60 L190 60 L190 30" fill="none" stroke={C.green} strokeWidth="4" strokeLinecap="round" strokeDasharray="6 6" />
            </svg>
            <motion.span
              className="absolute flex size-8 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full text-[#0b0c0e] shadow-lg"
              style={{ background: C.orange }}
              initial={{ left: "15%", top: "86%" }}
              animate={{ left: ["15%", "27%", "27%", "73%", "73%"], top: ["86%", "86%", "27%", "27%", "14%"] }}
              transition={{ duration: 3, ease: "easeInOut" }}
            >
              <Truck className="size-4" />
            </motion.span>
            <span className="absolute end-[23%] top-[8%] flex size-7 items-center justify-center rounded-full bg-white text-[#0b0c0e]">
              <ShoppingBag className="size-3.5" />
            </span>
          </div>
          <div className="flex items-center gap-3 rounded-2xl bg-white/[0.06] p-3">
            <Clock className="size-5" style={{ color: C.green }} />
            <span className="flex-1 text-xs">{tr("يصل بعد 12 دقيقة تقريباً", "About 12 minutes away")}</span>
            <span className="text-[11px] text-white/60">{tr("مع حسين", "with Hussein")}</span>
          </div>
        </div>
      ),
    },
    {
      key: "pin",
      label: tr("تستلم برمزك أنت، بعد أن تتأكد", "You hand over with your own PIN"),
      body: (
        <div className="flex h-full flex-col items-center justify-center gap-4 text-center">
          <span className="flex size-14 items-center justify-center rounded-2xl" style={{ background: `${C.amber}33`, color: C.amber }}>
            <KeyRound className="size-7" />
          </span>
          <p className="text-sm font-bold">{tr("رمز الاستلام", "Delivery PIN")}</p>
          <div className="flex gap-2" dir="ltr">
            {["4", "8", "2", "7"].map((d, i) => (
              <motion.span key={i} initial={{ opacity: 0, y: -16, scale: 0.6 }} animate={{ opacity: 1, y: 0, scale: 1 }} transition={{ delay: 0.2 + i * 0.15, type: "spring" }} className="num flex size-12 items-center justify-center rounded-xl bg-white/10 text-2xl font-bold">
                {d}
              </motion.span>
            ))}
          </div>
          <p className="max-w-[200px] text-xs text-white/60">{tr("أعطه للمندوب فقط بعد أن تتأكد أن البضاعة سليمة وكاملة", "Give it only once the goods are complete and fine")}</p>
          <motion.div initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 1.2 }} className="flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-bold text-[#0b0c0e]" style={{ background: C.green }}>
            <Check className="size-4" /> {tr("تم الاستلام · صدرت الفاتورة", "Delivered · invoice made")}
          </motion.div>
        </div>
      ),
    },
    {
      key: "statement",
      label: tr("كشف حسابك وفواتيرك دائماً معك", "Your statement and invoices, always with you"),
      body: (
        <div className="space-y-2.5">
          <p className="text-sm font-bold">{tr("كشف حسابي", "My statement")}</p>
          <div className="rounded-2xl bg-white/[0.06] p-3">
            <p className="text-[10px] text-white/60">{tr("الرصيد", "Balance")}</p>
            <p className="num text-2xl font-bold">1,250,000</p>
          </div>
          {[
            { t: tr("فاتورة", "Invoice"), n: "INV-0241", v: "+425,000", c: C.orange, i: ReceiptText },
            { t: tr("تسديد كي كارد", "Qi Card payment"), n: "PAY-0182", v: "-300,000", c: C.green, i: Wallet },
            { t: tr("مرتجع", "Return"), n: "RET-0008", v: "-38,000", c: C.amber, i: BadgePercent },
            { t: tr("فاتورة", "Invoice"), n: "INV-0236", v: "+219,500", c: C.orange, i: ReceiptText },
          ].map((r, i) => (
            <motion.div key={r.n} initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.1 + i * 0.1 }} className="flex items-center gap-2.5 rounded-xl bg-white/[0.04] p-2.5">
              <span className="flex size-8 items-center justify-center rounded-lg" style={{ background: `${r.c}26`, color: r.c }}>
                <r.i className="size-4" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-[11px] font-semibold">{r.t}</span>
                <span className="num block text-[10px] text-white/50">{r.n}</span>
              </span>
              <span className="num text-[11px] font-bold">{r.v}</span>
            </motion.div>
          ))}
        </div>
      ),
    },
  ];
}

// ---------- 3) Before / with Al-Nahrain: a switch you flip ----------

function BeforeAfter() {
  const { tr } = useFmt();
  const [after, setAfter] = useState(true);
  const before = [
    { i: PhoneOff, t: tr("اتصالات طويلة لتعرف السعر والمتوفر", "Long calls to learn prices and stock") },
    { i: NotebookPen, t: tr("الطلبات والديون في دفتر قد يضيع", "Orders and debts in a notebook that gets lost") },
    { i: Clock, t: tr("تنتظر المندوب ولا تعرف متى يصل", "You wait for the rep, not knowing when") },
    { i: X, t: tr("خلاف على المبلغ لأن الفاتورة غير واضحة", "Arguments over amounts and unclear bills") },
  ];
  const now = [
    { i: Tag, t: tr("أسعارك والمتوفر أمامك في أي وقت", "Your prices and stock in front of you, any time") },
    { i: FileText, t: tr("كل طلب وفاتورة وتسديد محفوظ في كشفك", "Every order, invoice and payment in your statement") },
    { i: MapPinned, t: tr("ترى الشحنة على الخريطة ووقت وصولها", "See the shipment on the map and its time") },
    { i: ShieldCheck, t: tr("فاتورة واضحة ورمز استلام بيدك", "A clear invoice and the PIN in your hand") },
  ];
  const list = after ? now : before;
  return (
    <section id="why" className="scroll-mt-24 px-4 py-16">
      <SectionHead
        eyebrow={tr("لماذا النهرين؟", "Why Al-Nahrain?")}
        title={
          <>
            {tr("قارن يومك ", "Compare your day ")}
            <GradientText from={C.pink} via={C.orange} to={C.amber}>
              {tr("قبل وبعد", "before and after")}
            </GradientText>
          </>
        }
        color={C.pink}
      />
      <div className="mx-auto mt-8 flex w-fit rounded-full border border-white/10 bg-white/[0.05] p-1" role="tablist">
        {[
          { v: false, t: tr("قبل", "Before") },
          { v: true, t: tr("مع النهرين", "With Al-Nahrain") },
        ].map((x) => (
          <button key={String(x.v)} type="button" role="tab" aria-selected={after === x.v} onClick={() => setAfter(x.v)} className="relative h-10 rounded-full px-5 text-sm font-bold">
            {after === x.v && <motion.span layoutId="ba-pill" className="absolute inset-0 rounded-full" style={{ background: x.v ? C.green : "#ef4444" }} transition={{ type: "spring", stiffness: 400, damping: 32 }} />}
            <span className={cn("relative", after === x.v && "text-[#0b0c0e]")}>{x.t}</span>
          </button>
        ))}
      </div>
      <div className="mx-auto mt-8 grid max-w-3xl gap-3 sm:grid-cols-2">
        <AnimatePresence mode="popLayout">
          {list.map((x, i) => (
            <motion.div
              key={`${after}-${i}`}
              layout
              initial={{ opacity: 0, rotateX: -60, y: 20 }}
              animate={{ opacity: 1, rotateX: 0, y: 0 }}
              exit={{ opacity: 0, scale: 0.9 }}
              transition={{ delay: i * 0.06, type: "spring", stiffness: 260, damping: 24 }}
              className="flex items-center gap-3 rounded-2xl border p-4"
              style={{ borderColor: after ? `${C.green}44` : "#ef444444", background: after ? `${C.green}10` : "#ef444410" }}
            >
              <span className="flex size-10 shrink-0 items-center justify-center rounded-xl" style={{ background: after ? `${C.green}26` : "#ef444426", color: after ? C.green : "#f87171" }}>
                <x.i className="size-5" />
              </span>
              <span className="text-sm font-medium">{x.t}</span>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </section>
  );
}

// ---------- 4) Features: colored cards ----------

function Features() {
  const { tr } = useFmt();
  const cards = [
    { i: Tag, t: tr("أسعارك أنت", "Your own prices"), b: tr("سعر نوع محلك والعروض الخاصة بك فقط.", "Your tier's price and your own offers only."), c: C.orange, wide: true },
    { i: MapPinned, t: tr("تتبّع مباشر", "Live tracking"), b: tr("موقع المندوب ووقت الوصول.", "The rep's place and arrival time."), c: C.sky },
    { i: Wallet, t: tr("ادفع من جوالك", "Pay from your phone"), b: tr("بكي كارد، ويُخصم من أقدم فاتورة.", "Qi Card, oldest invoice first."), c: C.amber },
    { i: FileText, t: tr("كشف حساب", "Statement"), b: tr("كل فاتورة وتسديد ومرتجع، وتطبع فواتيرك.", "Every invoice, payment and return; print your invoices."), c: C.green },
    { i: BellRing, t: tr("تنبيه بكل جديد", "Alerts"), b: tr("عند اعتماد طلبك وخروجه ووصوله، بصوت.", "When it is approved, leaves and arrives, with a sound."), c: C.pink },
    { i: Headset, t: tr("دعم مباشر", "Live support"), b: tr("محادثة مع فريق النهرين من داخل التطبيق.", "Chat with the Al-Nahrain team inside the app."), c: C.violet, wide: true },
  ];
  return (
    <section className="px-4 py-16">
      <SectionHead
        eyebrow={tr("ما تحصل عليه", "What you get")}
        title={
          <>
            {tr("كل ما يحتاجه محلك، ", "Everything your shop needs, ")}
            <GradientText from={C.sky} via={C.violet} to={C.pink}>
              {tr("في مكان واحد", "in one place")}
            </GradientText>
          </>
        }
        color={C.sky}
      />
      <div className="mx-auto mt-10 grid max-w-5xl grid-cols-2 gap-3 lg:grid-cols-4">
        {cards.map((x, i) => (
          <motion.div
            key={x.t}
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            whileHover={{ y: -6, rotate: i % 2 ? 1 : -1 }}
            viewport={{ once: true, margin: "-30px" }}
            transition={{ delay: (i % 4) * 0.07, type: "spring", stiffness: 220, damping: 20 }}
            className={cn("group relative overflow-hidden rounded-3xl border border-white/10 p-5", x.wide && "col-span-2")}
            style={{ background: `linear-gradient(150deg, ${x.c}30, #0f1115 75%)` }}
          >
            <span className="absolute -end-6 -top-6 size-24 rounded-full opacity-30 blur-2xl transition group-hover:opacity-60" style={{ background: x.c }} aria-hidden />
            <span className="relative flex size-11 items-center justify-center rounded-2xl text-[#0b0c0e]" style={{ background: x.c }}>
              <x.i className="size-5" />
            </span>
            <p className="relative mt-4 text-lg font-bold">{x.t}</p>
            <p className="relative mt-1 text-sm leading-6 text-white/70">{x.b}</p>
          </motion.div>
        ))}
      </div>
    </section>
  );
}

// ---------- 5) How much time you get back (a slider) ----------

function SaveTime() {
  const { tr, num } = useFmt();
  const [orders, setOrders] = useState(4);
  // About 25 minutes saved per order: the calls to ask prices and stock, dictating the order, and calling to ask where it is.
  const hours = Math.round((orders * 4.3 * 25) / 60);
  const calls = Math.round(orders * 4.3 * 3);
  return (
    <section id="save" className="scroll-mt-24 px-4 py-16">
      <SectionHead eyebrow={tr("احسبها بنفسك", "Work it out")} title={tr("كم ساعة تعود إليك كل شهر؟", "How many hours do you get back each month?")} color={C.amber} />
      <motion.div initial={{ opacity: 0, y: 24 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} className="mx-auto mt-10 max-w-2xl rounded-[28px] border border-white/10 p-6 sm:p-8" style={{ background: `linear-gradient(160deg, ${C.amber}22, #0f1115 70%)` }}>
        <label className="block text-sm font-semibold text-white/80" htmlFor="orders">
          {tr("كم مرة تطلب بضاعة في الأسبوع؟", "How many orders a week?")} <span className="num text-xl font-bold text-white">{num(orders)}</span>
        </label>
        <input id="orders" type="range" min={1} max={14} value={orders} onChange={(e) => setOrders(Number(e.target.value))} className="mt-4 w-full accent-[#ffc23d]" />
        <div className="mt-6 grid grid-cols-2 gap-3">
          <div className="rounded-2xl bg-black/30 p-4">
            <motion.p key={hours} initial={{ scale: 1.3, opacity: 0.5 }} animate={{ scale: 1, opacity: 1 }} className="num text-4xl font-bold" style={{ color: C.amber }}>
              {num(hours)}
            </motion.p>
            <p className="mt-1 text-sm text-white/70">{tr("ساعة توفّرها شهرياً", "hours saved a month")}</p>
          </div>
          <div className="rounded-2xl bg-black/30 p-4">
            <motion.p key={calls} initial={{ scale: 1.3, opacity: 0.5 }} animate={{ scale: 1, opacity: 1 }} className="num text-4xl font-bold" style={{ color: C.green }}>
              {num(calls)}
            </motion.p>
            <p className="mt-1 text-sm text-white/70">{tr("اتصالاً لا تحتاجه", "calls you don't need")}</p>
          </div>
        </div>
        <p className="mt-4 text-xs text-white/45">{tr("تقدير: نحو 25 دقيقة وثلاثة اتصالات لكل طلب بالطريقة القديمة (السؤال عن السعر والمتوفر، وإملاء الطلب، والسؤال عن موعد الوصول).", "An estimate: about 25 minutes and three calls per order the old way (asking prices and stock, dictating the order, asking when it comes).")}</p>
      </motion.div>
    </section>
  );
}

// ---------- 6) Safe: the goods, the money ----------

function Safe() {
  const { tr } = useFmt();
  const steps = [
    { i: Truck, t: tr("تصلك الشحنة بملصق QR", "The shipment comes with a QR label"), b: tr("مسجّلة باسم محلك ومن المخزن إلى بابك.", "Registered to your shop, from the warehouse to your door."), c: C.sky },
    { i: Camera, t: tr("يصوّر المندوب البضاعة عندك", "The rep photographs the goods"), b: tr("صورة محفوظة مع الطلب يراها الجميع.", "A photo kept with the order, for everyone to see."), c: C.violet },
    { i: KeyRound, t: tr("تعطيه رمزك بعد أن تتأكد", "You give your PIN once you've checked"), b: tr("بلا رمزك لا يُسجَّل التسليم ولا تُصدر فاتورة.", "Without your PIN nothing is delivered or invoiced."), c: C.amber },
    { i: ReceiptText, t: tr("تُصدر الفاتورة على ما استلمته فقط", "The invoice is for what you got"), b: tr("الناقص لا يُحسب عليك أبداً.", "What's missing is never charged."), c: C.green },
  ];
  return (
    <section id="safe" className="scroll-mt-24 px-4 py-16">
      <SectionHead
        eyebrow={tr("أمان طلبك", "Your order is safe")}
        title={tr("لا تدفع إلا عمّا وصلك فعلاً", "You pay only for what really arrived")}
        sub={tr("أربع خطوات تحمي بضاعتك ومالك في كل شحنة.", "Four steps protect your goods and your money on every shipment.")}
        color={C.green}
      />
      <ol className="relative mx-auto mt-10 max-w-2xl space-y-4">
        <motion.span
          className="absolute bottom-6 start-[22px] top-6 w-0.5 origin-top rounded-full"
          style={{ background: `linear-gradient(${C.sky}, ${C.violet}, ${C.amber}, ${C.green})` }}
          initial={{ scaleY: 0 }}
          whileInView={{ scaleY: 1 }}
          viewport={{ once: true, margin: "-80px" }}
          transition={{ duration: 1.4, ease: "easeInOut" }}
          aria-hidden
        />
        {steps.map((s, i) => (
          <motion.li key={s.t} initial={{ opacity: 0, x: 30 }} whileInView={{ opacity: 1, x: 0 }} viewport={{ once: true, margin: "-40px" }} transition={{ delay: i * 0.15 }} className="relative flex gap-4">
            <span className="relative z-10 flex size-11 shrink-0 items-center justify-center rounded-2xl text-[#0b0c0e] shadow-lg" style={{ background: s.c }}>
              <s.i className="size-5" />
            </span>
            <div className="flex-1 rounded-2xl border border-white/10 bg-white/[0.04] p-4">
              <p className="font-bold">{s.t}</p>
              <p className="mt-1 text-sm text-white/65">{s.b}</p>
            </div>
          </motion.li>
        ))}
      </ol>
    </section>
  );
}

// ---------- 7) How to start ----------

function Start({ mainHref, mainLabel }: { mainHref: string; mainLabel: string }) {
  const { tr } = useFmt();
  const steps = [
    { t: tr("سجّل محلك", "Register your shop"), b: tr("اسم المحل ورقم هاتفك وموقعه على الخريطة.", "Its name, your phone number and its place on the map."), c: C.orange },
    { t: tr("تراجع الشركة محلك", "The company checks it"), b: tr("وتحدد أسعارك وسقف دينك، ويصلك تنبيه.", "It sets your prices and limit, and you get an alert."), c: C.pink },
    { t: tr("اطلب وتابع", "Order and follow"), b: tr("من جوالك، حتى تصل البضاعة إلى بابك.", "From your phone, until the goods reach your door."), c: C.green },
  ];
  return (
    <section className="px-4 py-16">
      <SectionHead eyebrow={tr("ثلاث خطوات", "Three steps")} title={tr("تبدأ اليوم", "Start today")} color={C.orange} />
      <div className="mx-auto mt-10 grid max-w-5xl gap-4 sm:grid-cols-3">
        {steps.map((s, i) => (
          <motion.div key={s.t} initial={{ opacity: 0, y: 30, scale: 0.95 }} whileInView={{ opacity: 1, y: 0, scale: 1 }} viewport={{ once: true }} transition={{ delay: i * 0.12, type: "spring" }} className="relative rounded-3xl border border-white/10 bg-white/[0.04] p-6 text-center">
            <span className="num mx-auto flex size-14 items-center justify-center rounded-full text-2xl font-bold text-[#0b0c0e] shadow-[0_0_30px_-4px_var(--c)]" style={{ background: s.c, "--c": s.c } as React.CSSProperties}>
              {i + 1}
            </span>
            <p className="mt-4 text-lg font-bold">{s.t}</p>
            <p className="mt-1 text-sm text-white/65">{s.b}</p>
          </motion.div>
        ))}
      </div>
      <div className="mt-8 hidden justify-center lg:flex">
        <BigButton href={mainHref} color={C.orange}>
          {mainLabel}
        </BigButton>
      </div>
    </section>
  );
}
