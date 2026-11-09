"use client";

import { useState } from "react";
import { Pencil, Plus } from "lucide-react";
import { useApp } from "@/components/shell";
import { roleName } from "@/components/status";
import { Badge, Button, Card, DataTable, Dialog, ErrorBox, Field, Input, LoadingRows, PageHeader, Select, Switch, errorText, useToast, type Column } from "@/components/ui";
import { api, ApiError } from "@/lib/api";
import type { Role, User, UserInput } from "@/lib/api/types";
import { useFmt } from "@/lib/i18n";
import { useLoad } from "@/lib/use-load";

const ROLES: Role[] = ["manager", "warehouse", "rep", "accountant", "shop"];

export default function UsersPage() {
  const { tr, name } = useFmt();
  const { lookups } = useApp();
  const users = useLoad(() => api.listUsers(), []);
  const customers = useLoad(() => api.listCustomers(), []);
  const [edit, setEdit] = useState<User | "new" | null>(null);
  const columns: Column<User>[] = [
    { key: "n", head: tr("الاسم", "Name"), cell: (u) => <span className="font-medium">{u.name}</span> },
    { key: "p", head: tr("الهاتف", "Phone"), cell: (u) => <span dir="ltr" className="num">{u.phone}</span> },
    { key: "r", head: tr("الدور", "Role"), cell: (u) => <Badge tone="primary">{roleName(u.role, tr)}</Badge> },
    {
      key: "x",
      head: tr("مرتبط بـ", "Linked to"),
      cell: (u) =>
        u.role === "warehouse" ? name(lookups.warehouses.find((w) => w.id === u.warehouse_id)) : u.role === "shop" ? customers.data?.find((c) => c.id === u.customer_id)?.name ?? "-" : "-",
    },
    { key: "s", head: tr("الحالة", "Status"), cell: (u) => (u.active ? <Badge tone="success">{tr("فعّال", "Active")}</Badge> : <Badge>{tr("موقوف", "Disabled")}</Badge>) },
    {
      key: "e",
      head: "",
      cell: (u) => (
        <Button size="sm" variant="ghost" onClick={() => setEdit(u)}>
          <Pencil className="size-4" /> {tr("تعديل", "Edit")}
        </Button>
      ),
      align: "end",
    },
  ];
  return (
    <>
      <PageHeader
        title={tr("المستخدمون والصلاحيات", "Users and roles")}
        subtitle={tr("كل واحد يشوف بس اللي يخصه: المندوب ما يشوف سعر الشراء، وأمين المخزن ما يشوف الديون", "Each person sees only their part: reps never see cost, the warehouse never sees debts")}
        actions={
          <Button variant="primary" onClick={() => setEdit("new")}>
            <Plus className="size-4" /> {tr("مستخدم جديد", "New user")}
          </Button>
        }
      />
      <Card>
        {users.state.status === "loading" ? (
          <LoadingRows />
        ) : users.state.status === "error" ? (
          <ErrorBox error={users.state.error} onRetry={users.reload} />
        ) : (
          <DataTable
            rows={users.data ?? []}
            columns={columns}
            rowKey={(u) => u.id}
            mobile={(u) => (
              <button type="button" className="flex w-full items-center justify-between gap-2 text-start" onClick={() => setEdit(u)}>
                <span>
                  <span className="block font-medium">{u.name}</span>
                  <span className="text-xs text-muted" dir="ltr">
                    {u.phone}
                  </span>
                </span>
                <Badge tone={u.active ? "primary" : "neutral"}>{roleName(u.role, tr)}</Badge>
              </button>
            )}
          />
        )}
      </Card>
      {edit && <UserDialog user={edit === "new" ? undefined : edit} customers={customers.data ?? []} onClose={() => setEdit(null)} onSaved={users.reload} />}
    </>
  );
}

function UserDialog({ user, customers, onClose, onSaved }: { user?: User; customers: { id: number; name: string }[]; onClose: () => void; onSaved: () => void }) {
  const { tr, name } = useFmt();
  const { lookups } = useApp();
  const toast = useToast();
  const [f, setF] = useState<UserInput>({
    name: user?.name ?? "",
    phone: user?.phone ?? "",
    role: user?.role ?? "rep",
    warehouse_id: user?.warehouse_id ?? lookups.warehouses[0].id,
    customer_id: user?.customer_id,
    active: user?.active ?? true,
    password: "",
  });
  const [err, setErr] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const set = (p: Partial<UserInput>) => setF((x) => ({ ...x, ...p }));
  return (
    <Dialog
      open
      onClose={onClose}
      title={user ? tr("تعديل مستخدم", "Edit user") : tr("مستخدم جديد", "New user")}
      footer={
        <>
          <Button onClick={onClose}>{tr("إلغاء", "Cancel")}</Button>
          <Button
            variant="primary"
            loading={busy}
            onClick={async () => {
              setBusy(true);
              setErr({});
              try {
                await api.saveUser(user?.id ?? null, { ...f, password: f.password || undefined });
                toast("success", tr("انحفظ المستخدم", "User saved"));
                onSaved();
                onClose();
              } catch (e) {
                if (e instanceof ApiError && e.errors) setErr(e.errors);
                toast("danger", errorText(e, tr));
              } finally {
                setBusy(false);
              }
            }}
          >
            {tr("حفظ", "Save")}
          </Button>
        </>
      }
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label={tr("الاسم", "Name")} error={err.name}>
          <Input value={f.name} onChange={(e) => set({ name: e.target.value })} />
        </Field>
        <Field label={tr("الهاتف (لتسجيل الدخول)", "Phone (for login)")} error={err.phone}>
          <Input dir="ltr" inputMode="tel" className="text-start" value={f.phone} onChange={(e) => set({ phone: e.target.value })} />
        </Field>
        <Field label={tr("الدور", "Role")} error={err.role}>
          <Select value={f.role} onChange={(e) => set({ role: e.target.value as Role })}>
            {ROLES.map((r) => (
              <option key={r} value={r}>
                {roleName(r, tr)}
              </option>
            ))}
          </Select>
        </Field>
        {f.role === "warehouse" && (
          <Field label={tr("المخزن", "Warehouse")} error={err.warehouse_id}>
            <Select value={f.warehouse_id} onChange={(e) => set({ warehouse_id: Number(e.target.value) })}>
              {lookups.warehouses.map((w) => (
                <option key={w.id} value={w.id}>
                  {name(w)}
                </option>
              ))}
            </Select>
          </Field>
        )}
        {f.role === "shop" && (
          <Field label={tr("المحل", "Shop")} error={err.customer_id}>
            <Select value={f.customer_id ?? ""} onChange={(e) => set({ customer_id: Number(e.target.value) || undefined })}>
              <option value="">{tr("اختر", "Choose")}</option>
              {customers.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
          </Field>
        )}
        <Field label={user ? tr("كلمة مرور جديدة (اختياري)", "New password (optional)") : tr("كلمة المرور", "Password")} error={err.password}>
          <Input type="password" dir="ltr" value={f.password} onChange={(e) => set({ password: e.target.value })} autoComplete="new-password" />
        </Field>
        <div className="sm:col-span-2">
          <Switch checked={f.active} onChange={(v) => set({ active: v })} label={tr("الحساب فعّال", "Account active")} />
        </div>
      </div>
    </Dialog>
  );
}
