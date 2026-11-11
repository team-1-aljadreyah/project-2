"use client";

import { useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ClipboardList, MessageCircle, Printer, Undo2, Wallet } from "lucide-react";
import { LogoMark } from "@/components/logo";
import { useBrand } from "@/lib/site";
import { CreditNoteButton } from "@/components/refund";
import { useApp } from "@/components/shell";
import { InvoiceStatusBadge } from "@/components/status";
import { Badge, Button, Card, ClickRow, ErrorBox, GoIcon, LoadingRows, Money, PageHeader, RefLink } from "@/components/ui";
import { api } from "@/lib/api";
import { useFmt } from "@/lib/i18n";
import { useLoad } from "@/lib/use-load";
import { useIdParam } from "@/lib/utils";

export default function InvoiceView() {
  const id = useIdParam();
  const { tr, dateTime, money, name, qty, num } = useFmt();
  const brand = useBrand();
  const { user, lookups, itemById } = useApp();
  const inv = useLoad(() => api.getInvoice(id), [id]);
  const i = inv.data;
  const customer = useLoad(() => (i ? api.getCustomer(i.customer_id) : Promise.resolve(undefined)), [i?.customer_id]);
  const returns = useLoad(() => (i && user.role !== "shop" ? api.listReturns() : Promise.resolve([])), [i?.id]);
  const payments = useLoad(() => (i && user.role !== "warehouse" ? api.listPayments().catch(() => []) : Promise.resolve([])), [i?.id]);
  const printNow = useSearchParams().get("print") === "1";
  const router = useRouter();
  const ready = !!i && customer.state.status !== "loading";

  // Opened with the list's print button: print once everything (the shop's name and address too) is on the
  // page, then drop ?print=1 so going back or refreshing doesn't print again.
  useEffect(() => {
    if (!printNow || !ready) return;
    const t = setTimeout(() => {
      window.print();
      router.replace(`/invoices/${id}`, { scroll: false });
    }, 300);
    return () => clearTimeout(t);
  }, [printNow, ready, id, router]);

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
    const text = `${brand.company}\nفاتورة ${i.number}\n${c?.name ?? ""}\n${lines}\nالمجموع: ${money(i.total)}\nالباقي: ${money(Math.max(0, i.remaining))}`;
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
            <Button href={`/orders/${i.order_id}`}>
              <ClipboardList className="size-4" /> {tr("الطلب", "Order")}
            </Button>
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
            <Button variant={user.role === "shop" ? "action" : undefined} onClick={() => window.print()}>
              <Printer className="size-4" /> {tr("طباعة", "Print")}
            </Button>
            {(user.role === "accountant" || user.role === "manager") && <CreditNoteButton invoice={i} onDone={inv.reload} />}
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
              <p className="text-lg font-bold">{brand.company}</p>
              <p className="text-xs text-muted">
                {tr("بالجملة - كربلاء", "Wholesale - Karbala")} · {name(wh)}
                {brand.phone && (
                  <span className="num" dir="ltr">
                    {" · "}
                    {brand.phone}
                  </span>
                )}
              </p>
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
            <p className="font-semibold">
              <RefLink href={c && `/customers/${c.id}`}>{c?.name}</RefLink>
            </p>
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
                <ClickRow key={k} href={`/items/${l.item_id}`} className="border-b border-line align-top">
                  <td className="py-3">
                    <p className="font-medium">
                      <RefLink href={`/items/${l.item_id}`}>{name(it)}</RefLink>
                    </p>
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
                </ClickRow>
              );
            })}
          </tbody>
        </table>

        <div className="ms-auto mt-4 max-w-xs space-y-1.5 text-sm">
          {!!i.discount && (
            <>
              <Row k={tr("قبل الخصم", "Before discount")} v={<Money value={i.subtotal} />} />
              <Row k={tr(`خصم ${i.discount_percent}%`, `${i.discount_percent}% discount`)} v={<Money value={-i.discount} className="text-success" />} />
            </>
          )}
          {!!i.rounding && <Row k={<span className="text-xs">{tr("تقريب لأقرب 250 د.ع", "Rounded to 250 IQD")}</span>} v={<Money value={i.rounding} className="text-xs" />} />}
          <Row k={tr("المجموع", "Total")} v={<Money value={i.total} className="font-semibold" />} />
          {!!i.usd_rate && (
            <Row
              k={<span className="text-xs text-muted">{tr(`بالدولار (1$ = ${num(i.usd_rate)})`, `In dollars ($1 = ${num(i.usd_rate)})`)}</span>}
              v={
                <span className="num text-xs text-muted" dir="ltr">
                  ≈ ${(i.total / i.usd_rate).toLocaleString("en-US", { maximumFractionDigits: 2 })}
                </span>
              }
            />
          )}
          {i.returned > 0 && <Row k={tr("المرتجع", "Returns")} v={<Money value={-i.returned} />} />}
          {!!i.credited && <Row k={tr("تعويض عن خطأ", "Credit for a mistake")} v={<Money value={-i.credited} className="text-success" />} />}
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
        <p className="mt-8 text-center text-xs text-faint">
          {tr("شكراً لتعاملكم مع", "Thank you for dealing with")} {brand.company}
        </p>
      </Card>

      {seesMoney && (myPays.length > 0 || myReturns.length > 0) && (
        <Card className="no-print mx-auto mt-4 max-w-3xl">
          <div className="border-b border-line px-4 py-3 font-semibold">{tr("الحركات على هذه الفاتورة", "Movements on this invoice")}</div>
          <ul className="divide-y divide-line text-sm">
            {myPays.map((p) => {
              const a = p.allocations.find((x) => x.invoice_id === i.id);
              return (
                <li key={p.id} className="box-row flex items-center justify-between gap-2 px-4 py-2.5">
                  <span>
                    {p.amount < 0 ? tr("عكس تسديد", "Reversal") : tr("تسديد", "Payment")}{" "}
                    <RefLink main href={`/payments/${p.id}`} className="num">
                      {p.number}
                    </RefLink>{" "}
                    · {dateTime(p.date)} · {p.received_by.name}
                  </span>
                  <span className="flex items-center gap-1.5">
                    <Money value={a?.amount} />
                    <GoIcon className="text-faint" />
                  </span>
                </li>
              );
            })}
            {myReturns.map((r) => (
              <li key={r.id} className="box-row flex items-center justify-between gap-2 px-4 py-2.5">
                <span>
                  {tr("مرتجع", "Return")}{" "}
                  <RefLink main href={`/returns/${r.id}`} className="num">
                    {r.number}
                  </RefLink>{" "}
                  · {dateTime(r.created_at)}
                </span>
                <span className="flex items-center gap-1.5">
                  <Money value={r.amount} />
                  <GoIcon className="text-faint" />
                </span>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </>
  );
}

function Row({ k, v }: { k: React.ReactNode; v: React.ReactNode }) {
  return (
    <div className="flex justify-between">
      <span className="text-muted">{k}</span>
      {v}
    </div>
  );
}
