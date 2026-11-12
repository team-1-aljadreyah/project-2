"use client";

import { useRemembered } from "@/lib/remember";

// Expenses (صرفيات): the money that goes out for running the company, not for goods: rent, salaries, the
// generator, fuel, repairs, loading labour… Each one is a payment voucher (سند صرف) with who got the money,
// how it was paid, what it was for (a warehouse, a vehicle) and a picture of the bill.
// Above a limit the manager says yes first. Nothing is deleted: a wrong voucher is cancelled with a reason.
// The month's total comes off the profit (the dashboard shows the net profit after expenses).
import { useState } from "react";
import { Banknote, FileDown, Plus } from "lucide-react";
import { useApp } from "@/components/shell";
import { ExpenseBadge, NewExpenseDialog, categoryName } from "@/components/expenses";
import { useWarehouseFilter } from "@/components/warehouse-filter";
import { Card, DataTable, Empty, ErrorBox, Input, LoadingRows, Money, PageHeader, Segmented, Stat, Button, type Column } from "@/components/ui";
import { useAppRouter } from "@/lib/app-path";
import { api } from "@/lib/api";
import { EXPENSE_CATEGORIES, type Expense } from "@/lib/api/types";
import { useFmt } from "@/lib/i18n";
import { useLoad } from "@/lib/use-load";
import { cn, downloadCsv, today } from "@/lib/utils";

type Show = "all" | "pending" | "approved" | "off";

export default function ExpensesPage() {
  const { tr, date, name, money, num } = useFmt();
  const { lookups } = useApp();
  const router = useAppRouter();
  const list = useLoad(() => api.listExpenses(), []);
  const dash = useLoad(() => api.dashboard(), []);
  const wh = useWarehouseFilter();
  const [month, setMonth] = useRemembered("expenses:month", () => today().slice(0, 7));
  const [show, setShow] = useRemembered<Show>("expenses:show", "all");
  const [cat, setCat] = useRemembered<string | null>("expenses:cat", null);
  const [adding, setAdding] = useState(false);

  const all = list.data ?? [];
  // The categories offered: the usual ones, then any new one already used.
  const categories = [...new Set([...EXPENSE_CATEGORIES.map((c) => c.ar), ...all.map((e) => e.category)])];
  const inMonth = all.filter((e) => e.date.startsWith(month) && (!wh || e.warehouse_id === wh));
  const paid = inMonth.filter((e) => e.status === "approved");
  const total = paid.reduce((s, e) => s + e.amount, 0);
  const waiting = all.filter((e) => e.status === "pending");
  const cash = paid.filter((e) => e.method === "cash").reduce((s, e) => s + e.amount, 0);
  // Last month, for "more or less than last month".
  const prevMonth = (() => {
    const [y, m] = month.split("-").map(Number);
    const d = new Date(Date.UTC(y, m - 2, 1));
    return d.toISOString().slice(0, 7);
  })();
  const prevTotal = all.filter((e) => e.status === "approved" && e.date.startsWith(prevMonth) && (!wh || e.warehouse_id === wh)).reduce((s, e) => s + e.amount, 0);
  const byCat = [...new Set(paid.map((e) => e.category))]
    .map((c) => ({ c, sum: paid.filter((e) => e.category === c).reduce((s, e) => s + e.amount, 0), n: paid.filter((e) => e.category === c).length }))
    .sort((a, b) => b.sum - a.sum);

  const rows = inMonth.filter(
    (e) =>
      (show === "all" || (show === "off" ? e.status === "cancelled" || e.status === "rejected" : e.status === show)) &&
      (!cat || e.category === cat),
  );
  const whName = (id?: number) => (id ? name(lookups.warehouses.find((w) => w.id === id)) : tr("عام", "General"));
  const vehicleName = (id?: number) => lookups.vehicles.find((v) => v.id === id)?.name;

  const columns: Column<Expense>[] = [
    { key: "n", head: tr("السند", "Voucher"), cell: (e) => <span className={cn("num font-semibold", e.status === "cancelled" && "line-through opacity-60")}>{e.number}</span> },
    { key: "d", head: tr("التاريخ", "Date"), cell: (e) => <span className="num">{date(e.date)}</span> },
    { key: "c", head: tr("البند", "Category"), cell: (e) => categoryName(e.category, tr) },
    {
      key: "t",
      head: tr("دُفع إلى", "Paid to"),
      cell: (e) => (
        <span className="block max-w-56 truncate">
          {e.paid_to}
          {e.vehicle_id ? <span className="text-muted"> · {vehicleName(e.vehicle_id)}</span> : null}
        </span>
      ),
    },
    { key: "w", head: tr("المخزن", "Warehouse"), cell: (e) => whName(e.warehouse_id) },
    { key: "m", head: tr("الدفع", "Paid by"), cell: (e) => (e.method === "cash" ? tr("نقداً", "Cash") : tr("تحويل", "Transfer")) },
    { key: "a", head: tr("المبلغ", "Amount"), cell: (e) => <Money value={e.amount} className={cn("font-semibold", e.status !== "approved" && "opacity-60")} />, align: "end" },
    { key: "s", head: tr("الحالة", "Status"), cell: (e) => <ExpenseBadge status={e.status} /> },
  ];

  function exportCsv() {
    downloadCsv(`expenses-${month}.csv`, [
      [tr("السند", "Voucher"), tr("التاريخ", "Date"), tr("البند", "Category"), tr("دُفع إلى", "Paid to"), tr("المخزن", "Warehouse"), tr("السيارة", "Vehicle"), tr("الدفع", "Paid by"), tr("المبلغ", "Amount"), tr("الحالة", "Status"), tr("ملاحظة", "Note"), tr("كتبه", "By")],
      ...rows.map((e) => [e.number, e.date, categoryName(e.category, tr), e.paid_to, whName(e.warehouse_id), vehicleName(e.vehicle_id) ?? "", e.method === "cash" ? tr("نقداً", "Cash") : tr("تحويل", "Transfer"), e.amount, e.status, e.note ?? "", e.created_by.name]),
    ]);
  }

  return (
    <>
      <PageHeader
        title={tr("الصرفيات", "Expenses")}
        subtitle={tr("كل مبلغ يخرج لتشغيل الشركة: إيجار، رواتب، مولدة، وقود، صيانة… بسند صرف وصورة الفاتورة.", "Every amount paid to run the company: rent, salaries, generator, fuel, repairs… with a voucher and the bill.")}
        actions={
          <>
            <Button onClick={exportCsv} disabled={!rows.length}>
              <FileDown className="size-4" /> {tr("تصدير", "Export")}
            </Button>
            <Button variant="action" onClick={() => setAdding(true)}>
              <Plus className="size-4" /> {tr("صرف جديد", "New expense")}
            </Button>
          </>
        }
      />

      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat
          label={tr("صرفيات الشهر", "This month")}
          value={<Money value={total} />}
          hint={prevTotal ? tr(`الشهر الماضي ${money(prevTotal)}`, `Last month ${money(prevTotal)}`) : undefined}
          icon={<Banknote className="size-4" />}
          tone="warning"
        />
        <Stat label={tr("نقداً من الصندوق", "Cash from the box")} value={<Money value={cash} />} hint={tr(`تحويل ${money(total - cash)}`, `Transfer ${money(total - cash)}`)} />
        <Stat
          label={tr("بانتظار موافقة المدير", "Waiting for the manager")}
          value={num(waiting.length)}
          hint={waiting.length ? money(waiting.reduce((s, e) => s + e.amount, 0)) : undefined}
          tone={waiting.length ? "danger" : undefined}
        />
        {dash.data?.month_net !== undefined && month === today().slice(0, 7) ? (
          <Stat label={tr("صافي الربح بعد الصرفيات", "Net profit after expenses")} value={<Money value={dash.data.month_net} />} hint={tr(`ربح المبيعات ${money(dash.data.month_profit ?? 0)}`, `Sales profit ${money(dash.data.month_profit ?? 0)}`)} tone={dash.data.month_net < 0 ? "danger" : "success"} />
        ) : (
          <Stat label={tr("عدد السندات", "Vouchers")} value={num(paid.length)} />
        )}
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_300px]">
        <Card className="min-w-0">
          <div className="flex flex-wrap items-center gap-2 border-b border-line p-3">
            <Input type="month" value={month} max={today().slice(0, 7)} onChange={(e) => e.target.value && setMonth(e.target.value)} className="w-40" />
            <Segmented
              value={show}
              onChange={setShow}
              options={[
                { value: "all", label: tr("الكل", "All"), count: inMonth.length },
                { value: "approved", label: tr("مصروفة", "Paid"), count: paid.length },
                { value: "pending", label: tr("بانتظار المدير", "Waiting"), count: inMonth.filter((e) => e.status === "pending").length },
                { value: "off", label: tr("ملغاة ومرفوضة", "Cancelled"), count: inMonth.filter((e) => e.status === "cancelled" || e.status === "rejected").length },
              ]}
            />
            {cat && (
              <button type="button" onClick={() => setCat(null)} className="rounded-full bg-primary-soft px-3 py-1 text-xs font-semibold text-primary-ink">
                {categoryName(cat, tr)} ✕
              </button>
            )}
          </div>
          {list.state.status === "loading" ? (
            <LoadingRows />
          ) : list.state.status === "error" ? (
            <ErrorBox error={list.state.error} onRetry={list.reload} />
          ) : (
            <DataTable
              rows={rows}
              columns={columns}
              rowKey={(e) => e.id}
              rowAction={(e) => () => router.push(`/expenses/${e.id}`)}
              mobile={(e) => (
                <button type="button" onClick={() => router.push(`/expenses/${e.id}`)} className="flex w-full items-center justify-between gap-3 text-start">
                  <span className="min-w-0">
                    <span className="block truncate font-semibold">
                      {categoryName(e.category, tr)} · {e.paid_to}
                    </span>
                    <span className="text-xs text-muted">
                      <span className="num">{e.number}</span> · {date(e.date)} · {whName(e.warehouse_id)}
                    </span>
                  </span>
                  <span className="shrink-0 text-end">
                    <Money value={e.amount} className="block font-bold" />
                    <ExpenseBadge status={e.status} />
                  </span>
                </button>
              )}
              empty={<Empty icon={<Banknote className="size-6" />} title={tr("لا صرفيات هنا", "No expenses here")} body={tr("سجّل أول سند صرف من «صرف جديد».", "Add the first one from “New expense”.")} />}
            />
          )}
        </Card>

        {/* Where the month's money went: the biggest categories first. Click one to see its vouchers. */}
        <Card className="h-fit p-4">
          <p className="mb-3 font-bold">{tr("أين ذهبت صرفيات الشهر؟", "Where did the money go?")}</p>
          {byCat.length === 0 ? (
            <p className="text-sm text-muted">{tr("لا صرفيات مصروفة في هذا الشهر.", "Nothing paid this month.")}</p>
          ) : (
            <ul className="space-y-2.5">
              {byCat.map(({ c, sum, n }) => (
                <li key={c}>
                  <button type="button" onClick={() => setCat(cat === c ? null : c)} className={cn("box-row w-full rounded-xl p-2 text-start hover:bg-card-2", cat === c && "bg-card-2")}>
                    <span className="flex items-center justify-between gap-2 text-sm">
                      <span className="truncate font-medium">{categoryName(c, tr)}</span>
                      <Money value={sum} className="shrink-0 font-semibold" />
                    </span>
                    <span className="mt-1.5 block h-1.5 overflow-hidden rounded-full bg-card-2">
                      <span className="block h-full rounded-full bg-warning" style={{ width: `${Math.max(3, Math.round((sum / total) * 100))}%` }} />
                    </span>
                    <span className="mt-1 block text-[11px] text-muted">
                      {tr(`${Math.round((sum / total) * 100)}% · عدد السندات: ${n}`, `${Math.round((sum / total) * 100)}% · ${n} vouchers`)}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      {adding && <NewExpenseDialog categories={categories} onClose={() => setAdding(false)} onDone={(e) => router.push(`/expenses/${e.id}`)} />}
    </>
  );
}
