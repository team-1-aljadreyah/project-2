// Demo data for the prototype: Al-Nahrain's two warehouses, staff, shops and food items,
// plus about 45 days of history made with the real rules (so reports and statements look real).
import type { Db, DbItem, DbUser } from "./db";
import { DB_VERSION } from "./db";
import {
  addDays,
  addPayment,
  approveOrder,
  closeMonth,
  confirmOrder,
  createOrder,
  createPayment,
  createReceipt,
  createReturn,
  createTransfer,
  customerBalance,
  dayOf,
  registerShop,
  sellableQty,
  sweep,
} from "./rules";

export const DEMO_PASSWORD = "123456";

/** Same random numbers every time, so the demo looks the same on every computer. */
function rng(seed: number) {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296;
    return s / 4294967296;
  };
}

const round250 = (n: number) => Math.max(250, Math.round(n / 250) * 250);

// name, English name, category, pieces per carton, carton price (normal wholesale), purchase price per piece, shelf life in days, commission %
const ITEMS: [string, string, string, number, number, number, number, number][] = [
  ["رز بسمتي كيس 5 كغم", "Basmati rice 5 kg", "حبوب ورز", 4, 46000, 10500, 540, 2],
  ["رز عنبر كيس 5 كغم", "Anbar rice 5 kg", "حبوب ورز", 4, 58000, 13500, 540, 2],
  ["سكر كيس 2 كغم", "Sugar 2 kg", "سكر وطحين", 10, 21000, 1900, 720, 1.5],
  ["طحين صفر كيس 1 كغم", "Flour 1 kg", "سكر وطحين", 20, 16000, 700, 270, 1.5],
  ["زيت دوار الشمس 1.8 لتر", "Sunflower oil 1.8 L", "زيوت وسمن", 6, 27000, 4100, 450, 2],
  ["زيت ذرة 1.5 لتر", "Corn oil 1.5 L", "زيوت وسمن", 6, 30000, 4600, 450, 2],
  ["سمن نباتي 1 كغم", "Vegetable ghee 1 kg", "زيوت وسمن", 12, 42000, 3150, 365, 2],
  ["معجون طماطم 400 غم", "Tomato paste 400 g", "معلبات", 24, 24000, 900, 600, 2.5],
  ["تونة 160 غم", "Tuna 160 g", "معلبات", 48, 62000, 1200, 900, 2.5],
  ["فول مدمس 400 غم", "Fava beans 400 g", "معلبات", 24, 15000, 560, 720, 2.5],
  ["حمص معلب 400 غم", "Chickpeas 400 g", "معلبات", 24, 16000, 600, 720, 2.5],
  ["شاي أسود 500 غم", "Black tea 500 g", "مشروبات", 20, 70000, 3200, 720, 2],
  ["قهوة سريعة 200 غم", "Instant coffee 200 g", "مشروبات", 12, 66000, 5000, 540, 2],
  ["معكرونة 500 غم", "Pasta 500 g", "حبوب ورز", 20, 15000, 670, 540, 2],
  ["شعرية 400 غم", "Vermicelli 400 g", "حبوب ورز", 20, 12000, 520, 540, 2],
  ["عدس أحمر 1 كغم", "Red lentils 1 kg", "حبوب ورز", 10, 19000, 1700, 450, 2],
  ["حليب مجفف 900 غم", "Milk powder 900 g", "ألبان", 12, 96000, 7500, 365, 1.5],
  ["جبن مثلثات 8 قطع", "Cheese triangles 8 pcs", "ألبان", 24, 36000, 1350, 120, 3],
  ["لبن 1 لتر", "Laban 1 L", "ألبان", 12, 12000, 900, 25, 3],
  ["ماء 500 مل", "Water 500 ml", "مشروبات", 24, 4500, 160, 365, 1],
  ["عصير برتقال 1 لتر", "Orange juice 1 L", "مشروبات", 12, 15000, 1100, 150, 3],
  ["مشروب غازي 330 مل", "Soft drink 330 ml", "مشروبات", 24, 12000, 440, 240, 2.5],
  ["بسكويت 12 حبة", "Biscuits 12 pcs", "حلويات", 24, 9000, 330, 270, 3],
  ["شيبس 50 غم", "Chips 50 g", "حلويات", 30, 7500, 220, 180, 3],
  ["شوكولاتة 40 غم", "Chocolate 40 g", "حلويات", 24, 12000, 440, 300, 3],
  ["دبس تمر 1 كغم", "Date syrup 1 kg", "حلويات", 12, 30000, 2200, 540, 2],
  ["ملح 700 غم", "Salt 700 g", "بهارات", 24, 6000, 210, 1000, 1.5],
  ["بهارات مشكلة 100 غم", "Mixed spices 100 g", "بهارات", 24, 18000, 650, 540, 2.5],
];

// shop, owner, phone, area, tier, rep, debt limit
const CUSTOMERS: [string, string, string, string, number, number, number][] = [
  ["أسواق الكوثر", "علي الموسوي", "07812345601", "حي الحسين", 1, 4, 12_000_000],
  ["ماركت الزهراء", "أحمد جبار", "07812345602", "سيف سعد", 2, 4, 5_000_000],
  ["أسواق الهدى", "كريم عبد الحسن", "07812345603", "حي العباس", 2, 4, 4_000_000],
  ["بقالة أبو علي", "حسن مهدي", "07812345604", "الإسكان", 3, 4, 1_500_000],
  ["محلات النور", "سجاد كامل", "07812345605", "حي الغدير", 2, 5, 3_500_000],
  ["ماركت الفرات", "عمار ناجي", "07812345606", "باب بغداد", 1, 5, 10_000_000],
  ["أسواق السلام", "رسول هادي", "07812345607", "حي الأسرة", 2, 5, 4_500_000],
  ["ماركت الرضا", "ميثم عباس", "07812345608", "البلدية", 3, 5, 1_200_000],
  ["أسواق المصطفى", "حيدر صالح", "07812345609", "حي الموظفين", 2, 6, 5_000_000],
  ["محلات الأمانة", "جاسم محمد", "07812345610", "حي النقيب", 3, 6, 1_000_000],
  ["ماركت الجود", "مرتضى فلاح", "07812345611", "عون", 2, 6, 3_000_000],
  ["أسواق البركة", "صادق نوري", "07812345612", "حي الحسين", 1, 6, 8_000_000],
  ["بقالة الوفاء", "أمير ستار", "07812345613", "سيف سعد", 3, 4, 900_000],
  ["أسواق العميد", "نبيل حمزة", "07812345614", "حي العباس", 2, 5, 4_000_000],
];

export function makeSeed(now = new Date()): Db {
  const rand = rng(20261109);
  const pick = <T,>(arr: T[]) => arr[Math.floor(rand() * arr.length)];
  const int = (a: number, b: number) => a + Math.floor(rand() * (b - a + 1));

  const users: DbUser[] = [
    { id: 1, name: "حيدر الكعبي", phone: "07801000001", role: "manager", active: true, password: DEMO_PASSWORD },
    { id: 2, name: "كرار جاسم", phone: "07801000002", role: "warehouse", warehouse_id: 1, active: true, password: DEMO_PASSWORD },
    { id: 3, name: "مصطفى عبد الأمير", phone: "07801000003", role: "warehouse", warehouse_id: 2, active: true, password: DEMO_PASSWORD },
    { id: 4, name: "حسين علي", phone: "07801000004", role: "rep", active: true, password: DEMO_PASSWORD },
    { id: 5, name: "عباس فاضل", phone: "07801000005", role: "rep", active: true, password: DEMO_PASSWORD },
    { id: 6, name: "محمد رضا", phone: "07801000006", role: "rep", active: true, password: DEMO_PASSWORD },
    { id: 7, name: "زينب كاظم", phone: "07801000007", role: "accountant", active: true, password: DEMO_PASSWORD },
    { id: 8, name: "علي الموسوي", phone: "07812345601", role: "shop", customer_id: 1, active: true, password: DEMO_PASSWORD },
    { id: 9, name: "أحمد جبار", phone: "07812345602", role: "shop", customer_id: 2, active: true, password: DEMO_PASSWORD },
  ];

  const items: DbItem[] = ITEMS.map(([name, name_en, category, ppc, carton, , , commission], i) => {
    const big = round250(carton * 0.96);
    const small = round250(carton * 1.05);
    const piece = (c: number, extra: number) => round250((c / ppc) * extra);
    return {
      id: i + 1,
      name,
      name_en,
      category,
      barcode: `6260${String(1000000 + i * 7919).slice(-7)}`,
      pieces_per_carton: ppc,
      min_stock: ppc * (i % 5 === 0 ? 40 : 15),
      commission_percent: commission,
      prices: [
        { tier_id: 1, carton_price: big, piece_price: piece(big, 1.08) },
        { tier_id: 2, carton_price: carton, piece_price: piece(carton, 1.1) },
        { tier_id: 3, carton_price: small, piece_price: piece(small, 1.12) },
      ],
      active: true,
    };
  });

  const db: Db = {
    version: DB_VERSION,
    seq: { user: users.length, item: items.length, customer: CUSTOMERS.length },
    users,
    warehouses: [
      { id: 1, name: "المخزن الرئيسي - الصناعة", name_en: "Main warehouse - Al-Sinaa", capacity: 3500 },
      { id: 2, name: "مخزن الحر", name_en: "Al-Hur warehouse", capacity: 900 },
    ],
    tiers: [
      { id: 1, name: "جملة كبيرة", name_en: "Big wholesale" },
      { id: 2, name: "جملة", name_en: "Wholesale" },
      { id: 3, name: "محلات صغيرة", name_en: "Small shops" },
    ],
    items,
    batches: [],
    receipts: [],
    customers: CUSTOMERS.map(([name, owner_name, phone, area, tier_id, rep_id, debt_limit], i) => ({
      id: i + 1,
      name,
      owner_name,
      phone,
      area,
      address: `كربلاء - ${area}`,
      tier_id,
      rep_id,
      debt_limit,
      active: true,
    })),
    orders: [],
    invoices: [],
    payments: [],
    returns: [],
    transfers: [],
    stocktakes: [],
    damaged: [],
    audit: [],
    notifications: [],
    settings: { reservation_hours: 2, near_expiry_days: 30, slow_moving_days: 21, auto_confirm_rep_orders: false },
    closed_months: {},
    notified_batches: [],
    notified_low: [],
    online_payments: [],
    delivery_photos: {},
  };

  const manager = users[0];
  const keepers = [users[1], users[2]];
  const reps = users.filter((u) => u.role === "rep");
  const accountant = users[6];
  const at = (daysAgo: number, hour: number, minute = 0) => {
    const d = addDays(now, -daysAgo);
    d.setHours(hour, minute, 0, 0);
    return d;
  };
  let ref = 0;
  const cref = () => `seed-${++ref}`;

  // 1) Goods arrive in batches, each with its own expiry and purchase price.
  const receive = (daysAgo: number, warehouse: number, list: DbItem[], cartons: [number, number], priceUp = 1) => {
    const when = at(daysAgo, 8, 30);
    createReceipt(
      db,
      keepers[warehouse - 1],
      {
        warehouse_id: warehouse,
        supplier: pick(["شركة الرافدين للتوزيع", "مجموعة بغداد التجارية", "وكيل البصرة للأغذية", "شركة الأمل للاستيراد"]),
        lines: list.map((it) => {
          const meta = ITEMS[it.id - 1];
          const life = meta[6];
          return {
            item_id: it.id,
            unit: "carton" as const,
            qty: int(cartons[0], cartons[1]),
            expiry_date: dayOf(addDays(when, Math.round(life * (0.6 + rand() * 0.4)))),
            purchase_price: Math.round((meta[5] * priceUp) / 10) * 10,
          };
        }),
      },
      when,
    );
  };
  receive(48, 1, items, [70, 140]);
  receive(47, 2, items.filter((_, i) => i % 2 === 0), [20, 50]);
  receive(26, 1, items.filter((_, i) => i % 3 !== 1), [40, 90], 1.03);
  receive(25, 2, items.filter((_, i) => i % 3 === 0), [15, 40], 1.03);
  receive(9, 1, items.filter((_, i) => i % 4 === 0), [30, 60], 1.05);
  // Dairy and juice have a short life, so they come every few days.
  receive(3, 1, items.filter((it) => [18, 19, 21].includes(it.id)), [25, 45], 1.02);

  // 2) Some batches close to expiry or expired, to show the alerts.
  const laban = db.batches.find((b) => b.item_id === 19 && b.warehouse_id === 1);
  if (laban) laban.expiry_date = dayOf(addDays(now, -3));
  const cheese = db.batches.find((b) => b.item_id === 18 && b.warehouse_id === 1);
  if (cheese) cheese.expiry_date = dayOf(addDays(now, 12));
  const juice = db.batches.find((b) => b.item_id === 21 && b.warehouse_id === 2);
  if (juice) juice.expiry_date = dayOf(addDays(now, 21));
  const chips = db.batches.find((b) => b.item_id === 24 && b.warehouse_id === 2);
  if (chips) chips.expiry_date = dayOf(addDays(now, 6));

  // 3) A transfer between the warehouses.
  createTransfer(
    db,
    keepers[0],
    { client_ref: cref(), from_warehouse_id: 1, to_warehouse_id: 2, lines: [{ item_id: 3, unit: "carton", qty: 20 }, { item_id: 5, unit: "carton", qty: 12 }], note: "نقص في مخزن الحر" },
    at(30, 10),
  );

  // 4) 45 days of selling, collecting and a few returns.
  const slow = new Set([26, 27]);
  for (let d = 45; d >= 0; d--) {
    for (const rep of reps) {
      const mine = db.customers.filter((c) => c.rep_id === rep.id);
      const count = int(1, 3);
      for (let k = 0; k < count; k++) {
        const customer = pick(mine);
        const when = at(d, int(9, 15), int(0, 59));
        // Today: only what already happened (at least an hour ago).
        if (when.getTime() > now.getTime() - 3_600_000) continue;
        const lineCount = int(2, 6);
        const chosen = new Set<number>();
        const lines: { item_id: number; unit: "carton" | "piece"; qty: number }[] = [];
        for (let n = 0; n < lineCount; n++) {
          const it = pick(items);
          if (chosen.has(it.id) || (slow.has(it.id) && d < 30)) continue;
          chosen.add(it.id);
          const unit = rand() < 0.75 ? "carton" : "piece";
          const qty = unit === "carton" ? int(1, customer.tier_id === 1 ? 6 : 3) : int(4, it.pieces_per_carton - 1);
          const pieces = unit === "carton" ? qty * it.pieces_per_carton : qty;
          if (sellableQty(db, it.id, 1, when) < pieces) continue;
          lines.push({ item_id: it.id, unit, qty });
        }
        if (!lines.length) continue;
        const order = createOrder(db, rep, { client_ref: cref(), customer_id: customer.id, warehouse_id: 1, lines }, when);
        const confirmAt = new Date(Math.min(when.getTime() + int(20, 90) * 60_000, now.getTime() - 60_000));
        if (order.status === "needs_approval") {
          if (rand() < 0.6) {
            approveOrder(db, manager, order.id, confirmAt);
            confirmOrder(db, keepers[0], order.id, new Date(confirmAt.getTime() + 600_000));
          } else {
            order.status = "cancelled";
            order.cancel_reason = "تجاوز سقف الدين";
          }
        } else if (rand() < 0.95) {
          confirmOrder(db, rand() < 0.7 ? keepers[0] : accountant, order.id, confirmAt);
        } else {
          order.status = "cancelled";
          order.cancel_reason = "الزبون غيّر رأيه";
        }
      }
    }
    // Collecting money: customers pay part of what they owe.
    for (const c of db.customers) {
      if (rand() > 0.32) continue;
      const bal = customerBalance(db, c.id);
      if (bal <= 0) continue;
      const share = c.id === 4 || c.id === 10 ? 0.15 : 0.35 + rand() * 0.5;
      const amount = Math.min(bal, Math.max(25_000, Math.round((bal * share) / 5000) * 5000));
      const who = rand() < 0.7 ? (db.users.find((u) => u.id === c.rep_id) as DbUser) : accountant;
      const paidAt = at(d, int(12, 18), int(0, 59));
      if (paidAt.getTime() > now.getTime() - 1_800_000) continue;
      // The two shops that have a login sometimes pay online (Qi Card) by themselves.
      const shopUser = db.users.find((u) => u.role === "shop" && u.customer_id === c.id);
      if (shopUser && rand() < 0.5) {
        const pid = `qi_demo${String(db.online_payments.length + 1).padStart(4, "0")}${c.id}`;
        const p = addPayment(db, shopUser, { client_ref: `gateway:${pid}`, customer_id: c.id, amount, method: "online", note: "Qi Card" }, paidAt, { provider: "qi", payment_id: pid, card: "**** 0000" });
        db.online_payments.push({ payment_id: pid, customer_id: c.id, amount, status: "success", created_at: new Date(paidAt.getTime() - 120_000).toISOString(), by: { id: shopUser.id, name: shopUser.name, role: "shop" }, recorded_payment_id: p.id, key: pid, return_url: "/statement" });
        // Now and then a try that didn't go through first (wrong bank code, or the owner cancelled).
        if (rand() < 0.5) {
          db.online_payments.push({ payment_id: `${pid}x`, customer_id: c.id, amount, status: rand() < 0.5 ? "authentication_failed" : "canceled", created_at: new Date(paidAt.getTime() - 600_000).toISOString(), by: { id: shopUser.id, name: shopUser.name, role: "shop" }, key: `${pid}x`, return_url: "/statement" });
        }
        continue;
      }
      createPayment(db, who, { client_ref: cref(), customer_id: c.id, amount, method: rand() < 0.85 ? "cash" : "transfer" }, paidAt);
    }
    // A return now and then: damaged or wrong items.
    if (d % 6 === 0) {
      const inv = pick(db.invoices.filter((i) => i.date < at(d, 9).toISOString()));
      if (inv) {
        const line = inv.lines[0];
        const rep = db.users.find((u) => u.id === inv.rep_id) as DbUser;
        createReturn(
          db,
          rep,
          {
            client_ref: cref(),
            invoice_id: inv.id,
            lines: [{ item_id: line.item_id, unit: "piece", qty: Math.min(line.pieces, int(2, 6)), condition: rand() < 0.5 ? "damaged" : "good" }],
            note: rand() < 0.5 ? "تالف أثناء النقل" : "خطأ في الطلب",
          },
          at(d, 16),
        );
      }
    }
  }

  // 5) One payment entered by mistake and reversed (shows the "no delete" rule).
  const wrong = db.payments.find((p) => p.customer_id === 6 && p.amount >= 100_000);
  if (wrong) {
    const p = wrong;
    for (const a of p.allocations) {
      const inv = db.invoices.find((i) => i.id === a.invoice_id);
      if (inv) inv.paid -= a.amount;
    }
    const rid = (db.seq.payment = (db.seq.payment ?? 0) + 1);
    db.payments.push({
      ...p,
      id: rid,
      number: `PAY-${String(rid).padStart(6, "0")}`,
      client_ref: `reverse-${p.id}`,
      amount: -p.amount,
      date: new Date(new Date(p.date).getTime() + 3_600_000).toISOString(),
      received_by: { id: accountant.id, name: accountant.name, role: "accountant" },
      allocations: p.allocations.map((a) => ({ ...a, amount: -a.amount })),
      reversed: false,
      reversal_of: p.id,
      reason: "سُجّل مرتين خطأً",
    });
    p.reversed = true;
    p.reversed_by_id = rid;
  }

  // 6) Past months are closed for commission.
  const thisMonth = dayOf(now).slice(0, 7);
  const months = [...new Set(db.invoices.map((i) => dayOf(new Date(i.date)).slice(0, 7)))].filter((m) => m < thisMonth).sort();
  const firstOfMonth = new Date(now.getFullYear(), now.getMonth(), 1, 9, 0, 0);
  for (const m of months) closeMonth(db, manager, m, firstOfMonth < now ? firstOfMonth : now);

  // 7) Today: orders waiting, one over the debt limit, one from a shop owner.
  const t = (h: number, m: number) => new Date(now.getTime() - (h * 60 + m) * 60_000);
  // If the demo stock ran short, skip that order instead of breaking the demo.
  const safe = (fn: () => unknown) => {
    try {
      fn();
    } catch {}
  };
  safe(() => createOrder(db, reps[0], { client_ref: cref(), customer_id: 2, warehouse_id: 1, lines: [{ item_id: 1, unit: "carton", qty: 2 }, { item_id: 8, unit: "carton", qty: 1 }, { item_id: 12, unit: "piece", qty: 6 }] }, t(0, 40)));
  safe(() => createOrder(db, reps[1], { client_ref: cref(), customer_id: 7, warehouse_id: 1, lines: [{ item_id: 5, unit: "carton", qty: 3 }, { item_id: 3, unit: "carton", qty: 2 }] }, t(0, 25)));
  const big = db.customers.find((c) => c.id === 10);
  if (big) {
    const over = Math.max(0, big.debt_limit - customerBalance(db, big.id));
    const cartons = Math.max(2, Math.ceil(over / 60_000) + 2);
    safe(() => createOrder(db, reps[2], { client_ref: cref(), customer_id: 10, warehouse_id: 1, lines: [{ item_id: 9, unit: "carton", qty: Math.min(cartons, 8) }, { item_id: 16, unit: "carton", qty: 2 }] }, t(0, 15)));
  }
  const shopUser = users.find((u) => u.id === 8) as DbUser;
  safe(() => createOrder(db, shopUser, { client_ref: cref(), customer_id: 1, warehouse_id: 1, lines: [{ item_id: 2, unit: "carton", qty: 4 }, { item_id: 15, unit: "carton", qty: 1 }, { item_id: 7, unit: "carton", qty: 2 }] }, t(0, 10)));

  // 8) A shop signed up on the website an hour ago and waits for the manager to approve it.
  safe(() =>
    registerShop(
      db,
      { shop_name: "ماركت النخيل", owner_name: "علي جواد", phone: "07812345615", area: "حي الغدير", address: "قرب جامع الغدير", password: DEMO_PASSWORD },
      t(1, 5),
    ),
  );

  // Deliveries: orders confirmed before today were already delivered (before this feature: no photo).
  // Today's stay "ready" at the warehouse, and the oldest one of today is already out with its delivery rep.
  const todayStr = dayOf(now);
  const confirmed = db.orders.filter((o) => o.status === "confirmed" && o.delivery);
  for (const o of confirmed) {
    const inv = db.invoices.find((i) => i.id === o.invoice_id);
    if (!inv || dayOf(new Date(inv.date)) === todayStr) continue;
    const rep = db.users.find((u) => u.id === o.rep_id);
    const at = new Date(new Date(inv.date).getTime() + 3 * 3_600_000).toISOString();
    Object.assign(o.delivery!, { status: "delivered", out_at: inv.date, out_by: rep && { id: rep.id, name: rep.name }, delivered_at: at, delivered_by: rep && { id: rep.id, name: rep.name }, has_photo: false });
  }
  const firstToday = confirmed.find((o) => o.delivery!.status === "ready");
  if (firstToday) {
    const rep = db.users.find((u) => u.id === firstToday.rep_id);
    Object.assign(firstToday.delivery!, { status: "out", out_at: addDays(now, 0).toISOString(), out_by: rep && { id: rep.id, name: rep.name } });
  }

  // Make sure item 26 (date syrup) shows as slow-moving, and run the alerts once.
  sweep(db, now);
  db.notifications.forEach((n) => {
    if (n.created_at < addDays(now, -2).toISOString()) n.read = true;
  });
  db.audit.push({
    id: (db.seq.audit = (db.seq.audit ?? 0) + 1),
    at: now.toISOString(),
    user: { id: manager.id, name: manager.name, role: manager.role },
    action: "update",
    entity: "settings",
    entity_id: 0,
    summary: "تجهيز البيانات التجريبية",
    summary_en: "Demo data prepared",
  });
  return db;
}
