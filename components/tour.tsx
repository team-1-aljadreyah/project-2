"use client";

// A short first-time tour for each job: a few steps that light up the real buttons (the menu, the search,
// the notifications, the account) and say what each one is for. Shown once on this device, and replayed
// from the account menu («جولة تعريفية»). A step whose button isn't on screen (phone vs computer) is skipped.
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import type { Role, User } from "@/lib/api/types";
import { useFmt } from "@/lib/i18n";

const doneKey = (id: number) => `nahrain.tour.${id}`;
export const TOUR_EVENT = "nahrain:tour";
/** Replay the tour (the account menu). */
export const startTour = () => window.dispatchEvent(new Event(TOUR_EVENT));

interface Step {
  /** The data-tour mark of the thing to light up; none = a card in the middle. */
  target?: string;
  title: [string, string];
  text: [string, string];
}

const HOME: Record<Role, [string, string]> = {
  manager: ["«قراراتي اليوم» تجمع كل ما ينتظر قرارك: الموافقات، والطلبات، وتنبيهات المخزون والديون.", "“My decisions” gathers everything waiting for you: approvals, orders, stock and debt alerts."],
  accountant: ["«ملف الحساب»: اختر زبوناً لترى فواتيره وتسديداته وما بقي عليه، وسجّل التسديد من هناك.", "“Account file”: pick a customer to see invoices, payments and what is left, and record a payment."],
  warehouse: ["«قاعة التجهيز»: الطلبات التي تنتظر التجهيز، والبضاعة القادمة من المحاسب، ومسار كل طلب على المخطط.", "“Picking hall”: orders to prepare, goods on their way, and each order's route on the plan."],
  staff: ["«الرئيسية»: الطلبات التي تجهّزها اليوم، ورسائل المحلات التي تنتظر الرد.", "“Home”: the orders you prepare today, and the shops' messages waiting for you."],
  rep: ["«الرئيسية»: محلات يومك؛ اضغط محلاً لتكتب طلبه أو تسجّل تسديده، حتى بدون إنترنت.", "“Home”: today's shops; tap one to write its order or record a payment, even offline."],
  shop: ["«اطلب الآن»: ابحث عن المادة واضغط + لتضيفها، ثم أرسل الطلب من السلة. «اطلب مثل آخر مرة» يعيد طلبك السابق بضغطة.", "“Order now”: search, tap + to add, then send from the bag. “Order like last time” repeats your last order."],
};

function stepsFor(role: Role, name: string): Step[] {
  return [
    { title: [`أهلاً ${name}`, `Welcome, ${name}`], text: ["جولة قصيرة لتعرف أين كل شيء. يمكنك إعادتها متى شئت من قائمة حسابك.", "A short tour to find your way. Replay it any time from your account menu."] },
    { title: ["صفحتك الرئيسية", "Your home page"], text: HOME[role] },
    { target: "menu", title: ["القائمة", "The menu"], text: ["كل صفحات عملك هنا. الصفحة المفتوحة ملوّنة.", "All your pages are here. The open one is highlighted."] },
    { target: "search", title: ["البحث السريع", "Quick search"], text: ["اكتب اسم زبون أو مادة أو رقم طلب أو فاتورة لتصل إليه فوراً (Ctrl+K في الحاسوب).", "Type a customer, item, order or invoice to jump to it (Ctrl+K on a computer)."] },
    { target: "bell", title: ["الإشعارات", "Notifications"], text: ["كل جديد يخصّك يصل هنا مع صوت، والرقم الأحمر يقول كم لم تقرأ.", "Everything new for you arrives here with a sound; the red number is how many are unread."] },
    { target: "account", title: ["حسابك", "Your account"], text: ["صورتك، وحجم الخط، واللغة والمظهر، وإعادة هذه الجولة، والخروج.", "Your picture, text size, language and look, this tour again, and logging out."] },
  ];
}

/** The first visible element with this mark (the computer menu or the phone bar). */
function findTarget(mark: string) {
  return [...document.querySelectorAll<HTMLElement>(`[data-tour="${mark}"]`)].find((el) => el.offsetParent !== null || getComputedStyle(el).position === "fixed") ?? null;
}

export function Tour({ user }: { user: User }) {
  const { tr } = useFmt();
  const [on, setOn] = useState(false);
  const [at, setAt] = useState(0);
  // Moving or resizing the page moves the light with the button (read from the page on each draw).
  const [, setTick] = useState(0);
  const steps = stepsFor(user.role, user.name.split(" ")[0]).filter((s) => !s.target || typeof document === "undefined" || findTarget(s.target));

  // The first time on this device: after the page settles.
  useEffect(() => {
    let seen = true;
    try {
      seen = !!localStorage.getItem(doneKey(user.id));
    } catch {}
    const t = seen ? undefined : setTimeout(() => setOn(true), 1500);
    const replay = () => {
      setAt(0);
      setOn(true);
    };
    window.addEventListener(TOUR_EVENT, replay);
    return () => {
      clearTimeout(t);
      window.removeEventListener(TOUR_EVENT, replay);
    };
  }, [user.id]);

  const step = steps[Math.min(at, steps.length - 1)];
  useEffect(() => {
    if (!on) return;
    const redraw = () => setTick((t) => t + 1);
    window.addEventListener("resize", redraw);
    window.addEventListener("scroll", redraw, true);
    return () => {
      window.removeEventListener("resize", redraw);
      window.removeEventListener("scroll", redraw, true);
    };
  }, [on]);
  const target = on && step?.target ? findTarget(step.target) : null;
  const box = target ? target.getBoundingClientRect() : null;

  const finish = () => {
    try {
      localStorage.setItem(doneKey(user.id), "1");
    } catch {}
    setOn(false);
    setAt(0);
  };
  useEffect(() => {
    if (!on) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && finish();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  if (!on || !step) return null;
  const last = at >= steps.length - 1;
  const pad = 6;
  // The card: under the lit button, or above it near the bottom; in the middle without a button.
  const W = typeof window === "undefined" ? 400 : window.innerWidth;
  const H = typeof window === "undefined" ? 800 : window.innerHeight;
  const cardW = Math.min(340, W - 24);
  const style: React.CSSProperties = box
    ? {
        width: cardW,
        left: Math.max(12, Math.min(W - cardW - 12, box.left + box.width / 2 - cardW / 2)),
        ...(box.bottom + 200 < H ? { top: box.bottom + 14 } : { bottom: H - box.top + 14 }),
      }
    : { width: cardW, left: (W - cardW) / 2, top: Math.max(24, H / 2 - 120) };

  return createPortal(
    <div className="fixed inset-0 z-[95]" role="dialog" aria-modal aria-label={tr("جولة تعريفية", "Tour")}>
      {/* The dim cover with a hole around the lit button (one shape: it covers every screen size whole). */}
      <svg className="fixed inset-0 size-full" aria-hidden>
        <path
          fillRule="evenodd"
          fill="rgba(0,0,0,.6)"
          d={`M0 0H${W}V${H}H0Z${box ? `M${box.left - pad} ${box.top - pad}h${box.width + pad * 2}v${box.height + pad * 2}h${-(box.width + pad * 2)}Z` : ""}`}
        />
        {box && <rect x={box.left - pad} y={box.top - pad} width={box.width + pad * 2} height={box.height + pad * 2} rx="12" fill="none" stroke="#e1692b" strokeWidth="2" />}
      </svg>
      <div className="fixed rounded-2xl border border-line bg-card p-4 shadow-2xl" style={style}>
        <p className="text-xs font-semibold text-muted">
          {tr(`الخطوة ${at + 1} من ${steps.length}`, `Step ${at + 1} of ${steps.length}`)}
        </p>
        <p className="mt-1 text-base font-bold">{tr(...step.title)}</p>
        <p className="mt-1 text-sm text-muted">{tr(...step.text)}</p>
        <div className="mt-4 flex items-center gap-2">
          <button type="button" onClick={finish} className="rounded-lg px-2 py-1.5 text-sm text-muted hover:bg-card-2">
            {tr("تخطَّ", "Skip")}
          </button>
          <span className="flex-1" />
          {at > 0 && (
            <button type="button" onClick={() => setAt(at - 1)} className="rounded-xl border border-line px-3 py-1.5 text-sm font-semibold hover:bg-card-2">
              {tr("السابق", "Back")}
            </button>
          )}
          <button type="button" onClick={() => (last ? finish() : setAt(at + 1))} className="rounded-xl bg-action px-4 py-1.5 text-sm font-bold text-on-action">
            {last ? tr("ابدأ العمل", "Start") : tr("التالي", "Next")}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
