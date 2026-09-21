import { encodePng } from './png.js';
import type { CrateTier } from '../../lib/events/crate.js';
import { mix, shrinkRect, type Rgb } from './raster.js';

/*
 * Draws the point crate as a PNG: an old stone chest, mossy and cracked, its lid carved with a
 * ring of runes that glow emerald, standing on flagstones under a moonlit sky. It is drawn by
 * tracing a ray through every pixel against a few flat faces (the chest, its lid and the ground),
 * so the perspective is right and the carving on each face follows it. No image library, like
 * the other pictures (see png.ts). Three states: `closed` (waiting to be grabbed, the runes
 * glowing softly), `opened` (the lid is thrown back, the runes blaze and light pours out with gold
 * and drifting runes) and `lost` (nobody came: the chest has crumbled to rubble and dust). The
 * runes glow emerald for a small pile, violet for a middling one and red for a big one (`tier`).
 */

export type CrateState = 'closed' | 'opened' | 'lost';

const WIDTH = 640;
const HEIGHT = 400;
const SUPERSAMPLE = 2;

type V3 = [number, number, number];
const add = (a: V3, b: V3): V3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const scale = (a: V3, k: number): V3 => [a[0] * k, a[1] * k, a[2] * k];
const dot = (a: V3, b: V3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norm = (a: V3): V3 => scale(a, 1 / Math.hypot(a[0], a[1], a[2]));

const clamp01 = (x: number): number => Math.min(1, Math.max(0, x));
const smooth = (a: number, b: number, x: number): number => {
  const t = clamp01((x - a) / (b - a));
  return t * t * (3 - 2 * t);
};
const fract = (x: number): number => x - Math.floor(x);
const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

// ---------------------------------------------------------------------------
// Noise (the same every time: no Math.random, so the picture never changes between runs)
// ---------------------------------------------------------------------------

function hash(ix: number, iy: number, seed: number): number {
  let h = Math.imul(ix, 374761393) + Math.imul(iy, 668265263) + Math.imul(seed, 1442695041);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967295;
}

function vnoise(x: number, y: number, seed: number): number {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const fx = x - ix;
  const fy = y - iy;
  const sx = fx * fx * (3 - 2 * fx);
  const sy = fy * fy * (3 - 2 * fy);
  const a = hash(ix, iy, seed);
  const b = hash(ix + 1, iy, seed);
  const c = hash(ix, iy + 1, seed);
  const d = hash(ix + 1, iy + 1, seed);
  return lerp(lerp(a, b, sx), lerp(c, d, sx), sy);
}

function fbm(x: number, y: number, seed: number, octaves = 4): number {
  let sum = 0;
  let amp = 0.5;
  let freq = 1;
  for (let i = 0; i < octaves; i++) {
    sum += amp * vnoise(x * freq, y * freq, seed + i * 17);
    amp *= 0.5;
    freq *= 2;
  }
  return sum / (1 - Math.pow(0.5, octaves));
}

// ---------------------------------------------------------------------------
// The scene: a stone chest with a lid, seen from a little above and to the side
// ---------------------------------------------------------------------------

const TURN = Math.PI + 0.58; // how the chest is turned toward the viewer
const PITCH = 0.16; // how far the camera looks down
const DISTANCE = 9.8;
const FOCAL = WIDTH * 1.4;
const LIFT = 0; // moves the scene up or down in the picture (negative is down)
/** How far down the picture the camera's straight-ahead point is (0.5 is the middle): lower puts more sky above the horizon. */
const EYE_LEVEL = 0.57;
const CENTER: V3 = [0, 1.25, 0];

const HALF_X = 1.4; // half the chest's length and depth, in meters
const HALF_Z = 1.0;
const BASE_HEIGHT = 1.1;
const LID_HEIGHT = 0.55;

const cosT = Math.cos(TURN);
const sinT = Math.sin(TURN);
const cosP = Math.cos(PITCH);
const sinP = Math.sin(PITCH);

/** A direction from the model's space to the camera's (x right, y up, z away from the viewer). */
function turn(v: V3): V3 {
  const x = v[0] * cosT + v[2] * sinT;
  const z = -v[0] * sinT + v[2] * cosT;
  return [x, v[1] * cosP + z * sinP, -v[1] * sinP + z * cosP];
}
const toCamera = (p: V3): V3 => add(turn(sub(p, CENTER)), [0, LIFT, DISTANCE]);

/** The model's direction for a direction in the camera's space (the reverse of `turn`). */
function unturn(c: V3): V3 {
  const y = c[1] * cosP - c[2] * sinP;
  const z = c[1] * sinP + c[2] * cosP;
  return [c[0] * cosT - z * sinT, y, c[0] * sinT + z * cosT];
}

/** How a part of the model is moved before it is drawn (the lid swinging open); the identity for everything else. */
interface Move {
  point(p: V3): V3;
  dir(d: V3): V3;
}
const STAY: Move = { point: (p) => p, dir: (d) => d };

/** The lid swung open about its back edge by `angle` radians (0 is shut, a little over a quarter turn leans it back). */
function swing(angle: number): Move {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  const hinge: V3 = [0, BASE_HEIGHT, -HALF_Z];
  const dir = (d: V3): V3 => [d[0], d[1] * c + d[2] * s, -d[1] * s + d[2] * c];
  return { point: (p) => add(hinge, dir(sub(p, hinge))), dir };
}
const OPEN_LID = swing(1.98);

type FaceKind = 'body' | 'rim' | 'lidSide' | 'lidTop' | 'lidInner';

interface Face {
  origin: V3;
  u: V3;
  v: V3;
  /** The outward direction, in the camera's space. */
  normal: V3;
  uLen: number;
  vLen: number;
  flipU: boolean;
  kind: FaceKind;
  seed: number;
}

/** One side of a box, seen from outside: `u` runs to the right, `v` runs down (or, for a top, toward the viewer). */
function makeFace(kind: FaceKind, origin: V3, u: V3, v: V3, normal: V3, seed: number, move: Move): Face {
  const uCam = turn(move.dir(u));
  return {
    origin: toCamera(move.point(origin)),
    u: uCam,
    v: turn(move.dir(v)),
    normal: norm(turn(move.dir(normal))),
    uLen: Math.hypot(...u),
    vLen: Math.hypot(...v),
    flipU: uCam[0] < 0,
    kind,
    seed,
  };
}

interface BoxKinds {
  side: FaceKind;
  top: FaceKind;
  /** Given, the underside is made too (for a lid that is turned over). */
  bottom?: FaceKind;
}

/** The four sides and the top (and maybe the bottom) of a box standing on `y0`, with half-length HALF_X, half-depth HALF_Z and height h. */
function boxFaces(kinds: BoxKinds, y0: number, h: number, seed: number, move: Move = STAY): Face[] {
  const up: V3 = [0, 1, 0];
  const faces: Face[] = [];
  const sides: { n: V3; half: number; wide: number }[] = [
    { n: [0, 0, 1], half: HALF_Z, wide: HALF_X },
    { n: [0, 0, -1], half: HALF_Z, wide: HALF_X },
    { n: [1, 0, 0], half: HALF_X, wide: HALF_Z },
    { n: [-1, 0, 0], half: HALF_X, wide: HALF_Z },
  ];
  sides.forEach(({ n, half, wide }, index) => {
    const right = cross(up, n);
    const origin = add(add([0, y0 + h, 0], scale(n, half)), scale(right, -wide));
    faces.push(makeFace(kinds.side, origin, scale(right, 2 * wide), [0, -h, 0], n, seed + index, move));
  });
  // The top: `u` to the right (+x), `v` toward +z.
  faces.push(makeFace(kinds.top, [-HALF_X, y0 + h, -HALF_Z], [2 * HALF_X, 0, 0], [0, 0, 2 * HALF_Z], up, seed + 9, move));
  if (kinds.bottom) {
    // The underside: `v` runs from the back edge (the hinge) to the front.
    faces.push(makeFace(kinds.bottom, [-HALF_X, y0, -HALF_Z], [2 * HALF_X, 0, 0], [0, 0, 2 * HALF_Z], [0, -1, 0], seed + 10, move));
  }
  return faces;
}

const baseFaces = boxFaces({ side: 'body', top: 'rim' }, 0, BASE_HEIGHT, 100);
const closedFaces = [...baseFaces, ...boxFaces({ side: 'lidSide', top: 'lidTop' }, BASE_HEIGHT, LID_HEIGHT, 200)];
const openFaces = [...baseFaces, ...boxFaces({ side: 'lidSide', top: 'lidTop', bottom: 'lidInner' }, BASE_HEIGHT, LID_HEIGHT, 200, OPEN_LID)];

const groundNormal = norm(turn([0, 1, 0]));
const groundPoint = toCamera([0, 0, 0]);

// The moon is upper left, a little toward the viewer.
const LIGHT = norm([-0.55, 0.8, -0.45]);
const LIGHT_MODEL = unturn(LIGHT);
/** Moonlight is cool: it tints everything it falls on a little blue. */
const MOON: Rgb = [0.9, 0.97, 1.1];

// ---------------------------------------------------------------------------
// Runes
// ---------------------------------------------------------------------------

/** How the runes shine: their colour, the paler colour of the brightest part, the light they throw about, and tints for the lit stone. */
interface Palette {
  glow: Rgb;
  core: Rgb;
  light: Rgb;
  /** Added to the sides of an open chest, which the light falls on. */
  spill: Rgb;
  /** The lit lining of the open lid. */
  lining: Rgb;
}
const PALETTES: Record<CrateTier, Palette> = {
  low: { glow: [70, 255, 170], core: [214, 255, 236], light: [186, 255, 224], spill: [70, 170, 120], lining: [96, 168, 146] },
  mid: { glow: [170, 105, 255], core: [232, 214, 255], light: [196, 156, 255], spill: [120, 80, 170], lining: [128, 104, 170] },
  high: { glow: [255, 60, 50], core: [255, 200, 184], light: [255, 130, 108], spill: [180, 70, 50], lining: [176, 100, 84] },
};

type Seg = readonly [number, number, number, number];
/** Old alphabet letters, each a few straight strokes inside a 0-1 box (x to the right, y down). */
const GLYPHS: Seg[][] = [
  [[0.25, 0, 0.25, 1], [0.25, 0.25, 0.8, 0], [0.25, 0.55, 0.8, 0.3]],
  [[0.2, 1, 0.2, 0], [0.2, 0, 0.8, 0.25], [0.8, 0.25, 0.8, 1]],
  [[0.25, 0, 0.25, 1], [0.25, 0.25, 0.75, 0.5], [0.75, 0.5, 0.25, 0.75]],
  [[0.2, 0, 0.2, 1], [0.2, 0.1, 0.8, 0.35], [0.2, 0.4, 0.8, 0.65]],
  [[0.2, 0, 0.2, 1], [0.2, 0, 0.75, 0.2], [0.75, 0.2, 0.2, 0.5], [0.2, 0.5, 0.8, 1]],
  [[0.75, 0.1, 0.25, 0.5], [0.25, 0.5, 0.75, 0.9]],
  [[0.15, 0.05, 0.85, 0.95], [0.85, 0.05, 0.15, 0.95]],
  [[0.2, 0, 0.2, 1], [0.8, 0, 0.8, 1], [0.2, 0.3, 0.8, 0.7]],
  [[0.5, 0, 0.5, 1], [0.2, 0.35, 0.8, 0.6]],
  [[0.7, 0, 0.3, 0.35], [0.3, 0.35, 0.7, 0.65], [0.7, 0.65, 0.3, 1]],
  [[0.5, 0, 0.5, 1], [0.2, 0.3, 0.5, 0], [0.8, 0.3, 0.5, 0]],
  [[0.5, 0, 0.9, 0.5], [0.9, 0.5, 0.5, 1], [0.5, 1, 0.1, 0.5], [0.1, 0.5, 0.5, 0]],
  [[0.2, 0.1, 0.2, 0.9], [0.8, 0.1, 0.8, 0.9], [0.2, 0.1, 0.8, 0.9], [0.8, 0.1, 0.2, 0.9]],
];
const DIAMOND = 11;
const CROSSED = 6;
const glyphOf = (n: number): number => Math.abs(Math.floor(n)) % GLYPHS.length;

function segDistance(px: number, py: number, ax: number, ay: number, bx: number, by: number): number {
  const dx = bx - ax;
  const dy = by - ay;
  const t = clamp01(((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy));
  return Math.hypot(px - (ax + dx * t), py - (ay + dy * t));
}

/** How far (lx, ly), in the glyph's own 0-1 box, is from the nearest stroke of glyph `g`. */
function glyphDistance(lx: number, ly: number, g: number): number {
  let best = Infinity;
  for (const s of GLYPHS[g] as Seg[]) best = Math.min(best, segDistance(lx, ly, s[0], s[1], s[2], s[3]));
  return best;
}

/** How brightly a stroke shines `m` meters away from it: a bright core and a soft halo (a bit over 1 in the core). */
const strokeGlow = (m: number): number => (1 - smooth(0.02, 0.038, m)) * 1.15 + 0.5 * Math.exp(-(m * m) / 0.0028);

/** The glow of glyph `g` drawn `size` meters tall, centred at (cx, cy), at the point (x, y) (meters on a face). */
function glyphGlow(x: number, y: number, cx: number, cy: number, size: number, g: number): number {
  const lx = (x - cx) / size + 0.5;
  const ly = (y - cy) / size + 0.5;
  if (lx < -0.5 || lx > 1.5 || ly < -0.5 || ly > 1.5) return 0;
  return strokeGlow(glyphDistance(lx, ly, g) * size);
}

/** The glow of a circle of radius `r` centred at (cx, cy), with `ticks` short marks outside it. */
function ringGlow(x: number, y: number, cx: number, cy: number, r: number, ticks = 0): number {
  const dx = x - cx;
  const dy = y - cy;
  const dist = Math.hypot(dx, dy);
  if (Math.abs(dist - r) > 0.3) return 0;
  let glow = strokeGlow(Math.abs(dist - r));
  if (ticks > 0 && dist > r + 0.04 && dist < r + 0.09) {
    const across = fract((Math.atan2(dy, dx) / (2 * Math.PI)) * ticks);
    if (Math.abs(across - 0.5) < 0.06) glow = Math.max(glow, 1);
  }
  return glow;
}

// ---------------------------------------------------------------------------
// Paint
// ---------------------------------------------------------------------------

/** What a face looks like at one point: its stone, and how much of the rune light is shining there. */
interface Paint {
  color: Rgb;
  glow: number;
}

const STONE_DARK: Rgb = [70, 76, 86];
const MORTAR: Rgb = [30, 34, 40];

/** Weathered stone laid in courses `course` meters high, in blocks of different lengths. */
function stoneBlocks(x: number, y: number, seed: number, course: number): Rgb {
  const row = Math.floor(y / course);
  const inRow = y / course - row;
  const length = 0.62 + 0.45 * hash(row, 0, seed);
  const shift = hash(row, 1, seed) * length;
  const bx = (x + shift) / length;
  const col = Math.floor(bx);
  const inBlock = bx - col;
  const tone = hash(col, row, seed + 5);
  const grain = fbm(x * 9, y * 9, seed + 7);
  let color = mix([94, 102, 112], [132, 136, 138], clamp01(tone * 0.65 + grain * 0.35));
  const joint = Math.min(inBlock * length, (1 - inBlock) * length, inRow * course, (1 - inRow) * course);
  // Edges of each block are worn dark, the middle catches the light.
  color = mix(color, STONE_DARK, 0.5 * (1 - smooth(0, 0.07, joint)));
  if (joint < 0.014) color = mix(color, MORTAR, 0.9);
  // Hairline cracks and chips.
  if (Math.abs(fbm(x * 5 + seed, y * 5, seed + 9) - 0.5) < 0.011) color = mix(color, [26, 30, 36], 0.8);
  if (fbm(x * 40, y * 40, seed + 12) > 0.8) color = mix(color, STONE_DARK, 0.6);
  return color;
}

/** Moss creeping over the stone where `amount` (0 to 1) is high, in clumps. */
function withMoss(color: Rgb, amount: number, x: number, y: number, seed: number): Rgb {
  const clump = fbm(x * 7 + 3, y * 7, seed + 21);
  const k = clamp01((amount * 0.6 + clump - 0.7) * 3);
  if (k <= 0) return color;
  return mix(color, mix([46, 76, 40], [96, 128, 64], fbm(x * 20, y * 20, seed + 22)), k * 0.92);
}

/** A round carved medallion of smooth stone at (cx, cy) with a glowing ring and rune. */
function medallion(color: Rgb, x: number, y: number, cx: number, cy: number, radius: number, glyph: number, seed: number): Paint {
  const r = Math.hypot(x - cx, y - cy);
  let out = color;
  if (r < radius + 0.03) {
    const grain = fbm(x * 10, y * 10, seed + 11);
    out = mix([106, 112, 118], [134, 140, 142], smooth(0.2, 0.8, grain));
    out = mix(out, [80, 86, 96], smooth(radius * 0.55, radius, r) * 0.55);
    if (r > radius - 0.02) out = mix(out, MORTAR, 0.9);
  }
  const flicker = 0.85 + 0.15 * fbm(x * 6, y * 6, seed + 13);
  const shine = Math.max(ringGlow(x, y, cx, cy, radius * 0.72, 12), glyphGlow(x, y, cx, cy, radius * 0.9, glyph));
  return { color: out, glow: shine * flicker * (1 - smooth(radius * 0.95, radius * 1.15, r)) };
}

/** The sides of the lower half of the chest. */
function paintBody(u: number, v: number, w: number, h: number, seed: number): Paint {
  const x = u * w;
  const y = v * h;
  let color = stoneBlocks(x, y, seed, 0.35);
  // Squared corner posts, with a groove down their inner edge.
  const edge = Math.min(x, w - x);
  if (edge < 0.17) {
    color = mix([86, 92, 100], [118, 122, 126], fbm(x * 7, y * 7, seed + 2));
    if (edge > 0.156) color = mix(color, MORTAR, 0.9);
  }
  // The cornice along the top.
  if (y < 0.11) {
    color = mix([120, 126, 130], [142, 146, 146], fbm(x * 8, y * 8, seed + 3));
    if (y > 0.097) color = mix(color, MORTAR, 0.9);
  }
  color = withMoss(color, smooth(h - 0.5, h, y), x, y, seed);
  if (w > 2.4) {
    const seal = medallion(color, x, y, w / 2, h * 0.52, 0.44, DIAMOND, seed);
    // A rune either side of it, worn: some shine fainter.
    let glow = seal.glow;
    for (const side of [0.19, 0.81]) {
      const glyph = glyphOf(hash(Math.round(side * 10), 0, seed) * 40);
      glow = Math.max(glow, glyphGlow(x, y, w * side, h * 0.52, 0.42, glyph) * (side < 0.5 ? 1 : 0.55));
    }
    return { color: seal.color, glow };
  }
  return medallion(color, x, y, w / 2, h * 0.52, 0.34, CROSSED, seed);
}

/** The sides of the lid: a dark frieze of runes running round it. */
function paintLidSide(u: number, v: number, w: number, h: number, seed: number): Paint {
  const x = u * w;
  const y = v * h;
  let color = stoneBlocks(x, y, seed, 0.28);
  const edge = Math.min(x, w - x);
  if (edge < 0.17) {
    color = mix([88, 94, 102], [120, 124, 128], fbm(x * 7, y * 7, seed + 2));
    if (edge > 0.156) color = mix(color, MORTAR, 0.9);
  }
  // The frieze: a recessed dark band with a rune in each cell.
  let glow = 0;
  if (y > 0.11 && y < 0.44 && edge > 0.17) {
    color = mix([46, 52, 60], [58, 64, 72], fbm(x * 8, y * 8, seed + 4));
    if (y < 0.125 || y > 0.425) color = mix(color, MORTAR, 0.9);
    const cell = Math.floor(x / 0.36);
    const alive = hash(cell, 3, seed) > 0.18;
    glow = glyphGlow(x, y, (cell + 0.5) * 0.36, 0.275, 0.2, glyphOf(hash(cell, 4, seed) * 60)) * (alive ? 1 : 0.12);
  }
  // The lip along the bottom edge, where the lid sits on the chest.
  if (y > h - 0.07) {
    color = mix([124, 128, 132], [96, 102, 108], fbm(x * 8, y * 8, seed + 5));
    if (y < h - 0.058) color = mix(color, MORTAR, 0.9);
  }
  return { color, glow };
}

/** The top of the lid: a slab with a great ring of runes carved in it. */
function paintLidTop(u: number, v: number, w: number, h: number, seed: number): Paint {
  const x = u * w;
  const y = v * h;
  const grain = fbm(x * 8, y * 8, seed);
  let color = mix([100, 108, 116], [134, 138, 140], smooth(0.25, 0.8, grain));
  if (Math.abs(fbm(x * 4 + seed, y * 4, seed + 9) - 0.5) < 0.012) color = mix(color, [26, 30, 36], 0.8);
  const edge = Math.min(x, w - x, y, h - y);
  // A raised, lighter border round the edge with a groove inside it.
  if (edge < 0.11) color = mix([128, 134, 136], [150, 154, 154], grain);
  if (edge > 0.1 && edge < 0.115) color = mix(color, MORTAR, 0.9);
  color = withMoss(color, 0.6 * (1 - smooth(0, 0.55, edge)), x, y, seed);
  const cx = w / 2;
  const cy = h / 2;
  const r = Math.hypot(x - cx, y - cy);
  // The seal: smooth stone inside the outer ring.
  if (r < 0.7) color = mix(color, mix([112, 118, 124], [96, 102, 110], smooth(0.3, 0.7, r)), 0.85);
  let glow = Math.max(ringGlow(x, y, cx, cy, 0.62, 16), ringGlow(x, y, cx, cy, 0.3), glyphGlow(x, y, cx, cy, 0.34, DIAMOND));
  // Eight runes between the two rings.
  for (let i = 0; i < 8; i++) {
    const angle = (i / 8) * Math.PI * 2 + Math.PI / 8;
    glow = Math.max(glow, glyphGlow(x, y, cx + Math.cos(angle) * 0.46, cy + Math.sin(angle) * 0.46, 0.17, glyphOf(hash(i, 1, seed) * 60)));
  }
  return { color, glow: glow * (0.85 + 0.15 * fbm(x * 6, y * 6, seed + 13)) * (1 - smooth(0.62, 0.8, r) * 0.6) };
}

/** The inside of the open lid: dark stone, bathed in light from the chest, the seal glowing on it. */
function paintLidInner(u: number, v: number, w: number, h: number, seed: number, pal: Palette): Paint {
  const x = u * w;
  const y = v * h;
  const grain = fbm(x * 10, y * 10, seed);
  // Brightest near the hinge end, where the light from the chest is nearest.
  const lit = 1 - 0.55 * smooth(0, 1, v);
  let color = mix([18, 28, 32], pal.lining, lit * (0.35 + 0.5 * grain));
  const edge = Math.min(x, w - x, y, h - y);
  if (edge < 0.11) color = mix(color, [176, 236, 214], 0.35 * lit);
  const cx = w / 2;
  const cy = h / 2;
  const glow = Math.max(ringGlow(x, y, cx, cy, 0.62, 16), ringGlow(x, y, cx, cy, 0.3), glyphGlow(x, y, cx, cy, 0.34, DIAMOND));
  return { color, glow: glow * 1.1 };
}

/** The top edge of the chest, seen when the lid is open: a stone rim round a heap of gold. */
function paintRim(u: number, v: number, w: number, h: number, seed: number, pal: Palette): Paint {
  const x = u * w;
  const y = v * h;
  const edge = Math.min(x, w - x, y, h - y);
  if (edge < 0.15) {
    const stone = mix([116, 122, 126], [148, 152, 152], fbm(x * 9, y * 9, seed));
    return { color: edge > 0.135 ? mix(stone, MORTAR, 0.85) : stone, glow: 0 };
  }
  // The heap of gold: coins catching the light.
  const coins = fbm(x * 15, y * 15, seed + 3);
  const crevice = fbm(x * 34, y * 34, seed + 4);
  const centre = 1 - smooth(0, 0.9, Math.hypot((x - w / 2) / (w / 2), (y - h / 2) / (h / 2)));
  let color: Rgb = mix([204, 148, 40], [255, 226, 122], coins * 0.6 + centre * 0.5);
  color = mix(color, [96, 62, 16], 0.6 * (1 - smooth(0.28, 0.5, crevice)));
  if (crevice > 0.72) color = mix(color, [255, 252, 224], (crevice - 0.72) * 3);
  return { color: mix(color, pal.core, centre * 0.3), glow: 0 };
}

// ---------------------------------------------------------------------------
// Sky and ground
// ---------------------------------------------------------------------------

const HAZE: Rgb = [84, 100, 122];

/** The colour of the sky at the picture's (x, y), both 0 to 1: deep blue night, a moon, a few stars and a misty horizon. */
function skyColor(x: number, y: number): Rgb {
  const t = smooth(0, 0.62, y);
  let color = mix([14, 20, 44], [104, 120, 150], t);
  // Thin cloud drifting across it.
  const cloud = fbm(x * 3.2 + 1.7, y * 6 + 0.3, 40, 5);
  const veil = smooth(0.45, 0.85, cloud) * (1 - smooth(0.3, 0.6, y));
  color = mix(color, [52, 60, 86], 0.55 * veil);
  // Stars, fewer where the cloud is and near the horizon.
  if (hash(Math.floor(x * WIDTH), Math.floor(y * HEIGHT), 55) > 0.9982) {
    color = mix(color, [232, 238, 255], 0.85 * (1 - smooth(0.05, 0.4, y)) * (1 - veil));
  }
  // The moon, with a halo.
  const moon = Math.hypot((x - 0.17) * 1.6, y - 0.15);
  color = mix(color, [238, 242, 252], 1 - smooth(0.042, 0.047, moon));
  const halo = Math.exp(-moon * moon * 90) * 0.4;
  return [color[0] + halo * 70, color[1] + halo * 84, color[2] + halo * 116];
}

/** The far hills at the horizon: how high they reach above it, in picture heights, at x. */
function hillHeight(x: number): number {
  return 0.03 + 0.055 * fbm(x * 4.2, 0.5, 60, 4);
}

/** The flagstones the chest stands on, at world position (wx, wz) and `dist` meters away. */
function paintGround(wx: number, wz: number, dist: number): Rgb {
  const slab = 2.3;
  const row = Math.floor(wz / slab + 0.1);
  const off = hash(row, 0, 50) * slab;
  const cell = Math.floor((wx + off) / slab);
  const gx = fract((wx + off) / slab);
  const gz = fract(wz / slab + 0.1);
  const seam = Math.min(gx, 1 - gx, gz, 1 - gz) * slab;
  const grain = fbm(wx * 3.1, wz * 3.1, 70, 5);
  let color: Rgb = mix([66, 74, 84], [106, 112, 116], clamp01(0.55 * hash(cell, row, 51) + 0.45 * smooth(0.25, 0.8, grain)));
  // Seams between the stones, cracks, and moss growing in both.
  color = mix(color, [24, 28, 34], 0.85 * (1 - smooth(0.02, 0.08, seam)));
  if (Math.abs(fbm(wx * 1.6 + 4, wz * 1.6, 72, 4) - 0.5) < 0.012) color = mix(color, [24, 28, 34], 0.8);
  const patch = fbm(wx * 0.7 + 5, wz * 0.7, 75, 4);
  const moss = clamp01((patch - 0.5) * 4) * 0.8 + (seam < 0.14 ? clamp01((fbm(wx * 3, wz * 3, 76, 3) - 0.45) * 4) * 0.7 : 0);
  color = mix(color, mix([44, 72, 38], [90, 122, 60], fbm(wx * 9, wz * 9, 77, 3)), Math.min(1, moss));
  // Far away everything fades into the mist.
  return mix(color, HAZE, smooth(6, 30, dist) * 0.85);
}

/** A rubble stone lying on the ground where the chest was: position, size and how it is turned. */
interface Chunk {
  x: number;
  z: number;
  angle: number;
  length: number;
  depth: number;
  tone: number;
  /** A rune still glowing on it, or -1. */
  rune: number;
}
/** The way the camera looks along the ground, in the model's space: a raised thing seems to sit this way from where it stands. */
const AWAY: [number, number] = (() => {
  const d = unturn([0, 0, 1]);
  const len = Math.hypot(d[0], d[2]);
  return [d[0] / len, d[2] / len];
})();
/** How far along the ground a stone one meter tall seems to lean toward the far side, seen from the camera. */
const LEAN = 3.2;

const CHUNKS: Chunk[] = Array.from({ length: 46 }, (_, i) => {
  const angle = hash(i, 1, 300) * Math.PI * 2;
  const radius = 0.1 + 2.5 * Math.pow(hash(i, 2, 300), 1.2);
  // Bigger stones toward the middle, where the walls fell in.
  const size = (0.25 + 0.6 * hash(i, 4, 300)) * (1.3 - radius / 3.2);
  return {
    x: Math.cos(angle) * radius * 1.15,
    z: Math.sin(angle) * radius * 0.9,
    angle: hash(i, 3, 300) * Math.PI,
    length: size,
    depth: size * (0.55 + 0.4 * hash(i, 6, 300)),
    tone: hash(i, 5, 300),
    rune: hash(i, 7, 300) > 0.72 ? glyphOf(hash(i, 8, 300) * 60) : -1,
  };
}).sort((a, b) => (b.x * AWAY[0] + b.z * AWAY[1]) - (a.x * AWAY[0] + a.z * AWAY[1])); // far ones first, so near ones cover them
const CHUNK_SHADOW: [number, number] = (() => {
  const len = Math.hypot(LIGHT_MODEL[0], LIGHT_MODEL[2]);
  return [(-LIGHT_MODEL[0] / len) * 0.14, (-LIGHT_MODEL[2] / len) * 0.14];
})();

const inChunk = (dx: number, dz: number, chunk: Chunk): { along: number; across: number } | null => {
  const along = dx * Math.cos(chunk.angle) + dz * Math.sin(chunk.angle);
  const across = -dx * Math.sin(chunk.angle) + dz * Math.cos(chunk.angle);
  return Math.abs(along) < chunk.length / 2 && Math.abs(across) < chunk.depth / 2 ? { along, across } : null;
};

/** The rubble, dust-stain and glowing rune scraps on the ground where the chest was; `paving` is what is there already. */
function paintWreck(paving: Rgb, wx: number, wz: number): Paint {
  const wobble = fbm(wx * 1.4 + 9, wz * 1.4, 310, 4);
  const radius = Math.hypot(wx / 1.9, wz / 1.45) * (0.75 + 0.5 * wobble);
  let color = mix(paving, [28, 30, 36], 0.55 * (1 - smooth(0.5, 1.4, radius)));
  // Cracks in the flagstones spreading out from where it fell.
  if (radius < 1.4 && Math.abs(fbm(wx * 4 + 2, wz * 4, 320, 4) - 0.5) < 0.014) color = mix(color, [14, 16, 20], 0.85);
  let glow = 0;
  for (const chunk of CHUNKS) {
    if (Math.abs(wx - chunk.x) > 2.2 || Math.abs(wz - chunk.z) > 2.2) continue;
    const height = chunk.depth * 0.75;
    const lift = LEAN * height;
    if (inChunk(wx - chunk.x - CHUNK_SHADOW[0] * height * 4, wz - chunk.z - CHUNK_SHADOW[1] * height * 4, chunk)) color = mix(color, [8, 10, 14], 0.55);
    // The top of the stone seems shifted away by its height; below it, its sides down to the ground.
    const top = inChunk(wx - chunk.x - AWAY[0] * lift, wz - chunk.z - AWAY[1] * lift, chunk);
    let side = null as { along: number; across: number } | null;
    let sideDepth = 0;
    if (!top) {
      for (const t of [0.9, 0.8, 0.7, 0.6, 0.5, 0.4, 0.3, 0.2, 0.1, 0]) {
        side = inChunk(wx - chunk.x - AWAY[0] * lift * t, wz - chunk.z - AWAY[1] * lift * t, chunk);
        if (side) {
          sideDepth = t;
          break;
        }
      }
    }
    if (top) {
      // Lit from the upper left, darker at its far edges.
      const shade = 0.72 + 0.5 * (0.5 - (top.along / chunk.length) * 0.5 - (top.across / chunk.depth) * 0.5);
      const edge = Math.min(chunk.length / 2 - Math.abs(top.along), chunk.depth / 2 - Math.abs(top.across));
      let stone = mix([84, 90, 98], [122, 126, 128], chunk.tone);
      stone = mix(stone, [140, 146, 148], 0.5 * (1 - smooth(0, 0.03, edge)));
      color = [stone[0] * shade * MOON[0], stone[1] * shade * MOON[1], stone[2] * shade * MOON[2]];
      glow = 0;
      if (chunk.rune >= 0) glow = glyphGlow(top.along, top.across, 0, 0, Math.min(chunk.length, chunk.depth) * 0.85, chunk.rune) * 0.65;
    } else if (side) {
      const stone = mix([50, 56, 64], [84, 90, 98], chunk.tone);
      const dark = 0.55 + 0.45 * sideDepth;
      color = [stone[0] * dark * MOON[0], stone[1] * dark * MOON[1], stone[2] * dark * MOON[2]];
      glow = 0;
    }
  }
  return { color, glow };
}

/** Bits of gold floating up out of an open chest: model position, size in meters, and the phase of their spin. */
const COINS: { at: V3; size: number; phase: number }[] = [
  { at: [-0.7, 3.1, 0.3], size: 0.15, phase: 0.2 },
  { at: [0.6, 3.5, 0.5], size: 0.13, phase: 1.4 },
  { at: [1.05, 2.5, 0.9], size: 0.14, phase: 2.5 },
  { at: [-1.15, 2.3, 0.9], size: 0.12, phase: 0.9 },
  { at: [0.05, 3.75, 0.1], size: 0.11, phase: 2.0 },
  { at: [-0.35, 2.8, 1.3], size: 0.13, phase: 3.0 },
  { at: [1.5, 3.4, -0.2], size: 0.11, phase: 1.8 },
];
/** Runes drifting up out of an open chest: model position, size in meters and which rune. */
const FLOATERS: { at: V3; size: number; glyph: number }[] = [
  { at: [-1.35, 2.2, 0.9], size: 0.5, glyph: 0 },
  { at: [1.25, 1.9, 1.1], size: 0.42, glyph: 9 },
  { at: [-0.7, 3.0, 0.6], size: 0.4, glyph: 4 },
  { at: [0.85, 2.85, 0.7], size: 0.46, glyph: 2 },
  { at: [-1.6, 3.1, -0.2], size: 0.34, glyph: 10 },
  { at: [0.15, 3.3, 0.3], size: 0.36, glyph: 7 },
];
const SPARKLES: { at: V3; size: number }[] = [
  { at: [-1.0, 1.7, 1.0], size: 0.28 },
  { at: [0.9, 2.0, 1.0], size: 0.26 },
  { at: [-0.2, 2.6, 0.6], size: 0.34 },
  { at: [1.35, 2.8, -0.1], size: 0.26 },
  { at: [0.4, 3.0, 0.9], size: 0.2 },
];

// ---------------------------------------------------------------------------
// Putting it together
// ---------------------------------------------------------------------------

/** The point where the ray with direction `d` from the camera meets the face, and how far along the ray it is; null if it misses. */
function hitFace(face: Face, d: V3): { t: number; u: number; v: number } | null {
  const facing = dot(face.normal, d);
  if (facing >= 0) return null; // the back of it
  const t = dot(face.normal, face.origin) / facing;
  if (t <= 0) return null;
  const point = scale(d, t);
  const rel = sub(point, face.origin);
  const u = dot(rel, face.u) / (face.uLen * face.uLen);
  const v = dot(rel, face.v) / (face.vLen * face.vLen);
  if (u < 0 || u > 1 || v < 0 || v > 1) return null;
  return { t, u: face.flipU ? 1 - u : u, v };
}

/** How much the runes shine: dim while the chest waits, blazing once it is open. */
const RUNE_POWER: Record<CrateState, number> = { closed: 0.85, opened: 1.25, lost: 0.6 };

/** Adds the rune light to a lit colour: the palette's colour, going pale where it is brightest. */
function withGlow(color: Rgb, glow: number, power: number, pal: Palette): Rgb {
  if (glow <= 0.002) return color;
  const g = glow * power;
  const light = mix(pal.glow, pal.core, smooth(0.9, 1.5, g));
  return [Math.min(255, color[0] * (1 - 0.4 * clamp01(g)) + light[0] * g), Math.min(255, color[1] * (1 - 0.4 * clamp01(g)) + light[1] * g), Math.min(255, color[2] * (1 - 0.4 * clamp01(g)) + light[2] * g)];
}

function shadeFace(face: Face, u: number, v: number, state: CrateState, pal: Palette): Rgb {
  let paint: Paint;
  switch (face.kind) {
    case 'body':
      paint = paintBody(u, v, face.uLen, face.vLen, face.seed);
      break;
    case 'lidSide':
      paint = paintLidSide(u, v, face.uLen, face.vLen, face.seed);
      break;
    case 'lidTop':
      paint = paintLidTop(u, v, face.uLen, face.vLen, face.seed);
      break;
    case 'lidInner':
      // Lit from inside, not by the moon.
      paint = paintLidInner(u, v, face.uLen, face.vLen, face.seed, pal);
      return withGlow(paint.color, paint.glow, RUNE_POWER[state], pal);
    default:
      return paintRim(u, v, face.uLen, face.vLen, face.seed, pal).color;
  }
  const lit = 0.42 + 0.66 * Math.max(0, dot(face.normal, LIGHT));
  // A thin bright line along the edges of a side, and a dark one where two sides meet.
  const edge = Math.min(u, 1 - u) * face.uLen;
  const edgeShade = 1 + 0.16 * (1 - smooth(0.005, 0.04, edge)) - 0.3 * (1 - smooth(0, 0.008, edge));
  // Darker near the ground, where the flagstones block the light.
  const ground = face.kind === 'body' ? 1 - 0.22 * smooth(0.7, 1, v) : 1;
  const k = lit * ground * edgeShade;
  let out: Rgb = [paint.color[0] * k * MOON[0], paint.color[1] * k * MOON[1], paint.color[2] * k * MOON[2]];
  // An open chest throws its light on its own sides and on the lid's ends.
  if (state === 'opened' && (face.kind === 'body' || face.kind === 'lidSide')) {
    const spill = face.kind === 'body' ? smooth(0.55, 0, v) * 0.55 : 0.25;
    out = mix(out, [out[0] * 0.4 + pal.spill[0], out[1] * 0.4 + pal.spill[1], out[2] * 0.4 + pal.spill[2]], spill);
  }
  return withGlow(out, paint.glow, RUNE_POWER[state], pal);
}

/** The world position of a point on the ground seen from the camera, for the paving and the shadow. */
function groundWorld(p: V3): { x: number; z: number } {
  const m = unturn(sub(p, [0, LIFT, DISTANCE]));
  return { x: m[0] + CENTER[0], z: m[2] + CENTER[2] };
}

interface Slab {
  min: V3;
  max: V3;
}
const CHEST_SLABS: Record<CrateState, Slab[]> = {
  closed: [{ min: [-HALF_X, 0, -HALF_Z], max: [HALF_X, BASE_HEIGHT + LID_HEIGHT, HALF_Z] }],
  // The lid stands leaning back over the hinge.
  opened: [
    { min: [-HALF_X, 0, -HALF_Z], max: [HALF_X, BASE_HEIGHT, HALF_Z] },
    { min: [-HALF_X, BASE_HEIGHT, -HALF_Z - 0.8], max: [HALF_X, BASE_HEIGHT + 1.9, -HALF_Z] },
  ],
  lost: [],
};

/** True if the ray from `o` along `d` passes through the box (a standard slab test). */
function rayHitsSlab(o: V3, d: V3, slab: Slab): boolean {
  let near = -Infinity;
  let far = Infinity;
  for (let i = 0; i < 3; i++) {
    const di = d[i] as number;
    const oi = o[i] as number;
    if (Math.abs(di) < 1e-9) {
      if (oi < (slab.min[i] as number) || oi > (slab.max[i] as number)) return false;
      continue;
    }
    const a = ((slab.min[i] as number) - oi) / di;
    const b = ((slab.max[i] as number) - oi) / di;
    near = Math.max(near, Math.min(a, b));
    far = Math.min(far, Math.max(a, b));
  }
  return far > Math.max(near, 0);
}

/** How much of the moonlight is blocked at ground position (x, z) by the chest: 0 for none, 1 for all. */
function shadowAt(x: number, z: number, state: CrateState): number {
  const slabs = CHEST_SLABS[state];
  if (slabs.length === 0) return 0;
  let blocked = 0;
  // Four slightly different light directions, so the edge of the shadow is soft.
  for (const [jx, jz] of [[0.07, 0], [-0.07, 0], [0, 0.07], [0, -0.07]] as [number, number][]) {
    const d = norm([LIGHT_MODEL[0] + jx, LIGHT_MODEL[1], LIGHT_MODEL[2] + jz]);
    if (slabs.some((slab) => rayHitsSlab([x, 0.001, z], d, slab))) blocked += 0.25;
  }
  // And a soft dark patch hugging the foot of the chest.
  const outside = footprintDistance(x, z);
  const contact = 0.55 * (1 - smooth(0, 0.7, outside));
  return Math.max(0.68 * blocked, contact);
}

/** How far (x, z) is outside the chest's footprint, in meters (negative inside). */
function footprintDistance(x: number, z: number): number {
  const ox = Math.abs(x) - HALF_X;
  const oz = Math.abs(z) - HALF_Z;
  return Math.hypot(Math.max(ox, 0), Math.max(oz, 0)) + Math.min(Math.max(ox, oz), 0);
}

/** How brightly the rune light falls on the ground at each distance from the chest. */
const GROUND_GLOW: Record<CrateState, number> = { closed: 0.22, opened: 0.62, lost: 0 };

/**
 * The picture of the crate in `state`, its runes shining in the colour of `tier`, as a PNG file.
 * It takes a few seconds of work, done in slices that let the rest of the bot run in between.
 */
export async function renderCrate(state: CrateState = 'closed', tier: CrateTier = 'low'): Promise<Buffer> {
  const w = WIDTH * SUPERSAMPLE;
  const h = HEIGHT * SUPERSAMPLE;
  const rgba = new Uint8Array(w * h * 4);
  const faces = state === 'closed' ? closedFaces : state === 'opened' ? openFaces : [];
  const cx = w / 2;
  const cy = h * EYE_LEVEL;
  const focal = FOCAL * SUPERSAMPLE;
  const horizonPy = cy - focal * Math.tan(PITCH);
  const power = RUNE_POWER[state];
  const pal = PALETTES[tier];

  const project = (p: V3): { x: number; y: number; scale: number } => {
    const c = toCamera(p);
    return { x: cx + (c[0] / c[2]) * focal, y: cy - (c[1] / c[2]) * focal, scale: focal / c[2] };
  };

  // Where the middle of the chest's footprint is in the picture (0 to 1), for the dust of the wreck.
  const footprint = project([0, 0, 0]);
  const wreck = { x: footprint.x / w, y: footprint.y / h };

  // Where the light comes out of an open chest (a little above the heap), for the glow and rays.
  const glow = project([0, BASE_HEIGHT + 0.25, 0]);
  const coins = COINS.map((coin) => {
    const at = project(coin.at);
    return { x: at.x, y: at.y, r: coin.size * at.scale, phase: coin.phase };
  });
  const floaters = FLOATERS.map((floater) => {
    const at = project(floater.at);
    return { x: at.x, y: at.y, px: floater.size * at.scale, meters: floater.size, glyph: floater.glyph };
  });
  const sparkles = SPARKLES.map((sparkle) => {
    const at = project(sparkle.at);
    return { x: at.x, y: at.y, r: sparkle.size * at.scale };
  });
  const shine = (x: number, y: number): number => {
    let light = 0;
    for (const s of sparkles) {
      const dx = Math.abs(x - s.x) / s.r;
      const dy = Math.abs(y - s.y) / s.r;
      if (dx > 1.6 || dy > 1.6) continue;
      // A four-pointed star (an astroid) with a soft glow round its middle.
      const star = Math.pow(dx, 0.55) + Math.pow(dy, 0.55);
      light += 1 - smooth(0.7, 1, star) + 0.5 * Math.exp(-(dx * dx + dy * dy) * 6);
    }
    return clamp01(light);
  };
  const drift = (x: number, y: number): number => {
    let light = 0;
    for (const f of floaters) {
      const lx = (x - f.x) / f.px + 0.5;
      const ly = (y - f.y) / f.px + 0.5;
      if (lx < -0.6 || lx > 1.6 || ly < -0.6 || ly > 1.6) continue;
      light = Math.max(light, strokeGlow(glyphDistance(lx, ly, f.glyph) * f.meters));
    }
    return light;
  };

  for (let py = 0; py < h; py++) {
    // Let the rest of the bot have a turn every few rows.
    if (py % 16 === 15) await new Promise<void>((resolve) => setImmediate(resolve));
    for (let px = 0; px < w; px++) {
      const nx = px / w;
      const ny = py / h;
      const d: V3 = [(px + 0.5 - cx) / focal, -(py + 0.5 - cy) / focal, 1];

      let best = Infinity;
      let color: Rgb | null = null;
      for (const face of faces) {
        const hit = hitFace(face, d);
        if (hit && hit.t < best) {
          best = hit.t;
          color = shadeFace(face, hit.u, hit.v, state, pal);
        }
      }

      if (color === null) {
        // The ground, if the ray goes down to it; the sky and the hills if not.
        const facing = dot(groundNormal, d);
        const tGround = facing < 0 ? dot(groundNormal, groundPoint) / facing : -1;
        if (tGround > 0) {
          const world = groundWorld(scale(d, tGround));
          const paving = paintGround(world.x, world.z, tGround);
          let lit: Rgb = [paving[0] * MOON[0], paving[1] * MOON[1], paving[2] * MOON[2]];
          let runes = 0;
          if (state === 'lost') {
            const wrecked = paintWreck(lit, world.x, world.z);
            lit = wrecked.color;
            runes = wrecked.glow;
          }
          lit = mix(lit, [8, 10, 16], shadowAt(world.x, world.z, state));
          // The rune light on the flagstones round the chest.
          const near = Math.max(0, footprintDistance(world.x, world.z));
          const spill = GROUND_GLOW[state] * Math.exp(-(near * near) / 1.6);
          color = withGlow(mix(lit, pal.light, spill * 0.45), runes, power, pal);
        } else {
          color = skyColor(nx, ny);
          // The far hills, drawn over the sky just above the horizon.
          const top = horizonPy - hillHeight(nx) * h;
          if (py > top) {
            const shade = smooth(0, 1, (py - top) / (hillHeight(nx) * h + 1));
            color = mix(mix([30, 38, 54], HAZE, 0.4), HAZE, shade * 0.7);
          }
        }
      }

      let [r, g, b] = color as Rgb;

      if (state === 'opened') {
        // The glow: a soft light over the open chest, with rays fanning up and out of it.
        const gx = (px - glow.x) / w;
        const gy = (glow.y - py) / w;
        const dist = Math.hypot(gx, gy * 0.8);
        const halo = Math.exp(-dist * dist * 34) * 0.6 + Math.exp(-dist * 6.5) * 0.24;
        const angle = Math.atan2(gx, gy + 1e-6);
        const rays = gy > -0.01 ? Math.pow(0.5 + 0.5 * Math.cos(angle * 11 + 0.5), 3) * Math.exp(-dist * 4) * 0.5 : 0;
        const light = clamp01(halo + rays);
        r = lerp(r, pal.light[0], light * 0.8);
        g = lerp(g, pal.light[1], light * 0.78);
        b = lerp(b, pal.light[2], light * 0.7);
        // Runes drifting up out of it.
        const rune = drift(px, py);
        if (rune > 0.002) {
          const c = withGlow([r, g, b], rune, 1.1, pal);
          r = c[0];
          g = c[1];
          b = c[2];
        }
        // Coins tumbling up out of it.
        for (const coin of coins) {
          const dx = (px - coin.x) / coin.r;
          const dy = (py - coin.y) / (coin.r * (0.3 + 0.7 * Math.abs(Math.cos(coin.phase))));
          const dist2 = dx * dx + dy * dy;
          if (dist2 < 1) {
            const face = dist2 > 0.62 ? 0.45 : 0.9 - 0.4 * (dx * 0.5 + dy * 0.5);
            r = 255 * face;
            g = 205 * face;
            b = 80 * face;
          }
        }
        const sparkle = shine(px, py);
        r = lerp(r, pal.core[0], sparkle);
        g = lerp(g, pal.core[1], sparkle);
        b = lerp(b, pal.core[2], sparkle);
      }

      if (state === 'lost') {
        // Dust kicked up where the chest was, thick in the middle and thin at the edges.
        const dx = (nx - wreck.x) / 0.27;
        const dy = (ny - (wreck.y - 0.1)) / 0.18;
        const body = 1 - smooth(0.2, 1, Math.hypot(dx, dy));
        const puff = fbm(nx * 11, ny * 11, 120, 5);
        const dust = clamp01(body * (0.2 + 1.4 * puff) * 0.9);
        r = lerp(r, 138, dust);
        g = lerp(g, 148, dust);
        b = lerp(b, 158, dust);
      }

      // A soft vignette and a little grain, so it reads as a photograph rather than flat colour.
      const vx = nx - 0.5;
      const vy = ny - 0.5;
      const vignette = 1 - 0.4 * smooth(0.28, 0.75, Math.hypot(vx * 1.1, vy * 1.25));
      const grain = (hash(px, py, 7) - 0.5) * 7;
      const at = (py * w + px) * 4;
      rgba[at] = Math.max(0, Math.min(255, r * vignette + grain));
      rgba[at + 1] = Math.max(0, Math.min(255, g * vignette + grain));
      rgba[at + 2] = Math.max(0, Math.min(255, b * vignette + grain));
      rgba[at + 3] = 255;
    }
  }
  return encodePng(WIDTH, HEIGHT, shrinkRect(rgba, w, h, SUPERSAMPLE));
}
