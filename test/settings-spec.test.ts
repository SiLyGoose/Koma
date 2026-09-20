import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DEFAULTS, isAdmin, ADMIN_USER_ID } from '../src/config.js';
import {
  checkConstraints,
  findSpec,
  formatValue,
  getPath,
  parseInput,
  setPath,
  SPECS,
  validateSettings,
} from '../src/lib/settings-spec.js';

const spec = (key: string) => {
  const found = findSpec(key);
  assert.ok(found, `missing spec ${key}`);
  return found;
};

test('the defaults are valid and every setting has a spec', () => {
  assert.deepEqual(validateSettings(structuredClone(DEFAULTS)), []);
  for (const s of SPECS) assert.notEqual(getPath(DEFAULTS, s.key), undefined, `${s.key} has no default`);
});

test('spec keys are unique', () => {
  const keys = SPECS.map((s) => s.key.toLowerCase());
  assert.equal(new Set(keys).size, keys.length);
});

test('findSpec ignores case', () => {
  assert.equal(findSpec('EMBEDCOLOR')?.key, 'embedColor');
  assert.equal(findSpec('Claim.Min')?.key, 'claim.min');
  assert.equal(findSpec('nope'), undefined);
});

test('whole numbers: accepts commas, rejects junk and out-of-range values', () => {
  assert.deepEqual(parseInput(spec('gacha.cost'), '1,500'), { ok: true, value: 1500 });
  assert.deepEqual(parseInput(spec('gacha.cost'), ' 300 '), { ok: true, value: 300 });
  for (const bad of ['', 'abc', '2.5', '0', '-4', '99999999999']) {
    assert.equal(parseInput(spec('gacha.cost'), bad).ok, false, `should reject "${bad}"`);
  }
});

test('percentages: accepts 40%, 0.4 and rejects out-of-range values', () => {
  assert.deepEqual(parseInput(spec('rob.successChance'), '40%'), { ok: true, value: 0.4 });
  assert.deepEqual(parseInput(spec('rob.successChance'), '0.25'), { ok: true, value: 0.25 });
  assert.deepEqual(parseInput(spec('rob.successChance'), '100%'), { ok: true, value: 1 });
  for (const bad of ['150%', '40', '-5%', 'high']) {
    assert.equal(parseInput(spec('rob.successChance'), bad).ok, false, `should reject "${bad}"`);
  }
  assert.equal(formatValue(spec('rob.successChance'), 0.4), '40%');
});

test('embed color is normalized and validated', () => {
  assert.deepEqual(parseInput(spec('embedColor'), 'ff0000'), { ok: true, value: '#FF0000' });
  assert.deepEqual(parseInput(spec('embedColor'), '#5865f2'), { ok: true, value: '#5865F2' });
  for (const bad of ['red', '#12345', '#GGGGGG', '']) {
    assert.equal(parseInput(spec('embedColor'), bad).ok, false, `should reject "${bad}"`);
  }
});

test('prefix must be 1 to 10 characters with no spaces', () => {
  assert.deepEqual(parseInput(spec('prefix'), 'k!'), { ok: true, value: 'k!' });
  for (const bad of ['', 'has space', 'waytoolongprefix']) {
    assert.equal(parseInput(spec('prefix'), bad).ok, false, `should reject "${bad}"`);
  }
});

test('cross-setting rules', () => {
  const s = structuredClone(DEFAULTS);
  s.claim.min = 600;
  assert.match(checkConstraints(s) ?? '', /claim\.min/);

  const t = structuredClone(DEFAULTS);
  t.rob.minStolen = 900;
  assert.match(checkConstraints(t) ?? '', /rob\.minStolen/);

  const u = structuredClone(DEFAULTS);
  u.gacha.starWeights = { 1: 0, 2: 0, 3: 0, 4: 0 };
  assert.match(checkConstraints(u) ?? '', /starWeights/);

  const ok = structuredClone(DEFAULTS);
  ok.gacha.starWeights = { 1: 0, 2: 0, 3: 1, 4: 0 };
  assert.equal(checkConstraints(ok), null);

  // Only the 4-star tier being above 0 is a valid setup too.
  const fourOnly = structuredClone(DEFAULTS);
  fourOnly.gacha.starWeights = { 1: 0, 2: 0, 3: 0, 4: 1 };
  assert.equal(checkConstraints(fourOnly), null);
});

test('pity settings: whole numbers, hard pity can be 0 (off), soft start can not pass hard pity', () => {
  const soft = spec('gacha.pity.softStart');
  const hard = spec('gacha.pity.hardPity');
  assert.deepEqual(parseInput(soft, '70'), { ok: true, value: 70 });
  assert.deepEqual(parseInput(hard, '90'), { ok: true, value: 90 });
  assert.deepEqual(parseInput(hard, '0'), { ok: true, value: 0 });
  for (const bad of ['0', '-1', '2.5', 'lots']) assert.equal(parseInput(soft, bad).ok, false, `softStart "${bad}"`);
  for (const bad of ['-1', '1.5', '1001']) assert.equal(parseInput(hard, bad).ok, false, `hardPity "${bad}"`);

  const s = structuredClone(DEFAULTS);
  assert.equal(checkConstraints(s), null);
  s.gacha.pity = { softStart: 95, hardPity: 90 };
  assert.match(checkConstraints(s) ?? '', /softStart/);
  s.gacha.pity = { softStart: 90, hardPity: 90 };
  assert.equal(checkConstraints(s), null);
  // With pity off, the soft start doesn't matter.
  s.gacha.pity = { softStart: 500, hardPity: 0 };
  assert.equal(checkConstraints(s), null);
});

test('the 4-star weight is a setting like the others', () => {
  const weight = spec('gacha.starWeights.4');
  assert.deepEqual(parseInput(weight, '2'), { ok: true, value: 2 });
  assert.equal(parseInput(weight, '-1').ok, false);
  assert.equal(spec('equipment.robChance.4').group, 'Equipment');
});

test('getPath and setPath work on nested and numeric keys', () => {
  const o: Record<string, unknown> = {};
  setPath(o, 'gacha.starWeights.3', 9);
  assert.deepEqual(o, { gacha: { starWeights: { 3: 9 } } });
  assert.equal(getPath(o, 'gacha.starWeights.3'), 9);
  assert.equal(getPath(o, 'gacha.nothing.here'), undefined);
  assert.equal(getPath(null, 'a'), undefined);
});

test('only the configured admin id is an admin', () => {
  assert.equal(ADMIN_USER_ID, '257214680823627777');
  assert.equal(isAdmin('257214680823627777'), true);
  assert.equal(isAdmin('257214680823627778'), false);
  assert.equal(isAdmin(''), false);
});

test('the victim protection timer is a setting, and 0 turns it off', () => {
  const s = spec('rob.victimProtectionMinutes');
  assert.deepEqual(parseInput(s, '30'), { ok: true, value: 30 });
  assert.deepEqual(parseInput(s, '0'), { ok: true, value: 0 });
  for (const bad of ['-1', 'abc', '1.5', '999999']) assert.equal(parseInput(s, bad).ok, false, bad);
});
