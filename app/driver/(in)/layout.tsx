import { Suspense } from "react";
import { AppShell } from "@/components/shell";

// The reps' app (/driver/...): the same screens as the site, in the same frame,
// at their own addresses so the installed app keeps them inside its window (see lib/app-path.ts).
export default function DriverAppLayout({ children }: { children: React.ReactNode }) {
  return (
    <Suspense fallback={<div className="min-h-dvh" />}>
      <AppShell>{children}</AppShell>
    </Suspense>
  );
}
