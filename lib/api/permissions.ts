// «من يحق له ماذا»: the actions the manager gives to any job (and to or from one person), in the advanced
// settings. Each action has the jobs that did it before (its default), and the page it is done from (a job that
// can't open that page has nothing to press, so the table doesn't offer it). The manager always may.
// These are the backend's rules (docs/backend.md → «من يحق له ماذا»).
import type { Role } from "./types";

export type ActionKey =
  | "record_payment"
  | "reverse_payment"
  | "refund"
  | "credit_note"
  | "approve_expense"
  | "set_usd_rate"
  | "close_month"
  | "approve_order"
  | "cancel_order"
  | "give_discount"
  | "approve_over_limit"
  | "unlock_delivery"
  | "take_back_shipment"
  | "edit_items"
  | "start_clearance"
  | "hold_batch"
  | "close_stocktake"
  | "review_transfer"
  | "receive_goods"
  | "approve_shop"
  | "edit_customers"
  | "manage_users"
  | "see_costs"
  | "see_debts";

export type ActionGroup = "money" | "orders" | "stock" | "people";

export interface ActionDef {
  key: ActionKey;
  group: ActionGroup;
  ar: string;
  en: string;
  /** The page it is done from (null = no page of its own: it changes what the person sees). */
  page: string | null;
  /** The jobs that did it before the manager changed anything. */
  def: Role[];
}

export const ACTIONS: ActionDef[] = [
  { key: "record_payment", group: "money", ar: "تسجيل تسديد", en: "Record a payment", page: "/payments", def: ["manager", "accountant", "rep"] },
  { key: "reverse_payment", group: "money", ar: "عكس تسديد", en: "Reverse a payment", page: "/payments", def: ["manager", "accountant"] },
  { key: "refund", group: "money", ar: "ردّ مبلغ لمحل", en: "Refund a shop", page: "/customers", def: ["manager", "accountant"] },
  { key: "credit_note", group: "money", ar: "إشعار دائن على فاتورة", en: "Credit note", page: "/invoices", def: ["manager", "accountant"] },
  { key: "approve_expense", group: "money", ar: "الموافقة على صرفية", en: "Approve an expense", page: "/expenses", def: ["manager"] },
  { key: "set_usd_rate", group: "money", ar: "تحديد سعر الدولار", en: "Set the dollar rate", page: null, def: ["manager", "accountant"] },
  { key: "close_month", group: "money", ar: "إغلاق شهر العمولات", en: "Close a commission month", page: "/commissions", def: ["manager"] },
  { key: "approve_order", group: "orders", ar: "اعتماد طلب", en: "Approve an order", page: "/orders", def: ["manager", "accountant"] },
  { key: "cancel_order", group: "orders", ar: "إلغاء طلب", en: "Cancel an order", page: "/orders", def: ["manager", "accountant"] },
  { key: "give_discount", group: "orders", ar: "إعطاء خصم", en: "Give a discount", page: "/orders", def: ["manager", "accountant", "rep"] },
  { key: "approve_over_limit", group: "orders", ar: "الموافقة على تجاوز السقف والخصم الكبير", en: "OK over the limit / a big discount", page: "/orders", def: ["manager"] },
  { key: "unlock_delivery", group: "orders", ar: "فتح شحنة مقفلة", en: "Unlock a locked shipment", page: "/orders", def: ["manager"] },
  { key: "take_back_shipment", group: "orders", ar: "إرجاع شحنة إلى المخزن", en: "Take a shipment back", page: "/deliveries", def: ["manager", "warehouse"] },
  { key: "edit_items", group: "stock", ar: "تعديل المواد والأسعار", en: "Edit items and prices", page: "/items", def: ["manager"] },
  { key: "start_clearance", group: "stock", ar: "بدء عرض تصفية", en: "Start a clearance", page: "/stock", def: ["manager"] },
  { key: "hold_batch", group: "stock", ar: "إيقاف دفعة وإطلاقها", en: "Hold / release a batch", page: "/items", def: ["manager", "warehouse"] },
  { key: "close_stocktake", group: "stock", ar: "إغلاق الجرد واعتماد فروقه", en: "Close a stock count", page: "/stocktakes", def: ["manager"] },
  { key: "review_transfer", group: "stock", ar: "مراجعة تحويل وصل ناقصاً", en: "Review a short transfer", page: "/transfers", def: ["manager"] },
  { key: "receive_goods", group: "stock", ar: "استلام بضاعة", en: "Receive goods", page: "/receipts", def: ["manager", "warehouse"] },
  { key: "approve_shop", group: "people", ar: "الموافقة على محل جديد أو رفضه", en: "Approve / refuse a new shop", page: "/customers", def: ["manager"] },
  { key: "edit_customers", group: "people", ar: "تعديل الزبائن وسقف الدين", en: "Edit customers and debt limits", page: "/customers", def: ["manager"] },
  { key: "manage_users", group: "people", ar: "إضافة المستخدمين وإيقافهم", en: "Add and stop users", page: "/users", def: ["manager"] },
  { key: "see_costs", group: "people", ar: "رؤية الكلفة والربح", en: "See costs and profit", page: null, def: ["manager", "accountant"] },
  { key: "see_debts", group: "people", ar: "رؤية الديون", en: "See debts", page: null, def: ["manager", "accountant", "rep"] },
];

export const ACTION = Object.fromEntries(ACTIONS.map((a) => [a.key, a])) as Record<ActionKey, ActionDef>;

/** The jobs the table offers (the shop owner does none of these). */
export const STAFF_ROLES: Role[] = ["manager", "accountant", "warehouse", "staff", "rep"];

/** One person's own rules (advanced settings → exceptions per person). */
export interface PersonRule {
  /** His own discount he gives alone (%), instead of his job's. */
  discount_max?: number;
  /** His own cash limit (a rep), instead of everyone's. */
  custody_cap?: number;
  /** His own expense limit (above it waits for the manager), instead of his job's. */
  expense_limit?: number;
  /** Actions he may do although his job may not, and actions taken from him although his job may. */
  allow?: ActionKey[];
  deny?: ActionKey[];
}

/** The jobs that may do an action now (the manager's table, else the default; the manager always). */
export function rolesFor(perms: Partial<Record<ActionKey, Role[]>> | undefined, key: ActionKey): Role[] {
  const r = perms?.[key] ?? ACTION[key].def;
  return r.includes("manager") ? r : ["manager", ...r];
}

/** May this person do it: his own exception first, then his job. */
export function userMay(rules: { permissions?: Partial<Record<ActionKey, Role[]>>; people?: Record<string, PersonRule> }, u: { id: number; role: Role }, key: ActionKey): boolean {
  if (u.role === "manager") return true;
  const p = rules.people?.[String(u.id)];
  if (p?.deny?.includes(key)) return false;
  if (p?.allow?.includes(key)) return true;
  return rolesFor(rules.permissions, key).includes(u.role);
}
