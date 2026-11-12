"use client";

// «افتح في…»: hand a place (or a whole trip) to the navigation app on the phone, like a location sent on
// WhatsApp: Google Maps, Waze, Apple Maps (iPhone), or any other app the phone has (Android's own chooser,
// through a geo: link). Each choice is a plain link, so the phone opens the installed app straight away
// (or its website when it isn't installed), with the same point and, for Google Maps, the stops on the way.
import { useState } from "react";
import { Check, Copy, MapPinned, Navigation } from "lucide-react";
import { Button, Dialog } from "@/components/ui";
import { useFmt } from "@/lib/i18n";
import { cn } from "@/lib/utils";

export type Place = { lat: number; lng: number; label?: string };

const fix = (n: number) => n.toFixed(6);
const ll = (p: Place) => `${fix(p.lat)},${fix(p.lng)}`;

/** The links for each app. `via`: stops before the destination (only Google Maps takes them). */
export function navLinks(to: Place, via: Place[] = []) {
  const stops = via.slice(-9); // Google Maps takes up to 9 stops on the way
  return {
    google: `https://www.google.com/maps/dir/?api=1&destination=${ll(to)}&travelmode=driving${stops.length ? `&waypoints=${stops.map(ll).join("%7C")}` : ""}`,
    waze: `https://waze.com/ul?ll=${ll(to)}&navigate=yes`,
    apple: `https://maps.apple.com/?daddr=${ll(to)}&dirflg=d`,
    // Android shows its own "open with" list for this (the same as a WhatsApp location).
    geo: `geo:${ll(to)}?q=${ll(to)}${to.label ? `(${encodeURIComponent(to.label)})` : ""}`,
  };
}

type Os = "android" | "ios" | "other";
const osOf = (): Os => {
  const ua = typeof navigator === "undefined" ? "" : navigator.userAgent;
  if (/android/i.test(ua)) return "android";
  if (/iphone|ipad|ipod/i.test(ua) || (/macintosh/i.test(ua) && typeof document !== "undefined" && "ontouchend" in document)) return "ios";
  return "other";
};

/** The button, and the list of apps it opens. `text` changes the button's words; `via` = a whole trip. */
export function OpenInMaps({
  to,
  via,
  text,
  className,
  size = "sm",
  variant,
  compact,
}: {
  to: Place;
  via?: Place[];
  text?: string;
  className?: string;
  size?: "sm" | "md";
  variant?: "primary" | "action" | "secondary" | "ghost" | "soft";
  /** Only the icon (in a tight row); its name is still spoken. */
  compact?: boolean;
}) {
  const { tr } = useFmt();
  const [os, setOs] = useState<Os | null>(null);
  const label = text ?? tr("افتح في الخرائط", "Open in maps");
  return (
    <>
      <Button
        size={size}
        variant={variant}
        className={cn(compact && "size-9 px-0", className)}
        aria-label={compact ? label : undefined}
        title={compact ? label : undefined}
        onClick={(e) => {
          // A card or row around the button may be a link: this click is only the button's.
          e.preventDefault();
          e.stopPropagation();
          setOs(osOf());
        }}
      >
        <Navigation className="size-4" />
        {!compact && label}
      </Button>
      {os && <Chooser to={to} via={via ?? []} os={os} onClose={() => setOs(null)} />}
    </>
  );
}

function Chooser({ to, via, os, onClose }: { to: Place; via: Place[]; os: Os; onClose: () => void }) {
  const { tr } = useFmt();
  const links = navLinks(to, via);
  const [copied, setCopied] = useState(false);
  const trip = via.length > 0;
  // A trip: Google Maps takes every stop; the others take one place, so they go to the next stop.
  const next = trip ? via[0] : to;
  const one = navLinks(next);
  const toNext = (plain: string) => (trip ? tr(`إلى المحطة التالية: ${next.label ?? ""}`, `To the next stop: ${next.label ?? ""}`) : plain);
  const apps = [
    {
      key: "google",
      href: links.google,
      name: "Google Maps",
      note: trip ? tr(`كل المحطات بالترتيب (${via.length + 1})`, `Every stop in order (${via.length + 1})`) : tr("الطريق بالسيارة", "Driving directions"),
      tone: "bg-[#e8f0fe] text-[#1a73e8] dark:bg-[#1a73e8]/20 dark:text-[#8ab4f8]",
      icon: <MapPinned className="size-5" />,
    },
    {
      key: "waze",
      href: one.waze,
      name: "Waze",
      note: toNext(tr("الطريق مع الزحام والتنبيهات", "With traffic and alerts")),
      tone: "bg-[#e5f8fd] text-[#0b8ec2] dark:bg-[#33ccff]/15 dark:text-[#33ccff]",
      icon: <Navigation className="size-5" />,
    },
    ...(os === "ios"
      ? [
          {
            key: "apple",
            href: one.apple,
            name: "Apple Maps",
            note: toNext(tr("خرائط آيفون", "The iPhone's maps")),
            tone: "bg-card-2 text-text",
            icon: <MapPinned className="size-5" />,
          },
        ]
      : []),
    ...(os === "android"
      ? [
          {
            key: "geo",
            href: one.geo,
            name: tr("تطبيق آخر على جهازك", "Another app on your phone"),
            note: toNext(tr("يعرض الهاتف كل تطبيقات الخرائط عندك", "Your phone lists every maps app it has")),
            tone: "bg-card-2 text-text",
            icon: <MapPinned className="size-5" />,
          },
        ]
      : []),
  ];
  return (
    <Dialog open onClose={onClose} title={tr("افتح الطريق في…", "Open the way in…")}>
      {to.label && <p className="mb-3 text-sm text-muted">{trip ? tr(`الجولة حتى: ${to.label}`, `The trip to: ${to.label}`) : to.label}</p>}
      <ul className="space-y-2">
        {apps.map((a) => (
          <li key={a.key}>
            <a href={a.href} target={a.key === "geo" ? undefined : "_blank"} rel="noreferrer" onClick={onClose} className="flex items-center gap-3 rounded-2xl border border-line p-3 transition hover:bg-card-2 active:scale-[0.99]">
              <span className={cn("flex size-11 shrink-0 items-center justify-center rounded-xl", a.tone)}>{a.icon}</span>
              <span className="min-w-0 flex-1">
                <span className="block font-semibold">{a.name}</span>
                <span className="block text-xs text-muted">{a.note}</span>
              </span>
            </a>
          </li>
        ))}
      </ul>
      <button
        type="button"
        onClick={() => {
          navigator.clipboard?.writeText(`${fix(next.lat)}, ${fix(next.lng)}`).then(() => setCopied(true), () => {});
        }}
        className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-xl py-2 text-xs font-semibold text-muted hover:text-text"
      >
        {copied ? <Check className="size-3.5 text-success" /> : <Copy className="size-3.5" />}
        {copied ? tr("نُسخ الموقع", "Copied") : tr("انسخ إحداثيات الموقع", "Copy the coordinates")}
        <span className="num" dir="ltr">
          {fix(next.lat).slice(0, 7)}, {fix(next.lng).slice(0, 7)}
        </span>
      </button>
    </Dialog>
  );
}
