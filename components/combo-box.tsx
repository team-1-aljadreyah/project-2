"use client";

// A text field with a list of suggestions (an area, a category, a brand, a unit's name). It replaces the browser's
// own suggestion list (<datalist>), which shows only the options matching what is already written — so once you
// picked «حي الحسين» it offered nothing else, and it looked like it couldn't be changed.
// Here: on focus every option shows; typing filters them (Arabic matched loosely); ↑ ↓ Enter Esc; a × clears it.
// Anything else can still be typed in.
import { useId, useRef, useState } from "react";
import { ChevronDown, X } from "lucide-react";
import { useFmt } from "@/lib/i18n";
import { cn, matches } from "@/lib/utils";

const fieldCls =
  "h-11 w-full rounded-xl border border-line-strong bg-card px-3 pe-16 text-base text-text placeholder:text-faint outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20 disabled:opacity-60 sm:text-sm";

export function ComboBox({
  id,
  value,
  onChange,
  options,
  placeholder,
  invalid,
  disabled,
  className,
  plainClassName,
  "aria-label": ariaLabel,
}: {
  id?: string;
  value: string;
  onChange: (v: string) => void;
  options: string[];
  placeholder?: string;
  invalid?: boolean;
  disabled?: boolean;
  className?: string;
  /** Use this class for the field itself instead of the usual box (a field inside another frame). */
  plainClassName?: string;
  "aria-label"?: string;
}) {
  const { tr } = useFmt();
  const listId = useId();
  const [open, setOpen] = useState(false);
  // Filter only once the person types; opening shows everything (that is the whole point).
  const [typed, setTyped] = useState(false);
  const [hi, setHi] = useState(-1);
  // Leaving the field closes the list a moment later (so a click on an option still lands); coming back first
  // cancels that, or the list would close again under the person.
  const closing = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const show = () => {
    clearTimeout(closing.current);
    setOpen(true);
  };
  const list = [...new Set(options)].filter((o) => !typed || matches(value, o));
  const pick = (o: string) => {
    onChange(o);
    setOpen(false);
    setTyped(false);
    setHi(-1);
  };
  return (
    <div className={cn("relative", className)}>
      <input
        id={id}
        role="combobox"
        aria-expanded={open}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-label={ariaLabel}
        aria-activedescendant={open && hi >= 0 ? `${listId}-${hi}` : undefined}
        autoComplete="off"
        value={value}
        disabled={disabled}
        placeholder={placeholder}
        onChange={(e) => {
          onChange(e.target.value);
          setTyped(true);
          setOpen(true);
          setHi(-1);
        }}
        onFocus={() => {
          setTyped(false);
          show();
        }}
        onClick={show}
        onBlur={() => {
          closing.current = setTimeout(() => setOpen(false), 120);
        }}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setOpen(true);
            setHi((h) => Math.min(list.length - 1, h + 1));
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setHi((h) => Math.max(0, h - 1));
          } else if (e.key === "Enter" && open && hi >= 0 && list[hi]) {
            e.preventDefault();
            pick(list[hi]);
          } else if (e.key === "Escape") setOpen(false);
        }}
        className={plainClassName ? cn(plainClassName, "pe-16") : cn(fieldCls, invalid && "border-danger focus:border-danger focus:ring-danger/20")}
      />
      <span className="absolute inset-y-0 end-2 flex items-center gap-0.5">
        {value && !disabled && (
          <button
            type="button"
            tabIndex={-1}
            aria-label={tr("امسح", "Clear")}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => {
              onChange("");
              setTyped(false);
              setOpen(true);
            }}
            className="flex size-7 items-center justify-center rounded-lg text-faint hover:bg-card-2 hover:text-text"
          >
            <X className="size-4" />
          </button>
        )}
        <button
          type="button"
          tabIndex={-1}
          aria-label={tr("الخيارات", "Options")}
          disabled={disabled}
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => {
            setTyped(false);
            setOpen((o) => !o);
          }}
          className="flex size-7 items-center justify-center rounded-lg text-faint hover:bg-card-2 hover:text-text"
        >
          <ChevronDown className={cn("size-4 transition", open && "rotate-180")} />
        </button>
      </span>
      {open && list.length > 0 && (
        <ul id={listId} role="listbox" className="absolute inset-x-0 top-full z-40 mt-1 max-h-60 overflow-y-auto rounded-xl border border-line bg-card p-1 shadow-xl">
          {list.map((o, i) => (
            <li key={o} id={`${listId}-${i}`} role="option" aria-selected={o === value}>
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => pick(o)}
                onMouseEnter={() => setHi(i)}
                className={cn("flex w-full items-center rounded-lg px-3 py-2 text-start text-sm", i === hi ? "bg-card-2" : "", o === value && "font-bold text-action")}
              >
                {o}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
