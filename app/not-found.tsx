"use client";

// Shown for any address that doesn't exist (a wrong link or a typo), instead of Next's plain white 404 page.
import Link from "next/link";
import { motion } from "motion/react";
import { Home, LogIn, PackageX } from "lucide-react";
import { BrandName, LogoMark } from "@/components/logo";
import { useSession, homeOf } from "@/lib/auth";
import { useFmt } from "@/lib/i18n";

export default function NotFound() {
  const { tr } = useFmt();
  const session = useSession();
  return (
    <main className="brand-panel relative flex min-h-dvh items-center justify-center overflow-hidden p-6 text-center">
      <div className="brand-grid absolute inset-0" aria-hidden />
      <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }} className="relative max-w-md">
        <div className="mx-auto mb-6 flex w-fit items-center gap-2 text-white/80">
          <LogoMark size={32} /> <BrandName />
        </div>
        <motion.div initial={{ rotate: -8, scale: 0.8 }} animate={{ rotate: 0, scale: 1 }} transition={{ type: "spring", stiffness: 200, damping: 12 }} className="mx-auto flex size-24 items-center justify-center rounded-3xl bg-white/10">
          <PackageX className="size-12 text-[#f5b48a]" strokeWidth={1.5} />
        </motion.div>
        <p className="num mt-6 text-6xl font-bold">404</p>
        <h1 className="mt-2 text-xl font-bold">{tr("هذه الصفحة غير موجودة", "This page doesn't exist")}</h1>
        <p className="mt-2 text-sm text-white/70">{tr("ربما الرابط خطأ أو نُقلت الصفحة. ارجع وتابع عملك من هنا:", "The link may be wrong or the page moved. Carry on from here:")}</p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          {session ? (
            <Link href={homeOf(session.user.role, session.user.rep_kinds)} className="flex h-11 items-center gap-2 rounded-xl bg-action px-5 font-bold text-on-action hover:bg-action-hover">
              <Home className="size-4" /> {tr("صفحتي الرئيسية", "My home page")}
            </Link>
          ) : (
            <Link href="/login" className="flex h-11 items-center gap-2 rounded-xl bg-action px-5 font-bold text-on-action hover:bg-action-hover">
              <LogIn className="size-4" /> {tr("تسجيل الدخول", "Log in")}
            </Link>
          )}
          <Link href="/" className="flex h-11 items-center gap-2 rounded-xl border border-white/25 px-5 font-semibold text-white hover:bg-white/10">
            {tr("الصفحة الرئيسية للموقع", "Website home")}
          </Link>
        </div>
        <div className="hazard mx-auto mt-10 h-1.5 w-40 rounded-full" aria-hidden />
      </motion.div>
    </main>
  );
}
