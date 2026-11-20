import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DEFAULTS } from '../src/config.js';
import { CODE, HEIST, LASER, MAX_LASER_ROUNDS, MAX_POTATO_BLASTS, POTATO, SPLIT_STEAL, TEXT, validateConstants } from '../src/constants/index.js';
import { hotPotato, potatoBlastEmbed, potatoLiveEmbed, potatoResultEmbed } from '../src/events/games/hot-potato.js';
import { laserGrid, laserJoinEmbed, laserResultEmbed, laserRow } from '../src/events/games/laser-grid.js';
import { GAME_EVENTS, validateEvents } from '../src/events/registry.js';
import { ClickGate } from '../src/lib/events/clicks.js';
import { decoyCount, judgePress, laserWindowMs, parseSlotId, rankedSplit, rankWinners, recordDuck, rollDecoys, settleRound, slotId, type DuckResult, type LaserPlayer } from '../src/lib/events/laser.js';
import { addMove, blowUp, playersIn, potatoBlasts, pressPass, rollFuseMs, servePotato, type PotatoState } from '../src/lib/events/potato.js';
import { checkConstraints, findSpec, parseInput, validateSettings } from '../src/lib/settings-spec.js';

const first = () => 0;

const data = (embed: { toJSON(): unknown }) =>
  embed.toJSON() as { title?: string; description?: string; fields?: { name: string; value: string }[]; footer?: { text: string } };

// ---------------------------------------------------------------------------
// The click gate
// ---------------------------------------------------------------------------

test('click gate: a player counts at most once per gap, ignored presses do not push the next one back, players are separate', () => {
  const gate = new ClickGate(500);
  assert.equal(gate.admit('a', 1_000), true);
  assert.equal(gate.admit('a', 1_100), false, 'a double click counts once');
  assert.equal(gate.admit('a', 1_499), false);
  assert.equal(gate.admit('a', 1_500), true, '500ms after the last press that counted');
  assert.equal(gate.admit('b', 1_501), true, 'another player is not held back');
  // Mashing every 100ms counts every 500ms, no more.
  const mash = new ClickGate(500);
  let counted = 0;
  for (let t = 0; t < 3_000; t += 100) if (mash.admit('m', t)) counted++;
  assert.equal(counted, 6);
});

// ---------------------------------------------------------------------------
// Hot Potato rules
// ---------------------------------------------------------------------------

const potatoState = (ids: string[], holder: string | null = null): PotatoState => ({
  players: ids.map((userId) => ({ userId, out: false, blastedBy: 0, passes: 0 })),
  holder,
});

test('potato blasts: the setting, but always leaving someone standing', () => {
  assert.equal(potatoBlasts(3, 10), 3);
  assert.equal(potatoBlasts(3, 3), 2);
  assert.equal(potatoBlasts(3, 2), 1);
  assert.equal(potatoBlasts(3, 1), 0);
});

test('potato fuse: a random time between the two settings, in milliseconds', () => {
  assert.equal(rollFuseMs(10, 25, (min) => min), 10_000);
  assert.equal(rollFuseMs(10, 25, (_min, max) => max), 25_000);
  assert.equal(rollFuseMs(25, 10, (min) => min), 10_000, 'the wrong way round still works');
});

test('potato pass: the holder tosses it to someone else still in, and it counts their passes', () => {
  const state = potatoState(['a', 'b', 'c'], 'a');
  (state.players[1] as { out: boolean }).out = true;
  assert.deepEqual(pressPass(state, 'a', first), { kind: 'passed', to: 'c' }, 'never to themselves, never to someone out');
  assert.equal(state.holder, 'c');
  assert.equal(state.players[0]?.passes, 1);
});

test('potato pass to someone picked: the holder tosses it to them, if they are still in and not themselves, else at random', () => {
  const state = potatoState(['a', 'b', 'c', 'd'], 'a');
  assert.deepEqual(pressPass(state, 'a', first, 'c'), { kind: 'passed', to: 'c' }, 'to the one picked, not the first');
  assert.equal(state.players[0]?.passes, 1);
  (state.players[3] as { out: boolean }).out = true;
  assert.deepEqual(pressPass(state, 'c', first, 'd'), { kind: 'passed', to: 'a' }, 'picked one is out: at random');
  assert.deepEqual(pressPass(state, 'a', first, 'a'), { kind: 'passed', to: 'b' }, 'picked themselves: at random');
  assert.deepEqual(pressPass(state, 'a', first, 'nobody'), { kind: 'grabbed', from: 'b' }, 'not the holder: a grab, whoever they picked');
  assert.equal(state.holder, 'a');
});

test('potato trail: a move goes on the end, and only the last few are kept', () => {
  const trail: number[] = [];
  for (let i = 1; i <= 5; i++) addMove(trail, i, 3);
  assert.deepEqual(trail, [3, 4, 5]);
});

test('potato pass: pressing when it is not yours grabs it; out, not playing and between potatoes do nothing', () => {
  const state = potatoState(['a', 'b', 'c'], 'a');
  assert.deepEqual(pressPass(state, 'b'), { kind: 'grabbed', from: 'a' });
  assert.equal(state.holder, 'b');
  assert.equal(state.players[1]?.passes, 0, 'a grab is not a pass');
  assert.deepEqual(pressPass(state, 'z'), { kind: 'notPlaying' });
  (state.players[2] as { out: boolean }).out = true;
  assert.deepEqual(pressPass(state, 'c'), { kind: 'out' });
  assert.equal(state.holder, 'b');
  state.holder = null;
  assert.deepEqual(pressPass(state, 'a'), { kind: 'noPotato' });
});

test('potato blast: the holder is out, and the next potato only goes to someone still in', () => {
  const state = potatoState(['a', 'b', 'c'], 'b');
  assert.equal(blowUp(state, 1), 'b');
  assert.equal(state.holder, null);
  assert.deepEqual(state.players[1], { userId: 'b', out: true, blastedBy: 1, passes: 0 });
  assert.deepEqual(playersIn(state).map((p) => p.userId), ['a', 'c']);
  assert.equal(servePotato(state, (n) => n - 1), 'c');
  assert.equal(blowUp(potatoState(['a']), 1), null, 'nobody holding it');
});

// ---------------------------------------------------------------------------
// Laser Grid rules
// ---------------------------------------------------------------------------

test('laser window: the first round gets windowSeconds, shrinking evenly to minWindowSeconds in the last', () => {
  assert.equal(laserWindowMs(1, 8, 3, 1.25), 3_000);
  assert.equal(laserWindowMs(8, 8, 3, 1.25), 1_250);
  assert.equal(laserWindowMs(5, 9, 3, 1), 2_000, 'half way');
  assert.equal(laserWindowMs(1, 1, 3, 1), 3_000, 'one round: the first round');
});

test('laser buttons: the id says the round, the phase and the slot, and anything else is not one', () => {
  assert.deepEqual(parseSlotId(slotId(4, 'go', 2)), { round: 4, phase: 'go', slot: 2 });
  assert.deepEqual(parseSlotId(slotId(12, 'wait', 0)), { round: 12, phase: 'wait', slot: 0 });
  assert.equal(parseSlotId(LASER.joinId), null);
  assert.equal(parseSlotId(`${LASER.slotPrefix}:1:fire:2`), null);
});

test('laser press: before it fires is early, a laser is wrong, Duck! is fine until the deadline', () => {
  assert.equal(judgePress('wait', 2, 2, 1_000, 5_000), 'early', 'even the slot Duck! will be in');
  assert.equal(judgePress('go', 1, 2, 1_000, 5_000), 'wrong');
  assert.equal(judgePress('go', 2, 2, 5_000, 5_000), 'ducked');
  assert.equal(judgePress('go', 2, 2, 5_001, 5_000), 'late');
  assert.equal(judgePress('go', 2, 2, 1_000, Number.POSITIVE_INFINITY), 'ducked', 'never late before the laser is on screen');
});

test('fake ducks: never on Duck!, always leaving a laser, each with a word that is not Duck!', () => {
  for (let duck = 0; duck < 5; duck++) {
    for (let count = 0; count <= 6; count++) {
      const decoys = rollDecoys(5, duck, count, TEXT.laser.decoyLabels);
      assert.equal(decoys.size, Math.min(count, 3), 'at most the slots less Duck! and one laser');
      assert.ok(!decoys.has(duck));
      for (const label of decoys.values()) assert.doesNotMatch(label, /duck/i);
    }
  }
  assert.deepEqual([...rollDecoys(5, 0, 2, ['A', 'B'], () => 0)], [[1, 'A'], [2, 'A']]);
  assert.equal(rollDecoys(5, 0, 2, []).size, 0, 'no words, no fake ducks');
  assert.ok(TEXT.laser.decoyLabels.every((label) => !/duck/i.test(label)));
});

test('fake ducks: none in the first round, then from 0 to LASER.maxDecoys', () => {
  assert.equal(decoyCount(1, 2, (_min, max) => max), 0);
  assert.equal(decoyCount(2, 2, (_min, max) => max), 2);
  assert.equal(decoyCount(5, 0, (_min, max) => max), 0);
  assert.ok(LASER.maxDecoys <= LASER.slots - 2);
});

test('laser press: a press after the first in a round changes nothing, and says what the first was', () => {
  assert.match(TEXT.laser.alreadyPressed(TEXT.laser.firstDucked('0.42s')), /already pressed this round \(ducked in 0\.42s\), and it can't be changed/);
  assert.match(TEXT.laser.alreadyPressed(TEXT.laser.early), /\(too early\)/);
});

test('fake ducks are pressing a wrong button', () => {
  // A fake duck is just another slot that isn't Duck!.
  assert.equal(judgePress('go', 3, 1, 1_000, 5_000), 'wrong');
});

const laserPlayers = (ids: string[]): LaserPlayer[] => ids.map((userId) => ({ userId, caughtRound: 0, caughtFor: null, bestMs: null, totalMs: 0 }));

test('laser winners: the least time ducking in all is first, then the fastest single duck, then by id', () => {
  const players = laserPlayers(['a', 'b', 'c', 'd']);
  const [a, b, c, d] = players as [LaserPlayer, LaserPlayer, LaserPlayer, LaserPlayer];
  for (const ms of [500, 700]) recordDuck(a, ms);
  for (const ms of [400, 900]) recordDuck(b, ms);
  for (const ms of [600, 600]) recordDuck(c, ms);
  d.caughtFor = 'late';
  assert.deepEqual([a.bestMs, a.totalMs], [500, 1200]);
  // a and c both took 1.2s in all, and a's best (0.5s) beats c's (0.6s); b took 1.3s.
  assert.deepEqual(rankWinners(players).map((p) => p.userId), ['a', 'c', 'b'], 'never the caught');
});

test('laser shares: first place the most, each after a little less, adding up to exactly the prize', () => {
  assert.deepEqual(rankedSplit(600, ['a', 'b', 'c']).map((s) => s.amount), [300, 200, 100], 'a half, a third, a sixth');
  assert.deepEqual(rankedSplit(1000, ['a', 'b']).map((s) => s.amount), [667, 333]);
  assert.deepEqual(rankedSplit(1000, ['a']), [{ userId: 'a', amount: 1000 }]);
  assert.deepEqual(rankedSplit(0, ['a', 'b']).map((s) => s.amount), [0, 0]);
  assert.deepEqual(rankedSplit(500, []), []);
  for (const [prize, n] of [[1001, 4], [7, 5], [123_457, 9], [2, 6]] as const) {
    const amounts = rankedSplit(prize, Array.from({ length: n }, (_, i) => String(i))).map((s) => s.amount);
    assert.equal(amounts.reduce((sum, x) => sum + x, 0), prize, ` over `);
    for (let i = 1; i < n; i++) assert.ok((amounts[i - 1] as number) >= (amounts[i] as number), `in order: `);
  }
});

test('laser round: everyone still in who did not duck is caught, not pressing counting as too slow', () => {
  const players = laserPlayers(['a', 'b', 'c', 'd']);
  (players[3] as LaserPlayer).caughtFor = 'early';
  (players[3] as LaserPlayer).caughtRound = 1;
  const results = new Map<string, DuckResult>([['a', 'ducked'], ['b', 'wrong']]);
  const caught = settleRound(players, results, 2);
  assert.deepEqual(caught.map((p) => [p.userId, p.caughtFor, p.caughtRound]), [['b', 'wrong', 2], ['c', 'late', 2]]);
  assert.equal(players[3]?.caughtRound, 1, 'someone already out stays as they were');
  assert.equal(players[0]?.caughtFor, null);
});

// ---------------------------------------------------------------------------
// Registry, settings and constants
// ---------------------------------------------------------------------------

test('events: hot potato and laser grid are in the list', () => {
  validateEvents();
  assert.ok(GAME_EVENTS.includes(hotPotato));
  assert.ok(GAME_EVENTS.includes(laserGrid));
  assert.equal(hotPotato.id, 'potato');
  assert.equal(laserGrid.id, 'laser');
});

test('potato and laser settings: defaults are valid, each has an Events spec, held to their limits and to each other', () => {
  assert.deepEqual(validateSettings(structuredClone(DEFAULTS)), []);
  for (const key of [
    'events.potato.joinSeconds',
    'events.potato.blasts',
    'events.potato.minFuseSeconds',
    'events.potato.maxFuseSeconds',
    'events.laser.joinSeconds',
    'events.laser.rounds',
    'events.laser.windowSeconds',
    'events.laser.minWindowSeconds',
    'events.laser.bonusPerPlayer',
  ]) {
    assert.equal(findSpec(key)?.group, 'Events', key);
  }
  const blasts = findSpec('events.potato.blasts');
  assert.ok(blasts);
  assert.equal(parseInput(blasts, String(MAX_POTATO_BLASTS + 1)).ok, false);
  const rounds = findSpec('events.laser.rounds');
  assert.ok(rounds);
  assert.equal(parseInput(rounds, String(MAX_LASER_ROUNDS + 1)).ok, false);
  const window = findSpec('events.laser.windowSeconds');
  assert.ok(window);
  assert.deepEqual(parseInput(window, '2.5'), { ok: true, value: 2.5 });
  assert.equal(parseInput(window, '0.1').ok, false);

  const fuses = structuredClone(DEFAULTS);
  fuses.events.potato.minFuseSeconds = 30;
  fuses.events.potato.maxFuseSeconds = 20;
  assert.match(checkConstraints(fuses) ?? '', /minFuseSeconds/);
  const windows = structuredClone(DEFAULTS);
  windows.events.laser.minWindowSeconds = 4;
  windows.events.laser.windowSeconds = 3;
  assert.match(checkConstraints(windows) ?? '', /minWindowSeconds/);
});

test('potato and laser constants pass the startup check, and no button id is shared with another game', () => {
  validateConstants();
  const ids = [
    POTATO.joinId,
    POTATO.passId,
    LASER.joinId,
    HEIST.joinId,
    HEIST.escapeId,
    SPLIT_STEAL.joinId,
    SPLIT_STEAL.splitId,
    SPLIT_STEAL.stealId,
    CODE.guessId,
    CODE.mineId,
  ];
  assert.equal(new Set(ids).size, ids.length);
  for (const id of ids) assert.equal(parseSlotId(id), null, `${id} is not mistaken for a laser slot`);
});

// ---------------------------------------------------------------------------
// What they look like
// ---------------------------------------------------------------------------

test('potato screens: who has it, a blast, and the result', () => {
  const state = potatoState(['1', '2', '3'], '2');
  const live = data(potatoLiveEmbed(1, 2, 900, state));
  assert.equal(live.title, TEXT.potato.liveTitle(1, 2));
  assert.match(live.description ?? '', /<@2> has the potato/);
  assert.deepEqual(live.fields?.map((f) => f.name), [TEXT.potato.inField]);

  blowUp(state, 1);
  const blast = data(potatoBlastEmbed(1, 2, '2', 50, true, state));
  assert.equal(blast.title, TEXT.potato.blastTitle(1, 2));
  assert.match(blast.description ?? '', /<@2> was holding it/);
  assert.deepEqual(blast.fields?.map((f) => f.name), [TEXT.potato.inField, TEXT.potato.outField]);

  const paid = [{ userId: '1', amount: 450 }, { userId: '3', amount: 450 }];
  const result = data(potatoResultEmbed(900, state, paid, [{ userId: '2', amount: 50 }], 0));
  assert.match(result.description ?? '', /\*\*2\*\* players are still standing/);
  assert.match(result.fields?.[0]?.value ?? '', /<@1> \+\*\*450\*\*/);
  assert.match(result.fields?.[1]?.value ?? '', /<@2> paid \*\*50\*\*.* \(potato 1\)/);
});

test('laser join: the prize shown counts every player so far, and says what each one more adds', () => {
  assert.equal(DEFAULTS.events.laser.bonusPerPlayer, 5_000);
  const join = data(laserJoinEmbed(31_000, 10_000, 8, 3, 1.25, 50, 1_700_000_000, 3));
  assert.match(join.description ?? '', /\*\*31,000\*\*.* goes to whoever makes it through, \*\*10,000\*\*.* more for every player who joins/);
  const off = data(laserJoinEmbed(1_000, 0, 8, 3, 1.25, 50, 1_700_000_000, 0));
  assert.doesNotMatch(off.description ?? '', /for every player who joins/, 'no bonus, no mention of one');
});

test('laser screens: before the laser every button looks alike, after it one says Duck!; the result names the caught', () => {
  const wait = laserRow(3, 'wait', 1).toJSON().components as { custom_id: string; label: string }[];
  assert.equal(wait.length, LASER.slots);
  assert.equal(new Set(wait.map((b) => b.label)).size, 1, 'nothing gives Duck! away before it fires');
  assert.deepEqual(parseSlotId(wait[1]?.custom_id ?? ''), { round: 3, phase: 'wait', slot: 1 });
  const go = laserRow(3, 'go', 1).toJSON().components as { custom_id: string; label: string }[];
  assert.deepEqual(go.map((b) => b.label === TEXT.laser.duckButton), [false, true, false, false, false]);
  const faked = laserRow(3, 'go', 1, false, new Map([[3, 'Dock!']])).toJSON().components as { label: string; style: number }[];
  assert.deepEqual(faked.map((b) => b.label), [TEXT.laser.laserButton, TEXT.laser.duckButton, TEXT.laser.laserButton, 'Dock!', TEXT.laser.laserButton]);
  assert.equal(faked[3]?.style, faked[1]?.style, 'a fake duck is as green as Duck!');

  const players = laserPlayers(['1', '2']);
  recordDuck(players[0] as LaserPlayer, 420);
  settleRound(players, new Map([['1', 'ducked']]), 1);
  const result = data(laserResultEmbed(1000, 8, players, [{ userId: '1', amount: 1000 }], [{ userId: '2', amount: 50 }], 0));
  assert.equal(result.title, TEXT.laser.clearTitle);
  assert.match(result.fields?.[0]?.value ?? '', /\*\*1\.\*\* <@1> \+\*\*1,000\*\*.* \(0\.42s in all\)/);
  assert.match(result.fields?.[1]?.value ?? '', /<@2> paid \*\*50\*\*.*: too slow \(round 1\)/);

  settleRound(players, new Map(), 2);
  const none = data(laserResultEmbed(1000, 2, players, [], [], 0));
  assert.equal(none.title, TEXT.laser.allCaughtTitle);
  assert.match(none.description ?? '', /round \*\*2\*\*/);
});
