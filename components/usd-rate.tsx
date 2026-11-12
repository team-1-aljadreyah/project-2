"use client";

// The dollar rate: the accountant fixes it every morning ("$1 = 1,700 IQD"); the manager can too.
// Until today's rate is set, the card asks for it in orange. Invoices made today keep today's rate,
// so an old invoice still shows its dollars at the rate of its own day.
import { useState } from "react";
import { DollarSign, History, Save } from "lucide-react";
import { Button, Card, NumberInput, errorText, useToast } from "@/components/ui";
import { api } from "@/lib/api";
import { useFmt } from "@/lib/i18n";
import { useLoad } from "@/lib/use-load";
import { cn, today } from "@/lib/utils";
import { useApp } from "./shell";

export function UsdRateCard({ className }: { className?: string }) {
  const { tr, num, date, ago } = useFmt();
  const { user } = useApp();
  const toast = useToast();
  const rates = useLoad(() => api.usdRates(), []);
  const last = rates.data?.[0];
  const setToday = last?.date === today();
  const [value, setValue] = useState<number | "">("");
  const [busy, setBusy] = useState(false);
  const canSet = user.role === "accountant" || user.role === "manager";

  async function save() {
    if (value === "") return;
    setBusy(true);
    try {
      const r = await api.setUsdRate(value);
      toast("success", tr(`ثُبّت سعر اليوم: 1$ = ${num(r.rate)} د.ع`, `Today's rate set: $1 = ${num(r.rate)} IQD`));
      setValue("");
      rates.reload();
    } catch (e) {
      toast("danger", errorText(e, tr));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className={cn("p-4", !setToday && "border-action", className)}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className={cn("flex size-11 items-center justify-center rounded-xl", setToday ? "bg-success-soft text-success" : "bg-action/15 text-action")}>
            <DollarSign className="size-5" />
          </span>
          <div>
            <p className="text-xs text-muted">{tr("سعر صرف الدولار اليوم", "Today's dollar rate")}</p>
            {setToday ? (
              <p className="num text-xl font-bold" dir="ltr">
                $1 = {num(last!.rate)} IQD
              </p>
            ) : (
              <p className="font-bold text-action">{tr("لم يُثبَّت سعر اليوم بعد", "Today's rate isn't set yet")}</p>
            )}
            <p className="min-h-4 text-[11px] text-faint">
              {setToday ? tr(`ثبّته ${last!.by.name} ${ago(last!.at)}`, `Set by ${last!.by.name} ${ago(last!.at)}`) : last ? tr(`آخر سعر: ${num(last.rate)} (${date(last.date)})`, `Last: ${num(last.rate)} (${date(last.date)})`) : ""}
            </p>
          </div>
        </div>
        {canSet && (
          <div className="flex items-end gap-2">
            <div className="w-36">
              <NumberInput value={value} onChange={setValue} suffix={tr("د.ع", "IQD")} placeholder={last ? String(last.rate) : "1500"} />
            </div>
            <Button variant={setToday ? "secondary" : "action"} loading={busy} disabled={busy || value === ""} onClick={save}>
              <Save className="size-4" /> {setToday ? tr("تعديل", "Change") : tr("ثبّت السعر", "Set rate")}
            </Button>
          </div>
        )}
      </div>
      {/* The last days' rates. While they load, the row keeps its place (the page below doesn't jump). */}
      {!rates.data && <div aria-hidden className="mt-3 h-[2.2rem] border-t border-line" />}
      {(rates.data?.length ?? 0) > 0 && (
        <div className="mt-3 flex items-center gap-1.5 overflow-x-auto border-t border-line pt-3 text-xs [scrollbar-width:none]">
          <History className="size-3.5 shrink-0 text-faint" />
          {rates.data!.slice(0, 7).map((r) => (
            <span key={r.date} className="shrink-0 rounded-full bg-card-2 px-2 py-0.5 text-muted">
              <span className="num">{date(r.date)}</span> · <b className="num text-text">{num(r.rate)}</b>
            </span>
          ))}
        </div>
      )}
    </Card>
  );
}
