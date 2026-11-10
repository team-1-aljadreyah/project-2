"use client";

import { OrderBuilder } from "@/components/order-builder";
import { PageHeader } from "@/components/ui";
import { useFmt } from "@/lib/i18n";

export default function NewOrderPage() {
  const { tr } = useFmt();
  // /orders/new?customer=3 opens with that shop chosen (from the customer page).
  const pre = typeof window !== "undefined" ? Number(new URLSearchParams(window.location.search).get("customer")) || undefined : undefined;
  return (
    <>
      <PageHeader title={tr("طلب جديد", "New order")} back="/orders" subtitle={tr("الأسعار حسب نوع الزبون، وتُحجز الكمية حتى التثبيت", "Prices follow the customer's tier. Stock is held until confirmed")} />
      <OrderBuilder preselectCustomerId={pre} />
    </>
  );
}
