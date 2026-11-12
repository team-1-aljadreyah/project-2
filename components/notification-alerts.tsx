"use client";

// A new notification shows itself: a small card slides in under the top bar, with a sound
// (lib/alert-sound.ts). A click anywhere on the card opens what it is about and marks it as read;
// it goes away by itself after a few seconds. The bell in the top bar gives it the list it already loads.
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { BellRing, X } from "lucide-react";
import { api } from "@/lib/api";
import type { AppNotification } from "@/lib/api/types";
import { playAlert, useWakeSound } from "@/lib/alert-sound";
import { useFmt } from "@/lib/i18n";

/** How long a card stays, and how many show at once (the newest on top). */
const STAY_MS = 8000;
const MAX = 3;

export function NotificationAlerts({ list }: { list: AppNotification[] | undefined }) {
  // The ones already known. The first list (what was there when the page opened) alerts nothing.
  const [seen, setSeen] = useState<Set<number> | null>(null);
  const [cards, setCards] = useState<AppNotification[]>([]);
  // Goes up by one for each batch of new notifications: one sound for the batch.
  const [rings, setRings] = useState(0);
  useWakeSound();

  if (list) {
    if (seen === null) setSeen(new Set(list.map((n) => n.id)));
    else {
      const fresh = list.filter((n) => !seen.has(n.id));
      if (fresh.length) {
        setSeen(new Set([...seen, ...fresh.map((n) => n.id)]));
        const unread = fresh.filter((n) => !n.read);
        if (unread.length) {
          setCards((c) => [...unread, ...c].slice(0, MAX));
          setRings((r) => r + 1);
        }
      }
    }
  }

  useEffect(() => {
    if (rings) playAlert();
  }, [rings]);

  const close = (id: number) => setCards((c) => c.filter((n) => n.id !== id));
  if (typeof document === "undefined") return null;
  return createPortal(
    <div className="no-print pointer-events-none fixed inset-x-3 top-16 z-[60] flex flex-col items-end gap-2 sm:top-[4.5rem]" aria-live="polite">
      {cards.map((n) => (
        <AlertCard key={n.id} n={n} onClose={() => close(n.id)} />
      ))}
    </div>,
    document.body,
  );
}

function AlertCard({ n, onClose }: { n: AppNotification; onClose: () => void }) {
  const { tr, lang } = useFmt();
  useEffect(() => {
    const t = setTimeout(onClose, STAY_MS);
    return () => clearTimeout(t);
    // One timer for the card's life.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const title = lang === "en" ? n.title_en : n.title;
  const body = lang === "en" ? n.body_en : n.body;
  const read = () => {
    void api.markRead(n.id).catch(() => {});
    onClose();
  };
  return (
    // The card drops in with a CSS animation (anim-drop-in): this is on every page, so no animation library.
    <div
      role="status"
      className="anim-drop-in box-link pointer-events-auto flex w-full max-w-sm items-start gap-3 rounded-2xl border border-action/40 bg-card p-3 shadow-xl transition-colors hover:bg-card-2"
    >
      <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-action/15 text-action">
        <BellRing className="size-5" />
      </span>
      <div className="min-w-0 flex-1">
        {/* The whole card is the click: it opens what the notification is about (or just marks it as read). */}
        {n.link ? (
          <Link href={n.link} onClick={read} className="box-link-main block text-sm font-bold">
            {title}
          </Link>
        ) : (
          <button type="button" onClick={read} className="box-link-main block text-start text-sm font-bold">
            {title}
          </button>
        )}
        <p className="mt-0.5 line-clamp-2 text-sm text-muted">{body}</p>
      </div>
      <button type="button" onClick={onClose} aria-label={tr("إغلاق", "Close")} className="flex size-7 shrink-0 items-center justify-center rounded-lg text-faint hover:bg-line hover:text-text">
        <X className="size-4" />
      </button>
    </div>
  );
}
