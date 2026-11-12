"use client";

// Colored labels for statuses, so every screen names them the same way.
import type { BatchStatus, InvoiceStatus, OrderSource, OrderStatus, RepKind, Role } from "@/lib/api/types";
import { useFmt, type Tr } from "@/lib/i18n";
import { Badge } from "./ui";

/** A rep's job: marketing, delivery, or both. */
export function repKindName(kinds: RepKind[] | undefined, tr: Tr) {
  const sales = !kinds?.length || kinds.includes("sales");
  const delivery = !kinds?.length || kinds.includes("delivery");
  if (sales && delivery) return tr("مندوب تسويق وتوصيل", "Marketing & delivery rep");
  return sales ? tr("مندوب تسويق", "Marketing rep") : tr("مندوب توصيل", "Delivery rep");
}

/** The name of a person's job: for a rep, which kind. */
export function jobName(u: { role: Role; rep_kinds?: RepKind[] }, tr: Tr) {
  return u.role === "rep" ? repKindName(u.rep_kinds, tr) : roleName(u.role, tr);
}

export function roleName(role: Role, tr: Tr) {
  switch (role) {
    case "manager":
      return tr("المدير", "Manager");
    case "warehouse":
      return tr("أمين المخزن", "Warehouse keeper");
    case "staff":
      return tr("موظف المخزن", "Warehouse staff");
    case "rep":
      return tr("المندوب", "Rep");
    case "accountant":
      return tr("محاسب", "Accountant");
    case "shop":
      return tr("صاحب محل", "Shop owner");
  }
}

export function OrderStatusBadge({ status, waiting }: { status: OrderStatus; waiting?: boolean }) {
  const { tr } = useFmt();
  // Written offline but the goods weren't there: it waits for them.
  if (waiting && status === "expired") return <Badge tone="warning">{tr("بانتظار البضاعة", "Waiting for stock")}</Badge>;
  switch (status) {
    case "pending":
      return <Badge tone="primary">{tr("بانتظار الاعتماد", "Waiting approval")}</Badge>;
    case "approved":
      return <Badge tone="primary">{tr("معتمد", "Approved")}</Badge>;
    case "needs_approval":
      return <Badge tone="warning">{tr("يحتاج موافقة المدير", "Needs approval")}</Badge>;
    case "confirmed":
      return <Badge tone="success">{tr("سُلِّم", "Delivered")}</Badge>;
    case "cancelled":
      return <Badge>{tr("ملغي", "Cancelled")}</Badge>;
    case "expired":
      return <Badge tone="danger">{tr("انتهى الحجز", "Hold expired")}</Badge>;
  }
}

export function InvoiceStatusBadge({ status }: { status: InvoiceStatus }) {
  const { tr } = useFmt();
  if (status === "paid") return <Badge tone="success">{tr("مسددة", "Paid")}</Badge>;
  if (status === "partial") return <Badge tone="warning">{tr("مسددة جزئياً", "Part paid")}</Badge>;
  return <Badge tone="danger">{tr("غير مسددة", "Unpaid")}</Badge>;
}

export function BatchStatusBadge({ status, days }: { status: BatchStatus; days?: number }) {
  const { tr } = useFmt();
  if (status === "expired") return <Badge tone="danger">{tr("منتهية - لا تُباع", "Expired - not sold")}</Badge>;
  if (status === "near_expiry")
    return <Badge tone="warning">{days !== undefined ? tr(`تنتهي بعد ${days} يوم`, `${days} days left`) : tr("قريبة الانتهاء", "Expiring soon")}</Badge>;
  return <Badge tone="success">{tr("سليمة", "OK")}</Badge>;
}

export function SourceBadge({ source }: { source: OrderSource }) {
  const { tr } = useFmt();
  if (source === "shop") return <Badge tone="primary">{tr("من المحل", "Shop online")}</Badge>;
  if (source === "office") return <Badge>{tr("من المكتب", "Office")}</Badge>;
  if (source === "counter") return <Badge tone="success">{tr("بيع مباشر", "Counter sale")}</Badge>;
  return <Badge>{tr("من المندوب", "Rep")}</Badge>;
}
