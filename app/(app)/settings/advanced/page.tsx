"use client";

// Advanced settings (the manager): like Salesforce's Setup, simpler. A tree on the side with a quick find
// (it finds a setting by its name too), and the part chosen on the other side.
// ?s=home | profiles | profiles:<id> | apps | objects | rules | health | the company's rules (components/advanced-rules.tsx)
import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import { AppWindow, Banknote, Bell, Boxes, ChevronDown, HeartPulse, Zap, History, Home, KeyRound, Megaphone, Package, Palette, Search, ShieldCheck, ShoppingCart, Store, ToggleRight, Truck, Users } from "lucide-react";
import Link from "next/link";
import { AppsSection, ObjectsSection, ProfilesSection, SetupHome } from "@/components/advanced";
import { HealthSection } from "@/components/health";
import { RulesSection } from "@/components/automation";
import { RULE_WORDS, RulesSection as CompanyRules, type RulesPart } from "@/components/advanced-rules";
import { Card, LoadingRows, PageHeader } from "@/components/ui";
import { useAppRouter } from "@/lib/app-path";
import { useFmt } from "@/lib/i18n";
import { cn } from "@/lib/utils";

export default function AdvancedSettingsPage() {
  return (
    <Suspense fallback={<LoadingRows />}>
      <Setup />
    </Suspense>
  );
}

interface Leaf {
  key: string;
  ar: string;
  en: string;
  icon: typeof Home;
  /** Another page of the site (opens it), instead of a part of this one. */
  href?: string;
  /** More words the quick find knows it by (its settings' names). */
  words?: string;
}

const RULE_PARTS: RulesPart[] = ["orders", "signup", "delivery", "money", "stock", "security", "features", "notify", "announce", "history"];

function Setup() {
  const { tr } = useFmt();
  const router = useAppRouter();
  const s = useSearchParams().get("s") ?? "home";
  const [part, id] = s.split(":");
  const [q, setQ] = useState("");
  const go = (to: string) => router.push(to === "home" ? "/settings/advanced" : `/settings/advanced?s=${to}`);

  const tree: { ar: string; en: string; leaves: Leaf[] }[] = [
    {
      ar: "",
      en: "",
      leaves: [
        { key: "home", ar: "الرئيسية", en: "Setup home", icon: Home },
        { key: "health", ar: "الصحة والأمان", en: "Health and security", icon: HeartPulse },
      ],
    },
    {
      ar: "الإدارة",
      en: "Administration",
      leaves: [
        { key: "profiles", ar: "ملفات الصلاحيات", en: "Permission profiles", icon: ShieldCheck },
        { key: "users", ar: "المستخدمون", en: "Users", icon: Users, href: "/users" },
      ],
    },
    {
      ar: "قواعد العمل",
      en: "Business rules",
      leaves: [
        { key: "orders", ar: "الطلبات والموافقات", en: "Orders and approvals", icon: ShoppingCart, words: RULE_WORDS.orders },
        { key: "signup", ar: "المحلات الجديدة", en: "New shops", icon: Store, words: RULE_WORDS.signup },
        { key: "delivery", ar: "التوصيل والزيارات", en: "Delivery and visits", icon: Truck, words: RULE_WORDS.delivery },
        { key: "money", ar: "الأموال والعهدة", en: "Money and custody", icon: Banknote, words: RULE_WORDS.money },
        { key: "stock", ar: "المخزون والتصفية", en: "Stock and clearance", icon: Package, words: RULE_WORDS.stock },
        { key: "security", ar: "الدخول ورمز التحقق", en: "Logins and OTP", icon: KeyRound, words: RULE_WORDS.security },
      ],
    },
    {
      ar: "أدوات المدير",
      en: "Manager's tools",
      leaves: [
        { key: "features", ar: "تشغيل الميزات وإيقافها", en: "Feature switches", icon: ToggleRight, words: RULE_WORDS.features },
        { key: "notify", ar: "من يصله كل إشعار", en: "Who gets which notification", icon: Bell, words: RULE_WORDS.notify },
        { key: "announce", ar: "الإعلان والصيانة", en: "Banner and maintenance", icon: Megaphone, words: RULE_WORDS.announce },
        { key: "history", ar: "سجل الإعدادات والملف", en: "History, file, defaults", icon: History, words: RULE_WORDS.history },
      ],
    },
    {
      ar: "أدوات المنصة",
      en: "Platform tools",
      leaves: [
        { key: "apps", ar: "مدير التطبيقات", en: "App manager", icon: AppWindow },
        { key: "objects", ar: "مدير الكائنات والحقول", en: "Objects and fields", icon: Boxes },
        { key: "rules", ar: "قواعد الأتمتة", en: "Automation rules", icon: Zap },
      ],
    },
    {
      ar: "الموقع",
      en: "Site",
      leaves: [
        { key: "look", ar: "الهوية والقواعد والمخازن", en: "Identity, rules, warehouses", icon: Palette, href: "/settings" },
        { key: "audit", ar: "سجل النشاط", en: "Activity log", icon: History, href: "/audit" },
      ],
    },
  ];
  const match = (l: Leaf) => {
    const w = q.trim().toLowerCase();
    return !w || tr(l.ar, l.en).toLowerCase().includes(w) || l.ar.includes(w) || l.en.toLowerCase().includes(w) || !!l.words?.toLowerCase().includes(w);
  };

  return (
    <>
      <PageHeader back="/settings" title={tr("الإعدادات المتقدمة", "Advanced settings")} subtitle={tr("كل قواعد العمل والميزات والإشعارات وملفات الصلاحيات والتطبيقات، بيدك بلا مبرمج", "Every business rule, feature, notification, profile and app, in your hands, no developer needed")} />
      <div className="grid gap-4 lg:grid-cols-[250px_minmax(0,1fr)]">
        <Card className="h-fit p-3 lg:sticky lg:top-20">
          <label className="mb-3 flex h-10 items-center gap-2 rounded-xl border border-line bg-card px-3">
            <Search className="size-4 text-faint" />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={tr("بحث سريع", "Quick find")} className="w-full bg-transparent text-sm outline-none" />
          </label>
          <nav className="space-y-3">
            {tree.map((g, i) => {
              const leaves = g.leaves.filter(match);
              if (!leaves.length) return null;
              return (
                <div key={i}>
                  {g.ar && (
                    <p className="flex items-center gap-1 px-2 pb-1 text-[11px] font-semibold uppercase tracking-wide text-faint">
                      <ChevronDown className="size-3" /> {tr(g.ar, g.en)}
                    </p>
                  )}
                  {leaves.map((l) => {
                    const active = !l.href && part === l.key;
                    const cls = cn("flex h-9 items-center gap-2.5 rounded-lg px-2.5 text-sm", active ? "bg-primary-soft font-semibold text-primary-ink" : "text-muted hover:bg-card-2 hover:text-text");
                    return l.href ? (
                      <Link key={l.key} href={l.href} className={cls}>
                        <l.icon className="size-4" /> {tr(l.ar, l.en)}
                      </Link>
                    ) : (
                      <button key={l.key} type="button" onClick={() => go(l.key)} className={cn(cls, "w-full text-start")}>
                        <l.icon className="size-4" /> {tr(l.ar, l.en)}
                      </button>
                    );
                  })}
                </div>
              );
            })}
          </nav>
        </Card>
        <div className="min-w-0">
          {RULE_PARTS.includes(part as RulesPart) ? <CompanyRules part={part as RulesPart} /> : part === "profiles" ? <ProfilesSection openId={id} go={go} /> : part === "apps" ? <AppsSection /> : part === "objects" ? <ObjectsSection openObj={id} go={go} /> : part === "health" ? <HealthSection /> : part === "rules" ? <RulesSection /> : <SetupHome go={go} />}
        </div>
      </div>
    </>
  );
}
