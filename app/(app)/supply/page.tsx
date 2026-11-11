"use client";

// Supply orders: the accountant (or the manager) orders goods from a supplier for one warehouse.
// That warehouse's keeper is told, downloads the order as an Excel or CSV file (to check the delivery with
// the supplier's driver), and receives the goods against it when they come: the receiving form opens filled in.
import Link from "next/link";
import { useState } from "react";
import { Ban, FileDown, FileSpreadsheet, PackagePlus, Plus, Trash2, Truck } from "lucide-react";
import { useApp } from "@/components/shell";
import { useWarehouseFilter, inWarehouse } from "@/components/warehouse-filter";
import { Badge, Button, Card, DataTable, Dialog, Empty, ErrorBox, Field, Input, LoadingRows, Money, NumberInput, PageHeader, Segmented, Select, Textarea, errorText, useToast, type Column } from "@/components/ui";
import { api, ApiError } from "@/lib/api";
import type { Item, NewSupplyOrder, SupplyOrder, SupplyStatus, Unit, Warehouse } from "@/lib/api/types";
import { useFmt } from "@/lib/i18n";
import { useBrand } from "@/lib/site";
import { useLoad } from "@/lib/use-load";
import { downloadCsv, today } from "@/lib/utils";
import { downloadXlsx, type Cell } from "@/lib/xlsx";

export default function SupplyPage() {
  const { tr, date, name } = useFmt();
  const { user, lookups } = useApp();
  const list = useLoad(() => api.listSupplyOrders(), []);
  const wh = useWarehouseFilter();
  const [creating, setCreating] = useState(false);
  const [cancelling, setCancelling] = useState<SupplyOrder | null>(null);
  const [status, setStatus] = useState<"open" | "done" | "all">("open");
  const canOrder = user.role === "accountant" || user.role === "manager";
  const all = (list.data ?? []).filter((o) => inWarehouse(wh, o.warehouse_id));
  const open = (o: SupplyOrder) => o.status === "sent" || o.status === "partial";
  const rows = all.filter((o) => (status === "all" ? true : status === "open" ? open(o) : !open(o)));
  const whName = (id: number) => name(lookups.warehouses.find((w) => w.id === id));

  const columns: Column<SupplyOrder>[] = [
    { key: "n", head: tr("الرقم", "No."), cell: (o) => <span className="num font-semibold">{o.number}</span> },
    { key: "w", head: tr("المخزن", "Warehouse"), cell: (o) => whName(o.warehouse_id) },
    { key: "s", head: tr("المورّد", "Supplier"), cell: (o) => o.supplier },
    { key: "l", head: tr("المواد", "Items"), cell: (o) => <span className="num">{o.lines.length}</span>, align: "center" },
    { key: "e", head: tr("يصل", "Expected"), cell: (o) => (o.expected_date ? <span className="num">{date(o.expected_date)}</span> : "-") },
    { key: "t", head: tr("المبلغ", "Total"), cell: (o) => <Money value={o.total} />, align: "end" },
    { key: "st", head: tr("الحالة", "Status"), cell: (o) => <SupplyBadge status={o.status} /> },
    { key: "a", head: "", cell: (o) => <RowActions order={o} warehouse={lookups.warehouses.find((w) => w.id === o.warehouse_id)} onCancel={() => setCancelling(o)} />, align: "end" },
  ];

  return (
    <>
      <PageHeader
        title={tr("طلبات التوريد", "Supply orders")}
        subtitle={
          canOrder
            ? tr("اطلب البضاعة من المورّد لمخزن معيّن، فيصل الطلب لأمين المخزن ملفاً (Excel أو CSV) ويستلم البضاعة عليه.", "Order goods from a supplier for a warehouse; its keeper gets it as a file (Excel or CSV) and receives the goods against it.")
            : tr("طلبات البضاعة القادمة إلى مخزنك: نزّل الملف، وعند وصول البضاعة اضغط «استلام».", "Goods coming to your warehouse: download the file, and press “Receive” when they arrive.")
        }
        actions={
          canOrder && (
            <Button variant="action" onClick={() => setCreating(true)}>
              <Plus className="size-4" /> {tr("طلب توريد جديد", "New supply order")}
            </Button>
          )
        }
      />
      <Card>
        <div className="border-b border-line p-3">
          <Segmented
            value={status}
            onChange={setStatus}
            options={[
              { value: "open", label: tr("قيد الانتظار", "Waiting"), count: all.filter(open).length },
              { value: "done", label: tr("مكتملة أو ملغاة", "Done or cancelled"), count: all.filter((o) => !open(o)).length },
              { value: "all", label: tr("الكل", "All"), count: all.length },
            ]}
          />
        </div>
        {list.state.status === "loading" ? (
          <LoadingRows />
        ) : list.state.status === "error" ? (
          <ErrorBox error={list.state.error} onRetry={list.reload} />
        ) : (
          <DataTable
            rows={rows}
            columns={columns}
            rowKey={(o) => o.id}
            mobile={(o) => (
              <div className="space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-semibold">
                      <span className="num">{o.number}</span> · {o.supplier}
                    </p>
                    <p className="text-xs text-muted">
                      {whName(o.warehouse_id)} · {o.lines.length} {tr("مواد", "items")}
                      {o.expected_date ? ` · ${tr("يصل", "expected")} ${date(o.expected_date)}` : ""}
                    </p>
                  </div>
                  <SupplyBadge status={o.status} />
                </div>
                <RowActions order={o} warehouse={lookups.warehouses.find((w) => w.id === o.warehouse_id)} onCancel={() => setCancelling(o)} />
              </div>
            )}
            empty={<Empty icon={<Truck className="size-6" />} title={tr("لا توجد طلبات توريد هنا", "No supply orders here")} />}
          />
        )}
      </Card>
      {creating && <NewSupply onClose={() => setCreating(false)} onDone={list.reload} />}
      {cancelling && <CancelSupply order={cancelling} onClose={() => setCancelling(null)} onDone={list.reload} />}
    </>
  );
}

function SupplyBadge({ status }: { status: SupplyStatus }) {
  const { tr } = useFmt();
  if (status === "sent") return <Badge tone="primary">{tr("بانتظار الوصول", "Waiting")}</Badge>;
  if (status === "partial") return <Badge tone="warning">{tr("وصل جزء منه", "Part arrived")}</Badge>;
  if (status === "received") return <Badge tone="success">{tr("وصل كاملاً", "Arrived")}</Badge>;
  return <Badge>{tr("ملغي", "Cancelled")}</Badge>;
}

/** The order as rows for the files: a header block, then the items table, then the total. */
function fileRows(o: SupplyOrder, warehouse: Warehouse | undefined, items: Map<number, Item>, tr: (a: string, e: string) => string, date: (s: string) => string, company: string): { rows: Cell[][]; bold: number[] } {
  const head: Cell[][] = [
    [company],
    [tr("طلب توريد", "Supply order"), o.number],
    [tr("المخزن", "Warehouse"), warehouse ? tr(warehouse.name, warehouse.name_en) : ""],
    [tr("المورّد", "Supplier"), o.supplier, o.supplier_phone ?? ""],
    [tr("التاريخ", "Date"), date(o.created_at)],
    [tr("يصل", "Expected"), o.expected_date ? date(o.expected_date) : "-"],
    [tr("كتبه", "Ordered by"), o.created_by.name],
    ...(o.note ? [[tr("ملاحظة", "Note"), o.note] as Cell[]] : []),
    [],
  ];
  const tableHead = head.length;
  const body: Cell[][] = o.lines.map((l, i) => {
    const it = items.get(l.item_id);
    return [i + 1, it ? tr(it.name, it.name_en) : `#${l.item_id}`, it?.barcode ?? "", l.unit === "carton" ? tr("كارتون", "Carton") : tr("قطعة", "Piece"), l.qty, l.price, l.qty * l.price, l.received_qty || ""];
  });
  return {
    rows: [
      ...head,
      ["#", tr("المادة", "Item"), tr("الباركود", "Barcode"), tr("الوحدة", "Unit"), tr("الكمية", "Qty"), tr("سعر الوحدة", "Unit price"), tr("المبلغ", "Amount"), tr("وصل", "Arrived")],
      ...body,
      [],
      ["", tr("المجموع", "Total"), "", "", "", "", o.total],
    ],
    bold: [0, 1, tableHead, tableHead + body.length + 2],
  };
}

function RowActions({ order, warehouse, onCancel }: { order: SupplyOrder; warehouse?: Warehouse; onCancel: () => void }) {
  const { tr, date } = useFmt();
  const brand = useBrand();
  const { user, itemById } = useApp();
  const canReceive = (user.role === "warehouse" && user.warehouse_id === order.warehouse_id) || user.role === "manager";
  const canCancel = (user.role === "accountant" || user.role === "manager") && order.status === "sent";
  const open = order.status === "sent" || order.status === "partial";
  return (
    <div className="flex flex-wrap items-center justify-end gap-1.5">
      <Button
        size="sm"
        onClick={() => {
          const { rows, bold } = fileRows(order, warehouse, itemById, tr, date, brand.company);
          downloadXlsx(order.number, rows, { rtl: true, bold, sheet: order.number, widths: [6, 30, 16, 10, 10, 14, 16, 10] });
        }}
        title={tr("نزّل الطلب ملف Excel", "Download as Excel")}
      >
        <FileSpreadsheet className="size-4 text-success" /> Excel
      </Button>
      <Button
        size="sm"
        onClick={() => {
          const { rows } = fileRows(order, warehouse, itemById, tr, date, brand.company);
          downloadCsv(order.number, rows.map((r) => r.map((c) => (c === null || c === undefined ? "" : c))));
        }}
        title={tr("نزّل الطلب ملف CSV", "Download as CSV")}
      >
        <FileDown className="size-4" /> CSV
      </Button>
      {canReceive && open && (
        <Button size="sm" variant="action" href={`/receipts/new?supply=${order.id}`}>
          <PackagePlus className="size-4" /> {tr("استلام", "Receive")}
        </Button>
      )}
      {canCancel && (
        <Button size="sm" variant="danger" onClick={onCancel} aria-label={tr("إلغاء الطلب", "Cancel")}>
          <Ban className="size-4" />
        </Button>
      )}
    </div>
  );
}

// ---------- the accountant writes a supply order ----------

interface Line {
  key: number;
  item_id: number | "";
  unit: Unit;
  qty: number | "";
  price: number | "";
}
let k = 0;
const blank = (): Line => ({ key: ++k, item_id: "", unit: "carton", qty: "", price: "" });

function NewSupply({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const { tr, name, money } = useFmt();
  const { lookups, items, itemById } = useApp();
  const toast = useToast();
  const filterWh = useWarehouseFilter();
  const [warehouse, setWarehouse] = useState<number>(filterWh ?? lookups.warehouses[0].id);
  const [supplier, setSupplier] = useState("");
  const [phone, setPhone] = useState("");
  const [expected, setExpected] = useState(today(2));
  const [note, setNote] = useState("");
  const [lines, setLines] = useState<Line[]>([blank()]);
  const [err, setErr] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const set = (key: number, p: Partial<Line>) => setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...p } : l)));
  const total = lines.reduce((s, l) => s + (typeof l.qty === "number" && typeof l.price === "number" ? l.qty * l.price : 0), 0);
  // The last purchase price of an item (per carton / piece), as a starting point.
  const lastCost = (itemId: number, unit: Unit) => {
    const it = itemById.get(itemId);
    if (!it?.avg_cost) return "";
    return unit === "carton" ? it.avg_cost * it.pieces_per_carton : it.avg_cost;
  };

  async function save() {
    setBusy(true);
    setErr({});
    try {
      const input: NewSupplyOrder = {
        warehouse_id: warehouse,
        supplier,
        supplier_phone: phone,
        expected_date: expected || undefined,
        note,
        lines: lines.filter((l) => l.item_id).map((l) => ({ item_id: l.item_id as number, unit: l.unit, qty: typeof l.qty === "number" ? l.qty : 0, price: typeof l.price === "number" ? l.price : 0 })),
      };
      const o = await api.createSupplyOrder(input);
      toast("success", tr(`أُرسل ${o.number} إلى أمين المخزن`, `${o.number} was sent to the warehouse keeper`));
      onDone();
      onClose();
    } catch (e) {
      if (e instanceof ApiError && e.errors) setErr(e.errors);
      toast("danger", errorText(e, tr));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog
      open
      wide
      onClose={onClose}
      title={tr("طلب توريد جديد", "New supply order")}
      footer={
        <div className="flex w-full flex-wrap items-center justify-between gap-3">
          <p className="text-sm">
            {tr("المجموع", "Total")}: <Money value={total} className="font-bold" />
          </p>
          <Button variant="action" loading={busy} disabled={busy} onClick={save}>
            <Truck className="size-4" /> {tr("أرسل إلى أمين المخزن", "Send to the keeper")}
          </Button>
        </div>
      }
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label={tr("إلى مخزن", "To warehouse")} error={err.warehouse_id}>
          <Select value={warehouse} onChange={(e) => setWarehouse(Number(e.target.value))}>
            {lookups.warehouses.map((w) => (
              <option key={w.id} value={w.id}>
                {name(w)}
              </option>
            ))}
          </Select>
        </Field>
        <Field label={tr("يصل في", "Expected on")} error={err.expected_date}>
          <Input type="date" min={today()} value={expected} onChange={(e) => setExpected(e.target.value)} />
        </Field>
        <Field label={tr("المورّد", "Supplier")} error={err.supplier}>
          <Input value={supplier} onChange={(e) => setSupplier(e.target.value)} placeholder={tr("اسم الشركة الموردة", "Supplier company")} />
        </Field>
        <Field label={tr("هاتف المورّد", "Supplier phone")} hint={tr("اختياري", "Optional")}>
          <Input dir="ltr" inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} />
        </Field>
      </div>

      <p className="mb-2 mt-5 text-sm font-semibold">{tr("المواد", "Items")}</p>
      {err.lines && <p className="mb-2 text-xs text-danger">{err.lines}</p>}
      <ul className="space-y-2">
        {lines.map((l, i) => {
          const it = l.item_id ? itemById.get(l.item_id) : undefined;
          return (
            <li key={l.key} className="grid items-end gap-2 rounded-xl border border-line p-3 sm:grid-cols-[1.6fr_0.9fr_0.8fr_1fr_auto]">
              <Field label={tr("المادة", "Item")}>
                <Select
                  value={l.item_id}
                  onChange={(e) => {
                    const id = Number(e.target.value) || "";
                    set(l.key, { item_id: id, price: id ? lastCost(id, l.unit) : "" });
                  }}
                >
                  <option value="">{tr("اختر", "Choose")}</option>
                  {items
                    .filter((x: Item) => x.active)
                    .map((x) => (
                      <option key={x.id} value={x.id}>
                        {name(x)}
                      </option>
                    ))}
                </Select>
              </Field>
              <Field label={tr("الوحدة", "Unit")}>
                <Select value={l.unit} onChange={(e) => set(l.key, { unit: e.target.value as Unit, price: l.item_id ? lastCost(l.item_id, e.target.value as Unit) : l.price })}>
                  <option value="carton">{tr("كارتون", "Carton")}</option>
                  <option value="piece">{tr("قطعة", "Piece")}</option>
                </Select>
              </Field>
              <Field label={tr("الكمية", "Qty")} error={err[`lines.${i}.qty`]}>
                <NumberInput value={l.qty} onChange={(v) => set(l.key, { qty: v })} />
              </Field>
              <Field label={tr("سعر الشراء", "Cost")} error={err[`lines.${i}.price`]} hint={it && typeof l.qty === "number" && typeof l.price === "number" ? money(l.qty * l.price) : undefined}>
                <NumberInput value={l.price} onChange={(v) => set(l.key, { price: v })} suffix={tr("د.ع", "IQD")} />
              </Field>
              <Button variant="ghost" onClick={() => setLines((ls) => (ls.length > 1 ? ls.filter((x) => x.key !== l.key) : ls))} aria-label={tr("حذف السطر", "Remove line")}>
                <Trash2 className="size-4" />
              </Button>
            </li>
          );
        })}
      </ul>
      <Button className="mt-2" onClick={() => setLines((ls) => [...ls, blank()])}>
        <Plus className="size-4" /> {tr("مادة أخرى", "Another item")}
      </Button>
      <Field label={tr("ملاحظة لأمين المخزن", "Note for the keeper")} className="mt-4">
        <Textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} />
      </Field>
    </Dialog>
  );
}

function CancelSupply({ order, onClose, onDone }: { order: SupplyOrder; onClose: () => void; onDone: () => void }) {
  const { tr } = useFmt();
  const toast = useToast();
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <Dialog
      open
      onClose={onClose}
      title={tr(`إلغاء ${order.number}`, `Cancel ${order.number}`)}
      footer={
        <Button
          variant="danger"
          loading={busy}
          disabled={busy || !reason.trim()}
          onClick={async () => {
            setBusy(true);
            try {
              await api.cancelSupplyOrder(order.id, reason);
              toast("success", tr("أُلغي طلب التوريد وأُبلغ أمين المخزن", "Cancelled; the keeper was told"));
              onDone();
              onClose();
            } catch (e) {
              toast("danger", errorText(e, tr));
            } finally {
              setBusy(false);
            }
          }}
        >
          {tr("ألغِ الطلب", "Cancel the order")}
        </Button>
      }
    >
      <Field label={tr("السبب", "Reason")}>
        <Textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={2} />
      </Field>
      <p className="mt-2 text-xs text-muted">
        <Link href="/supply" className="underline">
          {order.number}
        </Link>{" "}
        · {order.supplier}
      </p>
    </Dialog>
  );
}
