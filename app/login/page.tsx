"use client";

// The login page, after the "Login Page Illustration - Online Payment" shot Yasser chose:
// a strong background, one big rounded card, the illustration on one side and a light form on the other
// ("Hello, welcome back", underline fields, one big button, sign-up link). Made in our warehouse colors.
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { ArrowLeft, ArrowRight, Boxes, Calculator, Eye, EyeOff, Info, LayoutDashboard, Loader2, Lock, Phone, Store, Truck, UserPlus, type LucideIcon } from "lucide-react";
import { rise, stagger } from "@/components/auth";
import { LoginArt } from "@/components/login-art";
import { LogoMark } from "@/components/logo";
import { roleName } from "@/components/status";
import { LanguageSwitch, ThemeToggle } from "@/components/switches";
import { errorText } from "@/components/ui";
import { api } from "@/lib/api";
import type { Role } from "@/lib/api/types";
import { homeOf, setSession, takeNext, useSession } from "@/lib/auth";
import { USE_MOCK } from "@/lib/config";
import { useFmt } from "@/lib/i18n";
import { cn } from "@/lib/utils";

// Demo accounts, so the client can try every role. Shown only while the site runs on fake data.
const DEMO: { phone: string; role: Role; name: string; icon: LucideIcon }[] = [
  { phone: "07801000001", role: "manager", name: "حيدر الكعبي", icon: LayoutDashboard },
  { phone: "07801000004", role: "rep", name: "حسين علي", icon: Truck },
  { phone: "07801000002", role: "warehouse", name: "كرار جاسم", icon: Boxes },
  { phone: "07801000007", role: "accountant", name: "زينب كاظم", icon: Calculator },
  { phone: "07812345601", role: "shop", name: "أسواق الكوثر", icon: Store },
];
const DEMO_PASSWORD = "123456";

export default function LoginPage() {
  const { tr, lang } = useFmt();
  const router = useRouter();
  const session = useSession();
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [forgot, setForgot] = useState(false);
  const Back = lang === "ar" ? ArrowRight : ArrowLeft;
  const Forward = lang === "ar" ? ArrowLeft : ArrowRight;

  // The browser's back arrow on the login page goes to the website's home page.
  // Without this, "back" walked through the pages you had opened before (they all need a login),
  // so you landed on the login page again and again.
  // How: add one copy of this page to the history; pressing back uses that copy up, and we move to "/".
  useEffect(() => {
    if (!(history.state as { loginGuard?: boolean } | null)?.loginGuard) {
      // Keep Next's own data in the history entry (it needs it), and add our mark.
      history.pushState({ ...(history.state as object | null), loginGuard: true }, "", location.href);
    }
    const onBack = () => router.replace("/");
    window.addEventListener("popstate", onBack);
    return () => window.removeEventListener("popstate", onBack);
  }, [router]);

  // Already logged in (you opened /login while logged in): go straight to your own home page.
  // Not right after pressing "login": then login() below decides where to go (maybe the page you wanted),
  // and this would race it and always win with the home page.
  const loggingIn = useRef(false);
  useEffect(() => {
    if (session && !loggingIn.current) router.replace(homeOf(session.user.role));
  }, [session, router]);

  async function login(p: string, pw: string, key: string) {
    setBusy(key);
    setError(null);
    try {
      const s = await api.login(p, pw);
      loggingIn.current = true;
      setSession(s);
      // Back to the page you wanted before logging in (only pages of this site), or your home page.
      router.replace(takeNext() ?? homeOf(s.user.role));
    } catch (e) {
      setError(errorText(e, tr));
      setBusy(null);
    }
  }

  return (
    <div className="brand-panel relative flex min-h-dvh flex-col overflow-hidden">
      <div className="brand-grid absolute inset-0" aria-hidden />
      {/* Big translucent shapes floating in the background, like the design */}
      <div className="pointer-events-none absolute -start-24 top-24 size-72 rotate-12 rounded-[48px] bg-white/[0.04]" aria-hidden />
      <div className="pointer-events-none absolute -end-16 bottom-10 size-80 -rotate-12 rounded-[56px] bg-[#e1692b]/10" aria-hidden />

      {/* Top bar */}
      <div className="relative flex items-center justify-between gap-2 p-4 sm:p-6">
        <Link href="/" className="flex items-center gap-2 rounded-xl px-2 py-1.5 text-sm font-medium text-white/90 hover:bg-white/10">
          <Back className="size-4" aria-hidden />
          <LogoMark size={28} />
          <span className="hidden sm:inline">{tr("النهرين", "Al-Nahrain")}</span>
        </Link>
        <div className="flex gap-2">
          <LanguageSwitch onBrand />
          <ThemeToggle onBrand />
        </div>
      </div>

      <main className="relative flex flex-1 items-center justify-center px-3 pb-8 sm:px-6">
        <motion.div
          initial={{ opacity: 0, y: 24, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
          className="grid w-full max-w-5xl overflow-hidden rounded-[32px] bg-card text-text shadow-[0_40px_120px_-30px_rgb(0_0_0/0.6)] lg:grid-cols-[1.1fr_1fr]"
        >
          {/* The illustration side */}
          <div className="relative flex items-center justify-center bg-gradient-to-br from-[#e1692b]/10 via-card-2 to-card-2 px-6 pb-0 pt-4 lg:p-10">
            <div className="w-full max-w-[220px] sm:max-w-[300px] lg:max-w-none">
              <LoginArt />
            </div>
            <p className="absolute bottom-4 start-6 hidden max-w-xs text-sm text-muted lg:block">
              {tr("المخزون والطلبات والديون في مكان واحد، حتى بدون إنترنت.", "Stock, orders and debts in one place, even offline.")}
            </p>
          </div>

          {/* The form side */}
          <div className="flex flex-col justify-center p-6 pt-4 sm:p-10">
            <motion.div variants={stagger} initial="hidden" animate="show">
              <motion.h1 variants={rise} className="text-3xl font-bold leading-tight sm:text-4xl">
                {tr("أهلاً،", "Hello,")}
                <span className="block">{tr("مرحباً بعودتك", "Welcome back")}</span>
              </motion.h1>
              <motion.p variants={rise} className="mt-2 text-sm text-muted">
                {tr("سجّل الدخول برقم هاتفك وكلمة المرور", "Log in with your phone number and password")}
              </motion.p>

              <form
                className="mt-8 space-y-6"
                noValidate
                onSubmit={(e) => {
                  e.preventDefault();
                  if (!phone.trim() || !password) {
                    setError(tr("اكتب رقم الهاتف وكلمة المرور", "Enter your phone number and password"));
                    return;
                  }
                  login(phone, password, "form");
                }}
              >
                <motion.div variants={rise}>
                  <LineField id="phone" label={tr("رقم الهاتف", "Phone number")} icon={Phone}>
                    <input id="phone" type="tel" inputMode="tel" autoComplete="username" dir="ltr" placeholder="07XX XXX XXXX" value={phone} onChange={(e) => setPhone(e.target.value)} className={lineInput} />
                  </LineField>
                </motion.div>
                <motion.div variants={rise}>
                  <LineField
                    id="password"
                    label={tr("كلمة المرور", "Password")}
                    icon={Lock}
                    end={
                      <button type="button" onClick={() => setShow((s) => !s)} aria-label={show ? tr("إخفاء", "Hide") : tr("إظهار", "Show")} className="flex size-10 shrink-0 items-center justify-center text-faint hover:text-text">
                        {show ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                      </button>
                    }
                  >
                    <input id="password" type={show ? "text" : "password"} autoComplete="current-password" dir="ltr" value={password} onChange={(e) => setPassword(e.target.value)} className={lineInput} />
                  </LineField>
                </motion.div>

                <motion.div variants={rise} className="flex justify-end text-xs">
                  <button type="button" onClick={() => setForgot((f) => !f)} aria-expanded={forgot} className="font-semibold text-muted hover:text-text">
                    {tr("نسيت كلمة المرور؟", "Forgot your password?")}
                  </button>
                </motion.div>
                <AnimatePresence initial={false}>
                  {forgot && (
                    <motion.p initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} className="-mt-3 flex items-start gap-2 overflow-hidden rounded-xl bg-card-2 p-3 text-xs text-muted">
                      <Info className="mt-0.5 size-3.5 shrink-0" />
                      {tr("كلمات المرور يضبطها مدير الشركة. اتصل به ليعطيك كلمة مرور جديدة.", "Passwords are set by the company manager. Call him for a new one.")}
                    </motion.p>
                  )}
                </AnimatePresence>

                {error && (
                  <motion.p initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} role="alert" className="rounded-xl bg-danger-soft px-3 py-2.5 text-sm font-medium text-danger">
                    {error}
                  </motion.p>
                )}

                <motion.button
                  variants={rise}
                  type="submit"
                  whileTap={{ scale: 0.98 }}
                  disabled={!!busy}
                  className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-action text-base font-bold text-on-action shadow-[0_12px_30px_-10px_rgb(225_105_43/0.7)] transition hover:bg-action-hover disabled:opacity-70"
                >
                  {busy === "form" ? <Loader2 className="size-5 animate-spin" /> : null}
                  {tr("دخول", "Log in")}
                  {busy !== "form" && <Forward className="size-5" />}
                </motion.button>
              </form>

              <motion.p variants={rise} className="mt-5 text-center text-sm text-muted">
                {tr("صاحب محل وليس لديك حساب؟", "A shop owner without an account?")}{" "}
                <Link href="/register" className="inline-flex items-center gap-1 font-bold text-action hover:underline">
                  <UserPlus className="size-4" /> {tr("سجّل محلك", "Register your shop")}
                </Link>
              </motion.p>
            </motion.div>

            {USE_MOCK && (
              <div className="mt-8 border-t border-line pt-5">
                <div className="mb-3 flex items-center justify-between gap-2">
                  <p className="text-xs font-semibold text-muted">{tr("جرّب النظام بضغطة واحدة", "Try it with one tap")}</p>
                  <span className="rounded-lg bg-card-2 px-2 py-0.5 text-[11px] text-muted">
                    {tr("كلمة المرور", "Password")} <b className="num" dir="ltr">{DEMO_PASSWORD}</b>
                  </span>
                </div>
                <div className="flex flex-wrap gap-2">
                  {DEMO.map((d) => (
                    <button
                      key={d.phone}
                      type="button"
                      disabled={!!busy}
                      title={d.name}
                      onClick={() => {
                        setPhone(d.phone);
                        setPassword(DEMO_PASSWORD);
                        login(d.phone, DEMO_PASSWORD, d.phone);
                      }}
                      className={cn("flex items-center gap-1.5 rounded-full border border-line-strong px-3 py-1.5 text-xs font-semibold transition hover:border-action hover:text-action disabled:opacity-60", busy === d.phone && "border-action text-action")}
                    >
                      {busy === d.phone ? <Loader2 className="size-3.5 animate-spin" /> : <d.icon className="size-3.5" />}
                      {roleName(d.role, tr)}
                      <span className="sr-only">{d.name}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </motion.div>
      </main>
    </div>
  );
}

const lineInput = "h-11 w-full bg-transparent pe-2 ps-9 text-base outline-none placeholder:text-faint";

/** The design's "underline only" field: a thin line that turns orange and grows from the middle on focus. */
function LineField({ id, label, icon: Icon, end, children }: { id: string; label: string; icon: LucideIcon; end?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div>
      <label htmlFor={id} className="text-xs font-semibold text-muted">
        {label}
      </label>
      <div dir="ltr" className="group relative mt-1 flex items-center border-b-2 border-line-strong">
        <Icon className="pointer-events-none absolute start-1 size-[18px] text-faint transition group-focus-within:text-action" aria-hidden />
        {children}
        {end}
        <span className="absolute inset-x-0 -bottom-0.5 h-0.5 origin-center scale-x-0 bg-action transition-transform duration-300 group-focus-within:scale-x-100" aria-hidden />
      </div>
    </div>
  );
}
