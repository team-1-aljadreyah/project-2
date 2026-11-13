// Each item's own units. An item has two levels: the big pack (كارتون، شوال، صندوق…) and the single
// (قطعة، كيس، علبة، قنينة…), `pieces_per_carton` singles in a pack. The manager names both and says which
// are sold: both, the pack only, or the single only (rice in 5 kg bags: «كيس» only, or «شوال» of 10 bags
// and the bag). Inside the system the two levels stay "carton" and "piece" (prices, stock in pieces,
// FEFO, reports), so only the names and the choices offered change.
import type { Item, ItemUnits, Unit } from "./api/types";

/** The usual names, offered in the item form (any other name can be typed). */
export const PACK_NAMES = ["كارتون", "شوال", "كيس", "صندوق", "ربطة", "سلة", "باكيت", "درزن"];
export const PIECE_NAMES = ["قطعة", "كيس", "علبة", "قنينة", "باكيت", "حبة", "كيلو"];

const EN: Record<string, [string, string]> = {
  كارتون: ["carton", "ctn"],
  شوال: ["sack", "sack"],
  كيس: ["bag", "bag"],
  صندوق: ["box", "box"],
  ربطة: ["bundle", "bdl"],
  سلة: ["basket", "bskt"],
  باكيت: ["pack", "pk"],
  درزن: ["dozen", "dz"],
  قطعة: ["piece", "pc"],
  علبة: ["can", "can"],
  قنينة: ["bottle", "btl"],
  حبة: ["piece", "pc"],
  كيلو: ["kg", "kg"],
};

type Named = Pick<Item, "pieces_per_carton"> & Partial<ItemUnits>;

/** The name of this item's unit ("كيس", "شوال"…); `short` for tight places in English ("ctn"). */
export function unitName(it: Named | undefined, unit: Unit, lang: "ar" | "en" = "ar", short = false) {
  const ar = unit === "carton" ? it?.pack_name || "كارتون" : it?.piece_name || "قطعة";
  if (lang === "ar") return ar;
  const en = EN[ar];
  return en ? en[short ? 1 : 0] : ar;
}

/** The units this item is sold by (a pack of one is never offered: it is the single). */
export function soldUnits(it: Named | undefined): Unit[] {
  if (!it) return ["carton", "piece"];
  if (it.pieces_per_carton <= 1) return ["piece"];
  if (it.sells === "pack") return ["carton"];
  if (it.sells === "piece") return ["piece"];
  return ["carton", "piece"];
}

/** The unit a new line starts with: the pack when it is sold, else the single. */
export const firstUnit = (it: Named | undefined): Unit => soldUnits(it)[0];

/** pieces → "3 شوال + 4 كيس" in this item's names. */
export function qtyIn(it: Named | undefined, pieces: number, lang: "ar" | "en" = "ar") {
  const per = it?.pieces_per_carton ?? 1;
  const nf = new Intl.NumberFormat("en-US");
  const neg = pieces < 0;
  const p = Math.abs(pieces);
  const pc = unitName(it, "piece", lang, true);
  // Sold by the single only (rice by the bag): counted in singles, "84 كيس", not in packs.
  if (per <= 1 || it?.sells === "piece") return `${neg ? "-" : ""}${nf.format(p)} ${pc}`;
  const c = Math.floor(p / per);
  const r = p % per;
  const parts: string[] = [];
  if (c) parts.push(`${nf.format(c)} ${unitName(it, "carton", lang, true)}`);
  if (r || !c) parts.push(`${nf.format(r)} ${pc}`);
  return (neg ? "-" : "") + parts.join(" + ");
}

/** The quantity offer's IQD off each unit for this line (its unit, enough of it, not ended), else 0. */
export function offerOff(it: { offer?: { unit: Unit; min: number; off: number; until?: string } } | undefined, unit: Unit, qty: number, day: string) {
  const o = it?.offer;
  return o && o.unit === unit && qty >= o.min && (!o.until || o.until >= day) ? o.off : 0;
}

/** A unit's price after the quantity offer (never below zero). */
export const afterOffer = (base: number, it: Parameters<typeof offerOff>[0], unit: Unit, qty: number, day: string) => Math.max(0, base - offerOff(it, unit, qty, day));

/** Is there an offer running today (to show its badge)? */
export const offerOn = (it: { offer?: { until?: string } } | undefined, day: string) => !!it?.offer && (!it.offer.until || it.offer.until >= day);
