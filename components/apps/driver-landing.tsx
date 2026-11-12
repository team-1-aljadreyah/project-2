"use client";

// The reps' landing page (/driver), opened from the main site in a new tab. It shows a rep his day with
// the app: the trip on the map, scanning the shipment, the hand-over with the shop owner's PIN and a photo,
// the money he collects, and that it works without internet. Teal, cyan and orange; made for a phone first.
import { motion } from "motion/react";
import {
  ArrowLeft,
  ArrowRight,
  BellRing,
  Camera,
  Check,
  Container,
  KeyRound,
  MapPinned,
  Navigation,
  Percent,
  QrCode,
  Route,
  ShieldCheck,
  ShoppingCart,
  Sparkles,
  Truck,
  Wallet,
  WifiOff,
} from "lucide-react";
import { useFmt } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { AppFooter, AppHeader, BigButton, Blobs, CountUp, GradientText, InstallCard, Marquee, PhoneDemo, Questions, Rivers, SectionHead, StickyActions, IDENTITY, useAppEntry } from "./kit";

// The page's two colors (the identity of the reps' app, see IDENTITY in ./kit).
const C = IDENTITY.driver;

export function DriverLanding() {
  const { tr, lang } = useFmt();
  const { session, mine, home } = useAppEntry("driver");
  const Forward = lang === "ar" ? ArrowLeft : ArrowRight;
  const main = mine ? { href: home, label: tr("افتح التطبيق", "Open the app") } : session ? { href: home, label: tr("حسابي", "My account") } : { href: "/login", label: tr("ادخل برقم هاتفك", "Log in with your phone") };

  return (
    <div className="dark min-h-dvh bg-[#08090b] pb-32 text-white lg:pb-0">
      <AppHeader
        app="driver"
        links={[
          { href: "#day", label: tr("يومك", "Your day") },
          { href: "#features", label: tr("المميزات", "Features") },
          { href: "#proof", label: tr("حمايتك", "Your proof") },
          { href: "#faq", label: tr("أسئلة", "Questions") },
        ]}
        cta={main}
      />

      <main>
        {/* ---------- Hero ---------- */}
        <section className="relative overflow-hidden px-4 pb-14 pt-28 sm:pt-32">
          <Blobs colors={[C.main, C.soft, C.main]} className="opacity-70" />
          <div className="brand-grid absolute inset-0 opacity-30" aria-hidden />
          <div className="relative mx-auto grid max-w-6xl items-center gap-12 lg:grid-cols-[1.1fr_0.9fr]">
            <div className="text-center lg:text-start">
              <motion.span initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3 py-1 text-xs font-semibold backdrop-blur">
                <Sparkles className="size-3.5" style={{ color: C.soft }} /> {tr("لمندوبي البيع والتوصيل", "For sales and delivery reps")}
              </motion.span>
              <motion.h1 initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.08, duration: 0.7 }} className="mt-5 text-4xl font-bold leading-[1.15] sm:text-6xl">
                {tr("جولتك كلها", "Your whole round")}
                <br />
                <GradientText from={C.soft} via={C.main} to={C.main}>
                  {tr("في جيبك", "in your pocket")}
                </GradientText>
              </motion.h1>
              <motion.p initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }} className="mx-auto mt-5 max-w-xl text-lg leading-8 text-white/75 lg:mx-0">
                {tr(
                  "محلات اليوم مرتبة على الخريطة، وشحناتك المحمّلة في سيارتك، والتسليم برمز صاحب المحل وصورة تحميك. بلا أوراق، وحتى بلا إنترنت.",
                  "Today's shops in order on the map, the shipments in your van, and a hand-over with the shop owner's PIN and a photo that protects you. No papers, even without internet.",
                )}
              </motion.p>
              <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.32 }} className="mt-8 hidden flex-wrap justify-center gap-3 sm:flex lg:justify-start">
                <BigButton href={main.href} color={C.main}>
                  {main.label} <Forward className="size-5" />
                </BigButton>
                <BigButton href="#day" ghost>
                  {tr("شاهد يومك", "See your day")}
                </BigButton>
              </motion.div>
              <motion.ul initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.45 }} className="mt-7 flex flex-wrap justify-center gap-2 text-sm lg:justify-start">
                {[
                  { t: tr("يعمل بلا إنترنت", "Works offline"), c: C.soft },
                  { t: tr("مسح بالكاميرا", "Camera scanning"), c: C.main },
                  { t: tr("عمولتك أمامك", "Your commission in view"), c: C.soft },
                ].map((x) => (
                  <li key={x.t} className="flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.06] px-3 py-1.5">
                    <Check className="size-4" style={{ color: x.c }} /> {x.t}
                  </li>
                ))}
              </motion.ul>
            </div>
            <PhoneDemo glow={`linear-gradient(135deg, ${C.main}, ${C.soft})`} tilt={3} screens={useScreens()} />
          </div>
        </section>

        {/* The identity's two rivers, under the hero */}
        <Rivers app="driver" className="-mt-4" />
        <Marquee
          items={[
            { icon: Route, t: tr("جولة مرتبة", "An ordered trip"), c: C.main },
            { icon: QrCode, t: tr("مسح QR", "QR scanning"), c: C.main },
            { icon: KeyRound, t: tr("رمز الاستلام", "Delivery PIN"), c: C.soft },
            { icon: Camera, t: tr("صورة إثبات", "Photo proof"), c: C.main },
            { icon: WifiOff, t: tr("بلا إنترنت", "Offline"), c: C.soft },
            { icon: Wallet, t: tr("استلام التسديد", "Collect payments"), c: C.main },
            { icon: Percent, t: tr("عمولتك", "Your commission"), c: C.soft },
            { icon: Navigation, t: tr("موقعك المباشر", "Live location"), c: C.main },
          ]}
        />

        <section className="px-4 py-10">
          <div className="mx-auto grid max-w-5xl grid-cols-2 gap-3 lg:grid-cols-4">
            {[
              { n: 0, s: "", t: tr("أوراق تحملها أو تملؤها", "Papers to carry or fill"), c: C.main },
              { n: 4, s: tr(" أرقام", " digits"), t: tr("رمز يُغلق كل تسليم بلا خلاف", "A PIN that closes each hand-over"), c: C.soft },
              { n: 1, s: tr(" ضغطة", " tap"), t: tr("تفتح لك خرائط الطريق إلى المحل", "Opens the road to the shop"), c: C.main },
              { n: 100, s: "%", t: tr("من عملك يُحفظ ولو انقطعت الشبكة", "Of your work saved, even offline"), c: C.soft },
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

        <Day />
        <Features />
        <Proof />

        <section id="faq" className="scroll-mt-24 px-4 py-16">
          <SectionHead eyebrow={tr("أسئلة المندوبين", "Reps ask")} title={tr("قبل أن تبدأ", "Before you start")} color={C.main} />
          <Questions
            color={C.main}
            items={[
              { q: tr("كيف أحصل على حساب؟", "How do I get an account?"), a: tr("يفتحه لك المدير برقم هاتفك ويحدد عملك (بيع، توصيل، أو الاثنان)، ثم تدخل برقمك وكلمة المرور.", "The manager opens it with your phone number and your job (sales, delivery or both); then you log in.") },
              { q: tr("ماذا لو انقطع الإنترنت في الطريق؟", "What if the internet drops on the road?"), a: tr("تستمر في العمل: تُحفظ الطلبات والتسديدات على جوالك وتُرسَل وحدها عند عودة الشبكة.", "Keep working: orders and payments are saved on your phone and sent by themselves when the network is back.") },
              { q: tr("ماذا لو رفض المحل الاستلام أو كان مغلقاً؟", "What if the shop refuses or is closed?"), a: tr("اضغط «تعذّر التسليم» واختر السبب، فيعرف المدير والمخزن فوراً وتبقى الشحنة مسجلة معك حتى تُعاد.", "Press “Couldn't deliver” and pick the reason: the manager and the warehouse know at once.") },
              { q: tr("هل أرى عمولتي؟", "Do I see my commission?"), a: tr("نعم، لمندوب البيع: تُحسب على ما يُدفع فعلاً، وتراها لكل تسديد ولكل شهر.", "Yes, for sales reps: it counts on money actually paid, per payment and per month.") },
            ]}
          />
        </section>

        <section className="px-4 pb-10">
          <InstallCard app="driver" color={C.main} />
        </section>

        <Rivers app="driver" className="mb-6" />
        <section className="px-4 pb-16 pt-4">
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="relative mx-auto max-w-5xl overflow-hidden rounded-[36px] p-8 text-center text-[#06201c] sm:p-14"
            style={{ background: `linear-gradient(135deg, ${C.soft}, ${C.main} 55%, ${C.main})` }}
          >
            <Blobs colors={[C.soft]} className="opacity-40" />
            <div className="relative">
              <h2 className="text-3xl font-bold leading-tight sm:text-5xl">{tr("ابدأ جولة اليوم من جوالك", "Start today's round from your phone")}</h2>
              <p className="mx-auto mt-4 max-w-xl font-medium opacity-80">{tr("ادخل برقم هاتفك، وستجد محلاتك وشحناتك جاهزة.", "Log in with your phone number: your shops and shipments are ready.")}</p>
              <div className="mt-8 flex justify-center">
                <BigButton href={main.href} color="#0b0c0e" className="text-white">
                  {main.label} <Forward className="size-5" />
                </BigButton>
              </div>
            </div>
          </motion.div>
        </section>
      </main>

      <AppFooter other={{ href: "/client", label: tr("تطبيق المحلات", "The shops' app") }} />

      <StickyActions note={!session ? tr("حساب المندوب يفتحه المدير، وتدخل برقم هاتفك.", "The manager opens a rep's account; you log in with your phone number.") : undefined}>
        <BigButton href={main.href} color={C.main} className="flex-1">
          {main.label} <Forward className="size-5" />
        </BigButton>
      </StickyActions>
    </div>
  );
}

// ---------- the phone's screens ----------

function useScreens() {
  const { tr } = useFmt();
  const stops = [tr("بقالة أبو علي", "Abu Ali grocery"), tr("ماركت الزهراء", "Al-Zahraa market"), tr("أسواق الكوثر", "Al-Kawthar markets"), tr("بقالة الوفاء", "Al-Wafaa grocery")];
  return [
    {
      key: "trip",
      label: tr("جولة اليوم مرتبة على الخريطة", "Today's trip, in order on the map"),
      body: (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-sm font-bold">{tr("جولة اليوم", "Today's trip")}</p>
            <span className="num rounded-full px-2 py-0.5 text-[11px] font-bold text-[#0b0c0e]" style={{ background: C.main }}>
              1/4
            </span>
          </div>
          <div className="relative h-40 overflow-hidden rounded-2xl bg-[#1b2026]">
            <svg viewBox="0 0 260 160" className="absolute inset-0 size-full" aria-hidden>
              <path d="M0 40 H260 M0 110 H260 M60 0 V160 M150 0 V160 M220 0 V160" stroke="#2a3038" strokeWidth="10" />
              <motion.path d="M30 140 L60 110 L150 110 L150 40 L220 40 L220 15" fill="none" stroke={C.main} strokeWidth="4" strokeLinecap="round" initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 1.6, ease: "easeInOut" }} />
            </svg>
            {[
              [60, 110],
              [150, 110],
              [150, 40],
              [220, 15],
            ].map(([x, y], i) => (
              <motion.span
                key={i}
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ delay: 0.3 + i * 0.3, type: "spring" }}
                className="num absolute flex size-6 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full text-[11px] font-bold text-[#0b0c0e]"
                style={{ left: `${(x / 260) * 100}%`, top: `${(y / 160) * 100}%`, background: i === 0 ? C.main : "#ffffff" }}
              >
                {i + 1}
              </motion.span>
            ))}
          </div>
          {stops.map((s, i) => (
            <motion.div key={s} initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.2 + i * 0.1 }} className={cn("flex items-center gap-2.5 rounded-xl p-2.5", i === 0 ? "bg-white/[0.1]" : "bg-white/[0.04]")}>
              <span className="num flex size-6 items-center justify-center rounded-full text-[11px] font-bold text-[#0b0c0e]" style={{ background: i === 0 ? C.main : "#ffffffcc" }}>
                {i + 1}
              </span>
              <span className="flex-1 text-[12px] font-semibold">{s}</span>
              {i === 0 && <span className="text-[10px] font-bold" style={{ color: C.main }}>{tr("التالي", "Next")}</span>}
            </motion.div>
          ))}
        </div>
      ),
    },
    {
      key: "scan",
      label: tr("امسح ملصق الشحنة عند استلامها", "Scan the label when you take the shipment"),
      body: (
        <div className="flex h-full flex-col items-center justify-center gap-4 text-center">
          <p className="text-sm font-bold">{tr("امسح QR الشحنة", "Scan the shipment QR")}</p>
          <div className="relative size-48 rounded-3xl bg-[#1b2026] p-4">
            {/* the corners of the camera frame */}
            {["start-2 top-2 border-s-4 border-t-4", "end-2 top-2 border-e-4 border-t-4", "bottom-2 start-2 border-b-4 border-s-4", "bottom-2 end-2 border-b-4 border-e-4"].map((p) => (
              <span key={p} className={cn("absolute size-8 rounded-md", p)} style={{ borderColor: C.main }} />
            ))}
            <QrCode className="size-full text-white/80" strokeWidth={1.2} />
            <span className="scan-line absolute inset-x-4 h-0.5 rounded-full shadow-[0_0_12px_2px_#1fb5a5]" style={{ background: C.main }} />
          </div>
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 1.4 }} className="flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-bold text-[#0b0c0e]" style={{ background: C.soft }}>
            <Check className="size-4" /> ORD-000277 · {tr("خرجت معك", "out with you")}
          </motion.div>
        </div>
      ),
    },
    {
      key: "handover",
      label: tr("صورة البضاعة ورمز صاحب المحل", "A photo and the shop owner's PIN"),
      body: (
        <div className="space-y-3">
          <p className="text-sm font-bold">{tr("التسليم لبقالة أبو علي", "Hand-over to Abu Ali grocery")}</p>
          <div className="relative flex h-36 items-center justify-center overflow-hidden rounded-2xl" style={{ background: `linear-gradient(135deg, ${C.main}55, ${C.main}33)` }}>
            <Camera className="size-10 text-white/80" />
            <motion.span initial={{ opacity: 0 }} animate={{ opacity: [0, 1, 0] }} transition={{ delay: 0.5, duration: 0.5 }} className="absolute inset-0 bg-white" />
            <motion.span initial={{ opacity: 0, scale: 0.6 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 0.9 }} className="absolute bottom-2 end-2 flex items-center gap-1 rounded-full bg-black/60 px-2 py-1 text-[10px] font-bold">
              <Check className="size-3" style={{ color: C.soft }} /> {tr("صُوّرت", "Photo taken")}
            </motion.span>
          </div>
          <p className="text-xs text-white/60">{tr("رمز الاستلام من صاحب المحل", "The shop owner's PIN")}</p>
          <div className="flex justify-center gap-2" dir="ltr">
            {["4", "8", "2", "7"].map((d, i) => (
              <motion.span key={i} initial={{ opacity: 0, y: -12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 1.1 + i * 0.18 }} className="num flex size-11 items-center justify-center rounded-xl border-2 text-xl font-bold" style={{ borderColor: C.soft }}>
                {d}
              </motion.span>
            ))}
          </div>
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 2 }} className="rounded-xl py-2.5 text-center text-xs font-bold text-[#0b0c0e]" style={{ background: C.main }}>
            {tr("تم التسليم · صدرت الفاتورة", "Delivered · invoice made")}
          </motion.div>
        </div>
      ),
    },
    {
      key: "done",
      label: tr("نهاية اليوم: ما سلّمته وما قبضته", "End of day: what you delivered and collected"),
      body: (
        <div className="flex h-full flex-col justify-center gap-3">
          <div className="rounded-2xl p-4 text-[#06201c]" style={{ background: `linear-gradient(135deg, ${C.soft}, ${C.main})` }}>
            <p className="text-xs font-semibold opacity-80">{tr("قبضت اليوم", "Collected today")}</p>
            <p className="num text-3xl font-bold">1,375,000</p>
          </div>
          <div className="grid grid-cols-2 gap-2">
            {[
              { t: tr("سُلّمت", "Delivered"), v: "4/4", c: C.main, i: Truck },
              { t: tr("عمولتي", "My commission"), v: "33,000", c: C.soft, i: Percent },
              { t: tr("طلبات جديدة", "New orders"), v: "3", c: C.main, i: ShoppingCart },
              { t: tr("محفوظة بلا إنترنت", "Saved offline"), v: "0", c: C.soft, i: WifiOff },
            ].map((x, i) => (
              <motion.div key={x.t} initial={{ opacity: 0, scale: 0.85 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 0.2 + i * 0.1 }} className="rounded-2xl bg-white/[0.06] p-3">
                <x.i className="size-4" style={{ color: x.c }} />
                <p className="num mt-2 text-lg font-bold">{x.v}</p>
                <p className="text-[10px] text-white/60">{x.t}</p>
              </motion.div>
            ))}
          </div>
        </div>
      ),
    },
  ];
}

// ---------- A day with the app ----------

function Day() {
  const { tr } = useFmt();
  const steps = [
    { time: "8:00", i: BellRing, t: tr("يصلك تنبيه: حُمّلت شحناتك", "An alert: your shipments are loaded"), b: tr("موظف المخزن يحمّلها في سيارتك ويضغط «حمّلتها».", "The warehouse staff load them and press “Loaded”."), c: C.main },
    { time: "8:10", i: QrCode, t: tr("تمسح الملصقات", "You scan the labels"), b: tr("بالكاميرا، فتخرج كل شحنة باسمك.", "With the camera: each shipment leaves in your name."), c: C.main },
    { time: "8:15", i: Route, t: tr("تختار محلات جولتك", "You pick the trip's shops"), b: tr("ويرتّبها التطبيق على الخريطة ويحسب المسافة.", "The app orders them on the map and works out the distance."), c: C.main },
    { time: "9:00", i: MapPinned, t: tr("تصل، وصاحب المحل يتابعك", "You arrive; the shop follows you"), b: tr("يرى موقعك المباشر ووقت الوصول على جواله.", "He sees your live position and arrival time on his phone."), c: C.soft },
    { time: "9:05", i: KeyRound, t: tr("تسلّم بصورة ورمز", "Photo + PIN hand-over"), b: tr("وتصدر الفاتورة على ما سلّمته فقط.", "The invoice is for what you handed over only."), c: C.main },
    { time: "9:07", i: Wallet, t: tr("تستلم التسديد", "You collect the payment"), b: tr("نقداً أو تحويلاً، ويُحسب لعمولتك فوراً.", "Cash or transfer; your commission counts at once."), c: C.soft },
  ];
  return (
    <section id="day" className="scroll-mt-24 px-4 py-16">
      <SectionHead
        eyebrow={tr("يومك مع التطبيق", "Your day with the app")}
        title={
          <>
            {tr("من المخزن إلى آخر محل، ", "From the warehouse to the last shop, ")}
            <GradientText from={C.main} via={C.main} to={C.soft}>
              {tr("خطوة بخطوة", "step by step")}
            </GradientText>
          </>
        }
        color={C.main}
      />
      <ol className="relative mx-auto mt-10 max-w-2xl space-y-4">
        <motion.span
          className="absolute bottom-6 start-[22px] top-6 w-0.5 origin-top rounded-full"
          style={{ background: `linear-gradient(${C.main}, ${C.main}, ${C.main}, ${C.soft}, ${C.main}, ${C.soft})` }}
          initial={{ scaleY: 0 }}
          whileInView={{ scaleY: 1 }}
          viewport={{ once: true, margin: "-80px" }}
          transition={{ duration: 1.8, ease: "easeInOut" }}
          aria-hidden
        />
        {steps.map((s, i) => (
          <motion.li key={s.t} initial={{ opacity: 0, x: 30 }} whileInView={{ opacity: 1, x: 0 }} viewport={{ once: true, margin: "-40px" }} transition={{ delay: i * 0.1 }} className="relative flex gap-4">
            <span className="relative z-10 flex size-11 shrink-0 items-center justify-center rounded-2xl text-[#0b0c0e] shadow-lg" style={{ background: s.c }}>
              <s.i className="size-5" />
            </span>
            <div className="flex-1 rounded-2xl border border-white/10 bg-white/[0.04] p-4">
              <p className="flex items-center gap-2 font-bold">
                <span className="num rounded-md px-1.5 text-[11px]" style={{ background: `${s.c}26`, color: s.c }} dir="ltr">
                  {s.time}
                </span>
                {s.t}
              </p>
              <p className="mt-1 text-sm text-white/65">{s.b}</p>
            </div>
          </motion.li>
        ))}
      </ol>
    </section>
  );
}

// ---------- Features ----------

function Features() {
  const { tr } = useFmt();
  const cards = [
    { i: Route, t: tr("جولة ذكية", "A smart trip"), b: tr("اختر المحلات، ويرتّبها التطبيق ويفتح لك الطريق في الخرائط.", "Pick the shops; the app orders them and opens the road in Maps."), c: C.main, wide: true },
    { i: QrCode, t: tr("مسح سريع", "Quick scan"), b: tr("بالكاميرا، أو اكتب الرمز إن لم تقرأه.", "With the camera, or type the code."), c: C.main },
    { i: Container, t: tr("تعرف ما في سيارتك", "Know what's in your van"), b: tr("كل شحنة محمّلة ومن حمّلها.", "Every loaded shipment and who loaded it."), c: C.main },
    { i: WifiOff, t: tr("بلا إنترنت", "Offline"), b: tr("يُحفظ عملك ويُرسَل لاحقاً.", "Saved now, sent later."), c: C.soft },
    { i: ShoppingCart, t: tr("طلب وتسديد في المحل", "Order and payment in the shop"), b: tr("لمندوب البيع: طلب جديد بأسعار الزبون، واستلام التسديد بإيصال.", "For sales reps: a new order at the shop's prices, and a payment with a receipt."), c: C.main, wide: true },
  ];
  return (
    <section id="features" className="scroll-mt-24 px-4 py-16">
      <SectionHead eyebrow={tr("مصمَّم للطريق", "Made for the road")} title={tr("أدوات تعرف عملك", "Tools that know your job")} color={C.main} />
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

// ---------- The proof protects the rep ----------

function Proof() {
  const { tr } = useFmt();
  return (
    <section id="proof" className="scroll-mt-24 px-4 py-16">
      <motion.div
        initial={{ opacity: 0, y: 30 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        className="relative mx-auto grid max-w-5xl items-center gap-8 overflow-hidden rounded-[32px] border border-white/10 p-6 sm:p-10 lg:grid-cols-2"
        style={{ background: `linear-gradient(150deg, ${C.soft}22, #0f1115 60%)` }}
      >
        <div>
          <span className="flex size-12 items-center justify-center rounded-2xl text-[#0b0c0e]" style={{ background: C.soft }}>
            <ShieldCheck className="size-6" />
          </span>
          <h2 className="mt-5 text-3xl font-bold leading-tight">{tr("الإثبات يحميك أنت", "The proof protects you")}</h2>
          <p className="mt-3 leading-7 text-white/70">
            {tr(
              "كل تسليم مسجّل بصورة البضاعة ورمز صاحب المحل ووقت التسليم. إن قال أحد إن البضاعة لم تصل أو نقصت، فالسجل يقول الحقيقة، ولا يُحاسَب المندوب على ما لم يُسلِّمه.",
              "Every hand-over is recorded with a photo, the shop owner's PIN and the time. If anyone says the goods didn't arrive or were short, the record tells the truth, and you are never charged for what you didn't hand over.",
            )}
          </p>
        </div>
        <div className="grid grid-cols-3 gap-3">
          {[
            { i: Camera, t: tr("صورة", "Photo"), c: C.main },
            { i: KeyRound, t: tr("رمز", "PIN"), c: C.soft },
            { i: MapPinned, t: tr("وقت ومكان", "Time & place"), c: C.main },
          ].map((x, i) => (
            <motion.div key={x.t} initial={{ opacity: 0, y: 20, rotate: -6 }} whileInView={{ opacity: 1, y: 0, rotate: 0 }} viewport={{ once: true }} transition={{ delay: 0.2 + i * 0.12, type: "spring" }} className="flex flex-col items-center gap-2 rounded-2xl bg-black/30 p-4 text-center">
              <span className="flex size-11 items-center justify-center rounded-xl" style={{ background: `${x.c}26`, color: x.c }}>
                <x.i className="size-5" />
              </span>
              <span className="text-sm font-semibold">{x.t}</span>
            </motion.div>
          ))}
        </div>
      </motion.div>
    </section>
  );
}
