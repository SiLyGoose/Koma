/*
 * Pinecraft: a side-on world under the surface that a member digs through for ores (see
 * lib/game/pinecraft.ts). No bet: every block dug costs energy, which comes back over time, and ores
 * are paid for in points as they are dug. What the ores pay and how energy works are settings
 * (`pinecraft.*`); the shape of the world is here.
 */

/** The ores, from the most common and least valuable to the rarest. What each pays is the `pinecraft.value.<ore>` setting. */
export const PINECRAFT_ORES = ['coal', 'iron', 'gold', 'diamond', 'ruby', 'emerald'] as const;
export type PinecraftOre = (typeof PINECRAFT_ORES)[number];

/**
 * The world: WIDTH blocks across and DEPTH rows from the top, the first SKY rows of which are open
 * sky, then a row of grass, then the ground. The bottom row is bedrock, which can't be dug.
 * - `dirtRows`: rows of dirt under the grass, then `mixRows` where dirt turns to stone, then stone.
 * - `oreChance`: how often a block of ground holds an ore (out of 1), from `oreStart` rows down.
 * - `caveLevel`: how high the cave noise must be for open cave, from `caveStart` rows down (0.7 makes
 *   about 12% of it cave). Caves are open ground: walking through one costs no energy, and it shows
 *   the ores around it.
 */
export const PINECRAFT_WORLD = {
  width: 31,
  depth: 400,
  sky: 3,
  dirtRows: 8,
  mixRows: 6,
  oreChance: 0.09,
  oreStart: 2,
  caveLevel: 0.7,
  caveStart: 12,
} as const;

/**
 * Which ores turn up how far down (rows under the grass), and how often compared with the others
 * that can turn up there: coal from the top, emerald only from 80 rows down.
 */
export const PINECRAFT_ORE_TABLE: Readonly<Record<PinecraftOre, { from: number; weight: number }>> = {
  coal: { from: 0, weight: 40 },
  iron: { from: 6, weight: 28 },
  gold: { from: 18, weight: 15 },
  diamond: { from: 35, weight: 9 },
  ruby: { from: 55, weight: 5 },
  emerald: { from: 80, weight: 3 },
};

/** The most energy (and points an ore pays) the settings may be set to. */
export const MAX_PINECRAFT_ENERGY = 10_000;
export const MAX_PINECRAFT_VALUE = 100_000;

/**
 * Playing Pinecraft on its web page (src/web, and the Koma-UI repo):
 * - `path`: where its web socket listens.
 * - `rowsAbove`, `rowsBelow`: how much of the world around the miner the page is sent.
 * - `lookRows`: how far up and down caves are followed to see what they open onto.
 * - `lobbyButtonMs`: how long the Open button under `k!pinecraft` keeps working.
 */
export const PINECRAFT_WEB = {
  path: '/pinecraft',
  rowsAbove: 10,
  rowsBelow: 14,
  lookRows: 40,
  lobbyButtonMs: 15 * 60_000,
} as const;
