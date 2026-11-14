"use client";

// Health and security (advanced settings), after the Salesforce Setup home: login errors of the last 24
// hours, a security score made of clear checks (each with where to fix it), and the users' access.
import Link from "next/link";
import { AlertTriangle, CheckCircle2, ShieldCheck, XCircle } from "lucide-react";
import { roleName } from "@/components/status";
import { Card, ErrorBox, Skeleton } from "@/components/ui";
import { api } from "@/lib/api";
import type { Health, LoginFail, Role } from "@/lib/api/types";
import { useFmt } from "@/lib/i18n";
import { useLoad } from "@/lib/use-load";
import { cn } from "@/lib/utils";

const FAIL_COLORS: Record<LoginFail, string> = { wrong: "#e11d74", stopped: "#8b5cf6", hours: "#f59e0b", locked: "#dc2626" };
const failName = (r: LoginFail, tr: (a: string, b: string) => string) => ({ wrong: tr("كلمة مرور خاطئة", "Wrong password"), stopped: tr("حساب موقوف", "Stopped account"), hours: tr("خارج ساعات الدخول", "Outside login hours"), locked: tr("مقفل بعد محاولات خاطئة", "Locked after wrong tries") })[r];

export function useHealth() {
  return useLoad(() => api.health(), []);
}

/** A ring of parts (the login donut) or one value (the score). */
function Ring({ parts, center, size = 150 }: { parts: { value: number; color: string }[]; center: React.ReactNode; size?: number }) {
  const r = 52;
  const c = 2 * Math.PI * r;
  const total = parts.reduce((s, p) => s + p.value, 0);
  let offset = 0;
  return (
    <div className="relative mx-auto" style={{ width: size, height: size }}>
      <svg viewBox="0 0 120 120" className="size-full -rotate-90">
        <circle cx="60" cy="60" r={r} fill="none" stroke="var(--card-2)" strokeWidth="13" />
        {total > 0 &&
          parts.map((p, i) => {
            const len = (p.value / total) * c;
            const el = <circle key={i} cx="60" cy="60" r={r} fill="none" stroke={p.color} strokeWidth="13" strokeDasharray={`${len} ${c - len}`} strokeDashoffset={-offset} />;
            offset += len;
            return el;
          })}
      </svg>
      <div className="absolute inset-0 flex items-center justify-center text-center">{center}</div>
    </div>
  );
}

function Bar({ label, value, max, tone }: { label: string; value: number; max: number; tone: string }) {
  const { num } = useFmt();
  return (
    <div>
      <div className="flex items-center justify-between text-sm">
        <span className="text-muted">{label}</span>
        <span className="num font-semibold">{num(value)}</span>
      </div>
      <div className="mt-1 h-2 overflow-hidden rounded-full bg-card-2">
        <div className="h-full rounded-full" style={{ width: `${max ? Math.max(value ? 4 : 0, (value / max) * 100) : 0}%`, background: tone }} />
      </div>
    </div>
  );
}

function HCard({ title, sub, badge, children, note, href, cta }: { title: string; sub?: string; badge?: "danger" | "warning"; children: React.ReactNode; note: string; href: string; cta: string }) {
  return (
    <Card className="flex flex-col p-4">
      <div className="mb-3 flex items-start justify-between gap-2">
        <div>
          <p className="font-bold">{title}</p>
          {sub && <p className="text-xs text-muted">{sub}</p>}
        </div>
        {badge && (
          <span className={cn("flex size-8 items-center justify-center rounded-lg", badge === "danger" ? "bg-danger-soft text-danger" : "bg-warning-soft text-warning")}>
            <AlertTriangle className="size-4" />
          </span>
        )}
      </div>
      <div className="flex-1">{children}</div>
      <p className="mt-3 text-sm text-muted">{note}</p>
      <Link href={href} className="mt-3 inline-flex w-fit rounded-xl border border-line px-3 py-1.5 text-sm font-semibold text-primary-ink hover:bg-card-2">
        {cta}
      </Link>
    </Card>
  );
}

const scoreTone = (s: number) => (s < 50 ? "#e11d48" : s < 80 ? "#f59e0b" : "#16a34a");

/** The four cards of the Setup home. */
export function HealthCards({ h }: { h: Health }) {
  const { tr, num } = useFmt();
  const total = h.logins.ok + h.logins.failed;
  const rate = total ? Math.round((h.logins.failed / total) * 100) : 0;
  const scoreName = h.score < 50 ? tr("ضعيف", "Poor") : h.score < 80 ? tr("مقبول", "Fair") : tr("جيد", "Good");
  const maxRole = Math.max(1, ...Object.values(h.users.by_role));
  const maxUsers = Math.max(1, h.users.active);
  return (
    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
      <HCard
        title={tr("أخطاء الدخول", "Login errors")}
        sub={tr("آخر 24 ساعة", "Last 24 hours")}
        badge={rate >= 20 ? "danger" : h.logins.failed ? "warning" : undefined}
        note={total ? tr(`${rate}% من محاولات الدخول فشلت (${num(h.logins.failed)} من ${num(total)}).`, `${rate}% of logins failed (${h.logins.failed}/${total}).`) : tr("لا محاولات دخول في آخر 24 ساعة.", "No logins in the last 24 hours.")}
        href="/settings/advanced?s=health"
        cta={tr("التفاصيل", "Details")}
      >
        <Ring
          parts={[{ value: h.logins.ok, color: "#16a34a" }, ...(Object.keys(h.logins.reasons) as LoginFail[]).map((r) => ({ value: h.logins.reasons[r], color: FAIL_COLORS[r] }))]}
          center={
            <span>
              <span className="num block text-3xl font-bold">{num(h.logins.failed)}</span>
              <span className="text-xs text-muted">{tr("فاشلة", "failed")}</span>
            </span>
          }
        />
        <div className="mt-2 flex flex-wrap justify-center gap-x-3 gap-y-1 text-[11px] text-muted">
          <span className="flex items-center gap-1">
            <span className="size-2 rounded-full bg-[#16a34a]" /> {tr("ناجحة", "OK")} {num(h.logins.ok)}
          </span>
          {(Object.keys(h.logins.reasons) as LoginFail[])
            .filter((r) => h.logins.reasons[r])
            .map((r) => (
              <span key={r} className="flex items-center gap-1">
                <span className="size-2 rounded-full" style={{ background: FAIL_COLORS[r] }} /> {failName(r, tr)} {num(h.logins.reasons[r])}
              </span>
            ))}
        </div>
      </HCard>

      <HCard
        title={tr("مؤشر الأمان", "Security score")}
        badge={h.score < 50 ? "danger" : h.score < 80 ? "warning" : undefined}
        note={tr(`${scoreName}: ${h.checks.filter((c) => !c.ok).length} من ${h.checks.length} فحوص تحتاج إصلاحاً.`, `${scoreName}: ${h.checks.filter((c) => !c.ok).length} of ${h.checks.length} checks need fixing.`)}
        href="/settings/advanced?s=health"
        cta={tr("عرض الفحوص", "See the checks")}
      >
        <Ring
          parts={[
            { value: h.score, color: scoreTone(h.score) },
            { value: 100 - h.score, color: "transparent" },
          ]}
          center={
            <span>
              <span className="num block text-3xl font-bold">{num(h.score)}%</span>
              <span className="text-xs font-semibold" style={{ color: scoreTone(h.score) }}>
                {scoreName}
              </span>
            </span>
          }
        />
      </HCard>

      <HCard
        title={tr("وصول المستخدمين", "User access")}
        sub={tr(`${num(h.users.active)} حساب فعّال`, `${h.users.active} active accounts`)}
        badge={h.users.idle.length || h.users.weak.length ? "warning" : undefined}
        note={tr("أوقف الحسابات التي لا تُستعمل، وضع كل شخص في ملف صلاحيات يناسب عمله.", "Stop unused accounts, and put each person in a profile that fits their work.")}
        href="/users"
        cta={tr("المستخدمون", "Users")}
      >
        <div className="space-y-3">
          <Bar label={tr("لم يدخلوا أبداً", "Never logged in")} value={h.users.never.length} max={maxUsers} tone="#f59e0b" />
          <Bar label={tr("خاملون أكثر من 30 يوماً", "Idle 30+ days")} value={h.users.idle.length} max={maxUsers} tone="#e11d74" />
          <Bar label={tr("كلمة مرور ضعيفة", "Weak password")} value={h.users.weak.length} max={maxUsers} tone="#e11d48" />
          <Bar label={tr("داخل ملفات صلاحيات", "In permission profiles")} value={h.users.in_profiles} max={maxUsers} tone="#16a34a" />
        </div>
      </HCard>

      <HCard title={tr("الحسابات حسب الوظيفة", "Accounts by job")} sub={tr(`${num(h.users.stopped)} حساب موقوف`, `${h.users.stopped} stopped`)} note={tr(`${num(h.users.managers)} منهم مدراء يرون كل شيء.`, `${h.users.managers} of them are managers who see everything.`)} href="/users" cta={tr("المستخدمون", "Users")}>
        <div className="space-y-3">
          {(Object.keys(h.users.by_role) as Role[]).map((r) => (
            <Bar key={r} label={roleName(r, tr)} value={h.users.by_role[r]} max={maxRole} tone={r === "manager" ? "#e1692b" : "#1fb5a5"} />
          ))}
        </div>
      </HCard>
    </div>
  );
}

/** «الصحة والأمان»: the cards, then every check with its fix, the failed logins, and who needs a look. */
export function HealthSection() {
  const { tr, dateTime, ago } = useFmt();
  const health = useHealth();
  if (health.state.status === "loading") return <Skeleton className="h-96" />;
  if (health.state.status === "error" || !health.data) return <ErrorBox error={health.state.status === "error" ? health.state.error : null} onRetry={health.reload} />;
  const h = health.data;
  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-xl font-bold">{tr("الصحة والأمان", "Health and security")}</h2>
        <p className="text-sm text-muted">{tr("مؤشرات تُحسب من بيانات الموقع الحقيقية، وكل مشكلة معها مكان إصلاحها.", "Measures worked out from the site's real data, each problem with where to fix it.")}</p>
      </div>
      <HealthCards h={h} />
      <Card>
        <p className="flex items-center gap-2 border-b border-line px-4 py-3 font-bold">
          <ShieldCheck className="size-4" /> {tr("فحوص الأمان", "Security checks")}
        </p>
        <ul className="divide-y divide-line">
          {h.checks.map((c) => (
            <li key={c.key} className="flex items-start gap-3 p-4">
              {c.ok ? <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-success" /> : <XCircle className="mt-0.5 size-5 shrink-0 text-danger" />}
              <span className="min-w-0 flex-1">
                <span className="block font-semibold">
                  {tr(c.title, c.title_en)} <span className="text-xs font-normal text-muted">· {tr(`الوزن ${c.weight}`, `weight ${c.weight}`)}</span>
                </span>
                <span className="block text-sm text-muted">{tr(c.detail, c.detail_en)}</span>
              </span>
              {!c.ok && c.fix && (
                <Link href={c.fix} className="shrink-0 rounded-xl border border-line px-3 py-1.5 text-sm font-semibold text-primary-ink hover:bg-card-2">
                  {tr("أصلح", "Fix")}
                </Link>
              )}
            </li>
          ))}
        </ul>
      </Card>
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <p className="border-b border-line px-4 py-3 font-bold">{tr("آخر محاولات الدخول الفاشلة", "Latest failed logins")}</p>
          {h.logins.recent.length === 0 ? (
            <p className="p-4 text-sm text-muted">{tr("لا شيء في آخر 24 ساعة.", "Nothing in the last 24 hours.")}</p>
          ) : (
            <ul className="divide-y divide-line">
              {h.logins.recent.map((f, i) => (
                <li key={i} className="flex items-center gap-3 px-4 py-2.5 text-sm">
                  <span className="size-2 shrink-0 rounded-full" style={{ background: FAIL_COLORS[f.reason] }} />
                  <span className="min-w-0 flex-1">
                    <span className="block font-medium">{f.name ?? <span dir="ltr">{f.phone}</span>}</span>
                    <span className="text-xs text-muted">{failName(f.reason, tr)}</span>
                  </span>
                  <span className="text-xs text-muted" title={dateTime(f.at)}>
                    {ago(f.at)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>
        <Card>
          <p className="border-b border-line px-4 py-3 font-bold">{tr("حسابات تحتاج نظرة", "Accounts that need a look")}</p>
          <ul className="divide-y divide-line text-sm">
            {[
              ...h.users.weak.map((u) => ({ u, why: tr("كلمة مرور ضعيفة", "Weak password"), tone: "text-danger" })),
              ...h.users.idle.map((u) => ({ u, why: tr(`خامل منذ ${ago(u.last)}`, `Idle since ${ago(u.last)}`), tone: "text-warning" })),
              ...h.users.never.map((u) => ({ u, why: tr("لم يدخل أبداً", "Never logged in"), tone: "text-muted" })),
            ]
              .slice(0, 12)
              .map(({ u, why, tone }, i) => (
                <li key={i}>
                  <Link href="/users" className="box-row flex items-center gap-3 px-4 py-2.5 hover:bg-card-2">
                    <span className="min-w-0 flex-1">
                      <span className="block font-medium">{u.name}</span>
                      <span className="text-xs text-muted">{roleName(u.role, tr)}</span>
                    </span>
                    <span className={cn("text-xs font-semibold", tone)}>{why}</span>
                  </Link>
                </li>
              ))}
          </ul>
        </Card>
      </div>
    </div>
  );
}
