import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DRAGON_SIZE, renderDragon, type DragonMood } from '../src/animations/images/dragon-image.js';
import { eventText, fightEmbed, healOptions, hpBar, intentText, moodOf, resultEmbed, statsReply } from '../src/commands/raid.js';
import { DEFAULTS } from '../src/config.js';
import { RAID, RAID_COMBAT, validateConstants } from '../src/constants/index.js';
import {
  actionProblem,
  bossHpFor,
  bossTurn,
  createRaid,
  damageRanking,
  endRound,
  enrageLevel,
  participants,
  pickIntent,
  recordTheft,
  resolvePlayerTurn,
  type RaidChoice,
  type RaidRng,
  type RaidState,
} from '../src/lib/events/raid.js';
import { raidWeek } from '../src/lib/events/raid-week.js';
import { findSpec, validateSettings } from '../src/lib/settings-spec.js';
import { raidTakings } from '../src/services/raid.js';
import { ITEMS_BY_ID } from '../src/data/items.js';
import { describeEffects } from '../src/lib/game/equipment.js';
import type { ItemDef, RaidDoc } from '../src/types.js';
import { readPng } from './helpers/png.js';

// ---------------------------------------------------------------------------
// The raid week
// ---------------------------------------------------------------------------

test('raidWeek: a week starts Saturday 00:00 Eastern, in both EDT and EST', () => {
  // Thursday 24 Sep 2026, noon UTC (EDT, UTC-4): the week started Saturday 19 Sep at 04:00 UTC.
  const summer = raidWeek(new Date('2026-09-24T12:00:00Z'));
  assert.equal(summer.key, '2026-09-19');
  assert.equal(summer.start.toISOString(), '2026-09-19T04:00:00.000Z');
  assert.equal(summer.next.toISOString(), '2026-09-26T04:00:00.000Z');

  // Wednesday 14 Jan 2026 (EST, UTC-5).
  const winter = raidWeek(new Date('2026-01-14T12:00:00Z'));
  assert.equal(winter.key, '2026-01-10');
  assert.equal(winter.start.toISOString(), '2026-01-10T05:00:00.000Z');
  assert.equal(winter.next.toISOString(), '2026-01-17T05:00:00.000Z');
});

test('raidWeek: the reset is exactly at midnight Eastern, not midnight UTC', () => {
  // 03:59 UTC Saturday is still 23:59 Friday Eastern (EDT): the old week.
  assert.equal(raidWeek(new Date('2026-09-26T03:59:59Z')).key, '2026-09-19');
  assert.equal(raidWeek(new Date('2026-09-26T04:00:00Z')).key, '2026-09-26');
  // Saturday itself and the following Friday are the same week.
  assert.equal(raidWeek(new Date('2026-10-02T23:00:00Z')).key, '2026-09-26');
});

test('raidWeek: a week that crosses a daylight saving change ends at the new offset', () => {
  // Sat 31 Oct 2026 (EDT) to Sat 7 Nov 2026 (EST): clocks go back on Sunday 1 Nov.
  const week = raidWeek(new Date('2026-11-03T12:00:00Z'));
  assert.equal(week.key, '2026-10-31');
  assert.equal(week.start.toISOString(), '2026-10-31T04:00:00.000Z');
  assert.equal(week.next.toISOString(), '2026-11-07T05:00:00.000Z');
});

// ---------------------------------------------------------------------------
// The fight
// ---------------------------------------------------------------------------

/** Randomness that always rolls low, never crits, and picks the first option. */
const low: RaidRng = { int: (min) => min, chance: () => false, pick: (items) => items[0] as never };
const high: RaidRng = { int: (_, max) => max, chance: () => true, pick: (items) => items[items.length - 1] as never };

const choose = (...picks: [string, RaidChoice['action'], number?][]): Map<string, RaidChoice> =>
  new Map(picks.map(([userId, action, boost]) => [userId, { action, boost: boost ?? 0 }]));

function fight(players: string[] = ['a', 'b', 'c'], bossHp = 1000): RaidState {
  return createRaid(players, bossHp, 100, 15, low);
}

test('createRaid: everyone at full HP, round 1, a move announced', () => {
  const state = fight();
  assert.equal(state.round, 1);
  assert.equal(state.bossHp, 1000);
  assert.deepEqual(state.players.map((p) => [p.userId, p.hp]), [['a', 100], ['b', 100], ['c', 100]]);
  assert.equal(state.intent.move, 'claw'); // the lowest roll lands on the first move
  assert.deepEqual(state.intent.targets, ['a']);
  assert.equal(state.outcome, 'ongoing');
});

test('attacks: damage from the roll, boosted by percent, and a crit doubles', () => {
  const state = fight();
  const events = resolvePlayerTurn(state, choose(['a', 'attack'], ['b', 'attack', 50]), low);
  const { min } = RAID_COMBAT.attack;
  assert.deepEqual(
    events.filter((e) => e.kind === 'attack').map((e) => (e.kind === 'attack' ? e.damage : 0)),
    [min, Math.round(min * 1.5)],
  );
  assert.equal(state.bossHp, 1000 - min - Math.round(min * 1.5));

  const crit = fight();
  resolvePlayerTurn(crit, choose(['b', 'attack']), high);
  const { max, critMultiplier } = RAID_COMBAT.attack;
  assert.equal(crit.bossHp, 1000 - max * critMultiplier);
});

test('support with nobody cursed rallies: attacks do more damage for the next turns, not this one', () => {
  const { min } = RAID_COMBAT.attack;
  const { attackMultiplier, rallyTurns } = RAID_COMBAT.support;
  const state = fight(['a', 'b'], 10_000);
  const events = resolvePlayerTurn(state, choose(['a', 'support'], ['b', 'attack']), low);
  assert.deepEqual(events.find((e) => e.kind === 'rally'), { kind: 'rally', userId: 'a', turns: rallyTurns, multiplier: RAID_COMBAT.support.attackMultiplier });
  assert.equal(state.bossHp, 10_000 - min); // the rally starts next turn
  assert.equal(state.rallied, rallyTurns);

  for (let turn = 1; turn <= rallyTurns; turn++) {
    const before = state.bossHp;
    resolvePlayerTurn(state, choose(['b', 'attack']), low);
    assert.equal(before - state.bossHp, Math.round(min * attackMultiplier), `rallied turn ${turn}`);
  }
  assert.equal(state.rallied, 0);
  const before = state.bossHp;
  resolvePlayerTurn(state, choose(['b', 'attack']), low);
  assert.equal(before - state.bossHp, min);
});

test('rallies do not stack: a second one just resets the turns left', () => {
  const state = fight(['a', 'b', 'c'], 10_000);
  resolvePlayerTurn(state, choose(['a', 'support'], ['b', 'support']), low);
  assert.equal(state.rallied, RAID_COMBAT.support.rallyTurns);
  const before = state.bossHp;
  resolvePlayerTurn(state, choose(['a', 'support'], ['c', 'attack']), low);
  assert.equal(before - state.bossHp, Math.round(RAID_COMBAT.attack.min * RAID_COMBAT.support.attackMultiplier));
  assert.equal(state.rallied, RAID_COMBAT.support.rallyTurns);
});

test('support lifts a curse first; only a support with no curse left to lift rallies', () => {
  const state = fight(['a', 'b', 'c']);
  (state.players[0] as { cursed: number }).cursed = 2;
  const one = resolvePlayerTurn(state, choose(['b', 'support']), low);
  assert.deepEqual(one, [{ kind: 'cleansed', userId: 'b', targetId: 'a' }]);
  assert.equal(state.rallied, 0);

  (state.players[0] as { cursed: number }).cursed = 2;
  const two = resolvePlayerTurn(state, choose(['b', 'support'], ['c', 'support']), low);
  assert.deepEqual(two, [
    { kind: 'cleansed', userId: 'b', targetId: 'a' },
    { kind: 'rally', userId: 'c', turns: RAID_COMBAT.support.rallyTurns, multiplier: RAID_COMBAT.support.attackMultiplier },
  ]);
});

test('the last hit beats the boss, and attacks after it do nothing', () => {
  const state = fight(['a', 'b'], 50);
  const events = resolvePlayerTurn(state, choose(['a', 'attack'], ['b', 'attack']), low);
  assert.equal(state.bossHp, 0);
  assert.equal(state.outcome, 'won');
  assert.equal(state.lastHit, 'a');
  assert.equal(state.players[0]?.stats.damage, 50);
  assert.equal(state.players[1]?.stats.damage, 0);
  assert.ok(events.some((e) => e.kind === 'defeated' && e.userId === 'a'));
  // Both took part, so both are rewarded, whatever the damage.
  assert.deepEqual(participants(state), ['a', 'b']);
  assert.deepEqual(damageRanking(state).map((p) => p.userId), ['a']);
  // The boss does nothing once it is beaten.
  assert.deepEqual(bossTurn(state, low), { events: [], theft: null });
});

test('guard: a guard takes a claw aimed at someone else, at half damage', () => {
  const state = fight();
  state.intent = { move: 'claw', targets: ['b'], multiplier: 1 };
  resolvePlayerTurn(state, choose(['a', 'guard']), low);
  const { events } = bossTurn(state, low);
  const claw = Math.round(RAID_COMBAT.moves.claw.damage * RAID_COMBAT.guard.takenShare);
  assert.deepEqual(events, [{ kind: 'hit', move: 'claw', userId: 'a', damage: claw, guarded: true, coveredFor: 'b' }]);
  assert.equal(state.players[1]?.hp, 100);
});

test('guard: fire breath hits everyone, softened for the others by each guard', () => {
  const state = fight();
  state.intent = { move: 'breath', targets: [], multiplier: 1 };
  resolvePlayerTurn(state, choose(['a', 'guard']), low);
  bossTurn(state, low);
  const base = RAID_COMBAT.moves.breath.damage;
  assert.equal(state.players[0]?.hp, 100 - Math.round(base * RAID_COMBAT.guard.takenShare));
  assert.equal(state.players[1]?.hp, 100 - Math.round(base * (1 - RAID_COMBAT.guard.aoeCutPerGuard)));
});

test('hoard: steals from the target, unless a guard is in the way', () => {
  const open = fight();
  open.intent = { move: 'hoard', targets: ['c'], multiplier: 1 };
  resolvePlayerTurn(open, choose(), low);
  const result = bossTurn(open, low);
  assert.deepEqual(result.theft, { userId: 'c', wanted: RAID_COMBAT.moves.hoard.min });
  assert.deepEqual(recordTheft(open, 'c', 123), { kind: 'stole', userId: 'c', amount: 123 });
  assert.equal(open.players[2]?.stats.stolen, 123);

  const guarded = fight();
  guarded.intent = { move: 'hoard', targets: ['c'], multiplier: 1 };
  resolvePlayerTurn(guarded, choose(['b', 'guard']), low);
  const blocked = bossTurn(guarded, low);
  assert.equal(blocked.theft, null);
  assert.deepEqual(blocked.events, [{ kind: 'hoardBlocked', userId: 'b', targetId: 'c' }]);
});

test('heal: revives the knocked out first, otherwise heals the most hurt, never above max', () => {
  const state = fight();
  (state.players[0] as { hp: number }).hp = 0;
  (state.players[1] as { hp: number }).hp = 90;
  resolvePlayerTurn(state, choose(['c', 'heal']), low);
  assert.equal(state.players[0]?.hp, Math.round(100 * RAID_COMBAT.heal.reviveShare));

  resolvePlayerTurn(state, choose(['c', 'heal'], ['b', 'heal']), low);
  // a (30 HP) is the most hurt, and still is after the first heal, so gets both.
  assert.equal(state.players[0]?.hp, 30 + 2 * RAID_COMBAT.heal.amount);
  assert.equal(state.players[2]?.stats.healed, 30 + RAID_COMBAT.heal.amount);

  const full = fight();
  const events = resolvePlayerTurn(full, choose(['a', 'heal']), low);
  assert.deepEqual(events, [{ kind: 'healWasted', userId: 'a' }]);
});

test('heal: goes to the ally the healer picked, and falls back to the usual pick if they no longer need it', () => {
  const pick = (userId: string, target: string, boost = 0): Map<string, RaidChoice> => new Map([[userId, { action: 'heal', boost, target }]]);
  const state = fight();
  (state.players[0] as { hp: number }).hp = 0;
  (state.players[1] as { hp: number }).hp = 90;

  // b is healed though a is knocked out, because c picked b.
  const healed = resolvePlayerTurn(state, pick('c', 'b'), low);
  assert.deepEqual(healed, [{ kind: 'heal', userId: 'c', targetId: 'b', amount: 10, boost: 0 }]);
  assert.equal(state.players[0]?.hp, 0);

  // A knocked-out pick is brought back.
  const revived = resolvePlayerTurn(state, pick('c', 'a'), low);
  assert.equal(revived[0]?.kind, 'revive');
  assert.equal(state.players[0]?.hp, Math.round(100 * RAID_COMBAT.heal.reviveShare));

  // The pick is at full HP by the time it resolves (another heal got there first): the most hurt ally gets it instead.
  (state.players[1] as { hp: number }).hp = 80;
  const heals = new Map<string, RaidChoice>([
    ['b', { action: 'heal', boost: 0, target: 'b' }],
    ['c', { action: 'heal', boost: 0, target: 'b' }],
  ]);
  const events = resolvePlayerTurn(state, heals, low);
  assert.deepEqual(events.map((e) => (e.kind === 'heal' ? e.targetId : e.kind)), ['b', 'a']);
  assert.equal(state.players[1]?.hp, 100);

  // A healer can pick themselves.
  const self = fight();
  (self.players[0] as { hp: number }).hp = 50;
  resolvePlayerTurn(self, pick('a', 'a'), low);
  assert.equal(self.players[0]?.hp, 50 + RAID_COMBAT.heal.amount);
});

test('guardBoost gear: the wearer takes less of every hit while guarding, and the cut for the rest of the party is unchanged', () => {
  const state = fight();
  (state.players[0] as { gear: { guardBoost: number } }).gear.guardBoost = 0.25;
  const breath = RAID_COMBAT.moves.breath.damage;
  state.intent = { move: 'breath', targets: [], multiplier: 1 };
  state.guarding = ['a', 'b'];
  const { events } = bossTurn(state, low);
  const hit = (userId: string) => events.find((e) => e.kind === 'hit' && e.userId === userId) as { damage: number } | undefined;
  assert.equal(hit('a')?.damage, Math.round(breath * 0.375));
  assert.equal(hit('b')?.damage, Math.round(breath * RAID_COMBAT.guard.takenShare));
  assert.equal(hit('c')?.damage, Math.round(breath * (1 - 2 * RAID_COMBAT.guard.aoeCutPerGuard)));

  // Jumping in front of a Claw for someone else, the wearer still takes the smaller share.
  const claw = fight();
  (claw.players[0] as { gear: { guardBoost: number } }).gear.guardBoost = 0.25;
  claw.intent = { move: 'claw', targets: ['b'], multiplier: 1 };
  claw.guarding = ['a'];
  const covered = bossTurn(claw, low).events.find((e) => e.kind === 'hit');
  assert.deepEqual(covered, { kind: 'hit', move: 'claw', userId: 'a', damage: Math.round(RAID_COMBAT.moves.claw.damage * 0.375), guarded: true, coveredFor: 'b' });
});

test('healSplash gear: a heal also mends the most hurt other ally by a share of the heal, and never the one just healed', () => {
  const state = fight();
  (state.players[0] as { gear: { healSplash: number } }).gear.healSplash = 0.5;
  (state.players[1] as { hp: number }).hp = 40;
  (state.players[2] as { hp: number }).hp = 80;
  const events = resolvePlayerTurn(state, choose(['a', 'heal', 20]), low);
  const splash = Math.round(RAID_COMBAT.heal.amount * 1.2 * 0.5);
  assert.deepEqual(events[1], { kind: 'healSplash', userId: 'a', targetId: 'c', amount: splash });
  assert.equal(state.players[2]?.hp, 80 + splash);
  assert.equal(state.players[0]?.stats.healed, Math.round(RAID_COMBAT.heal.amount * 1.2) + splash);

  // Only the one ally hurt: nothing to spill onto. And no gear, no spill.
  const alone = fight();
  (alone.players[0] as { gear: { healSplash: number } }).gear.healSplash = 0.5;
  (alone.players[1] as { hp: number }).hp = 40;
  assert.deepEqual(resolvePlayerTurn(alone, choose(['a', 'heal']), low).map((e) => e.kind), ['heal']);
  const plain = fight();
  (plain.players[1] as { hp: number }).hp = 40;
  (plain.players[2] as { hp: number }).hp = 80;
  assert.deepEqual(resolvePlayerTurn(plain, choose(['a', 'heal']), low).map((e) => e.kind), ['heal']);
});

test('rallyBoost gear: a rally from the wearer gives a bigger attack bonus, and a weaker rally does not cut it short', () => {
  const state = fight();
  (state.players[0] as { gear: { rallyBoost: number } }).gear.rallyBoost = 0.25;
  const rally = resolvePlayerTurn(state, choose(['a', 'support']), low).find((e) => e.kind === 'rally');
  assert.equal((rally as { multiplier: number }).multiplier, 1.625);
  assert.equal(state.rallyMultiplier, 1.625);

  // Next turn: b attacks with the bigger bonus while c rallies without gear (the stronger bonus stays).
  const events = resolvePlayerTurn(state, choose(['b', 'attack'], ['c', 'support']), low);
  assert.equal((events.find((e) => e.kind === 'attack') as { damage: number }).damage, Math.round(RAID_COMBAT.attack.min * 1.625));
  assert.equal(state.rallyMultiplier, 1.625);
  assert.equal(state.rallied, RAID_COMBAT.support.rallyTurns);
});

test('raid gear items: a 2-star and a 3-star item for each raid perk, and their gear cards say what they do', () => {
  for (const [id, stars, slot, effect] of [
    ['willow-wand', 2, 'weapon', 'healSplash'],
    ['dragonbone-staff', 3, 'weapon', 'healSplash'],
    ['studded-brigandine', 2, 'armor', 'guardBoost'],
    ['wyrmscale-plate', 3, 'armor', 'guardBoost'],
    ['battle-horn', 2, 'weapon', 'rallyBoost'],
    ['war-banner', 3, 'weapon', 'rallyBoost'],
  ] as const) {
    const item = ITEMS_BY_ID.get(id);
    assert.ok(item, id);
    assert.equal(item.stars, stars, id);
    assert.equal(item.slot, slot, id);
    assert.deepEqual(item.effects, [effect], id);
  }
  assert.equal(DEFAULTS.equipment.healSplash[3], 0.05);
  assert.equal(DEFAULTS.equipment.guardBoost[3], 0.25);
  assert.equal(DEFAULTS.equipment.rallyBoost[3], 0.25);
  assert.deepEqual(describeEffects(ITEMS_BY_ID.get('war-banner') as ItemDef), ['Raid: your rallies give a 25% bigger attack bonus']);
  assert.deepEqual(describeEffects(ITEMS_BY_ID.get('wyrmscale-plate') as ItemDef), ['Raid: Guard blocks 25% more of the hits you take']);
  assert.deepEqual(describeEffects(ITEMS_BY_ID.get('dragonbone-staff') as ItemDef), ['Raid: heals also mend a second ally for 5% of the heal']);
});

test('heal picker: "whoever needs it most" first, then the knocked out, then the most hurt, never anyone at full HP', () => {
  const state = fight(['a', 'b', 'c', 'd']);
  (state.players[1] as { hp: number }).hp = 70;
  (state.players[2] as { hp: number }).hp = 0;
  (state.players[3] as { hp: number }).hp = 40;
  const options = healOptions(state, 'd', new Map([['b', 'Ana'], ['c', 'Ben'], ['d', 'Cy']]));
  assert.deepEqual(options.map((o) => o.value), [RAID.healAutoValue, 'c', 'd', 'b']);
  assert.deepEqual(options.map((o) => o.label).slice(1), ['Ben', 'Cy (you)', 'Ana']);
  assert.match(options[1]?.description ?? '', /Knocked out/);
  assert.equal(options[2]?.description, '❤️ 40/100 HP');

  // Nobody hurt: only the automatic choice, so no picker is shown.
  assert.equal(healOptions(fight(), 'a', new Map()).length, 1);

  // A big party is cut to what one Discord menu can hold.
  const big = fight(Array.from({ length: 40 }, (_, i) => `p${i}`));
  for (const player of big.players) (player as { hp: number }).hp = 50;
  assert.equal(healOptions(big, 'p0', new Map()).length, RAID.selectMax);
});

test('knocked-out players cannot act, and a party that all falls loses', () => {
  const state = fight(['a', 'b']);
  for (const p of state.players) p.hp = 5;
  assert.equal(actionProblem(state, 'x', 'attack'), 'not_playing');
  state.intent = { move: 'breath', targets: [], multiplier: 1 };
  resolvePlayerTurn(state, choose(), low);
  const { events } = bossTurn(state, low);
  assert.equal(state.outcome, 'wiped');
  assert.ok(events.some((e) => e.kind === 'wiped'));
  assert.equal(actionProblem(state, 'a', 'heal'), 'knocked_out');
});

test('curse: blocks attacking for the next turns, and a support lifts it', () => {
  const state = fight();
  state.intent = { move: 'curse', targets: ['a'], multiplier: 1 };
  resolvePlayerTurn(state, choose(), low);
  bossTurn(state, low);
  assert.equal(actionProblem(state, 'a', 'attack'), 'cursed');
  assert.equal(actionProblem(state, 'a', 'guard'), null);

  // A cursed attack is dropped; the curse wears off a turn at a time.
  const events = resolvePlayerTurn(state, choose(['a', 'attack']), low);
  assert.equal(events.length, 0);
  assert.equal(state.players[0]?.cursed, RAID_COMBAT.moves.curse.rounds - 1);

  const lifted = resolvePlayerTurn(state, choose(['b', 'support']), low);
  assert.deepEqual(lifted, [{ kind: 'cleansed', userId: 'b', targetId: 'a' }]);
  assert.equal(state.players[0]?.cursed, 0);
  assert.equal(actionProblem(state, 'a', 'attack'), null);
});

test('scale shield: attacks bounce for a turn unless enough players support', () => {
  const bounced = fight();
  bounced.intent = { move: 'shield', targets: [], multiplier: 1 };
  resolvePlayerTurn(bounced, choose(), low);
  bossTurn(bounced, low);
  assert.equal(bounced.shielded, true);
  assert.equal(moodOf(bounced), 'shielded');
  const events = resolvePlayerTurn(bounced, choose(['a', 'attack']), low);
  assert.deepEqual(events, [{ kind: 'bounced', userId: 'a' }]);
  assert.equal(bounced.bossHp, 1000);
  assert.equal(bounced.shielded, false);

  const supporters = Array.from({ length: RAID_COMBAT.support.shieldBreak }, (_, i): [string, 'support'] => [`s${i}`, 'support']);
  const party = createRaid(['a', ...supporters.map(([id]) => id)], 1000, 100, 15, low);
  party.shielded = true;
  const out = resolvePlayerTurn(party, choose(...supporters, ['a', 'attack']), low);
  assert.ok(out.some((e) => e.kind === 'shieldBroken'));
  assert.ok(party.bossHp < 1000);
});

test('enrage: the boss gets angrier below each threshold, and never shields twice in a row', () => {
  assert.equal(enrageLevel(1000, 1000), 0);
  assert.equal(enrageLevel(500, 1000), 1);
  assert.equal(enrageLevel(250, 1000), 2);

  const state = fight(['a'], 1000);
  state.bossHp = 260;
  const events = resolvePlayerTurn(state, choose(['a', 'attack']), low);
  assert.deepEqual(events.filter((e) => e.kind === 'enrage'), [{ kind: 'enrage', level: 1 }, { kind: 'enrage', level: 2 }]);
  assert.equal(moodOf(state), 'furious');

  state.lastMove = 'shield';
  for (let roll = 1; roll <= 100; roll++) {
    const fixed: RaidRng = { ...low, int: (min, max) => Math.min(max, Math.max(min, roll)) };
    assert.notEqual(pickIntent(state, fixed).move, 'shield');
  }
});

test('the boss flies off after the last round', () => {
  const state = createRaid(['a'], 1000, 100, 2, low);
  endRound(state, low);
  assert.equal(state.round, 2);
  assert.deepEqual(endRound(state, low), [{ kind: 'fled' }]);
  assert.equal(state.outcome, 'fled');
});

test('pickIntent: a tail sweep is aimed at different players', () => {
  const state = fight(['a', 'b', 'c', 'd']);
  const sweepRoll: RaidRng = {
    ...low,
    int: (min, max) => (max > 10 ? RAID_COMBAT.weights[0].claw + RAID_COMBAT.weights[0].breath + 1 : max),
  };
  const intent = pickIntent(state, sweepRoll);
  assert.equal(intent.move, 'sweep');
  assert.equal(intent.targets.length, RAID_COMBAT.moves.sweep.maxTargets);
  assert.equal(new Set(intent.targets).size, intent.targets.length);
});

// ---------------------------------------------------------------------------
// What it looks like
// ---------------------------------------------------------------------------

test('hpBar: always the full width, empty only at 0', () => {
  assert.equal(hpBar(100, 100, 10), '🟥'.repeat(10));
  assert.equal(hpBar(1, 100, 10), '🟥' + '⬛'.repeat(9));
  assert.equal(hpBar(0, 100, 10), '⬛'.repeat(10));
  assert.equal(hpBar(50, 100, 10), '🟥'.repeat(5) + '⬛'.repeat(5));
});

test('every event and every move has a line of text', () => {
  const state = fight(['a', 'b']);
  for (const move of ['claw', 'breath', 'sweep', 'hoard', 'shield', 'curse'] as const) {
    assert.ok(intentText(state, { move, targets: ['a', 'b'], multiplier: 1 }).length > 0);
  }
  const events = [
    ...resolvePlayerTurn(state, choose(['a', 'attack', 10], ['b', 'support']), high),
    { kind: 'hit', move: 'claw', userId: 'a', damage: 20, guarded: false, coveredFor: 'b' } as const,
    { kind: 'stole', userId: 'a', amount: 0 } as const,
    { kind: 'fled' } as const,
  ];
  for (const event of events) assert.ok(eventText(event).length > 0, event.kind);
  assert.match(eventText({ kind: 'attack', userId: 'a', damage: 1234, crit: true, boost: 10 }), /1,234.*critical.*\+10%/);
});

test('fight and result embeds fit Discord and name the players', () => {
  const cfg = DEFAULTS.raid;
  const state = fight(Array.from({ length: 7 }, (_, i) => `${100000000000000000 + i}`));
  const log = Array.from({ length: 30 }, (_, i) => `line ${i}`);
  const embed = fightEmbed(state, choose([state.players[0]?.userId as string, 'guard']), log, Date.now() + 60_000, cfg).toJSON();
  assert.ok(embed.description?.includes('1,000'));
  const logField = embed.fields?.find((f) => f.name === 'Recent actions');
  assert.equal(logField?.value.split('\n').length, 10);
  assert.ok(logField?.value.endsWith('line 29'));

  resolvePlayerTurn(state, choose([state.players[1]?.userId as string, 'attack']), low);
  state.outcome = 'fled';
  const result = resultEmbed(state, cfg, new Date('2026-10-03T04:00:00Z'), null).toJSON();
  assert.match(result.title ?? '', /got away/);
  assert.ok(result.fields?.some((f) => f.value.includes(`<@${state.players[1]?.userId}>`)));
});

test('raid stats: shown only once the dragon is slain, with damage, healing and support', () => {
  const next = new Date('2026-10-03T04:00:00Z');
  const base: RaidDoc = {
    _id: 'g:2026-09-26',
    guildId: 'g',
    weekKey: '2026-09-26',
    startedBy: 'a',
    status: 'won',
    channelId: null,
    messageId: null,
    players: ['a', 'b', 'c'],
    spent: { a: 500 },
    stolen: {},
    damage: { a: 900, b: 100, c: 0 },
    stats: {
      a: { damage: 900, healed: 0, guards: 0, supports: 0, actions: 5, spent: 500, stolen: 0 },
      b: { damage: 100, healed: 0, guards: 3, supports: 0, actions: 5, spent: 0, stolen: 0 },
      c: { damage: 0, healed: 240, guards: 0, supports: 2, actions: 5, spent: 0, stolen: 0 },
    },
    lastHit: 'a',
    rounds: 5,
    createdAt: new Date('2026-09-26T05:00:00Z'),
    endedAt: new Date('2026-09-26T05:10:00Z'),
  };

  // No raid, still going, or the dragon lived: a line saying why, no stats.
  assert.match(statsReply(null, 'k!', next) as string, /k!raid/);
  assert.match(statsReply({ ...base, status: 'fighting' }, 'k!', next) as string, /still going/);
  for (const status of ['wiped', 'fled'] as const) assert.match(statsReply({ ...base, status }, 'k!', next) as string, /wasn't slain/);

  const reply = statsReply(base, 'k!', next);
  assert.notEqual(typeof reply, 'string');
  const embed = (reply as Exclude<typeof reply, string>).toJSON();
  assert.match(embed.description ?? '', /5 rounds.*3 raiders/);
  const field = (name: string) => embed.fields?.find((f) => f.name === name)?.value ?? '';
  assert.match(field('Damage'), /^🥇 <@a>: \*\*900\*\* \(90%\)\n🥈 <@b>: \*\*100\*\*/);
  assert.equal(field('Final blow'), '<@a>');
  assert.match(field('Team play'), /<@b>: 💚 0 healed · 🛡️ 3 · ✨ 0/);
  assert.match(field('Team play'), /<@c>: 💚 240 healed · 🛡️ 0 · ✨ 2/);
  assert.match(field('Points lost'), /<@a>: 💸 500 on boosts/);

  // A raid saved before every stat was kept still shows its damage.
  const old = (statsReply({ ...base, stats: undefined }, 'k!', next) as Exclude<typeof reply, string>).toJSON();
  assert.match(old.fields?.find((f) => f.name === 'Damage')?.value ?? '', /<@a>: \*\*900\*\*/);
});

test('the dragon draws in every mood, at its size, and each mood looks different', () => {
  const seen = new Set<string>();
  for (const mood of ['calm', 'enraged', 'furious', 'shielded', 'defeated', 'gloating', 'fled'] as DragonMood[]) {
    const png = readPng(renderDragon(mood));
    assert.equal(png.width, DRAGON_SIZE.width);
    assert.equal(png.height, DRAGON_SIZE.height);
    seen.add(Buffer.from(png.pixels).toString('base64'));
  }
  assert.equal(seen.size, 7);
});

// ---------------------------------------------------------------------------
// Settings and constants
// ---------------------------------------------------------------------------

test('raid settings: the defaults are valid and every one can be changed', () => {
  assert.deepEqual(validateSettings(DEFAULTS), []);
  for (const key of ['hpPerPlayer', 'hpGrowth', 'minBossHp', 'playerHp', 'maxRounds', 'turnSeconds', 'prepareSeconds', 'reward', 'boostCost', 'maxBoost']) {
    assert.ok(findSpec(`raid.${key}`), key);
  }
  assert.equal(DEFAULTS.raid.boostCost, 250);
  assert.equal(DEFAULTS.raid.reward, 1000);
  assert.equal(DEFAULTS.raid.prepareSeconds, 300);
  assert.equal(DEFAULTS.raid.turnSeconds, 60);
  assert.doesNotThrow(() => validateConstants());
});

test('raidTakings: everything spent on boosts and stolen goes to the vault, and a refund never counts', () => {
  assert.equal(raidTakings({ spent: { a: 2500, b: 0 }, stolen: { a: 300, c: 450 } }), 3250);
  assert.equal(raidTakings({ spent: {}, stolen: {} }), 0);
  // A boost refunded after the turn closed leaves a 0 behind, never a negative that eats into the rest.
  assert.equal(raidTakings({ spent: { a: 0, b: -250 }, stolen: { c: 100 } }), 100);
});

test('bossHpFor: grows a little faster than the party, and never drops below the minimum', () => {
  const hp = { hpPerPlayer: 600, hpGrowth: 0.06, minBossHp: 3000 };
  assert.equal(bossHpFor(1, hp), 3000);
  assert.equal(bossHpFor(2, hp), 3000); // 1,272 scaled, held up by the minimum
  assert.equal(bossHpFor(5, hp), Math.round(600 * 5 * 1.24));
  assert.equal(bossHpFor(7, hp), 5712);
  // More raiders always means more HP per raider once past the minimum.
  for (let n = 6; n <= 20; n++) assert.ok(bossHpFor(n, hp) / n > bossHpFor(n - 1, hp) / (n - 1));
  // No growth is plain per-raider HP.
  assert.equal(bossHpFor(4, { ...hp, hpGrowth: 0, minBossHp: 1 }), 2400);
  // The defaults are the ones described in config.ts.
  assert.equal(bossHpFor(7, DEFAULTS.raid), 5712);
});

test('komaTokens: the raid pays 10 by default, and pulls show what tokens and points paid, with the emoji alone', async () => {
  const { balanceText, spentText } = await import('../src/commands/gacha.js');
  const { boldTokens } = await import('../src/constants/text/currency.js');
  assert.equal(DEFAULTS.raid.tokenReward, 10);
  assert.ok(findSpec('raid.tokenReward'));
  assert.equal(boldTokens(1), '**1** <:zeiutoken:1552921364489572362>');
  assert.equal(boldTokens(1500), '**1,500** <:zeiutoken:1552921364489572362>');

  // All tokens: no points at all.
  assert.equal(spentText({ cost: 0, baseCost: 0, tokensUsed: 10 }), '**10** <:zeiutoken:1552921364489572362>');
  // Tokens for some, points (after gear) for the rest.
  assert.match(spentText({ cost: 500, baseCost: 560, tokensUsed: 8 }), /^\*\*8\*\* <:zeiutoken:1552921364489572362> \+ 500 .*gear saved 60/);
  // No tokens used: just the points.
  assert.doesNotMatch(spentText({ cost: 2800, baseCost: 2800, tokensUsed: 0 }), /zeiutoken/);

  // The tokens left are shown under the points only when the pull used some, even if none are left.
  assert.match(balanceText({ balance: 1200, tokens: 3, tokensUsed: 1 }), /1,200.*\n\*\*3\*\* <:zeiutoken:1552921364489572362>$/);
  assert.match(balanceText({ balance: 1200, tokens: 0, tokensUsed: 1 }), /\n\*\*0\*\* <:zeiutoken:1552921364489572362>$/);
  assert.doesNotMatch(balanceText({ balance: 1200, tokens: 0, tokensUsed: 0 }), /zeiutoken/);
  // No token name anywhere, only the emoji.
  assert.doesNotMatch(boldTokens(2) + spentText({ cost: 0, baseCost: 0, tokensUsed: 2 }) + balanceText({ balance: 0, tokens: 2, tokensUsed: 2 }), /komaToken/i);
});

test('the boss hits as hard as it announced, even if it enrages in between (the regression where guards looked broken)', () => {
  const state = fight(['g', 'x', 'a'], 5000);
  state.bossHp = 1300; // just above the second threshold
  state.intent = { move: 'claw', targets: ['x'], multiplier: 1 };
  const events = resolvePlayerTurn(state, choose(['g', 'guard'], ['a', 'attack', 100]), high);
  assert.equal(state.enrage, 2);
  events.push(...bossTurn(state, low).events);
  const claw = RAID_COMBAT.moves.claw.damage;
  // The guard took the announced 45, halved, not the furious 68 halved.
  assert.deepEqual(events.at(-1), { kind: 'hit', move: 'claw', userId: 'g', damage: Math.round(claw * RAID_COMBAT.guard.takenShare), guarded: true, coveredFor: 'x' });
  // The furious multiplier shows from the next announced move.
  endRound(state, low);
  assert.equal(state.intent.multiplier, RAID_COMBAT.enrage.multipliers[2]);
  // The lowest roll picks a claw again, now announced at its furious strength.
  assert.equal(state.intent.move, 'claw');
  assert.match(intentText(state), new RegExp(`\(${Math.round(claw * RAID_COMBAT.enrage.multipliers[2])} damage\)`));
});

test('raid test tools: jump between phases, set HP, and force each ending', async () => {
  const { applyRaidTest } = await import('../src/commands/raid.js');
  const state = fight(['a', 'b'], 4000);
  let ended = 0;
  let updated = 0;
  const live = { state, log: [] as string[], update: () => void updated++, endTurn: () => void ended++, tested: false };

  applyRaidTest(live, 'enraged', 'admin');
  assert.equal(state.enrage, 1);
  assert.ok(state.bossHp < 2000 && state.bossHp > 1000);
  assert.equal(moodOf(state), 'enraged');
  applyRaidTest(live, 'furious', 'admin');
  assert.equal(state.enrage, 2);
  applyRaidTest(live, 'calm', 'admin');
  assert.equal(state.enrage, 0);
  assert.equal(state.bossHp, 4000);
  assert.equal(live.tested, true);

  applyRaidTest(live, 'hp', 'admin', '40%');
  assert.equal(state.bossHp, 1600);
  applyRaidTest(live, 'hp', 'admin', '1,234');
  assert.equal(state.bossHp, 1234);
  assert.match(applyRaidTest(live, 'hp', 'admin', 'lots'), /number or a percentage/);

  applyRaidTest(live, 'shield', 'admin');
  assert.equal(moodOf(state), 'shielded');
  applyRaidTest(live, 'shield', 'admin');
  assert.equal(state.shielded, false);
  assert.ok(updated >= 6);
  assert.ok(live.log.every((line) => line.startsWith('🛠️')));

  applyRaidTest(live, 'kill', 'admin');
  assert.equal(state.outcome, 'won');
  assert.equal(state.bossHp, 0);
  assert.equal(state.lastHit, 'admin');
  assert.equal(moodOf(state), 'defeated');
  assert.equal(ended, 1);

  const wiped = fight(['a', 'b']);
  applyRaidTest({ state: wiped, log: [], update: () => {}, endTurn: () => {}, tested: false }, 'wipe', 'admin');
  assert.equal(wiped.outcome, 'wiped');
  assert.ok(wiped.players.every((p) => p.hp === 0));
});

test('moodOf: each phase and each ending has its own picture', () => {
  const state = fight(['a', 'b'], 1000);
  assert.equal(moodOf(state), 'calm');
  state.enrage = 1;
  assert.equal(moodOf(state), 'enraged');
  state.enrage = 2;
  assert.equal(moodOf(state), 'furious');
  state.shielded = true;
  assert.equal(moodOf(state), 'shielded');
  state.shielded = false;
  state.outcome = 'wiped';
  assert.equal(moodOf(state), 'gloating');
  state.outcome = 'fled';
  assert.equal(moodOf(state), 'fled');
  state.bossHp = 0;
  state.outcome = 'won';
  assert.equal(moodOf(state), 'defeated');
});

test('gear stats: the raid numbers a member fights with, and the ones their gear changed', async () => {
  const { raidStatsEmbed } = await import('../src/commands/gear.js');
  const none = raidStatsEmbed('Ana', { healSplash: 0, guardBoost: 0, rallyBoost: 0 }, 100, 'k!').toJSON();
  assert.equal(none.title, "⚔️ Ana's raid stats");
  const plain = none.description ?? '';
  assert.match(plain, /❤️ \*\*HP\*\*: 100/);
  assert.ok(plain.includes(`**Attack**: ${RAID_COMBAT.attack.min}`));
  assert.match(plain, /you take 50% of a hit$/m);
  assert.match(plain, /attacks do 1\.5x damage for 2 turns$/m);
  assert.match(plain, /No raid gear equipped.*k!gacha/);
  assert.doesNotMatch(plain, /🎒|second ally/);
  assert.equal(none.footer, undefined);

  const geared = raidStatsEmbed('Ana', { healSplash: 0.2, guardBoost: 0.25, rallyBoost: 0.25 }, 100, 'k!').toJSON();
  const text = geared.description ?? '';
  assert.match(text, /second ally for 20% of it \(6 HP\) 🎒/);
  assert.match(text, /you take 37\.5% of a hit \(normally 50%\) 🎒/);
  assert.match(text, /attacks do 1\.63x damage for 2 turns \(normally 1\.5x\) 🎒/);
  assert.doesNotMatch(text, /No raid gear/);
  assert.match(geared.footer?.text ?? '', /changed by gear/);
});
