import { encodePng } from './png.js';
import type { CrateTier } from '../../lib/events/crate.js';
import { GLYPHS } from './pixel-font.js';
import { ZEIUCOIN_SIZE, zeiucoinPixels } from './coin-art.js';
import { BURST_NOISE, BURST_SPARKLES, CLOSED_NOISE, CLOSED_SPARKLES, HIDDEN_SPARKLES, HIDDEN_STREAKS, RIBBONS, type Sparkle } from './crate-layout.js';
import {
  atStops,
  cubic,
  ellipsePoints,
  group,
  hex,
  Layer,
  linear,
  radial,
  roundRectPoints,
  mixColor,
  solid,
  toBytes,
  type Color,
  type Paint,
  type Point,
  type Stop,
} from './vector.js';

/*
 * Draws the point crate as a PNG: a sci-fi supply crate on a dark backdrop of soft, slow waves. The
 * lid is hinged at the back and has no handles. While it is `closed` (waiting to be grabbed) light
 * leaks out of the crack round the lid, more of it at the corners, with a soft glow from a crack round
 * the back and a few drifting sparkles. When it is `opened` the lid stands up and light pours out of
 * the opening in every direction. If it is `lost` (nobody came) the lights are out, the lid has
 * slipped off, and dust hangs over it. The light is emerald for a small pile, violet for a middling
 * one and red for a big one (`tier`). It is drawn with the little painter in vector.ts (shapes,
 * gradients, blurred light), with no image library, like the other pictures (see png.ts).
 */

export type CrateState = 'closed' | 'opened' | 'lost';

const WIDTH = 640;
const HEIGHT = 400;

const TIER_COLORS: Record<CrateTier, { col: Color; core: Color }> = {
  low: { col: hex('#3dffb0'), core: hex('#eafff6') },
  mid: { col: hex('#b58cff'), core: hex('#f3eaff') },
  high: { col: hex('#ff5a4d'), core: hex('#ffe9e6') },
};

/** The middle of the chest, where the light comes from. */
const CENTER: Point = [315, 231];

// Blur strengths (in picture pixels) used for the different kinds of light.
const BLUR_FINE = 1.8;
const BLUR_SOFT = 3;
const BLUR_MEDIUM = 4.5;
const BLUR_WIDE = 6;
const BLUR_HAZE = 12;

const rgb = (code: string): Color => hex(code);
const mod = (n: number, m: number): number => ((n % m) + m) % m;

/** What every drawing step needs: the picture, a scratch layer for blurred groups, and the tier's colours. */
interface Ctx {
  canvas: Layer;
  scratch: Layer;
  col: Color;
  core: Color;
  /** A more vivid version of `col`, for the crack itself. */
  vivid: Color;
}

function vividOf(c: Color): Color {
  const [r, g, b] = c;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;
  let h = 0;
  if (d > 0) {
    if (max === r) h = mod((g - b) / d, 6);
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
  }
  const s = Math.min(1, (max === 0 ? 0 : d / max) * 1.25 + 0.1);
  const v = 1;
  const k = (n: number): number => v - v * s * Math.max(0, Math.min(1, Math.min(mod(n + h, 6), 4 - mod(n + h, 6))));
  return [k(5), k(3), k(1)];
}

const tierPaint = {
  /** A glow that is strongest in the middle of an ellipse and gone at its edge. */
  ground: (col: Color, cx: number, cy: number, rx: number, ry: number): Paint =>
    radial(cx, cy, rx, ry, [
      [0, col, 0.9],
      [0.45, col, 0.26],
      [1, col, 0],
    ]),
  halo: (col: Color, cx: number, cy: number, rx: number, ry: number): Paint =>
    radial(cx, cy, rx, ry, [
      [0, col, 0.55],
      [0.4, col, 0.2],
      [1, col, 0],
    ]),
};

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------

const STAR: Point[] = [
  [0, -1],
  [0.2, -0.2],
  [1, 0],
  [0.2, 0.2],
  [0, 1],
  [-0.2, 0.2],
  [-1, 0],
  [-0.2, -0.2],
];

/** A four-pointed sparkle with a bright middle. */
function star(ctx: Ctx, x: number, y: number, size: number, opacity: number, col = ctx.col, core = ctx.core): void {
  group(ctx.canvas, ctx.scratch, { opacity }, (l) => {
    l.fillPolygon(
      STAR.map(([px, py]) => [x + px * size * 1.06, y + py * size * 1.06] as Point),
      solid(col),
    );
    l.fillPolygon(
      STAR.map(([px, py]) => [x + px * size * 0.62, y + py * size * 0.62] as Point),
      solid(core),
    );
  });
}

const sparkles = (ctx: Ctx, list: readonly Sparkle[]): void => {
  for (const [x, y, size, opacity] of list) star(ctx, x, y, size, opacity);
};

/** Fills a polygon on the picture itself. */
const poly = (ctx: Ctx, points: readonly Point[], paint: Paint, opacity = 1): void => ctx.canvas.fillPolygon(points, paint, opacity);
const rect = (x: number, y: number, w: number, h: number): Point[] => [[x, y], [x + w, y], [x + w, y + h], [x, y + h]];
const rrect = (ctx: Ctx, x: number, y: number, w: number, h: number, r: number, paint: Paint, opacity = 1): void =>
  ctx.canvas.fillPolygon(roundRectPoints(x, y, w, h, r), paint, opacity);

/** A line round a rounded rectangle, centred on its edge. */
const outline = (ctx: Ctx, x: number, y: number, w: number, h: number, r: number, width: number, paint: Paint, opacity = 1): void => {
  const pts = roundRectPoints(x, y, w, h, r);
  ctx.canvas.strokePath([...pts, pts[0] as Point], width, paint, opacity);
};

/** Runs `draw` on a blurred, blended group (see vector.ts). */
const soft = (ctx: Ctx, blur: number, blend: 'normal' | 'screen', opacity: number, draw: (l: Layer) => void): void =>
  group(ctx.canvas, ctx.scratch, { blur, blend, opacity }, draw);

/** Text in the little 5x7 letters of the pixel font (plus the few letters the plate needs), centred on (cx, top). */
const LETTERS: Record<string, readonly string[]> = {
  ...GLYPHS,
  K: ['#...#', '#..#.', '#.#..', '##...', '#.#..', '#..#.', '#...#'],
  O: ['.###.', '#...#', '#...#', '#...#', '#...#', '#...#', '.###.'],
  M: ['#...#', '##.##', '#.#.#', '#.#.#', '#...#', '#...#', '#...#'],
  A: ['.###.', '#...#', '#...#', '#####', '#...#', '#...#', '#...#'],
  '-': ['.....', '.....', '.....', '#####', '.....', '.....', '.....'],
  ' ': ['..', '..', '..', '..', '..', '..', '..'],
};
function dotText(ctx: Ctx, text: string, cx: number, top: number, paint: Paint, gap = 1, opacity = 1): void {
  let width = -gap;
  for (const ch of text) width += (LETTERS[ch]?.[0]?.length ?? 0) + gap;
  let x = Math.round(cx - width / 2);
  for (const ch of text) {
    const glyph = LETTERS[ch];
    if (!glyph) continue;
    glyph.forEach((row, ry) => {
      for (let rx = 0; rx < row.length; rx++) if (row[rx] === '#') poly(ctx, rect(x + rx, top + ry, 1, 1), paint, opacity);
    });
    x += (glyph[0]?.length ?? 0) + gap;
  }
}

// ---------------------------------------------------------------------------
// The backdrop: deep blue fading to black, with soft waves of light across it
// ---------------------------------------------------------------------------

function backdrop(ctx: Ctx): void {
  const { canvas } = ctx;
  // Base gradient runs corner to corner (in the picture's own proportions).
  const base: Stop[] = [
    [0, rgb('#040a18')],
    [0.5, rgb('#070f24')],
    [1, rgb('#020307')],
  ];
  canvas.fillAll((x, y) => atStops(base, (x / WIDTH + y / HEIGHT) / 2));
  canvas.fillAll(radial(0.62 * WIDTH, 0.38 * HEIGHT, 0.7 * WIDTH, 0.7 * HEIGHT, [[0, rgb('#1a4a90'), 0.2], [1, rgb('#1a4a90'), 0]]));

  // Wide soft bands: long S-curves, heavily blurred, in a few dark blues and one teal.
  const bands: [string, number, number, number, number, number, number][] = [
    ['#2b4f9a', 0.2, 110, -30, 150, 650, 60],
    ['#1d3f86', 0.22, 80, 20, 250, 690, 140],
    ['#1f6f9c', 0.12, 64, -10, 330, 660, 210],
    ['#3a3f9e', 0.16, 90, 40, 120, 700, 300],
    ['#153468', 0.24, 120, -40, 200, 620, 370],
  ];
  for (const [color, opacity, width, y0, y1, x1, y2] of bands) {
    const path: Point[] = [
      ...cubic([-60, y0 + 60], [120, y1 - 90], [260, y1 + 70], [380, y0 + 150]),
      ...cubic([380, y0 + 150], [500, 2 * (y0 + 150) - (y1 + 70)], [x1 - 80, y2 - 40], [x1, y2]).slice(1),
    ];
    soft(ctx, BLUR_HAZE, 'screen', opacity * 0.4, (l) => l.strokePath(path, width, solid(rgb(color)), 1, true));
  }

  // Thin ribbons on top, so the waves have a visible flow.
  soft(ctx, BLUR_FINE, 'normal', 1, (l) => {
    for (const ribbon of RIBBONS) {
      const path = ribbon.ys.map((y, i) => [-20 + (i * (WIDTH + 40)) / 16, y] as Point);
      l.strokePath(path, ribbon.width, solid(rgb('#7fa6e8')), ribbon.opacity);
    }
  });

  // Light sweeping in from the top right.
  const sweep: Stop[] = [[0, rgb('#7fb0ff'), 0.35], [1, rgb('#7fb0ff'), 0]];
  soft(ctx, BLUR_HAZE, 'normal', 0.2, (l) =>
    l.fillPolygon([[470, 0], [640, 0], [640, 180], [420, 400], [360, 400]], (x, y) => atStops(sweep, (1 - (x - 360) / 280 + y / 400) / 2)),
  );

  // A vignette to keep the corners dark, and a faint haze under the chest so it sits on something.
  canvas.fillAll(radial(320, 200, 0.75 * WIDTH, 0.75 * HEIGHT, [[0.55, rgb('#000000'), 0], [1, rgb('#000000'), 0.7]]));
  soft(ctx, BLUR_HAZE, 'normal', 0.12, (l) => l.fillEllipse(320, 350, 330, 34, solid(rgb('#4d78c9'))));
}

// ---------------------------------------------------------------------------
// The crate
// ---------------------------------------------------------------------------

/** How a part of the crate is moved (the lid slipping off in the lost picture); the identity for everything else. */
interface Move {
  fwd(p: Point): Point;
  inv(x: number, y: number): Point;
}
const STAY: Move = { fwd: (p) => p, inv: (x, y) => [x, y] };
const moved =
  (move: Move) =>
  (paint: Paint): Paint =>
  (x, y) => {
    const [ix, iy] = move.inv(x, y);
    return paint(ix, iy);
  };
function shove(dx: number, dy: number, degrees: number, about: Point): Move {
  const a = (degrees * Math.PI) / 180;
  const c = Math.cos(a);
  const s = Math.sin(a);
  return {
    fwd: ([x, y]) => [about[0] + (x - about[0]) * c - (y - about[1]) * s + dx, about[1] + (x - about[0]) * s + (y - about[1]) * c + dy],
    inv: (x, y) => {
      const px = x - dx - about[0];
      const py = y - dy - about[1];
      return [about[0] + px * c + py * s, about[1] - px * s + py * c];
    },
  };
}

/** The colours of the crate's parts: lit for a live crate, dull grey for a dead one. */
interface Look {
  led: Color;
  ledCore: Color;
  panelLight: Color;
  dead: boolean;
}

function drawBody(ctx: Ctx, look: Look, opened: boolean): void {
  const bodySide: Stop[] = [[0, rgb('#2a3444')], [1, rgb('#141a24')]];
  const bodyFront: Stop[] = [[0, rgb('#3a475b')], [1, rgb('#1f2733')]];
  poly(ctx, [[390, 240], [474, 222], [474, 318], [390, 338]], linear(0, 222, 0, 338, bodySide));
  poly(ctx, rect(156, 240, 234, 98), linear(0, 240, 0, 338, bodyFront));
  poly(ctx, rect(156, 240, 16, 98), solid(rgb('#1b222d')));
  poly(ctx, rect(374, 240, 16, 98), solid(rgb('#1b222d')));
  for (const y of [252, 274, 300, 324]) {
    ctx.canvas.fillEllipse(164, y, 2.4, 2.4, solid(rgb('#8794a8')));
    ctx.canvas.fillEllipse(382, y, 2.4, 2.4, solid(rgb('#8794a8')));
  }
  // The front plate with the coin stamped on it.
  rrect(ctx, 212, 256, 110, 60, 8, solid(rgb('#0f151d')));
  outline(ctx, 212, 256, 110, 60, 8, 3, solid(rgb('#5c6a80')));
  if (!look.dead) ctx.canvas.fillEllipse(267, 286, 46, 26, tierPaint.ground(ctx.col, 267, 286, 46, 26));
  zeiuCoin(ctx, 267, 284, 16, 1, 0, look.dead ? 0.8 : 1, look.dead);
  dotText(ctx, 'KOMA KM-3', 267, 304, solid(rgb('#8fa0b8')), 2);
  // The hazard label on the side.
  const hazard: Paint = (x, y) => {
    const a = (25 * Math.PI) / 180;
    const px = x * Math.cos(a) - y * Math.sin(a);
    const t = mod(px, 12);
    const edge = Math.min(Math.abs(t - 0), Math.abs(t - 6), Math.abs(t - 12));
    const k = Math.min(1, edge / 0.7);
    const isDark = t < 6;
    const dark = rgb('#14171d');
    const yellow = rgb('#f2c230');
    const c = isDark ? dark : yellow;
    const o = isDark ? yellow : dark;
    const m = 0.5 + 0.5 * k;
    return [c[0] * m + o[0] * (1 - m), c[1] * m + o[1] * (1 - m), c[2] * m + o[2] * (1 - m), 1];
  };
  poly(ctx, [[409, 261.2], [457, 252], [457, 286], [409, 295.2]], solid(rgb('#0d1117')));
  poly(ctx, [[411, 262.3], [455, 254], [455, 284], [411, 293]], look.dead ? (x, y) => darker(hazard(x, y)) : hazard);
  // The latch clamps.
  for (const x of [180, 338]) {
    rrect(ctx, x, 232, 24, 94, 5, solid(rgb('#0f151d')));
    rrect(ctx, x + 4, 236, 16, 30, 3, solid(rgb('#5c6a80')));
    if (!look.dead) soft(ctx, BLUR_SOFT, 'normal', 1, (l) => l.fillEllipse(x + 12, 312, 6, 6, solid(look.led)));
    ctx.canvas.fillEllipse(x + 12, 312, 3.4, 3.4, solid(look.ledCore));
  }
  // The vents along the bottom.
  for (let x = 184; x < 372; x += 9) rrect(ctx, x, 328, 5, 6, 1, solid(rgb('#0b0f15')));
  void opened;
}

const darker = (c: readonly [number, number, number, number]): readonly [number, number, number, number] => [c[0] * 0.45, c[1] * 0.45, c[2] * 0.5, c[3]];

/** The lid: shut on top of the body, or (with a `move`) slipped off. */
function drawLid(ctx: Ctx, look: Look, move: Move = STAY): void {
  const t = moved(move);
  const at = (pts: readonly Point[]): Point[] => pts.map((p) => move.fwd(p));
  const top: Stop[] = [[0, rgb('#8898b2')], [1, rgb('#5a6a84')]];
  const front: Stop[] = [[0, rgb('#6b7b95')], [1, rgb('#3f4d64')]];
  const sideStops: Stop[] = [[0, rgb('#4a5870')], [1, rgb('#2c384a')]];
  poly(ctx, at([[156, 200], [386, 200], [474, 180], [244, 180]]), t(linear(0, 200, 0, 180, top)));
  poly(ctx, at([[390, 200], [474, 180], [474, 222], [390, 240]]), t((x, y) => atStops(sideStops, ((x - 390) / 84 + (y - 180) / 60) / 2)));
  poly(ctx, at(rect(156, 200, 234, 40)), t(linear(0, 200, 0, 240, front)));
  // Recessed panels with indicator lights.
  poly(ctx, at(roundRectPoints(176, 210, 60, 20, 4)), t(solid(rgb('#141a23'))));
  poly(ctx, at(roundRectPoints(182, 215, 20, 4, 2)), t(solid(look.panelLight)));
  poly(ctx, at(roundRectPoints(182, 222, 34, 4, 2)), t(solid(rgb('#f2c230'))), look.dead ? 0.35 : 0.9);
  poly(ctx, at(roundRectPoints(262, 210, 102, 20, 4)), t(solid(rgb('#141a23'))));
  poly(ctx, at(roundRectPoints(266, 214, 94, 12, 3)), t(solid(look.panelLight)), look.dead ? 0.06 : 0.19);
  // The inset in the top face, and the highlight along the top edge.
  poly(ctx, at([[190, 196], [352, 196], [418, 182], [262, 182]]), t(solid(rgb('#111823'))), 0.55);
  const a = move.fwd([156, 200]);
  const b = move.fwd([386, 200]);
  ctx.canvas.strokeLine(a[0], a[1], b[0], b[1], 1.5, solid(rgb('#dfe8f7')), 0.5);
}

/** The light from the crack round the lid: spilling onto the metal, then the glowing crack itself. */
function seamGlow(ctx: Ctx): void {
  const { col, vivid } = ctx;
  const down: Stop[] = [[0, col, 0.9], [0.35, col, 0.32], [1, col, 0]];
  soft(ctx, 0, 'screen', 1, (l) => {
    l.fillPolygon(rect(156, 243, 234, 44), linear(0, 243, 0, 287, down));
    l.fillPolygon(rect(156, 200, 234, 40), linear(0, 240, 0, 200, down));
    l.fillPolygon([[390, 243], [474, 225], [474, 269], [390, 287]], linear(0, 225, 0, 287, down));
    l.fillPolygon([[390, 240], [474, 222], [474, 182], [390, 200]], linear(0, 240, 0, 182, down));
  });
  // The crack's colour eases from the glow colour to the vivid one and back, so it melts into the glow round it.
  const crack: Stop[] = [[0, col, 0.55], [0.18, vivid, 0.85], [0.6, vivid, 0.95], [1, vivid, 0.6]];
  const along = linear(156, 0, 474, 0, crack);
  const segments: [number, number, number, number][] = [
    [156, 240, 390, 240],
    [390, 240, 474, 222],
  ];
  for (const [x1, y1, x2, y2] of segments) {
    soft(ctx, BLUR_WIDE, 'screen', 0.75, (l) => l.strokeLine(x1, y1, x2, y2, 18, solid(col), 1, true));
    soft(ctx, BLUR_MEDIUM, 'screen', 0.7, (l) => l.strokeLine(x1, y1 + 0.5, x2, y2 + 0.5, 9, along, 1, true));
    soft(ctx, BLUR_FINE, 'screen', 0.95, (l) => l.strokeLine(x1, y1 + 0.5, x2, y2 + 0.5, 3.4, along, 1, true));
  }
  // Brighter where the crack turns the corners.
  for (const [x, y] of [[156, 240], [390, 240], [474, 222]] as const) {
    soft(ctx, BLUR_WIDE, 'screen', 0.75, (l) => l.fillEllipse(x, y, 9, 9, solid(col)));
  }
}

/**
 * Light from the middle of the chest leaking out through the cracks (front, right side and round the corners).
 * Every point of a crack sends its light straight outward from the middle, so it fans out from the chest instead
 * of lying in lines: the middle of the front crack sends short rays down, the ends spread sideways, and the corners spread widest.
 */
function closedGlow(ctx: Ctx): void {
  const { col, core } = ctx;
  soft(ctx, 0, 'screen', 0.85, (l) => l.fillEllipse(285, 352, 215, 22, tierPaint.ground(col, 285, 352, 215, 22)));

  const noise = (x: number): number => {
    const i = Math.floor(x);
    let f = x - i;
    f = f * f * (3 - 2 * f);
    return (CLOSED_NOISE[mod(i, 64)] as number) * (1 - f) + (CLOSED_NOISE[mod(i + 1, 64)] as number) * f;
  };
  const [cx, cy] = CENTER;
  type Ray = { x: number; y: number; dx: number; dy: number; length: number; strength: number };
  const rays: Ray[] = [];
  const outward = (px: number, py: number, length: number, strength: number): void => {
    const dx = px - cx;
    const dy = py - cy;
    const d = Math.hypot(dx, dy);
    rays.push({ x: px, y: py, dx: dx / d, dy: dy / d, length, strength });
  };
  const angled = (px: number, py: number, degrees: number, length: number, strength: number): void => {
    const a = (degrees * Math.PI) / 180;
    rays.push({ x: px, y: py, dx: Math.cos(a), dy: Math.sin(a), length, strength });
  };
  // Along the front crack and the right side crack, every point sends a ray straight out from the middle.
  for (let i = 0; i < 110; i++) {
    const t = i / 109;
    const x = 156 + 234 * t;
    const side = Math.abs(x - cx) / 159;
    outward(x, 240, 34 + 62 * (1 - side) * (0.6 + 0.8 * noise(t * 9)) + 80 * side ** 3 * (0.6 + 0.8 * noise(t * 9 + 30)), 0.15 + 0.14 * noise(t * 14 + 5));
  }
  for (let i = 0; i < 60; i++) {
    const t = i / 59;
    const bump = Math.exp(-(((t - 0.5) / 0.24) ** 2));
    outward(390 + 84 * t, 240 - 18 * t, 40 + 32 * noise(t * 7 + 20) + 58 * bump, 0.05 + 0.05 * noise(t * 11 + 9) + 0.13 * bump);
  }
  // Round the two ends, where the light spreads widest.
  for (let i = 0; i < 26; i++) angled(156, 240, 163 + (28 * i) / 25, 58 + 56 * noise(i * 0.7 + 40), 0.045 + 0.06 * noise(i * 0.9));
  for (let i = 0; i < 26; i++) angled(474, 222, -17 + (26 * i) / 25, 62 + 50 * noise(i * 0.7 + 60), 0.035 + 0.05 * noise(i * 0.9 + 3));
  // Out to the left, about 10 degrees above level, from just above the front-left corner.
  for (let i = 0; i < 30; i++) angled(156, 234 - (10 * i) / 29, 184 + (12 * i) / 29, 68 + 64 * noise(i * 0.6 + 80), 0.055 + 0.07 * noise(i * 0.8 + 7));

  soft(ctx, BLUR_SOFT, 'screen', 1, (l) => {
    for (const r of rays) {
      const nx = -r.dy;
      const ny = r.dx;
      const w0 = 1.6;
      const w1 = 3 + 0.06 * r.length;
      const ex = r.x + r.dx * r.length;
      const ey = r.y + r.dy * r.length;
      const stops: Stop[] = [[0, core, 0.95], [0.25, col, 0.6], [1, col, 0]];
      l.fillPolygon(
        [
          [r.x + nx * w0, r.y + ny * w0],
          [ex + nx * w1, ey + ny * w1],
          [ex - nx * w1, ey - ny * w1],
          [r.x - nx * w0, r.y - ny * w0],
        ],
        linear(r.x, r.y, ex, ey, stops),
        Math.min(1, r.strength),
      );
    }
  });
  sparkles(ctx, CLOSED_SPARKLES);
}

/**
 * Light from a crack we can't see, round the back-left of the chest. It is drawn BEHIND the chest, so the chest hides
 * where it starts: all that shows is a bloom at the edge and soft streaks fanning out past it.
 */
function hiddenLight(ctx: Ctx): void {
  const { col, core } = ctx;
  soft(ctx, BLUR_WIDE, 'screen', 0.3, (l) => l.fillEllipse(150, 228, 36, 26, solid(core)));
  soft(ctx, BLUR_WIDE, 'screen', 0.19, (l) => l.fillEllipse(140, 230, 72, 40, solid(col)));
  const [ox, oy] = [232, 232];
  const layers: { blur: number; w0: number; wk: number }[] = [
    { blur: BLUR_WIDE, w0: 5, wk: 0.09 },
    { blur: BLUR_MEDIUM, w0: 3, wk: 0.05 },
  ];
  layers.forEach(({ blur, w0, wk }, index) => {
    soft(ctx, blur, 'screen', 1, (l) => {
      for (const [degrees, length, strength] of HIDDEN_STREAKS[index] as readonly (readonly [number, number, number])[]) {
        const a = (degrees * Math.PI) / 180;
        const dx = Math.cos(a);
        const dy = Math.sin(a);
        const nx = -dy;
        const ny = dx;
        const w1 = w0 + wk * length;
        const ex = ox + dx * length;
        const ey = oy + dy * length;
        const stops: Stop[] = [[0, core, 0.9], [0.3, col, 0.5], [1, col, 0]];
        l.fillPolygon(
          [
            [ox + nx * w0, oy + ny * w0],
            [ex + nx * w1, ey + ny * w1],
            [ex - nx * w1, ey - ny * w1],
            [ox - nx * w0, oy - ny * w0],
          ],
          linear(ox, oy, ex, ey, stops),
          strength,
        );
      }
    });
  });
  sparkles(ctx, HIDDEN_SPARKLES);
}

/** The crate seen from the front-left, shut. */
function closedCrate(ctx: Ctx): void {
  const { col, core } = ctx;
  const look: Look = { led: col, ledCore: core, panelLight: col, dead: false };
  soft(ctx, BLUR_WIDE, 'normal', 0.55, (l) => l.fillEllipse(335, 344, 200, 20, solid(rgb('#000000'))));
  ctx.canvas.fillEllipse(330, 332, 230, 52, tierPaint.ground(col, 330, 332, 230, 52));
  // Light from inside, centred on the middle of the chest, haloing round its outline.
  soft(ctx, 0, 'screen', 1, (l) => l.fillEllipse(315, 262, 270, 150, tierPaint.halo(col, 315, 262, 270, 150)));
  hiddenLight(ctx);
  drawBody(ctx, look, false);
  drawLid(ctx, look);
  seamGlow(ctx);
  closedGlow(ctx);
}

/** The lid stands up on its back hinge; light pours out of the opening. */
function openedCrate(ctx: Ctx): void {
  const { col, core } = ctx;
  const look: Look = { led: col, ledCore: core, panelLight: col, dead: false };
  soft(ctx, BLUR_WIDE, 'normal', 0.55, (l) => l.fillEllipse(335, 344, 200, 20, solid(rgb('#000000'))));
  ctx.canvas.fillEllipse(330, 332, 250, 58, tierPaint.ground(col, 330, 332, 250, 58));

  // The lid, seen from inside, lit from below by the opening.
  poly(ctx, [[474, 222], [474, 80], [486, 77], [486, 219]], solid(rgb('#2a3444')));
  poly(ctx, rect(240, 80, 234, 142), solid(rgb('#232d3c')));
  const wash: Stop[] = [[0, core, 0.95], [0.35, col, 0.7], [1, col, 0.05]];
  poly(ctx, rect(240, 80, 234, 142), linear(0, 222, 0, 80, wash));
  rrect(ctx, 262, 120, 190, 80, 6, solid(rgb('#0f151d')), 0.55);
  outline(ctx, 262, 120, 190, 80, 6, 2, solid(rgb('#6b7b95')), 0.6);
  rrect(ctx, 292, 176, 60, 6, 3, solid(col), 0.9);
  rrect(ctx, 292, 188, 90, 4, 2, solid(rgb('#f2c230')), 0.8);
  ctx.canvas.strokeLine(240, 222, 474, 222, 3, solid(rgb('#8fa0b8')));
  ctx.canvas.strokeLine(240, 80, 474, 80, 2, solid(rgb('#aebbd0')), 0.7);

  // The body again, with the top open: a rim round a glowing opening.
  soft(ctx, BLUR_WIDE, 'normal', 0.55, (l) => l.fillEllipse(335, 344, 200, 20, solid(rgb('#000000'))));
  ctx.canvas.fillEllipse(330, 332, 230, 52, tierPaint.ground(col, 330, 332, 230, 52));
  drawBody(ctx, look, true);
  poly(ctx, [[156, 240], [390, 240], [474, 222], [240, 222]], solid(rgb('#2a3444')));
  poly(ctx, [[174, 238], [374, 238], [452, 224], [262, 224]], solid(col));
  poly(ctx, [[192, 236], [360, 236], [432, 226], [274, 226]], solid(core));
  burst(ctx);
}

/** The coin artwork shrunk by half again and again (96, 48, 24, 12 pixels across), so a small coin is drawn from a matching size. */
let coinLevels: { size: number; px: Float32Array }[] | undefined;

/** The coin's levels, with the colours multiplied by their opacity so shrinking does not leave dark fringes. */
function coinMips(): { size: number; px: Float32Array }[] {
  if (coinLevels) return coinLevels;
  const src = zeiucoinPixels();
  let px = new Float32Array(ZEIUCOIN_SIZE * ZEIUCOIN_SIZE * 4);
  for (let i = 0; i < ZEIUCOIN_SIZE * ZEIUCOIN_SIZE; i++) {
    const al = (src[i * 4 + 3] as number) / 255;
    px[i * 4] = ((src[i * 4] as number) / 255) * al;
    px[i * 4 + 1] = ((src[i * 4 + 1] as number) / 255) * al;
    px[i * 4 + 2] = ((src[i * 4 + 2] as number) / 255) * al;
    px[i * 4 + 3] = al;
  }
  const levels = [{ size: ZEIUCOIN_SIZE, px }];
  for (let size = ZEIUCOIN_SIZE / 2; size >= 12; size /= 2) {
    const prev = px;
    const ps = size * 2;
    px = new Float32Array(size * size * 4);
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        for (let c = 0; c < 4; c++) {
          const at = (xx: number, yy: number): number => prev[((yy * ps) + xx) * 4 + c] as number;
          px[(y * size + x) * 4 + c] = (at(x * 2, y * 2) + at(x * 2 + 1, y * 2) + at(x * 2, y * 2 + 1) + at(x * 2 + 1, y * 2 + 1)) / 4;
        }
      }
    }
    levels.push({ size, px });
  }
  coinLevels = levels;
  return levels;
}

/** The coin artwork at (u, v), each from -1 to 1 across the disc: red, green, blue, alpha (not premultiplied). */
function coinAt(level: { size: number; px: Float32Array }, u: number, v: number): [number, number, number, number] {
  const { size, px } = level;
  const fx = Math.min(size - 1, Math.max(0, ((u + 1) / 2) * size - 0.5));
  const fy = Math.min(size - 1, Math.max(0, ((v + 1) / 2) * size - 0.5));
  const x0 = Math.floor(fx);
  const y0 = Math.floor(fy);
  const x1 = Math.min(size - 1, x0 + 1);
  const y1 = Math.min(size - 1, y0 + 1);
  const tx = fx - x0;
  const ty = fy - y0;
  const out: [number, number, number, number] = [0, 0, 0, 0];
  for (let c = 0; c < 4; c++) {
    const p = (xx: number, yy: number): number => px[(yy * size + xx) * 4 + c] as number;
    out[c] = (p(x0, y0) * (1 - tx) + p(x1, y0) * tx) * (1 - ty) + (p(x0, y1) * (1 - tx) + p(x1, y1) * tx) * ty;
  }
  const al = out[3];
  if (al <= 0.0001) return [0, 0, 0, 0];
  return [out[0] / al, out[1] / al, out[2] / al, al];
}

/**
 * The zeiucoin, the currency: the coin artwork (see coin-art.ts) drawn as a round disc. `squash` is how edge-on it is
 * turned (1 is facing us, near 0 is on its edge), and `tilt` (degrees) turns it about the picture. It is a little
 * darker the further it is turned. `dead` makes it a dull grey one.
 */
function zeiuCoin(ctx: Ctx, x: number, y: number, radius: number, squash: number, tilt: number, opacity: number, dead = false): void {
  const a = (tilt * Math.PI) / 180;
  const cos = Math.cos(a);
  const sin = Math.sin(a);
  const ry = Math.max(0.5, radius * squash);
  const at = ([px, py]: Point): Point => [x + px * cos - py * sin, y + px * sin + py * cos];
  const disc = (dy = 0): Point[] => ellipsePoints(0, dy, radius, ry).map(at);
  const thickness = radius * 0.2 * (1 - squash * 0.6);
  const levels = coinMips();
  // Use the smallest copy that still has at least a pixel of artwork for each pixel drawn.
  const big = levels.filter((l) => l.size >= radius * 2);
  const level = big[big.length - 1] ?? (levels[0] as { size: number; px: Float32Array });
  const shade = (dead ? 0.6 : 1) * (0.78 + 0.22 * squash);
  const paint: Paint = (px, py) => {
    const dx = px - x;
    const dy = py - y;
    const [r, g, b, al] = coinAt(level, (dx * cos + dy * sin) / radius, (-dx * sin + dy * cos) / ry);
    if (dead) {
      const grey = 0.3 * r + 0.59 * g + 0.11 * b;
      return [grey * shade, grey * shade * 1.03, grey * shade * 1.1, al];
    }
    return [r * shade, g * shade, b * shade, al];
  };
  group(ctx.canvas, ctx.scratch, { opacity }, (l) => {
    // The edge of the coin, seen below the face as it tips.
    l.fillPolygon(disc(thickness), solid(rgb(dead ? '#3a404b' : '#9a6a0a')));
    l.fillPolygon(disc(), paint);
  });
}

/** Coins thrown out of the opening, each leaving a short soft trail in the light's colour behind it. */
function coinsFlyingOut(ctx: Ctx, from: Point, list: readonly Sparkle[]): void {
  const { col, core } = ctx;
  soft(ctx, BLUR_FINE, 'screen', 1, (l) => {
    for (const [x, y, size, opacity] of list) {
      const dx = x - from[0];
      const dy = y - from[1];
      const d = Math.hypot(dx, dy) || 1;
      const length = Math.min(30, d * 0.3) + size * 0.8;
      const tx = x - (dx / d) * length;
      const ty = y - (dy / d) * length;
      const w = 0.3 * size;
      const nx = (-dy / d) * w;
      const ny = (dx / d) * w;
      const stops: Stop[] = [[0, core, 0.6 * opacity], [0.35, col, 0.35 * opacity], [1, col, 0]];
      l.fillPolygon([[x + nx, y + ny], [x - nx, y - ny], [tx, ty]], linear(x, y, tx, ty, stops));
    }
  });
  list.forEach(([x, y, size, opacity], i) => {
    const r = Math.max(4, size * 0.95);
    soft(ctx, BLUR_WIDE, 'screen', 0.4 * opacity, (l) => l.fillEllipse(x, y, r * 1.3, r * 1.3, solid(col)));
    // Most face us so the Z shows; every third or so is turned well over.
    const squash = i % 3 === 2 ? 0.35 + 0.2 * Math.abs(Math.cos(i * 1.7)) : 0.72 + 0.28 * Math.abs(Math.cos(i * 1.7));
    zeiuCoin(ctx, x, y, r, squash, ((i * 37) % 60) - 30, opacity);
  });
}

/** Light spreading out from the opening in every direction above the chest. */
function burst(ctx: Ctx): void {
  const { col, core } = ctx;
  const ox = 315;
  const oy = 228;
  soft(ctx, 0, 'screen', 1, (l) => l.fillEllipse(ox, oy, 330, 210, tierPaint.halo(col, ox, oy, 330, 210)));
  const n1 = (x: number, layer: number): number => {
    const i = Math.floor(x);
    let f = x - i;
    f = f * f * (3 - 2 * f);
    const t = BURST_NOISE[layer] as readonly number[];
    return (t[mod(i, 64)] as number) * (1 - f) + (t[mod(i + 1, 64)] as number) * f;
  };
  // The light is uneven, but it changes gradually, so no single ray stands out.
  const intensity = (deg: number): number => {
    const v = 0.5 * n1(deg * 0.09 + 3, 0) + 0.3 * n1(deg * 0.35 + 11, 1) + 0.2 * n1(deg * 1.4 + 27, 2);
    return Math.max(0, (v - 0.3) / 0.5) ** 1.15;
  };
  const stops: Stop[] = [[0, core, 0.95], [0.5, col, 0.45], [1, col, 0]];
  const rayPaint = radial(ox, oy, 330, 330, stops);
  soft(ctx, BLUR_MEDIUM, 'screen', 1, (l) => {
    const N = 420;
    const step = 178 / N;
    for (let k = 0; k < N; k++) {
      const deg = -179 + k * step;
      const w = intensity(deg);
      if (w < 0.03) continue;
      const length = 170 + 170 * intensity(deg + 40);
      const a0 = ((deg - step * 1.1) * Math.PI) / 180;
      const a1 = ((deg + step * 1.1) * Math.PI) / 180;
      l.fillPolygon(
        [
          [ox, oy],
          [ox + length * Math.cos(a0), oy + length * Math.sin(a0) * 0.92],
          [ox + length * Math.cos(a1), oy + length * Math.sin(a1) * 0.92],
        ],
        rayPaint,
        Math.min(1, w * 0.55),
      );
    }
  });
  // A bright bloom sitting in the opening itself.
  soft(ctx, BLUR_WIDE, 'screen', 0.85, (l) => l.fillEllipse(ox, oy, 120, 18, solid(core)));
  soft(ctx, BLUR_HAZE, 'screen', 0.7, (l) => l.fillEllipse(ox, oy, 170, 34, solid(col)));
  coinsFlyingOut(ctx, [ox, oy], BURST_SPARKLES);
}

/** The lights are out: the lid has slipped off, the front is cracked, and dust hangs over it. */
function lostCrate(ctx: Ctx): void {
  const { col } = ctx;
  const look: Look = { led: rgb('#3a4252'), ledCore: rgb('#596274'), panelLight: rgb('#4a5568'), dead: true };
  soft(ctx, BLUR_WIDE, 'normal', 0.6, (l) => l.fillEllipse(335, 344, 200, 20, solid(rgb('#000000'))));
  drawBody(ctx, look, false);
  // The empty top where the lid used to sit.
  poly(ctx, [[156, 240], [390, 240], [474, 222], [240, 222]], solid(rgb('#2a3444')));
  poly(ctx, [[172, 238], [376, 238], [456, 224], [256, 224]], solid(rgb('#06080c')));
  // Cracks across the front, dark with a faint pale edge.
  const cracks: Point[][] = [
    [[300, 240], [292, 262], [304, 276], [296, 300], [306, 326]],
    [[222, 240], [230, 256], [222, 270]],
    [[350, 262], [362, 274], [354, 292], [366, 310]],
  ];
  for (const path of cracks) {
    ctx.canvas.strokePath(path.map(([x, y]) => [x + 1.2, y] as Point), 1.4, solid(rgb('#7f8ea6')), 0.35);
    ctx.canvas.strokePath(path, 2.2, solid(rgb('#05070b')), 0.9);
  }
  // The lid, slid off to the right and tilted, resting against the side.
  drawLid(ctx, look, shove(58, 30, 7, [315, 220]));
  // Broken bits on the ground.
  const shards: Point[][] = [
    [[120, 330], [138, 322], [146, 332], [128, 338]],
    [[500, 336], [520, 332], [526, 342], [508, 346]],
    [[92, 352], [104, 348], [108, 356], [96, 358]],
    [[548, 318], [560, 314], [562, 322]],
  ];
  for (const shard of shards) {
    poly(ctx, shard, solid(rgb('#1b222d')));
    ctx.canvas.strokePath([...shard, shard[0] as Point], 1, solid(rgb('#6b7b95')), 0.5);
  }
  // A last faint spark or two in the colour it would have been.
  soft(ctx, BLUR_SOFT, 'screen', 0.5, (l) => {
    for (const [x, y] of [[292, 214], [338, 206], [318, 190]] as const) l.fillEllipse(x, y, 2.4, 2.4, solid(col));
  });
  // Dust: low clouds round the base and a few thin wisps rising from the opening.
  const dust = solid(rgb('#9fb0c8'));
  soft(ctx, BLUR_HAZE, 'screen', 1, (l) => {
    l.fillEllipse(230, 338, 130, 20, dust, 0.14);
    l.fillEllipse(400, 344, 120, 18, dust, 0.12);
    l.fillEllipse(315, 356, 210, 16, dust, 0.09);
  });
  soft(ctx, BLUR_WIDE + 4, 'screen', 1, (l) => {
    l.fillEllipse(300, 200, 60, 26, dust, 0.2);
    l.fillEllipse(322, 168, 34, 44, dust, 0.14);
    l.fillEllipse(340, 122, 26, 40, dust, 0.09);
    l.fillEllipse(296, 92, 20, 34, dust, 0.06);
  });
}

/** Lets the rest of the bot run for a moment (drawing a picture takes about a second, so it is done in a few steps). */
const breathe = (): Promise<void> => new Promise((resolve) => setImmediate(resolve));

export async function renderCrate(state: CrateState = 'closed', tier: CrateTier = 'low'): Promise<Buffer> {
  const canvas = new Layer(WIDTH, HEIGHT);
  const scratch = new Layer(WIDTH, HEIGHT);
  const { col, core } = TIER_COLORS[tier];
  const ctx: Ctx = { canvas, scratch, col, core, vivid: vividOf(col) };
  backdrop(ctx);
  await breathe();
  if (state === 'closed') closedCrate(ctx);
  else if (state === 'opened') openedCrate(ctx);
  else lostCrate(ctx);
  await breathe();
  return encodePng(WIDTH, HEIGHT, toBytes(canvas));
}
