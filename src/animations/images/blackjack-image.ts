import { BLACKJACK } from '../../constants/index.js';
import { handValue, type Card, type Suit } from '../../lib/game/blackjack.js';
import { GLYPHS, GLYPH_HEIGHT } from './pixel-font.js';
import { encodePng } from './png.js';
import type { Avatar } from './png-decode.js';
import {
  cubic,
  ellipsePoints,
  group,
  hex,
  Layer,
  linear,
  radial,
  roundRectPoints,
  solid,
  toBytes,
  type Color,
  type Paint,
  type Point,
  type Rgba,
} from './vector.js';

/*
 * Draws a blackjack table as a PNG: the dealer's cards at the top and the players' seats along the
 * bottom, each with the player's picture and name, its cards, its total (or how the hand ended) and
 * its bet. Cards are drawn from shapes, so nothing needs an image library: a card has its rank in
 * the top left corner and its suit big in the middle, and a face-down card shows a blue pattern.
 * The seat whose turn it is glows. An empty seat (a party table that isn't full yet) is an outline.
 *
 * A player's picture is a decoded profile picture (see png-decode.ts) drawn as a circle; without
 * one the circle is a colour with the first letter of the name. The name is spelled in a small
 * built-in font that has capital letters, digits and a few marks, so it is simplified (see
 * `cleanName`): accents are dropped, and characters the font lacks (other alphabets, emoji) are left out.
 */

/** The size of the table's layout: every position in this file is in these units (a card is 48 by 68). */
export const TABLE_WIDTH = 640;
export const TABLE_HEIGHT = 400;

/** The picture is drawn `BLACKJACK.imageScale` times bigger than the layout, so it is sharper. */
const ZOOM = BLACKJACK.imageScale;
/** The size of the finished picture in pixels. */
export const IMAGE_WIDTH = Math.round(TABLE_WIDTH * ZOOM);
export const IMAGE_HEIGHT = Math.round(TABLE_HEIGHT * ZOOM);

/**
 * A layer that is drawn on in layout units and comes out `zoom` times bigger: every shape and every
 * paint is scaled on the way in, so nothing else in this file needs to know the picture's real size.
 * (Every shape the layer draws goes through `fillPolygon`, so this one method is enough.)
 */
class Zoom extends Layer {
  constructor(
    private readonly zoom: number,
    width: number,
    height: number,
  ) {
    super(Math.round(width * zoom), Math.round(height * zoom));
  }

  override fillPolygon(points: readonly Point[], paint: Paint, opacity = 1): void {
    const k = this.zoom;
    super.fillPolygon(
      points.map((p): Point => [p[0] * k, p[1] * k]),
      (x, y) => paint(x / k, y / k),
      opacity,
    );
  }
}

/** Rounds a layout position to a whole pixel of the finished picture, so the dots of the pixel font stay sharp. */
const snap = (v: number): number => Math.round(v * ZOOM) / ZOOM;

const CARD_W = 48;
const CARD_H = 68;

const DEALER_Y = 46;
const AVATAR_D = 34; // the player's picture, a circle this many pixels across
const AVATAR_Y = 190; // its middle
const NAME_Y = 219; // the middle of the name under it
const SEAT_Y = 233; // the top of the cards
const ARC_Y = 166; // where the curved line between the dealer and the players sits, at its ends
const BADGE_OFFSET = 26; // from the bottom of the cards to the middle of the badge
const CHIP_OFFSET = 62; // from the bottom of the cards to the middle of the bet

const INK: Color = hex('#22252b');
const RED: Color = hex('#d0343a');
const WHITE: Color = hex('#ffffff');
const GOLD: Color = hex('#ffd25e');

// A small font: the digits (from pixel-font.ts) and the letters this picture spells words with.
const LETTERS: Record<string, readonly string[]> = {
  A: ['.###.', '#...#', '#...#', '#####', '#...#', '#...#', '#...#'],
  B: ['####.', '#...#', '#...#', '####.', '#...#', '#...#', '####.'],
  C: ['.###.', '#...#', '#....', '#....', '#....', '#...#', '.###.'],
  D: ['####.', '#...#', '#...#', '#...#', '#...#', '#...#', '####.'],
  E: ['#####', '#....', '#....', '####.', '#....', '#....', '#####'],
  F: ['#####', '#....', '#....', '####.', '#....', '#....', '#....'],
  G: ['.###.', '#...#', '#....', '#.###', '#...#', '#...#', '.####'],
  H: ['#...#', '#...#', '#...#', '#####', '#...#', '#...#', '#...#'],
  I: ['.###.', '..#..', '..#..', '..#..', '..#..', '..#..', '.###.'],
  J: ['..###', '...#.', '...#.', '...#.', '...#.', '#..#.', '.##..'],
  K: ['#...#', '#..#.', '#.#..', '##...', '#.#..', '#..#.', '#...#'],
  L: ['#....', '#....', '#....', '#....', '#....', '#....', '#####'],
  M: ['#...#', '##.##', '#.#.#', '#.#.#', '#...#', '#...#', '#...#'],
  N: ['#...#', '##..#', '##..#', '#.#.#', '#..##', '#..##', '#...#'],
  O: ['.###.', '#...#', '#...#', '#...#', '#...#', '#...#', '.###.'],
  P: ['####.', '#...#', '#...#', '####.', '#....', '#....', '#....'],
  Q: ['.###.', '#...#', '#...#', '#...#', '#.#.#', '#..#.', '.##.#'],
  R: ['####.', '#...#', '#...#', '####.', '#.#..', '#..#.', '#...#'],
  S: ['.####', '#....', '#....', '.###.', '....#', '....#', '####.'],
  T: ['#####', '..#..', '..#..', '..#..', '..#..', '..#..', '..#..'],
  U: ['#...#', '#...#', '#...#', '#...#', '#...#', '#...#', '.###.'],
  V: ['#...#', '#...#', '#...#', '#...#', '#...#', '.#.#.', '..#..'],
  W: ['#...#', '#...#', '#...#', '#.#.#', '#.#.#', '##.##', '#...#'],
  X: ['#...#', '#...#', '.#.#.', '..#..', '.#.#.', '#...#', '#...#'],
  Y: ['#...#', '#...#', '.#.#.', '..#..', '..#..', '..#..', '..#..'],
  Z: ['#####', '....#', '...#.', '..#..', '.#...', '#....', '#####'],
  '-': ['...', '...', '...', '###', '...', '...', '...'],
  _: ['.....', '.....', '.....', '.....', '.....', '.....', '#####'],
  '!': ['#', '#', '#', '#', '#', '.', '#'],
  '?': ['.###.', '#...#', '....#', '...#.', '..#..', '.....', '..#..'],
  "'": ['#', '#', '.', '.', '.', '.', '.'],
  ' ': ['...', '...', '...', '...', '...', '...', '...'],
};
const FONT: Record<string, readonly string[]> = { ...GLYPHS, ...LETTERS };

/** Width of `text` in font dots, one dot of space between letters. */
function dotsWide(text: string): number {
  let width = 0;
  for (const ch of text) width += (FONT[ch]?.[0]?.length ?? 0) + 1;
  return Math.max(0, width - 1);
}

const rect = (x: number, y: number, w: number, h: number): Point[] => [
  [x, y],
  [x + w, y],
  [x + w, y + h],
  [x, y + h],
];

/** Writes `text` centred on (cx, cy), each font dot being `scale` pixels square. */
function writeText(layer: Layer, text: string, cx: number, cy: number, scale: number, paint: Paint, opacity = 1): void {
  let x = snap(cx - (dotsWide(text) * scale) / 2);
  const top = snap(cy - (GLYPH_HEIGHT * scale) / 2);
  for (const ch of text) {
    const glyph = FONT[ch];
    if (!glyph) continue;
    for (let row = 0; row < GLYPH_HEIGHT; row++) {
      const line = glyph[row] as string;
      let col = 0;
      while (col < line.length) {
        if (line[col] !== '#') {
          col++;
          continue;
        }
        let end = col;
        while (end < line.length && line[end] === '#') end++;
        layer.fillPolygon(rect(x + col * scale, top + row * scale, (end - col) * scale, scale), paint, opacity);
        col = end;
      }
    }
    x += ((glyph[0] as string).length + 1) * scale;
  }
}

const textLabel = (rank: number): string => (rank === 1 ? 'A' : rank === 11 ? 'J' : rank === 12 ? 'Q' : rank === 13 ? 'K' : String(rank));

// ---------------------------------------------------------------------------
// Names and pictures of the players
// ---------------------------------------------------------------------------

/**
 * A name as the small font can spell it: accents dropped (é is E), capitals, and only letters,
 * digits, spaces and a few marks kept (other alphabets and emoji are left out, since the font has
 * no such letters). `fallback` is used when nothing is left.
 */
export function cleanName(name: string, fallback: string): string {
  const plain = name
    .normalize('NFKD')
    .replace(/\p{M}+/gu, '')
    .toUpperCase()
    .replace(/[^A-Z0-9 .!?'_-]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  return /[A-Z0-9]/.test(plain) ? plain : fallback;
}

/** `text` shortened, with ".." at the end, until it is at most `maxDots` font dots wide (at least one letter is kept). */
export function fitName(text: string, maxDots: number): string {
  if (dotsWide(text) <= maxDots) return text;
  let cut = text.trimEnd();
  while (cut.length > 1 && dotsWide(`${cut}..`) > maxDots) cut = cut.slice(0, -1).trimEnd();
  return `${cut}..`;
}

/** Colours a picture-less circle can have, picked by the name so a player keeps theirs. */
const INITIAL_COLORS: readonly Color[] = [hex('#5865f2'), hex('#3ba55d'), hex('#c9682b'), hex('#b5427a'), hex('#2a8fa8'), hex('#8a5cc2')];

const nameHash = (text: string): number => {
  let h = 0;
  for (const ch of text) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return h;
};

/** One point of a picture at (u, v) in its own pixels, blended between the four pixels around it. Premultiplied by alpha. */
function bilinear(img: Avatar, u: number, v: number): [number, number, number, number] {
  const x = Math.min(img.width - 1, Math.max(0, u - 0.5));
  const y = Math.min(img.height - 1, Math.max(0, v - 0.5));
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const x1 = Math.min(img.width - 1, x0 + 1);
  const y1 = Math.min(img.height - 1, y0 + 1);
  const fx = x - x0;
  const fy = y - y0;
  const out: [number, number, number, number] = [0, 0, 0, 0];
  const taps: [number, number, number][] = [
    [x0, y0, (1 - fx) * (1 - fy)],
    [x1, y0, fx * (1 - fy)],
    [x0, y1, (1 - fx) * fy],
    [x1, y1, fx * fy],
  ];
  for (const [tx, ty, weight] of taps) {
    const at = (ty * img.width + tx) * 4;
    const a = ((img.rgba[at + 3] as number) / 255) * weight;
    out[0] += ((img.rgba[at] as number) / 255) * a;
    out[1] += ((img.rgba[at + 1] as number) / 255) * a;
    out[2] += ((img.rgba[at + 2] as number) / 255) * a;
    out[3] += a;
  }
  return out;
}

/** A paint that shows `img` stretched over the square whose middle is (cx, cy) and side is `size`. Shrinking averages 3 by 3 points per pixel so it stays smooth. */
export function imagePaint(img: Avatar, cx: number, cy: number, size: number): Paint {
  const left = cx - size / 2;
  const top = cy - size / 2;
  const offsets = [-1 / 3, 0, 1 / 3];
  return (x, y): Rgba => {
    let r = 0;
    let g = 0;
    let b = 0;
    let a = 0;
    for (const dy of offsets) {
      for (const dx of offsets) {
        const p = bilinear(img, ((x + dx - left) / size) * img.width, ((y + dy - top) / size) * img.height);
        r += p[0];
        g += p[1];
        b += p[2];
        a += p[3];
      }
    }
    if (a <= 0) return [0, 0, 0, 0];
    return [r / a, g / a, b / a, a / offsets.length ** 2];
  };
}

/** The picture of a player: their profile picture as a circle, or a coloured circle with the first letter of their name. */
function drawAvatar(canvas: Layer, cx: number, cy: number, name: string, avatar: Avatar | null, active: boolean): void {
  const r = AVATAR_D / 2;
  canvas.fillEllipse(cx, cy + 1.5, r + 1, r + 1, solid(hex('#000000'), 0.4));
  if (avatar) {
    canvas.fillEllipse(cx, cy, r, r, solid(hex('#2b2d31')));
    canvas.fillEllipse(cx, cy, r, r, imagePaint(avatar, cx, cy, AVATAR_D));
  } else {
    canvas.fillEllipse(cx, cy, r, r, solid(INITIAL_COLORS[nameHash(name) % INITIAL_COLORS.length] as Color));
    const first = name.trim()[0] ?? '?';
    writeText(canvas, FONT[first] ? first : '?', cx, cy, 2, solid(WHITE));
  }
  const ring = ellipsePoints(cx, cy, r, r);
  canvas.strokePath([...ring, ring[0] as Point], active ? 2.5 : 1.5, solid(active ? GOLD : WHITE), active ? 1 : 0.55);
}

// ---------------------------------------------------------------------------
// Suits
// ---------------------------------------------------------------------------

/** The outline of a heart with its point at the bottom, `s` tall, centred on (cx, cy). */
function heartPoints(cx: number, cy: number, s: number): Point[] {
  const tip: Point = [cx, cy + 0.5 * s];
  const side: Point = [cx - 0.5 * s, cy - 0.12 * s];
  const dip: Point = [cx, cy - 0.26 * s];
  const left = [
    ...cubic(tip, [cx - 0.12 * s, cy + 0.34 * s], [cx - 0.5 * s, cy + 0.12 * s], side, 12),
    ...cubic(side, [cx - 0.5 * s, cy - 0.56 * s], [cx - 0.06 * s, cy - 0.56 * s], dip, 12).slice(1),
  ];
  const right = left
    .slice(1, -1)
    .reverse()
    .map((p): Point => [2 * cx - p[0], p[1]]);
  return [...left, ...right];
}

function drawSuit(layer: Layer, suit: Suit, cx: number, cy: number, s: number, paint: Paint): void {
  switch (suit) {
    case 'hearts':
      layer.fillPolygon(heartPoints(cx, cy, s), paint);
      break;
    case 'diamonds':
      layer.fillPolygon(
        [
          [cx, cy - 0.56 * s],
          [cx + 0.4 * s, cy],
          [cx, cy + 0.56 * s],
          [cx - 0.4 * s, cy],
        ],
        paint,
      );
      break;
    case 'spades': {
      // A heart upside down, with a stem.
      layer.fillPolygon(heartPoints(cx, cy - 0.06 * s, s * 0.92).map((p): Point => [p[0], 2 * (cy - 0.06 * s) - p[1]]), paint);
      layer.fillPolygon(
        [
          [cx - 0.05 * s, cy + 0.2 * s],
          [cx + 0.05 * s, cy + 0.2 * s],
          [cx + 0.2 * s, cy + 0.56 * s],
          [cx - 0.2 * s, cy + 0.56 * s],
        ],
        paint,
      );
      break;
    }
    case 'clubs': {
      const r = 0.23 * s;
      layer.fillEllipse(cx, cy - 0.2 * s, r, r, paint);
      layer.fillEllipse(cx - 0.25 * s, cy + 0.1 * s, r, r, paint);
      layer.fillEllipse(cx + 0.25 * s, cy + 0.1 * s, r, r, paint);
      layer.fillPolygon(
        [
          [cx - 0.12 * s, cy - 0.02 * s],
          [cx + 0.12 * s, cy - 0.02 * s],
          [cx + 0.06 * s, cy + 0.2 * s],
          [cx + 0.2 * s, cy + 0.56 * s],
          [cx - 0.2 * s, cy + 0.56 * s],
          [cx - 0.06 * s, cy + 0.2 * s],
        ],
        paint,
      );
      break;
    }
  }
}

const suitPaint = (suit: Suit): Paint => solid(suit === 'hearts' || suit === 'diamonds' ? RED : INK);

// ---------------------------------------------------------------------------
// Cards
// ---------------------------------------------------------------------------

function drawCard(canvas: Layer, scratch: Layer, x: number, y: number, card: Card | null): void {
  // Its shadow first, so the next card overlapping it sits on top of that.
  group(canvas, scratch, { blur: 2.5 * ZOOM, opacity: 0.5 }, (l) => l.fillRoundRect(x + 1.5, y + 3, CARD_W, CARD_H, 6, solid(hex('#000000'))));

  if (card === null) {
    // The back: a white edge, blue inside, a lattice of diamonds.
    canvas.fillRoundRect(x, y, CARD_W, CARD_H, 6, solid(WHITE));
    canvas.fillRoundRect(x + 3, y + 3, CARD_W - 6, CARD_H - 6, 4, linear(x, y, x + CARD_W, y + CARD_H, [[0, hex('#3b4cb8')], [1, hex('#1c2668')]]));
    const light = solid(hex('#8f9cf0'), 0.55);
    for (let row = 0; row < 7; row++) {
      for (let col = 0; col < 4; col++) {
        const cx = x + 9 + col * 10 + (row % 2) * 5;
        const cy = y + 10 + row * 8;
        if (cx + 4 > x + CARD_W - 6) continue;
        canvas.fillPolygon(
          [
            [cx, cy - 3.2],
            [cx + 3.2, cy],
            [cx, cy + 3.2],
            [cx - 3.2, cy],
          ],
          light,
        );
      }
    }
    return;
  }

  canvas.fillRoundRect(x, y, CARD_W, CARD_H, 6, solid(hex('#9aa0ab')));
  canvas.fillRoundRect(x + 0.8, y + 0.8, CARD_W - 1.6, CARD_H - 1.6, 5.4, linear(x, y, x, y + CARD_H, [[0, WHITE], [1, hex('#e6e9f0')]]));
  // The rank in the top left corner, the suit big in the middle.
  const ink = suitPaint(card.suit);
  const label = textLabel(card.rank);
  writeText(canvas, label, x + 6 + dotsWide(label), y + 12, 2, ink);
  drawSuit(canvas, card.suit, x + CARD_W / 2, y + CARD_H / 2 + 5, card.rank === 1 ? 32 : 26, ink);
}

/** Where the cards of a hand go: the left edge of each, so that the hand is centred on `cx` and fits in `room` pixels. */
function handSlots(count: number, cx: number, room: number, maxStep: number): number[] {
  if (count === 0) return [];
  const step = count === 1 ? 0 : Math.min(maxStep, (room - CARD_W) / (count - 1));
  const left = cx - (CARD_W + (count - 1) * step) / 2;
  return Array.from({ length: count }, (_, i) => left + i * step);
}

// ---------------------------------------------------------------------------
// The table
// ---------------------------------------------------------------------------

/** How a hand ended, shown in place of its total. */
export type Badge = 'bust' | 'blackjack' | 'win' | 'lose' | 'push';

const BADGE_TEXT: Record<Badge, string> = { bust: 'BUST', blackjack: 'BJ', win: 'WIN', lose: 'LOSE', push: 'PUSH' };
const BADGE_COLOR: Record<Badge, Color> = {
  bust: hex('#c9343c'),
  lose: hex('#c9343c'),
  win: hex('#2f9e58'),
  push: hex('#6f7686'),
  blackjack: hex('#d8a520'),
};

export interface SeatView {
  /** The player's name, shown under their picture (simplified, see `cleanName`). Left out, "PLAYER 1", "PLAYER 2"... */
  name?: string;
  /** The player's profile picture, decoded. Left out, a coloured circle with the first letter of the name. */
  avatar?: Avatar | null;
  cards: readonly Card[];
  /** The points bet, drawn as a chip. */
  bet: number;
  /** How the hand ended, once it has. Left out, the hand's total is shown. */
  badge?: Badge | null;
  /** It is this seat's turn. */
  active?: boolean;
}

export interface TableView {
  /** One entry per seat, left to right; null is an empty seat. */
  seats: readonly (SeatView | null)[];
  dealer: readonly Card[];
  /** The dealer's second card is face down. */
  hideHole?: boolean;
  /** Shown by the dealer's cards instead of their total. */
  dealerBadge?: Badge | null;
}

function pill(canvas: Layer, cx: number, cy: number, width: number, color: Color, text: string, scale: number, textPaint: Paint): void {
  canvas.fillRoundRect(cx - width / 2, cy - 12, width, 24, 12, solid(hex('#000000'), 0.35));
  canvas.fillRoundRect(cx - width / 2 + 1, cy - 11, width - 2, 22, 11, solid(color));
  writeText(canvas, text, cx, cy, scale, textPaint);
}

function chip(canvas: Layer, cx: number, cy: number, amount: number): void {
  const text = String(amount);
  const textWide = dotsWide(text) * 2;
  const total = 20 + 6 + textWide;
  const left = cx - total / 2;
  canvas.fillEllipse(left + 10, cy + 1, 10, 10, solid(hex('#000000'), 0.35));
  canvas.fillEllipse(left + 10, cy, 10, 10, radial(left + 8, cy - 3, 12, 12, [[0, hex('#ffe89a')], [1, hex('#d99a12')]]));
  canvas.fillEllipse(left + 10, cy, 6.5, 6.5, solid(hex('#b97f0c'), 0.55));
  canvas.fillEllipse(left + 10, cy, 5, 5, radial(left + 9, cy - 2, 6, 6, [[0, hex('#ffe089')], [1, hex('#e6ad2a')]]));
  writeText(canvas, text, left + 26 + textWide / 2, cy, 2, solid(WHITE));
}

/** The table itself, which is the same in every picture: the room, the wooden rim, the felt, the gold line, the dealer's name and the curved line between the dealer and the players. */
function paintBackground(canvas: Layer): void {
  canvas.fillAll(solid(hex('#17181b')));
  canvas.fillRoundRect(2, 2, TABLE_WIDTH - 4, TABLE_HEIGHT - 4, 56, linear(0, 0, 0, TABLE_HEIGHT, [[0, hex('#7a4d28')], [1, hex('#3f2814')]]));
  canvas.fillRoundRect(12, 12, TABLE_WIDTH - 24, TABLE_HEIGHT - 24, 48, radial(320, 200, 440, 300, [[0, hex('#2f8552')], [0.6, hex('#216240')], [1, hex('#123c26')]]));
  const line = roundRectPoints(26, 26, TABLE_WIDTH - 52, TABLE_HEIGHT - 52, 36);
  canvas.strokePath([...line, line[0] as Point], 1.5, solid(GOLD), 0.3);
  writeText(canvas, 'DEALER', TABLE_WIDTH / 2, 28, 2, solid(WHITE), 0.75);
  const arc = Array.from({ length: 41 }, (_, i): Point => {
    const t = i / 40;
    return [110 + t * 420, ARC_Y - Math.sin(t * Math.PI) * 12];
  });
  canvas.strokePath(arc, 1.5, solid(GOLD), 0.22);
}

/** The finished table without any cards, drawn once (it is the slowest part) and copied into every picture. */
let background: Float32Array | null = null;

/** The picture of the table as a PNG. */
export function renderTable(view: TableView): Buffer {
  const canvas = new Zoom(ZOOM, TABLE_WIDTH, TABLE_HEIGHT);
  const scratch = new Zoom(ZOOM, TABLE_WIDTH, TABLE_HEIGHT);

  if (background) {
    canvas.data.set(background);
  } else {
    paintBackground(canvas);
    background = canvas.data.slice();
  }

  // The dealer.
  const dealerSlots = handSlots(view.dealer.length, TABLE_WIDTH / 2, 400, 54);
  view.dealer.forEach((card, i) => drawCard(canvas, scratch, dealerSlots[i] as number, DEALER_Y, view.hideHole && i === 1 ? null : card));
  const dealerBottom = DEALER_Y + CARD_H;
  if (view.dealerBadge) {
    pill(canvas, TABLE_WIDTH / 2, dealerBottom + 20, 76, BADGE_COLOR[view.dealerBadge], BADGE_TEXT[view.dealerBadge], 2, solid(WHITE));
  } else if (view.dealer.length > 0 && !view.hideHole) {
    pill(canvas, TABLE_WIDTH / 2, dealerBottom + 20, 50, hex('#1b1d22'), String(handValue(view.dealer).total), 2, solid(WHITE));
  }

  // The seats.
  const count = view.seats.length;
  const seatWidth = Math.min(180, Math.floor(600 / Math.max(1, count)));
  view.seats.forEach((seat, i) => {
    const cx = TABLE_WIDTH / 2 + (i - (count - 1) / 2) * seatWidth;

    // The player's picture and name; the seat glows when it is their turn.
    if (seat?.active) {
      group(canvas, scratch, { blur: 9 * ZOOM, blend: 'screen', opacity: 0.9 }, (l) => {
        l.fillRoundRect(cx - seatWidth / 2 + 6, AVATAR_Y - AVATAR_D / 2 - 6, seatWidth - 12, SEAT_Y + CARD_H + BADGE_OFFSET + 14 - (AVATAR_Y - AVATAR_D / 2 - 6), 14, solid(hex('#7a5c10')));
      });
    }
    const room = Math.floor((seatWidth - 14) / 2); // the name's width in font dots at scale 2
    if (!seat) {
      // Nobody here: an empty circle and an outline where the cards will go.
      const ring = ellipsePoints(cx, AVATAR_Y, AVATAR_D / 2, AVATAR_D / 2);
      canvas.fillEllipse(cx, AVATAR_Y, AVATAR_D / 2, AVATAR_D / 2, solid(hex('#000000'), 0.25));
      canvas.strokePath([...ring, ring[0] as Point], 1.5, solid(WHITE), 0.28);
      writeText(canvas, 'OPEN', cx, NAME_Y, 2, solid(WHITE), 0.4);
      const outline = roundRectPoints(cx - CARD_W / 2, SEAT_Y, CARD_W, CARD_H, 6);
      canvas.strokePath([...outline, outline[0] as Point], 1.5, solid(WHITE), 0.28);
      return;
    }
    const name = cleanName(seat.name ?? '', `PLAYER ${i + 1}`);
    drawAvatar(canvas, cx, AVATAR_Y, name, seat.avatar ?? null, !!seat.active);
    writeText(canvas, fitName(name, room), cx, NAME_Y, 2, solid(seat.active ? GOLD : WHITE));

    const slots = handSlots(seat.cards.length, cx, seatWidth - 10, 30);
    seat.cards.forEach((card, k) => drawCard(canvas, scratch, slots[k] as number, SEAT_Y, card));
    if (seat.cards.length === 0) {
      const outline = roundRectPoints(cx - CARD_W / 2, SEAT_Y, CARD_W, CARD_H, 6);
      canvas.strokePath([...outline, outline[0] as Point], 1.5, solid(WHITE), 0.28);
    } else if (seat.badge) {
      pill(canvas, cx, SEAT_Y + CARD_H + BADGE_OFFSET, 76, BADGE_COLOR[seat.badge], BADGE_TEXT[seat.badge], 2, solid(WHITE));
    } else {
      pill(canvas, cx, SEAT_Y + CARD_H + BADGE_OFFSET, 50, hex('#1b1d22'), String(handValue(seat.cards).total), 2, solid(WHITE));
    }
    chip(canvas, cx, SEAT_Y + CARD_H + CHIP_OFFSET, seat.bet);
  });

  // Level 6: this picture is big and noisy, and level 9 takes 2.5 times as long for the same size.
  return encodePng(IMAGE_WIDTH, IMAGE_HEIGHT, toBytes(canvas), 6);
}
