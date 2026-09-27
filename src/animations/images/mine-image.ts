import { MINE_SIZE, type MineOre } from '../../constants/index.js';
import type { MineTile } from '../../lib/game/mine.js';
import { Canvas } from './canvas.js';
import { encodePng } from './png.js';
import { LINE } from './palette.js';
import { mix, shrinkRect, type Rgb } from './raster.js';
import { hash, type Pt } from './sprite.js';

/*
 * Draws a mine field as a PNG: the multiplier along the top, then the MINE_SIZE by MINE_SIZE tiles.
 * Hidden tiles are rough stone, dug ones are dark floor with what was in them (an ore, or the
 * dynamite that went off), and the miner stands on theirs. Once the run is over every tile is
 * shown, the ones never dug a little dimmed. Drawn at twice the size and shrunk to smooth the edges,
 * like plinko.
 */

const SUPERSAMPLE = 2;

const TILE = 72;
const GAP = 4;
const SIDE = 22;
const HEADER = 64;
const GRID = MINE_SIZE * TILE + (MINE_SIZE - 1) * GAP;
const WIDTH = GRID + 2 * SIDE;
const HEIGHT = HEADER + GRID + SIDE;

const BACKGROUND: Rgb = [32, 34, 38];
const STONE: Rgb = [104, 92, 80];
const STONE_LIGHT: Rgb = [132, 118, 102];
const STONE_DARK: Rgb = [84, 74, 64];
const FLOOR: Rgb = [70, 61, 53];
const MULTIPLIER: Rgb = [245, 197, 66];

const ORE_COLOR: Readonly<Record<MineOre, { body: Rgb; shine: Rgb }>> = {
  coal: { body: [20, 20, 24], shine: [120, 120, 130] },
  iron: { body: [190, 150, 118], shine: [236, 214, 196] },
  gold: { body: [236, 180, 40], shine: [255, 236, 150] },
  diamond: { body: [90, 210, 236], shine: [220, 250, 255] },
};

/** What is drawn. `over` shows every tile (the run has ended); `boom` puts the blast on the miner's tile. */
export interface MineView {
  tiles: readonly MineTile[];
  dug: readonly boolean[];
  pos: number;
  multiplier: number;
  over: boolean;
  boom: boolean;
}

/** "1.3x", "12x". */
const label = (multiplier: number): string => `${Number(multiplier.toFixed(2))}x`;

/** Draws the field. Returns the PNG file. */
export function renderMine(view: MineView): Buffer {
  const s = SUPERSAMPLE;
  const canvas = new Canvas(WIDTH * s, HEIGHT * s);
  canvas.fill(BACKGROUND);
  canvas.text(label(view.multiplier), (WIDTH / 2) * s, (HEADER / 2) * s, 5 * s, MULTIPLIER);

  // Shapes in picture pixels, drawn onto the bigger canvas.
  const rect = (x0: number, y0: number, x1: number, y1: number, color: Rgb): void => canvas.rect(x0 * s, y0 * s, x1 * s, y1 * s, color);
  const circle = (cx: number, cy: number, r: number, color: Rgb): void => canvas.circle(cx * s, cy * s, r * s, color);
  const polygon = (points: readonly Pt[], color: Rgb): void => canvas.polygon(points.map(([x, y]) => [x * s, y * s] as const), color);

  for (let i = 0; i < MINE_SIZE * MINE_SIZE; i++) {
    const x = SIDE + (i % MINE_SIZE) * (TILE + GAP);
    const y = HEADER + Math.floor(i / MINE_SIZE) * (TILE + GAP);
    const cx = x + TILE / 2;
    const cy = y + TILE / 2;
    const tile = view.tiles[i] as MineTile;
    const dug = view.dug[i] === true;
    // Never dug, but shown because the run is over: drawn on stone, dimmed.
    const dim = (color: Rgb): Rgb => (dug ? color : mix(color, LINE, 0.45));

    if (dug) {
      rect(x, y, x + TILE, y + TILE, FLOOR);
    } else {
      // Stone with a lighter top edge, a darker bottom edge and a few flecks (the same on every picture).
      rect(x, y, x + TILE, y + TILE, dim(STONE));
      rect(x, y, x + TILE, y + 5, dim(STONE_LIGHT));
      rect(x, y + TILE - 5, x + TILE, y + TILE, dim(STONE_DARK));
      for (let k = 0; k < 4; k++) {
        const fx = x + 10 + hash(i, k, 1) * (TILE - 20);
        const fy = y + 12 + hash(i, k, 2) * (TILE - 24);
        circle(fx, fy, 2.5, dim(STONE_DARK));
      }
      if (!view.over) continue;
    }

    if (tile.kind === 'ore') {
      const { body, shine } = ORE_COLOR[tile.ore];
      if (tile.ore === 'diamond') {
        polygon([[cx, cy - 20], [cx + 18, cy - 4], [cx, cy + 20], [cx - 18, cy - 4]], dim(body));
        polygon([[cx, cy - 20], [cx + 8, cy - 4], [cx, cy + 4], [cx - 8, cy - 4]], dim(shine));
      } else {
        // A cluster of nuggets.
        for (const [dx, dy, r] of [[-9, 4, 11], [9, 6, 10], [0, -8, 11]] as const) {
          circle(cx + dx, cy + dy, r, dim(body));
          circle(cx + dx - r / 3, cy + dy - r / 3, r / 3, dim(shine));
        }
      }
    } else if (tile.kind === 'dynamite') {
      const blew = view.boom && i === view.pos;
      if (blew) {
        // The blast: an orange star with a yellow middle.
        const star = (r1: number, r2: number): Pt[] =>
          Array.from({ length: 16 }, (_, k) => {
            const angle = (k * Math.PI) / 8;
            const r = k % 2 === 0 ? r1 : r2;
            return [cx + Math.sin(angle) * r, cy - Math.cos(angle) * r] as const;
          });
        polygon(star(34, 16), [237, 110, 50]);
        polygon(star(20, 10), [255, 214, 90]);
      } else {
        rect(cx - 16, cy - 8, cx + 16, cy + 14, dim([200, 48, 48]));
        rect(cx - 16, cy - 2, cx + 16, cy + 2, dim([150, 30, 30]));
        rect(cx - 1.5, cy - 20, cx + 1.5, cy - 8, dim([220, 220, 220]));
        circle(cx, cy - 21, 4, dim([255, 200, 60]));
      }
    }
  }

  // The miner, unless the dynamite under them went off: a face under a yellow helmet with a lamp.
  if (!view.boom) {
    const x = SIDE + (view.pos % MINE_SIZE) * (TILE + GAP) + TILE / 2;
    const y = HEADER + Math.floor(view.pos / MINE_SIZE) * (TILE + GAP) + TILE / 2 + 4;
    circle(x, y, 20, [255, 255, 255]);
    circle(x, y, 17, [236, 196, 160]);
    polygon(
      Array.from({ length: 13 }, (_, k) => [x - Math.cos((k * Math.PI) / 12) * 21, y - 4 - Math.sin((k * Math.PI) / 12) * 19] as const),
      [245, 197, 66],
    );
    rect(x - 23, y - 6, x + 23, y - 2, [220, 170, 40]);
    circle(x, y - 14, 4.5, [255, 255, 230]);
    circle(x - 6, y + 5, 2.2, LINE);
    circle(x + 6, y + 5, 2.2, LINE);
  }

  const out = shrinkRect(canvas.rgba, canvas.width, canvas.height, s);
  return encodePng(WIDTH, HEIGHT, out);
}
