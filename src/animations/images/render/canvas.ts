import { inside, type Pt } from './sprite.js';
import { GLYPHS, GLYPH_HEIGHT, textWidth } from './pixel-font.js';
import type { Rgb } from './raster.js';

/*
 * A plain pixel buffer with a few shapes, for the pictures drawn in whole color values (plinko, the mine).
 */

/** A pixel buffer that shapes can be painted on (usually drawn at a few times the picture size, then shrunk to smooth the edges). */
export class Canvas {
  readonly rgba: Uint8Array;
  constructor(readonly width: number, readonly height: number) {
    this.rgba = new Uint8Array(width * height * 4);
  }

  private put(x: number, y: number, color: Rgb): void {
    const at = (y * this.width + x) * 4;
    this.rgba[at] = color[0];
    this.rgba[at + 1] = color[1];
    this.rgba[at + 2] = color[2];
    this.rgba[at + 3] = 255;
  }

  fill(color: Rgb): void {
    for (let y = 0; y < this.height; y++) for (let x = 0; x < this.width; x++) this.put(x, y, color);
  }

  rect(x0: number, y0: number, x1: number, y1: number, color: Rgb): void {
    for (let y = Math.max(0, Math.floor(y0)); y < Math.min(this.height, Math.ceil(y1)); y++) {
      for (let x = Math.max(0, Math.floor(x0)); x < Math.min(this.width, Math.ceil(x1)); x++) this.put(x, y, color);
    }
  }

  circle(cx: number, cy: number, radius: number, color: Rgb): void {
    for (let y = Math.max(0, Math.floor(cy - radius)); y <= Math.min(this.height - 1, Math.ceil(cy + radius)); y++) {
      for (let x = Math.max(0, Math.floor(cx - radius)); x <= Math.min(this.width - 1, Math.ceil(cx + radius)); x++) {
        if (Math.hypot(x + 0.5 - cx, y + 0.5 - cy) <= radius) this.put(x, y, color);
      }
    }
  }

  /** A filled polygon (its corners in order). */
  polygon(points: readonly Pt[], color: Rgb): void {
    const xs = points.map((p) => p[0]);
    const ys = points.map((p) => p[1]);
    for (let y = Math.max(0, Math.floor(Math.min(...ys))); y <= Math.min(this.height - 1, Math.ceil(Math.max(...ys))); y++) {
      for (let x = Math.max(0, Math.floor(Math.min(...xs))); x <= Math.min(this.width - 1, Math.ceil(Math.max(...xs))); x++) {
        if (inside(points, x + 0.5, y + 0.5)) this.put(x, y, color);
      }
    }
  }

  /** Text centered on (cx, cy), each font dot being `scale` pixels square. */
  text(text: string, cx: number, cy: number, scale: number, color: Rgb): void {
    let x = Math.round(cx - (textWidth(text) * scale) / 2);
    const top = Math.round(cy - (GLYPH_HEIGHT * scale) / 2);
    for (const ch of text) {
      const glyph = GLYPHS[ch];
      if (!glyph) continue;
      for (let row = 0; row < GLYPH_HEIGHT; row++) {
        const line = glyph[row] as string;
        for (let col = 0; col < line.length; col++) {
          if (line[col] === '#') this.rect(x + col * scale, top + row * scale, x + (col + 1) * scale, top + (row + 1) * scale, color);
        }
      }
      x += ((glyph[0] as string).length + 1) * scale;
    }
  }
}
