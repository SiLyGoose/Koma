import { encodePng } from './png.js';
import { mix, type Rgb } from './raster.js';
import { blowUp, hash, mapShades, paintParts, SpriteGrid, type Pt, type Shades } from './sprite.js';
import type { DragonMood } from './dragon-image.js';

/*
 * Draws the Soul Reaper raid boss as a PNG, in the same pixel-art style as the dragon (sprite.ts):
 * a hooded figure in a tattered cloak floating over a foggy graveyard at night, a skull glowing out
 * of the hood, a scythe in one bony hand and the other reaching for the viewer, lost souls drifting
 * round it.
 *
 * It has the same moods as the dragon: `calm` is the usual reaper with cold blue eyes, `enraged`
 * turns deep blue with electric-blue eyes and souls and blue soulfire rising off the cloak,
 * `furious` (its last phase) burns blood red, jaw hanging open, the same soulfire now red, the
 * scythe blade glowing and a jagged ice-blue sword in its other hand, `shielded` fades it into a
 * see-through ghost behind its Spectral Veil, `defeated` is grey with its eyes gone out and the
 * blade snapped off, `gloating` (it wiped the party) grins with the souls swirling round it, and
 * `fled` leaves only a faint shape fading into thick fog.
 */

export type ReaperMood = DragonMood;

const W = 96;
const H = 60;
const SCALE = 5;

/** The parts of the reaper, back to front. */
/** `staff` is the scythe's staff behind the cloak; `shaft` is the same staff held out in front of it (the crossed weapons). */
const PARTS = ['staff', 'cloak', 'sleeve', 'hood', 'hoodIn', 'skull', 'socket', 'shaft', 'sword', 'hilt', 'hand', 'blade', 'eye', 'tooth'] as const;
type Part = (typeof PARTS)[number];
type Grid = SpriteGrid<Part>;

const GROUP: Partial<Record<Part, string>> = { cloak: 'robe', sleeve: 'robe', hood: 'robe' };
const FLAT: ReadonlySet<Part> = new Set<Part>(['hoodIn', 'socket', 'eye', 'tooth']);

const ROBE: Shades = [
  [92, 80, 122],
  [58, 48, 84],
  [32, 26, 50],
];
const BONE: Shades = [
  [240, 234, 214],
  [206, 196, 170],
  [140, 128, 104],
];
const WOOD: Shades = [
  [132, 96, 66],
  [96, 66, 44],
  [60, 40, 28],
];
/** The furious reaper's sword: a jagged blade of pale, icy blue, like frozen soulfire. */
const ICE: Shades = [
  [224, 242, 255],
  [140, 190, 246],
  [66, 96, 168],
];
const DARK_METAL: Shades = [
  [120, 116, 140],
  [74, 70, 94],
  [40, 36, 54],
];
const STEEL: Shades = [
  [226, 234, 246],
  [168, 180, 200],
  [98, 108, 128],
];

interface Palette {
  parts: Record<Part, Shades>;
  outline: Rgb;
  eye: Rgb;
  /** The glow round the eyes and the colour of the souls. */
  soul: Rgb;
  skyTop: Rgb;
  skyBottom: Rgb;
  fog: Rgb;
  stone: Rgb;
}

function basePalette(): Palette {
  const flat = (c: Rgb): Shades => [c, c, c];
  return {
    parts: {
      staff: WOOD,
      shaft: WOOD,
      cloak: ROBE,
      sleeve: ROBE,
      hood: ROBE,
      hoodIn: flat([10, 6, 16]),
      skull: BONE,
      socket: flat([16, 10, 20]),
      hand: BONE,
      blade: STEEL,
      sword: ICE,
      hilt: DARK_METAL,
      eye: flat([140, 230, 255]),
      tooth: flat(BONE[0]),
    },
    outline: [12, 8, 20],
    eye: [140, 230, 255],
    soul: [120, 220, 255],
    skyTop: [8, 12, 26],
    skyBottom: [36, 34, 60],
    fog: [132, 140, 170],
    stone: [44, 46, 62],
  };
}

function paletteFor(mood: ReaperMood): Palette {
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
      // Cold fury: the cloak takes on a deep blue, and its eyes and the souls blaze electric blue.
      const cold = mapAll((c) => mix(c, [30, 70, 190], 0.2), ['hoodIn', 'socket']);
      return { ...cold, eye: [120, 180, 255], soul: [70, 140, 255], skyTop: [4, 8, 30], skyBottom: [18, 36, 92], fog: [110, 140, 200] };
    }
    case 'furious': {
      // Blood red: a cloak darkened toward crimson, the scythe blade glowing red-hot, eyes burning
      // white with a red glow, and red souls and fog under a blood-red sky.
      const dark = mapAll((c) => mix(c, [40, 4, 8], 0.35), ['hoodIn', 'socket', 'blade', 'sword', 'hilt']);
      const glowing: Shades = [
        [255, 214, 196],
        [255, 110, 90],
        [196, 36, 40],
      ];
      return { ...dark, parts: { ...dark.parts, blade: glowing }, outline: [14, 2, 4], eye: [255, 240, 230], soul: [255, 70, 60], skyTop: [18, 2, 6], skyBottom: [84, 14, 18], fog: [170, 96, 96] };
    }
    case 'gloating':
      return { ...base, soul: [170, 240, 255], skyTop: [16, 10, 30], skyBottom: [52, 38, 74] };
    case 'shielded': {
      // The figure fades toward the sky behind it: a see-through ghost, outlined in pale light.
      const ghost = mapAll((c) => mix(c, [150, 170, 220], 0.45), ['hoodIn', 'socket']);
      return { ...ghost, outline: [190, 220, 255], eye: [220, 245, 255], soul: [190, 230, 255], fog: [170, 190, 230] };
    }
    case 'defeated': {
      const grey = (c: Rgb): Rgb => {
        const l = (c[0] * 0.3 + c[1] * 0.59 + c[2] * 0.11) * 0.7;
        return [l, l, l * 1.05];
      };
      return { ...mapAll(grey), outline: [18, 18, 22], eye: [30, 30, 34], soul: [90, 90, 100], skyTop: [8, 8, 12], skyBottom: [24, 24, 30], fog: [90, 90, 100] };
    }
  }
}

// ---------------------------------------------------------------------------
// The reaper
// ---------------------------------------------------------------------------

/** Sprite pixels on the face that the painter treats specially. */
interface Face {
  /** Each eye's glowing pupil. */
  eyes: Pt[];
  /** Gloating: eyes narrowed into happy arcs. */
  happyEyes: Pt[];
  /** The line of the mouth, and the teeth above it. */
  mouth: Pt[];
  /** Furious: the jaw hanging open, dark inside. */
  jaw: Pt[];
}

/** Both of a pixel and its mirror image across the middle of the picture. */
const pair = (x: number, y: number): Pt[] => [
  [x, y],
  [W - 1 - x, y],
];

/**
 * Where the reaper's parts go. It floats facing the viewer: a tall hood, a cloak flaring out to a
 * ragged hem, the scythe held upright in its right hand (the viewer's left) with the blade curving
 * out over its head, and its left hand raised, reaching. Furious, it crosses a scythe and a sword
 * in front of its chest instead (drawCrossed).
 */
function drawReaper(mood: ReaperMood): { grid: Grid; face: Face } {
  const g: Grid = new SpriteGrid(PARTS, W, H);
  const crossed = mood === 'furious';

  // The scythe's staff, behind the cloak, gripped halfway up.
  if (!crossed) g.limb([25, 58], [26.5, 30], [29, 5], 1.3, 1.1, 'staff');

  // The cloak: narrow at the shoulders, flaring out to a torn hem that trails off into the fog.
  g.polygon(
    [
      [41, 19],
      [55, 19],
      [60, 28],
      [64, 40],
      [69, 55],
      [65, 52],
      [62, 57],
      [58, 52],
      [54, 58],
      [50, 53],
      [46, 58],
      [42, 53],
      [38, 57],
      [34, 52],
      [31, 56],
      [27, 55],
      [32, 40],
      [36, 28],
    ],
    'cloak',
  );

  // Sleeves: the right one down and out to the staff, the left one raised toward the viewer.
  // Bony hands: one closed round the staff, the other reaching with long fingers.
  if (!crossed) {
    g.limb([40, 23], [33, 27], [29, 32], 3.4, 3, 'sleeve');
    g.limb([56, 23], [63, 25], [67, 30], 3.4, 3, 'sleeve');
    g.ellipse(28.5, 33, 2.2, 2, 'hand');
    g.ellipse(69, 31.5, 2, 1.8, 'hand');
    for (const [from, to] of [
      [[70, 30], [73, 26]],
      [[70.5, 31], [74.5, 28.5]],
      [[70.5, 32], [74.5, 32]],
      [[69, 33], [71, 36]],
    ] as [Pt, Pt][]) {
      g.line(from, to, 'hand');
    }
  }

  // The hood: a tall peaked cowl, open at the front onto darkness.
  g.polygon(
    [
      [48, 3],
      [53, 5],
      [57.5, 11],
      [58.5, 19],
      [56, 24],
      [40, 24],
      [37.5, 19],
      [38.5, 11],
      [43, 5],
    ],
    'hood',
  );
  g.ellipse(48, 16, 6.5, 7.5, 'hoodIn', ['hood']);

  // The skull in the dark of the hood: a round cranium, cheekbones, and a narrow jaw.
  g.ellipse(48, 15, 4.6, 4.4, 'skull', ['hoodIn']);
  g.polygon(
    [
      [44.5, 17],
      [51.5, 17],
      [50.5, 21.5],
      [45.5, 21.5],
    ],
    'skull',
    ['hoodIn', 'skull'],
  );
  // Eye sockets and the nose.
  for (const [x, y] of [...pair(45, 15), ...pair(46, 15), ...pair(45, 16), ...pair(46, 16), [47, 18], [48, 18]] as Pt[]) g.set(x, y, 'socket');

  // The blade, curving out from the top of the staff over the reaper's head to a point on the left.
  // Defeated, it has snapped off, leaving a jagged stub. Furious, the crossed weapons are drawn
  // instead, in front of everything but the face.
  if (crossed) {
    drawCrossed(g);
  } else if (mood === 'defeated') {
    g.polygon(
      [
        [29, 3],
        [24, 3.5],
        [22, 6],
        [25, 5.5],
        [29, 7],
      ],
      'blade',
    );
  } else {
    g.polygon(
      [
        [30, 2.5],
        [22, 1],
        [14, 2],
        [8, 5],
        [4, 10],
        [2, 16],
        [6, 11],
        [11, 7.5],
        [18, 5.5],
        [25, 5.5],
        [30, 7],
      ],
      'blade',
    );
  }

  // Teeth along the jaw.
  for (const x of [46, 47, 48, 49]) g.set(x, 20, 'tooth');

  const eyes = [...pair(45, 15), ...pair(45, 16)];
  if (mood !== 'defeated' && mood !== 'gloating') for (const [x, y] of eyes) g.set(x, y, 'eye');

  const face: Face = {
    eyes,
    happyEyes: [...pair(44, 16), ...pair(45, 15), ...pair(46, 16)],
    mouth: [45, 46, 47, 48, 49, 50].map((x): Pt => [x, 21]),
    jaw: [46, 47, 48, 49].flatMap((x): Pt[] => [
      [x, 21],
      [x, 22],
    ]),
  };
  return { grid: g, face };
}

// ---------------------------------------------------------------------------
// Painting
// ---------------------------------------------------------------------------

/** Where the furious reaper holds its sword: the fist on the grip, and the tip of the blade. */
const SWORD_HAND: Pt = [35, 41];
const SWORD_TIP: Pt = [67, 5];
/** Where it holds its scythe: the fist, and the two ends of the staff. */
const SCYTHE_HAND: Pt = [61, 41];
const SCYTHE_TOP: Pt = [29, 6];
const SCYTHE_FOOT: Pt = [69, 50];

/** The point `t` of the way from `from` to `to` (0 to 1), moved `side` to one side of that line. */
function along(from: Pt, to: Pt, t: number, side: number): Pt {
  const dx = to[0] - from[0];
  const dy = to[1] - from[1];
  const length = Math.hypot(dx, dy);
  return [from[0] + dx * t + (-dy / length) * side, from[1] + dy * t + (dx / length) * side];
}

/**
 * The furious reaper's crossed weapons, in front of its chest: the scythe in its left hand (the
 * viewer's right), its staff slanting up to the blade curving out over the top left, and a long
 * sword in the other hand slanting up the other way, its jagged ice-blue blade crossing in front of
 * the staff. The arms come down from the shoulders to the two fists.
 */
function drawCrossed(g: Grid): void {
  g.limb([40, 23], [35, 30], SWORD_HAND, 3.4, 3, 'sleeve');
  g.limb([56, 23], [61, 30], SCYTHE_HAND, 3.4, 3, 'sleeve');

  // The scythe: the staff, and the blade curving out from its top to a point on the left.
  g.limb(SCYTHE_FOOT, SCYTHE_HAND, SCYTHE_TOP, 1.3, 1.1, 'shaft');
  g.polygon(
    [
      [30, 4.5],
      [22, 2.5],
      [14, 3.5],
      [8, 6.5],
      [4, 11.5],
      [2, 18],
      [6, 13],
      [11, 9.5],
      [18, 7.5],
      [25, 7.5],
      [30, 9],
    ],
    'blade',
  );

  // The sword's blade: jagged, notched edges tapering to the tip, from just above the crossguard.
  const base = along(SWORD_HAND, SWORD_TIP, 0.08, 0);
  const left: Pt[] = [];
  const right: Pt[] = [];
  const notches = 7;
  for (let i = 0; i <= notches; i++) {
    const t = i / notches;
    const width = 2.6 * (1 - t * 0.55) * (i % 2 === 0 ? 1 : 0.62);
    left.push(along(base, SWORD_TIP, t * 0.97, width));
    right.push(along(base, SWORD_TIP, t * 0.97, -width));
  }
  g.polygon([...left, SWORD_TIP, ...right.reverse()], 'sword');

  // The crossguard, square across the blade, and the grip running back through the fist to a pommel.
  g.polygon([along(base, SWORD_TIP, 0, 4.5), along(base, SWORD_TIP, 0.035, 4.5), along(base, SWORD_TIP, 0.035, -4.5), along(base, SWORD_TIP, 0, -4.5)], 'hilt');
  const pommel = along(SWORD_TIP, SWORD_HAND, 1.08, 0);
  g.line(base, pommel, 'hilt');
  g.ellipse(pommel[0], pommel[1], 1.2, 1.2, 'hilt');

  // The fists, over the grips.
  g.ellipse(SWORD_HAND[0], SWORD_HAND[1], 2.2, 2, 'hand');
  g.ellipse(SCYTHE_HAND[0], SCYTHE_HAND[1], 2.2, 2, 'hand');
}

/** Gravestones along the bottom: centre x, width, height. */
const STONES: readonly (readonly [number, number, number])[] = [
  [8, 7, 9],
  [19, 5, 6],
  [78, 6, 8],
  [89, 7, 11],
];

function paintBackground(pixels: Rgb[], palette: Palette, mood: ReaperMood): void {
  for (let y = 0; y < H; y++) {
    const sky = mix(palette.skyTop, palette.skyBottom, y / (H - 1));
    for (let x = 0; x < W; x++) {
      const star = y < 30 && hash(x, y, 41) < 0.012;
      pixels[y * W + x] = star ? mix(sky, [220, 220, 255], 0.7) : sky;
    }
  }

  // A thin crescent moon, high on the right.
  for (let y = 0; y < 20; y++) {
    for (let x = 70; x < W; x++) {
      const lit = Math.hypot(x + 0.5 - 84, y + 0.5 - 9) < 6;
      const shadow = Math.hypot(x + 0.5 - 86.5, y + 0.5 - 7.5) < 5.5;
      if (lit && !shadow) pixels[y * W + x] = mix([230, 230, 210], palette.skyTop, mood === 'furious' || mood === 'enraged' ? 0.35 : 0);
    }
  }

  // The ground, and gravestones leaning out of it.
  for (let y = 50; y < H; y++) for (let x = 0; x < W; x++) pixels[y * W + x] = mix(palette.stone, [0, 0, 0], 0.45);
  for (const [cx, w, h] of STONES) {
    const top = 51 - h;
    const r = w / 2;
    for (let y = top; y < 52; y++) {
      for (let x = Math.floor(cx - r); x <= Math.ceil(cx + r); x++) {
        const dx = x + 0.5 - cx;
        // A rounded top: a half circle as wide as the stone.
        if (Math.abs(dx) > r || (y < top + r && Math.hypot(dx, y + 0.5 - (top + r)) > r)) continue;
        const lit = dx < -r + 1.5 || y < top + 1.5;
        if (x >= 0 && x < W) pixels[y * W + x] = lit ? mix(palette.stone, [255, 255, 255], 0.15) : palette.stone;
      }
    }
  }
}

/** Fog rolling over the ground (and far thicker when the reaper fades away). */
function paintFog(pixels: Rgb[], palette: Palette, thick: boolean): void {
  const from = thick ? 18 : 42;
  for (let y = from; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const wave = Math.sin(x / 7 + y / 3) * 0.5 + Math.sin(x / 13 - y / 5) * 0.5;
      const depth = (y - from) / (H - from);
      const amount = Math.max(0, Math.min(thick ? 0.8 : 0.55, depth * (thick ? 0.9 : 0.75) + wave * 0.12 + (hash(x, y, 51) - 0.5) * 0.08));
      pixels[y * W + x] = mix(pixels[y * W + x] as Rgb, palette.fog, amount);
    }
  }
}

/** A lost soul: a small glowing head with a tail wisping down. */
function paintSoul(pixels: Rgb[], x: number, y: number, color: Rgb): void {
  const glow = (px: number, py: number, amount: number): void => {
    if (px >= 0 && py >= 0 && px < W && py < H) pixels[py * W + px] = mix(pixels[py * W + px] as Rgb, color, amount);
  };
  for (const [dx, dy] of [
    [0, 0],
    [1, 0],
    [0, 1],
    [1, 1],
  ] as const) {
    glow(x + dx, y + dy, 0.95);
  }
  for (const [dx, dy] of [
    [-1, 0],
    [2, 0],
    [-1, 1],
    [2, 1],
    [0, -1],
    [1, -1],
  ] as const) {
    glow(x + dx, y + dy, 0.35);
  }
  glow(x, y + 2, 0.6);
  glow(x + 1, y + 3, 0.4);
  glow(x, y + 4, 0.2);
}

/** Where the souls drift: round the reaper normally, in a ring when it gloats. */
function soulSpots(mood: ReaperMood): Pt[] {
  if (mood === 'gloating') {
    return Array.from({ length: 12 }, (_, i): Pt => {
      const a = (i / 12) * Math.PI * 2;
      return [Math.round(48 + Math.cos(a) * 30), Math.round(27 + Math.sin(a) * 18)];
    });
  }
  const base: Pt[] = [
    [12, 22],
    [20, 36],
    [76, 16],
    [84, 34],
    [72, 44],
    [16, 44],
  ];
  return mood === 'furious' || mood === 'enraged' ? [...base, [35, 10], [76, 6], [90, 24], [6, 32]] : base;
}

function paintReaper(pixels: Rgb[], { grid, face }: { grid: Grid; face: Face }, palette: Palette, mood: ReaperMood): void {
  paintParts(pixels, grid, {
    shades: palette.parts,
    outline: palette.outline,
    group: GROUP,
    flat: FLAT,
    flatColor: (part) => (part === 'eye' ? palette.eye : undefined),
  });

  const paint = ([x, y]: Pt, color: Rgb): void => {
    if (x >= 0 && y >= 0 && x < W && y < H) pixels[y * W + x] = color;
  };
  const glow = (x: number, y: number, color: Rgb, amount: number): void => {
    if (x >= 0 && y >= 0 && x < W && y < H) pixels[y * W + x] = mix(pixels[y * W + x] as Rgb, color, amount);
  };

  // Folds down the cloak: a few darker creases from the waist to the hem.
  for (const x of [42, 47, 52]) {
    for (let y = 30; y < 55; y++) {
      const fx = x + Math.round((y - 30) * (x - 47) * 0.02);
      if (grid.partAt(fx, y) === 'cloak') paint([fx, y], palette.parts.cloak[2]);
    }
  }

  // The mouth: shut, grinning (with the jaw set), or hanging open.
  if (mood === 'furious') face.jaw.forEach((at) => paint(at, [8, 4, 10]));
  else face.mouth.forEach((at) => paint(at, palette.outline));

  // The eyes: a cold glow spilling into the sockets, electric blue when enraged, white-hot when furious.
  // Gloating, they narrow into happy arcs; defeated, they have gone out.
  if (mood === 'gloating') {
    face.happyEyes.forEach((at) => paint(at, palette.eye));
  } else if (mood !== 'defeated') {
    const reach = mood === 'furious' ? 2 : 1;
    for (const [x, y] of face.eyes) {
      for (let dy = -reach; dy <= reach; dy++) {
        for (let dx = -reach; dx <= reach; dx++) {
          if (Math.abs(dx) + Math.abs(dy) > reach || grid.partAt(x + dx, y + dy) === 'eye') continue;
          glow(x + dx, y + dy, palette.soul, mood === 'furious' ? 0.5 : 0.35);
        }
      }
    }
  }

  // Furious: the sword glows icy blue along its core and gives off a cold haze.
  if (mood === 'furious') {
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        if (grid.partAt(x, y) !== null) continue;
        const near = [-1, 1].some((d) => grid.partAt(x + d, y) === 'sword' || grid.partAt(x, y + d) === 'sword');
        if (near) glow(x, y, [120, 180, 255], 0.35);
      }
    }
    // A bright core down the middle of the blade.
    for (let i = 4; i <= 44; i++) {
      const [x, y] = along(SWORD_HAND, SWORD_TIP, 0.08 + (i / 50) * 0.85, 0);
      const at: Pt = [Math.floor(x), Math.floor(y)];
      if (grid.partAt(at[0], at[1]) === 'sword') paint(at, i % 6 === 0 ? [255, 255, 255] : [210, 236, 255]);
    }
  }

  // Soulfire licking up off the shoulders and the hood, and the scythe blade's edge blazing: blue
  // when enraged, red when furious.
  if (mood === 'enraged' || mood === 'furious') {
    const reach = 3;
    // Enraged, the flames burn a brighter, icier blue than its souls, so they stand out from the night sky.
    const flame: Rgb = mood === 'enraged' ? [140, 205, 255] : palette.soul;
    for (let y = 0; y < 30; y++) {
      for (let x = 30; x < 66; x++) {
        const part = grid.partAt(x, y);
        if (part !== null || grid.partAt(x, y + 1) === null) continue;
        const below = grid.partAt(x, y + 1);
        if (below !== 'hood' && below !== 'sleeve' && below !== 'cloak') continue;
        const tall = 1 + Math.floor(hash(x, y, 61) * reach);
        for (let i = 0; i < tall; i++) glow(x, y - i, flame, 0.85 - i * 0.2);
      }
    }
    for (let y = 0; y < 20; y++) for (let x = 0; x < 32; x++) if (grid.partAt(x, y) === 'blade' && grid.partAt(x, y + 1) !== 'blade') glow(x, y + 1, flame, 0.5);
  }
}

/** The picture for a reaper that got away: the graveyard lost in fog, and only a faint shape of it left, fading. */
function paintFading(pixels: Rgb[], palette: Palette): void {
  paintBackground(pixels, palette, 'fled');
  const behind = pixels.slice();
  paintReaper(pixels, drawReaper('fled'), palette, 'fled');
  // Most of the way back to the scene behind it: just a ghost of the reaper is left.
  for (let i = 0; i < pixels.length; i++) pixels[i] = mix(pixels[i] as Rgb, behind[i] as Rgb, 0.72);
  paintFog(pixels, palette, true);
  for (const [x, y] of [
    [22, 12],
    [70, 20],
    [60, 30],
  ] as const) {
    paintSoul(pixels, x, y, mix(palette.soul, palette.fog, 0.4));
  }
}

/** The picture's size in pixels (the same as the dragon's). */
export const REAPER_SIZE = { width: W * SCALE, height: H * SCALE } as const;

/** Draws the reaper in the given mood as a PNG. */
export function renderReaper(mood: ReaperMood): Buffer {
  const pixels: Rgb[] = new Array<Rgb>(W * H);
  const palette = paletteFor(mood);
  if (mood === 'fled') {
    paintFading(pixels, palette);
  } else {
    paintBackground(pixels, palette, mood);
    paintReaper(pixels, drawReaper(mood), palette, mood);
    paintFog(pixels, palette, false);
    for (const [x, y] of soulSpots(mood)) paintSoul(pixels, x, y, palette.soul);
  }
  return encodePng(REAPER_SIZE.width, REAPER_SIZE.height, blowUp(pixels, W, H, SCALE));
}

const cache = new Map<ReaperMood, Buffer>();

/** Like renderReaper, but each mood is only drawn once. */
export function reaperPicture(mood: ReaperMood): Buffer {
  let png = cache.get(mood);
  if (!png) {
    png = renderReaper(mood);
    cache.set(mood, png);
  }
  return png;
}
