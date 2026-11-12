"use client";

// The manager's desk seen from above, after the "New workplace: choices & creation" illustration:
// thin hand-drawn lines with soft fills, four cards (أ ب ج د) on the desk, two hands choosing,
// a glass of tea, rulers, a sticky note, and a heart bubble that pops when a decision is done.
// Lines use currentColor, so the drawing follows day / night mode.
import { motion, useReducedMotion } from "motion/react";
import { LANES } from "./data";

/** A pointing hand, drawn pointing to the left from (0, 0) = the finger tip. */
function Hand({ x, y, rotate, delay, still }: { x: number; y: number; rotate: number; delay: number; still: boolean | null }) {
  return (
    <motion.g
      initial={false}
      animate={still ? undefined : { x: [x, x - 6, x], y: [y, y + 3, y] }}
      transition={{ duration: 2.6, delay, repeat: Infinity, ease: "easeInOut" }}
      style={{ x, y }}
    >
      <g transform={`rotate(${rotate})`}>
        {/* sleeve */}
        <path d="M 78 -20 C 110 -26 150 -22 190 -10 L 190 34 C 150 28 112 30 82 26 Z" fill="var(--dec-soft)" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
        {/* hand + pointing finger */}
        <path
          d="M 82 -16 C 70 -22 52 -20 44 -14 L 4 -8 C -4 -7 -4 4 4 5 L 40 6 C 36 12 38 22 46 24 C 42 30 46 38 54 38 C 52 44 58 50 66 48 C 76 46 82 40 84 30 Z"
          fill="var(--card)"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinejoin="round"
        />
        <path d="M 46 24 C 54 24 60 22 64 18 M 54 38 C 62 37 68 34 72 30" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      </g>
    </motion.g>
  );
}

export function DeskArt({ counts, cheer }: { counts: Record<string, number>; cheer: number }) {
  const still = useReducedMotion();
  const cards = [
    { x: 92, y: 96, r: -4 },
    { x: 182, y: 72, r: 2 },
    { x: 272, y: 100, r: -2 },
    { x: 362, y: 80, r: 3 },
  ];
  return (
    <svg viewBox="0 0 520 300" className="h-auto w-full text-[var(--dec-line)]" aria-hidden="true" style={{ direction: "ltr" }}>
      {/* Desk edge and rulers */}
      <path d="M 10 230 L 510 170" fill="none" stroke="currentColor" strokeOpacity="0.25" strokeWidth="2" strokeDasharray="1 7" strokeLinecap="round" />
      <path d="M 18 40 L 118 40 L 18 120 Z M 38 56 L 78 56 L 38 88 Z" fill="none" stroke="currentColor" strokeOpacity="0.35" strokeWidth="2" strokeLinejoin="round" />
      <path d="M 420 290 L 500 220 L 500 290 Z M 468 278 L 488 260 L 488 278 Z" fill="none" stroke="currentColor" strokeOpacity="0.35" strokeWidth="2" strokeLinejoin="round" />

      {/* A glass of tea on a saucer (top view), with a little steam */}
      <g transform="translate(470 70)">
        <circle r="30" fill="var(--card)" stroke="currentColor" strokeWidth="2" />
        <circle r="19" fill="#b4533c" fillOpacity="0.85" stroke="currentColor" strokeWidth="2" />
        <circle r="12" fill="#c46a3f" />
        <path d="M -4 -2 C -2 -8 4 -8 5 -2 C 6 4 0 6 -2 2" fill="none" stroke="#f5e6d3" strokeWidth="2" strokeLinecap="round" />
        {!still && (
          <motion.path
            d="M -6 -40 C -10 -48 -2 -52 -6 -60 M 6 -40 C 2 -48 10 -52 6 -60"
            fill="none"
            stroke="currentColor"
            strokeOpacity="0.4"
            strokeWidth="2"
            strokeLinecap="round"
            animate={{ opacity: [0.2, 0.7, 0.2], y: [0, -4, 0] }}
            transition={{ duration: 3, repeat: Infinity }}
          />
        )}
      </g>

      {/* Sticky note with a scribble */}
      <g transform="translate(36 186) rotate(-10)">
        <rect width="54" height="50" rx="3" fill="#f2c14e" fillOpacity="0.55" stroke="currentColor" strokeWidth="2" />
        <path d="M 10 30 C 16 18 22 40 28 26 C 32 18 38 34 44 26" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      </g>

      {/* The four decision cards, like A B C D in the design */}
      {LANES.map((l, i) => {
        const c = cards[i];
        const n = counts[l.id] ?? 0;
        return (
          <g key={l.id} transform={`translate(${c.x} ${c.y}) rotate(${c.r})`}>
            <rect width="72" height="104" rx="4" fill="var(--card)" stroke="currentColor" strokeWidth="2" />
            <rect x="12" y="12" width="48" height="36" fill={l.color} fillOpacity={n ? 0.9 : 0.25} />
            <text x="36" y="38" textAnchor="middle" fontSize="20" fontWeight="700" fill={n ? "#fff" : "currentColor"}>
              {l.letter}
            </text>
            <path d="M 12 60 L 60 60 M 12 70 L 48 70" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            <path d="M 12 88 C 18 78 22 96 28 84 C 32 78 36 92 42 86" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
            {n > 0 && (
              <g transform="translate(66 6)">
                <circle r="11" fill="#b71d08" />
                <text y="4" textAnchor="middle" fontSize="11" fontWeight="700" fill="#fff">
                  {n}
                </text>
              </g>
            )}
          </g>
        );
      })}

      {/* The heart bubble: pops each time a decision is done */}
      <motion.g key={cheer} initial={still ? false : { scale: 0.4, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ type: "spring", stiffness: 300, damping: 12 }} style={{ originX: "232px", originY: "40px" }}>
        <g transform="translate(206 8)">
          <path d="M 0 8 C 0 2 4 0 10 0 L 46 0 C 52 0 56 2 56 8 L 56 30 C 56 36 52 38 46 38 L 24 38 L 14 48 L 15 38 L 10 38 C 4 38 0 36 0 30 Z" fill="var(--dec-bubble)" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
          <path d="M 28 31 C 18 24 15 19 18 14 C 21 10 26 11 28 15 C 30 11 35 10 38 14 C 41 19 38 24 28 31 Z" fill="#fff" />
        </g>
      </motion.g>

      {/* Two hands choosing, like in the design */}
      <Hand x={220} y={188} rotate={90} delay={0} still={still} />
      <Hand x={440} y={160} rotate={10} delay={1.2} still={still} />
    </svg>
  );
}
