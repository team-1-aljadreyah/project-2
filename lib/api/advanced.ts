// «الإعدادات المتقدمة» — the company's rules the manager can change (settings.advanced). Every value has its default
// here (what the site did before it could be changed), its limits, and is read the same way by the server (the
// rules) and by the pages (what they show and allow). Only what the manager changed is saved; the rest follows
// these defaults. These are the backend's rules (docs/backend.md → «الإعدادات المتقدمة»).
import type { DoorPayMethod, NotificationType, Role, Settings } from "./types";
import { ACTIONS, STAFF_ROLES, rolesFor, type ActionKey, type PersonRule } from "./permissions";

export type FeatureKey = "self_signup" | "online_pay" | "ratings" | "notify_me" | "clearance" | "offline" | "support_chat" | "reorder";

export interface Announcement {
  text: string;
  text_en?: string;
  /** Who sees it (none = everyone, the shop owners too). */
  roles: Role[];
  tone: "info" | "warning";
  /** It disappears by itself after this moment (ISO). None = until removed. */
  until?: string;
}

/** The kinds of numbered records (their prefix: ORD-000123). */
export type NumberKind = "order" | "invoice" | "payment" | "return" | "receipt" | "transfer" | "supply" | "expense" | "credit_note" | "refund" | "stocktake" | "handover";
export const DEFAULT_PREFIXES: Record<NumberKind, string> = { order: "ORD", invoice: "INV", payment: "PAY", return: "RET", receipt: "RCV", transfer: "TRF", supply: "SUP", expense: "EXP", credit_note: "CN", refund: "RF", stocktake: "CNT", handover: "HND" };

/** One warehouse's own rules (missing = as the company's). */
export interface WarehouseRule {
  /** Its own reservation hours for an unapproved order. */
  reservation_hours?: number;
  /** Shop owners may order from it in their app (false: their orders go to another warehouse). */
  shop_orders?: boolean;
  /** The keeper sells to walk-in buyers there («بيع مباشر»). */
  counter_sale?: boolean;
}

export interface AdvancedRules {
  // ---- Orders and approvals ----
  /** The discount a rep / accountant gives alone (more waits for the manager), in %. */
  staff_discount_max: number;
  /** The highest discount anyone gives, in %. */
  discount_max: number;
  /** Rep orders are approved by themselves (no accountant step) when nothing else holds them. */
  auto_confirm_rep_orders: boolean;
  /** An order written offline keeps the price of the moment it was written, at most this many days back. */
  offline_max_days: number;
  /** Totals are rounded to this many dinars (0 = not rounded). */
  round_to: number;
  /** The shop owner changes his order: until it is approved (0), or only this many minutes after sending it. */
  shop_edit_minutes: number;
  /** The smallest order a shop owner may send from his app (0 = none), in IQD. */
  min_shop_order: number;
  /** An order over the shop's debt limit: waits for the manager, is refused, or goes through (the manager is told). */
  over_limit: "approval" | "block" | "allow";
  // ---- New shops ----
  /** A shop that signs up by itself: its price tier (null = the last tier), and its debt limit. */
  signup_tier_id: number | null;
  signup_debt_limit: number;
  /** Approved at once (it can order right away) instead of waiting for the manager. */
  signup_auto_approve: boolean;
  /** Shops one owner's account may hold. */
  max_shops_per_account: number;
  // ---- Delivery ----
  /** Wrong delivery PINs before the shipment locks. */
  pin_tries: number;
  /** A photo of the packages is needed to deliver. */
  photo_required: boolean;
  /** A rating at or under this many stars alerts the manager (0 = never). */
  low_rating_stars: number;
  /** What the driver may take at the door. */
  door_methods: DoorPayMethod[];
  /** A rep who takes cash while holding more than this: the accountant and the manager are told, once a day per rep (0 = never), in IQD. */
  custody_cap: number;
  // ---- Visits ----
  /** A visit recorded farther than this from the shop's pin counts as «far», in metres. */
  visit_near_m: number;
  /** A far visit alerts the manager at once. */
  far_visit_alert: boolean;
  // ---- Money ----
  /** Who may reverse a payment. */
  reverse_roles: Role[];
  /** A payment older than this many days is reversed by the manager only (0 = any age). */
  reverse_days: number;
  // ---- Stock ----
  /** The suggested clearance discount by the days left before expiry. */
  clearance: { near_days: number; near_percent: number; mid_days: number; mid_percent: number; far_percent: number };
  /** «قارب ينفد عندك؟»: remind the shop this many days before its usual time. */
  reorder_early_days: number;
  // ---- Security ----
  otp: { code_minutes: number; resend_seconds: number; per_hour: number; tries: number };
  /** Wrong passwords in a row before a login is locked (0 = never), and for how long. */
  login_lock_after: number;
  login_lock_minutes: number;
  /** The shortest password allowed (new ones and changes). */
  password_min: number;
  // ---- Who may do what ----
  /** The jobs that may do each action (missing = as before: ACTIONS' defaults). The manager always may. */
  permissions: Partial<Record<ActionKey, Role[]>>;
  /** One person's own rules: discount, cash limit, expense limit, actions given or taken (by user id). */
  people: Record<string, PersonRule>;
  /** The discount each job gives alone (missing = staff_discount_max). */
  discount_by_role: Partial<Record<Role, number>>;
  /** An expense above this (by the job that records it) waits for the manager (missing = the settings' limit). */
  expense_by_role: Partial<Record<Role, number>>;
  // ---- Working time and delivery dates ----
  /** The company's working days and hours, and holidays. Off = no working-time rules (as before). */
  work: { on: boolean; days: number[]; from: string; to: string; holidays: { date: string; name: string }[] };
  /** When an order is delivered: before the cut-off the same day, after it the next delivery day; the delivery
   *  days of each area (missing area = every working day). Off = no expected date (as before). */
  delivery_plan: { on: boolean; cutoff: string; days_by_area: Record<string, number[]> };
  // ---- Warehouses, numbers and names ----
  /** Each warehouse's own rules (by id). */
  warehouses: Record<string, WarehouseRule>;
  /** The record numbers' prefixes, the currency's name, and a line printed under every invoice. */
  names: { prefixes: Partial<Record<NumberKind, string>>; currency_ar: string; currency_en: string; invoice_footer: string };
  // ---- Bigger tools ----
  features: Record<FeatureKey, boolean>;
  /** Who receives each kind of notification (missing = as the site always did, DEFAULT_NOTIFY). */
  notify_matrix: Partial<Record<NotificationType, Role[]>>;
  announcement: Announcement | null;
  /** The shop owners' app is closed (they see the message, and can't order); staff work as usual. */
  maintenance: { on: boolean; message: string; message_en?: string };
}

export const DEFAULT_RULES: AdvancedRules = {
  staff_discount_max: 3,
  discount_max: 30,
  auto_confirm_rep_orders: false,
  offline_max_days: 3,
  round_to: 250,
  shop_edit_minutes: 0,
  min_shop_order: 0,
  over_limit: "approval",
  signup_tier_id: null,
  signup_debt_limit: 0,
  signup_auto_approve: false,
  max_shops_per_account: 10,
  pin_tries: 5,
  photo_required: true,
  low_rating_stars: 2,
  door_methods: ["cash", "qi", "zaincash"],
  custody_cap: 0,
  visit_near_m: 200,
  far_visit_alert: false,
  reverse_roles: ["manager", "accountant"],
  reverse_days: 0,
  clearance: { near_days: 7, near_percent: 30, mid_days: 14, mid_percent: 20, far_percent: 10 },
  reorder_early_days: 1,
  otp: { code_minutes: 5, resend_seconds: 60, per_hour: 5, tries: 5 },
  login_lock_after: 0,
  login_lock_minutes: 15,
  password_min: 6,
  permissions: {},
  people: {},
  discount_by_role: {},
  expense_by_role: {},
  work: { on: false, days: [6, 0, 1, 2, 3, 4], from: "08:00", to: "18:00", holidays: [] },
  delivery_plan: { on: false, cutoff: "14:00", days_by_area: {} },
  warehouses: {},
  names: { prefixes: {}, currency_ar: "د.ع", currency_en: "IQD", invoice_footer: "" },
  features: { self_signup: true, online_pay: true, ratings: true, notify_me: true, clearance: true, offline: true, support_chat: true, reorder: true },
  notify_matrix: {},
  announcement: null,
  maintenance: { on: false, message: "" },
};

/** The rules in force: the defaults, with what the manager changed on top (nested parts merged one level). */
export function rulesOf(s?: Pick<Settings, "advanced" | "auto_confirm_rep_orders"> | null): AdvancedRules {
  const a = s?.advanced ?? {};
  return {
    ...DEFAULT_RULES,
    ...a,
    // The older top-level switch is the same rule.
    auto_confirm_rep_orders: a.auto_confirm_rep_orders ?? s?.auto_confirm_rep_orders ?? false,
    clearance: { ...DEFAULT_RULES.clearance, ...a.clearance },
    otp: { ...DEFAULT_RULES.otp, ...a.otp },
    features: { ...DEFAULT_RULES.features, ...a.features },
    maintenance: { ...DEFAULT_RULES.maintenance, ...a.maintenance },
    notify_matrix: { ...a.notify_matrix },
    announcement: a.announcement === undefined ? null : a.announcement,
    // «who reverses» was its own setting before the table: it is the table's row now.
    permissions: { ...(a.reverse_roles && !a.permissions?.reverse_payment ? { reverse_payment: a.reverse_roles } : {}), ...a.permissions },
    people: { ...a.people },
    discount_by_role: { ...a.discount_by_role },
    expense_by_role: { ...a.expense_by_role },
    work: { ...DEFAULT_RULES.work, ...a.work },
    delivery_plan: { ...DEFAULT_RULES.delivery_plan, ...a.delivery_plan },
    warehouses: { ...a.warehouses },
    names: { ...DEFAULT_RULES.names, ...a.names, prefixes: { ...a.names?.prefixes } },
  };
}

/** A record kind's prefix now (the manager's, else the default). */
export const prefixOf = (r: AdvancedRules, k: NumberKind) => r.names.prefixes[k] || DEFAULT_PREFIXES[k];

/** The discount this person gives alone: his own, else his job's, else everyone's. */
export function discountAlone(r: AdvancedRules, u: { id: number; role: Role }): number {
  return r.people[String(u.id)]?.discount_max ?? r.discount_by_role[u.role] ?? r.staff_discount_max;
}

/** The cash a rep may hold before the alert: his own, else everyone's. */
export const custodyCapOf = (r: AdvancedRules, repId: number) => r.people[String(repId)]?.custody_cap ?? r.custody_cap;

/** An expense recorded by this person waits for the manager above: his own, else his job's, else the settings'. */
export function expenseLimitOf(r: AdvancedRules, u: { id: number; role: Role }, base: number): number {
  return r.people[String(u.id)]?.expense_limit ?? r.expense_by_role[u.role] ?? base;
}

// ---- working time ----
const hm = (t: string) => {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
};
const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

/** A working day: one of the working days and not a holiday (always, while working time is off). */
export function isWorkDay(r: AdvancedRules, d: Date): boolean {
  if (!r.work.on) return true;
  return r.work.days.includes(d.getDay()) && !r.work.holidays.some((h) => h.date === ymd(d));
}

/** Inside working time now (always, while it is off). */
export function inWorkTime(r: AdvancedRules, d: Date): boolean {
  if (!r.work.on) return true;
  const m = d.getHours() * 60 + d.getMinutes();
  return isWorkDay(r, d) && m >= hm(r.work.from) && m < hm(r.work.to);
}

/** The next moment working time starts (or now, inside it). */
export function nextWorkStart(r: AdvancedRules, d: Date): Date {
  if (inWorkTime(r, d)) return d;
  const x = new Date(d);
  const [fh, fm] = r.work.from.split(":").map(Number);
  // Today, before opening.
  if (isWorkDay(r, x) && x.getHours() * 60 + x.getMinutes() < hm(r.work.from)) {
    x.setHours(fh, fm, 0, 0);
    return x;
  }
  for (let i = 1; i <= 60; i++) {
    const y = new Date(d);
    y.setDate(d.getDate() + i);
    if (isWorkDay(r, y)) {
      y.setHours(fh, fm, 0, 0);
      return y;
    }
  }
  return d;
}

/** The day an order sent now for this area is expected to arrive (null while the plan is off). */
export function expectedDelivery(r: AdvancedRules, area: string, d: Date): string | null {
  if (!r.delivery_plan.on) return null;
  const areaDays = r.delivery_plan.days_by_area[area];
  const ok = (x: Date) => isWorkDay(r, x) && (!areaDays?.length || areaDays.includes(x.getDay()));
  const beforeCut = !r.delivery_plan.cutoff || d.getHours() * 60 + d.getMinutes() < hm(r.delivery_plan.cutoff);
  for (let i = beforeCut ? 0 : 1; i <= 30; i++) {
    const y = new Date(d);
    y.setDate(d.getDate() + i);
    if (ok(y)) return ymd(y);
  }
  return null;
}

/** The clearance discount the site suggests for an item with this many days left. */
export const suggestedClearance = (r: AdvancedRules["clearance"], daysLeft: number) => (daysLeft <= r.near_days ? r.near_percent : daysLeft <= r.mid_days ? r.mid_percent : r.far_percent);

/** Round a total to the company's step: [rounded, what was added]. */
export function roundBy(step: number, raw: number): [number, number] {
  if (!(step > 0)) return [Math.round(raw), Math.round(raw) - raw];
  const total = Math.round(raw / step) * step;
  return [total, total - raw];
}

export const ROLES_ALL: Role[] = ["manager", "accountant", "warehouse", "staff", "rep", "shop"];

/** Who gets each kind of notification when the manager changed nothing (what the site always did). */
export const DEFAULT_NOTIFY: Partial<Record<NotificationType, Role[]>> = {
  needs_approval: ["manager"],
  order_review: ["accountant", "shop"],
  shop_order: ["manager", "rep"],
  order_accepted: ["warehouse", "shop", "rep"],
  order_rejected: ["shop", "rep"],
  order_confirmed: ["rep", "shop"],
  new_shop: ["manager", "rep"],
  account_approved: ["shop"],
  out_for_delivery: ["shop"],
  delivered: ["shop"],
  door_payment: ["rep"],
  delivery_locked: ["manager"],
  delivery_problem: ["manager", "warehouse"],
  support_message: ["staff", "manager"],
  support_reply: ["shop"],
  low_stock: ["manager", "warehouse"],
  near_expiry: ["manager", "warehouse"],
  expired: ["manager", "warehouse"],
  clearance: ["shop"],
  back_in_stock: ["shop"],
  reorder: ["shop", "rep"],
  price_change: ["shop"],
  supply_order: ["warehouse", "accountant"],
  expense: ["manager", "accountant"],
  custody: ["accountant", "manager", "rep"],
  commission_earned: ["rep"],
  refund: ["manager", "shop"],
  usd_rate: ["accountant", "rep"],
  day_summary: ["manager", "accountant"],
};

const between = (v: unknown, lo: number, hi: number) => typeof v === "number" && Number.isFinite(v) && v >= lo && v <= hi;
const whole = (v: unknown, lo: number, hi: number) => between(v, lo, hi) && Number.isInteger(v);

/** What is wrong with a set of rules: { field: message } (empty = fine). The same check on the server and the page. */
export function checkRules(r: AdvancedRules, tierIds: number[]): Record<string, string> {
  const e: Record<string, string> = {};
  const m = (k: string, ar: string) => (e[k] = ar);
  if (!between(r.discount_max, 0, 100)) m("discount_max", "من 0 إلى 100%");
  if (!between(r.staff_discount_max, 0, 100) || r.staff_discount_max > r.discount_max) m("staff_discount_max", "من 0 إلى أعلى خصم");
  if (!whole(r.offline_max_days, 0, 30)) m("offline_max_days", "من 0 إلى 30 يوماً");
  if (![0, 50, 100, 250, 500, 1000].includes(r.round_to)) m("round_to", "0 أو 50 أو 100 أو 250 أو 500 أو 1000");
  if (!whole(r.shop_edit_minutes, 0, 1440)) m("shop_edit_minutes", "من 0 إلى 1440 دقيقة");
  if (!whole(r.min_shop_order, 0, 1_000_000_000)) m("min_shop_order", "مبلغ صحيح بالدينار");
  if (!["approval", "block", "allow"].includes(r.over_limit)) m("over_limit", "اختر واحداً");
  if (r.signup_tier_id !== null && !tierIds.includes(r.signup_tier_id)) m("signup_tier_id", "نوع سعر غير موجود");
  if (!whole(r.signup_debt_limit, 0, 1_000_000_000)) m("signup_debt_limit", "مبلغ صحيح بالدينار");
  if (!whole(r.max_shops_per_account, 1, 50)) m("max_shops_per_account", "من 1 إلى 50");
  if (!whole(r.pin_tries, 1, 20)) m("pin_tries", "من 1 إلى 20");
  if (!whole(r.low_rating_stars, 0, 4)) m("low_rating_stars", "من 0 إلى 4");
  if (!Array.isArray(r.door_methods) || r.door_methods.some((x) => !["cash", "qi", "zaincash"].includes(x))) m("door_methods", "نقداً أو Qi أو زين كاش");
  if (!whole(r.custody_cap, 0, 1_000_000_000)) m("custody_cap", "مبلغ صحيح بالدينار");
  if (!whole(r.visit_near_m, 20, 5000)) m("visit_near_m", "من 20 إلى 5000 متر");
  if (!Array.isArray(r.reverse_roles) || !r.reverse_roles.includes("manager") || r.reverse_roles.some((x) => x !== "manager" && x !== "accountant")) m("reverse_roles", "المدير دائماً، والمحاسب اختياري");
  if (!whole(r.reverse_days, 0, 3650)) m("reverse_days", "من 0 إلى 3650 يوماً");
  const c = r.clearance;
  if (!whole(c.near_days, 1, 365) || !whole(c.mid_days, 1, 365) || c.near_days >= c.mid_days) m("clearance.days", "الأقرب أقل من الأبعد");
  if (![c.near_percent, c.mid_percent, c.far_percent].every((p) => whole(p, 1, 90))) m("clearance.percent", "النسب من 1 إلى 90%");
  if (!whole(r.reorder_early_days, 0, 14)) m("reorder_early_days", "من 0 إلى 14 يوماً");
  const o = r.otp;
  if (!whole(o.code_minutes, 1, 30)) m("otp.code_minutes", "من 1 إلى 30 دقيقة");
  if (!whole(o.resend_seconds, 10, 600)) m("otp.resend_seconds", "من 10 إلى 600 ثانية");
  if (!whole(o.per_hour, 1, 20)) m("otp.per_hour", "من 1 إلى 20");
  if (!whole(o.tries, 1, 10)) m("otp.tries", "من 1 إلى 10");
  if (!whole(r.login_lock_after, 0, 20)) m("login_lock_after", "من 0 إلى 20");
  if (!whole(r.login_lock_minutes, 1, 1440)) m("login_lock_minutes", "من 1 إلى 1440 دقيقة");
  if (!whole(r.password_min, 4, 32)) m("password_min", "من 4 إلى 32");
  for (const [type, roles] of Object.entries(r.notify_matrix)) {
    if (!Array.isArray(roles) || roles.some((x) => !ROLES_ALL.includes(x))) m(`notify_matrix.${type}`, "وظائف غير صحيحة");
  }
  const a = r.announcement;
  if (a) {
    if (!a.text?.trim() || a.text.length > 300) m("announcement.text", "اكتب الإعلان (حتى 300 حرف)");
    if (a.until && Number.isNaN(Date.parse(a.until))) m("announcement.until", "تاريخ غير صحيح");
  }
  if (r.maintenance.on && !r.maintenance.message.trim()) m("maintenance.message", "اكتب رسالة لأصحاب المحلات");
  // Who may do what
  const keys = ACTIONS.map((x) => x.key) as string[];
  for (const [k, roles] of Object.entries(r.permissions)) {
    if (!keys.includes(k) || !Array.isArray(roles) || roles.some((x) => !STAFF_ROLES.includes(x))) m(`permissions.${k}`, "وظائف غير صحيحة");
  }
  for (const [id, p] of Object.entries(r.people)) {
    if (p.discount_max !== undefined && !between(p.discount_max, 0, r.discount_max)) m(`people.${id}.discount_max`, "من 0 إلى أعلى خصم");
    if (p.custody_cap !== undefined && !whole(p.custody_cap, 0, 1_000_000_000)) m(`people.${id}.custody_cap`, "مبلغ صحيح بالدينار");
    if (p.expense_limit !== undefined && !whole(p.expense_limit, 0, 1_000_000_000)) m(`people.${id}.expense_limit`, "مبلغ صحيح بالدينار");
    if ([...(p.allow ?? []), ...(p.deny ?? [])].some((k) => !keys.includes(k))) m(`people.${id}.actions`, "إجراء غير معروف");
  }
  for (const [role, v] of Object.entries(r.discount_by_role)) if (!between(v, 0, r.discount_max)) m(`discount_by_role.${role}`, "من 0 إلى أعلى خصم");
  for (const [role, v] of Object.entries(r.expense_by_role)) if (!whole(v, 0, 1_000_000_000)) m(`expense_by_role.${role}`, "مبلغ صحيح بالدينار");
  // Working time and delivery dates
  const time = (t: string) => /^([01]\d|2[0-3]):[0-5]\d$/.test(t);
  const w = r.work;
  if (!Array.isArray(w.days) || w.days.some((x) => !whole(x, 0, 6))) m("work.days", "أيام غير صحيحة");
  else if (w.on && !w.days.length) m("work.days", "اختر يوم عمل واحداً على الأقل");
  if (!time(w.from) || !time(w.to) || hm(w.from) >= hm(w.to)) m("work.hours", "البداية قبل النهاية (00:00 – 23:59)");
  if (!Array.isArray(w.holidays) || w.holidays.some((h) => !/^\d{4}-\d{2}-\d{2}$/.test(h.date) || !h.name?.trim())) m("work.holidays", "كل عطلة بتاريخ واسم");
  const dp = r.delivery_plan;
  if (dp.cutoff && !time(dp.cutoff)) m("delivery_plan.cutoff", "وقت بصيغة 14:00");
  for (const [area, days] of Object.entries(dp.days_by_area)) if (!Array.isArray(days) || days.some((x) => !whole(x, 0, 6))) m(`delivery_plan.days_by_area.${area}`, "أيام غير صحيحة");
  // Warehouses, numbers and names
  for (const [id, x] of Object.entries(r.warehouses)) if (x.reservation_hours !== undefined && !whole(x.reservation_hours, 1, 72)) m(`warehouses.${id}.reservation_hours`, "من 1 إلى 72 ساعة");
  const pre = Object.entries(r.names.prefixes);
  for (const [k, v] of pre) if (!/^[A-Z]{1,6}$/.test(v ?? "")) m(`names.prefixes.${k}`, "من 1 إلى 6 أحرف إنجليزية كبيرة");
  const all = (Object.keys(DEFAULT_PREFIXES) as NumberKind[]).map((k) => prefixOf(r, k));
  if (new Set(all).size !== all.length) m("names.prefixes", "لكل نوع بادئة مختلفة");
  if (!r.names.currency_ar.trim() || r.names.currency_ar.length > 10 || !r.names.currency_en.trim() || r.names.currency_en.length > 10) m("names.currency", "اسم العملة (حتى 10 أحرف)");
  if (r.names.invoice_footer.length > 200) m("names.invoice_footer", "حتى 200 حرف");
  return e;
}

/** Only what differs from the defaults (what is saved). */
export function changedRules(r: AdvancedRules): Partial<AdvancedRules> {
  const out: Record<string, unknown> = {};
  for (const k of Object.keys(DEFAULT_RULES) as (keyof AdvancedRules)[]) {
    if (JSON.stringify(r[k]) !== JSON.stringify(DEFAULT_RULES[k])) out[k] = r[k];
  }
  return out as Partial<AdvancedRules>;
}

/** The public part (no login needed: the login, sign-up and shop pages). */
export interface PublicRules {
  self_signup: boolean;
  /** Which features are on (nothing secret: the pages hide what is off, even before the lookups load). */
  features: AdvancedRules["features"];
  maintenance: AdvancedRules["maintenance"];
  announcement: Announcement | null;
  password_min: number;
  /** The currency's name and the invoice's line (every page that shows money or prints). */
  names: Pick<AdvancedRules["names"], "currency_ar" | "currency_en" | "invoice_footer">;
  /** Who opens the users page besides the manager (the right «إضافة المستخدمين وإيقافهم»): the menu needs it. */
  users_page: { roles: Role[]; allow: number[]; deny: number[] };
}
export const publicRules = (r: AdvancedRules): PublicRules => ({
  self_signup: r.features.self_signup,
  features: r.features,
  maintenance: r.maintenance,
  announcement: r.announcement,
  password_min: r.password_min,
  names: { currency_ar: r.names.currency_ar, currency_en: r.names.currency_en, invoice_footer: r.names.invoice_footer },
  users_page: {
    roles: rolesFor(r.permissions, "manage_users"),
    allow: Object.entries(r.people).filter(([, p]) => p.allow?.includes("manage_users")).map(([id]) => Number(id)),
    deny: Object.entries(r.people).filter(([, p]) => p.deny?.includes("manage_users")).map(([id]) => Number(id)),
  },
});

/** Pages a person opens beyond his job (granted by a right): today the users page. */
export function grantsOf(live: PublicRules | undefined, u: { id: number; role: Role } | null | undefined): string[] {
  if (!live?.users_page || !u || u.role === "manager" || u.role === "shop") return [];
  const g = live.users_page;
  const may = !g.deny.includes(u.id) && (g.allow.includes(u.id) || g.roles.includes(u.role));
  return may ? ["/users"] : [];
}
