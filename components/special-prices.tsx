"use client";

// A shop's own prices: the manager can give one shop a price for one item. It comes first, before the shop's
// tier price (special → tier → general). The carton has its own price (it can be cheaper than pieces × count).
import { useState } from "react";
import { Plus, Tag, Trash2 } from "lucide-react";
import { Button, Card, CardHeader, Dialog, Field, Money, NumberInput, Select, errorText, useToast } from "@/components/ui";
import { api } from "@/lib/api";
import type { Customer } from "@/lib/api/types";
import { useFmt } from "@/lib/i18n";
import { useLoad } from "@/lib/use-load";
import { priceOf } from "@/lib/utils";
import { useApp } from "./shell";

export function SpecialPrices({ customer }: { customer: Customer }) {
  const { tr, name } = useFmt();
  const { user, items, itemById } = useApp();
  const toast = useToast();
  const list = useLoad(() => api.specialPrices(customer.id), [customer.id]);
  const [adding, setAdding] = useState(false);
  const isManager = user.role === "manager";

  return (
    <Card>
      <CardHeader
        title={tr("أسعار خاصة لهذا المحل", "This shop's special prices")}
        subtitle={tr("تُقدَّم على سعر فئة المحل. الترتيب: السعر الخاص ← سعر الفئة ← السعر العام.", "They come before the shop's tier price: special → tier → general.")}
        action={
          isManager && (
            <Button size="sm" onClick={() => setAdding(true)}>
              <Plus className="size-4" /> {tr("سعر خاص", "Special price")}
            </Button>
          )
        }
      />
      <ul className="divide-y divide-line text-sm">
        {(list.data ?? []).map((sp) => {
          const it = itemById.get(sp.item_id);
          return (
            <li key={sp.item_id} className="flex items-center justify-between gap-2 px-4 py-2.5">
              <span className="flex min-w-0 items-center gap-2">
                <Tag className="size-4 shrink-0 text-action" />
                <span className="truncate font-medium">{name(it)}</span>
              </span>
              <span className="flex shrink-0 items-center gap-3 text-xs">
                <span>
                  <Money value={sp.carton_price} /> / {tr("كارتون", "ctn")}
                </span>
                <span className="text-muted">
                  {it && <s className="me-1">{priceOf(it, customer.tier_id, "carton").toLocaleString("en")}</s>}
                </span>
                {isManager && (
                  <button
                    type="button"
                    aria-label={tr("إلغاء السعر الخاص", "Remove")}
                    onClick={async () => {
                      try {
                        await api.setSpecialPrice(customer.id, sp.item_id, null);
                        list.reload();
                      } catch (e) {
                        toast("danger", errorText(e, tr));
                      }
                    }}
                    className="rounded-lg p-1 text-danger hover:bg-danger-soft"
                  >
                    <Trash2 className="size-4" />
                  </button>
                )}
              </span>
            </li>
          );
        })}
        {!list.data?.length && <li className="p-4 text-center text-muted">{tr("لا توجد أسعار خاصة: يدفع بسعر فئته", "No special prices: the shop pays its tier price")}</li>}
      </ul>
      {adding && <AddSpecial customer={customer} items={items.filter((i) => i.active)} onClose={() => setAdding(false)} onDone={list.reload} />}
    </Card>
  );
}

function AddSpecial({ customer, items, onClose, onDone }: { customer: Customer; items: ReturnType<typeof useApp>["items"]; onClose: () => void; onDone: () => void }) {
  const { tr, name, money } = useFmt();
  const toast = useToast();
  const [itemId, setItemId] = useState<number>(items[0]?.id ?? 0);
  const it = items.find((i) => i.id === itemId);
  const [carton, setCarton] = useState<number | "">("");
  const [piece, setPiece] = useState<number | "">("");
  const [busy, setBusy] = useState(false);
  return (
    <Dialog
      open
      onClose={onClose}
      title={tr(`سعر خاص لـ ${customer.name}`, `Special price for ${customer.name}`)}
      footer={
        <Button
          variant="action"
          className="w-full"
          loading={busy}
          disabled={busy || carton === "" || piece === ""}
          onClick={async () => {
            setBusy(true);
            try {
              await api.setSpecialPrice(customer.id, itemId, { carton_price: Number(carton), piece_price: Number(piece) });
              toast("success", tr("حُفظ السعر الخاص: يُستعمل في طلباته الجديدة", "Saved: used in its new orders"));
              onDone();
              onClose();
            } catch (e) {
              toast("danger", errorText(e, tr));
            } finally {
              setBusy(false);
            }
          }}
        >
          {tr("احفظ", "Save")}
        </Button>
      }
    >
      <div className="space-y-3">
        <Field label={tr("المادة", "Item")}>
          <Select value={itemId} onChange={(e) => setItemId(Number(e.target.value))}>
            {items.map((i) => (
              <option key={i.id} value={i.id}>
                {name(i)}
              </option>
            ))}
          </Select>
        </Field>
        {it && <p className="text-xs text-muted">{tr(`سعر فئته الآن: ${money(priceOf(it, customer.tier_id, "carton"))} للكارتون، ${money(priceOf(it, customer.tier_id, "piece"))} للقطعة`, `Tier price now: ${money(priceOf(it, customer.tier_id, "carton"))} / carton, ${money(priceOf(it, customer.tier_id, "piece"))} / piece`)}</p>}
        <div className="grid grid-cols-2 gap-3">
          <Field label={tr("سعر الكارتون", "Carton price")}>
            <NumberInput value={carton} onChange={setCarton} suffix={tr("د.ع", "IQD")} />
          </Field>
          <Field label={tr("سعر القطعة", "Piece price")}>
            <NumberInput value={piece} onChange={setPiece} suffix={tr("د.ع", "IQD")} />
          </Field>
        </div>
      </div>
    </Dialog>
  );
}
