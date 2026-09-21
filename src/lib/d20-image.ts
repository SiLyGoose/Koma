import { randomInt } from 'node:crypto';
import { D20 } from '../constants.js';
import { d20Multiplier } from './d20.js';
import { drawText } from './pixel-font.js';
import { encodePng } from './png.js';
import { luminance, shrink, type Rgb } from './raster.js';
import { sliceColor } from './wheel-image.js';

/*
 * Draws the D20 as a PNG: the classic front view of the die (a hexagon of ten triangular faces)
 * with the number on the middle face. While it "tumbles" it is turned, squashed and lifted a
 * little, and shows a different number in each picture; the last picture is upright with the
 * real roll and a ring around it. No image library, like the wheel (see lib/png.ts).
 */

/** How the die is posed in one picture. */
export interface DiePose {
  /** The number on its face. */
  shown: number;
  /** How far it is turned, in radians. */
  turn: number;
  /** How high it hops above its resting place, as a fraction of its radius. */
  lift: number;
  /** How wide it is against its height: 1 is its normal shape, less looks like it is flipping. */
  squash: number;
}

const SUPERSAMPLE = 2;
const TAU = Math.PI * 2;

const LINE: Rgb = [30, 31, 34];
const DARK_TEXT: Rgb = [30, 31, 34];
const LIGHT_TEXT: Rgb = [255, 255, 255];

// The die's shape, in units of its radius (x right, y down). Six outer corners going clockwise
// from the top, and the corners of the middle triangle.
type Point = readonly [number, number];
const V: Point[] = Array.from({ length: 6 }, (_, k) => {
  const angle = -Math.PI / 2 + (k * TAU) / 6;
  return [Math.cos(angle), Math.sin(angle)] as Point;
});
const INNER = 0.62;
const T: Point[] = [-Math.PI / 2, Math.PI / 6, (5 * Math.PI) / 6].map((angle) => [INNER * Math.cos(angle), INNER * Math.sin(angle)] as Point);

/** The ten faces you can see, each with a brightness so the die looks solid. The middle one comes first. */
const FACES: { points: [Point, Point, Point]; light: number }[] = [
  { points: [T[0] as Point, T[1] as Point, T[2] as Point], light: 1 },
  { points: [T[0] as Point, T[1] as Point, V[1] as Point], light: 0.92 },
  { points: [T[0] as Point, T[2] as Point, V[5] as Point], light: 1.08 },
  { points: [T[1] as Point, T[2] as Point, V[3] as Point], light: 0.8 },
  { points: [T[0] as Point, V[5] as Point, V[0] as Point], light: 1.15 },
  { points: [T[0] as Point, V[0] as Point, V[1] as Point], light: 1.12 },
  { points: [T[1] as Point, V[1] as Point, V[2] as Point], light: 0.95 },
  { points: [T[1] as Point, V[2] as Point, V[3] as Point], light: 0.85 },
  { points: [T[2] as Point, V[3] as Point, V[4] as Point], light: 0.85 },
  { points: [T[2] as Point, V[4] as Point, V[5] as Point], light: 1 },
];

/** The color of the die showing `roll`: the wheel's colors for the same multiplier (red for a 1, gold for a 20). */
export function d20Color(roll: number): Rgb {
  return sliceColor(d20Multiplier(roll));
}

const shade = (color: Rgb, light: number): Rgb => [
  Math.min(255, color[0] * light),
  Math.min(255, color[1] * light),
  Math.min(255, color[2] * light),
];

/** Distance from (px, py) to the line through a and b. */
function lineDistance(px: number, py: number, a: Point, b: Point): number {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  return Math.abs((px - a[0]) * dy - (py - a[1]) * dx) / Math.hypot(dx, dy);
}

/** Which of the die's faces (0 to 9) the point is on, and how far it is from that face's nearest edge; or null off the die. */
function faceAt(x: number, y: number): { face: number; edge: number } | null {
  for (let i = 0; i < FACES.length; i++) {
    const [a, b, c] = (FACES[i] as (typeof FACES)[number]).points;
    const d1 = (x - b[0]) * (a[1] - b[1]) - (a[0] - b[0]) * (y - b[1]);
    const d2 = (x - c[0]) * (b[1] - c[1]) - (b[0] - c[0]) * (y - c[1]);
    const d3 = (x - a[0]) * (c[1] - a[1]) - (c[0] - a[0]) * (y - a[1]);
    const negative = d1 < 0 || d2 < 0 || d3 < 0;
    const positive = d1 > 0 || d2 > 0 || d3 > 0;
    if (negative && positive) continue;
    return { face: i, edge: Math.min(lineDistance(x, y, a, b), lineDistance(x, y, b, c), lineDistance(x, y, c, a)) };
  }
  return null;
}

/**
 * Draws the die in `pose`. `landed` draws the finished picture: a ring around the die. Returns
 * the PNG file.
 */
export function renderD20(pose: DiePose, landed: boolean, pixels = 400): Buffer {
  const size = pixels * SUPERSAMPLE;
  const radius = size * 0.4;
  const cx = size / 2;
  const cy = size / 2 - pose.lift * radius;
  const squash = Math.max(0.2, pose.squash);
  const cos = Math.cos(pose.turn);
  const sin = Math.sin(pose.turn);
  const color = d20Color(pose.shown);
  const lineHalf = 0.016;
  const ringInner = 1.1;
  const ringOuter = 1.16;

  // The number, upright on the middle face, as a mask of the pixels it covers.
  const mask = new Uint8Array(size * size);
  const scale = Math.max(1, Math.round(size * 0.0155));
  drawText(mask, size, String(pose.shown), cx, cy, scale);
  const textColor = luminance(color) > 150 ? DARK_TEXT : LIGHT_TEXT;

  const rgba = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = (x + 0.5 - cx) / squash;
      const dy = y + 0.5 - cy;
      // Undo the turn, then measure in units of the die's radius.
      const lx = (dx * cos + dy * sin) / radius;
      const ly = (-dx * sin + dy * cos) / radius;

      let pixel: Rgb | null = null;
      const found = Math.hypot(lx, ly) <= 1.01 ? faceAt(lx, ly) : null;
      if (found) {
        const face = FACES[found.face] as (typeof FACES)[number];
        pixel = found.edge < lineHalf ? LINE : shade(color, face.light);
      } else if (landed) {
        // Around the finished die: a ring in the die's own color.
        const r = Math.hypot((x + 0.5 - cx) / radius, (y + 0.5 - cy) / radius);
        if (r >= ringInner && r <= ringOuter) pixel = color;
      }
      if (mask[y * size + x]) pixel = textColor;

      if (pixel !== null) {
        const at = (y * size + x) * 4;
        rgba[at] = pixel[0];
        rgba[at + 1] = pixel[1];
        rgba[at + 2] = pixel[2];
        rgba[at + 3] = 255;
      }
    }
  }
  return encodePng(pixels, pixels, shrink(rgba, size, pixels, SUPERSAMPLE));
}

/** Full turns the die makes before it stops, counted from its first picture. */
const SPIN_EXTRA_TURNS = 1.5;

/**
 * The pose in each picture of a tumble: `steps + 1` poses, the last being the landing (upright,
 * showing `roll`). Every step turns the die less than the one before, so it slows to a stop, the
 * hops and flips die down, and no two pictures in a row show the same number. `pick` chooses a
 * whole number from 0 up to but not including its argument (injectable so this can be tested).
 */
export function dieFrames(steps: number, roll: number, pick: (below: number) => number = (n) => randomInt(n), extraTurns = SPIN_EXTRA_TURNS): DiePose[] {
  if (!Number.isInteger(steps) || steps < 1) throw new Error('A tumble needs at least one step');
  const poses: DiePose[] = [];
  let previous = -1;
  for (let k = 0; k <= steps; k++) {
    if (k === steps) {
      poses.push({ shown: roll, turn: 0, lift: 0, squash: 1 });
      break;
    }
    const left = 1 - k / steps;
    // Any number but the last one shown, and not the real roll (which is saved for the landing).
    let shown = 1 + pick(D20.sides);
    while (shown === previous || shown === roll) shown = (shown % D20.sides) + 1;
    previous = shown;
    poses.push({
      shown,
      turn: -left * left * extraTurns * TAU,
      lift: 0.22 * left * Math.abs(Math.sin(k * 2.3)),
      squash: 1 - 0.3 * left * Math.abs(Math.sin(k * 1.7 + 0.6)),
    });
  }
  return poses;
}
