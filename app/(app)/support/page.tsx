"use client";

// The support inbox, for the warehouse staff and the manager: every shop's conversation, the ones waiting
// for an answer first. Open one to read it and answer. New messages appear by themselves.
import Link from "next/link";
import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { ArrowLeft, ArrowRight, Headset, MessagesSquare, Store } from "lucide-react";
import { Bubbles, SendBox } from "@/components/support/messages";
import { Card, Empty, ErrorBox, LoadingRows, PageHeader } from "@/components/ui";
import { api } from "@/lib/api";
import { useFmt } from "@/lib/i18n";
import { useLoad } from "@/lib/use-load";
import { cn } from "@/lib/utils";

export default function SupportPage() {
  return (
    <Suspense fallback={<LoadingRows />}>
      <Inbox />
    </Suspense>
  );
}

function Inbox() {
  const { tr, ago } = useFmt();
  const fromLink = Number(useSearchParams().get("shop")) || null;
  const threads = useLoad(() => api.chatThreads(), []);
  const [picked, setPicked] = useState<number | null>(fromLink);
  const list = threads.data ?? [];
  const waiting = list.filter((t) => t.waiting).length;
  // On a big screen the first conversation opens by itself; on a phone the list shows first.
  const current = picked ?? null;

  useEffect(() => {
    const t = setInterval(threads.reload, 4000);
    return () => clearInterval(t);
  }, [threads.reload]);

  if (threads.state.status === "error") return <ErrorBox error={threads.state.error} onRetry={threads.reload} />;

  return (
    <>
      <PageHeader title={tr("الدعم", "Support")} subtitle={waiting === 1 ? tr("محادثة واحدة تنتظر ردك", "1 conversation waits for you") : waiting ? tr(`${waiting} محادثات تنتظر ردك`, `${waiting} conversations wait for you`) : tr("لا توجد محادثات تنتظر الرد", "Nothing waits for an answer")} />
      <Card className="grid h-[calc(100dvh-14rem)] min-h-[460px] grid-cols-1 overflow-hidden md:grid-cols-[320px_minmax(0,1fr)]">
        {/* The list */}
        <aside className={cn("min-h-0 overflow-y-auto border-line md:border-e", current !== null && "hidden md:block")}>
          {threads.state.status === "loading" ? (
            <LoadingRows />
          ) : !list.length ? (
            <Empty icon={<MessagesSquare className="size-6" />} title={tr("لا توجد محادثات بعد", "No conversations yet")} />
          ) : (
            <ul className="divide-y divide-line">
              {list.map((t) => (
                <li key={t.customer_id}>
                  <button
                    type="button"
                    onClick={() => setPicked(t.customer_id)}
                    className={cn("flex w-full items-start gap-3 px-4 py-3 text-start hover:bg-card-2", current === t.customer_id && "bg-card-2")}
                  >
                    <span className={cn("relative flex size-10 shrink-0 items-center justify-center rounded-full text-sm font-bold", t.waiting ? "bg-action text-on-action" : "bg-card-2 text-primary-ink")}>
                      {t.customer.trim()[0]}
                      {t.unread > 0 && <span className="num absolute -end-1 -top-1 flex size-5 items-center justify-center rounded-full bg-danger text-[10px] text-white ring-2 ring-card">{t.unread}</span>}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center justify-between gap-2">
                        <span className={cn("truncate text-sm", t.unread ? "font-bold" : "font-semibold")}>{t.customer}</span>
                        <span className="shrink-0 text-[11px] text-faint">{ago(t.last.at)}</span>
                      </span>
                      <span className={cn("block truncate text-xs", t.unread ? "text-text" : "text-muted")}>
                        {t.last.from === "staff" ? `${tr("أنت", "You")}: ` : ""}
                        {t.last.text}
                      </span>
                      {t.waiting && <span className="mt-1 inline-block rounded-full bg-warning-soft px-2 py-0.5 text-[10px] font-semibold text-warning">{tr("ينتظر ردك", "Waiting for you")}</span>}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </aside>

        {/* The conversation */}
        <section className={cn("flex min-h-0 flex-col", current === null && "hidden md:flex")}>
          {current === null ? (
            <div className="flex flex-1 flex-col items-center justify-center gap-2 p-6 text-center text-muted">
              <Headset className="size-10" strokeWidth={1.5} />
              <p className="text-sm">{tr("اختر محادثة من القائمة", "Choose a conversation")}</p>
            </div>
          ) : (
            <Conversation key={current} customerId={current} name={list.find((t) => t.customer_id === current)?.customer ?? ""} area={list.find((t) => t.customer_id === current)?.area ?? ""} onBack={() => setPicked(null)} onSent={threads.reload} />
          )}
        </section>
      </Card>
    </>
  );
}

function Conversation({ customerId, name, area, onBack, onSent }: { customerId: number; name: string; area: string; onBack: () => void; onSent: () => void }) {
  const { tr, lang } = useFmt();
  const msgs = useLoad(() => api.getChat(customerId), [customerId]);
  const Back = lang === "ar" ? ArrowRight : ArrowLeft;
  const count = msgs.data?.length ?? 0;

  // Opening it (and every new message while it's open) counts as read.
  useEffect(() => {
    if (count) api.markChatRead(customerId).catch(() => {});
  }, [count, customerId]);
  useEffect(() => {
    const t = setInterval(msgs.reload, 4000);
    return () => clearInterval(t);
  }, [msgs.reload]);

  return (
    <>
      <header className="flex items-center gap-3 border-b border-line px-3 py-2.5">
        <button type="button" onClick={onBack} aria-label={tr("رجوع", "Back")} className="flex size-9 items-center justify-center rounded-full hover:bg-card-2 md:hidden">
          <Back className="size-5" />
        </button>
        <span className="flex size-9 items-center justify-center rounded-full bg-card-2 font-bold">{name.trim()[0]}</span>
        <div className="min-w-0 flex-1">
          <p className="truncate font-bold">{name}</p>
          <p className="text-xs text-muted">{area}</p>
        </div>
        <Link href={`/customers/${customerId}`} className="flex items-center gap-1 rounded-lg border border-line-strong px-2.5 py-1.5 text-xs font-semibold hover:bg-card-2">
          <Store className="size-3.5" /> {tr("ملف المحل", "Shop file")}
        </Link>
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto">{msgs.data ? <Bubbles messages={msgs.data} mine="staff" /> : <LoadingRows />}</div>
      <SendBox
        placeholder={tr("اكتب ردك…", "Write your answer…")}
        quick={[
          tr("أهلاً بك، كيف أساعدك؟", "Hello, how can I help?"),
          tr("لحظة من فضلك، أتحقق من طلبك.", "One moment, I'm checking your order."),
          tr("تم، وشكراً لتعاملك مع النهرين.", "Done. Thank you for working with Al-Nahrain."),
        ]}
        onSend={async (t) => {
          await api.replyChat(customerId, t);
          msgs.reload();
          onSent();
        }}
      />
    </>
  );
}
