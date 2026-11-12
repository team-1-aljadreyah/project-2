"use client";

// Automation rules (advanced settings): the manager writes "when this happens, if …, then …" by himself.
// The server runs them for everyone (lib/api/mock/rules.ts → runRules): notifications, and holding a big
// order or expense for the manager's OK. Every run is written in the rules' log shown here.
import Link from "next/link";
import { useState } from "react";
import { Check, Pencil, Plus, Trash2, X, Zap } from "lucide-react";
import { roleName } from "@/components/status";
import { Button, Card, Dialog, errorText, Field, Input, Notice, Select, Switch, Textarea, useToast } from "@/components/ui";
import { api } from "@/lib/api";
import { RULE_FIELDS, type AutoRule, type Role, type RuleCondition, type RuleOp, type RuleTrigger } from "@/lib/api/types";
import { useFmt, type Tr } from "@/lib/i18n";
import { saveSite, useSite } from "@/lib/site";
import { useLoad } from "@/lib/use-load";
import { cn } from "@/lib/utils";

const TRIGGERS: { key: RuleTrigger; ar: string; en: string }[] = [
  { key: "order_created", ar: "يُكتب طلب جديد", en: "a new order is written" },
  { key: "payment_created", ar: "يُسجَّل تسديد", en: "a payment is recorded" },
  { key: "expense_created", ar: "يُسجَّل صرف", en: "an expense is recorded" },
  { key: "return_created", ar: "يُسجَّل مرتجع", en: "a return is recorded" },
];
const OPS_NUM: { key: RuleOp; ar: string; en: string }[] = [
  { key: "gt", ar: "أكبر من", en: "more than" },
  { key: "gte", ar: "أكبر من أو يساوي", en: "at least" },
  { key: "lt", ar: "أصغر من", en: "less than" },
  { key: "eq", ar: "يساوي", en: "equals" },
];
const OPS_TEXT: { key: RuleOp; ar: string; en: string }[] = [
  { key: "eq", ar: "يساوي", en: "is" },
  { key: "neq", ar: "لا يساوي", en: "is not" },
];
const ROLES: Role[] = ["manager", "accountant", "warehouse", "staff", "rep"];
const newId = () => `r_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;

/** The rule as one sentence, as the manager reads it back. */
export function ruleSentence(r: AutoRule, tr: Tr, num: (n: number) => string) {
  const t = TRIGGERS.find((x) => x.key === r.trigger)!;
  const conds = r.conditions.map((c) => {
    const f = RULE_FIELDS[r.trigger].find((x) => x.key === c.field);
    const op = [...OPS_NUM, ...OPS_TEXT].find((x) => x.key === c.op);
    const v = f?.type === "number" ? num(Number(c.value)) : (f?.options?.find((o) => o.value === c.value)?.[tr("ar", "en") as "ar" | "en"] ?? String(c.value));
    return `${f ? tr(f.ar, f.en) : c.field} ${op ? tr(op.ar, op.en) : ""} ${v}`;
  });
  const then = [
    r.notify.length ? tr(`أبلغ ${r.notify.map((x) => roleName(x, tr)).join(" و")}`, `notify ${r.notify.map((x) => roleName(x, tr)).join(" and ")}`) : "",
    r.approval ? tr("أوقفه حتى يوافق المدير", "hold it for the manager's OK") : "",
  ].filter(Boolean);
  return tr(
    `عندما ${t.ar}${conds.length ? `، وإذا كان ${conds.join(" و")}` : ""}، فإن: ${then.join("، و") || "لا شيء بعد"}.`,
    `When ${t.en}${conds.length ? `, if ${conds.join(" and ")}` : ""}, then: ${then.join(", and ") || "nothing yet"}.`,
  );
}

/** Ready rules to start from (the manager changes the numbers). */
const TEMPLATES = (tr: Tr): Omit<AutoRule, "id">[] => [
  {
    name: tr("طلب كبير يحتاج موافقتي", "Big order needs my OK"),
    active: true,
    trigger: "order_created",
    conditions: [{ field: "total", op: "gt", value: 5_000_000 }],
    notify: ["manager"],
    approval: true,
    message: tr("الطلب {number} من {customer} بمبلغ {amount} د.ع كتبه {by}", "Order {number} from {customer}: {amount} IQD by {by}"),
  },
  {
    name: tr("تسديد كبير يُبلَّغ للمحاسب", "Big payment: tell the accountant"),
    active: true,
    trigger: "payment_created",
    conditions: [{ field: "amount", op: "gte", value: 2_000_000 }],
    notify: ["accountant"],
    message: tr("تسديد {number} من {customer}: {amount} د.ع سجّله {by}", "Payment {number} from {customer}: {amount} IQD by {by}"),
  },
  {
    name: tr("مرتجع كبير يُبلَّغ للمدير", "Big return: tell the manager"),
    active: true,
    trigger: "return_created",
    conditions: [{ field: "amount", op: "gt", value: 500_000 }],
    notify: ["manager", "accountant"],
    message: tr("مرتجع {number} من {customer} بمبلغ {amount} د.ع", "Return {number} from {customer}: {amount} IQD"),
  },
];

export function RulesSection() {
  const { tr, num, ago } = useFmt();
  const site = useSite();
  const toast = useToast();
  const runs = useLoad(() => api.ruleRuns(), []);
  const [edit, setEdit] = useState<AutoRule | null>(null);
  const [removing, setRemoving] = useState<AutoRule | null>(null);
  const save = async (change: Parameters<typeof saveSite>[0], ok: string) => {
    try {
      await saveSite(change);
      toast("success", ok);
      return true;
    } catch (e) {
      toast("danger", errorText(e, tr));
      return false;
    }
  };
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold">{tr("قواعد الأتمتة", "Automation rules")}</h2>
          <p className="text-sm text-muted">{tr("«عندما… وإذا… فإن…»: يعمل الموقع وحده كما تريد، لكل الموظفين.", "“When… if… then…”: the site acts by itself as you want, for everyone.")}</p>
        </div>
        <Button variant="action" onClick={() => setEdit({ id: newId(), name: "", active: true, trigger: "order_created", conditions: [], notify: [] })}>
          <Plus className="size-4" /> {tr("قاعدة جديدة", "New rule")}
        </Button>
      </div>

      <Card className="p-4">
        <p className="mb-2 text-sm font-semibold">{tr("ابدأ من قاعدة جاهزة", "Start from a ready rule")}</p>
        <div className="flex flex-wrap gap-2">
          {TEMPLATES(tr).map((t) => (
            <button key={t.name} type="button" onClick={() => setEdit({ ...t, id: newId() })} className="flex items-center gap-2 rounded-xl border border-line px-3 py-2 text-sm hover:border-primary hover:bg-card-2">
              <Zap className="size-4 text-action" /> {t.name}
            </button>
          ))}
        </div>
      </Card>

      {site.rules.length > 0 && (
        <Card className="overflow-hidden">
          <ul className="divide-y divide-line">
            {site.rules.map((r) => (
              <li key={r.id} className="flex flex-wrap items-center gap-3 p-4">
                <span className={cn("flex size-9 shrink-0 items-center justify-center rounded-xl", r.active ? "bg-action/15 text-action" : "bg-card-2 text-muted")}>
                  <Zap className="size-4" />
                </span>
                <button type="button" onClick={() => setEdit(r)} className="box-row min-w-0 flex-1 text-start">
                  <span className="block font-semibold">{r.name}</span>
                  <span className="block text-sm text-muted">{ruleSentence(r, tr, num)}</span>
                </button>
                <Switch checked={r.active} onChange={(v) => save((s) => ({ ...s, rules: s.rules.map((x) => (x.id === r.id ? { ...x, active: v } : x)) }), v ? tr("القاعدة تعمل", "Rule on") : tr("أُوقفت القاعدة", "Rule off"))} label={<span className="sr-only">{r.name}</span>} />
                <Button size="sm" variant="ghost" onClick={() => setEdit(r)} aria-label={tr("تعديل", "Edit")}>
                  <Pencil className="size-4" />
                </Button>
                <Button size="sm" variant="ghost" className="text-danger" onClick={() => setRemoving(r)} aria-label={tr("حذف", "Delete")}>
                  <Trash2 className="size-4" />
                </Button>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <Card>
        <p className="border-b border-line px-4 py-3 font-bold">{tr("ماذا فعلت القواعد مؤخراً", "What the rules did lately")}</p>
        {!runs.data?.length ? (
          <p className="p-4 text-sm text-muted">{tr("لم تعمل أي قاعدة بعد.", "No rule has run yet.")}</p>
        ) : (
          <ul className="divide-y divide-line">
            {runs.data.slice(0, 20).map((x) => (
              <li key={x.id}>
                <Link href={x.link ?? "#"} className="box-row flex items-center gap-3 px-4 py-2.5 text-sm hover:bg-card-2">
                  <Zap className="size-4 shrink-0 text-action" />
                  <span className="min-w-0 flex-1">
                    <span className="block font-medium">
                      {x.rule} · <span className="num">{x.record}</span>
                    </span>
                    <span className="text-xs text-muted">{x.did}</span>
                  </span>
                  <span className="text-xs text-muted">{ago(x.at)}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {edit && (
        <RuleBuilder
          rule={edit}
          isNew={!site.rules.some((r) => r.id === edit.id)}
          onClose={() => setEdit(null)}
          onSave={async (r) => {
            const exists = site.rules.some((x) => x.id === r.id);
            if (await save((s) => ({ ...s, rules: exists ? s.rules.map((x) => (x.id === r.id ? r : x)) : [...s.rules, r] }), exists ? tr("حُفظت القاعدة", "Rule saved") : tr(`«${r.name}» تعمل الآن`, `${r.name} is on`))) setEdit(null);
          }}
        />
      )}
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
                  if (await save((s) => ({ ...s, rules: s.rules.filter((x) => x.id !== id) }), tr("حُذفت القاعدة", "Rule deleted"))) setRemoving(null);
                }}
              >
                <Trash2 className="size-4" /> {tr("حذف", "Delete")}
              </Button>
            </>
          }
        >
          <p className="text-sm">{tr("تتوقف القاعدة عن العمل. ما فعلته سابقاً يبقى في السجل.", "The rule stops. What it did stays in the log.")}</p>
        </Dialog>
      )}
    </div>
  );
}

function RuleBuilder({ rule, isNew, onClose, onSave }: { rule: AutoRule; isNew: boolean; onClose: () => void; onSave: (r: AutoRule) => Promise<void> }) {
  const { tr, num } = useFmt();
  const [r, setR] = useState<AutoRule>(rule);
  const [busy, setBusy] = useState(false);
  const fields = RULE_FIELDS[r.trigger];
  const canHold = r.trigger === "order_created" || r.trigger === "expense_created";
  const setCond = (i: number, c: Partial<RuleCondition>) => setR({ ...r, conditions: r.conditions.map((x, j) => (j === i ? { ...x, ...c } : x)) });
  const ready = r.name.trim().length >= 2 && (r.notify.length > 0 || (canHold && !!r.approval)) && r.conditions.every((c) => String(c.value).trim() !== "");
  const box = "rounded-2xl border border-line p-4";

  return (
    <Dialog
      open
      wide
      onClose={onClose}
      title={isNew ? tr("قاعدة جديدة", "New rule") : tr(`تعديل «${rule.name}»`, `Edit ${rule.name}`)}
      footer={
        <>
          <Button onClick={onClose}>{tr("إلغاء", "Cancel")}</Button>
          <Button
            variant="action"
            loading={busy}
            disabled={!ready}
            onClick={async () => {
              setBusy(true);
              await onSave({ ...r, name: r.name.trim(), message: r.message?.trim() || undefined, approval: canHold ? r.approval : undefined });
              setBusy(false);
            }}
          >
            <Check className="size-4" /> {tr("حفظ", "Save")}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label={tr("اسم القاعدة", "Rule name")}>
          <Input value={r.name} onChange={(e) => setR({ ...r, name: e.target.value })} placeholder={tr("مثال: طلب كبير يحتاج موافقتي", "e.g. Big order needs my OK")} autoFocus />
        </Field>

        <div className={box}>
          <p className="mb-2 font-bold">{tr("عندما", "When")}</p>
          <Select value={r.trigger} onChange={(e) => setR({ ...r, trigger: e.target.value as RuleTrigger, conditions: [], approval: undefined })}>
            {TRIGGERS.map((t) => (
              <option key={t.key} value={t.key}>
                {tr(t.ar, t.en)}
              </option>
            ))}
          </Select>
        </div>

        <div className={box}>
          <p className="mb-2 font-bold">{tr("وإذا كان", "If")}</p>
          {r.conditions.length === 0 && <p className="mb-2 text-sm text-muted">{tr("بلا شروط: تعمل في كل مرة.", "No conditions: it runs every time.")}</p>}
          <div className="space-y-2">
            {r.conditions.map((c, i) => {
              const f = fields.find((x) => x.key === c.field) ?? fields[0];
              const ops = f.type === "number" ? OPS_NUM : OPS_TEXT;
              return (
                <div key={i} className="flex flex-wrap items-center gap-2">
                  {i > 0 && <span className="text-xs font-bold text-muted">{tr("و", "and")}</span>}
                  <Select value={c.field} onChange={(e) => setCond(i, { field: e.target.value, op: fields.find((x) => x.key === e.target.value)?.type === "number" ? "gt" : "eq", value: "" })} className="w-44">
                    {fields.map((x) => (
                      <option key={x.key} value={x.key}>
                        {tr(x.ar, x.en)}
                      </option>
                    ))}
                  </Select>
                  <Select value={c.op} onChange={(e) => setCond(i, { op: e.target.value as RuleOp })} className="w-40">
                    {ops.map((o) => (
                      <option key={o.key} value={o.key}>
                        {tr(o.ar, o.en)}
                      </option>
                    ))}
                  </Select>
                  {f.options ? (
                    <Select value={String(c.value)} onChange={(e) => setCond(i, { value: e.target.value })} className="w-40">
                      <option value="">{tr("اختر", "Choose")}</option>
                      {f.options.map((o) => (
                        <option key={o.value} value={o.value}>
                          {tr(o.ar, o.en)}
                        </option>
                      ))}
                    </Select>
                  ) : (
                    <Input
                      type={f.type === "number" ? "number" : "text"}
                      dir={f.type === "number" ? "ltr" : undefined}
                      value={String(c.value)}
                      onChange={(e) => setCond(i, { value: f.type === "number" && e.target.value !== "" ? Number(e.target.value) : e.target.value })}
                      className="w-44"
                    />
                  )}
                  <button type="button" onClick={() => setR({ ...r, conditions: r.conditions.filter((_, j) => j !== i) })} className="rounded-lg p-2 text-faint hover:bg-danger-soft hover:text-danger" aria-label={tr("حذف الشرط", "Remove")}>
                    <X className="size-4" />
                  </button>
                </div>
              );
            })}
          </div>
          <Button size="sm" className="mt-2" onClick={() => setR({ ...r, conditions: [...r.conditions, { field: fields[0].key, op: fields[0].type === "number" ? "gt" : "eq", value: "" }] })}>
            <Plus className="size-4" /> {tr("شرط", "Condition")}
          </Button>
        </div>

        <div className={box}>
          <p className="mb-2 font-bold">{tr("فإن", "Then")}</p>
          <p className="mb-1.5 text-sm">{tr("أرسل إشعاراً إلى", "Notify")}</p>
          <div className="flex flex-wrap gap-2">
            {ROLES.map((x) => {
              const on = r.notify.includes(x);
              return (
                <button key={x} type="button" onClick={() => setR({ ...r, notify: on ? r.notify.filter((y) => y !== x) : [...r.notify, x] })} className={cn("rounded-xl border px-3 py-2 text-sm font-semibold", on ? "border-primary bg-primary-soft text-primary-ink" : "border-line hover:bg-card-2")}>
                  {roleName(x, tr)}
                </button>
              );
            })}
          </div>
          {canHold && (
            <div className="mt-3">
              <Switch
                checked={!!r.approval}
                onChange={(v) => setR({ ...r, approval: v || undefined })}
                label={r.trigger === "order_created" ? tr("أوقف الطلب حتى يوافق المدير (الكمية تبقى محجوزة)", "Hold the order until the manager agrees (stock stays held)") : tr("لا يُحسب الصرف حتى يوافق المدير", "The expense doesn't count until the manager agrees")}
              />
            </div>
          )}
          <Field label={tr("نص الإشعار (اختياري)", "Notification text (optional)")} hint={tr("يُملأ تلقائياً: {number} الرقم، {amount} المبلغ، {customer} الزبون، {by} من كتبه", "Filled in: {number} {amount} {customer} {by}")} className="mt-3">
            <Textarea rows={2} value={r.message ?? ""} onChange={(e) => setR({ ...r, message: e.target.value })} placeholder={tr("الطلب {number} من {customer} بمبلغ {amount} د.ع", "Order {number} from {customer}: {amount} IQD")} />
          </Field>
        </div>

        <Notice tone="primary" title={tr("القاعدة كما ستعمل", "The rule as it will run")}>
          {ruleSentence(r, tr, num)}
        </Notice>
      </div>
    </Dialog>
  );
}
