"use client";

// The two phone apps live in their own address spaces, so an installed app never catches the other one:
// - /client/...  the shop owners' app (its install file has scope "/client")
// - /driver/...  the reps' app (scope "/driver")
// Their pages are the same screens as the rest of the site (app/client/(in) and app/driver/(in) only re-export
// them). Inside an app, a link or a move to one of its pages keeps the app's prefix ("/orders/5" becomes
// "/client/orders/5"), so the person never leaves the app window. A page the app doesn't have opens as it is.
import { usePathname, useRouter } from "next/navigation";
import { useMemo } from "react";

export type AppPrefix = "" | "/client" | "/driver";

/** The pages each app has (":id" = a record's number). Must match the folders in app/client/(in) and app/driver/(in). */
const PAGES: Record<Exclude<AppPrefix, "">, string[]> = {
  "/client": ["/shop", "/orders", "/orders/:id", "/invoices", "/invoices/:id", "/statement", "/notifications", "/returns/:id"],
  "/driver": [
    "/rep",
    "/deliveries",
    "/orders",
    "/orders/new",
    "/orders/:id",
    "/invoices",
    "/invoices/:id",
    "/returns",
    "/returns/new",
    "/returns/:id",
    "/customers",
    "/customers/:id",
    "/payments",
    "/payments/new",
    "/payments/:id",
    "/commissions",
    "/notifications",
  ],
};

/** "/client/orders/5?x=1" → { prefix: "/client", path: "/orders/5" }. The app's landing page is path "/". */
export function splitAppPath(full: string): { prefix: AppPrefix; path: string } {
  const clean = full.split(/[?#]/)[0] || "/";
  for (const prefix of ["/client", "/driver"] as const) {
    if (clean === prefix || clean.startsWith(prefix + "/")) return { prefix, path: clean.slice(prefix.length) || "/" };
  }
  return { prefix: "", path: clean };
}

const matches = (pattern: string, path: string) => {
  const a = pattern.split("/");
  const b = path.replace(/\/$/, "").split("/");
  return a.length === b.length && a.every((x, i) => x === b[i] || (x === ":id" && /^\d+$/.test(b[i])));
};

/** Does this app have this page? */
export const appHas = (prefix: AppPrefix, path: string) => !!prefix && PAGES[prefix].some((p) => matches(p, path.split(/[?#]/)[0]));

/** The address to use inside the app: with its prefix when the app has that page, as it is otherwise. */
export function inApp(prefix: AppPrefix, href: string) {
  if (!prefix || !href.startsWith("/") || href.startsWith("//") || splitAppPath(href).prefix) return href;
  return appHas(prefix, href) ? prefix + href : href;
}

/** Where am I: the app's prefix (or "") and the page's own path without it. */
export function useAppPath() {
  const full = usePathname();
  return useMemo(() => splitAppPath(full), [full]);
}

/** The router, but every push / replace stays inside the app this page is in. */
export function useAppRouter() {
  const router = useRouter();
  const { prefix } = useAppPath();
  return useMemo(
    () => ({
      ...router,
      push: (href: string, opts?: Parameters<typeof router.push>[1]) => router.push(inApp(prefix, href), opts),
      replace: (href: string, opts?: Parameters<typeof router.replace>[1]) => router.replace(inApp(prefix, href), opts),
    }),
    [router, prefix],
  );
}
