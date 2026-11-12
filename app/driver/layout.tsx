import type { Metadata, Viewport } from "next";

// The reps' phone app: its own name, icon and install file (opened from the main site in a new tab).
export const metadata: Metadata = {
  title: "تطبيق المندوبين",
  description: "جولة التوصيل، مسح الشحنات، والتسليم برمز صاحب المحل.",
  manifest: "/driver.webmanifest",
  icons: { apple: "/apps/driver-apple.png" },
  appleWebApp: { capable: true, title: "النهرين للمندوب", statusBarStyle: "black-translucent" },
};

export const viewport: Viewport = { themeColor: "#1d2127" };

export default function DriverAppLayout({ children }: { children: React.ReactNode }) {
  return children;
}
