import { ADMIN_USER_ID, PITY_STARS, PLINKO_ROWS, type MinesweeperLevel, type PinecraftPaying, type RaidBossId, type RaidShopStars } from './constants/index.js';
import { defaultEquipmentSettings, type EquipmentSettings } from './perks/index.js';
import { validateSettings } from './lib/settings-spec.js';
import { STARS } from './types.js';
import type { Stars, TmPotentialId } from './types.js';
import { TM_POTENTIAL_RANGES } from './data/tm-potentials.js';

export { STARS };

/** The admin's user id is set in constants/core.ts. It is re-exported here so existing imports keep working. */
export { ADMIN_USER_ID };

export function isAdmin(userId: string): boolean {
  return userId === ADMIN_USER_ID;
}

/** A level a refine can raise an item to. */
export type RefineTarget = 2 | 3 | 4 | 5;

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
     * The Hero Item banner's own weights for each star tier: its top tier is the heroes' unique weapons and unique
     * treasures (data/items/banner.ts HERO_BANNER says how they split).
     */
    heroStarWeights: Record<Stars, number>;
    /**
     * Pity for the top tier (PITY_STARS in constants/items/gacha.ts). The Nth pull since the last top-tier
     * item has its chance raised: from softStart the chance climbs a step per pull, and reaches
     * 100% at hardPity. hardPity 0 turns pity off.
     */
    pity: {
      softStart: number;
      hardPity: number;
    };
    /**
     * The limited banner (data/items/banner.ts): when it opens and closes, as "YYYY-MM-DD" or
     * "YYYY-MM-DD HH:MM" Eastern, or "off" (lib/game/items/banner.ts). With `start` off it is closed;
     * with `end` off it stays open. `featuredChance` is the chance (0 to 1) a top-tier item from it is
     * one of its featured items, when that isn't guaranteed.
     */
    limited: {
      start: string;
      end: string;
      featuredChance: number;
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
    /** A successful rob of a member holding more than this also takes wealthTaxRate of what they hold over it. */
    wealthTaxThreshold: number;
    /** The share (0 to 1) of a rich victim's points over wealthTaxThreshold a successful rob also takes (gear can raise it). */
    wealthTaxRate: number;
  };
  sell: {
    /** Points a member gets for selling one item of each star tier (sell command). */
    price: Record<Stars, number>;
    /** Points for selling one piece of TechnoMagic gear (ItemDef.tmDrop): a tier of its own, priced apart from 4-star items. */
    technomagic: number;
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
  baccarat: {
    /** The smallest and biggest round, counting every chip on the table. */
    minBet: number;
    maxBet: number;
    /** What each winning bet pays, to 1 (Player always pays 1 to 1): see lib/game/casino/baccarat.ts. */
    payout: { banker: number; tie: number; kirin: number; phoenix: number };
  };
  roulette: {
    /** The smallest and biggest round, counting every chip on the table. What bets pay is fixed (lib/game/casino/roulette.ts). */
    minBet: number;
    maxBet: number;
  };
  /** Texas hold'em at the poker tables (web/games/poker/table.ts). */
  poker: {
    /** The blinds every table plays. */
    smallBlind: number;
    bigBlind: number;
    /** The least and most a player can sit down with (and take to the table). */
    minBuyIn: number;
    maxBuyIn: number;
    /** The house's cut of each hand that sees a flop (0 to 1), at most `rakeCap` a hand. It goes into the vault. */
    rake: number;
    rakeCap: number;
    /** Seconds a player has for each move before they check (when it's free) or fold. */
    turnSeconds: number;
  };
  mines: {
    /** The smallest and biggest bet. */
    minBet: number;
    maxBet: number;
    /**
     * The house edge with 1 mine and with the most mines: with n mines, the edge slides evenly from
     * one to the other. Each gem's multiplier is the true odds of getting that far, less the edge.
     */
    edgeFewest: number;
    edgeMost: number;
    /** A round that reaches this multiplier is cashed out there by itself. */
    maxMultiplier: number;
  };
  pinecraft: {
    /** The most energy a member can have. Digging a block takes one. */
    maxEnergy: number;
    /** Minutes for one energy to come back. */
    energyMinutes: number;
    /** Points each block pays when dug: dirt and stone, and the ores. */
    value: Record<PinecraftPaying, number>;
  };
  /** Minesweeper (web/games/minesweeper/room.ts): what a board cleared pays, between everyone who opened its tiles. */
  minesweeper: {
    /** Points a board of each level pays, shared by the tiles each player opened. */
    pool: Record<MinesweeperLevel, number>;
    /** Each level's par time: a board cleared sooner pays more, up to `speedBonus` times the pool at half of it. */
    parSeconds: Record<MinesweeperLevel, number>;
    /** What the pool is multiplied by for a board cleared in half its par time or less (1x: speed pays nothing). */
    speedBonus: number;
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
      /** Points added to the vault every hour on their own, in every server with events on. 0 turns it off. */
      hourlyGrowth: number;
      /** The most a vault game pays out of the vault, and the most losses and hourly growth fill it to (past that they're dropped). Donations can take it past this; the rest waits for later games. 0 means no cap. */
      maxPool: number;
      /** The share of each loss (and heist fine, and Codedle guess) that goes into the vault; the rest leaves circulation for good. */
      lossShare: number;
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
      /** How long after it's announced guessing opens, in seconds: time for everyone to open it (on the site, too). */
      waitSeconds: number;
      /** How long the crew has to crack the code, in seconds, once guessing opens. */
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
   * The Weekly Boss (commands/raid.ts). Its combat math is RAID_COMBAT in constants/raid.ts;
   * these are the numbers worth tuning while the bot runs.
   */
  raid: {
    /**
     * Each boss's HP (see bossHpFor in lib/events/raid.ts): `hpPerRaider` for every raider past its
     * `hpOverhead`, the raiders a party ties up guarding, healing, cleansing and rallying whatever its
     * size (so only the rest add damage, and only they add HP). A party smaller than `minRaiders`
     * fights it as if it were that big, so a raid needs a few people.
     */
    hpPerRaider: Record<RaidBossId, number>;
    hpOverhead: Record<RaidBossId, number>;
    minRaiders: number;
    /** Every player's HP. */
    playerHp: number;
    /** Rounds before the boss flies off (the raid is lost). */
    maxRounds: number;
    /** Seconds players have to pick their action each round. */
    turnSeconds: number;
    /** Points each player who took part gets when the boss is beaten, at difficulty 1 (lib/events/raid.ts's raidRewards). */
    reward: number;
    /** Points more for every difficulty level past 1. */
    rewardPerLevel: number;
    /** komaTokens (one free gacha pull each) each player who took part gets when the boss is beaten. */
    tokenReward: number;
    /** komaGems each player who took part gets when the boss is beaten, below the first milestone level. */
    gemReward: number;
    /** komaGems more from each milestone level on (RAID_DIFFICULTY.milestoneEvery: once from 5, twice at 10). */
    gemRewardMilestone: number;
    /**
     * Hero essences (data/transcend.ts) each player who took part gets when the boss is beaten, of each of the three
     * kinds its boss gives (RAID_BOSS_ESSENCES), at difficulty 1. They transcend the TechnoMagic Raid's heroes.
     */
    essenceReward: number;
    /** Hero essences more of each kind for every difficulty level past 1 (as rewardPerLevel). */
    essenceRewardPerLevel: number;
    /**
     * How many times over the Weekly Boss pays: every reward above, and the raid items a win drops (raidDropCounts), are
     * multiplied by it. Only a member's first win of each raid week is paid (services/raid.ts claimWeeklyWins).
     */
    weeklyMultiplier: number;
    /**
     * The site's raid shop (lib/game/items/raid-shop.ts): raid items sold for komaGems, a few of each
     * tier, changing with the raid's week. By tier: what one costs, and how many are on the shelf.
     * A member can pay komaGems for a new shelf of their own, `refreshes` times a week: the first
     * costs `refreshCost`, and each one after it that week `refreshCost` more than the one before.
     */
    shop: {
      price: Record<RaidShopStars, number>;
      stock: Record<RaidShopStars, number>;
      refreshCost: number;
      refreshes: number;
    };
    /**
     * The chance (0 to 1) a beaten boss drops raid-only items (ItemDef.raidDrop) for the party, before
     * dropChancePerRaider: one roll for the whole raid, and on a hit everyone who took part finds one.
     */
    dropChance: number;
    /** How much each player who took part adds to dropChance (0 to 1; the total is capped at 100%). */
    dropChancePerRaider: number;
    /** How much of its HP the boss gains for every difficulty level past 1 (0.02: 4% more at level 3). */
    difficultyHp: number;
    /** How much harder the boss hits for every difficulty level past 1 (0.01: 2% harder at level 3). */
    difficultyDamage: number;
    /**
     * How much harder still the boss hits at the top difficulty: none of it below RAID_DIFFICULTY.topFrom,
     * then more at every level from it, in equal steps (0.6: 20% harder at level 8, 60% at level 10). What
     * makes the last levels ask for more than gear: a party's classes are what takes hits off it.
     */
    topDamage: number;
    /**
     * HP each boss has on top for every raider (a party of fewer than `minRaiders` counted as that many)
     * from difficulty RAID_DIFFICULTY.gearFrom on, the levels built for parties in raid gear. It climbs to
     * that in equal steps from level 2 (gearWallShare), so the levels get harder evenly on the way there.
     */
    gearHp: Record<RaidBossId, number>;
  };
  /**
   * STONKS!'s claim multiplier curve (perks/items/stackosaurus.ts stonksMultiplier). The multiplier's cap
   * is the stackosaurus effect's own strength (equipment.stackosaurus.<stars>); this is the shape
   * of the climb to it.
   */
  /**
  /** Refining gear (constants/items/refine.ts has the levels). */
  refine: {
    /**
     * Points each refine costs (burned), on top of the duplicate it uses up: by the item's star tier,
     * then by the level it's raised to (2 to REFINE.maxLevel).
     */
    cost: Record<Stars, Record<RefineTarget, number>>;
  };
  /**
   * Paying to skip a cooldown (services/skips.ts): the base price of each, which is what the first
   * skip of the day costs. Each one after it that day costs double the one before.
   */
  /** Outfits (data/outfits.ts, services/outfits.ts): what buying one in the site's shop costs, in points (burned). */
  outfit: {
    price: number;
  };
  /**
   * The TechnoMagic Raid's heroes (data/heroes.ts, services/heroes.ts): what buying one in the site's shop
   * costs, in points (burned). And its runs (services/technomagic.ts): `winPoints` is the points each won run
   * pays, on top of its TechnoMagic gear (pieces of the boss's set: TM_DROP_COUNTS, by the stage). And what each of
   * TechnoMagic gear's potentials can roll as a copy drops (data/tm-potentials.ts): a share, as a perk's strength is.
   */
  hero: {
    price: number;
    winPoints: number;
    potentials: Record<TmPotentialId, { min: number; max: number }>;
  };
  /**
   * The Dragon Raid's runs (services/dragon.ts): what a win pays each player in it, by its stage. `winPoints` points at stage 1
   * and `pointsPerStage` more for every stage past it; `essences` hero essences of each of its dragon's kinds
   * (data/transcend.ts DRAGON_ESSENCES) at stage 1, `essencesPerStage` more for every stage past it. Its hero gear is
   * DRAGON_DROPS (constants/technomagic.ts). There is no daily limit.
   */
  dragon: {
    winPoints: number;
    pointsPerStage: number;
    essences: number;
    essencesPerStage: number;
  };
  skip: {
    claim: number;
  };
  stonks: {
    /** Hours unclaimed at which the multiplier reaches its cap and stops climbing. */
    capHours: number;
  };
  /**
   * The Wheelchair's prize wheel (perks/wheel-spin/slices.ts). Its slices are stretched so the
   * biggest one is `maxMultiplier`; 1x stays 1x, so the wheel never goes below it.
   */
  wheel: {
    /** The biggest multiplier on the wheel. */
    maxMultiplier: number;
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
    // The Hero Item banner: King's Raid's Treasure Summon, a unique weapon 1% and a unique treasure 1% (20 in 1000).
    heroStarWeights: { 1: 680, 2: 250, 3: 50, 4: 20 },
    pity: { softStart: 70, hardPity: 90 },
    // Closed until an admin sets its dates. 3 in 4 of its 4-star items are featured ones.
    limited: { start: 'off', end: 'off', featuredChance: 0.75 },
  },
  rob: {
    cooldownMinutes: 60,
    victimProtectionMinutes: 60,
    successChance: 0.5,
    minStolen: 100,
    maxStolen: 500,
    minVictimBalance: 1,
    failFine: 100,
    minChance: 0.05,
    maxChance: 0.95,
    wealthTaxThreshold: 5000,
    wealthTaxRate: 0.01,
  },
  // A pull costs 280 and gives a 1-star 69% of the time, so selling everything you pull gets back roughly 30%.
  sell: { price: { 1: 40, 2: 100, 3: 400, 4: 1500 }, technomagic: 5000 },
  // On the 9-slot board the ball lands in the middle most often (70 in 256), so the middle pays the
  // least: these average out to about 98% of the bet.
  plinko: { minBet: 10, maxBet: 1000, payout: { 1: 9, 2: 3, 3: 1.4, 4: 0.7, 5: 0.4 } },
  blackjack: { minBet: 10, maxBet: 1000, naturalPayout: 1.5, joinSeconds: 15, turnSeconds: 30 },
  // Casino baccarat: Banker less a 5% commission, Tie 8 to 1, Kirin (Panda 8) 25 to 1, Phoenix (Dragon 7) 40 to 1.
  // The house keeps about 1.2% of a Player or Banker bet, 14% of a Tie, and 10% and 8% of Kirin and Phoenix.
  baccarat: { minBet: 1, maxBet: 10_000, payout: { banker: 0.95, tie: 8, kirin: 25, phoenix: 40 } },
  // American roulette (0 and 00): every bet pays 36 / its pockets - 1 to 1, so the house keeps 5.26%.
  roulette: { minBet: 1, maxBet: 10_000 },
  // 10/20 blinds, sitting down with 20 to 100 big blinds, and a 5% rake (at most 5 big blinds) for the vault.
  poker: { smallBlind: 10, bigBlind: 20, minBuyIn: 400, maxBuyIn: 2_000, rake: 0.05, rakeCap: 100, turnSeconds: 30 },
  // Like Stake's Mines. The house edge is 2.5% with 1 mine and slides down to Stake's 1% with 24
  // (so a run pays back 97.5% to 99% of the bet on average), and a round stops at 100x.
  mines: {
    minBet: 10,
    maxBet: 1000,
    edgeFewest: 0.025,
    edgeMost: 0.01,
    maxMultiplier: 24,
  },
  // 100 energy, one back every 3 minutes (480 a day). A block holds an ore 1 time in 10, anywhere;
  // an ore averages about 95 points, so digging pays about 9 points a block.
  pinecraft: {
    maxEnergy: 100,
    energyMinutes: 3,
    value: { dirt: 1, stone: 5, coal: 10, iron: 30, gold: 70, diamond: 150, emerald: 300, amethyst: 500, ruby: 500 },
  },
  // A board pays by how hard it is, well past its size: an Expert board 30 times a Beginner's. Under
  // par it pays more, up to half as much again at half of par (a quick Expert board: 2,250).
  minesweeper: {
    pool: { easy: 50, medium: 400, hard: 1_500 },
    parSeconds: { easy: 40, medium: 180, hard: 480 },
    speedBonus: 1.5,
  },
  // An event every 2 to 6 hours. A crate holds 200 to 600 points (an average claim is 300) and is open for a minute.
  // The vault games put up 10x what's been lost to gambling since the last payout, and the vault
  // also grows by 100 an hour on its own. A Greedy Heist has
  // a minute to join, then up to 10 rounds of 5 seconds; the alarm chance starts at 5% and climbs 5%
  // a round (about a 3% chance of lasting all 10), and anyone caught pays 50. Split or Steal needs 2+
  // players, with a minute to join and 30 seconds to choose. Codedle opens 5 minutes after it's announced, then gives
  // 5 minutes to guess a 5-digit code, at 10 points a guess (added to the vault).
  events: {
    minMinutes: 120,
    maxMinutes: 360,
    crate: { minPoints: 200, maxPoints: 600, seconds: 60 },
    vault: { multiplier: 1, hourlyGrowth: 100, maxPool: 0, lossShare: 0.4 },
    heist: { joinSeconds: 60, rounds: 10, roundSeconds: 5, alarmStart: 0.05, alarmStep: 0.05, fine: 50 },
    splitSteal: { minPlayers: 2, joinSeconds: 60, decideSeconds: 30 },
    codedle: { waitSeconds: 300, seconds: 300, guessCost: 10 },
  },
  // The raid's numbers, set in simulated fights where the party picks the best of some ninety ways to
  // play (real parties do worse). Each boss's HP lets a party without gear win level 1 about 9 times in
  // 10, at any size from 4 to 10, and never less often for having more raiders: hpPerRaider and
  // hpOverhead are fitted so the win rate holds or climbs with the party's size.
  // Up to 15 rounds of 60 seconds, once the host starts the fight from the lobby.
  // Beating it pays everyone who took part 1,000, a multi pull's worth of komaTokens (10) and 5 komaGems,
  // and the party a 20% chance (+10% for each raider) that everyone finds one of the 3-star raid drops
  // (more at the levels past 1, and 4-star ones only at levels 5 and 10). Every level past 1 pays 500
  // more, and the komaGems go up by 5 at levels 5 and 10 (10 from level 5, 15 at level 10).
  // The komaGems buy raid items in the site's shop: four of the 4-star ones (10 each) and four of the
  // 3-star ones (5 each) are on the shelf, different ones every week. A member can have theirs
  // refreshed up to 5 times a week, for 5 komaGems, then 10, 15, 20 and 25.
  // That is difficulty 1; every level past it gives the boss 2% more of its HP and 1% more of its damage,
  // and more HP for every raider, whatever they wear (its HP never looks at gear): a quarter of gearHp
  // more at each level up to 5, and all of it from there. From level 8 it hits harder still (topDamage:
  // 45% more by level 10), its channels take a third Support to interrupt and its crowd control holds
  // one more raider (RAID_COMBAT.top).
  // The numbers are set for a party with well-chosen classes (a knight and a mechanic, a priest or a
  // wizard, the rest assassins) that gets about one thing in five wrong: in simulated fights, every
  // raider's pick is a random one 22% of the time and every raider is on a random class 22% of the time,
  // the rest played the best of some ninety ways. Such a party of five without gear wins about 88, 77,
  // 59, 45 and 30% of the time at levels 1 to 5 (more in a bigger party), and about 85% of the time at
  // level 5 in 4-star gear at R3 (its class items among it). At level 10 in 4-star gear at R5 it wins
  // about 8 times in 10 with five raiders and 9 to 10 with eight; the same gear without classes wins
  // level 10 about 3 times in 10 with five and 7 with eight.
  raid: {
    hpPerRaider: { wyrm: 875, reaper: 650, plague: 555 },
    hpOverhead: { wyrm: 2.9, reaper: 2.47, plague: 1.49 },
    minRaiders: 4,
    playerHp: 100,
    maxRounds: 15,
    turnSeconds: 60,
    reward: 1_000,
    rewardPerLevel: 500,
    tokenReward: 10,
    gemReward: 5,
    gemRewardMilestone: 5,
    essenceReward: 15,
    essenceRewardPerLevel: 5,
    weeklyMultiplier: 5,
    shop: { price: { 3: 5, 4: 10 }, stock: { 3: 4, 4: 4 }, refreshCost: 5, refreshes: 5 },
    dropChance: 0.2,
    dropChancePerRaider: 0.1,
    difficultyHp: 0.02,
    difficultyDamage: 0.01,
    topDamage: 0.45,
    gearHp: { wyrm: 240, reaper: 265, plague: 280 },
  },
  // STONKS!'s multiplier reaches its cap (equipment.stackosaurus.<stars>, a 4-star default of
  // 7.5x) 5 hours after the earliest a claim could be ready, on a smooth ease-in-out curve
  // rather than jumping there.
  // The same as an average claim, so skipping only pays off with gear, and doubling stops it being farmed.
  // Five raid wins' worth (a win gives 5 komaGems).
  refine: {
    // 4-star duplicates take ~116 pulls each (~32k in pulls), so the points are a smaller second
    // cost on top; the lower tiers pay 5%, 10% and 25% of the 4-star prices.
    cost: {
      1: { 2: 100, 3: 150, 4: 200, 5: 300 },
      2: { 2: 200, 3: 300, 4: 400, 5: 600 },
      3: { 2: 500, 3: 750, 4: 1_000, 5: 1_500 },
      4: { 2: 2_000, 3: 3_000, 4: 4_000, 5: 6_000 },
    },
  },
  outfit: { price: 5_000 },
  hero: { price: 25_000, winPoints: 1_000, potentials: structuredClone(TM_POTENTIAL_RANGES) as Settings['hero']['potentials'] },
  // A Dragon Raid win: 750 at stage 1 up to 3,000 at stage 10, and 8 up to 44 of each of its dragon's two essences.
  dragon: { winPoints: 750, pointsPerStage: 250, essences: 8, essencesPerStage: 4 },
  skip: { claim: 300 },
  stonks: { capHours: 5 },
  // The wheel goes from 1x up to 5x, which averages 2.25x a spin.
  wheel: { maxMultiplier: 5 },
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
