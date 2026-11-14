"use client";

// «رمز التحقق» (OTP): a window that sends a 6-digit code to a phone (WhatsApp, then Telegram, then SMS — the
// server's choice through Wevlix) and checks it. The right code gives a token the next request carries.
// Used by: signing up a shop, a forgotten password (lib: purpose "reset"), changing your phone number.
// The demo has no WhatsApp: it shows the code on the screen («وضع التجربة»). A server with no OTP yet (any 404 on
// /otp/send) lets the step pass with no token, so signing up keeps working until the backend has it.
import { useEffect, useRef, useState } from "react";
import { MessageCircle, RotateCcw, ShieldCheck } from "lucide-react";
import { Button, Dialog, Input, errorText } from "@/components/ui";
import { ApiError, api } from "@/lib/api";
import type { OtpPurpose, OtpSent } from "@/lib/api/types";
import { useFmt } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { usePublicRules } from "@/lib/use-rules";

/** Seconds until a time (0 when past), ticking every second. */
function useSecondsTo(iso?: string) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!iso) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [iso]);
  return iso ? Math.max(0, Math.ceil((new Date(iso).getTime() - now) / 1000)) : 0;
}

export function OtpDialog({
  phone,
  purpose,
  title,
  onVerified,
  onClose,
}: {
  phone: string;
  purpose: OtpPurpose;
  title?: string;
  /** The token (null: the server has no OTP yet, go on without it). */
  onVerified: (token: string | null) => void | Promise<void>;
  onClose: () => void;
}) {
  const { tr, num } = useFmt();
  const [sent, setSent] = useState<OtpSent | null>(null);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState<"send" | "check" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const wait = useSecondsTo(sent?.resend_at);
  const started = useRef(false);

  const send = async () => {
    setBusy("send");
    setError(null);
    try {
      const s = await api.sendOtp(phone, purpose);
      setSent(s);
      setCode("");
      setTimeout(() => document.getElementById("otp-code")?.focus(), 50);
    } catch (e) {
      // The server has no OTP yet (/otp/send itself never answers 404: only a missing endpoint does): the step
      // steps aside, and the request goes without a token.
      if (e instanceof ApiError && e.status === 404) {
        await onVerified(null);
        return;
      }
      setError(e instanceof ApiError && e.errors?.phone ? e.errors.phone : errorText(e, tr));
    } finally {
      setBusy(null);
    }
  };
  // The code goes out as soon as the window opens.
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    void send();
    // Once, when the window opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const check = async (value = code) => {
    if (!sent || !/^\d{6}$/.test(value)) return;
    setBusy("check");
    setError(null);
    try {
      const v = await api.verifyOtp(sent.request_id, value);
      await onVerified(v.otp_token);
    } catch (e) {
      setError(e instanceof ApiError && e.errors?.code ? e.errors.code : errorText(e, tr));
      setBusy(null);
    }
  };

  return (
    <Dialog
      open
      onClose={onClose}
      title={
        <span className="flex items-center gap-2">
          <ShieldCheck className="size-5 text-action" /> {title ?? tr("تحقّق من رقم هاتفك", "Verify your phone number")}
        </span>
      }
      footer={
        <Button variant="action" className="h-12 w-full" disabled={!sent || code.length !== 6} loading={busy === "check"} onClick={() => check()}>
          {tr("تحقّق", "Verify")}
        </Button>
      }
    >
      <p className="text-sm text-muted">
        {tr("أرسلنا رمزاً من 6 أرقام إلى", "We sent a 6-digit code to")}{" "}
        <b className="num text-text" dir="ltr">
          {phone}
        </b>
      </p>
      <p className="mt-1 flex items-center gap-1.5 text-xs text-muted">
        <MessageCircle className="size-3.5 text-success" /> {tr("يصل عبر واتساب، وإن تعذّر فعبر تليغرام ثم رسالة نصية.", "It comes on WhatsApp; if that fails, on Telegram, then by SMS.")}
      </p>

      <Input
        id="otp-code"
        value={code}
        onChange={(e) => {
          const v = e.target.value.replace(/[٠-٩]/g, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d))).replace(/\D/g, "").slice(0, 6);
          setCode(v);
          setError(null);
          // Six digits typed (or pasted): check at once.
          if (v.length === 6) void check(v);
        }}
        inputMode="numeric"
        autoComplete="one-time-code"
        dir="ltr"
        placeholder="••••••"
        aria-label={tr("رمز التحقق", "Verification code")}
        disabled={!sent || busy === "check"}
        className={cn("num mt-4 h-14 text-center text-2xl font-bold tracking-[0.5em]", error && "border-danger")}
      />
      {error && <p className="mt-2 text-sm text-danger">{error}</p>}

      <div className="mt-3 flex items-center justify-between gap-2 text-sm">
        <span className="text-muted">{sent && tr("صالح لمدة 5 دقائق", "Valid for 5 minutes")}</span>
        <button type="button" onClick={send} disabled={busy !== null || wait > 0} className="flex items-center gap-1 font-semibold text-action disabled:text-faint">
          <RotateCcw className="size-3.5" />
          {wait > 0 ? tr(`أعد الإرسال بعد ${num(wait)} ث`, `Send again in ${num(wait)} s`) : tr("أعد إرسال الرمز", "Send the code again")}
        </button>
      </div>

      {/* The demo only: there is no WhatsApp here, so the code is shown (the real server never sends it). */}
      {sent?.sandbox_code && (
        <p className="mt-4 rounded-2xl border border-dashed border-warning/60 bg-warning-soft p-3 text-sm text-warning">
          {tr("وضع التجربة: لا يُرسل شيء حقاً. الرمز هو", "Test mode: nothing is really sent. The code is")}{" "}
          <button type="button" className="num font-bold underline" dir="ltr" onClick={() => (setCode(sent.sandbox_code!), void check(sent.sandbox_code!))}>
            {sent.sandbox_code}
          </button>
        </p>
      )}
    </Dialog>
  );
}

/** «نسيت كلمة المرور؟»: your phone → a code to it → a new password. Then you sign in with it. */
export function ForgotPassword({ phone: start = "", onDone, onClose }: { phone?: string; onDone: (phone: string) => void; onClose: () => void }) {
  const { tr } = useFmt();
  const live = usePublicRules();
  const [step, setStep] = useState<"phone" | "code" | "password">("phone");
  const [phone, setPhone] = useState(start);
  const [token, setToken] = useState<string | null>(null);
  const [pw, setPw] = useState({ next: "", again: "" });
  const [err, setErr] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const clean = phone.replace(/[\s-]/g, "").replace(/[٠-٩]/g, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d)));

  if (step === "code")
    return (
      <OtpDialog
        phone={clean}
        purpose="reset"
        title={tr("استعادة كلمة المرور", "Reset your password")}
        onVerified={(t) => {
          setToken(t);
          setStep("password");
        }}
        onClose={() => setStep("phone")}
      />
    );

  const save = async () => {
    const e: Record<string, string> = {};
    if (pw.next.length < live.password_min) e.password = tr(`${live.password_min} أحرف على الأقل`, `At least ${live.password_min} characters`);
    else if (pw.next !== pw.again) e.again = tr("كلمتا المرور غير متطابقتين", "The passwords don't match");
    setErr(e);
    if (Object.keys(e).length) return;
    setBusy(true);
    try {
      await api.resetPassword({ phone: clean, otp_token: token ?? "", password: pw.next });
      onDone(clean);
    } catch (x) {
      setErr(x instanceof ApiError && x.errors ? x.errors : { form: errorText(x, tr) });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog
      open
      onClose={onClose}
      title={tr("استعادة كلمة المرور", "Reset your password")}
      footer={
        step === "phone" ? (
          <Button variant="action" className="h-12 w-full" disabled={!/^07\d{9}$/.test(clean)} onClick={() => setStep("code")}>
            {tr("أرسل رمز التحقق", "Send the code")}
          </Button>
        ) : (
          <Button variant="action" className="h-12 w-full" loading={busy} disabled={!pw.next || !pw.again} onClick={save}>
            {tr("احفظ كلمة المرور الجديدة", "Save the new password")}
          </Button>
        )
      }
    >
      {step === "phone" ? (
        <>
          <p className="mb-3 text-sm text-muted">{tr("اكتب رقم هاتفك المسجّل، وسيصلك رمز تحقق عليه.", "Write your registered phone number; a code will come to it.")}</p>
          <Input value={phone} onChange={(e) => setPhone(e.target.value)} inputMode="tel" dir="ltr" placeholder="07XX XXX XXXX" aria-label={tr("رقم الهاتف", "Phone number")} autoFocus />
          {phone && !/^07\d{9}$/.test(clean) && <p className="mt-1 text-xs text-muted">{tr("رقم عراقي من 11 رقماً يبدأ بـ 07", "An 11-digit Iraqi number starting with 07")}</p>}
        </>
      ) : (
        <div className="space-y-3">
          <p className="flex items-center gap-1.5 text-sm text-success">
            <ShieldCheck className="size-4" /> {tr("تم التحقق من رقمك. اختر كلمة مرور جديدة.", "Your number is verified. Choose a new password.")}
          </p>
          <Input type="password" dir="ltr" autoComplete="new-password" placeholder={tr("كلمة المرور الجديدة", "New password")} value={pw.next} onChange={(e) => setPw({ ...pw, next: e.target.value })} aria-label={tr("كلمة المرور الجديدة", "New password")} invalid={!!err.password} />
          {err.password && <p className="text-xs text-danger">{err.password}</p>}
          <Input type="password" dir="ltr" autoComplete="new-password" placeholder={tr("أعد كتابتها", "Again")} value={pw.again} onChange={(e) => setPw({ ...pw, again: e.target.value })} aria-label={tr("أعد كتابتها", "Again")} invalid={!!err.again} />
          {err.again && <p className="text-xs text-danger">{err.again}</p>}
          {(err.form || err.otp_token) && <p className="text-sm text-danger">{err.form ?? err.otp_token}</p>}
        </div>
      )}
    </Dialog>
  );
}
