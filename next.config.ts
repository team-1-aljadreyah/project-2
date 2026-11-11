import type { NextConfig } from "next";

// Cloudflare Pages: the site is built as plain files (HTML, JS, CSS) in "out/" — no server needed, because
// every page runs in the browser and talks to the backend at NEXT_PUBLIC_API_URL (or to the demo data in
// the browser when NEXT_PUBLIC_USE_MOCK=true). Only for that build: Cloudflare sets CF_PAGES=1 while it
// builds, and `npm run build:pages` sets STATIC_EXPORT=true. `npm run dev` stays a normal Next server.
const staticExport = process.env.CF_PAGES === "1" || process.env.STATIC_EXPORT === "true";

const nextConfig: NextConfig = {
  ...(staticExport
    ? {
        output: "export" as const,
        // /orders/ → out/orders/index.html: the folder style Cloudflare Pages serves with no rule.
        trailingSlash: true,
      }
    : {}),
  // Partial pre-rendering needs a Next server: on with `npm run dev` / `next start`, off in the static export.
  cacheComponents: !staticExport,
  partialPrefetching: !staticExport,
  // Most pages wait for the login in the browser, so the "instant navigation" check runs only on pages that
  // ask for it (export const instant = ...). Development warnings only; it needs Cache Components.
  ...(staticExport ? {} : { experimental: { instantInsights: { validationLevel: "manual-warning" as const } } }),
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
