"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { OrderBuilder } from "@/components/order-builder";
import { LoadingRows, PageHeader } from "@/components/ui";
import { useFmt } from "@/lib/i18n";

export default function NewOrderPage() {
  const { tr } = useFmt();
  return (
    <>
      <PageHeader title={tr("طلب جديد", "New order")} back="/orders" subtitle={tr("الأسعار حسب نوع الزبون، وتُحجز الكمية حتى التثبيت", "Prices follow the customer's tier. Stock is held until confirmed")} />
      <Suspense fallback={<LoadingRows />}>
        <Builder />
      </Suspense>
    </>
  );
}

// /orders/new?customer=3 opens with that shop chosen (from the customer page, the rep home, the account file).
// useSearchParams gives the NEW address even when you arrive through a link inside the site;
// reading window.location during render gave the old one, so the shop was not chosen.
function Builder() {
  const pre = Number(useSearchParams().get("customer")) || undefined;
  return <OrderBuilder key={pre ?? 0} preselectCustomerId={pre} />;
}
