import { encodePng } from './render/png.js';
import { mix, type Rgb } from './render/raster.js';
import { blowUp, hash, mapShades, paintParts, SpriteGrid, type Pt, type Shades } from './render/sprite.js';
import type { DragonMood } from './dragon-image.js';

/*
 * Draws the Plague Matriarch raid boss as a PNG, in the same pixel-art style as the dragon and the
 * reaper (sprite.ts): a hunched, bloated figure in a rotting green robe and hood, a long-beaked plague
 * mask with round glowing lenses for a face, a gnarled staff in one hand and a censer pouring sickly
 * smoke from the other, standing in the sludge of a sewer tunnel with rats' eyes glinting behind her.
 *
 * It has the same moods as the dragon: `calm` has dim green lenses and a thin trail of smoke,
 * `enraged` turns the lenses and smoke a bright acid yellow-green and thickens the fumes, `furious`
 * (her last phase) glows a toxic red, the smoke boiling off the censer and her robe, `shielded`
 * hides her behind a buzzing Fly Swarm, `defeated` is grey with the lenses gone dark and the censer
 * dropped in the sludge, `gloating` (she wiped the party) has the smoke curling all round the tunnel,
 * and `fled` leaves only a faint shape sinking into thick green fog.
 */

export type PlagueMood = DragonMood;

const W = 96;
const H = 60;
const SCALE = 5;

/** The parts of the matriarch, back to front. */
const PARTS = ['staff', 'robe', 'sleeve', 'hood', 'hoodIn', 'mask', 'beak', 'lens', 'chain', 'censer', 'hand', 'eye', 'stitch'] as const;
type Part = (typeof PARTS)[number];
type Grid = SpriteGrid<Part>;

const GROUP: Partial<Record<Part, string>> = { robe: 'robe', sleeve: 'robe', hood: 'robe' };
const FLAT: ReadonlySet<Part> = new Set<Part>(['hoodIn', 'eye', 'stitch', 'chain']);

const ROBE: Shades = [
  [112, 128, 72],
  [74, 88, 46],
  [42, 50, 28],
];
const MASK: Shades = [
  [232, 222, 196],
  [196, 182, 150],
  [128, 114, 88],
];
const LEATHER: Shades = [
  [150, 108, 72],
  [108, 74, 48],
  [64, 42, 28],
];
const WOOD: Shades = [
  [124, 100, 70],
  [88, 68, 46],
  [54, 40, 26],
];
const BRASS: Shades = [
  [226, 196, 120],
  [176, 140, 70],
  [106, 80, 40],
];
const GLASS: Shades = [
  [70, 96, 70],
  [40, 60, 44],
  [20, 32, 24],
];
const SKIN: Shades = [
  [196, 200, 160],
  [150, 156, 118],
  [96, 102, 74],
];

interface Palette {
  parts: Record<Part, Shades>;
  outline: Rgb;
  /** The glow in her lenses. */
  eye: Rgb;
  /** The smoke from her censer, and the light it gives off. */
  smoke: Rgb;
  wallTop: Rgb;
  wallBottom: Rgb;
  /** The sludge she stands in. */
  sludge: Rgb;
  /** The mist over the sludge. */
  fog: Rgb;
}

function basePalette(): Palette {
  const flat = (c: Rgb): Shades => [c, c, c];
  return {
    parts: {
      staff: WOOD,
      robe: ROBE,
      sleeve: ROBE,
      hood: ROBE,
      hoodIn: flat([12, 14, 8]),
      mask: MASK,
      beak: LEATHER,
      lens: GLASS,
      chain: flat([90, 84, 70]),
      censer: BRASS,
      hand: SKIN,
      eye: flat([150, 255, 120]),
      stitch: flat([60, 44, 30]),
    },
    outline: [10, 12, 6],
    eye: [150, 255, 120],
    smoke: [130, 210, 90],
    wallTop: [20, 24, 18],
    wallBottom: [46, 52, 38],
    sludge: [54, 72, 34],
    fog: [110, 150, 80],
  };
}

function paletteFor(mood: PlagueMood): Palette {
  const base = basePalette();
  const mapAll = (f: (c: Rgb) => Rgb, except: readonly Part[] = []): Palette => ({
    ...base,
    parts: Object.fromEntries(PARTS.map((part) => [part, except.includes(part) ? base.parts[part] : mapShades(base.parts[part], f)])) as Record<Part, Shades>,
  });
  switch (mood) {
    case 'calm':
    case 'fled':
      return base;
    case 'enraged': {
      // Acid: the lenses and the fumes blaze a bright yellow-green, and the tunnel takes on their glow.
      const sick = mapAll((c) => mix(c, [150, 170, 30], 0.15), ['hoodIn', 'eye', 'stitch']);
      return { ...sick, eye: [220, 255, 90], smoke: [190, 240, 60], wallTop: [22, 28, 10], wallBottom: [58, 70, 24], fog: [150, 180, 60], sludge: [70, 90, 26] };
    }
    case 'furious': {
      // Toxic red: the robe darkens, the lenses burn white-hot with a red glow, and red fumes fill the tunnel.
      const dark = mapAll((c) => mix(c, [50, 6, 10], 0.3), ['hoodIn', 'eye', 'stitch', 'censer']);
      const hot: Shades = [
        [255, 220, 170],
        [240, 120, 70],
        [170, 50, 30],
      ];
      return {
        ...dark,
        parts: { ...dark.parts, censer: hot },
        outline: [14, 4, 4],
        eye: [255, 236, 200],
        smoke: [230, 80, 60],
        wallTop: [24, 6, 8],
        wallBottom: [70, 20, 18],
        fog: [170, 90, 70],
        sludge: [80, 40, 24],
      };
    }
    case 'gloating':
      return { ...base, smoke: [160, 240, 110], fog: [130, 180, 90] };
    case 'shielded': {
      // Half hidden in the swarm: everything a little darker behind the cloud of flies.
      const hidden = mapAll((c) => mix(c, [30, 30, 24], 0.3), ['hoodIn', 'eye']);
      return { ...hidden, smoke: [120, 160, 90] };
    }
    case 'defeated': {
      const grey = (c: Rgb): Rgb => {
        const l = (c[0] * 0.3 + c[1] * 0.59 + c[2] * 0.11) * 0.7;
        return [l, l, l * 1.02];
      };
      return { ...mapAll(grey), outline: [16, 16, 16], eye: [30, 32, 30], smoke: [90, 94, 90], wallTop: [12, 12, 12], wallBottom: [30, 30, 30], sludge: [40, 42, 38], fog: [80, 84, 80] };
    }
  }
}

// ---------------------------------------------------------------------------
// The matriarch
// ---------------------------------------------------------------------------

/** Both of a pixel and its mirror image across the middle of the picture. */
const pair = (x: number, y: number): Pt[] => [
  [x, y],
  [W - 1 - x, y],
];

/** Where her censer hangs, swinging from her outstretched hand, and how it lies when it has been dropped. */
const CENSER: Pt = [72, 39];
const DROPPED_CENSER: Pt = [74, 53];
const CENSER_HAND: Pt = [69, 29];

/**
 * Where the matriarch's parts go. She stands facing the viewer, hunched and swollen under her robe:
 * a hood drawn low, the plague mask's long beak hanging down from her face, a gnarled staff upright in
 * her right hand (the viewer's left), and her left hand held out with the censer swinging on its chain.
 */
function drawMatriarch(mood: PlagueMood): Grid {
  const g: Grid = new SpriteGrid(PARTS, W, H);
  const defeated = mood === 'defeated';

  // The staff, behind her, with a crook at the top.
  g.limb([26, 58], [24.5, 32], [27, 7], 1.4, 1.1, 'staff');
  g.limb([27, 7], [24, 3], [21, 6], 1.1, 0.9, 'staff');

  // The robe: hunched shoulders and a swollen body, down to a ragged hem trailing in the sludge.
  g.polygon(
    [
      [40, 20],
      [56, 20],
      [63, 27],
      [68, 38],
      [70, 50],
      [67, 56],
      [63, 53],
      [59, 57],
      [55, 53],
      [51, 57],
      [47, 53],
      [43, 57],
      [39, 53],
      [35, 57],
      [30, 54],
      [27, 49],
      [28, 38],
      [33, 27],
    ],
    'robe',
  );
  // Patches stitched over the rot.
  for (const [x, y] of [
    [38, 40],
    [39, 41],
    [40, 42],
    [57, 34],
    [58, 35],
    [59, 36],
    [50, 47],
    [51, 46],
  ] as const) {
    g.set(x, y, 'stitch', ['robe']);
  }

  // Sleeves: the right arm down to the staff, the left reaching out to hold the censer up.
  g.limb([41, 23], [33, 28], [27.5, 31], 3.6, 3, 'sleeve');
  g.limb([55, 23], [63, 25], CENSER_HAND, 3.6, 3, 'sleeve');
  g.ellipse(26.5, 31.5, 2.2, 2, 'hand');
  g.ellipse(CENSER_HAND[0] + 1, CENSER_HAND[1] + 0.5, 2, 1.8, 'hand');

  // The censer on its chain (dropped in the sludge when she is beaten).
  const censer = defeated ? DROPPED_CENSER : CENSER;
  if (!defeated) g.line([CENSER_HAND[0] + 1, CENSER_HAND[1] + 2], [censer[0], censer[1] - 3], 'chain');
  g.ellipse(censer[0], censer[1], 3, 2.6, 'censer');
  g.polygon(
    [
      [censer[0] - 1.5, censer[1] - 2.5],
      [censer[0] + 1.5, censer[1] - 2.5],
      [censer[0] + 0.5, censer[1] - 4],
      [censer[0] - 0.5, censer[1] - 4],
    ],
    'censer',
  );

  // The hood, drawn low, open onto darkness.
  g.polygon(
    [
      [48, 4],
      [54, 6],
      [58.5, 12],
      [59, 20],
      [56, 25],
      [40, 25],
      [37, 20],
      [37.5, 12],
      [42, 6],
    ],
    'hood',
  );
  g.ellipse(48, 16, 7, 7.5, 'hoodIn', ['hood']);

  // The mask: a pale face plate, two round lenses, and the long beak hanging down from it.
  g.ellipse(48, 15, 5, 5, 'mask', ['hoodIn']);
  g.polygon(
    [
      [45, 17],
      [51, 17],
      [50.5, 21],
      [49, 26],
      [47.5, 30],
      [46.5, 29],
      [46.5, 25],
      [45.5, 21],
    ],
    'beak',
  );
  // Stitching down the beak.
  for (const y of [19, 21, 23, 25]) g.set(48, y, 'stitch', ['beak']);
  for (const [x, y] of [...pair(45, 13), ...pair(46, 13), ...pair(45, 14), ...pair(46, 14), ...pair(44, 14), ...pair(45, 15), ...pair(46, 15)] as Pt[]) {
    g.set(x, y, 'lens');
  }
  if (!defeated && mood !== 'gloating') for (const [x, y] of [...pair(45, 14), ...pair(46, 14)] as Pt[]) g.set(x, y, 'eye');
  return g;
}

// ---------------------------------------------------------------------------
// Painting
// ---------------------------------------------------------------------------

/** The sewer: a brick wall with a dark tunnel arch behind her, pipes, and sludge along the bottom. */
function paintBackground(pixels: Rgb[], palette: Palette): void {
  for (let y = 0; y < H; y++) {
    const wall = mix(palette.wallTop, palette.wallBottom, y / (H - 1));
    for (let x = 0; x < W; x++) {
      // Bricks: mortar lines every 4 rows, with the joints staggered row by row.
      const row = Math.floor(y / 4);
      const joint = (x + (row % 2) * 4) % 8 === 0;
      const mortar = y % 4 === 0 || joint;
      const grime = (hash(x, y, 71) - 0.5) * 0.12;
      pixels[y * W + x] = mix(mortar ? mix(wall, [0, 0, 0], 0.35) : wall, [0, 0, 0], Math.max(0, grime));
    }
  }

  // The tunnel's arch, dark behind her, with rats' eyes glinting in it.
  for (let y = 6; y < 50; y++) {
    for (let x = 18; x < 78; x++) {
      const dx = (x + 0.5 - 48) / 30;
      const dy = (y + 0.5 - 50) / 44;
      if (dx * dx + dy * dy < 1) pixels[y * W + x] = mix(pixels[y * W + x] as Rgb, [4, 6, 4], 0.75);
    }
  }
  for (const [x, y] of [
    [22, 44],
    [74, 41],
    [70, 46],
  ] as const) {
    pixels[y * W + x] = [220, 40, 40];
    pixels[y * W + x + 2] = [220, 40, 40];
  }

  // Pipes on either side, dripping.
  for (const [x0, x1, y0] of [
    [0, 12, 16],
    [84, 96, 22],
  ] as const) {
    for (let y = y0; y < y0 + 4; y++) {
      for (let x = x0; x < x1; x++) {
        const shade = y === y0 ? 0.25 : y === y0 + 3 ? -0.35 : 0;
        pixels[y * W + x] = mix([70, 74, 60], shade > 0 ? [255, 255, 255] : [0, 0, 0], Math.abs(shade));
      }
    }
    const drip = x0 === 0 ? x1 - 1 : x0;
    for (let y = y0 + 4; y < y0 + 8; y++) if (y % 2 === 0) pixels[y * W + drip] = mix(palette.sludge, [255, 255, 255], 0.15);
  }

  // Sludge along the bottom, with a few ripples.
  for (let y = 50; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const ripple = Math.sin(x / 3 + y * 1.7) > 0.85;
      pixels[y * W + x] = ripple ? mix(palette.sludge, [255, 255, 255], 0.18) : mix(palette.sludge, [0, 0, 0], (y - 50) * 0.04);
    }
  }
}

/** Mist over the sludge (and far thicker when she sinks away). */
function paintFog(pixels: Rgb[], palette: Palette, thick: boolean): void {
  const from = thick ? 16 : 44;
  for (let y = from; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const wave = Math.sin(x / 6 + y / 3) * 0.5 + Math.sin(x / 11 - y / 4) * 0.5;
      const depth = (y - from) / (H - from);
      const amount = Math.max(0, Math.min(thick ? 0.8 : 0.45, depth * (thick ? 0.9 : 0.6) + wave * 0.1 + (hash(x, y, 81) - 0.5) * 0.08));
      pixels[y * W + x] = mix(pixels[y * W + x] as Rgb, palette.fog, amount);
    }
  }
}

/** A puff of smoke: a soft blob, densest in the middle. */
function paintPuff(pixels: Rgb[], cx: number, cy: number, r: number, color: Rgb, strength: number): void {
  for (let y = Math.floor(cy - r); y <= Math.ceil(cy + r); y++) {
    for (let x = Math.floor(cx - r); x <= Math.ceil(cx + r); x++) {
      if (x < 0 || y < 0 || x >= W || y >= H) continue;
      const d = Math.hypot(x + 0.5 - cx, y + 0.5 - cy) / r;
      if (d >= 1) continue;
      const amount = strength * (1 - d) * (0.75 + hash(x, y, 91) * 0.25);
      pixels[y * W + x] = mix(pixels[y * W + x] as Rgb, color, amount);
    }
  }
}

/** The smoke rising off the censer: more of it, and thicker, the angrier she is; curling round the tunnel when she gloats. */
function paintSmoke(pixels: Rgb[], palette: Palette, mood: PlagueMood): void {
  if (mood === 'defeated') {
    // A last thin wisp from the censer lying in the sludge.
    paintPuff(pixels, DROPPED_CENSER[0] + 1, DROPPED_CENSER[1] - 5, 2, palette.smoke, 0.35);
    return;
  }
  if (mood === 'gloating') {
    for (let i = 0; i < 14; i++) {
      const a = (i / 14) * Math.PI * 2;
      paintPuff(pixels, 48 + Math.cos(a) * 32, 28 + Math.sin(a) * 18, 4, palette.smoke, 0.55);
    }
  }
  const puffs = mood === 'calm' || mood === 'shielded' || mood === 'gloating' ? 5 : 9;
  for (let i = 0; i < puffs; i++) {
    const t = i / puffs;
    const x = CENSER[0] + Math.sin(i * 1.3) * (2 + i * 0.8) + i * 0.8;
    const y = CENSER[1] - 4 - i * 4;
    paintPuff(pixels, x, y, 2 + t * 4, palette.smoke, mood === 'calm' || mood === 'shielded' ? 0.5 : 0.7);
  }
  // Angry, the fumes boil off her shoulders and hood too.
  if (mood === 'enraged' || mood === 'furious') {
    for (const [x, y] of [
      [38, 18],
      [58, 18],
      [42, 6],
      [54, 6],
      [33, 28],
      [64, 28],
    ] as const) {
      paintPuff(pixels, x, y - 2, 3, palette.smoke, 0.45);
    }
  }
}

/** The Fly Swarm: a cloud of flies all round her, thickest close in. */
function paintSwarm(pixels: Rgb[]): void {
  for (let y = 0; y < 52; y++) {
    for (let x = 14; x < 82; x++) {
      const d = Math.hypot((x + 0.5 - 48) / 34, (y + 0.5 - 28) / 26);
      if (d > 1) continue;
      if (hash(x, y, 101) < 0.16 * (1.2 - d)) pixels[y * W + x] = hash(x, y, 103) < 0.3 ? [90, 110, 120] : [8, 10, 8];
    }
  }
}

function paintMatriarch(pixels: Rgb[], grid: Grid, palette: Palette, mood: PlagueMood): void {
  paintParts(pixels, grid, {
    shades: palette.parts,
    outline: palette.outline,
    group: GROUP,
    flat: FLAT,
    flatColor: (part) => (part === 'eye' ? palette.eye : undefined),
  });
  const glow = (x: number, y: number, color: Rgb, amount: number): void => {
    if (x >= 0 && y >= 0 && x < W && y < H) pixels[y * W + x] = mix(pixels[y * W + x] as Rgb, color, amount);
  };

  // Gloating, her lenses narrow into a lit crescent each.
  if (mood === 'gloating') for (const [x, y] of [...pair(44, 14), ...pair(45, 13), ...pair(46, 14)] as Pt[]) glow(x, y, palette.eye, 0.9);

  // The lenses glow out onto the mask, more when she is angry; beaten, they have gone dark.
  if (mood !== 'defeated') {
    const reach = mood === 'furious' ? 2 : 1;
    for (const [x, y] of [...pair(45, 14), ...pair(46, 14)] as Pt[]) {
      for (let dy = -reach; dy <= reach; dy++) {
        for (let dx = -reach; dx <= reach; dx++) {
          if (Math.abs(dx) + Math.abs(dy) > reach) continue;
          const part = grid.partAt(x + dx, y + dy);
          if (part === 'eye') continue;
          glow(x + dx, y + dy, palette.eye, part === 'lens' ? 0.45 : 0.25);
        }
      }
    }
  }

  // The censer's light, on everything round it.
  if (mood !== 'defeated') {
    for (let y = CENSER[1] - 6; y <= CENSER[1] + 6; y++) {
      for (let x = CENSER[0] - 6; x <= CENSER[0] + 6; x++) {
        const d = Math.hypot(x - CENSER[0], y - CENSER[1]);
        if (d > 6 || grid.partAt(x, y) === 'censer') continue;
        glow(x, y, palette.smoke, 0.25 * (1 - d / 6));
      }
    }
  }
}

/** The picture for a matriarch that got away: the tunnel lost in green fog, and only a faint shape of her left, sinking. */
function paintFading(pixels: Rgb[], palette: Palette): void {
  paintBackground(pixels, palette);
  const behind = pixels.slice();
  paintMatriarch(pixels, drawMatriarch('fled'), palette, 'fled');
  // Most of the way back to the tunnel behind her: just a ghost of her is left.
  for (let i = 0; i < pixels.length; i++) pixels[i] = mix(pixels[i] as Rgb, behind[i] as Rgb, 0.72);
  paintFog(pixels, palette, true);
}

/** The picture's size in pixels (the same as the dragon's). */
export const PLAGUE_SIZE = { width: W * SCALE, height: H * SCALE } as const;

/** Draws the matriarch in the given mood as a PNG. */
export function renderPlague(mood: PlagueMood): Buffer {
  const pixels: Rgb[] = new Array<Rgb>(W * H);
  const palette = paletteFor(mood);
  if (mood === 'fled') {
    paintFading(pixels, palette);
  } else {
    paintBackground(pixels, palette);
    paintMatriarch(pixels, drawMatriarch(mood), palette, mood);
    paintSmoke(pixels, palette, mood);
    paintFog(pixels, palette, false);
    if (mood === 'shielded') paintSwarm(pixels);
  }
  return encodePng(PLAGUE_SIZE.width, PLAGUE_SIZE.height, blowUp(pixels, W, H, SCALE));
}

const cache = new Map<PlagueMood, Buffer>();

/** Like renderPlague, but each mood is only drawn once. */
export function plaguePicture(mood: PlagueMood): Buffer {
  let png = cache.get(mood);
  if (!png) {
    png = renderPlague(mood);
    cache.set(mood, png);
  }
  return png;
}
