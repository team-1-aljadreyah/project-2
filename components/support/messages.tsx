"use client";

// The chat's message bubbles and send box, shared by the shop owner's chat window and the staff inbox.
// "mine" = written by the person looking at the screen (on the end side, orange), the other side is grey.
import { useEffect, useRef, useState } from "react";
import { motion } from "motion/react";
import { Loader2, SendHorizonal } from "lucide-react";
import { errorText, useToast } from "@/components/ui";
import type { ChatMessage } from "@/lib/api/types";
import { useFmt } from "@/lib/i18n";
import { cn } from "@/lib/utils";

export function Bubbles({ messages, mine, empty }: { messages: ChatMessage[]; mine: "shop" | "staff"; empty?: React.ReactNode }) {
  const { time, date } = useFmt();
  const end = useRef<HTMLDivElement>(null);
  // Always show the newest message (scroll to the bottom when one arrives).
  useEffect(() => {
    end.current?.scrollIntoView({ block: "end" });
  }, [messages.length]);

  if (!messages.length) return <div className="flex h-full items-center justify-center p-6 text-center text-sm text-muted">{empty}</div>;
  return (
    <div className="space-y-2 p-3">
      {messages.map((m, i) => {
        const me = m.from === mine;
        const prev = messages[i - 1];
        // A date line when the day changes (compared with the message before, not a running variable).
        const showDay = !prev || prev.at.slice(0, 10) !== m.at.slice(0, 10);
        const showName = !me && (!prev || prev.from !== m.from || prev.by.id !== m.by.id);
        return (
          <div key={m.id}>
            {showDay && <p className="my-2 text-center text-[11px] text-faint">{date(m.at)}</p>}
            <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className={cn("flex", me ? "justify-end" : "justify-start")}>
              <div className={cn("max-w-[80%] rounded-2xl px-3 py-2 text-sm leading-6", me ? "rounded-ee-sm bg-action text-on-action" : "rounded-es-sm bg-card-2 text-text")}>
                {showName && <p className="mb-0.5 text-[11px] font-bold text-muted">{m.by.name}</p>}
                <p className="whitespace-pre-wrap break-words">{m.text}</p>
                <p className={cn("num mt-0.5 text-end text-[10px]", me ? "opacity-70" : "text-faint")}>{time(m.at)}</p>
              </div>
            </motion.div>
          </div>
        );
      })}
      <div ref={end} />
    </div>
  );
}

/** The box at the bottom: Enter sends, Shift+Enter makes a new line. */
export function SendBox({ onSend, placeholder, quick }: { onSend: (text: string) => Promise<unknown>; placeholder: string; quick?: string[] }) {
  const { tr } = useFmt();
  const toast = useToast();
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);

  async function send(t = text) {
    const v = t.trim();
    if (!v || busy) return;
    setBusy(true);
    try {
      await onSend(v);
      setText("");
    } catch (e) {
      toast("danger", errorText(e, tr));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="border-t border-line p-2">
      {quick && quick.length > 0 && (
        <div className="mb-2 flex gap-1.5 overflow-x-auto pb-1 [scrollbar-width:none]">
          {quick.map((q) => (
            <button key={q} type="button" onClick={() => send(q)} className="shrink-0 rounded-full border border-line-strong px-3 py-1 text-xs text-muted hover:border-action hover:text-text">
              {q}
            </button>
          ))}
        </div>
      )}
      <form
        className="flex items-end gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          send();
        }}
      >
        <textarea
          rows={1}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              send();
            }
          }}
          placeholder={placeholder}
          maxLength={1000}
          aria-label={placeholder}
          className="max-h-28 min-h-11 flex-1 resize-none rounded-xl border border-line-strong bg-card px-3 py-2.5 text-sm outline-none focus:border-action"
        />
        <button type="submit" disabled={!text.trim() || busy} aria-label={tr("إرسال", "Send")} className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-action text-on-action disabled:opacity-40">
          {busy ? <Loader2 className="size-5 animate-spin" /> : <SendHorizonal className="size-5 rtl:-scale-x-100" />}
        </button>
      </form>
    </div>
  );
}
