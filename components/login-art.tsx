"use client";

// The login illustration, after the "Login Page Illustration - Online Payment" shot Yasser chose:
// an isometric scene drawn in SVG (no image files): a warehouse keeper and a rep next to a big tablet
// that shows an order being ticked, with floating cards around them (invoice, chart, carton, coin).
// Isometric trick: a flat drawing is put on a face of the "3D" world with one matrix:
//   right face  = matrix(0.866 -0.5 0 1)  (leans up to the right)
//   left face   = matrix(0.866 0.5 0 1)   (leans down to the right)
//   floor (top) = matrix(0.866 0.5 -0.866 0.5)
// 0.866 = cos 30°, 0.5 = sin 30°: the classic 30° isometric angles.
// The floating and the blinking are plain CSS (globals.css: la-float, la-blink), and they stop by themselves
// for people who asked for less motion: the login page needs no animation library.

const RIGHT = "matrix(0.866 -0.5 0 1 0 0)";
const LEFT = "matrix(0.866 0.5 0 1 0 0)";
const FLOOR = "matrix(0.866 0.5 -0.866 0.5 0 0)";

/** A gentle up-and-down float, each card with its own delay and height. */
function Float({ children, delay = 0, dy = 8 }: { children: React.ReactNode; delay?: number; dy?: number; still?: boolean | null }) {
  return (
    <g className="la-float" style={{ animationDelay: `${delay}s`, ["--la-dy" as string]: `${-dy}px` }}>
      {children}
    </g>
  );
}

export function LoginArt() {
  const still = false;
  const rows = [0, 1, 2, 3];
  return (
    <svg viewBox="0 0 520 440" className="h-auto w-full" aria-hidden="true" style={{ direction: "ltr" }}>
      <defs>
        <linearGradient id="la-screen" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#2b3038" />
          <stop offset="1" stopColor="#1d2127" />
        </linearGradient>
        <linearGradient id="la-orange" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#f08a52" />
          <stop offset="1" stopColor="#e1692b" />
        </linearGradient>
      </defs>

      {/* Floor platforms (soft rounded tiles lying on the ground) */}
      <g transform="translate(250 330)">
        <g transform={FLOOR}>
          <rect x="-150" y="-150" width="300" height="300" rx="60" className="fill-[var(--iso-ground-side)]" opacity="0.7" />
          <rect x="-110" y="-110" width="220" height="220" rx="44" className="fill-[var(--iso-ground)]" />
        </g>
      </g>
      <g transform="translate(118 352)">
        <g transform={FLOOR}>
          <circle r="52" fill="#e1692b" opacity="0.14" />
        </g>
      </g>
      <g transform="translate(372 360)">
        <g transform={FLOOR}>
          <circle r="52" fill="#e1692b" opacity="0.14" />
        </g>
      </g>

      {/* The big tablet, standing on the floor (right face), with an order being ticked */}
      <g transform="translate(205 300)">
        <g transform={RIGHT}>
          <rect x="6" y="-232" width="150" height="232" rx="18" fill="#111317" />
          <rect x="0" y="-238" width="150" height="232" rx="18" fill="url(#la-screen)" />
          <rect x="12" y="-224" width="126" height="26" rx="8" fill="#e1692b" />
          <rect x="22" y="-215" width="50" height="7" rx="3.5" fill="#1a0b03" opacity="0.8" />
          {rows.map((i) => (
            <g key={i} transform={`translate(14 ${-186 + i * 36})`}>
              <rect width="122" height="28" rx="8" fill="#2f353e" />
              <circle cx="14" cy="14" r="7" fill={i < 3 ? "#7cc47f" : "#4a515c"} />
              {i < 3 && <path d="M 10.5 14 L 13 16.5 L 17.5 11.5" fill="none" stroke="#17271a" strokeWidth="2" strokeLinecap="round" />}
              <rect x="28" y="8" width={60 - i * 6} height="5" rx="2.5" fill="#e6e8eb" opacity="0.85" />
              <rect x="28" y="17" width="36" height="4" rx="2" fill="#a3a9b2" opacity="0.6" />
              {!still && i === 3 && (
                <circle className="la-blink" cx="14" cy="14" r="7" fill="#7cc47f" />
              )}
            </g>
          ))}
          <rect x="14" y="-36" width="122" height="22" rx="11" fill="url(#la-orange)" />
        </g>
      </g>

      {/* Floating cards */}
      {/* Invoice in dinars (left face) */}
      <Float still={still} delay={0.2}>
        <g transform="translate(56 120)">
          <g transform={LEFT}>
            <rect width="104" height="70" rx="12" className="fill-[var(--card)]" stroke="#e1692b" strokeOpacity="0.35" />
            <rect x="12" y="12" width="44" height="7" rx="3.5" fill="#1d2127" opacity="0.8" />
            <rect x="12" y="26" width="70" height="5" rx="2.5" fill="#a3a9b2" opacity="0.6" />
            <rect x="12" y="36" width="56" height="5" rx="2.5" fill="#a3a9b2" opacity="0.6" />
            <text x="12" y="60" fontSize="12" fontWeight="700" fill="#e1692b">
              177,000 د.ع
            </text>
          </g>
        </g>
      </Float>

      {/* Sales chart (right face) */}
      <Float still={still} delay={1} dy={10}>
        <g transform="translate(330 96)">
          <g transform={RIGHT}>
            <rect width="110" height="72" rx="12" className="fill-[var(--card)]" stroke="#1d2127" strokeOpacity="0.12" />
            {[22, 34, 26, 46, 38].map((h, i) => (
              <rect key={i} x={14 + i * 18} y={60 - h} width="11" height={h} rx="3" fill={i === 3 ? "#e1692b" : "#8fb0d3"} />
            ))}
          </g>
        </g>
      </Float>

      {/* A carton box (three faces of a cube) */}
      <Float still={still} delay={0.6} dy={6}>
        <g transform="translate(462 300)">
          <g transform={FLOOR}>
            <rect x="-26" y="-26" width="52" height="52" fill="#d9a066" />
            <rect x="-4" y="-26" width="8" height="52" fill="#b98247" />
          </g>
          <g transform="translate(-22.5 13)">
            <g transform={LEFT}>
              <rect width="52" height="40" fill="#c48a52" />
            </g>
          </g>
          <g transform="translate(0 26)">
            <g transform={RIGHT}>
              <rect width="52" height="40" fill="#a8743f" />
              <rect x="10" y="10" width="20" height="8" rx="2" fill="#f5e6d3" opacity="0.8" />
            </g>
          </g>
        </g>
      </Float>

      {/* The dinar coin */}
      <Float still={still} delay={1.4} dy={12}>
        <g transform="translate(150 64)">
          <circle r="22" fill="#c99a2e" />
          <circle r="17" fill="#f2c14e" />
          <text y="5" textAnchor="middle" fontSize="13" fontWeight="800" fill="#7a5a12">
            د.ع
          </text>
        </g>
      </Float>

      {/* The warehouse keeper (left), holding a clipboard */}
      <g transform="translate(118 350)">
        <ellipse cx="0" cy="0" rx="22" ry="8" fill="#000" opacity="0.12" />
        <rect x="-11" y="-62" width="9" height="62" rx="4" fill="#1d2127" />
        <rect x="2" y="-62" width="9" height="62" rx="4" fill="#2b3038" />
        <path d="M -20 -120 Q 0 -130 20 -120 L 22 -60 L -22 -60 Z" fill="#2b3038" />
        {/* safety vest */}
        <path d="M -18 -118 L -6 -118 L -4 -66 L -20 -66 Z" fill="#e1692b" />
        <path d="M 18 -118 L 6 -118 L 4 -66 L 20 -66 Z" fill="#e1692b" />
        <rect x="-20" y="-92" width="40" height="4" fill="#f5e6d3" opacity="0.9" />
        <circle cx="0" cy="-138" r="15" fill="#e8b48f" />
        <path d="M -15 -140 Q -14 -158 2 -156 Q 16 -155 15 -140 Q 8 -148 -15 -140 Z" fill="#1d2127" />
        {/* clipboard */}
        <g transform="rotate(-12 22 -96)">
          <rect x="16" y="-112" width="24" height="32" rx="3" fill="#f5e6d3" />
          <rect x="21" y="-104" width="14" height="3" rx="1.5" fill="#1d2127" opacity="0.6" />
          <rect x="21" y="-97" width="10" height="3" rx="1.5" fill="#1d2127" opacity="0.6" />
        </g>
        <path d="M 18 -112 Q 28 -100 26 -90" fill="none" stroke="#e8b48f" strokeWidth="7" strokeLinecap="round" />
      </g>

      {/* The rep (right), pointing at the tablet */}
      <g transform="translate(378 356)">
        <ellipse cx="0" cy="0" rx="22" ry="8" fill="#000" opacity="0.12" />
        <rect x="-11" y="-64" width="9" height="64" rx="4" fill="#3f6f9e" />
        <rect x="2" y="-64" width="9" height="64" rx="4" fill="#355e86" />
        <path d="M -20 -122 Q 0 -132 20 -122 L 22 -62 L -22 -62 Z" fill="#e6e8eb" />
        <path d="M -4 -122 L 0 -110 L 4 -122 Z" fill="#a3a9b2" />
        <circle cx="0" cy="-140" r="15" fill="#d9a07a" />
        {/* cap */}
        <path d="M -16 -143 Q -14 -160 2 -159 Q 17 -158 16 -144 Z" fill="#e1692b" />
        <path d="M -16 -145 L -30 -143 L -16 -140 Z" fill="#c4561d" />
        {/* arm pointing to the tablet */}
        <path d="M -18 -114 Q -40 -118 -58 -134" fill="none" stroke="#e6e8eb" strokeWidth="10" strokeLinecap="round" />
        <circle cx="-60" cy="-136" r="5.5" fill="#d9a07a" />
        {/* bag strap + bag */}
        <path d="M 14 -120 L -14 -78" stroke="#1d2127" strokeWidth="3" />
        <rect x="-22" y="-82" width="18" height="14" rx="3" fill="#1d2127" />
      </g>

      {/* Little sparkles */}
      {[
        [470, 60],
        [40, 250],
        [300, 30],
      ].map(([x, y], i) => (
        <path key={i} d={`M ${x} ${y - 7} L ${x + 2} ${y - 2} L ${x + 7} ${y} L ${x + 2} ${y + 2} L ${x} ${y + 7} L ${x - 2} ${y + 2} L ${x - 7} ${y} L ${x - 2} ${y - 2} Z`} fill="#e1692b" opacity="0.5" />
      ))}
    </svg>
  );
}
