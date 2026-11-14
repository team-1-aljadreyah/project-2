// What the site looks like before the manager customizes anything (see lib/site.ts).
import type { SiteCustom } from "./types";

export const DEFAULT_SITE: SiteCustom = {
  brand: {
    name: "النهرين",
    name_en: "Al-Nahrain",
    tagline: "للمواد الغذائية بالجملة",
    tagline_en: "Wholesale foods",
    company: "شركة النهرين للمواد الغذائية",
    company_en: "Al-Nahrain Foods Co.",
    phone: "",
  },
  nav: { order: [], hidden: [], groups: {}, labels: {}, group_labels: {} },
  dashboard: { order: [], hidden: [], labels: {} },
  categories: [],
  texts: {},
  layouts: {},
  look: {},
  profiles: [],
  apps: [],
  fields: [],
  rules: [],
  banners: [],
};

/** Fill what is missing with the defaults (an older saved copy may not have every part). */
export function fullSite(s: Partial<SiteCustom> | null | undefined): SiteCustom {
  return {
    brand: { ...DEFAULT_SITE.brand, ...s?.brand },
    nav: { ...DEFAULT_SITE.nav, ...s?.nav },
    dashboard: { ...DEFAULT_SITE.dashboard, ...s?.dashboard },
    categories: s?.categories ?? [],
    texts: s?.texts ?? {},
    layouts: s?.layouts ?? {},
    look: s?.look ?? {},
    profiles: s?.profiles ?? [],
    apps: s?.apps ?? [],
    fields: s?.fields ?? [],
    rules: s?.rules ?? [],
    banners: s?.banners ?? [],
    // Read only (the server works it out from the advanced settings): kept as it came.
    ...(s?.live ? { live: s.live } : {}),
  };
}

/** Put a list in the saved order. What is not in the saved order keeps its place after the rest. */
export function ordered<T>(list: T[], order: string[], idOf: (x: T) => string): T[] {
  const at = (x: T) => {
    const i = order.indexOf(idOf(x));
    return i < 0 ? order.length : i;
  };
  return [...list].sort((a, b) => at(a) - at(b));
}
