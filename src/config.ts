import { ADMIN_USER_ID } from './constants.js';
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
    starWeights: { 1: 70, 2: 25, 3: 5, 4: 0 },
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
  const problems = validateSettings(CONFIG);
  if (problems.length > 0) throw new Error(`Invalid settings: ${problems.join('; ')}`);
}
