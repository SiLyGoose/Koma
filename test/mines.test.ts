import assert from 'node:assert/strict';
import { test } from 'node:test';
import { CONFIG, DEFAULTS } from '../src/config.js';
import { MINE_MINES, MINE_TILES, TEXT, validateConstants } from '../src/constants/index.js';
import { expectedReturn, houseEdge, multiplierFor, payoutFor, pick, randomHidden, startRun, validMines, type MineRules, type MineRun } from '../src/lib/game/mines.js';
import { checkConstraints, findSpec, SPECS, validateSettings } from '../src/lib/settings-spec.js';
import { siteGameLink } from '../src/web/config.js';
import { commandMap } from '../src/commands/index.js';

/** The rules the maths is checked with: the default edges, with a 100x cap (whatever the default cap is). */
const RULES: MineRules = { ...DEFAULTS.mines, maxMultiplier: 100 };

/** A round with mines exactly at `at`. */
function runWith(at: readonly number[]): MineRun {
  const mine = Array.from({ length: MINE_TILES }, (_, i) => at.includes(i));
  return { mines: at.length, mine, revealed: mine.map(() => false), gems: 0, multiplier: 1, status: 'playing' };
}

// ---------------------------------------------------------------------------
// The board

test('mines: a round hides as many mines as asked on the 5x5 board, anywhere, face down', () => {
  assert.equal(MINE_TILES, 25);
  for (const mines of [1, 3, 12, 24]) {
    const run = startRun(mines);
    assert.equal(run.mine.filter(Boolean).length, mines);
    assert.ok(run.revealed.every((shown) => !shown));
    assert.deepEqual({ gems: run.gems, multiplier: run.multiplier, status: run.status }, { gems: 0, multiplier: 1, status: 'playing' });
  }
  // With the dice choosing, the mines land where the shuffle puts them.
  assert.deepEqual(startRun(2, (min) => min).mine.flatMap((m, i) => (m ? [i] : [])), [0, 1]);
  assert.deepEqual(startRun(1, (_, max) => max).mine.flatMap((m, i) => (m ? [i] : [])), [24]);
  for (const bad of [0, 25, 2.5, -1]) assert.throws(() => startRun(bad));
  assert.ok(validMines(1) && validMines(24) && !validMines(0) && !validMines(25));
});

test('mines: a gem raises the multiplier, a mine ends the round, and a tile turned over is not turned over again', () => {
  const run = runWith([4]);
  assert.deepEqual(pick(run, 0, RULES), { kind: 'gem', multiplier: multiplierFor(RULES, 1, 1), done: null });
  assert.deepEqual(pick(run, 0, RULES), { kind: 'taken' });
  assert.deepEqual(pick(run, 25, RULES), { kind: 'taken' });
  assert.equal(run.gems, 1);
  assert.deepEqual(pick(run, 4, RULES), { kind: 'boom' });
  assert.equal(run.status, 'boom');
  assert.throws(() => pick(run, 5, RULES));
});

test('mines: turning over every gem ends the round by itself', () => {
  const run = runWith(Array.from({ length: 24 }, (_, i) => i + 1));
  const result = pick(run, 0, RULES);
  assert.deepEqual(result, { kind: 'gem', multiplier: 24.75, done: 'cleared' });
  assert.equal(run.status, 'done');
});

test('mines: the round stops by itself at the cap', () => {
  const run = runWith(Array.from({ length: 12 }, (_, i) => i));
  let result = pick(run, 12, RULES);
  for (let i = 13; result.kind === 'gem' && !result.done; i++) result = pick(run, i, RULES);
  assert.deepEqual(result, { kind: 'gem', multiplier: 100, done: 'capped' });
  assert.equal(run.status, 'done');
  assert.equal(run.multiplier, RULES.maxMultiplier);
});

test('mines: a random pick is a tile still face down', () => {
  const run = runWith([0]);
  for (let i = 1; i < 25; i++) run.revealed[i] = true;
  assert.equal(randomHidden(run), 0);
  run.revealed[0] = true;
  assert.equal(randomHidden(run), null);
});

// ---------------------------------------------------------------------------
// The multipliers

test('mines: the house edge is 2.5% with 1 mine, sliding evenly to 1% (like Stake) with 24', () => {
  assert.equal(houseEdge(RULES, 1), 0.025);
  assert.ok(Math.abs(houseEdge(RULES, 24) - 0.01) < 1e-12);
  assert.ok(Math.abs(houseEdge(RULES, 12.5) - 0.0175) < 1e-12);
  for (let m = 2; m <= 24; m++) assert.ok(houseEdge(RULES, m) < houseEdge(RULES, m - 1));
});

test('mines: each gem pays the true odds of getting there, less the edge, rounded down to the hundredth', () => {
  assert.equal(multiplierFor(RULES, 3, 0), 1);
  assert.equal(multiplierFor(RULES, 1, 1), 1.01); // 25/24 less 2.5%
  assert.equal(multiplierFor(RULES, 24, 1), 24.75); // 25/1 less 1%, what Stake pays
  assert.equal(multiplierFor(RULES, 3, 1), 1.1);
  assert.equal(multiplierFor(RULES, 3, 2), 1.26);
  // More gems, or more mines, always pay more (until the cap).
  for (let m = 1; m <= 24; m++) {
    for (let g = 2; g <= 25 - m; g++) assert.ok(multiplierFor(RULES, m, g) >= multiplierFor(RULES, m, g - 1), `${m} mines, ${g} gems`);
  }
  assert.ok(multiplierFor(RULES, 5, 2) > multiplierFor(RULES, 3, 2));
  assert.equal(multiplierFor(RULES, 12, 13), 100);
  assert.equal(multiplierFor({ ...RULES, maxMultiplier: 10_000 }, 12, 13) > 100, true);
});

test('mines: however far a player goes, a round pays back about 1 less the edge, never more', () => {
  for (const mines of [1, 3, 10, 24]) {
    for (let gems = 1; gems <= 25 - mines; gems++) {
      const back = expectedReturn(RULES, mines, gems);
      assert.ok(back <= 1 - houseEdge(RULES, mines) + 1e-9, `${mines} mines, ${gems} gems: ${back}`);
      // Rounding down and the cap only ever take a little more.
      if (multiplierFor(RULES, mines, gems) < RULES.maxMultiplier) assert.ok(back > 1 - houseEdge(RULES, mines) - 0.01, `${mines} mines, ${gems} gems: ${back}`);
    }
  }
  assert.equal(payoutFor(100, 1.01), 101);
});

// ---------------------------------------------------------------------------
// Settings, constants and text

test('mines: the settings exist, are in their own group, and start at the tuned values', () => {
  assert.deepEqual(DEFAULTS.mines, { minBet: 10, maxBet: 1000, edgeFewest: 0.025, edgeMost: 0.01, maxMultiplier: 24 });
  assert.deepEqual(CONFIG.mines, DEFAULTS.mines);
  const keys = SPECS.filter((s) => s.key.startsWith('mines.')).map((s) => s.key);
  assert.deepEqual(keys, ['mines.minBet', 'mines.maxBet', 'mines.edgeFewest', 'mines.edgeMost', 'mines.maxMultiplier']);
  for (const key of keys) assert.equal(findSpec(key)?.group, 'Mines');
  assert.deepEqual(validateSettings(structuredClone(DEFAULTS)), []);
});

test('mines: a bet range upside down is refused', () => {
  const settings = structuredClone(DEFAULTS);
  settings.mines.minBet = 2000;
  assert.match(checkConstraints(settings) ?? '', /mines\.minBet/);
  settings.mines.minBet = 10;
  assert.equal(checkConstraints(settings), null);
});

test('mines: the constants pass the startup check', () => {
  assert.doesNotThrow(() => validateConstants());
  assert.deepEqual(MINE_MINES, { min: 1, max: 24, start: 3 });
});

test('mines: the text reads right', () => {
  assert.match(TEXT.mines.intro(1, 24, '24x'), /1 to 24.*\*\*24x\*\*/);
});

test('mines: the button in Discord is the same link for everyone: the site, opening Mines in that server', () => {
  const config = { siteUrl: 'https://site', origin: 'https://site', apiUrl: 'https://bot', socketUrl: 'wss://bot', port: 0, clientSecret: null };
  assert.equal(siteGameLink(config, 'mines', '123'), 'https://site/?play=mines&guild=123');
  assert.equal(siteGameLink(config, 'pinecraft', '123'), 'https://site/?play=pinecraft&guild=123');
});

test('mines: the command is `mines`, and `mine` is not a command', () => {
  assert.equal(commandMap.get('mines')?.name, 'mines');
  assert.equal(commandMap.get('mine'), undefined);
});
