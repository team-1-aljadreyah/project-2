"use client";

// Colored labels for statuses, so every screen names them the same way.
import type { BatchStatus, InvoiceStatus, OrderSource, OrderStatus, Role } from "@/lib/api/types";
import { useFmt, type Tr } from "@/lib/i18n";
import { Badge } from "./ui";

export function roleName(role: Role, tr: Tr) {
  switch (role) {
    case "manager":
      return tr("المدير", "Manager");
    case "warehouse":
      return tr("أمين المخزن", "Warehouse keeper");
    case "rep":
      return tr("مندوب", "Sales rep");
    case "accountant":
      return tr("محاسب", "Accountant");
    case "shop":
      return tr("صاحب محل", "Shop owner");
  }
}

export function OrderStatusBadge({ status }: { status: OrderStatus }) {
  const { tr } = useFmt();
  switch (status) {
    case "pending":
      return <Badge tone="primary">{tr("بانتظار التثبيت", "Waiting")}</Badge>;
    case "needs_approval":
      return <Badge tone="warning">{tr("يحتاج موافقة المدير", "Needs approval")}</Badge>;
    case "confirmed":
      return <Badge tone="success">{tr("مثبّت", "Confirmed")}</Badge>;
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
  return <Badge>{tr("مندوب", "Rep")}</Badge>;
}
