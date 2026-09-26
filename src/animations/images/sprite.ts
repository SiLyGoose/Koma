import { mix, type Rgb } from './raster.js';

/*
 * The pixel-art toolkit the raid bosses are drawn with (dragon-image.ts, reaper-image.ts). A boss
 * is built from simple shapes (ellipses, polygons, thick curves) filled into a small grid of named
 * "parts"; paintParts then shades each part from its own edges (light from the top left) and
 * outlines it, and blowUp scales every grid cell up to a whole block so the picture stays crisp.
 */

export type Pt = readonly [number, number];

/** Light, middle and dark shade of a part. */
export type Shades = readonly [Rgb, Rgb, Rgb];

export const mapShades = (shades: Shades, f: (c: Rgb) => Rgb): Shades => [f(shades[0]), f(shades[1]), f(shades[2])];

/** A fixed pseudo-random number from 0 to 1 for (x, y), so scattered details land in the same places every time. */
export function hash(x: number, y: number, seed: number): number {
  let h = (x * 374761393 + y * 668265263 + seed * 2147483647) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177) >>> 0;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/** Whether (x, y) is inside the polygon (even-odd rule). */
export function inside(points: readonly Pt[], x: number, y: number): boolean {
  let hit = false;
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    const [xi, yi] = points[i] as Pt;
    const [xj, yj] = points[j] as Pt;
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) hit = !hit;
  }
  return hit;
}

/** A `width` x `height` grid of parts, listed back to front: a later part in `parts` is drawn over an earlier one. */
export class SpriteGrid<P extends string> {
  readonly cells: Int8Array;
  private readonly ids: Record<P, number>;

  constructor(
    readonly parts: readonly P[],
    readonly width: number,
    readonly height: number,
  ) {
    this.cells = new Int8Array(width * height).fill(-1);
    this.ids = Object.fromEntries(parts.map((part, i) => [part, i])) as Record<P, number>;
  }

  /** Where `part` is in the back-to-front order. */
  idOf(part: P): number {
    return this.ids[part];
  }

  /** The part at (x, y), or null for empty (or off the grid). */
  partAt(x: number, y: number): P | null {
    if (x < 0 || y < 0 || x >= this.width || y >= this.height) return null;
    const id = this.cells[y * this.width + x] as number;
    return id < 0 ? null : (this.parts[id] as P);
  }

  /** Sets the cell, if `only` (when given) allows what is already there. */
  set(x: number, y: number, part: P, only?: readonly P[]): void {
    if (x < 0 || y < 0 || x >= this.width || y >= this.height) return;
    if (only && !only.some((p) => this.ids[p] === this.cells[y * this.width + x])) return;
    this.cells[y * this.width + x] = this.ids[part];
  }

  /** Empties the cell. */
  clear(x: number, y: number): void {
    if (x < 0 || y < 0 || x >= this.width || y >= this.height) return;
    this.cells[y * this.width + x] = -1;
  }

  ellipse(cx: number, cy: number, rx: number, ry: number, part: P, only?: readonly P[]): void {
    for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++) {
      for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
        const dx = (x + 0.5 - cx) / rx;
        const dy = (y + 0.5 - cy) / ry;
        if (dx * dx + dy * dy <= 1) this.set(x, y, part, only);
      }
    }
  }

  polygon(points: readonly Pt[], part: P, only?: readonly P[]): void {
    const ys = points.map((p) => p[1]);
    for (let y = Math.floor(Math.min(...ys)); y <= Math.ceil(Math.max(...ys)); y++) {
      for (let x = 0; x < this.width; x++) {
        if (inside(points, x + 0.5, y + 0.5)) this.set(x, y, part, only);
      }
    }
  }

  /** A thick line along a quadratic curve, `r0` thick at the start and `r1` at the end. */
  limb(from: Pt, via: Pt, to: Pt, r0: number, r1: number, part: P): void {
    const steps = 40;
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const u = 1 - t;
      const x = u * u * from[0] + 2 * u * t * via[0] + t * t * to[0];
      const y = u * u * from[1] + 2 * u * t * via[1] + t * t * to[1];
      const r = r0 + (r1 - r0) * t;
      this.ellipse(x, y, r, r, part);
    }
  }

  line(from: Pt, to: Pt, part: P, only?: readonly P[]): void {
    const steps = Math.ceil(Math.max(Math.abs(to[0] - from[0]), Math.abs(to[1] - from[1]))) * 2;
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      this.set(Math.floor(from[0] + (to[0] - from[0]) * t), Math.floor(from[1] + (to[1] - from[1]) * t), part, only);
    }
  }
}

/** How paintParts colours a grid. */
export interface PartStyle<P extends string> {
  shades: Record<P, Shades>;
  outline: Rgb;
  /** Parts in the same group get no outline between them. Parts not listed are their own group. */
  group: Partial<Record<P, string>>;
  /** Small details that are neither outlined nor shaded: painted in one colour. */
  flat: ReadonlySet<P>;
  /** The colour of a flat part (its middle shade unless this says otherwise). */
  flatColor?: (part: P) => Rgb | undefined;
}

/**
 * Paints every part of the grid over `pixels`: an outline round the outside, a darker line where a
 * part passes behind a part of another group, and each part shaded from its edges (lit from the
 * top left, in shadow at the bottom right). Empty cells away from the outline are left as they are.
 */
export function paintParts<P extends string>(pixels: Rgb[], grid: SpriteGrid<P>, style: PartStyle<P>): void {
  const { width: W, height: H } = grid;
  const partAt = (x: number, y: number): P | null => grid.partAt(x, y);
  const groupOf = (part: P): string => style.group[part] ?? part;
  const flat = (p: P | null): boolean => p !== null && style.flat.has(p);

  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const part = partAt(x, y);
      if (part === null) {
        const touches = [partAt(x - 1, y), partAt(x + 1, y), partAt(x, y - 1), partAt(x, y + 1)].some((p) => p !== null && !flat(p));
        if (touches) pixels[y * W + x] = style.outline;
        continue;
      }
      const [light, mid, dark] = style.shades[part];
      if (flat(part)) {
        pixels[y * W + x] = style.flatColor?.(part) ?? mid;
        continue;
      }
      const behind = [partAt(x - 1, y), partAt(x + 1, y), partAt(x, y - 1), partAt(x, y + 1)].some(
        (p) => p !== null && !flat(p) && grid.idOf(p) > grid.idOf(part) && groupOf(p) !== groupOf(part),
      );
      if (behind) {
        pixels[y * W + x] = mix(dark, style.outline, 0.6);
        continue;
      }
      const same = (dx: number, dy: number): boolean => {
        const p = partAt(x + dx, y + dy);
        return p !== null && groupOf(p) === groupOf(part);
      };
      if (!same(0, -1) || !same(-1, -1)) pixels[y * W + x] = light;
      else if (!same(0, 2) || !same(2, 1) || !same(1, 2)) pixels[y * W + x] = dark;
      else pixels[y * W + x] = mid;
    }
  }
}

/** Scales every sprite pixel of a `width` x `height` picture up to a `scale` x `scale` block, as RGBA. */
export function blowUp(pixels: readonly Rgb[], width: number, height: number, scale: number): Uint8Array {
  const outWidth = width * scale;
  const out = new Uint8Array(outWidth * height * scale * 4);
  for (let y = 0; y < height * scale; y++) {
    for (let x = 0; x < outWidth; x++) {
      const [r, g, b] = pixels[Math.floor(y / scale) * width + Math.floor(x / scale)] as Rgb;
      const at = (y * outWidth + x) * 4;
      out[at] = Math.round(r);
      out[at + 1] = Math.round(g);
      out[at + 2] = Math.round(b);
      out[at + 3] = 255;
    }
  }
  return out;
}
