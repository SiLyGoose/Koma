import assert from 'node:assert/strict';
import { test } from 'node:test';
import { MINE_BET_IDS } from '../src/commands/mine.js';
import { PLINKO_BET_IDS } from '../src/commands/plinko.js';
import { CONFIG, DEFAULTS } from '../src/config.js';
import { MAX_MINE_DYNAMITE, MINE_ORES, MINE_SIZE, TEXT, validateConstants } from '../src/constants/index.js';
import {
  allReachable,
  CENTER,
  dynamiteOn,
  expectedReturn,
  layField,
  payoutFor,
  rollOre,
  startRun,
  step,
  stepFrom,
  TILE_COUNT,
  type MineRules,
  type MineRun,
  type MineTile,
} from '../src/lib/game/mine.js';
import { renderMine } from '../src/animations/images/mine-image.js';
import { pngSize } from './helpers/png.js';
import { checkConstraints, findSpec, SPECS, validateSettings } from '../src/lib/settings-spec.js';

const RULES: MineRules = DEFAULTS.mine;
const rock = (): MineTile => ({ kind: 'rock' });

/** A run on a hand-made field: everything rock except `tiles`, the miner in the middle. */
function runWith(tiles: Record<number, MineTile>, oresLeft: number, multiplier = 1): MineRun {
  const all = Array.from({ length: TILE_COUNT }, (_, i) => tiles[i] ?? rock());
  return { tiles: all, dug: all.map((_, i) => i === CENTER), pos: CENTER, field: 1, multiplier, oresLeft, status: 'digging' };
}

const count = (tiles: readonly MineTile[], kind: MineTile['kind']): number => tiles.filter((t) => t.kind === kind).length;

// ---------------------------------------------------------------------------
// The field

test('mine: the field is 5x5 and the miner starts in the middle, on a tile already dug', () => {
  assert.equal(MINE_SIZE, 5);
  assert.equal(TILE_COUNT, 25);
  assert.equal(CENTER, 12);
  const run = startRun(RULES);
  assert.equal(run.pos, CENTER);
  assert.equal(run.field, 1);
  assert.equal(run.multiplier, 1);
  assert.equal(run.status, 'digging');
  assert.deepEqual(run.dug.map((d, i) => (d ? i : -1)).filter((i) => i >= 0), [CENTER]);
  assert.equal(run.tiles[CENTER]?.kind, 'rock');
  assert.equal(count(run.tiles, 'ore'), RULES.ores);
  assert.equal(run.oresLeft, RULES.ores);
  assert.equal(count(run.tiles, 'dynamite'), RULES.dynamite);
});

test('mine: each field has more dynamite, up to the most allowed', () => {
  const rules = { ...RULES, dynamite: 2, dynamiteStep: 3, maxDynamite: 9 };
  assert.deepEqual([1, 2, 3, 4, 5].map((f) => dynamiteOn(rules, f)), [2, 5, 8, 9, 9]);
  for (const field of [1, 2, 3, 4]) assert.equal(count(layField(rules, field), 'dynamite'), dynamiteOn(rules, field));
});

test('mine: every field is laid out so every ore and rock can be reached without stepping on dynamite, even with the most dynamite', () => {
  const rules = { ...RULES, ores: 1, dynamite: MAX_MINE_DYNAMITE, maxDynamite: MAX_MINE_DYNAMITE };
  for (let i = 0; i < 50; i++) {
    const tiles = layField(rules, 1);
    assert.equal(count(tiles, 'dynamite'), MAX_MINE_DYNAMITE);
    assert.equal(tiles[CENTER]?.kind, 'rock');
    assert.ok(allReachable(tiles));
  }
  for (let i = 0; i < 200; i++) assert.ok(allReachable(layField(RULES, 1 + (i % 12))));
});

test('mine: allReachable spots a tile walled off by dynamite', () => {
  const tiles = Array.from({ length: TILE_COUNT }, rock);
  assert.ok(allReachable(tiles));
  // The top left corner, walled off by the two tiles next to it.
  tiles[1] = { kind: 'dynamite' };
  tiles[5] = { kind: 'dynamite' };
  assert.equal(allReachable(tiles), false);
  tiles[0] = { kind: 'dynamite' };
  assert.ok(allReachable(tiles));
});

test('mine: ores turn up by their weights (50 coal, 30 iron, 15 gold, 5 diamond in 100)', () => {
  assert.equal(rollOre(() => 1), 'coal');
  assert.equal(rollOre(() => 50), 'coal');
  assert.equal(rollOre(() => 51), 'iron');
  assert.equal(rollOre(() => 80), 'iron');
  assert.equal(rollOre(() => 81), 'gold');
  assert.equal(rollOre(() => 95), 'gold');
  assert.equal(rollOre(() => 96), 'diamond');
  assert.equal(rollOre(() => 100), 'diamond');
});

// ---------------------------------------------------------------------------
// Moving and digging

test('mine: a step goes one tile, and there is no step past the edge', () => {
  assert.equal(stepFrom(CENTER, 'up'), 7);
  assert.equal(stepFrom(CENTER, 'down'), 17);
  assert.equal(stepFrom(CENTER, 'left'), 11);
  assert.equal(stepFrom(CENTER, 'right'), 13);
  assert.equal(stepFrom(0, 'up'), null);
  assert.equal(stepFrom(0, 'left'), null);
  assert.equal(stepFrom(4, 'right'), null);
  assert.equal(stepFrom(20, 'down'), null);
  assert.equal(stepFrom(24, 'right'), null);
  assert.equal(stepFrom(5, 'left'), null); // no wrapping round to the row above
});

test('mine: rock is worth nothing, an ore adds its value, and dug tiles are walked over', () => {
  const run = runWith({ 7: { kind: 'ore', ore: 'gold' }, 2: { kind: 'ore', ore: 'coal' } }, 2);
  assert.deepEqual(step(run, 'left', RULES), { kind: 'rock' });
  assert.equal(run.pos, 11);
  assert.deepEqual(step(run, 'right', RULES), { kind: 'walk' });
  assert.deepEqual(step(run, 'up', RULES), { kind: 'ore', ore: 'gold', gained: 0.5 });
  assert.equal(run.multiplier, 1.5);
  assert.equal(run.oresLeft, 1);
  assert.ok(run.dug[7]);
});

test('mine: dynamite ends the run', () => {
  const run = runWith({ 13: { kind: 'dynamite' }, 7: { kind: 'ore', ore: 'coal' } }, 1, 1.3);
  assert.deepEqual(step(run, 'right', RULES), { kind: 'boom' });
  assert.equal(run.status, 'boom');
  assert.equal(run.pos, 13);
  assert.throws(() => step(run, 'left', RULES));
});

test('mine: digging the last ore clears the field: the bonus, and a new field with more dynamite and the miner back in the middle', () => {
  const run = runWith({ 17: { kind: 'ore', ore: 'diamond' } }, 1, 1.2);
  const result = step(run, 'down', RULES);
  assert.deepEqual(result, { kind: 'cleared', ore: 'diamond', gained: 1, bonus: RULES.fieldBonus });
  assert.equal(run.multiplier, 1.2 + 1 + RULES.fieldBonus);
  assert.equal(run.field, 2);
  assert.equal(run.pos, CENTER);
  assert.equal(run.oresLeft, RULES.ores);
  assert.equal(count(run.tiles, 'dynamite'), dynamiteOn(RULES, 2));
  assert.equal(run.dug.filter(Boolean).length, 1);
});

test('mine: the multiplier stays exact however many small values are added', () => {
  const tiles: Record<number, MineTile> = {};
  for (let i = 1; i <= 10; i++) tiles[i] = { kind: 'ore', ore: 'coal' };
  const run = runWith(tiles, 11);
  run.pos = 0;
  // Ten coal: along the top row, down, back along the second row, and down again.
  for (let i = 0; i < 4; i++) step(run, 'right', RULES);
  step(run, 'down', RULES);
  for (let i = 0; i < 4; i++) step(run, 'left', RULES);
  step(run, 'down', RULES);
  assert.equal(run.multiplier, 2);
  assert.equal(payoutFor(100, run.multiplier), 200);
  assert.equal(payoutFor(15, 1.1), 17);
});

// ---------------------------------------------------------------------------
// Balance

test('mine: played as well as it can be, a run that digs still pays back a little less than the bet (about 97.5%)', () => {
  const back = expectedReturn(RULES);
  assert.ok(back < 1, `the best play pays back ${back}`);
  assert.ok(back > 0.95, `the best play pays back ${back}`);
});

test('mine: richer ores pay back more', () => {
  const small = { ...RULES, fieldBonus: 0.5, value: { coal: 0.05, iron: 0.1, gold: 0.25, diamond: 0.5 } };
  assert.ok(expectedReturn(small) < expectedReturn(RULES));
});

// ---------------------------------------------------------------------------
// The picture

test('mine: the picture is drawn while digging, and with every tile shown once the run is over', () => {
  const run = startRun(RULES);
  for (const over of [false, true]) {
    const png = renderMine({ ...run, over, boom: false });
    assert.deepEqual(pngSize(png), { width: 420, height: 462 });
  }
  const blown = runWith({ 13: { kind: 'dynamite' } }, 1);
  step(blown, 'right', RULES);
  assert.ok(renderMine({ ...blown, over: true, boom: true }).length > 0);
});

// ---------------------------------------------------------------------------
// Settings, constants and text

test('mine: the settings exist, are in their own group, and start at the tuned values', () => {
  assert.deepEqual(DEFAULTS.mine, {
    minBet: 10,
    maxBet: 1000,
    ores: 6,
    dynamite: 2,
    dynamiteStep: 1,
    maxDynamite: 12,
    fieldBonus: 1,
    value: { coal: 0.1, iron: 0.2, gold: 0.5, diamond: 1 },
  });
  assert.deepEqual(CONFIG.mine, DEFAULTS.mine);
  const keys = SPECS.filter((s) => s.key.startsWith('mine.')).map((s) => s.key);
  assert.deepEqual(keys, [
    'mine.minBet',
    'mine.maxBet',
    'mine.ores',
    'mine.dynamite',
    'mine.dynamiteStep',
    'mine.maxDynamite',
    'mine.fieldBonus',
    ...MINE_ORES.map((ore) => `mine.value.${ore}`),
  ]);
  for (const key of keys) assert.equal(findSpec(key)?.group, 'Mine');
  assert.deepEqual(validateSettings(structuredClone(DEFAULTS)), []);
});

test('mine: settings that could not make a field are refused', () => {
  const settings = structuredClone(DEFAULTS);
  settings.mine.minBet = 2000;
  assert.match(checkConstraints(settings) ?? '', /mine\.minBet/);
  settings.mine.minBet = 10;
  settings.mine.dynamite = 13;
  assert.match(checkConstraints(settings) ?? '', /mine\.dynamite/);
  settings.mine.dynamite = 2;
  settings.mine.ores = 13;
  assert.match(checkConstraints(settings) ?? '', /mine\.ores/);
  settings.mine.ores = 12;
  assert.equal(checkConstraints(settings), null);
});

test('mine: the constants pass the startup check, and its buttons never mix with another game', () => {
  assert.doesNotThrow(() => validateConstants());
  const ids = Object.values(MINE_BET_IDS);
  for (const id of Object.values(PLINKO_BET_IDS)) assert.ok(!ids.includes(id));
});

test('mine: the text reads right', () => {
  assert.match(TEXT.mine.usage('k!'), /k!mine 100/);
  assert.match(TEXT.mine.found('diamond', '+1x'), /Diamond.*\+1x/);
  assert.match(TEXT.mine.cleared('coal', '+0.1x', '+1x', 2, 3), /Field cleared.*\+1x.*field 2.*3/s);
  assert.equal(TEXT.mine.fieldValue(1, 1, 2), '#1 · 1 ore left · 2 🧨');
  assert.equal(TEXT.mine.fieldValue(1, 5, 2), '#1 · 5 ores left · 2 🧨');
});
