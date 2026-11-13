"use client";

// «العهدة»: the cash the reps hold.
// - MyCustody: the rep's card — what he holds, today's cash, «سلّم للمحاسب», and his handover waiting to be counted.
// - CustodyBoard: the accountant and the manager — who holds how much now, the handovers to count, each rep's log.
import { useState } from "react";
import { ArrowDownLeft, ArrowUpRight, Banknote, Clock, HandCoins, Wallet } from "lucide-react";
import Link from "next/link";
import { useApp } from "@/components/shell";
import { Button, Card, CardHeader, Dialog, Empty, ErrorBox, Field, Input, LoadingRows, NumberInput, Select, Stat, errorText, useToast } from "@/components/ui";
import { api } from "@/lib/api";
import type { CashHandover, CustodyRow } from "@/lib/api/types";
import { useFmt } from "@/lib/i18n";
import { useLoad } from "@/lib/use-load";
import { cn } from "@/lib/utils";

const DAY = 86_400_000;
/** Calendar days since a time (0 = today, 1 = yesterday). */
const daysSince = (iso?: string) => {
  if (!iso) return 0;
  const start = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  return Math.max(0, Math.round((start(new Date()) - start(new Date(iso))) / DAY));
};

function useAgeText() {
  const { tr, num } = useFmt();
  return (iso?: string) => {
    const d = daysSince(iso);
    return d === 0 ? tr("من اليوم", "from today") : d === 1 ? tr("منذ أمس", "since yesterday") : d === 2 ? tr("منذ يومين", "for 2 days") : tr(`منذ ${num(d)} ${d <= 10 ? "أيام" : "يوماً"}`, `for ${num(d)} days`);
  };
}

// ---------- The rep ----------

export function MyCustody({ compact }: { compact?: boolean }) {
  const { tr, money } = useFmt();
  const toast = useToast();
  const age = useAgeText();
  const r = useLoad(() => api.custody(), []);
  const [giving, setGiving] = useState(false);
  const [busy, setBusy] = useState(false);
  const row = r.data?.[0];
  if (!row) return compact ? null : <LoadingRows rows={2} />;
  if (compact && !row.holding && !row.pending) return null;
  const old = daysSince(row.oldest_at) >= 2;
  const cancel = async (h: CashHandover) => {
    setBusy(true);
    try {
      await api.cancelHandover(h.id);
      toast("success", tr("أُلغي التسليم", "Handover taken back"));
    } catch (e) {
      toast("danger", errorText(e, tr));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Card className="p-4">
      <div className="flex items-start justify-between gap-3">
        <Link href="/custody" className="min-w-0 flex-1">
          <p className="flex items-center gap-1.5 text-sm text-muted">
            <Wallet className="size-4 text-action" /> {tr("عهدتي (نقد معي)", "My custody (cash with me)")}
          </p>
          <p className="num mt-1 text-2xl font-bold">{money(row.holding)}</p>
          <p className={cn("mt-0.5 text-xs", old ? "font-semibold text-danger" : "text-muted")}>
            {row.holding > 0 ? tr(`أقدم نقد ${age(row.oldest_at)}`, `Oldest cash ${age(row.oldest_at)}`) : tr("لا نقد معك", "No cash with you")}
            {row.today > 0 && <> · {tr(`اليوم ${money(row.today)}`, `today ${money(row.today)}`)}</>}
          </p>
        </Link>
        {!row.pending && row.holding > 0 && (
          <Button variant="action" size="sm" onClick={() => setGiving(true)}>
            <HandCoins className="size-4" /> {tr("سلّم للمحاسب", "Hand to the accountant")}
          </Button>
        )}
      </div>
      {row.pending && (
        <div className="mt-3 flex items-center gap-2 rounded-2xl bg-warning-soft p-3 text-sm text-warning">
          <Clock className="size-4 shrink-0" />
          <span className="min-w-0 flex-1">{tr(`سلّمت ${money(row.pending.declared)}؛ بانتظار عدّ المحاسب`, `You handed ${money(row.pending.declared)}; waiting for the accountant to count it`)}</span>
          <Button size="sm" variant="ghost" loading={busy} onClick={() => cancel(row.pending!)}>
            {tr("تراجع", "Take back")}
          </Button>
        </div>
      )}
      {row.short_total > 0 && !compact && <p className="mt-2 text-xs text-danger">{tr(`نقص سابق باقٍ عليك: ${money(row.short_total)}`, `Earlier shortages on you: ${money(row.short_total)}`)}</p>}
      {giving && <HandOverDialog row={row} onClose={() => setGiving(false)} />}
    </Card>
  );
}

function HandOverDialog({ row, onClose }: { row: CustodyRow; onClose: () => void }) {
  const { tr, money } = useFmt();
  const toast = useToast();
  const [amount, setAmount] = useState<number | "">(row.holding);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const bad = amount === "" || amount <= 0 || amount > row.holding;
  return (
    <Dialog
      open
      onClose={onClose}
      title={tr("سلّم العهدة للمحاسب", "Hand your cash to the accountant")}
      footer={
        <Button
          variant="action"
          className="w-full"
          disabled={bad}
          loading={busy}
          onClick={async () => {
            setBusy(true);
            try {
              await api.handOver({ amount: Number(amount), ...(note.trim() ? { note: note.trim() } : {}) });
              toast("success", tr("أُرسل للمحاسب ليعدّه ويؤكده", "Sent to the accountant to count and confirm"));
              onClose();
            } catch (e) {
              toast("danger", errorText(e, tr));
            } finally {
              setBusy(false);
            }
          }}
        >
          {tr("سلّمت المبلغ", "I handed it")}
        </Button>
      }
    >
      <Field label={tr("المبلغ الذي تسلّمه", "The amount you hand over")} hint={tr(`معك ${money(row.holding)}`, `You hold ${money(row.holding)}`)} error={amount !== "" && amount > row.holding ? tr("أكثر مما معك", "More than you hold") : undefined}>
        <NumberInput value={amount} onChange={setAmount} suffix={tr("د.ع", "IQD")} invalid={amount !== "" && amount > row.holding} />
      </Field>
      <Field label={tr("ملاحظة (اختياري)", "A note (optional)")} className="mt-3">
        <Input value={note} onChange={(e) => setNote(e.target.value)} maxLength={200} />
      </Field>
      <p className="mt-3 text-xs text-muted">{tr("يخرج المبلغ من عهدتك حين يعدّه المحاسب ويؤكد استلامه.", "It leaves your custody when the accountant counts it and confirms.")}</p>
    </Dialog>
  );
}

// ---------- The accountant and the manager ----------

export function CustodyBoard() {
  const { tr, money, num, dateTime } = useFmt();
  const age = useAgeText();
  const r = useLoad(() => api.custody(), []);
  const [counting, setCounting] = useState<CashHandover | null>(null);
  const [taking, setTaking] = useState(false);
  const [log, setLog] = useState<number | null>(null);
  if (r.state.status === "error") return <ErrorBox error={r.state.error} onRetry={r.reload} />;
  if (!r.data) return <LoadingRows rows={4} />;
  const rows = r.data;
  const pending = rows.filter((x) => x.pending).map((x) => x.pending!);
  const total = rows.reduce((s, x) => s + x.holding, 0);
  const old = rows.filter((x) => x.holding > 0 && daysSince(x.oldest_at) >= 2).length;
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label={tr("نقد بيد المندوبين الآن", "Cash with the reps now")} value={money(total)} icon={<Banknote className="size-4" />} tone="primary" />
        <Stat label={tr("تسليمات تنتظر العدّ", "Handovers to count")} value={num(pending.length)} tone={pending.length ? "warning" : undefined} icon={<Clock className="size-4" />} />
        <Stat label={tr("نقد أقدم من يومين", "Cash older than 2 days")} value={num(old)} hint={tr("مندوب", "reps")} tone={old ? "danger" : undefined} />
        <Stat label={tr("نقص سابق", "Earlier shortages")} value={money(rows.reduce((s, x) => s + x.short_total, 0))} />
      </div>

      {pending.length > 0 && (
        <Card className="border-warning/40">
          <CardHeader title={tr("عدّ وأكّد الاستلام", "Count and confirm")} subtitle={tr("مندوب سلّم نقداً ينتظر عدّك", "A rep handed cash waiting for your count")} />
          <ul className="divide-y divide-line">
            {pending.map((h) => (
              <li key={h.id}>
                <button type="button" onClick={() => setCounting(h)} className="flex w-full items-center gap-3 px-4 py-3 text-start hover:bg-card-2">
                  <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-warning-soft text-warning">
                    <HandCoins className="size-5" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-semibold">{h.rep.name}</span>
                    <span className="block truncate text-xs text-muted">
                      <span className="num" dir="ltr">
                        {h.number}
                      </span>{" "}
                      · {dateTime(h.created_at)}
                      {h.note && <> · «{h.note}»</>}
                    </span>
                  </span>
                  <span className="num font-bold">{money(h.declared)}</span>
                </button>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <Card>
        <CardHeader
          title={tr("عهدة كل مندوب", "Each rep's custody")}
          subtitle={tr("النقد الذي قبضه من المحلات ولم يسلّمه بعد", "Cash taken from the shops and not handed in yet")}
          action={
            <Button size="sm" variant="ghost" onClick={() => setTaking(true)}>
              <HandCoins className="size-4" /> {tr("استلام نقد من مندوب", "Take cash from a rep")}
            </Button>
          }
        />
        {!rows.length ? (
          <Empty icon={<Wallet className="size-6" />} title={tr("لا نقد عند المندوبين", "No cash with the reps")} />
        ) : (
          <ul className="divide-y divide-line">
            {rows.map((x) => {
              const late = x.holding > 0 && daysSince(x.oldest_at) >= 2;
              return (
                <li key={x.rep.id}>
                  <button type="button" onClick={() => setLog(x.rep.id)} className="flex w-full items-center gap-3 px-4 py-3 text-start hover:bg-card-2">
                    <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-primary-soft font-bold text-primary-ink">{x.rep.name.trim()[0]}</span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-semibold">{x.rep.name}</span>
                      <span className={cn("block truncate text-xs", late ? "font-semibold text-danger" : "text-muted")}>
                        {x.holding > 0 ? tr(`أقدم نقد ${age(x.oldest_at)}`, `Oldest cash ${age(x.oldest_at)}`) : tr("سلّم كل ما معه", "Handed everything")}
                        {x.today > 0 && <span className="font-normal text-muted"> · {tr(`اليوم ${money(x.today)}`, `today ${money(x.today)}`)}</span>}
                        {x.short_total > 0 && <span className="text-danger"> · {tr(`نقص ${money(x.short_total)}`, `${money(x.short_total)} short`)}</span>}
                      </span>
                    </span>
                    <span className={cn("num text-lg font-bold", x.holding > 0 ? "" : "text-muted")}>{money(x.holding)}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </Card>
      {counting && <CountDialog h={counting} onClose={() => setCounting(null)} />}
      {taking && <TakeDialog rows={rows} onClose={() => setTaking(false)} />}
      {log !== null && <LogDialog repId={log} onClose={() => setLog(null)} />}
    </div>
  );
}

/** The accountant counts what the rep handed: received (≤ declared); a shortage stays on the rep. */
function CountDialog({ h, onClose }: { h: CashHandover; onClose: () => void }) {
  const { tr, money } = useFmt();
  const toast = useToast();
  const [received, setReceived] = useState<number | "">(h.declared);
  const [busy, setBusy] = useState<"ok" | "no" | null>(null);
  const short = received === "" ? 0 : h.declared - received;
  const run = async (kind: "ok" | "no") => {
    setBusy(kind);
    try {
      if (kind === "ok") await api.confirmHandover(h.id, Number(received));
      else await api.cancelHandover(h.id);
      toast("success", kind === "ok" ? tr("سُجّل الاستلام", "Received") : tr("أُلغي التسليم", "Handover cancelled"));
      onClose();
    } catch (e) {
      toast("danger", errorText(e, tr));
    } finally {
      setBusy(null);
    }
  };
  return (
    <Dialog
      open
      onClose={onClose}
      title={tr(`عهدة ${h.rep.name}`, `${h.rep.name}'s cash`)}
      footer={
        <div className="flex w-full gap-2">
          <Button variant="ghost" loading={busy === "no"} onClick={() => run("no")}>
            {tr("لم يُسلَّم", "Not handed")}
          </Button>
          <Button variant="action" className="flex-1" disabled={received === "" || received > h.declared} loading={busy === "ok"} onClick={() => run("ok")}>
            {tr("أكّد الاستلام", "Confirm")}
          </Button>
        </div>
      }
    >
      <p className="text-sm text-muted">{tr(`يقول المندوب إنه سلّم ${money(h.declared)}. عدّ النقد واكتب ما استلمته فعلاً.`, `The rep says he handed ${money(h.declared)}. Count the cash and write what you received.`)}</p>
      <Field label={tr("المبلغ المستلم", "Received")} className="mt-3" error={received !== "" && received > h.declared ? tr("أكثر مما سلّمه", "More than he handed") : undefined}>
        <NumberInput value={received} onChange={setReceived} suffix={tr("د.ع", "IQD")} />
      </Field>
      {short > 0 && received !== "" && (
        <p className="mt-3 rounded-2xl bg-danger-soft p-3 text-sm font-semibold text-danger">{tr(`نقص ${money(short)}: يبقى في عهدة المندوب، ويصل المدير إشعار به.`, `${money(short)} short: it stays in the rep's custody, and the manager is told.`)}</p>
      )}
    </Dialog>
  );
}

/** Cash taken from a rep in person (counted at once). */
function TakeDialog({ rows, onClose }: { rows: CustodyRow[]; onClose: () => void }) {
  const { tr, money } = useFmt();
  const toast = useToast();
  const holders = rows.filter((x) => x.holding > 0 && !x.pending);
  const [repId, setRepId] = useState(String(holders[0]?.rep.id ?? ""));
  const row = holders.find((x) => String(x.rep.id) === repId);
  const [amount, setAmount] = useState<number | "">(row?.holding ?? "");
  const [busy, setBusy] = useState(false);
  return (
    <Dialog
      open
      onClose={onClose}
      title={tr("استلام نقد من مندوب", "Take cash from a rep")}
      footer={
        <Button
          variant="action"
          className="w-full"
          disabled={!row || amount === "" || amount <= 0 || amount > row.holding}
          loading={busy}
          onClick={async () => {
            setBusy(true);
            try {
              await api.handOver({ rep_id: Number(repId), amount: Number(amount) });
              toast("success", tr("سُجّل الاستلام", "Received"));
              onClose();
            } catch (e) {
              toast("danger", errorText(e, tr));
            } finally {
              setBusy(false);
            }
          }}
        >
          {tr("استلمت المبلغ", "I received it")}
        </Button>
      }
    >
      {!holders.length ? (
        <p className="text-sm text-muted">{tr("لا مندوب معه نقد (أو تسليمه ينتظر العدّ).", "No rep holds cash (or his handover is waiting).")}</p>
      ) : (
        <>
          <Field label={tr("المندوب", "Rep")}>
            <Select
              value={repId}
              onChange={(e) => {
                setRepId(e.target.value);
                setAmount(holders.find((x) => String(x.rep.id) === e.target.value)?.holding ?? "");
              }}
            >
              {holders.map((x) => (
                <option key={x.rep.id} value={x.rep.id}>
                  {x.rep.name} · {money(x.holding)}
                </option>
              ))}
            </Select>
          </Field>
          <Field label={tr("المبلغ المستلم", "Received")} className="mt-3" hint={row && tr(`معه ${money(row.holding)}`, `He holds ${money(row.holding)}`)}>
            <NumberInput value={amount} onChange={setAmount} suffix={tr("د.ع", "IQD")} />
          </Field>
        </>
      )}
    </Dialog>
  );
}

/** A rep's cash in and out. */
export function CustodyLogList({ repId }: { repId: number }) {
  const { tr, money, dateTime } = useFmt();
  const r = useLoad(() => api.custodyLog(repId), [repId]);
  if (r.state.status === "error") return <ErrorBox error={r.state.error} onRetry={r.reload} />;
  if (!r.data) return <LoadingRows rows={4} />;
  const { entries } = r.data;
  if (!entries.length) return <Empty icon={<Wallet className="size-6" />} title={tr("لا حركة بعد", "Nothing yet")} />;
  return (
    <ul className="divide-y divide-line">
      {entries.map((e) => {
        const inner = (
          <>
            <span className={cn("flex size-9 shrink-0 items-center justify-center rounded-full", e.kind === "cash" ? "bg-success-soft text-success" : "bg-primary-soft text-primary-ink")}>
              {e.kind === "cash" ? <ArrowDownLeft className="size-4" /> : <ArrowUpRight className="size-4" />}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-semibold">{e.kind === "cash" ? tr(`قبض من ${e.customer ?? ""}`, `Cash from ${e.customer ?? ""}`) : tr("سلّم للمحاسب", "Handed to the accountant")}</span>
              <span className="block truncate text-xs text-muted">
                <span className="num" dir="ltr">
                  {e.number}
                </span>{" "}
                · {dateTime(e.at)}
                {e.short ? <span className="text-danger"> · {tr(`نقص ${money(e.short)}`, `${money(e.short)} short`)}</span> : null}
              </span>
            </span>
            <span className={cn("num shrink-0 font-bold", e.amount > 0 ? "text-success" : "")}>{money(e.amount, { sign: true })}</span>
          </>
        );
        return (
          <li key={`${e.kind}-${e.number}`}>
            {e.link ? (
              <Link href={e.link} className="flex items-center gap-3 px-4 py-2.5 hover:bg-card-2">
                {inner}
              </Link>
            ) : (
              <div className="flex items-center gap-3 px-4 py-2.5">{inner}</div>
            )}
          </li>
        );
      })}
    </ul>
  );
}

function LogDialog({ repId, onClose }: { repId: number; onClose: () => void }) {
  const { tr } = useFmt();
  const { lookups } = useApp();
  const name = lookups.reps.find((x) => x.id === repId)?.name ?? "";
  return (
    <Dialog open onClose={onClose} title={tr(`حركة عهدة ${name}`, `${name}'s cash`)} wide>
      <div className="-mx-4 -my-2">
        <CustodyLogList repId={repId} />
      </div>
    </Dialog>
  );
}
