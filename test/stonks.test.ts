import assert from 'node:assert/strict';
import { test } from 'node:test';
import { CONFIG } from '../src/config.js';
import { EFFECT_TEXT, MAX_STONKS_HOURS, TEXT, validateConstants } from '../src/constants.js';
import { emptyTotals } from '../src/data/effects.js';
import { ITEMS_BY_ID } from '../src/data/items.js';
import { formatMultiplier, signed } from '../src/lib/format.js';
import { applyStonks, stonksCurvePoints, stonksMultiplier } from '../src/lib/game/perks.js';
import { describeEffects } from '../src/lib/game/equipment.js';
import { findSpec, parseInput } from '../src/lib/settings-spec.js';

const gear = (stackosaurus: number) => ({ ...emptyTotals(), stackosaurus });

// ---------------------------------------------------------------------------
// The curve

test('stonks curve: no gear, or gear with nothing to climb, is always 1x', () => {
  assert.equal(stonksMultiplier(0, emptyTotals(), 5), 1);
  assert.equal(stonksMultiplier(100, emptyTotals(), 5), 1, 'no gear equipped');
  assert.equal(stonksMultiplier(100, gear(0), 5), 1, 'a cap of 1x (0 added) never climbs');
  assert.equal(stonksMultiplier(3, gear(9), 0), 1, 'capHours of 0 is treated as never climbing');
  assert.equal(stonksMultiplier(3, gear(9), -1), 1);
});

test('stonks curve: right after a claim it is 1x, and it climbs smoothly to the cap', () => {
  // 9 added (900%) is a 10x cap, over 5 hours: the user's chosen 1/1.6/2.5/4/6.3/10 sequence.
  const cap5 = (hours: number) => stonksMultiplier(hours, gear(9), 5);
  assert.equal(cap5(0), 1);
  const at = [1, 1.6, 2.5, 4, 6.3, 10];
  for (let hour = 0; hour <= 5; hour++) {
    const got = Number(cap5(hour).toFixed(2));
    assert.ok(Math.abs(got - (at[hour] as number)) < 0.05, `hour ${hour}: got ${got}, want ~${at[hour]}`);
  }
  // Strictly increasing in between, never overshooting the cap.
  let last = 0;
  for (let h = 0; h <= 50; h++) {
    const m = cap5(h / 10);
    assert.ok(m >= last, `multiplier dipped at hour ${h / 10}`);
    assert.ok(m <= 10 + 1e-9, `multiplier ${m} went over the 10x cap`);
    last = m;
  }
});

test('stonks curve: caps out at capHours and never grows past it, however long unclaimed', () => {
  const at5 = stonksMultiplier(5, gear(9), 5);
  assert.ok(Math.abs(at5 - 10) < 1e-9);
  assert.equal(stonksMultiplier(6, gear(9), 5), at5, 'past the cap hour stays at the cap');
  assert.equal(stonksMultiplier(1000, gear(9), 5), at5);
  assert.equal(stonksMultiplier(MAX_STONKS_HOURS, gear(9), 5), at5);
});

test('stonks curve: negative hours (e.g. a clock hiccup) never go below 1x', () => {
  assert.equal(stonksMultiplier(-1, gear(9), 5), 1);
  assert.equal(stonksMultiplier(-100, gear(9), 5), 1);
});

test('stonks curve: a different cap multiplier still starts at 1x and lands exactly on its cap', () => {
  assert.equal(stonksMultiplier(0, gear(3), 4), 1);
  const at4 = stonksMultiplier(4, gear(3), 4);
  assert.ok(Math.abs(at4 - 4) < 1e-9, `${at4} is not 4`);
});

// ---------------------------------------------------------------------------
// The curve, in the multiplier form the gear-card text shows

test('stonksCurvePoints: at most 5 hour marks, evenly spaced, always ending exactly at the cap', () => {
  // 9 added (10x cap) over 5 hours: the user's chosen sequence, one point per whole hour.
  const points5 = stonksCurvePoints(9, 5);
  assert.deepEqual(
    points5.map((p) => p.hours),
    [1, 2, 3, 4, 5],
  );
  assert.deepEqual(
    points5.map((p) => Number(p.multiplier.toFixed(2))),
    [1.58, 2.51, 3.98, 6.31, 10],
  );
  assert.equal(points5[points5.length - 1]?.hours, 5, 'the last point is exactly the cap hour');
});

test('stonksCurvePoints: a capHours under 5 gets one point per whole hour; over 5 is thinned to 5 evenly spaced marks', () => {
  const points3 = stonksCurvePoints(9, 3);
  assert.deepEqual(
    points3.map((p) => p.hours),
    [1, 2, 3],
  );

  const points12 = stonksCurvePoints(9, 12);
  assert.equal(points12.length, 5, 'never more than 5 points, however long capHours is');
  assert.deepEqual(
    points12.map((p) => p.hours),
    [2.4, 4.8, 7.2, 9.6, 12],
  );
  assert.equal(points12[points12.length - 1]?.hours, 12, 'still lands exactly on the cap hour');
});

test('stonksCurvePoints: empty when there is nothing to climb or no time for it', () => {
  assert.deepEqual(stonksCurvePoints(0, 5), []);
  assert.deepEqual(stonksCurvePoints(-1, 5), []);
  assert.deepEqual(stonksCurvePoints(9, 0), []);
  assert.deepEqual(stonksCurvePoints(9, -1), []);
});

// ---------------------------------------------------------------------------
// Applying it to a claim

test('applyStonks: a no-op at 1x, otherwise scales and rounds, never below 1', () => {
  assert.equal(applyStonks(300, 1), 300, 'no gear: untouched');
  assert.equal(applyStonks(0, 5), 0, 'nothing to multiply');
  assert.equal(applyStonks(-5, 5), -5, 'never applies to a non-positive amount');
  assert.equal(applyStonks(300, 2.5), 750);
  assert.equal(applyStonks(333, 1.5), 500); // 499.5 rounds to 500
  assert.equal(applyStonks(1, 1.2), 1, 'a low roll never rounds to nothing while multiplying up');
});

// ---------------------------------------------------------------------------
// The effect, its setting and the item

test('stonks effect: added-percent settings by star, held to the configured min and max', () => {
  assert.deepEqual([1, 2, 3, 4].map((star) => (CONFIG.equipment.stackosaurus as Record<number, number>)[star]), [1, 3, 5, 9]);
  assert.ok(findSpec('equipment.stackosaurus.4'), 'it can be changed with the config command');
  assert.deepEqual(parseInput(findSpec('equipment.stackosaurus.4')!, '900%'), { ok: true, value: 9 });
  assert.equal(parseInput(findSpec('equipment.stackosaurus.4')!, '10000%').ok, false, 'held to the effect max (99, i.e. 9900%)');
  assert.equal(parseInput(findSpec('equipment.stackosaurus.4')!, '-10%').ok, false);
});

test('stonks.capHours: a normal setting, 5 by default, held between 1 hour and MAX_STONKS_HOURS', () => {
  validateConstants();
  assert.equal(CONFIG.stonks.capHours, 5);
  const spec = findSpec('stonks.capHours');
  assert.ok(spec);
  assert.equal(spec?.group, 'Stonks');
  assert.deepEqual(parseInput(spec!, '10'), { ok: true, value: 10 });
  assert.equal(parseInput(spec!, '0').ok, false);
  assert.equal(parseInput(spec!, String(MAX_STONKS_HOURS + 1)).ok, false);
});

test('stonks item: STONKS! is a 4-star unique treasure exclusive to one member, and describes its effect', () => {
  const item = ITEMS_BY_ID.get('stonks!');
  assert.ok(item, 'the catalog has STONKS!');
  assert.equal(item.slot, 'treasure');
  assert.equal(item.stars, 4);
  assert.deepEqual(item.effects, ['stackosaurus']);
  assert.ok(item.usableBy && item.usableBy.length > 0, 'STONKS! is exclusive');
  const lines = describeEffects(item);
  assert.equal(lines.length, 1);
  assert.match(lines[0] as string, /claim multiplier/);
  assert.match(EFFECT_TEXT.stackosaurus('+10x'), /climbs the longer you go without claiming.*\+10x/);
});

test('stonks item: its gear-card line names the effect "Stackosaurus" and spells out the curve in multipliers by hour, live off the settings', () => {
  const item = ITEMS_BY_ID.get('stonks!')!;
  const [line] = describeEffects(item);
  assert.match(line as string, /^Stackosaurus:/, 'the effect is called Stackosaurus on the card');
  assert.match(line as string, /starts at 1x right after claiming/, 'the 1x starting point is spelled out, not just implied');
  // Defaults: 4-star strength 9 (10x cap), capHours 5 -> the curve at each whole hour, shown as
  // multipliers formatted the same way as the claim message (formatMultiplier, 2 decimals), not
  // the raw added-percent strength ("+900%").
  assert.match(line as string, /1\.58x at 1h/);
  assert.match(line as string, /2\.51x at 2h/);
  assert.match(line as string, /3\.98x at 3h/);
  assert.match(line as string, /6\.31x at 4h/);
  assert.match(line as string, /10x at 5h/);
  assert.match(line as string, /\(the cap\)/);
  assert.doesNotMatch(line as string, /%/, 'no leftover added-percent formatting');

  // Changing the live setting changes the line right away (read fresh each time, like every
  // other effect's strength).
  const before = CONFIG.stonks.capHours;
  CONFIG.stonks.capHours = 2;
  try {
    const [changed] = describeEffects(item);
    assert.match(changed as string, /10x at 2h/, 'the cap now lands at hour 2');
    assert.doesNotMatch(changed as string, /at 5h/);
  } finally {
    CONFIG.stonks.capHours = before;
  }
});

// ---------------------------------------------------------------------------
// The claim message

test('stonks text: the claim line names the multiplier, and the point change only when there was one', () => {
  assert.equal(formatMultiplier(6.3), '6.3x');
  assert.equal(signed(230), '+230');
  assert.match(TEXT.stonks.landed('6.3x', '+230'), /6\.3x/);
  assert.match(TEXT.stonks.landed('6.3x', '+230'), /\+230/);
  assert.doesNotMatch(TEXT.stonks.landed('1x', ''), /\(/, 'no parenthetical when there was no change');
});
