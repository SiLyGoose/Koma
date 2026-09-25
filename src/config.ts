import { ADMIN_USER_ID, PITY_STARS, PLINKO_ROWS } from './constants/index.js';
import { defaultEquipmentSettings, type EquipmentSettings } from './perks/index.js';
import { validateSettings } from './lib/settings-spec.js';
import { STARS } from './types.js';
import type { Stars } from './types.js';

export { STARS };

/** The admin's user id is set in constants/core.ts. It is re-exported here so existing imports keep working. */
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
     * Pity for the top tier (PITY_STARS in constants/gacha.ts). The Nth pull since the last top-tier
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
  blackjack: {
    /** The smallest and biggest bet (per player; a double can take a hand above the biggest). */
    minBet: number;
    maxBet: number;
    /** A blackjack pays this many times the bet (1.5 is 3 to 2). */
    naturalPayout: number;
    /** Seconds a party table stays open for joining. */
    joinSeconds: number;
    /** Seconds a player has for each decision before they stand. */
    turnSeconds: number;
  };
  events: {
    /**
     * Random events (see src/events): after one starts, the next comes between minMinutes and
     * maxMinutes later, at a random time, in every server that has an events channel.
     */
    minMinutes: number;
    maxMinutes: number;
    crate: {
      /** The points in a crate are a random whole number between these (inclusive). */
      minPoints: number;
      maxPoints: number;
      /** How long the crate stays open for grabbing, in seconds. */
      seconds: number;
    };
    vault: {
      /** What a vault game (Greedy Heist, Split or Steal) puts up, as a multiple of the points lost to gambling since the last payout. */
      multiplier: number;
    };
    heist: {
      /** How long the crew has to join, in seconds. */
      joinSeconds: number;
      /** How many rounds the heist lasts, at most. The prize is handed out a slice per round. */
      rounds: number;
      /** How long each round lasts, in seconds: the time the crew has to decide whether to escape. */
      roundSeconds: number;
      /** The chance the alarm goes off in the first round. */
      alarmStart: number;
      /** Added to the alarm chance every round after the first. */
      alarmStep: number;
      /** What everyone still inside when the alarm goes off pays, added to the vault. */
      fine: number;
    };
    codedle: {
      /** How long the crew has to crack the code, in seconds. */
      seconds: number;
      /** What each guess costs, added to the vault. 0 makes guessing free. */
      guessCost: number;
    };
    splitSteal: {
      /** Fewest people who have to join for the game to be played. */
      minPlayers: number;
      /** How long people have to join, in seconds. */
      joinSeconds: number;
      /** How long the players have to choose Split or Steal, in seconds. */
      decideSeconds: number;
    };
  };
  /**
   * The weekly raid boss (commands/raid.ts). Its combat math is RAID_COMBAT in constants/raid.ts;
   * these are the numbers worth tuning while the bot runs.
   */
  raid: {
    /**
     * The boss's HP scales with the party (see bossHpFor in lib/events/raid.ts): `hpPerPlayer` for
     * each raider, times 1 + `hpGrowth` for every raider past the first (so a big party's boss grows a
     * little faster than the party does), and never below `minBossHp`, so a raid needs a few people.
     */
    hpPerPlayer: number;
    hpGrowth: number;
    minBossHp: number;
    /** Every player's HP. */
    playerHp: number;
    /** Rounds before the boss flies off (the raid is lost). */
    maxRounds: number;
    /** Seconds players have to pick their action each round. */
    turnSeconds: number;
    /** Seconds the lobby stays open for joining before the fight starts. */
    prepareSeconds: number;
    /** Points each player who took part gets when the boss is beaten. */
    reward: number;
    /** komaTokens (one free gacha pull each) each player who took part gets when the boss is beaten. */
    tokenReward: number;
    /** komaGems each player who took part gets when the boss is beaten. */
    gemReward: number;
    /** Points one percent of boost costs (a boosted attack or heal is that many percent stronger). */
    boostCost: number;
    /** The biggest boost one action can have, in percent. */
    maxBoost: number;
  };
  /**
   * STONKS!'s claim multiplier curve (perks/stackosaurus.ts stonksMultiplier). The multiplier's cap
   * is the stackosaurus effect's own strength (equipment.stackosaurus.<stars>); this is the shape
   * of the climb to it.
   */
  stonks: {
    /** Hours unclaimed at which the multiplier reaches its cap and stops climbing. */
    capHours: number;
  };
  /**
   * How strong each equipment effect is, per star tier: equipment.<effect>.<stars>. Plus
   * `borrowed`: exclusive items (usableBy, the unique treasures) worn by someone they aren't made
   * for, where `effectiveness` is the share (0 to 1) of the item's effects that member gets.
   */
  equipment: EquipmentSettings & { borrowed: { effectiveness: number } };
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
  blackjack: { minBet: 10, maxBet: 1000, naturalPayout: 1.5, joinSeconds: 15, turnSeconds: 30 },
  // An event every 2 to 6 hours. A crate holds 200 to 600 points (an average claim is 300) and is open for a minute.
  // The vault games put up 10x what's been lost to gambling since the last payout. A Greedy Heist has
  // a minute to join, then up to 10 rounds of 5 seconds; the alarm chance starts at 5% and climbs 5%
  // a round (about a 3% chance of lasting all 10), and anyone caught pays 50. Split or Steal needs 2+
  // players, with a minute to join and 30 seconds to choose. Codedle gives 5 minutes to guess a
  // 5-digit code, at 10 points a guess (added to the vault).
  events: {
    minMinutes: 120,
    maxMinutes: 360,
    crate: { minPoints: 200, maxPoints: 600, seconds: 60 },
    vault: { multiplier: 10 },
    heist: { joinSeconds: 60, rounds: 10, roundSeconds: 5, alarmStart: 0.05, alarmStep: 0.05, fine: 50 },
    splitSteal: { minPlayers: 2, joinSeconds: 60, decideSeconds: 30 },
    codedle: { seconds: 300, guessCost: 10 },
  },
  // The raid boss has 600 HP per raider, +6% for each raider past the first, and at least 3,000 (7
  // raiders: 5,712). In simulated fights a party of 5 or more that works together wins about 9 weeks in
  // 10, and one that only attacks about 1 in 3; 2 or 3 raiders almost never win. Up to 15 rounds of 60
  // seconds after a 5-minute lobby. Beating it pays everyone who took part 1,000 and a multi
  // pull's worth of komaTokens (10). A boost costs 250 per 1%, up to +100%.
  raid: { hpPerPlayer: 600, hpGrowth: 0.06, minBossHp: 3_000, playerHp: 100, maxRounds: 15, turnSeconds: 60, prepareSeconds: 300, reward: 1_000, tokenReward: 10, gemReward: 5, boostCost: 250, maxBoost: 100 },
  // STONKS!'s multiplier reaches its cap (equipment.stackosaurus.<stars>, a 4-star default of
  // 7.5x) 5 hours after the earliest a claim could be ready, on a smooth ease-in-out curve
  // rather than jumping there.
  stonks: { capHours: 5 },
  // Someone else's unique treasure works at half strength.
  equipment: { ...defaultEquipmentSettings(), borrowed: { effectiveness: 0.5 } },
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
