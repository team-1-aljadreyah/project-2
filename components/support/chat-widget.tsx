"use client";

// The shop owner's help circle: pressed, it opens a small window with two choices:
//   الأسئلة الشائعة (FAQ): answers to the common questions, right away;
//   تحدّث مع الدعم (support): a live chat with the warehouse staff / the manager.
// "Live": the fake backend tells every open page when data changes (also across tabs), and the window
// also asks again every few seconds, which is what the real backend needs until it can push messages.
import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { ArrowLeft, ArrowRight, ChevronDown, HelpCircle, Headset, MessageCircle, Search, X } from "lucide-react";
import { LogoMark } from "@/components/logo";
import { useApp } from "@/components/shell";
import { api } from "@/lib/api";
import { useFmt } from "@/lib/i18n";
import { useLoad } from "@/lib/use-load";
import { useRealtime } from "@/lib/realtime";
import { playMessage, useWakeSound } from "@/lib/alert-sound";
import { cn, matches } from "@/lib/utils";
import { FAQ } from "./faq";
import { Bubbles, SendBox } from "./messages";

type View = "home" | "faq" | "chat";

export function ChatWidget() {
  const { tr, lang } = useFmt();
  const { user } = useApp();
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<View>("home");
  const chat = useLoad(() => api.myChat(), []);
  const unread = chat.data?.unread ?? 0;
  const Back = lang === "ar" ? ArrowRight : ArrowLeft;

  // Ask again every few seconds (the real backend has no push yet).
  useEffect(() => {
    // Live over the WebSocket (below); asking again is only a backup if the line is down.
    const t = setInterval(chat.reload, open ? 20000 : 60000);
    return () => clearInterval(t);
  }, [chat.reload, open]);

  // Reading the conversation counts as seen (the red dot goes away).
  useEffect(() => {
    if (open && view === "chat" && unread > 0 && user.customer_id) api.markChatRead(user.customer_id).catch(() => {});
  }, [open, view, unread, user.customer_id]);

  useRealtime(["chat"], () => chat.reload());
  const lastStaff = [...(chat.data?.messages ?? [])].reverse().find((m) => m.from === "staff");

  // An answer from the company plays the message sound (also with the chat open); the first load rings nothing.
  useWakeSound();
  const [heard, setHeard] = useState<number | null>(null);
  const [rings, setRings] = useState(0);
  if (chat.data) {
    const id = lastStaff?.id ?? 0;
    if (heard === null) setHeard(id);
    else if (id > heard) {
      setHeard(id);
      setRings((r) => r + 1);
    }
  }
  useEffect(() => {
    if (rings) playMessage();
  }, [rings]);

  return (
    <>
      {/* The circle (above the phone's bottom bar and the bag bar) */}
      <motion.button
        type="button"
        onClick={() => setOpen((o) => !o)}
        whileTap={{ scale: 0.9 }}
        aria-label={open ? tr("إغلاق المساعدة", "Close help") : tr("المساعدة والدعم", "Help and support")}
        aria-expanded={open}
        className="no-print fixed bottom-36 end-4 z-40 flex size-14 items-center justify-center rounded-full bg-primary text-on-primary shadow-xl lg:end-6"
      >
        <AnimatePresence mode="wait" initial={false}>
          <motion.span key={open ? "x" : "chat"} initial={{ rotate: -90, opacity: 0 }} animate={{ rotate: 0, opacity: 1 }} exit={{ rotate: 90, opacity: 0 }} transition={{ duration: 0.15 }}>
            {open ? <X className="size-6" /> : <MessageCircle className="size-6" />}
          </motion.span>
        </AnimatePresence>
        {!open && unread > 0 && (
          <span className="num absolute -end-0.5 -top-0.5 flex size-5 items-center justify-center rounded-full bg-danger text-[11px] font-bold text-on-danger ring-2 ring-bg">{unread}</span>
        )}
      </motion.button>

      <AnimatePresence>
        {open && (
          <motion.section
            role="dialog"
            aria-label={tr("المساعدة والدعم", "Help and support")}
            initial={{ opacity: 0, y: 16, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 16, scale: 0.96 }}
            transition={{ type: "spring", stiffness: 320, damping: 28 }}
            style={{ transformOrigin: "bottom" }}
            className="no-print fixed bottom-52 end-4 z-40 flex h-[min(540px,calc(100dvh-15rem))] w-[min(380px,calc(100vw-2rem))] flex-col overflow-hidden rounded-3xl border border-line bg-card shadow-2xl lg:end-6"
          >
            {/* Header */}
            <header className="brand-panel relative flex items-center gap-3 px-4 py-3">
              {view !== "home" ? (
                <button type="button" onClick={() => setView("home")} aria-label={tr("رجوع", "Back")} className="flex size-9 items-center justify-center rounded-full hover:bg-white/10">
                  <Back className="size-5" />
                </button>
              ) : (
                <LogoMark size={36} />
              )}
              <div className="min-w-0">
                <p className="font-bold">{view === "faq" ? tr("الأسئلة الشائعة", "FAQ") : view === "chat" ? tr("الدعم", "Support") : tr("كيف نساعدك؟", "How can we help?")}</p>
                <p className="truncate text-xs opacity-75">
                  {view === "chat" && lastStaff ? tr(`يتحدث معك: ${lastStaff.by.name}`, `Talking with you: ${lastStaff.by.name}`) : tr("فريق النهرين · نردّ عادةً خلال دقائق", "Al-Nahrain team · we usually reply in minutes")}
                </p>
              </div>
              <span className="hazard absolute inset-x-0 bottom-0 h-1" aria-hidden />
            </header>

            <div className="min-h-0 flex-1 overflow-y-auto">
              {view === "home" && (
                <div className="space-y-3 p-4">
                  <p className="text-sm text-muted">{tr(`أهلاً ${user.name.split(" ")[0]}، اختر ما يناسبك:`, `Hi ${user.name.split(" ")[0]}, choose what you need:`)}</p>
                  <Choice icon={HelpCircle} title={tr("الأسئلة الشائعة", "Frequently asked questions")} sub={tr("أجوبة فورية عن الطلب والدفع والتوصيل", "Instant answers about ordering, paying and delivery")} onClick={() => setView("faq")} />
                  <Choice
                    icon={Headset}
                    title={tr("تحدّث مع الدعم", "Talk to support")}
                    sub={tr("محادثة مباشرة مع موظفي الشركة", "A live chat with the company's staff")}
                    badge={unread || undefined}
                    onClick={() => setView("chat")}
                    strong
                  />
                </div>
              )}
              {view === "faq" && <FaqList onAsk={() => setView("chat")} />}
              {view === "chat" && <Bubbles messages={chat.data?.messages ?? []} mine="shop" empty={tr("اكتب سؤالك، وسيرد عليك أحد موظفينا هنا مباشرة.", "Write your question and one of our staff will answer right here.")} />}
            </div>

            {view === "chat" && (
              <SendBox
                placeholder={tr("اكتب رسالتك…", "Write your message…")}
                onSend={async (t) => {
                  await api.sendChat(t);
                  chat.reload();
                }}
              />
            )}
          </motion.section>
        )}
      </AnimatePresence>
    </>
  );
}

function Choice({ icon: Icon, title, sub, onClick, badge, strong }: { icon: typeof HelpCircle; title: string; sub: string; onClick: () => void; badge?: number; strong?: boolean }) {
  return (
    <motion.button
      type="button"
      whileHover={{ y: -2 }}
      whileTap={{ scale: 0.98 }}
      onClick={onClick}
      className={cn("flex w-full items-center gap-3 rounded-2xl border p-4 text-start transition", strong ? "border-action bg-action/10" : "border-line hover:bg-card-2")}
    >
      <span className={cn("flex size-11 shrink-0 items-center justify-center rounded-xl", strong ? "bg-action text-on-action" : "bg-card-2 text-primary-ink")}>
        <Icon className="size-5" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block font-bold">{title}</span>
        <span className="block text-xs text-muted">{sub}</span>
      </span>
      {badge && <span className="num flex size-6 items-center justify-center rounded-full bg-danger text-xs font-bold text-on-danger">{badge}</span>}
    </motion.button>
  );
}

function FaqList({ onAsk }: { onAsk: () => void }) {
  const { tr, lang } = useFmt();
  const [q, setQ] = useState("");
  const [open, setOpen] = useState<number | null>(0);
  const i = lang === "ar" ? 0 : 1;
  const list = FAQ.map((f, n) => ({ ...f, n })).filter((f) => matches(q, f.q[0], f.q[1], f.a[0], f.a[1]));
  return (
    <div className="p-3">
      <div className="mb-3 flex h-10 items-center gap-2 rounded-xl border border-line-strong px-3">
        <Search className="size-4 text-faint" />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={tr("ابحث في الأسئلة", "Search the questions")} className="h-full flex-1 bg-transparent text-sm outline-none" />
      </div>
      <ul className="space-y-2">
        {list.map((f) => {
          const on = open === f.n;
          return (
            <li key={f.n} className="overflow-hidden rounded-xl border border-line">
              <button type="button" onClick={() => setOpen(on ? null : f.n)} aria-expanded={on} className="flex w-full items-center justify-between gap-2 px-3 py-2.5 text-start text-sm font-semibold hover:bg-card-2">
                {f.q[i]}
                <ChevronDown className={cn("size-4 shrink-0 text-faint transition", on && "rotate-180")} />
              </button>
              <AnimatePresence initial={false}>
                {on && (
                  <motion.p initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="px-3 pb-3 text-sm leading-7 text-muted">
                    {f.a[i]}
                  </motion.p>
                )}
              </AnimatePresence>
            </li>
          );
        })}
        {!list.length && <li className="py-6 text-center text-sm text-muted">{tr("لا يوجد سؤال بهذا النص", "No question matches")}</li>}
      </ul>
      <button type="button" onClick={onAsk} className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl bg-card-2 py-2.5 text-sm font-semibold hover:bg-line">
        <Headset className="size-4" /> {tr("لم تجد الجواب؟ تحدّث مع الدعم", "Didn't find it? Talk to support")}
      </button>
    </div>
  );
}
