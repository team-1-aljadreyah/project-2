"use client";

import { useApp } from "@/components/shell";
import { Badge, Card, ErrorBox, KV, LoadingRows, Money, PageHeader, RefLink } from "@/components/ui";
import { api } from "@/lib/api";
import { useFmt } from "@/lib/i18n";
import { useLoad } from "@/lib/use-load";
import { useIdParam } from "@/lib/utils";

export default function ReturnView() {
  const id = useIdParam();
  const { tr, dateTime, name, qty } = useFmt();
  const { itemById } = useApp();
  const r = useLoad(() => api.getReturn(id), [id]);
  const ret = r.data;
  const customer = useLoad(() => (ret ? api.getCustomer(ret.customer_id) : Promise.resolve(undefined)), [ret?.customer_id]);
  if (r.state.status === "loading") return <LoadingRows />;
  if (r.state.status === "error" || !ret) return <ErrorBox error={r.state.status === "error" ? r.state.error : null} onRetry={r.reload} />;
  return (
    <>
      <PageHeader
        back="/returns"
        title={
          <span>
            {tr("مرتجع", "Return")} <span className="num">{ret.number}</span>
          </span>
        }
        subtitle={`${dateTime(ret.created_at)} · ${ret.created_by.name}`}
      />
      <div className="grid max-w-4xl gap-4 lg:grid-cols-[1fr_300px]">
        <Card>
          <ul className="divide-y divide-line">
            {ret.lines.map((l, i) => {
              const it = itemById.get(l.item_id);
              return (
                <li key={i} className="box-row flex items-center justify-between gap-3 px-4 py-3">
                  <div>
                    <p className="font-medium">
                      <RefLink main href={`/items/${l.item_id}`}>
                        {name(it)}
                      </RefLink>
                    </p>
                    <p className="text-xs text-muted">{it && qty(l.pieces, it.pieces_per_carton, it)}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    {l.condition === "good" ? <Badge tone="success">{tr("سليم، عاد إلى المخزون", "Good, back on shelf")}</Badge> : <Badge tone="danger">{tr("تالف", "Damaged")}</Badge>}
                    <Money value={l.amount} className="font-semibold" />
                  </div>
                </li>
              );
            })}
          </ul>
          <div className="flex justify-between border-t border-line px-4 py-3 font-semibold">
            <span>{tr("خُصم من الدين", "Taken off the debt")}</span>
            <Money value={ret.amount} className="text-lg" />
          </div>
        </Card>
        <Card className="self-start p-4">
          <KV k={tr("الزبون", "Customer")} href={customer.data && `/customers/${customer.data.id}`} v={customer.data?.name ?? "…"} />
          <KV k={tr("الفاتورة", "Invoice")} href={`/invoices/${ret.invoice_id}`} v={<span className="num">#{ret.invoice_id}</span>} />
          {ret.note && <KV k={tr("السبب", "Reason")} v={ret.note} />}
        </Card>
      </div>
    </>
  );
}
