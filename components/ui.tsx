"use client";

// The small building blocks every screen uses: buttons, inputs, cards, badges, dialogs, tables.
// Keeping them in one place means every screen looks and behaves the same.
import Link from "next/link";
import { createContext, useCallback, useContext, useEffect, useId, useRef, useState, type ReactNode } from "react";
import { AlertTriangle, ArrowLeft, ArrowRight, CheckCircle2, Info, Loader2, Minus, Plus, Search, X, XCircle } from "lucide-react";
import { ApiError } from "@/lib/api/errors";
import { useFmt } from "@/lib/i18n";
import { cn } from "@/lib/utils";

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

export function Field({
  label,
  error,
  hint,
  children,
  className,
  htmlFor,
}: {
  label?: ReactNode;
  error?: string;
  hint?: ReactNode;
  children: ReactNode;
  className?: string;
  htmlFor?: string;
}) {
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
      <button type="button" aria-label={tr("أقل", "Less")} className="flex size-11 items-center justify-center text-muted hover:text-text disabled:opacity-40" disabled={value <= min} onClick={() => onChange(Math.max(min, value - 1))}>
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
      <button type="button" aria-label={tr("أكثر", "More")} className="flex size-11 items-center justify-center text-muted hover:text-text disabled:opacity-40" disabled={max !== undefined && value >= max} onClick={() => onChange(max !== undefined ? Math.min(max, value + 1) : value + 1)}>
        <Plus className="size-4" />
      </button>
    </div>
  );
}

export function Segmented<T extends string>({ value, onChange, options, className }: { value: T; onChange: (v: T) => void; options: { value: T; label: ReactNode; count?: number }[]; className?: string }) {
  return (
    <div className={cn("flex gap-1 overflow-x-auto rounded-xl bg-card-2 p-1", className)} role="tablist">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="tab"
          aria-selected={value === o.value}
          onClick={() => onChange(o.value)}
          className={cn(
            "flex h-9 shrink-0 items-center gap-1.5 rounded-lg px-3 text-sm font-medium transition",
            value === o.value ? "bg-card text-text shadow-card" : "text-muted hover:text-text",
          )}
        >
          {o.label}
          {o.count !== undefined && <span className={cn("num rounded-md px-1.5 text-xs", value === o.value ? "bg-primary-soft text-primary-ink" : "bg-line")}>{o.count}</span>}
        </button>
      ))}
    </div>
  );
}

export function Switch({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: ReactNode }) {
  return (
    <label className="flex cursor-pointer items-center justify-between gap-3 py-1">
      <span className="text-sm">{label}</span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={cn("relative h-6 w-11 shrink-0 rounded-full transition", checked ? "bg-primary" : "bg-line-strong")}
      >
        <span className={cn("absolute top-0.5 size-5 rounded-full bg-white shadow transition-all", checked ? "start-[22px]" : "start-0.5")} />
      </button>
    </label>
  );
}

// ---------- Layout ----------

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

export function Stat({ label, value, hint, tone, icon, href }: { label: ReactNode; value: ReactNode; hint?: ReactNode; tone?: Tone; icon?: ReactNode; href?: string }) {
  const body = (
    <Card className={cn("flex h-full flex-col gap-1 p-4", href && "transition hover:border-line-strong")}>
      <div className="flex items-center justify-between gap-2 text-sm text-muted">
        <span>{label}</span>
        {icon && <span className={cn("flex size-8 items-center justify-center rounded-lg", tone ? tones[tone] : "bg-card-2")}>{icon}</span>}
      </div>
      <div className="num text-xl font-bold sm:text-2xl">{value}</div>
      {hint && <div className="text-xs text-faint">{hint}</div>}
    </Card>
  );
  return href ? (
    <Link href={href} className="block">
      {body}
    </Link>
  ) : (
    body
  );
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
  return tr("حدث خطأ غير متوقع، حاول مرة ثانية", "Something went wrong. Try again");
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

export function Notice({ tone = "warning", title, children, action }: { tone?: Tone; title?: ReactNode; children?: ReactNode; action?: ReactNode }) {
  const Icon = tone === "danger" ? XCircle : tone === "success" ? CheckCircle2 : tone === "primary" ? Info : AlertTriangle;
  return (
    <div className={cn("flex items-start gap-3 rounded-xl border p-3", tones[tone])}>
      <Icon className="mt-0.5 size-5 shrink-0" aria-hidden />
      <div className="min-w-0 flex-1 text-sm">
        {title && <p className="font-semibold">{title}</p>}
        {children && <div className="mt-0.5 opacity-90">{children}</div>}
      </div>
      {action}
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
  mobile,
  empty,
  footer,
}: {
  rows: T[];
  columns: Column<T>[];
  rowKey: (r: T) => string | number;
  onRowHref?: (r: T) => string | undefined;
  mobile?: (r: T) => ReactNode;
  empty?: ReactNode;
  footer?: ReactNode;
}) {
  if (!rows.length) return <>{empty}</>;
  return (
    <>
      <div className={cn("overflow-x-auto", mobile && "hidden md:block")}>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-line bg-card-2 text-xs text-muted">
              {columns.map((c) => (
                <th key={c.key} className={cn("px-4 py-2.5 text-start font-medium whitespace-nowrap", c.align === "end" && "text-end", c.align === "center" && "text-center", c.className)}>
                  {c.head}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const href = onRowHref?.(r);
              return (
                <tr key={rowKey(r)} className={cn("border-b border-line last:border-0", href && "cursor-pointer hover:bg-card-2")}>
                  {columns.map((c, i) => (
                    <td key={c.key} className={cn("px-4 py-3 align-middle", c.align === "end" && "text-end", c.align === "center" && "text-center", c.className)}>
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
      {mobile && (
        <ul className="divide-y divide-line md:hidden">
          {rows.map((r) => {
            const href = onRowHref?.(r);
            return (
              <li key={rowKey(r)}>
                {href ? (
                  <Link href={href} className="block px-4 py-3 active:bg-card-2">
                    {mobile(r)}
                  </Link>
                ) : (
                  <div className="px-4 py-3">{mobile(r)}</div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}

// ---------- Dialog ----------

export function Dialog({ open, onClose, title, children, footer, wide }: { open: boolean; onClose: () => void; title: ReactNode; children: ReactNode; footer?: ReactNode; wide?: boolean }) {
  const { tr } = useFmt();
  const id = useId();
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    ref.current?.querySelector<HTMLElement>("input,select,textarea,button:not([data-close])")?.focus();
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="no-print fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center sm:p-4" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div
        ref={ref}
        role="dialog"
        aria-modal
        aria-labelledby={id}
        className={cn("flex max-h-[92dvh] w-full flex-col rounded-t-2xl bg-card shadow-xl sm:rounded-2xl", wide ? "sm:max-w-3xl" : "sm:max-w-lg")}
      >
        <div className="flex items-center justify-between gap-3 border-b border-line px-4 py-3">
          <h2 id={id} className="text-base font-semibold">
            {title}
          </h2>
          <IconButton label={tr("إغلاق", "Close")} onClick={onClose} data-close>
            <X className="size-5" />
          </IconButton>
        </div>
        <div className="overflow-y-auto p-4">{children}</div>
        {footer && <div className="flex flex-wrap justify-end gap-2 border-t border-line px-4 py-3">{footer}</div>}
      </div>
    </div>
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

export function KV({ k, v, className }: { k: ReactNode; v: ReactNode; className?: string }) {
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
