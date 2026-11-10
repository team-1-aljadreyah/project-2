"use client";

// A stand-in for the Qi Card gateway's own payment page, only in the demo (fake data), like Project 1.
// With the real backend the customer goes to Qi's page instead (form_url from the backend) and this page is
// never used. The card is filled in and locked: nobody should type a real card into a demo.
import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { CreditCard, Loader2, Lock, ShieldCheck } from "lucide-react";
import { LanguageSwitch } from "@/components/switches";
import { errorText } from "@/components/ui";
import { demoGateway } from "@/lib/api/mock";
import type { OnlineStatus } from "@/lib/api/types";
import { USE_MOCK } from "@/lib/config";
import { useFmt } from "@/lib/i18n";

// Qi's sandbox also uses a fixed code for its 3-D Secure step (the bank's SMS check).
const DEMO_CODE = "123123";

type Step = "card" | "code" | "busy";

function Gateway() {
  const { tr, money } = useFmt();
  const id = useSearchParams().get("payment") ?? "";
  const [info, setInfo] = useState<{ amount: number; shop: string; finished: boolean } | null>(null);
  const [step, setStep] = useState<Step>("card");
  const [code, setCode] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    let alive = true;
    demoGateway.info(id).then(
      (x) => alive && setInfo(x),
      (e) => alive && setError(errorText(e, tr)),
    );
    return () => {
      alive = false;
    };
  }, [id, tr]);

  async function finish(outcome: Exclude<OnlineStatus, "created">) {
    setStep("busy");
    try {
      // Like the real gateway: send the customer back to the shop's site, with the payment id.
      window.location.assign(await demoGateway.finish(id, outcome));
    } catch (e) {
      setError(errorText(e, tr));
      setStep("card");
    }
  }

  if (error && !info) return <p className="py-10 text-center text-sm text-red-700">{error}</p>;
  if (!info) return <p className="flex items-center justify-center gap-2 py-10 text-sm text-neutral-500"><Loader2 className="size-4 animate-spin" /> {tr("جاري التحميل…", "Loading…")}</p>;
  if (info.finished) return <p className="py-10 text-center text-sm text-neutral-600">{tr("هذه العملية انتهت من قبل.", "This payment is already finished.")}</p>;

  return (
    <div className="space-y-5">
      <div className="rounded-xl bg-neutral-100 p-4 text-center">
        <p className="text-xs text-neutral-500">{tr("الدفع إلى", "Paying")}</p>
        <p className="font-semibold">{tr("شركة النهرين للمواد الغذائية", "Al-Nahrain Food Co.")}</p>
        <p className="text-xs text-neutral-500">{info.shop}</p>
        <p className="num mt-2 text-3xl font-bold">{money(info.amount)}</p>
      </div>

      {error && (
        <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      )}

      {step === "card" && (
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            setStep("code");
          }}
        >
          <label className="block text-xs font-semibold text-neutral-600">
            {tr("رقم البطاقة", "Card number")}
            <input readOnly dir="ltr" value="0000 0000 0000 0000" className="mt-1 h-11 w-full rounded-lg border border-neutral-300 bg-neutral-50 px-3 font-mono text-base" />
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="block text-xs font-semibold text-neutral-600">
              {tr("الانتهاء", "Expiry")}
              <input readOnly dir="ltr" value="12/30" className="mt-1 h-11 w-full rounded-lg border border-neutral-300 bg-neutral-50 px-3 font-mono" />
            </label>
            <label className="block text-xs font-semibold text-neutral-600">
              CVV
              <input readOnly dir="ltr" value="000" className="mt-1 h-11 w-full rounded-lg border border-neutral-300 bg-neutral-50 px-3 font-mono" />
            </label>
          </div>
          <button type="submit" className="flex h-12 w-full items-center justify-center gap-2 rounded-lg bg-[#1a1a1a] font-bold text-[#f7c600] hover:bg-black">
            <Lock className="size-4" /> {tr(`ادفع ${money(info.amount)}`, `Pay ${money(info.amount)}`)}
          </button>
          <div className="flex flex-wrap justify-between gap-2 text-sm">
            <button type="button" onClick={() => finish("failed")} className="text-red-700 hover:underline">
              {tr("تجربة رفض البطاقة", "Simulate a declined card")}
            </button>
            <button type="button" onClick={() => finish("canceled")} className="text-neutral-600 hover:underline">
              {tr("إلغاء والرجوع للمتجر", "Cancel and go back")}
            </button>
          </div>
        </form>
      )}

      {step === "code" && (
        // The bank's check (3-D Secure): a code sent by SMS to the card owner's phone.
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            void finish(code === DEMO_CODE ? "success" : "authentication_failed");
          }}
        >
          <div className="flex items-start gap-3 rounded-lg bg-[#f7c600]/20 p-3 text-sm text-[#5c4700]">
            <ShieldCheck className="mt-0.5 size-5 shrink-0" />
            <p>{tr("أرسل البنك رمز تحقق برسالة إلى رقم هاتفك المسجّل بالبطاقة.", "Your bank sent a check code by SMS to the card's phone number.")}</p>
          </div>
          <label className="block text-xs font-semibold text-neutral-600">
            {tr("رمز التحقق", "Check code")}
            <input
              inputMode="numeric"
              dir="ltr"
              maxLength={6}
              autoComplete="one-time-code"
              autoFocus
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
              className="mt-1 h-12 w-full rounded-lg border border-neutral-300 px-3 text-center font-mono text-lg tracking-[0.5em]"
            />
            <span className="mt-1 block font-normal text-neutral-500">{tr(`بيئة تجريبية: الرمز هو ${DEMO_CODE}`, `Sandbox: the code is ${DEMO_CODE}`)}</span>
          </label>
          <button type="submit" disabled={code.length !== 6} className="h-12 w-full rounded-lg bg-[#1a1a1a] font-bold text-[#f7c600] hover:bg-black disabled:opacity-40">
            {tr("تأكيد", "Confirm")}
          </button>
          <button type="button" onClick={() => finish("canceled")} className="w-full text-center text-sm text-neutral-600 hover:underline">
            {tr("إلغاء والرجوع للمتجر", "Cancel and go back")}
          </button>
        </form>
      )}

      {step === "busy" && (
        <p className="flex items-center justify-center gap-2 py-6 text-sm text-neutral-600">
          <Loader2 className="size-4 animate-spin" /> {tr("جاري تنفيذ الدفع…", "Processing…")}
        </p>
      )}
    </div>
  );
}

export default function QiGatewayPage() {
  const { tr } = useFmt();
  return (
    // The gateway is another company's website: it keeps its own light look, not our theme.
    <main className="relative flex min-h-dvh items-center justify-center bg-neutral-200 px-4 py-10 text-neutral-900">
      <div className="absolute end-4 top-4">
        <LanguageSwitch />
      </div>
      <div className="w-full max-w-md overflow-hidden rounded-2xl bg-white shadow-xl">
        <div className="flex items-center justify-between gap-3 bg-[#1a1a1a] px-5 py-4 text-white">
          <span className="flex items-center gap-2 font-bold">
            <span className="flex size-8 items-center justify-center rounded-lg bg-[#f7c600] text-sm font-black text-black">Qi</span>
            {tr("بوابة الدفع", "Payment gateway")}
          </span>
          <span className="flex items-center gap-1 text-xs opacity-80">
            <Lock className="size-3.5" /> {tr("اتصال آمن", "Secure")}
          </span>
        </div>
        <p className="flex items-center gap-2 border-b border-amber-200 bg-amber-50 px-5 py-2 text-xs text-amber-800">
          <CreditCard className="size-3.5" /> {tr("بيئة تجريبية (Sandbox): لا تُسحب أي أموال حقيقية.", "Sandbox: no real money moves.")}
        </p>
        <div className="p-5">
          {USE_MOCK ? (
            <Suspense fallback={null}>
              <Gateway />
            </Suspense>
          ) : (
            <p className="py-10 text-center text-sm text-neutral-600">{tr("مع الخادم الحقيقي يتم الدفع على صفحة Qi نفسها.", "With the real backend, payment happens on Qi's own page.")}</p>
          )}
        </div>
      </div>
    </main>
  );
}
