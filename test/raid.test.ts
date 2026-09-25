import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DRAGON_SIZE, renderDragon, type DragonMood } from '../src/animations/images/dragon-image.js';
import { eventText, fightEmbed, hpBar, intentText, moodOf, resultEmbed } from '../src/commands/raid.js';
import { DEFAULTS } from '../src/config.js';
import { RAID_COMBAT, validateConstants } from '../src/constants/index.js';
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
  assert.deepEqual(events.find((e) => e.kind === 'rally'), { kind: 'rally', userId: 'a', turns: rallyTurns });
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
    { kind: 'rally', userId: 'c', turns: RAID_COMBAT.support.rallyTurns },
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
  assert.equal(moodOf(state), 'enraged');

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

test('the dragon draws in every mood, at its size, and each mood looks different', () => {
  const seen = new Set<string>();
  for (const mood of ['calm', 'enraged', 'shielded', 'defeated'] as DragonMood[]) {
    const png = readPng(renderDragon(mood));
    assert.equal(png.width, DRAGON_SIZE.width);
    assert.equal(png.height, DRAGON_SIZE.height);
    seen.add(Buffer.from(png.pixels).toString('base64'));
  }
  assert.equal(seen.size, 4);
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

  // The tokens left are always shown under the points, even at 0.
  assert.match(balanceText({ balance: 1200, tokens: 3 }), /1,200.*\n\*\*3\*\* <:zeiutoken:1552921364489572362>$/);
  assert.match(balanceText({ balance: 1200, tokens: 0 }), /\n\*\*0\*\* <:zeiutoken:1552921364489572362>$/);
  // No token name anywhere, only the emoji.
  assert.doesNotMatch(boldTokens(2) + spentText({ cost: 0, baseCost: 0, tokensUsed: 2 }) + balanceText({ balance: 0, tokens: 2 }), /komaToken/i);
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
