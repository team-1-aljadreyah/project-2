"use client";

// A shop owner makes an account by himself. The shop waits for the manager's approval before the first order.
import { ComboBox } from "@/components/combo-box";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { motion } from "motion/react";
import { ArrowLeft, ArrowRight, Eye, EyeOff, KeyRound, Loader2, Lock, MapPin, Phone, Store, User } from "lucide-react";
import { AuthTopBar, BrandPanel, IconField, PhoneBand, iconInput } from "@/components/auth";
import { LogoMark } from "@/components/logo";
import { errorText } from "@/components/ui";
import { api, ApiError } from "@/lib/api";
import type { RegisterInput } from "@/lib/api/types";
import { homeOf, setSession, takeNext, useSession } from "@/lib/auth";
import { useFmt } from "@/lib/i18n";
import { AddressCard } from "@/components/address-form";
import { cn } from "@/lib/utils";
import { OtpDialog } from "@/components/otp";
import { usePublicRules } from "@/lib/use-rules";
import { useBrand } from "@/lib/site";

// Areas of Karbala the company already delivers to (you can still type another one).
const AREAS = ["حي الحسين", "سيف سعد", "حي العباس", "الإسكان", "حي الغدير", "باب بغداد", "حي الأسرة", "البلدية", "حي الموظفين", "حي النقيب", "عون", "حي رمضان", "المعملجي"];

type Form = RegisterInput & { confirm: string };

/** Signing up online, unless the manager closed it (advanced settings → features): then a short notice. */
export default function RegisterPage() {
  const live = usePublicRules();
  return live.self_signup ? <RegisterForm passwordMin={live.password_min} /> : <SignupClosed />;
}

function SignupClosed() {
  const { tr } = useFmt();
  const brand = useBrand();
  return (
    <div className="grid min-h-dvh bg-bg lg:grid-cols-[1.05fr_1fr]">
      <BrandPanel variant="register" />
      <main className="relative flex min-h-dvh flex-col">
        <AuthTopBar />
        <div className="flex flex-1 items-center justify-center px-4">
          <div className="w-full max-w-md rounded-3xl border border-line bg-card p-8 text-center">
            <LogoMark size={56} />
            <p className="mt-4 text-xl font-bold">{tr("التسجيل من الموقع متوقف الآن", "Signing up online is closed now")}</p>
            <p className="mt-2 text-sm text-muted">
              {tr("لفتح حساب لمحلك تواصل مع الشركة", "To open an account for your shop, contact the company")}
              {brand.phone && (
                <a href={`tel:${brand.phone}`} className="num ms-1 font-bold text-action" dir="ltr">
                  {brand.phone}
                </a>
              )}
            </p>
            <Link href="/login" className="mt-6 inline-flex h-11 items-center rounded-full bg-action px-6 font-bold text-on-action">
              {tr("تسجيل الدخول", "Log in")}
            </Link>
          </div>
        </div>
      </main>
    </div>
  );
}

function RegisterForm({ passwordMin }: { passwordMin: number }) {
  const { tr, lang } = useFmt();
  const router = useRouter();
  const session = useSession();
  const [f, setF] = useState<Form>({ shop_name: "", owner_name: "", phone: "", area: "", address: "", password: "", confirm: "" });
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  // The phone's code (OTP) window, between the form and the new account.
  const [verifying, setVerifying] = useState(false);
  const Forward = lang === "ar" ? ArrowLeft : ArrowRight;
  const set = (p: Partial<Form>) => {
    setF((x) => ({ ...x, ...p }));
    // Fix a field → its red message goes away at once.
    setErr((e) => {
      const n = { ...e };
      for (const k of Object.keys(p)) delete n[k];
      return n;
    });
  };

  // Already logged in: go to your own home page.
  useEffect(() => {
    if (session) router.replace(homeOf(session.user.role, session.user.rep_kinds));
  }, [session, router]);

  /** The same checks the server does, so mistakes show before sending. */
  function check(): Record<string, string> {
    const e: Record<string, string> = {};
    const phone = f.phone.replace(/\s/g, "").replace(/[٠-٩]/g, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d)));
    if (f.shop_name.trim().length < 3) e.shop_name = tr("اكتب اسم المحل", "Enter the shop name");
    if (f.owner_name.trim().length < 3) e.owner_name = tr("اكتب اسمك الكامل", "Enter your full name");
    if (!/^07\d{9}$/.test(phone)) e.phone = tr("رقم عراقي من 11 رقم يبدأ بـ 07", "An 11-digit Iraqi number starting with 07");
    if (!f.area.trim()) e.area = tr("اختر المنطقة", "Choose the area");
    if (!f.address_info) e.address_info = tr("أضف عنوان المحل وحدّده على الخريطة", "Add the shop's address and pin it on the map");
    if (f.password.length < passwordMin) e.password = tr(`${passwordMin} أحرف على الأقل`, `At least ${passwordMin} characters`);
    else if (f.confirm !== f.password) e.confirm = tr("كلمتا المرور غير متطابقتين", "The passwords don't match");
    return e;
  }

  /** The form is right: first the phone, by a code (then `register` runs with its token). */
  function submit() {
    const e = check();
    setErr(e);
    setError(null);
    if (Object.keys(e).length) return;
    setVerifying(true);
  }

  async function register(otpToken: string | null) {
    setVerifying(false);
    setBusy(true);
    try {
      const { confirm: _c, ...input } = f;
      void _c;
      const s = await api.register({ ...input, phone: cleanPhone, ...(otpToken ? { otp_token: otpToken } : {}) });
      setSession(s);
      router.replace(takeNext() ?? "/shop");
      // Next keeps this page's state for later: leave it empty and not "busy", or after logging out
      // the form would come back filled in with every button disabled.
      setBusy(false);
      setF({ shop_name: "", owner_name: "", phone: "", area: "", address: "", password: "", confirm: "" });
    } catch (x) {
      if (x instanceof ApiError && x.errors) setErr(x.errors);
      setError(errorText(x, tr));
      setBusy(false);
    }
  }

  const cleanPhone = f.phone.replace(/\s/g, "").replace(/[٠-٩]/g, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d)));

  // How strong the password is: length plus mixing letters and numbers.
  const strength = Math.min(3, (f.password.length >= passwordMin ? 1 : 0) + (f.password.length >= 10 ? 1 : 0) + (/\d/.test(f.password) && /\D/.test(f.password) ? 1 : 0));

  return (
    <div className="grid min-h-dvh bg-bg lg:grid-cols-[1.05fr_1fr]">
      <BrandPanel variant="register" />

      <main className="relative flex min-h-dvh flex-col">
        {verifying && <OtpDialog phone={cleanPhone} purpose="register" onVerified={register} onClose={() => setVerifying(false)} />}
        <PhoneBand />
        <AuthTopBar />

        <div className="relative flex flex-1 items-start justify-center px-4 pb-10 lg:items-center">
          <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, ease: "easeOut" }} className="w-full max-w-lg">
            <div className="mb-6 flex items-center gap-3 text-white lg:hidden">
              <LogoMark size={48} />
              <div>
                <p className="text-xl font-bold">{tr("سجّل محلك", "Register your shop")}</p>
                <p className="text-sm opacity-80">{tr("النهرين للمواد الغذائية بالجملة", "Al-Nahrain wholesale foods")}</p>
              </div>
            </div>

            <div className="rounded-3xl border border-line bg-card p-6 shadow-[0_20px_60px_-20px_rgb(17_19_23/0.22)] sm:p-8">
              <h1 className="text-2xl font-bold">{tr("حساب جديد لصاحب محل", "New account for a shop owner")}</h1>
              <p className="mt-1 text-sm text-muted">{tr("املأ معلومات محلك، وستراجعها الشركة وتحدد أسعارك، ثم يمكنك الطلب.", "Fill in your shop's details. The company checks them and sets your prices, then you can order.")}</p>

              <form
                className="mt-6 space-y-4"
                noValidate
                onSubmit={(e) => {
                  e.preventDefault();
                  submit();
                }}
              >
                <div className="grid gap-4 sm:grid-cols-2">
                  <IconField icon={Store} label={tr("اسم المحل", "Shop name")} htmlFor="shop" error={err.shop_name}>
                    <input id="shop" value={f.shop_name} onChange={(e) => set({ shop_name: e.target.value })} placeholder={tr("ماركت النخيل", "Al-Nakheel Market")} className={iconInput} autoComplete="organization" />
                  </IconField>
                  <IconField icon={User} label={tr("اسمك (صاحب المحل)", "Your name (owner)")} htmlFor="owner" error={err.owner_name}>
                    <input id="owner" value={f.owner_name} onChange={(e) => set({ owner_name: e.target.value })} className={iconInput} autoComplete="name" />
                  </IconField>
                </div>

                <IconField icon={Phone} label={tr("رقم الهاتف", "Phone number")} htmlFor="phone" error={err.phone} hint={tr("تسجّل به الدخول، ويتصل بك مندوبك عليه", "You log in with it, and your delivery rep calls you on it")} ltr>
                  <input id="phone" type="tel" inputMode="tel" dir="ltr" autoComplete="tel" placeholder="07XX XXX XXXX" value={f.phone} onChange={(e) => set({ phone: e.target.value })} className={iconInput} />
                </IconField>

                <div className="grid gap-4 sm:grid-cols-2">
                  <IconField icon={MapPin} label={tr("المنطقة", "Area")} htmlFor="area" error={err.area}>
                    <ComboBox id="area" value={f.area} onChange={(v) => set({ area: v })} options={AREAS} placeholder={tr("اختر أو اكتب", "Choose or type")} plainClassName={iconInput} />
                  </IconField>
                </div>

                <div>
                  <p className="mb-2 text-sm font-semibold">
                    {tr("عنوان المحل", "The shop's address")} <span className="text-danger">*</span>
                  </p>
                  <AddressCard value={f.address_info} onChange={(v) => set({ address_info: v ?? undefined })} error={err.address_info} defaultPhone={f.phone.replace(/\s/g, "")} />
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <IconField
                    icon={Lock}
                    label={tr("كلمة المرور", "Password")}
                    htmlFor="password"
                    error={err.password}
                    ltr
                    end={
                      <button type="button" onClick={() => setShow((s) => !s)} aria-label={show ? tr("إخفاء", "Hide") : tr("إظهار", "Show")} className="flex h-12 w-11 shrink-0 items-center justify-center text-faint hover:text-text">
                        {show ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                      </button>
                    }
                  >
                    <input id="password" type={show ? "text" : "password"} dir="ltr" autoComplete="new-password" value={f.password} onChange={(e) => set({ password: e.target.value })} className={cn(iconInput, "pe-0")} />
                  </IconField>
                  <IconField icon={KeyRound} label={tr("أعد كلمة المرور", "Repeat password")} htmlFor="confirm" error={err.confirm} ltr>
                    <input id="confirm" type={show ? "text" : "password"} dir="ltr" autoComplete="new-password" value={f.confirm} onChange={(e) => set({ confirm: e.target.value })} className={iconInput} />
                  </IconField>
                </div>
                {f.password && (
                  <div className="flex items-center gap-2" aria-live="polite">
                    <div className="flex flex-1 gap-1">
                      {[0, 1, 2].map((i) => (
                        <span key={i} className={cn("h-1.5 flex-1 rounded-full transition", i < strength ? (strength === 1 ? "bg-danger" : strength === 2 ? "bg-action" : "bg-success") : "bg-line")} />
                      ))}
                    </div>
                    <span className="text-xs text-muted">{[tr("ضعيفة", "Weak"), tr("ضعيفة", "Weak"), tr("متوسطة", "Fair"), tr("قوية", "Strong")][strength]}</span>
                  </div>
                )}

                {error && (
                  <motion.p initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} role="alert" className="rounded-xl bg-danger-soft px-3 py-2.5 text-sm font-medium text-danger">
                    {error}
                  </motion.p>
                )}

                <motion.button
                  type="submit"
                  whileTap={{ scale: 0.98 }}
                  disabled={busy}
                  className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-action text-base font-bold text-on-action transition hover:bg-action-hover disabled:opacity-70"
                >
                  {busy && <Loader2 className="size-5 animate-spin" />}
                  {tr("إنشاء الحساب", "Create account")}
                  {!busy && <Forward className="size-5" />}
                </motion.button>
              </form>

              <p className="mt-5 text-center text-sm text-muted">
                {tr("لديك حساب؟", "Have an account?")}{" "}
                <Link href="/login" className="font-semibold text-primary-ink underline-offset-4 hover:underline">
                  {tr("سجّل الدخول", "Log in")}
                </Link>
              </p>
            </div>
          </motion.div>
        </div>
      </main>
    </div>
  );
}
