"use client";

// The small building blocks every screen uses: buttons, inputs, cards, badges, dialogs, tables.
// Keeping them in one place means every screen looks and behaves the same.
import { createPortal } from "react-dom";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { splitAppPath, useAppRouter } from "@/lib/app-path";
import { createContext, useCallback, useContext, useEffect, useId, useRef, useState, type ReactNode } from "react";
import { AlertTriangle, ArrowLeft, ArrowRight, CheckCircle2, ChevronRight, Info, Loader2, Minus, Plus, Search, X, XCircle } from "lucide-react";
import { ApiError } from "@/lib/api/errors";
import { useSession } from "@/lib/auth";
import { deniedOf } from "@/lib/access";
import { useFmt } from "@/lib/i18n";
import { ordered, saveSite, useCustomizing, useSite } from "@/lib/site";
import { cn } from "@/lib/utils";
import { canOpen, pageTitle } from "./nav";
import { SortArea, SortItem, toggleIn } from "./sortable";

// ---------- Button ----------

type Variant = "primary" | "action" | "secondary" | "ghost" | "danger" | "soft";
type Size = "sm" | "md" | "lg";

const variants: Record<Variant, string> = {
  primary: "bg-primary text-on-primary hover:bg-primary-hover",
  // Amber: only ONE per screen, for the main thing to do (send order, save payment).
  action: "bg-action text-on-action hover:bg-action-hover font-semibold",
  secondary: "bg-card text-text border border-line-strong hover:bg-card-2",
  ghost: "text-text hover:bg-card-2",
  danger: "bg-danger-soft text-danger hover:brightness-95",
  soft: "bg-primary-soft text-primary-ink hover:brightness-95",
};
const sizes: Record<Size, string> = {
  sm: "h-8 px-3 text-sm gap-1.5 rounded-lg",
  md: "h-10 px-4 text-sm gap-2 rounded-xl",
  lg: "h-12 px-5 text-base gap-2 rounded-xl",
};

export function Button({
  variant = "secondary",
  size = "md",
  loading,
  className,
  children,
  href,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: Size; loading?: boolean; href?: string }) {
  const cls = cn(
    "inline-flex shrink-0 items-center justify-center whitespace-nowrap font-medium transition active:scale-[0.98] disabled:pointer-events-none disabled:opacity-50 select-none",
    variants[variant],
    sizes[size],
    className,
  );
  if (href) {
    return (
      <Link href={href} className={cls}>
        {children}
      </Link>
    );
  }
  return (
    <button type="button" className={cls} disabled={loading || props.disabled} {...props}>
      {loading && <Loader2 className="size-4 animate-spin" aria-hidden />}
      {children}
    </button>
  );
}

export function IconButton({ label, className, children, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement> & { label: string }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className={cn("relative inline-flex size-10 items-center justify-center rounded-xl text-muted transition hover:bg-card-2 hover:text-text", className)}
      {...props}
    >
      {children}
    </button>
  );
}

// ---------- Form ----------

export function Field({ label, error, hint, children, className, htmlFor }: { label?: ReactNode; error?: string; hint?: ReactNode; children: ReactNode; className?: string; htmlFor?: string }) {
  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      {label && (
        <label htmlFor={htmlFor} className="text-sm font-medium text-text">
          {label}
        </label>
      )}
      {children}
      {error ? <p className="text-xs text-danger">{error}</p> : hint ? <p className="text-xs text-faint">{hint}</p> : null}
    </div>
  );
}

const inputCls =
  "h-11 w-full rounded-xl border border-line-strong bg-card px-3 text-base text-text placeholder:text-faint outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20 disabled:opacity-60 sm:text-sm";

export function Input({ className, invalid, ...props }: React.InputHTMLAttributes<HTMLInputElement> & { invalid?: boolean }) {
  return <input className={cn(inputCls, invalid && "border-danger focus:border-danger focus:ring-danger/20", className)} {...props} />;
}

export function Textarea({ className, ...props }: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={cn(inputCls, "h-auto min-h-20 py-2", className)} {...props} />;
}

export function Select({ className, invalid, children, ...props }: React.SelectHTMLAttributes<HTMLSelectElement> & { invalid?: boolean }) {
  return (
    <select className={cn(inputCls, "cursor-pointer pe-8", invalid && "border-danger", className)} {...props}>
      {children}
    </select>
  );
}

/** Money / numbers: shows 1,250,000 while typing, keeps a plain number. */
export function NumberInput({
  value,
  onChange,
  className,
  invalid,
  suffix,
  ...props
}: Omit<React.InputHTMLAttributes<HTMLInputElement>, "value" | "onChange"> & {
  value: number | "";
  onChange: (v: number | "") => void;
  invalid?: boolean;
  suffix?: string;
}) {
  const shown = value === "" ? "" : new Intl.NumberFormat("en-US").format(value);
  return (
    <div className="relative">
      <Input
        inputMode="numeric"
        dir="ltr"
        className={cn("num text-start", suffix && "pr-14", className)}
        invalid={invalid}
        value={shown}
        onChange={(e) => {
          // Arabic digits (٠١٢) typed on the phone keyboard become 012, then everything else is removed.
          const digits = e.target.value.replace(/[٠-٩]/g, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d))).replace(/[^\d]/g, "");
          onChange(digits === "" ? "" : Number(digits));
        }}
        {...props}
      />
      {/* The number is typed left-to-right, so the unit sits on the right side in both languages. */}
      {suffix && <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-xs text-faint">{suffix}</span>}
    </div>
  );
}

export function SearchBox({ value, onChange, placeholder, className }: { value: string; onChange: (v: string) => void; placeholder: string; className?: string }) {
  return (
    <div className={cn("relative", className)}>
      <Search className="pointer-events-none absolute inset-y-0 start-3 my-auto size-4 text-faint" aria-hidden />
      <Input type="search" value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} className="ps-9" />
    </div>
  );
}

/** − 3 + : big buttons for the rep's thumb. */
export function Stepper({ value, onChange, min = 0, max }: { value: number; onChange: (v: number) => void; min?: number; max?: number }) {
  const { tr } = useFmt();
  return (
    <div className="inline-flex h-11 items-center rounded-xl border border-line-strong bg-card" dir="ltr">
      <button
        type="button"
        aria-label={tr("أقل", "Less")}
        className="flex size-11 items-center justify-center text-muted hover:text-text disabled:opacity-40"
        disabled={value <= min}
        onClick={() => onChange(Math.max(min, value - 1))}
      >
        <Minus className="size-4" />
      </button>
      <input
        inputMode="numeric"
        aria-label={tr("الكمية", "Quantity")}
        className="num h-full w-12 bg-transparent text-center text-base font-semibold outline-none"
        value={value}
        onChange={(e) => {
          const n = Number(e.target.value.replace(/[^\d]/g, "") || 0);
          onChange(max !== undefined ? Math.min(max, n) : n);
        }}
      />
      <button
        type="button"
        aria-label={tr("أكثر", "More")}
        className="flex size-11 items-center justify-center text-muted hover:text-text disabled:opacity-40"
        disabled={max !== undefined && value >= max}
        onClick={() => onChange(max !== undefined ? Math.min(max, value + 1) : value + 1)}
      >
        <Plus className="size-4" />
      </button>
    </div>
  );
}

export function Segmented<T extends string>({
  value,
  onChange,
  options,
  className,
}: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: ReactNode; count?: number }[];
  className?: string;
}) {
  return (
    <div className={cn("flex gap-1 overflow-x-auto rounded-xl bg-card-2 p-1", className)} role="tablist">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="tab"
          aria-selected={value === o.value}
          onClick={() => onChange(o.value)}
          className={cn("flex h-9 shrink-0 items-center gap-1.5 rounded-lg px-3 text-sm font-medium transition", value === o.value ? "bg-card text-text shadow-card" : "text-muted hover:text-text")}
        >
          {o.label}
          {o.count !== undefined && <span className={cn("num rounded-md px-1.5 text-xs", value === o.value ? "bg-primary-soft text-primary-ink" : "bg-line")}>{o.count}</span>}
        </button>
      ))}
    </div>
  );
}

export function Switch({ checked, onChange, label, disabled }: { checked: boolean; onChange: (v: boolean) => void; label: ReactNode; disabled?: boolean }) {
  return (
    <label className={cn("flex items-center justify-between gap-3 py-1", disabled ? "cursor-wait opacity-60" : "cursor-pointer")}>
      <span className="text-sm">{label}</span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={cn("relative h-6 w-11 shrink-0 rounded-full transition", checked ? "bg-primary" : "bg-line-strong")}
      >
        <span className={cn("absolute top-0.5 size-5 rounded-full bg-white shadow transition-all", checked ? "start-[22px]" : "start-0.5")} />
      </button>
    </label>
  );
}

// ---------- Layout ----------

// ---------- Links to other pages ----------
// The rule of the whole site: what looks like one thing is one click. A row, a notice or a line with a
// link in it opens that link from anywhere inside it, not only from the underlined words.

/** May the logged-in person open this address? (Phone numbers and other sites: always.) */
export function useMayOpen() {
  const user = useSession()?.user;
  const denied = deniedOf(useSite(), user);
  return (href: string | null | undefined): href is string => !!href && (!href.startsWith("/") || (!!user && canOpen(user.role, splitAppPath(href).path, user.rep_kinds, denied)));
}

/** The small arrow that says "this opens something". It points the way the language reads. */
export function GoIcon({ className }: { className?: string }) {
  return <ChevronRight className={cn("box-go size-4 shrink-0 rtl:rotate-180", className)} aria-hidden />;
}

/**
 * A name or a number that opens its own page: a customer, an invoice, an item…
 * For a job that may not open that page, it is plain text.
 * `main`: the link fills the whole box around it, so a click anywhere in the box opens it
 * (the box needs the class "box-link", see globals.css).
 */
export function RefLink({ href, main, className, children }: { href: string | null | undefined; main?: boolean; className?: string; children: ReactNode }) {
  const may = useMayOpen();
  if (!may(href)) return className ? <span className={className}>{children}</span> : <>{children}</>;
  const cls = cn("text-primary-ink underline-offset-2 hover:underline", main && "box-link-main", className);
  if (href.startsWith("/"))
    return (
      <Link href={href} className={cls}>
        {children}
      </Link>
    );
  // A phone number opens the dialer here; another site opens in a new tab.
  const outside = href.startsWith("http");
  return (
    <a href={href} className={cls} target={outside ? "_blank" : undefined} rel={outside ? "noreferrer" : undefined}>
      {children}
    </a>
  );
}

/** Did this click land on something inside a row that does its own job (a link, a button, a field), or did it select text? */
function ownClick(e: React.MouseEvent) {
  return !!(e.target as Element).closest("a,button,input,select,textarea,label,[data-cz]") || !!window.getSelection()?.toString();
}

/** Open a row's page: here, or in a new tab with Ctrl, ⌘ or the mouse wheel (as a real link does). */
function openFor(e: React.MouseEvent, href: string, push: (href: string) => void) {
  if (e.ctrlKey || e.metaKey || e.button === 1) window.open(href, "_blank");
  else push(href);
}

/**
 * A hand-made table row that opens a page from anywhere in it: the same rule as the rows of DataTable.
 * (A <tr> can't be put inside a link.) Keep a real link in it, a RefLink on the name, for the keyboard.
 * For a job that may not open the page, it is a plain row.
 */
export function ClickRow({ href, className, children }: { href: string | null | undefined; className?: string; children: ReactNode }) {
  const router = useAppRouter();
  const may = useMayOpen();
  if (!may(href)) return <tr className={className}>{children}</tr>;
  const open = (e: React.MouseEvent) => !ownClick(e) && openFor(e, href, router.push);
  return (
    <tr className={cn("cursor-pointer transition-colors hover:bg-card-2 active:bg-primary-soft", className)} onClick={open} onAuxClick={(e) => e.button === 1 && open(e)}>
      {children}
    </tr>
  );
}

export function Card({ className, children, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn("rounded-card border border-line bg-card shadow-card", className)} {...props}>
      {children}
    </div>
  );
}

export function CardHeader({ title, action, subtitle }: { title: ReactNode; action?: ReactNode; subtitle?: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3 border-b border-line px-4 py-3">
      <div className="min-w-0">
        <h2 className="text-base font-semibold">{title}</h2>
        {subtitle && <p className="mt-0.5 text-xs text-muted">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}

export function PageHeader({ title, subtitle, back, actions }: { title: ReactNode; subtitle?: ReactNode; back?: string; actions?: ReactNode }) {
  const { lang, tr } = useFmt();
  const BackIcon = lang === "ar" ? ArrowRight : ArrowLeft;
  // A page the manager renamed in the menu shows its new name here too.
  const path = splitAppPath(usePathname()).path;
  const labels = useSite().nav.labels;
  if (typeof title === "string") title = pageTitle(title, path, labels, lang);
  return (
    <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
      <div className="flex min-w-0 items-start gap-2">
        {back && (
          <Link href={back} aria-label={tr("رجوع", "Back")} className="no-print -ms-2 mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-xl text-muted hover:bg-card-2 hover:text-text">
            <BackIcon className="size-5" />
          </Link>
        )}
        <div className="min-w-0">
          <h1 className="text-xl font-bold leading-tight sm:text-2xl">{title}</h1>
          {subtitle && <div className="mt-1 text-sm text-muted">{subtitle}</div>}
        </div>
      </div>
      {actions && <div className="no-print flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

type Tone = "neutral" | "primary" | "success" | "warning" | "danger";
const tones: Record<Tone, string> = {
  neutral: "bg-card-2 text-muted border-line",
  primary: "bg-primary-soft text-primary-ink border-transparent",
  success: "bg-success-soft text-success border-transparent",
  warning: "bg-warning-soft text-warning border-transparent",
  danger: "bg-danger-soft text-danger border-transparent",
};

export function Badge({ tone = "neutral", children, className }: { tone?: Tone; children: ReactNode; className?: string }) {
  return <span className={cn("inline-flex items-center gap-1 whitespace-nowrap rounded-md border px-2 py-0.5 text-xs font-medium", tones[tone], className)}>{children}</span>;
}

export function Stat({
  label,
  value,
  hint,
  tone,
  icon,
  href,
  onClick,
}: {
  label: ReactNode;
  value: ReactNode;
  hint?: ReactNode;
  tone?: Tone;
  icon?: ReactNode;
  /** The page the card opens. */
  href?: string;
  /** Or what it does on this page (show a tab, filter the list under it). */
  onClick?: () => void;
}) {
  // A card that opens or does something answers the mouse: it lifts a little, and goes back down when pressed.
  const opens = !!href || !!onClick;
  const body = (
    <Card className={cn("flex h-full flex-col gap-1 p-4", opens && "transition duration-150 hover:-translate-y-0.5 hover:border-line-strong hover:shadow-md active:translate-y-0 active:shadow-none")}>
      <div className="flex items-center justify-between gap-2 text-sm text-muted">
        <span>{label}</span>
        {icon && <span className={cn("flex size-8 items-center justify-center rounded-lg", tone ? tones[tone] : "bg-card-2")}>{icon}</span>}
      </div>
      <div className="num text-xl font-bold sm:text-2xl">{value}</div>
      {hint && <div className="text-xs text-faint">{hint}</div>}
    </Card>
  );
  if (href)
    return (
      <Link href={href} className="block rounded-card">
        {body}
      </Link>
    );
  if (onClick)
    return (
      <button type="button" onClick={onClick} className="block w-full rounded-card text-start">
        {body}
      </button>
    );
  return body;
}

export function Empty({ icon, title, body, action }: { icon?: ReactNode; title: ReactNode; body?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 px-6 py-12 text-center">
      {icon && <div className="mb-1 flex size-12 items-center justify-center rounded-2xl bg-card-2 text-faint">{icon}</div>}
      <p className="font-semibold">{title}</p>
      {body && <p className="max-w-sm text-sm text-muted">{body}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("animate-pulse rounded-lg bg-line/70", className)} />;
}

export function LoadingRows({ rows = 5 }: { rows?: number }) {
  return (
    <div className="space-y-3 p-4" aria-busy>
      {Array.from({ length: rows }, (_, i) => (
        <Skeleton key={i} className="h-12" />
      ))}
    </div>
  );
}

/** A clear message for any error, in the user's language. */
export function errorText(e: unknown, tr: (a: string, b: string) => string) {
  if (e instanceof ApiError) {
    if (e.status === 0) return tr("لا يوجد اتصال بالإنترنت", "No internet connection");
    if (e.message) return e.message;
    if (e.status === 403) return tr("ليست لديك صلاحية", "You don't have permission");
    if (e.status === 404) return tr("غير موجود", "Not found");
  }
  return tr("حدث خطأ غير متوقع، حاول مرة أخرى", "Something went wrong. Try again");
}

export function ErrorBox({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  const { tr } = useFmt();
  return (
    <div className="flex flex-col items-center gap-3 px-6 py-10 text-center">
      <XCircle className="size-8 text-danger" aria-hidden />
      <p className="text-sm text-muted">{errorText(error, tr)}</p>
      {onRetry && (
        <Button size="sm" onClick={onRetry}>
          {tr("إعادة المحاولة", "Try again")}
        </Button>
      )}
    </div>
  );
}

export function Notice({
  tone = "warning",
  title,
  children,
  action,
  href,
}: {
  tone?: Tone;
  title?: ReactNode;
  children?: ReactNode;
  action?: ReactNode;
  /** The whole notice opens this page: a click anywhere on it, not only on a word. */
  href?: string;
}) {
  const { tr } = useFmt();
  const may = useMayOpen();
  const Icon = tone === "danger" ? XCircle : tone === "success" ? CheckCircle2 : tone === "primary" ? Info : AlertTriangle;
  const open = may(href) ? href : undefined;
  return (
    <div className={cn("flex items-start gap-3 rounded-xl border p-3", tones[tone], open && "box-link transition hover:brightness-95 active:brightness-90")}>
      <Icon className="mt-0.5 size-5 shrink-0" aria-hidden />
      <div className="min-w-0 flex-1 text-sm">
        {title && <p className="font-semibold">{title}</p>}
        {children && <div className="mt-0.5 opacity-90">{children}</div>}
      </div>
      {action}
      {open && (
        <Link href={open} aria-label={tr("فتح", "Open")} className="box-link-main shrink-0 self-center">
          <GoIcon className="size-5" />
        </Link>
      )}
    </div>
  );
}

// ---------- Table (becomes cards on phones) ----------

export interface Column<T> {
  key: string;
  head: ReactNode;
  cell: (row: T) => ReactNode;
  className?: string;
  /** Hide on phones (the card view shows `mobile` instead). */
  hideOnMobile?: boolean;
  align?: "start" | "end" | "center";
}

export function DataTable<T>({
  rows,
  columns,
  rowKey,
  onRowHref,
  rowAction,
  mobile,
  empty,
  footer,
}: {
  rows: T[];
  columns: Column<T>[];
  rowKey: (r: T) => string | number;
  /** The page a row opens. A click anywhere in the row opens it (Ctrl-click or the wheel: in a new tab). */
  onRowHref?: (r: T) => string | undefined;
  /** For a row that opens something on this page (a dialog) instead of another page: what a click on it does. Nothing = the row opens nothing. */
  rowAction?: (r: T) => (() => void) | undefined;
  mobile?: (r: T) => ReactNode;
  empty?: ReactNode;
  footer?: ReactNode;
}) {
  // Every list is split into pages with numbered circles under it (1, 2, 3…). It also keeps long lists fast:
  // only one page of rows is drawn (twice: table + phone cards).
  const pg = usePages(rows);
  // Customize mode (manager): the columns are dragged to a new order and hidden with the eye.
  // It is saved for this page's table ("table:/orders"), for everyone who sees it.
  const { tr } = useFmt();
  const toast = useToast();
  const mode = useCustomizing();
  const layId = `table:${splitAppPath(usePathname()).path.replace(/\/\d+/g, "/_")}`;
  const lay = useSite().layouts[layId];
  const router = useAppRouter();
  if (!rows.length) return <>{empty}</>;
  // A click anywhere in a row opens it. A link, a button or a field inside the row keeps its own job.
  const rowClick = (href: string | undefined, action?: () => void) => (e: React.MouseEvent) => {
    if (ownClick(e)) return;
    if (href) openFor(e, href, router.push);
    else action?.();
  };
  const hiddenCols = lay?.hidden ?? [];
  const sorted = ordered(columns, lay?.order ?? [], (c) => c.key);
  const cols = mode ? sorted : sorted.filter((c) => !hiddenCols.includes(c.key));
  const saveLay = (next: { order?: string[]; hidden?: string[] }) =>
    saveSite((s) => ({ ...s, layouts: { ...s.layouts, [layId]: { order: lay?.order ?? [], hidden: hiddenCols, ...next } } })).catch((e) => toast("danger", errorText(e, tr)));
  const shown = pg.shown;
  return (
    <>
      <SortArea ids={cols.map((c) => c.key)} grid onOrder={(ids) => saveLay({ order: ids })}>
        <div className={cn("overflow-x-auto", mobile && "hidden md:block")}>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-line bg-card-2 text-xs text-muted">
                {cols.map((c) => (
                  <th key={c.key} className={cn("px-4 py-2.5 text-start font-medium whitespace-nowrap", c.align === "end" && "text-end", c.align === "center" && "text-center", c.className)}>
                    {mode ? (
                      <SortItem id={c.key} inline hidden={hiddenCols.includes(c.key)} onHide={() => saveLay({ hidden: toggleIn(hiddenCols, c.key) })}>
                        {c.head}
                      </SortItem>
                    ) : (
                      c.head
                    )}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {shown.map((r) => {
                const href = onRowHref?.(r);
                const action = href ? undefined : rowAction?.(r);
                const opens = !!href || !!action;
                return (
                  <tr
                    key={rowKey(r)}
                    className={cn("border-b border-line last:border-0", opens && "cursor-pointer transition-colors hover:bg-card-2 active:bg-primary-soft")}
                    onClick={opens ? rowClick(href, action) : undefined}
                    onAuxClick={href ? (e) => e.button === 1 && rowClick(href)(e) : undefined}
                  >
                    {cols.map((c, i) => (
                      <td
                        key={c.key}
                        className={cn("px-4 py-3 align-middle", c.align === "end" && "text-end", c.align === "center" && "text-center", c.className, hiddenCols.includes(c.key) && "opacity-40")}
                      >
                        {href && i === 0 ? (
                          <Link href={href} className="font-medium text-primary-ink hover:underline">
                            {c.cell(r)}
                          </Link>
                        ) : (
                          c.cell(r)
                        )}
                      </td>
                    ))}
                  </tr>
                );
              })}
            </tbody>
            {footer}
          </table>
        </div>
      </SortArea>
      {mobile && (
        <ul className="divide-y divide-line md:hidden">
          {shown.map((r) => {
            const href = onRowHref?.(r);
            const action = href ? undefined : rowAction?.(r);
            return (
              <li key={rowKey(r)}>
                {href ? (
                  <Link href={href} className="block px-4 py-3 active:bg-card-2">
                    {mobile(r)}
                  </Link>
                ) : action ? (
                  <div className="cursor-pointer px-4 py-3 active:bg-card-2" onClick={rowClick(undefined, action)}>
                    {mobile(r)}
                  </div>
                ) : (
                  <div className="px-4 py-3">{mobile(r)}</div>
                )}
              </li>
            );
          })}
        </ul>
      )}
      <Pager {...pg} className="border-t border-line" />
    </>
  );
}

// ---------- Pages: numbered circles under every list ----------

const SIZES = [10, 25, 50];

/** Splits a list into pages. A new list (another filter, a search) starts again at page 1. */
export function usePages<T>(rows: T[], size = 10) {
  const [state, setState] = useState<{ page: number; size: number; total: number }>({ page: 1, size, total: rows.length });
  const per = state.size;
  const pages = Math.max(1, Math.ceil(rows.length / per));
  // Another list (the length changed): back to page 1. Never past the last page.
  const page = state.total !== rows.length ? 1 : Math.min(state.page, pages);
  return {
    page,
    pages,
    per,
    total: rows.length,
    shown: rows.slice((page - 1) * per, page * per),
    setPage: (n: number) => setState({ page: Math.max(1, Math.min(pages, n)), size: per, total: rows.length }),
    setPer: (n: number) => setState({ page: 1, size: n, total: rows.length }),
  };
}

/** 1 2 3 … 9 10, with "previous" and "next", how many are shown, and how many per page. */
export function Pager({
  page,
  pages,
  per,
  total,
  setPage,
  setPer,
  className,
  sizes = SIZES,
}: {
  page: number;
  pages: number;
  per: number;
  total: number;
  setPage: (n: number) => void;
  setPer?: (n: number) => void;
  className?: string;
  sizes?: number[];
}) {
  const { tr, num, lang } = useFmt();
  if (total <= Math.min(...sizes) && pages <= 1) return null;
  // The numbers to show: the first, the last, and two around the current page; "…" in the gaps.
  const near = new Set([1, pages, page - 1, page, page + 1].filter((n) => n >= 1 && n <= pages));
  if (page <= 3) [2, 3, 4].forEach((n) => n <= pages && near.add(n));
  if (page >= pages - 2) [pages - 1, pages - 2, pages - 3].forEach((n) => n >= 1 && near.add(n));
  const list = [...near].sort((a, b) => a - b);
  const items: (number | "gap")[] = [];
  list.forEach((n, i) => {
    if (i && n - list[i - 1] > 1) items.push("gap");
    items.push(n);
  });
  const Prev = lang === "ar" ? ArrowRight : ArrowLeft;
  const Next = lang === "ar" ? ArrowLeft : ArrowRight;
  const from = (page - 1) * per + 1;
  const to = Math.min(total, page * per);
  const circle = "flex size-9 shrink-0 items-center justify-center rounded-full text-sm font-semibold transition";
  return (
    <nav aria-label={tr("الصفحات", "Pages")} className={cn("flex flex-wrap items-center justify-between gap-3 px-3 py-3", className)}>
      <p className="text-xs text-muted">{tr(`${num(from)}–${num(to)} من ${num(total)}`, `${num(from)}–${num(to)} of ${num(total)}`)}</p>
      <div className="flex items-center gap-1">
        <button type="button" onClick={() => setPage(page - 1)} disabled={page <= 1} aria-label={tr("السابقة", "Previous")} className={cn(circle, "text-muted hover:bg-card-2 disabled:opacity-30")}>
          <Prev className="size-4" />
        </button>
        {items.map((it, i) =>
          it === "gap" ? (
            <span key={`g${i}`} className="w-5 text-center text-faint">
              …
            </span>
          ) : (
            <button
              key={it}
              type="button"
              onClick={() => setPage(it)}
              aria-current={it === page ? "page" : undefined}
              aria-label={tr(`الصفحة ${it}`, `Page ${it}`)}
              className={cn(circle, "num", it === page ? "bg-action text-on-action shadow-sm" : "border border-line text-muted hover:border-action hover:text-text")}
            >
              {num(it)}
            </button>
          ),
        )}
        <button type="button" onClick={() => setPage(page + 1)} disabled={page >= pages} aria-label={tr("التالية", "Next")} className={cn(circle, "text-muted hover:bg-card-2 disabled:opacity-30")}>
          <Next className="size-4" />
        </button>
      </div>
      {setPer && (
        <label className="flex items-center gap-1.5 text-xs text-muted">
          {tr("لكل صفحة", "Per page")}
          <select value={per} onChange={(e) => setPer(Number(e.target.value))} className="h-8 rounded-lg border border-line bg-card px-2 text-xs text-text">
            {sizes.map((n) => (
              <option key={n} value={n}>
                {num(n)}
              </option>
            ))}
          </select>
        </label>
      )}
    </nav>
  );
}

// ---------- Dialog ----------

// Open dialogs, newest last: Esc closes only the top one (a dialog can open another, e.g. the address sheet).
const openDialogs: string[] = [];

export function Dialog({
  open,
  onClose,
  title,
  children,
  footer,
  wide,
  plain,
}: {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  wide?: boolean;
  /** Not a page to customize: in customize mode its texts and buttons work as usual. */ plain?: boolean;
}) {
  const { tr } = useFmt();
  const id = useId();
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    openDialogs.push(id);
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && openDialogs[openDialogs.length - 1] === id && onClose();
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    // On a computer, jump to the first field (good for the keyboard). On a phone, focus the dialog itself:
    // focusing a text field there pops the keyboard up and hides half of the dialog.
    if (window.matchMedia("(pointer: coarse)").matches) ref.current?.focus();
    else ref.current?.querySelector<HTMLElement>("input,select,textarea,button:not([data-close])")?.focus();
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
      const i = openDialogs.lastIndexOf(id);
      if (i >= 0) openDialogs.splice(i, 1);
    };
  }, [open, onClose, id]);
  if (!open) return null;
  // Drawn at the end of <body>, not inside the page: a dialog opened from inside another dialog would
  // otherwise be trapped in the first one's box (its opening animation makes it the frame for anything
  // "fixed" inside it) and get cut off.
  return createPortal(
    <div className="dialog-backdrop no-print fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center sm:p-4" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div
        ref={ref}
        tabIndex={-1}
        role="dialog"
        data-cz={plain ? "" : undefined}
        aria-modal
        aria-labelledby={id}
        className={cn("dialog-panel flex max-h-[92dvh] w-full flex-col rounded-t-2xl bg-card shadow-xl outline-none sm:rounded-2xl", wide ? "sm:max-w-3xl" : "sm:max-w-lg")}
      >
        <div className="flex items-center justify-between gap-3 border-b border-line px-4 py-3">
          <h2 id={id} className="text-base font-semibold">
            {title}
          </h2>
          <IconButton label={tr("إغلاق", "Close")} onClick={onClose} data-close>
            <X className="size-5" />
          </IconButton>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-4">{children}</div>
        {footer && <div className="flex shrink-0 flex-wrap justify-end gap-2 border-t border-line px-4 py-3">{footer}</div>}
      </div>
    </div>,
    document.body,
  );
}

// ---------- Toasts ----------

type Toast = { id: number; tone: "success" | "danger" | "primary"; text: string };
const ToastCtx = createContext<(tone: Toast["tone"], text: string) => void>(() => {});

export function ToastProvider({ children }: { children: ReactNode }) {
  const [list, setList] = useState<Toast[]>([]);
  const show = useCallback((tone: Toast["tone"], text: string) => {
    const id = Date.now() + Math.random();
    setList((l) => [...l.slice(-2), { id, tone, text }]);
    setTimeout(() => setList((l) => l.filter((t) => t.id !== id)), 4000);
  }, []);
  return (
    <ToastCtx.Provider value={show}>
      {children}
      <div className="no-print pointer-events-none fixed inset-x-0 bottom-20 z-[60] flex flex-col items-center gap-2 px-4 md:bottom-6" aria-live="polite">
        {list.map((t) => (
          <div
            key={t.id}
            className={cn(
              "pointer-events-auto flex max-w-md items-center gap-2 rounded-xl px-4 py-3 text-sm font-medium shadow-lg",
              t.tone === "success" && "bg-success text-white dark:text-black",
              t.tone === "danger" && "bg-danger text-white dark:text-black",
              t.tone === "primary" && "bg-primary text-on-primary",
            )}
          >
            {t.tone === "success" ? <CheckCircle2 className="size-4 shrink-0" /> : t.tone === "danger" ? <XCircle className="size-4 shrink-0" /> : <Info className="size-4 shrink-0" />}
            {t.text}
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}

export const useToast = () => useContext(ToastCtx);

// ---------- Small pieces ----------

export function Money({ value, className, tone }: { value: number | undefined | null; className?: string; tone?: "auto" }) {
  const { money } = useFmt();
  return (
    <span className={cn("num whitespace-nowrap", tone === "auto" && value && value > 0 && "text-danger", className)} dir="ltr">
      {money(value)}
    </span>
  );
}

export function KV({
  k,
  v,
  className,
  href,
}: {
  k: ReactNode;
  v: ReactNode;
  className?: string;
  /** The whole line opens this page (or calls this "tel:" number): a click anywhere on it. */
  href?: string | null;
}) {
  const may = useMayOpen();
  if (may(href)) {
    const cls = cn("group -mx-2 flex items-center justify-between gap-3 rounded-lg px-2 py-1.5 text-sm transition-colors hover:bg-card-2 active:bg-primary-soft", className);
    const inside = (
      <>
        <span className="text-muted">{k}</span>
        <span className="flex items-center gap-1 text-end font-medium text-primary-ink underline-offset-2 group-hover:underline">
          {v}
          <GoIcon className="text-faint" />
        </span>
      </>
    );
    return href.startsWith("/") ? (
      <Link href={href} className={cls}>
        {inside}
      </Link>
    ) : (
      <a href={href} className={cls}>
        {inside}
      </a>
    );
  }
  return (
    <div className={cn("flex items-center justify-between gap-3 py-1.5 text-sm", className)}>
      <span className="text-muted">{k}</span>
      <span className="text-end font-medium">{v}</span>
    </div>
  );
}

/** A thin bar that shows how much of the debt limit is used. */
export function LimitBar({ balance, limit }: { balance: number; limit: number }) {
  const pct = limit > 0 ? Math.min(100, Math.round((Math.max(0, balance) / limit) * 100)) : 100;
  const tone = pct >= 100 ? "bg-danger" : pct >= 80 ? "bg-action" : "bg-success";
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-line" aria-hidden>
      <div className={cn("h-full rounded-full transition-all", tone)} style={{ width: `${pct}%` }} />
    </div>
  );
}
