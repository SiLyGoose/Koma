import { RAID_COMBAT, type RaidBossId } from '../../constants/index.js';
import { chance, pickRandom, randInt } from '../random.js';

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

export type RaidAction = 'attack' | 'guard' | 'heal' | 'support';
export const RAID_ACTIONS: readonly RaidAction[] = ['attack', 'guard', 'heal', 'support'];

/** The moves that damage raiders directly. */
export type HitMove = 'claw' | 'breath' | 'sweep' | 'reap' | 'drain' | 'scythe' | 'harvest' | 'reckoning';
export type BossMove = HitMove | 'hoard' | 'shield' | 'veil' | 'empower' | 'gather' | 'charge' | 'requiem' | CcMove;
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
  'stun',
  'disarm',
  'taunt',
];

/**
 * How each move works: `single` hits one raider (a guard can jump in front), `all` hits everyone,
 * `some` hits a few, `steal` goes for one raider and is stopped outright by a guard, `shield` makes
 * attacks bounce off for the next turn, `cc` puts raiders under crowd control, `empower` makes the
 * boss's next attack hit harder, and `charge` does nothing but warn that a special attack is coming.
 */
export type MoveKind = 'single' | 'all' | 'some' | 'steal' | 'shield' | 'cc' | 'empower' | 'charge';
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
  shield: 'shield',
  veil: 'shield',
  empower: 'empower',
  gather: 'charge',
  charge: 'charge',
  requiem: 'all',
  stun: 'cc',
  disarm: 'cc',
  taunt: 'cc',
};

/** The moves a boss uses: the ones it has a weight for at any enrage level. */
export const movesOf = (boss: RaidBossId): BossMove[] => BOSS_MOVES.filter((move) => RAID_COMBAT.weights[boss].some((weights) => weightOf(weights, move) > 0));

/** How often a boss picks `move` from one of its sets of weights (0 for a move it doesn't have). */
const weightOf = (weights: object, move: BossMove): number => (weights as Partial<Record<BossMove, number>>)[move] ?? 0;

/** The boss's crowd-control moves, and the effect each one leaves on its targets. */
export type CcMove = 'stun' | 'disarm' | 'taunt';
/** Stunned: can't act. Disarmed: can't attack. Taunted: can only attack. */
export type CrowdControl = 'stunned' | 'disarmed' | 'taunted';
export const CC_EFFECT: Readonly<Record<CcMove, CrowdControl>> = { stun: 'stunned', disarm: 'disarmed', taunt: 'taunted' };
export const isCcMove = (move: BossMove): move is CcMove => move in CC_EFFECT;

/** What a player did over the whole fight, for the summary at the end (display only). */
export interface RaidStats {
  damage: number;
  healed: number;
  guards: number;
  supports: number;
  /** Turns they took an action in. */
  actions: number;
  /** Points spent on boosts. */
  spent: number;
  /** Points the boss stole from them. */
  stolen: number;
}

/**
 * The raid perks from a player's equipped gear (perks/heal-splash.ts, guard-boost.ts,
 * rally-boost.ts, max-hp-damage.ts, heal-cut.ts), as fractions. All 0 with no raid gear on.
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
}

export const emptyGear = (): RaidGear => ({ healSplash: 0, guardBoost: 0, rallyBoost: 0, maxHpDamage: 0, healCut: 0 });

/** The raid perks out of a member's gear totals (lib/game/equipment.ts gearEffects). */
export const raidGearFrom = ({ healSplash, guardBoost, rallyBoost, maxHpDamage, healCut }: RaidGear): RaidGear => ({
  healSplash,
  guardBoost,
  rallyBoost,
  maxHpDamage,
  healCut,
});

export interface RaidPlayer {
  userId: string;
  hp: number;
  maxHp: number;
  /** The crowd control they are under and the turns it has left, or null. One at a time: the boss only aims it at players without one. */
  cc: { effect: CrowdControl; turns: number } | null;
  /** How many times the boss has aimed a move at them, so it can spread its moves out evenly. */
  targeted: number;
  stats: RaidStats;
  /** Their raid perks, set when the fight starts (commands/raid.ts reads their gear). */
  gear: RaidGear;
}

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
}

export type RaidOutcome = 'ongoing' | 'won' | 'wiped' | 'fled';

export interface RaidState {
  /** Which boss is being fought. */
  boss: RaidBossId;
  bossHp: number;
  bossMaxHp: number;
  /** The round being played, from 1. */
  round: number;
  maxRounds: number;
  players: RaidPlayer[];
  intent: BossIntent;
  /** The boss's shield (the Scale Shield, the Spectral Veil) is up for this round's attacks. */
  shielded: boolean;
  /** Turns left that everyone's attacks are multiplied by `rallyMultiplier` (from a rally). */
  rallied: number;
  /** What attacks are multiplied by while rallied: RAID_COMBAT.support.attackMultiplier, bigger when the rally came from a player with rallyBoost. */
  rallyMultiplier: number;
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
 */
export interface RaidChoice {
  action: RaidAction;
  boost: number;
  target?: string;
}

export type RaidEvent =
  | { kind: 'guard'; userId: string }
  | { kind: 'heal'; userId: string; targetId: string; amount: number; boost: number }
  | { kind: 'healSplash'; userId: string; targetId: string; amount: number }
  | { kind: 'revive'; userId: string; targetId: string; hp: number; boost: number }
  | { kind: 'healWasted'; userId: string }
  | { kind: 'rally'; userId: string; turns: number; multiplier: number }
  | { kind: 'cleansed'; userId: string; targetId: string; effect: CrowdControl }
  | { kind: 'shieldBroken' }
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

export const emptyStats = (): RaidStats => ({ damage: 0, healed: 0, guards: 0, supports: 0, actions: 0, spent: 0, stolen: 0 });

export const isAlive = (player: RaidPlayer): boolean => player.hp > 0;

export const livingPlayers = (state: RaidState): RaidPlayer[] => state.players.filter(isAlive);

export const findPlayer = (state: RaidState, userId: string): RaidPlayer | undefined => state.players.find((p) => p.userId === userId);

/** The enrage level for the boss's HP (see RaidState.enrage). */
export function enrageLevel(hp: number, maxHp: number): number {
  const share = hp / maxHp;
  return RAID_COMBAT.enrage.thresholds.filter((threshold) => share <= threshold).length;
}

/** What the boss's damage is multiplied by at its enrage level. */
export const bossMultiplier = (state: RaidState): number => RAID_COMBAT.enrage.multipliers[state.enrage] ?? 1;

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

/** What a rally from this player multiplies attacks by: RAID_COMBAT.support.attackMultiplier, with its bonus made bigger by rallyBoost. */
export const rallyMultiplierOf = (player: { gear: RaidGear }): number => 1 + (RAID_COMBAT.support.attackMultiplier - 1) * (1 + player.gear.rallyBoost);

/**
 * The boss's HP for a party of `players`: `hpPerPlayer` each, times 1 + `hpGrowth` for every player
 * past the first, and never below `minBossHp`. The growth is there because the boss's own hits don't
 * get stronger with more players, so without it a big party would have an easier time than a small one.
 * `share` scales all of it, for a boss with less HP than the settings give (RAID_COMBAT.hpShare).
 */
export function bossHpFor(players: number, hp: { hpPerPlayer: number; hpGrowth: number; minBossHp: number }, share = 1): number {
  const scaled = Math.round(hp.hpPerPlayer * players * (1 + hp.hpGrowth * Math.max(0, players - 1)));
  return Math.round(Math.max(hp.minBossHp, scaled) * share);
}

/** A new fight against `boss` with `bossHp`, with these players (in the order they joined). */
export function createRaid(
  boss: RaidBossId,
  userIds: readonly string[],
  bossHp: number,
  playerHp: number,
  maxRounds: number,
  rng: RaidRng = defaultRaidRng,
): RaidState {
  const state: RaidState = {
    boss,
    bossHp,
    bossMaxHp: bossHp,
    round: 1,
    maxRounds,
    players: userIds.map((userId) => ({ userId, hp: playerHp, maxHp: playerHp, cc: null, targeted: 0, stats: emptyStats(), gear: emptyGear() })),
    intent: { move: movesOf(boss)[0] ?? 'claw', targets: [], multiplier: 1 },
    shielded: false,
    rallied: 0,
    rallyMultiplier: RAID_COMBAT.support.attackMultiplier,
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
  state.intent = pickIntent(state, rng);
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

  // Heals: the ally the healer picked, if they are knocked out or hurt. Otherwise (no pick, or the
  // pick no longer needs it) a knocked-out ally is revived first, then the hurt ally with the least HP left is healed.
  // A healer with healSplash also mends the most hurt other ally, by that share of the heal's value.
  const splashHeal = (healer: RaidPlayer, boost: number, healedId: string): void => {
    if (healer.gear.healSplash <= 0) return;
    const other = livingPlayers(state)
      .filter((p) => p.userId !== healedId && p.hp < p.maxHp)
      .sort((a, b) => a.hp / a.maxHp - b.hp / b.maxHp)[0];
    if (!other) return;
    const amount = Math.min(other.maxHp - other.hp, Math.max(1, Math.round(boosted(RAID_COMBAT.heal.amount, boost) * healer.gear.healSplash)));
    other.hp += amount;
    healer.stats.healed += amount;
    events.push({ kind: 'healSplash', userId: healer.userId, targetId: other.userId, amount });
  };
  for (const [userId, { boost, target }] of byAction('heal')) {
    const healer = findPlayer(state, userId) as RaidPlayer;
    const picked = target === undefined ? undefined : findPlayer(state, target);
    const wanted = picked && picked.hp < picked.maxHp ? picked : undefined;
    const down = wanted ? (isAlive(wanted) ? undefined : wanted) : state.players.find((p) => !isAlive(p));
    if (down) {
      down.hp = Math.min(down.maxHp, Math.max(1, Math.round(boosted(down.maxHp * RAID_COMBAT.heal.reviveShare, boost))));
      healer.stats.healed += down.hp;
      events.push({ kind: 'revive', userId, targetId: down.userId, hp: down.hp, boost });
      splashHeal(healer, boost, down.userId);
      continue;
    }
    const hurt =
      wanted ??
      livingPlayers(state)
        .filter((p) => p.hp < p.maxHp)
        .sort((a, b) => a.hp / a.maxHp - b.hp / b.maxHp)[0];
    if (!hurt) {
      events.push({ kind: 'healWasted', userId });
      continue;
    }
    const amount = Math.min(hurt.maxHp - hurt.hp, Math.round(boosted(RAID_COMBAT.heal.amount, boost)));
    hurt.hp += amount;
    healer.stats.healed += amount;
    events.push({ kind: 'heal', userId, targetId: hurt.userId, amount, boost });
    splashHeal(healer, boost, hurt.userId);
  }

  // Supports: each one lifts a stun, disarm or taunt if anyone is under one (stuns first, then the
  // one with the most turns left); one with nothing to lift rallies the party instead, for the next
  // turns' attacks. Every support counts toward shattering the shield either way.
  const supports = byAction('support');
  // The strongest rally made this turn (0 if none).
  let rally = 0;
  for (const [userId] of supports) {
    const supporter = findPlayer(state, userId) as RaidPlayer;
    supporter.stats.supports++;
    const held = state.players
      .filter((p) => isAlive(p) && p.cc !== null)
      .sort((a, b) => Number(b.cc?.effect === 'stunned') - Number(a.cc?.effect === 'stunned') || (b.cc?.turns ?? 0) - (a.cc?.turns ?? 0))[0];
    if (held?.cc) {
      events.push({ kind: 'cleansed', userId, targetId: held.userId, effect: held.cc.effect });
      held.cc = null;
    } else {
      const multiplier = rallyMultiplierOf(supporter);
      rally = Math.max(rally, multiplier);
      events.push({ kind: 'rally', userId, turns: RAID_COMBAT.support.rallyTurns, multiplier });
    }
  }
  if (state.shielded && supports.length >= RAID_COMBAT.support.shieldBreak) {
    state.shielded = false;
    events.push({ kind: 'shieldBroken' });
  }
  // A rally from an earlier turn powers this turn's attacks; one made this turn starts with the next.
  const rallyMultiplier = state.rallied > 0 ? state.rallyMultiplier : 1;

  // Attacks, until the boss falls.
  for (const [userId, { boost }] of byAction('attack')) {
    if (state.bossHp <= 0) break;
    if (state.shielded) {
      events.push({ kind: 'bounced', userId });
      continue;
    }
    const { min, max, critChance, critMultiplier } = RAID_COMBAT.attack;
    const crit = rng.chance(critChance);
    // maxHpDamage gear adds a share of the boss's max HP after everything else, so it stays that share.
    const attacker = findPlayer(state, userId) as RaidPlayer;
    const extra = state.bossMaxHp * attacker.gear.maxHpDamage;
    const damage = Math.max(1, Math.round(boosted(rng.int(min, max), boost) * rallyMultiplier * (crit ? critMultiplier : 1) + extra));
    const dealt = Math.min(damage, state.bossHp);
    state.bossHp -= dealt;
    (findPlayer(state, userId) as RaidPlayer).stats.damage += dealt;
    events.push({ kind: 'attack', userId, damage: dealt, crit, boost });
    if (state.bossHp <= 0) {
      state.lastHit = userId;
      state.outcome = 'won';
      events.push({ kind: 'defeated', userId });
    }
  }

  // The shield only lasts the one round; crowd control and a rally wear off by a turn. Rallies don't stack:
  // a new one sets the turns left back to the full count, at the stronger of its bonus and the one
  // still running.
  state.shielded = false;
  if (state.rallied > 0) state.rallied--;
  if (rally > 0) {
    state.rallyMultiplier = state.rallied > 0 ? Math.max(state.rallyMultiplier, rally) : rally;
    state.rallied = RAID_COMBAT.support.rallyTurns;
  }
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
  const { multiplier } = state.intent;
  let theft: Theft | null = null;

  /** An aimed-at player who is still standing, or someone else standing if they're down. */
  const standing = (userId: string | undefined): RaidPlayer | undefined => {
    const player = userId === undefined ? undefined : findPlayer(state, userId);
    if (player && isAlive(player)) return player;
    const living = livingPlayers(state);
    return living.length > 0 ? rng.pick(living) : undefined;
  };
  /** The guard who jumps in front of a single-target move aimed at `target`, if any. */
  const coverFor = (target: RaidPlayer): RaidPlayer | undefined => {
    if (state.guarding.includes(target.userId)) return undefined;
    return state.guarding
      .map((userId) => findPlayer(state, userId) as RaidPlayer)
      .filter(isAlive)
      .sort((a, b) => b.hp - a.hp)[0];
  };
  /** HP the move took from raiders, for lifesteal. */
  let dealt = 0;
  const damage = (player: RaidPlayer, amount: number, hitMove: HitMove, coveredFor: string | null): void => {
    const taken = Math.max(1, Math.round(amount));
    dealt += Math.min(taken, player.hp);
    player.hp = Math.max(0, player.hp - taken);
    events.push({ kind: 'hit', move: hitMove, userId: player.userId, damage: taken, guarded: state.guarding.includes(player.userId), coveredFor });
    if (player.hp === 0) events.push({ kind: 'knockedOut', userId: player.userId });
  };
  const aoeCut = Math.min(RAID_COMBAT.guard.aoeCutMax, state.guarding.filter((id) => isAlive(findPlayer(state, id) as RaidPlayer)).length * RAID_COMBAT.guard.aoeCutPerGuard);
  /** A move that hits several players: guards take their share, everyone else gets the guards' cut. */
  const splash = (player: RaidPlayer, base: number, hitMove: HitMove): void => {
    const share = state.guarding.includes(player.userId) ? guardTakenShare(player) : 1 - aoeCut;
    damage(player, base * multiplier * share, hitMove, null);
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
    case 'reap': {
      const target = standing(state.intent.targets[0]);
      if (!target) break;
      const cover = coverFor(target);
      if (cover) damage(cover, baseDamage(move) * multiplier * guardTakenShare(cover), move, target.userId);
      else damage(target, baseDamage(move) * multiplier * (state.guarding.includes(target.userId) ? guardTakenShare(target) : 1), move, null);
      break;
    }
    case 'breath':
    case 'drain':
      for (const player of livingPlayers(state)) splash(player, baseDamage(move), move);
      break;
    case 'sweep':
    case 'scythe':
    case 'reckoning': {
      const aimed = state.intent.targets.map((id) => findPlayer(state, id)).filter((p): p is RaidPlayer => p !== undefined && isAlive(p));
      const hit = aimed.length > 0 ? aimed : [standing(undefined)].filter((p): p is RaidPlayer => p !== undefined);
      for (const player of hit) splash(player, baseDamage(move), move);
      break;
    }
    case 'hoard':
    case 'harvest': {
      // Goes for one raider's wallet (Hoard) or life (Harvest). A guard stops it outright.
      const target = standing(state.intent.targets[0]);
      if (!target) break;
      const guard = state.guarding.includes(target.userId) ? target : coverFor(target);
      if (guard) {
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
    case 'veil':
      state.shielded = true;
      events.push({ kind: 'shieldUp' });
      break;
    case 'charge':
      events.push({ kind: 'charging' });
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
  state.lastMove = move;

  if (livingPlayers(state).length === 0) {
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
  if (state.outcome !== 'ongoing') return [];
  if (state.round >= state.maxRounds) {
    state.outcome = 'fled';
    return [{ kind: 'fled' }];
  }
  state.round++;
  state.intent = pickIntent(state, rng);
  return [];
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
      !(MOVE_KIND[move] === 'shield' && state.lastMove === move) &&
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
  if (move === 'sweep' || move === 'scythe') {
    const { minTargets, maxTargets } = RAID_COMBAT.moves[move];
    return intent(fairTargets(living, rng.int(minTargets, maxTargets), rng));
  }
  if (isCcMove(move)) {
    const count = RAID_COMBAT.cc.targets[state.enrage] ?? RAID_COMBAT.cc.targets[0];
    return intent(fairTargets(free, count, rng));
  }
  return intent([]);
}

/** Everyone who took at least one action: the ones the reward goes to. */
export const participants = (state: RaidState): string[] => state.players.filter((p) => p.stats.actions > 0).map((p) => p.userId);

/** Players by damage dealt, most first (for the summary; it doesn't change anyone's reward). */
export const damageRanking = <P extends { stats: RaidStats }>(state: { players: readonly P[] }): P[] =>
  [...state.players].filter((p) => p.stats.damage > 0).sort((a, b) => b.stats.damage - a.stats.damage);
