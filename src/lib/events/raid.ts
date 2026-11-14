import { RAID_CLASSES, RAID_COMBAT, RAID_DIFFICULTY, RAID_NO_CLASS, type RaidBossId, type RaidClassId, type RaidClassRules } from '../../constants/index.js';
import { chance, pickRandom, randInt } from '../random.js';
import { blightPurgeExtra } from '../../perks/raid/blight-purge.js';
import type { CrowdControl, RaidAction } from '../../protocol/raid.js';

export type { CrowdControl, RaidAction };

/*
 * The raid boss's rules, with no Discord or database in them (commands/raid.ts runs the fight on
 * top of this). A fight goes in rounds: every living player picks an action, the actions resolve
 * (guards, then heals, then supports, then attacks), and if the boss is still standing it makes
 * the move it announced the round before and announces its next one. Announcing a round ahead is
 * what gives guarding and healing a point: everyone can see what is coming.
 *
 * Every boss (RAID_BOSS_IDS) plays by these rules; they differ in the moves they pick from
 * (RAID_COMBAT.weights). Moves of different bosses can work alike (the dragon's Claw and the
 * reaper's Reap both hit one raider), which MOVE_KIND sorts out.
 *
 * The state is changed in place. Every function returns what happened as RaidEvents, which the
 * command turns into the lines of the action log.
 */

export const RAID_ACTIONS: readonly RaidAction[] = ['attack', 'guard', 'heal', 'support'];

/** The moves that damage raiders directly. */
export type HitMove = 'claw' | 'breath' | 'sweep' | 'reap' | 'drain' | 'scythe' | 'harvest' | 'reckoning' | 'spit' | 'miasma' | 'rot';
export type BossMove = HitMove | 'hoard' | 'shield' | 'veil' | 'empower' | 'gather' | 'charge' | 'requiem' | 'flies' | 'brew' | 'pestilence' | 'stagger' | CcMove;
export const BOSS_MOVES: readonly BossMove[] = [
  'claw',
  'breath',
  'sweep',
  'hoard',
  'shield',
  'reap',
  'drain',
  'scythe',
  'harvest',
  'veil',
  'empower',
  'gather',
  'reckoning',
  'charge',
  'requiem',
  'spit',
  'miasma',
  'rot',
  'flies',
  'brew',
  'pestilence',
  'stagger',
  'stun',
  'disarm',
  'taunt',
];

/**
 * How each move works: `single` hits one raider (a guarding knight jumps in front), `all` hits everyone,
 * `some` hits a few, `steal` goes for one raider and is stopped outright by their guard or a knight's, `shield` is
 * channeled for the turn it is announced (enough Supports that turn interrupt it) and makes attacks
 * bounce off for the turn after, `deflect` is a shield that is up the moment it is announced and takes
 * a set number of attacks, `cc` puts raiders under crowd control, `empower` makes the boss's next
 * attack hit harder, `charge` does nothing but warn that a special attack is coming, `pestilence`
 * doubles every raider's Blight, and `stagger` is the turn a boss loses after its channel was
 * interrupted: no boss picks it (it has no weight), it makes no move, and attacks on it do more damage.
 */
export type MoveKind = 'single' | 'all' | 'some' | 'steal' | 'shield' | 'deflect' | 'cc' | 'empower' | 'charge' | 'pestilence' | 'stagger';
export const MOVE_KIND: Readonly<Record<BossMove, MoveKind>> = {
  claw: 'single',
  reap: 'single',
  breath: 'all',
  drain: 'all',
  sweep: 'some',
  scythe: 'some',
  reckoning: 'some',
  hoard: 'steal',
  harvest: 'steal',
  shield: 'deflect',
  veil: 'shield',
  empower: 'empower',
  gather: 'charge',
  charge: 'charge',
  requiem: 'all',
  spit: 'single',
  miasma: 'all',
  rot: 'some',
  flies: 'shield',
  brew: 'charge',
  pestilence: 'pestilence',
  stagger: 'stagger',
  stun: 'cc',
  disarm: 'cc',
  taunt: 'cc',
};

/** The moves a boss uses: the ones it has a weight for at any enrage level. */
export const movesOf = (boss: RaidBossId): BossMove[] => BOSS_MOVES.filter((move) => RAID_COMBAT.weights[boss].some((weights) => weightOf(weights, move) > 0));

/** How often a boss picks `move` from one of its sets of weights (0 for a move it doesn't have). */
const weightOf = (weights: object, move: BossMove): number => (weights as Partial<Record<BossMove, number>>)[move] ?? 0;

/** The boss's shields, channeled or not. */
const isShield = (move: BossMove): boolean => MOVE_KIND[move] === 'shield' || MOVE_KIND[move] === 'deflect';

/** How many attacks a boss's shield deflects before it shatters (the wyrm's), or 0 for a boss that channels its shield instead. */
export const shieldDeflects = (boss: RaidBossId): number => (movesOf(boss).some((move) => MOVE_KIND[move] === 'deflect') ? RAID_COMBAT.shield.deflects : 0);

/** The boss's crowd-control moves, and the effect each one leaves on its targets. */
export type CcMove = 'stun' | 'disarm' | 'taunt';
export const CC_EFFECT: Readonly<Record<CcMove, CrowdControl>> = { stun: 'stunned', disarm: 'disarmed', taunt: 'taunted' };
export const isCcMove = (move: BossMove): move is CcMove => move in CC_EFFECT;

/** What a player did over the whole fight, for the summary at the end (display only). */
export interface RaidStats {
  damage: number;
  /** HP healed (and revived), all told: the next two added up. */
  healed: number;
  /** Of it, what they healed themselves. Raids from before it was kept don't have it. */
  healedSelf?: number;
  /** Of it, what they healed the rest of the party. Raids from before it was kept don't have it. */
  healedAllies?: number;
  /** Damage the boss's hits did them (as each hit was announced). Raids from before it was kept don't have it. */
  damageTaken?: number;
  /** Damage the party dealt thanks to their rallies (the rally's share of each hit while it was the one powering attacks). Raids from before it was kept don't have it. */
  supportDamage?: number;
  guards: number;
  /** Damage their guarding kept off the party: themselves, whoever they covered, and their share of the cut to everyone else. */
  mitigated: number;
  supports: number;
  /** Turns they took an action in. */
  actions: number;
  /** Points spent on boosts. */
  spent: number;
  /** Points the boss stole from them. */
  stolen: number;
}

/**
 * The raid perks from a player's equipped gear (perks/raid/heal-splash.ts, guard-boost.ts,
 * rally-boost.ts, max-hp-damage.ts, heal-cut.ts, raid-hp.ts, raid-attack.ts, raid-crit-chance.ts,
 * raid-crit-damage.ts, raid-support.ts, heal-bonus.ts, blight-purge.ts), as fractions (blightPurge is a
 * count of stacks). All 0 with no raid gear on.
 */
export interface RaidGear {
  /** Share of each heal's value that also goes to a second hurt ally. */
  healSplash: number;
  /** How much more of a hit their Guard blocks (0.25 turns taking 50% into 37.5%). */
  guardBoost: number;
  /** How much bigger the attack bonus of their rallies is (0.25 turns +50% into +62.5%). */
  rallyBoost: number;
  /** Share of the boss's max HP each of their attacks deals on top. */
  maxHpDamage: number;
  /** Share less the boss heals while they are standing (the strongest in the party counts). */
  healCut: number;
  /** How much more HP they fight with (0.3 turns 100 HP into 130). */
  raidHp: number;
  /** How much harder their attacks hit, before rallies and crits. */
  raidAttack: number;
  /** Added to their chance of a critical hit (0.12 turns 10% into 22%). */
  raidCritChance: number;
  /** Added to what their critical hits multiply damage by (0.6 turns 2x into 2.6x). */
  raidCritDamage: number;
  /** How much more their heals (and revives) heal. */
  raidSupport: number;
  /** How much more their heals (and revives) heal, on top of raidSupport (a smaller perk, for an item that does something else too). */
  healBonus: number;
  /** Their Supports clear Blight off a second ally too, and this many more stacks (rounded down, blightPurgeExtra) off each. */
  blightPurge: number;
  /** A knight's: how much more their Guard cuts for the whole party (nothing for any other class). */
  partyGuard: number;
  /** A priest's: the share of their heals every other hurt ally gets too. */
  partyHeal: number;
  /** A priest's (Circle of Death): the share of their excess healing (what a heal couldn't mend) that hits the boss. */
  circleOfDeath: number;
  /** A mechanic's: how much higher everyone's crit chance is while their rally runs. */
  rallyCrit: number;
  /** A wizard's: how much more their hex weakens the boss's move. */
  hexBoost: number;
  /** An assassin's: added to what their class multiplies their attacks by. */
  assassinStrike: number;
  /** An assassin's: added to their crit chance. */
  assassinCrit: number;
  /** An archer's: how much more their attacks gain for every turn in a row they attack. */
  archerRamp: number;
  /** A warrior's: added to the share of an attack they strike back with when the boss hits them. */
  warriorCounter: number;
}

export const emptyGear = (): RaidGear => ({
  healSplash: 0,
  guardBoost: 0,
  rallyBoost: 0,
  maxHpDamage: 0,
  healCut: 0,
  raidHp: 0,
  raidAttack: 0,
  raidCritChance: 0,
  raidCritDamage: 0,
  raidSupport: 0,
  healBonus: 0,
  blightPurge: 0,
  partyGuard: 0,
  partyHeal: 0,
  circleOfDeath: 0,
  rallyCrit: 0,
  hexBoost: 0,
  assassinStrike: 0,
  assassinCrit: 0,
  archerRamp: 0,
  warriorCounter: 0,
});

/** The raid perks out of a member's gear totals (lib/game/items/equipment.ts gearEffects). */
export const raidGearFrom = (totals: RaidGear): RaidGear => ({
  healSplash: totals.healSplash,
  guardBoost: totals.guardBoost,
  rallyBoost: totals.rallyBoost,
  maxHpDamage: totals.maxHpDamage,
  healCut: totals.healCut,
  raidHp: totals.raidHp,
  raidAttack: totals.raidAttack,
  raidCritChance: totals.raidCritChance,
  raidCritDamage: totals.raidCritDamage,
  raidSupport: totals.raidSupport,
  healBonus: totals.healBonus,
  blightPurge: totals.blightPurge,
  partyGuard: totals.partyGuard,
  partyHeal: totals.partyHeal,
  circleOfDeath: totals.circleOfDeath,
  rallyCrit: totals.rallyCrit,
  hexBoost: totals.hexBoost,
  assassinStrike: totals.assassinStrike,
  assassinCrit: totals.assassinCrit,
  archerRamp: totals.archerRamp,
  warriorCounter: totals.warriorCounter,
});

export interface RaidPlayer {
  userId: string;
  hp: number;
  maxHp: number;
  /** The crowd control they are under and the turns it has left, or null. One at a time: the boss only aims it at players without one. */
  cc: { effect: CrowdControl; turns: number } | null;
  /** Their stacks of the Plague Matriarch's Blight (RAID_COMBAT.blight): 0 with none. Cleared when they are knocked out. */
  blight: number;
  /** How many times the boss has aimed a move at them, so it can spread its moves out evenly. */
  targeted: number;
  stats: RaidStats;
  /** Their raid perks, set when the fight starts (commands/raid.ts reads their gear). */
  gear: RaidGear;
  /** Their class (constants/raid.ts's RAID_CLASSES), set when the fight starts. Missing or null: none. */
  class?: RaidClassId | null;
  /** Turns in a row they attacked before this one, since the boss last hit them (a class with a ramp). Missing means 0. */
  streak?: number;
}

/** What the multipliers below read off a raider: their gear, and their class and attack streak when they have them. */
type Fighter = { gear: RaidGear; class?: RaidClassId | null; streak?: number };

/** The rules of a raider's class: the plain ones without one. */
export const classOf = (player: { class?: RaidClassId | null }): RaidClassRules => (player.class ? RAID_CLASSES[player.class] : RAID_NO_CLASS);

/** A class item's perk: its strength for a raider of that class, and nothing for anyone else. */
const classPerk = (player: { class?: RaidClassId | null }, id: RaidClassId, strength: number): number => (player.class === id ? strength : 0);

/**
 * The move the boss will make at the end of the round, who it is aimed at (empty for moves that
 * aren't aimed), and how hard it will hit: its enrage multiplier when the move was announced. That
 * is locked in, so the damage shown a round ahead is the damage dealt, even if the boss enrages in
 * between (a new enrage level only shows from its next move on).
 */
export interface BossIntent {
  move: BossMove;
  targets: string[];
  multiplier: number;
  /** What the healing the move gives the boss (lifesteal) is multiplied by, locked in the same way. Missing means 1. */
  lifesteal?: number;
  /** The boss empowered itself the turn before, so `multiplier` has RAID_COMBAT.empower.multiplier in it. */
  empowered?: boolean;
  /** Enough raiders Supported while the boss was channeling this move (a shield): it comes to nothing. */
  interrupted?: boolean;
}

export type RaidOutcome = 'ongoing' | 'won' | 'wiped' | 'fled';

export interface RaidState {
  /** Which boss is being fought. */
  boss: RaidBossId;
  /** Its difficulty level, from 1 (see RaidDifficulty). */
  difficulty: number;
  /** What that difficulty multiplies the boss's damage by (on top of its enrage). Its HP is already in `bossMaxHp`. */
  bossDamage: number;
  bossHp: number;
  bossMaxHp: number;
  /** The round being played, from 1. */
  round: number;
  maxRounds: number;
  players: RaidPlayer[];
  intent: BossIntent;
  /** The boss's shield (the Scale Shield, the Spectral Veil, the Fly Swarm) is up for this round's attacks. */
  shielded: boolean;
  /** Attacks the Scale Shield still deflects before it shatters. 0 for a channeled shield, which lasts its one round whatever hits it. */
  deflects: number;
  /** Its channel was interrupted this round: its next move is `stagger` (see announce). Missing means no. */
  staggered?: boolean;
  /** How much weaker the move it announced this round hits (a hex: RaidClassRules.hex). Gone once it has made it. Missing means 0. */
  hexed?: number;
  /** Who is warded this round: the first hit the boss lands on each does nothing. Missing means nobody. */
  warded?: string[];
  /** How much higher everyone's crit chance is while the rally runs (a mechanic's item). Missing means no higher. */
  rallyCrit?: number;
  /** Turns left that everyone's attacks are multiplied by `rallyMultiplier` (from a rally). */
  rallied: number;
  /** What attacks are multiplied by while rallied: RAID_COMBAT.support.attackMultiplier, bigger when the rally came from a player with rallyBoost. */
  rallyMultiplier: number;
  /** Whose rally that is (credited with the damage it adds: stats.supportDamage). */
  rallyBy?: string | null;
  /** 0 calm, then 1 and 2 as the boss drops below each share in RAID_COMBAT.enrage.thresholds. */
  enrage: number;
  /** Who guarded this round (they are the ones the boss's move meets first). */
  guarding: string[];
  /** Whose attack took the boss's last HP. */
  lastHit: string | null;
  /** The last move the boss made. */
  lastMove: BossMove | null;
  /** The round the boss last made a crowd-control move in (its cooldown counts from there), or null. */
  lastCc: number | null;
  /** The round the boss last unleashed its Soul Requiem (its cooldown counts from there), or null. */
  lastRequiem: number | null;
  /** The boss used Empower last turn: its next move is an attack that hits harder. */
  empowered: boolean;
  /** Turns the boss has spent gathering for its Grim Reckoning so far (0 when it isn't). */
  gathered: number;
  outcome: RaidOutcome;
}

/**
 * A player's pick for the round. `boost` is the percent they paid to strengthen it (attack and heal
 * only). `target` is who a heal is for, if the healer picked someone; left out, it is chosen for them.
 * `skill` is what a Support does instead of its usual work, for a class that can (RaidClassRules.ward):
 * `ward` shields an ally (`target`, or whoever the boss aims at) from the first hit they take this round.
 */
export interface RaidChoice {
  action: RaidAction;
  boost: number;
  target?: string;
  skill?: 'ward';
}

export type RaidEvent =
  | { kind: 'guard'; userId: string }
  | { kind: 'heal'; userId: string; targetId: string; amount: number; boost: number; crit?: true }
  | { kind: 'healSplash'; userId: string; targetId: string; amount: number }
  | { kind: 'revive'; userId: string; targetId: string; hp: number; boost: number; crit?: true }
  | { kind: 'healWasted'; userId: string }
  | { kind: 'overheal'; userId: string; damage: number }
  | { kind: 'rally'; userId: string; turns: number; multiplier: number }
  | { kind: 'cleansed'; userId: string; targetId: string; effect: CrowdControl }
  /** A Support cleared `stacks` of `targetId`'s Blight stacks. */
  | { kind: 'purged'; userId: string; targetId: string; stacks: number }
  /** The boss's shield is done for: interrupted while it was channeled, or the Scale Shield deflected its last attack. */
  | { kind: 'shieldBroken' }
  /** The boss spent its turn staggered (its channel was interrupted the turn before): it made no move. */
  | { kind: 'staggered' }
  /** A raider's attack hexed the boss: the move it announced this round hits `share` weaker. */
  | { kind: 'hexed'; userId: string; share: number }
  /** A raider the boss hit struck back at it (a class that retaliates). */
  | { kind: 'retaliate'; userId: string; damage: number }
  /** A raider warded `targetId` for the round, and the hit (`move`) the ward then took for them. */
  | { kind: 'ward'; userId: string; targetId: string }
  | { kind: 'warded'; userId: string; move: HitMove }
  | { kind: 'attack'; userId: string; damage: number; crit: boolean; boost: number }
  | { kind: 'bounced'; userId: string }
  | { kind: 'defeated'; userId: string }
  | { kind: 'enrage'; level: number }
  | { kind: 'hit'; move: HitMove; userId: string; damage: number; guarded: boolean; coveredFor: string | null }
  | { kind: 'knockedOut'; userId: string }
  /** The boss healed itself off a move (never above its max HP). */
  | { kind: 'lifesteal'; move: HitMove; amount: number; cut?: number }
  | { kind: 'shieldUp' }
  /** The reaper is charging its Soul Requiem, and when it is unleashed. */
  | { kind: 'charging' }
  | { kind: 'requiem' }
  /** The boss powered up its next attack. */
  | { kind: 'empowered' }
  /** The boss spent a turn gathering for its Grim Reckoning, with `left` more to go (0: it lands next turn). */
  | { kind: 'gathering'; left: number }
  /** The matriarch is brewing her Pestilence (it lands next turn), and when it lands. */
  | { kind: 'brewing' }
  | { kind: 'pestilence' }
  /** Blight dealt its damage at the end of the round, to each raider carrying it. */
  | { kind: 'festered'; hits: { userId: string; damage: number }[] }
  | { kind: 'cc'; effect: CrowdControl; userId: string }
  | { kind: 'hoardBlocked'; userId: string; targetId: string }
  | { kind: 'harvestBlocked'; userId: string; targetId: string }
  | { kind: 'stole'; userId: string; amount: number }
  | { kind: 'wiped' }
  | { kind: 'fled' };

/** Where the fight's randomness comes from, so tests can fix it. */
export interface RaidRng {
  /** A whole number from min to max, both included. */
  int(min: number, max: number): number;
  chance(probability: number): boolean;
  pick<T>(items: readonly T[]): T;
}

export const defaultRaidRng: RaidRng = { int: randInt, chance, pick: pickRandom };

export const emptyStats = (): RaidStats => ({ damage: 0, healed: 0, healedSelf: 0, healedAllies: 0, supportDamage: 0, damageTaken: 0, guards: 0, mitigated: 0, supports: 0, actions: 0, spent: 0, stolen: 0 });

/** Credits `healer` with healing `amount` HP of `target`'s: to themselves or to an ally. */
function creditHeal(healer: RaidPlayer, target: RaidPlayer, amount: number): void {
  healer.stats.healed += amount;
  if (target.userId === healer.userId) healer.stats.healedSelf = (healer.stats.healedSelf ?? 0) + amount;
  else healer.stats.healedAllies = (healer.stats.healedAllies ?? 0) + amount;
}

export const isAlive = (player: RaidPlayer): boolean => player.hp > 0;

export const livingPlayers = (state: RaidState): RaidPlayer[] => state.players.filter(isAlive);

export const findPlayer = (state: RaidState, userId: string): RaidPlayer | undefined => state.players.find((p) => p.userId === userId);

/** The enrage level for the boss's HP (see RaidState.enrage). */
export function enrageLevel(hp: number, maxHp: number): number {
  const share = hp / maxHp;
  return RAID_COMBAT.enrage.thresholds.filter((threshold) => share <= threshold).length;
}

/** What the boss's damage is multiplied by: its enrage level's share, times its difficulty's. */
export const bossMultiplier = (state: RaidState): number => (RAID_COMBAT.enrage.multipliers[state.enrage] ?? 1) * state.bossDamage;

/** What the boss's healing (the reaper's lifesteal) is multiplied by at its enrage level. */
export const bossLifesteal = (state: RaidState): number => RAID_COMBAT.enrage.lifesteal[state.enrage] ?? 1;

/** How much less the boss heals right now: the strongest heal-cut gear among the raiders still standing (0 with none). */
export const bossHealCut = (state: RaidState): number => Math.min(1, Math.max(0, ...livingPlayers(state).map((p) => p.gear.healCut)));

/** The moves that heal the boss. */
export const HEALING_MOVES: readonly BossMove[] = ['reap', 'drain', 'harvest', 'requiem'];

/** A percent boost as a multiplier: 25 -> 1.25. */
const boosted = (amount: number, boost: number): number => amount * (1 + boost / 100);

/** The share of a hit a guarding player takes: RAID_COMBAT.guard.takenShare, less with guardBoost (never below 0). */
export const guardTakenShare = (player: { gear: RaidGear }): number =>
  Math.max(0, 1 - (1 - RAID_COMBAT.guard.takenShare) * (1 + player.gear.guardBoost));

/**
 * The cut a guarding player gives everyone else against moves that hit several players: nothing,
 * unless their class has a party cut (a knight). Then it is that, plus their partyGuard perk (the
 * knight's item), bigger with guardBoost, at most RAID_COMBAT.guard.aoeCutMax. Guards don't stack:
 * only the strongest standing guard's cut counts (strongestGuard).
 */
export const guardCutOf = (player: Fighter): number => {
  const { partyCut } = classOf(player);
  if (partyCut <= 0) return 0;
  return Math.min(RAID_COMBAT.guard.aoeCutMax, Math.max(0, (partyCut + player.gear.partyGuard) * (1 + player.gear.guardBoost)));
};

/** The guard whose cut the party gets: the strongest (the first to guard on a tie), or undefined with none. */
export function strongestGuard<T extends Fighter>(guards: readonly T[]): T | undefined {
  let best: T | undefined;
  for (const guard of guards) if (best === undefined || guardCutOf(guard) > guardCutOf(best)) best = guard;
  return best;
}

/** The HP a player fights with: `base` (the raid.playerHp setting), more with raidHp. */
export const playerMaxHp = (base: number, player: Fighter): number => Math.max(1, Math.round(base * (1 + player.gear.raidHp) * classOf(player).hp));

/** What a ramping class's attacks gain from the turns in a row they have attacked (1 for everyone else). */
export const rampMultiplierOf = (player: Fighter): number => {
  const rules = classOf(player);
  // An archer's item: more for every turn, and five turns' worth more in all.
  const more = classPerk(player, 'archer', player.gear.archerRamp);
  return 1 + Math.min(rules.rampMax + more * 5, (rules.rampStep + more) * Math.max(0, player.streak ?? 0));
};

/** What a player's attacks are multiplied by before rallies and crits (raidAttack, their class with its item, and its ramp). */
export const attackMultiplierOf = (player: Fighter): number =>
  (1 + player.gear.raidAttack) * (classOf(player).attack + classPerk(player, 'assassin', player.gear.assassinStrike)) * rampMultiplierOf(player);

/** How much weaker a raider's hex makes the boss's move: their class's, more with a wizard's item (0 for a class without one). */
export const hexOf = (player: Fighter): number => {
  const { hex } = classOf(player);
  return hex > 0 ? Math.min(1, hex + classPerk(player, 'wizard', player.gear.hexBoost)) : 0;
};

/** How many Supports interrupt a channel in this fight: more from RAID_DIFFICULTY.topFrom on. */
export const shieldBreakOf = (state: { difficulty: number }): number =>
  RAID_COMBAT.support.shieldBreak + (state.difficulty >= RAID_DIFFICULTY.topFrom ? RAID_COMBAT.top.shieldBreak : 0);

/** A player's chance of a critical hit: RAID_COMBAT.attack.critChance, plus their class's own, raidCritChance and an assassin's item's (at most 1). */
export const critChanceOf = (player: Fighter): number =>
  Math.min(1, Math.max(0, RAID_COMBAT.attack.critChance + classOf(player).crit + player.gear.raidCritChance + classPerk(player, 'assassin', player.gear.assassinCrit)));

/** The share of one of their plain attacks a raider strikes back with when the boss hits them: their class's, more with a warrior's item (0 for a class that doesn't). */
export const retaliateOf = (player: Fighter): number => {
  const { retaliate } = classOf(player);
  return retaliate > 0 ? retaliate + classPerk(player, 'warrior', player.gear.warriorCounter) : 0;
};

/** Their chance of a critical hit in this fight right now: higher while a rally with a mechanic's item behind it runs. */
export const critChanceIn = (state: Pick<RaidState, 'rallied' | 'rallyCrit'>, player: Fighter): number =>
  Math.min(1, critChanceOf(player) + (state.rallied > 0 ? (state.rallyCrit ?? 0) : 0));

/** What a player's critical hits multiply damage by: RAID_COMBAT.attack.critMultiplier, plus raidCritDamage. */
export const critMultiplierOf = (player: { gear: RaidGear }): number => RAID_COMBAT.attack.critMultiplier + player.gear.raidCritDamage;

/** What a player's heals (and revives) are multiplied by (raidSupport and healBonus). */
export const healMultiplierOf = (player: Fighter): number => (1 + player.gear.raidSupport + player.gear.healBonus) * classOf(player).heal;

/**
 * The share of a heal a player gets: less for every stack of Blight on them (RAID_COMBAT.blight), never
 * below 1 - maxHealCut, times what their class makes of heals on them (RaidClassRules.healed).
 */
export const healReceivedOf = (player: { blight: number; class?: RaidClassId | null }): number =>
  (1 - Math.min(RAID_COMBAT.blight.maxHealCut, Math.max(0, player.blight) * RAID_COMBAT.blight.healCut)) * classOf(player).healed;

/** Takes up to `count` of a player's Blight stacks off. Returns how many it took. */
function clearBlight(player: RaidPlayer, count: number): number {
  const cleared = Math.min(player.blight, Math.max(0, count));
  player.blight -= cleared;
  return cleared;
}

/** Adds Blight stacks to a player still standing, up to RAID_COMBAT.blight.maxStacks. */
function addBlight(player: RaidPlayer, stacks: number): void {
  if (stacks > 0 && isAlive(player)) player.blight = Math.min(RAID_COMBAT.blight.maxStacks, player.blight + stacks);
}

/** The Blight stacks a hit leaves on whoever takes it (the matriarch's moves; 0 for the rest). */
export const blightOf = (move: HitMove): number => (move === 'spit' || move === 'miasma' || move === 'rot' ? RAID_COMBAT.moves[move].blight : 0);

/** Whether a boss leaves Blight (the Plague Matriarch): some move of its leaves stacks. */
export const hasBlight = (boss: RaidBossId): boolean =>
  movesOf(boss).some((move) => (move === 'spit' || move === 'miasma' || move === 'rot') && blightOf(move) > 0);

/**
 * Puts each player's gear on, as the fight starts (`gear` in the order of the players): their perks,
 * and the HP they fight with (`baseHp`, the raid.playerHp setting, with raidHp), at full. `classes` (in
 * the same order) are theirs, for the fight; left out, nobody has one.
 */
export function equipPlayers(state: RaidState, gear: readonly (RaidGear | undefined)[], baseHp: number, classes: readonly (RaidClassId | null | undefined)[] = []): void {
  state.players.forEach((p, i) => {
    p.gear = gear[i] ?? p.gear;
    p.class = classes[i] ?? null;
    p.streak = 0;
    p.maxHp = playerMaxHp(baseHp, p);
    p.hp = p.maxHp;
  });
}

/** What a rally from this player multiplies attacks by: RAID_COMBAT.support.attackMultiplier, with its bonus made bigger by rallyBoost. */
export const rallyMultiplierOf = (player: { gear: RaidGear }): number => 1 + (RAID_COMBAT.support.attackMultiplier - 1) * (1 + player.gear.rallyBoost);

/**
 * A raid's difficulty: its level (1 to RAID_DIFFICULTY.max), and what that multiplies the boss's HP and
 * damage by. Level 1 is the boss as its settings have it. `wall` is the share (0 to 1) of its `gearHp`
 * the boss has on top for every raider (bossHpFor): none at level 1, climbing in equal steps to all of
 * it at RAID_DIFFICULTY.gearFrom, and all of it past that. `gear` levels (gearFrom and up) are the ones
 * built for parties in raid gear.
 */
export interface RaidDifficulty {
  level: number;
  hp: number;
  damage: number;
  gear: boolean;
  wall: number;
}

export const BASE_DIFFICULTY: RaidDifficulty = { level: 1, hp: 1, damage: 1, gear: false, wall: 0 };

/** Whether a difficulty level is one built for parties in raid gear. */
export const needsGear = (level: number): boolean => level >= RAID_DIFFICULTY.gearFrom;

/** The share (0 to 1) of the boss's `gearHp` it has at a level: equal steps from none at level 1 to all of it at gearFrom. */
export const gearWallShare = (level: number): number => Math.min(1, Math.max(0, (level - 1) / Math.max(1, RAID_DIFFICULTY.gearFrom - 1)));

/** A difficulty level a raid can have: a whole number from 1 to `max` (anything else becomes the nearest). */
export const clampDifficulty = (level: number, max: number = RAID_DIFFICULTY.max): number =>
  Math.min(Math.max(1, max), Math.max(1, Math.floor(Number.isFinite(level) ? level : 1)));

/** The share (0 to 1) of `topDamage` the boss has at a level: none below topFrom, then equal steps to all of it at the top level. */
export const topShare = (level: number): number =>
  Math.min(1, Math.max(0, (level - (RAID_DIFFICULTY.topFrom - 1)) / Math.max(1, RAID_DIFFICULTY.max - (RAID_DIFFICULTY.topFrom - 1))));

/**
 * The difficulty at `level`: each level past 1 adds `difficultyHp` of the boss's HP and `difficultyDamage` of its
 * damage, and the levels from topFrom their share of `topDamage` besides (none of it when left out).
 */
export function difficultyOf(level: number, cfg: { difficultyHp: number; difficultyDamage: number; topDamage?: number }): RaidDifficulty {
  const at = clampDifficulty(level);
  const damage = 1 + cfg.difficultyDamage * (at - 1) + (cfg.topDamage ?? 0) * topShare(at);
  return { level: at, hp: 1 + cfg.difficultyHp * (at - 1), damage, gear: needsGear(at), wall: gearWallShare(at) };
}

/** The raid reward settings (the `raid.*` ones raidRewards reads). */
export interface RaidRewardSettings {
  reward: number;
  rewardPerLevel: number;
  tokenReward: number;
  gemReward: number;
  gemRewardMilestone: number;
  essenceReward: number;
  essenceRewardPerLevel: number;
  /** How many times over all of it is paid (the Weekly Boss's: none said, once). */
  weeklyMultiplier?: number;
}

/** What everyone who took part gets for beating the boss. */
export interface RaidRewards {
  points: number;
  tokens: number;
  gems: number;
  /** Of each of the boss's hero essences (data/transcend.ts RAID_BOSS_ESSENCES). */
  essences: number;
}

/**
 * What beating the boss at difficulty `level` pays each raider: `rewardPerLevel` more points and
 * `essenceRewardPerLevel` more hero essences for every level past 1, and `gemRewardMilestone` more komaGems from each
 * milestone level on (so they only go up at levels 5 and 10). The komaTokens are the same at every level. All of it
 * `weeklyMultiplier` times over (it is the Weekly Boss: paid once a week).
 */
export function raidRewards(level: number, cfg: RaidRewardSettings): RaidRewards {
  const at = clampDifficulty(level);
  const times = Math.max(1, Math.floor(cfg.weeklyMultiplier ?? 1));
  return {
    points: Math.max(0, cfg.reward + cfg.rewardPerLevel * (at - 1)) * times,
    tokens: cfg.tokenReward * times,
    gems: Math.max(0, cfg.gemReward + cfg.gemRewardMilestone * Math.floor(at / RAID_DIFFICULTY.milestoneEvery)) * times,
    essences: Math.max(0, cfg.essenceReward + cfg.essenceRewardPerLevel * (at - 1)) * times,
  };
}

/** What attacks on the boss are multiplied by this round: more while it is staggered (its channel was interrupted the round before). */
export const staggerMultiplier = (state: Pick<RaidState, 'intent'>): number => (state.intent.move === 'stagger' ? RAID_COMBAT.stagger.damageTaken : 1);

/** The raid HP settings (the `raid.*` ones bossHpFor reads). */
export interface BossHpSettings {
  hpPerRaider: Readonly<Record<RaidBossId, number>>;
  hpOverhead: Readonly<Record<RaidBossId, number>>;
  minRaiders: number;
  gearHp: Readonly<Record<RaidBossId, number>>;
}

/**
 * `boss`'s HP for a party of `players` (counted as at least `minRaiders`): `hpPerRaider` for every
 * raider past its `hpOverhead`. A party ties up about that many raiders guarding, healing, cleansing
 * and rallying whatever its size, so only the rest add damage; giving the boss HP for them alone keeps
 * a big party's chances the same as a small one's. Its `difficulty` multiplies that (RaidDifficulty.hp),
 * and adds its share (RaidDifficulty.wall) of `gearHp` for every raider, overhead or not: each of them
 * has to deal that much more over the fight, which is what takes gear, at any party size. At least 1.
 */
export function bossHpFor(players: number, boss: RaidBossId, hp: BossHpSettings, difficulty: Pick<RaidDifficulty, 'hp' | 'wall'> = BASE_DIFFICULTY): number {
  const raiders = Math.max(players, hp.minRaiders);
  const wall = hp.gearHp[boss] * difficulty.wall * raiders;
  return Math.max(1, Math.round(hp.hpPerRaider[boss] * (raiders - hp.hpOverhead[boss]) * difficulty.hp + wall));
}

/**
 * A new fight against `boss` with `bossHp` (its difficulty's share already in it), with these players
 * (in the order they joined). `difficulty` is how much harder it hits.
 */
export function createRaid(
  boss: RaidBossId,
  userIds: readonly string[],
  bossHp: number,
  playerHp: number,
  maxRounds: number,
  rng: RaidRng = defaultRaidRng,
  difficulty: Pick<RaidDifficulty, 'level' | 'damage'> = BASE_DIFFICULTY,
): RaidState {
  const state: RaidState = {
    boss,
    difficulty: difficulty.level,
    bossDamage: difficulty.damage,
    bossHp,
    bossMaxHp: bossHp,
    round: 1,
    maxRounds,
    players: userIds.map((userId) => ({ userId, hp: playerHp, maxHp: playerHp, cc: null, blight: 0, targeted: 0, stats: emptyStats(), gear: emptyGear() })),
    intent: { move: movesOf(boss)[0] ?? 'claw', targets: [], multiplier: 1 },
    shielded: false,
    deflects: 0,
    rallied: 0,
    rallyMultiplier: RAID_COMBAT.support.attackMultiplier,
    rallyBy: null,
    enrage: 0,
    guarding: [],
    lastHit: null,
    lastMove: null,
    lastCc: null,
    lastRequiem: null,
    empowered: false,
    gathered: 0,
    outcome: 'ongoing',
  };
  announce(state, rng);
  return state;
}

/** Why a player can't take `action` right now, or null if they can. */
export function actionProblem(state: RaidState, userId: string, action: RaidAction): 'not_playing' | 'knocked_out' | CrowdControl | null {
  const player = findPlayer(state, userId);
  if (!player) return 'not_playing';
  if (!isAlive(player)) return 'knocked_out';
  const effect = player.cc?.effect;
  if (effect === 'stunned') return effect;
  if (effect === 'disarmed' && action === 'attack') return effect;
  if (effect === 'taunted' && action !== 'attack') return effect;
  return null;
}

/** Whether a player can pick anything this turn: standing and not stunned. */
export const canAct = (player: RaidPlayer): boolean => isAlive(player) && player.cc?.effect !== 'stunned';

// ---------------------------------------------------------------------------
// The players' half of a round
// ---------------------------------------------------------------------------

/**
 * Resolves the players' picks for the round, in this order: guards, heals, supports, attacks
 * (each group in the order the picks were made, which is the map's order). Picks from players
 * who can't make them (knocked out, or held back by crowd control) are dropped.
 */
export function resolvePlayerTurn(state: RaidState, choices: ReadonlyMap<string, RaidChoice>, rng: RaidRng = defaultRaidRng): RaidEvent[] {
  const events: RaidEvent[] = [];
  const valid = [...choices].filter(([userId, choice]) => actionProblem(state, userId, choice.action) === null);
  const byAction = (action: RaidAction) => valid.filter(([, choice]) => choice.action === action);
  for (const [userId] of valid) (findPlayer(state, userId) as RaidPlayer).stats.actions++;

  // Guards: they take their stand now, and meet the boss's move at the end of the round.
  state.guarding = byAction('guard').map(([userId]) => userId);
  for (const userId of state.guarding) {
    (findPlayer(state, userId) as RaidPlayer).stats.guards++;
    events.push({ kind: 'guard', userId });
  }

  // Heals: the ally the healer picked, if they are knocked out or hurt. Otherwise (no pick, or the pick
  // no longer needs it) a knocked-out ally is revived first, then the hurt ally with the least HP left
  // is healed. Blight on whoever is healed makes the heal smaller (heals don't clear it). A healer with
  // healSplash also mends the most hurt other ally, by that share of the heal's value. A priest's items:
  // one mends everyone else too, the other sends what the heal couldn't mend at the boss.
  const splashHeal = (healer: RaidPlayer, boost: number, healedId: string): void => {
    if (healer.gear.healSplash <= 0) return;
    const other = livingPlayers(state)
      .filter((p) => p.userId !== healedId && p.hp < p.maxHp)
      .sort((a, b) => a.hp / a.maxHp - b.hp / b.maxHp)[0];
    if (!other) return;
    const full = boosted(RAID_COMBAT.heal.amount * healMultiplierOf(healer), boost) * healer.gear.healSplash;
    const amount = Math.min(other.maxHp - other.hp, Math.max(1, Math.round(full * healReceivedOf(other))));
    other.hp += amount;
    creditHeal(healer, other, amount);
    events.push({ kind: 'healSplash', userId: healer.userId, targetId: other.userId, amount });
  };
  // A priest's item: every other hurt ally is mended too, by its share of the heal's value.
  const partyHeal = (healer: RaidPlayer, boost: number, healedId: string | null): void => {
    const share = classPerk(healer, 'priest', healer.gear.partyHeal);
    if (share <= 0) return;
    const full = boosted(RAID_COMBAT.heal.amount * healMultiplierOf(healer), boost) * share;
    for (const other of livingPlayers(state)) {
      if (other.userId === healedId || other.hp >= other.maxHp) continue;
      const amount = Math.min(other.maxHp - other.hp, Math.max(1, Math.round(full * healReceivedOf(other))));
      other.hp += amount;
      creditHeal(healer, other, amount);
      events.push({ kind: 'healSplash', userId: healer.userId, targetId: other.userId, amount });
    }
  };
  // A priest's other item (Circle of Death): the `excess` of their heal (what it couldn't mend: its target
  // was already full, or nobody was hurt) hits the boss, by the item's share. A shield that is up stops it, as it stops an
  // attack (without being worn down by it), and a staggered boss takes more of it. Whether it landed.
  const overheal = (healer: RaidPlayer, excess: number): boolean => {
    const share = classPerk(healer, 'priest', healer.gear.circleOfDeath);
    if (share <= 0 || excess <= 0 || state.bossHp <= 0 || state.shielded) return false;
    const dealt = Math.min(state.bossHp, Math.max(1, Math.round(excess * share * staggerMultiplier(state))));
    state.bossHp -= dealt;
    healer.stats.damage += dealt;
    events.push({ kind: 'overheal', userId: healer.userId, damage: dealt });
    if (state.bossHp <= 0) {
      state.lastHit = healer.userId;
      state.outcome = 'won';
      events.push({ kind: 'defeated', userId: healer.userId });
    }
    return true;
  };
  for (const [userId, { boost, target }] of byAction('heal')) {
    const healer = findPlayer(state, userId) as RaidPlayer;
    // A class whose heals crit rolls once for the heal (or the revive), with their own crit chance and damage.
    const crit = classOf(healer).healCrit && rng.chance(critChanceIn(state, healer));
    const critTimes = crit ? critMultiplierOf(healer) : 1;
    const picked = target === undefined ? undefined : findPlayer(state, target);
    const wanted = picked && picked.hp < picked.maxHp ? picked : undefined;
    const down = wanted ? (isAlive(wanted) ? undefined : wanted) : state.players.find((p) => !isAlive(p));
    if (down) {
      const full = Math.max(1, Math.round(boosted(down.maxHp * RAID_COMBAT.heal.reviveShare * healMultiplierOf(healer), boost) * critTimes));
      down.hp = Math.min(down.maxHp, full);
      creditHeal(healer, down, down.hp);
      events.push({ kind: 'revive', userId, targetId: down.userId, hp: down.hp, boost, ...(crit ? { crit } : {}) });
      splashHeal(healer, boost, down.userId);
      partyHeal(healer, boost, down.userId);
      overheal(healer, full - down.hp);
      continue;
    }
    const hurt =
      wanted ??
      livingPlayers(state)
        .filter((p) => p.hp < p.maxHp)
        .sort((a, b) => a.hp / a.maxHp - b.hp / b.maxHp)[0];
    if (!hurt) {
      // Nobody to mend: all of it is excess (and wasted, without a priest's item to send it at the boss).
      if (!overheal(healer, Math.round(boosted(RAID_COMBAT.heal.amount * healMultiplierOf(healer), boost) * critTimes))) events.push({ kind: 'healWasted', userId });
      continue;
    }
    const full = Math.round(boosted(RAID_COMBAT.heal.amount * healMultiplierOf(healer), boost) * critTimes * healReceivedOf(hurt));
    const amount = Math.min(hurt.maxHp - hurt.hp, full);
    hurt.hp += amount;
    creditHeal(healer, hurt, amount);
    events.push({ kind: 'heal', userId, targetId: hurt.userId, amount, boost, ...(crit ? { crit } : {}) });
    splashHeal(healer, boost, hurt.userId);
    partyHeal(healer, boost, hurt.userId);
    overheal(healer, full - amount);
  }

  // Supports: each one lifts a stun, disarm or taunt if anyone is under one (stuns first, then the
  // one with the most turns left). With none to lift, once a raider carries
  // RAID_COMBAT.blight.supportCleanseAt Blight stacks or more, one Support clears some off the most
  // blighted (the one with the strongest blightPurge, which also clears a second ally's); supports
  // don't stack, so the rest, like any with nothing to lift or clear, rally the party for the next
  // turns' attacks. Every support counts toward interrupting a shield the boss is channeling either way.
  const supporting = byAction('support');
  // A ward (a class that can, picking it): an ally is shielded from the first hit they take this round, in
  // place of everything else a Support does. The ally they picked if still standing, else whoever the boss
  // aims at first, else the most hurt.
  const warding = supporting.filter(([userId, choice]) => choice.skill === 'ward' && classOf(findPlayer(state, userId) as RaidPlayer).ward);
  state.warded = [];
  for (const [userId, { target }] of warding) {
    const warder = findPlayer(state, userId) as RaidPlayer;
    warder.stats.supports++;
    const open = livingPlayers(state).filter((p) => !state.warded?.includes(p.userId));
    const ally =
      open.find((p) => p.userId === target) ??
      open.find((p) => state.intent.targets.includes(p.userId)) ??
      [...open].sort((a, b) => a.hp / a.maxHp - b.hp / b.maxHp)[0];
    if (!ally) continue;
    state.warded.push(ally.userId);
    events.push({ kind: 'ward', userId, targetId: ally.userId });
  }
  const supports = supporting.filter((entry) => !warding.includes(entry));
  const free: RaidPlayer[] = [];
  for (const [userId] of supports) {
    const supporter = findPlayer(state, userId) as RaidPlayer;
    supporter.stats.supports++;
    const held = state.players
      .filter((p) => isAlive(p) && p.cc !== null)
      .sort((a, b) => Number(b.cc?.effect === 'stunned') - Number(a.cc?.effect === 'stunned') || (b.cc?.turns ?? 0) - (a.cc?.turns ?? 0))[0];
    if (held?.cc) {
      // A class with a mass dispel frees everyone under crowd control, not just the one.
      const freed = classOf(supporter).massDispel ? state.players.filter((p) => isAlive(p) && p.cc !== null) : [held];
      for (const ally of freed) {
        if (!ally.cc) continue;
        events.push({ kind: 'cleansed', userId, targetId: ally.userId, effect: ally.cc.effect });
        ally.cc = null;
      }
    } else free.push(supporter);
  }
  const blighted = livingPlayers(state)
    .filter((p) => p.blight > 0)
    .sort((a, b) => b.blight - a.blight);
  const purger =
    (blighted[0]?.blight ?? 0) >= RAID_COMBAT.blight.supportCleanseAt ? [...free].sort((a, b) => b.gear.blightPurge - a.gear.blightPurge)[0] : undefined;
  if (purger) {
    const stacks = RAID_COMBAT.blight.supportCleanse + blightPurgeExtra(purger.gear.blightPurge);
    for (const target of blighted.slice(0, purger.gear.blightPurge > 0 ? 2 : 1)) {
      events.push({ kind: 'purged', userId: purger.userId, targetId: target.userId, stacks: clearBlight(target, stacks) });
    }
  }
  // The strongest rally made this turn (0 if none), and whose.
  let rally = 0;
  let rallier: string | null = null;
  // How long this turn's rally lasts: the longest any of its ralliers' classes makes it.
  let rallyTurns: number = RAID_COMBAT.support.rallyTurns;
  // The crit chance the party gains while it runs: the most any of its ralliers' items gives (a mechanic's).
  let rallyCrit = 0;
  for (const supporter of free) {
    if (supporter === purger) continue;
    rallyCrit = Math.max(rallyCrit, classPerk(supporter, 'mechanic', supporter.gear.rallyCrit));
    const multiplier = rallyMultiplierOf(supporter);
    const turns = RAID_COMBAT.support.rallyTurns + classOf(supporter).rallyTurns;
    if (multiplier > rally) rallier = supporter.userId;
    rally = Math.max(rally, multiplier);
    rallyTurns = Math.max(rallyTurns, turns);
    events.push({ kind: 'rally', userId: supporter.userId, turns, multiplier });
  }
  // The shield the boss is channeling this turn never comes up. One that is already up can't be broken this way.
  // Each Support counts once towards it, or for more with a class that interrupts better.
  const interrupting = supports.reduce((sum, [userId]) => sum + classOf(findPlayer(state, userId) as RaidPlayer).interrupts, 0);
  if (MOVE_KIND[state.intent.move] === 'shield' && interrupting >= shieldBreakOf(state)) {
    state.intent.interrupted = true;
    events.push({ kind: 'shieldBroken' });
  }
  // A rally from an earlier turn powers this turn's attacks; one made this turn starts with the next.
  const rallyMultiplier = state.rallied > 0 ? state.rallyMultiplier : 1;
  const rallyFrom = state.rallied > 0 && state.rallyBy ? findPlayer(state, state.rallyBy) : undefined;

  // Attacks, until the boss falls.
  for (const [userId, { boost }] of byAction('attack')) {
    if (state.bossHp <= 0) break;
    if (state.shielded) {
      events.push({ kind: 'bounced', userId });
      // The Scale Shield shatters on the last attack it deflects: the turn's later attacks land.
      if (state.deflects > 0 && --state.deflects === 0) {
        state.shielded = false;
        events.push({ kind: 'shieldBroken' });
      }
      continue;
    }
    const { min, max } = RAID_COMBAT.attack;
    const attacker = findPlayer(state, userId) as RaidPlayer;
    const crit = rng.chance(critChanceIn(state, attacker));
    // maxHpDamage gear adds a share of the boss's max HP after everything else, so it stays that share.
    const extra = state.bossMaxHp * attacker.gear.maxHpDamage;
    const hit = boosted(rng.int(min, max), boost) * attackMultiplierOf(attacker);
    // A staggered boss takes more from everything that hits it.
    const damage = Math.max(1, Math.round((hit * rallyMultiplier * (crit ? critMultiplierOf(attacker) : 1) + extra) * staggerMultiplier(state)));
    const dealt = Math.min(damage, state.bossHp);
    state.bossHp -= dealt;
    (findPlayer(state, userId) as RaidPlayer).stats.damage += dealt;
    // The rally's share of the hit goes to whoever rallied (as well: it's the attacker's damage too).
    if (rallyFrom && rallyMultiplier > 1) {
      // The rally multiplies the hit before maxHpDamage's extra is added: that part is (multiplier - 1) / multiplier of the rest.
      const rallied = (Math.max(0, damage - extra * staggerMultiplier(state)) * (rallyMultiplier - 1)) / rallyMultiplier;
      const share = Math.round((dealt * rallied) / damage);
      rallyFrom.stats.supportDamage = (rallyFrom.stats.supportDamage ?? 0) + share;
    }
    events.push({ kind: 'attack', userId, damage: dealt, crit, boost });
    // A hexing class's attack that lands weakens the move the boss announced this round (the strongest hex counts).
    const hex = hexOf(attacker);
    if (hex > (state.hexed ?? 0)) {
      state.hexed = hex;
      events.push({ kind: 'hexed', userId, share: hex });
    }
    if (state.bossHp <= 0) {
      state.lastHit = userId;
      state.outcome = 'won';
      events.push({ kind: 'defeated', userId });
    }
  }

  // A channeled shield only lasts the one round (the Scale Shield stays up until it has deflected its
  // attacks); crowd control and a rally wear off by a turn. Rallies don't stack: a new one sets the
  // turns left back to the full count, at the stronger of its bonus and the one still running.
  if (state.deflects <= 0) state.shielded = false;
  if (state.rallied > 0) state.rallied--;
  if (rally > 0) {
    // The stronger rally carries on, and so does who gets its credit.
    if (!(state.rallied > 0 && state.rallyMultiplier > rally)) state.rallyBy = rallier;
    state.rallyMultiplier = state.rallied > 0 ? Math.max(state.rallyMultiplier, rally) : rally;
    state.rallyCrit = state.rallied > 0 ? Math.max(state.rallyCrit ?? 0, rallyCrit) : rallyCrit;
    state.rallied = rallyTurns;
  }
  // A ramping class's streak: one more for a turn they attacked, gone for one they didn't.
  const attacked = new Set(byAction('attack').map(([userId]) => userId));
  for (const player of state.players) player.streak = attacked.has(player.userId) ? (player.streak ?? 0) + 1 : 0;
  for (const player of state.players) {
    if (!player.cc) continue;
    player.cc.turns--;
    if (player.cc.turns <= 0) player.cc = null;
  }

  if (state.outcome === 'ongoing') {
    const level = enrageLevel(state.bossHp, state.bossMaxHp);
    while (state.enrage < level) {
      state.enrage++;
      events.push({ kind: 'enrage', level: state.enrage });
    }
  }
  return events;
}

// ---------------------------------------------------------------------------
// The boss's half of a round
// ---------------------------------------------------------------------------

/** Points the boss is trying to steal from a player's wallet: the command takes them (never more than they have). */
export interface Theft {
  userId: string;
  wanted: number;
}

/**
 * The boss makes the move it announced. Returns what happened, and a theft for the command to
 * carry out when the move was Hoard and nobody stopped it. Does nothing once the fight is over.
 */
export function bossTurn(state: RaidState, rng: RaidRng = defaultRaidRng): { events: RaidEvent[]; theft: Theft | null } {
  const events: RaidEvent[] = [];
  if (state.outcome !== 'ongoing') return { events, theft: null };
  const { move } = state.intent;
  // A hex takes its share off the move, and is gone with it.
  const multiplier = state.intent.multiplier * (1 - (state.hexed ?? 0));
  state.hexed = 0;
  let theft: Theft | null = null;

  /** An aimed-at player who is still standing, or someone else standing if they're down. */
  const standing = (userId: string | undefined): RaidPlayer | undefined => {
    const player = userId === undefined ? undefined : findPlayer(state, userId);
    if (player && isAlive(player)) return player;
    const living = livingPlayers(state);
    return living.length > 0 ? rng.pick(living) : undefined;
  };
  /** The guard who jumps in front of a single-target move aimed at `target`, if any: only a class that covers (a knight) does. */
  const coverFor = (target: RaidPlayer): RaidPlayer | undefined => {
    if (state.guarding.includes(target.userId)) return undefined;
    return state.guarding
      .map((userId) => findPlayer(state, userId) as RaidPlayer)
      .filter((guard) => isAlive(guard) && classOf(guard).covers)
      .sort((a, b) => b.hp - a.hp)[0];
  };
  /** HP the move took from raiders, for lifesteal. */
  let dealt = 0;
  /** Who struck back this round already: once each. */
  const struckBack = new Set<string>();
  const damage = (player: RaidPlayer, amount: number, hitMove: HitMove, coveredFor: string | null): void => {
    // A ward takes the first hit for them: no damage, no Blight, and a ramping class keeps its streak.
    if (state.warded?.includes(player.userId)) {
      state.warded = state.warded.filter((id) => id !== player.userId);
      events.push({ kind: 'warded', userId: player.userId, move: hitMove });
      return;
    }
    const taken = Math.max(1, Math.round(amount * classOf(player).taken));
    // A hit ends a ramping class's streak.
    player.streak = 0;
    dealt += Math.min(taken, player.hp);
    player.hp = Math.max(0, player.hp - taken);
    player.stats.damageTaken = (player.stats.damageTaken ?? 0) + taken;
    events.push({ kind: 'hit', move: hitMove, userId: player.userId, damage: taken, guarded: state.guarding.includes(player.userId), coveredFor });
    // The matriarch's hits leave Blight on whoever takes them; a knocked-out raider loses theirs.
    addBlight(player, blightOf(hitMove));
    if (player.hp === 0) {
      player.blight = 0;
      events.push({ kind: 'knockedOut', userId: player.userId });
      return;
    }
    // A class that retaliates strikes back, once a round, if the hit left them standing (and the boss, and no shield is up).
    const share = retaliateOf(player);
    if (share <= 0 || struckBack.has(player.userId) || state.shielded || state.bossHp <= 0) return;
    struckBack.add(player.userId);
    const back = Math.min(state.bossHp, Math.max(1, Math.round(RAID_COMBAT.attack.min * attackMultiplierOf(player) * share)));
    state.bossHp -= back;
    player.stats.damage += back;
    events.push({ kind: 'retaliate', userId: player.userId, damage: back });
    if (state.bossHp <= 0) {
      state.lastHit = player.userId;
      state.outcome = 'won';
      events.push({ kind: 'defeated', userId: player.userId });
    }
  };
  const standingGuards = state.guarding.map((id) => findPlayer(state, id) as RaidPlayer).filter(isAlive);
  // Guards don't stack: the party gets the strongest standing guard's cut, and only theirs.
  const cutter = strongestGuard(standingGuards);
  const aoeCut = cutter ? guardCutOf(cutter) : 0;
  /** Damage a guard kept off the party (for the summary at the end). */
  const mitigate = (guard: RaidPlayer, amount: number): void => {
    guard.stats.mitigated += Math.max(0, Math.round(amount));
  };
  /** A move that hits several players: guards take their share, everyone else gets the guards' cut. */
  const splash = (player: RaidPlayer, base: number, hitMove: HitMove): void => {
    const full = base * multiplier;
    if (state.guarding.includes(player.userId)) {
      const share = guardTakenShare(player);
      mitigate(player, full * (1 - share));
      damage(player, full * share, hitMove, null);
      return;
    }
    // The cut to everyone else is the strongest guard's, so it's theirs alone.
    if (cutter) mitigate(cutter, full * aoeCut);
    damage(player, full * (1 - aoeCut), hitMove, null);
  };
  /** The boss heals `amount` (never above its max HP). */
  const heal = (amount: number, hitMove: HitMove): void => {
    // Heal-cut gear on a raider still standing (after this move's hits) takes its share off.
    const cut = bossHealCut(state);
    const healed = Math.min(state.bossMaxHp - state.bossHp, Math.round(amount * (state.intent.lifesteal ?? 1) * (1 - cut)));
    if (healed <= 0) return;
    state.bossHp += healed;
    events.push({ kind: 'lifesteal', move: hitMove, amount: healed, ...(cut > 0 ? { cut } : {}) });
  };
  /** Its base damage, for the moves that hit raiders. */
  const baseDamage = (hitMove: Exclude<HitMove, 'harvest'>): number => RAID_COMBAT.moves[hitMove].damage;
  // Empower lasts until the next move, whatever that is (pickIntent makes sure it is an attack).
  state.empowered = move === 'empower';

  switch (move) {
    case 'claw':
    case 'reap':
    case 'spit': {
      const target = standing(state.intent.targets[0]);
      if (!target) break;
      const cover = coverFor(target);
      const full = baseDamage(move) * multiplier;
      if (cover) {
        mitigate(cover, full * (1 - guardTakenShare(cover)));
        damage(cover, full * guardTakenShare(cover), move, target.userId);
      } else if (state.guarding.includes(target.userId)) {
        mitigate(target, full * (1 - guardTakenShare(target)));
        damage(target, full * guardTakenShare(target), move, null);
      } else {
        damage(target, full, move, null);
      }
      break;
    }
    case 'breath':
    case 'drain':
    case 'miasma':
      for (const player of livingPlayers(state)) splash(player, baseDamage(move), move);
      break;
    case 'sweep':
    case 'scythe':
    case 'reckoning':
    case 'rot': {
      const aimed = state.intent.targets.map((id) => findPlayer(state, id)).filter((p): p is RaidPlayer => p !== undefined && isAlive(p));
      const hit = aimed.length > 0 ? aimed : [standing(undefined)].filter((p): p is RaidPlayer => p !== undefined);
      for (const player of hit) splash(player, baseDamage(move), move);
      break;
    }
    case 'hoard':
    case 'harvest': {
      // Goes for one raider's wallet (Hoard) or life (Harvest). Their own guard stops it outright, and so does a knight's.
      const target = standing(state.intent.targets[0]);
      if (!target) break;
      const guard = state.guarding.includes(target.userId) ? target : coverFor(target);
      if (guard) {
        if (move === 'harvest') mitigate(guard, RAID_COMBAT.moves.harvest.damage * multiplier);
        events.push({ kind: move === 'hoard' ? 'hoardBlocked' : 'harvestBlocked', userId: guard.userId, targetId: target.userId });
      } else if (move === 'hoard') {
        theft = { userId: target.userId, wanted: rng.int(RAID_COMBAT.moves.hoard.min, RAID_COMBAT.moves.hoard.max) };
      } else {
        damage(target, RAID_COMBAT.moves.harvest.damage * multiplier, 'harvest', null);
        heal(state.bossMaxHp * RAID_COMBAT.moves.harvest.maxHpShare, 'harvest');
      }
      break;
    }
    case 'shield':
      // The Scale Shield went up when it was announced (announce): raising it was the wyrm's move.
      break;
    case 'veil':
    case 'flies':
      // Channeled all turn, unless enough raiders Supported to interrupt it: then it is staggered for its next turn.
      if (state.intent.interrupted) {
        state.staggered = true;
        break;
      }
      state.shielded = true;
      events.push({ kind: 'shieldUp' });
      break;
    case 'stagger':
      events.push({ kind: 'staggered' });
      break;
    case 'charge':
      events.push({ kind: 'charging' });
      break;
    case 'brew':
      events.push({ kind: 'brewing' });
      break;
    case 'pestilence':
      // Every standing raider's Blight doubles (up to the most a raider can carry).
      events.push({ kind: 'pestilence' });
      for (const player of livingPlayers(state)) addBlight(player, player.blight);
      break;
    case 'empower':
      events.push({ kind: 'empowered' });
      break;
    case 'gather':
      state.gathered++;
      events.push({ kind: 'gathering', left: RAID_COMBAT.moves.reckoning.chargeTurns - state.gathered });
      break;
    case 'requiem':
      // Soul Drain, several times over: each cast hits everyone still standing and heals the reaper off what it took.
      events.push({ kind: 'requiem' });
      for (let cast = 0; cast < RAID_COMBAT.requiem.casts && livingPlayers(state).length > 0; cast++) {
        dealt = 0;
        for (const player of livingPlayers(state)) splash(player, RAID_COMBAT.moves.drain.damage, 'drain');
        heal(dealt * RAID_COMBAT.moves.drain.lifesteal, 'drain');
      }
      state.lastRequiem = state.round;
      break;
    case 'stun':
    case 'disarm':
    case 'taunt': {
      // Everyone it aimed at who is still standing; if they have all fallen, one other standing player without crowd control.
      const aimed = state.intent.targets.map((id) => findPlayer(state, id)).filter((p): p is RaidPlayer => p !== undefined && isAlive(p));
      const free = livingPlayers(state).filter((p) => p.cc === null);
      const hit = aimed.length > 0 ? aimed : free.length > 0 ? [rng.pick(free)] : [];
      const effect = CC_EFFECT[move];
      for (const target of hit) {
        // Counted down at the end of each player turn, so it holds exactly the next `rounds` turns.
        target.cc = { effect, turns: RAID_COMBAT.cc.rounds };
        events.push({ kind: 'cc', effect, userId: target.userId });
      }
      state.lastCc = state.round;
      break;
    }
  }
  if (move === 'reckoning') state.gathered = 0;
  // Lifesteal: the reaper's Reap and Soul Drain heal it off the HP they took (what guards blocked it doesn't get).
  if (move === 'reap' || move === 'drain') heal(dealt * RAID_COMBAT.moves[move].lifesteal, move);
  // A staggered turn isn't a move: the channel it follows stays its last one, so it doesn't channel again right after.
  if (move !== 'stagger') state.lastMove = move;

  // Blight festers at the end of the round: every stack deals its damage to the raider carrying it.
  const festered: { userId: string; damage: number }[] = [];
  const fell: string[] = [];
  for (const player of livingPlayers(state)) {
    if (player.blight <= 0) continue;
    // It festers harder at the harder levels, as the boss's own hits do (its difficulty's share, not its enrage's).
    const taken = Math.min(player.hp, Math.round(player.blight * RAID_COMBAT.blight.tick * state.bossDamage));
    if (taken <= 0) continue;
    player.hp -= taken;
    player.stats.damageTaken = (player.stats.damageTaken ?? 0) + taken;
    festered.push({ userId: player.userId, damage: taken });
    if (player.hp === 0) {
      player.blight = 0;
      fell.push(player.userId);
    }
  }
  if (festered.length > 0) events.push({ kind: 'festered', hits: festered });
  for (const userId of fell) events.push({ kind: 'knockedOut', userId });

  // A boss that fell to a blow struck back is beaten, whoever is left standing.
  if (state.outcome === 'ongoing' && livingPlayers(state).length === 0) {
    state.outcome = 'wiped';
    events.push({ kind: 'wiped' });
  }
  return { events, theft };
}

/** Records what a theft actually took (the command knows, after taking it from the wallet). */
export function recordTheft(state: RaidState, userId: string, amount: number): RaidEvent {
  const player = findPlayer(state, userId);
  if (player) player.stats.stolen += amount;
  return { kind: 'stole', userId, amount };
}

/** Moves on to the next round: the boss flies off after the last one, and otherwise announces its next move. */
export function endRound(state: RaidState, rng: RaidRng = defaultRaidRng): RaidEvent[] {
  state.guarding = [];
  state.warded = [];
  if (state.outcome !== 'ongoing') return [];
  if (state.round >= state.maxRounds) {
    state.outcome = 'fled';
    return [{ kind: 'fled' }];
  }
  state.round++;
  return announce(state, rng);
}

/**
 * Picks the boss's move for the round and announces it. A shield that isn't channeled (the Scale
 * Shield) is up at once, for this round's attacks already: the boss makes no other move this round.
 * A boss whose channel was interrupted the round before has no move to pick: it is staggered.
 */
function announce(state: RaidState, rng: RaidRng): RaidEvent[] {
  if (state.staggered) {
    state.staggered = false;
    state.intent = { move: 'stagger', targets: [], multiplier: bossMultiplier(state) };
    return [];
  }
  state.intent = pickIntent(state, rng);
  if (MOVE_KIND[state.intent.move] !== 'deflect') return [];
  state.shielded = true;
  state.deflects = RAID_COMBAT.shield.deflects;
  return [{ kind: 'shieldUp' }];
}

/** Whether the boss has a Soul Requiem it can start charging for the round being planned (its phase reached, and off cooldown). */
export function requiemReady(state: RaidState): boolean {
  const { boss, phase, cooldown } = RAID_COMBAT.requiem;
  // Not in the middle of another move: charging it already, empowered for an attack, or gathering.
  if (state.boss !== boss || state.enrage < phase || state.lastMove === 'charge' || state.empowered || state.gathered > 0) return false;
  return state.lastRequiem === null || state.round - state.lastRequiem >= cooldown;
}

/** Whether the boss's crowd-control moves are off cooldown for the round being planned (the cooldown depends on its enrage level). */
export function ccReady(state: RaidState): boolean {
  const cooldown = RAID_COMBAT.cc.cooldown[state.enrage] ?? RAID_COMBAT.cc.cooldown[0];
  return state.lastCc === null || state.round - state.lastCc >= cooldown;
}

/**
 * Picks `count` of `pool` (fewer if the pool is smaller), always among those aimed at least so far,
 * so the boss's moves are spread evenly over the party (ties are random). Counts them as aimed at.
 */
export function fairTargets(pool: readonly RaidPlayer[], count: number, rng: RaidRng = defaultRaidRng): string[] {
  const left = [...pool];
  const picked: string[] = [];
  while (picked.length < count && left.length > 0) {
    const fewest = Math.min(...left.map((p) => p.targeted));
    const next = rng.pick(left.filter((p) => p.targeted === fewest));
    left.splice(left.indexOf(next), 1);
    next.targeted++;
    picked.push(next.userId);
  }
  return picked;
}

/** The moves an empowered boss can follow up with: the ones that hit raiders. */
const isAttack = (move: BossMove): boolean => ['single', 'all', 'some'].includes(MOVE_KIND[move]) || move === 'harvest';

/** Picks the boss's next move by its weights at its enrage level, and who it is aimed at. */
export function pickIntent(state: RaidState, rng: RaidRng = defaultRaidRng): BossIntent {
  const living = livingPlayers(state);
  // Grim Reckoning: once it starts gathering it keeps on for its charge turns, then strikes.
  if (state.gathered > 0) {
    const { chargeTurns, minTargets, maxTargets } = RAID_COMBAT.moves.reckoning;
    if (state.gathered < chargeTurns) return { move: 'gather', targets: [], multiplier: bossMultiplier(state) };
    return { move: 'reckoning', targets: fairTargets(living, rng.int(minTargets, maxTargets), rng), multiplier: bossMultiplier(state) };
  }
  // Pestilence: it lands the turn after the matriarch brewed it.
  if (state.lastMove === 'brew') return { move: 'pestilence', targets: [], multiplier: bossMultiplier(state) };
  // The Soul Requiem: unleashed the turn after it was charged, and charged as soon as it is ready.
  if (requiemReady(state) || state.lastMove === 'charge') {
    const move = state.lastMove === 'charge' ? 'requiem' : 'charge';
    return { move, targets: [], multiplier: bossMultiplier(state), ...(move === 'requiem' ? { lifesteal: bossLifesteal(state) } : {}) };
  }
  const levels = RAID_COMBAT.weights[state.boss];
  const weights = levels[state.enrage] ?? levels[0];
  const weight = (move: BossMove): number => weightOf(weights, move);
  const free = livingPlayers(state).filter((p) => p.cc === null);
  const ccAllowed = ccReady(state) && free.length > 0;
  const options = BOSS_MOVES.filter(
    (move) =>
      weight(move) > 0 &&
      // Never its shield twice in a row, nor while one is still up (the Scale Shield, until it has deflected its attacks).
      !(isShield(move) && (state.lastMove === move || state.deflects > 0)) &&
      !(move === 'brew' && (state.lastMove === 'pestilence' || state.bossHp > state.bossMaxHp * RAID_COMBAT.pestilence.from)) &&
      (ccAllowed || !isCcMove(move)) &&
      (!state.empowered || isAttack(move)),
  );
  const total = options.reduce((sum, move) => sum + weight(move), 0);
  let roll = rng.int(1, total);
  let move = options[0] as BossMove;
  for (const option of options) {
    roll -= weight(option);
    if (roll <= 0) {
      move = option;
      break;
    }
  }

  const intent = (targets: string[]): BossIntent => ({
    move,
    targets,
    multiplier: bossMultiplier(state) * (state.empowered ? RAID_COMBAT.empower.multiplier : 1),
    ...(HEALING_MOVES.includes(move) ? { lifesteal: bossLifesteal(state) } : {}),
    ...(state.empowered ? { empowered: true } : {}),
  });
  if (living.length === 0) return intent([]);
  const kind = MOVE_KIND[move];
  if (kind === 'single' || kind === 'steal') return intent(fairTargets(living, 1, rng));
  if (move === 'rot') return intent(fairTargets(living, Math.ceil(living.length / RAID_COMBAT.moves.rot.raidersPerTarget), rng));
  if (move === 'sweep' || move === 'scythe') {
    const { minTargets, maxTargets } = RAID_COMBAT.moves[move];
    return intent(fairTargets(living, rng.int(minTargets, maxTargets), rng));
  }
  if (isCcMove(move)) {
    // One more at the top levels (RAID_COMBAT.top).
    const count = (RAID_COMBAT.cc.targets[state.enrage] ?? RAID_COMBAT.cc.targets[0]) + (state.difficulty >= RAID_DIFFICULTY.topFrom ? RAID_COMBAT.top.ccTargets : 0);
    return intent(fairTargets(free, count, rng));
  }
  return intent([]);
}

/** Everyone who took at least one action: the ones the reward goes to. */
export const participants = (state: RaidState): string[] => state.players.filter((p) => p.stats.actions > 0).map((p) => p.userId);

/** Players by damage dealt, most first (for the summary; it doesn't change anyone's reward). */
export const damageRanking = <P extends { stats: RaidStats }>(state: { players: readonly P[] }): P[] =>
  [...state.players].filter((p) => p.stats.damage > 0).sort((a, b) => b.stats.damage - a.stats.damage);
