/*
 * A small 2D painter for the crate picture: flat shapes with gradients, soft (blurred) light, and
 * "screen" blending for glow, drawn into float buffers. It is what an SVG would do for us, written out
 * so the bot needs no image library (see png.ts). Colours are 0 to 1 here, not 0 to 255.
 */

export type Color = readonly [number, number, number];
/** A colour with opacity: red, green, blue, alpha, each 0 to 1 (not premultiplied). */
export type Rgba = readonly [number, number, number, number];
/** What a shape is filled with: the colour at a point of the picture. */
export type Paint = (x: number, y: number) => Rgba;
export type Point = readonly [number, number];
export type Blend = 'normal' | 'screen';

/** A colour from "#rrggbb". */
export function hex(code: string): Color {
  const n = parseInt(code.slice(1), 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

export const mixColor = (a: Color, b: Color, t: number): Color => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

// ---------------------------------------------------------------------------
// Paints
// ---------------------------------------------------------------------------

/** A colour stop: where along the gradient (0 to 1), the colour, and its opacity (1 if left out). */
export type Stop = readonly [offset: number, color: Color, alpha?: number];

export function atStops(stops: readonly Stop[], t: number): Rgba {
  const first = stops[0] as Stop;
  if (t <= first[0]) return [first[1][0], first[1][1], first[1][2], first[2] ?? 1];
  for (let i = 1; i < stops.length; i++) {
    const b = stops[i] as Stop;
    if (t <= b[0]) {
      const a = stops[i - 1] as Stop;
      const k = b[0] === a[0] ? 1 : (t - a[0]) / (b[0] - a[0]);
      const aa = a[2] ?? 1;
      const ba = b[2] ?? 1;
      return [a[1][0] + (b[1][0] - a[1][0]) * k, a[1][1] + (b[1][1] - a[1][1]) * k, a[1][2] + (b[1][2] - a[1][2]) * k, aa + (ba - aa) * k];
    }
  }
  const last = stops[stops.length - 1] as Stop;
  return [last[1][0], last[1][1], last[1][2], last[2] ?? 1];
}

export const solid =
  (color: Color, alpha = 1): Paint =>
  () => [color[0], color[1], color[2], alpha];

/** A gradient along the line from (x1, y1) to (x2, y2). */
export function linear(x1: number, y1: number, x2: number, y2: number, stops: readonly Stop[]): Paint {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len2 = dx * dx + dy * dy || 1;
  return (x, y) => atStops(stops, Math.min(1, Math.max(0, ((x - x1) * dx + (y - y1) * dy) / len2)));
}

/** A gradient spreading out from (cx, cy), reaching its last stop at rx sideways and ry up or down. */
export function radial(cx: number, cy: number, rx: number, ry: number, stops: readonly Stop[]): Paint {
  return (x, y) => atStops(stops, Math.min(1, Math.hypot((x - cx) / rx, (y - cy) / ry)));
}

// ---------------------------------------------------------------------------
// Shapes as point lists
// ---------------------------------------------------------------------------

export function ellipsePoints(cx: number, cy: number, rx: number, ry: number): Point[] {
  const n = Math.max(24, Math.min(180, Math.ceil((2 * Math.PI * Math.max(rx, ry)) / 3)));
  const out: Point[] = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    out.push([cx + Math.cos(a) * rx, cy + Math.sin(a) * ry]);
  }
  return out;
}

export function roundRectPoints(x: number, y: number, w: number, h: number, r: number): Point[] {
  const rad = Math.min(r, w / 2, h / 2);
  if (rad <= 0) return [[x, y], [x + w, y], [x + w, y + h], [x, y + h]];
  const out: Point[] = [];
  const corners: [number, number, number][] = [
    [x + w - rad, y + rad, -Math.PI / 2],
    [x + w - rad, y + h - rad, 0],
    [x + rad, y + h - rad, Math.PI / 2],
    [x + rad, y + rad, Math.PI],
  ];
  for (const [cx, cy, start] of corners) {
    for (let i = 0; i <= 5; i++) {
      const a = start + (i / 5) * (Math.PI / 2);
      out.push([cx + Math.cos(a) * rad, cy + Math.sin(a) * rad]);
    }
  }
  return out;
}

/** The quadrilateral for a line of the given width, between two points. */
function lineQuad(x1: number, y1: number, x2: number, y2: number, width: number): Point[] {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len = Math.hypot(dx, dy) || 1;
  const nx = (-dy / len) * (width / 2);
  const ny = (dx / len) * (width / 2);
  return [
    [x1 + nx, y1 + ny],
    [x2 + nx, y2 + ny],
    [x2 - nx, y2 - ny],
    [x1 - nx, y1 - ny],
  ];
}

/** A cubic Bezier curve as `steps` line segments (the start point is included). */
export function cubic(p0: Point, c1: Point, c2: Point, p1: Point, steps = 24): Point[] {
  const out: Point[] = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const u = 1 - t;
    out.push([
      u * u * u * p0[0] + 3 * u * u * t * c1[0] + 3 * u * t * t * c2[0] + t * t * t * p1[0],
      u * u * u * p0[1] + 3 * u * u * t * c1[1] + 3 * u * t * t * c2[1] + t * t * t * p1[1],
    ]);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Layers
// ---------------------------------------------------------------------------

/** How wide a box blur has to be, three times over, to come out like a Gaussian blur of `sigma`. */
function boxRadii(sigma: number): number[] {
  const ideal = Math.sqrt((12 * sigma * sigma) / 3 + 1);
  let lower = Math.floor(ideal);
  if (lower % 2 === 0) lower--;
  const upper = lower + 2;
  const m = Math.round((12 * sigma * sigma - 3 * lower * lower - 12 * lower - 9) / (-4 * lower - 4));
  return [0, 1, 2].map((i) => ((i < m ? lower : upper) - 1) / 2);
}

/**
 * A picture-sized buffer of premultiplied RGBA. It remembers which part has been drawn on, so
 * blurring, blending and clearing only touch that part.
 */
export class Layer {
  readonly data: Float32Array;
  private minX = Infinity;
  private minY = Infinity;
  private maxX = -Infinity;
  private maxY = -Infinity;
  private readonly cover: Float32Array;
  private readonly crossings: number[] = [];

  constructor(
    readonly width: number,
    readonly height: number,
  ) {
    this.data = new Float32Array(width * height * 4);
    this.cover = new Float32Array(width + 1);
  }

  private touch(x0: number, y0: number, x1: number, y1: number): void {
    this.minX = Math.min(this.minX, Math.max(0, Math.floor(x0)));
    this.minY = Math.min(this.minY, Math.max(0, Math.floor(y0)));
    this.maxX = Math.max(this.maxX, Math.min(this.width - 1, Math.ceil(x1)));
    this.maxY = Math.max(this.maxY, Math.min(this.height - 1, Math.ceil(y1)));
  }

  /** Paints the whole layer (an opaque background, say). */
  fillAll(paint: Paint, opacity = 1): void {
    this.fillPolygon([[0, 0], [this.width, 0], [this.width, this.height], [0, this.height]], paint, opacity);
  }

  /** Paints a polygon with smooth edges, over what is already there. */
  fillPolygon(points: readonly Point[], paint: Paint, opacity = 1): void {
    const n = points.length;
    if (n < 3 || opacity <= 0) return;
    let top = Infinity;
    let bottom = -Infinity;
    let left = Infinity;
    let right = -Infinity;
    for (const p of points) {
      top = Math.min(top, p[1]);
      bottom = Math.max(bottom, p[1]);
      left = Math.min(left, p[0]);
      right = Math.max(right, p[0]);
    }
    const y0 = Math.max(0, Math.floor(top));
    const y1 = Math.min(this.height - 1, Math.ceil(bottom) - 1);
    if (y1 < y0 || right <= 0 || left >= this.width) return;
    this.touch(left, top, right, bottom);
    const sub = 4;
    const cover = this.cover;
    const xs = this.crossings;
    const data = this.data;
    const w = this.width;
    for (let y = y0; y <= y1; y++) {
      let rowMin = w;
      let rowMax = -1;
      for (let s = 0; s < sub; s++) {
        const yy = y + (s + 0.5) / sub;
        xs.length = 0;
        for (let i = 0; i < n; i++) {
          const a = points[i] as Point;
          const b = points[(i + 1) % n] as Point;
          if ((a[1] <= yy && b[1] > yy) || (b[1] <= yy && a[1] > yy)) xs.push(a[0] + ((yy - a[1]) * (b[0] - a[0])) / (b[1] - a[1]));
        }
        xs.sort((p, q) => p - q);
        for (let j = 0; j + 1 < xs.length; j += 2) {
          const xa = Math.max(xs[j] as number, 0);
          const xb = Math.min(xs[j + 1] as number, w);
          if (xb <= xa) continue;
          const ia = Math.floor(xa);
          const ib = Math.min(w - 1, Math.floor(xb));
          if (ia === ib) {
            cover[ia] = (cover[ia] as number) + (xb - xa) / sub;
          } else {
            cover[ia] = (cover[ia] as number) + (ia + 1 - xa) / sub;
            for (let i = ia + 1; i < ib; i++) cover[i] = (cover[i] as number) + 1 / sub;
            cover[ib] = (cover[ib] as number) + (xb - ib) / sub;
          }
          if (ia < rowMin) rowMin = ia;
          if (ib > rowMax) rowMax = ib;
        }
      }
      for (let x = rowMin; x <= rowMax; x++) {
        const c = cover[x] as number;
        if (c <= 0) continue;
        cover[x] = 0;
        const p = paint(x + 0.5, y + 0.5);
        const sa = Math.min(1, c) * p[3] * opacity;
        if (sa <= 0) continue;
        const at = (y * w + x) * 4;
        const keep = 1 - sa;
        data[at] = p[0] * sa + (data[at] as number) * keep;
        data[at + 1] = p[1] * sa + (data[at + 1] as number) * keep;
        data[at + 2] = p[2] * sa + (data[at + 2] as number) * keep;
        data[at + 3] = sa + (data[at + 3] as number) * keep;
      }
    }
  }

  fillEllipse(cx: number, cy: number, rx: number, ry: number, paint: Paint, opacity = 1): void {
    this.fillPolygon(ellipsePoints(cx, cy, rx, ry), paint, opacity);
  }

  fillRoundRect(x: number, y: number, w: number, h: number, r: number, paint: Paint, opacity = 1): void {
    this.fillPolygon(roundRectPoints(x, y, w, h, r), paint, opacity);
  }

  /** A line of the given width; `round` puts a round cap on each end. */
  strokeLine(x1: number, y1: number, x2: number, y2: number, width: number, paint: Paint, opacity = 1, round = false): void {
    this.fillPolygon(lineQuad(x1, y1, x2, y2, width), paint, opacity);
    if (round) {
      this.fillEllipse(x1, y1, width / 2, width / 2, paint, opacity);
      this.fillEllipse(x2, y2, width / 2, width / 2, paint, opacity);
    }
  }

  /** A joined line through the points. */
  strokePath(points: readonly Point[], width: number, paint: Paint, opacity = 1, round = false): void {
    for (let i = 0; i + 1 < points.length; i++) {
      const a = points[i] as Point;
      const b = points[i + 1] as Point;
      this.strokeLine(a[0], a[1], b[0], b[1], width, paint, opacity, round);
    }
  }

  /** Blurs what has been drawn, like a Gaussian blur of `sigma` picture pixels. */
  blur(sigma: number): void {
    if (sigma < 0.4 || this.maxX < this.minX) return;
    const radii = boxRadii(sigma);
    const pad = Math.ceil(radii[0]! + radii[1]! + radii[2]!) + 1;
    const x0 = Math.max(0, this.minX - pad);
    const x1 = Math.min(this.width - 1, this.maxX + pad);
    const y0 = Math.max(0, this.minY - pad);
    const y1 = Math.min(this.height - 1, this.maxY + pad);
    const w = this.width;
    const data = this.data;
    const line = new Float32Array(Math.max(this.width, this.height));
    for (const r of radii) {
      const size = 2 * r + 1;
      for (let c = 0; c < 4; c++) {
        // Along each row.
        for (let y = y0; y <= y1; y++) {
          const base = y * w * 4 + c;
          let sum = 0;
          for (let x = x0; x <= Math.min(x1, x0 + r - 1); x++) sum += data[base + x * 4] as number;
          for (let x = x0; x <= x1; x++) {
            const add = x + r;
            const drop = x - r - 1;
            if (add <= x1) sum += data[base + add * 4] as number;
            if (drop >= x0) sum -= data[base + drop * 4] as number;
            line[x] = sum / size;
          }
          for (let x = x0; x <= x1; x++) data[base + x * 4] = line[x] as number;
        }
        // Down each column.
        for (let x = x0; x <= x1; x++) {
          const base = x * 4 + c;
          let sum = 0;
          for (let y = y0; y <= Math.min(y1, y0 + r - 1); y++) sum += data[base + y * w * 4] as number;
          for (let y = y0; y <= y1; y++) {
            const add = y + r;
            const drop = y - r - 1;
            if (add <= y1) sum += data[base + add * w * 4] as number;
            if (drop >= y0) sum -= data[base + drop * w * 4] as number;
            line[y] = sum / size;
          }
          for (let y = y0; y <= y1; y++) data[base + y * w * 4] = line[y] as number;
        }
      }
    }
    this.minX = x0;
    this.maxX = x1;
    this.minY = y0;
    this.maxY = y1;
  }

  /** Lays this layer over `dst` (an opaque picture) with the given blend and opacity. */
  compositeOnto(dst: Layer, blend: Blend, opacity = 1): void {
    if (this.maxX < this.minX) return;
    const w = this.width;
    const s = this.data;
    const d = dst.data;
    for (let y = this.minY; y <= this.maxY; y++) {
      for (let x = this.minX; x <= this.maxX; x++) {
        const at = (y * w + x) * 4;
        const a = (s[at + 3] as number) * opacity;
        if (a <= 0.0001) continue;
        const sr = (s[at] as number) * opacity;
        const sg = (s[at + 1] as number) * opacity;
        const sb = (s[at + 2] as number) * opacity;
        const dr = d[at] as number;
        const dg = d[at + 1] as number;
        const db = d[at + 2] as number;
        if (blend === 'screen') {
          d[at] = dr + sr - dr * sr;
          d[at + 1] = dg + sg - dg * sg;
          d[at + 2] = db + sb - db * sb;
        } else {
          d[at] = sr + dr * (1 - a);
          d[at + 1] = sg + dg * (1 - a);
          d[at + 2] = sb + db * (1 - a);
        }
      }
    }
    dst.touch(this.minX, this.minY, this.maxX, this.maxY);
  }

  /** Wipes the part that has been drawn on. */
  clear(): void {
    if (this.maxX >= this.minX) {
      for (let y = this.minY; y <= this.maxY; y++) this.data.fill(0, (y * this.width + this.minX) * 4, (y * this.width + this.maxX + 1) * 4);
    }
    this.minX = Infinity;
    this.minY = Infinity;
    this.maxX = -Infinity;
    this.maxY = -Infinity;
  }
}

/**
 * Draws with `draw` into `scratch`, blurs that by `blur`, lays it over `canvas` and wipes `scratch`
 * ready for next time. It is a group of shapes that is blurred and blended as one, like an SVG group with a filter.
 */
export function group(canvas: Layer, scratch: Layer, options: { blur?: number; blend?: Blend; opacity?: number }, draw: (layer: Layer) => void): void {
  draw(scratch);
  if (options.blur) scratch.blur(options.blur);
  scratch.compositeOnto(canvas, options.blend ?? 'normal', options.opacity ?? 1);
  scratch.clear();
}

/** The finished picture as 8-bit RGBA, with a whisper of noise so dark gradients don't show bands. */
export function toBytes(canvas: Layer): Uint8Array {
  const out = new Uint8Array(canvas.width * canvas.height * 4);
  const d = canvas.data;
  for (let y = 0; y < canvas.height; y++) {
    for (let x = 0; x < canvas.width; x++) {
      const at = (y * canvas.width + x) * 4;
      // Two hashes added make a triangular noise of about one level either way.
      let h = Math.imul(x, 374761393) + Math.imul(y, 668265263);
      h = Math.imul(h ^ (h >>> 13), 1274126177);
      const n1 = ((h ^ (h >>> 16)) >>> 0) / 4294967295;
      h = Math.imul(h ^ 0x9e3779b9, 2246822519);
      const n2 = ((h ^ (h >>> 15)) >>> 0) / 4294967295;
      const dither = n1 + n2 - 1;
      for (let c = 0; c < 3; c++) {
        out[at + c] = Math.max(0, Math.min(255, Math.round((d[at + c] as number) * 255 + dither)));
      }
      out[at + 3] = 255;
    }
  }
  return out;
}
