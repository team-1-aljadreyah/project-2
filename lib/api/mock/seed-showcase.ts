// The demo for a presentation: on top of the 45 days of history (seed.ts), one case of everything the site can do,
// made with the site's own rules so every number stays consistent. Each case runs on its own: one that can't
// happen with the day's data is skipped, the rest still run. Nothing here is needed by the real backend.
import type { Db, DbUser } from "./db";
import type { CustomField, Profile, AutoRule, AppDef, ShopBanner, Unit } from "../types";
import { fullSite } from "../site-defaults";
import { soldUnits } from "../../units";
import {
  addDays,
  acceptOrder,
  approveOrder,
  cancelSupplyOrder,
  closeStocktake,
  createExpense,
  createOrder,
  createReceipt,
  createReturn,
  createStocktake,
  createSupplyOrder,
  createTransfer,
  creditInvoice,
  customerBalance,
  dayOf,
  decideExpense,
  deliverOrder,
  expensesOf,
  holdBatch,
  planShipments,
  prepareOrder,
  receiveTransfer,
  refundCustomer,
  registerShop,
  reportDeliveryProblem,
  saveStocktake,
  sellableQty,
  setOrderDiscount,
  settleZainCash,
  startOnline,
  updateOrder,
} from "./rules";

/** A photo of packages at a shop's door (a small drawing as a PNG; the real one is the delivery rep's photo). */
const DOOR_PHOTO = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAMAAAACQCAIAAADRMPOnAAABzElEQVR42u3cIQ6DMBSAYW6F3UWmyOwcGjuzQ3CBnQMxuWTXQSAmCayhr+VL/gMU+uUhmtJ835O0u8YrEEACSAAJIAkgASSABJAEkAASQAJIAkgACSABJAEUoOuljRxAAAEEEEACSAABBBBAAAEkgAQQQAABBBBAAAEkgAQQQAABBBBAAkgAAQQQQAABJIAEEEAAAQQQQAJIABUF6HnvYgZQMYA+rz5aAAEEEEAAAQQQQAABBBBAAAEEEEAAAQQQQAABBBBAAAEEEEAAAQQQQAABBNCexscQM4BMIBMIIIAAAggggAAKfJsCoJMCmsbb/wEEEEAAAQQQQAABBBBA4QFluWkPUFWAkqx80zMCBBBAAAEEEEAAAQRQUkDHB1A9gA7YvOwrBwgggAACCCCAAAIIIIAAqvg+1+oNL4BMIBMIIIAAKhRQls8oQCaQCQQQQFsB1XQkmfCwFqCl1S0GCCCAAAIIIIAAAggggAACCCCAAAIIIIAAAggggAACCCCAdMb/AwHEDUAAASSABBBASh1AAkgACSABJAEkgASQAJIAEkACSABJAAkgASSAJIAEkAASQAJIAkgACSABJAEkgASQAJIAEkACSABJv2a/wQVkg38paAAAAABJRU5ErkJggg==";

export function addShowcase(db: Db, now: Date, ctx: { at: (daysAgo: number, hour: number, minute?: number) => Date; cref: () => string }) {
  const { at, cref } = ctx;
  const done: string[] = [];
  const skipped: string[] = [];
  const run = (name: string, fn: () => unknown) => {
    try {
      fn();
      done.push(name);
    } catch (e) {
      const errs = (e as { errors?: Record<string, string> }).errors;
      skipped.push(`${name}: ${(e as Error).message}${errs ? " " + JSON.stringify(errs) : ""}`);
    }
  };
  const user = (id: number) => db.users.find((u) => u.id === id)!;
  const manager = user(1);
  const keeper1 = user(2);
  const keeper2 = user(3);
  const accountant = user(7);
  const shopOwner = user(8);
  const ago = (min: number) => new Date(now.getTime() - min * 60_000);
  const wh1 = db.warehouses[0].id;
  const wh2 = db.warehouses[1]?.id ?? wh1;
  // An order made now: the manager's OK when it needs one, else the accountant accepts it.
  const accept = (o: { id: number; status: string }) => (o.status === "needs_approval" ? approveOrder(db, manager, o.id, ago(229)) : o.status === "pending" ? acceptOrder(db, accountant, o.id, ago(229)) : o);
  const inStock = (whId: number, pieces: number) => db.items.filter((it) => it.active && sellableQty(db, it.id, whId, now) >= pieces);

  // ---- People and the manager's setup ----
  run("a shop that signed up and waits for approval", () =>
    registerShop(
      db,
      {
        shop_name: "ماركت النخيل",
        owner_name: "علي جواد",
        phone: "07812345615",
        area: "حي الغدير",
        address: "قرب جامع الغدير",
        password: "123456",
        address_info: { label: "ماركت النخيل", details: "كربلاء - حي الغدير، قرب جامع الغدير", phone: "07812345615", lat: 32.6318, lng: 44.0405 },
      },
      ago(65),
    ),
  );
  run("a stopped login and a see-only auditor", () => {
    db.users.push(
      { id: 12, name: "سائق سابق - كريم", phone: "07801000012", role: "rep", rep_kinds: ["delivery"], active: false, password: "123456" } as DbUser,
      { id: 13, name: "مدقق الحسابات - سارة", phone: "07801000013", role: "accountant", active: true, password: "123456", profile_id: "auditor" } as DbUser,
    );
  });
  run("the manager's customization: banners, profiles, a custom field, rules, an app", () => {
    const site = fullSite(db.custom);
    const banners: ShopBanner[] = [
      { id: "b1", image: "/banners/rice-week.svg", title: "أسبوع الرز", title_en: "Rice week", sub: "أفضل أسعار الرز البسمتي والعنبر", link: { kind: "category", value: "حبوب ورز" }, active: true },
      { id: "b2", image: "/banners/new-oils.svg", title: "زيوت الفرات", title_en: "Al-Furat oils", sub: "زيت دوار الشمس وزيت الذرة", link: { kind: "brand", value: "زيوت الفرات" }, active: true },
    ];
    const profiles: Profile[] = [
      { id: "auditor", name: "مدقق حسابات", name_en: "Auditor", description: "يرى الحسابات ولا يغيّر شيئاً", role: "accountant", denied: ["/expenses"], limits: {}, read_only: true },
      { id: "keeper-day", name: "أمين مخزن نهاري", name_en: "Day keeper", description: "يدخل من 8 صباحاً إلى 6 مساءً، ولا يرى كلفة الشراء", role: "warehouse", denied: [], limits: { no_profit: true }, hours: { from: "08:00", to: "18:00", days: [6, 0, 1, 2, 3, 4] } },
    ];
    const fields: CustomField[] = [
      { id: "cr_no", object: "customer", label: "رقم السجل التجاري", label_en: "Trade register no.", type: "text", in_table: true, view_roles: [], edit_roles: ["accountant"], active: true } as CustomField,
      { id: "origin", object: "item", label: "بلد المنشأ", label_en: "Country of origin", type: "list", options: ["العراق", "تركيا", "الإمارات", "الهند"], view_roles: [], edit_roles: ["warehouse"], active: true } as CustomField,
    ];
    const rules: AutoRule[] = [
      { id: "big-order", name: "طلب كبير يحتاج موافقتي", active: true, trigger: "order_created", conditions: [{ field: "total", op: "gt", value: 3_000_000 }], notify: ["manager"], approval: true, message: "طلب كبير {number} بمبلغ {amount} من {customer}" },
      { id: "big-cash", name: "تسديد نقدي كبير", active: true, trigger: "payment_created", conditions: [{ field: "amount", op: "gte", value: 1_000_000 }], notify: ["manager", "accountant"], message: "تسديد {amount} من {customer} استلمه {by}" },
    ];
    const apps: AppDef[] = [{ id: "boss", name: "لوحة المدير", name_en: "Manager's board", description: "ما يتابعه المدير كل يوم", color: "#e1692b", icon: "chart", pages: ["/summary", "/decisions", "/routes", "/custody"], roles: ["manager"], profiles: [], active: true }];
    db.custom = { ...site, banners, profiles, fields, rules, apps };
    db.custom_values = {
      "customer:1": { cr_no: "KR-2019-4471" },
      "customer:6": { cr_no: "KR-2021-1180" },
      "item:5": { origin: "تركيا" },
      "item:12": { origin: "الهند" },
    };
    db.rule_runs = [
      { id: 1, rule_id: "big-cash", rule: "تسديد نقدي كبير", at: at(3, 15).toISOString(), record: "تسديد من أسواق الكوثر", did: "أُبلغ المدير والمحاسب" },
      { id: 2, rule_id: "big-order", rule: "طلب كبير يحتاج موافقتي", at: at(1, 11).toISOString(), record: "طلب ماركت الفرات", did: "أُبلغ المدير، وينتظر موافقته" },
    ];
  });
  run("the logins of the last day (the security page)", () => {
    const L = (phone: string, ok: boolean, min: number, reason?: "wrong" | "stopped" | "hours", user_id?: number) => ({ phone, ok, at: ago(min).toISOString(), ...(reason ? { reason } : {}), ...(user_id ? { user_id } : {}) });
    db.login_log = [
      L("07801000001", true, 400, undefined, 1),
      L("07801000002", true, 380, undefined, 2),
      L("07801000007", false, 300, "wrong", 7),
      L("07801000007", true, 298, undefined, 7),
      L("07801000012", false, 240, "stopped", 12),
      L("07799999999", false, 200, "wrong"),
      L("07799999999", false, 199, "wrong"),
      L("07801000004", true, 120, undefined, 4),
      L("07812345601", true, 60, undefined, 8),
    ];
  });
  run("a keeper covering the other warehouse until tomorrow", () => {
    const w = db.warehouses.find((x) => x.id === wh2);
    if (w) w.cover = { user_id: keeper1.id, name: keeper1.name, until: addDays(now, 1).toISOString(), by: manager.name, at: ago(180).toISOString() };
  });

  // ---- Stock ----
  run("a held batch (a complaint)", () => {
    const b = db.batches.find((x) => x.warehouse_id === wh1 && x.qty_left > 20 && x.item_id === 10);
    if (!b) throw new Error("no batch");
    holdBatch(db, manager, b.id, "شكوى من محل: علب منفوخة، بانتظار فحص المورد", ago(300));
  });
  run("an item stopped", () => {
    db.items.push({ ...db.items[26], id: 29, name: "ملح خشن 1 كغم", name_en: "Coarse salt 1 kg", barcode: "6260999000291", active: false, image: undefined, offer: undefined });
    db.seq.item = Math.max(db.seq.item ?? 0, 29);
  });
  run("a transfer on the way", () => {
    const it = inStock(wh1, 120)[0];
    createTransfer(db, keeper1, { client_ref: cref(), from_warehouse_id: wh1, to_warehouse_id: wh2, lines: [{ item_id: it.id, unit: "carton", qty: 5 }], note: "نقص عند مخزن الحر" }, ago(90));
  });
  run("a transfer received short (waits for the manager's review)", () => {
    const it = inStock(wh2, 60)[1] ?? inStock(wh2, 60)[0];
    const t = createTransfer(db, keeper2, { client_ref: cref(), from_warehouse_id: wh2, to_warehouse_id: wh1, lines: [{ item_id: it.id, unit: "carton", qty: 3 }] }, at(1, 10));
    const pieces = t.lines[0].pieces;
    receiveTransfer(db, keeper1, t.id, { [it.id]: pieces - 2 }, "قطعتان تالفتان في الطريق", at(1, 14));
  });
  run("a closed stock count with a difference", () => {
    const s = createStocktake(db, keeper2, wh2, at(6, 9), "بهارات");
    const lines = s.lines.map((l, i) => (i === 0 ? { ...l, counted_qty: Math.max(0, l.system_qty - 6), reason: "كيسان مثقوبان وقطع مفقودة" } : { ...l, counted_qty: l.system_qty }));
    saveStocktake(db, keeper2, s.id, lines, at(6, 11));
    closeStocktake(db, manager, s.id, at(6, 13));
  });
  run("an open stock count, half counted", () => {
    const s = createStocktake(db, keeper1, wh1, ago(50), "مشروبات");
    const lines = s.lines.map((l, i) => (i < 2 ? { ...l, counted_qty: l.system_qty - (i === 1 ? 4 : 0), ...(i === 1 ? { reason: "كارتون مفتوح" } : {}) } : l));
    saveStocktake(db, keeper1, s.id, lines, ago(30));
  });
  run("supply orders: part arrived, all arrived, cancelled", () => {
    const so1 = createSupplyOrder(db, accountant, { warehouse_id: wh1, supplier: "شركة دجلة للأغذية", supplier_phone: "07709998811", lines: [{ item_id: 8, unit: "carton", qty: 30, price: 19_000 }, { item_id: 9, unit: "carton", qty: 20, price: 52_000 }] }, at(5, 9));
    createReceipt(db, keeper1, { warehouse_id: wh1, supplier: "شركة دجلة للأغذية", supply_order_id: so1.id, lines: [{ item_id: 8, unit: "carton", qty: 20, expiry_date: dayOf(addDays(now, 500)), purchase_price: 800 }] }, at(3, 11));
    const so2 = createSupplyOrder(db, accountant, { warehouse_id: wh2, supplier: "مطاحن الفرات", lines: [{ item_id: 4, unit: "carton", qty: 25, price: 13_500 }] }, at(9, 9));
    createReceipt(db, keeper2, { warehouse_id: wh2, supplier: "مطاحن الفرات", supply_order_id: so2.id, lines: [{ item_id: 4, unit: "carton", qty: 25, expiry_date: dayOf(addDays(now, 240)), purchase_price: 680 }] }, at(7, 12));
    const so3 = createSupplyOrder(db, accountant, { warehouse_id: wh1, supplier: "مصنع العصائر الوطني", lines: [{ item_id: 21, unit: "carton", qty: 40, price: 12_500 }] }, at(4, 10));
    cancelSupplyOrder(db, accountant, so3.id, "المورد رفع السعر، طلبنا من مورد آخر", at(4, 15));
  });

  // ---- Orders: every state ----
  const shops = db.customers.filter((c) => c.active && !c.pending && !c.walk_in);
  const line = (whId: number, n: number, unit: Unit = "carton", qty = 2) =>
    inStock(whId, 300)
      .slice(n, n + 2)
      .map((it) => ({ item_id: it.id, unit: soldUnits(it).includes(unit) ? unit : soldUnits(it)[0], qty }));
  run("an order from the office (the accountant), with a discount", () => {
    const o = createOrder(db, accountant, { client_ref: cref(), customer_id: shops[5].id, warehouse_id: wh1, lines: line(wh1, 3) }, ago(140), "office");
    setOrderDiscount(db, manager, o.id, 3, ago(130));
  });
  run("an order the shop owner changed", () => {
    const o = createOrder(db, shopOwner, { client_ref: cref(), customer_id: 1, warehouse_id: wh1, lines: line(wh1, 6, "carton", 1) }, ago(100));
    updateOrder(db, shopOwner, o.id, { lines: o.lines.map((l, i) => ({ item_id: l.item_id, unit: l.unit, qty: l.qty + (i === 0 ? 2 : 0) })), note: "زدت كارتونين من فضلكم" }, ago(80));
  });
  run("an order that ran out of time (expired)", () => {
    createOrder(db, user(5), { client_ref: cref(), customer_id: shops.find((c) => c.rep_id === 5)!.id, warehouse_id: wh1, lines: line(wh1, 8, "carton", 1) }, at(3, 10));
  });
  run("an order written offline, part waiting for the goods", () => {
    const out = db.items.find((it) => it.active && sellableQty(db, it.id, wh1, now) === 0);
    const have = inStock(wh1, 100)[10];
    if (!out || !have) throw new Error("no sold-out item");
    createOrder(db, user(4), { client_ref: cref(), customer_id: shops.find((c) => c.rep_id === 4)!.id, warehouse_id: wh1, lines: [{ item_id: have.id, unit: soldUnits(have)[0], qty: 2 }, { item_id: out.id, unit: soldUnits(out)[0], qty: 3 }], offline: true, recorded_at: ago(120).toISOString() }, ago(40));
  });
  run("an order prepared from two warehouses (the other keeper's part waits)", () => {
    const a = inStock(wh1, 200)[12];
    const b = inStock(wh2, 200).find((x) => x.id !== a.id)!;
    const o = createOrder(db, user(6), { client_ref: cref(), customer_id: shops.find((c) => c.rep_id === 6)!.id, warehouse_id: wh1, lines: [{ item_id: a.id, unit: "carton", qty: 2 }, { item_id: b.id, unit: "carton", qty: 2 }] }, ago(240));
    accept(o);
    prepareOrder(db, keeper1, o.id, { [a.id]: wh1, [b.id]: wh2 }, ago(200));
  });
  run("a big order split across two vehicles", () => {
    const [a, b] = inStock(wh1, 400).slice(0, 2);
    const o = createOrder(db, user(4), { client_ref: cref(), customer_id: shops.find((c) => c.rep_id === 4 && c.tier_id === 1)!.id, warehouse_id: wh1, lines: [{ item_id: a.id, unit: "carton", qty: 6 }, { item_id: b.id, unit: "carton", qty: 6 }] }, ago(260));
    accept(o);
    prepareOrder(db, keeper1, o.id, { [a.id]: wh1, [b.id]: wh1 }, ago(220));
    planShipments(db, keeper1, o.id, [{ vehicle_id: 1, lines: [{ item_id: a.id, unit: "carton", qty: 6 }] }, { vehicle_id: 2, lines: [{ item_id: b.id, unit: "carton", qty: 6 }] }], ago(210));
  });
  const outNow = () => db.orders.filter((o) => o.delivery?.status === "out" && !o.delivery.problem && !o.delivery.locked);
  run("a delivery done today, with the photo of the packages", () => {
    const o = outNow()[0];
    const rep = user(o.delivery!.rep?.id ?? o.rep_id);
    const r = deliverOrder(db, rep, o.id, { pin: o.delivery!.pin!, photo: DOOR_PHOTO }, ago(35));
    if (!r.ok) throw new Error("pin");
  });
  run("a delivery locked after wrong PINs", () => {
    const o = outNow()[0];
    const rep = user(o.delivery!.rep?.id ?? o.rep_id);
    for (let i = 0; i < 5; i++) deliverOrder(db, rep, o.id, { pin: "0000" === o.delivery!.pin ? "1111" : "0000", photo: DOOR_PHOTO }, ago(25 - i));
  });
  run("a delivery the rep couldn't make (the shop was closed)", () => {
    const o = outNow()[0];
    const rep = user(o.delivery!.rep?.id ?? o.rep_id);
    reportDeliveryProblem(db, rep, { order_ids: [o.id], reason: "shop_closed", note: "المحل مغلق، اتصلت مرتين ولا رد" }, ago(15));
  });
  run("the delivery reps' phones on the map", () => {
    db.rep_locations ??= {};
    const spots: [number, number, number][] = [
      [4, 32.6012, 44.0362],
      [6, 32.6155, 44.0281],
      [11, 32.5931, 44.0475],
    ];
    for (const [id, lat, lng] of spots) db.rep_locations[id] = { rep_id: id, lat, lng, at: ago(1).toISOString() };
  });

  // ---- Money ----
  run("a credit note on an open invoice", () => {
    const inv = db.invoices.find((i) => i.total - i.paid > 100_000 && i.customer_id !== 0);
    if (!inv) throw new Error("no open invoice");
    creditInvoice(db, accountant, inv.id, 50_000, "تعويض عن تأخر التوصيل", at(2, 12));
  });
  run("a return of a paid invoice, refunded to the shop", () => {
    const inv = db.invoices.find((i) => i.paid >= i.total && i.total > 150_000 && customerBalance(db, i.customer_id) === 0 && !db.returns.some((r) => r.invoice_id === i.id));
    if (!inv) throw new Error("no paid invoice of a shop with no debt");
    const l = inv.lines[0];
    const r = createReturn(db, accountant, { client_ref: cref(), invoice_id: inv.id, lines: [{ item_id: l.item_id, unit: l.unit, qty: 1, condition: "good" }], note: "طلب المحل إرجاعها" }, at(2, 10));
    const credit = -customerBalance(db, inv.customer_id);
    if (credit > 0) refundCustomer(db, accountant, inv.customer_id, { amount: credit, method: "cash", reason: `ردّ قيمة المرتجع ${r.number}` }, at(2, 13));
  });
  run("a debt paid with ZainCash", () => {
    const amount = Math.min(150_000, customerBalance(db, 1));
    const p = startOnline(db, shopOwner, { customer_id: 1, amount, provider: "zaincash", key: cref(), return_url: "/statement" }, ago(180));
    settleZainCash(db, p.payment_id, "success", "9647812345601", ago(178));
  });
  run("expenses: one waiting for the manager, one refused", () => {
    expensesOf(db);
    createExpense(db, accountant, { date: dayOf(now), category: "صيانة السيارات", amount: 1_850_000, method: "cash", paid_to: "ورشة الحاج كاظم", note: "تبديل إطارات إيسوزو 4 طن", vehicle_id: 3 }, ago(70));
    const e = createExpense(db, accountant, { date: dayOf(addDays(now, -1)), category: "ضيافة", amount: 1_200_000, method: "cash", paid_to: "مطعم الضيافة", note: "غداء المندوبين" }, at(1, 16));
    decideExpense(db, manager, e.id, false, "مبلغ كبير للضيافة، قسّمه على الأشهر", at(1, 18));
  });
  run("the shop owner's saved lists", () => {
    db.shop_lists = [
      { id: 1, customer_id: 1, name: "طلب الأسبوع", lines: [{ item_id: 1, unit: "carton", qty: 3 }, { item_id: 3, unit: "carton", qty: 4 }, { item_id: 5, unit: "carton", qty: 2 }], updated_at: at(4, 18).toISOString() },
      { id: 2, customer_id: 1, name: "مشروبات الصيف", lines: [{ item_id: 20, unit: "carton", qty: 10 }, { item_id: 22, unit: "carton", qty: 6 }], updated_at: at(9, 12).toISOString() },
    ];
    db.seq.shop_list = 2;
  });
  run("an old price (the price history)", () => {
    db.price_changes ??= [];
    const it = db.items.find((x) => x.id === 5)!;
    for (const p of it.prices) db.price_changes.push({ item_id: 5, tier_id: p.tier_id, carton_price: p.carton_price - 1500, piece_price: p.piece_price - 250, until: at(12, 8).toISOString() });
  });
  return { done, skipped };
}
