"use client";

import Link from "next/link";
import { useFmt } from "@/lib/i18n";

/** Al-Nahrain mark: two rivers (the meaning of "Nahrain") inside a navy tile, with an amber sun. */
export function LogoMark({ size = 36 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" aria-hidden>
      <rect width="40" height="40" rx="10" fill="var(--primary)" />
      <circle cx="28" cy="12" r="4.5" fill="var(--action)" />
      <path d="M6 22c4-3 7-3 11 0s7 3 11 0 7-3 6-2" fill="none" stroke="var(--on-primary)" strokeWidth="3" strokeLinecap="round" />
      <path d="M6 30c4-3 7-3 11 0s7 3 11 0 7-3 6-2" fill="none" stroke="var(--on-primary)" strokeOpacity=".65" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

export function Logo({ small, href = "/" }: { small?: boolean; href?: string }) {
  const { tr } = useFmt();
  return (
    <Link href={href} className="flex min-w-0 items-center gap-2.5">
      <LogoMark size={small ? 32 : 36} />
      <span className="min-w-0 leading-tight">
        <span className="block truncate font-bold text-text">{tr("النهرين", "Al-Nahrain")}</span>
        {!small && <span className="block truncate text-xs text-muted">{tr("للمواد الغذائية بالجملة", "Wholesale foods")}</span>}
      </span>
    </Link>
  );
}
