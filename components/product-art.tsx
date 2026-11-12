"use client";

// How a product looks everywhere (the shop's store, the public catalog on the shop owners' landing page):
// its photo, or (no photo yet) a colored tile with the category's icon. Small on purpose (no store code).
import type React from "react";
import { Candy, Croissant, CupSoda, Droplets, Leaf, Milk, Package, Soup, Wheat } from "lucide-react";
import { cn } from "@/lib/utils";

// ---------- How an item looks: its photo, or (no photo yet) a colored tile with the category icon ----------
export const KINDS = [/حبوب|رز/, /سكر|طحين/, /زيوت|سمن/, /معلبات/, /مشروبات/, /ألبان/, /حلويات/, /بهارات/];
export const ACCENTS = ["#e1692b", "#c99a2e", "#4f8a5b", "#3f6f9e", "#b4533c", "#8a6bb0", "#2f8f8a", "#9a7b4f"];

/** The icon of a category. A switch with fixed icons (not "pick a component, then render it"),
 *  because React wants every component to be known before rendering. */
export function CatIcon({ category, ...props }: { category: string; className?: string; style?: React.CSSProperties; strokeWidth?: number }) {
  switch (KINDS.findIndex((re) => re.test(category))) {
    case 0:
      return <Wheat {...props} />;
    case 1:
      return <Croissant {...props} />;
    case 2:
      return <Droplets {...props} />;
    case 3:
      return <Soup {...props} />;
    case 4:
      return <CupSoda {...props} />;
    case 5:
      return <Milk {...props} />;
    case 6:
      return <Candy {...props} />;
    case 7:
      return <Leaf {...props} />;
    default:
      return <Package {...props} />;
  }
}

/** The colored tile: the accent mixed into the card color, so it works in day and night mode. */
export function Art({ category, index, image, size = "md" }: { category: string; index: number; image?: string; size?: "sm" | "md" | "lg" | "xl" }) {
  const box = size === "xl" ? "aspect-[4/3] max-h-72 w-full" : size === "lg" ? "h-48" : size === "sm" ? "aspect-square" : "aspect-[4/3]";
  const accent = ACCENTS[index % ACCENTS.length];
  // The real photo, when the manager or the warehouse keeper added one.
  if (image)
    return (
      <div className={cn("overflow-hidden rounded-2xl bg-card-2", box)}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={image} alt="" loading="lazy" className="size-full object-cover" />
      </div>
    );
  return (
    <div
      className={cn("relative flex items-center justify-center overflow-hidden rounded-2xl", box)}
      style={{ background: `radial-gradient(circle at 30% 25%, color-mix(in oklab, ${accent} 30%, var(--card)), color-mix(in oklab, ${accent} 12%, var(--card)) 70%)` }}
    >
      <span className="absolute -bottom-6 -end-6 size-24 rounded-full opacity-25" style={{ background: accent }} aria-hidden />
      <CatIcon category={category} className={size === "lg" || size === "xl" ? "size-20" : size === "sm" ? "size-9" : "size-12"} style={{ color: accent }} strokeWidth={1.5} />
    </div>
  );
}
