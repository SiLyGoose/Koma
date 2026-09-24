import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ButtonStyle } from 'discord.js';
import { DEFAULTS } from '../src/config.js';
import { HEIST, MAX_EVENT_SECONDS, MAX_HEIST_ROUNDS, MAX_VAULT_MULTIPLIER, SPLIT_STEAL, TEXT, validateConstants } from '../src/constants/index.js';
import { greedyHeist, heistJoinEmbed, heistResultEmbed, heistRoundEmbed, heistRow } from '../src/events/greedy-heist.js';
import { GAME_EVENTS, validateEvents } from '../src/events/registry.js';
import { choiceRow, joinRow, splitOrSteal, splitStealDecideEmbed, splitStealResultEmbed } from '../src/events/split-or-steal.js';
import { limitedLines } from '../src/events/vault-game.js';
import { addRoundLoot, alarmChance, roundPot, type HeistPlayer } from '../src/lib/events/heist.js';
import { choiceOf, resolveSplitSteal, type SplitStealChoice } from '../src/lib/events/split-steal.js';
import { findSpec, parseInput, validateSettings } from '../src/lib/settings-spec.js';
import { vaultCost } from '../src/services/vault.js';

/** Always gives leftover points to the first member still waiting, so splits are predictable. */
const first = () => 0;

/** The plain data of an embed, as Discord would receive it. */
const data = (embed: { toJSON(): unknown }) =>
  embed.toJSON() as { title?: string; description?: string; fields?: { name: string; value: string }[]; footer?: { text: string } };

// ---------------------------------------------------------------------------
// Greedy Heist rules
// ---------------------------------------------------------------------------

test('heist alarm: starts at alarmStart, climbs by alarmStep a round, never past 100%', () => {
  assert.equal(alarmChance(1, 0.05, 0.05), 0.05);
  assert.ok(Math.abs(alarmChance(4, 0.05, 0.05) - 0.2) < 1e-12);
  assert.equal(alarmChance(30, 0.05, 0.05), 1);
  assert.equal(alarmChance(1, 0, 0), 0);
});

test('heist pot: the rounds add up to exactly the prize, the last round taking what is left over', () => {
  for (const [prize, rounds] of [[1000, 10], [1003, 10], [7, 3], [5, 10], [0, 4]] as const) {
    let total = 0;
    for (let r = 1; r <= rounds; r++) total += roundPot(prize, rounds, r);
    assert.equal(total, prize, `${prize} over ${rounds}`);
  }
  assert.equal(roundPot(1003, 10, 1), 100);
  assert.equal(roundPot(1003, 10, 10), 103);
  assert.equal(roundPot(1000, 10, 0), 0);
  assert.equal(roundPot(1000, 10, 11), 0);
});

test('heist loot: a round is split only between the players still inside', () => {
  const players: HeistPlayer[] = [
    { userId: 'a', loot: 0, status: 'inside' },
    { userId: 'b', loot: 50, status: 'escaped' },
    { userId: 'c', loot: 0, status: 'inside' },
  ];
  assert.equal(addRoundLoot(players, 101, first), 101);
  assert.deepEqual(players.map((p) => p.loot), [51, 50, 50]);
  // The fewer inside, the bigger each share.
  (players[2] as HeistPlayer).status = 'escaped';
  addRoundLoot(players, 100, first);
  assert.equal(players[0]?.loot, 151);
  // Nobody inside: nothing handed out.
  (players[0] as HeistPlayer).status = 'caught';
  assert.equal(addRoundLoot(players, 100, first), 0);
});

// ---------------------------------------------------------------------------
// Split or Steal rules
// ---------------------------------------------------------------------------

const picks = (entries: [string, SplitStealChoice][]) => new Map(entries);

test('split or steal: everyone splitting shares the prize evenly, and no choice counts as Split', () => {
  const outcome = resolveSplitSteal(100, ['a', 'b', 'c'], picks([['a', 'split']]), first);
  assert.equal(outcome.kind, 'shared');
  assert.deepEqual(outcome.shares, [
    { userId: 'a', amount: 34 },
    { userId: 'b', amount: 33 },
    { userId: 'c', amount: 33 },
  ]);
  assert.equal(choiceOf(new Map(), 'x'), 'split');
});

test('split or steal: exactly one stealer takes the whole prize', () => {
  const outcome = resolveSplitSteal(500, ['a', 'b', 'c'], picks([['a', 'split'], ['b', 'steal']]));
  assert.equal(outcome.kind, 'stolen');
  assert.equal(outcome.kind === 'stolen' && outcome.thief, 'b');
  assert.deepEqual(outcome.shares, [{ userId: 'b', amount: 500 }]);
});

test('split or steal: two or more stealers get everyone nothing', () => {
  const outcome = resolveSplitSteal(500, ['a', 'b', 'c'], picks([['a', 'steal'], ['b', 'steal']]));
  assert.equal(outcome.kind, 'greed');
  assert.deepEqual(outcome.shares, []);
  assert.deepEqual(outcome.kind === 'greed' && outcome.stealers, ['a', 'b']);
});

// ---------------------------------------------------------------------------
// The vault's side
// ---------------------------------------------------------------------------

test('vaultCost: paying out part of the prize takes the same share of the pool', () => {
  assert.equal(vaultCost(100, 1000, 1000), 100, 'the whole prize empties the snapshot');
  assert.equal(vaultCost(100, 1000, 250), 25);
  assert.equal(vaultCost(100, 1000, 0), 0);
  assert.equal(vaultCost(100, 1000, 5000), 100, 'never more than the snapshot');
  assert.equal(vaultCost(0, 0, 10), 0);
});

// ---------------------------------------------------------------------------
// Registry, settings and constants
// ---------------------------------------------------------------------------

test('events: the heist and split or steal are in the list, and the vault breaker is gone', () => {
  validateEvents();
  assert.ok(GAME_EVENTS.includes(greedyHeist));
  assert.ok(GAME_EVENTS.includes(splitOrSteal));
  assert.equal(GAME_EVENTS.some((event) => event.id === 'vault'), false);
  assert.equal(greedyHeist.id, 'heist');
  assert.equal(splitOrSteal.id, 'split-steal');
});

test('vault game settings: defaults are valid, every one has a spec in the Events group, and the old ones are gone', () => {
  assert.deepEqual(validateSettings(structuredClone(DEFAULTS)), []);
  for (const key of [
    'events.vault.multiplier',
    'events.heist.joinSeconds',
    'events.heist.rounds',
    'events.heist.roundSeconds',
    'events.heist.alarmStart',
    'events.heist.alarmStep',
    'events.heist.fine',
    'events.splitSteal.minPlayers',
    'events.splitSteal.joinSeconds',
    'events.splitSteal.decideSeconds',
  ]) {
    const spec = findSpec(key);
    assert.ok(spec, key);
    assert.equal(spec.group, 'Events', key);
  }
  for (const key of ['events.vault.minPlayers', 'events.vault.joinSeconds', 'events.vault.fine', 'events.vault.baseChance']) {
    assert.equal(findSpec(key), undefined, key);
  }
});

test('vault game settings: held to their limits', () => {
  const rounds = findSpec('events.heist.rounds');
  assert.ok(rounds);
  assert.equal(parseInput(rounds, '0').ok, false);
  assert.equal(parseInput(rounds, String(MAX_HEIST_ROUNDS + 1)).ok, false);
  const alarm = findSpec('events.heist.alarmStart');
  assert.ok(alarm);
  assert.deepEqual(parseInput(alarm, '5%'), { ok: true, value: 0.05 });
  assert.equal(parseInput(alarm, '101%').ok, false);
  const minPlayers = findSpec('events.splitSteal.minPlayers');
  assert.ok(minPlayers);
  assert.equal(parseInput(minPlayers, '1').ok, false, 'split or steal needs at least 2');
  const join = findSpec('events.splitSteal.joinSeconds');
  assert.ok(join);
  assert.equal(parseInput(join, String(MAX_EVENT_SECONDS + 1)).ok, false);
  const multiplier = findSpec('events.vault.multiplier');
  assert.ok(multiplier);
  assert.equal(parseInput(multiplier, String(MAX_VAULT_MULTIPLIER + 1)).ok, false);
});

test('vault game constants pass the startup check, and every button id is different', () => {
  validateConstants();
  const ids = [HEIST.joinId, HEIST.escapeId, SPLIT_STEAL.joinId, SPLIT_STEAL.splitId, SPLIT_STEAL.stealId];
  assert.equal(new Set(ids).size, ids.length);
});

// ---------------------------------------------------------------------------
// What they look like
// ---------------------------------------------------------------------------

test('heist screens: join, live rounds and the result', () => {
  const join = data(heistJoinEmbed(5000, 10, 50, 1_700_000_000, 0));
  assert.equal(join.title, TEXT.heist.title);
  assert.match(join.description ?? '', /5,000/);
  assert.match(join.description ?? '', /<t:1700000000:R>/);
  assert.equal(join.fields?.[0]?.value, TEXT.heist.crewNobody);

  const players: HeistPlayer[] = [
    { userId: '1', loot: 300, status: 'inside' },
    { userId: '2', loot: 100, status: 'escaped' },
  ];
  const live = data(heistRoundEmbed(3, 10, 4000, 0.2, players));
  assert.equal(live.title, TEXT.heist.roundTitle(3, 10));
  assert.match(live.description ?? '', /20%/);
  assert.deepEqual(live.fields?.map((f) => f.name), [TEXT.heist.insideField, TEXT.heist.escapedField]);

  (players[0] as HeistPlayer).status = 'caught';
  const result = data(heistResultEmbed({ kind: 'alarm', round: 4 }, players, [{ userId: '1', amount: 50 }], 50, 100, 0));
  assert.equal(result.title, TEXT.heist.alarmTitle);
  assert.deepEqual(result.fields?.map((f) => f.name), [TEXT.heist.escapedField, TEXT.heist.caughtField]);
  assert.match(result.fields?.[1]?.value ?? '', /<@1> paid \*\*50\*\*/);

  const row = heistRow(HEIST.escapeId, TEXT.heist.escapeButton, ButtonStyle.Danger).toJSON().components;
  assert.equal((row[0] as { custom_id: string }).custom_id, HEIST.escapeId);
});

test('split or steal screens: choosing never shows who picked what, the result reveals it', () => {
  const decide = data(splitStealDecideEmbed(1000, 1_700_000_000, ['1', '2'], 1));
  assert.equal(decide.footer?.text, TEXT.splitSteal.chosenCount(1, 2));
  assert.equal(decide.fields?.[0]?.value, '<@1>\n<@2>', 'just the players, never their choices');

  const choices = picks([['1', 'steal']]);
  const outcome = resolveSplitSteal(1000, ['1', '2'], choices);
  const result = data(splitStealResultEmbed(1000, ['1', '2'], choices, outcome, outcome.shares, 0));
  assert.equal(result.title, TEXT.splitSteal.stolenTitle);
  const lines = result.fields?.[0]?.value ?? '';
  assert.match(lines, /<@1>: \*\*Steal\*\* \+\*\*1,000\*\*/);
  assert.match(lines, /<@2>: \*\*Split \(no choice\)\*\*/);

  const ids = choiceRow().toJSON().components.map((c) => (c as { custom_id: string }).custom_id);
  assert.deepEqual(ids, [SPLIT_STEAL.splitId, SPLIT_STEAL.stealId]);
  assert.equal((joinRow().toJSON().components[0] as { custom_id: string }).custom_id, SPLIT_STEAL.joinId);
});

test('limitedLines: names the first few, then says how many more', () => {
  assert.equal(limitedLines([], 2, (n) => `+${n}`, 'none'), 'none');
  assert.equal(limitedLines(['a', 'b', 'c'], 2, (n) => `+${n}`, 'none'), 'a\nb\n+1');
});
