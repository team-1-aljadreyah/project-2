"use client";

// Pieces shared by the login and sign-up pages: the dark brand panel, the top bar and the inputs with an icon.
import Link from "next/link";
import { motion } from "motion/react";
import { ArrowLeft, ArrowRight, CheckCircle2, ShieldCheck, Truck, WifiOff, type LucideIcon } from "lucide-react";
import { LogoMark } from "@/components/logo";
import { LanguageSwitch, ThemeToggle } from "@/components/switches";
import { useFmt } from "@/lib/i18n";

// Children appear one after another (a small "stagger").
export const stagger = { hidden: {}, show: { transition: { staggerChildren: 0.06, delayChildren: 0.1 } } };
export const rise = { hidden: { opacity: 0, y: 12 }, show: { opacity: 1, y: 0, transition: { type: "spring" as const, stiffness: 260, damping: 24 } } };

/** The dark graphite panel with the orange glow, used on big screens next to the form. */
export function BrandPanel({ variant }: { variant: "login" | "register" }) {
  const { tr } = useFmt();
  const login = variant === "login";
  const points = login
    ? [
        tr("الدفعة الأقدم صلاحية تطلع أولاً، والمنتهية ما تنباع", "Oldest expiry leaves first, expired is never sold"),
        tr("المندوب يطلب من جواله حتى بدون إنترنت", "Reps order from their phone, even offline"),
        tr("سقف دين لكل زبون وكشف حساب واضح", "A debt limit and a clear statement for every shop"),
      ]
    : [
        tr("أسعار الجملة الخاصة بمحلك", "Your shop's own wholesale prices"),
        tr("اطلب بأي وقت من جوالك، والطلب يوصل لمندوبك", "Order any time from your phone; it reaches your rep"),
        tr("كشف حسابك وتسديداتك واضحة دائماً", "Your statement and payments, always clear"),
      ];
  return (
    <section className="brand-panel relative hidden overflow-hidden p-12 lg:flex lg:flex-col lg:justify-between">
      <div className="brand-grid absolute inset-0" aria-hidden />
      <div className="relative flex items-center gap-3">
        <LogoMark size={48} />
        <div>
          <p className="text-lg font-bold">{tr("شركة النهرين", "Al-Nahrain Co.")}</p>
          <p className="text-sm opacity-75">{tr("للمواد الغذائية بالجملة · كربلاء", "Wholesale foods · Karbala")}</p>
        </div>
      </div>

      <div className="relative max-w-lg">
        <motion.h2 initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }} className="text-4xl font-bold leading-snug xl:text-5xl">
          {login ? tr("المخزون والديون والمندوبين", "Stock, debts and reps") : tr("سجّل محلك", "Register your shop")}
          <span className="block text-[#f5b48a]">{login ? tr("بمكان واحد", "in one place") : tr("واطلب بنفسك", "and order by yourself")}</span>
        </motion.h2>
        <motion.ul variants={stagger} initial="hidden" animate="show" className="mt-8 space-y-3">
          {points.map((p) => (
            <motion.li key={p} variants={rise} className="flex items-start gap-3 text-base">
              <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-[#f5b48a]" aria-hidden />
              <span className="opacity-90">{p}</span>
            </motion.li>
          ))}
        </motion.ul>

        {/* A small "live" card, to show what the system feels like. */}
        <div className="float mt-10 max-w-sm rounded-2xl border border-white/10 bg-white/10 p-4 backdrop-blur-md">
          {login ? (
            <>
              <div className="flex items-center justify-between text-sm">
                <span className="opacity-80">{tr("طلب جديد من المندوب", "New order from a rep")}</span>
                <span className="flex items-center gap-1 rounded-full bg-[#e1692b]/25 px-2 py-0.5 text-xs text-[#f5b48a]">
                  <WifiOff className="size-3" /> {tr("انحفظ بدون نت", "Saved offline")}
                </span>
              </div>
              <p className="mt-2 text-lg font-bold">{tr("أسواق الكوثر", "Al-Kawthar Market")}</p>
              <div className="mt-2 flex items-center justify-between text-sm opacity-85">
                <span>{tr("3 مواد · 6 كارتون", "3 items · 6 cartons")}</span>
                <span className="num font-semibold">425,000 {tr("د.ع", "IQD")}</span>
              </div>
            </>
          ) : (
            <>
              <div className="flex items-center justify-between text-sm">
                <span className="opacity-80">{tr("طلبك وصل للشركة", "Your order reached the company")}</span>
                <span className="flex items-center gap-1 rounded-full bg-[#e1692b]/25 px-2 py-0.5 text-xs text-[#f5b48a]">
                  <Truck className="size-3" /> {tr("بالطريق", "On its way")}
                </span>
              </div>
              <p className="mt-2 text-lg font-bold">{tr("رز بسمتي · 4 كارتون", "Basmati rice · 4 cartons")}</p>
              <div className="mt-2 flex items-center justify-between text-sm opacity-85">
                <span>{tr("مندوبك: حسين علي", "Your rep: Hussein Ali")}</span>
                <span className="num font-semibold">177,000 {tr("د.ع", "IQD")}</span>
              </div>
            </>
          )}
        </div>
      </div>

      <p className="relative flex items-center gap-2 text-sm opacity-70">
        <ShieldCheck className="size-4" aria-hidden />
        {login
          ? tr("التسديدات ما تنحذف، وكل تعديل ينسجل باسم صاحبه", "Payments are never deleted, and every change is logged by name")
          : tr("الشركة تراجع كل محل جديد قبل أول طلب", "The company checks every new shop before the first order")}
      </p>
      {/* Safety-tape stripe at the bottom edge, a warehouse touch */}
      <div className="hazard absolute inset-x-0 bottom-0 h-1.5 opacity-90" aria-hidden />
    </section>
  );
}

/** Top of the form side: back to the home page, language and day/night. On phones it sits on the dark band. */
export function AuthTopBar() {
  const { tr, lang } = useFmt();
  const Back = lang === "ar" ? ArrowRight : ArrowLeft;
  return (
    <div className="relative flex items-center justify-between gap-2 p-4 sm:p-6">
      <Link href="/" className="flex items-center gap-1.5 rounded-xl px-2 py-1.5 text-sm font-medium text-white hover:bg-white/10 lg:text-muted lg:hover:bg-card-2 lg:hover:text-text">
        <Back className="size-4" aria-hidden /> {tr("الصفحة الرئيسية", "Home")}
      </Link>
      <div className="flex gap-2">
        <LanguageSwitch className="max-lg:border-white/20 max-lg:bg-white/10 max-lg:text-white" />
        <ThemeToggle className="max-lg:border-white/20 max-lg:bg-white/10 max-lg:text-white" />
      </div>
    </div>
  );
}

/** The dark band behind the form on phones (on big screens the brand panel is on the side). */
export function PhoneBand() {
  return (
    <div className="brand-panel absolute inset-x-0 top-0 h-64 lg:hidden" aria-hidden>
      <div className="brand-grid absolute inset-0" />
      <div className="hazard absolute inset-x-0 bottom-0 h-1" />
    </div>
  );
}

/** An input with an icon at the start, inside one rounded box. */
export function IconField({
  icon: Icon,
  label,
  htmlFor,
  end,
  error,
  hint,
  ltr,
  children,
}: {
  icon: LucideIcon;
  label: string;
  htmlFor: string;
  end?: React.ReactNode;
  error?: string;
  hint?: string;
  /** Phone numbers and passwords are typed left to right, so their box is LTR in both languages. */
  ltr?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label htmlFor={htmlFor} className="mb-1.5 block text-sm font-medium">
        {label}
      </label>
      <div
        dir={ltr ? "ltr" : undefined}
        className={
          "relative flex items-center rounded-xl border bg-card transition focus-within:ring-4 " +
          (error ? "border-danger focus-within:border-danger focus-within:ring-danger/15" : "border-line-strong focus-within:border-action focus-within:ring-action/15")
        }
      >
        <Icon className="pointer-events-none absolute start-3.5 size-[18px] text-faint" aria-hidden />
        {children}
        {end}
      </div>
      {error ? <p className="mt-1 text-xs text-danger">{error}</p> : hint ? <p className="mt-1 text-xs text-faint">{hint}</p> : null}
    </div>
  );
}

/** The class for the <input> inside an IconField. */
export const iconInput = "h-12 w-full bg-transparent pe-3 ps-11 text-base outline-none placeholder:text-faint";
