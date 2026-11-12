// Which pages each role sees in the menu, and which pages each role may open.
import {
  ArrowLeftRight,
  BarChart3,
  Boxes,
  ClipboardCheck,
  ClipboardList,
  Contact,
  FileText,
  History,
  Home,
  LayoutDashboard,
  ListChecks,
  Headset,
  LayoutGrid,
  PackageCheck,
  Map as MapIcon,
  Warehouse,
  Package,
  PackagePlus,
  Truck,
  Percent,
  ReceiptText,
  Settings,
  ShoppingCart,
  Store,
  Undo2,
  Users,
  UserCog,
  Wallet,
  HandCoins,
  Banknote,
  type LucideIcon,
} from "lucide-react";
import { ordered } from "@/lib/api/site-defaults";
import { repDoes, type RepKind, type Role, type SiteCustom } from "@/lib/api/types";

export interface NavItem {
  href: string;
  ar: string;
  en: string;
  icon: LucideIcon;
  roles: Role[];
  group: "main" | "sales" | "money" | "stock" | "admin";
  /** Shown in the bottom bar on phones. */
  mobile?: Role[];
  /** For reps: only the reps who do this (marketing or delivery). Other roles aren't affected. */
  kind?: RepKind;
}

export const NAV: NavItem[] = [
  { href: "/staff", ar: "الرئيسية", en: "Home", icon: LayoutGrid, roles: ["staff"], group: "main", mobile: ["staff"] },
  { href: "/support", ar: "الدعم", en: "Support", icon: Headset, roles: ["staff", "manager"], group: "main", mobile: ["staff"] },
  { href: "/decisions", ar: "قراراتي اليوم", en: "My decisions", icon: ListChecks, roles: ["manager"], group: "main", mobile: ["manager"] },
  { href: "/dashboard", ar: "لوحة التحكم", en: "Dashboard", icon: LayoutDashboard, roles: ["manager", "accountant"], group: "main" },
  { href: "/accounts", ar: "ملف الحساب", en: "Account file", icon: Contact, roles: ["accountant"], group: "main", mobile: ["accountant"] },
  { href: "/hall", ar: "قاعة التجهيز", en: "Picking hall", icon: Warehouse, roles: ["warehouse"], group: "main", mobile: ["warehouse"] },
  { href: "/map", ar: "خريطة المخازن", en: "Warehouse map", icon: MapIcon, roles: ["manager", "warehouse", "accountant", "staff"], group: "main" },
  { href: "/rep", ar: "الرئيسية", en: "Home", icon: Home, roles: ["rep"], group: "main", mobile: ["rep"], kind: "sales" },
  { href: "/shop", ar: "اطلب الآن", en: "Order now", icon: Store, roles: ["shop"], group: "main", mobile: ["shop"] },
  { href: "/orders/new", ar: "طلب جديد", en: "New order", icon: ShoppingCart, roles: ["rep", "manager"], group: "sales", mobile: ["rep"], kind: "sales" },
  {
    href: "/orders",
    ar: "الطلبات",
    en: "Orders",
    icon: ClipboardList,
    roles: ["manager", "warehouse", "rep", "accountant", "shop", "staff"],
    group: "sales",
    mobile: ["manager", "warehouse", "accountant", "shop", "staff"],
  },
  // The keeper sells to someone who came to the warehouse and pays on the spot.
  { href: "/counter", ar: "بيع مباشر", en: "Counter sale", icon: HandCoins, roles: ["warehouse"], group: "sales" },
  { href: "/invoices", ar: "الفواتير", en: "Invoices", icon: ReceiptText, roles: ["manager", "accountant", "rep", "shop"], group: "sales", mobile: ["shop"] },
  { href: "/returns", ar: "المرتجعات", en: "Returns", icon: Undo2, roles: ["manager", "accountant", "rep", "warehouse"], group: "sales" },
  {
    href: "/deliveries",
    ar: "التوصيل",
    en: "Deliveries",
    icon: PackageCheck,
    roles: ["rep", "manager", "warehouse", "accountant", "staff"],
    group: "sales",
    mobile: ["rep", "staff"],
    kind: "delivery",
  },
  { href: "/customers", ar: "الزبائن والديون", en: "Customers", icon: Users, roles: ["manager", "accountant", "rep"], group: "money", mobile: ["accountant"], kind: "sales" },
  { href: "/statement", ar: "كشف حسابي", en: "My statement", icon: FileText, roles: ["shop"], group: "money", mobile: ["shop"] },
  { href: "/payments", ar: "التسديدات", en: "Payments", icon: Wallet, roles: ["manager", "accountant", "rep"], group: "money", mobile: ["rep", "manager", "accountant"] },
  { href: "/expenses", ar: "الصرفيات", en: "Expenses", icon: Banknote, roles: ["accountant", "manager"], group: "money", mobile: ["accountant"] },
  { href: "/commissions", ar: "العمولات", en: "Commission", icon: Percent, roles: ["manager", "accountant", "rep"], group: "money", kind: "sales" },
  { href: "/stock", ar: "المخزون", en: "Stock", icon: Boxes, roles: ["manager", "warehouse", "accountant", "staff"], group: "stock", mobile: ["warehouse"] },
  { href: "/items", ar: "المواد والأسعار", en: "Items & prices", icon: Package, roles: ["manager", "warehouse", "accountant", "rep", "staff"], group: "stock" },
  { href: "/supply", ar: "طلبات التوريد", en: "Supply orders", icon: Truck, roles: ["manager", "accountant", "warehouse", "staff"], group: "stock" },
  { href: "/receipts", ar: "استلام البضاعة", en: "Receiving", icon: PackagePlus, roles: ["manager", "warehouse"], group: "stock", mobile: ["warehouse"] },
  { href: "/transfers", ar: "التحويل بين المخازن", en: "Transfers", icon: ArrowLeftRight, roles: ["manager", "warehouse"], group: "stock" },
  { href: "/stocktakes", ar: "الجرد", en: "Stock count", icon: ClipboardCheck, roles: ["manager", "warehouse"], group: "stock" },
  { href: "/reports", ar: "التقارير", en: "Reports", icon: BarChart3, roles: ["manager", "accountant", "warehouse"], group: "admin" },
  { href: "/audit", ar: "سجل التعديلات", en: "Activity log", icon: History, roles: ["manager"], group: "admin" },
  { href: "/users", ar: "المستخدمون", en: "Users", icon: UserCog, roles: ["manager"], group: "admin" },
  { href: "/settings", ar: "الإعدادات", en: "Settings", icon: Settings, roles: ["manager"], group: "admin" },
];

/**
 * The jobs that work from a phone (the shop owner, the reps) get the phone frame: no side menu, a big tab bar
 * at the bottom on every screen size, and their own app (landing page and icon) at /client or /driver.
 */
export const isPhoneApp = (role: Role) => role === "shop" || role === "rep";

/** The phone app of a job: its landing page (opened from the main site in a new tab). */
export const phoneAppOf = (role: Role) => (role === "shop" ? "/client" : role === "rep" ? "/driver" : null);

export const GROUPS: Record<NavItem["group"], [string, string]> = {
  main: ["", ""],
  sales: ["البيع", "Sales"],
  money: ["الأموال", "Money"],
  stock: ["المخزون", "Stock"],
  admin: ["الإدارة", "Admin"],
};

export type NavShown = NavItem & { hidden?: boolean };

/**
 * The menu after the manager's customization (customize mode).
 * New names are for everyone. The order, the groups and the hidden pages are the manager's own menu
 * (`own`), so he can't take a page away from another job by mistake.
 */
export function customNav(list: NavItem[], nav: SiteCustom["nav"], own: boolean): NavShown[] {
  const named = list.map((n) => ({ ...n, ar: nav.labels[n.href]?.ar || n.ar, en: nav.labels[n.href]?.en || n.en }));
  if (!own) return named;
  const moved = named.map((n) => ({ ...n, group: (nav.groups[n.href] in GROUPS ? nav.groups[n.href] : n.group) as NavItem["group"], hidden: nav.hidden.includes(n.href) }));
  return ordered(moved, nav.order, (n) => n.href);
}

/** A page's title follows the page's new name in the menu (when the title is the menu's name). */
export function pageTitle(title: string, path: string, labels: SiteCustom["nav"]["labels"], lang: "ar" | "en") {
  const n = NAV.find((x) => x.href === path && (x.ar === title || x.en === title));
  return (n && labels[n.href]?.[lang]) || title;
}

// Pages that are not in the menu but need a role check (detail pages follow their list page).
const EXTRA: { prefix: string; roles: Role[] }[] = [
  { prefix: "/payments/", roles: ["manager", "accountant", "rep"] },
  // An item's own page shows its batches, which reps and shops don't get (the items list has no link for them either).
  { prefix: "/items/", roles: ["manager", "warehouse", "accountant", "staff"] },
  { prefix: "/notifications", roles: ["manager", "warehouse", "rep", "accountant", "shop"] },
  { prefix: "/invoices/", roles: ["manager", "accountant", "rep", "shop", "warehouse"] },
  { prefix: "/returns/", roles: ["manager", "accountant", "rep", "warehouse", "shop"] },
];

/** Is this menu item for this user? (role, and for reps: marketing / delivery) */
export function navFor(n: Pick<NavItem, "roles" | "kind">, user: { role: Role; rep_kinds?: RepKind[] }) {
  if (!n.roles.includes(user.role)) return false;
  return !(n.kind && user.role === "rep") || repDoes(user, n.kind);
}

/**
 * Can this user open this path? The most specific rule wins. `denied`: the pages their permission profile
 * takes away (advanced settings); a page's own screens go with it (/orders → /orders/12).
 */
export function canOpen(role: Role, path: string, kinds?: RepKind[], denied: string[] = []) {
  const rules = [...EXTRA.map((e) => ({ prefix: e.prefix, roles: e.roles, kind: undefined })), ...NAV.map((n) => ({ prefix: n.href, roles: n.roles, kind: n.kind }))]
    .filter((r) => path === r.prefix || path.startsWith(r.prefix.endsWith("/") ? r.prefix : r.prefix + "/"))
    .sort((a, b) => b.prefix.length - a.prefix.length);
  if (!rules.length) return true;
  if (denied.includes(rules[0].prefix.replace(/\/$/, ""))) return false;
  return navFor(rules[0], { role, rep_kinds: kinds });
}
