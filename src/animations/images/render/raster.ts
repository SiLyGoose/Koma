export type Rgb = readonly [number, number, number];

export const luminance = ([r, g, b]: Rgb): number => 0.299 * r + 0.587 * g + 0.114 * b;
export const mix = (a: Rgb, b: Rgb, t: number): Rgb => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

/**
 * Shrinks a picture drawn at `size` x `size` down to `pixels` x `pixels` by averaging each block
 * of `factor` x `factor` samples (weighted by opacity), which smooths the edges. `rgba` has 4 bytes per sample.
 */
export function shrink(rgba: Uint8Array, size: number, pixels: number, factor: number): Uint8Array {
  const out = new Uint8Array(pixels * pixels * 4);
  const samples = factor * factor;
  for (let y = 0; y < pixels; y++) {
    for (let x = 0; x < pixels; x++) {
      let r = 0;
      let g = 0;
      let b = 0;
      let a = 0;
      for (let sy = 0; sy < factor; sy++) {
        for (let sx = 0; sx < factor; sx++) {
          const at = ((y * factor + sy) * size + x * factor + sx) * 4;
          const alpha = rgba[at + 3] as number;
          r += (rgba[at] as number) * alpha;
          g += (rgba[at + 1] as number) * alpha;
          b += (rgba[at + 2] as number) * alpha;
          a += alpha;
        }
      }
      const to = (y * pixels + x) * 4;
      if (a > 0) {
        out[to] = Math.round(r / a);
        out[to + 1] = Math.round(g / a);
        out[to + 2] = Math.round(b / a);
        out[to + 3] = Math.round(a / samples);
      }
    }
  }
  return out;
}

/**
 * Like `shrink`, for a picture that isn't square: `width` x `height` samples become
 * `width / factor` x `height / factor` pixels (both must divide evenly by `factor`).
 */
export function shrinkRect(rgba: Uint8Array, width: number, height: number, factor: number): Uint8Array {
  if (width % factor !== 0 || height % factor !== 0) throw new Error('The picture size must divide evenly by the shrink factor');
  const outWidth = width / factor;
  const outHeight = height / factor;
  const out = new Uint8Array(outWidth * outHeight * 4);
  const samples = factor * factor;
  for (let y = 0; y < outHeight; y++) {
    for (let x = 0; x < outWidth; x++) {
      let r = 0;
      let g = 0;
      let b = 0;
      let a = 0;
      for (let sy = 0; sy < factor; sy++) {
        for (let sx = 0; sx < factor; sx++) {
          const at = ((y * factor + sy) * width + x * factor + sx) * 4;
          const alpha = rgba[at + 3] as number;
          r += (rgba[at] as number) * alpha;
          g += (rgba[at + 1] as number) * alpha;
          b += (rgba[at + 2] as number) * alpha;
          a += alpha;
        }
      }
      const to = (y * outWidth + x) * 4;
      if (a > 0) {
        out[to] = Math.round(r / a);
        out[to + 1] = Math.round(g / a);
        out[to + 2] = Math.round(b / a);
        out[to + 3] = Math.round(a / samples);
      }
    }
  }
  return out;
}
