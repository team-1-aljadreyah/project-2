"use client";

// The day/night button and the language button, with animations.
// Day/night: the new colors spread in a circle from the button, and the sun/moon icon spins in.
// Language: the page cross-fades while it flips direction, and the word slides up.
// The small animations are plain CSS (globals.css: anim-pop-spin, anim-slide-up): these buttons are on every
// page, so they don't pull the animation library into every page's first load.
import { Moon, Sun } from "lucide-react";
import { setLang, useFmt } from "@/lib/i18n";
import { setTheme, useTheme } from "@/lib/theme";
import { cn } from "@/lib/utils";
import { circleSwitch, fadeSwitch } from "@/lib/view-transition";

const base =
  "relative inline-flex h-10 shrink-0 items-center justify-center overflow-hidden rounded-xl border transition-[color,background-color,transform] hover:scale-[1.05] active:scale-[0.9]";

export function ThemeToggle({ className, onBrand }: { className?: string; onBrand?: boolean }) {
  const { tr } = useFmt();
  const theme = useTheme();
  const next = theme === "dark" ? "light" : "dark";
  const label = next === "dark" ? tr("الوضع الليلي", "Night mode") : tr("الوضع النهاري", "Day mode");

  function onClick(e: React.MouseEvent<HTMLButtonElement>) {
    // Start the circle from the middle of this button.
    const r = e.currentTarget.getBoundingClientRect();
    circleSwitch(() => setTheme(next), r.left + r.width / 2, r.top + r.height / 2);
  }

  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className={cn(base, "w-10", onBrand ? "border-white/20 bg-white/10 text-white hover:bg-white/20" : "border-line bg-card text-muted hover:text-text", className)}
    >
      {/* A new key on each switch: the icon plays its spin-in again. */}
      <span key={next} className="anim-pop-spin flex">
        {next === "dark" ? <Moon className="size-[18px]" aria-hidden /> : <Sun className="size-[18px]" aria-hidden />}
      </span>
    </button>
  );
}

export function LanguageSwitch({ className, onBrand }: { className?: string; onBrand?: boolean }) {
  const { lang } = useFmt();
  // The button shows the OTHER language: what you get if you press it.
  const label = lang === "ar" ? "English" : "العربية";
  return (
    <button
      type="button"
      onClick={() => fadeSwitch(() => setLang(lang === "ar" ? "en" : "ar"))}
      aria-label={`${lang === "ar" ? "EN" : "ع"} ${label}`}
      className={cn(base, "gap-1.5 px-3 text-sm font-semibold", onBrand ? "border-white/20 bg-white/10 text-white hover:bg-white/20" : "border-line bg-card text-text hover:bg-card-2", className)}
    >
      <span className={cn("flex size-5 items-center justify-center rounded-md text-[10px] font-bold", onBrand ? "bg-white/15" : "bg-primary-soft text-primary-ink")} aria-hidden>
        {lang === "ar" ? "EN" : "ع"}
      </span>
      <span key={lang} className="anim-slide-up hidden sm:inline">
        {label}
      </span>
    </button>
  );
}
