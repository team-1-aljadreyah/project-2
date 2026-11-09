"use client";

import { MessageCircle, Printer, Undo2, Wallet } from "lucide-react";
import { LogoMark } from "@/components/logo";
import { useApp } from "@/components/shell";
import { InvoiceStatusBadge } from "@/components/status";
import { Badge, Button, Card, ErrorBox, LoadingRows, Money, PageHeader } from "@/components/ui";
import { api } from "@/lib/api";
import { useFmt } from "@/lib/i18n";
import { useLoad } from "@/lib/use-load";
import { useIdParam } from "@/lib/utils";

export default function InvoiceView() {
  const id = useIdParam();
  const { tr, dateTime, money, name, qty } = useFmt();
  const { user, lookups, itemById } = useApp();
  const inv = useLoad(() => api.getInvoice(id), [id]);
  const i = inv.data;
  const customer = useLoad(() => (i ? api.getCustomer(i.customer_id) : Promise.resolve(undefined)), [i?.customer_id]);
  const returns = useLoad(() => (i && user.role !== "shop" ? api.listReturns() : Promise.resolve([])), [i?.id]);
  const payments = useLoad(() => (i && user.role !== "warehouse" ? api.listPayments().catch(() => []) : Promise.resolve([])), [i?.id]);

  if (inv.state.status === "loading") return <LoadingRows />;
  if (inv.state.status === "error" || !i) return <ErrorBox error={inv.state.status === "error" ? inv.state.error : null} onRetry={inv.reload} />;

  const c = customer.data;
  const rep = lookups.reps.find((r) => r.id === i.rep_id);
  const wh = lookups.warehouses.find((w) => w.id === i.warehouse_id);
  const myReturns = (returns.data ?? []).filter((r) => r.invoice_id === i.id);
  const myPays = (payments.data ?? []).filter((p) => p.allocations.some((a) => a.invoice_id === i.id));
  const seesMoney = user.role !== "warehouse";
  const canPay = seesMoney && user.role !== "shop" && i.remaining > 0;
  const canReturn = ["manager", "accountant", "rep"].includes(user.role) && i.lines.some((l) => l.pieces > l.returned_pieces);
  const showCost = user.role === "manager" || user.role === "accountant";

  const share = () => {
    const lines = i.lines.map((l) => `- ${itemById.get(l.item_id)?.name}: ${l.qty} ${l.unit === "carton" ? "كارتون" : "قطعة"} = ${money(l.total)}`).join("\n");
    const text = `شركة النهرين للمواد الغذائية\nفاتورة ${i.number}\n${c?.name ?? ""}\n${lines}\nالمجموع: ${money(i.total)}\nالباقي: ${money(Math.max(0, i.remaining))}`;
    window.open(`https://wa.me/${c?.phone ? "964" + c.phone.slice(1) : ""}?text=${encodeURIComponent(text)}`, "_blank", "noopener");
  };

  return (
    <>
      <PageHeader
        back={user.role === "shop" ? "/statement" : "/invoices"}
        title={
          <span className="flex flex-wrap items-center gap-2">
            {tr("فاتورة", "Invoice")} <span className="num">{i.number}</span> {seesMoney && <InvoiceStatusBadge status={i.status} />}
          </span>
        }
        actions={
          <>
            {canReturn && (
              <Button href={`/returns/new?invoice=${i.id}`}>
                <Undo2 className="size-4" /> {tr("مرتجع", "Return")}
              </Button>
            )}
            {seesMoney && (
              <Button onClick={share}>
                <MessageCircle className="size-4" /> {tr("واتساب", "WhatsApp")}
              </Button>
            )}
            <Button onClick={() => window.print()}>
              <Printer className="size-4" /> {tr("طباعة", "Print")}
            </Button>
            {canPay && (
              <Button variant="action" href={`/payments/new?customer=${i.customer_id}`}>
                <Wallet className="size-4" /> {tr("استلام تسديد", "Take payment")}
              </Button>
            )}
          </>
        }
      />

      <Card className="print-area mx-auto max-w-3xl p-5 sm:p-8">
        <div className="flex flex-wrap items-start justify-between gap-4 border-b border-line pb-5">
          <div className="flex items-center gap-3">
            <LogoMark size={44} />
            <div>
              <p className="text-lg font-bold">{tr("شركة النهرين للمواد الغذائية", "Al-Nahrain Foods Co.")}</p>
              <p className="text-xs text-muted">{tr("بالجملة - كربلاء", "Wholesale - Karbala")} · {name(wh)}</p>
            </div>
          </div>
          <div className="text-end text-sm">
            <p className="num text-base font-bold">{i.number}</p>
            <p className="text-muted">{dateTime(i.date)}</p>
          </div>
        </div>

        <div className="grid gap-4 border-b border-line py-5 text-sm sm:grid-cols-2">
          <div>
            <p className="text-xs text-muted">{tr("إلى", "Bill to")}</p>
            <p className="font-semibold">{c?.name}</p>
            <p className="text-muted">{c?.owner_name}</p>
            <p className="text-muted">
              {c?.address} · <span dir="ltr">{c?.phone}</span>
            </p>
          </div>
          <div className="sm:text-end">
            <p className="text-xs text-muted">{tr("المندوب", "Rep")}</p>
            <p className="font-semibold">{rep?.name}</p>
            <p className="text-muted">{name(lookups.tiers.find((t) => t.id === c?.tier_id))}</p>
          </div>
        </div>

        <table className="mt-4 w-full text-sm">
          <thead>
            <tr className="border-b border-line text-xs text-muted">
              <th className="py-2 text-start font-medium">{tr("المادة", "Item")}</th>
              <th className="py-2 text-center font-medium">{tr("الكمية", "Qty")}</th>
              <th className="hidden py-2 text-end font-medium sm:table-cell">{tr("السعر", "Price")}</th>
              <th className="py-2 text-end font-medium">{tr("المبلغ", "Amount")}</th>
            </tr>
          </thead>
          <tbody>
            {i.lines.map((l, k) => {
              const it = itemById.get(l.item_id);
              return (
                <tr key={k} className="border-b border-line align-top">
                  <td className="py-3">
                    <p className="font-medium">{name(it)}</p>
                    {l.returned_pieces > 0 && it && (
                      <p className="text-xs text-warning">
                        {tr("أُرجع", "Returned")} {qty(l.returned_pieces, it.pieces_per_carton)}
                      </p>
                    )}
                    {l.batches && l.batches.length > 0 && user.role !== "shop" && user.role !== "rep" && (
                      <div className="no-print mt-1 flex flex-wrap gap-1">
                        {l.batches.map((b) => (
                          <Badge key={b.batch_id}>
                            #{b.batch_id} · <span className="num">{b.expiry_date}</span> · {b.qty}
                            {showCost && b.purchase_price !== undefined && <> · {money(b.purchase_price)}</>}
                          </Badge>
                        ))}
                      </div>
                    )}
                  </td>
                  <td className="num py-3 text-center">
                    {l.qty} {l.unit === "carton" ? tr("كارتون", "ctn") : tr("قطعة", "pc")}
                  </td>
                  <td className="hidden py-3 text-end sm:table-cell">
                    <Money value={l.unit_price} />
                  </td>
                  <td className="py-3 text-end">
                    <Money value={l.total} className="font-medium" />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>

        <div className="ms-auto mt-4 max-w-xs space-y-1.5 text-sm">
          <Row k={tr("المجموع", "Total")} v={<Money value={i.total} className="font-semibold" />} />
          {i.returned > 0 && <Row k={tr("المرتجع", "Returns")} v={<Money value={-i.returned} />} />}
          {seesMoney && (
            <>
              <Row k={tr("المسدد", "Paid")} v={<Money value={-i.paid} />} />
              <div className="flex justify-between border-t border-line pt-2 text-base font-bold">
                <span>{tr("الباقي", "Left to pay")}</span>
                <Money value={Math.max(0, i.remaining)} />
              </div>
              {i.remaining < 0 && <p className="text-xs text-success">{tr(`رصيد للزبون ${money(-i.remaining)}`, `Customer credit ${money(-i.remaining)}`)}</p>}
            </>
          )}
          {showCost && i.profit !== undefined && (
            <div className="no-print mt-2 rounded-lg bg-success-soft px-3 py-2 text-xs text-success">
              {tr("الكلفة حسب الدفعات", "Cost by batches")} <span className="num">{money(i.cost)}</span> · {tr("الربح", "Profit")} <span className="num font-bold">{money(i.profit)}</span>
            </div>
          )}
        </div>
        <p className="mt-8 text-center text-xs text-faint">{tr("شكراً لتعاملكم مع شركة النهرين", "Thank you for dealing with Al-Nahrain")}</p>
      </Card>

      {seesMoney && (myPays.length > 0 || myReturns.length > 0) && (
        <Card className="no-print mx-auto mt-4 max-w-3xl">
          <div className="border-b border-line px-4 py-3 font-semibold">{tr("الحركات على هذه الفاتورة", "Movements on this invoice")}</div>
          <ul className="divide-y divide-line text-sm">
            {myPays.map((p) => {
              const a = p.allocations.find((x) => x.invoice_id === i.id);
              return (
                <li key={p.id} className="flex justify-between gap-2 px-4 py-2.5">
                  <span>
                    {p.amount < 0 ? tr("عكس تسديد", "Reversal") : tr("تسديد", "Payment")} <span className="num">{p.number}</span> · {dateTime(p.date)} · {p.received_by.name}
                  </span>
                  <Money value={a?.amount} />
                </li>
              );
            })}
            {myReturns.map((r) => (
              <li key={r.id} className="flex justify-between gap-2 px-4 py-2.5">
                <span>
                  {tr("مرتجع", "Return")} <span className="num">{r.number}</span> · {dateTime(r.created_at)}
                </span>
                <Money value={r.amount} />
              </li>
            ))}
          </ul>
        </Card>
      )}
    </>
  );
}

function Row({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div className="flex justify-between">
      <span className="text-muted">{k}</span>
      {v}
    </div>
  );
}
