// Which pages each role sees in the menu, and which pages each role may open.
import {
  ArrowLeftRight,
  BarChart3,
  Boxes,
  ClipboardCheck,
  ClipboardList,
  FileText,
  History,
  Home,
  LayoutDashboard,
  Package,
  PackagePlus,
  Percent,
  ReceiptText,
  Settings,
  ShoppingCart,
  Store,
  Undo2,
  Users,
  UserCog,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import type { Role } from "@/lib/api/types";

export interface NavItem {
  href: string;
  ar: string;
  en: string;
  icon: LucideIcon;
  roles: Role[];
  group: "main" | "sales" | "money" | "stock" | "admin";
  /** Shown in the bottom bar on phones. */
  mobile?: Role[];
}

export const NAV: NavItem[] = [
  { href: "/dashboard", ar: "لوحة التحكم", en: "Dashboard", icon: LayoutDashboard, roles: ["manager", "accountant"], group: "main", mobile: ["manager", "accountant"] },
  { href: "/rep", ar: "الرئيسية", en: "Home", icon: Home, roles: ["rep"], group: "main", mobile: ["rep"] },
  { href: "/shop", ar: "اطلب الآن", en: "Order now", icon: Store, roles: ["shop"], group: "main", mobile: ["shop"] },
  { href: "/orders/new", ar: "طلب جديد", en: "New order", icon: ShoppingCart, roles: ["rep", "manager"], group: "sales", mobile: ["rep"] },
  { href: "/orders", ar: "الطلبات", en: "Orders", icon: ClipboardList, roles: ["manager", "warehouse", "rep", "accountant", "shop"], group: "sales", mobile: ["manager", "warehouse", "accountant", "shop"] },
  { href: "/invoices", ar: "الفواتير", en: "Invoices", icon: ReceiptText, roles: ["manager", "accountant", "rep", "shop"], group: "sales" },
  { href: "/returns", ar: "المرتجعات", en: "Returns", icon: Undo2, roles: ["manager", "accountant", "rep", "warehouse"], group: "sales" },
  { href: "/customers", ar: "الزبائن والديون", en: "Customers", icon: Users, roles: ["manager", "accountant", "rep"], group: "money", mobile: ["rep", "accountant"] },
  { href: "/statement", ar: "كشف حسابي", en: "My statement", icon: FileText, roles: ["shop"], group: "money", mobile: ["shop"] },
  { href: "/payments", ar: "التسديدات", en: "Payments", icon: Wallet, roles: ["manager", "accountant", "rep"], group: "money", mobile: ["rep", "manager", "accountant"] },
  { href: "/commissions", ar: "العمولات", en: "Commission", icon: Percent, roles: ["manager", "accountant", "rep"], group: "money" },
  { href: "/stock", ar: "المخزون", en: "Stock", icon: Boxes, roles: ["manager", "warehouse", "accountant"], group: "stock", mobile: ["warehouse"] },
  { href: "/items", ar: "المواد والأسعار", en: "Items & prices", icon: Package, roles: ["manager", "warehouse", "accountant", "rep"], group: "stock" },
  { href: "/receipts", ar: "استلام البضاعة", en: "Receiving", icon: PackagePlus, roles: ["manager", "warehouse"], group: "stock", mobile: ["warehouse"] },
  { href: "/transfers", ar: "التحويل بين المخازن", en: "Transfers", icon: ArrowLeftRight, roles: ["manager", "warehouse"], group: "stock" },
  { href: "/stocktakes", ar: "الجرد", en: "Stock count", icon: ClipboardCheck, roles: ["manager", "warehouse"], group: "stock" },
  { href: "/reports", ar: "التقارير", en: "Reports", icon: BarChart3, roles: ["manager", "accountant", "warehouse"], group: "admin" },
  { href: "/audit", ar: "سجل التعديلات", en: "Activity log", icon: History, roles: ["manager"], group: "admin" },
  { href: "/users", ar: "المستخدمون", en: "Users", icon: UserCog, roles: ["manager"], group: "admin" },
  { href: "/settings", ar: "الإعدادات", en: "Settings", icon: Settings, roles: ["manager"], group: "admin" },
];

export const GROUPS: Record<NavItem["group"], [string, string]> = {
  main: ["", ""],
  sales: ["البيع", "Sales"],
  money: ["الفلوس", "Money"],
  stock: ["المخزون", "Stock"],
  admin: ["الإدارة", "Admin"],
};

// Pages that are not in the menu but need a role check (detail pages follow their list page).
const EXTRA: { prefix: string; roles: Role[] }[] = [
  { prefix: "/payments/", roles: ["manager", "accountant", "rep"] },
  { prefix: "/notifications", roles: ["manager", "warehouse", "rep", "accountant", "shop"] },
  { prefix: "/account", roles: ["manager", "warehouse", "rep", "accountant", "shop"] },
  { prefix: "/invoices/", roles: ["manager", "accountant", "rep", "shop", "warehouse"] },
  { prefix: "/returns/", roles: ["manager", "accountant", "rep", "warehouse", "shop"] },
];

/** Can this role open this path? The most specific rule wins. */
export function canOpen(role: Role, path: string) {
  const rules = [...EXTRA.map((e) => ({ prefix: e.prefix, roles: e.roles })), ...NAV.map((n) => ({ prefix: n.href, roles: n.roles }))]
    .filter((r) => path === r.prefix || path.startsWith(r.prefix.endsWith("/") ? r.prefix : r.prefix + "/"))
    .sort((a, b) => b.prefix.length - a.prefix.length);
  if (!rules.length) return true;
  return rules[0].roles.includes(role);
}
