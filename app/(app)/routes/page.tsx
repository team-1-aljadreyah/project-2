"use client";

// «خط السير» (manager): the days each marketing rep visits each of his shops, and how the visits went.
import { PageHeader, Segmented } from "@/components/ui";
import { VisitPlan, VisitsReport } from "@/components/visits";
import { useFmt } from "@/lib/i18n";
import { useRemembered } from "@/lib/remember";

type Tab = "plan" | "report";

export default function RoutesPage() {
  const { tr } = useFmt();
  const [tab, setTab] = useRemembered<Tab>("routes:tab", "plan");
  return (
    <>
      <PageHeader title={tr("خط السير", "Visit plan")} subtitle={tr("أيام زيارة كل محل، وما تمّ منها", "Each shop's visit days, and what was done")} />
      <Segmented
        value={tab}
        onChange={setTab}
        options={[
          { value: "plan", label: tr("الخطة", "The plan") },
          { value: "report", label: tr("الزيارات", "Visits") },
        ]}
        className="mb-4"
      />
      {tab === "plan" ? <VisitPlan /> : <VisitsReport />}
    </>
  );
}
