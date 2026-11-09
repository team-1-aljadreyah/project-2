"use client";

import { OrderBuilder } from "@/components/order-builder";
import { useApp } from "@/components/shell";
import { Notice, PageHeader } from "@/components/ui";
import { useFmt } from "@/lib/i18n";

// The shop owner orders by himself. The order goes to the manager and to the shop's rep.
export default function ShopOrderPage() {
  const { tr } = useFmt();
  const { user } = useApp();
  if (!user.customer_id) return <Notice tone="danger">{tr("حسابك غير مربوط بمحل، راجع الشركة", "Your account isn't linked to a shop. Contact the company")}</Notice>;
  return (
    <>
      <PageHeader title={tr("اطلب بضاعتك", "Order your goods")} subtitle={tr("الأسعار هي أسعارك الخاصة. الطلب يوصل للشركة ولمندوبك.", "These are your own prices. The order reaches the company and your rep.")} />
      <OrderBuilder fixedCustomerId={user.customer_id} />
    </>
  );
}
