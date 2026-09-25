import { RAID_COMBAT } from '../../constants/index.js';
import { chance, pickRandom, randInt } from '../random.js';

/*
 * The raid boss's rules, with no Discord or database in them (commands/raid.ts runs the fight on
 * top of this). A fight goes in rounds: every living player picks an action, the actions resolve
 * (guards, then heals, then supports, then attacks), and if the boss is still standing it makes
 * the move it announced the round before and announces its next one. Announcing a round ahead is
 * what gives guarding and healing a point: everyone can see what is coming.
 *
 * The state is changed in place. Every function returns what happened as RaidEvents, which the
 * command turns into the lines of the action log.
 */

export type RaidAction = 'attack' | 'guard' | 'heal' | 'support';
export const RAID_ACTIONS: readonly RaidAction[] = ['attack', 'guard', 'heal', 'support'];

export type BossMove = 'claw' | 'breath' | 'sweep' | 'hoard' | 'shield' | 'curse';
export const BOSS_MOVES: readonly BossMove[] = ['claw', 'breath', 'sweep', 'hoard', 'shield', 'curse'];

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
 * rally-boost.ts), as fractions. All 0 with no raid gear on.
 */
export interface RaidGear {
  /** Share of each heal's value that also goes to a second hurt ally. */
  healSplash: number;
  /** How much more of a hit their Guard blocks (0.25 turns taking 50% into 37.5%). */
  guardBoost: number;
  /** How much bigger the attack bonus of their rallies is (0.25 turns +50% into +62.5%). */
  rallyBoost: number;
}

export const emptyGear = (): RaidGear => ({ healSplash: 0, guardBoost: 0, rallyBoost: 0 });

/** The raid perks out of a member's gear totals (lib/game/equipment.ts gearEffects). */
export const raidGearFrom = ({ healSplash, guardBoost, rallyBoost }: RaidGear): RaidGear => ({ healSplash, guardBoost, rallyBoost });

export interface RaidPlayer {
  userId: string;
  hp: number;
  maxHp: number;
  /** Turns left that the player can't attack (0 = not cursed). */
  cursed: number;
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
}

export type RaidOutcome = 'ongoing' | 'won' | 'wiped' | 'fled';

export interface RaidState {
  bossHp: number;
  bossMaxHp: number;
  /** The round being played, from 1. */
  round: number;
  maxRounds: number;
  players: RaidPlayer[];
  intent: BossIntent;
  /** The Scale Shield is up for this round's attacks. */
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
  | { kind: 'cleansed'; userId: string; targetId: string }
  | { kind: 'shieldBroken' }
  | { kind: 'attack'; userId: string; damage: number; crit: boolean; boost: number }
  | { kind: 'bounced'; userId: string }
  | { kind: 'defeated'; userId: string }
  | { kind: 'enrage'; level: number }
  | { kind: 'hit'; move: 'claw' | 'breath' | 'sweep'; userId: string; damage: number; guarded: boolean; coveredFor: string | null }
  | { kind: 'knockedOut'; userId: string }
  | { kind: 'shieldUp' }
  | { kind: 'curse'; userId: string }
  | { kind: 'hoardBlocked'; userId: string; targetId: string }
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
 */
export function bossHpFor(players: number, hp: { hpPerPlayer: number; hpGrowth: number; minBossHp: number }): number {
  const scaled = Math.round(hp.hpPerPlayer * players * (1 + hp.hpGrowth * Math.max(0, players - 1)));
  return Math.max(hp.minBossHp, scaled);
}

/** A new fight against a boss with `bossHp`, with these players (in the order they joined). */
export function createRaid(userIds: readonly string[], bossHp: number, playerHp: number, maxRounds: number, rng: RaidRng = defaultRaidRng): RaidState {
  const state: RaidState = {
    bossHp,
    bossMaxHp: bossHp,
    round: 1,
    maxRounds,
    players: userIds.map((userId) => ({ userId, hp: playerHp, maxHp: playerHp, cursed: 0, stats: emptyStats(), gear: emptyGear() })),
    intent: { move: 'claw', targets: [], multiplier: 1 },
    shielded: false,
    rallied: 0,
    rallyMultiplier: RAID_COMBAT.support.attackMultiplier,
    enrage: 0,
    guarding: [],
    lastHit: null,
    lastMove: null,
    outcome: 'ongoing',
  };
  state.intent = pickIntent(state, rng);
  return state;
}

/** Why a player can't take `action` right now, or null if they can. */
export function actionProblem(state: RaidState, userId: string, action: RaidAction): 'not_playing' | 'knocked_out' | 'cursed' | null {
  const player = findPlayer(state, userId);
  if (!player) return 'not_playing';
  if (!isAlive(player)) return 'knocked_out';
  if (action === 'attack' && player.cursed > 0) return 'cursed';
  return null;
}

// ---------------------------------------------------------------------------
// The players' half of a round
// ---------------------------------------------------------------------------

/**
 * Resolves the players' picks for the round, in this order: guards, heals, supports, attacks
 * (each group in the order the picks were made, which is the map's order). Picks from players
 * who can't make them (knocked out, or cursed and attacking) are dropped.
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

  // Supports: each one lifts a curse if anyone is cursed (the one with the most turns left first);
  // one with no curse to lift rallies the party instead, for the next turns' attacks. Every support
  // counts toward shattering the shield either way.
  const supports = byAction('support');
  // The strongest rally made this turn (0 if none).
  let rally = 0;
  for (const [userId] of supports) {
    const supporter = findPlayer(state, userId) as RaidPlayer;
    supporter.stats.supports++;
    const cursed = state.players.filter((p) => p.cursed > 0).sort((a, b) => b.cursed - a.cursed)[0];
    if (cursed) {
      cursed.cursed = 0;
      events.push({ kind: 'cleansed', userId, targetId: cursed.userId });
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
    const damage = Math.max(1, Math.round(boosted(rng.int(min, max), boost) * rallyMultiplier * (crit ? critMultiplier : 1)));
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

  // The shield only lasts the one round; a curse and a rally wear off by a turn. Rallies don't stack:
  // a new one sets the turns left back to the full count, at the stronger of its bonus and the one
  // still running.
  state.shielded = false;
  if (state.rallied > 0) state.rallied--;
  if (rally > 0) {
    state.rallyMultiplier = state.rallied > 0 ? Math.max(state.rallyMultiplier, rally) : rally;
    state.rallied = RAID_COMBAT.support.rallyTurns;
  }
  for (const player of state.players) if (player.cursed > 0) player.cursed--;

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
  const damage = (player: RaidPlayer, amount: number, hitMove: 'claw' | 'breath' | 'sweep', coveredFor: string | null): void => {
    const taken = Math.max(1, Math.round(amount));
    player.hp = Math.max(0, player.hp - taken);
    events.push({ kind: 'hit', move: hitMove, userId: player.userId, damage: taken, guarded: state.guarding.includes(player.userId), coveredFor });
    if (player.hp === 0) events.push({ kind: 'knockedOut', userId: player.userId });
  };
  const aoeCut = Math.min(RAID_COMBAT.guard.aoeCutMax, state.guarding.filter((id) => isAlive(findPlayer(state, id) as RaidPlayer)).length * RAID_COMBAT.guard.aoeCutPerGuard);
  /** A move that hits several players: guards take their share, everyone else gets the guards' cut. */
  const splash = (player: RaidPlayer, base: number, hitMove: 'breath' | 'sweep'): void => {
    const share = state.guarding.includes(player.userId) ? guardTakenShare(player) : 1 - aoeCut;
    damage(player, base * multiplier * share, hitMove, null);
  };

  switch (move) {
    case 'claw': {
      const target = standing(state.intent.targets[0]);
      if (!target) break;
      const cover = coverFor(target);
      if (cover) damage(cover, RAID_COMBAT.moves.claw.damage * multiplier * guardTakenShare(cover), 'claw', target.userId);
      else damage(target, RAID_COMBAT.moves.claw.damage * multiplier * (state.guarding.includes(target.userId) ? guardTakenShare(target) : 1), 'claw', null);
      break;
    }
    case 'breath':
      for (const player of livingPlayers(state)) splash(player, RAID_COMBAT.moves.breath.damage, 'breath');
      break;
    case 'sweep': {
      const aimed = state.intent.targets.map((id) => findPlayer(state, id)).filter((p): p is RaidPlayer => p !== undefined && isAlive(p));
      const hit = aimed.length > 0 ? aimed : [standing(undefined)].filter((p): p is RaidPlayer => p !== undefined);
      for (const player of hit) splash(player, RAID_COMBAT.moves.sweep.damage, 'sweep');
      break;
    }
    case 'hoard': {
      const target = standing(state.intent.targets[0]);
      if (!target) break;
      const guard = state.guarding.includes(target.userId) ? target : coverFor(target);
      if (guard) events.push({ kind: 'hoardBlocked', userId: guard.userId, targetId: target.userId });
      else theft = { userId: target.userId, wanted: rng.int(RAID_COMBAT.moves.hoard.min, RAID_COMBAT.moves.hoard.max) };
      break;
    }
    case 'shield':
      state.shielded = true;
      events.push({ kind: 'shieldUp' });
      break;
    case 'curse': {
      const target = standing(state.intent.targets[0]);
      if (!target) break;
      // Counted down at the end of each player turn, so it blocks exactly the next `rounds` turns.
      target.cursed = RAID_COMBAT.moves.curse.rounds;
      events.push({ kind: 'curse', userId: target.userId });
      break;
    }
  }
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

/** Picks the boss's next move by its weights at its enrage level, and who it is aimed at. */
export function pickIntent(state: RaidState, rng: RaidRng = defaultRaidRng): BossIntent {
  const weights = RAID_COMBAT.weights[state.enrage] ?? RAID_COMBAT.weights[0];
  const options = BOSS_MOVES.filter((move) => weights[move] > 0 && !(move === 'shield' && state.lastMove === 'shield'));
  const total = options.reduce((sum, move) => sum + weights[move], 0);
  let roll = rng.int(1, total);
  let move = options[0] as BossMove;
  for (const option of options) {
    roll -= weights[option];
    if (roll <= 0) {
      move = option;
      break;
    }
  }

  const multiplier = bossMultiplier(state);
  const living = livingPlayers(state).map((p) => p.userId);
  if (living.length === 0) return { move, targets: [], multiplier };
  if (move === 'claw' || move === 'hoard' || move === 'curse') return { move, targets: [rng.pick(living)], multiplier };
  if (move === 'sweep') {
    const { minTargets, maxTargets } = RAID_COMBAT.moves.sweep;
    const count = Math.min(living.length, rng.int(minTargets, maxTargets));
    const pool = [...living];
    const targets: string[] = [];
    while (targets.length < count) {
      const next = rng.pick(pool);
      pool.splice(pool.indexOf(next), 1);
      targets.push(next);
    }
    return { move, targets, multiplier };
  }
  return { move, targets: [], multiplier };
}

/** Everyone who took at least one action: the ones the reward goes to. */
export const participants = (state: RaidState): string[] => state.players.filter((p) => p.stats.actions > 0).map((p) => p.userId);

/** Players by damage dealt, most first (for the summary; it doesn't change anyone's reward). */
export const damageRanking = <P extends { stats: RaidStats }>(state: { players: readonly P[] }): P[] =>
  [...state.players].filter((p) => p.stats.damage > 0).sort((a, b) => b.stats.damage - a.stats.damage);
