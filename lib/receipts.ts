// What goes on each thermal receipt (components/thermal-receipt.tsx): the invoice (the counter sale's too),
// a payment (وصل قبض), and a delivery (إيصال تسليم).
import type { ReceiptData } from "@/components/thermal-receipt";
import type { Customer, Invoice, Item, Order, Payment } from "@/lib/api/types";
import type { Fmt } from "@/lib/i18n";

type Ctx = { fmt: Fmt; itemById: Map<number, Item> };

const lineRows = (lines: { item_id: number; unit: "carton" | "piece"; qty: number; unit_price: number; total: number }[], { fmt, itemById }: Ctx) =>
  lines.map((l) => {
    const it = itemById.get(l.item_id);
    return { name: fmt.name(it) || "-", qty: `${l.qty} ${fmt.unit(it, l.unit)} × ${fmt.money(l.unit_price)}`, total: fmt.money(l.total) };
  });

export function invoiceReceipt(inv: Invoice, customer: Customer | undefined, ctx: Ctx): ReceiptData {
  const { tr, money, dateTime } = ctx.fmt;
  const c = inv.counter;
  const back = c?.received ? c.received - inv.total : 0;
  return {
    title: c ? tr("فاتورة بيع مباشر", "Counter sale invoice") : tr("فاتورة بيع", "Sales invoice"),
    number: inv.number,
    date: dateTime(inv.date),
    info: [
      ...(c
        ? ([
            ...(c.buyer_name ? [[tr("المشتري", "Buyer"), c.buyer_name]] : []),
            ...(c.buyer_phone ? [[tr("الهاتف", "Phone"), c.buyer_phone]] : []),
          ] as [string, string][])
        : ([[tr("المحل", "Shop"), customer?.name ?? ""]] as [string, string][])),
      [tr("البائع", "Seller"), inv.created_by.name],
    ],
    lines: lineRows(inv.lines, ctx),
    totals: [
      [tr("المجموع", "Total"), money(inv.total), true],
      ...(c
        ? ([
            [c.method === "transfer" ? tr("دُفع بالتحويل", "Paid by transfer") : tr("المستلم نقداً", "Cash received"), money(c.received ?? inv.total)],
            ...(back > 0 ? [[tr("الباقي للزبون", "Change"), money(back)]] : []),
          ] as [string, string][])
        : ([
            [tr("المدفوع", "Paid"), money(inv.paid)],
            [tr("الباقي", "Left"), money(inv.remaining), true],
          ] as [string, string, boolean?][])),
    ],
    qr: `/invoices/${inv.id}`,
    footer: tr("شكراً لتعاملكم معنا", "Thank you"),
  };
}

export function paymentReceipt(p: Payment, customer: Customer | undefined, ctx: Ctx): ReceiptData {
  const { tr, money, dateTime } = ctx.fmt;
  const method = p.method === "cash" ? tr("نقداً", "Cash") : p.method === "transfer" ? tr("تحويل", "Transfer") : tr("دفع إلكتروني", "Online");
  return {
    title: tr("وصل قبض", "Payment receipt"),
    number: p.number,
    date: dateTime(p.date),
    info: [
      [tr("من", "From"), customer?.name ?? ""],
      [tr("الطريقة", "Method"), method],
      [tr("استلمه", "Received by"), p.received_by.name],
    ],
    lines: p.allocations.map((a) => ({ name: tr(`عن الفاتورة ${a.number}`, `For ${a.number}`), qty: "", total: money(a.amount) })),
    totals: [
      [tr("المبلغ", "Amount"), money(p.amount), true],
      ...(customer?.balance !== undefined ? ([[tr("الدين الباقي الآن", "Debt left now"), money(customer.balance)]] as [string, string][]) : []),
    ],
    qr: `/payments/${p.id}`,
    footer: tr("شكراً لكم", "Thank you"),
  };
}

export function deliveryReceipt(o: Order, customer: Customer | undefined, ctx: Ctx): ReceiptData {
  const { tr, money, dateTime } = ctx.fmt;
  const d = o.delivery;
  return {
    title: tr("إيصال تسليم", "Delivery receipt"),
    number: o.number,
    date: dateTime(d?.delivered_at ?? o.created_at),
    info: [
      [tr("المحل", "Shop"), customer?.name ?? ""],
      ...(d?.delivered_by ? ([[tr("سلّمه", "Delivered by"), d.delivered_by.name]] as [string, string][]) : []),
    ],
    lines: lineRows(o.lines, ctx),
    totals: [[tr("المجموع", "Total"), money(o.total), true]],
    qr: o.invoice_id ? `/invoices/${o.invoice_id}` : `/orders/${o.id}`,
    footer: tr("استلمت البضاعة كاملة · التوقيع: ............", "Goods received in full · Signature: ............"),
  };
}
