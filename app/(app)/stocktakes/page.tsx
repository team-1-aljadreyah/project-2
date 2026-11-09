"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { ClipboardCheck, Plus } from "lucide-react";
import { useApp } from "@/components/shell";
import { Badge, Button, Card, DataTable, Dialog, Empty, ErrorBox, Field, LoadingRows, PageHeader, Select, errorText, useToast, type Column } from "@/components/ui";
import { api } from "@/lib/api";
import type { Stocktake } from "@/lib/api/types";
import { useFmt } from "@/lib/i18n";
import { useLoad } from "@/lib/use-load";

export default function StocktakesPage() {
  const { tr, dateTime, name } = useFmt();
  const { user, lookups } = useApp();
  const router = useRouter();
  const toast = useToast();
  const list = useLoad(() => api.listStocktakes(), []);
  const [open, setOpen] = useState(false);
  const [wh, setWh] = useState(user.warehouse_id ?? lookups.warehouses[0].id);
  const [busy, setBusy] = useState(false);
  const diffs = (s: Stocktake) => s.lines.filter((l) => l.counted_qty !== null && l.counted_qty !== l.system_qty).length;
  const counted = (s: Stocktake) => s.lines.filter((l) => l.counted_qty !== null).length;

  const columns: Column<Stocktake>[] = [
    { key: "n", head: tr("الرقم", "No."), cell: (s) => <span className="num">{s.number}</span> },
    { key: "w", head: tr("المخزن", "Warehouse"), cell: (s) => name(lookups.warehouses.find((w) => w.id === s.warehouse_id)) },
    { key: "d", head: tr("البداية", "Started"), cell: (s) => dateTime(s.created_at) },
    { key: "c", head: tr("تم عدّه", "Counted"), cell: (s) => <span className="num">{counted(s)} / {s.lines.length}</span> },
    { key: "f", head: tr("الفروقات", "Differences"), cell: (s) => (diffs(s) ? <Badge tone="warning">{diffs(s)}</Badge> : <span className="text-muted">0</span>) },
    { key: "s", head: tr("الحالة", "Status"), cell: (s) => (s.status === "open" ? <Badge tone="primary">{tr("مفتوح", "Open")}</Badge> : <Badge tone="success">{tr("مغلق", "Closed")}</Badge>) },
  ];

  return (
    <>
      <PageHeader
        title={tr("الجرد", "Stock count")}
        subtitle={tr("إذا طلع فرق بين النظام والرف، ينسجل الفرق مع سببه وما ينمسح", "If the shelf differs from the system, the difference is saved with a reason, never erased")}
        actions={
          <Button variant="action" onClick={() => setOpen(true)}>
            <Plus className="size-4" /> {tr("بدء جرد", "Start a count")}
          </Button>
        }
      />
      <Card>
        {list.state.status === "loading" ? (
          <LoadingRows />
        ) : list.state.status === "error" ? (
          <ErrorBox error={list.state.error} onRetry={list.reload} />
        ) : (
          <DataTable rows={list.data ?? []} columns={columns} rowKey={(s) => s.id} onRowHref={(s) => `/stocktakes/${s.id}`} empty={<Empty icon={<ClipboardCheck className="size-6" />} title={tr("لم يتم أي جرد بعد", "No counts yet")} />} />
        )}
      </Card>
      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title={tr("بدء جرد", "Start a count")}
        footer={
          <>
            <Button onClick={() => setOpen(false)}>{tr("إلغاء", "Cancel")}</Button>
            <Button
              variant="primary"
              loading={busy}
              onClick={async () => {
                setBusy(true);
                try {
                  const s = await api.createStocktake(wh);
                  router.push(`/stocktakes/${s.id}`);
                } catch (e) {
                  toast("danger", errorText(e, tr));
                  setBusy(false);
                }
              }}
            >
              {tr("ابدأ", "Start")}
            </Button>
          </>
        }
      >
        <Field label={tr("المخزن", "Warehouse")} hint={tr("النظام يحفظ الكميات الحالية، وأنت تكتب الموجود فعلاً على الرف", "The system saves current quantities; you write what is really on the shelf")}>
          <Select value={wh} onChange={(e) => setWh(Number(e.target.value))} disabled={user.role === "warehouse"}>
            {lookups.warehouses.map((w) => (
              <option key={w.id} value={w.id}>
                {name(w)}
              </option>
            ))}
          </Select>
        </Field>
      </Dialog>
    </>
  );
}
