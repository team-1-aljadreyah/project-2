"use client";

import { useState } from "react";
import { History } from "lucide-react";
import { roleName } from "@/components/status";
import { Badge, Card, Empty, ErrorBox, LoadingRows, PageHeader, SearchBox, Select } from "@/components/ui";
import { api } from "@/lib/api";
import type { AuditAction, AuditEntity } from "@/lib/api/types";
import { useFmt, type Tr } from "@/lib/i18n";
import { useLoad } from "@/lib/use-load";
import { matches } from "@/lib/utils";

const actionLabel = (a: AuditAction, tr: Tr) =>
  ({
    create: tr("إضافة", "Create"),
    update: tr("تعديل", "Edit"),
    cancel: tr("إلغاء", "Cancel"),
    reverse: tr("عكس", "Reverse"),
    transfer: tr("تحويل", "Transfer"),
    price_change: tr("تغيير سعر", "Price change"),
    approve: tr("موافقة", "Approve"),
    confirm: tr("تثبيت", "Confirm"),
    close: tr("إغلاق", "Close"),
    login: tr("دخول", "Login"),
  })[a];

const tone = (a: AuditAction) => (a === "cancel" || a === "reverse" ? "danger" : a === "price_change" || a === "approve" ? "warning" : a === "create" || a === "confirm" ? "success" : "neutral");

const ENTITIES: AuditEntity[] = ["order", "invoice", "payment", "return", "item", "receipt", "transfer", "stocktake", "customer", "user", "commission", "settings"];

// Who did what and when. Nothing here can be edited or deleted.
export default function AuditPage() {
  const { tr, dateTime, lang } = useFmt();
  const log = useLoad(() => api.listAudit(), []);
  const [q, setQ] = useState("");
  const [action, setAction] = useState<AuditAction | "">("");
  const [entity, setEntity] = useState<AuditEntity | "">("");
  const [showLogins, setShowLogins] = useState(false);
  const rows = (log.data ?? [])
    .filter((e) => (showLogins || e.action !== "login") && (!action || e.action === action) && (!entity || e.entity === entity) && matches(q, e.summary, e.summary_en, e.user.name))
    .slice(0, 300);
  const entityLabel = (x: AuditEntity) =>
    ({
      order: tr("الطلبات", "Orders"),
      invoice: tr("الفواتير", "Invoices"),
      payment: tr("التسديدات", "Payments"),
      return: tr("المرتجعات", "Returns"),
      item: tr("المواد والأسعار", "Items and prices"),
      receipt: tr("الاستلام", "Receiving"),
      transfer: tr("التحويل", "Transfers"),
      stocktake: tr("الجرد", "Counts"),
      customer: tr("الزبائن", "Customers"),
      user: tr("المستخدمون", "Users"),
      commission: tr("العمولات", "Commission"),
      settings: tr("الإعدادات", "Settings"),
      batch: tr("الدفعات", "Batches"),
    })[x];

  return (
    <>
      <PageHeader title={tr("سجل التعديلات", "Activity log")} subtitle={tr("كل عملية بالنظام: منو سواها، شنو، ومتى. السجل ما ينعدل وما ينمسح.", "Every action in the system: who, what and when. The log can't be edited or deleted.")} />
      <Card>
        <div className="flex flex-col gap-2 border-b border-line p-3 lg:flex-row lg:items-center">
          <SearchBox value={q} onChange={setQ} placeholder={tr("ابحث بالاسم أو الرقم", "Search by name or number")} className="lg:w-72" />
          <Select value={entity} onChange={(e) => setEntity(e.target.value as AuditEntity | "")} className="lg:w-44">
            <option value="">{tr("كل الأقسام", "All areas")}</option>
            {ENTITIES.map((x) => (
              <option key={x} value={x}>
                {entityLabel(x)}
              </option>
            ))}
          </Select>
          <Select value={action} onChange={(e) => setAction(e.target.value as AuditAction | "")} className="lg:w-44">
            <option value="">{tr("كل العمليات", "All actions")}</option>
            {(["create", "update", "confirm", "cancel", "reverse", "price_change", "approve", "transfer", "close"] as AuditAction[]).map((a) => (
              <option key={a} value={a}>
                {actionLabel(a, tr)}
              </option>
            ))}
          </Select>
          <label className="flex items-center gap-2 text-sm text-muted">
            <input type="checkbox" checked={showLogins} onChange={(e) => setShowLogins(e.target.checked)} className="size-4 accent-[var(--primary)]" />
            {tr("إظهار تسجيلات الدخول", "Show logins")}
          </label>
        </div>
        {log.state.status === "loading" ? (
          <LoadingRows />
        ) : log.state.status === "error" ? (
          <ErrorBox error={log.state.error} onRetry={log.reload} />
        ) : rows.length ? (
          <ul className="divide-y divide-line">
            {rows.map((e) => (
              <li key={e.id} className="flex gap-3 px-4 py-3">
                <div className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full bg-card-2 text-xs font-bold">{e.user.name.slice(0, 1)}</div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2 text-sm">
                    <span className="font-medium">{e.user.name}</span>
                    <span className="text-xs text-muted">{e.user.id ? roleName(e.user.role, tr) : tr("تلقائي", "Automatic")}</span>
                    <Badge tone={tone(e.action)}>{actionLabel(e.action, tr)}</Badge>
                  </div>
                  <p className="mt-0.5 text-sm">{lang === "en" ? e.summary_en : e.summary}</p>
                </div>
                <span className="num shrink-0 text-xs text-muted">{dateTime(e.at)}</span>
              </li>
            ))}
          </ul>
        ) : (
          <Empty icon={<History className="size-6" />} title={tr("لا توجد عمليات", "No activity")} />
        )}
      </Card>
    </>
  );
}
