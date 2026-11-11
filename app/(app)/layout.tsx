import { Suspense } from "react";
import { AppShell } from "@/components/shell";

// Every page inside (app) needs a login and gets the menu around it.
// The (app) folder name in brackets is a "route group": it does not appear in the URL.
// Suspense: the menu reads the address (usePathname), which is only known in the browser.
export default function AppLayout({ children }: LayoutProps<"/">) {
  return (
    <Suspense fallback={<div className="min-h-dvh" />}>
      <AppShell>{children}</AppShell>
    </Suspense>
  );
}
