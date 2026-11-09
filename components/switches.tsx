"use client";

// The day/night button and the language button, with animations.
// Day/night: the new colors spread in a circle from the button, and the sun/moon icon spins in.
// Language: the page cross-fades while it flips direction, and the word slides up.
import { AnimatePresence, motion } from "motion/react";
import { Moon, Sun } from "lucide-react";
import { setLang, useFmt } from "@/lib/i18n";
import { setTheme, useTheme } from "@/lib/theme";
import { cn } from "@/lib/utils";
import { circleSwitch, fadeSwitch } from "@/lib/view-transition";

const base =
  "relative inline-flex h-10 shrink-0 items-center justify-center overflow-hidden rounded-xl border transition-colors";

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
    <motion.button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      whileHover={{ scale: 1.06 }}
      whileTap={{ scale: 0.88 }}
      className={cn(base, "w-10", onBrand ? "border-white/20 bg-white/10 text-white hover:bg-white/20" : "border-line bg-card text-muted hover:text-text", className)}
    >
      <AnimatePresence mode="popLayout" initial={false}>
        <motion.span
          key={next}
          initial={{ rotate: -120, scale: 0, opacity: 0 }}
          animate={{ rotate: 0, scale: 1, opacity: 1 }}
          exit={{ rotate: 120, scale: 0, opacity: 0 }}
          transition={{ type: "spring", stiffness: 260, damping: 18 }}
          className="flex"
        >
          {next === "dark" ? <Moon className="size-[18px]" aria-hidden /> : <Sun className="size-[18px]" aria-hidden />}
        </motion.span>
      </AnimatePresence>
    </motion.button>
  );
}

export function LanguageSwitch({ className, onBrand }: { className?: string; onBrand?: boolean }) {
  const { lang } = useFmt();
  // The button shows the OTHER language: what you get if you press it.
  const label = lang === "ar" ? "English" : "العربية";
  return (
    <motion.button
      type="button"
      onClick={() => fadeSwitch(() => setLang(lang === "ar" ? "en" : "ar"))}
      whileHover={{ scale: 1.04 }}
      whileTap={{ scale: 0.92 }}
      aria-label={label}
      className={cn(base, "gap-1.5 px-3 text-sm font-semibold", onBrand ? "border-white/20 bg-white/10 text-white hover:bg-white/20" : "border-line bg-card text-text hover:bg-card-2", className)}
    >
      <span className={cn("flex size-5 items-center justify-center rounded-md text-[10px] font-bold", onBrand ? "bg-white/15" : "bg-primary-soft text-primary-ink")} aria-hidden>
        {lang === "ar" ? "EN" : "ع"}
      </span>
      <AnimatePresence mode="popLayout" initial={false}>
        <motion.span
          key={lang}
          initial={{ y: 14, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: -14, opacity: 0 }}
          transition={{ type: "spring", stiffness: 300, damping: 24 }}
          className="hidden sm:inline"
        >
          {label}
        </motion.span>
      </AnimatePresence>
    </motion.button>
  );
}
