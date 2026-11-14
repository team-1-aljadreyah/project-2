// «الإعدادات المتقدمة» — the company's rules the manager can change (settings.advanced). Every value has its default
// here (what the site did before it could be changed), its limits, and is read the same way by the server (the
// rules) and by the pages (what they show and allow). Only what the manager changed is saved; the rest follows
// these defaults. These are the backend's rules (docs/backend.md → «الإعدادات المتقدمة»).
import type { DoorPayMethod, NotificationType, Role, Settings } from "./types";

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
  };
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
}
export const publicRules = (r: AdvancedRules): PublicRules => ({ self_signup: r.features.self_signup, features: r.features, maintenance: r.maintenance, announcement: r.announcement, password_min: r.password_min });
