// A Code 128 barcode (set B: letters, digits and signs) as an SVG picture, for the shipment label: any barcode
// reader (and the app's own scanner) reads the shipment code from it, like the QR next to it.

// The bar widths of each value (bar, space, bar, space, bar, space), in modules. 103–105 are the start codes.
const PATTERNS = [
  "212222", "222122", "222221", "121223", "121322", "131222", "122213", "122312", "132212", "221213",
  "221312", "231212", "112232", "122132", "122231", "113222", "123122", "123221", "223211", "221132",
  "221231", "213212", "223112", "312131", "311222", "321122", "321221", "312212", "322112", "322211",
  "212123", "212321", "232121", "111323", "131123", "131321", "112313", "132113", "132311", "211313",
  "231113", "231311", "112133", "112331", "132131", "113123", "113321", "133121", "313121", "211331",
  "231131", "213113", "213311", "213131", "311123", "311321", "331121", "312113", "312311", "332111",
  "314111", "221411", "431111", "111224", "111422", "121124", "121421", "141122", "141221", "112214",
  "112412", "122114", "122411", "142112", "142211", "241211", "221114", "413111", "241112", "134111",
  "111242", "121142", "121241", "114212", "124112", "124211", "411212", "421112", "421211", "212141",
  "214121", "412121", "111143", "111341", "131141", "114113", "114311", "411113", "411311", "113141",
  "114131", "311141", "411131", "211412", "211214", "211232",
];
const STOP = "2331112";
const START_B = 104;

/** The bars and spaces (widths in modules, bar first) of `text` in Code 128 set B, with its check value. */
export function code128(text: string): number[] {
  const values = [...text].map((ch) => {
    const v = ch.charCodeAt(0) - 32;
    if (v < 0 || v > 94) throw new Error(`Code 128 B can't hold "${ch}"`);
    return v;
  });
  const check = (START_B + values.reduce((s, v, i) => s + v * (i + 1), 0)) % 103;
  return [START_B, ...values, check].flatMap((v) => [...PATTERNS[v]].map(Number)).concat([...STOP].map(Number));
}

/** The barcode as an SVG (black bars on white, a quiet zone of 10 modules each side). */
export function code128Svg(text: string, { module = 2, height = 60, stretch = false }: { module?: number; height?: number; stretch?: boolean } = {}) {
  const widths = code128(text);
  const quiet = 10;
  let x = quiet;
  const bars: string[] = [];
  widths.forEach((w, i) => {
    if (i % 2 === 0) bars.push(`<rect x="${x * module}" y="0" width="${w * module}" height="${height}"/>`);
    x += w;
  });
  const total = (x + quiet) * module;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${total} ${height}" width="${total}" height="${height}"${stretch ? ' preserveAspectRatio="none"' : ""} shape-rendering="crispEdges"><rect width="100%" height="100%" fill="#fff"/><g fill="#000">${bars.join("")}</g></svg>`;
}
