"use client";

// The app launcher (the 9-dot button in the top bar), like Salesforce's: the apps the manager made for this
// person's job or profile. Choosing one leaves only its pages in the side menu; «كل الصفحات» brings all back.
import { useEffect, useRef, useState } from "react";
import { BarChart3, Boxes, Briefcase, Grip, LayoutGrid, ShoppingCart, Star, Store, Truck, Users, Wallet, type LucideIcon } from "lucide-react";
import { appsFor, chooseApp, useCurrentApp, deniedOf } from "@/lib/access";
import { useAppRouter } from "@/lib/app-path";
import type { AppDef, User } from "@/lib/api/types";
import { useFmt } from "@/lib/i18n";
import { useSite } from "@/lib/site";
import { cn } from "@/lib/utils";
import { NAV, navFor } from "./nav";

const ICONS: Record<string, LucideIcon> = {
  grid: LayoutGrid,
  cart: ShoppingCart,
  wallet: Wallet,
  boxes: Boxes,
  truck: Truck,
  chart: BarChart3,
  users: Users,
  store: Store,
  star: Star,
  briefcase: Briefcase,
};

/** An app's icon on its color (the launcher tile, the menu's banner, the settings). */
export function AppTile({ app, size = 40 }: { app: Pick<AppDef, "icon" | "color">; size?: number }) {
  const Icon = ICONS[app.icon] ?? LayoutGrid;
  return (
    <span className="flex shrink-0 items-center justify-center rounded-xl text-white shadow-sm" style={{ width: size, height: size, background: app.color }}>
      <Icon style={{ width: size * 0.5, height: size * 0.5 }} />
    </span>
  );
}

export function AppIconPick({ value, color, onChange }: { value: string; color: string; onChange: (v: string) => void }) {
  return (
    <div className="flex flex-wrap gap-2">
      {Object.keys(ICONS).map((k) => (
        <button key={k} type="button" onClick={() => onChange(k)} aria-pressed={value === k} className={cn("rounded-xl p-0.5 ring-2 ring-transparent transition", value === k && "ring-primary")}>
          <AppTile app={{ icon: k, color }} size={36} />
        </button>
      ))}
    </div>
  );
}

/** The pages of an app this person may open (in the app's order). */
function pagesFor(app: AppDef, user: User, denied: string[]) {
  return app.pages.filter((h) => {
    const n = NAV.find((x) => x.href === h);
    return !!n && navFor(n, user) && !denied.includes(h);
  });
}

export function AppLauncher({ user }: { user: User }) {
  const { tr } = useFmt();
  const site = useSite();
  const router = useAppRouter();
  const current = useCurrentApp(user);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const denied = deniedOf(site, user);
  const apps = appsFor(site, user).filter((a) => pagesFor(a, user, denied).length > 0);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as Node) && setOpen(false);
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);
  if (!apps.length) return null;

  function pick(app: AppDef | null) {
    chooseApp(user.id, app?.id ?? "all");
    setOpen(false);
    const first = app && pagesFor(app, user, denied)[0];
    if (first) router.push(first);
  }

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-label={tr("التطبيقات", "Apps")}
        title={tr("التطبيقات", "Apps")}
        className="flex size-10 items-center justify-center rounded-xl text-muted hover:bg-card-2 hover:text-text"
      >
        <Grip className="size-5" />
      </button>
      {open && (
        <div className="absolute end-0 top-12 z-50 w-80 rounded-2xl border border-line bg-card p-3 shadow-xl">
          <p className="mb-2 px-1 text-sm font-bold">{tr("التطبيقات", "Apps")}</p>
          <div className="grid gap-1.5">
            <button type="button" onClick={() => pick(null)} className={cn("flex items-center gap-3 rounded-xl p-2 text-start hover:bg-card-2", !current && "bg-card-2")}>
              <AppTile app={{ icon: "grid", color: "#5b616b" }} />
              <span className="min-w-0">
                <span className="block text-sm font-semibold">{tr("كل الصفحات", "All pages")}</span>
                <span className="block truncate text-xs text-muted">{tr("القائمة الكاملة كما هي", "The whole menu")}</span>
              </span>
            </button>
            {apps.map((a) => (
              <button key={a.id} type="button" onClick={() => pick(a)} className={cn("flex items-center gap-3 rounded-xl p-2 text-start hover:bg-card-2", current?.id === a.id && "bg-card-2")}>
                <AppTile app={a} />
                <span className="min-w-0">
                  <span className="block truncate text-sm font-semibold">{tr(a.name, a.name_en || a.name)}</span>
                  <span className="block truncate text-xs text-muted">{a.description || tr(`${pagesFor(a, user, denied).length} صفحات`, `${pagesFor(a, user, denied).length} pages`)}</span>
                </span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/** Above the side menu: the app it shows now, in its color. */
export function AppBanner({ user }: { user: User }) {
  const { tr } = useFmt();
  const app = useCurrentApp(user);
  if (!app) return null;
  return (
    <div className="mx-3 mt-3 flex items-center gap-2.5 rounded-xl p-2" style={{ background: `${app.color}1f` }}>
      <AppTile app={app} size={32} />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-bold">{tr(app.name, app.name_en || app.name)}</span>
        <span className="block text-[11px] text-muted">{tr("تطبيق", "App")}</span>
      </span>
      <button type="button" onClick={() => chooseApp(user.id, "all")} className="rounded-lg px-2 py-1 text-[11px] font-semibold text-muted hover:bg-card hover:text-text">
        {tr("كل الصفحات", "All")}
      </button>
    </div>
  );
}
