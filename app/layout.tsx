import type { Metadata, Viewport } from "next";
import { IBM_Plex_Sans_Arabic } from "next/font/google";
import { ToastProvider } from "@/components/ui";
import { bootScript } from "@/lib/boot";
import { LangSync } from "@/lib/i18n";
import "./globals.css";

// One font for Arabic and English, clear on small phone screens.
const plex = IBM_Plex_Sans_Arabic({
  variable: "--font-plex",
  subsets: ["arabic", "latin"],
  weight: ["400", "500", "600", "700"],
  display: "swap",
});

export const metadata: Metadata = {
  title: { default: "النهرين للمواد الغذائية", template: "%s · النهرين" },
  description: "منصة شركة النهرين للمواد الغذائية بالجملة: المخزون، البيع، الديون والتسديد",
  applicationName: "Al-Nahrain",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#0e6b4c" },
    { media: "(prefers-color-scheme: dark)", color: "#0e1411" },
  ],
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="ar" dir="rtl" className={plex.variable} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: bootScript }} />
      </head>
      <body className="min-h-dvh antialiased">
        <LangSync />
        <ToastProvider>{children}</ToastProvider>
      </body>
    </html>
  );
}
