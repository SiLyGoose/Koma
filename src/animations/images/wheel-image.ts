import { drawText } from './pixel-font.js';
import { ACCENT_RED, LINE, textOn } from './palette.js';
import { encodePng } from './png.js';
import { mix, shrink, type Rgb } from './raster.js';

/*
 * Draws the prize wheel as a PNG: equal slices, one label each, a pointer at the top, and the
 * wheel turned so the pointer lands on the slice that won. No image library: it works out each
 * pixel itself (drawn at twice the size and shrunk, which smooths the edges).
 */

/** Where the wheel stopped: which slice the pointer is on, and how far into it (0 to 1). */
export interface WheelLanding {
  index: number;
  offset: number;
}

const SUPERSAMPLE = 2;
const TAU = Math.PI * 2;

const RIM: Rgb = [242, 243, 245];
const HUB: Rgb = [43, 45, 49];
const POINTER = ACCENT_RED;

/** Slice colors by multiplier: low is red, below 1 is orange, exactly 1 is blue, above 1 is green, 2 and up is gold. */
export function sliceColor(multiplier: number): Rgb {
  if (multiplier >= 2) return [245, 197, 66];
  if (multiplier > 1) return [62, 166, 107];
  if (multiplier === 1) return [95, 115, 215];
  if (multiplier >= 0.5) return [235, 140, 60];
  return [220, 70, 75];
}

/** "1.5x", "0.1x", "2x". */
function label(multiplier: number): string {
  return `${Number(multiplier.toFixed(2))}x`;
}

/**
 * How far the wheel is turned (in radians, clockwise from straight up) when the pointer sits
 * `landing.offset` of the way into slice `landing.index`.
 */
export function landingTurn(count: number, landing: WheelLanding): number {
  const offset = Math.min(1, Math.max(0, landing.offset));
  return (((-(landing.index + offset) * (TAU / count)) % TAU) + TAU) % TAU;
}

/** Full turns the wheel makes before it stops, counted from its first picture. */
const SPIN_EXTRA_TURNS = 1.25;

/**
 * How far the wheel is turned in each picture of a spin: `steps + 1` turns, the first being
 * where it starts and the last exactly where it lands. Every step turns it less than the one
 * before, so it slows to a stop.
 */
export function spinTurns(count: number, landing: WheelLanding, steps: number, extraTurns = SPIN_EXTRA_TURNS): number[] {
  if (!Number.isInteger(steps) || steps < 1) throw new Error('A spin needs at least one step');
  const final = landingTurn(count, landing);
  const turns: number[] = [];
  for (let k = 0; k <= steps; k++) {
    const left = 1 - k / steps;
    turns.push(final - left * left * extraTurns * TAU);
  }
  return turns;
}

/**
 * Draws the wheel where it stopped: turned so the pointer sits `landing.offset` of the way into
 * slice `landing.index`. The slice that won is bright and the rest are dimmed. Returns the PNG file.
 */
export function renderWheel(slices: readonly number[], landing: WheelLanding, pixels = 512): Buffer {
  const count = slices.length;
  if (count < 2) throw new Error('A wheel needs at least two slices');
  if (!Number.isInteger(landing.index) || landing.index < 0 || landing.index >= count) throw new Error('The landing slice is not on the wheel');
  return draw(slices, landingTurn(count, landing), landing.index, pixels);
}

/** Draws the wheel while it is still turning: turned by `turn` radians, every slice bright. */
export function renderSpinningWheel(slices: readonly number[], turn: number, pixels = 512): Buffer {
  if (slices.length < 2) throw new Error('A wheel needs at least two slices');
  return draw(slices, turn, null, pixels);
}

/** The drawing itself. `winner` is the slice to keep bright (the rest are dimmed), or null to keep all bright. */
function draw(slices: readonly number[], turn: number, winner: number | null, pixels: number): Buffer {
  const count = slices.length;
  const size = pixels * SUPERSAMPLE;
  const c = size / 2;
  const sliceAngle = TAU / count;

  const outer = size * 0.42;
  const rimWidth = size * 0.028;
  const hub = size * 0.07;
  const lineHalf = size * 0.0035;
  const labelRadius = outer * 0.66;
  const scale = Math.max(1, Math.round(size / 140));

  // Labels first, as a mask of the pixels they cover.
  const mask = new Uint8Array(size * size);
  for (let i = 0; i < count; i++) {
    const mid = turn + (i + 0.5) * sliceAngle;
    drawText(mask, size, label(slices[i] as number), c + labelRadius * Math.sin(mid), c - labelRadius * Math.cos(mid), scale);
  }

  const rgba = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = x + 0.5 - c;
      const dy = y + 0.5 - c;
      const r = Math.hypot(dx, dy);
      let color: Rgb | null = null;

      // The pointer: a triangle above the rim, pointing down at the wheel.
      const tipY = c - outer + size * 0.035;
      const baseY = c - outer - size * 0.065;
      if (y + 0.5 >= baseY && y + 0.5 <= tipY) {
        const half = size * 0.038 * ((tipY - (y + 0.5)) / (tipY - baseY));
        if (Math.abs(dx) <= half) color = POINTER;
      }

      if (color === null && r <= outer) {
        if (r >= outer - rimWidth) {
          color = RIM;
        } else if (r <= hub) {
          color = r >= hub - size * 0.008 ? RIM : HUB;
        } else {
          const angle = (((Math.atan2(dx, -dy) - turn) % TAU) + TAU) % TAU;
          const index = Math.min(count - 1, Math.floor(angle / sliceAngle));
          const within = angle - index * sliceAngle;
          const edge = Math.min(within, sliceAngle - within) * r; // distance to the nearest slice edge
          let base = sliceColor(slices[index] as number);
          if (winner !== null && index !== winner) base = mix(base, LINE, 0.55);
          color = edge < lineHalf ? LINE : base;
          if (mask[y * size + x]) color = textOn(base);
        }
      }

      if (color !== null) {
        const at = (y * size + x) * 4;
        rgba[at] = color[0];
        rgba[at + 1] = color[1];
        rgba[at + 2] = color[2];
        rgba[at + 3] = 255;
      }
    }
  }

  const out = shrink(rgba, size, pixels, SUPERSAMPLE);
  return encodePng(pixels, pixels, out);
}
