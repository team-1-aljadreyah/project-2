"use client";

// Advanced settings (the manager), after Salesforce's Setup, made simple for this site:
//   - Home: what is set up, and what needs a look.
//   - Permission profiles: a group inside a job with fewer pages and, if wanted, without profit or debts.
//   - Apps: named sets of pages with a color and an icon, for chosen jobs or profiles (the app launcher).
// Everything is saved with the site's settings (saveSite), so it reaches every open page at once.
import { useState } from "react";
import { ArrowDown, ArrowUp, Check, Lock, Pencil, Plus, Trash2, Users as UsersIcon } from "lucide-react";
import { AppIconPick, AppTile } from "@/components/app-launcher";
import { useApp } from "@/components/shell";
import { roleName } from "@/components/status";
import { Badge, Button, Card, Dialog, Empty, errorText, Field, Input, Notice, Switch, Textarea, useToast } from "@/components/ui";
import { NAV, type NavItem } from "@/components/nav";
import { api } from "@/lib/api";
import type { AppDef, CustomField, CustomObject, CustomType, CustomValue, Profile, ProfileAction, Role, User } from "@/lib/api/types";
import { PROFILE_ACTIONS } from "@/lib/api/types";
import { changedRules, rulesOf } from "@/lib/api/advanced";
import { FieldInput } from "@/components/custom-fields";
import { HealthCards, useHealth } from "@/components/health";
import { homeOf } from "@/lib/auth";
import { useFmt } from "@/lib/i18n";
import { saveSite, useSite } from "@/lib/site";
import { useLoad } from "@/lib/use-load";
import { cn } from "@/lib/utils";

export const JOBS: Profile["role"][] = ["accountant", "warehouse", "staff", "rep", "shop"];
/** The week from Saturday, as in Iraq. */
const WEEK: [number, string, string][] = [
  [6, "السبت", "Sat"],
  [0, "الأحد", "Sun"],
  [1, "الإثنين", "Mon"],
  [2, "الثلاثاء", "Tue"],
  [3, "الأربعاء", "Wed"],
  [4, "الخميس", "Thu"],
  [5, "الجمعة", "Fri"],
];
const actionName = (a: ProfileAction, tr: (x: string, y: string) => string) =>
  ({
    cancel_orders: tr("إلغاء الطلبات", "Cancel orders"),
    discount: tr("إعطاء خصم", "Give discounts"),
    payments: tr("تسجيل التسديدات", "Record payments"),
    returns: tr("تسجيل المرتجعات", "Record returns"),
    export: tr("تصدير الملفات (Excel / CSV)", "Export files"),
  })[a];
const ALL_ROLES: Role[] = ["manager", ...JOBS];
const COLORS = ["#e1692b", "#1fb5a5", "#3b82f6", "#8b5cf6", "#e11d74", "#16a34a", "#ca8a04", "#475569"];

/** The pages a job has (its menu). */
export const pagesOfRole = (role: Role) => NAV.filter((n) => n.roles.includes(role));
/** A job's home page can't be taken away (the person would have nowhere to land). */
const homesOf = (role: Role) => (role === "rep" ? ["/rep", "/deliveries"] : [homeOf(role)]);
const newId = (p: string) => `${p}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;

function useSave() {
  const toast = useToast();
  const { tr } = useFmt();
  return async (change: Parameters<typeof saveSite>[0], ok: string) => {
    try {
      await saveSite(change);
      toast("success", ok);
      return true;
    } catch (e) {
      toast("danger", errorText(e, tr));
      return false;
    }
  };
}

// ---------- Home ----------

export function SetupHome({ go }: { go: (s: string) => void }) {
  const { lookups } = useApp();
  const rules = rulesOf(lookups.settings);
  const changedCount = Object.keys(changedRules(rules)).length;
  const featuresOff = Object.values(rules.features).filter((v) => !v).length;
  const { tr } = useFmt();
  const { user } = useApp();
  const site = useSite();
  const users = useLoad(() => api.listUsers(), []);
  const health = useHealth();
  const list = users.data ?? [];
  const inProfiles = list.filter((u) => u.profile_id && site.profiles.some((p) => p.id === u.profile_id)).length;
  const emptyProfiles = site.profiles.filter((p) => !list.some((u) => u.profile_id === p.id));
  const orphanApps = site.apps.filter((a) => a.active && !a.roles.length && !a.profiles.length);
  const offApps = site.apps.filter((a) => !a.active);
  const notes = [
    ...orphanApps.map((a) => ({ tone: "warning" as const, text: tr(`التطبيق «${a.name}» مفعّل لكن لا أحد يراه: اختر له وظائف أو ملفات.`, `The app ${a.name} is on but nobody sees it.`), to: "apps" })),
    ...emptyProfiles.map((p) => ({ tone: "primary" as const, text: tr(`لا أحد في ملف «${p.name}» بعد.`, `Nobody is in ${p.name} yet.`), to: `profiles:${p.id}` })),
    ...offApps.map((a) => ({ tone: "primary" as const, text: tr(`التطبيق «${a.name}» مخفي عن الجميع.`, `The app ${a.name} is hidden.`), to: "apps" })),
  ];
  return (
    <div className="space-y-5">
      <div className="py-4 text-center">
        <h2 className="text-3xl font-bold">{tr(`أهلاً، ${user.name.split(" ")[0]}`, `Welcome, ${user.name.split(" ")[0]}`)}</h2>
        <p className="mt-2 text-muted">{tr("من هنا تضيف ملفات صلاحيات وتطبيقات وحقولاً وقواعد بنفسك، بلا مبرمج، وتصل التغييرات إلى الجميع فوراً.", "Add profiles, apps, fields and rules yourself, no developer needed; changes reach everyone at once.")}</p>
      </div>
      {health.data && (
        <>
          <div>
            <h3 className="text-lg font-bold">{tr("صحة الموقع واستعماله", "Site health and usage")}</h3>
            {(() => {
              const bad = health.data.checks.filter((c) => !c.ok);
              return bad.length ? (
                <p className="mt-2 rounded-xl border-s-4 border-primary bg-card px-4 py-2.5 text-sm">
                  <b>{tr("تنبيه:", "Heads up:")}</b> {tr(`${bad.length} مؤشرات تحتاج انتباهاً`, `${bad.length} measures need attention`)} ({bad.map((c) => tr(c.title, c.title_en)).join(tr("، ", ", "))}).
                </p>
              ) : null;
            })()}
          </div>
          <HealthCards h={health.data} />
        </>
      )}
      {/* While the measures load: the same space, so the page doesn't jump when they arrive. */}
      {!health.data && (
        <div aria-hidden className="space-y-3">
          <div className="h-7 w-56 rounded-lg bg-card-2" />
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="h-[23rem] animate-pulse rounded-2xl bg-card-2" />
            ))}
          </div>
        </div>
      )}
      <div className="grid gap-3 md:grid-cols-3">
        <HomeCard title={tr("ملفات الصلاحيات", "Permission profiles")} value={site.profiles.length} hint={tr(`${inProfiles} شخص داخل ملفات`, `${inProfiles} people in profiles`)} onClick={() => go("profiles")} />
        <HomeCard title={tr("التطبيقات", "Apps")} value={site.apps.filter((a) => a.active).length} hint={tr(`من ${site.apps.length} تطبيق`, `of ${site.apps.length} apps`)} onClick={() => go("apps")} />
        <HomeCard title={tr("المستخدمون", "Users")} value={list.filter((u) => u.active).length} hint={tr(`${list.length - inProfiles} بصلاحيات وظيفتهم المعتادة`, `${list.length - inProfiles} with the job's usual access`)} href="/users" />
        <HomeCard title={tr("قواعد عمل معدّلة", "Changed business rules")} value={changedCount} hint={tr("عن الافتراضي · السجل والملف", "from the defaults · history and file")} onClick={() => go("history")} />
        <HomeCard title={tr("ميزات متوقفة", "Features off")} value={featuresOff} hint={tr(`من ${Object.keys(rules.features).length} ميزات`, `of ${Object.keys(rules.features).length}`)} onClick={() => go("features")} />
      </div>
      <Card className="p-4">
        <p className="mb-3 font-bold">{tr("يحتاج نظرة", "Needs a look")}</p>
        {notes.length === 0 ? (
          <p className="text-sm text-muted">{tr("كل شيء مرتب. ابدأ بملف صلاحيات أو تطبيق جديد.", "All tidy. Start with a profile or a new app.")}</p>
        ) : (
          <ul className="space-y-2">
            {notes.map((n, i) => (
              <li key={i}>
                <button type="button" onClick={() => go(n.to)} className="box-row flex w-full items-center gap-3 rounded-xl bg-card-2 p-3 text-start text-sm hover:bg-card-2/70">
                  <span className={cn("size-2 shrink-0 rounded-full", n.tone === "warning" ? "bg-warning" : "bg-primary")} />
                  <span className="flex-1">{n.text}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}

function HomeCard({ title, value, hint, onClick, href }: { title: string; value: number; hint: string; onClick?: () => void; href?: string }) {
  const { num } = useFmt();
  const body = (
    <>
      <p className="text-sm font-semibold text-muted">{title}</p>
      <p className="num mt-2 text-4xl font-bold">{num(value)}</p>
      <p className="mt-1 text-xs text-muted">{hint}</p>
    </>
  );
  const cls = "box-row block rounded-2xl border border-line bg-card p-5 text-start transition hover:border-primary";
  return href ? (
    <a href={href} className={cls}>
      {body}
    </a>
  ) : (
    <button type="button" onClick={onClick} className={cls}>
      {body}
    </button>
  );
}

// ---------- Permission profiles ----------

export function ProfilesSection({ openId, go }: { openId?: string; go: (s: string) => void }) {
  const { tr, num } = useFmt();
  const site = useSite();
  const users = useLoad(() => api.listUsers(), []);
  const [adding, setAdding] = useState(false);
  const open = site.profiles.find((p) => p.id === openId);
  if (open) return <ProfileEditor key={open.id} profile={open} users={users.data ?? []} onBack={() => go("profiles")} />;
  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold">{tr("ملفات الصلاحيات", "Permission profiles")}</h2>
          <p className="text-sm text-muted">{tr("مجموعة داخل وظيفة: تأخذ منها صفحات، وتخفي الأرباح أو الديون إن أردت. لا تعطي أكثر مما للوظيفة.", "A group inside a job: takes pages away, can hide profit or debts. Never more than the job has.")}</p>
        </div>
        <Button variant="action" onClick={() => setAdding(true)}>
          <Plus className="size-4" /> {tr("ملف جديد", "New profile")}
        </Button>
      </div>
      {site.profiles.length === 0 ? (
        <Card>
          <Empty icon={<UsersIcon className="size-6" />} title={tr("لا ملفات بعد", "No profiles yet")} body={tr("مثال: «محاسب مساعد» يرى الفواتير والتسديدات فقط، بلا أرباح.", "e.g. an assistant accountant who sees invoices and payments only, without profit.")} />
        </Card>
      ) : (
        <Card className="overflow-hidden">
          <ul className="divide-y divide-line">
            {site.profiles.map((p) => {
              const all = pagesOfRole(p.role).length;
              const people = (users.data ?? []).filter((u) => u.profile_id === p.id).length;
              return (
                <li key={p.id}>
                  <button type="button" onClick={() => go(`profiles:${p.id}`)} className="box-row flex w-full flex-wrap items-center gap-3 p-4 text-start hover:bg-card-2">
                    <span className="min-w-0 flex-1">
                      <span className="block font-semibold">{tr(p.name, p.name_en || p.name)}</span>
                      <span className="block truncate text-xs text-muted">{p.description || roleName(p.role, tr)}</span>
                    </span>
                    <Badge tone="primary">{roleName(p.role, tr)}</Badge>
                    <span className="text-xs text-muted">{tr(`${num(all - p.denied.length)} من ${num(all)} صفحة`, `${all - p.denied.length} of ${all} pages`)}</span>
                    {p.limits.no_profit && <Badge tone="warning">{tr("بلا أرباح", "No profit")}</Badge>}
                    {p.limits.no_debt && <Badge tone="warning">{tr("بلا ديون", "No debts")}</Badge>}
                    {p.read_only && <Badge tone="warning">{tr("للعرض فقط", "See only")}</Badge>}
                    {p.hours && <Badge>{`${p.hours.from}–${p.hours.to}`}</Badge>}
                    <span className="flex items-center gap-1 text-xs text-muted">
                      <UsersIcon className="size-3.5" /> {num(people)}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </Card>
      )}
      {adding && <NewProfile onClose={() => setAdding(false)} onDone={(id) => go(`profiles:${id}`)} />}
    </div>
  );
}

function NewProfile({ onClose, onDone }: { onClose: () => void; onDone: (id: string) => void }) {
  const { tr } = useFmt();
  const save = useSave();
  const [name, setName] = useState("");
  const [role, setRole] = useState<Profile["role"]>("accountant");
  const [busy, setBusy] = useState(false);
  return (
    <Dialog
      open
      onClose={onClose}
      title={tr("ملف صلاحيات جديد", "New permission profile")}
      footer={
        <>
          <Button onClick={onClose}>{tr("إلغاء", "Cancel")}</Button>
          <Button
            variant="action"
            loading={busy}
            disabled={name.trim().length < 2}
            onClick={async () => {
              setBusy(true);
              const id = newId("p");
              const p: Profile = { id, name: name.trim(), role, denied: [], limits: {} };
              if (await save((s) => ({ ...s, profiles: [...s.profiles, p] }), tr("أُنشئ الملف: اختر صفحاته الآن", "Created: now choose its pages"))) {
                onDone(id);
                onClose();
              }
              setBusy(false);
            }}
          >
            {tr("أنشئ", "Create")}
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <Field label={tr("اسم الملف", "Name")}>
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder={tr("مثال: محاسب مساعد", "e.g. Assistant accountant")} autoFocus />
        </Field>
        <Field label={tr("مبني على وظيفة", "Built on the job")} hint={tr("يبدأ بكل صفحات الوظيفة، ثم تطفئ ما لا تريده", "Starts with all the job's pages; then switch off what you don't want")}>
          <div className="flex flex-wrap gap-2">
            {JOBS.map((r) => (
              <button key={r} type="button" onClick={() => setRole(r)} className={cn("rounded-xl border px-3 py-2 text-sm font-semibold", role === r ? "border-primary bg-primary-soft text-primary-ink" : "border-line hover:bg-card-2")}>
                {roleName(r, tr)}
              </button>
            ))}
          </div>
        </Field>
      </div>
    </Dialog>
  );
}

/** One profile: its name, its pages (on/off), what money it hides, its default app, and who is in it. */
function ProfileEditor({ profile, users, onBack }: { profile: Profile; users: User[]; onBack: () => void }) {
  const { tr } = useFmt();
  const site = useSite();
  const toast = useToast();
  const save = useSave();
  const [f, setF] = useState<Profile>(profile);
  const [busy, setBusy] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [moving, setMoving] = useState<number | null>(null);
  const homes = homesOf(f.role);
  const pages = pagesOfRole(f.role);
  const changed = JSON.stringify(f) !== JSON.stringify(profile);
  const sameJob = users.filter((u) => u.role === f.role && u.active);
  const apps = site.apps.filter((a) => a.roles.includes(f.role) || a.profiles.includes(f.id));
  const toggle = (h: string) => setF((x) => ({ ...x, denied: x.denied.includes(h) ? x.denied.filter((d) => d !== h) : [...x.denied, h] }));

  async function move(u: User, inIt: boolean) {
    setMoving(u.id);
    try {
      await api.setUserProfile(u.id, inIt ? f.id : null);
      toast("success", inIt ? tr(`${u.name} في «${f.name}» الآن`, `${u.name} is in ${f.name}`) : tr(`${u.name} عاد لصلاحيات وظيفته`, `${u.name} back to the job's access`));
    } catch (e) {
      toast("danger", errorText(e, tr));
    } finally {
      setMoving(null);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <button type="button" onClick={onBack} className="text-sm font-semibold text-primary-ink hover:underline">
          {tr("← كل الملفات", "← All profiles")}
        </button>
        <h2 className="flex-1 text-xl font-bold">{f.name || tr("ملف بلا اسم", "Unnamed")}</h2>
        <Badge tone="primary">{roleName(f.role, tr)}</Badge>
      </div>

      <Card className="grid gap-3 p-4 sm:grid-cols-2">
        <Field label={tr("الاسم", "Name")}>
          <Input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
        </Field>
        <Field label={tr("الاسم بالإنكليزية (اختياري)", "English name (optional)")}>
          <Input dir="ltr" value={f.name_en ?? ""} onChange={(e) => setF({ ...f, name_en: e.target.value || undefined })} />
        </Field>
        <Field label={tr("الوصف", "Description")} className="sm:col-span-2">
          <Textarea rows={2} value={f.description ?? ""} onChange={(e) => setF({ ...f, description: e.target.value || undefined })} placeholder={tr("لمن هذا الملف؟", "Who is it for?")} />
        </Field>
      </Card>

      <Card className="p-4">
        <p className="font-bold">{tr("الصفحات التي يفتحها", "The pages they open")}</p>
        <p className="mb-3 text-xs text-muted">{tr("المطفأة تختفي من قائمتهم ولا تُفتح لهم. الصفحة الرئيسية للوظيفة تبقى دائماً.", "Off pages leave their menu and won't open. The job's home page always stays.")}</p>
        <div className="grid gap-2 sm:grid-cols-2">
          {pages.map((n) => {
            const locked = homes.includes(n.href);
            const on = locked || !f.denied.includes(n.href);
            return (
              <PageRow key={n.href} page={n} on={on} locked={locked} onToggle={() => !locked && toggle(n.href)} />
            );
          })}
        </div>
      </Card>

      {(f.role === "accountant" || f.role === "rep") && (
        <Card className="space-y-3 p-4">
          <p className="font-bold">{tr("المال الذي يراه", "The money they see")}</p>
          {f.role === "accountant" && (
            <Switch checked={!!f.limits.no_profit} onChange={(v) => setF({ ...f, limits: { ...f.limits, no_profit: v || undefined } })} label={tr("إخفاء أسعار الشراء والأرباح", "Hide purchase cost and profit")} />
          )}
          <Switch checked={!!f.limits.no_debt} onChange={(v) => setF({ ...f, limits: { ...f.limits, no_debt: v || undefined } })} label={tr("إخفاء ديون الزبائن", "Hide the customers' debts")} />
        </Card>
      )}

      <Card className="space-y-4 p-4">
        <p className="font-bold">{tr("صلاحيات أدق", "Finer permissions")}</p>
        <Switch
          checked={!!f.read_only}
          onChange={(v) => setF({ ...f, read_only: v || undefined })}
          label={
            <span>
              <b>{tr("للعرض فقط", "See only")}</b>
              <span className="block text-xs text-muted">{tr("يفتح صفحاته ولا يغيّر شيئاً (حسابه وإشعاراته فقط)", "Opens their pages but changes nothing (only their account and notifications)")}</span>
            </span>
          }
        />
        <div>
          <p className="mb-1.5 text-sm font-semibold">{tr("ما يستطيع فعله", "What they may do")}</p>
          <p className="mb-2 text-xs text-muted">{tr("المطفأ يرفضه الخادم بسبب واضح، حتى لو كانت وظيفته تسمح به.", "What's off the server refuses with a clear reason, even if the job allows it.")}</p>
          <div className="grid gap-1 sm:grid-cols-2">
            {PROFILE_ACTIONS.map((act) => (
              <Switch
                key={act}
                checked={!f.deny_actions?.includes(act)}
                onChange={(v) => {
                  const rest = (f.deny_actions ?? []).filter((x) => x !== act);
                  setF({ ...f, deny_actions: v ? (rest.length ? rest : undefined) : [...rest, act] });
                }}
                label={actionName(act, tr)}
              />
            ))}
          </div>
        </div>
        <div>
          <Switch
            checked={!!f.hours}
            onChange={(v) => setF({ ...f, hours: v ? { from: "08:00", to: "18:00", days: [6, 0, 1, 2, 3, 4] } : undefined })}
            label={
              <span>
                <b>{tr("ساعات الدخول", "Login hours")}</b>
                <span className="block text-xs text-muted">{tr("خارجها لا يدخل، وتنتهي جلسته المفتوحة", "Outside them they can't log in, and an open session ends")}</span>
              </span>
            }
          />
          {f.hours && (
            <div className="mt-2 space-y-3 rounded-xl bg-card-2 p-3">
              <div className="flex flex-wrap items-end gap-3">
                <Field label={tr("من", "From")}>
                  <Input type="time" dir="ltr" value={f.hours.from} onChange={(e) => setF({ ...f, hours: { ...f.hours!, from: e.target.value } })} className="w-32" />
                </Field>
                <Field label={tr("إلى", "To")}>
                  <Input type="time" dir="ltr" value={f.hours.to} onChange={(e) => setF({ ...f, hours: { ...f.hours!, to: e.target.value } })} className="w-32" />
                </Field>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {WEEK.map(([d, ar, en]) => {
                  const on = f.hours!.days.includes(d);
                  return (
                    <button
                      key={d}
                      type="button"
                      onClick={() => setF({ ...f, hours: { ...f.hours!, days: on ? f.hours!.days.filter((x) => x !== d) : [...f.hours!.days, d] } })}
                      className={cn("rounded-lg border px-2.5 py-1.5 text-xs font-semibold", on ? "border-primary bg-primary-soft text-primary-ink" : "border-line text-muted")}
                    >
                      {tr(ar, en)}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </Card>

      {apps.length > 0 && (
        <Card className="p-4">
          <p className="mb-2 font-bold">{tr("التطبيق الذي تفتح عليه قائمتهم", "The app their menu opens on")}</p>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => setF({ ...f, default_app: undefined })} className={cn("rounded-xl border px-3 py-2 text-sm", !f.default_app ? "border-primary bg-primary-soft font-semibold" : "border-line")}>
              {tr("كل الصفحات", "All pages")}
            </button>
            {apps.map((a) => (
              <button key={a.id} type="button" onClick={() => setF({ ...f, default_app: a.id })} className={cn("flex items-center gap-2 rounded-xl border px-3 py-1.5 text-sm", f.default_app === a.id ? "border-primary bg-primary-soft font-semibold" : "border-line")}>
                <AppTile app={a} size={24} /> {a.name}
              </button>
            ))}
          </div>
        </Card>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <Button
          variant="action"
          loading={busy}
          disabled={!changed || f.name.trim().length < 2}
          onClick={async () => {
            setBusy(true);
            await save((s) => ({ ...s, profiles: s.profiles.map((p) => (p.id === f.id ? { ...f, name: f.name.trim() } : p)) }), tr("حُفظ الملف ووصل إلى أصحابه", "Saved; it reached its people"));
            setBusy(false);
          }}
        >
          <Check className="size-4" /> {tr("حفظ الملف", "Save the profile")}
        </Button>
        {changed && (
          <Button onClick={() => setF(profile)}>
            {tr("تراجع عن التعديلات", "Undo changes")}
          </Button>
        )}
        <Button variant="ghost" className="ms-auto text-danger" onClick={() => setRemoving(true)}>
          <Trash2 className="size-4" /> {tr("حذف الملف", "Delete the profile")}
        </Button>
      </div>

      <Card className="p-4">
        <p className="font-bold">{tr("من في هذا الملف", "Who is in it")}</p>
        <p className="mb-3 text-xs text-muted">{tr(`كل ${roleName(f.role, tr)} يمكن وضعه هنا. يصل التغيير إلى شاشته فوراً.`, `Any ${roleName(f.role, tr)} can be put here; it reaches their screen at once.`)}</p>
        {sameJob.length === 0 ? (
          <p className="text-sm text-muted">{tr("لا يوجد أحد بهذه الوظيفة.", "Nobody has this job.")}</p>
        ) : (
          <ul className="divide-y divide-line rounded-xl border border-line">
            {sameJob.map((u) => {
              const inIt = u.profile_id === f.id;
              const other = !inIt && u.profile_id ? site.profiles.find((p) => p.id === u.profile_id) : undefined;
              return (
                <li key={u.id} className="flex items-center gap-3 px-3 py-2.5">
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-medium">{u.name}</span>
                    <span className="text-xs text-muted">{inIt ? tr("في هذا الملف", "In this profile") : other ? tr(`في «${other.name}»`, `In ${other.name}`) : tr("صلاحيات وظيفته المعتادة", "The job's usual access")}</span>
                  </span>
                  <Switch checked={inIt} disabled={moving === u.id} onChange={(v) => move(u, v)} label={<span className="sr-only">{u.name}</span>} />
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      {removing && (
        <Dialog
          open
          onClose={() => setRemoving(false)}
          title={tr(`حذف «${profile.name}»`, `Delete ${profile.name}`)}
          footer={
            <>
              <Button onClick={() => setRemoving(false)}>{tr("تراجع", "Back")}</Button>
              <Button
                variant="danger"
                onClick={async () => {
                  if (await save((s) => ({ ...s, profiles: s.profiles.filter((p) => p.id !== profile.id) }), tr("حُذف الملف", "Profile deleted"))) onBack();
                }}
              >
                <Trash2 className="size-4" /> {tr("حذف", "Delete")}
              </Button>
            </>
          }
        >
          <Notice tone="warning" title={tr("من فيه يعود إلى صلاحيات وظيفته المعتادة", "Its people go back to the job's usual access")}>
            {tr("لا يُحذف أي مستخدم، فقط هذا الملف.", "No user is deleted, only this profile.")}
          </Notice>
        </Dialog>
      )}
    </div>
  );
}

function PageRow({ page, on, locked, onToggle }: { page: NavItem; on: boolean; locked?: boolean; onToggle: () => void }) {
  const { tr } = useFmt();
  return (
    <button
      type="button"
      onClick={onToggle}
      disabled={locked}
      className={cn("box-row flex items-center gap-3 rounded-xl border p-2.5 text-start transition", on ? "border-line bg-card" : "border-dashed border-line bg-card-2 opacity-60", !locked && "hover:border-primary")}
    >
      <page.icon className="size-[18px] shrink-0 text-muted" />
      <span className="flex-1 text-sm font-medium">{tr(page.ar, page.en)}</span>
      {locked ? (
        <span className="flex items-center gap-1 text-[11px] text-muted">
          <Lock className="size-3.5" /> {tr("الرئيسية", "Home")}
        </span>
      ) : (
        <span className={cn("flex h-5 w-9 items-center rounded-full p-0.5 transition", on ? "bg-success" : "bg-line-strong")}>
          <span className={cn("size-4 rounded-full bg-white shadow transition", on ? "translate-x-0 rtl:translate-x-0" : "")} style={{ marginInlineStart: on ? 16 : 0 }} />
        </span>
      )}
    </button>
  );
}

// ---------- Apps ----------

export function AppsSection() {
  const { tr, num } = useFmt();
  const site = useSite();
  const save = useSave();
  const [edit, setEdit] = useState<AppDef | "new" | null>(null);
  const [removing, setRemoving] = useState<AppDef | null>(null);
  const whoSees = (a: AppDef) =>
    [...a.roles.map((r) => roleName(r, tr)), ...a.profiles.map((id) => site.profiles.find((p) => p.id === id)?.name).filter(Boolean)].join(tr("، ", ", ")) || tr("لا أحد بعد", "Nobody yet");
  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold">{tr("مدير التطبيقات", "App manager")}</h2>
          <p className="text-sm text-muted">{tr("التطبيق مجموعة صفحات باسم ولون، يختاره صاحبه من زر التطبيقات في الأعلى فتبقى في قائمته صفحاته فقط.", "An app is a named, colored set of pages; its people pick it from the apps button and their menu keeps only its pages.")}</p>
        </div>
        <Button variant="action" onClick={() => setEdit("new")}>
          <Plus className="size-4" /> {tr("تطبيق جديد", "New app")}
        </Button>
      </div>
      {site.apps.length === 0 ? (
        <Card>
          <Empty icon={<AppTile app={{ icon: "grid", color: "#e1692b" }} />} title={tr("لا تطبيقات بعد", "No apps yet")} body={tr("مثال: «المبيعات» للمندوبين بالطلبات والزبائن والتسديدات.", "e.g. “Sales” for the reps: orders, customers and payments.")} />
        </Card>
      ) : (
        <Card className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-line bg-card-2 text-xs text-muted">
                <th className="px-3 py-2 text-start font-medium">#</th>
                <th className="px-3 py-2 text-start font-medium">{tr("التطبيق", "App")}</th>
                <th className="px-3 py-2 text-start font-medium">{tr("الصفحات", "Pages")}</th>
                <th className="px-3 py-2 text-start font-medium">{tr("يراه", "Seen by")}</th>
                <th className="px-3 py-2 text-start font-medium">{tr("ظاهر", "Visible")}</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {site.apps.map((a, i) => (
                <tr key={a.id} className="box-row cursor-pointer border-b border-line last:border-0 hover:bg-card-2" onClick={() => setEdit(a)}>
                  <td className="num px-3 py-3 text-muted">{num(i + 1)}</td>
                  <td className="px-3 py-3">
                    <span className="flex items-center gap-3">
                      <AppTile app={a} size={34} />
                      <span className="min-w-0">
                        <span className="block font-semibold">{tr(a.name, a.name_en || a.name)}</span>
                        <span className="block max-w-72 truncate text-xs text-muted">{a.description}</span>
                      </span>
                    </span>
                  </td>
                  <td className="num px-3 py-3">{num(a.pages.length)}</td>
                  <td className="max-w-60 px-3 py-3 text-xs">{whoSees(a)}</td>
                  <td className="px-3 py-3" onClick={(e) => e.stopPropagation()}>
                    <Switch
                      checked={a.active}
                      onChange={(v) => save((s) => ({ ...s, apps: s.apps.map((x) => (x.id === a.id ? { ...x, active: v } : x)) }), v ? tr(`«${a.name}» ظاهر الآن`, `${a.name} is visible`) : tr(`أُخفي «${a.name}»`, `${a.name} hidden`))}
                      label={<span className="sr-only">{a.name}</span>}
                    />
                  </td>
                  <td className="px-3 py-3 text-end" onClick={(e) => e.stopPropagation()}>
                    <span className="flex justify-end gap-1">
                      <Button size="sm" variant="ghost" onClick={() => setEdit(a)} aria-label={tr("تعديل", "Edit")}>
                        <Pencil className="size-4" />
                      </Button>
                      <Button size="sm" variant="ghost" className="text-danger" onClick={() => setRemoving(a)} aria-label={tr("حذف", "Delete")}>
                        <Trash2 className="size-4" />
                      </Button>
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
      {edit && <AppWizard app={edit === "new" ? undefined : edit} onClose={() => setEdit(null)} />}
      {removing && (
        <Dialog
          open
          onClose={() => setRemoving(null)}
          title={tr(`حذف «${removing.name}»`, `Delete ${removing.name}`)}
          footer={
            <>
              <Button onClick={() => setRemoving(null)}>{tr("تراجع", "Back")}</Button>
              <Button
                variant="danger"
                onClick={async () => {
                  const id = removing.id;
                  if (await save((s) => ({ ...s, apps: s.apps.filter((x) => x.id !== id), profiles: s.profiles.map((p) => (p.default_app === id ? { ...p, default_app: undefined } : p)) }), tr("حُذف التطبيق", "App deleted"))) setRemoving(null);
                }}
              >
                <Trash2 className="size-4" /> {tr("حذف", "Delete")}
              </Button>
            </>
          }
        >
          <p className="text-sm">{tr("تبقى الصفحات كما هي؛ يختفي هذا التطبيق فقط من زر التطبيقات.", "The pages stay; only this app leaves the apps button.")}</p>
        </Dialog>
      )}
    </div>
  );
}

/** New or edit an app, in three steps like Salesforce's wizard: details and look → pages → who sees it. */
function AppWizard({ app, onClose }: { app?: AppDef; onClose: () => void }) {
  const { tr } = useFmt();
  const site = useSite();
  const save = useSave();
  const [step, setStep] = useState(0);
  const [busy, setBusy] = useState(false);
  const [f, setF] = useState<AppDef>(app ?? { id: newId("a"), name: "", color: COLORS[0], icon: "cart", pages: [], roles: [], profiles: [], active: true });
  const steps = [tr("التفاصيل والهوية", "Details and look"), tr("الصفحات", "Pages"), tr("من يراه", "Who sees it")];
  const canNext = step === 0 ? f.name.trim().length >= 2 : step === 1 ? f.pages.length > 0 : true;
  const togglePage = (h: string) => setF((x) => ({ ...x, pages: x.pages.includes(h) ? x.pages.filter((p) => p !== h) : [...x.pages, h] }));
  const moveP = (i: number, d: number) =>
    setF((x) => {
      const p = [...x.pages];
      const j = i + d;
      if (j < 0 || j >= p.length) return x;
      [p[i], p[j]] = [p[j], p[i]];
      return { ...x, pages: p };
    });
  const navOf = (h: string) => NAV.find((n) => n.href === h);
  // Pages anyone of the chosen jobs (or everyone, before choosing) can open.
  const offered = NAV.filter((n) => (f.roles.length ? n.roles.some((r) => f.roles.includes(r)) : true));

  async function finish() {
    setBusy(true);
    const clean = { ...f, name: f.name.trim(), description: f.description?.trim() || undefined };
    const ok = await save((s) => ({ ...s, apps: app ? s.apps.map((x) => (x.id === f.id ? clean : x)) : [...s.apps, clean] }), app ? tr("حُفظ التطبيق", "App saved") : tr(`أُنشئ «${clean.name}» ويظهر لأصحابه الآن`, `${clean.name} created; its people see it now`));
    setBusy(false);
    if (ok) onClose();
  }

  return (
    <Dialog
      open
      wide
      onClose={onClose}
      title={app ? tr(`تعديل «${app.name}»`, `Edit ${app.name}`) : tr("تطبيق جديد", "New app")}
      footer={
        <>
          {step > 0 && <Button onClick={() => setStep(step - 1)}>{tr("السابق", "Back")}</Button>}
          <span className="flex-1" />
          {step < 2 ? (
            <Button variant="primary" disabled={!canNext} onClick={() => setStep(step + 1)}>
              {tr("التالي", "Next")}
            </Button>
          ) : (
            <Button variant="action" loading={busy} disabled={f.pages.length === 0 || f.name.trim().length < 2} onClick={finish}>
              <Check className="size-4" /> {tr("حفظ", "Save")}
            </Button>
          )}
        </>
      }
    >
      <ol className="mb-5 flex items-center gap-2">
        {steps.map((s, i) => (
          <li key={s} className="flex flex-1 items-center gap-2">
            <button type="button" onClick={() => (i < step || canNext) && setStep(i)} className={cn("flex size-7 shrink-0 items-center justify-center rounded-full text-xs font-bold", i <= step ? "bg-primary text-on-primary" : "bg-card-2 text-muted")}>
              {i + 1}
            </button>
            <span className={cn("hidden text-sm sm:inline", i === step ? "font-bold" : "text-muted")}>{s}</span>
            {i < steps.length - 1 && <span className="h-px flex-1 bg-line" />}
          </li>
        ))}
      </ol>

      {step === 0 && (
        <div className="grid gap-4 md:grid-cols-[1fr_240px]">
          <div className="space-y-3">
            <Field label={tr("اسم التطبيق", "App name")}>
              <Input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder={tr("مثال: المبيعات", "e.g. Sales")} autoFocus />
            </Field>
            <Field label={tr("الاسم بالإنكليزية (اختياري)", "English name (optional)")}>
              <Input dir="ltr" value={f.name_en ?? ""} onChange={(e) => setF({ ...f, name_en: e.target.value || undefined })} />
            </Field>
            <Field label={tr("الوصف", "Description")}>
              <Textarea rows={2} value={f.description ?? ""} onChange={(e) => setF({ ...f, description: e.target.value })} placeholder={tr("ماذا يجمع هذا التطبيق؟", "What does it gather?")} />
            </Field>
            <Field label={tr("اللون", "Color")}>
              <div className="flex flex-wrap items-center gap-2">
                {COLORS.map((c) => (
                  <button key={c} type="button" onClick={() => setF({ ...f, color: c })} aria-label={c} className={cn("size-8 rounded-full ring-2 ring-offset-2 ring-offset-card", f.color === c ? "ring-text" : "ring-transparent")} style={{ background: c }} />
                ))}
                <input type="color" value={f.color} onChange={(e) => setF({ ...f, color: e.target.value })} className="size-8 cursor-pointer rounded-full border border-line bg-transparent" aria-label={tr("لون آخر", "Another color")} />
              </div>
            </Field>
            <Field label={tr("الأيقونة", "Icon")}>
              <AppIconPick value={f.icon} color={f.color} onChange={(v) => setF({ ...f, icon: v })} />
            </Field>
          </div>
          {/* What it looks like in the launcher. */}
          <div>
            <p className="mb-2 text-sm font-medium">{tr("في زر التطبيقات", "In the apps button")}</p>
            <div className="rounded-2xl border border-line bg-card-2 p-3">
              <div className="flex items-center gap-3 rounded-xl bg-card p-2">
                <AppTile app={f} />
                <span className="min-w-0">
                  <span className="block truncate text-sm font-semibold">{f.name || tr("اسم التطبيق", "App name")}</span>
                  <span className="block truncate text-xs text-muted">{f.description || tr("الوصف", "Description")}</span>
                </span>
              </div>
            </div>
          </div>
        </div>
      )}

      {step === 1 && (
        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <p className="mb-2 text-sm font-medium">{tr("الصفحات المتاحة", "Available pages")}</p>
            <div className="max-h-80 space-y-1.5 overflow-y-auto pe-1">
              {offered.map((n) => (
                <PageRow key={n.href} page={n} on={f.pages.includes(n.href)} onToggle={() => togglePage(n.href)} />
              ))}
            </div>
          </div>
          <div>
            <p className="mb-2 text-sm font-medium">{tr("صفحات التطبيق بالترتيب", "The app's pages, in order")}</p>
            {f.pages.length === 0 ? (
              <p className="rounded-xl border border-dashed border-line p-4 text-center text-sm text-muted">{tr("اختر صفحة واحدة على الأقل", "Choose at least one page")}</p>
            ) : (
              <ol className="space-y-1.5">
                {f.pages.map((h, i) => {
                  const n = navOf(h);
                  return (
                    <li key={h} className="flex items-center gap-2 rounded-xl bg-card-2 p-2 text-sm">
                      <span className="num w-5 text-center text-xs text-muted">{i + 1}</span>
                      {n && <n.icon className="size-4 text-muted" />}
                      <span className="flex-1">{n ? tr(n.ar, n.en) : h}</span>
                      <button type="button" onClick={() => moveP(i, -1)} disabled={i === 0} className="rounded p-1 hover:bg-card disabled:opacity-30" aria-label={tr("أعلى", "Up")}>
                        <ArrowUp className="size-3.5" />
                      </button>
                      <button type="button" onClick={() => moveP(i, 1)} disabled={i === f.pages.length - 1} className="rounded p-1 hover:bg-card disabled:opacity-30" aria-label={tr("أسفل", "Down")}>
                        <ArrowDown className="size-3.5" />
                      </button>
                    </li>
                  );
                })}
              </ol>
            )}
          </div>
        </div>
      )}

      {step === 2 && (
        <div className="space-y-4">
          <div>
            <p className="mb-2 text-sm font-medium">{tr("الوظائف", "Jobs")}</p>
            <div className="flex flex-wrap gap-2">
              {ALL_ROLES.map((r) => {
                const on = f.roles.includes(r);
                return (
                  <button key={r} type="button" onClick={() => setF({ ...f, roles: on ? f.roles.filter((x) => x !== r) : [...f.roles, r] })} className={cn("rounded-xl border px-3 py-2 text-sm font-semibold", on ? "border-primary bg-primary-soft text-primary-ink" : "border-line hover:bg-card-2")}>
                    {roleName(r, tr)}
                  </button>
                );
              })}
            </div>
          </div>
          {site.profiles.length > 0 && (
            <div>
              <p className="mb-2 text-sm font-medium">{tr("أو ملفات صلاحيات بعينها", "Or particular profiles")}</p>
              <div className="flex flex-wrap gap-2">
                {site.profiles.map((p) => {
                  const on = f.profiles.includes(p.id);
                  return (
                    <button key={p.id} type="button" onClick={() => setF({ ...f, profiles: on ? f.profiles.filter((x) => x !== p.id) : [...f.profiles, p.id] })} className={cn("rounded-xl border px-3 py-2 text-sm", on ? "border-primary bg-primary-soft font-semibold text-primary-ink" : "border-line hover:bg-card-2")}>
                      {p.name} <span className="text-xs text-muted">· {roleName(p.role, tr)}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}
          <Switch checked={f.active} onChange={(v) => setF({ ...f, active: v })} label={tr("ظاهر الآن", "Visible now")} />
          {!f.roles.length && !f.profiles.length && (
            <Notice tone="warning" title={tr("لا أحد يراه بعد", "Nobody sees it yet")}>
              {tr("اختر وظيفة أو ملفاً حتى يظهر التطبيق في زر التطبيقات.", "Choose a job or a profile so it shows in the apps button.")}
            </Notice>
          )}
          <p className="text-xs text-muted">{tr("كل شخص يرى من صفحات التطبيق ما تسمح به وظيفته وملفه فقط.", "Each person sees only the app's pages their job and profile allow.")}</p>
        </div>
      )}
    </Dialog>
  );
}

// ---------- Object manager: the manager's own fields ----------

const OBJECTS: { key: CustomObject; ar: string; en: string; about: string; aboutEn: string; standard: string[] }[] = [
  {
    key: "customer",
    ar: "الزبائن",
    en: "Customers",
    about: "المحلات التي تشتري منكم",
    aboutEn: "The shops that buy from you",
    standard: ["اسم المحل", "صاحب المحل", "الهاتف", "المنطقة", "العنوان", "نوع السعر", "المندوب", "سقف الدين", "فعّال"],
  },
  {
    key: "item",
    ar: "المواد",
    en: "Items",
    about: "البضاعة وأسعارها",
    aboutEn: "The goods and their prices",
    standard: ["الاسم", "الاسم بالإنكليزية", "الفئة", "الباركود", "القطع في الكارتون", "الحد الأدنى", "عمولة المندوب", "الوزن", "الأسعار", "فعّالة"],
  },
  {
    key: "order",
    ar: "الطلبات",
    en: "Orders",
    about: "طلبات المحلات والمندوبين",
    aboutEn: "The shops' and reps' orders",
    standard: ["الرقم", "الزبون", "المندوب", "المخزن", "السطور", "المجموع", "الخصم", "الحالة", "التوصيل"],
  },
];

const TYPES: { key: CustomType; ar: string; en: string; hint: string; hintEn: string }[] = [
  { key: "text", ar: "نص", en: "Text", hint: "اسم، ملاحظة، رقم سجل…", hintEn: "A name, a note…" },
  { key: "number", ar: "رقم", en: "Number", hint: "مساحة، عدد، مبلغ…", hintEn: "An area, a count…" },
  { key: "date", ar: "تاريخ", en: "Date", hint: "تاريخ انتهاء رخصة…", hintEn: "A licence expiry…" },
  { key: "list", ar: "قائمة اختيار", en: "Choice list", hint: "يختار واحداً من خيارات تكتبها", hintEn: "Pick one of your choices" },
  { key: "yesno", ar: "نعم / لا", en: "Yes / No", hint: "مثلاً: يقبل الدفع الإلكتروني", hintEn: "e.g. takes card payments" },
];
const typeName = (t: CustomType, tr: (a: string, b: string) => string) => {
  const x = TYPES.find((y) => y.key === t)!;
  return tr(x.ar, x.en);
};

export function ObjectsSection({ openObj, go }: { openObj?: string; go: (s: string) => void }) {
  const { tr, num } = useFmt();
  const site = useSite();
  const obj = OBJECTS.find((o) => o.key === openObj);
  if (obj) return <ObjectPage obj={obj} onBack={() => go("objects")} />;
  return (
    <div>
      <div className="mb-4">
        <h2 className="text-xl font-bold">{tr("مدير الكائنات والحقول", "Objects and fields")}</h2>
        <p className="text-sm text-muted">{tr("أضف حقولك الخاصة إلى الزبائن والمواد والطلبات: تظهر في النماذج والصفحات والجداول، بلا مبرمج.", "Add your own fields to customers, items and orders: they show in the forms, pages and tables, no developer.")}</p>
      </div>
      <div className="grid gap-3 md:grid-cols-3">
        {OBJECTS.map((o) => {
          const n = site.fields.filter((f) => f.object === o.key).length;
          return (
            <button key={o.key} type="button" onClick={() => go(`objects:${o.key}`)} className="box-row rounded-2xl border border-line bg-card p-5 text-start transition hover:border-primary">
              <p className="text-lg font-bold">{tr(o.ar, o.en)}</p>
              <p className="text-sm text-muted">{tr(o.about, o.aboutEn)}</p>
              <p className="mt-3 text-xs text-muted">
                {tr(`${num(o.standard.length)} حقل أساسي · `, `${o.standard.length} standard · `)}
                <b className="text-text">{tr(`${num(n)} حقل مخصص`, `${n} custom`)}</b>
              </p>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function ObjectPage({ obj, onBack }: { obj: (typeof OBJECTS)[number]; onBack: () => void }) {
  const { tr } = useFmt();
  const site = useSite();
  const save = useSave();
  const [edit, setEdit] = useState<CustomField | "new" | null>(null);
  const [removing, setRemoving] = useState<CustomField | null>(null);
  const fields = site.fields.filter((f) => f.object === obj.key);
  const rolesText = (r: Role[], all: string) => (r.length ? r.map((x) => roleName(x, tr)).join(tr("، ", ", ")) : all);
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <button type="button" onClick={onBack} className="text-sm font-semibold text-primary-ink hover:underline">
          {tr("← كل الكائنات", "← All objects")}
        </button>
        <h2 className="flex-1 text-xl font-bold">{tr(obj.ar, obj.en)}</h2>
        <Button variant="action" onClick={() => setEdit("new")}>
          <Plus className="size-4" /> {tr("حقل جديد", "New field")}
        </Button>
      </div>
      <Card className="overflow-x-auto">
        <p className="border-b border-line px-4 py-3 font-bold">{tr("الحقول المخصصة", "Custom fields")}</p>
        {fields.length === 0 ? (
          <p className="p-4 text-sm text-muted">{tr("لا حقول بعد. مثال للزبائن: «رقم السجل التجاري» أو «يوم الزيارة».", "None yet. e.g. for customers: “Trade licence no.” or “Visit day”.")}</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-line bg-card-2 text-xs text-muted">
                <th className="px-3 py-2 text-start font-medium">{tr("الحقل", "Field")}</th>
                <th className="px-3 py-2 text-start font-medium">{tr("النوع", "Type")}</th>
                <th className="px-3 py-2 text-start font-medium">{tr("يراه", "Seen by")}</th>
                <th className="px-3 py-2 text-start font-medium">{tr("يعدّله", "Changed by")}</th>
                <th className="px-3 py-2 text-start font-medium">{tr("فعّال", "Active")}</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {fields.map((f) => (
                <tr key={f.id} className="box-row cursor-pointer border-b border-line last:border-0 hover:bg-card-2" onClick={() => setEdit(f)}>
                  <td className="px-3 py-3">
                    <span className="font-semibold">{f.label}</span>
                    <span className="ms-2 inline-flex gap-1">
                      {f.required && <Badge tone="warning">{tr("مطلوب", "Required")}</Badge>}
                      {f.in_table && <Badge>{tr("في الجدول", "In the table")}</Badge>}
                    </span>
                  </td>
                  <td className="px-3 py-3">{typeName(f.type, tr)}</td>
                  <td className="px-3 py-3 text-xs">{rolesText(f.view_roles, tr("الجميع", "Everyone"))}</td>
                  <td className="px-3 py-3 text-xs">{rolesText(["manager", ...f.edit_roles], "")}</td>
                  <td className="px-3 py-3" onClick={(e) => e.stopPropagation()}>
                    <Switch
                      checked={f.active}
                      onChange={(v) => save((s) => ({ ...s, fields: s.fields.map((x) => (x.id === f.id ? { ...x, active: v } : x)) }), v ? tr("الحقل ظاهر", "Field on") : tr("أُخفي الحقل (قيمه محفوظة)", "Field hidden (values kept)"))}
                      label={<span className="sr-only">{f.label}</span>}
                    />
                  </td>
                  <td className="px-3 py-3 text-end" onClick={(e) => e.stopPropagation()}>
                    <Button size="sm" variant="ghost" className="text-danger" onClick={() => setRemoving(f)} aria-label={tr("حذف", "Delete")}>
                      <Trash2 className="size-4" />
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
      <Card className="p-4">
        <p className="mb-2 font-bold">{tr("الحقول الأساسية", "Standard fields")}</p>
        <div className="flex flex-wrap gap-1.5">
          {obj.standard.map((s) => (
            <span key={s} className="flex items-center gap-1 rounded-lg bg-card-2 px-2 py-1 text-xs text-muted">
              <Lock className="size-3" /> {s}
            </span>
          ))}
        </div>
      </Card>
      {edit && <FieldWizard object={obj.key} field={edit === "new" ? undefined : edit} onClose={() => setEdit(null)} />}
      {removing && (
        <Dialog
          open
          onClose={() => setRemoving(null)}
          title={tr(`حذف «${removing.label}»`, `Delete ${removing.label}`)}
          footer={
            <>
              <Button onClick={() => setRemoving(null)}>{tr("تراجع", "Back")}</Button>
              <Button
                variant="danger"
                onClick={async () => {
                  const id = removing.id;
                  if (await save((s) => ({ ...s, fields: s.fields.filter((x) => x.id !== id) }), tr("حُذف الحقل", "Field deleted"))) setRemoving(null);
                }}
              >
                <Trash2 className="size-4" /> {tr("حذف", "Delete")}
              </Button>
            </>
          }
        >
          <Notice tone="warning" title={tr("يختفي الحقل من كل الصفحات", "The field leaves every page")}>
            {tr("إن أردت إخفاءه مع حفظ قيمه فأطفئ «فعّال» بدلاً من الحذف.", "To hide it but keep its values, switch “Active” off instead.")}
          </Notice>
        </Dialog>
      )}
    </div>
  );
}

/** New field (or edit one) in three steps: the type → the details (with a live preview) → who sees and changes it. */
function FieldWizard({ object, field, onClose }: { object: CustomObject; field?: CustomField; onClose: () => void }) {
  const { tr } = useFmt();
  const save = useSave();
  const [step, setStep] = useState(field ? 1 : 0);
  const [busy, setBusy] = useState(false);
  const [f, setF] = useState<CustomField>(field ?? { id: newId("f"), object, label: "", type: "text", view_roles: [], edit_roles: [], active: true });
  const [optionsText, setOptionsText] = useState((field?.options ?? []).join("\n"));
  const [preview, setPreview] = useState<CustomValue | null>(null);
  const options = optionsText
    .split("\n")
    .map((o) => o.trim())
    .filter(Boolean);
  const ready = f.label.trim().length >= 2 && (f.type !== "list" || options.length > 0);
  const steps = [tr("النوع", "Type"), tr("التفاصيل", "Details"), tr("الصلاحيات", "Access")];
  const chip = (on: boolean) => cn("rounded-xl border px-3 py-2 text-sm font-semibold", on ? "border-primary bg-primary-soft text-primary-ink" : "border-line hover:bg-card-2");

  async function finish() {
    setBusy(true);
    const clean: CustomField = { ...f, label: f.label.trim(), label_en: f.label_en?.trim() || undefined, help: f.help?.trim() || undefined, options: f.type === "list" ? options : undefined };
    const ok = await save(
      (s) => ({ ...s, fields: field ? s.fields.map((x) => (x.id === f.id ? clean : x)) : [...s.fields, clean] }),
      field ? tr("حُفظ الحقل", "Field saved") : tr(`أُضيف «${clean.label}» ويظهر الآن في النماذج والصفحات`, `${clean.label} added; it shows in the forms and pages now`),
    );
    setBusy(false);
    if (ok) onClose();
  }

  return (
    <Dialog
      open
      wide
      onClose={onClose}
      title={field ? tr(`تعديل «${field.label}»`, `Edit ${field.label}`) : tr("حقل جديد", "New field")}
      footer={
        <>
          {step > 0 && <Button onClick={() => setStep(step - 1)}>{tr("السابق", "Back")}</Button>}
          <span className="flex-1" />
          {step < 2 ? (
            <Button variant="primary" disabled={step === 1 && !ready} onClick={() => setStep(step + 1)}>
              {tr("التالي", "Next")}
            </Button>
          ) : (
            <Button variant="action" loading={busy} disabled={!ready} onClick={finish}>
              <Check className="size-4" /> {tr("حفظ", "Save")}
            </Button>
          )}
        </>
      }
    >
      <ol className="mb-5 flex items-center gap-2">
        {steps.map((s, i) => (
          <li key={s} className="flex flex-1 items-center gap-2">
            <span className={cn("flex size-7 shrink-0 items-center justify-center rounded-full text-xs font-bold", i <= step ? "bg-primary text-on-primary" : "bg-card-2 text-muted")}>{i + 1}</span>
            <span className={cn("hidden text-sm sm:inline", i === step ? "font-bold" : "text-muted")}>{s}</span>
            {i < steps.length - 1 && <span className="h-px flex-1 bg-line" />}
          </li>
        ))}
      </ol>

      {step === 0 && (
        <div className="grid gap-2 sm:grid-cols-2">
          {TYPES.map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={() => {
                setF({ ...f, type: t.key });
                setPreview(null);
                setStep(1);
              }}
              className={cn("box-row rounded-2xl border p-4 text-start transition hover:border-primary", f.type === t.key ? "border-primary bg-primary-soft" : "border-line")}
            >
              <p className="font-bold">{tr(t.ar, t.en)}</p>
              <p className="text-xs text-muted">{tr(t.hint, t.hintEn)}</p>
            </button>
          ))}
        </div>
      )}

      {step === 1 && (
        <div className="grid gap-4 md:grid-cols-[1fr_260px]">
          <div className="space-y-3">
            <Field label={tr("اسم الحقل", "Field name")}>
              <Input value={f.label} onChange={(e) => setF({ ...f, label: e.target.value })} placeholder={tr("مثال: رقم السجل التجاري", "e.g. Trade licence no.")} autoFocus />
            </Field>
            <Field label={tr("الاسم بالإنكليزية (اختياري)", "English name (optional)")}>
              <Input dir="ltr" value={f.label_en ?? ""} onChange={(e) => setF({ ...f, label_en: e.target.value })} />
            </Field>
            {f.type === "list" && (
              <Field label={tr("الخيارات (كل خيار في سطر)", "Choices (one per line)")} error={options.length ? undefined : tr("أضف خياراً واحداً على الأقل", "Add at least one")}>
                <Textarea rows={4} value={optionsText} onChange={(e) => setOptionsText(e.target.value)} placeholder={tr("السبت\nالأحد\nالإثنين", "Saturday\nSunday")} />
              </Field>
            )}
            <Field label={tr("تلميح تحت الحقل (اختياري)", "Hint under it (optional)")}>
              <Input value={f.help ?? ""} onChange={(e) => setF({ ...f, help: e.target.value })} />
            </Field>
            <Switch checked={!!f.required} onChange={(v) => setF({ ...f, required: v || undefined })} label={tr("مطلوب: لا يُحفظ السجل وهو فارغ", "Required: the record can't be saved without it")} />
            <Switch checked={!!f.in_table} onChange={(v) => setF({ ...f, in_table: v || undefined })} label={tr("عمود في الجدول أيضاً", "Also a column in the table")} />
          </div>
          <div>
            <p className="mb-2 text-sm font-medium">{tr("هكذا يظهر", "How it looks")}</p>
            <div className="rounded-2xl border border-line bg-card-2 p-3">
              <FieldInput field={{ ...f, label: f.label || tr("اسم الحقل", "Field name"), options }} value={preview} onChange={setPreview} />
            </div>
          </div>
        </div>
      )}

      {step === 2 && (
        <div className="space-y-4">
          <div>
            <p className="mb-1 text-sm font-medium">{tr("من يراه", "Who sees it")}</p>
            <p className="mb-2 text-xs text-muted">{tr("بلا اختيار = كل من يرى السجل. المدير يرى كل شيء.", "None chosen = everyone who sees the record. The manager sees everything.")}</p>
            <div className="flex flex-wrap gap-2">
              {JOBS.map((r) => {
                const on = f.view_roles.includes(r);
                return (
                  <button key={r} type="button" onClick={() => setF({ ...f, view_roles: on ? f.view_roles.filter((x) => x !== r) : [...f.view_roles, r], edit_roles: on ? f.edit_roles.filter((x) => x !== r) : f.edit_roles })} className={chip(on)}>
                    {roleName(r, tr)}
                  </button>
                );
              })}
            </div>
          </div>
          <div>
            <p className="mb-1 text-sm font-medium">{tr("من يعدّله", "Who changes it")}</p>
            <p className="mb-2 text-xs text-muted">{tr("المدير دائماً. أضف من يحتاج أن يكتب فيه أيضاً.", "Always the manager. Add whoever also needs to fill it.")}</p>
            <div className="flex flex-wrap gap-2">
              {JOBS.filter((r) => !f.view_roles.length || f.view_roles.includes(r)).map((r) => {
                const on = f.edit_roles.includes(r);
                return (
                  <button key={r} type="button" onClick={() => setF({ ...f, edit_roles: on ? f.edit_roles.filter((x) => x !== r) : [...f.edit_roles, r] })} className={chip(on)}>
                    {roleName(r, tr)}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </Dialog>
  );
}
