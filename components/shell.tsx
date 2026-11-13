"use client";

// The frame around every page after login: side menu (computer), bottom bar (phone), top bar with
// notifications, language, day/night and the account menu. It also checks the role can open the page,
// and sends saved offline orders when the internet comes back.
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createContext, useContext, useEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { Bell, CloudOff, Compass, Volume2, VolumeX, LogOut, Menu, MoreHorizontal, RefreshCw, ShieldAlert, Type, Wifi, WifiOff, X } from "lucide-react";
import { api, type Lookups } from "@/lib/api";
import type { AppNotification, Item, User } from "@/lib/api/types";
import { signOut, rememberNext, homeOf, updateUser, useSession } from "@/lib/auth";
import { NotificationAlerts } from "@/components/notification-alerts";
import { ChatAlerts } from "@/components/chat-alerts";
import dynamic from "next/dynamic";
// The support chat is for shop owners only: loaded only for them (not in everyone's first load).
const ChatWidget = dynamic(() => import("@/components/support/chat-widget").then((m) => m.ChatWidget), { ssr: false });
import { ShopSwitcher } from "@/components/shop-switcher";
import { Avatar, MyAccountDialog } from "@/components/my-account";
import { deniedOf, profileOf, useCurrentApp, useDenied } from "@/lib/access";
import { setExportBlocked } from "@/lib/utils";
import { AppLauncher, AppBanner } from "@/components/app-launcher";
import { QuickSearch } from "@/components/quick-search";
import { UnsavedGuard } from "@/components/unsaved-guard";
import { Tour, startTour } from "@/components/tour";
import { setTextSize, useTextSize } from "@/lib/text-size";
import { WarehouseFilterSwitch, hasWarehouseFilter } from "@/components/warehouse-filter";
import { playAlert, playMessage, setSoundOn, useSoundOn } from "@/lib/alert-sound";
import { USE_MOCK } from "@/lib/config";
import { inApp, useAppPath, useAppRouter } from "@/lib/app-path";
import { setCurrency, setCurrencyContext, subscribeCurrency, currencyVersion, wantedCurrency } from "@/lib/currency";
import { useFmt } from "@/lib/i18n";
import { flushQueue, setSimulatedOffline, useOffline, useQueue, isSimulatedOffline } from "@/lib/offline";
import { useLoad } from "@/lib/use-load";
import { useRealtime } from "@/lib/realtime";
import { setCustomizing, useCustomizing, useLabel, useSite } from "@/lib/site";
import { cn } from "@/lib/utils";
import { Logo } from "./logo";
import { CustomizeBar, CustomizeToggle, EditText, SortArea, SortItem, toggleIn, useSaveSite } from "./customize";
import { canOpen, customNav, GROUPS, isPhoneApp, NAV, navFor } from "./nav";
import { jobName } from "./status";
import { LanguageSwitch, ThemeToggle } from "./switches";
import { Button, Empty, IconButton, Skeleton, Switch, useToast } from "./ui";

interface AppData {
  user: User;
  lookups: Lookups;
  items: Item[];
  itemById: Map<number, Item>;
  reloadItems: () => void;
  /** Load the warehouses, tiers and settings again (after the manager changed one). */
  reloadLookups: () => void;
}

const Ctx = createContext<AppData | null>(null);

/** The logged-in user, warehouses, price tiers, reps and items: loaded once for all pages. */
export function useApp() {
  const v = useContext(Ctx);
  if (!v) throw new Error("useApp outside AppShell");
  return v;
}

export function AppShell({ children }: { children: ReactNode }) {
  const session = useSession();
  const router = useRouter();
  const path = usePathname();

  // Not logged in: go to the login page. The page you wanted is remembered in this tab (not in the
  // address), so the login address stays a clean "/login" and you still come back here after logging in.
  useEffect(() => {
    if (session !== null) return;
    rememberNext(path);
    router.replace("/login");
  }, [session, router, path]);

  if (!session) {
    return (
      <div className="flex min-h-dvh items-center justify-center">
        <Skeleton className="h-10 w-40" />
      </div>
    );
  }
  return <Loaded user={session.user}>{children}</Loaded>;
}

function Loaded({ user, children }: { user: User; children: ReactNode }) {
  const { tr } = useFmt();
  const lookups = useLoad(() => api.lookups(), []);
  const items = useLoad(() => api.listItems(), []);
  const me = useLoad(() => api.me(), [user.id]);
  // Inside a phone app (/client/..., /driver/...) the rules and the menus use the page's own path.
  const { prefix, path } = useAppPath();
  const appRouter = useAppRouter();
  // Links inside a phone app keep its prefix (so the installed app keeps them in its window). One listener for
  // every link of every page: it runs first (capture) and moves in the app instead.
  useEffect(() => {
    if (!prefix) return;
    const click = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0 || e.ctrlKey || e.metaKey || e.shiftKey || e.altKey) return;
      const a = (e.target as Element).closest?.("a[href]") as HTMLAnchorElement | null;
      if (!a || a.target === "_blank" || a.hasAttribute("download")) return;
      const href = a.getAttribute("href") ?? "";
      const to = inApp(prefix, href);
      if (to === href) return;
      e.preventDefault();
      e.stopPropagation();
      appRouter.push(to);
    };
    document.addEventListener("click", click, true);
    return () => document.removeEventListener("click", click, true);
  }, [prefix, appRouter]);

  // Keep the saved user fresh (the manager may have changed the name or role).
  // Only for the same person: another tab may have logged in as someone else, and the two tabs must not fight.
  useEffect(() => {
    if (me.data && me.data.id === user.id && JSON.stringify(me.data) !== JSON.stringify(user)) updateUser(me.data);
  }, [me.data, user]);

  const value = useMemo<AppData | null>(() => {
    if (!lookups.data || !items.data) return null;
    return {
      user,
      lookups: lookups.data,
      // A deleted item is in no list or picker; its name stays readable on the old records (itemById).
      items: items.data.filter((i) => !i.deleted),
      itemById: new Map(items.data.map((i) => [i.id, i])),
      reloadItems: items.reload,
      reloadLookups: lookups.reload,
    };
  }, [user, lookups.data, items.data, items.reload, lookups.reload]);

  const denied = useDenied(user);
  const allowed = canOpen(user.role, path, user.rep_kinds, denied);
  // Finer permissions from the person's profile: see-only, and no exporting.
  const profile = profileOf(useSite(), user);
  const toastDenied = useToast();
  useEffect(() => {
    setExportBlocked(!!profile?.deny_actions?.includes("export"));
    const onDenied = () => toastDenied("danger", tr("ليس من صلاحيات ملفك: التصدير", "Your profile doesn't allow exporting"));
    window.addEventListener("nahrain:denied", onDenied);
    return () => window.removeEventListener("nahrain:denied", onDenied);
  }, [profile, toastDenied, tr]);
  const phone = isPhoneApp(user.role);

  // Amounts in dollars: only the manager and the accountant, at the day's rate.
  const usdRate = lookups.data?.usd_rate?.rate ?? 0;
  useEffect(() => {
    setCurrencyContext({ rate: usdRate, allowed: user.role === "manager" || user.role === "accountant" });
  }, [usdRate, user.role]);

  // Customize mode is the manager's only: it goes off if another job logs in on this tab.
  useEffect(() => {
    if (user.role !== "manager") setCustomizing(false);
  }, [user.role]);

  return (
    <div className="min-h-dvh md:flex">
      {/* Shop owners and reps work from a phone: no side menu, the tab bar at the bottom on every screen size. */}
      {!phone && <Sidebar user={user} />}
      <div className="flex min-w-0 flex-1 flex-col">
        <TopBar user={user} warehouses={lookups.data?.warehouses ?? []} usdRate={usdRate} phone={phone} />
        <OfflineBar />
        {profile?.read_only && (
          <div className="no-print border-b border-warning/30 bg-warning-soft px-4 py-2 text-center text-sm font-medium text-warning">
            {tr("ملفك للعرض فقط: ترى صفحاتك ولا يمكنك تغيير شيء", "Your profile is see-only: you can look but not change anything")}
          </div>
        )}
        {user.role === "manager" && <CustomizeBar />}
        <main className={cn("mx-auto w-full flex-1 px-3 pt-4 pb-28 sm:px-5", phone ? "max-w-5xl" : "max-w-7xl md:pb-10")}>
          {!allowed ? (
            <Empty
              icon={<ShieldAlert className="size-6" />}
              title={tr("هذه الصفحة ليست ضمن صلاحياتك", "This page isn't part of your role")}
              body={tr("كل موظف يرى ما يخص عمله فقط.", "Each person sees only what their job needs.")}
              action={<Button href={homeOf(user.role, user.rep_kinds)}>{tr("الرجوع للرئيسية", "Go home")}</Button>}
            />
          ) : value ? (
            <Ctx.Provider value={value}>
              {children}
              {/* The shop owner's help circle: FAQ + live support chat */}
              {user.role === "shop" && <ChatWidget />}
            </Ctx.Provider>
          ) : (
            <div className="space-y-3">
              <Skeleton className="h-8 w-48" />
              <Skeleton className="h-32" />
              <Skeleton className="h-64" />
            </div>
          )}
        </main>
      </div>
      <BottomBar user={user} phone={phone} />
      <UnsavedGuard />
      <Tour key={user.id} user={user} />
      <QueueSender />
    </div>
  );
}

/**
 * The pages of this user, with the manager's names and order. `all`: also the pages he hid (customize mode).
 * Without the pages their permission profile takes away; inside an app (launcher), only that app's pages.
 */
function useNav(user: User, all = false) {
  const site = useSite();
  const denied = deniedOf(site, user);
  const app = useCurrentApp(user);
  const list = customNav(
    NAV.filter((n) => navFor(n, user) && !denied.includes(n.href)),
    site.nav,
    user.role === "manager",
  );
  const shown = all ? list : list.filter((n) => !n.hidden);
  if (!app || all) return shown;
  // The app's pages, in the app's order.
  return app.pages.map((h) => shown.find((n) => n.href === h)).filter((n): n is (typeof shown)[number] => !!n);
}

function isActive(path: string, href: string, role?: string) {
  // The shop owner's «طلبياتي» holds his orders, invoices and statement.
  if (href === "/orders" && role === "shop") return /^\/(orders|invoices|statement|returns|lists)(\/|$)/.test(path);
  if (href === "/orders") return path === "/orders" || (/^\/orders\/\d+/.test(path) && true);
  return path === href || path.startsWith(href + "/");
}

function Sidebar({ user }: { user: User }) {
  const { tr, lang } = useFmt();
  const { path } = useAppPath();
  // Customize mode: the rows are dragged, renamed and hidden instead of opened.
  const editing = useCustomizing() && user.role === "manager";
  const nav = useNav(user, editing);
  const site = useSite();
  const lab = useLabel();
  const save = useSaveSite();
  const groups = Object.keys(GROUPS) as (keyof typeof GROUPS)[];
  // The rows as they show, top to bottom: dragging works on this one list, across the groups.
  const flat = groups.flatMap((g) => nav.filter((n) => n.group === g));
  // Inside an app (launcher): one list, in the app's own order, without the groups.
  const inApp = !!useCurrentApp(user) && !editing;
  return (
    <aside data-tour="menu" className="no-print sticky top-0 hidden h-dvh w-64 shrink-0 flex-col border-e border-line bg-card md:flex">
      <div className="flex h-16 items-center gap-2 border-b border-line px-4">
        <Logo href="/" />
      </div>
      <AppBanner user={user} />
      <nav className="flex-1 overflow-y-auto px-3 py-3">
        <SortArea
          ids={flat.map((n) => n.href)}
          onOrder={(ids, moved, onto) =>
            // The dragged page also joins the group of the row it was dropped on.
            save((s) => ({ ...s, nav: { ...s.nav, order: ids, groups: { ...s.nav.groups, [moved]: flat.find((n) => n.href === onto)?.group ?? "main" } } }))
          }
        >
          {(inApp ? (["app"] as const) : groups).map((g) => {
            const list = g === "app" ? nav : nav.filter((n) => n.group === g);
            if (!list.length) return null;
            const groupName = g === "app" ? "" : lab(site.nav.group_labels[g], GROUPS[g][0], GROUPS[g][1]);
            return (
              <div key={g} className="mb-3">
                {g !== "app" && GROUPS[g][0] && (
                  <p className="px-3 pb-1 pt-2 text-xs font-medium text-faint">
                    <EditText value={groupName} onSave={(v) => save((s) => ({ ...s, nav: { ...s.nav, group_labels: { ...s.nav.group_labels, [g]: { ...s.nav.group_labels[g], [lang]: v } } } }))} />
                  </p>
                )}
                {list.map((n) => {
                  const active = isActive(path, n.href);
                  if (editing)
                    return (
                      <SortItem
                        key={n.href}
                        id={n.href}
                        inline
                        hidden={n.hidden}
                        onHide={() => save((s) => ({ ...s, nav: { ...s.nav, hidden: toggleIn(s.nav.hidden, n.href) } }))}
                        className="h-10 text-sm font-medium text-text"
                      >
                        <span className="flex items-center gap-2">
                          {/* The name is being edited, so the icon is the way to open the page. */}
                          <Link
                            href={n.href}
                            aria-label={tr(`فتح ${n.ar}`, `Open ${n.en}`)}
                            className={cn("flex size-7 shrink-0 items-center justify-center rounded-lg", active ? "bg-primary-soft text-primary-ink" : "text-muted hover:bg-card-2 hover:text-text")}
                          >
                            <n.icon className="size-[18px]" aria-hidden />
                          </Link>
                          <EditText value={tr(n.ar, n.en)} onSave={(v) => save((s) => ({ ...s, nav: { ...s.nav, labels: { ...s.nav.labels, [n.href]: { ...s.nav.labels[n.href], [lang]: v } } } }))} />
                        </span>
                      </SortItem>
                    );
                  return (
                    <Link
                      key={n.href}
                      href={n.href}
                      className={cn(
                        "flex h-10 items-center gap-3 rounded-xl px-3 text-sm font-medium transition",
                        active ? "bg-primary-soft text-primary-ink" : "text-muted hover:bg-card-2 hover:text-text",
                      )}
                    >
                      <n.icon className="size-[18px] shrink-0" aria-hidden />
                      {tr(n.ar, n.en)}
                    </Link>
                  );
                })}
              </div>
            );
          })}
        </SortArea>
      </nav>
      <div className="border-t border-line p-3">
        <div className="rounded-xl bg-card-2 px-3 py-2 text-xs text-muted">
          <p className="font-medium text-text">{user.name}</p>
          <p>{jobName(user, tr)}</p>
        </div>
      </div>
    </aside>
  );
}

/** The tab bar: on phones for everyone; on every screen size in the phone frame (bigger buttons there). */
function BottomBar({ user, phone }: { user: User; phone: boolean }) {
  const { tr } = useFmt();
  const { path } = useAppPath();
  const nav = useNav(user);
  // The "more" sheet closes by itself when the page changes: it is open only for the page it was opened on.
  const [openAt, setOpenAt] = useState<string | null>(null);
  const open = openAt === path;
  const setOpen = (v: boolean) => setOpenAt(v ? path : null);
  // The shop owner: his five tabs, and nothing under «المزيد» (the rest is inside them). Others: four and more.
  const shop = user.role === "shop";
  const main = nav.filter((n) => n.mobile?.includes(user.role)).slice(0, shop ? 5 : 4);
  const rest = shop ? [] : nav.filter((n) => !main.includes(n));
  const more = rest.length > 0;
  return (
    <>
      <nav data-tour="menu" className={cn("no-print fixed inset-x-0 bottom-0 z-40 border-t border-line bg-card/95 pb-[env(safe-area-inset-bottom)] backdrop-blur", !phone && "md:hidden")}>
        <div className={cn("mx-auto grid max-w-lg", more || main.length === 5 ? "grid-cols-5" : main.length === 4 ? "grid-cols-4" : main.length === 3 ? "grid-cols-3" : "grid-cols-2")}>
          {main.map((n) => {
            const active = isActive(path, n.href, user.role);
            return (
              <Link
                key={n.href}
                href={n.href}
                className={cn(
                  "flex flex-col items-center justify-center gap-1 font-medium transition active:scale-95",
                  phone ? "h-[68px] text-xs" : "h-16 text-[11px]",
                  active ? "text-primary-ink" : "text-muted",
                )}
              >
                <span className={cn("flex items-center justify-center rounded-full transition", phone ? "h-8 w-14" : "h-7 w-12", active && (phone ? "bg-action/15 text-action" : "bg-primary-soft"))}>
                  <n.icon className={phone ? "size-6" : "size-5"} aria-hidden />
                </span>
                <span className="max-w-full truncate px-1">{shop && n.href === "/orders" ? tr("طلبياتي", "My orders") : tr(n.ar, n.en)}</span>
              </Link>
            );
          })}
          {more && (
          <button
            type="button"
            onClick={() => setOpen(true)}
            className={cn("flex flex-col items-center justify-center gap-1 font-medium text-muted transition active:scale-95", phone ? "h-[68px] text-xs" : "h-16 text-[11px]")}
          >
            <span className={cn("flex items-center justify-center", phone ? "h-8 w-14" : "h-7 w-12")}>
              <MoreHorizontal className={phone ? "size-6" : "size-5"} aria-hidden />
            </span>
            {tr("المزيد", "More")}
          </button>
          )}
        </div>
      </nav>
      {open && more && (
        <div className={cn("no-print fixed inset-0 z-50 flex items-end justify-center bg-black/40", !phone && "md:hidden")} onClick={() => setOpen(false)}>
          <div className="max-h-[80dvh] w-full max-w-lg overflow-y-auto rounded-t-2xl bg-card p-3 pb-[calc(env(safe-area-inset-bottom)+12px)]" onClick={(e) => e.stopPropagation()}>
            <div className="mb-2 flex items-center justify-between px-1">
              <p className="font-semibold">{tr("كل الصفحات", "All pages")}</p>
              <IconButton label={tr("إغلاق", "Close")} onClick={() => setOpen(false)}>
                <X className="size-5" />
              </IconButton>
            </div>
            <div className="grid grid-cols-3 gap-2">
              {rest.map((n) => (
                <Link
                  key={n.href}
                  href={n.href}
                  className={cn(
                    "flex flex-col items-center gap-2 rounded-xl border border-line p-3 text-center text-xs font-medium",
                    isActive(path, n.href) ? "bg-primary-soft text-primary-ink" : "text-text",
                  )}
                >
                  <n.icon className="size-5" aria-hidden />
                  {tr(n.ar, n.en)}
                </Link>
              ))}
            </div>
          </div>
        </div>
      )}
    </>
  );
}

// The top bar sits outside the pages' data (useApp), so it gets the dollar rate from the frame.
function TopBar({ user, warehouses, usdRate, phone }: { user: User; warehouses: Lookups["warehouses"]; usdRate: number; phone: boolean }) {
  const { tr } = useFmt();
  const { prefix } = useAppPath();
  const [menu, setMenu] = useState(false);
  const [account, setAccount] = useState(false);
  // The quick search offers this person's own pages, with the names the manager gave them.
  const searchPages = useNav(user);
  return (
    <header className="no-print sticky top-0 z-30 flex h-14 items-center gap-1.5 border-b border-line bg-card/95 px-2 backdrop-blur sm:h-16 sm:px-4">
      {/* On a narrow phone the shop owner's bar is full (his shop switcher shows where he is): no logo there.
          overflow-hidden: a logo squeezed to nothing must not stick out and make the page scroll sideways. */}
      <div className={cn("flex min-w-0 flex-1 items-center gap-2 overflow-hidden", !phone && "md:hidden", phone && user.role === "shop" && "max-sm:invisible")}>
        <Logo small href={phone ? inApp(prefix, homeOf(user.role, user.rep_kinds)) : "/"} />
      </div>
      {/* min-w-0: a long warehouse filter stays inside the bar (it scrolls) instead of pushing the page wider. */}
      <div className={cn("hidden min-w-0 flex-1", !phone && "md:block")}>
        {user.role === "shop" && <ShopSwitcher user={user} />}
        {hasWarehouseFilter(user) && <WarehouseFilterSwitch warehouses={warehouses} />}
      </div>
      {hasWarehouseFilter(user) && (
        <div className="min-w-0 md:hidden">
          <WarehouseFilterSwitch warehouses={warehouses} />
        </div>
      )}
      {user.role === "shop" && (
        <div className={cn("min-w-0", !phone && "md:hidden")}>
          <ShopSwitcher user={user} />
        </div>
      )}
      <QuickSearch pages={searchPages} />
      <NetworkDot />
      <AppLauncher user={user} />
      {user.role === "manager" && <CustomizeToggle />}
      <Bell2 user={user} />
      {/* Who answers the support chat hears each new message from a shop, on every page. */}
      {(user.role === "staff" || user.role === "manager") && <ChatAlerts key={user.id} userId={user.id} />}
      {(user.role === "manager" || user.role === "accountant") && <CurrencySwitch rate={usdRate} />}
      <div className="hidden items-center gap-1.5 2xl:flex">
        <LanguageSwitch />
        <ThemeToggle />
      </div>
      <div className="relative">
        <button type="button" data-tour="account" onClick={() => setMenu((m) => !m)} aria-expanded={menu} aria-label={`${user.name} ${jobName(user, tr)} · ${tr("حسابي والإعدادات", "My account and settings")}`} className="ms-1 flex h-10 items-center gap-2 rounded-xl px-1.5 hover:bg-card-2 sm:px-2">
          <Avatar user={user} size={32} />
          <span className="hidden text-start text-xs leading-tight lg:block">
            <span className="block font-medium text-text">{user.name}</span>
            <span className="block text-muted">{jobName(user, tr)}</span>
          </span>
          <Menu className="size-4 text-muted lg:hidden" aria-hidden />
        </button>
        {menu && (
          <AccountMenu
            user={user}
            onClose={() => setMenu(false)}
            onAccount={() => {
              setMenu(false);
              setAccount(true);
            }}
          />
        )}
      </div>
      {account && <MyAccountDialog user={user} onClose={() => setAccount(false)} />}
    </header>
  );
}

function AccountMenu({ user, onClose, onAccount }: { user: User; onClose: () => void; onAccount: () => void }) {
  const { tr } = useFmt();
  const router = useRouter();
  const toast = useToast();
  const ref = useRef<HTMLDivElement>(null);
  const [sim, setSim] = useState(isSimulatedOffline);
  const sound = useSoundOn();
  const textSize = useTextSize();
  useEffect(() => {
    const onDown = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as Node) && onClose();
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [onClose]);
  return (
    <div ref={ref} className="absolute end-0 top-12 z-50 w-72 rounded-2xl border border-line bg-card p-2 shadow-xl">
      {/* The whole card opens "my account": the picture, and for the shop owner the password and his shops. */}
      <button type="button" onClick={onAccount} className="flex w-full items-center gap-3 rounded-xl px-3 py-2 text-start hover:bg-card-2">
        <Avatar user={user} size={44} />
        <span className="min-w-0 flex-1">
          <span className="block truncate font-semibold">{user.name}</span>
          <span className="block text-xs text-muted" dir="ltr">
            {user.phone}
          </span>
          <span className="mt-0.5 block text-xs text-muted">{jobName(user, tr)}</span>
        </span>
        <span className="shrink-0 rounded-lg bg-primary-soft px-2 py-1 text-xs font-semibold text-primary-ink">{tr("حسابي", "My account")}</span>
      </button>
      <div className="mx-1 my-1 rounded-xl bg-card-2 px-3 py-2">
        <Switch
          checked={sound}
          onChange={(v) => {
            setSoundOn(v);
            // Turning it on plays it once, so you hear what it is.
            if (v) playAlert(true);
          }}
          label={
            <span className="flex items-center gap-2">
              {sound ? <Volume2 className="size-4" /> : <VolumeX className="size-4" />} {tr("صوت الإشعارات والرسائل", "Notification and message sound")}
            </span>
          }
        />
        {/* Hear both sounds now: the notification, then a chat message a moment later. */}
        <button
          type="button"
          onClick={() => {
            playAlert(true);
            setTimeout(() => playMessage(true), 900);
          }}
          className="mt-1 flex w-full items-center justify-center gap-1.5 rounded-lg border border-line py-1.5 text-xs font-semibold hover:bg-card"
        >
          <Volume2 className="size-3.5" /> {tr("جرّب الصوتين", "Try both sounds")}
        </button>
      </div>
      {/* Language and day/night: here when the top bar has no room for them. */}
      <div className="mx-1 my-1 flex items-center justify-between gap-2 rounded-xl bg-card-2 px-3 py-2 2xl:hidden">
        <span className="text-sm">{tr("اللغة والمظهر", "Language and look")}</span>
        <span className="flex items-center gap-1">
          <LanguageSwitch />
          <ThemeToggle />
        </span>
      </div>
      <button
        type="button"
        onClick={() => {
          onClose();
          startTour();
        }}
        className="flex w-full items-center gap-2 rounded-xl px-3 py-2.5 text-sm hover:bg-card-2"
      >
        <Compass className="size-4" /> {tr("جولة تعريفية", "Tour of the site")}
      </button>
      {/* Text size: bigger for whoever needs it (kept on this device). */}
      <div className="mx-1 my-1 rounded-xl bg-card-2 px-3 py-2">
        <p className="mb-1.5 flex items-center gap-2 text-sm">
          <Type className="size-4" /> {tr("حجم الخط", "Text size")}
        </p>
        <div className="grid grid-cols-3 gap-1">
          {(["normal", "large", "xl"] as const).map((z, i) => (
            <button
              key={z}
              type="button"
              onClick={() => setTextSize(z)}
              aria-pressed={textSize === z}
              className={cn("rounded-lg py-1.5 font-semibold transition", textSize === z ? "bg-primary text-on-primary" : "text-muted hover:bg-card")}
              style={{ fontSize: `${12 + i * 2}px` }}
            >
              {[tr("عادي", "Normal"), tr("كبير", "Large"), tr("أكبر", "Larger")][i]}
            </button>
          ))}
        </div>
      </div>
      {USE_MOCK && (
        <div className="mx-1 my-1 rounded-xl bg-card-2 px-3 py-2">
          <p className="mb-1 text-xs font-medium text-faint">{tr("أدوات العرض التجريبي", "Demo tools")}</p>
          <Switch
            checked={sim}
            onChange={(v) => {
              setSim(v);
              setSimulatedOffline(v);
            }}
            label={
              <span className="flex items-center gap-2">
                <CloudOff className="size-4" /> {tr("تجربة بدون إنترنت", "Try without internet")}
              </span>
            }
          />
          <button
            type="button"
            className="mt-1 flex w-full items-center gap-2 rounded-lg py-1.5 text-sm text-muted hover:text-text"
            onClick={async () => {
              if (!confirm(tr("إرجاع كل البيانات التجريبية كما كانت؟ ستضيع التعديلات التي أجريتها.", "Reset all demo data? Your changes will be lost."))) return;
              await api.resetDemo();
              toast("success", tr("أُعيدت البيانات التجريبية", "Demo data reset"));
              onClose();
            }}
          >
            <RefreshCw className="size-4" /> {tr("إعادة البيانات التجريبية", "Reset demo data")}
          </button>
        </div>
      )}
      <button
        type="button"
        className="flex w-full items-center gap-2 rounded-xl px-3 py-2.5 text-sm text-danger hover:bg-danger-soft"
        onClick={async () => {
          await api.logout().catch(() => {});
          signOut();
          router.replace("/login");
        }}
      >
        <LogOut className="size-4" /> {tr("تسجيل الخروج", "Log out")}
      </button>
    </div>
  );
}

function NetworkDot() {
  const { tr } = useFmt();
  const offline = useOffline();
  const queue = useQueue();
  if (!offline && !queue.length) return null;
  return (
    <span className={cn("me-1 flex h-8 items-center gap-1.5 rounded-full px-2.5 text-xs font-medium", offline ? "bg-danger-soft text-danger" : "bg-warning-soft text-warning")}>
      {offline ? <WifiOff className="size-3.5" /> : <Wifi className="size-3.5" />}
      <span className="hidden sm:inline">{offline ? tr("بدون إنترنت", "Offline") : tr("جاري الإرسال", "Sending")}</span>
      {queue.length > 0 && <span className="num">{queue.length}</span>}
    </span>
  );
}

function OfflineBar() {
  const { tr } = useFmt();
  const offline = useOffline();
  const queue = useQueue();
  if (!offline) return null;
  return (
    <div className="no-print border-b border-line bg-warning-soft px-4 py-2 text-center text-sm text-warning">
      <WifiOff className="me-1 inline size-4 align-[-3px]" />
      {tr(
        "لا يوجد إنترنت. يمكنك متابعة عملك: تُحفظ الطلبات (مبدئية حتى المزامنة) والتسديدات على الجوال، وتُرسَل تلقائياً عند عودة الإنترنت.",
        "No internet. Keep working: orders and payments are saved on the phone and sent by themselves when the internet is back.",
      )}
      {queue.length > 0 && <span className="num ms-1 font-semibold">({tr(`${queue.length} بانتظار الإرسال`, `${queue.length} waiting`)})</span>}
    </div>
  );
}

/** Sends saved offline orders/payments as soon as the internet is back. */
function QueueSender() {
  const offline = useOffline();
  const queue = useQueue();
  const toast = useToast();
  const { tr } = useFmt();
  const waiting = queue.filter((j) => !j.error).length;
  useEffect(() => {
    if (offline || !waiting) return;
    const t = setTimeout(async () => {
      const { sent } = await flushQueue((job) => (job.kind === "order" ? api.createOrder(job.body) : api.createPayment(job.body)));
      if (sent) toast("success", tr(`تم إرسال ${sent} من المحفوظات على الجوال`, `${sent} saved item(s) sent`));
    }, 800);
    return () => clearTimeout(t);
  }, [offline, waiting, toast, tr]);
  return null;
}

function Bell2({ user }: { user: User }) {
  const { tr } = useFmt();
  const list = useLoad<AppNotification[]>(() => api.listNotifications(), [user.id]);
  useRealtime(["notifications"], () => list.reload());
  const unread = list.data?.filter((n) => !n.read).length ?? 0;
  return (
    <>
      {/* A new notification shows a card and plays a sound. A new card set for each person who logs in. */}
      <NotificationAlerts key={user.id} list={list.data} />
      <Link
        href="/notifications"
        data-tour="bell"
        // The spoken name holds the number shown on the bell too (what is seen is what is heard).
        aria-label={unread > 0 ? tr(`الإشعارات: ${unread > 99 ? "99+" : unread} غير مقروءة`, `Notifications: ${unread > 99 ? "99+" : unread} unread`) : tr("الإشعارات", "Notifications")}
        className="relative inline-flex size-10 items-center justify-center rounded-xl text-muted hover:bg-card-2 hover:text-text"
      >
        <Bell className="size-5" />
        {unread > 0 && (
          <span className="num absolute end-1 top-1 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-danger px-1 text-[10px] font-bold text-on-danger">
            {unread > 99 ? "99+" : unread}
          </span>
        )}
      </Link>
    </>
  );
}

/** Dinars ⇄ dollars, for the manager and the accountant: every amount on the site, at the day's rate. */
function CurrencySwitch({ rate }: { rate: number }) {
  const { tr, num } = useFmt();
  useSyncExternalStore(subscribeCurrency, currencyVersion, () => 0);
  const usd = wantedCurrency() === "USD";
  return (
    <button
      type="button"
      onClick={() => setCurrency(usd ? "IQD" : "USD")}
      disabled={!rate}
      aria-pressed={usd}
      title={
        rate
          ? tr(`عرض المبالغ ${usd ? "بالدينار" : "بالدولار"} (1$ = ${num(rate)} د.ع)`, `Show amounts in ${usd ? "dinars" : "dollars"} ($1 = ${num(rate)} IQD)`)
          : tr("ثبّت سعر الدولار أولاً", "Set the dollar rate first")
      }
      className={cn(
        "inline-flex h-10 items-center gap-1 rounded-xl border px-2.5 text-sm font-bold transition disabled:opacity-40",
        usd ? "border-success/40 bg-success-soft text-success" : "border-line bg-card text-muted hover:text-text",
      )}
    >
      <span className={cn("num", !usd && "text-text")}>{tr("د.ع", "IQD")}</span>
      <span className="text-faint">/</span>
      <span className={cn("num", usd && "text-success")}>$</span>
    </button>
  );
}
