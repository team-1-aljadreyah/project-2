"use client";

// The manager's own fields (advanced settings → object manager) where the records are: the boxes in the
// customer and item forms, the «حقول إضافية» card on the customer, item and order pages, and the extra
// table columns. Each person sees and changes only the fields their job is allowed (the server checks too).
import { useState } from "react";
import { Pencil } from "lucide-react";
import { Button, Card, CardHeader, errorText, Field, Input, Select, Switch, useToast, type Column } from "@/components/ui";
import { api, ApiError } from "@/lib/api";
import type { CustomField, CustomObject, CustomValue, Role } from "@/lib/api/types";
import { useSession } from "@/lib/auth";
import { useFmt, type Tr } from "@/lib/i18n";
import { useSite } from "@/lib/site";

type Values = Record<string, CustomValue | null>;

const sees = (f: CustomField, role?: Role) => role === "manager" || !f.view_roles.length || (!!role && f.view_roles.includes(role));
const changes = (f: CustomField, role?: Role) => role === "manager" || (!!role && sees(f, role) && f.edit_roles.includes(role));

/** The active fields of a record type this person may see, and which of them they may change. */
export function useFields(object: CustomObject) {
  const site = useSite();
  const role = useSession()?.user.role;
  const all = site.fields.filter((f) => f.active && f.object === object && sees(f, role));
  return { fields: all, editable: all.filter((f) => changes(f, role)) };
}

export const fieldLabel = (f: CustomField, tr: Tr) => tr(f.label, f.label_en || f.label);

/** A value as text ("نعم", a date, a number with commas). */
export function showValue(f: CustomField, v: CustomValue | null | undefined, fmt: { tr: Tr; num: (n: number) => string; date: (d: string) => string }) {
  if (v === undefined || v === null || v === "") return "-";
  if (f.type === "yesno") return v ? fmt.tr("نعم", "Yes") : fmt.tr("لا", "No");
  if (f.type === "number") return fmt.num(Number(v));
  if (f.type === "date") return fmt.date(String(v));
  return String(v);
}

/** The required fields left empty (the forms check before saving). */
export function missingRequired(fields: CustomField[], values: Values) {
  return fields.filter((f) => f.required && (values[f.id] === undefined || values[f.id] === null || values[f.id] === ""));
}

/** One box for one field, by its type. */
export function FieldInput({ field, value, onChange, error }: { field: CustomField; value: CustomValue | null | undefined; onChange: (v: CustomValue | null) => void; error?: string }) {
  const { tr } = useFmt();
  const label = `${fieldLabel(field, tr)}${field.required ? " *" : ""}`;
  if (field.type === "yesno")
    return (
      <div className="flex flex-col justify-end">
        <Switch checked={value === true} onChange={(v) => onChange(v)} label={label} />
        {field.help && <p className="text-xs text-muted">{field.help}</p>}
      </div>
    );
  return (
    <Field label={label} error={error} hint={field.help}>
      {field.type === "list" ? (
        <Select value={typeof value === "string" ? value : ""} onChange={(e) => onChange(e.target.value || null)} invalid={!!error}>
          <option value="">{tr("اختر", "Choose")}</option>
          {(field.options ?? []).map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
        </Select>
      ) : (
        <Input
          type={field.type === "number" ? "number" : field.type === "date" ? "date" : "text"}
          dir={field.type === "text" ? undefined : "ltr"}
          value={value === null || value === undefined ? "" : String(value)}
          onChange={(e) => onChange(e.target.value === "" ? null : field.type === "number" ? Number(e.target.value) : e.target.value)}
          invalid={!!error}
        />
      )}
    </Field>
  );
}

/** The editable fields inside a record's form (the form saves them after the record). */
export function CustomInputs({ object, values, onChange, errors }: { object: CustomObject; values: Values; onChange: (v: Values) => void; errors?: Record<string, string> }) {
  const { tr } = useFmt();
  const { editable } = useFields(object);
  if (!editable.length) return null;
  return (
    <div className="sm:col-span-2">
      <p className="mb-2 mt-2 border-t border-line pt-3 text-sm font-bold">{tr("حقول إضافية", "More fields")}</p>
      <div className="grid gap-3 sm:grid-cols-2">
        {editable.map((f) => (
          <FieldInput key={f.id} field={f} value={values[f.id]} onChange={(v) => onChange({ ...values, [f.id]: v })} error={errors?.[`custom.${f.id}`]} />
        ))}
      </div>
    </div>
  );
}

/** Saving a form's extra fields after the record itself (only what changed). */
export async function saveCustom(object: CustomObject, id: number, before: Values | undefined, values: Values) {
  const changed: Values = {};
  for (const [k, v] of Object.entries(values)) if ((before?.[k] ?? null) !== (v ?? null)) changed[k] = v;
  if (Object.keys(changed).length) await api.saveCustomValues(object, id, changed);
}

/** «حقول إضافية» on a record's page: the values, and «تعديل» for whoever may change them. */
export function CustomFieldsCard({ object, id, values, onSaved }: { object: CustomObject; id: number; values?: Record<string, CustomValue>; onSaved?: () => void }) {
  const fmt = useFmt();
  const { tr } = fmt;
  const toast = useToast();
  const { fields, editable } = useFields(object);
  const [edit, setEdit] = useState<Values | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  if (!fields.length) return null;
  async function save() {
    if (!edit) return;
    setBusy(true);
    setErrors({});
    try {
      await saveCustom(object, id, values, edit);
      toast("success", tr("حُفظت الحقول", "Fields saved"));
      setEdit(null);
      onSaved?.();
    } catch (e) {
      if (e instanceof ApiError && e.errors) setErrors(e.errors);
      toast("danger", errorText(e, tr));
    } finally {
      setBusy(false);
    }
  }
  return (
    <Card>
      <CardHeader
        title={tr("حقول إضافية", "More fields")}
        action={
          editable.length > 0 && !edit ? (
            <Button size="sm" variant="ghost" onClick={() => setEdit({ ...values })}>
              <Pencil className="size-4" /> {tr("تعديل", "Edit")}
            </Button>
          ) : undefined
        }
      />
      {edit ? (
        <div className="p-4">
          <div className="grid gap-3 sm:grid-cols-2">
            {fields.map((f) =>
              editable.includes(f) ? (
                <FieldInput key={f.id} field={f} value={edit[f.id]} onChange={(v) => setEdit({ ...edit, [f.id]: v })} error={errors[`custom.${f.id}`]} />
              ) : (
                <Field key={f.id} label={fieldLabel(f, tr)}>
                  <p className="py-2 text-sm">{showValue(f, values?.[f.id], fmt)}</p>
                </Field>
              ),
            )}
          </div>
          <div className="mt-3 flex gap-2">
            <Button variant="primary" loading={busy} onClick={save}>
              {tr("حفظ", "Save")}
            </Button>
            <Button onClick={() => setEdit(null)}>{tr("إلغاء", "Cancel")}</Button>
          </div>
        </div>
      ) : (
        <dl className="grid gap-x-8 p-4 sm:grid-cols-2">
          {fields.map((f) => (
            <div key={f.id} className="flex items-center justify-between gap-3 border-b border-line py-2 last:border-0 sm:[&:nth-last-child(2)]:border-0">
              <dt className="text-sm text-muted">{fieldLabel(f, tr)}</dt>
              <dd className="text-end text-sm font-medium">{showValue(f, values?.[f.id], fmt)}</dd>
            </div>
          ))}
        </dl>
      )}
    </Card>
  );
}

/** The table columns of the fields marked «in the table». */
export function useCustomColumns<T extends { custom?: Record<string, CustomValue> }>(object: CustomObject): Column<T>[] {
  const fmt = useFmt();
  const { fields } = useFields(object);
  return fields
    .filter((f) => f.in_table)
    .map((f) => ({
      key: `cf_${f.id}`,
      head: fieldLabel(f, fmt.tr),
      cell: (row: T) => <span className={f.type === "number" ? "num" : undefined}>{showValue(f, row.custom?.[f.id], fmt)}</span>,
    }));
}
