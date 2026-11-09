"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Eye, EyeOff, Languages, Moon, Sun } from "lucide-react";
import { LogoMark } from "@/components/logo";
import { roleName } from "@/components/status";
import { Button, Field, IconButton, Input, Notice, errorText } from "@/components/ui";
import { api } from "@/lib/api";
import type { Role } from "@/lib/api/types";
import { homeOf, setSession, useSession } from "@/lib/auth";
import { USE_MOCK } from "@/lib/config";
import { useFmt, useToggleLang } from "@/lib/i18n";
import { setTheme, useTheme } from "@/lib/theme";

// Demo accounts, so the client can try every role. Shown only while the site runs on fake data.
const DEMO: { phone: string; role: Role; name: string }[] = [
  { phone: "07801000001", role: "manager", name: "حيدر الكعبي" },
  { phone: "07801000002", role: "warehouse", name: "كرار جاسم" },
  { phone: "07801000004", role: "rep", name: "حسين علي" },
  { phone: "07801000007", role: "accountant", name: "زينب كاظم" },
  { phone: "07812345601", role: "shop", name: "أسواق الكوثر" },
];
const DEMO_PASSWORD = "123456";

export default function LoginPage() {
  const { tr, lang } = useFmt();
  const toggleLang = useToggleLang();
  const theme = useTheme();
  const router = useRouter();
  const session = useSession();
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

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
      router.replace(next && next.startsWith("/") && !next.startsWith("//") ? next : homeOf(s.user.role));
    } catch (e) {
      setError(errorText(e, tr));
      setBusy(null);
    }
  }

  return (
    <div className="grid min-h-dvh lg:grid-cols-[1.1fr_1fr]">
      <section className="relative hidden overflow-hidden bg-[#0c447c] p-12 text-white lg:flex lg:flex-col lg:justify-between">
        <div className="flex items-center gap-3">
          <LogoMark size={44} />
          <div>
            <p className="text-lg font-bold">{tr("شركة النهرين", "Al-Nahrain Co.")}</p>
            <p className="text-sm opacity-80">{tr("للمواد الغذائية بالجملة - كربلاء", "Wholesale foods - Karbala")}</p>
          </div>
        </div>
        <div className="max-w-md">
          <h1 className="text-4xl font-bold leading-snug">{tr("كل البضاعة والديون في مكان واحد", "All your stock and debts in one place")}</h1>
          <ul className="mt-6 space-y-3 text-base opacity-90">
            <li>• {tr("الدفعة الأقدم صلاحية تطلع أولاً، والمنتهية ما تنباع", "Oldest expiry leaves first, expired is never sold")}</li>
            <li>• {tr("المندوب يطلب من جواله حتى بدون إنترنت", "Reps order from their phone, even offline")}</li>
            <li>• {tr("سقف دين لكل زبون وكشف حساب واضح", "A debt limit and a clear statement for every shop")}</li>
            <li>• {tr("عمولة المندوب والأرباح بدون حساب باليد", "Rep commission and profit, no hand counting")}</li>
          </ul>
        </div>
        <svg className="pointer-events-none absolute -bottom-10 start-0 w-[140%] opacity-20" viewBox="0 0 600 120" aria-hidden>
          <path d="M0 60c60-40 120-40 180 0s120 40 180 0 120-40 180 0 60 20 60 20" fill="none" stroke="currentColor" strokeWidth="10" />
          <path d="M0 100c60-40 120-40 180 0s120 40 180 0 120-40 180 0 60 20 60 20" fill="none" stroke="currentColor" strokeWidth="10" />
        </svg>
      </section>

      <section className="flex flex-col">
        <div className="flex justify-end gap-1 p-3">
          <IconButton label={lang === "ar" ? "English" : "العربية"} onClick={toggleLang}>
            <Languages className="size-5" />
          </IconButton>
          <IconButton label={tr("تبديل الوضع", "Toggle theme")} onClick={() => setTheme(theme === "dark" ? "light" : "dark")}>
            {theme === "dark" ? <Sun className="size-5" /> : <Moon className="size-5" />}
          </IconButton>
        </div>
        <div className="flex flex-1 items-start justify-center px-4 pb-10 sm:items-center">
          <div className="w-full max-w-sm">
            <div className="mb-8 flex flex-col items-center text-center lg:hidden">
              <LogoMark size={56} />
              <p className="mt-3 text-xl font-bold">{tr("النهرين للمواد الغذائية", "Al-Nahrain Foods")}</p>
              <p className="text-sm text-muted">{tr("بالجملة - كربلاء", "Wholesale - Karbala")}</p>
            </div>
            <h2 className="text-2xl font-bold">{tr("تسجيل الدخول", "Log in")}</h2>
            <p className="mt-1 text-sm text-muted">{tr("ادخل برقم هاتفك وكلمة المرور", "Use your phone number and password")}</p>

            <form
              className="mt-6 space-y-4"
              onSubmit={(e) => {
                e.preventDefault();
                if (!phone.trim() || !password) {
                  setError(tr("اكتب رقم الهاتف وكلمة المرور", "Enter your phone number and password"));
                  return;
                }
                login(phone, password, "form");
              }}
            >
              <Field label={tr("رقم الهاتف", "Phone number")} htmlFor="phone">
                <Input id="phone" type="tel" inputMode="tel" autoComplete="username" dir="ltr" className="text-start" placeholder="07801234567" value={phone} onChange={(e) => setPhone(e.target.value)} />
              </Field>
              <Field label={tr("كلمة المرور", "Password")} htmlFor="password">
                <div className="relative">
                  <Input id="password" type={show ? "text" : "password"} autoComplete="current-password" dir="ltr" className="pe-11 text-start" value={password} onChange={(e) => setPassword(e.target.value)} />
                  <button type="button" onClick={() => setShow((s) => !s)} aria-label={show ? tr("إخفاء", "Hide") : tr("إظهار", "Show")} className="absolute inset-y-0 end-0 flex w-11 items-center justify-center text-faint hover:text-text">
                    {show ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                  </button>
                </div>
              </Field>
              {error && <Notice tone="danger">{error}</Notice>}
              <Button type="submit" variant="action" size="lg" className="w-full" loading={busy === "form"}>
                {tr("دخول", "Log in")}
              </Button>
            </form>

            {USE_MOCK && (
              <div className="mt-8">
                <p className="mb-2 text-xs font-medium text-faint">
                  {tr("نسخة تجريبية: جرّب كل دور بضغطة", "Demo: try each role with one tap")} · {tr("كلمة المرور", "password")} <span dir="ltr" className="num">{DEMO_PASSWORD}</span>
                </p>
                <div className="grid gap-2">
                  {DEMO.map((d) => (
                    <button
                      key={d.phone}
                      type="button"
                      disabled={!!busy}
                      onClick={() => {
                        setPhone(d.phone);
                        setPassword(DEMO_PASSWORD);
                        login(d.phone, DEMO_PASSWORD, d.phone);
                      }}
                      className="flex items-center justify-between gap-3 rounded-xl border border-line bg-card px-3 py-2.5 text-start transition hover:border-primary disabled:opacity-60"
                    >
                      <span className="min-w-0">
                        <span className="block text-sm font-medium">{roleName(d.role, tr)}</span>
                        <span className="block truncate text-xs text-muted">{d.name}</span>
                      </span>
                      <span className="num text-xs text-faint" dir="ltr">
                        {busy === d.phone ? "…" : d.phone}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}
