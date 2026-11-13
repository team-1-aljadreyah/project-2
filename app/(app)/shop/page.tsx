"use client";

import { RatePrompt } from "@/components/rate-delivery";

import { Check, Clock, PhoneCall, ShoppingCart, Warehouse, XCircle } from "lucide-react";
import Link from "next/link";
import { PinCard } from "@/components/delivery/status";
import { ShipmentTracker, useRepLocations } from "@/components/delivery/live-map";
import { OpenInMaps } from "@/components/open-in-maps";
import { ShopStore } from "@/components/shop-store";
import { useApp } from "@/components/shell";
import { Button, Card, ErrorBox, LoadingRows, Notice } from "@/components/ui";
import { api } from "@/lib/api";
import type { Customer, Order } from "@/lib/api/types";
import { useFmt } from "@/lib/i18n";
import { useLoad } from "@/lib/use-load";
import { useRealtime } from "@/lib/realtime";
import { cn } from "@/lib/utils";

// The shop owner orders by himself, in a store made after the coffee-shop app design (components/shop-store.tsx).
// The order goes to the manager and to the shop's rep.
// A shop that signed up on the website sees a "waiting for approval" screen until the manager approves it;
// the screen turns into the order page by itself as soon as that happens.
export default function ShopOrderPage() {
  const { tr } = useFmt();
  const { user } = useApp();
  const id = user.customer_id ?? 0;
  const c = useLoad(() => api.getCustomer(id), [id]);
  // His orders, loaded once for the whole page (the shipments on the way and «order like last time»): the page
  // shows when both are here, all at once, so nothing jumps down while the shop owner looks at it.
  const orders = useLoad(() => api.listOrders(), [id]);
  useRealtime(["orders"], () => orders.reload());

  if (!user.customer_id) return <Notice tone="danger">{tr("حسابك غير مرتبط بمحل، راجع الشركة", "Your account isn't linked to a shop. Contact the company")}</Notice>;
  if (c.state.status === "loading" || orders.state.status === "loading") return <LoadingRows />;
  if (c.state.status === "error" || !c.data) return <ErrorBox error={c.state.status === "error" ? c.state.error : null} onRetry={c.reload} />;
  if (c.data.pending) return <PendingAccount customer={c.data} />;
  if (!c.data.active) {
    return (
      <Card className="mx-auto mt-10 max-w-lg p-8 text-center">
        <XCircle className="mx-auto size-10 text-danger" />
        <h1 className="mt-3 text-xl font-bold">{tr("حسابك موقوف", "Your account is off")}</h1>
        <p className="mt-2 text-sm text-muted">{tr("لا يمكنك الطلب حالياً. تواصل مع الشركة.", "You can't order right now. Please contact the company.")}</p>
      </Card>
    );
  }
  return (
    <>
      <RatePrompt orders={orders.data ?? []} customerId={c.data.id} />
      <MyShipments customer={c.data} orders={orders.data ?? []} />
      <ShopStore key={c.data.id} customer={c.data} orders={orders.data ?? []} />
      <OurWarehouses />
    </>
  );
}

function PendingAccount({ customer }: { customer: Customer }) {
  const { tr } = useFmt();
  const { lookups } = useApp();
  const rep = lookups.reps.find((r) => r.id === customer.rep_id);
  const steps = [
    { done: true, now: false, t: tr("سجّلت محلك", "You registered your shop"), b: tr(`${customer.name} · ${customer.area}`, `${customer.name} · ${customer.area}`) },
    { done: false, now: true, t: tr("الشركة تراجع معلوماتك", "The company checks your details"), b: tr("تحدد أسعارك وسقف الدين ومندوبك", "It sets your prices, debt limit and delivery rep") },
    { done: false, now: false, t: tr("تطلب بضاعتك من الموقع", "You order your goods here"), b: tr("في أي وقت، من جوالك", "Any time, from your phone") },
  ];
  return (
    <div className="mx-auto max-w-xl py-6">
      <Card className="relative overflow-hidden p-6 sm:p-8">
        <div className="hazard absolute inset-x-0 top-0 h-1.5" aria-hidden />
        <div className="anim-pop-spin mx-auto flex size-16 items-center justify-center rounded-2xl bg-warning-soft text-warning">
          <Clock className="size-8" />
        </div>
        <h1 className="mt-4 text-center text-2xl font-bold">{tr("حسابك قيد المراجعة", "Your account is being checked")}</h1>
        <p className="mx-auto mt-2 max-w-md text-center text-sm text-muted">
          {tr(
            "تم تسجيلك بنجاح. تراجع شركة النهرين معلومات محلك وتحدد أسعارك، ثم يمكنك الطلب مباشرة. تتحدّث هذه الصفحة تلقائياً.",
            "You're registered. Al-Nahrain checks your shop's details and sets your prices, then you can order right away. This page updates by itself.",
          )}
        </p>

        <ol className="mt-8 space-y-0">
          {steps.map((s, i) => (
            <li key={s.t} style={{ animationDelay: `${0.2 + i * 0.12}s` }} className="rise-item relative flex gap-4 pb-6 last:pb-0">
              {i < steps.length - 1 && <span className={cn("absolute start-[17px] top-9 h-[calc(100%-36px)] w-0.5", s.done ? "bg-success" : "bg-line")} aria-hidden />}
              <span
                className={cn(
                  "relative flex size-9 shrink-0 items-center justify-center rounded-full text-sm font-bold",
                  s.done ? "bg-success text-white" : s.now ? "bg-action text-on-action" : "bg-card-2 text-faint",
                )}
              >
                {s.done ? <Check className="size-4" /> : s.now ? <span className="size-2.5 animate-ping rounded-full bg-on-action" /> : i + 1}
              </span>
              <div className="pt-1.5">
                <p className={cn("font-semibold", !s.done && !s.now && "text-muted")}>{s.t}</p>
                <p className="text-xs text-muted">{s.b}</p>
              </div>
            </li>
          ))}
        </ol>

        <div className="mt-8 grid gap-2 sm:grid-cols-2">
          {rep && (
            <Button href={`tel:${rep.phone}`}>
              <PhoneCall className="size-4" /> {tr(`اتصل بمندوبك: ${rep.name}`, `Call your rep: ${rep.name}`)}
            </Button>
          )}
          <Button variant="soft" disabled className={cn(!rep && "sm:col-span-2")}>
            <ShoppingCart className="size-4" /> {tr("الطلب يتفعّل بعد الموافقة", "Ordering opens after approval")}
          </Button>
        </div>
      </Card>
    </div>
  );
}

/** Shipments on their way to this shop, each with its delivery PIN (only the shop owner ever sees it). */
function MyShipments({ customer, orders }: { customer: Customer; orders: Order[] }) {
  const { tr } = useFmt();
  const { lookups } = useApp();
  const locations = useRepLocations();
  const coming = orders.filter((o) => o.delivery && o.delivery.status !== "delivered" && o.delivery.pin);
  if (!coming.length) return null;
  return (
    <div className="mx-auto mb-4 max-w-5xl space-y-2">
      {coming.map((o) => (
        <div key={o.id} className="anim-drop-in grid items-center gap-3 rounded-3xl border border-line bg-card p-4 sm:grid-cols-[1fr_auto]">
          <div className="box-row -m-2 rounded-2xl p-2">
            <p className="font-bold">{o.delivery!.status === "out" ? tr("طلبك في الطريق إليك", "Your order is on its way") : tr("طلبك يُجهَّز للشحن", "Your order is being packed")}</p>
            <p className="text-sm text-muted">
              <Link href={`/orders/${o.id}`} className="box-link-main num font-semibold underline-offset-2 hover:underline" dir="ltr">
                {o.number}
              </Link>
              {o.delivery!.out_by && <> · {tr(`مع ${o.delivery!.out_by.name}`, `with ${o.delivery!.out_by.name}`)}</>}
            </p>
          </div>
          <div className="sm:w-80">
            <PinCard pin={o.delivery!.pin!} compact />
          </div>
          {/* Where the order is: the rep moving toward the shop, live */}
          <div className="sm:col-span-2">
            <ShipmentTracker order={o} shop={customer} warehouse={lookups.warehouses.find((w) => w.id === o.warehouse_id)} live={locations[o.delivery!.rep?.id ?? o.rep_id]} />
          </div>
        </div>
      ))}
    </div>
  );
}

/** Our warehouses, for a shop owner who comes to buy at the counter: the way there in his maps app. */
function OurWarehouses() {
  const { tr, name } = useFmt();
  const { lookups } = useApp();
  const list = lookups.warehouses.filter((w) => w.lat !== undefined && w.lng !== undefined);
  if (!list.length) return null;
  return (
    <section className="mt-6 mb-24 rounded-3xl border border-line bg-card p-4 sm:mb-6">
      <h2 className="flex items-center gap-1.5 font-bold">
        <Warehouse className="size-4 text-action" /> {tr("تعال إلى مخازننا", "Come to our warehouses")}
      </h2>
      <p className="mt-0.5 text-sm text-muted">{tr("تشتري وتدفع في المخزن وتأخذ البضاعة في الحال.", "Buy and pay at the warehouse and take the goods at once.")}</p>
      <ul className="mt-3 grid gap-2 sm:grid-cols-2">
        {list.map((w) => (
          <li key={w.id} className="flex items-center justify-between gap-2 rounded-2xl bg-card-2 p-3">
            <span className="min-w-0 truncate font-semibold">{name(w)}</span>
            <OpenInMaps variant="action" text={tr("الطريق", "Directions")} to={{ lat: w.lat!, lng: w.lng!, label: name(w) }} />
          </li>
        ))}
      </ul>
    </section>
  );
}
