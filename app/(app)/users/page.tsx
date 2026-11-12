"use client";

import { useState } from "react";
import { ImageOff, Pencil, Plus, Trash2 } from "lucide-react";
import { Avatar } from "@/components/my-account";
import { useApp } from "@/components/shell";
import { getSession } from "@/lib/auth";
import { jobName, roleName } from "@/components/status";
import { cn } from "@/lib/utils";
import { Badge, Button, Card, DataTable, Dialog, ErrorBox, errorText, Field, Input, LoadingRows, Notice, PageHeader, RefLink, Select, Switch, useToast, type Column } from "@/components/ui";
import { api, ApiError } from "@/lib/api";
import type { Role, User, UserInput } from "@/lib/api/types";
import { useFmt } from "@/lib/i18n";
import { useLoad } from "@/lib/use-load";

const ROLES: Role[] = ["manager", "warehouse", "staff", "rep", "accountant", "shop"];

export default function UsersPage() {
  const { tr, name } = useFmt();
  const { lookups } = useApp();
  const users = useLoad(() => api.listUsers(), []);
  const customers = useLoad(() => api.listCustomers(), []);
  const [edit, setEdit] = useState<User | "new" | null>(null);
  const columns: Column<User>[] = [
    {
      key: "n",
      head: tr("الاسم", "Name"),
      cell: (u) => (
        <span className="flex items-center gap-2.5">
          <Avatar user={u} size={30} />
          <span className="font-medium">{u.name}</span>
        </span>
      ),
    },
    {
      key: "p",
      head: tr("الهاتف", "Phone"),
      cell: (u) => (
        <RefLink href={`tel:${u.phone}`} className="num">
          <span dir="ltr">{u.phone}</span>
        </RefLink>
      ),
    },
    { key: "r", head: tr("الدور", "Role"), cell: (u) => <Badge tone="primary">{jobName(u, tr)}</Badge> },
    {
      key: "x",
      head: tr("مرتبط بـ", "Linked to"),
      cell: (u) =>
        u.role === "warehouse" || u.role === "staff" ? (
          name(lookups.warehouses.find((w) => w.id === u.warehouse_id))
        ) : u.role === "shop" && u.customer_id ? (
          <RefLink href={`/customers/${u.customer_id}`}>{customers.data?.find((c) => c.id === u.customer_id)?.name ?? "-"}</RefLink>
        ) : (
          "-"
        ),
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
        subtitle={tr("كلٌّ يرى ما يخصه فقط: المندوب لا يرى سعر الشراء، وأمين المخزن لا يرى الديون", "Each person sees only their part: delivery reps never see cost, the warehouse never sees debts")}
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
            rowAction={(u) => () => setEdit(u)}
            mobile={(u) => (
              <button type="button" className="flex w-full items-center justify-between gap-2 text-start" onClick={() => setEdit(u)}>
                <Avatar user={u} size={36} />
                <span className="min-w-0 flex-1">
                  <span className="block font-medium">{u.name}</span>
                  <span className="text-xs text-muted" dir="ltr">
                    {u.phone}
                  </span>
                </span>
                <Badge tone={u.active ? "primary" : "neutral"}>{jobName(u, tr)}</Badge>
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
    rep_kinds: user?.rep_kinds?.length ? user.rep_kinds : ["sales", "delivery"],
    rep_categories: user?.rep_categories ?? [],
    active: user?.active ?? true,
    password: "",
  });
  const [err, setErr] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const set = (p: Partial<UserInput>) => setF((x) => ({ ...x, ...p }));
  const [photo, setPhoto] = useState(user?.photo);
  const [deleting, setDeleting] = useState(false);
  const isMe = !!user && getSession()?.user.id === user.id;
  async function removePhoto() {
    if (!user) return;
    try {
      await api.removeUserPhoto(user.id);
      setPhoto(undefined);
      toast("success", tr(`حُذفت صورة ${user.name}`, `${user.name}'s picture removed`));
      onSaved();
    } catch (e) {
      toast("danger", errorText(e, tr));
    }
  }
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
                toast("success", tr("تم حفظ المستخدم", "User saved"));
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
      {user && (
        <div className="mb-4 flex items-center gap-3 rounded-2xl bg-card-2 p-3">
          <Avatar user={{ name: user.name, photo }} size={52} />
          <p className="min-w-0 flex-1 text-xs text-muted">
            {photo ? tr("كل شخص يغيّر صورته من «حسابي»؛ حذفها من المدير فقط.", "Each person changes their picture from “My account”; only the manager removes one.") : tr("لا صورة له بعد: يضيفها من «حسابي».", "No picture yet: they add it from “My account”.")}
          </p>
          {photo && (
            <Button size="sm" variant="ghost" className="text-danger" onClick={removePhoto}>
              <ImageOff className="size-4" /> {tr("حذف الصورة", "Remove the picture")}
            </Button>
          )}
        </div>
      )}
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
        {f.role === "rep" && (
          <Field label={tr("عمل المندوب", "What the rep does")} error={err.rep_kinds} hint={tr("يمكن أن يعمل في الاثنين", "He can do both")}>
            <div className="flex flex-wrap gap-2">
              {(
                [
                  ["sales", tr("تسويق: يزور المحلات ويأخذ الطلبات ويحصّل", "Marketing: visits shops, takes orders, collects")],
                  ["delivery", tr("توصيل: يوصل الشحنات إلى المحلات", "Delivery: takes the shipments to the shops")],
                ] as const
              ).map(([k, label]) => {
                const on = f.rep_kinds?.includes(k) ?? false;
                return (
                  <label key={k} className={cn("flex cursor-pointer items-center gap-2 rounded-xl border px-3 py-2 text-sm", on ? "border-action bg-action/10" : "border-line")}>
                    <input
                      type="checkbox"
                      checked={on}
                      onChange={() => set({ rep_kinds: on ? (f.rep_kinds ?? []).filter((x) => x !== k) : [...(f.rep_kinds ?? []), k] })}
                      className="size-4 accent-[var(--action)]"
                    />
                    {label}
                  </label>
                );
              })}
            </div>
          </Field>
        )}
        {f.role === "rep" && (f.rep_kinds ?? []).includes("sales") && (
          <Field
            label={tr("الأصناف التي يبيعها", "Categories he sells")}
            hint={tr("بدون اختيار = كل الأصناف. المادة خارج أصنافه لا تظهر له أصلاً.", "None picked = all. Items outside them don't show to him at all.")}
          >
            <div className="flex flex-wrap gap-1.5">
              {lookups.categories.map((c) => {
                const on = f.rep_categories?.includes(c) ?? false;
                return (
                  <button
                    key={c}
                    type="button"
                    aria-pressed={on}
                    onClick={() => set({ rep_categories: on ? (f.rep_categories ?? []).filter((x) => x !== c) : [...(f.rep_categories ?? []), c] })}
                    className={cn("rounded-full border px-3 py-1 text-xs font-semibold", on ? "border-action bg-action/10 text-text" : "border-line text-muted hover:text-text")}
                  >
                    {c}
                  </button>
                );
              })}
            </div>
          </Field>
        )}
        {(f.role === "warehouse" || f.role === "staff") && (
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
      {user && !isMe && (
        <div className="mt-4 border-t border-line pt-4">
          {!deleting ? (
            <Button size="sm" variant="ghost" className="text-danger" onClick={() => setDeleting(true)}>
              <Trash2 className="size-4" /> {tr("حذف الحساب", "Delete the account")}
            </Button>
          ) : (
            <DeleteUser
              user={user}
              onCancel={() => setDeleting(false)}
              onDone={() => {
                onSaved();
                onClose();
              }}
            />
          )}
        </div>
      )}
    </Dialog>
  );
}

/**
 * "Delete this account?": type the person's name to confirm. The login goes for good (its phone is free again);
 * their name stays on everything they did. The server refuses while a rep still has shops, orders or shipments.
 */
function DeleteUser({ user, onCancel, onDone }: { user: User; onCancel: () => void; onDone: () => void }) {
  const { tr } = useFmt();
  const toast = useToast();
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);
  const [why, setWhy] = useState<string | null>(null);
  const sure = typed.trim() === user.name.trim();
  return (
    <div className="space-y-3 rounded-xl bg-danger-soft/60 p-3">
      <Notice tone="danger" title={tr("لا يمكن التراجع عن الحذف", "This can't be undone")}>
        {tr("لن يستطيع الدخول بعد الآن، ويبقى اسمه على كل ما عمله. إن أردت إيقافه مؤقتاً فأطفئ «الحساب فعّال» بدلاً من الحذف.", "They can't log in any more; their name stays on everything they did. To stop them for a while, switch “Account active” off instead.")}
      </Notice>
      <Field label={tr(`للتأكيد اكتب الاسم: ${user.name}`, `To confirm, type the name: ${user.name}`)}>
        <Input value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off" autoFocus />
      </Field>
      {why && (
        <Notice tone="warning" title={tr("لم يُحذف", "Not deleted")}>
          {why}
        </Notice>
      )}
      <div className="flex flex-wrap gap-2">
        <Button
          variant="danger"
          size="sm"
          loading={busy}
          disabled={!sure}
          onClick={async () => {
            setBusy(true);
            setWhy(null);
            try {
              await api.deleteUser(user.id);
              toast("success", tr(`حُذف حساب ${user.name}`, `${user.name}'s account deleted`));
              onDone();
            } catch (e) {
              setWhy(errorText(e, tr));
              setBusy(false);
            }
          }}
        >
          <Trash2 className="size-4" /> {tr("حذف نهائياً", "Delete for good")}
        </Button>
        <Button size="sm" onClick={onCancel}>
          {tr("تراجع", "Cancel")}
        </Button>
      </div>
    </div>
  );
}
