"use client";

// Small pieces the landing page sections share.
import { Fragment } from "react";
import { motion } from "motion/react";
import { cn } from "@/lib/utils";

/** A heading whose words slide up one after another when it scrolls into view. */
/** onLoad: animate as soon as the page opens (for a heading at the top, already on screen),
 *  instead of waiting for it to scroll into view. */
export function WordReveal({ text, className, as: Tag = "h2", onLoad }: { text: string; className?: string; as?: "h1" | "h2" | "p"; onLoad?: boolean }) {
  const words = text.split(" ");
  return (
    <Tag className={className}>
      {words.map((w, i) => (
        <Fragment key={i}>
          {/* Each word sits in a box that hides what's outside it (overflow-hidden), so it looks like it rises out of a line. */}
          <span className="inline-block overflow-hidden pb-[0.12em] align-bottom">
            <motion.span
              className="inline-block"
              initial={{ y: "110%" }}
              {...(onLoad ? { animate: { y: 0 } } : { whileInView: { y: 0 }, viewport: { once: true, margin: "-60px" } })}
              transition={{ duration: 0.6, delay: i * 0.06, ease: [0.22, 1, 0.36, 1] }}
            >
              {w}
            </motion.span>
          </span>
          {/* The space is outside the boxes; inside a box at its end it would disappear. */}
          {i < words.length - 1 ? " " : null}
        </Fragment>
      ))}
    </Tag>
  );
}

/** Fade + slide up when the element scrolls into view (once). */
export const rise = (delay = 0) => ({
  initial: { opacity: 0, y: 28 },
  whileInView: { opacity: 1, y: 0 },
  viewport: { once: true, margin: "-60px" },
  transition: { duration: 0.6, delay, ease: [0.22, 1, 0.36, 1] as const },
});

/**
 * Twinkling stars. The positions come from a fixed "random" sequence (not Math.random),
 * so the server and the browser draw the same stars and React doesn't complain.
 */
function makeStars(count: number, seed: number) {
  let s = seed;
  const next = () => {
    s = (s * 9301 + 49297) % 233280;
    return s / 233280;
  };
  return Array.from({ length: count }, () => ({ x: next() * 100, y: next() * 100, size: 1 + next() * 2, delay: next() * 3 }));
}

export function Stars({ count = 40, seed = 7, className }: { count?: number; seed?: number; className?: string }) {
  const stars = makeStars(count, seed);
  return (
    <div className={cn("pointer-events-none absolute inset-0", className)} aria-hidden>
      {stars.map((st, i) => (
        <span
          key={i}
          className="twinkle absolute rounded-full bg-white"
          style={{ left: `${st.x}%`, top: `${st.y}%`, width: st.size, height: st.size, animationDelay: `${st.delay}s` }}
        />
      ))}
    </div>
  );
}

/** A small label above a section heading. */
export function Eyebrow({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-2 rounded-full border border-line bg-card/60 px-3 py-1 text-xs font-medium text-primary-ink backdrop-blur">
      <span className="size-1.5 rounded-full bg-action" />
      {children}
    </span>
  );
}
