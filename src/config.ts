import { ADMIN_USER_ID, PITY_STARS, PLINKO_ROWS } from './constants.js';
import { defaultEquipmentSettings, type EquipmentSettings } from './data/effects.js';
import { validateSettings } from './lib/settings-spec.js';
import { STARS } from './types.js';
import type { Stars } from './types.js';

export { STARS };

/** The admin's user id is set in constants.ts. It is re-exported here so existing imports keep working. */
export { ADMIN_USER_ID };

export function isAdmin(userId: string): boolean {
  return userId === ADMIN_USER_ID;
}

export interface Settings {
  /** Messages must start with this to be treated as a command. */
  prefix: string;
  /** Color of the stripe on the left of every embed the bot sends, as #RRGGBB. */
  embedColor: string;
  claim: {
    /** Random points per hourly claim (inclusive). */
    min: number;
    max: number;
  };
  gacha: {
    /** Points per pull. */
    cost: number;
    /** Relative weights for each star tier. They do not need to add up to 100. */
    starWeights: Record<Stars, number>;
    /**
     * Pity for the top tier (PITY_STARS in constants.ts). The Nth pull since the last top-tier
     * item has its chance raised: from softStart the chance climbs a step per pull, and reaches
     * 100% at hardPity. hardPity 0 turns pity off.
     */
    pity: {
      softStart: number;
      hardPity: number;
    };
  };
  rob: {
    /** Minutes a robber must wait between attempts. */
    cooldownMinutes: number;
    /**
     * Minutes a member is protected after being robbed successfully, counted from that robbery.
     * 0 turns the protection off.
     */
    victimProtectionMinutes: number;
    /** Chance a rob attempt succeeds (0 to 1). */
    successChance: number;
    /** Points stolen on success (inclusive); capped at what the victim has. */
    minStolen: number;
    maxStolen: number;
    /**
     * Victims with fewer points than this cannot be robbed. 1 means anyone with points can be.
     * A victim with less than the amount rolled loses everything, and the robber gets all of it.
     */
    minVictimBalance: number;
    /** Paid by the robber to the victim when the attempt fails (capped at the robber's balance). */
    failFine: number;
    /**
     * Guard rails for equipment: gear can push the success chance down to minChance or up to
     * maxChance, but never past them. (If successChance itself is outside them, it still applies.)
     */
    minChance: number;
    maxChance: number;
  };
  sell: {
    /** Points a member gets for selling one item of each star tier (sell command). */
    price: Record<Stars, number>;
  };
  plinko: {
    /** The smallest and biggest bet. */
    minBet: number;
    maxBet: number;
    /**
     * What each slot pays, as a multiple of the bet. The board is mirrored, so there is one number
     * per slot counting in from the edge: 1 is the two outermost slots, and the last one is the
     * middle slot (PLINKO_ROWS / 2 + 1 numbers in all).
     */
    payout: Record<number, number>;
  };
  /** How strong each equipment effect is, per star tier: equipment.<effect>.<stars>. */
  equipment: EquipmentSettings;
  leaderboardSize: number;
}

/**
 * Starting values. The first time the bot runs, these are written to the `settings` collection
 * in MongoDB, and from then on the database is the source of truth: change them with the
 * admin-only config command (or by editing the document). Changing this file only affects
 * settings that are missing from the database.
 */
export const DEFAULTS: Readonly<Settings> = {
  prefix: 'k!',
  embedColor: '#97a0ff',
  claim: { min: 100, max: 500 },
  gacha: {
    cost: 280,
    // 4-star is 0.6% (6 in 1000). Pity only works while the 4-star weight is above 0.
    starWeights: { 1: 694, 2: 250, 3: 50, 4: 6 },
    pity: { softStart: 70, hardPity: 90 },
  },
  rob: {
    cooldownMinutes: 60,
    victimProtectionMinutes: 60,
    successChance: 0.4,
    minStolen: 100,
    maxStolen: 500,
    minVictimBalance: 1,
    failFine: 100,
    minChance: 0.05,
    maxChance: 0.95,
  },
  // A pull costs 280 and gives a 1-star 69% of the time, so selling everything you pull gets back roughly 30%.
  sell: { price: { 1: 40, 2: 100, 3: 400, 4: 1500 } },
  // On the 9-slot board the ball lands in the middle most often (70 in 256), so the middle pays the
  // least: these average out to about 98% of the bet.
  plinko: { minBet: 10, maxBet: 1000, payout: { 1: 9, 2: 3, 3: 1.4, 4: 0.7, 5: 0.4 } },
  equipment: defaultEquipmentSettings(),
  leaderboardSize: 10,
};

/**
 * The live settings the rest of the bot reads. It starts as a copy of DEFAULTS and is updated
 * in place from MongoDB (see services/settings.ts), so always read values at the moment you
 * need them instead of caching them.
 */
export const CONFIG: Settings = structuredClone(DEFAULTS);

export function validateConfig(): void {
  if (!STARS.includes(PITY_STARS)) throw new Error(`PITY_STARS (${PITY_STARS}) must be one of ${STARS.join(', ')}`);
  const payoutKeys = Object.keys(DEFAULTS.plinko.payout).length;
  if (payoutKeys !== PLINKO_ROWS / 2 + 1) {
    throw new Error(`DEFAULTS.plinko.payout needs ${PLINKO_ROWS / 2 + 1} numbers for PLINKO_ROWS ${PLINKO_ROWS}, it has ${payoutKeys}`);
  }
  const problems = validateSettings(CONFIG);
  if (problems.length > 0) throw new Error(`Invalid settings: ${problems.join('; ')}`);
}
