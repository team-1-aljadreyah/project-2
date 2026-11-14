"use client";

// «الإعدادات المتقدمة» → the company's rules (lib/api/advanced.ts): every number and switch the site works by,
// in sections. One editor for all of them: a change shows «معدَّل» with the way back to the default, mistakes show
// under the field as you type (the same check the server makes), and a bar at the bottom saves or drops them.
// The older settings (reservation hours, expiry days, the expense limit, the day summary) are edited here too.
import { useMemo, useRef, useState } from "react";
import { AlertTriangle, Download, History, Megaphone, RotateCcw, Save, Upload, Wrench } from "lucide-react";
import { useApp } from "@/components/shell";
import { roleName } from "@/components/status";
import { Badge, Button, Card, CardHeader, Dialog, Empty, errorText, Input, LoadingRows, Notice, NumberInput, Segmented, Select, Switch, Textarea, useToast } from "@/components/ui";
import { api } from "@/lib/api";
import { DEFAULT_NOTIFY, DEFAULT_RULES, ROLES_ALL, changedRules, checkRules, rulesOf, suggestedClearance, type AdvancedRules, type FeatureKey } from "@/lib/api/advanced";
import { EXPENSE_APPROVAL_ABOVE, type DoorPayMethod, type NotificationType, type Role, type Settings, type SettingsChange } from "@/lib/api/types";
import { useFmt, type Tr } from "@/lib/i18n";
import { useLoad } from "@/lib/use-load";
import { cn } from "@/lib/utils";

export type RulesPart = "orders" | "signup" | "delivery" | "money" | "stock" | "security" | "features" | "notify" | "announce" | "history";

/** The older settings (top level) edited beside the rules. */
type Top = Omit<Settings, "advanced" | "auto_confirm_rep_orders">;
const TOP_DEFAULTS: Top = { reservation_hours: 24, near_expiry_days: 30, slow_moving_days: 21, expense_approval_above: EXPENSE_APPROVAL_ABOVE, summary_hour: 21 };

/** The words people search for (the quick find), by section. */
export const RULE_WORDS: Record<RulesPart, string> = {
  orders: "خصم حجز تقريب طلب أقل سقف دين موافقة تعديل بدون إنترنت تلقائي",
  signup: "تسجيل محل جديد نوع سعر سقف موافقة تلقائية محلات",
  delivery: "توصيل رمز استلام صورة تقييم دفع عند التسليم زيارة بعيد متر",
  money: "عهدة حد عكس تسديد صرفيات موافقة",
  stock: "صلاحية راكد تصفية خصم تذكير نفاد",
  security: "رمز تحقق OTP كلمة مرور قفل دخول محاولات",
  features: "تشغيل إيقاف ميزات تسجيل دفع أونلاين تقييم أعلمني تصفية إنترنت دعم تذكير",
  notify: "إشعارات من يصله ملخص اليوم ساعة",
  announce: "إعلان صيانة رسالة",
  history: "سجل تصدير استيراد ملف افتراضي إرجاع",
};

// ---------- the editor ----------

interface Draft {
  top: Top;
  rules: AdvancedRules;
}

function useRulesState() {
  const { lookups } = useApp();
  const s = lookups.settings;
  const saved: Draft = useMemo(() => {
    const { advanced: _a, auto_confirm_rep_orders: _c, ...top } = s;
    void _a;
    void _c;
    return { top: { ...TOP_DEFAULTS, ...top }, rules: rulesOf(s) };
  }, [s]);
  return saved;
}

/** One section: it owns its draft (started from what is saved; a save elsewhere starts it again). */
export function RulesSection({ part }: { part: RulesPart }) {
  const saved = useRulesState();
  if (part === "history") return <HistorySection />;
  return <Editor key={JSON.stringify(saved) + part} saved={saved} part={part} />;
}

function Editor({ saved, part }: { saved: Draft; part: RulesPart }) {
  const { tr } = useFmt();
  const { lookups, reloadLookups } = useApp();
  const toast = useToast();
  const [d, setD] = useState<Draft>(saved);
  const [busy, setBusy] = useState(false);
  const [serverErr, setServerErr] = useState<Record<string, string>>({});
  const errors = { ...checkRules(d.rules, lookups.tiers.map((t) => t.id)), ...topErrors(d.top), ...serverErr };
  const dirty = JSON.stringify(d) !== JSON.stringify(saved);
  const set = (p: Partial<AdvancedRules>) => (setD((x) => ({ ...x, rules: { ...x.rules, ...p } })), setServerErr({}));
  const setTop = (p: Partial<Top>) => (setD((x) => ({ ...x, top: { ...x.top, ...p } })), setServerErr({}));

  async function save() {
    setBusy(true);
    try {
      await api.saveSettings(toSettings(d));
      toast("success", tr("حُفظت الإعدادات، وتسري على الجميع الآن", "Saved. It applies to everyone now"));
      reloadLookups();
    } catch (e) {
      const errs = (e as { errors?: Record<string, string> }).errors;
      if (errs) setServerErr(errs);
      toast("danger", errorText(e, tr));
    } finally {
      setBusy(false);
    }
  }

  const ctx: Ctx = { d, saved, set, setTop, errors, tr };
  const body =
    part === "orders" ? <OrdersPart {...ctx} /> :
    part === "signup" ? <SignupPart {...ctx} /> :
    part === "delivery" ? <DeliveryPart {...ctx} /> :
    part === "money" ? <MoneyPart {...ctx} /> :
    part === "stock" ? <StockPart {...ctx} /> :
    part === "security" ? <SecurityPart {...ctx} /> :
    part === "features" ? <FeaturesPart {...ctx} /> :
    part === "notify" ? <NotifyPart {...ctx} /> :
    <AnnouncePart {...ctx} />;

  return (
    <div className="pb-24">
      {body}
      {dirty && (
        <div className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-card/95 px-4 py-3 shadow-lg backdrop-blur lg:ps-[calc(var(--sidebar-w,0px)+1rem)]">
          <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-2">
            <p className="me-auto flex items-center gap-2 text-sm font-semibold">
              {Object.keys(errors).length ? <AlertTriangle className="size-4 text-danger" /> : <Save className="size-4 text-action" />}
              {Object.keys(errors).length ? tr("صحّح الحقول المؤشرة بالأحمر قبل الحفظ", "Fix the fields marked in red first") : tr("لديك تغييرات غير محفوظة", "You have unsaved changes")}
            </p>
            <Button onClick={() => (setD(saved), setServerErr({}))}>{tr("تراجع", "Undo")}</Button>
            <Button variant="action" loading={busy} disabled={!!Object.keys(errors).length} onClick={save}>
              <Save className="size-4" /> {tr("حفظ", "Save")}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

function toSettings(d: Draft): Settings {
  return { ...d.top, auto_confirm_rep_orders: d.rules.auto_confirm_rep_orders, advanced: changedRules(d.rules) };
}

function topErrors(t: Top): Record<string, string> {
  const e: Record<string, string> = {};
  if (!(Number.isInteger(t.reservation_hours) && t.reservation_hours >= 1 && t.reservation_hours <= 72)) e["top.reservation_hours"] = "من 1 إلى 72 ساعة";
  if (!(Number.isInteger(t.near_expiry_days) && t.near_expiry_days >= 1 && t.near_expiry_days <= 365)) e["top.near_expiry_days"] = "من 1 إلى 365 يوماً";
  if (!(Number.isInteger(t.slow_moving_days) && t.slow_moving_days >= 1 && t.slow_moving_days <= 365)) e["top.slow_moving_days"] = "من 1 إلى 365 يوماً";
  if (!((t.expense_approval_above ?? 0) >= 0)) e["top.expense_approval_above"] = "مبلغ صحيح";
  if (t.summary_hour !== undefined && !(Number.isInteger(t.summary_hour) && t.summary_hour >= 0 && t.summary_hour <= 23)) e["top.summary_hour"] = "من 0 إلى 23";
  return e;
}

interface Ctx {
  d: Draft;
  saved: Draft;
  set: (p: Partial<AdvancedRules>) => void;
  setTop: (p: Partial<Top>) => void;
  errors: Record<string, string>;
  tr: Tr;
}

// ---------- building blocks ----------

/** One setting: its name and what it does, the control, «معدَّل» with the way back to the default, the error. */
function Row({ label, hint, changed, onDefault, defText, error, children }: { label: string; hint?: string; changed?: boolean; onDefault?: () => void; defText?: string; error?: string; children: React.ReactNode }) {
  const { tr } = useFmt();
  return (
    <div className={cn("grid gap-2 border-b border-line px-4 py-3 last:border-0 sm:grid-cols-[minmax(0,1fr)_minmax(0,260px)] sm:items-center", changed && "bg-action/[0.04]")}>
      <div className="min-w-0">
        <p className="flex flex-wrap items-center gap-2 text-sm font-semibold">
          {label}
          {changed && <Badge tone="warning">{tr("معدَّل", "Changed")}</Badge>}
        </p>
        {hint && <p className="mt-0.5 text-xs text-muted">{hint}</p>}
        {changed && onDefault && (
          <button type="button" onClick={onDefault} className="mt-1 flex items-center gap-1 text-xs font-semibold text-action hover:underline">
            <RotateCcw className="size-3" /> {tr("الافتراضي", "Default")}
            {defText ? `: ${defText}` : ""}
          </button>
        )}
      </div>
      <div className="min-w-0">
        {children}
        {error && <p className="mt-1 text-xs font-medium text-danger">{error}</p>}
      </div>
    </div>
  );
}

function Part({ title, sub, children, icon }: { title: string; sub?: string; children: React.ReactNode; icon?: React.ReactNode }) {
  return (
    <Card className="mb-4 overflow-hidden">
      <CardHeader title={<span className="flex items-center gap-2">{icon}{title}</span>} subtitle={sub} />
      <div>{children}</div>
    </Card>
  );
}

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
/** A number box's value: an emptied box (kept as NaN, so the check marks it) shows empty. */
const nv = (x: number | undefined): number | "" => (x === undefined || Number.isNaN(x) ? "" : x);

/** A number setting of the rules (or of the older top part). */
function Num({ c, k, label, hint, suffix, top }: { c: Ctx; k: string; label: string; hint?: string; suffix?: string; top?: boolean }) {
  const cur = top ? (c.d.top as unknown as Record<string, number | undefined>)[k] : (c.d.rules as unknown as Record<string, number>)[k];
  const def = top ? (TOP_DEFAULTS as unknown as Record<string, number>)[k] : (DEFAULT_RULES as unknown as Record<string, number>)[k];
  const put = (v: number) => (top ? c.setTop({ [k]: v } as Partial<Top>) : c.set({ [k]: v } as Partial<AdvancedRules>));
  const err = c.errors[top ? `top.${k}` : k];
  return (
    <Row label={label} hint={hint} changed={!same(cur, def)} onDefault={() => put(def)} defText={`${def.toLocaleString("en")}${suffix ? ` ${suffix}` : ""}`} error={err}>
      <NumberInput value={nv(cur)} onChange={(v) => put(v === "" ? Number.NaN : v)} suffix={suffix} invalid={!!err} aria-label={label} />
    </Row>
  );
}

/** A yes/no setting of the rules. */
function Flag({ c, k, label, hint }: { c: Ctx; k: keyof AdvancedRules; label: string; hint?: string }) {
  const cur = c.d.rules[k] as boolean;
  const def = DEFAULT_RULES[k] as boolean;
  const { tr } = useFmt();
  return (
    <Row label={label} hint={hint} changed={cur !== def} onDefault={() => c.set({ [k]: def } as Partial<AdvancedRules>)} defText={def ? tr("مفعّل", "On") : tr("متوقف", "Off")}>
      <Switch checked={cur} onChange={(v) => c.set({ [k]: v } as Partial<AdvancedRules>)} label={cur ? tr("مفعّل", "On") : tr("متوقف", "Off")} />
    </Row>
  );
}

/** Tick several of a list (jobs, ways of paying). */
function Chips<T extends string>({ value, options, onChange, locked = [] }: { value: T[]; options: { v: T; l: string }[]; onChange: (v: T[]) => void; locked?: T[] }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map((o) => {
        const on = value.includes(o.v);
        const lock = locked.includes(o.v);
        return (
          <button
            key={o.v}
            type="button"
            disabled={lock}
            aria-pressed={on}
            onClick={() => onChange(on ? value.filter((x) => x !== o.v) : [...value, o.v])}
            className={cn("rounded-full border px-3 py-1 text-xs font-semibold transition", on ? "border-action bg-action/10 text-action" : "border-line-strong text-muted hover:text-text", lock && "cursor-not-allowed opacity-70")}
          >
            {o.l}
          </button>
        );
      })}
    </div>
  );
}

// ---------- the sections ----------

function OrdersPart(c: Ctx) {
  const { tr } = c;
  const r = c.d.rules;
  return (
    <>
      <Part title={tr("الخصومات", "Discounts")} sub={tr("من يعطي كم، ومتى ينتظر الطلب موافقتك", "Who gives how much, and when an order waits for you")}>
        <Num c={c} k="staff_discount_max" label={tr("خصم المندوب والمحاسب بلا موافقة", "Discount reps and accountants give alone")} hint={tr("أكثر من هذه النسبة ينتظر الطلب موافقتك", "More than this waits for your OK")} suffix="%" />
        <Num c={c} k="discount_max" label={tr("أعلى خصم مسموح لأي أحد", "The highest discount for anyone")} hint={tr("حتى أنت لا تتجاوزه", "Even you can't pass it")} suffix="%" />
      </Part>
      <Part title={tr("اعتماد الطلبات", "Approving orders")}>
        <Flag c={c} k="auto_confirm_rep_orders" label={tr("اعتماد طلبات المندوبين تلقائياً", "Approve reps' orders by themselves")} hint={tr("تذهب للمخزن مباشرة بلا خطوة المحاسب، ما لم يحتج الطلب موافقتك لسبب آخر", "They go straight to the warehouse, unless they need your OK for another reason")} />
        <Row
          label={tr("طلب يتجاوز سقف دين الزبون", "An order over the debt limit")}
          hint={r.over_limit === "approval" ? tr("ينتظر موافقتك، والكمية محجوزة له", "Waits for you; the goods are held") : r.over_limit === "block" ? tr("يُرفض ولا يُسجَّل", "Refused, not recorded") : tr("يمرّ كأي طلب، ويصلك إشعار به", "Goes through; you are told")}
          changed={r.over_limit !== DEFAULT_RULES.over_limit}
          onDefault={() => c.set({ over_limit: "approval" })}
          defText={tr("ينتظر موافقتي", "Waits for me")}
        >
          <Segmented
            value={r.over_limit}
            onChange={(v) => c.set({ over_limit: v })}
            options={[
              { value: "approval", label: tr("ينتظر موافقتي", "Wait for me") },
              { value: "block", label: tr("يُرفض", "Refuse") },
              { value: "allow", label: tr("يمرّ", "Allow") },
            ]}
          />
        </Row>
        <Num c={c} k="reservation_hours" top label={tr("مدة حجز الطلب غير المعتمد", "How long an unapproved order holds goods")} hint={tr("بعدها تعود الكمية إلى المخزون", "Then the goods go back to stock")} suffix={tr("ساعة", "h")} />
      </Part>
      <Part title={tr("طلبات أصحاب المحلات", "Shop owners' orders")}>
        <Num c={c} k="min_shop_order" label={tr("أقل مبلغ لطلب صاحب المحل", "The smallest order a shop sends")} hint={tr("0 = بلا حد. لا يُرسَل طلب أقل منه من تطبيق المحل", "0 = none. A smaller order can't be sent from the app")} suffix={tr("د.ع", "IQD")} />
        <Num c={c} k="shop_edit_minutes" label={tr("وقت تعديل صاحب المحل لطلبه", "Time a shop owner may change his order")} hint={tr("0 = حتى يُعتمد الطلب (كما الآن). غير ذلك: هذه الدقائق بعد الإرسال فقط", "0 = until it is approved (as now). Otherwise: these minutes after sending")} suffix={tr("دقيقة", "min")} />
      </Part>
      <Part title={tr("الحساب والعمل بلا إنترنت", "Totals and offline work")}>
        <Row label={tr("تقريب مجموع الطلب والفاتورة", "Round order and invoice totals to")} hint={tr("أصغر ورقة نقدية متداولة", "The smallest note in use")} changed={r.round_to !== DEFAULT_RULES.round_to} onDefault={() => c.set({ round_to: 250 })} defText="250" error={c.errors.round_to}>
          <Select value={r.round_to} onChange={(e) => c.set({ round_to: Number(e.target.value) })} aria-label={tr("التقريب", "Rounding")}>
            {[0, 50, 100, 250, 500, 1000].map((v) => (
              <option key={v} value={v}>
                {v === 0 ? tr("بلا تقريب", "No rounding") : `${v.toLocaleString("en")} ${tr("د.ع", "IQD")}`}
              </option>
            ))}
          </Select>
        </Row>
        <Num c={c} k="offline_max_days" label={tr("أقدم طلب يُكتب بلا إنترنت بسعره", "Oldest offline order kept at its price")} hint={tr("الطلب المكتوب بلا إنترنت يأخذ سعر لحظة كتابته، حتى هذه الأيام. الأقدم يأخذ سعر اليوم", "An offline order keeps the price of when it was written, up to these days; older takes today's")} suffix={tr("يوم", "days")} />
      </Part>
    </>
  );
}

function SignupPart(c: Ctx) {
  const { tr } = c;
  const { lookups } = useApp();
  const r = c.d.rules;
  const lastTier = lookups.tiers.find((t) => t.id === 3) ?? lookups.tiers[lookups.tiers.length - 1];
  return (
    <Part title={tr("المحلات التي تسجّل بنفسها", "Shops that sign up by themselves")} sub={tr("من الموقع، أو محل إضافي لصاحب حساب", "From the website, or another shop of an owner")}>
      <Row
        label={tr("التسجيل من الموقع", "Signing up online")}
        hint={tr("متوقف: يختفي زر «سجّل محلك» وتُرفض محاولات التسجيل", "Off: «Sign up your shop» disappears and sign-ups are refused")}
        changed={!r.features.self_signup}
        onDefault={() => c.set({ features: { ...r.features, self_signup: true } })}
        defText={tr("مفعّل", "On")}
      >
        <Switch checked={r.features.self_signup} onChange={(v) => c.set({ features: { ...r.features, self_signup: v } })} label={r.features.self_signup ? tr("مفعّل", "On") : tr("متوقف", "Off")} />
      </Row>
      <Flag c={c} k="signup_auto_approve" label={tr("الموافقة على المحل الجديد تلقائياً", "Approve a new shop by itself")} hint={tr("يطلب فوراً بالسعر والسقف أدناه، بلا انتظار موافقتك (ويصلك إشعار)", "It orders at once with the tier and limit below, no waiting (you are told)")} />
      <Row label={tr("نوع السعر للمحل الجديد", "A new shop's price tier")} changed={r.signup_tier_id !== null} onDefault={() => c.set({ signup_tier_id: null })} defText={lastTier?.name} error={c.errors.signup_tier_id}>
        <Select value={r.signup_tier_id ?? ""} onChange={(e) => c.set({ signup_tier_id: e.target.value === "" ? null : Number(e.target.value) })} aria-label={tr("نوع السعر", "Price tier")}>
          <option value="">{tr(`الافتراضي (${lastTier?.name ?? ""})`, `Default (${lastTier?.name ?? ""})`)}</option>
          {lookups.tiers.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </Select>
      </Row>
      <Num c={c} k="signup_debt_limit" label={tr("سقف الدين للمحل الجديد", "A new shop's debt limit")} hint={tr("0 = لا يشتري بالدين حتى تقرر أنت", "0 = no credit until you decide")} suffix={tr("د.ع", "IQD")} />
      <Num c={c} k="max_shops_per_account" label={tr("أكثر عدد محلات لحساب واحد", "Most shops for one account")} />
    </Part>
  );
}

function DeliveryPart(c: Ctx) {
  const { tr } = c;
  const r = c.d.rules;
  const methods: { v: DoorPayMethod; l: string }[] = [
    { v: "cash", l: tr("نقداً", "Cash") },
    { v: "qi", l: "Qi" },
    { v: "zaincash", l: tr("زين كاش", "ZainCash") },
  ];
  return (
    <>
      <Part title={tr("إثبات التسليم", "Delivery proof")}>
        <Num c={c} k="pin_tries" label={tr("رموز استلام خاطئة قبل قفل الشحنة", "Wrong PINs before the shipment locks")} hint={tr("بعدها لا يفتحها إلا أنت", "Then only you open it")} />
        <Flag c={c} k="photo_required" label={tr("صورة الشحنة مطلوبة عند التسليم", "A photo is needed to deliver")} hint={tr("متوقف: يكفي رمز الاستلام، والصورة اختيارية", "Off: the PIN is enough; the photo is optional")} />
        <Row label={tr("تنبيهك بتقييم منخفض", "Alert you of a low rating")} hint={tr("تقييم بهذا العدد من النجوم أو أقل يصلك فوراً", "A rating at or under this reaches you at once")} changed={r.low_rating_stars !== DEFAULT_RULES.low_rating_stars} onDefault={() => c.set({ low_rating_stars: 2 })} defText={tr("نجمتان أو أقل", "2 stars or less")}>
          <Select value={r.low_rating_stars} onChange={(e) => c.set({ low_rating_stars: Number(e.target.value) })} aria-label={tr("التقييم المنخفض", "Low rating")}>
            <option value={0}>{tr("لا تنبّهني", "Never")}</option>
            {[1, 2, 3, 4].map((n) => (
              <option key={n} value={n}>
                {tr(`${n} ${n === 1 ? "نجمة" : n === 2 ? "نجمتان" : "نجوم"} أو أقل`, `${n} star${n > 1 ? "s" : ""} or less`)}
              </option>
            ))}
          </Select>
        </Row>
      </Part>
      <Part title={tr("الدفع عند التسليم", "Paying at the door")}>
        <Row label={tr("ما يقبله مندوب التوصيل", "What the driver may take")} hint={tr("Qi وزين كاش يحتاجان تشغيل الدفع الأونلاين", "Qi and ZainCash need online payment on")} changed={!same(r.door_methods, DEFAULT_RULES.door_methods)} onDefault={() => c.set({ door_methods: DEFAULT_RULES.door_methods })} defText={tr("الثلاثة", "All three")} error={c.errors.door_methods}>
          <Chips value={r.door_methods} options={methods} onChange={(v) => c.set({ door_methods: methods.map((m) => m.v).filter((m) => v.includes(m)) })} />
        </Row>
      </Part>
      <Part title={tr("زيارات المندوبين", "Reps' visits")}>
        <Num c={c} k="visit_near_m" label={tr("أبعد مسافة تُعدّ زيارة عند المحل", "Farthest a visit counts as at the shop")} hint={tr("أبعد منها تظهر «بعيدة» في خط السير", "Farther shows as «far» on the route page")} suffix={tr("متر", "m")} />
        <Flag c={c} k="far_visit_alert" label={tr("نبّهني فوراً بالزيارة البعيدة", "Tell me of a far visit at once")} />
      </Part>
    </>
  );
}

function MoneyPart(c: Ctx) {
  const { tr } = c;
  const r = c.d.rules;
  return (
    <>
      <Part title={tr("العهدة", "Custody")}>
        <Num c={c} k="custody_cap" label={tr("حد النقد بيد المندوب", "Cash limit per rep")} hint={tr("0 = بلا حد. مندوب يأخذ نقداً وبيده أكثر منه: يصلك أنت والمحاسب إشعار لطلب التسليم (مرة في اليوم لكل مندوب)", "0 = none. A rep taking cash while holding more: you and the accountant are told to ask for a handover (once a day per rep)")} suffix={tr("د.ع", "IQD")} />
      </Part>
      <Part title={tr("عكس التسديدات", "Reversing payments")}>
        <Row label={tr("من يعكس تسديداً", "Who reverses a payment")} hint={tr("المدير دائماً", "Always the manager")} changed={!same(r.reverse_roles, DEFAULT_RULES.reverse_roles)} onDefault={() => c.set({ reverse_roles: DEFAULT_RULES.reverse_roles })} defText={tr("المدير والمحاسب", "Manager and accountant")} error={c.errors.reverse_roles}>
          <Chips<Role>
            value={r.reverse_roles}
            locked={["manager"]}
            options={[
              { v: "manager", l: roleName("manager", tr) },
              { v: "accountant", l: roleName("accountant", tr) },
            ]}
            onChange={(v) => c.set({ reverse_roles: (["manager", "accountant"] as Role[]).filter((x) => x === "manager" || v.includes(x)) })}
          />
        </Row>
        <Num c={c} k="reverse_days" label={tr("التسديد الأقدم من هذه الأيام يعكسه المدير فقط", "Older than these days: only the manager reverses")} hint={tr("0 = أي عمر", "0 = any age")} suffix={tr("يوم", "days")} />
      </Part>
      <Part title={tr("الصرفيات", "Expenses")}>
        <Num c={c} k="expense_approval_above" top label={tr("صرفية تحتاج موافقتك فوق", "An expense needs your OK above")} suffix={tr("د.ع", "IQD")} />
      </Part>
    </>
  );
}

function StockPart(c: Ctx) {
  const { tr } = c;
  const k = c.d.rules.clearance;
  const setC = (p: Partial<AdvancedRules["clearance"]>) => c.set({ clearance: { ...k, ...p } });
  const changed = !same(k, DEFAULT_RULES.clearance);
  return (
    <>
      <Part title={tr("الصلاحية والركود", "Expiry and slow items")}>
        <Num c={c} k="near_expiry_days" top label={tr("تنبيه قرب انتهاء الصلاحية", "Near-expiry alert")} suffix={tr("يوم", "days")} />
        <Num c={c} k="slow_moving_days" top label={tr("تُعدّ المادة راكدة إذا لم تُبع خلال", "An item is slow if not sold within")} suffix={tr("يوم", "days")} />
      </Part>
      <Part title={tr("خصم التصفية المقترح", "The suggested clearance discount")} sub={tr("بحسب الأيام الباقية قبل انتهاء الصلاحية", "By the days left before expiry")}>
        <Row label={tr("الأقرب", "Nearest")} hint={tr("باقٍ لها هذه الأيام أو أقل", "This many days left or less")} changed={changed} onDefault={() => c.set({ clearance: DEFAULT_RULES.clearance })} defText="7 / 30% · 14 / 20% · 10%" error={c.errors["clearance.days"]}>
          <div className="grid grid-cols-2 gap-2">
            <NumberInput value={nv(k.near_days)} onChange={(v) => setC({ near_days: v === "" ? Number.NaN : v })} suffix={tr("يوم", "d")} aria-label={tr("أيام الأقرب", "Nearest days")} />
            <NumberInput value={nv(k.near_percent)} onChange={(v) => setC({ near_percent: v === "" ? Number.NaN : v })} suffix="%" aria-label={tr("نسبة الأقرب", "Nearest percent")} />
          </div>
        </Row>
        <Row label={tr("الأوسط", "Middle")} error={c.errors["clearance.percent"]}>
          <div className="grid grid-cols-2 gap-2">
            <NumberInput value={nv(k.mid_days)} onChange={(v) => setC({ mid_days: v === "" ? Number.NaN : v })} suffix={tr("يوم", "d")} aria-label={tr("أيام الأوسط", "Middle days")} />
            <NumberInput value={nv(k.mid_percent)} onChange={(v) => setC({ mid_percent: v === "" ? Number.NaN : v })} suffix="%" aria-label={tr("نسبة الأوسط", "Middle percent")} />
          </div>
        </Row>
        <Row label={tr("الأبعد", "Farther")}>
          <NumberInput value={nv(k.far_percent)} onChange={(v) => setC({ far_percent: v === "" ? Number.NaN : v })} suffix="%" aria-label={tr("نسبة الأبعد", "Farther percent")} />
        </Row>
        <div className="flex flex-wrap gap-2 px-4 py-3 text-xs text-muted">
          {[3, 10, 20].map((n) => (
            <span key={n} className="rounded-full bg-card-2 px-2.5 py-1">
              {tr(`باقٍ ${n} يوم ← خصم ${suggestedClearance(k, n)}%`, `${n} days left → ${suggestedClearance(k, n)}% off`)}
            </span>
          ))}
        </div>
      </Part>
      <Part title={tr("«قارب ينفد عندك؟»", "«Running low?»")}>
        <Num c={c} k="reorder_early_days" label={tr("ذكّر صاحب المحل قبل موعده المعتاد بـ", "Remind the shop this long before its usual time")} hint={tr("0 = في يوم موعده", "0 = on the day")} suffix={tr("يوم", "days")} />
      </Part>
    </>
  );
}

function SecurityPart(c: Ctx) {
  const { tr } = c;
  const otpRow = (k: keyof AdvancedRules["otp"], label: string, suffix?: string) => {
    const cur = c.d.rules.otp[k];
    const def = DEFAULT_RULES.otp[k];
    const err = c.errors[`otp.${k}`];
    return (
      <Row label={label} changed={cur !== def} onDefault={() => c.set({ otp: { ...c.d.rules.otp, [k]: def } })} defText={`${def}${suffix ? ` ${suffix}` : ""}`} error={err}>
        <NumberInput value={nv(cur)} onChange={(v) => c.set({ otp: { ...c.d.rules.otp, [k]: v === "" ? Number.NaN : v } })} suffix={suffix} invalid={!!err} aria-label={label} />
      </Row>
    );
  };
  return (
    <>
      <Part title={tr("الدخول وكلمات المرور", "Logins and passwords")}>
        <Num c={c} k="login_lock_after" label={tr("قفل الدخول بعد كلمات مرور خاطئة متتالية", "Lock a login after wrong passwords in a row")} hint={tr("0 = لا قفل. يُقفل الرقم ولو كتب الصحيحة بعدها", "0 = never. The number is locked even with the right one")} />
        <Num c={c} k="login_lock_minutes" label={tr("مدة القفل", "How long it stays locked")} suffix={tr("دقيقة", "min")} />
        <Num c={c} k="password_min" label={tr("أقصر كلمة مرور مسموحة", "Shortest password allowed")} hint={tr("للجديدة والمغيّرة فقط؛ الحالية لا تتغير", "New and changed ones only")} suffix={tr("حرف", "chars")} />
      </Part>
      <Part title={tr("رمز التحقق (OTP)", "Verification code (OTP)")} sub={tr("التسجيل ونسيان كلمة المرور وتغيير الرقم", "Sign-up, forgotten password, phone change")}>
        {otpRow("code_minutes", tr("صلاحية الرمز", "The code is valid for"), tr("دقيقة", "min"))}
        {otpRow("resend_seconds", tr("الانتظار قبل إعادة الإرسال", "Wait before sending again"), tr("ثانية", "s"))}
        {otpRow("per_hour", tr("أكثر عدد رموز للرقم في الساعة", "Most codes per number per hour"))}
        {otpRow("tries", tr("محاولات كتابة الرمز", "Tries to type the code"))}
      </Part>
    </>
  );
}

const FEATURES: { k: FeatureKey; ar: string; en: string; hint: string; hint_en: string }[] = [
  { k: "self_signup", ar: "تسجيل المحلات من الموقع", en: "Shops sign up online", hint: "زر «سجّل محلك» في صفحة الدخول والصفحة الرئيسية", hint_en: "«Sign up your shop» on the login and home pages" },
  { k: "online_pay", ar: "الدفع الأونلاين (Qi وزين كاش)", en: "Online payment (Qi, ZainCash)", hint: "كشف الحساب، وصفحة الطلب، والدفع عند التسليم", hint_en: "Statement, order page, at the door" },
  { k: "ratings", ar: "تقييم التوصيل", en: "Delivery ratings", hint: "النجوم بعد كل تسليم، وتقرير التقييمات", hint_en: "Stars after each delivery" },
  { k: "notify_me", ar: "«أعلمني عند التوفر»", en: "«Notify me»", hint: "زر على المادة النافدة في المتجر", hint_en: "On a sold-out item" },
  { k: "clearance", ar: "عروض التصفية", en: "Clearance offers", hint: "متوقفة: لا سعر تصفية على أي مادة، ولا اقتراحات", hint_en: "Off: no clearance price, no suggestions" },
  { k: "offline", ar: "العمل بلا إنترنت", en: "Working offline", hint: "المندوب يكتب الطلبات والتسديدات بلا إنترنت وتُرسل لاحقاً", hint_en: "Reps write orders and payments offline" },
  { k: "support_chat", ar: "محادثة الدعم", en: "Support chat", hint: "زر «المساعدة والدعم» عند صاحب المحل", hint_en: "«Help and support» for shop owners" },
  { k: "reorder", ar: "«قارب ينفد عندك؟»", en: "«Running low?»", hint: "تذكير صاحب المحل بما يطلبه عادة، والمحلات المتأخرة عند المندوب", hint_en: "Reminders of usual items" },
];

function FeaturesPart(c: Ctx) {
  const { tr } = c;
  const f = c.d.rules.features;
  return (
    <Part title={tr("تشغيل الميزات وإيقافها", "Turn features on and off")} sub={tr("الميزة المتوقفة تختفي من الصفحات، ويرفضها الخادم أيضاً", "A feature turned off disappears from the pages, and the server refuses it too")}>
      {FEATURES.map((x) => (
        <Row key={x.k} label={tr(x.ar, x.en)} hint={tr(x.hint, x.hint_en)} changed={f[x.k] !== DEFAULT_RULES.features[x.k]} onDefault={() => c.set({ features: { ...f, [x.k]: true } })} defText={tr("مفعّلة", "On")}>
          <Switch checked={f[x.k]} onChange={(v) => c.set({ features: { ...f, [x.k]: v } })} label={f[x.k] ? tr("مفعّلة", "On") : tr("متوقفة", "Off")} />
        </Row>
      ))}
    </Part>
  );
}

/** The kinds of notifications in Arabic and English, in the matrix's order. */
export const NOTIFY_NAMES: [NotificationType, string, string][] = [
  ["needs_approval", "يحتاج موافقة / تنبيه للمدير", "Needs approval / manager alert"],
  ["order_review", "طلب بانتظار الاعتماد", "Order to approve"],
  ["shop_order", "طلب من المحل", "Shop order"],
  ["order_accepted", "طلب معتمد", "Order approved"],
  ["order_rejected", "طلب مرفوض", "Order refused"],
  ["order_confirmed", "طلب مثبّت / تقييم ممتاز", "Order confirmed / 5 stars"],
  ["new_shop", "محل جديد", "New shop"],
  ["account_approved", "تفعيل حساب المحل", "Shop account approved"],
  ["out_for_delivery", "الطلب في الطريق", "On the way"],
  ["delivered", "تم التسليم", "Delivered"],
  ["door_payment", "دفع عند التسليم", "Paid at the door"],
  ["delivery_locked", "شحنة مقفلة", "Shipment locked"],
  ["delivery_problem", "تعذّر التسليم", "Can't deliver"],
  ["support_message", "رسالة دعم من محل", "Support message"],
  ["support_reply", "رد الدعم", "Support reply"],
  ["low_stock", "مخزون قليل", "Low stock"],
  ["near_expiry", "قرب انتهاء الصلاحية", "Near expiry"],
  ["expired", "منتهي الصلاحية / انتهى الحجز", "Expired"],
  ["clearance", "عرض تصفية", "Clearance"],
  ["back_in_stock", "عادت المادة", "Back in stock"],
  ["reorder", "قارب ينفد", "Running low"],
  ["price_change", "تغيّر سعر", "Price change"],
  ["supply_order", "طلب توريد", "Supply order"],
  ["expense", "صرفية", "Expense"],
  ["custody", "العهدة", "Custody"],
  ["commission_earned", "عمولة", "Commission"],
  ["refund", "ردّ مبلغ", "Refund"],
  ["usd_rate", "سعر الدولار", "Dollar rate"],
  ["day_summary", "ملخص اليوم", "Day summary"],
];

function NotifyPart(c: Ctx) {
  const { tr } = c;
  const m = c.d.rules.notify_matrix;
  const rolesOf = (t: NotificationType) => m[t] ?? DEFAULT_NOTIFY[t] ?? [];
  const toggle = (t: NotificationType, r: Role) => {
    const now = rolesOf(t);
    const next = now.includes(r) ? now.filter((x) => x !== r) : [...now, r];
    const def = DEFAULT_NOTIFY[t] ?? [];
    const sameAsDef = next.length === def.length && next.every((x) => def.includes(x));
    const copy = { ...m };
    if (sameAsDef) delete copy[t];
    else copy[t] = ROLES_ALL.filter((x) => next.includes(x));
    c.set({ notify_matrix: copy });
  };
  const changed = Object.keys(m).length;
  return (
    <>
      <Part title={tr("من يصله كل إشعار", "Who gets each notification")} sub={tr("علّم الوظائف التي يصلها كل نوع. وظيفة تضيفها تصلها نسخة لكل أصحابها", "Tick the jobs that get each kind. A job you add gets its own copy")}>
        {changed > 0 && (
          <div className="flex items-center justify-between gap-2 border-b border-line bg-action/[0.04] px-4 py-2 text-xs">
            <span>{tr(`${changed} نوع معدَّل`, `${changed} kind(s) changed`)}</span>
            <button type="button" onClick={() => c.set({ notify_matrix: {} })} className="flex items-center gap-1 font-semibold text-action hover:underline">
              <RotateCcw className="size-3" /> {tr("الكل كما كان", "All back to default")}
            </button>
          </div>
        )}
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-sm">
            <thead>
              <tr className="border-b border-line text-xs text-muted">
                <th className="px-4 py-2 text-start font-semibold">{tr("الإشعار", "Notification")}</th>
                {ROLES_ALL.map((r) => (
                  <th key={r} className="px-2 py-2 text-center font-semibold">
                    {roleName(r, tr)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {NOTIFY_NAMES.map(([t, ar, en]) => {
                const on = rolesOf(t);
                const def = DEFAULT_NOTIFY[t] ?? [];
                return (
                  <tr key={t} className={cn("border-b border-line last:border-0", m[t] && "bg-action/[0.04]")}>
                    <td className="px-4 py-2">
                      <span className="font-medium">{tr(ar, en)}</span>
                      {m[t] && <Badge tone="warning" className="ms-2">{tr("معدَّل", "Changed")}</Badge>}
                    </td>
                    {ROLES_ALL.map((r) => (
                      <td key={r} className="px-2 py-2 text-center">
                        <input
                          type="checkbox"
                          checked={on.includes(r)}
                          onChange={() => toggle(t, r)}
                          aria-label={`${tr(ar, en)} · ${roleName(r, tr)}`}
                          className={cn("size-4 cursor-pointer accent-[var(--action)]", def.includes(r) && "ring-2 ring-action/30")}
                        />
                      </td>
                    ))}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Part>
      <Part title={tr("ملخص اليوم", "Day summary")}>
        <Num c={c} k="summary_hour" top label={tr("ساعة إرسال ملخص اليوم", "The hour the day summary is sent")} hint={tr("من 0 إلى 23", "0 to 23")} />
      </Part>
    </>
  );
}

function AnnouncePart(c: Ctx) {
  const { tr } = c;
  const a = c.d.rules.announcement;
  const mt = c.d.rules.maintenance;
  const setA = (p: Partial<NonNullable<AdvancedRules["announcement"]>>) => c.set({ announcement: { text: "", roles: [], tone: "info", ...a, ...p } });
  const roles = ROLES_ALL.map((r) => ({ v: r, l: roleName(r, tr) }));
  return (
    <>
      <Part title={tr("إعلان أعلى الصفحات", "A banner on top of the pages")} icon={<Megaphone className="size-4 text-action" />} sub={tr("يظهر لمن تختار حتى تحذفه أو ينتهي وقته", "Shown to whom you choose until removed or it ends")}>
        <Row label={tr("الإعلان", "The banner")} changed={!!a} onDefault={() => c.set({ announcement: null })} defText={tr("بلا إعلان", "None")}>
          <Switch checked={!!a} onChange={(v) => c.set({ announcement: v ? { text: "", roles: [], tone: "info" } : null })} label={a ? tr("ظاهر", "Shown") : tr("بلا إعلان", "None")} />
        </Row>
        {a && (
          <>
            <Row label={tr("النص", "Text")} error={c.errors["announcement.text"]}>
              <Textarea value={a.text} onChange={(e) => setA({ text: e.target.value })} maxLength={300} placeholder={tr("مثلاً: عطلة يوم الجمعة، التوصيل يعود السبت", "e.g. Closed Friday; deliveries resume Saturday")} />
            </Row>
            <Row label={tr("النص بالإنجليزية (اختياري)", "English text (optional)")}>
              <Input value={a.text_en ?? ""} onChange={(e) => setA({ text_en: e.target.value || undefined })} dir="ltr" />
            </Row>
            <Row label={tr("لمن", "For whom")} hint={tr("بلا اختيار = الجميع، وأصحاب المحلات معهم", "None = everyone, shop owners too")}>
              <Chips value={a.roles} options={roles} onChange={(v) => setA({ roles: v })} />
            </Row>
            <Row label={tr("اللون", "Color")}>
              <Segmented value={a.tone} onChange={(v) => setA({ tone: v })} options={[{ value: "info", label: tr("معلومة", "Info") }, { value: "warning", label: tr("تنبيه", "Warning") }]} />
            </Row>
            <Row label={tr("ينتهي في (اختياري)", "Ends at (optional)")} error={c.errors["announcement.until"]}>
              <Input type="datetime-local" dir="ltr" value={a.until ? toLocalInput(a.until) : ""} onChange={(e) => setA({ until: e.target.value ? new Date(e.target.value).toISOString() : undefined })} />
            </Row>
            <div className="px-4 py-3">
              <p className="mb-1 text-xs text-muted">{tr("هكذا يظهر:", "Preview:")}</p>
              <AnnouncementBar a={a} preview />
            </div>
          </>
        )}
      </Part>
      <Part title={tr("صيانة تطبيق أصحاب المحلات", "Shop owners' app maintenance")} icon={<Wrench className="size-4 text-warning" />} sub={tr("الموظفون يعملون كالعادة؛ أصحاب المحلات يرون الرسالة ولا يرسلون طلبات", "Staff work as usual; shop owners see the message and can't order")}>
        <Row label={tr("وضع الصيانة", "Maintenance mode")} changed={mt.on} onDefault={() => c.set({ maintenance: { ...mt, on: false } })} defText={tr("متوقف", "Off")}>
          <Switch checked={mt.on} onChange={(v) => c.set({ maintenance: { ...mt, on: v } })} label={mt.on ? tr("مفعّل الآن", "On now") : tr("متوقف", "Off")} />
        </Row>
        <Row label={tr("الرسالة لأصحاب المحلات", "The message to shop owners")} error={c.errors["maintenance.message"]}>
          <Textarea value={mt.message} onChange={(e) => c.set({ maintenance: { ...mt, message: e.target.value } })} placeholder={tr("مثلاً: نحدّث النظام، ونعود خلال ساعة", "e.g. Updating; back within an hour")} />
        </Row>
        <Row label={tr("الرسالة بالإنجليزية (اختياري)", "English message (optional)")}>
          <Input dir="ltr" value={mt.message_en ?? ""} onChange={(e) => c.set({ maintenance: { ...mt, message_en: e.target.value || undefined } })} />
        </Row>
      </Part>
    </>
  );
}

const toLocalInput = (iso: string) => {
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
};

/** The manager's banner (also the preview in the editor). */
export function AnnouncementBar({ a, preview, onClose }: { a: NonNullable<AdvancedRules["announcement"]>; preview?: boolean; onClose?: () => void }) {
  const { tr, lang } = useFmt();
  const text = lang === "en" && a.text_en ? a.text_en : a.text;
  return (
    <div role={preview ? undefined : "status"} className={cn("flex items-start gap-2 rounded-xl px-3 py-2 text-sm font-medium", a.tone === "warning" ? "bg-warning-soft text-warning" : "bg-primary-soft text-primary-ink")}>
      <Megaphone className="mt-0.5 size-4 shrink-0" />
      <p className="min-w-0 flex-1 whitespace-pre-line">{text || tr("نص الإعلان…", "The banner's text…")}</p>
      {onClose && (
        <button type="button" onClick={onClose} aria-label={tr("إخفاء", "Hide")} className="shrink-0 rounded px-1 opacity-70 hover:opacity-100">
          ×
        </button>
      )}
    </div>
  );
}

// ---------- history, file, defaults ----------

/** The names of the settings (the history's words). */
const KEY_NAMES: Record<string, [string, string]> = {
  reservation_hours: ["مدة الحجز", "Reservation hours"],
  near_expiry_days: ["تنبيه الصلاحية", "Expiry alert"],
  slow_moving_days: ["المادة الراكدة", "Slow item days"],
  expense_approval_above: ["حد موافقة الصرفيات", "Expense approval limit"],
  summary_hour: ["ساعة ملخص اليوم", "Day summary hour"],
  auto_confirm_rep_orders: ["اعتماد طلبات المندوبين تلقائياً", "Auto-approve rep orders"],
  "advanced.staff_discount_max": ["خصم الموظف بلا موافقة", "Staff discount alone"],
  "advanced.discount_max": ["أعلى خصم", "Highest discount"],
  "advanced.offline_max_days": ["أيام الطلب بلا إنترنت", "Offline days"],
  "advanced.round_to": ["التقريب", "Rounding"],
  "advanced.shop_edit_minutes": ["وقت تعديل المحل", "Shop edit minutes"],
  "advanced.min_shop_order": ["أقل طلب للمحل", "Smallest shop order"],
  "advanced.over_limit": ["تجاوز سقف الدين", "Over the debt limit"],
  "advanced.signup_tier_id": ["نوع سعر المحل الجديد", "New shop's tier"],
  "advanced.signup_debt_limit": ["سقف المحل الجديد", "New shop's limit"],
  "advanced.signup_auto_approve": ["موافقة تلقائية للمحل الجديد", "Auto-approve new shops"],
  "advanced.max_shops_per_account": ["محلات لكل حساب", "Shops per account"],
  "advanced.pin_tries": ["رموز الاستلام الخاطئة", "Wrong PINs"],
  "advanced.photo_required": ["صورة التسليم مطلوبة", "Photo required"],
  "advanced.low_rating_stars": ["تنبيه التقييم المنخفض", "Low rating alert"],
  "advanced.door_methods": ["الدفع عند التسليم", "Paying at the door"],
  "advanced.custody_cap": ["حد العهدة", "Custody limit"],
  "advanced.visit_near_m": ["مسافة الزيارة", "Visit distance"],
  "advanced.far_visit_alert": ["تنبيه الزيارة البعيدة", "Far visit alert"],
  "advanced.reverse_roles": ["من يعكس التسديد", "Who reverses"],
  "advanced.reverse_days": ["عمر التسديد المعكوس", "Reverse age"],
  "advanced.clearance": ["خصم التصفية المقترح", "Clearance discount"],
  "advanced.reorder_early_days": ["تذكير «قارب ينفد»", "Reorder reminder"],
  "advanced.otp": ["رمز التحقق", "Verification code"],
  "advanced.login_lock_after": ["قفل الدخول بعد", "Lock after"],
  "advanced.login_lock_minutes": ["مدة القفل", "Lock minutes"],
  "advanced.password_min": ["أقصر كلمة مرور", "Shortest password"],
  "advanced.features": ["الميزات", "Features"],
  "advanced.notify_matrix": ["من يصله كل إشعار", "Notification matrix"],
  "advanced.announcement": ["الإعلان", "Banner"],
  "advanced.maintenance": ["الصيانة", "Maintenance"],
};

const PART_NAMES: Record<string, Record<string, [string, string]>> = {
  otp: { code_minutes: ["صلاحية الرمز", "Code valid"], resend_seconds: ["انتظار إعادة الإرسال", "Resend wait"], per_hour: ["رموز في الساعة", "Codes an hour"], tries: ["محاولات الرمز", "Code tries"] },
  clearance: { near_days: ["أيام الأقرب", "Nearest days"], near_percent: ["نسبة الأقرب", "Nearest %"], mid_days: ["أيام الأوسط", "Middle days"], mid_percent: ["نسبة الأوسط", "Middle %"], far_percent: ["نسبة الأبعد", "Farther %"] },
  maintenance: { on: ["وضع الصيانة", "Maintenance mode"], message: ["رسالة الصيانة", "Maintenance message"], message_en: ["رسالة الصيانة بالإنجليزية", "English message"] },
};

/** A history line's name: the setting, or the part of one («رمز التحقق · صلاحية الرمز», «الميزات · محادثة الدعم»). */
function keyName(key: string, tr: Tr): string {
  if (KEY_NAMES[key]) return tr(KEY_NAMES[key][0], KEY_NAMES[key][1]);
  const [, group, part] = key.split(".");
  if (group === "features") {
    const f = FEATURES.find((x) => x.k === part);
    return f ? tr(f.ar, f.en) : part;
  }
  if (group === "notify_matrix") {
    const n = NOTIFY_NAMES.find((x) => x[0] === part);
    return tr(`إشعار «${n?.[1] ?? part}»`, `«${n?.[2] ?? part}» notification`);
  }
  const p = PART_NAMES[group]?.[part];
  const g = KEY_NAMES[`advanced.${group}`];
  return p ? tr(p[0], p[1]) : `${g ? tr(g[0], g[1]) : group} · ${part}`;
}

/** A history value in words: on/off, jobs and ways of paying by name, «كالمعتاد» for an unchanged matrix row. */
function showValue(key: string, v: unknown, tr: Tr): string {
  if (v === null || v === undefined) return key.includes(".notify_matrix.") ? tr("كالمعتاد", "As usual") : "—";
  if (typeof v === "boolean") return key.includes(".features.") ? (v ? tr("مفعّلة", "On") : tr("متوقفة", "Off")) : v ? tr("نعم", "Yes") : tr("لا", "No");
  if (typeof v === "number") return v.toLocaleString("en");
  if (typeof v === "string") {
    if (key.endsWith(".over_limit")) return v === "approval" ? tr("ينتظر موافقتي", "Waits for me") : v === "block" ? tr("يُرفض", "Refused") : tr("يمرّ", "Allowed");
    return v;
  }
  if (Array.isArray(v)) {
    if (!v.length) return tr("لا أحد", "Nobody");
    const pay: Record<string, [string, string]> = { cash: ["نقداً", "Cash"], qi: ["Qi", "Qi"], zaincash: ["زين كاش", "ZainCash"] };
    return v.map((x) => (pay[x] ? tr(pay[x][0], pay[x][1]) : ROLES_ALL.includes(x) ? roleName(x, tr) : String(x))).join("، ");
  }
  const s = JSON.stringify(v);
  return s.length > 80 ? `${s.slice(0, 80)}…` : s;
}

function HistorySection() {
  const { tr, dateTime } = useFmt();
  const { lookups, reloadLookups } = useApp();
  const toast = useToast();
  const h = useLoad(() => api.settingsHistory(), []);
  const file = useRef<HTMLInputElement>(null);
  const [incoming, setIncoming] = useState<{ settings: Settings; name: string; changes: number } | null>(null);
  const [resetting, setResetting] = useState(false);
  const [busy, setBusy] = useState(false);

  function download() {
    const body = JSON.stringify({ kind: "nahrain-settings", version: 1, exported_at: new Date().toISOString(), settings: lookups.settings }, null, 2);
    const url = URL.createObjectURL(new Blob([body], { type: "application/json" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `nahrain-settings-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function pick(f: File) {
    try {
      const j = JSON.parse(await f.text());
      if (j?.kind !== "nahrain-settings" || typeof j.settings !== "object") throw new Error("kind");
      const s = j.settings as Settings;
      const bad = checkRules(rulesOf(s), lookups.tiers.map((t) => t.id));
      if (Object.keys(bad).length) {
        toast("danger", tr(`الملف فيه قيم غير صحيحة: ${Object.keys(bad).join("، ")}`, `The file has wrong values: ${Object.keys(bad).join(", ")}`));
        return;
      }
      const changes = Object.keys(changedRules(rulesOf(s))).length;
      setIncoming({ settings: s, name: f.name, changes });
    } catch {
      toast("danger", tr("هذا ليس ملف إعدادات النهرين", "This isn't an Al-Nahrain settings file"));
    } finally {
      if (file.current) file.current.value = "";
    }
  }

  async function apply(s: Settings, how: "import" | "reset", ok: string) {
    setBusy(true);
    try {
      await api.saveSettings(s, how);
      toast("success", ok);
      reloadLookups();
      h.reload();
      setIncoming(null);
      setResetting(false);
    } catch (e) {
      toast("danger", errorText(e, tr));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Card className="mb-4 p-4">
        <p className="mb-3 text-sm text-muted">{tr("انسخ كل الإعدادات إلى ملف، أو أرجعها من ملف، أو أعدها كما كانت أول مرة.", "Copy every setting to a file, bring them back from one, or return them to the defaults.")}</p>
        <div className="flex flex-wrap gap-2">
          <Button onClick={download}>
            <Download className="size-4" /> {tr("تنزيل ملف الإعدادات", "Download the settings file")}
          </Button>
          <Button onClick={() => file.current?.click()}>
            <Upload className="size-4" /> {tr("استيراد من ملف", "Import from a file")}
          </Button>
          <input ref={file} type="file" accept="application/json,.json" className="hidden" onChange={(e) => e.target.files?.[0] && pick(e.target.files[0])} />
          <Button variant="danger" onClick={() => setResetting(true)}>
            <RotateCcw className="size-4" /> {tr("إرجاع الكل إلى الافتراضي", "All back to default")}
          </Button>
        </div>
      </Card>

      <Card>
        <CardHeader title={<span className="flex items-center gap-2"><History className="size-4" />{tr("سجل تغييرات الإعدادات", "Settings history")}</span>} subtitle={tr("من غيّر ماذا ومتى، الأحدث أولاً", "Who changed what and when, newest first")} />
        {h.state.status === "loading" ? (
          <LoadingRows />
        ) : !h.data?.length ? (
          <Empty icon={<History className="size-6" />} title={tr("لم تتغير الإعدادات بعد", "No changes yet")} />
        ) : (
          <ul className="divide-y divide-line">
            {h.data.map((x: SettingsChange) => (
              <li key={x.id} className="px-4 py-3">
                <p className="flex flex-wrap items-center gap-2 text-sm font-semibold">
                  {x.by.name}
                  <span className="text-xs font-normal text-muted">{dateTime(x.at)}</span>
                  {x.how === "import" && <Badge tone="primary">{tr("من ملف", "From a file")}</Badge>}
                  {x.how === "reset" && <Badge tone="warning">{tr("إرجاع الافتراضي", "Reset")}</Badge>}
                </p>
                <ul className="mt-1 space-y-0.5 text-xs">
                  {x.changes.map((ch) => (
                    <li key={ch.key} className="flex flex-wrap gap-1">
                      <span className="font-semibold">{keyName(ch.key, tr)}:</span>
                      <span className="text-muted line-through">{showValue(ch.key, ch.from, tr)}</span>
                      <span>←</span>
                      <span className="font-medium">{showValue(ch.key, ch.to, tr)}</span>
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {incoming && (
        <Dialog
          open
          onClose={() => setIncoming(null)}
          title={tr("استيراد الإعدادات", "Import settings")}
          footer={
            <>
              <Button onClick={() => setIncoming(null)}>{tr("إلغاء", "Cancel")}</Button>
              <Button variant="action" loading={busy} onClick={() => apply(incoming.settings, "import", tr("استُوردت الإعدادات", "Settings imported"))}>
                {tr("استيراد", "Import")}
              </Button>
            </>
          }
        >
          <Notice tone="warning">
            {tr(
              `الملف «${incoming.name}» فيه ${incoming.changes} إعداداً معدَّلاً عن الافتراضي. سيحلّ محل الإعدادات الحالية كلها، ويُسجَّل في السجل.`,
              `«${incoming.name}» has ${incoming.changes} changed setting(s). It replaces all current settings, and is kept in the history.`,
            )}
          </Notice>
        </Dialog>
      )}
      {resetting && (
        <Dialog
          open
          onClose={() => setResetting(false)}
          title={tr("إرجاع الإعدادات إلى الافتراضي", "Settings back to default")}
          footer={
            <>
              <Button onClick={() => setResetting(false)}>{tr("إلغاء", "Cancel")}</Button>
              <Button variant="danger" loading={busy} onClick={() => apply({ ...TOP_DEFAULTS, auto_confirm_rep_orders: false, advanced: {} }, "reset", tr("عادت الإعدادات كما كانت", "Settings are back to default"))}>
                {tr("إرجاع الكل", "Reset all")}
              </Button>
            </>
          }
        >
          <Notice tone="warning">{tr("كل قواعد العمل والإعدادات تعود كما كانت أول مرة (ومعها مدة الحجز وحد الصرفيات). نزّل ملف الإعدادات أولاً إن أردت الرجوع إليها.", "Every rule and setting returns to the defaults. Download the settings file first to keep them.")}</Notice>
        </Dialog>
      )}
    </>
  );
}
