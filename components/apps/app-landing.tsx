"use client";

// The landing page of the two phone apps, opened from the main site in a new tab:
// - /client: the shop owners' app (order, track the shipment, statement, pay).
// - /driver: the reps' app (the day's trip, scan the label, deliver with the shop owner's PIN).
// Made for a phone first: one column, big buttons, and a button bar fixed at the bottom.
// Each app can be installed on the phone's home screen (its own name and icon: see app/client/layout.tsx).
// Opened from the installed icon (?app=1) by someone already logged in to that app: it goes straight in.
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, useSyncExternalStore } from "react";
import { motion } from "motion/react";
import {
  ArrowLeft,
  ArrowRight,
  BellRing,
  Camera,
  Download,
  FileText,
  KeyRound,
  MapPinned,
  PackageCheck,
  QrCode,
  Route,
  Share,
  ShoppingCart,
  Tag,
  Truck,
  UserPlus,
  Wallet,
  WifiOff,
  type LucideIcon,
} from "lucide-react";
import { BrandName, LogoMark } from "@/components/logo";
import { LanguageSwitch, ThemeToggle } from "@/components/switches";
import { homeOf, useSession } from "@/lib/auth";
import { useFmt } from "@/lib/i18n";
import { cn } from "@/lib/utils";

type App = "client" | "driver";

/** The browser's "install this app" offer (Chrome / Android), kept until the button is pressed. */
interface InstallPrompt extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

/** iPhone / iPad Safari has no install offer: it is done from the Share menu. */
const isIos = () => /iphone|ipad|ipod/i.test(navigator.userAgent) && !window.matchMedia("(display-mode: standalone)").matches;

export function AppLanding({ app }: { app: App }) {
  const { tr, lang } = useFmt();
  const router = useRouter();
  const session = useSession();
  const Forward = lang === "ar" ? ArrowLeft : ArrowRight;
  const role = session?.user.role;
  const mine = app === "client" ? role === "shop" : role === "rep";
  const home = session ? homeOf(session.user.role, session.user.rep_kinds) : "/login";
  const [install, setInstall] = useState<InstallPrompt | null>(null);
  const ios = useSyncExternalStore(
    () => () => {},
    isIos,
    () => false,
  );

  // Opened from the icon on the home screen, already logged in: straight into the app.
  useEffect(() => {
    if (mine && new URLSearchParams(window.location.search).get("app") === "1") router.replace(home);
  }, [mine, home, router]);

  useEffect(() => {
    const keep = (e: Event) => {
      e.preventDefault();
      setInstall(e as InstallPrompt);
    };
    window.addEventListener("beforeinstallprompt", keep);
    return () => window.removeEventListener("beforeinstallprompt", keep);
  }, []);

  const t = app === "client" ? clientText(tr) : driverText(tr);
  const dark = app === "driver";

  return (
    <div className={cn("min-h-dvh bg-bg pb-28 text-text", dark && "dark")}>
      {/* The top bar */}
      <header className="sticky top-0 z-30 border-b border-line bg-bg/85 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-xl items-center gap-2 px-4">
          <LogoMark size={30} />
          <span className="min-w-0 flex-1 leading-tight">
            <span className="block truncate text-sm font-bold">
              <BrandName />
            </span>
            <span className="block truncate text-[11px] text-muted">{t.appName}</span>
          </span>
          <LanguageSwitch />
          {!dark && <ThemeToggle />}
        </div>
      </header>

      <main className="mx-auto max-w-xl px-4">
        {/* The hero: the app's icon, what it does, and the main buttons */}
        <section className={cn("relative mt-4 overflow-hidden rounded-[28px] p-6", app === "client" ? "bg-gradient-to-br from-[#e1692b] to-[#b8521c] text-white" : "brand-panel")}>
          <div className="brand-grid absolute inset-0 opacity-40" aria-hidden />
          <div className="relative">
            <motion.img
              src={`/apps/${app}-192.png`}
              alt=""
              width={64}
              height={64}
              initial={{ scale: 0.6, opacity: 0, rotate: -8 }}
              animate={{ scale: 1, opacity: 1, rotate: 0 }}
              transition={{ type: "spring", stiffness: 240, damping: 16 }}
              className="size-16 rounded-2xl shadow-lg ring-2 ring-white/30"
            />
            <motion.h1 initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="mt-5 text-3xl font-bold leading-tight">
              {t.title}
            </motion.h1>
            <motion.p initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.18 }} className="mt-3 text-base opacity-85">
              {t.sub}
            </motion.p>

            {/* What the app looks like: three small cards from it */}
            <div className="mt-6 space-y-2">
              {t.peek.map((p, i) => (
                <motion.div
                  key={p.t}
                  initial={{ opacity: 0, x: lang === "ar" ? -24 : 24 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.3 + i * 0.12, type: "spring", stiffness: 200, damping: 20 }}
                  className="flex items-center gap-3 rounded-2xl bg-white/12 p-3 backdrop-blur-sm"
                  style={{ marginInlineStart: `${i * 12}px` }}
                >
                  <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-white/20">
                    <p.icon className="size-5" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-bold">{p.t}</span>
                    <span className="block truncate text-xs opacity-80">{p.b}</span>
                  </span>
                </motion.div>
              ))}
            </div>
          </div>
        </section>

        {/* Logged in with another job: say so (this app is for someone else) */}
        {session && !mine && (
          <p className="mt-4 rounded-2xl border border-line bg-card p-3 text-sm text-muted">
            {tr(`أنت داخل الآن بحساب ${session.user.name}. هذا التطبيق ${t.forWho}.`, `You are logged in as ${session.user.name}. This app is ${t.forWho}.`)}{" "}
            <Link href={home} className="font-semibold text-primary-ink underline-offset-2 hover:underline">
              {tr("اذهب إلى حسابك", "Go to your account")}
            </Link>
          </p>
        )}

        {/* What it does */}
        <section className="mt-8">
          <h2 className="text-xl font-bold">{t.featuresTitle}</h2>
          <div className="mt-4 grid grid-cols-2 gap-3">
            {t.features.map((f, i) => (
              <motion.div
                key={f.t}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: "-30px" }}
                transition={{ delay: (i % 2) * 0.08 }}
                className="rounded-2xl border border-line bg-card p-4"
              >
                <span className="flex size-10 items-center justify-center rounded-xl bg-action/15 text-action">
                  <f.icon className="size-5" />
                </span>
                <p className="mt-3 font-bold">{f.t}</p>
                <p className="mt-1 text-xs leading-5 text-muted">{f.b}</p>
              </motion.div>
            ))}
          </div>
        </section>

        {/* How to start */}
        <section className="mt-8">
          <h2 className="text-xl font-bold">{tr("كيف تبدأ؟", "How to start")}</h2>
          <ol className="mt-4 space-y-3">
            {t.steps.map((s, i) => (
              <motion.li
                key={s}
                initial={{ opacity: 0, y: 14 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.08 }}
                className="flex items-center gap-3 rounded-2xl border border-line bg-card p-3"
              >
                <span className="num flex size-9 shrink-0 items-center justify-center rounded-full bg-primary text-sm font-bold text-on-primary">{i + 1}</span>
                <span className="text-sm">{s}</span>
              </motion.li>
            ))}
          </ol>
        </section>

        {/* Put it on the home screen */}
        <section className="mt-8 rounded-2xl border border-dashed border-line-strong p-4">
          <p className="flex items-center gap-2 font-bold">
            <Download className="size-5 text-action" /> {tr("ضعه على شاشة جوالك", "Put it on your home screen")}
          </p>
          <p className="mt-1 text-sm text-muted">
            {ios
              ? tr("في Safari اضغط زر المشاركة ثم «إضافة إلى الشاشة الرئيسية»، فيصير له أيقونة كأي تطبيق.", "In Safari, press Share, then “Add to Home Screen”: it gets an icon like any app.")
              : tr("يُفتح من أيقونته كأي تطبيق، بلا متجر ولا تحميل كبير.", "It opens from its own icon like any app, with no store and no big download.")}
          </p>
          {install && (
            <button
              type="button"
              onClick={async () => {
                await install.prompt();
                setInstall(null);
              }}
              className="mt-3 inline-flex h-11 items-center gap-2 rounded-xl border border-line-strong bg-card px-4 text-sm font-bold transition hover:bg-card-2 active:scale-[0.98]"
            >
              <Download className="size-4" /> {tr("ثبّت التطبيق", "Install the app")}
            </button>
          )}
          {ios && (
            <p className="mt-2 flex items-center gap-1.5 text-xs text-faint">
              <Share className="size-3.5" /> {tr("زر المشاركة أسفل الشاشة في Safari", "The Share button at the bottom of Safari")}
            </p>
          )}
        </section>

        <p className="mt-8 text-center text-xs text-muted">
          <Link href="/" className="underline-offset-2 hover:underline">
            {tr("الموقع الرئيسي", "Main website")}
          </Link>
          {" · "}
          <Link href={app === "client" ? "/driver" : "/client"} className="underline-offset-2 hover:underline">
            {app === "client" ? tr("تطبيق المندوبين", "The reps' app") : tr("تطبيق المحلات", "The shops' app")}
          </Link>
        </p>
      </main>

      {/* The buttons, always at the thumb */}
      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-bg/90 px-4 pb-[calc(env(safe-area-inset-bottom)+12px)] pt-3 backdrop-blur">
        <div className="mx-auto flex max-w-xl gap-2">
          {mine ? (
            <Link
              href={home}
              className="flex h-13 flex-1 items-center justify-center gap-2 rounded-2xl bg-action text-base font-bold text-on-action shadow-lg transition hover:bg-action-hover active:scale-[0.98]"
            >
              {tr("افتح التطبيق", "Open the app")} <Forward className="size-5" />
            </Link>
          ) : (
            <>
              <Link
                href="/login"
                className="flex h-13 flex-1 items-center justify-center gap-2 rounded-2xl bg-action text-base font-bold text-on-action shadow-lg transition hover:bg-action-hover active:scale-[0.98]"
              >
                {tr("تسجيل الدخول", "Log in")} <Forward className="size-5" />
              </Link>
              {app === "client" && !session && (
                <Link
                  href="/register"
                  className="flex h-13 items-center justify-center gap-2 rounded-2xl border border-line-strong bg-card px-4 text-sm font-bold transition hover:bg-card-2 active:scale-[0.98]"
                >
                  <UserPlus className="size-5" /> {tr("سجّل محلك", "Register")}
                </Link>
              )}
            </>
          )}
        </div>
        {app === "driver" && !mine && (
          <p className="mx-auto mt-2 max-w-xl text-center text-[11px] text-muted">
            {tr("حساب المندوب يفتحه المدير، وتدخل برقم هاتفك.", "The manager opens a rep's account; you log in with your phone number.")}
          </p>
        )}
      </div>
    </div>
  );
}

type Feature = { icon: LucideIcon; t: string; b: string };
type Text = { appName: string; forWho: string; title: string; sub: string; peek: Feature[]; featuresTitle: string; features: Feature[]; steps: string[] };
type Tr = (ar: string, en: string) => string;

function clientText(tr: Tr): Text {
  return {
    appName: tr("تطبيق أصحاب المحلات", "The shop owners' app"),
    forWho: tr("لأصحاب المحلات", "for shop owners"),
    title: tr("بضاعة محلك بالجملة، من جوالك", "Your shop's wholesale goods, from your phone"),
    sub: tr(
      "اطلب في أي وقت بأسعارك الخاصة، وتابع شحنتك على الخريطة حتى تصل، واطّلع على كشف حسابك وفواتيرك.",
      "Order any time at your own prices, follow your shipment on the map until it arrives, and see your statement and invoices.",
    ),
    peek: [
      { icon: ShoppingCart, t: tr("سلّتك جاهزة", "Your basket is ready"), b: tr("8 مواد · 425,000 د.ع", "8 items · 425,000 IQD") },
      { icon: Truck, t: tr("طلبك في الطريق إليك", "Your order is on its way"), b: tr("يصل بعد 12 دقيقة تقريباً", "About 12 minutes away") },
      { icon: KeyRound, t: tr("رمز الاستلام 4827", "Delivery PIN 4827"), b: tr("أعطه للمندوب بعد أن تتأكد من البضاعة", "Give it once the goods are checked") },
    ],
    featuresTitle: tr("كل ما يحتاجه محلك", "Everything your shop needs"),
    features: [
      { icon: Tag, t: tr("أسعارك أنت", "Your own prices"), b: tr("ترى سعر نوع زبونك والعروض الخاصة بمحلك فقط.", "You see your tier's price and your shop's special offers.") },
      { icon: MapPinned, t: tr("تتبّع الشحنة", "Track the shipment"), b: tr("موقع المندوب على الخريطة مباشرة، ووقت الوصول.", "The rep's place on the map, live, with the arrival time.") },
      { icon: FileText, t: tr("كشف حسابك", "Your statement"), b: tr("كل فاتورة وتسديد، والرصيد، وتطبع فواتيرك.", "Every invoice and payment, the balance, and printable invoices.") },
      { icon: Wallet, t: tr("ادفع من جوالك", "Pay from your phone"), b: tr("ببطاقة كي كارد، ويُخصم من أقدم فاتورة.", "With Qi Card; it pays the oldest invoice first.") },
      { icon: BellRing, t: tr("تنبيه بكل جديد", "Alerts for everything"), b: tr("عند اعتماد طلبك وخروجه ووصوله.", "When your order is approved, leaves and arrives.") },
      { icon: PackageCheck, t: tr("استلام آمن", "Safe hand-over"), b: tr("لا يُسلَّم إلا برمزك وبصورة للبضاعة.", "Only with your PIN and a photo of the goods.") },
    ],
    steps: [
      tr("سجّل محلك برقم هاتفك، أو ادخل إذا كان لك حساب.", "Register your shop with your phone number, or log in."),
      tr("تراجع الشركة معلوماتك وتحدد أسعارك.", "The company checks your details and sets your prices."),
      tr("اطلب، وتابع شحنتك حتى باب محلك.", "Order, and follow your shipment to your door."),
    ],
  };
}

function driverText(tr: Tr): Text {
  return {
    appName: tr("تطبيق المندوبين", "The reps' app"),
    forWho: tr("لمندوبي البيع والتوصيل", "for sales and delivery reps"),
    title: tr("جولتك كلها في جيبك", "Your whole round in your pocket"),
    sub: tr(
      "المحلات التي ستزورها اليوم على الخريطة بالترتيب، وشحناتك المحمّلة، والتسليم برمز صاحب المحل وصورة.",
      "Today's shops on the map in order, the shipments in your van, and the hand-over with the shop owner's PIN and a photo.",
    ),
    peek: [
      { icon: Route, t: tr("5 محلات اليوم", "5 shops today"), b: tr("التالي: بقالة أبو علي · 2.4 كم", "Next: Abu Ali grocery · 2.4 km") },
      { icon: QrCode, t: tr("امسح ملصق الشحنة", "Scan the shipment label"), b: tr("ORD-000277 · محمّلة في سيارتك", "ORD-000277 · in your van") },
      { icon: Camera, t: tr("صوّر البضاعة واكتب الرمز", "Photo + the shop's PIN"), b: tr("وتصدر الفاتورة عند التسليم", "The invoice is made on delivery") },
    ],
    featuresTitle: tr("مصمَّم للطريق", "Made for the road"),
    features: [
      { icon: Route, t: tr("جولة اليوم", "Today's trip"), b: tr("اختر المحلات، ويرتّبها لك على الخريطة.", "Pick the shops; it orders them on the map.") },
      { icon: QrCode, t: tr("مسح الملصق", "Scan the label"), b: tr("بالكاميرا عند استلام الشحنة من المخزن.", "With the camera when you take the shipment.") },
      { icon: KeyRound, t: tr("تسليم مضمون", "A sure hand-over"), b: tr("برمز صاحب المحل وصورة للبضاعة.", "With the shop owner's PIN and a photo.") },
      { icon: ShoppingCart, t: tr("طلبات وتسديدات", "Orders and payments"), b: tr("لمندوب البيع: طلب جديد واستلام تسديد في المحل.", "For sales reps: a new order and a payment in the shop.") },
      { icon: WifiOff, t: tr("بلا إنترنت أيضاً", "Offline too"), b: tr("يُحفظ عملك على الجوال ويُرسَل عند عودة الشبكة.", "Your work is saved and sent when the network is back.") },
      { icon: BellRing, t: tr("تنبيه عند التحميل", "Told when loaded"), b: tr("يصلك إشعار حين تُحمَّل شحنة في سيارتك.", "You are told when a shipment is put in your van.") },
    ],
    steps: [
      tr("ادخل برقم هاتفك (حسابك يفتحه المدير).", "Log in with your phone number (the manager opens your account)."),
      tr("استلم شحناتك من المخزن وامسح ملصقاتها.", "Take your shipments at the warehouse and scan their labels."),
      tr("اختر جولتك، وسلّم برمز صاحب المحل.", "Pick your trip, and deliver with the shop owner's PIN."),
    ],
  };
}
