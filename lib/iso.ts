// Isometric ("3D game") drawing helpers for the warehouse map.
// A point in the world is (x, y, z): x goes down-right, y goes down-left, z goes up.
// We turn it into a screen point using the 30° isometric angle.

export const COS = 0.8660254; // cos 30°
export const SIN = 0.5; // sin 30°

export type P3 = readonly [number, number, number];

export interface BoxFaces {
  top: string;
  left: string;
  right: string;
}

/**
 * One drawing "camera". s = how many pixels one world unit is.
 * It also remembers the smallest and biggest screen points it produced,
 * so the drawing can be framed exactly (the SVG viewBox).
 */
export class Iso {
  minX = Infinity;
  minY = Infinity;
  maxX = -Infinity;
  maxY = -Infinity;

  constructor(public s: number) {}

  /** World point → screen point (rounded to 0.1px so every computer gets the same numbers). */
  p([x, y, z]: P3): [number, number] {
    const X = Math.round((x - y) * COS * this.s * 10) / 10;
    const Y = Math.round(((x + y) * SIN - z) * this.s * 10) / 10;
    if (X < this.minX) this.minX = X;
    if (X > this.maxX) this.maxX = X;
    if (Y < this.minY) this.minY = Y;
    if (Y > this.maxY) this.maxY = Y;
    return [X, Y];
  }

  /** Several world points → the "points" text of an SVG polygon. */
  poly(points: P3[]) {
    return points.map((pt) => this.p(pt).join(",")).join(" ");
  }

  /**
   * A box standing at (x, y, z), w long on x, d deep on y, h high.
   * Only three faces can be seen from this angle: the top, the left (front-left) and the right (front-right).
   */
  box(x: number, y: number, z: number, w: number, d: number, h: number): BoxFaces {
    return {
      top: this.poly([
        [x, y, z + h],
        [x + w, y, z + h],
        [x + w, y + d, z + h],
        [x, y + d, z + h],
      ]),
      right: this.poly([
        [x + w, y, z],
        [x + w, y + d, z],
        [x + w, y + d, z + h],
        [x + w, y, z + h],
      ]),
      left: this.poly([
        [x, y + d, z],
        [x + w, y + d, z],
        [x + w, y + d, z + h],
        [x, y + d, z + h],
      ]),
    };
  }

  /** A flat rectangle on the ground (roads, parking). */
  flat(x: number, y: number, w: number, d: number, z = 0) {
    return this.poly([
      [x, y, z],
      [x + w, y, z],
      [x + w, y + d, z],
      [x, y + d, z],
    ]);
  }

  /** A band drawn on a front-left wall (the wall at depth y): windows, doors, signs. */
  leftBand(x1: number, x2: number, y: number, z1: number, z2: number) {
    return this.poly([
      [x1, y, z1],
      [x2, y, z1],
      [x2, y, z2],
      [x1, y, z2],
    ]);
  }

  /** A band drawn on a front-right wall (the wall at x). */
  rightBand(x: number, y1: number, y2: number, z1: number, z2: number) {
    return this.poly([
      [x, y1, z1],
      [x, y2, z1],
      [x, y2, z2],
      [x, y1, z2],
    ]);
  }
}
