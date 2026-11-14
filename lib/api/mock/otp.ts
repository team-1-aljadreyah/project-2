// «رمز التحقق» (OTP): a 6-digit code sent to a phone — WhatsApp first, then Telegram, then SMS (the real server
// sends it through Wevlix; the demo shows it on the screen instead). Used to prove a phone is yours:
// signing up a shop, a forgotten password, changing your phone number.
// After the right code, the server gives a short-lived `otp_token` for that phone and purpose, which the next
// request (register / reset the password / change the phone) must carry. These are the backend's rules
// (docs/backend.md → «رمز التحقق»).
import type { OtpPurpose, OtpSent, OtpVerified } from "../types";
import type { Db, DbUser } from "./db";
import { R, fail, msg } from "./rules";

// The manager's settings (advanced → OTP); the token's 15 minutes stay fixed.
const TOKEN_MINUTES = 15;

const rand = (n: number) => {
  const a = new Uint32Array(1);
  crypto.getRandomValues(a);
  return a[0] % n;
};
const id = (len: number) => Array.from({ length: len }, () => "abcdefghijkmnpqrstuvwxyz23456789"[rand(32)]).join("");
export const cleanPhone = (p: string) => (p ?? "").replace(/[\s-]/g, "").replace(/[٠-٩]/g, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d)));
const validPhone = (p: string) => /^07\d{9}$/.test(p);

/** Send a code. register: the number must not have an account; reset: it must (but the answer is the same either
 *  way, so nobody learns which numbers have accounts); phone: signed in, the new number free. */
export function sendOtp(db: Db, actor: DbUser | null, phone: string, purpose: OtpPurpose, now: Date): OtpSent {
  const p = cleanPhone(phone);
  if (!validPhone(p)) fail(422, "VALIDATION", "رقم الهاتف غير صحيح", "Not a valid phone number", { phone: msg("رقم عراقي من 11 رقماً يبدأ بـ 07", "An 11-digit Iraqi number starting with 07") });
  if (!["register", "reset", "phone"].includes(purpose)) fail(422, "VALIDATION", "غرض غير معروف", "Unknown purpose");
  const taken = db.users.some((u) => u.phone === p && !u.deleted);
  if (purpose === "register" && taken) fail(409, "BAD_STATE", "لهذا الرقم حساب من قبل: سجّل الدخول به", "This number already has an account: sign in", { phone: msg("الرقم مسجّل من قبل", "Already registered") });
  if (purpose === "phone") {
    if (!actor) fail(401, "UNAUTHENTICATED", "سجّل الدخول أولاً", "Sign in first");
    if (actor.phone === p) fail(422, "VALIDATION", "هذا رقمك الحالي", "That's your current number", { phone: msg("اكتب الرقم الجديد", "Write the new number") });
    if (taken) fail(409, "BAD_STATE", "هذا الرقم لحساب آخر", "That number belongs to another account", { phone: msg("الرقم مستخدم", "In use") });
  }
  db.otps ??= [];
  const t = now.getTime();
  // Old ones go (an hour is all the limits look at).
  db.otps = db.otps.filter((o) => t - new Date(o.at).getTime() < 3_600_000);
  // The wait before another code is per use; the hourly limit counts every code to this number.
  const mine = db.otps.filter((o) => o.phone === p);
  const last = mine.filter((o) => o.purpose === purpose).at(-1);
  const { resend_seconds: RESEND_SECONDS, per_hour: MAX_SENDS_HOUR, code_minutes: CODE_MINUTES } = R().otp;
  if (last && t - new Date(last.at).getTime() < RESEND_SECONDS * 1000) {
    const wait = Math.ceil((RESEND_SECONDS * 1000 - (t - new Date(last.at).getTime())) / 1000);
    fail(429, "RATE_LIMITED", `انتظر ${wait} ثانية ثم أعد الإرسال`, `Wait ${wait} s and send again`);
  }
  if (mine.length >= MAX_SENDS_HOUR) fail(429, "RATE_LIMITED", "طلبت رموزاً كثيرة: حاول بعد ساعة", "Too many codes: try in an hour");
  const code = String(100000 + rand(900000));
  // A reset for a number with no account: answered the same, but nothing is really sent (no code to show).
  const real = purpose !== "reset" || taken;
  const o = { request_id: id(16), phone: p, purpose, code: real ? code : "", at: now.toISOString(), tries: 0 };
  db.otps.push(o);
  return {
    request_id: o.request_id,
    expires_at: new Date(t + CODE_MINUTES * 60_000).toISOString(),
    resend_at: new Date(t + RESEND_SECONDS * 1000).toISOString(),
    // The demo has no WhatsApp: it hands the code to the screen (the real server never does).
    ...(real ? { sandbox_code: code } : {}),
  };
}

/** Check the code: right → a token for this phone and purpose (15 minutes, once). 5 wrong tries end it. */
export function verifyOtp(db: Db, requestId: string, code: string, now: Date): OtpVerified {
  const o = (db.otps ?? []).find((x) => x.request_id === requestId);
  if (!o) fail(404, "NOT_FOUND", "انتهت صلاحية الرمز: اطلب رمزاً جديداً", "The code expired: ask for a new one");
  const t = now.getTime();
  if (o.token) fail(409, "BAD_STATE", "استُخدم هذا الرمز من قبل", "This code was already used");
  const { code_minutes: CODE_MINUTES, tries: MAX_TRIES } = R().otp;
  if (t - new Date(o.at).getTime() > CODE_MINUTES * 60_000) fail(410, "BAD_STATE", "انتهت صلاحية الرمز: اطلب رمزاً جديداً", "The code expired: ask for a new one");
  if (o.tries >= MAX_TRIES) fail(429, "RATE_LIMITED", "محاولات كثيرة: اطلب رمزاً جديداً", "Too many tries: ask for a new one");
  if (!/^\d{6}$/.test((code ?? "").trim()) || !o.code || o.code !== code.trim()) {
    o.tries += 1;
    const left = MAX_TRIES - o.tries;
    fail(422, "VALIDATION", "الرمز غير صحيح", "Wrong code", { code: left > 0 ? msg(`الرمز غير صحيح، باقي ${left} محاولات`, `Wrong code, ${left} tries left`) : msg("انتهت المحاولات: اطلب رمزاً جديداً", "No tries left: ask for a new one") });
  }
  o.token = id(24);
  o.token_until = new Date(t + TOKEN_MINUTES * 60_000).toISOString();
  return { otp_token: o.token, expires_at: o.token_until };
}

/** The next request proves the phone with the token: right phone, right purpose, in time, once. */
export function spendOtpToken(db: Db, token: string | undefined, phone: string, purpose: OtpPurpose, now: Date) {
  const o = token ? (db.otps ?? []).find((x) => x.token === token) : undefined;
  const ok = o && !o.used && o.phone === cleanPhone(phone) && o.purpose === purpose && o.token_until! > now.toISOString();
  if (!ok) fail(422, "VALIDATION", "تحقّق من رقم هاتفك أولاً", "Verify your phone number first", { otp_token: msg("أدخل رمز التحقق الذي وصلك", "Enter the code you received") });
  o!.used = true;
}

/** A forgotten password: the phone's account gets a new one (with a token for this phone, purpose reset). */
export function resetPassword(db: Db, input: { phone: string; otp_token: string; password: string }, now: Date) {
  const p = cleanPhone(input.phone);
  if ((input.password ?? "").length < R().password_min) fail(422, "VALIDATION", "تحقق من كلمة المرور", "Check the password", { password: msg(`${R().password_min} أحرف على الأقل`, `At least ${R().password_min} characters`) });
  spendOtpToken(db, input.otp_token, p, "reset", now);
  const u = db.users.find((x) => x.phone === p && !x.deleted);
  if (!u) fail(404, "NOT_FOUND", "لا يوجد حساب بهذا الرقم", "No account with this number");
  u.password = input.password;
  return u;
}

/** Change your own phone number (with a token for the new number, purpose phone). */
export function changeMyPhone(db: Db, actor: DbUser, input: { phone: string; otp_token: string }, now: Date) {
  const p = cleanPhone(input.phone);
  if (db.users.some((u) => u.phone === p && u.id !== actor.id && !u.deleted)) fail(409, "BAD_STATE", "هذا الرقم لحساب آخر", "That number belongs to another account");
  spendOtpToken(db, input.otp_token, p, "phone", now);
  const u = db.users.find((x) => x.id === actor.id)!;
  u.phone = p;
  return u;
}
