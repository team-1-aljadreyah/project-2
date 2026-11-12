import { Suspense } from "react";
import { AppShell } from "@/components/shell";

// The shop owners' app (/client/...): the same screens as the site, in the same frame,
// at their own addresses so the installed app keeps them inside its window (see lib/app-path.ts).
export default function ClientAppLayout({ children }: { children: React.ReactNode }) {
  return (
    <Suspense fallback={<div className="min-h-dvh" />}>
      <AppShell>{children}</AppShell>
    </Suspense>
  );
}
