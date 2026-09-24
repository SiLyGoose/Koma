import { GACHA_ANIMATION, STAR_COLORS } from '../../constants/index.js';
import type { Stars } from '../../types.js';
import { encodeGif, type GifFrame } from './gif.js';

/*
 * The gacha pull's shooting star, after the comet in "Your Name": a night sky fading from purple
 * at the bottom to blue at the top, full of stars, and a comet that comes in from the left edge (a
 * quarter of the way up from the bottom) and arcs over into the top-right of the picture. It starts
 * silver-white and partway along warms gradually into the colour of the best item pulled, with no
 * flash, just a few sparks; each point of its tail keeps the colour it had there. Higher tiers
 * leave more sparkling dust behind, and a multi pull's comet splits in two, like the film's. Once it has
 * come to rest its colour floods the whole picture in a flash, and the result is shown after that.
 *
 * Everything is drawn as light added onto the sky (a "screen" blend), in colours from 0 to 1. The
 * sky is drawn once and reused; the result is the same for every pull of a tier, so each tier's
 * animation is drawn once and kept (see cometGif).
 */

const WIDTH = 480;
const HEIGHT = 270;

type Rgb = readonly [number, number, number];
type Point = readonly [number, number];

const rgb = (code: string): Rgb => {
  const n = parseInt(code.slice(1), 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
};
const mix = (a: Rgb, b: Rgb, t: number): Rgb => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const WHITE: Rgb = [1, 1, 1];
/** The comet before it ignites. */
const SILVER: Rgb = [0.86, 0.9, 1];

/** A small seeded random number generator (mulberry32), so every pull of a tier looks the same. */
function seeded(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------------------------------------------------------------------------
// The sky

/** 4 by 4 ordered-dither thresholds, 0 to 15. */
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];

/** The sky's colour at the top and at the bottom; it blends smoothly between them. */
const SKY_TOP = rgb('#0c1548');
const SKY_BOTTOM = rgb('#3a2472');

interface Star {
  x: number;
  y: number;
  brightness: number;
  size: number;
  phase: number;
}

const STARS: readonly Star[] = (() => {
  const random = seeded(20160826);
  return Array.from({ length: 190 }, () => {
    const bright = random() < 0.08;
    return {
      x: random() * WIDTH,
      y: random() * HEIGHT,
      brightness: bright ? 0.9 : 0.2 + 0.45 * random(),
      size: bright ? 0.95 : 0.55,
      phase: random() * Math.PI * 2,
    };
  });
})();

let skyCache: Float32Array | null = null;

/** The sky, as RGB from 0 to 1. Drawn once. */
function sky(): Float32Array {
  if (skyCache) return skyCache;
  const out = new Float32Array(WIDTH * HEIGHT * 3);
  for (let y = 0; y < HEIGHT; y++) {
    const color = mix(SKY_TOP, SKY_BOTTOM, y / (HEIGHT - 1));
    for (let x = 0; x < WIDTH; x++) out.set(color, (y * WIDTH + x) * 3);
  }
  skyCache = out;
  return out;
}

// ---------------------------------------------------------------------------
// Light

/** Light added onto the sky for one frame, RGB from 0 up (it can go past 1; the blend caps it). */
class Light {
  readonly px = new Float32Array(WIDTH * HEIGHT * 3);

  add(x: number, y: number, color: Rgb, amount: number): void {
    if (amount <= 0.001 || x < 0 || y < 0 || x >= WIDTH || y >= HEIGHT) return;
    const at = (y * WIDTH + x) * 3;
    this.px[at] = (this.px[at] as number) + color[0] * amount;
    this.px[at + 1] = (this.px[at + 1] as number) + color[1] * amount;
    this.px[at + 2] = (this.px[at + 2] as number) + color[2] * amount;
  }

  /** A soft round glow: `falloff(distance)` is the brightness at each distance, out to `reach`. */
  glow(cx: number, cy: number, reach: number, color: Rgb, falloff: (distance: number) => number): void {
    const x0 = Math.max(0, Math.floor(cx - reach));
    const x1 = Math.min(WIDTH - 1, Math.ceil(cx + reach));
    const y0 = Math.max(0, Math.floor(cy - reach));
    const y1 = Math.min(HEIGHT - 1, Math.ceil(cy + reach));
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) this.add(x, y, color, falloff(Math.hypot(x + 0.5 - cx, y + 0.5 - cy)));
    }
  }
}

// ---------------------------------------------------------------------------
// The path

/**
 * The comet's path: a curve from just past the left edge, a quarter of the way up from the
 * bottom, arcing up and over to the right to stop in the top-right quarter of the picture.
 */
const START: Point = [-14, HEIGHT * 0.75];
const BEND: Point = [WIDTH * 0.3, HEIGHT * 0.02];
const END: Point = [WIDTH * 0.78, HEIGHT * 0.24];

/** The path as short straight pieces, with how far along it each point is. */
const PATH: { points: Point[]; along: number[] } = (() => {
  const points: Point[] = [];
  const along: number[] = [];
  for (let i = 0; i <= 600; i++) {
    const t = i / 600;
    const u = 1 - t;
    const point: Point = [u * u * START[0] + 2 * u * t * BEND[0] + t * t * END[0], u * u * START[1] + 2 * u * t * BEND[1] + t * t * END[1]];
    const last = points[points.length - 1];
    along.push(last ? (along[along.length - 1] as number) + Math.hypot(point[0] - last[0], point[1] - last[1]) : 0);
    points.push(point);
  }
  return { points, along };
})();
const PATH_LENGTH = PATH.along[PATH.along.length - 1] as number;

/** The point `s` pixels along the path (clamped to its ends), and which way the path runs there. */
function pathAt(s: number): { point: Point; dir: Point } {
  const at = Math.min(PATH_LENGTH, Math.max(0, s));
  let low = 0;
  let high = PATH.along.length - 1;
  while (high - low > 1) {
    const mid = (low + high) >> 1;
    if ((PATH.along[mid] as number) <= at) low = mid;
    else high = mid;
  }
  const a = PATH.points[low] as Point;
  const b = PATH.points[high] as Point;
  const span = (PATH.along[high] as number) - (PATH.along[low] as number) || 1;
  const k = (at - (PATH.along[low] as number)) / span;
  const length = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
  return { point: [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k], dir: [(b[0] - a[0]) / length, (b[1] - a[1]) / length] };
}

/** How far along the path the comet is at time `t` (0 to 1), in pixels: quick off the ground, slowing as it arrives. */
const distanceAt = (t: number): number => PATH_LENGTH * (1 - (1 - t) ** 1.4);

/** The time (0 to 1) at which the comet was `d` pixels along the path: distanceAt the other way round. */
const timeAt = (d: number): number => 1 - (1 - Math.min(1, Math.max(0, d / PATH_LENGTH))) ** (1 / 1.4);

/** 0 below 0, 1 above 1, and an S-shaped ease between. */
const smoothstep = (x: number): number => {
  const c = Math.min(1, Math.max(0, x));
  return c * c * (3 - 2 * c);
};

/** Where the comet stops: the head of the finished picture. */
export const COMET_REST: Point = END;

// ---------------------------------------------------------------------------
// The comet

/** How big the comet is drawn (1 is a small streak). */
const SIZE = 1.7;
const TAIL_LENGTH = WIDTH * 0.5;
/** How long the comet takes to warm from silver-white to its colour after it ignites, as a fraction of the flight. */
const WARM = 0.22;

/** How wide the tail's soft glow is, `along` of the way back from the head (0 to 1). */
const hazeWidth = (along: number): number => (3 + 11 * along) * SIZE;

/**
 * For each pixel, the nearest point on the tail being drawn: how far away (squared) and how far
 * behind the head. Reused for every tail; a pixel's entry only counts if its stamp is the current
 * generation, so nothing has to be cleared between tails.
 */
const TAIL_NEAREST = {
  distance: new Float32Array(WIDTH * HEIGHT),
  behind: new Float32Array(WIDTH * HEIGHT),
  stamp: new Int32Array(WIDTH * HEIGHT),
  generation: 1,
};

/** A tail as a list of points from the head backwards, each with how far behind the head it is. */
type Tail = { point: Point; behind: number }[];

/** The main comet's tail: the last `length` pixels of path behind `s`, a point every few pixels. */
function tailOf(s: number, length: number): Tail {
  const out: Tail = [];
  const reach = Math.min(length, s);
  for (let behind = 0; ; behind = Math.min(reach, behind + 6)) {
    out.push({ point: pathAt(s - behind).point, behind });
    if (behind >= reach) break;
  }
  return out;
}

/**
 * One comet: a head at the tail's first point and a tail trailing back along the rest, which can
 * curve. `length` is how long a full tail is (it fades out towards there), `colorAt(s)` its colour
 * `s` pixels behind the head, so the colour can run back down the tail after it ignites.
 */
function drawComet(light: Light, tail: Tail, length: number, strength: number, colorAt: (s: number) => Rgb): void {
  const head = (tail[0] as Tail[number]).point;
  const next = tail[1]?.point ?? head;
  const facing: Point = [head[0] - next[0], head[1] - next[1]];

  // The tail: a bright thin core inside a wider glow that fans out and fades away from the head.
  // Each pixel takes the nearest point on the tail's pieces: each piece visits only the pixels
  // close enough to it to be lit (its glow is wider further back), keeping the closest it finds.
  const nearest = TAIL_NEAREST;
  const touched: number[] = [];
  for (let i = 0; i + 1 < tail.length; i++) {
    const a = tail[i] as Tail[number];
    const b = tail[i + 1] as Tail[number];
    const pad = 2.4 * hazeWidth(Math.min(1, b.behind / length)) + 2;
    const dx = b.point[0] - a.point[0];
    const dy = b.point[1] - a.point[1];
    const len2 = dx * dx + dy * dy || 1;
    const xs = Math.max(0, Math.floor(Math.min(a.point[0], b.point[0]) - pad));
    const xe = Math.min(WIDTH - 1, Math.ceil(Math.max(a.point[0], b.point[0]) + pad));
    const ys = Math.max(0, Math.floor(Math.min(a.point[1], b.point[1]) - pad));
    const ye = Math.min(HEIGHT - 1, Math.ceil(Math.max(a.point[1], b.point[1]) + pad));
    for (let y = ys; y <= ye; y++) {
      for (let x = xs; x <= xe; x++) {
        const px = x + 0.5;
        const py = y + 0.5;
        const k = Math.min(1, Math.max(0, ((px - a.point[0]) * dx + (py - a.point[1]) * dy) / len2));
        const d = (px - a.point[0] - dx * k) ** 2 + (py - a.point[1] - dy * k) ** 2;
        if (d > pad * pad) continue;
        const p = y * WIDTH + x;
        if (nearest.stamp[p] !== nearest.generation) {
          nearest.stamp[p] = nearest.generation;
          nearest.distance[p] = d;
          nearest.behind[p] = a.behind + (b.behind - a.behind) * k;
          touched.push(p);
        } else if (d < (nearest.distance[p] as number)) {
          nearest.distance[p] = d;
          nearest.behind[p] = a.behind + (b.behind - a.behind) * k;
        }
      }
    }
  }
  nearest.generation++;
  for (const p of touched) {
    const x = p % WIDTH;
    const y = (p - x) / WIDTH;
    {
      // Nothing in front of the head: its own glow covers that.
      if ((x + 0.5 - head[0]) * facing[0] + (y + 0.5 - head[1]) * facing[1] > 0) continue;
      const across = Math.sqrt(nearest.distance[p] as number);
      const behind = nearest.behind[p] as number;
      const along = Math.min(1, behind / length);
      const fade = (1 - along) ** 1.7 * strength;
      if (fade <= 0) continue;
      const color = colorAt(behind);
      const core = Math.exp(-((across / ((0.7 + 1.6 * along) * SIZE)) ** 2)) * fade;
      const haze = Math.exp(-((across / hazeWidth(along)) ** 2)) * fade * 0.55;
      light.add(x, y, mix(color, WHITE, 0.3), core);
      light.add(x, y, color, haze);
    }
  }

  // The head: a white-hot point, a coloured halo, a wide soft bloom and a four-point sparkle. Each
  // glow reaches far enough to fade to nothing, so no square edge shows where it stops.
  const [hx, hy] = head;
  const color = colorAt(0);
  light.glow(hx, hy, 12 * SIZE, WHITE, (r) => 1.6 * Math.exp(-((r / (2.4 * SIZE)) ** 2)) * strength);
  light.glow(hx, hy, 85 * SIZE, color, (r) => (0.8 * Math.exp(-r / (7 * SIZE)) + 0.3 * Math.exp(-((r / (26 * SIZE)) ** 2))) * strength);
  const spikes = Math.round(30 * SIZE);
  for (let i = -spikes; i <= spikes; i++) {
    const spike = Math.exp(-Math.abs(i) / (9 * SIZE)) * 0.6 * strength;
    for (let w = -2; w <= 2; w++) {
      const across = Math.exp(-((w / (0.7 * SIZE)) ** 2));
      light.add(Math.round(hx + i), Math.round(hy + w), mix(color, WHITE, 0.5), spike * across);
      light.add(Math.round(hx + w), Math.round(hy + i), mix(color, WHITE, 0.5), spike * across * 0.8);
    }
  }
}

/** Sparks and dust, fixed per tier so every pull of a tier looks the same. */
interface Particle {
  angle: number;
  speed: number;
  size: number;
  life: number;
  /** For dust: how far back along the tail it was shed, and how far it drifts sideways. */
  behind: number;
  drift: number;
}

function particles(seed: number, count: number): Particle[] {
  const random = seeded(seed);
  return Array.from({ length: count }, () => ({
    angle: random() * Math.PI * 2,
    speed: 0.5 + random(),
    size: (0.6 + random() * 0.9) * Math.sqrt(SIZE),
    life: 0.5 + random() * 0.5,
    behind: random(),
    drift: (random() - 0.5) * 2,
  }));
}

/** How much sparkling dust each tier leaves along its tail after it ignites. */
const DUST: Readonly<Record<Stars, number>> = { 1: 12, 2: 26, 3: 44, 4: 70 };

/**
 * How bright the finale's light rays are all the way round the star (2048 steps of angle, 0 to 1):
 * waves of many different sizes added together, so the rays come out soft, uneven and irregular,
 * like light breaking through cloud, rather than a neat ring of equal beams.
 */
const RAY_PROFILE: Float32Array = (() => {
  const random = seeded(7310);
  const waves = Array.from({ length: 16 }, () => ({ turns: 3 + Math.floor(random() * 38), phase: random() * Math.PI * 2, weight: 0.3 + random() * 0.7 }));
  const raw = Array.from({ length: 2048 }, (_, i) => {
    const angle = (i / 2048) * Math.PI * 2;
    return waves.reduce((sum, w) => sum + w.weight * (0.5 + 0.5 * Math.cos(w.turns * angle + w.phase)), 0);
  });
  const low = Math.min(...raw);
  const high = Math.max(...raw);
  return Float32Array.from(raw, (v) => ((v - low) / (high - low)) ** 2.2);
})();

const rayAt = (angle: number): number => {
  const turn = angle / (Math.PI * 2);
  return RAY_PROFILE[Math.floor((turn - Math.floor(turn)) * 2048) & 2047] as number;
};

/** A fixed grain for each pixel, 0 to 1, that roughens the rays a little. */
const grain = (x: number, y: number): number => {
  const v = Math.sin(x * 12.9898 + y * 78.233) * 43758.5453;
  return v - Math.floor(v);
};

/**
 * The finale, once the star has come to rest: its colour blooms out from the head, rays spin out
 * of it, and the whole picture fills with the colour, whitest at the middle, like the flash before
 * a gacha game shows what was pulled. `k` goes from 0 (nothing yet) to 1 (the full flash).
 */
function drawFinale(light: Light, tier: Rgb, k: number): void {
  const [hx, hy] = COMET_REST;
  const bloomRadius = 40 + k * 260;
  const rayReach = 90 + 380 * k;
  const spin = k * 0.35;
  // At the full flash the picture is the tier's colour (light of about the colour's own strength,
  // screened onto the dark sky, lands on that colour), lighter towards the star, and white only
  // right around it, so the flash never washes out to plain white.
  const fill = k * k * 0.95;
  const coreRadius = 30 + 70 * k;
  const white = mix(tier, WHITE, 0.75);
  const rayColor = mix(tier, WHITE, 0.5);
  for (let y = 0; y < HEIGHT; y++) {
    for (let x = 0; x < WIDTH; x++) {
      const dx = x + 0.5 - hx;
      const dy = y + 0.5 - hy;
      const r = Math.hypot(dx, dy);
      const bloom = Math.exp(-((r / bloomRadius) ** 2)) * (0.4 + 0.6 * k);
      // Soft, uneven rays, broken up along their length and lightly grained.
      const angle = Math.atan2(dy, dx);
      const broken = 0.75 + 0.25 * Math.sin(r / 13 + angle * 5);
      const ray = rayAt(angle + spin) * broken * (0.8 + 0.4 * grain(x, y)) * Math.exp(-r / rayReach) * 0.9 * k;
      // The colour is capped at its own strength: past that its weaker channels would catch up and
      // turn purple pink and blue cyan. Anything brighter (the rays, the core) is paler light on top.
      light.add(x, y, tier, Math.min(1, bloom + fill));
      light.add(x, y, rayColor, ray);
      light.add(x, y, white, k * k * Math.exp(-((r / coreRadius) ** 2)));
    }
  }
}

/** Which kind of pull the animation is for: a multi pull's comet splits in two, a single pull's never does. */
export type Pull = 'single' | 'multi';

/**
 * Picture `frame` for a `pull` whose best item has `stars`, as 8-bit RGBA: the flight is `frames`
 * pictures long, and `finale` (0 to 1) is how far into the flash at the end it is. With no finale
 * the last flight frame is the comet at rest in its colour.
 */
function renderFrame(stars: Stars, frame: number, frames: number, finale = 0, pull: Pull = 'single'): Uint8Array {
  const t = frames <= 1 ? 1 : Math.min(1, frame / (frames - 1));
  const ignite = GACHA_ANIMATION.igniteAt;
  const tier = rgb(STAR_COLORS[stars]);
  const light = new Light();

  // Stars, twinkling a little from frame to frame.
  for (const star of STARS) {
    const twinkle = 0.7 + 0.3 * Math.sin(star.phase + frame * 0.6);
    light.glow(star.x, star.y, 2.5, [0.9, 0.93, 1], (r) => star.brightness * twinkle * Math.exp(-((r / star.size) ** 2)));
  }

  const s = distanceAt(t);
  const igniteS = distanceAt(ignite);
  const igniteHead = pathAt(igniteS).point;
  // After it ignites the comet warms gradually from silver-white to its colour. Each point of the
  // tail keeps the colour the head had when it passed there, so the tail is a long, smooth fade.
  const lit = t < ignite ? -1 : s - igniteS;
  const warmth = (time: number): number => smoothstep((time - ignite) / WARM);
  const colorAt = (behind: number): Rgb => (lit < 0 ? SILVER : mix(SILVER, tier, warmth(timeAt(s - behind))));
  const now = mix(SILVER, tier, warmth(t));
  const sinceIgnite = t - ignite;

  // A multi pull's comet splits after it ignites, whatever the tier: a smaller piece peels away on
  // the outside of the curve, its tail running back to where it broke off.
  if (pull === 'multi' && lit > 0) {
    const apart = Math.min(1, sinceIgnite / (1 - ignite)) ** 0.8;
    const pieceS = s - 22 * SIZE * apart;
    const piece: Tail = [];
    for (let behind = 0; pieceS - behind > igniteS; behind += 6) {
      const at = pieceS - behind;
      const { point, dir } = pathAt(at);
      const out = 34 * SIZE * apart * Math.min(1, (at - igniteS) / Math.max(1, pieceS - igniteS)) ** 1.3;
      piece.push({ point: [point[0] - dir[1] * out, point[1] + dir[0] * out], behind });
    }
    if (piece.length > 1) drawComet(light, piece, TAIL_LENGTH * 0.6, 0.75, () => now);
  }
  drawComet(light, tailOf(s, TAIL_LENGTH), TAIL_LENGTH, 1, colorAt);

  if (sinceIgnite >= 0) {
    // As it starts to warm, a few sparks drift off where it was (no flash: the colour change is gradual).
    for (const spark of particles(stars * 101, 18 + 6 * stars)) {
      const age = sinceIgnite / (0.4 * spark.life);
      if (age >= 1) continue;
      const reach = 70 * SIZE * spark.speed * Math.sqrt(age);
      const sx = igniteHead[0] + Math.cos(spark.angle) * reach;
      const sy = igniteHead[1] + Math.sin(spark.angle) * reach + 30 * age * age;
      const glow = smoothstep(age * 5) * (1 - age) * 1.2;
      light.glow(sx, sy, 5, mix(now, WHITE, 0.4), (r) => glow * Math.exp(-((r / spark.size) ** 2)));
    }
    // Dust shed along the lit tail, drifting away and fading.
    for (const mote of particles(stars * 977, DUST[stars])) {
      const behind = mote.behind * Math.min(lit, TAIL_LENGTH);
      const fade = 1 - behind / TAIL_LENGTH;
      const { point, dir } = pathAt(s - behind);
      const side = mote.drift * (4 + behind * 0.12) * SIZE * 0.7;
      const twinkle = 0.6 + 0.4 * Math.sin(mote.angle + frame * 1.1);
      light.glow(point[0] - dir[1] * side, point[1] + dir[0] * side + behind * 0.04, 4, mix(colorAt(behind), WHITE, 0.3), (r) => fade * twinkle * 0.9 * Math.exp(-((r / mote.size) ** 2)));
    }
  }
  if (finale > 0) drawFinale(light, tier, finale);

  // Screen the light onto the sky: bright light saturates to white instead of clipping harshly.
  // A tiny ordered dither keeps the gentle sky gradient from showing as stripes. During the finale
  // the sky fades out under the flash, so the colour comes through pure (red, not pink on purple).
  const base = sky();
  const skyLeft = 1 - 0.9 * finale;
  const out = new Uint8Array(WIDTH * HEIGHT * 4);
  for (let p = 0; p < WIDTH * HEIGHT; p++) {
    const x = p % WIDTH;
    const y = (p - x) / WIDTH;
    const dither = (BAYER[(y & 3) * 4 + (x & 3)] as number) / 16 - 0.5;
    for (let c = 0; c < 3; c++) {
      const v = 1 - (1 - (base[p * 3 + c] as number) * skyLeft) * (1 - Math.min(1, light.px[p * 3 + c] as number));
      out[p * 4 + c] = Math.max(0, Math.min(255, Math.round(v * 255 + dither)));
    }
    out[p * 4 + 3] = 255;
  }
  return out;
}

const gifs = new Map<string, Buffer>();

/**
 * The shooting-star animation for a `pull` whose best item has `stars`, as a GIF: the flight, then
 * the flash, holding on its brightest picture. Drawn once per tier and kind of pull, and kept.
 */
export function cometGif(stars: Stars, pull: Pull = 'single'): Buffer {
  const key = `${pull}:${stars}`;
  const made = gifs.get(key);
  if (made) return made;
  const { frames, flashFrames, frameMs, holdMs } = GACHA_ANIMATION;
  const total = frames + flashFrames;
  const list: GifFrame[] = Array.from({ length: total }, (_, frame) => ({
    rgba: renderFrame(stars, frame, frames, frame < frames ? 0 : (frame - frames + 1) / flashFrames, pull),
    delayMs: frame === total - 1 ? frameMs + holdMs : frameMs,
  }));
  const gif = encodeGif(WIDTH, HEIGHT, list);
  gifs.set(key, gif);
  return gif;
}

/** How long the animation plays: the flight, the flash and the hold on the flash. */
export const cometDurationMs = (): number =>
  (GACHA_ANIMATION.frames + GACHA_ANIMATION.flashFrames) * GACHA_ANIMATION.frameMs + GACHA_ANIMATION.holdMs;

/** For tests: the frame renderer itself, and the picture size. */
export const COMET_SIZE = { width: WIDTH, height: HEIGHT } as const;
export { renderFrame as renderCometFrame };
