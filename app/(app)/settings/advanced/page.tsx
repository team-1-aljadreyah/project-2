"use client";

// Advanced settings (the manager): like Salesforce's Setup, simpler. A tree on the side with a quick find,
// and the part chosen on the other side. ?s=home | profiles | profiles:<id> | apps
import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import { AppWindow, Boxes, ChevronDown, HeartPulse, Zap, History, Home, Palette, Search, ShieldCheck, Users } from "lucide-react";
import Link from "next/link";
import { AppsSection, ObjectsSection, ProfilesSection, SetupHome } from "@/components/advanced";
import { HealthSection } from "@/components/health";
import { RulesSection } from "@/components/automation";
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
}

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
  const match = (l: Leaf) => !q.trim() || tr(l.ar, l.en).toLowerCase().includes(q.trim().toLowerCase()) || l.ar.includes(q.trim());

  return (
    <>
      <PageHeader back="/settings" title={tr("الإعدادات المتقدمة", "Advanced settings")} subtitle={tr("أضف ملفات صلاحيات وتطبيقات بنفسك، بلا مبرمج", "Add permission profiles and apps yourself, no developer needed")} />
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
          {part === "profiles" ? <ProfilesSection openId={id} go={go} /> : part === "apps" ? <AppsSection /> : part === "objects" ? <ObjectsSection openObj={id} go={go} /> : part === "health" ? <HealthSection /> : part === "rules" ? <RulesSection /> : <SetupHome go={go} />}
        </div>
      </div>
    </>
  );
}
