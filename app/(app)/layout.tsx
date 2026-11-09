import { Suspense } from "react";
import { AppShell } from "@/components/shell";

// Every page inside (app) needs a login and gets the menu around it.
// The (app) folder name in brackets is a "route group": it does not appear in the URL.
// Suspense: the menu reads the address (usePathname), which is only known in the browser.
// These pages wait for the login in the browser, so they can't show instantly on the server.
// This turns off Next.js's development check for that (it only adds warnings in the console).
export const instant = false;

export default function AppLayout({ children }: LayoutProps<"/">) {
  return (
    <Suspense fallback={<div className="min-h-dvh" />}>
      <AppShell>{children}</AppShell>
    </Suspense>
  );
}
