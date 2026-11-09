"use client";

import { useState } from "react";
import { AlertTriangle, Plus, Users } from "lucide-react";
import { CustomerForm } from "@/components/customer-form";
import { useApp } from "@/components/shell";
import { Badge, Button, Card, DataTable, Empty, ErrorBox, LimitBar, LoadingRows, Money, PageHeader, SearchBox, Segmented, Select, Stat, type Column } from "@/components/ui";
import { api } from "@/lib/api";
import type { Customer } from "@/lib/api/types";
import { useFmt } from "@/lib/i18n";
import { useLoad } from "@/lib/use-load";
import { matches } from "@/lib/utils";

type F = "all" | "debt" | "near" | "over" | "pending";

export default function CustomersPage() {
  const { tr, name, ago, money } = useFmt();
  const { user, lookups } = useApp();
  const list = useLoad(() => api.listCustomers(), []);
  const [f, setF] = useState<F>("all");
  const [rep, setRep] = useState<number | "">("");
  const [q, setQ] = useState("");
  const [add, setAdd] = useState(false);
  const all = list.data ?? [];
  const pct = (c: Customer) => (c.debt_limit ? (c.balance ?? 0) / c.debt_limit : 0);
  const pass = (c: Customer, x: F) =>
    x === "pending" ? !!c.pending : x === "all" ? true : x === "debt" ? (c.balance ?? 0) > 0 : x === "near" ? pct(c) >= 0.8 && pct(c) < 1 : pct(c) >= 1;
  const waiting = all.filter((c) => c.pending).length;
  const rows = all
    .filter((c) => pass(c, f) && (!rep || c.rep_id === rep) && matches(q, c.name, c.owner_name, c.area, c.phone))
    .sort((a, b) => (b.balance ?? 0) - (a.balance ?? 0));
  const total = all.reduce((s, c) => s + Math.max(0, c.balance ?? 0), 0);
  const rName = (id: number) => lookups.reps.find((r) => r.id === id)?.name ?? "-";

  const columns: Column<Customer>[] = [
    {
      key: "n",
      head: tr("المحل", "Shop"),
      cell: (c) => (
        <span>
          {c.name} {c.pending ? <Badge tone="warning">{tr("ينتظر الموافقة", "Waiting approval")}</Badge> : !c.active && <Badge>{tr("موقوف", "Inactive")}</Badge>}
        </span>
      ),
    },
    { key: "o", head: tr("صاحب المحل", "Owner"), cell: (c) => c.owner_name },
    { key: "a", head: tr("المنطقة", "Area"), cell: (c) => c.area },
    ...(user.role !== "rep" ? [{ key: "r", head: tr("المندوب", "Rep"), cell: (c: Customer) => rName(c.rep_id) }] : []),
    { key: "t", head: tr("السعر", "Tier"), cell: (c) => <Badge tone="primary">{name(lookups.tiers.find((t) => t.id === c.tier_id))}</Badge> },
    {
      key: "b",
      head: tr("الدين / السقف", "Debt / limit"),
      cell: (c) => (
        <div className="min-w-40">
          <div className="mb-1 flex justify-between gap-2 text-xs">
            <Money value={c.balance} className="font-semibold" />
            <span className="num text-muted">{money(c.debt_limit, { bare: true })}</span>
          </div>
          <LimitBar balance={c.balance ?? 0} limit={c.debt_limit ?? 0} />
        </div>
      ),
    },
    { key: "l", head: tr("آخر طلب", "Last order"), cell: (c) => <span className="text-muted">{c.last_order_at ? ago(c.last_order_at) : "-"}</span> },
  ];

  return (
    <>
      <PageHeader
        title={user.role === "rep" ? tr("زبائني", "My customers") : tr("الزبائن والديون", "Customers and debts")}
        actions={
          user.role === "manager" && (
            <Button variant="primary" onClick={() => setAdd(true)}>
              <Plus className="size-4" /> {tr("زبون جديد", "New customer")}
            </Button>
          )
        }
      />
      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label={tr("مجموع الديون", "Total debt")} value={<Money value={total} />} />
        <Stat label={tr("عدد الزبائن", "Customers")} value={all.length} />
        <Stat label={tr("قريب من السقف", "Near the limit")} value={all.filter((c) => pass(c, "near")).length} tone="warning" icon={<AlertTriangle className="size-4" />} />
        <Stat label={tr("واصل السقف أو تجاوزه", "At or over limit")} value={all.filter((c) => pass(c, "over")).length} tone="danger" icon={<AlertTriangle className="size-4" />} />
      </div>
      <Card>
        <div className="flex flex-col gap-3 border-b border-line p-3 xl:flex-row xl:items-center xl:justify-between">
          <Segmented
            value={f}
            onChange={setF}
            options={[
              { value: "all", label: tr("الكل", "All"), count: all.length },
              { value: "debt", label: tr("عليهم دين", "Owe money"), count: all.filter((c) => pass(c, "debt")).length },
              { value: "near", label: tr("قريب من السقف", "Near limit"), count: all.filter((c) => pass(c, "near")).length },
              { value: "over", label: tr("واصل السقف", "At limit"), count: all.filter((c) => pass(c, "over")).length },
              // New shops that signed up online: shown only while there are some.
              ...(waiting ? [{ value: "pending" as F, label: tr("تنتظر الموافقة", "Waiting approval"), count: waiting }] : []),
            ]}
          />
          <div className="flex flex-col gap-2 sm:flex-row">
            {user.role !== "rep" && (
              <Select value={rep} onChange={(e) => setRep(Number(e.target.value) || "")} className="sm:w-44">
                <option value="">{tr("كل المندوبين", "All reps")}</option>
                {lookups.reps.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name}
                  </option>
                ))}
              </Select>
            )}
            <SearchBox value={q} onChange={setQ} placeholder={tr("المحل، صاحبه، المنطقة أو الهاتف", "Shop, owner, area or phone")} className="sm:w-72" />
          </div>
        </div>
        {list.state.status === "loading" ? (
          <LoadingRows />
        ) : list.state.status === "error" ? (
          <ErrorBox error={list.state.error} onRetry={list.reload} />
        ) : (
          <DataTable
            rows={rows}
            columns={columns}
            rowKey={(c) => c.id}
            onRowHref={(c) => `/customers/${c.id}`}
            mobile={(c) => (
              <div className="space-y-1.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-semibold">
                    {c.name} {c.pending && <Badge tone="warning">{tr("جديد", "New")}</Badge>}
                  </span>
                  <Money value={c.balance} className="font-semibold" />
                </div>
                <p className="text-xs text-muted">
                  {c.owner_name} · {c.area} · {name(lookups.tiers.find((t) => t.id === c.tier_id))}
                </p>
                <LimitBar balance={c.balance ?? 0} limit={c.debt_limit ?? 0} />
              </div>
            )}
            empty={<Empty icon={<Users className="size-6" />} title={tr("لا يوجد زبائن هنا", "No customers here")} />}
          />
        )}
      </Card>
      {add && <CustomerForm open onClose={() => setAdd(false)} onSaved={() => list.reload()} />}
    </>
  );
}
