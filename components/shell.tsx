"use client";

// The frame around every page after login: side menu (computer), bottom bar (phone), top bar with
// notifications, language, day/night and the account menu. It also checks the role can open the page,
// and sends saved offline orders when the internet comes back.
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Bell, CloudOff, LogOut, Menu, MoreHorizontal, RefreshCw, ShieldAlert, Wifi, WifiOff, X } from "lucide-react";
import { api, type Lookups } from "@/lib/api";
import type { AppNotification, Item, User } from "@/lib/api/types";
import { signOut, rememberNext, homeOf, updateUser, useSession } from "@/lib/auth";
import { ChatWidget } from "@/components/support/chat-widget";
import { ShopSwitcher } from "@/components/shop-switcher";
import { WarehouseFilterSwitch, hasWarehouseFilter } from "@/components/warehouse-filter";
import { USE_MOCK } from "@/lib/config";
import { useFmt } from "@/lib/i18n";
import { flushQueue, setSimulatedOffline, useOffline, useQueue, isSimulatedOffline } from "@/lib/offline";
import { useLoad } from "@/lib/use-load";
import { cn } from "@/lib/utils";
import { Logo } from "./logo";
import { canOpen, GROUPS, NAV, navFor } from "./nav";
import { jobName } from "./status";
import { LanguageSwitch, ThemeToggle } from "./switches";
import { Button, Empty, IconButton, Skeleton, Switch, useToast } from "./ui";

interface AppData {
  user: User;
  lookups: Lookups;
  items: Item[];
  itemById: Map<number, Item>;
  reloadItems: () => void;
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
  const path = usePathname();

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
      items: items.data,
      itemById: new Map(items.data.map((i) => [i.id, i])),
      reloadItems: items.reload,
    };
  }, [user, lookups.data, items.data, items.reload]);

  const allowed = canOpen(user.role, path, user.rep_kinds);

  return (
    <div className="min-h-dvh md:flex">
      <Sidebar user={user} />
      <div className="flex min-w-0 flex-1 flex-col">
        <TopBar user={user} warehouses={lookups.data?.warehouses ?? []} />
        <OfflineBar />
        <main className="mx-auto w-full max-w-7xl flex-1 px-3 pt-4 pb-28 sm:px-5 md:pb-10">
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
      <BottomBar user={user} />
      <QueueSender />
    </div>
  );
}

function useNav(user: User) {
  return NAV.filter((n) => navFor(n, user));
}

function isActive(path: string, href: string) {
  if (href === "/orders") return path === "/orders" || (/^\/orders\/\d+/.test(path) && true);
  return path === href || path.startsWith(href + "/");
}

function Sidebar({ user }: { user: User }) {
  const { tr } = useFmt();
  const path = usePathname();
  const nav = useNav(user);
  const groups = Object.keys(GROUPS) as (keyof typeof GROUPS)[];
  return (
    <aside className="no-print sticky top-0 hidden h-dvh w-64 shrink-0 flex-col border-e border-line bg-card md:flex">
      <div className="flex h-16 items-center gap-2 border-b border-line px-4">
        <Logo href="/" />
      </div>
      <nav className="flex-1 overflow-y-auto px-3 py-3">
        {groups.map((g) => {
          const list = nav.filter((n) => n.group === g);
          if (!list.length) return null;
          return (
            <div key={g} className="mb-3">
              {GROUPS[g][0] && <p className="px-3 pb-1 pt-2 text-xs font-medium text-faint">{tr(GROUPS[g][0], GROUPS[g][1])}</p>}
              {list.map((n) => {
                const active = isActive(path, n.href);
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

function BottomBar({ user }: { user: User }) {
  const { tr } = useFmt();
  const path = usePathname();
  const nav = useNav(user);
  // The "more" sheet closes by itself when the page changes: it is open only for the page it was opened on.
  const [openAt, setOpenAt] = useState<string | null>(null);
  const open = openAt === path;
  const setOpen = (v: boolean) => setOpenAt(v ? path : null);
  const main = nav.filter((n) => n.mobile?.includes(user.role)).slice(0, 4);
  const rest = nav.filter((n) => !main.includes(n));
  return (
    <>
      <nav className="no-print fixed inset-x-0 bottom-0 z-40 border-t border-line bg-card/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden">
        <div className="mx-auto grid max-w-lg grid-cols-5">
          {main.map((n) => {
            const active = isActive(path, n.href);
            return (
              <Link key={n.href} href={n.href} className={cn("flex h-16 flex-col items-center justify-center gap-1 text-[11px] font-medium", active ? "text-primary-ink" : "text-muted")}>
                <span className={cn("flex h-7 w-12 items-center justify-center rounded-full transition", active && "bg-primary-soft")}>
                  <n.icon className="size-5" aria-hidden />
                </span>
                <span className="max-w-full truncate px-1">{tr(n.ar, n.en)}</span>
              </Link>
            );
          })}
          <button type="button" onClick={() => setOpen(true)} className="flex h-16 flex-col items-center justify-center gap-1 text-[11px] font-medium text-muted">
            <span className="flex h-7 w-12 items-center justify-center">
              <MoreHorizontal className="size-5" aria-hidden />
            </span>
            {tr("المزيد", "More")}
          </button>
        </div>
      </nav>
      {open && (
        <div className="no-print fixed inset-0 z-50 flex items-end bg-black/40 md:hidden" onClick={() => setOpen(false)}>
          <div className="max-h-[80dvh] w-full overflow-y-auto rounded-t-2xl bg-card p-3 pb-[calc(env(safe-area-inset-bottom)+12px)]" onClick={(e) => e.stopPropagation()}>
            <div className="mb-2 flex items-center justify-between px-1">
              <p className="font-semibold">{tr("كل الصفحات", "All pages")}</p>
              <IconButton label={tr("إغلاق", "Close")} onClick={() => setOpen(false)}>
                <X className="size-5" />
              </IconButton>
            </div>
            <div className="grid grid-cols-3 gap-2">
              {rest.map((n) => (
                <Link key={n.href} href={n.href} className={cn("flex flex-col items-center gap-2 rounded-xl border border-line p-3 text-center text-xs font-medium", isActive(path, n.href) ? "bg-primary-soft text-primary-ink" : "text-text")}>
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

function TopBar({ user, warehouses }: { user: User; warehouses: Lookups["warehouses"] }) {
  const { tr } = useFmt();
  const [menu, setMenu] = useState(false);
  return (
    <header className="no-print sticky top-0 z-30 flex h-14 items-center gap-1.5 border-b border-line bg-card/95 px-2 backdrop-blur sm:h-16 sm:px-4">
      <div className="flex min-w-0 flex-1 items-center gap-2 md:hidden">
        <Logo small href="/" />
      </div>
      <div className="hidden flex-1 md:block">
        {user.role === "shop" && <ShopSwitcher user={user} />}
        {hasWarehouseFilter(user) && <WarehouseFilterSwitch warehouses={warehouses} />}
      </div>
      {hasWarehouseFilter(user) && (
        <div className="min-w-0 md:hidden">
          <WarehouseFilterSwitch warehouses={warehouses} />
        </div>
      )}
      {user.role === "shop" && (
        <div className="min-w-0 md:hidden">
          <ShopSwitcher user={user} />
        </div>
      )}
      <NetworkDot />
      <Bell2 user={user} />
      <LanguageSwitch />
      <ThemeToggle />
      <div className="relative">
        <button type="button" onClick={() => setMenu((m) => !m)} aria-expanded={menu} className="ms-1 flex h-10 items-center gap-2 rounded-xl px-1.5 hover:bg-card-2 sm:px-2">
          <span className="flex size-8 items-center justify-center rounded-full bg-primary text-sm font-bold text-on-primary">{user.name.slice(0, 1)}</span>
          <span className="hidden text-start text-xs leading-tight lg:block">
            <span className="block font-medium text-text">{user.name}</span>
            <span className="block text-muted">{jobName(user, tr)}</span>
          </span>
          <Menu className="size-4 text-muted lg:hidden" aria-hidden />
        </button>
        {menu && <AccountMenu user={user} onClose={() => setMenu(false)} />}
      </div>
    </header>
  );
}

function AccountMenu({ user, onClose }: { user: User; onClose: () => void }) {
  const { tr } = useFmt();
  const router = useRouter();
  const toast = useToast();
  const ref = useRef<HTMLDivElement>(null);
  const [sim, setSim] = useState(isSimulatedOffline);
  useEffect(() => {
    const onDown = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as Node) && onClose();
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [onClose]);
  return (
    <div ref={ref} className="absolute end-0 top-12 z-50 w-72 rounded-2xl border border-line bg-card p-2 shadow-xl">
      <div className="px-3 py-2">
        <p className="font-semibold">{user.name}</p>
        <p className="text-xs text-muted" dir="ltr">
          {user.phone}
        </p>
        <p className="mt-1 text-xs text-muted">{jobName(user, tr)}</p>
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
      {tr("لا يوجد إنترنت. يمكنك متابعة عملك: تُحفظ الطلبات والتسديدات على الجوال وتُرسَل تلقائياً عند عودة الإنترنت.", "No internet. Keep working: orders and payments are saved on the phone and sent by themselves when the internet is back.")}
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
  const unread = list.data?.filter((n) => !n.read).length ?? 0;
  return (
    <Link href="/notifications" aria-label={tr("الإشعارات", "Notifications")} className="relative inline-flex size-10 items-center justify-center rounded-xl text-muted hover:bg-card-2 hover:text-text">
      <Bell className="size-5" />
      {unread > 0 && (
        <span className="num absolute end-1 top-1 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-danger px-1 text-[10px] font-bold text-white">
          {unread > 99 ? "99+" : unread}
        </span>
      )}
    </Link>
  );
}
