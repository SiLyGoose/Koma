import { encodePng } from './png.js';
import { mix, type Rgb } from './raster.js';

/*
 * Draws the raid boss as a PNG: a pixel-art red dragon standing on its hoard in a dark cave, facing
 * the viewer like a wild Pokémon at the start of a battle. It is
 * built from simple shapes (ellipses, polygons, thick curves) filled into a small grid of "parts",
 * then each part is shaded from its own edges (light from the top left) and outlined, and the grid
 * is blown up to whole blocks so it stays crisp. No image library, like the other pictures (see png.ts).
 *
 * `mood` changes the look: `calm` is the usual dragon, `enraged` glows hotter with embers in the air,
 * `shielded` has its scales lit up in blue, and `defeated` is grey with its eye shut.
 */

export type DragonMood = 'calm' | 'enraged' | 'shielded' | 'defeated';

/** The drawing grid, in sprite pixels. */
const W = 96;
const H = 60;
/** How many picture pixels each sprite pixel becomes. */
const SCALE = 5;

type Pt = readonly [number, number];

/** The parts of the dragon, back to front. The order is also how they overlap. */
const PARTS = ['wing', 'bone', 'tail', 'leg', 'neck', 'body', 'belly', 'arm', 'claw', 'spike', 'head', 'snout', 'horn', 'tooth', 'eye'] as const;
type Part = (typeof PARTS)[number];
const PART_ID = Object.fromEntries(PARTS.map((part, i) => [part, i])) as Record<Part, number>;

/**
 * Parts in the same group get no outline between them (the belly is painted onto the body, the
 * neck runs into the body). Parts not listed are their own group.
 */
const GROUP: Partial<Record<Part, string>> = { body: 'skin', belly: 'skin', neck: 'skin', tail: 'skin', wing: 'wing', bone: 'wing' };
/** Small details that are neither outlined nor shaded. */
const FLAT: ReadonlySet<Part> = new Set<Part>(['eye', 'tooth', 'bone', 'claw']);

/** Light, middle and dark shade of each part. */
type Shades = readonly [Rgb, Rgb, Rgb];

const RED: Shades = [
  [236, 98, 76],
  [192, 52, 43],
  [122, 28, 30],
];
const BELLY: Shades = [
  [252, 214, 140],
  [233, 178, 98],
  [178, 118, 62],
];
const WING: Shades = [
  [170, 56, 72],
  [132, 38, 58],
  [88, 24, 44],
];
const HORN: Shades = [
  [246, 238, 214],
  [214, 200, 168],
  [150, 134, 104],
];

interface Palette {
  parts: Record<Part, Shades>;
  outline: Rgb;
  eye: Rgb;
  skyTop: Rgb;
  skyBottom: Rgb;
  gold: Shades;
}

function basePalette(): Palette {
  return {
    parts: {
      tail: RED,
      leg: RED,
      body: RED,
      belly: BELLY,
      neck: RED,
      head: RED,
      snout: RED,
      horn: HORN,
      spike: HORN,
      wing: WING,
      bone: [RED[0], RED[0], RED[0]],
      arm: RED,
      claw: HORN,
      tooth: [HORN[0], HORN[0], HORN[0]],
      eye: [
        [255, 226, 77],
        [255, 226, 77],
        [255, 226, 77],
      ],
    },
    outline: [34, 10, 14],
    eye: [255, 226, 77],
    skyTop: [16, 10, 20],
    skyBottom: [44, 22, 30],
    gold: [
      [255, 236, 140],
      [236, 180, 60],
      [160, 104, 30],
    ],
  };
}

const mapShades = (shades: Shades, f: (c: Rgb) => Rgb): Shades => [f(shades[0]), f(shades[1]), f(shades[2])];

function paletteFor(mood: DragonMood): Palette {
  const base = basePalette();
  const mapAll = (f: (c: Rgb) => Rgb): Palette => ({
    ...base,
    parts: Object.fromEntries(PARTS.map((part) => [part, mapShades(base.parts[part], f)])) as Record<Part, Shades>,
    gold: mapShades(base.gold, f),
  });
  switch (mood) {
    case 'calm':
      return base;
    case 'enraged': {
      const hot = mapAll((c) => mix(c, [255, 120, 40], 0.18));
      return { ...hot, eye: [255, 250, 230], skyTop: [36, 8, 10], skyBottom: [96, 26, 16] };
    }
    case 'shielded': {
      const cold = mapAll((c) => mix(c, [90, 170, 255], 0.12));
      return { ...cold, gold: base.gold, outline: [120, 220, 255], eye: [200, 245, 255] };
    }
    case 'defeated': {
      const grey = (c: Rgb): Rgb => {
        const l = (c[0] * 0.3 + c[1] * 0.59 + c[2] * 0.11) * 0.7;
        return [l, l, l * 1.05];
      };
      const dull = mapAll(grey);
      return { ...dull, gold: base.gold, outline: [20, 20, 24], eye: [40, 40, 44], skyTop: [10, 10, 14], skyBottom: [26, 24, 30] };
    }
  }
}

// ---------------------------------------------------------------------------
// Filling shapes into the grid
// ---------------------------------------------------------------------------

class Grid {
  readonly cells = new Int8Array(W * H).fill(-1);

  at(x: number, y: number): number {
    if (x < 0 || y < 0 || x >= W || y >= H) return -1;
    return this.cells[y * W + x] as number;
  }

  /** Sets the cell, if `only` (when given) allows what is already there. */
  set(x: number, y: number, part: Part, only?: readonly Part[]): void {
    if (x < 0 || y < 0 || x >= W || y >= H) return;
    if (only && !only.some((p) => PART_ID[p] === this.cells[y * W + x])) return;
    this.cells[y * W + x] = PART_ID[part];
  }

  ellipse(cx: number, cy: number, rx: number, ry: number, part: Part, only?: readonly Part[]): void {
    for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++) {
      for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
        const dx = (x + 0.5 - cx) / rx;
        const dy = (y + 0.5 - cy) / ry;
        if (dx * dx + dy * dy <= 1) this.set(x, y, part, only);
      }
    }
  }

  polygon(points: readonly Pt[], part: Part, only?: readonly Part[]): void {
    const ys = points.map((p) => p[1]);
    for (let y = Math.floor(Math.min(...ys)); y <= Math.ceil(Math.max(...ys)); y++) {
      for (let x = 0; x < W; x++) {
        if (inside(points, x + 0.5, y + 0.5)) this.set(x, y, part, only);
      }
    }
  }

  /** A thick line along a quadratic curve, `r0` thick at the start and `r1` at the end. */
  limb(from: Pt, via: Pt, to: Pt, r0: number, r1: number, part: Part): void {
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

  line(from: Pt, to: Pt, part: Part, only?: readonly Part[]): void {
    const steps = Math.ceil(Math.max(Math.abs(to[0] - from[0]), Math.abs(to[1] - from[1]))) * 2;
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      this.set(Math.floor(from[0] + (to[0] - from[0]) * t), Math.floor(from[1] + (to[1] - from[1]) * t), part, only);
    }
  }
}

function inside(points: readonly Pt[], x: number, y: number): boolean {
  let hit = false;
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    const [xi, yi] = points[i] as Pt;
    const [xj, yj] = points[j] as Pt;
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) hit = !hit;
  }
  return hit;
}

// ---------------------------------------------------------------------------
// The dragon
// ---------------------------------------------------------------------------

/** Mirrors a point across the middle of the picture, so each side is drawn once. */
const flip = ([x, y]: Pt): Pt => [W - x, y];
const flipAll = (points: readonly Pt[]): Pt[] => points.map(flip);

/** Sprite pixels on the face that the painter treats specially. */
interface Face {
  /** Where the pupils are (a slit in each eye). */
  pupils: Pt[];
  /** The brow over each eye, drawn as a dark line (it's what makes the stare). */
  brows: Pt[];
  /** Each eye's pixels, for the shut eyes of a defeated dragon and the glow of an enraged one. */
  eyes: Pt[];
  /** The line of the mouth. */
  mouth: Pt[];
  /** Where smoke curls up beside the snout. */
  smoke: Pt[];
  /** Where fire licks out of the corners of the mouth when enraged. */
  fire: { at: Pt; color: Rgb }[];
}

/** Both of a pixel and its mirror image. */
const pair = (x: number, y: number): Pt[] => [
  [x, y],
  [W - 1 - x, y],
];

/**
 * Where the dragon's parts go. It faces the viewer, like a wild Pokémon squaring up for a battle:
 * head on, wings spread wide on both sides, standing on its hoard, tail curling out to one side.
 * Everything but the tail is drawn once for the left side and mirrored.
 */
function drawDragon(mood: DragonMood): { grid: Grid; face: Face } {
  const g = new Grid();
  const eyeOpen = mood !== 'defeated';
  const both = (draw: (m: (points: readonly Pt[]) => readonly Pt[], x: (n: number) => number) => void): void => {
    draw((points) => points, (n) => n);
    draw(flipAll, (n) => W - n);
  };

  // Wings spread wide behind the body: an arm up to the wrist, three long fingers, membrane between.
  both((m) => {
    const shoulder: Pt = [41, 30];
    const wrist: Pt = [25, 7];
    const tips: Pt[] = [
      [9, 2],
      [2, 15],
      [6, 29],
    ];
    g.polygon(m([[44, 34], shoulder, wrist, tips[0] as Pt, [13, 10], tips[1] as Pt, [11, 21], tips[2] as Pt, [18, 30], [28, 36]]), 'wing');
    const [s, w] = m([shoulder, wrist]) as [Pt, Pt];
    g.line(s, w, 'bone', ['wing']);
    for (const tip of m(tips)) g.line(w, tip, 'bone', ['wing']);
  });

  // The tail curls out from behind, to the viewer's right, and ends in a spade.
  g.limb([56, 50], [80, 60], [85, 46], 5, 1.6, 'tail');
  g.polygon(
    [
      [85, 48],
      [81, 42],
      [85, 36],
      [89, 42],
    ],
    'tail',
  );

  // Hind legs: haunches either side of the body, and big feet planted on the gold.
  both((m, x) => {
    g.ellipse(x(37), 47, 7, 7, 'leg');
    g.polygon(m([[30, 50], [41, 50], [42, 55], [29, 55]]), 'leg');
  });

  // The neck, the round body, and a pale belly running up the chest and throat.
  g.limb([48, 36], [48, 29], [48, 22], 7, 5.5, 'neck');
  g.ellipse(48, 40, 13, 13, 'body');
  g.ellipse(48, 43, 8, 10, 'belly', ['body']);
  g.ellipse(48, 30, 4, 6, 'belly', ['neck', 'body']);

  // Forelegs held at the chest.
  both((m) => g.polygon(m([[37, 35], [42, 37], [42, 45], [39, 49], [34, 48], [35, 41]]), 'arm'));

  // The head, straight on: a broad skull, the snout pointing at the viewer, frills at the cheeks.
  g.ellipse(48, 15, 10, 7.5, 'head');
  both((m) => g.polygon(m([[39, 14], [31, 10], [34, 16], [39, 19]]), 'spike'));
  g.ellipse(48, 21, 6.5, 4.5, 'snout');

  // Horns sweeping up and out, and a spike in the middle of the brow.
  both((m) => g.polygon(m([[40, 11], [45, 9], [38, 3], [33, 1.5]]), 'horn'));
  g.polygon(
    [
      [46, 9],
      [48, 3],
      [50, 9],
    ],
    'spike',
  );

  // Claws: three on each foreleg, four on each foot.
  for (const x of [35, 37, 39]) for (const at of pair(x, 49)) g.set(at[0], at[1], 'claw');
  for (const x of [30, 33, 36, 39, 42]) for (const at of pair(x, 55)) g.set(at[0], at[1], 'claw');

  // Fangs hanging from the upper jaw.
  for (const at of [...pair(45, 24), ...pair(45, 25)]) g.set(at[0], at[1], 'tooth');

  const eyes = [41, 42, 43].flatMap((x) => [...pair(x, 13), ...pair(x, 14)]);
  if (eyeOpen) for (const [x, y] of eyes) g.set(x, y, 'eye');

  const face: Face = {
    pupils: [...pair(42, 13), ...pair(42, 14)],
    brows: [...pair(39, 11), ...pair(40, 11), ...pair(41, 12), ...pair(42, 12), ...pair(43, 12), ...pair(44, 13)],
    eyes,
    mouth: [44, 45, 46, 47].flatMap((x) => pair(x, 23)),
    smoke: [...pair(40, 21), ...pair(39, 19), ...pair(40, 17), ...pair(38, 16)],
    fire: [
      ...pair(43, 24).map((at) => ({ at, color: [255, 220, 90] as Rgb })),
      ...pair(42, 25).map((at) => ({ at, color: [255, 160, 50] as Rgb })),
      ...pair(42, 26).map((at) => ({ at, color: [255, 120, 40] as Rgb })),
      ...pair(41, 27).map((at) => ({ at, color: [230, 70, 30] as Rgb })),
    ],
  };
  return { grid: g, face };
}

// ---------------------------------------------------------------------------
// Painting
// ---------------------------------------------------------------------------

/** A fixed pseudo-random number for (x, y), so the embers and coins land in the same places every time. */
function hash(x: number, y: number, seed: number): number {
  let h = (x * 374761393 + y * 668265263 + seed * 2147483647) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177) >>> 0;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

function paintBackground(pixels: Rgb[], palette: Palette, mood: DragonMood): void {
  for (let y = 0; y < H; y++) {
    const sky = mix(palette.skyTop, palette.skyBottom, y / (H - 1));
    for (let x = 0; x < W; x++) pixels[y * W + x] = sky;
  }

  // Stalactites hanging from the cave roof.
  for (const [x, len] of [
    [4, 6],
    [11, 3],
    [40, 4],
    [47, 7],
    [70, 2],
    [93, 5],
  ] as const) {
    for (let y = 0; y < len; y++) {
      const half = Math.max(0, Math.round((len - y) / 2.5));
      for (let dx = -half; dx <= half; dx++) {
        const at = y * W + x + dx;
        if (x + dx >= 0 && x + dx < W) pixels[at] = mix(palette.skyTop, [0, 0, 0], 0.4);
      }
    }
  }

  // The hoard: a heap of gold along the bottom, dotted with coins that catch the light.
  const [goldLight, goldMid, goldDark] = palette.gold;
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const dx = (x - 48) / 52;
      const dy = (y - 62) / 11;
      if (dx * dx + dy * dy > 1) continue;
      const depth = y - (62 - 11 * Math.sqrt(Math.max(0, 1 - dx * dx)));
      const roll = hash(x, y, 1);
      pixels[y * W + x] = depth < 1.2 ? goldLight : roll < 0.12 ? goldLight : roll < 0.3 ? goldDark : goldMid;
    }
  }

  if (mood === 'enraged') {
    for (let i = 0; i < 40; i++) {
      const x = Math.floor(hash(i, 3, 7) * W);
      const y = Math.floor(hash(i, 5, 11) * (H - 12));
      pixels[y * W + x] = hash(i, 9, 2) < 0.5 ? [255, 180, 60] : [255, 110, 40];
    }
  }
}

function paintDragon(pixels: Rgb[], { grid, face }: { grid: Grid; face: Face }, palette: Palette, mood: DragonMood): void {
  const partAt = (x: number, y: number): Part | null => {
    const id = grid.at(x, y);
    return id < 0 ? null : (PARTS[id] as Part);
  };
  const groupOf = (part: Part): string => GROUP[part] ?? part;

  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const part = partAt(x, y);
      if (part === null) {
        // Outline round the outside of the dragon.
        const touches = [partAt(x - 1, y), partAt(x + 1, y), partAt(x, y - 1), partAt(x, y + 1)].some((p) => p !== null && !FLAT.has(p));
        if (touches) pixels[y * W + x] = palette.outline;
        continue;
      }
      const [light, mid, dark] = palette.parts[part];
      if (FLAT.has(part)) {
        pixels[y * W + x] = part === 'eye' ? palette.eye : mid;
        continue;
      }
      // A line where this part passes behind a part of another group.
      const behind = [partAt(x - 1, y), partAt(x + 1, y), partAt(x, y - 1), partAt(x, y + 1)].some(
        (p) => p !== null && !FLAT.has(p) && PART_ID[p] > PART_ID[part] && groupOf(p) !== groupOf(part),
      );
      if (behind) {
        pixels[y * W + x] = mix(dark, palette.outline, 0.6);
        continue;
      }
      // Shade from the edges: lit from the top left, in shadow at the bottom right.
      const same = (dx: number, dy: number): boolean => {
        const p = partAt(x + dx, y + dy);
        return p !== null && groupOf(p) === groupOf(part);
      };
      if (!same(0, -1) || !same(-1, -1)) pixels[y * W + x] = light;
      else if (!same(0, 2) || !same(2, 1) || !same(1, 2)) pixels[y * W + x] = dark;
      else pixels[y * W + x] = mid;
    }
  }

  // Belly plates: a darker seam every few rows across the pale belly.
  for (let y = 0; y < H; y++) {
    if (y % 3 !== 0) continue;
    for (let x = 0; x < W; x++) {
      if (partAt(x, y) === 'belly' && partAt(x, y - 1) === 'belly') pixels[y * W + x] = palette.parts.belly[2];
    }
  }

  const paint = ([x, y]: Pt, color: Rgb): void => {
    pixels[y * W + x] = color;
  };
  face.mouth.forEach((at) => paint(at, palette.outline));
  face.brows.forEach((at) => paint(at, palette.outline));

  // The eyes stare straight out: slit pupils, and a glow round them when enraged. Shut (a dark line) when defeated.
  if (mood === 'defeated') {
    face.eyes.filter(([, y]) => y === 14).forEach((at) => paint(at, palette.outline));
  } else {
    face.pupils.forEach((at) => paint(at, palette.outline));
    if (mood === 'enraged') {
      for (const [x, y] of face.eyes) {
        for (const [dx, dy] of [
          [0, -1],
          [0, 1],
          [-1, 0],
          [1, 0],
        ] as const) {
          if (partAt(x + dx, y + dy) !== 'eye') {
            const at = (y + dy) * W + x + dx;
            pixels[at] = mix(pixels[at] as Rgb, [255, 200, 120], 0.5);
          }
        }
      }
    }
  }

  // Smoke curling up beside the snout; fire licking out of the corners of the mouth when enraged.
  if (mood !== 'defeated') {
    const smoke: Rgb = mood === 'shielded' ? [150, 200, 230] : [120, 112, 118];
    face.smoke.forEach((at) => paint(at, mix(pixels[at[1] * W + at[0]] as Rgb, smoke, 0.7)));
  }
  if (mood === 'enraged') face.fire.forEach(({ at, color }) => paint(at, color));
}

/** Scales every sprite pixel up to a SCALE x SCALE block. */
function blowUp(pixels: readonly Rgb[]): Uint8Array {
  const width = W * SCALE;
  const out = new Uint8Array(width * H * SCALE * 4);
  for (let y = 0; y < H * SCALE; y++) {
    for (let x = 0; x < width; x++) {
      const [r, g, b] = pixels[Math.floor(y / SCALE) * W + Math.floor(x / SCALE)] as Rgb;
      const at = (y * width + x) * 4;
      out[at] = Math.round(r);
      out[at + 1] = Math.round(g);
      out[at + 2] = Math.round(b);
      out[at + 3] = 255;
    }
  }
  return out;
}

/** The picture's size in pixels. */
export const DRAGON_SIZE = { width: W * SCALE, height: H * SCALE } as const;

/** Draws the dragon in the given mood as a PNG. */
export function renderDragon(mood: DragonMood): Buffer {
  const palette = paletteFor(mood);
  const pixels: Rgb[] = new Array<Rgb>(W * H);
  paintBackground(pixels, palette, mood);
  paintDragon(pixels, drawDragon(mood), palette, mood);
  return encodePng(DRAGON_SIZE.width, DRAGON_SIZE.height, blowUp(pixels));
}

const cache = new Map<DragonMood, Buffer>();

/** Like renderDragon, but each mood is only drawn once. */
export function dragonPicture(mood: DragonMood): Buffer {
  let png = cache.get(mood);
  if (!png) {
    png = renderDragon(mood);
    cache.set(mood, png);
  }
  return png;
}
