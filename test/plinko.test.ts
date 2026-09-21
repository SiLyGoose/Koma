import assert from 'node:assert/strict';
import { test } from 'node:test';
import { inflateSync } from 'node:zlib';
import { AGAIN_ID, DOUBLE_ID, HALF_ID, betForButton } from '../src/commands/plinko.js';
import { CONFIG, DEFAULTS } from '../src/config.js';
import { CURRENCY_EMOJI, PLINKO_ROWS, TEXT, validateConstants } from '../src/constants.js';
import {
  ballOffset,
  buttonPlan,
  checkBet,
  expectedReturn,
  parseBetArg,
  payoutFor,
  rollPath,
  slotChances,
  slotCount,
  slotMultiplier,
  slotMultipliers,
  slotOf,
} from '../src/lib/game/plinko.js';
import { renderPlinko, boardLayout } from '../src/animations/images/plinko-image.js';
import { SPECS, checkConstraints, findSpec, formatValue, parseInput, validateSettings } from '../src/lib/settings-spec.js';

const close = (a: number, b: number, eps = 1e-9) => assert.ok(Math.abs(a - b) <= eps, `${a} is not ${b}`);
const PAYOUT = { 1: 9, 2: 3, 3: 1.4, 4: 0.7, 5: 0.4 };

// ---------------------------------------------------------------------------
// The board

test('plinko: the board has one more slot than rows, and a ball ends where its right bounces put it', () => {
  assert.equal(PLINKO_ROWS, 8);
  assert.equal(slotCount(), 9);
  assert.equal(slotCount(6), 7);
  assert.equal(slotOf([false, false, false]), 0);
  assert.equal(slotOf([true, true, true]), 3);
  assert.equal(slotOf([true, false, true, false]), 2);
  assert.equal(slotOf([]), 0);
});

test('plinko: a dropped ball makes one choice per row, from the coin it is given', () => {
  assert.deepEqual(rollPath(() => true, 4), [true, true, true, true]);
  assert.deepEqual(rollPath(() => false, 3), [false, false, false]);
  assert.equal(rollPath(() => true).length, PLINKO_ROWS);
  const flips = [true, false, false, true, true];
  let i = 0;
  assert.deepEqual(rollPath(() => flips[i++] as boolean, 5), flips, 'the choices are made in order, top row first');
  // The real coin lands both ways.
  const seen = new Set(rollPath(() => Math.random() < 0.5, 200));
  assert.equal(seen.size, 2);
});

test('plinko: the payouts are mirrored, so slot s and slot rows-s pay the same', () => {
  assert.deepEqual(slotMultipliers(PAYOUT), [9, 3, 1.4, 0.7, 0.4, 0.7, 1.4, 3, 9]);
  assert.equal(slotMultiplier(PAYOUT, 0), 9);
  assert.equal(slotMultiplier(PAYOUT, 4), 0.4, 'the middle slot is the last number');
  assert.equal(slotMultiplier(PAYOUT, 8), 9);
  assert.deepEqual(slotMultipliers({ 1: 5, 2: 1, 3: 0 }, 4), [5, 1, 0, 1, 5]);
  assert.throws(() => slotMultiplier(PAYOUT, 9), /no slot 9/);
  assert.throws(() => slotMultiplier(PAYOUT, -1), /no slot/);
  assert.throws(() => slotMultiplier({ 1: 2 }, 4), /No payout is set/);
});

test('plinko: a bet pays the multiplier rounded to whole points', () => {
  assert.equal(payoutFor(100, 3), 300);
  assert.equal(payoutFor(100, 0.4), 40);
  assert.equal(payoutFor(10, 0.7), 7);
  assert.equal(payoutFor(15, 0.7), 11, '10.5 rounds up');
  assert.equal(payoutFor(100, 0), 0);
  assert.equal(payoutFor(333, 1.4), 466);
});

test('plinko: the chance of each slot is the binomial, and adds up to 1', () => {
  const chances = slotChances();
  assert.equal(chances.length, 9);
  close(chances.reduce((a, b) => a + b, 0), 1);
  assert.deepEqual(chances.map((c) => Math.round(c * 256)), [1, 8, 28, 56, 70, 56, 28, 8, 1]);
  assert.deepEqual(slotChances(2), [0.25, 0.5, 0.25]);
  assert.deepEqual(slotChances(4).map((c) => c * 16), [1, 4, 6, 4, 1]);
});

test('plinko: the default payouts return just under the bet on average, and the return follows the settings', () => {
  const rtp = expectedReturn(DEFAULTS.plinko.payout);
  assert.ok(rtp > 0.95 && rtp < 1, `${rtp}`);
  close(rtp, (2 * (1 * 9 + 8 * 3 + 28 * 1.4 + 56 * 0.7) + 70 * 0.4) / 256);
  close(expectedReturn({ 1: 1, 2: 1, 3: 1, 4: 1, 5: 1 }), 1);
  close(expectedReturn({ 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 }), 0);
  close(expectedReturn({ 1: 2, 2: 2, 3: 2, 4: 2, 5: 2 }), 2);
  close(expectedReturn({ 1: 4, 2: 0, 3: 0 }, 4), 8 / 16);
});

test('plinko: the ball is in the middle to start, and ends in the middle of its slot', () => {
  const path = [true, false, true, true, false, true, true, true];
  assert.equal(ballOffset(path, 0), 0);
  assert.equal(ballOffset(path, 1), 0.5, 'one bounce right is half a slot right');
  assert.equal(ballOffset(path, 2), 0);
  assert.equal(ballOffset(path, 3), 0.5);
  // After every row it is at the middle of the slot: slot number minus half the rows.
  assert.equal(ballOffset(path, 8), slotOf(path) - 4);
  assert.equal(ballOffset([false, false, false, false], 4), -2);
  assert.equal(ballOffset([true, true, true, true], 4), 2);
  assert.throws(() => ballOffset(path, 9), /no frame 9/);
  assert.throws(() => ballOffset(path, -1), /no frame/);
  // The ball only ever moves half a slot at a time.
  for (let f = 1; f <= 8; f++) close(Math.abs(ballOffset(path, f) - ballOffset(path, f - 1)), 0.5);
});

// ---------------------------------------------------------------------------
// Bets

test('plinko: the bet is one whole number, or all', () => {
  assert.deepEqual(parseBetArg(['100']), { ok: true, bet: 100 });
  assert.deepEqual(parseBetArg(['1,000']), { ok: true, bet: 1000 });
  assert.deepEqual(parseBetArg(['007']), { ok: true, bet: 7 });
  assert.deepEqual(parseBetArg(['ALL']), { ok: true, bet: 'all' });
  assert.deepEqual(parseBetArg([' max ']), { ok: true, bet: 'all' });
});

test('plinko: anything else is a usage hint or a bad bet', () => {
  assert.deepEqual(parseBetArg([]), { ok: false, error: 'usage' });
  assert.deepEqual(parseBetArg(['100', '200']), { ok: false, error: 'usage' });
  for (const bad of ['0', '-5', '2.5', 'ten', '1e3', '100x', '', '99999999999999999999']) {
    assert.deepEqual(parseBetArg([bad]), { ok: false, error: 'bad_bet' }, bad);
  }
});

test('plinko: a bet has to be within the limits', () => {
  assert.deepEqual(checkBet(10, 10, 1000), { ok: true });
  assert.deepEqual(checkBet(1000, 10, 1000), { ok: true });
  assert.deepEqual(checkBet(9, 10, 1000), { ok: false, reason: 'too_small', limit: 10 });
  assert.deepEqual(checkBet(1001, 10, 1000), { ok: false, reason: 'too_big', limit: 1000 });
});

test('plinko: the buttons are on only for bets that are in range and that the member can pay', () => {
  assert.deepEqual(buttonPlan(100, 5000, 10, 1000), {
    again: { bet: 100, enabled: true },
    double: { bet: 200, enabled: true },
    half: { bet: 50, enabled: true },
  });
  // Not enough points left.
  assert.deepEqual(buttonPlan(100, 150, 10, 1000), {
    again: { bet: 100, enabled: true },
    double: { bet: 200, enabled: false },
    half: { bet: 50, enabled: true },
  });
  assert.equal(buttonPlan(100, 99, 10, 1000).again.enabled, false);
  assert.equal(buttonPlan(100, 100, 10, 1000).again.enabled, true, 'exactly enough');
  assert.equal(buttonPlan(100, 200, 10, 1000).double.enabled, true, 'exactly enough');
  // Over the biggest bet, or under the smallest.
  assert.equal(buttonPlan(600, 9999, 10, 1000).double.enabled, false);
  assert.equal(buttonPlan(1000, 9999, 10, 1000).again.enabled, true);
  assert.equal(buttonPlan(15, 9999, 10, 1000).half.bet, 7, 'half is rounded down');
  assert.equal(buttonPlan(15, 9999, 10, 1000).half.enabled, false, 'and 7 is under the smallest bet');
  assert.equal(buttonPlan(20, 9999, 10, 1000).half.enabled, true);
  // No points at all: nothing can be played.
  const broke = buttonPlan(100, 0, 10, 1000);
  assert.deepEqual([broke.again.enabled, broke.double.enabled, broke.half.enabled], [false, false, false]);
});

test('plinko: each button asks for the bet its name says', () => {
  assert.equal(betForButton(AGAIN_ID, 100), 100);
  assert.equal(betForButton(DOUBLE_ID, 100), 200);
  assert.equal(betForButton(HALF_ID, 100), 50);
  assert.equal(betForButton(HALF_ID, 15), 7);
  assert.equal(betForButton('something else', 100), null);
  assert.equal(new Set([AGAIN_ID, DOUBLE_ID, HALF_ID]).size, 3);
});

// ---------------------------------------------------------------------------
// Settings

test('plinko settings: a min and max bet and one payout per slot from the edge to the middle', () => {
  const keys = SPECS.filter((spec) => spec.group === 'Plinko').map((spec) => spec.key);
  assert.deepEqual(keys, ['plinko.minBet', 'plinko.maxBet', 'plinko.payout.1', 'plinko.payout.2', 'plinko.payout.3', 'plinko.payout.4', 'plinko.payout.5']);
  assert.equal(PLINKO_ROWS / 2 + 1, 5);
  assert.deepEqual(DEFAULTS.plinko, { minBet: 10, maxBet: 1000, payout: { 1: 9, 2: 3, 3: 1.4, 4: 0.7, 5: 0.4 } });
  assert.deepEqual(validateSettings(CONFIG), []);
  assert.match(findSpec('plinko.payout.1')!.description, /two outermost slots/);
  assert.match(findSpec('plinko.payout.5')!.description, /middle slot/);
  assert.match(findSpec('plinko.payout.2')!.description, /1 in from the edge/);
});

test('plinko settings: payouts are typed as a multiplier, with or without the x', () => {
  const spec = findSpec('plinko.payout.3')!;
  assert.deepEqual(parseInput(spec, '2.5'), { ok: true, value: 2.5 });
  assert.deepEqual(parseInput(spec, '2.5x'), { ok: true, value: 2.5 });
  assert.deepEqual(parseInput(spec, ' 10X '), { ok: true, value: 10 });
  assert.deepEqual(parseInput(spec, '0'), { ok: true, value: 0 });
  assert.deepEqual(parseInput(spec, '0.5x'), { ok: true, value: 0.5 });
  for (const bad of ['-1', '1001', 'x', 'lots', '', '2 x 3']) assert.equal(parseInput(spec, bad).ok, false, bad);
  assert.match((parseInput(spec, '1001') as { error: string }).error, /multiplier like 2\.5 or 2\.5x/);
  assert.equal(formatValue(spec, 2.5), '2.5x');
  assert.equal(formatValue(spec, 9), '9x');
  assert.equal(formatValue(spec, 0.333), '0.33x');
  // The bet limits are whole numbers.
  assert.equal(parseInput(findSpec('plinko.minBet')!, '2.5').ok, false);
  assert.deepEqual(parseInput(findSpec('plinko.maxBet')!, '5,000'), { ok: true, value: 5000 });
});

test('plinko settings: the smallest bet cannot be above the biggest', () => {
  const settings = structuredClone(CONFIG);
  assert.equal(checkConstraints(settings), null);
  settings.plinko.minBet = 2000;
  assert.equal(checkConstraints(settings), 'plinko.minBet cannot be higher than plinko.maxBet');
  settings.plinko.minBet = settings.plinko.maxBet;
  assert.equal(checkConstraints(settings), null);
});

// ---------------------------------------------------------------------------
// The picture

/** Reads the width and height out of a PNG file. */
const pngSize = (png: Buffer) => ({ width: png.readUInt32BE(16), height: png.readUInt32BE(20) });
const PATH = [true, false, true, true, false, true, true, true];
const MULTIPLIERS = slotMultipliers(PAYOUT);

test('plinko picture: every frame is a valid PNG of the same size', () => {
  const layout = boardLayout(PLINKO_ROWS);
  for (let frame = 0; frame <= PLINKO_ROWS; frame++) {
    const png = renderPlinko(MULTIPLIERS, PATH, frame);
    assert.deepEqual([...png.subarray(0, 8)], [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    assert.deepEqual(pngSize(png), { width: 640, height: layout.height }, `frame ${frame}`);
  }
  assert.equal(layout.slots, 9);
  assert.equal(layout.height % 2, 0, 'the size divides by the smoothing factor');
});

test('plinko picture: the ball moves, so every frame is different, and the finished picture is different again', () => {
  const frames = Array.from({ length: PLINKO_ROWS + 1 }, (_, f) => renderPlinko(MULTIPLIERS, PATH, f).toString('base64'));
  assert.equal(new Set(frames).size, frames.length);
  const finished = renderPlinko(MULTIPLIERS, PATH, PLINKO_ROWS, true).toString('base64');
  assert.ok(!frames.includes(finished));
  // The same picture is drawn the same way each time.
  assert.equal(renderPlinko(MULTIPLIERS, PATH, 3).toString('base64'), frames[3]);
});

test('plinko picture: the ball ends in a different place for a different path, and the slot labels follow the payouts', () => {
  const left = renderPlinko(MULTIPLIERS, PATH.map(() => false), PLINKO_ROWS, true).toString('base64');
  const right = renderPlinko(MULTIPLIERS, PATH.map(() => true), PLINKO_ROWS, true).toString('base64');
  assert.notEqual(left, right);
  const other = slotMultipliers({ ...PAYOUT, 1: 8 });
  assert.notEqual(renderPlinko(other, PATH, 0).toString('base64'), renderPlinko(MULTIPLIERS, PATH, 0).toString('base64'));
});

test('plinko picture: a board of any size draws, and bad input is refused', () => {
  const small = renderPlinko(slotMultipliers({ 1: 3, 2: 1, 3: 0.5 }, 4), [true, false, true, true], 2);
  assert.equal(pngSize(small).width, 640);
  assert.ok(pngSize(small).height < boardLayout(8).height, 'fewer rows make a shorter board');
  assert.equal(pngSize(renderPlinko(slotMultipliers({ 1: 1, 2: 1, 3: 1, 4: 1, 5: 1, 6: 1 }, 10), Array(10).fill(true), 10, true)).width, 640);
  assert.throws(() => renderPlinko(MULTIPLIERS, [], 0), /at least one row/);
  assert.throws(() => renderPlinko(MULTIPLIERS.slice(1), PATH, 0), /one payout for each slot/);
  assert.throws(() => renderPlinko(MULTIPLIERS, PATH, 9), /no frame 9/);
  assert.throws(() => renderPlinko(MULTIPLIERS, PATH, -1), /no frame/);
  assert.throws(() => renderPlinko(MULTIPLIERS, PATH, 1.5), /no frame/);
});

/** The RGBA of one pixel of a PNG made by our encoder (no filtering, 8-bit RGBA). */
function pixelOf(png: Buffer, x: number, y: number): number[] {
  const { width } = pngSize(png);
  const data: Buffer[] = [];
  for (let at = 8; at < png.length; ) {
    const length = png.readUInt32BE(at);
    if (png.subarray(at + 4, at + 8).toString('ascii') === 'IDAT') data.push(png.subarray(at + 8, at + 8 + length));
    at += 12 + length;
  }
  const raw = inflateSync(Buffer.concat(data));
  const start = y * (width * 4 + 1) + 1 + x * 4;
  return [...raw.subarray(start, start + 4)];
}

test('plinko picture: the slots that pay the most are red, the ones that pay the least are gold, with a gradient between', () => {
  const layout = boardLayout(PLINKO_ROWS);
  // Above the label, inside the slot's colored box.
  const slotColor = (png: Buffer, slot: number) => {
    const { x, y } = layout.slot(slot);
    return pixelOf(png, Math.round(x), Math.round(y) + 8);
  };
  const png = renderPlinko([29, 4, 1.5, 0.3, 0.2, 0.3, 1.5, 4, 29], PATH, 0);
  assert.deepEqual(slotColor(png, 0), [220, 70, 75, 255], 'the biggest payout is red');
  assert.deepEqual(slotColor(png, 8), [220, 70, 75, 255]);
  assert.deepEqual(slotColor(png, 4), [245, 197, 66, 255], 'the smallest payout is gold');
  // Going in from the edge the boxes get less red (the green channel rises) and no two neighbours match.
  for (let slot = 1; slot <= 4; slot++) {
    assert.ok((slotColor(png, slot)[1] as number) > (slotColor(png, slot - 1)[1] as number), `slot ${slot} is less red than slot ${slot - 1}`);
  }
  // A finished picture dims the other slots but keeps the one the ball is in.
  const done = renderPlinko([29, 4, 1.5, 0.3, 0.2, 0.3, 1.5, 4, 29], [false, false, false, false, false, false, false, false], PLINKO_ROWS, true);
  assert.notDeepEqual(slotColor(done, 8), [220, 70, 75, 255], 'a slot the ball is not in is dimmed');
});

test('plinko picture: the pegs sit in a triangle with the slots under the last row', () => {
  const layout = boardLayout(8);
  assert.equal(layout.peg(0, 0).x, layout.center, 'the top peg is in the middle');
  assert.equal(layout.peg(3, 0).x + layout.peg(3, 3).x, 2 * layout.center, 'each row is centered');
  close(layout.peg(1, 1).x - layout.peg(1, 0).x, layout.spacing);
  close(layout.peg(4, 2).x, layout.center, 1e-9);
  assert.ok(layout.slot(0).y > layout.peg(7, 0).y, 'the slots are under the pegs');
  close(layout.slot(4).x, layout.center);
  // A ball between two pegs of the last row falls into the slot on either side of the slot line.
  close(layout.peg(7, 3).x - layout.spacing / 2, layout.slot(3).x);
  close(layout.peg(7, 3).x + layout.spacing / 2, layout.slot(4).x);
  const edges = [layout.slot(0).x - layout.spacing / 2, layout.slot(8).x + layout.spacing / 2];
  assert.ok(edges[0]! >= 0 && edges[1]! <= 640, 'the slots fit in the picture');
});

// ---------------------------------------------------------------------------
// Words and the startup check

test('plinko text', () => {
  assert.equal(TEXT.plinko.usage('k!'), 'Use `k!plinko <bet>` to drop a ball, like `k!plinko 100`, or `k!plinko all`.');
  assert.equal(TEXT.plinko.badBet('k!'), `The bet has to be a whole number of ${CURRENCY_EMOJI}, like \`k!plinko 100\`, or \`all\`.`);
  assert.equal(TEXT.plinko.tooSmall('10'), `The smallest bet is **10** ${CURRENCY_EMOJI}.`);
  assert.equal(TEXT.plinko.tooBig('1,000'), `The biggest bet is **1,000** ${CURRENCY_EMOJI}.`);
  assert.equal(TEXT.plinko.cantAfford('k!', '500', '20'), `That bet is **500** ${CURRENCY_EMOJI} and you have **20** ${CURRENCY_EMOJI}. Use \`k!claim\` to earn more.`);
  assert.equal(TEXT.plinko.dropping('<@1>', '100'), `<@1> drops a ball for **100** ${CURRENCY_EMOJI}...`);
  assert.equal(TEXT.plinko.resultTitle('3x'), 'Plinko: 3x');
  assert.equal(TEXT.plinko.landed('<@1>', '100', '3x'), `<@1> bet **100** ${CURRENCY_EMOJI} and the ball landed on **3x**.`);
  assert.equal(TEXT.plinko.payout('300', '+200'), `300 ${CURRENCY_EMOJI} (+200 ${CURRENCY_EMOJI})`);
  assert.equal(TEXT.plinko.footer('98%'), 'The board pays back 98% of a bet on average.');
  assert.equal(TEXT.plinko.againButton('100'), 'Again (100)');
  assert.equal(TEXT.plinko.doubleButton('200'), 'Double (200)');
  assert.equal(TEXT.plinko.halfButton('50'), 'Half (50)');
  // Discord button labels are at most 80 characters.
  assert.ok(TEXT.plinko.doubleButton('1,000,000,000').length <= 80);
});

test('plinko constants: the startup check wants an even number of rows from 2 to 10 and sensible timing', () => {
  validateConstants();
  assert.equal(SPECS.filter((s) => s.key.startsWith('plinko.payout.')).length, PLINKO_ROWS / 2 + 1);
});
