"use client";

// "Two apps on your phone": the main landing page's section that opens the shop owners' app (/client)
// and the reps' app (/driver), each in a new tab, with its own landing page and icon.
import { motion } from "motion/react";
import { ExternalLink } from "lucide-react";
import { useFmt } from "@/lib/i18n";
import { Eyebrow, WordReveal, rise } from "./shared";

export function PhoneApps() {
  const { tr } = useFmt();
  const apps = [
    {
      href: "/client",
      icon: "/apps/client-192.png",
      t: tr("تطبيق أصحاب المحلات", "The shop owners' app"),
      b: tr("اطلب بأسعارك، وتابع شحنتك على الخريطة، وكشف حسابك في جيبك.", "Order at your prices, follow your shipment on the map, your statement in your pocket."),
      cta: tr("افتح تطبيق المحلات", "Open the shops' app"),
      tilt: -3,
    },
    {
      href: "/driver",
      icon: "/apps/driver-192.png",
      t: tr("تطبيق المندوبين", "The reps' app"),
      b: tr("جولة اليوم على الخريطة، ومسح الشحنات، والتسليم برمز صاحب المحل.", "Today's trip on the map, scanning shipments, and delivery with the shop owner's PIN."),
      cta: tr("افتح تطبيق المندوبين", "Open the reps' app"),
      tilt: 3,
    },
  ];
  return (
    <section id="apps" className="mx-auto max-w-6xl scroll-mt-24 px-4 py-20">
      <div className="mx-auto max-w-2xl text-center">
        <Eyebrow>{tr("على الجوال", "On the phone")}</Eyebrow>
        <WordReveal text={tr("تطبيقان على جوالك", "Two apps on your phone")} className="mt-4 text-3xl font-bold sm:text-5xl" />
        <motion.p {...rise(0.2)} className="mt-4 text-muted">
          {tr("يُفتح كل تطبيق في نافذة جديدة، ويمكن تثبيته على شاشة الجوال بأيقونته الخاصة.", "Each app opens in a new tab, and can be installed on the phone with its own icon.")}
        </motion.p>
      </div>
      <div className="mx-auto mt-12 grid max-w-3xl gap-4 sm:grid-cols-2">
        {apps.map((a, i) => (
          <motion.a
            key={a.href}
            href={a.href}
            // A new tab: the app is a place of its own, the main site stays open behind it.
            target="_blank"
            rel="noopener"
            initial={{ opacity: 0, y: 40, rotate: a.tilt * 2 }}
            whileInView={{ opacity: 1, y: 0, rotate: a.tilt }}
            whileHover={{ rotate: 0, y: -6 }}
            whileTap={{ scale: 0.98 }}
            viewport={{ once: true, margin: "-40px" }}
            transition={{ type: "spring", stiffness: 150, damping: 16, delay: i * 0.1 }}
            className="group flex flex-col rounded-3xl border border-white/10 bg-white/[0.04] p-6 transition-colors hover:border-action/50"
          >
            {/* eslint-disable-next-line @next/next/no-img-element -- a small fixed icon from /public */}
            <img src={a.icon} alt="" width={64} height={64} className="size-16 rounded-2xl shadow-lg" />
            <p className="mt-5 text-xl font-bold">{a.t}</p>
            <p className="mt-2 flex-1 text-sm text-muted">{a.b}</p>
            <span className="mt-6 inline-flex h-11 items-center justify-center gap-2 rounded-full bg-action px-5 text-sm font-bold text-on-action transition group-hover:bg-action-hover">
              {a.cta} <ExternalLink className="size-4" />
            </span>
          </motion.a>
        ))}
      </div>
    </section>
  );
}
