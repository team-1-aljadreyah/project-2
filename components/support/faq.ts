// The shop owner's frequently asked questions, answered from how the platform really works.
export const FAQ: { q: [string, string]; a: [string, string] }[] = [
  {
    q: ["كيف أطلب بضاعة؟", "How do I order?"],
    a: [
      "من صفحة «اطلب الآن» اختر المواد وأضفها إلى السلة، ثم اضغط «أرسل الطلب». يصل الطلب إلى الشركة وإلى مندوبك الخاص بك، وتُحجز الكمية لك.",
      "From “Order now”, add items to the bag, then press “Send the order”. It reaches the company and your delivery rep, and the stock is held for you.",
    ],
  },
  {
    q: ["لماذا تختلف أسعاري عن محل آخر؟", "Why are my prices different from another shop?"],
    a: [
      "لكل محل نوع سعر (مثل جملة أو جملة كبيرة) تحدده الشركة حسب حجم تعاملك. الأسعار التي تراها هي أسعارك أنت، والفاتورة تحفظ سعر وقت البيع.",
      "Each shop has a price tier (like wholesale or big wholesale) the company sets by how much you buy. The prices you see are yours, and an invoice keeps the price of the day it was made.",
    ],
  },
  {
    q: ["ما هو سقف الدين؟", "What is the debt limit?"],
    a: [
      "هو أعلى مبلغ يمكن أن يبقى عليك. إذا تجاوزه طلب جديد، يُرسل الطلب ولكن ينتظر موافقة المدير قبل التجهيز. ترى دينك وسقفك في «كشف حسابي».",
      "It is the most you can owe. An order that passes it is sent, but waits for the manager's approval before it is prepared. You see your debt and limit in “My statement”.",
    ],
  },
  {
    q: ["كيف أسدد ديني؟", "How do I pay my debt?"],
    a: [
      "نقداً أو بتحويل لمندوبك، أو أونلاين ببطاقة Qi من «كشف حسابي». كل تسديد يُخصم من أقدم فاتورة أولاً.",
      "In cash or by transfer to your delivery rep, or online with Qi Card from “My statement”. Every payment goes to your oldest invoice first.",
    ],
  },
  {
    q: ["ما هو رمز الاستلام؟", "What is the delivery PIN?"],
    a: [
      "رقم من 4 أرقام يظهر لك وحدك عندما يكون طلبك في الطريق. أعطه لمندوب التوصيل فقط بعد أن تستلم البضاعة وتتأكد أنها سليمة وكاملة. بدونه لا يُسجَّل التسليم.",
      "A 4-digit number only you can see while your order is on its way. Give it to the delivery rep only after you get the goods complete and in good shape. Without it the delivery isn't recorded.",
    ],
  },
  {
    q: ["وصلتني بضاعة تالفة، ماذا أفعل؟", "I got damaged goods. What do I do?"],
    a: [
      "لا تعطِ رمز الاستلام إذا كانت الشحنة غير سليمة، وتحدث معنا من «تحدث مع الدعم». وإذا اكتشفت التلف لاحقاً، يسجّل مندوب التوصيل مرتجعاً على الفاتورة ويُخصم من دينك.",
      "Don't give the PIN if the shipment isn't in good shape, and talk to us from “Talk to support”. If you find the damage later, your delivery rep records a return on the invoice and it is taken off your debt.",
    ],
  },
  {
    q: ["متى يصل طلبي؟", "When does my order arrive?"],
    a: [
      "بعد أن يجهزه المخزن ويثبته، يمسح مندوب التوصيل ملصق الشحنة ويخرج بها. يصلك إشعار «طلبك في الطريق إليك» مع رمز الاستلام.",
      "After the warehouse prepares and confirms it, your delivery rep scans the shipment label and leaves with it. You get a notification “Your order is on its way” with the PIN.",
    ],
  },
  {
    q: ["هل يمكن تعديل طلب بعد إرساله؟", "Can I change an order after sending it?"],
    a: [
      "قبل التجهيز تحدث معنا من الدعم وسنساعدك. بعد تثبيت الفاتورة لا يتغير الطلب، لكن يمكنك إرسال طلب جديد.",
      "Before it is prepared, talk to support and we will help. Once the invoice is made the order doesn't change, but you can send a new one.",
    ],
  },
];
