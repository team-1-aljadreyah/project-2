"use client";

// A pointer with a name tag that drifts around, like the live cursors of people working together
// in the design. Here it shows who is working today (reps who took orders, staff who issued them).
import { motion, useReducedMotion } from "motion/react";
import { cn } from "@/lib/utils";

export function NamedCursor({
  name,
  tone,
  path,
  duration = 9,
  delay = 0,
  unit = "%",
}: {
  name: string;
  tone: "orange" | "green";
  /** Points to move between, in % of the box (or px with unit="px"). */
  path: { x: number; y: number }[];
  duration?: number;
  delay?: number;
  unit?: "%" | "px";
}) {
  const reduce = useReducedMotion();
  const xs = path.map((p) => `${p.x}${unit}`);
  const ys = path.map((p) => `${p.y}${unit}`);
  return (
    <motion.div
      // Always left-to-right: the tip of the arrow (its top-left corner) is the exact point, in both languages.
      dir="ltr"
      className="pointer-events-none absolute z-20 flex items-start"
      style={{ left: xs[0], top: ys[0] }}
      // Go through the points, then come back the same way, forever.
      animate={reduce ? undefined : { left: xs, top: ys }}
      transition={{ duration, delay, repeat: Infinity, repeatType: "mirror", ease: "easeInOut" }}
      aria-hidden
    >
      <svg width="18" height="18" viewBox="0 0 18 18" className={cn("-translate-x-0.5 drop-shadow", tone === "orange" ? "text-action" : "text-primary")}>
        <path d="M2 1.5 16 7.6 9.4 9.4 7.6 16Z" fill="currentColor" stroke="white" strokeWidth="1.2" strokeLinejoin="round" />
      </svg>
      <span
        className={cn(
          "mt-3 -ms-1 whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-semibold shadow-lg",
          tone === "orange" ? "bg-action text-on-action" : "bg-primary text-on-primary",
        )}
      >
        {name}
      </span>
    </motion.div>
  );
}
