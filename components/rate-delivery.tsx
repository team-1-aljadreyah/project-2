"use client";

// Rating a delivery: the shop owner gives 1–5 stars and a note (optional) within 7 days of receiving his order.
// - RatePrompt: on his home, the last delivery he hasn't rated yet («كيف كان توصيل طلبك؟»).
// - DeliveryRatingCard: on the order page — his stars to give or change, or (others) the rating he gave.
import { useState } from "react";
import { Star, X } from "lucide-react";
import { Button, Card, errorText, useToast } from "@/components/ui";
import { api } from "@/lib/api";
import type { Order, User } from "@/lib/api/types";
import { useFmt } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { useRules } from "@/lib/use-rules";

const WEEK = 7 * 86_400_000;
const canRate = (o: Order) => o.delivery?.status === "delivered" && !!o.delivery.delivered_at && Date.now() - new Date(o.delivery.delivered_at).getTime() < WEEK;

function Stars({ value, onPick, size = "md" }: { value: number; onPick?: (n: number) => void; size?: "sm" | "md" }) {
  const { tr } = useFmt();
  const words = [tr("سيئ", "Bad"), tr("ضعيف", "Poor"), tr("مقبول", "OK"), tr("جيد", "Good"), tr("ممتاز", "Excellent")];
  return (
    <span className="flex items-center gap-1" dir="ltr" role={onPick ? "radiogroup" : undefined} aria-label={onPick ? tr("التقييم", "Rating") : tr(`${value} من 5`, `${value} of 5`)}>
      {[1, 2, 3, 4, 5].map((n) =>
        onPick ? (
          <button key={n} type="button" role="radio" aria-checked={value === n} aria-label={`${n} · ${words[n - 1]}`} onClick={() => onPick(n)} className="rounded-lg p-0.5 transition active:scale-90">
            <Star className={cn(size === "sm" ? "size-5" : "size-8", n <= value ? "fill-[#f5b301] text-[#f5b301]" : "text-line-strong")} />
          </button>
        ) : (
          <Star key={n} className={cn(size === "sm" ? "size-4" : "size-5", n <= value ? "fill-[#f5b301] text-[#f5b301]" : "text-line-strong")} aria-hidden />
        ),
      )}
    </span>
  );
}

function RateForm({ order, start = 0, onDone }: { order: Order; start?: number; onDone: (o: Order) => void }) {
  const { tr } = useFmt();
  const toast = useToast();
  const [stars, setStars] = useState(start || order.rating?.stars || 0);
  const [note, setNote] = useState(order.rating?.note ?? "");
  const [busy, setBusy] = useState(false);
  return (
    <div>
      <Stars value={stars} onPick={setStars} />
      {stars > 0 && (
        <div className="mt-3 space-y-2">
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={2}
            maxLength={300}
            placeholder={stars <= 2 ? tr("ما الذي حصل؟ (يصل للمدير)", "What happened? (goes to the manager)") : tr("ملاحظة (اختياري)", "A note (optional)")}
            aria-label={tr("ملاحظة", "Note")}
            className="w-full resize-none rounded-xl border border-line-strong bg-card px-3 py-2 text-sm outline-none focus:border-action"
          />
          <Button
            variant="action"
            loading={busy}
            onClick={async () => {
              setBusy(true);
              try {
                const o = await api.rateDelivery(order.id, { stars, note });
                toast("success", tr("شكراً، وصل تقييمك", "Thank you, your rating is in"));
                onDone(o);
              } catch (e) {
                toast("danger", errorText(e, tr));
              } finally {
                setBusy(false);
              }
            }}
          >
            {tr("أرسل التقييم", "Send the rating")}
          </Button>
        </div>
      )}
    </div>
  );
}

/** On the shop owner's home: his last delivery not rated yet (within 7 days). Hidden for this visit once closed. */
/** Hidden while the manager has ratings turned off (advanced settings → features). */
export function RatePrompt(p: Parameters<typeof RatePromptInner>[0]) {
  return useRules().features.ratings ? <RatePromptInner {...p} /> : null;
}

function RatePromptInner({ orders, customerId }: { orders: Order[]; customerId: number }) {
  const { tr } = useFmt();
  const [closed, setClosed] = useState(false);
  const [done, setDone] = useState<Order | null>(null);
  const o = orders
    .filter((x) => x.customer_id === customerId && !x.rating && canRate(x))
    .sort((a, b) => (b.delivery!.delivered_at ?? "").localeCompare(a.delivery!.delivered_at ?? ""))[0];
  if (closed || (!o && !done)) return null;
  if (done)
    return (
      <div className="anim-drop-in mx-auto mb-4 flex max-w-5xl items-center gap-3 rounded-3xl border border-success/30 bg-success-soft p-4 text-success">
        <Stars value={done.rating?.stars ?? 0} size="sm" />
        <p className="flex-1 text-sm font-semibold">{tr("شكراً لتقييمك، يساعدنا أن نوصل أفضل.", "Thanks for rating; it helps us deliver better.")}</p>
        <button type="button" onClick={() => setClosed(true)} aria-label={tr("إغلاق", "Close")} className="rounded-lg p-1 hover:bg-white/30">
          <X className="size-4" />
        </button>
      </div>
    );
  return (
    <div className="anim-drop-in mx-auto mb-4 max-w-5xl rounded-3xl border border-line bg-card p-4">
      <div className="mb-2 flex items-start justify-between gap-2">
        <div>
          <p className="font-bold">{tr("كيف كان توصيل طلبك؟", "How was your delivery?")}</p>
          <p className="text-xs text-muted">
            <span className="num" dir="ltr">
              {o!.number}
            </span>
            {o!.delivery?.delivered_by && <> · {tr(`سلّمه ${o!.delivery.delivered_by.name}`, `Delivered by ${o!.delivery.delivered_by.name}`)}</>}
          </p>
        </div>
        <button type="button" onClick={() => setClosed(true)} aria-label={tr("لاحقاً", "Later")} className="rounded-lg p-1 text-muted hover:bg-card-2">
          <X className="size-4" />
        </button>
      </div>
      <RateForm order={o!} onDone={setDone} />
    </div>
  );
}

/** On the order page: the shop owner rates (or changes it within 7 days); the others see what he gave. */
/** Hidden while the manager has ratings turned off (advanced settings → features). */
export function DeliveryRatingCard(p: { order: Order; user: Pick<User, "role">; onChanged: () => void }) {
  return useRules().features.ratings ? <RatingCard {...p} /> : null;
}

function RatingCard({ order, user, onChanged }: { order: Order; user: Pick<User, "role">; onChanged: () => void }) {
  const { tr, ago } = useFmt();
  const [edit, setEdit] = useState(false);
  const r = order.rating;
  const mine = user.role === "shop";
  if (!r && !(mine && canRate(order))) return null;
  return (
    <Card className="mb-4 p-4">
      <p className="mb-2 text-sm font-bold">{tr("تقييم التوصيل", "Delivery rating")}</p>
      {r && !edit ? (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <Stars value={r.stars} size="sm" />
          <span className="text-xs text-muted">
            {ago(r.at)}
            {r.rep && <> · {tr(`المندوب ${r.rep.name}`, `Rep ${r.rep.name}`)}</>}
          </span>
          {r.note && <p className="w-full text-sm">«{r.note}»</p>}
          {mine && canRate(order) && (
            <button type="button" onClick={() => setEdit(true)} className="text-xs font-semibold text-action hover:underline">
              {tr("غيّر تقييمك", "Change your rating")}
            </button>
          )}
        </div>
      ) : (
        <RateForm
          order={order}
          onDone={() => {
            setEdit(false);
            onChanged();
          }}
        />
      )}
    </Card>
  );
}

export { Stars };
