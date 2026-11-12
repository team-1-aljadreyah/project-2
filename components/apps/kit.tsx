"use client";

// The pieces both phone-app landing pages share (/client for shop owners, /driver for reps):
// the colored moving background, the glass top bar, a drawn phone whose screens change by themselves,
// numbers that count up, a strip that slides, the questions, the "install" card and the buttons fixed
// at the bottom of a phone. The pages are dark and colorful on purpose, like the main landing page.
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { AnimatePresence, animate, motion, useInView } from "motion/react";
import { ChevronDown, Download, Share } from "lucide-react";
import { BrandName, LogoMark } from "@/components/logo";
import { LanguageSwitch } from "@/components/switches";
import { homeOf, useSession } from "@/lib/auth";
import { useFmt } from "@/lib/i18n";
import { cn } from "@/lib/utils";

export type AppKind = "client" | "driver";

/** Who is here: logged in to this app (then "open the app"), to another job, or not logged in. */
export function useAppEntry(app: AppKind) {
  const router = useRouter();
  const session = useSession();
  const role = session?.user.role;
  const mine = app === "client" ? role === "shop" : role === "rep";
  const home = session ? homeOf(session.user.role, session.user.rep_kinds) : "/login";
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

/** The browser's "install this app" offer (Chrome / Android), kept until the button is pressed. */
interface InstallPrompt extends Event {
  prompt: () => Promise<void>;
}
const isIos = () => /iphone|ipad|ipod/i.test(navigator.userAgent) && !window.matchMedia("(display-mode: standalone)").matches;

/** "Put it on your home screen": the browser's install button when it offers one, the Share-menu way on iPhone. */
export function InstallCard({ app, color }: { app: AppKind; color: string }) {
  const { tr } = useFmt();
  const [install, setInstall] = useState<InstallPrompt | null>(null);
  const ios = useSyncExternalStore(
    () => () => {},
    isIos,
    () => false,
  );
  useEffect(() => {
    const keep = (e: Event) => {
      e.preventDefault();
      setInstall(e as InstallPrompt);
    };
    window.addEventListener("beforeinstallprompt", keep);
    return () => window.removeEventListener("beforeinstallprompt", keep);
  }, []);
  return (
    <motion.div initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} className="mx-auto flex max-w-2xl flex-col items-center gap-5 rounded-[28px] border border-white/10 bg-white/[0.04] p-6 text-center sm:flex-row sm:text-start">
      {/* eslint-disable-next-line @next/next/no-img-element -- a small fixed icon from /public */}
      <img src={`/apps/${app}-192.png`} alt="" width={80} height={80} className="size-20 shrink-0 rounded-[22px] shadow-xl" />
      <div className="flex-1">
        <p className="text-lg font-bold">{tr("ضعه على شاشة جوالك", "Put it on your home screen")}</p>
        <p className="mt-1 text-sm text-white/65">
          {ios
            ? tr("في Safari اضغط زر المشاركة ثم «إضافة إلى الشاشة الرئيسية»، فيصير له أيقونة كأي تطبيق.", "In Safari press Share, then “Add to Home Screen”: it gets an icon like any app.")
            : tr("يُفتح من أيقونته كأي تطبيق، بلا متجر ولا تحميل كبير، ويعمل على أي جوال.", "It opens from its own icon like any app, with no store and no big download, on any phone.")}
        </p>
        {ios && (
          <p className="mt-2 flex items-center justify-center gap-1.5 text-xs text-white/50 sm:justify-start">
            <Share className="size-3.5" /> {tr("زر المشاركة أسفل الشاشة في Safari", "The Share button at the bottom of Safari")}
          </p>
        )}
      </div>
      {install && (
        <button
          type="button"
          onClick={async () => {
            await install.prompt();
            setInstall(null);
          }}
          className="inline-flex h-12 shrink-0 items-center gap-2 rounded-2xl px-5 font-bold text-[#0b0c0e] transition active:scale-[0.98]"
          style={{ background: color }}
        >
          <Download className="size-5" /> {tr("ثبّت التطبيق", "Install")}
        </button>
      )}
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
