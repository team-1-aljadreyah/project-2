"use client";

// The support chat for the people who answer it (warehouse staff, the manager): on every page, a new message
// from a shop plays the message sound (lib/alert-sound.ts) and, away from the support page, shows a small card
// with the shop and its words; a click opens the support inbox. Live over the WebSocket (topic "chat"),
// asked again every 30 s as a backup.
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { MessageCircle, X } from "lucide-react";
import { api } from "@/lib/api";
import type { ChatThread } from "@/lib/api/types";
import { playMessage, useWakeSound } from "@/lib/alert-sound";
import { useAppPath } from "@/lib/app-path";
import { useFmt } from "@/lib/i18n";
import { useRealtime } from "@/lib/realtime";
import { useLoad } from "@/lib/use-load";

type Card = { id: string; customer: string; text: string };

export function ChatAlerts({ userId }: { userId: number }) {
  const { tr } = useFmt();
  const { path } = useAppPath();
  const threads = useLoad(() => api.chatThreads().catch(() => [] as ChatThread[]), [userId]);
  useRealtime(["chat"], () => threads.reload());
  useEffect(() => {
    const t = setInterval(threads.reload, 30000);
    return () => clearInterval(t);
  }, [threads.reload]);
  useWakeSound();

  // The newest shop message of each thread already known; the first list (when the page opened) rings nothing.
  const [seen, setSeen] = useState<Map<number, number> | null>(null);
  const [cards, setCards] = useState<Card[]>([]);
  const [rings, setRings] = useState(0);
  const list = threads.data;
  if (list) {
    const lastShop = (t: ChatThread) => (t.last.from === "shop" ? t.last.id : 0);
    if (seen === null) setSeen(new Map(list.map((t) => [t.customer_id, lastShop(t)])));
    else {
      const fresh = list.filter((t) => lastShop(t) > (seen.get(t.customer_id) ?? 0));
      if (fresh.length) {
        const next = new Map(seen);
        fresh.forEach((t) => next.set(t.customer_id, lastShop(t)));
        setSeen(next);
        setRings((r) => r + 1);
        // On the support page the inbox shows it already: the sound only.
        if (!path.startsWith("/support")) setCards((c) => [...fresh.map((t) => ({ id: `${t.customer_id}-${t.last.id}`, customer: t.customer, text: t.last.text })), ...c].slice(0, 3));
      }
    }
  }
  useEffect(() => {
    if (rings) playMessage();
  }, [rings]);

  if (typeof document === "undefined" || !cards.length) return null;
  return createPortal(
    <div className="no-print pointer-events-none fixed inset-x-3 bottom-24 z-[60] flex flex-col items-start gap-2 md:bottom-6" aria-live="polite">
      {cards.map((c) => (
        <ChatCard key={c.id} card={c} onClose={() => setCards((x) => x.filter((y) => y.id !== c.id))} label={tr("رسالة دعم جديدة", "New support message")} />
      ))}
    </div>,
    document.body,
  );
}

function ChatCard({ card, onClose, label }: { card: Card; onClose: () => void; label: string }) {
  const { tr } = useFmt();
  useEffect(() => {
    const t = setTimeout(onClose, 10000);
    return () => clearTimeout(t);
    // One timer for the card's life.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return (
    <div role="status" className="anim-drop-in box-link pointer-events-auto flex w-full max-w-sm items-start gap-3 rounded-2xl border border-primary/30 bg-card p-3 shadow-xl hover:bg-card-2">
      <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-primary-soft text-primary-ink">
        <MessageCircle className="size-5" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-[11px] font-semibold text-muted">{label}</p>
        <Link href="/support" onClick={onClose} className="box-link-main block truncate text-sm font-bold">
          {card.customer}
        </Link>
        <p className="mt-0.5 line-clamp-2 text-sm text-muted">{card.text}</p>
      </div>
      <button type="button" onClick={onClose} aria-label={tr("إغلاق", "Close")} className="flex size-7 shrink-0 items-center justify-center rounded-lg text-faint hover:bg-line hover:text-text">
        <X className="size-4" />
      </button>
    </div>
  );
}
