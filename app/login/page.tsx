"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { motion } from "motion/react";
import { ArrowLeft, ArrowRight, Boxes, Calculator, Eye, EyeOff, LayoutDashboard, Loader2, Lock, Phone, ShieldCheck, Store, Truck, UserPlus, type LucideIcon } from "lucide-react";
import { AuthTopBar, BrandPanel, IconField, PhoneBand, iconInput, rise, stagger } from "@/components/auth";
import { LogoMark } from "@/components/logo";
import { roleName } from "@/components/status";
import { errorText } from "@/components/ui";
import { api } from "@/lib/api";
import type { Role } from "@/lib/api/types";
import { homeOf, setSession, useSession } from "@/lib/auth";
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
  const Forward = lang === "ar" ? ArrowLeft : ArrowRight;

  // Already logged in: go straight to your own home page.
  useEffect(() => {
    if (session) router.replace(homeOf(session.user.role));
  }, [session, router]);

  async function login(p: string, pw: string, key: string) {
    setBusy(key);
    setError(null);
    try {
      const s = await api.login(p, pw);
      setSession(s);
      const next = new URLSearchParams(window.location.search).get("next");
      // Only go back to a page on this site ("/..."), never to another website ("//evil.com").
      router.replace(next && next.startsWith("/") && !next.startsWith("//") ? next : homeOf(s.user.role));
    } catch (e) {
      setError(errorText(e, tr));
      setBusy(null);
    }
  }

  return (
    <div className="grid min-h-dvh bg-bg lg:grid-cols-[1.05fr_1fr]">
      <BrandPanel variant="login" />

      <main className="relative flex min-h-dvh flex-col">
        <PhoneBand />
        <AuthTopBar />

        <div className="relative flex flex-1 items-start justify-center px-4 pb-10 lg:items-center">
          <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, ease: "easeOut" }} className="w-full max-w-md">
            <div className="mb-6 flex items-center gap-3 text-white lg:hidden">
              <LogoMark size={48} />
              <div>
                <p className="text-xl font-bold">{tr("النهرين", "Al-Nahrain")}</p>
                <p className="text-sm opacity-80">{tr("للمواد الغذائية بالجملة · كربلاء", "Wholesale foods · Karbala")}</p>
              </div>
            </div>

            <div className="rounded-3xl border border-line bg-card p-6 shadow-[0_20px_60px_-20px_rgb(17_19_23/0.22)] sm:p-8">
              <h1 className="text-2xl font-bold">{tr("أهلاً بك من جديد", "Welcome back")}</h1>
              <p className="mt-1 text-sm text-muted">{tr("سجّل الدخول برقم هاتفك وكلمة المرور", "Log in with your phone number and password")}</p>

              <form
                className="mt-6 space-y-4"
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
                <IconField icon={Phone} label={tr("رقم الهاتف", "Phone number")} htmlFor="phone" ltr>
                  <input id="phone" type="tel" inputMode="tel" autoComplete="username" dir="ltr" placeholder="07XX XXX XXXX" value={phone} onChange={(e) => setPhone(e.target.value)} className={iconInput} />
                </IconField>
                <IconField
                  icon={Lock}
                  label={tr("كلمة المرور", "Password")}
                  htmlFor="password"
                  ltr
                  end={
                    <button type="button" onClick={() => setShow((s) => !s)} aria-label={show ? tr("إخفاء", "Hide") : tr("إظهار", "Show")} className="flex h-12 w-11 shrink-0 items-center justify-center text-faint hover:text-text">
                      {show ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                    </button>
                  }
                >
                  <input id="password" type={show ? "text" : "password"} autoComplete="current-password" dir="ltr" value={password} onChange={(e) => setPassword(e.target.value)} className={cn(iconInput, "pe-0")} />
                </IconField>

                {error && (
                  <motion.p initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} role="alert" className="rounded-xl bg-danger-soft px-3 py-2.5 text-sm font-medium text-danger">
                    {error}
                  </motion.p>
                )}

                <motion.button
                  type="submit"
                  whileTap={{ scale: 0.98 }}
                  disabled={!!busy}
                  className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-action text-base font-bold text-on-action transition hover:bg-action-hover disabled:opacity-70"
                >
                  {busy === "form" ? <Loader2 className="size-5 animate-spin" /> : null}
                  {tr("دخول", "Log in")}
                  {busy !== "form" && <Forward className="size-5" />}
                </motion.button>
              </form>

              {/* New shops make their own account */}
              <div className="mt-6 flex items-center gap-3 text-xs text-faint">
                <span className="h-px flex-1 bg-line" />
                {tr("صاحب محل وليس لديك حساب؟", "A shop owner without an account?")}
                <span className="h-px flex-1 bg-line" />
              </div>
              <Link
                href="/register"
                className="mt-3 flex h-12 w-full items-center justify-center gap-2 rounded-xl border-2 border-primary text-base font-bold text-primary-ink transition hover:bg-primary hover:text-on-primary"
              >
                <UserPlus className="size-5" /> {tr("سجّل محلك", "Register your shop")}
              </Link>

              <p className="mt-4 flex items-center justify-center gap-1.5 text-xs text-faint">
                <ShieldCheck className="size-3.5" /> {tr("كل موظف يرى ما يخص عمله فقط", "Each person sees only what their job needs")}
              </p>
            </div>

            {USE_MOCK && (
              <div className="mt-6">
                <div className="mb-3 flex items-end justify-between gap-2">
                  <div>
                    <p className="text-sm font-semibold">{tr("جرّب النظام", "Try the system")}</p>
                    <p className="text-xs text-muted">{tr("ادخل بأي دور بضغطة واحدة", "Enter as any role with one tap")}</p>
                  </div>
                  <span className="rounded-lg bg-card-2 px-2 py-1 text-xs text-muted">
                    {tr("كلمة المرور", "Password")} <b className="num" dir="ltr">{DEMO_PASSWORD}</b>
                  </span>
                </div>
                <motion.div variants={stagger} initial="hidden" animate="show" className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                  {DEMO.map((d) => (
                    <motion.button
                      key={d.phone}
                      variants={rise}
                      whileHover={{ y: -2 }}
                      whileTap={{ scale: 0.97 }}
                      type="button"
                      disabled={!!busy}
                      onClick={() => {
                        setPhone(d.phone);
                        setPassword(DEMO_PASSWORD);
                        login(d.phone, DEMO_PASSWORD, d.phone);
                      }}
                      className={cn(
                        "group flex flex-col items-start gap-2 rounded-2xl border border-line bg-card p-3 text-start transition hover:border-action hover:shadow-card disabled:opacity-60",
                        busy === d.phone && "border-action",
                      )}
                    >
                      <span className="flex size-9 items-center justify-center rounded-xl bg-primary-soft text-primary-ink transition group-hover:bg-action group-hover:text-on-action">
                        {busy === d.phone ? <Loader2 className="size-4 animate-spin" /> : <d.icon className="size-4" />}
                      </span>
                      <span className="min-w-0">
                        <span className="block text-sm font-semibold">{roleName(d.role, tr)}</span>
                        <span className="block truncate text-xs text-muted">{d.name}</span>
                      </span>
                    </motion.button>
                  ))}
                </motion.div>
              </div>
            )}
          </motion.div>
        </div>
      </main>
    </div>
  );
}
