import { ballOffset, slotOf, type PlinkoPath } from '../../lib/game/plinko.js';
import { GLYPHS, GLYPH_HEIGHT, textWidth } from './pixel-font.js';
import { encodePng } from './png.js';
import { ACCENT_RED, LINE, rangeColors, textOn } from './palette.js';
import { mix, shrinkRect, type Rgb } from './raster.js';

/*
 * Draws the plinko board as a PNG: rows of pegs in a triangle, a slot for each payout at the
 * bottom (colored by how much it pays compared with the other slots: red for the most, gold for
 * the least), and the ball. Frame 0 has the ball on the top peg; each next frame it has fallen
 * one row, and the last frame has it in its slot. No image library: shapes are painted onto a
 * pixel buffer drawn at twice the size and shrunk to smooth the edges.
 */

const SUPERSAMPLE = 2;

/** The size of the picture, in pixels, and the spacing of the pegs. */
const WIDTH = 640;
const SIDE = 32;
const PEG_TOP = 64;
const SLOT_GAP = 34; // from the last row of pegs to the top of the slots
const SLOT_HEIGHT = 76;
const BOTTOM = 24;
const PEG_RADIUS = 5;
const BALL_RADIUS = 11;

const BACKGROUND: Rgb = [32, 34, 38];
const PEG: Rgb = [200, 204, 212];
const BALL: Rgb = [255, 255, 255];
const BALL_EDGE = ACCENT_RED;
const TRAIL: Rgb = [95, 99, 108];
const WINNER_EDGE: Rgb = [255, 255, 255];

/** "9x", "0.4x". */
const label = (multiplier: number): string => `${Number(multiplier.toFixed(2))}x`;

/** Where things go, for a board with `rows` rows of pegs (all in picture pixels, before the shrink). */
export function boardLayout(rows: number) {
  const slots = rows + 1;
  const spacing = (WIDTH - 2 * SIDE) / slots; // slot width, and the distance between pegs in a row
  const rowHeight = Math.min(46, 340 / Math.max(1, rows - 1));
  const lastPegY = PEG_TOP + (rows - 1) * rowHeight;
  const slotTop = lastPegY + SLOT_GAP;
  const height = Math.round(slotTop + SLOT_HEIGHT + BOTTOM);
  const center = WIDTH / 2;
  return {
    slots,
    spacing,
    rowHeight,
    slotTop,
    height: height % 2 === 0 ? height : height + 1,
    center,
    /** The centre of peg `index` (0 to `row`) in row `row`. */
    peg: (row: number, index: number) => ({ x: center + (index - row / 2) * spacing, y: PEG_TOP + row * rowHeight }),
    /** The centre of slot `slot`. */
    slot: (slot: number) => ({ x: center + (slot - rows / 2) * spacing, y: slotTop }),
  };
}

/** A pixel buffer that shapes can be painted on, drawn at SUPERSAMPLE times the picture size. */
class Canvas {
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

/**
 * Draws the board with the ball after `frame` bounces (0 to `path.length`; the last has the ball
 * in its slot). `multipliers` is what each slot pays, left to right. When `finished`, the slot
 * the ball is in stays bright with a white edge and the other slots are dimmed. Returns the PNG file.
 */
export function renderPlinko(multipliers: readonly number[], path: PlinkoPath, frame: number, finished = false): Buffer {
  const rows = path.length;
  if (rows < 1) throw new Error('A plinko board needs at least one row');
  if (multipliers.length !== rows + 1) throw new Error('There must be one payout for each slot');
  if (!Number.isInteger(frame) || frame < 0 || frame > rows) throw new Error(`The ball has no frame ${frame}`);

  const layout = boardLayout(rows);
  const s = SUPERSAMPLE;
  const canvas = new Canvas(WIDTH * s, layout.height * s);
  canvas.fill(BACKGROUND);
  const landed = slotOf(path);

  // The slots, each colored by what it pays compared with the other slots (red for the most, gold for the least), with its multiplier.
  const gap = 2;
  const slotColors = rangeColors(multipliers, { reversed: true });
  for (let slot = 0; slot < layout.slots; slot++) {
    const { x, y } = layout.slot(slot);
    const half = layout.spacing / 2;
    const multiplier = multipliers[slot] as number;
    let color = slotColors[slot] as Rgb;
    const won = finished && slot === landed;
    if (finished && !won) color = mix(color, LINE, 0.55);
    if (won) canvas.rect((x - half + gap - 3) * s, (y - 3) * s, (x + half - gap + 3) * s, (y + SLOT_HEIGHT + 3) * s, WINNER_EDGE);
    canvas.rect((x - half + gap) * s, y * s, (x + half - gap) * s, (y + SLOT_HEIGHT) * s, color);
    const textColor = textOn(color);
    canvas.text(label(multiplier), x * s, (y + SLOT_HEIGHT - 22) * s, 2 * s, textColor);
  }

  // The pegs.
  for (let row = 0; row < rows; row++) {
    for (let index = 0; index <= row; index++) {
      const { x, y } = layout.peg(row, index);
      canvas.circle(x * s, y * s, PEG_RADIUS * s, PEG);
    }
  }

  // Where the ball is at each frame: on top of the peg it is about to hit, then in its slot.
  const at = (k: number): { x: number; y: number } => {
    const x = layout.center + ballOffset(path, k) * layout.spacing;
    if (k < rows) return { x, y: PEG_TOP + k * layout.rowHeight - PEG_RADIUS - BALL_RADIUS };
    return { x, y: layout.slotTop + 26 };
  };

  // A faint dot for each place the ball has been, then the ball itself.
  for (let k = 0; k < frame; k++) {
    const { x, y } = at(k);
    canvas.circle(x * s, y * s, 4 * s, TRAIL);
  }
  const ball = at(frame);
  canvas.circle(ball.x * s, ball.y * s, BALL_RADIUS * s, BALL_EDGE);
  canvas.circle(ball.x * s, ball.y * s, (BALL_RADIUS - 3) * s, BALL);

  const out = shrinkRect(canvas.rgba, canvas.width, canvas.height, s);
  return encodePng(WIDTH, layout.height, out);
}
