"use client";

import Link from "next/link";
import { useId } from "react";
import { useFmt } from "@/lib/i18n";
import { useBrand, useSite } from "@/lib/site";
import { cn } from "@/lib/utils";

/**
 * The Al-Nahrain mark.
 * - The white bowl is the Arabic letter "ن" (the first letter of النهرين).
 * - Its dot is an orange sun.
 * - The two waves inside are the two rivers, Tigris and Euphrates ("Al-Nahrain" = "the two rivers").
 * Colors come from the design tokens, so the mark follows day/night mode.
 *
 * If the manager uploaded his own logo (customize mode), that picture shows instead.
 * `logo`: a picture to show now (the preview while choosing), or null for the drawn mark.
 */
export function LogoMark({ size = 36, className, logo }: { size?: number; className?: string; logo?: string | null }) {
  // Each logo on the page needs its own gradient id.
  const id = useId();
  const saved = useSite().brand.logo;
  const src = logo === undefined ? saved : logo;
  if (src)
    // A data URL: a plain <img> (next/image needs known hosts).
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={src} alt="" width={size} height={size} className={cn("shrink-0 object-cover", className)} style={{ borderRadius: size * 0.27 }} />;
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" className={className} aria-hidden>
      <defs>
        <linearGradient id={`${id}-bg`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="var(--primary)" />
          <stop offset="1" stopColor="var(--primary-hover)" />
        </linearGradient>
      </defs>
      <rect width="48" height="48" rx="13" fill={`url(#${id}-bg)`} />
      {/* a thin light edge, so the tile still shows on the green panels */}
      <rect x=".75" y=".75" width="46.5" height="46.5" rx="12.25" fill="none" stroke="#fff" strokeOpacity=".18" strokeWidth="1.5" />
      {/* the letter ن: a bowl */}
      <path d="M12 19v5a12 12 0 0 0 24 0v-5" fill="none" stroke="var(--on-primary)" strokeWidth="4.5" strokeLinecap="round" />
      {/* its dot: the sun */}
      <circle cx="24" cy="10.5" r="3.8" fill="var(--action)" />
      {/* the two rivers */}
      <path d="M17.5 25.5c2-1.6 4.5-1.6 6.5 0s4.5 1.6 6.5 0" fill="none" stroke="var(--action)" strokeWidth="2.6" strokeLinecap="round" />
      <path d="M19.5 31c1.5-1.2 3-1.2 4.5 0s3 1.2 4.5 0" fill="none" stroke="var(--on-primary)" strokeOpacity=".7" strokeWidth="2.6" strokeLinecap="round" />
    </svg>
  );
}

export function Logo({ small, href = "/" }: { small?: boolean; href?: string }) {
  const { tr } = useFmt();
  const brand = useBrand();
  return (
    <Link href={href} className="flex min-w-0 items-center gap-2.5" aria-label={tr("الصفحة الرئيسية", "Home page")}>
      <LogoMark size={small ? 32 : 38} />
      <span className="min-w-0 leading-tight">
        <span className="block truncate text-[17px] font-bold text-text">{brand.name}</span>
        {!small && <span className="block truncate text-xs text-muted">{brand.tagline}</span>}
      </span>
    </Link>
  );
}

/** The company's name as the manager set it: the short one, or the full one (`company`). */
export function BrandName({ company }: { company?: boolean }) {
  const brand = useBrand();
  return <>{company ? brand.company : brand.name}</>;
}
