"use client";

// The pieces of the manager's "customize mode" (see lib/site.ts):
// - EditText: a text or a number you click to change in its place.
// - TextPicker: in the mode, a click on ANY text of any page opens a small box to rewrite it.
// - SortArea + SortItem (sortable.tsx): things you drag to a new place, and hide with the eye.
// - CustomizeToggle (top bar), CustomizeBar (the strip that explains the mode), BrandDialog (name and logo).
// When the mode is off, all of these show their content as it is, with nothing added.
import { useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Check, ImagePlus, Paintbrush, RotateCcw, Trash2 } from "lucide-react";
import type { Brand, SiteCustom } from "@/lib/api/types";
import { useFmt } from "@/lib/i18n";
import { shrinkImage } from "@/lib/image";
import { DEFAULT_SITE, saveSite, setCustomizing, useCustomizing, useSite } from "@/lib/site";
import { originalOf, setRecording, toTemplate } from "@/lib/texts";
import { cn } from "@/lib/utils";
import { LogoMark } from "./logo";

export { SortArea, SortItem, toggleIn } from "./sortable";
import { Button, Dialog, Field, Input, errorText, useToast } from "./ui";

/** Save a change to the customization, and say so if it fails. */
export function useSaveSite() {
  const toast = useToast();
  const { tr } = useFmt();
  return (change: (s: SiteCustom) => SiteCustom) => saveSite(change).catch((e) => toast("danger", errorText(e, tr)));
}

// ---------- a text you click to change ----------
export function EditText({
  value,
  onSave,
  numeric,
  always,
  className,
  children,
}: {
  /** The text that goes into the box when you click. */
  value: string | number;
  onSave: (v: string) => void | Promise<unknown>;
  numeric?: boolean;
  /** Editable even outside customize mode. */
  always?: boolean;
  className?: string;
  /** What shows when not editing (default: the value). */
  children?: ReactNode;
}) {
  const { tr } = useFmt();
  const mode = useCustomizing();
  const [text, setText] = useState<string | null>(null);
  const done = useRef(false);
  if (!mode && !always) return <>{children ?? value}</>;

  if (text === null)
    return (
      <span
        role="button"
        data-cz
        tabIndex={0}
        title={tr("اضغط للتعديل", "Click to edit")}
        className={cn("cursor-text rounded-md outline-1 outline-offset-2 outline-dashed outline-action/70 hover:bg-action/10", className)}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          done.current = false;
          setText(String(value));
        }}
        onKeyDown={(e) => {
          if (e.key !== "Enter") return;
          e.preventDefault();
          done.current = false;
          setText(String(value));
        }}
      >
        {children ?? value}
      </span>
    );

  const finish = (save: boolean) => {
    if (done.current) return;
    done.current = true;
    const v = text.trim();
    setText(null);
    if (save && v && v !== String(value)) void onSave(v);
  };
  return (
    <input
      data-cz
      autoFocus
      value={text}
      size={Math.max(4, text.length + 1)}
      inputMode={numeric ? "numeric" : undefined}
      dir={numeric ? "ltr" : undefined}
      aria-label={tr("النص الجديد", "New text")}
      className={cn("max-w-full rounded-md border border-action bg-card px-1.5 py-0.5 text-text outline-none", numeric && "num text-end", className)}
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
      }}
      onChange={(e) => setText(numeric ? e.target.value.replace(/[^\d.]/g, "") : e.target.value)}
      onFocus={(e) => e.target.select()}
      onBlur={() => finish(true)}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === "Enter") finish(true);
        if (e.key === "Escape") finish(false);
      }}
    />
  );
}

// ---------- the switch in the top bar ----------
export function CustomizeToggle() {
  const { tr } = useFmt();
  const mode = useCustomizing();
  return (
    <button
      type="button"
      onClick={() => setCustomizing(!mode)}
      aria-pressed={mode}
      data-cz
      className={cn("inline-flex h-10 items-center gap-1.5 rounded-xl px-2.5 text-sm font-medium transition", mode ? "bg-action text-white" : "text-muted hover:bg-card-2 hover:text-text")}
    >
      {mode ? <Check className="size-[18px]" /> : <Paintbrush className="size-[18px]" />}
      <span className="hidden xl:inline">{mode ? tr("تم", "Done") : tr("تخصيص", "Customize")}</span>
    </button>
  );
}

// ---------- the strip under the top bar ----------
export function CustomizeBar() {
  const { tr } = useFmt();
  const mode = useCustomizing();
  const save = useSaveSite();
  const [brand, setBrand] = useState(false);
  if (!mode) return null;
  return (
    <div data-cz className="no-print sticky top-14 z-20 flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-action/30 bg-action/10 px-4 py-2 text-sm backdrop-blur sm:top-16">
      <Paintbrush className="size-4 shrink-0 text-action" />
      <p className="min-w-0 flex-1 basis-64">
        <b>{tr("وضع التخصيص.", "Customize mode.")}</b>{" "}
        {tr(
          "اضغط على أي نص في أي صفحة لتغييره، واسحب المقبض لتغيير المكان، واضغط العين للإخفاء. للانتقال بين الصفحات اضغط أيقونة الصفحة في القائمة، ولتشغيل زرّ اضغطه مع Ctrl. يُحفظ كل تغيير فوراً.",
          "Click any text on any page to change it, drag the handle to move things, and press the eye to hide. To go to another page click its icon in the menu; to use a button, Ctrl-click it. Every change is saved at once.",
        )}
        <span className="md:hidden"> {tr("ترتيب القائمة الجانبية يكون من الحاسوب.", "The side menu is arranged from a computer.")}</span>
      </p>
      <Button size="sm" onClick={() => setBrand(true)}>
        <ImagePlus className="size-4" /> {tr("الاسم والشعار", "Name and logo")}
      </Button>
      <Button
        size="sm"
        variant="ghost"
        onClick={() => {
          if (
            !confirm(
              tr(
                "إرجاع كل شيء إلى أصله: القائمة، لوحة التحكم، النصوص والأعمدة؟ (الاسم والشعار واللون تبقى)",
                "Put everything back: the menu, the dashboard, the texts and the columns? (The name, logo and color stay)",
              ),
            )
          )
            return;
          void save((s) => ({ ...s, nav: DEFAULT_SITE.nav, dashboard: DEFAULT_SITE.dashboard, texts: {}, layouts: {} }));
        }}
      >
        <RotateCcw className="size-4" /> {tr("إرجاع الأصل", "Reset")}
      </Button>
      <Button size="sm" variant="primary" onClick={() => setCustomizing(false)}>
        <Check className="size-4" /> {tr("تم", "Done")}
      </Button>
      {brand && <BrandDialog onClose={() => setBrand(false)} />}
      <TextPicker />
    </div>
  );
}

// ---------- the company's name and logo ----------
export function BrandDialog({ onClose }: { onClose: () => void }) {
  const { tr } = useFmt();
  const toast = useToast();
  const site = useSite();
  const [b, setB] = useState<Brand>(site.brand);
  const [color, setColor] = useState(site.look.action ?? "");
  const [busy, setBusy] = useState(false);
  const file = useRef<HTMLInputElement>(null);
  const put = (p: Partial<Brand>) => setB((x) => ({ ...x, ...p }));

  async function save() {
    setBusy(true);
    try {
      await saveSite((s) => ({ ...s, brand: b, look: { ...s.look, action: color || undefined } }));
      toast("success", tr("تم الحفظ، ويظهر الاسم والشعار الآن في كل الصفحات والفواتير", "Saved. The name and logo now show on every page and invoice"));
      onClose();
    } catch (e) {
      toast("danger", errorText(e, tr));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog
      open
      plain
      onClose={onClose}
      title={tr("الاسم والشعار", "Name and logo")}
      footer={
        <>
          <Button onClick={onClose}>{tr("إلغاء", "Cancel")}</Button>
          <Button variant="primary" loading={busy} onClick={save}>
            {tr("حفظ", "Save")}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="flex items-center gap-4">
          <LogoMark size={64} logo={b.logo ?? null} />
          <div className="flex flex-wrap gap-2">
            <Button size="sm" onClick={() => file.current?.click()}>
              <ImagePlus className="size-4" /> {b.logo ? tr("تغيير الشعار", "Change logo") : tr("رفع شعار", "Upload a logo")}
            </Button>
            {b.logo && (
              <Button size="sm" variant="ghost" onClick={() => put({ logo: undefined })}>
                <Trash2 className="size-4" /> {tr("الشعار الأصلي", "Original mark")}
              </Button>
            )}
            <input
              ref={file}
              type="file"
              accept="image/*"
              hidden
              onChange={async (e) => {
                const f = e.target.files?.[0];
                e.target.value = "";
                if (!f) return;
                try {
                  put({ logo: await shrinkImage(f, 256, 0.85) });
                } catch {
                  toast("danger", tr("تعذّرت قراءة الصورة", "Couldn't read the picture"));
                }
              }}
            />
          </div>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label={tr("الاسم المختصر", "Short name")}>
            <Input value={b.name} onChange={(e) => put({ name: e.target.value })} />
          </Field>
          <Field label={tr("الاسم المختصر (إنجليزي)", "Short name (English)")}>
            <Input dir="ltr" value={b.name_en} onChange={(e) => put({ name_en: e.target.value })} />
          </Field>
          <Field label={tr("الوصف تحت الاسم", "Line under the name")}>
            <Input value={b.tagline} onChange={(e) => put({ tagline: e.target.value })} />
          </Field>
          <Field label={tr("الوصف (إنجليزي)", "Line (English)")}>
            <Input dir="ltr" value={b.tagline_en} onChange={(e) => put({ tagline_en: e.target.value })} />
          </Field>
          <Field label={tr("اسم الشركة في الفواتير", "Company name on invoices")}>
            <Input value={b.company} onChange={(e) => put({ company: e.target.value })} />
          </Field>
          <Field label={tr("اسم الشركة (إنجليزي)", "Company name (English)")}>
            <Input dir="ltr" value={b.company_en} onChange={(e) => put({ company_en: e.target.value })} />
          </Field>
          <Field label={tr("هاتف الشركة", "Company phone")} hint={tr("يُطبع في الفاتورة", "Printed on the invoice")}>
            <Input dir="ltr" inputMode="tel" value={b.phone} onChange={(e) => put({ phone: e.target.value })} />
          </Field>
        </div>
        <Field label={tr("لون الأزرار الرئيسية", "Color of the main buttons")}>
          <div className="flex flex-wrap items-center gap-2">
            {COLORS.map((x) => (
              <button
                key={x}
                type="button"
                onClick={() => setColor(x === COLORS[0] ? "" : x)}
                aria-label={x}
                aria-pressed={(color || COLORS[0]) === x}
                className={cn("size-8 rounded-full border-2 border-card outline-2 outline-offset-1", (color || COLORS[0]) === x ? "outline-text" : "outline-transparent")}
                style={{ background: x }}
              />
            ))}
            <input
              type="color"
              value={color || COLORS[0]}
              onChange={(e) => setColor(e.target.value)}
              aria-label={tr("لون آخر", "Another color")}
              className="h-8 w-10 cursor-pointer rounded-lg border border-line bg-card p-0.5"
            />
          </div>
        </Field>
      </div>
    </Dialog>
  );
}

/** The first is the site's own orange (choosing it = no custom color). */
const COLORS = ["#e1692b", "#2563eb", "#16a34a", "#0d9488", "#9333ea", "#dc2626", "#b45309", "#1d2127"];

// ---------- a click on any text of the page ----------
type Caret = { caretPositionFromPoint?: (x: number, y: number) => { offsetNode: Node } | null; caretRangeFromPoint?: (x: number, y: number) => Range | null };

/** The text under the mouse, if it is one the site wrote through tr() (so it has an original to rewrite). */
function textUnder(e: MouseEvent): { key: string; text: string; el: HTMLElement } | null {
  const t = e.target;
  // Ctrl-click (or ⌘) is a normal click: that is how a button or a link is used while customizing.
  if (!(t instanceof Element) || e.ctrlKey || e.metaKey) return null;
  if (t.closest("[data-cz],input,textarea,select,[contenteditable]")) return null;
  const doc = document as unknown as Caret;
  const at = doc.caretPositionFromPoint?.(e.clientX, e.clientY)?.offsetNode ?? doc.caretRangeFromPoint?.(e.clientX, e.clientY)?.startContainer;
  const nodes: Text[] = [];
  if (at instanceof Text && t.contains(at)) nodes.push(at);
  t.childNodes.forEach((n) => n instanceof Text && nodes.push(n));
  for (const n of nodes) {
    const key = originalOf(n.data);
    if (!key || !n.parentElement) continue;
    // Only when the mouse is on the words themselves: the empty part of a card or a button stays a normal click.
    const range = document.createRange();
    range.selectNodeContents(n);
    const on = [...range.getClientRects()].some((r) => e.clientX >= r.left - 3 && e.clientX <= r.right + 3 && e.clientY >= r.top - 3 && e.clientY <= r.bottom + 3);
    if (on) return { key, text: n.data.trim(), el: n.parentElement };
  }
  return null;
}

function TextPicker() {
  const { tr, lang } = useFmt();
  const toast = useToast();
  const save = useSaveSite();
  const site = useSite();
  const [pick, setPick] = useState<{ key: string; text: string; x: number; y: number } | null>(null);
  const [value, setValue] = useState("");

  // While the mode is on, every text the pages draw is remembered with its original.
  useEffect(() => {
    setRecording(true);
    return () => setRecording(false);
  }, []);

  useEffect(() => {
    let lit: HTMLElement | null = null;
    const unlight = () => {
      lit?.removeAttribute("data-cz-hover");
      lit = null;
    };
    const over = (e: MouseEvent) => {
      const f = textUnder(e);
      if (f?.el === lit) return;
      unlight();
      if (f) {
        lit = f.el;
        lit.setAttribute("data-cz-hover", "");
      }
    };
    const click = (e: MouseEvent) => {
      const f = textUnder(e);
      if (!f) return;
      // The click edits the text; it doesn't open the link or press the button under it.
      e.preventDefault();
      e.stopPropagation();
      const r = f.el.getBoundingClientRect();
      setValue(f.text);
      setPick({ key: f.key, text: f.text, x: r.left + r.width / 2, y: r.bottom });
    };
    document.addEventListener("mousemove", over, true);
    document.addEventListener("click", click, true);
    return () => {
      document.removeEventListener("mousemove", over, true);
      document.removeEventListener("click", click, true);
      unlight();
    };
  }, []);

  if (!pick) return null;
  const close = () => setPick(null);
  const changed = !!site.texts[pick.key]?.[lang];
  const submit = () => {
    const v = value.trim();
    if (!v || v === pick.text) return close();
    const text = toTemplate(v, pick.text);
    if (text === null) return toast("danger", tr("أبقِ الأرقام في النص كما هي: تتغيّر وحدها", "Keep the numbers in the text: they change by themselves"));
    void save((s) => ({ ...s, texts: { ...s.texts, [pick.key]: { ...s.texts[pick.key], [lang]: text } } }));
    close();
  };
  const original = () => {
    void save((s) => {
      const rest = { ...s.texts[pick.key] };
      delete rest[lang];
      const texts = { ...s.texts, [pick.key]: rest };
      if (!rest.ar && !rest.en) delete texts[pick.key];
      return { ...s, texts };
    });
    close();
  };
  const left = Math.max(8, Math.min(pick.x - 160, window.innerWidth - 328));
  const top = Math.max(8, Math.min(pick.y + 8, window.innerHeight - 190));
  return createPortal(
    <div data-cz className="no-print fixed z-[70] w-80 rounded-2xl border border-action/50 bg-card p-3 shadow-xl" style={{ left, top }}>
      <p className="mb-2 text-xs font-medium text-muted">{tr("النص الجديد (يتغيّر في كل الصفحات ولكل المستخدمين)", "The new text (it changes on every page, for everyone)")}</p>
      <textarea
        autoFocus
        rows={2}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onFocus={(e) => e.target.select()}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            submit();
          }
          if (e.key === "Escape") close();
        }}
        className="w-full resize-none rounded-xl border border-line bg-card-2 px-3 py-2 text-sm text-text outline-none focus:border-action"
      />
      <div className="mt-2 flex flex-wrap justify-end gap-2">
        {changed && (
          <Button size="sm" variant="ghost" onClick={original}>
            <RotateCcw className="size-4" /> {tr("النص الأصلي", "Original text")}
          </Button>
        )}
        <Button size="sm" onClick={close}>
          {tr("إلغاء", "Cancel")}
        </Button>
        <Button size="sm" variant="primary" onClick={submit}>
          {tr("حفظ", "Save")}
        </Button>
      </div>
    </div>,
    document.body,
  );
}
