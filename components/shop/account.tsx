"use client";

// «حسابي» in the shop owner's app: who he is and his shop, his money at a glance (debt, limit, what is left,
// pay online), and everything about his account in one list — statement, invoices, notifications, support,
// his details and picture, language and look, text size, sounds, the tour, and logging out.
import { useState } from "react";
import Link from "next/link";
import { BellRing, ChevronLeft, ChevronRight, CreditCard, FileText, Headset, LogOut, MapPin, Phone, ReceiptText, Sparkles, Type, UserRound, Volume2 } from "lucide-react";
import { Avatar, MyAccountDialog } from "@/components/my-account";
import { useMyShop } from "@/components/shop/kit";
import { PhoneNotifySwitch } from "@/components/phone-notify-switch";
import { LanguageSwitch, ThemeToggle } from "@/components/switches";
import { startTour } from "@/components/tour";
import { ErrorBox, LimitBar, LoadingRows, Switch } from "@/components/ui";
import { playAlert, playMessage, setSoundOn, useSoundOn } from "@/lib/alert-sound";
import { api } from "@/lib/api";
import { useAppRouter } from "@/lib/app-path";
import { signOut } from "@/lib/auth";
import { useFmt } from "@/lib/i18n";
import { setTextSize, useTextSize, type TextSize } from "@/lib/text-size";
import { useSite } from "@/lib/site";
import { cn } from "@/lib/utils";

/** The support chat circle opens from here too (components/support/chat-widget.tsx listens). */
export const OPEN_CHAT_EVENT = "nahrain:open-chat";

export function ShopAccount() {
  const { tr, money, lang } = useFmt();
  const shop = useMyShop();
  const router = useAppRouter();
  const sound = useSoundOn();
  const size = useTextSize();
  const [details, setDetails] = useState(false);
  const brand = useSite().brand;
  if (shop.state.status === "error") return <ErrorBox error={shop.state.error} onRetry={shop.reload} />;
  const c = shop.customer;
  if (!c) return <LoadingRows />;
  const owed = Math.max(0, c.balance ?? 0);
  const limit = c.debt_limit ?? 0;

  return (
    <div className="mx-auto max-w-2xl space-y-4 pb-28">
      <h1 className="text-center text-lg font-bold">{tr("حسابي", "My account")}</h1>

      {/* Who and which shop */}
      <button type="button" onClick={() => setDetails(true)} className="flex w-full items-center gap-3 rounded-3xl border border-line bg-card p-4 text-start transition hover:border-action">
        <Avatar user={shop.user} size={56} />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-lg font-bold">{c.name}</span>
          <span className="block truncate text-sm text-muted">{c.owner_name}</span>
          <span className="mt-0.5 flex items-center gap-1 truncate text-xs text-muted">
            <MapPin className="size-3.5 shrink-0" /> {c.address || c.area}
          </span>
        </span>
        <span className="shrink-0 rounded-lg bg-primary-soft px-2 py-1 text-xs font-semibold text-primary-ink">{tr("تعديل", "Edit")}</span>
      </button>

      {/* His money at a glance */}
      <div className="brand-panel relative overflow-hidden rounded-3xl p-5">
        <div className="brand-grid absolute inset-0" aria-hidden />
        <div className="relative">
          <p className="text-sm opacity-80">{tr("المطلوب منك", "You owe")}</p>
          <p className="num mt-1 text-3xl font-bold">{money(owed)}</p>
          <div className="mt-3 max-w-xs">
            <LimitBar balance={owed} limit={limit} />
          </div>
          <p className="num mt-2 text-xs opacity-75">
            {tr("السقف", "Limit")} {money(limit)} · {tr("المتاح", "Left")} {money(Math.max(0, limit - owed))}
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            {owed > 0 && (
              <Link href="/statement" className="inline-flex items-center gap-1.5 rounded-full bg-action px-4 py-2 text-sm font-bold text-on-action">
                <CreditCard className="size-4" /> {tr("سدّد بزين كاش أو Qi", "Pay with ZainCash or Qi")}
              </Link>
            )}
            <Link href="/statement" className="inline-flex items-center gap-1.5 rounded-full bg-white/12 px-4 py-2 text-sm font-semibold">
              <FileText className="size-4" /> {tr("كشف حسابي", "My statement")}
            </Link>
          </div>
        </div>
        <div className="hazard absolute inset-x-0 bottom-0 h-1.5" aria-hidden />
      </div>

      <div className="divide-y divide-line overflow-hidden rounded-3xl border border-line bg-card">
        <Row rtl={lang === "ar"} icon={ReceiptText} label={tr("فواتيري", "My invoices")} href="/invoices" />
        <Row rtl={lang === "ar"} icon={FileText} label={tr("كشف حسابي", "My statement")} sub={tr("الفواتير والتسديدات والمرتجعات والرصيد", "Invoices, payments, returns, balance")} href="/statement" />
        <Row rtl={lang === "ar"} icon={BellRing} label={tr("الإشعارات", "Notifications")} href="/notifications" />
        <Row rtl={lang === "ar"} icon={Headset} label={tr("المساعدة والدعم", "Help and support")} sub={tr("محادثة مع موظفي الشركة", "Chat with the company's staff")} onClick={() => window.dispatchEvent(new Event(OPEN_CHAT_EVENT))} tone="bg-success-soft text-success" />
        <Row rtl={lang === "ar"} icon={UserRound} label={tr("تعديل معلومات الحساب", "Edit my details")} sub={tr("الصورة وكلمة المرور ومحلاتي", "Picture, password and my shops")} onClick={() => setDetails(true)} />
        {brand.phone && <Row rtl={lang === "ar"} icon={Phone} label={tr("اتصل بالشركة", "Call the company")} sub={brand.phone} href={`tel:${brand.phone.replace(/\s/g, "")}`} />}
      </div>

      {/* Settings for this phone */}
      <div className="space-y-1 rounded-3xl border border-line bg-card p-4">
        <p className="mb-2 text-sm font-bold">{tr("إعدادات هذا الجهاز", "This device")}</p>
        <div className="flex items-center justify-between gap-3 py-1.5">
          <span className="text-sm">{tr("اللغة والمظهر", "Language and look")}</span>
          <span className="flex items-center gap-1">
            <LanguageSwitch />
            <ThemeToggle />
          </span>
        </div>
        <div className="flex items-center justify-between gap-3 py-1.5">
          <span className="flex items-center gap-2 text-sm">
            <Type className="size-4" /> {tr("حجم الخط", "Text size")}
          </span>
          <span className="flex gap-1 rounded-xl bg-card-2 p-1">
            {(["normal", "large", "xl"] as TextSize[]).map((z, i) => (
              <button key={z} type="button" aria-pressed={size === z} onClick={() => setTextSize(z)} className={cn("h-8 rounded-lg px-2.5 font-bold", size === z ? "bg-card shadow-card" : "text-muted")} style={{ fontSize: 12 + i * 2 }}>
                {tr("أ", "A")}
              </button>
            ))}
          </span>
        </div>
        <Switch
          checked={sound}
          onChange={(v) => {
            setSoundOn(v);
            if (v) {
              playAlert(true);
              setTimeout(() => playMessage(true), 900);
            }
          }}
          label={
            <span className="flex items-center gap-2">
              <Volume2 className="size-4" /> {tr("صوت الإشعارات والرسائل", "Notification and message sound")}
            </span>
          }
        />
        <PhoneNotifySwitch />
        <button type="button" onClick={startTour} className="flex w-full items-center gap-2 py-2 text-sm text-text hover:text-action">
          <Sparkles className="size-4" /> {tr("جولة تعريفية", "Guided tour")}
        </button>
      </div>

      <button
        type="button"
        onClick={async () => {
          await api.logout().catch(() => {});
          signOut();
          router.replace("/login");
        }}
        className="flex h-12 w-full items-center justify-center gap-2 rounded-2xl border border-danger/30 font-semibold text-danger hover:bg-danger-soft"
      >
        <LogOut className="size-5" /> {tr("تسجيل الخروج", "Log out")}
      </button>

      {details && <MyAccountDialog user={shop.user} onClose={() => setDetails(false)} />}
    </div>
  );
}

/** One line of the list: an icon, words, and the arrow; the whole line is the button. */
function Row({ icon: Icon, label, sub, href, onClick, tone, rtl }: { icon: typeof FileText; label: string; sub?: string; href?: string; onClick?: () => void; tone?: string; rtl: boolean }) {
  const Go = rtl ? ChevronLeft : ChevronRight;
  const inner = (
    <>
      <span className={cn("flex size-10 shrink-0 items-center justify-center rounded-xl", tone ?? "bg-primary-soft text-primary-ink")}>
        <Icon className="size-5" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block font-semibold">{label}</span>
        {sub && <span className="block truncate text-xs text-muted">{sub}</span>}
      </span>
      <Go className="size-4 shrink-0 text-faint" />
    </>
  );
  const cls = "flex w-full items-center gap-3 px-4 py-3 text-start transition hover:bg-card-2";
  return href ? (
    <Link href={href} className={cls}>
      {inner}
    </Link>
  ) : (
    <button type="button" onClick={onClick} className={cls}>
      {inner}
    </button>
  );
}
