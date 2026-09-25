/*
 * The weekly raid boss (commands/raid.ts, lib/raid). The numbers you'd tune while the bot runs (boss
 * HP, player HP, rounds, timers, the reward, the boost price) are settings (`raid.*`, see config.ts);
 * the combat math that shapes a fight lives here.
 */

/**
 * When the weekly raid resets: every Saturday at midnight in this time zone (an IANA name, so
 * daylight saving time is followed).
 */
export const RAID_TIME_ZONE = 'America/New_York';

/** Longest the raid's lobby or a turn can be, in seconds (the `raid.prepareSeconds` and `raid.turnSeconds` settings). */
export const MAX_RAID_SECONDS = 1_800;

/** Most rounds a raid can last (the `raid.maxRounds` setting). */
export const MAX_RAID_ROUNDS = 50;

/** Most a player can boost one action, in percent (the `raid.maxBoost` setting). */
export const MAX_RAID_BOOST = 1_000;

/**
 * The raid's buttons and screen.
 * - `refreshMs`: the shortest time between edits of the live message (Discord limits message edits).
 * - `logSize`: how many recent actions the live message shows.
 * - `resultMs`: how long a round's result stays up before the next turn starts.
 * - `boostPresets`: the quick boost buttons, in percent (a Custom button takes any other number).
 * - `modalMs`: how long a player has to type a custom boost.
 * - `listMax`: how many players a list names before saying "...and N more".
 * - `healTargetId`, `healAutoValue`, `selectMax`: the private picker Heal uses to choose who to heal.
 */
export const RAID = {
  joinId: 'raid_join',
  leaveId: 'raid_leave',
  startId: 'raid_start',
  attackId: 'raid_attack',
  guardId: 'raid_guard',
  healId: 'raid_heal',
  supportId: 'raid_support',
  boostPrefix: 'raid_boost_',
  boostCustomId: 'raid_boost_custom',
  boostInputId: 'percent',
  healTargetId: 'raid_heal_target',
  /** The heal picker's "let the bot choose" option. */
  healAutoValue: 'auto',
  /** Most options a Discord select menu can hold (the heal picker's Auto plus allies). */
  selectMax: 25,
  imageName: 'raid-boss.png',
  refreshMs: 2_000,
  logSize: 10,
  resultMs: 4_000,
  boostPresets: [5, 10, 25] as readonly number[],
  modalMs: 60_000,
  listMax: 15,
  /** How many blocks wide the boss's HP bar is. */
  barWidth: 10,
  /** How many blocks wide each player's HP bar is (narrower, so a full party list fits in one embed field). */
  playerBarWidth: 6,
} as const;

/** The raid's custom emojis (full codes, checked at startup): the actions, crits, and the boss's crowd-control effects. */
export const RAID_EMOJI = {
  attack: '<:raidattackdamage:1553098026837483721>',
  guard: '<:raidarmor:1553096484784701511>',
  heal: '<:raidheal:1553098428685353030>',
  crit: '<:raidcriticalchance:1553098714908721313>',
  stunned: '<:raidstatestunned:1553099233974952030>',
  disarmed: '<:raidstatedisarmed:1553100171020075008>',
  taunted: '<:raidstatetaunted:1553099804022939749>',
} as const;

/**
 * How a fight plays out. Damage and healing are HP. Every "share" is 0 to 1.
 *
 * Players:
 * - `attack`: an attack does a random amount from min to max (the same number for a flat hit), and a
 *   `critChance` of that doubles.
 * - `heal`: a heal restores `amount` HP to the ally the healer picked, or revives them with
 *   `reviveShare` of their HP if they are knocked out. With no pick (or one that no longer needs
 *   it), a knocked-out ally is revived first, then the hurt ally with the least HP left is healed.
 * - `guard`: a guard takes `takenShare` of any hit (less with the guardBoost perk), jumps in front of single-target moves aimed at
 *   someone else (the guard with the most HP does), and cuts the damage everyone else takes from
 *   moves that hit several players by `aoeCutPerGuard` each, up to `aoeCutMax`.
 * - `support`: each support lifts one player's stun, disarm or taunt (stuns first); with nobody
 *   under one it rallies the party
 *   instead, multiplying everyone's attacks by `attackMultiplier` (its bonus bigger with the
 *   rallyBoost perk) for the next `rallyTurns` turns (a
 *   second rally resets the count, it doesn't stack). `shieldBreak` supports in the same turn shatter
 *   the boss's Scale Shield, whatever else they did.
 *
 * Boss:
 * - Its damage is multiplied by `enrage.multipliers[level]`; level 1 starts below the first share
 *   of HP in `enrage.thresholds`, level 2 below the second.
 * - Each move's base numbers are below; `weights[level]` is how often it picks each move at each
 *   enrage level. It never raises its shield twice in a row.
 * - `hoard` steals min to max points from one player's wallet (never more than they have).
 * - Crowd control (`stun`, `disarm`, `taunt`, all under `cc`): stunned players can't act at all,
 *   disarmed ones can't attack, and taunted ones can only attack, for `cc.rounds` turns. At each
 *   enrage level the boss can use one only every `cc.cooldown[level]` rounds, and it hits
 *   `cc.targets[level]` players (only ones not already under one).
 * - Every aimed move goes after the players it has aimed at least so far, so everyone gets hit
 *   about equally (ties are random).
 */
export const RAID_COMBAT = {
  attack: { min: 60, max: 60, critChance: 0.1, critMultiplier: 2 },
  heal: { amount: 30, reviveShare: 0.3 },
  guard: { takenShare: 0.5, aoeCutPerGuard: 0.15, aoeCutMax: 0.6 },
  support: { attackMultiplier: 1.5, rallyTurns: 2, shieldBreak: 2 },
  enrage: { thresholds: [0.5, 0.25], multipliers: [1, 1.25, 1.5] },
  moves: {
    claw: { damage: 45 },
    breath: { damage: 24 },
    sweep: { damage: 32, minTargets: 2, maxTargets: 3 },
    hoard: { min: 200, max: 600 },
  },
  cc: { rounds: 2, cooldown: [5, 4, 3], targets: [1, 2, 3] },
  weights: [
    { claw: 30, breath: 20, sweep: 20, hoard: 12, shield: 8, stun: 4, disarm: 3, taunt: 3 },
    { claw: 28, breath: 24, sweep: 20, hoard: 10, shield: 8, stun: 4, disarm: 3, taunt: 3 },
    { claw: 25, breath: 30, sweep: 20, hoard: 8, shield: 7, stun: 4, disarm: 3, taunt: 3 },
  ],
} as const;
