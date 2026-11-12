"use client";

// The public landing page, with the animation style Yasser chose (dark, glowing, moving),
// in Al-Nahrain's green and orange, and with the content of the client's requirements.
import Link from "next/link";
import { useEffect, useState } from "react";
import { motion, useMotionValueEvent, useScroll } from "motion/react";
import { ArrowLeft, ArrowRight, MapPin, Phone, Store, UserPlus, Warehouse } from "lucide-react";
import { Bento, Roles } from "@/components/landing/features";
import { Hero } from "@/components/landing/hero";
import { PhoneApps } from "@/components/landing/phone-apps";
import { CategoryStrip, Platform, Problems } from "@/components/landing/sections";
import { Stars, WordReveal, rise } from "@/components/landing/shared";
import { BrandName, LogoMark } from "@/components/logo";
import { LanguageSwitch } from "@/components/switches";
import { homeOf, useSession } from "@/lib/auth";
import { useFmt } from "@/lib/i18n";
import { cn } from "@/lib/utils";

export default function LandingPage() {
  const { tr, lang } = useFmt();
  const session = useSession();
  const Forward = lang === "ar" ? ArrowLeft : ArrowRight;
  const enter = session ? homeOf(session.user.role, session.user.rep_kinds) : "/login";
  const enterLabel = session ? tr("ادخل إلى حسابك", "Go to my account") : tr("تسجيل الدخول", "Log in");

  // The page is dark, like the reference design. The rest of the site keeps the user's day/night choice,
  // so the page/overscroll color is set here and put back when you leave.
  useEffect(() => {
    const prev = document.body.style.background;
    document.body.style.background = "#0b0c0e";
    return () => {
      document.body.style.background = prev;
    };
  }, []);

  return (
    // "dark" here switches all the color tokens to night colors inside this page only.
    <div className="dark min-h-dvh bg-[#0b0c0e] text-text">
      <Header enter={enter} enterLabel={enterLabel} />
      <main>
        <Hero enter={enter} enterLabel={enterLabel} />
        <CategoryStrip />
        <Problems />
        <Platform />
        <Bento enter={enter} />
        <Roles />
        <PhoneApps />

        {/* Last call */}
        <section id="contact" className="scroll-mt-24 px-4 pb-16 pt-10">
          <motion.div {...rise()} className="relative mx-auto max-w-6xl overflow-hidden rounded-[36px] border border-white/10 bg-[radial-gradient(80%_120%_at_50%_0%,rgb(225_105_43/0.25),transparent_60%),linear-gradient(180deg,#16191e,#0b0c0e)] px-6 py-16 text-center sm:px-12">
            <div className="hero-beam pointer-events-none absolute -top-1/2 left-[30%] h-[200%] w-[40%]" aria-hidden />
            <Stars count={30} seed={11} />
            <div className="relative">
              <WordReveal text={tr("هل أنت مستعد لتوديع الدفاتر؟", "Ready to say goodbye to notebooks?")} className="text-3xl font-bold sm:text-5xl" />
              <p className="mx-auto mt-4 max-w-xl text-muted">{tr("صاحب محل؟ ادخل إلى حسابك، واطّلع على أسعارك الخاصة، واطلب، وتابع كشف حسابك في أي وقت.", "A shop owner? Log in, see your own prices, order, and follow your statement any time.")}</p>
              <Link href="/shops" className="mx-auto mt-3 inline-flex items-center gap-1.5 text-sm font-semibold text-action hover:underline">
                <Store className="size-4" /> {tr("لماذا يطلب أصحاب المحلات من النهرين؟", "Why do shop owners order from Al-Nahrain?")}
              </Link>
              <div className="mt-8 flex flex-wrap justify-center gap-3">
                {/* New shops register by themselves; the company approves them before the first order. */}
                {!session && (
                  <Link href="/register" className="inline-flex h-12 items-center gap-2 rounded-full bg-action px-7 font-bold text-on-action shadow-[0_0_40px_rgb(225_105_43/0.45)] transition hover:bg-action-hover">
                    <UserPlus className="size-5" /> {tr("سجّل محلك", "Register your shop")}
                  </Link>
                )}
                <Link
                  href={enter}
                  className={
                    session
                      ? "inline-flex h-12 items-center gap-2 rounded-full bg-action px-7 font-bold text-on-action shadow-[0_0_40px_rgb(225_105_43/0.45)] transition hover:bg-action-hover"
                      : "inline-flex h-12 items-center gap-2 rounded-full border border-white/20 bg-white/5 px-7 font-bold transition hover:bg-white/10"
                  }
                >
                  {enterLabel} <Forward className="size-5" />
                </Link>
              </div>
              <div className="mt-10 flex flex-wrap justify-center gap-3 text-sm text-muted">
                <span className="flex items-center gap-2 rounded-full border border-white/10 px-4 py-2">
                  <MapPin className="size-4 text-primary-ink" /> {tr("كربلاء - الصناعة (المخزن الرئيسي)", "Karbala - Al-Sinaa (main warehouse)")}
                </span>
                <span className="flex items-center gap-2 rounded-full border border-white/10 px-4 py-2">
                  <Warehouse className="size-4 text-primary-ink" /> {tr("كربلاء - الحر", "Karbala - Al-Hur")}
                </span>
                <span className="flex items-center gap-2 rounded-full border border-white/10 px-4 py-2">
                  <Phone className="size-4 text-primary-ink" /> <span dir="ltr" className="num">0780 100 0001</span>
                </span>
              </div>
            </div>
          </motion.div>
        </section>
      </main>

      <footer className="border-t border-white/5">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-6 text-sm text-muted">
          <span className="flex items-center gap-2">
            <LogoMark size={24} /> © 2026 <BrandName company />
          </span>
          <Link href={enter} className="font-medium text-primary-ink hover:underline">
            {enterLabel}
          </Link>
        </div>
      </footer>
    </div>
  );
}

/** The floating top bar: clear at the top of the page, a glass pill after you scroll. */
function Header({ enter, enterLabel }: { enter: string; enterLabel: string }) {
  const { tr } = useFmt();
  const { scrollY } = useScroll();
  const [scrolled, setScrolled] = useState(false);
  useMotionValueEvent(scrollY, "change", (y) => setScrolled(y > 24));
  return (
    <motion.header initial={{ y: -40, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ duration: 0.6 }} className="fixed inset-x-0 top-0 z-40 px-3 pt-3">
      <nav
        className={cn(
          "mx-auto flex max-w-6xl items-center justify-between gap-3 rounded-full px-3 py-2 transition-all duration-300 sm:px-4",
          scrolled ? "border border-white/10 bg-[#0b0c0e]/70 shadow-lg backdrop-blur-xl" : "border border-transparent",
        )}
      >
        <Link href="/" className="flex items-center gap-2">
          <LogoMark size={34} />
          <span className="text-base font-bold"><BrandName /></span>
        </Link>
        <div className="hidden items-center gap-7 text-sm text-muted md:flex">
          <a href="#platform" className="transition hover:text-text">
            {tr("كيف يعمل", "How it works")}
          </a>
          <a href="#features" className="transition hover:text-text">
            {tr("المميزات", "Features")}
          </a>
          <a href="#apps" className="transition hover:text-text">
            {tr("التطبيقات", "Apps")}
          </a>
          <a href="#contact" className="transition hover:text-text">
            {tr("تواصل معنا", "Contact")}
          </a>
          <Link href="/shops" className="flex items-center gap-1.5 rounded-full border border-action/40 bg-action/10 px-3 py-1 font-semibold text-text transition hover:bg-action/20">
            <Store className="size-4 text-action" /> {tr("لأصحاب المحلات", "For shop owners")}
          </Link>
        </div>
        <div className="flex items-center gap-2">
          <LanguageSwitch onBrand />
          <Link href={enter} className="flex h-10 items-center rounded-full bg-white px-4 text-sm font-bold text-[#0b0c0e] transition hover:bg-white/90">
            {enterLabel}
          </Link>
        </div>
      </nav>
    </motion.header>
  );
}
