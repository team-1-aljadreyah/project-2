"use client";

// "حسابي" (my account), opened from the account menu in the top bar.
//   - Everyone: their picture (change it at any time; removing one is the manager's, on the users page).
//   - The shop owner also: his password, removing one of his shops, and deleting the whole account. Each of
//     those asks for his password first, and the server refuses while money or orders are still open.
import { useRef, useState } from "react";
import { Camera, KeyRound, LogOut, Store, Trash2 } from "lucide-react";
import { useAppRouter } from "@/lib/app-path";
import { api, ApiError } from "@/lib/api";
import type { User } from "@/lib/api/types";
import { signOut, updateUser } from "@/lib/auth";
import { useFmt } from "@/lib/i18n";
import { shrinkImage } from "@/lib/image";
import { useLoad } from "@/lib/use-load";
import { cn } from "@/lib/utils";
import { jobName } from "@/components/status";
import { Button, Dialog, errorText, Field, Input, Notice, useToast } from "@/components/ui";

/** A person's picture, or the first letter of the name on a colored circle. */
export function Avatar({ user, size = 32, className }: { user: Pick<User, "name" | "photo">; size?: number; className?: string }) {
  const style = { width: size, height: size };
  if (user.photo)
    return (
      // eslint-disable-next-line @next/next/no-img-element -- a small data URL, nothing for next/image to optimize
      <img src={user.photo} alt="" style={style} className={cn("shrink-0 rounded-full object-cover", className)} />
    );
  return (
    <span style={{ ...style, fontSize: Math.round(size * 0.42) }} className={cn("flex shrink-0 items-center justify-center rounded-full bg-primary font-bold text-on-primary", className)}>
      {user.name.trim().slice(0, 1)}
    </span>
  );
}

export function MyAccountDialog({ user, onClose }: { user: User; onClose: () => void }) {
  const { tr } = useFmt();
  const shop = user.role === "shop";
  return (
    <Dialog open onClose={onClose} title={tr("حسابي", "My account")} footer={<Button onClick={onClose}>{tr("إغلاق", "Close")}</Button>}>
      <div className="space-y-5">
        <PhotoPart user={user} />
        {shop && <PasswordPart />}
        {shop && <ShopsPart user={user} />}
        {shop && <DeletePart />}
      </div>
    </Dialog>
  );
}

function Section({ icon, title, children, danger }: { icon: React.ReactNode; title: string; children: React.ReactNode; danger?: boolean }) {
  return (
    <section className={cn("rounded-2xl border p-4", danger ? "border-danger/40" : "border-line")}>
      <h3 className={cn("mb-3 flex items-center gap-2 text-sm font-bold", danger && "text-danger")}>
        {icon} {title}
      </h3>
      {children}
    </section>
  );
}

function PhotoPart({ user }: { user: User }) {
  const { tr } = useFmt();
  const toast = useToast();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  async function pick(file: File | undefined) {
    if (!file) return;
    setBusy(true);
    try {
      // Small and light: 320 px is plenty for a round picture, and quick on a weak connection.
      const photo = await shrinkImage(file, 320, 0.8);
      updateUser(await api.setMyPhoto(photo));
      toast("success", tr("تغيّرت صورتك", "Your picture changed"));
    } catch (e) {
      toast("danger", errorText(e, tr));
    } finally {
      setBusy(false);
      if (input.current) input.current.value = "";
    }
  }
  return (
    <div className="flex items-center gap-4">
      <button type="button" onClick={() => input.current?.click()} className="group relative shrink-0 rounded-full" aria-label={tr("تغيير الصورة", "Change the picture")}>
        <Avatar user={user} size={76} />
        <span className="absolute -bottom-1 -end-1 flex size-8 items-center justify-center rounded-full border-2 border-card bg-primary text-on-primary transition group-hover:scale-105">
          <Camera className="size-4" />
        </span>
      </button>
      <div className="min-w-0 flex-1">
        <p className="truncate text-lg font-bold">{user.name}</p>
        <p className="text-xs text-muted">
          {jobName(user, tr)} · <span dir="ltr">{user.phone}</span>
        </p>
        <Button size="sm" className="mt-2" loading={busy} onClick={() => input.current?.click()}>
          <Camera className="size-4" /> {user.photo ? tr("تغيير الصورة", "Change the picture") : tr("أضف صورتك", "Add your picture")}
        </Button>
      </div>
      <input ref={input} type="file" accept="image/*" className="hidden" onChange={(e) => pick(e.target.files?.[0])} />
    </div>
  );
}

function PasswordPart() {
  const { tr } = useFmt();
  const toast = useToast();
  const [f, setF] = useState({ current: "", next: "", again: "" });
  const [err, setErr] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  async function save() {
    if (f.next !== f.again) return setErr({ again: tr("كلمتا المرور غير متطابقتين", "The two passwords don't match") });
    setBusy(true);
    setErr({});
    try {
      await api.changeMyPassword(f.current, f.next);
      setF({ current: "", next: "", again: "" });
      toast("success", tr("تغيّرت كلمة المرور", "Password changed"));
    } catch (e) {
      if (e instanceof ApiError && e.errors) setErr(e.errors);
      else toast("danger", errorText(e, tr));
    } finally {
      setBusy(false);
    }
  }
  return (
    <Section icon={<KeyRound className="size-4" />} title={tr("كلمة المرور", "Password")}>
      <div className="grid gap-3 sm:grid-cols-3">
        <Field label={tr("الحالية", "Current")} error={err.current}>
          <Input type="password" dir="ltr" autoComplete="current-password" value={f.current} onChange={(e) => setF({ ...f, current: e.target.value })} />
        </Field>
        <Field label={tr("الجديدة", "New")} error={err.next}>
          <Input type="password" dir="ltr" autoComplete="new-password" value={f.next} onChange={(e) => setF({ ...f, next: e.target.value })} />
        </Field>
        <Field label={tr("أعد كتابتها", "Again")} error={err.again}>
          <Input type="password" dir="ltr" autoComplete="new-password" value={f.again} onChange={(e) => setF({ ...f, again: e.target.value })} />
        </Field>
      </div>
      <Button variant="primary" size="sm" className="mt-3" loading={busy} disabled={!f.current || !f.next || !f.again} onClick={save}>
        {tr("تغيير كلمة المرور", "Change the password")}
      </Button>
    </Section>
  );
}

/** "Type your password to confirm": the box under a dangerous button, until it is done or cancelled. */
function ConfirmBox({ text, action, busy, error, onConfirm, onCancel }: { text: string; action: string; busy: boolean; error: string | null; onConfirm: (password: string) => void; onCancel: () => void }) {
  const { tr } = useFmt();
  const [password, setPassword] = useState("");
  return (
    <div className="mt-3 space-y-3 rounded-xl bg-danger-soft/60 p-3">
      <p className="text-sm">{text}</p>
      <Field label={tr("اكتب كلمة المرور للتأكيد", "Type your password to confirm")}>
        <Input type="password" dir="ltr" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} autoFocus />
      </Field>
      {error && (
        <Notice tone="warning" title={tr("لم يتم", "Not done")}>
          {error}
        </Notice>
      )}
      <div className="flex flex-wrap gap-2">
        <Button variant="danger" size="sm" loading={busy} disabled={!password} onClick={() => onConfirm(password)}>
          <Trash2 className="size-4" /> {action}
        </Button>
        <Button size="sm" onClick={onCancel}>
          {tr("تراجع", "Cancel")}
        </Button>
      </div>
    </div>
  );
}

function ShopsPart({ user }: { user: User }) {
  const { tr } = useFmt();
  const toast = useToast();
  const shops = useLoad(() => api.myShops(), [user.id]);
  const [removing, setRemoving] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const list = shops.data ?? [];
  if (list.length < 2) return null;
  async function remove(id: number, password: string) {
    setBusy(true);
    setError(null);
    try {
      const name = list.find((s) => s.id === id)?.name ?? "";
      updateUser(await api.removeMyShop(id, password));
      setRemoving(null);
      toast("success", tr(`أُزيل ${name} من حسابك`, `${name} was removed from your account`));
    } catch (e) {
      setError(errorText(e, tr));
    } finally {
      setBusy(false);
    }
  }
  return (
    <Section icon={<Store className="size-4" />} title={tr("محلاتي", "My shops")}>
      <ul className="space-y-2">
        {list.map((s) => (
          <li key={s.id} className="rounded-xl bg-card-2 px-3 py-2">
            <div className="flex items-center gap-2">
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-semibold">{s.name}</span>
                <span className="text-xs text-muted">
                  {s.area}
                  {s.id === user.customer_id && ` · ${tr("تعمل عليه الآن", "current")}`}
                </span>
              </span>
              {removing !== s.id && (
                <Button
                  size="sm"
                  variant="ghost"
                  className="text-danger"
                  onClick={() => {
                    setRemoving(s.id);
                    setError(null);
                  }}
                >
                  <Trash2 className="size-4" /> {tr("إزالة", "Remove")}
                </Button>
              )}
            </div>
            {removing === s.id && (
              <ConfirmBox
                text={tr(
                  `سيُزال ${s.name} من حسابك ويتوقف عن الطلب. فواتيره وسجلاته تبقى عند الشركة. لا يُزال إذا بقي عليه دين أو طلب لم ينتهِ.`,
                  `${s.name} leaves your account and stops ordering. Its invoices and records stay with the company. Not while it owes money or has an order not finished.`,
                )}
                action={tr("إزالة المحل", "Remove the shop")}
                busy={busy}
                error={error}
                onConfirm={(p) => remove(s.id, p)}
                onCancel={() => setRemoving(null)}
              />
            )}
          </li>
        ))}
      </ul>
    </Section>
  );
}

function DeletePart() {
  const { tr } = useFmt();
  const router = useAppRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function remove(password: string) {
    setBusy(true);
    setError(null);
    try {
      await api.deleteMyAccount(password);
      signOut();
      router.replace("/login");
    } catch (e) {
      setError(errorText(e, tr));
      setBusy(false);
    }
  }
  return (
    <Section danger icon={<LogOut className="size-4" />} title={tr("حذف الحساب", "Delete the account")}>
      <p className="text-sm text-muted">{tr("يُحذف دخولك نهائياً وتتوقف محلاتك عن الطلب. لا يمكن التراجع.", "Your login goes for good and your shops stop ordering. This can't be undone.")}</p>
      {!open ? (
        <Button variant="danger" size="sm" className="mt-3" onClick={() => setOpen(true)}>
          <Trash2 className="size-4" /> {tr("حذف حسابي", "Delete my account")}
        </Button>
      ) : (
        <ConfirmBox
          text={tr(
            "متأكد؟ يجب أن تكون كل الديون مسددة وكل الطلبات منتهية. فواتيرك وسجلاتك تبقى عند الشركة للحسابات.",
            "Sure? All debts must be paid and all orders finished. Your invoices and records stay with the company for the accounts.",
          )}
          action={tr("حذف الحساب نهائياً", "Delete the account for good")}
          busy={busy}
          error={error}
          onConfirm={remove}
          onCancel={() => setOpen(false)}
        />
      )}
    </Section>
  );
}
