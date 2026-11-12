import type { Metadata, Viewport } from "next";

// The shop owners' phone app: its own name, icon and install file (opened from the main site in a new tab).
export const metadata: Metadata = {
  title: "تطبيق المحلات",
  description: "اطلب بضاعة محلك بالجملة من جوالك، وتابع شحنتك وكشف حسابك.",
  manifest: "/client.webmanifest",
  icons: { apple: "/apps/client-apple.png" },
  appleWebApp: { capable: true, title: "النهرين للمحلات", statusBarStyle: "default" },
};

export const viewport: Viewport = { themeColor: "#e1692b" };

export default function ClientAppLayout({ children }: { children: React.ReactNode }) {
  return children;
}
