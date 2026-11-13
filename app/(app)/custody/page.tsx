"use client";

// «العهدة»: the cash the reps hold. The rep sees his own and hands it over; the accountant and the manager see
// everyone's, count the handovers and take cash from a rep.
import { CustodyBoard, CustodyLogList, MyCustody } from "@/components/custody";
import { useApp } from "@/components/shell";
import { Card, CardHeader, PageHeader } from "@/components/ui";
import { useFmt } from "@/lib/i18n";

export default function CustodyPage() {
  const { tr } = useFmt();
  const { user } = useApp();
  if (user.role === "rep")
    return (
      <div className="mx-auto max-w-3xl space-y-4">
        <PageHeader title={tr("عهدتي", "My custody")} subtitle={tr("النقد الذي قبضته من المحلات ولم تسلّمه للمحاسب بعد", "Cash you took from the shops and haven't handed to the accountant yet")} />
        <MyCustody />
        <Card>
          <CardHeader title={tr("الحركة", "Movements")} subtitle={tr("كل قبض نقدي، وكل تسليم عدّه المحاسب", "Every cash payment, and every handover the accountant counted")} />
          <CustodyLogList repId={user.id} />
        </Card>
      </div>
    );
  return (
    <>
      <PageHeader title={tr("العهدة", "Cash custody")} subtitle={tr("من يحمل كم نقداً الآن، وتسليمات المندوبين للمحاسب", "Who holds how much cash now, and the reps' handovers")} />
      <CustodyBoard />
    </>
  );
}
