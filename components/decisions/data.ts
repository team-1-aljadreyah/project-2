// "My decisions today": everything that waits for the manager, gathered from the real data and sorted
// into four stacks (أ ب ج د), like the four cards on the desk in the design.
import type { Customer, DebtRow, Item, NearExpiryRow, Order, Stocktake } from "@/lib/api/types";

export type Lane = "a" | "b" | "c" | "d";

export type Kind = "over_limit" | "new_shop" | "expired" | "near_expiry" | "low_stock" | "late_debt" | "close_month" | "stocktake" | "waiting_orders";

export interface Decision {
  /** Stable id (the same tomorrow), used for "remind me tomorrow". */
  id: string;
  lane: Lane;
  kind: Kind;
  /** The order / shop / item / stocktake the card is about. */
  ref: number;
  title: string;
  sub: string;
  /** Money at stake, shown big on the card (IQD). */
  amount?: number;
  /** Bigger = more urgent (cards are sorted by it inside a stack). */
  weight: number;
  href?: string;
  phone?: string;
}

type Tr = (ar: string, en: string) => string;
const DAY = 86_400_000;

export function buildDecisions({
  orders,
  customers,
  items,
  expiring,
  debts,
  stocktakes,
  closedMonths,
  nearDays,
  now,
  tr,
  money,
  ago,
  monthName,
}: {
  orders: Order[];
  customers: Customer[];
  items: Item[];
  expiring: NearExpiryRow[];
  debts: DebtRow[];
  stocktakes: Stocktake[];
  closedMonths: string[];
  nearDays: number;
  now: number;
  tr: Tr;
  money: (n: number) => string;
  ago: (iso: string) => string;
  monthName: (m: string) => string;
}): Decision[] {
  const out: Decision[] = [];
  const cust = new Map(customers.map((c) => [c.id, c]));
  const item = new Map(items.map((i) => [i.id, i]));

  // ---- أ: approvals ----
  for (const o of orders.filter((x) => x.status === "needs_approval")) {
    const c = cust.get(o.customer_id);
    out.push({
      id: `order-${o.id}`,
      lane: "a",
      kind: "over_limit",
      ref: o.id,
      title: tr(`طلب يتجاوز السقف: ${c?.name ?? ""}`, `Over the limit: ${c?.name ?? ""}`),
      sub: tr(`${o.number} · الدين ${money(c?.balance ?? 0)} من سقف ${money(c?.debt_limit ?? 0)}`, `${o.number} · debt ${money(c?.balance ?? 0)} of ${money(c?.debt_limit ?? 0)}`),
      amount: o.total,
      weight: 100,
      href: `/orders/${o.id}`,
    });
  }
  for (const c of customers.filter((x) => x.pending)) {
    out.push({
      id: `shop-${c.id}`,
      lane: "a",
      kind: "new_shop",
      ref: c.id,
      title: tr(`محل جديد: ${c.name}`, `New shop: ${c.name}`),
      sub: tr(`${c.owner_name} · ${c.area}`, `${c.owner_name} · ${c.area}`),
      weight: 90,
      href: `/customers/${c.id}`,
      phone: c.phone,
    });
  }

  // ---- ب: stock ----
  // One card per item (not per batch): the expired pieces, or the soonest expiry, and the money at risk.
  const byItem = new Map<number, NearExpiryRow[]>();
  for (const r of expiring) byItem.set(r.batch.item_id, [...(byItem.get(r.batch.item_id) ?? []), r]);
  for (const [itemId, rows] of byItem) {
    const it = item.get(itemId);
    if (!it) continue;
    const expired = rows.filter((r) => r.days_left < 0 || r.batch.status === "expired");
    const soon = rows.filter((r) => !expired.includes(r) && r.days_left <= nearDays);
    const value = (list: NearExpiryRow[]) => list.reduce((s, r) => s + r.batch.qty_left * (r.batch.purchase_price ?? 0), 0);
    if (expired.length) {
      const pcs = expired.reduce((s, r) => s + r.batch.qty_left, 0);
      out.push({
        id: `expired-${itemId}`,
        lane: "b",
        kind: "expired",
        ref: itemId,
        title: tr(`منتهية الصلاحية: ${it.name}`, `Expired: ${it.name_en}`),
        sub: tr(`${pcs} قطعة على الرف لا تُباع`, `${pcs} pieces on the shelf, not for sale`),
        amount: value(expired),
        weight: 80,
        href: `/items/${itemId}`,
      });
    } else if (soon.length) {
      const days = Math.min(...soon.map((r) => r.days_left));
      const pcs = soon.reduce((s, r) => s + r.batch.qty_left, 0);
      out.push({
        id: `near-${itemId}`,
        lane: "b",
        kind: "near_expiry",
        ref: itemId,
        title: tr(`تنتهي قريباً: ${it.name}`, `Expiring soon: ${it.name_en}`),
        sub: tr(`${pcs} قطعة تنتهي بعد ${days} يوم`, `${pcs} pieces expire in ${days} days`),
        amount: value(soon),
        weight: 70 - days / 10,
        href: `/items/${itemId}`,
      });
    }
  }
  for (const it of items.filter((i) => i.active && i.stock.total < i.min_stock)) {
    out.push({
      id: `low-${it.id}`,
      lane: "b",
      kind: "low_stock",
      ref: it.id,
      title: tr(`مخزون قليل: ${it.name}`, `Low stock: ${it.name_en}`),
      sub: tr(`باقي ${it.stock.total} قطعة، والحد الأدنى ${it.min_stock}`, `${it.stock.total} pieces left, minimum ${it.min_stock}`),
      weight: 60 + (1 - it.stock.total / Math.max(1, it.min_stock)) * 10,
      href: "/receipts/new",
    });
  }

  // ---- ج: money ----
  for (const d of debts) {
    if (!d.oldest_open || !(d.customer.balance ?? 0)) continue;
    const days = Math.floor((now - new Date(d.oldest_open).getTime()) / DAY);
    if (days < 30) continue;
    out.push({
      id: `debt-${d.customer.id}`,
      lane: "c",
      kind: "late_debt",
      ref: d.customer.id,
      title: tr(`دين متأخر: ${d.customer.name}`, `Late debt: ${d.customer.name}`),
      sub: tr(`أقدم فاتورة مفتوحة قبل ${days} يوم · ${d.open_invoices} فواتير`, `Oldest open invoice ${days} days ago · ${d.open_invoices} invoices`),
      amount: d.customer.balance,
      weight: 50 + days / 10,
      href: `/customers/${d.customer.id}`,
      phone: d.customer.phone,
    });
  }
  // Last month's commissions should be closed once the month is over.
  const nowD = new Date(now);
  const last = new Date(nowD.getFullYear(), nowD.getMonth() - 1, 1);
  const lastKey = `${last.getFullYear()}-${String(last.getMonth() + 1).padStart(2, "0")}`;
  if (!closedMonths.includes(lastKey)) {
    out.push({
      id: `month-${lastKey}`,
      lane: "c",
      kind: "close_month",
      ref: 0,
      title: tr(`إغلاق عمولات ${monthName(lastKey)}`, `Close commissions for ${monthName(lastKey)}`),
      sub: tr("الشهر انتهى: أغلقه حتى تثبت أرقام عمولات مندوبي التوصيل", "The month is over: close it so the delivery reps' numbers are final"),
      weight: 40,
      href: "/commissions",
    });
  }

  // ---- د: work in the warehouses ----
  for (const s of stocktakes.filter((x) => x.status === "open")) {
    const counted = s.lines.filter((l) => l.counted_qty !== null).length;
    out.push({
      id: `count-${s.id}`,
      lane: "d",
      kind: "stocktake",
      ref: s.id,
      title: tr(`جرد مفتوح: ${s.number}`, `Open stock count: ${s.number}`),
      sub: tr(`عُدّت ${counted} من ${s.lines.length} مادة · بدأ ${ago(s.created_at)}`, `${counted} of ${s.lines.length} counted · started ${ago(s.created_at)}`),
      weight: 30 + (counted === s.lines.length ? 10 : 0),
      href: `/stocktakes/${s.id}`,
    });
  }
  const waiting = orders.filter((o) => o.status === "pending");
  if (waiting.length) {
    const oldest = waiting.reduce((a, b) => (a.created_at < b.created_at ? a : b));
    out.push({
      id: "waiting-orders",
      lane: "d",
      kind: "waiting_orders",
      ref: 0,
      title: tr(`${waiting.length} طلبات تنتظر التجهيز`, `${waiting.length} orders wait to be prepared`),
      sub: tr(`أقدمها ${ago(oldest.created_at)} · قيمتها ${money(waiting.reduce((s, o) => s + o.total, 0))}`, `oldest ${ago(oldest.created_at)} · worth ${money(waiting.reduce((s, o) => s + o.total, 0))}`),
      weight: 20 + waiting.length,
      href: "/orders",
    });
  }

  return out.sort((a, b) => b.weight - a.weight);
}

export const LANES: { id: Lane; letter: string; ar: string; en: string; color: string }[] = [
  { id: "a", letter: "أ", ar: "الموافقات", en: "Approvals", color: "#e1692b" },
  { id: "b", letter: "ب", ar: "المخزون", en: "Stock", color: "#c99a2e" },
  { id: "c", letter: "ج", ar: "الأموال", en: "Money", color: "#b4533c" },
  { id: "d", letter: "د", ar: "العمل", en: "Work", color: "#2f8f8a" },
];
