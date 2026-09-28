/*
 * Pinecraft: a world entirely underground that a member digs their way around for ores (see
 * lib/game/pinecraft.ts). No bet: every block dug costs energy, which comes back over time, and ores
 * are paid for in points as they are dug. What the ores pay and how energy works are settings
 * (`pinecraft.*`); the shape of the world is here.
 */

/** The ores, from the most common and least valuable to the rarest. What each pays is the `pinecraft.value.<ore>` setting. */
export const PINECRAFT_ORES = ['coal', 'iron', 'gold', 'diamond', 'emerald', 'amethyst', 'ruby'] as const;
export type PinecraftOre = (typeof PINECRAFT_ORES)[number];

/** Every block that pays when dug: dirt and stone (a little), then the ores. What each pays is the `pinecraft.value.<block>` setting. */
export const PINECRAFT_PAYING = ['dirt', 'stone', ...PINECRAFT_ORES] as const;
export type PinecraftPaying = (typeof PINECRAFT_PAYING)[number];

/**
 * The world: `size` by `size` blocks, the miner starting in an open 3x3 room in the middle with dirt
 * all around it. Past that the ground is dirt and stone in patches, with bedrock (which can't be
 * broken) here and there, and ores anywhere.
 * - `stoneLevel`: how high the ground's noise must be for stone rather than dirt (0.55 makes about
 *   40% of it stone).
 * - `bedrockChance`, `oreChance`: how often a block is bedrock, or holds an ore (out of 1).
 * - `version`: which layout this is. A world saved with another one is started over (the blocks dug
 *   in it would be in the wrong places).
 */
export const PINECRAFT_WORLD = {
  size: 401,
  stoneLevel: 0.55,
  bedrockChance: 0.03,
  oreChance: 0.1,
  version: 2,
} as const;

/** How often each ore turns up compared with the others, anywhere in the world: an ore block is coal 32 times in 106, amethyst and ruby 6 each. */
export const PINECRAFT_ORE_WEIGHTS: Readonly<Record<PinecraftOre, number>> = {
  coal: 32,
  iron: 24,
  gold: 17,
  diamond: 12,
  emerald: 9,
  amethyst: 6,
  ruby: 6,
};

/**
 * How long each block takes to break, in ms, like Minecraft: dirt is quickest, then
 * stone, then the ores, rarer ones harder, up to amethyst and ruby. Bedrock can't be broken at all.
 */
export const PINECRAFT_BREAK_MS: Readonly<Record<'dirt' | 'stone' | PinecraftOre, number>> = {
  dirt: 250,
  stone: 500,
  coal: 1050,
  iron: 1600,
  gold: 2250,
  diamond: 3550,
  emerald: 4650,
  amethyst: 5400,
  ruby: 5400,
};

/** The most energy (and points an ore pays) the settings may be set to. */
export const MAX_PINECRAFT_ENERGY = 10_000;
export const MAX_PINECRAFT_VALUE = 100_000;

/**
 * Playing Pinecraft on its web page (src/web, and the Koma-UI repo):
 * - `path`: where its web socket listens.
 * - `viewCols`, `viewRows`: how many blocks either side of the miner the page is sent.
 * - `look`: how far from the miner (in blocks) its tunnels are followed to see what they show.
 * - `breakGraceMs`: how much sooner than its break time a block may be finished, for the network's
 *   unevenness (the page starts breaking it and finishes it in two messages; see web/pinecraft/server.ts).
 */
export const PINECRAFT_WEB = {
  path: '/pinecraft',
  viewCols: 12,
  viewRows: 12,
  look: 40,
  breakGraceMs: 120,
} as const;
