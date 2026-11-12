"use client";

// The pieces both phone-app landing pages share (/client for shop owners, /driver for reps):
// the colored moving background, the glass top bar, a drawn phone whose screens change by themselves,
// numbers that count up, a strip that slides, the questions, the "install" card and the buttons fixed
// at the bottom of a phone. The pages are dark and colorful on purpose, like the main landing page.
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, animate, motion, useInView } from "motion/react";
import { Check, ChevronDown, Download, MoreVertical, Plus, Share, X } from "lucide-react";
import { BrandName, LogoMark } from "@/components/logo";
import { LanguageSwitch } from "@/components/switches";
import { homeOf, rememberNext, useSession } from "@/lib/auth";
import { inApp } from "@/lib/app-path";
import { useFmt } from "@/lib/i18n";
import { useToast } from "@/components/ui";
import { cn } from "@/lib/utils";

export type AppKind = "client" | "driver";

/**
 * The apps' visual identity (هوية بصرية). Each app has exactly two colors on the dark graphite of the
 * Al-Nahrain logo: `main` (buttons, icons, numbers) and `soft` (tints, second lines, highlights).
 * - Shop owners: the brand's orange (the sun of the logo) and a warm sand.
 * - Reps: a river teal and a light mint.
 * The shared motif is the logo's two rivers: two waving lines (Rivers) behind the heroes and between sections.
 * See docs/app-identity.md.
 */
export const IDENTITY = {
  client: { main: "#e1692b", soft: "#f6c7a1" },
  driver: { main: "#1fb5a5", soft: "#a8ede3" },
} as const;

/** The two rivers of the logo, drawn wide: the main line, and the soft one flowing under it. */
export function Rivers({ app, className }: { app: AppKind; className?: string }) {
  const { main, soft } = IDENTITY[app];
  // One wave, repeated across: smooth curves ("T" continues the curve).
  const wave = (y: number, a: number) => `M0 ${y} Q 60 ${y - a} 120 ${y} ${Array.from({ length: 19 }, (_, i) => `T ${240 + i * 120} ${y}`).join(" ")}`;
  return (
    <svg viewBox="0 0 1200 90" preserveAspectRatio="none" className={cn("pointer-events-none block h-16 w-full sm:h-20", className)} aria-hidden>
      <path d={wave(34, 22)} fill="none" stroke={main} strokeWidth="5" strokeLinecap="round" opacity="0.9" />
      <path className="river-flow" d={wave(60, 14)} fill="none" stroke={soft} strokeWidth="4" strokeLinecap="round" opacity="0.7" />
    </svg>
  );
}

/** Who is here: logged in to this app (then "open the app"), to another job, or not logged in. */
export function useAppEntry(app: AppKind) {
  const router = useRouter();
  const session = useSession();
  const role = session?.user.role;
  const mine = app === "client" ? role === "shop" : role === "rep";
  // The app's own home, inside its address space (/client/shop, /driver/rep…), so it stays in the installed app.
  const home = session ? (mine ? inApp(`/${app}`, homeOf(session.user.role, session.user.rep_kinds)) : homeOf(session.user.role, session.user.rep_kinds)) : "/login";
  // Not logged in: after logging in (or signing up) from here, come back into this app.
  useEffect(() => {
    if (!session) rememberNext(`/${app}?app=1`);
  }, [session, app]);
  // Opened from the icon on the phone's home screen (?app=1), already logged in: straight into the app.
  useEffect(() => {
    if (mine && new URLSearchParams(window.location.search).get("app") === "1") router.replace(home);
  }, [mine, home, router]);
  // The page is dark: the color behind the page (seen when you pull past its end) is dark too.
  useEffect(() => {
    const prev = document.body.style.background;
    document.body.style.background = "#08090b";
    return () => {
      document.body.style.background = prev;
    };
  }, []);
  return { session, mine, home };
}

/** Color clouds drifting behind a section. */
export function Blobs({ colors, className }: { colors: string[]; className?: string }) {
  const spots = [
    { top: "-10%", left: "-10%", size: "55%" },
    { top: "10%", left: "55%", size: "50%" },
    { top: "55%", left: "20%", size: "45%" },
    { top: "60%", left: "70%", size: "40%" },
  ];
  return (
    <div className={cn("pointer-events-none absolute inset-0 overflow-hidden", className)} aria-hidden>
      {colors.map((c, i) => (
        <span key={i} className="blob aspect-square" style={{ ...spots[i % spots.length], width: spots[i % spots.length].size, background: c, animationDelay: `${i * -4}s` }} />
      ))}
    </div>
  );
}

/** Words in a moving gradient. */
export function GradientText({ children, from, via, to }: { children: ReactNode; from: string; via: string; to: string }) {
  return (
    <span className="text-gradient-pan" style={{ backgroundImage: `linear-gradient(90deg, ${from}, ${via}, ${to}, ${via}, ${from})` }}>
      {children}
    </span>
  );
}

/** The glass bar at the top: logo, the app's name, links to the sections (computer), language, main button. */
export function AppHeader({ app, links, cta }: { app: AppKind; links: { href: string; label: string }[]; cta: { href: string; label: string } }) {
  const { tr } = useFmt();
  return (
    <header className="fixed inset-x-0 top-0 z-40 px-3 pt-3">
      <nav className="mx-auto flex max-w-6xl items-center gap-2 rounded-full border border-white/10 bg-[#0b0c0e]/70 py-1.5 pe-1.5 ps-3 shadow-lg backdrop-blur-xl">
        <Link href="/" className="flex min-w-0 items-center gap-2">
          <LogoMark size={32} />
          <span className="min-w-0 leading-tight">
            <span className="block truncate text-sm font-bold">
              <BrandName />
            </span>
            <span className="block truncate text-[10px] text-white/60">{app === "client" ? tr("تطبيق أصحاب المحلات", "Shop owners' app") : tr("تطبيق المندوبين", "Reps' app")}</span>
          </span>
        </Link>
        <div className="mx-auto hidden items-center gap-6 text-sm text-white/70 lg:flex">
          {links.map((l) => (
            <a key={l.href} href={l.href} className="transition hover:text-white">
              {l.label}
            </a>
          ))}
        </div>
        <div className="ms-auto flex items-center gap-1.5 lg:ms-0">
          <InstallButton app={app} variant="icon" />
          <LanguageSwitch onBrand />
          <Link href={cta.href} className="shine hidden h-10 items-center rounded-full bg-white px-4 text-sm font-bold text-[#0b0c0e] transition hover:bg-white/90 sm:flex">
            {cta.label}
          </Link>
        </div>
      </nav>
    </header>
  );
}

/** A drawn phone. Its screens change every few seconds (paused while the mouse is on it); the dots pick one. */
export function PhoneDemo({ screens, glow, tilt = -3 }: { screens: { key: string; label: string; body: ReactNode }[]; glow: string; tilt?: number }) {
  const [i, setI] = useState(0);
  const [hold, setHold] = useState(false);
  useEffect(() => {
    if (hold) return;
    const t = setInterval(() => setI((x) => (x + 1) % screens.length), 3400);
    return () => clearInterval(t);
  }, [hold, screens.length]);
  const s = screens[i];
  return (
    <motion.div
      initial={{ opacity: 0, y: 50, rotate: tilt * 2 }}
      animate={{ opacity: 1, y: 0, rotate: tilt }}
      transition={{ delay: 0.25, duration: 0.9, ease: [0.22, 1, 0.36, 1] }}
      className="relative mx-auto w-full max-w-[300px]"
      onMouseEnter={() => setHold(true)}
      onMouseLeave={() => setHold(false)}
    >
      <div className="absolute -inset-10 rounded-[70px] opacity-60 blur-3xl" style={{ background: glow }} aria-hidden />
      <div className="float-slow relative rounded-[44px] border border-white/15 bg-[#111317] p-2.5 shadow-[0_40px_80px_-20px_rgb(0_0_0/0.8)]">
        <div className="relative h-[520px] overflow-hidden rounded-[36px] bg-[#15181d]">
          {/* the notch */}
          <div className="absolute inset-x-0 top-2 z-20 mx-auto h-5 w-24 rounded-full bg-black/80" />
          <AnimatePresence mode="wait">
            <motion.div
              key={s.key}
              initial={{ opacity: 0, x: 40, scale: 0.98 }}
              animate={{ opacity: 1, x: 0, scale: 1 }}
              exit={{ opacity: 0, x: -40, scale: 0.98 }}
              transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
              className="absolute inset-0 px-4 pb-4 pt-10"
            >
              {s.body}
            </motion.div>
          </AnimatePresence>
        </div>
      </div>
      <div className="mt-5 flex items-center justify-center gap-2">
        {screens.map((x, n) => (
          <button
            key={x.key}
            type="button"
            onClick={() => setI(n)}
            aria-label={x.label}
            aria-pressed={n === i}
            className={cn("h-2 rounded-full transition-all", n === i ? "w-7 bg-white" : "w-2 bg-white/30 hover:bg-white/60")}
          />
        ))}
      </div>
      <p className="mt-2 text-center text-xs text-white/60">{s.label}</p>
    </motion.div>
  );
}

/** A number that counts up from 0 when it scrolls into view. */
export function CountUp({ to, suffix = "", className }: { to: number; suffix?: string; className?: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const seen = useInView(ref, { once: true, margin: "-40px" });
  const [v, setV] = useState(0);
  useEffect(() => {
    if (!seen) return;
    const c = animate(0, to, { duration: 1.4, ease: [0.22, 1, 0.36, 1], onUpdate: (x) => setV(Math.round(x)) });
    return () => c.stop();
  }, [seen, to]);
  return (
    <span ref={ref} className={cn("num", className)}>
      {v.toLocaleString("en")}
      {suffix}
    </span>
  );
}

/** A strip of colored chips that slides forever (two copies side by side make the loop seamless). */
export function Marquee({ items }: { items: { icon: React.ComponentType<{ className?: string }>; t: string; c: string }[] }) {
  const row = (copy: number) =>
    items.map((x, i) => (
      <span key={`${copy}-${i}`} className="mx-2 inline-flex shrink-0 items-center gap-2 rounded-full border border-white/10 bg-white/[0.05] px-4 py-2 text-sm font-semibold" aria-hidden={copy > 0}>
        <span className="flex size-6 items-center justify-center rounded-full" style={{ background: `${x.c}33`, color: x.c }}>
          <x.icon className="size-3.5" />
        </span>
        {x.t}
      </span>
    ));
  return (
    <div className="marquee relative overflow-hidden py-6 [mask-image:linear-gradient(90deg,transparent,#000_10%,#000_90%,transparent)]">
      <div className="marquee-track flex w-max">
        {row(0)}
        {row(1)}
      </div>
    </div>
  );
}

/** A section's small label and big title. */
export function SectionHead({ eyebrow, title, sub, color }: { eyebrow: string; title: ReactNode; sub?: string; color: string }) {
  return (
    <div className="mx-auto max-w-2xl text-center">
      <motion.span
        initial={{ opacity: 0, y: 10 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        className="inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-semibold"
        style={{ borderColor: `${color}55`, background: `${color}14`, color }}
      >
        <span className="size-1.5 rounded-full" style={{ background: color }} />
        {eyebrow}
      </motion.span>
      <motion.h2 initial={{ opacity: 0, y: 18 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, margin: "-40px" }} transition={{ duration: 0.6 }} className="mt-4 text-3xl font-bold leading-tight sm:text-4xl">
        {title}
      </motion.h2>
      {sub && (
        <motion.p initial={{ opacity: 0, y: 14 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ delay: 0.1 }} className="mt-3 text-white/65">
          {sub}
        </motion.p>
      )}
    </div>
  );
}

/** The questions people ask: one open at a time. */
export function Questions({ items, color }: { items: { q: string; a: string }[]; color: string }) {
  const [open, setOpen] = useState<number | null>(0);
  return (
    <div className="mx-auto mt-10 max-w-2xl space-y-2">
      {items.map((x, i) => (
        <motion.div key={x.q} initial={{ opacity: 0, y: 14 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ delay: i * 0.05 }} className="overflow-hidden rounded-2xl border border-white/10 bg-white/[0.04]">
          <button type="button" onClick={() => setOpen(open === i ? null : i)} aria-expanded={open === i} className="flex w-full items-center gap-3 p-4 text-start font-semibold">
            <span className="flex-1">{x.q}</span>
            <ChevronDown className={cn("size-5 shrink-0 transition-transform", open === i && "rotate-180")} style={{ color }} />
          </button>
          <AnimatePresence initial={false}>
            {open === i && (
              <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
                <p className="px-4 pb-4 text-sm leading-6 text-white/70">{x.a}</p>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>
      ))}
    </div>
  );
}

// ---------- Installing the app ("download") ----------
// Chrome / Edge / Android offer to install with an event ("beforeinstallprompt") that comes once, early, and
// only when they decide the page can be installed. It is caught here, as soon as this file loads, and kept for
// the "download" buttons. When there is no offer (Safari, Firefox, or Chrome didn't make one), the buttons
// open the steps for the person's device instead, and on a computer a QR code to open the app on the phone.

interface InstallPrompt extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

let offer: InstallPrompt | null = null;
let installed = false;
const installSubs = new Set<() => void>();
const tellInstall = () => installSubs.forEach((f) => f());
if (typeof window !== "undefined") {
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    offer = e as InstallPrompt;
    tellInstall();
  });
  window.addEventListener("appinstalled", () => {
    installed = true;
    offer = null;
    tellInstall();
  });
}

type Device = "ios" | "android" | "desktop";
const deviceOf = (): Device => (/iphone|ipad|ipod/i.test(navigator.userAgent) ? "ios" : /android/i.test(navigator.userAgent) ? "android" : "desktop");
const standalone = () => window.matchMedia("(display-mode: standalone)").matches || installed;

// Which installed app this window is: an app is launched at its own landing with "?app=1" (its start_url),
// so that page writes it down for the window. Later, if this window shows the OTHER app's page (an older
// install of the shops' app covered the whole site), the page knows it is in the wrong window.
const WINDOW_KEY = "nahrain.window";
if (typeof window !== "undefined" && window.matchMedia("(display-mode: standalone)").matches) {
  try {
    const first = window.location.pathname.split("/")[1];
    if (new URLSearchParams(window.location.search).get("app") === "1" && (first === "client" || first === "driver")) sessionStorage.setItem(WINDOW_KEY, first);
  } catch {}
}
const windowApp = (): AppKind | null => {
  try {
    const v = sessionStorage.getItem(WINDOW_KEY);
    return v === "client" || v === "driver" ? v : null;
  } catch {
    return null;
  }
};
const subInstall = (fn: () => void) => {
  installSubs.add(fn);
  return () => {
    installSubs.delete(fn);
  };
};

/** Can the browser install it right now with one tap? Is it already open as the installed app? Which device? */
function useInstall() {
  const canPrompt = useSyncExternalStore(subInstall, () => !!offer, () => false);
  const isApp = useSyncExternalStore(subInstall, standalone, () => false);
  const device = useSyncExternalStore(subInstall, deviceOf, () => "desktop" as Device);
  const inApp = useSyncExternalStore(subInstall, windowApp, () => null);
  return { canPrompt, isApp, device, inApp };
}

/**
 * The "download the app" button. With the browser's offer: its install window at once.
 * Without it: a sheet with the steps for this device (and a QR code on a computer).
 * Already opened as the installed app: it says so (the round one hides).
 */
export function InstallButton({ app, variant = "solid", className, label }: { app: AppKind; variant?: "solid" | "ghost" | "icon"; className?: string; label?: string }) {
  const { tr } = useFmt();
  const { canPrompt, isApp, inApp } = useInstall();
  const [sheet, setSheet] = useState(false);
  const { main } = IDENTITY[app];
  const text = label ?? tr("حمّل التطبيق", "Download the app");
  // This page is open inside the OTHER installed app's window: it can't be installed from here.
  // (Unknown: a window opened before this check existed; it may be the other app's, so say how to check.)
  const wrongWindow = isApp && inApp !== app;
  if (wrongWindow)
    return (
      <>
        <button
          type="button"
          onClick={() => setSheet(true)}
          className={cn(
            "inline-flex shrink-0 items-center justify-center gap-2 font-bold transition active:scale-[0.97]",
            variant === "icon" ? "size-10 rounded-full border border-white/15 bg-white/10 hover:bg-white/20" : "h-13 rounded-2xl border border-warning/50 bg-warning/10 px-5 text-sm text-white",
            className,
          )}
          style={variant === "icon" ? { color: main } : undefined}
          aria-label={tr("كيف أحمّله؟", "How do I get it?")}
        >
          <Download className="size-5" />
          {variant !== "icon" && (inApp ? tr("أنت داخل تطبيق آخر: كيف أحمّله؟", "You're in the other app: how do I get it?") : tr("مفتوح داخل تطبيق مثبّت: كيف أحمّل هذا؟", "Open inside an installed app: how do I get this one?"))}
        </button>
        <AnimatePresence>{sheet && <WrongWindowSheet app={app} inside={inApp ?? (app === "client" ? "driver" : "client")} onClose={() => setSheet(false)} />}</AnimatePresence>
      </>
    );
  if (isApp) return variant === "icon" ? null : <span className={cn("inline-flex h-13 items-center gap-2 rounded-2xl border border-white/15 px-5 text-sm font-bold text-white/70", className)}>{tr("التطبيق مثبّت على جهازك", "Installed on this device")}</span>;
  const press = async () => {
    if (canPrompt && offer) {
      const o = offer;
      await o.prompt();
      const choice = await o.userChoice.catch(() => null);
      if (choice?.outcome === "accepted") offer = null;
      tellInstall();
      return;
    }
    setSheet(true);
  };
  return (
    <>
      <button
        type="button"
        onClick={press}
        aria-label={text}
        title={text}
        className={cn(
          "inline-flex shrink-0 items-center justify-center gap-2 font-bold transition active:scale-[0.97]",
          variant === "icon" && "size-10 rounded-full border border-white/15 bg-white/10 hover:bg-white/20",
          variant === "ghost" && "h-13 rounded-2xl border border-white/15 bg-white/5 px-5 text-white backdrop-blur hover:bg-white/10",
          variant === "solid" && "shine h-13 rounded-2xl px-5 text-[#0b0c0e] hover:brightness-105",
          className,
        )}
        style={variant === "solid" ? { background: main } : variant === "icon" ? { color: main } : undefined}
      >
        <Download className="size-5" />
        {variant !== "icon" && text}
      </button>
      <AnimatePresence>{sheet && <InstallSheet app={app} onClose={() => setSheet(false)} />}</AnimatePresence>
    </>
  );
}

/** The steps to install it on this device, and (on a computer) a QR code that opens this page on the phone. */
function InstallSheet({ app, onClose }: { app: AppKind; onClose: () => void }) {
  const { tr } = useFmt();
  const { device } = useInstall();
  const { main, soft } = IDENTITY[app];
  const [qr, setQr] = useState("");
  useEffect(() => {
    if (device !== "desktop") return;
    let alive = true;
    // This app's page, for the phone (the same address the computer uses: online, or on the same network).
    import("qrcode").then((QR) => QR.toString(`${window.location.origin}/${app}`, { type: "svg", margin: 1, color: { dark: "#0b0c0e", light: "#ffffff" } }).then((svg) => alive && setQr(svg)));
    return () => {
      alive = false;
    };
  }, [device, app]);
  useEffect(() => {
    const esc = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, [onClose]);
  const steps =
    device === "ios"
      ? [
          { i: Share, t: tr("اضغط زر المشاركة أسفل شاشة Safari", "Press the Share button at the bottom of Safari") },
          { i: Plus, t: tr("اختر «إضافة إلى الشاشة الرئيسية»", "Choose “Add to Home Screen”") },
          { i: Check, t: tr("اضغط «إضافة»: تظهر أيقونته مع تطبيقاتك", "Press “Add”: its icon joins your apps") },
        ]
      : device === "android"
        ? [
            { i: MoreVertical, t: tr("افتح قائمة المتصفح ⋮ في الأعلى", "Open the browser menu ⋮ at the top") },
            { i: Download, t: tr("اختر «تثبيت التطبيق» أو «إضافة إلى الشاشة الرئيسية»", "Choose “Install app” or “Add to Home screen”") },
            { i: Check, t: tr("وافق: تظهر أيقونته مع تطبيقاتك", "Confirm: its icon joins your apps") },
          ]
        : [
            { i: Download, t: tr("اضغط أيقونة التثبيت في آخر شريط العنوان", "Click the install icon at the end of the address bar") },
            { i: MoreVertical, t: tr("أو من قائمة ⋮ ← «حفظ ومشاركة» ← «تثبيت الصفحة كتطبيق»", "Or menu ⋮ → “Save and share” → “Install page as app”") },
            { i: Check, t: tr("يُفتح في نافذة خاصة به، بأيقونته", "It opens in its own window, with its icon") },
          ];
  return createPortal(
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="dark fixed inset-0 z-[80] flex items-end justify-center bg-black/60 backdrop-blur-sm sm:items-center sm:p-4"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <motion.div
        role="dialog"
        aria-modal
        aria-label={tr("تحميل التطبيق", "Download the app")}
        initial={{ y: 60, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: 60, opacity: 0 }}
        transition={{ type: "spring", stiffness: 320, damping: 30 }}
        className="max-h-[92dvh] w-full max-w-md overflow-y-auto rounded-t-[28px] border border-white/10 bg-[#111317] p-6 pb-[calc(env(safe-area-inset-bottom)+24px)] text-white shadow-2xl sm:rounded-[28px]"
      >
        <div className="flex items-start gap-4">
          {/* eslint-disable-next-line @next/next/no-img-element -- a small fixed icon from /public */}
          <img src={`/apps/${app}-192.png`} alt="" width={56} height={56} className="size-14 rounded-2xl" />
          <div className="min-w-0 flex-1">
            <p className="text-lg font-bold">{tr("حمّل التطبيق على جهازك", "Get the app on your device")}</p>
            <p className="text-sm text-white/60">{app === "client" ? tr("تطبيق أصحاب المحلات", "The shop owners' app") : tr("تطبيق المندوبين", "The reps' app")}</p>
          </div>
          <button type="button" onClick={onClose} aria-label={tr("إغلاق", "Close")} className="flex size-9 items-center justify-center rounded-full bg-white/10 hover:bg-white/20">
            <X className="size-4" />
          </button>
        </div>
        <ol className="mt-6 space-y-3">
          {steps.map((s, i) => (
            <li key={i} className="flex items-center gap-3 rounded-2xl bg-white/[0.05] p-3">
              <span className="num flex size-8 shrink-0 items-center justify-center rounded-full text-sm font-bold text-[#0b0c0e]" style={{ background: i === 2 ? soft : main }}>
                {i + 1}
              </span>
              <span className="flex-1 text-sm">{s.t}</span>
              <s.i className="size-5 shrink-0" style={{ color: main }} />
            </li>
          ))}
        </ol>
        {device === "desktop" && (
          <div className="mt-6 flex items-center gap-4 rounded-2xl border border-white/10 p-4">
            <div className="size-28 shrink-0 overflow-hidden rounded-xl bg-white p-1.5 [&_svg]:size-full">
              {/* The SVG comes from the qrcode library (this page's own address), not from user text. */}
              {qr ? <div className="size-full" dangerouslySetInnerHTML={{ __html: qr }} /> : <div className="size-full animate-pulse rounded-lg bg-black/10" />}
            </div>
            <div>
              <p className="font-bold">{tr("أو على جوالك", "Or on your phone")}</p>
              <p className="mt-1 text-sm text-white/60">{tr("امسح الرمز بكاميرا الجوال ليُفتح التطبيق عليه، ثم ثبّته من هناك.", "Scan the code with the phone's camera to open the app there, then install it.")}</p>
            </div>
          </div>
        )}
        <p className="mt-4 text-center text-xs text-white/45">{tr("لا متجر ولا تحميل كبير: يعمل من المتصفح نفسه.", "No store and no big download: it runs from the browser itself.")}</p>
      </motion.div>
    </motion.div>,
    document.body,
  );
}

/**
 * Opened inside the other installed app's window (an older install of the shops' app covered the whole site):
 * how to get this app. Remove the old app once, then install both again from the browser.
 */
function WrongWindowSheet({ app, inside, onClose }: { app: AppKind; inside: AppKind; onClose: () => void }) {
  const { tr } = useFmt();
  const toast = useToast();
  const { main } = IDENTITY[app];
  const other = inside === "client" ? tr("تطبيق المحلات", "the shops' app") : tr("تطبيق المندوبين", "the reps' app");
  const mineName = app === "client" ? tr("تطبيق المحلات", "the shops' app") : tr("تطبيق المندوبين", "the reps' app");
  const link = typeof window === "undefined" ? `/${app}` : `${window.location.origin}/${app}`;
  const steps = [
    tr(`في نافذة ${other} هذه افتح القائمة ⋮ أعلى اليمين، واختر «إلغاء التثبيت» (نسخته القديمة كانت تغطي الموقع كله).`, `In this window of ${other}, open the ⋮ menu at the top and choose “Uninstall” (its old version covered the whole site).`),
    tr("افتح Chrome العادي، وادخل إلى صفحة كل تطبيق، واضغط «حمّل التطبيق».", "Open Chrome itself, go to each app's page, and press “Download the app”."),
    tr(`هكذا يصير لكل تطبيق نافذته وأيقونته: ${mineName} و${other}.`, `Then each app has its own window and icon: ${mineName} and ${other}.`),
  ];
  return createPortal(
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="dark fixed inset-0 z-[80] flex items-end justify-center bg-black/60 backdrop-blur-sm sm:items-center sm:p-4" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <motion.div
        role="dialog"
        aria-modal
        aria-label={tr("أنت داخل تطبيق آخر", "You're in the other app")}
        initial={{ y: 60, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: 60, opacity: 0 }}
        className="w-full max-w-md rounded-t-[28px] border border-white/10 bg-[#111317] p-6 pb-[calc(env(safe-area-inset-bottom)+24px)] text-white shadow-2xl sm:rounded-[28px]"
      >
        <div className="flex items-start gap-3">
          <p className="flex-1 text-lg font-bold">{tr(`أنت الآن داخل ${other}`, `You are inside ${other}`)}</p>
          <button type="button" onClick={onClose} aria-label={tr("إغلاق", "Close")} className="flex size-9 items-center justify-center rounded-full bg-white/10 hover:bg-white/20">
            <X className="size-4" />
          </button>
        </div>
        <p className="mt-2 text-sm text-white/65">{tr(`لهذا لا يمكن تثبيت ${mineName} من هنا. مرة واحدة فقط:`, `So ${mineName} can't be installed from here. Once only:`)}</p>
        <ol className="mt-4 space-y-3">
          {steps.map((t, i) => (
            <li key={i} className="flex gap-3 rounded-2xl bg-white/[0.05] p-3 text-sm">
              <span className="num flex size-7 shrink-0 items-center justify-center rounded-full text-xs font-bold text-[#0b0c0e]" style={{ background: main }}>
                {i + 1}
              </span>
              {t}
            </li>
          ))}
        </ol>
        <button
          type="button"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(link);
              toast("success", tr("نُسخ الرابط: الصقه في Chrome", "Link copied: paste it in Chrome"));
            } catch {
              toast("danger", link);
            }
          }}
          className="mt-4 flex h-12 w-full items-center justify-center gap-2 rounded-2xl font-bold text-[#0b0c0e]"
          style={{ background: main }}
        >
          {tr("انسخ رابط هذا التطبيق", "Copy this app's link")}
        </button>
        <p className="mt-2 text-center text-xs text-white/45" dir="ltr">
          {link}
        </p>
      </motion.div>
    </motion.div>,
    document.body,
  );
}

/** "Put it on your home screen": the card near the end of the page, with the download button. */
export function InstallCard({ app }: { app: AppKind }) {
  const { tr } = useFmt();
  return (
    <motion.div
      id="download"
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      className="mx-auto flex max-w-2xl scroll-mt-28 flex-col items-center gap-5 rounded-[28px] border border-white/10 bg-white/[0.04] p-6 text-center sm:flex-row sm:text-start"
    >
      {/* eslint-disable-next-line @next/next/no-img-element -- a small fixed icon from /public */}
      <img src={`/apps/${app}-192.png`} alt="" width={80} height={80} className="size-20 shrink-0 rounded-[22px] shadow-xl" />
      <div className="flex-1">
        <p className="text-lg font-bold">{tr("ضعه على شاشة جوالك", "Put it on your home screen")}</p>
        <p className="mt-1 text-sm text-white/65">{tr("يُفتح من أيقونته كأي تطبيق، بلا متجر ولا تحميل كبير، ويعمل على أي جوال.", "It opens from its own icon like any app, with no store and no big download, on any phone.")}</p>
      </div>
      <InstallButton app={app} />
    </motion.div>
  );
}

/** The main buttons, fixed at the bottom of a phone (on a computer they are in the hero and the top bar). */
export function StickyActions({ children, note }: { children: ReactNode; note?: string }) {
  return (
    <div className="fixed inset-x-0 bottom-0 z-40 border-t border-white/10 bg-[#0b0c0e]/85 px-4 pb-[calc(env(safe-area-inset-bottom)+12px)] pt-3 backdrop-blur-xl lg:hidden">
      <div className="mx-auto flex max-w-xl gap-2">{children}</div>
      {note && <p className="mx-auto mt-2 max-w-xl text-center text-[11px] text-white/55">{note}</p>}
    </div>
  );
}

/** A big rounded action button with a moving shine. */
export function BigButton({ href, children, color, ghost, className }: { href: string; children: ReactNode; color?: string; ghost?: boolean; className?: string }) {
  return (
    <Link
      href={href}
      className={cn(
        "inline-flex h-13 items-center justify-center gap-2 rounded-2xl px-6 text-base font-bold transition active:scale-[0.98]",
        ghost ? "border border-white/15 bg-white/5 text-white backdrop-blur hover:bg-white/10" : "shine text-[#0b0c0e] shadow-[0_10px_40px_-10px_var(--btn)] hover:brightness-105",
        className,
      )}
      style={ghost ? undefined : ({ background: color, "--btn": color } as React.CSSProperties)}
    >
      {children}
    </Link>
  );
}

/** The page's footer. */
export function AppFooter({ other }: { other: { href: string; label: string } }) {
  const { tr } = useFmt();
  return (
    <footer className="border-t border-white/5">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-6 text-sm text-white/55">
        <span className="flex items-center gap-2">
          <LogoMark size={22} /> © 2026 <BrandName company />
        </span>
        <span className="flex gap-4">
          <Link href="/" className="hover:text-white">
            {tr("الموقع الرئيسي", "Main website")}
          </Link>
          <Link href={other.href} className="hover:text-white">
            {other.label}
          </Link>
        </span>
      </div>
    </footer>
  );
}
