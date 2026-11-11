"use client";

import Link from "next/link";
import { AlertTriangle, Bell, CheckCheck, DollarSign, Headset, Percent, Lock, MessageCircle, PackageCheck, PackageX, ShieldAlert, ShoppingBag, CheckCircle2, Truck, UserPlus } from "lucide-react";
import { Button, Card, Empty, ErrorBox, LoadingRows, PageHeader } from "@/components/ui";
import { api } from "@/lib/api";
import type { NotificationType } from "@/lib/api/types";
import { useFmt } from "@/lib/i18n";
import { useLoad } from "@/lib/use-load";
import { cn } from "@/lib/utils";

const icon = (t: NotificationType) => {
  switch (t) {
    case "low_stock":
      return <PackageX className="size-5 text-danger" />;
    case "near_expiry":
      return <AlertTriangle className="size-5 text-warning" />;
    case "expired":
      return <AlertTriangle className="size-5 text-danger" />;
    case "needs_approval":
      return <ShieldAlert className="size-5 text-warning" />;
    case "shop_order":
      return <ShoppingBag className="size-5 text-primary-ink" />;
    case "order_confirmed":
      return <CheckCircle2 className="size-5 text-success" />;
    case "new_shop":
      return <UserPlus className="size-5 text-action" />;
    case "account_approved":
      return <CheckCircle2 className="size-5 text-success" />;
    case "out_for_delivery":
      return <Truck className="size-5 text-action" />;
    case "delivered":
      return <PackageCheck className="size-5 text-success" />;
    case "delivery_locked":
      return <Lock className="size-5 text-danger" />;
    case "support_message":
      return <Headset className="size-5 text-action" />;
    case "commission_earned":
      return <Percent className="size-5 text-success" />;
    case "usd_rate":
      return <DollarSign className="size-5 text-action" />;
    case "delivery_problem":
      return <AlertTriangle className="size-5 text-danger" />;
    case "support_reply":
      return <MessageCircle className="size-5 text-success" />;
  }
};

export default function NotificationsPage() {
  const { tr, ago, lang } = useFmt();
  const list = useLoad(() => api.listNotifications(), []);
  const unread = (list.data ?? []).filter((n) => !n.read).length;
  return (
    <>
      <PageHeader
        title={tr("الإشعارات", "Notifications")}
        subtitle={unread ? tr(`${unread} غير مقروء`, `${unread} unread`) : undefined}
        actions={
          unread > 0 && (
            <Button onClick={() => api.markAllRead()}>
              <CheckCheck className="size-4" /> {tr("تعليم الكل كمقروء", "Mark all read")}
            </Button>
          )
        }
      />
      <Card className="max-w-3xl">
        {list.state.status === "loading" ? (
          <LoadingRows />
        ) : list.state.status === "error" ? (
          <ErrorBox error={list.state.error} onRetry={list.reload} />
        ) : list.data?.length ? (
          <ul className="divide-y divide-line">
            {list.data.map((n) => {
              const body = (
                <div className={cn("flex gap-3 px-4 py-3", !n.read && "bg-primary-soft/40")}>
                  <div className="mt-0.5 shrink-0">{icon(n.type)}</div>
                  <div className="min-w-0 flex-1">
                    <p className={cn("text-sm", !n.read && "font-semibold")}>{lang === "en" ? n.title_en : n.title}</p>
                    <p className="text-sm text-muted">{lang === "en" ? n.body_en : n.body}</p>
                    <p className="mt-0.5 text-xs text-faint">{ago(n.created_at)}</p>
                  </div>
                  {!n.read && <span className="mt-2 size-2 shrink-0 rounded-full bg-action" aria-label={tr("غير مقروء", "Unread")} />}
                </div>
              );
              return (
                <li key={n.id}>
                  {n.link ? (
                    <Link href={n.link} onClick={() => !n.read && api.markRead(n.id)} className="block hover:bg-card-2">
                      {body}
                    </Link>
                  ) : (
                    body
                  )}
                </li>
              );
            })}
          </ul>
        ) : (
          <Empty icon={<Bell className="size-6" />} title={tr("لا توجد إشعارات", "No notifications")} />
        )}
      </Card>
    </>
  );
}
