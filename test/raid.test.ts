import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DRAGON_SIZE, renderDragon, type DragonMood } from '../src/animations/images/dragon-image.js';
import { eventLines, eventText, fightEmbed, healOptions, hpBar, intentText, moodOf, playerHpBar, resultEmbed, weekResultEmbed, bossInfoEmbed, isFinished } from '../src/commands/raid.js';
import { DEFAULTS } from '../src/config.js';
import { GEM_EMOJI, RAID, RAID_COMBAT, RAID_EMOJI, TEXT, validateConstants } from '../src/constants/index.js';
import * as TEXT_CURRENCY from '../src/constants/text/currency.js';
import {
  BOSS_MOVES,
  canAct,
  defaultRaidRng,
  fairTargets,
  RAID_ACTIONS,
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

test('support frees an ally from crowd control first (stuns before anything else); only one with nobody to free rallies', () => {
  const state = fight(['a', 'b', 'c', 'd']);
  state.players[0]!.cc = { effect: 'disarmed', turns: 2 };
  const one = resolvePlayerTurn(state, choose(['b', 'support']), low);
  assert.deepEqual(one, [{ kind: 'cleansed', userId: 'b', targetId: 'a', effect: 'disarmed' }]);
  assert.equal(state.players[0]?.cc, null);
  assert.equal(state.rallied, 0);

  state.players[0]!.cc = { effect: 'taunted', turns: 2 };
  state.players[3]!.cc = { effect: 'stunned', turns: 1 };
  const two = resolvePlayerTurn(state, choose(['b', 'support'], ['c', 'support']), low);
  assert.deepEqual(two.slice(0, 2), [
    { kind: 'cleansed', userId: 'b', targetId: 'd', effect: 'stunned' },
    { kind: 'cleansed', userId: 'c', targetId: 'a', effect: 'taunted' },
  ]);

  const three = resolvePlayerTurn(state, choose(['b', 'support']), low);
  assert.deepEqual(three, [{ kind: 'rally', userId: 'b', turns: RAID_COMBAT.support.rallyTurns, multiplier: RAID_COMBAT.support.attackMultiplier }]);
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

test('maxHpDamage gear: each attack also deals a share of the dragon\'s max HP, added after rallies and crits, and nothing through the shield', () => {
  const state = fight(['a', 'b'], 4000);
  state.players[0]!.gear.maxHpDamage = 0.005;
  const plain = RAID_COMBAT.attack.min;
  const events = resolvePlayerTurn(state, choose(['a', 'attack'], ['b', 'attack']), low);
  const hit = (userId: string, list = events) => (list.find((e) => e.kind === 'attack' && e.userId === userId) as { damage: number }).damage;
  assert.equal(hit('a'), plain + 20);
  assert.equal(hit('b'), plain);

  // A crit doubles the attack, not the extra.
  const crit = fight(['a'], 4000);
  crit.players[0]!.gear.maxHpDamage = 0.005;
  assert.equal(hit('a', resolvePlayerTurn(crit, choose(['a', 'attack']), high)), RAID_COMBAT.attack.max * RAID_COMBAT.attack.critMultiplier + 20);

  // Through the Scale Shield: still bounces.
  const shielded = fight(['a'], 4000);
  shielded.players[0]!.gear.maxHpDamage = 0.005;
  shielded.shielded = true;
  assert.deepEqual(resolvePlayerTurn(shielded, choose(['a', 'attack']), low), [{ kind: 'bounced', userId: 'a' }]);
  assert.equal(DEFAULTS.equipment.maxHpDamage[3], 0.005);
  assert.deepEqual(describeEffects(ITEMS_BY_ID.get('wyrmpiercer') as ItemDef), ["Raid: attacks also deal 0.5% of the dragon's max HP"]);
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

test('raid gear items: a 1-star, a 2-star and a 3-star item for each raid perk, and their gear cards say what they do', () => {
  for (const [id, stars, slot, effect] of [
    ['sapling-wand', 1, 'weapon', 'healSplash'],
    ['padded-gambeson', 1, 'armor', 'guardBoost'],
    ['tin-whistle', 1, 'weapon', 'rallyBoost'],
    ['willow-wand', 2, 'weapon', 'healSplash'],
    ['dragonbone-staff', 3, 'weapon', 'healSplash'],
    ['studded-brigandine', 2, 'armor', 'guardBoost'],
    ['wyrmscale-plate', 3, 'armor', 'guardBoost'],
    ['battle-horn', 2, 'weapon', 'rallyBoost'],
    ['war-banner', 3, 'weapon', 'rallyBoost'],
    ['wyrmpiercer', 3, 'weapon', 'maxHpDamage'],
  ] as const) {
    const item = ITEMS_BY_ID.get(id);
    assert.ok(item, id);
    assert.equal(item.stars, stars, id);
    assert.equal(item.slot, slot, id);
    assert.deepEqual(item.effects, [effect], id);
  }
  assert.equal(DEFAULTS.equipment.healSplash[3], 0.2);
  assert.equal(DEFAULTS.equipment.guardBoost[3], 0.25);
  assert.equal(DEFAULTS.equipment.rallyBoost[3], 0.25);
  assert.deepEqual(describeEffects(ITEMS_BY_ID.get('war-banner') as ItemDef), ['Raid: your rallies give a 25% bigger attack bonus']);
  assert.deepEqual(describeEffects(ITEMS_BY_ID.get('wyrmscale-plate') as ItemDef), ['Raid: Guard blocks 25% more of the hits you take']);
  assert.deepEqual(describeEffects(ITEMS_BY_ID.get('dragonbone-staff') as ItemDef), ['Raid: heals also mend a second ally for 20% of the heal']);
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

test('stun, disarm and taunt: what each one blocks, for the next 2 turns, and a support frees them', () => {
  const cases = [
    ['stun', 'stunned', ['attack', 'guard', 'heal', 'support']],
    ['disarm', 'disarmed', ['attack']],
    ['taunt', 'taunted', ['guard', 'heal', 'support']],
  ] as const;
  for (const [move, effect, blocked] of cases) {
    const state = fight();
    state.intent = { move, targets: ['a', 'b'], multiplier: 1 };
    const { events } = bossTurn(state, low);
    assert.deepEqual(events, [
      { kind: 'cc', effect, userId: 'a' },
      { kind: 'cc', effect, userId: 'b' },
    ]);
    for (const action of RAID_ACTIONS) assert.equal(actionProblem(state, 'a', action), (blocked as readonly string[]).includes(action) ? effect : null, `${move} ${action}`);
    assert.equal(canAct(state.players[0]!), effect !== 'stunned');

    // A blocked pick is dropped, and a support frees one of them (a, first in the party) straight away.
    const first = resolvePlayerTurn(state, choose(['a', blocked[0]], ['c', 'support']), low);
    assert.deepEqual(first, [{ kind: 'cleansed', userId: 'c', targetId: 'a', effect }]);
    assert.equal(state.players[0]?.cc, null);
    // The other wears off a turn at a time, and is gone after 2.
    assert.equal(state.players[1]?.cc?.turns, RAID_COMBAT.cc.rounds - 1);
    resolvePlayerTurn(state, choose(), low);
    assert.equal(state.players[1]?.cc, null);
  }
});

test('crowd control: one every 5 rounds on 1 raider when calm, every 4 on 2 when enraged, every 3 on 3 when furious, never on someone already held', () => {
  // A roll that always lands on the last move with any weight: stun, disarm or taunt when they are allowed.
  const last: RaidRng = { int: (_, max) => max, chance: () => false, pick: (items) => items[0] as never };
  const party = ['a', 'b', 'c', 'd', 'e'];
  for (const [enrage, cooldown, targets] of [[0, 5, 1], [1, 4, 2], [2, 3, 3]] as const) {
    const state = fight(party);
    state.enrage = enrage;
    state.round = 10;
    state.lastCc = null;
    const first = pickIntent(state, last);
    assert.equal(first.move, 'taunt', `phase ${enrage}`);
    assert.equal(first.targets.length, targets, `phase ${enrage}`);

    // Too soon since the last one: no crowd control at all.
    state.lastCc = 10 - cooldown + 1;
    assert.ok(!['stun', 'disarm', 'taunt'].includes(pickIntent(state, last).move), `phase ${enrage} cooldown`);
    state.lastCc = 10 - cooldown;
    assert.equal(pickIntent(state, last).move, 'taunt', `phase ${enrage} ready`);
  }

  // Only raiders not already held are picked, and fewer when not enough are free.
  const held = fight(['a', 'b', 'c']);
  held.enrage = 2;
  held.players[0]!.cc = { effect: 'stunned', turns: 1 };
  held.players[1]!.cc = { effect: 'disarmed', turns: 2 };
  assert.deepEqual(pickIntent(held, last).targets, ['c']);
  held.players[2]!.cc = { effect: 'taunted', turns: 2 };
  assert.ok(!['stun', 'disarm', 'taunt'].includes(pickIntent(held, last).move));

  // Making the move starts the cooldown.
  const state = fight(['a', 'b']);
  state.intent = { move: 'stun', targets: ['a'], multiplier: 1 };
  state.round = 7;
  bossTurn(state, low);
  assert.equal(state.lastCc, 7);
});

test('the boss spreads its aimed moves evenly: always at someone aimed at least so far', () => {
  const state = fight(['a', 'b', 'c', 'd']);
  // Creating the raid already aimed its first move at someone; start from a clean slate.
  for (const player of state.players) player.targeted = 0;
  const counts = new Map(state.players.map((p) => [p.userId, 0]));
  for (let i = 0; i < 12; i++) {
    for (const id of fairTargets(state.players, 1, defaultRaidRng)) counts.set(id, (counts.get(id) ?? 0) + 1);
    const values = [...counts.values()];
    assert.ok(Math.max(...values) - Math.min(...values) <= 1, `after ${i + 1}: ${values}`);
  }
  assert.deepEqual([...counts.values()], [3, 3, 3, 3]);
  // Several at once are all different players, the least aimed at first.
  state.players[0]!.targeted = 10;
  assert.deepEqual(new Set(fairTargets(state.players, 3, low)), new Set(['b', 'c', 'd']));
  assert.equal(fairTargets(state.players, 9, low).length, 4);
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

test('player HP bars: green when healthy, yellow from half, red from a quarter, empty when knocked out', () => {
  assert.equal(playerHpBar(100, 100), '🟩'.repeat(6));
  assert.equal(playerHpBar(51, 100), '🟩'.repeat(3) + '⬛'.repeat(3));
  assert.equal(playerHpBar(50, 100), '🟨'.repeat(3) + '⬛'.repeat(3));
  assert.equal(playerHpBar(25, 100), '🟥'.repeat(2) + '⬛'.repeat(4));
  assert.equal(playerHpBar(1, 100), '🟥' + '⬛'.repeat(5));
  assert.equal(playerHpBar(0, 100), '⬛'.repeat(6));
});

test("the party list shows each player's bar and HP, and a full list still fits one embed field", () => {
  const state = fight(Array.from({ length: 40 }, (_, i) => `${100000000000000000 + i}`));
  for (const player of state.players) {
    (player as { hp: number }).hp = 99;
    player.cc = { effect: 'disarmed', turns: 2 };
  }
  const party = fightEmbed(state, new Map(), [], Date.now() + 60_000, DEFAULTS.raid).toJSON().fields?.find((f) => f.name === 'Party')?.value ?? '';
  assert.ok(party.startsWith(`⏳ <@100000000000000000> ${'🟩'.repeat(6)} ❤️ 99/100 ${RAID_EMOJI.disarmed} disarmed (2)`), party.split('\n')[0]);
  assert.ok(party.length <= 1024, `${party.length} characters`);
});

test('hpBar: always the full width, empty only at 0', () => {
  assert.equal(hpBar(100, 100, 10), '🟥'.repeat(10));
  assert.equal(hpBar(1, 100, 10), '🟥' + '⬛'.repeat(9));
  assert.equal(hpBar(0, 100, 10), '⬛'.repeat(10));
  assert.equal(hpBar(50, 100, 10), '🟥'.repeat(5) + '⬛'.repeat(5));
});

test('the action log puts several of the same thing in one turn on one line', () => {
  const [z, h, i, p] = ['zeiu', 'hxlon', 'inu', 'potatoe'];
  const E = RAID_EMOJI;
  // Two plain attacks for the same amount, two guards.
  assert.deepEqual(
    eventLines([
      { kind: 'guard', userId: i },
      { kind: 'guard', userId: p },
      { kind: 'attack', userId: z, damage: 60, crit: false, boost: 0 },
      { kind: 'attack', userId: h, damage: 60, crit: false, boost: 0 },
    ]),
    [`${E.guard} <@inu> and <@potatoe> stand guard.`, `${E.attack} <@zeiu> and <@hxlon> hit for **60** each.`],
  );
  // Different amounts (a boost, a crit): one line, each with its own.
  assert.deepEqual(
    eventLines([
      { kind: 'attack', userId: z, damage: 75, crit: false, boost: 25 },
      { kind: 'attack', userId: h, damage: 120, crit: true, boost: 0 },
      { kind: 'attack', userId: i, damage: 60, crit: false, boost: 0 },
    ]),
    [`${E.attack} Hits: <@zeiu> **75** (+25%), <@hxlon> **120** (${E.crit} critical!), <@inu> **60**.`],
  );
  // A Fire Breath with its knock-outs after it; a guard who took less makes it list each.
  assert.deepEqual(
    eventLines([
      { kind: 'hit', move: 'breath', userId: z, damage: 24, guarded: false, coveredFor: null },
      { kind: 'hit', move: 'breath', userId: h, damage: 24, guarded: false, coveredFor: null },
      { kind: 'knockedOut', userId: h },
      { kind: 'hit', move: 'breath', userId: i, damage: 24, guarded: false, coveredFor: null },
      { kind: 'knockedOut', userId: i },
    ]),
    ['🔥 Fire Breath burned <@zeiu>, <@hxlon> and <@inu> for **24** each.', '💀 <@hxlon> and <@inu> were knocked out!'],
  );
  assert.deepEqual(
    eventLines([
      { kind: 'hit', move: 'sweep', userId: z, damage: 16, guarded: true, coveredFor: null },
      { kind: 'hit', move: 'sweep', userId: h, damage: 32, guarded: false, coveredFor: null },
    ]),
    ['🌀 Tail Sweep hit <@zeiu> for **16** and <@hxlon> for **32**.'],
  );
  // Crowd control on several at once; a lone event keeps its own line; heals are never merged.
  assert.deepEqual(eventLines([{ kind: 'cc', effect: 'stunned', userId: z }, { kind: 'cc', effect: 'stunned', userId: h }]), [
    `${E.stunned} <@zeiu> and <@hxlon> are stunned: can't act.`,
  ]);
  assert.deepEqual(eventLines([{ kind: 'guard', userId: z }]), [eventText({ kind: 'guard', userId: z })]);
  const heals = [
    { kind: 'heal', userId: z, targetId: h, amount: 30, boost: 0 },
    { kind: 'heal', userId: i, targetId: p, amount: 30, boost: 0 },
  ] as const;
  assert.deepEqual(eventLines(heals), heals.map(eventText));
});

test('every event and every move has a line of text', () => {
  const state = fight(['a', 'b']);
  for (const move of BOSS_MOVES) {
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

test('raid, once this week\'s raid has been fought: how it ended, who did what, and when the next one is', () => {
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

  // Only a raid fought to the end counts; one still in its lobby or fight doesn't.
  assert.ok(isFinished(base));
  for (const status of ['wiped', 'fled'] as const) assert.ok(isFinished({ ...base, status }));
  for (const status of ['preparing', 'fighting'] as const) assert.equal(isFinished({ ...base, status }), false);

  const nextUnix = Math.floor(next.getTime() / 1000);
  const embed = weekResultEmbed(base, next).toJSON();
  assert.match(embed.title ?? '', /was slain/);
  assert.match(embed.description ?? '', /5 rounds.*3 raiders/);
  assert.ok(embed.description?.includes(`<t:${nextUnix}:R>`), 'says when the next raid can be started');
  const field = (name: string) => embed.fields?.find((f) => f.name === name)?.value ?? '';
  assert.match(field('Damage'), /^🥇 <@a>: \*\*900\*\* \(90%\)\n🥈 <@b>: \*\*100\*\*/);
  assert.equal(field('Final blow'), '<@a>');
  assert.ok(field('Team play').includes(`<@b>: ${RAID_EMOJI.heal} 0 healed · ${RAID_EMOJI.guard} 3 · ✨ 0`));
  assert.ok(field('Team play').includes(`<@c>: ${RAID_EMOJI.heal} 240 healed · ${RAID_EMOJI.guard} 0 · ✨ 2`));
  assert.match(field('Points lost'), /<@a>: 💸 500 on boosts/);

  // A lost raid shows the same stats, and says how it was lost.
  const wiped = weekResultEmbed({ ...base, status: 'wiped' }, next).toJSON();
  assert.match(wiped.title ?? '', /won/);
  assert.match(wiped.description ?? '', /knocked out in round \*\*5\*\*/);
  assert.ok(wiped.fields?.some((f) => f.name === 'Team play'));
  const fled = weekResultEmbed({ ...base, status: 'fled' }, next).toJSON();
  assert.match(fled.title ?? '', /got away/);
  assert.match(fled.description ?? '', /still standing after \*\*5 rounds\*\*/);

  // A raid saved before every stat was kept still shows its damage.
  const old = weekResultEmbed({ ...base, stats: undefined }, next).toJSON();
  assert.match(old.fields?.find((f) => f.name === 'Damage')?.value ?? '', /<@a>: \*\*900\*\*/);
});

test('raid stats: the dragon itself, its HP, its phases with their crowd-control cooldowns, and every move', () => {
  const cfg = DEFAULTS.raid;
  const embed = bossInfoEmbed(cfg).toJSON();
  assert.equal(embed.title, `🐉 ${TEXT.raid.bossName}`);
  const description = embed.description ?? '';
  assert.ok(description.includes(`${cfg.hpPerPlayer} per raider`), description);
  assert.ok(description.includes(`5 raiders: ${bossHpFor(5, cfg).toLocaleString('en-US')}`), description);
  assert.ok(description.includes(`**${cfg.maxRounds}** rounds`), description);

  const phases = embed.fields?.find((f) => f.name === 'Phases')?.value.split('\n') ?? [];
  assert.equal(phases.length, 3);
  assert.match(phases[0] as string, /Calm.*\*\*1x\*\* as hard.*every \*\*5 rounds\*\*, on 1 raider\./);
  assert.match(phases[1] as string, /Enraged\*\* \(below 50% HP\).*\*\*1\.25x\*\*.*every \*\*4 rounds\*\*, on 2 raiders/);
  assert.match(phases[2] as string, /Furious\*\* \(below 25% HP\).*\*\*1\.5x\*\*.*every \*\*3 rounds\*\*, on 3 raiders/);

  const moves = embed.fields?.find((f) => f.name === 'Moves')?.value ?? '';
  for (const name of ['Claw', 'Fire Breath', 'Tail Sweep', 'Hoard', 'Scale Shield', 'Stun', 'Disarm', 'Taunt']) assert.ok(moves.includes(`**${name}**`), name);
  assert.ok(moves.includes(`${RAID_COMBAT.moves.claw.damage} damage to one raider`));
  assert.ok(moves.includes(`${RAID_EMOJI.stunned} **Stun**`));
  assert.match(moves, /share one cooldown/);
  for (const field of embed.fields ?? []) assert.ok(field.value.length <= 1024, field.name);
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
  // A balance saved as -0 (an old $inc by -0 on a missing field) shows as 0.
  assert.equal(boldTokens(-0), '**0** <:zeiutoken:1552921364489572362>');

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
  const none = raidStatsEmbed('Ana', { healSplash: 0, guardBoost: 0, rallyBoost: 0, maxHpDamage: 0 }, 100, 'k!').toJSON();
  assert.equal(none.title, "⚔️ Ana's raid stats");
  const plain = none.description ?? '';
  assert.match(plain, /❤️ \*\*HP\*\*: 100/);
  assert.ok(plain.includes(`**Attack**: ${RAID_COMBAT.attack.min}`));
  assert.match(plain, /you take 50% of a hit$/m);
  assert.match(plain, /attacks do 1\.5x damage for 2 turns$/m);
  assert.match(plain, /No raid gear equipped.*k!gacha/);
  assert.doesNotMatch(plain, /🎒|second ally/);
  assert.equal(none.footer, undefined);

  const geared = raidStatsEmbed('Ana', { healSplash: 0.2, guardBoost: 0.25, rallyBoost: 0.25, maxHpDamage: 0.005 }, 100, 'k!').toJSON();
  const text = geared.description ?? '';
  assert.match(text, /second ally for 20% of it \(6 HP\) 🎒/);
  assert.match(text, /plus 0\.5% of the dragon's max HP per hit 🎒/);
  assert.match(text, /you take 37\.5% of a hit \(normally 50%\) 🎒/);
  assert.match(text, /attacks do 1\.63x damage for 2 turns \(normally 1\.5x\) 🎒/);
  assert.doesNotMatch(text, /No raid gear/);
  assert.match(geared.footer?.text ?? '', /changed by gear/);
});

test('fmt: a stored -0 shows as 0, not "-0"', async () => {
  const { fmt } = await import('../src/lib/format.js');
  assert.equal(fmt(-0), '0');
  assert.equal(fmt(0), '0');
  assert.equal(fmt(-5), '-5');
  assert.equal(fmt(1500), '1,500');
});

test('komaGems: a slain dragon gives every raider 5 by default, named next to the points and tokens', () => {
  const { boldGems } = TEXT_CURRENCY;
  assert.equal(DEFAULTS.raid.gemReward, 5);
  assert.ok(findSpec('raid.gemReward'), 'it can be changed with the config command');
  assert.equal(boldGems(5), `**5** ${GEM_EMOJI}`);
  assert.equal(boldGems(-0), `**0** ${GEM_EMOJI}`);

  const won = TEXT.raid.won(4, '1,000', 10, 5);
  assert.ok(won.includes(`gets **1,000** <:zeiucoin:1551675032424546320>, **10** <:zeiutoken:1552921364489572362> and **5** ${GEM_EMOJI}.`), won);
  const lobby = TEXT.raid.lobby('<@a>', 0, 15, '1,000', 10, 5);
  assert.ok(lobby.includes(`**5** ${GEM_EMOJI}`), lobby);
  // A reward set to 0 is left out rather than shown as "0".
  assert.ok(TEXT.raid.won(4, '1,000', 10, 0).endsWith('gets **1,000** <:zeiucoin:1551675032424546320> and **10** <:zeiutoken:1552921364489572362>.'));
  assert.ok(TEXT.raid.won(4, '1,000', 0, 0).endsWith('gets **1,000** <:zeiucoin:1551675032424546320>.'));
  assert.equal(TEXT.balance.gems(3), `**3** ${GEM_EMOJI}`);
});
