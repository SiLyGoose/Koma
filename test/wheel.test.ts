import assert from 'node:assert/strict';
import { test } from 'node:test';
import { CONFIG } from '../src/config.js';
import type { Message } from 'discord.js';
import { messageContext } from '../src/discord/context.js';
import { replyWithWheel, spinSteps } from '../src/animations/wheel-reply.js';
import { MAX_WHEEL_SLICES, TEXT, WHEEL_ANIMATION, validateConstants } from '../src/constants/index.js';
import {
  applyWheel,
  emptyTotals,
  spinWheel,
  validateWheel,
  WHEEL_SLICES,
  wheelChance,
  type WheelDice,
} from '../src/perks/index.js';
import { createEmbed } from '../src/lib/embed.js';
import { describeEffects } from '../src/lib/game/equipment.js';
import { formatMultiplier } from '../src/lib/format.js';
import { crc32, encodePng } from '../src/animations/images/png.js';
import { pixelAt, readPng } from './helpers/png.js';
import { landingTurn, renderSpinningWheel, renderWheel, sliceColor, spinTurns } from '../src/animations/images/wheel-image.js';
import type { ItemDef } from '../src/types.js';

const dice = (trigger: number, slice: number, offset = 0.5): WheelDice => ({ trigger, slice, offset });


// ---------------------------------------------------------------------------
// PNG writer

test('png: the checksum matches the standard test value', () => {
  assert.equal(crc32(Buffer.from('123456789')), 0xcbf43926);
  assert.equal(crc32(new Uint8Array(0)), 0);
});

test('png: pixels survive the round trip and the file is well formed', () => {
  const pixels = new Uint8Array([255, 0, 0, 255, 0, 255, 0, 128, 0, 0, 255, 0, 10, 20, 30, 40]);
  const img = readPng(encodePng(2, 2, pixels));
  assert.deepEqual(img.chunks, ['IHDR', 'IDAT', 'IEND']);
  assert.equal(img.width, 2);
  assert.equal(img.height, 2);
  assert.deepEqual([...img.pixels], [...pixels]);
});

test('png: refuses a size that does not match the pixels', () => {
  assert.throws(() => encodePng(2, 2, new Uint8Array(15)), /does not match/);
  assert.throws(() => encodePng(0, 2, new Uint8Array(0)), /Bad PNG size/);
});

// ---------------------------------------------------------------------------
// The wheel picture

const SLICES = [1, 0.1, 1.5, 0.4, 2, 0.75, 1.25, 1];

test('wheel picture: a valid square PNG with a transparent background and the pointer at the top', () => {
  const img = readPng(renderWheel(SLICES, { index: 4, offset: 0.4 }, 256));
  assert.equal(img.width, 256);
  assert.equal(img.height, 256);
  assert.equal(pixelAt(img, 0, 0)[3], 0, 'corner is transparent');
  assert.equal(pixelAt(img, 255, 255)[3], 0);
  // Just below the top edge, in the middle: the red pointer.
  const red = pixelAt(img, 128, Math.round(256 * 0.5 - 256 * 0.42 - 256 * 0.02));
  assert.deepEqual(red, [237, 66, 69, 255]);
});

test('wheel picture: the slice under the pointer keeps its bright color and the others are dimmed', () => {
  for (let index = 0; index < SLICES.length; index++) {
    const img = readPng(renderWheel(SLICES, { index, offset: 0.4 }, 256));
    // On the pointer's line, out toward the rim (past where the labels sit).
    const top = pixelAt(img, 128, Math.round(128 - 0.8 * 0.42 * 256));
    assert.deepEqual(top, [...sliceColor(SLICES[index] as number), 255], `slice ${index} is bright under the pointer`);
  }
  // A slice on the opposite side (half a turn away) is the dimmed version of its color.
  const img = readPng(renderWheel(SLICES, { index: 0, offset: 0.4 }, 256));
  const bottom = pixelAt(img, 128, Math.round(128 + 0.8 * 0.42 * 256));
  assert.notDeepEqual(bottom.slice(0, 3), [...sliceColor(SLICES[4] as number)]);
});

test('wheel picture: the same spin draws the same picture, a different landing draws a different one', () => {
  const a = renderWheel(SLICES, { index: 2, offset: 0.3 }, 128);
  assert.ok(a.equals(renderWheel(SLICES, { index: 2, offset: 0.3 }, 128)));
  assert.ok(!a.equals(renderWheel(SLICES, { index: 3, offset: 0.3 }, 128)));
  assert.ok(!a.equals(renderWheel(SLICES, { index: 2, offset: 0.7 }, 128)));
});

test('wheel picture: works for any slice count from 2 to the maximum, and refuses a bad landing', () => {
  for (const count of [2, 3, 5, MAX_WHEEL_SLICES]) {
    const slices = Array.from({ length: count }, (_, i) => 0.5 + i * 0.25);
    const img = readPng(renderWheel(slices, { index: count - 1, offset: 0.5 }, 128));
    assert.equal(img.width, 128);
  }
  assert.throws(() => renderWheel([1], { index: 0, offset: 0.5 }), /at least two/);
  assert.throws(() => renderWheel(SLICES, { index: 8, offset: 0.5 }), /not on the wheel/);
  assert.throws(() => renderWheel(SLICES, { index: -1, offset: 0.5 }), /not on the wheel/);
});

test('wheel picture: the full size stays a reasonable file', () => {
  const png = renderWheel(SLICES, { index: 4, offset: 0.4 });
  assert.equal(readPng(png).width, 512);
  assert.ok(png.length < 100_000, `${png.length} bytes`);
});

test('wheel picture: slice colors run from red (small) through blue (1x) to green and gold (big)', () => {
  assert.notDeepEqual(sliceColor(0.1), sliceColor(0.75));
  assert.notDeepEqual(sliceColor(1), sliceColor(1.5));
  assert.notDeepEqual(sliceColor(1.5), sliceColor(2));
  assert.deepEqual(sliceColor(2), sliceColor(5));
});

// ---------------------------------------------------------------------------
// Spinning

test('spin: it spins with the given chance and never when the chance is 0', () => {
  assert.equal(spinWheel(0, dice(0, 0)), null);
  assert.equal(spinWheel(-1, dice(0, 0)), null);
  assert.ok(spinWheel(1, dice(0.999999, 0)), 'a chance of 100% always spins');
  assert.ok(spinWheel(0.5, dice(0.499, 0)));
  assert.equal(spinWheel(0.5, dice(0.5, 0)), null);
  assert.ok(spinWheel(7, dice(0.999999, 0)), 'a chance over 100% is held to 100%');
});

test('spin: each slice is picked by the slice roll, and the offset stays off the slice edges', () => {
  const slices = [1, 2, 3, 4];
  assert.equal(spinWheel(1, dice(0, 0), slices)?.index, 0);
  assert.equal(spinWheel(1, dice(0, 0.26), slices)?.multiplier, 2);
  assert.equal(spinWheel(1, dice(0, 0.51), slices)?.multiplier, 3);
  assert.equal(spinWheel(1, dice(0, 0.999999), slices)?.index, 3);
  assert.ok(Math.abs((spinWheel(1, dice(0, 0, 0), slices)?.offset ?? 0) - 0.1) < 1e-9);
  assert.ok(Math.abs((spinWheel(1, dice(0, 0, 0.999), slices)?.offset ?? 0) - 0.8992) < 1e-9);
  assert.equal(spinWheel(1, dice(0, 0), []), null);
});

test('spin: the multiplied amount is rounded and never below 1', () => {
  assert.equal(applyWheel(400, 2), 800);
  assert.equal(applyWheel(400, 0.1), 40);
  assert.equal(applyWheel(333, 1.5), 500); // 499.5 rounds up
  assert.equal(applyWheel(3, 0.1), 1);
  assert.equal(applyWheel(1, 0.1), 1);
  assert.equal(applyWheel(200, 1), 200);
});

// ---------------------------------------------------------------------------
// The wheel data and the effect

test('wheel data: the wheel is valid and stays within the picture limits', () => {
  validateWheel();
  assert.ok(WHEEL_SLICES.length >= 2 && WHEEL_SLICES.length <= MAX_WHEEL_SLICES);
});

test('wheel data: the startup check refuses a wheel that would break', () => {
  validateWheel([0.1, 2]);
  assert.throws(() => validateWheel([1]), /2 to 16 slices/);
  assert.throws(() => validateWheel(Array.from({ length: MAX_WHEEL_SLICES + 1 }, () => 1)), /2 to 16 slices/);
  assert.throws(() => validateWheel([1, 0]), /more than 0/);
  assert.throws(() => validateWheel([1, -1]), /more than 0/);
  assert.throws(() => validateWheel([1, Number.NaN]), /more than 0/);
  assert.throws(() => validateWheel([1, 101]), /at most/);
});

test('wheelSpin effect: a normal per-star setting that is the chance a claim or rob spins, held to 0 to 100%', () => {
  assert.equal(CONFIG.equipment.wheelSpin[4], 1);
  assert.equal(wheelChance(emptyTotals()), 0);
  assert.equal(wheelChance({ ...emptyTotals(), wheelSpin: 0.5 }), 0.5);
  assert.equal(wheelChance({ ...emptyTotals(), wheelSpin: 9 }), 1);
  assert.equal(wheelChance({ ...emptyTotals(), wheelSpin: -1 }), 0);
  const chair: ItemDef = { id: 'test-chair', name: 'Test Chair', stars: 4, slot: 'armor', description: '', effects: ['wheelSpin'] };
  const lines = describeEffects(chair);
  assert.equal(lines.length, 1);
  assert.match(lines[0] as string, /100% of your claims and successful robs spin the wheel/);
});

test('multipliers read like 1.5x', () => {
  assert.equal(formatMultiplier(1.5), '1.5x');
  assert.equal(formatMultiplier(2), '2x');
  assert.equal(formatMultiplier(0.1), '0.1x');
  assert.equal(formatMultiplier(0.125), '0.13x');
});

// ---------------------------------------------------------------------------
// The animation

test('animation: the turns end exactly where the wheel lands, moving one way and slowing down', () => {
  const landing = { index: 5, offset: 0.35 };
  for (const steps of [1, 2, 6, 10]) {
    const turns = spinTurns(SLICES.length, landing, steps);
    assert.equal(turns.length, steps + 1);
    assert.equal(turns[steps], landingTurn(SLICES.length, landing));
    for (let k = 1; k <= steps; k++) assert.ok((turns[k] as number) > (turns[k - 1] as number), 'always turning the same way');
    for (let k = 2; k <= steps; k++) {
      const step = (turns[k] as number) - (turns[k - 1] as number);
      const before = (turns[k - 1] as number) - (turns[k - 2] as number);
      assert.ok(step < before + 1e-9, `step ${k} is no bigger than the one before`);
    }
  }
  assert.throws(() => spinTurns(8, landing, 0), /at least one step/);
  assert.throws(() => spinTurns(8, landing, 2.5), /at least one step/);
});

test('animation: the first picture is well before the landing, and a step never turns close to half the wheel', () => {
  const turns = spinTurns(SLICES.length, { index: 0, offset: 0.5 }, 6);
  const total = (turns[6] as number) - (turns[0] as number);
  assert.ok(Math.abs(total - 1.25 * 2 * Math.PI) < 1e-9);
  // Small enough steps that the eye reads it as spinning rather than jumping.
  assert.ok((turns[1] as number) - (turns[0] as number) < Math.PI * 0.9);
});

test('animation: a spinning picture has every slice bright, unlike the finished one', () => {
  const landing = { index: 0, offset: 0.4 };
  const turn = landingTurn(SLICES.length, landing);
  const stopped = readPng(renderWheel(SLICES, landing, 256));
  const spinning = readPng(renderSpinningWheel(SLICES, turn, 256));
  const bottom = (img: typeof stopped) => pixelAt(img, 128, Math.round(128 + 0.8 * 0.42 * 256));
  // Half a turn from the pointer is slice 4 (the 2x slice): dimmed when stopped, full color when spinning.
  assert.deepEqual(bottom(spinning), [...sliceColor(SLICES[4] as number), 255]);
  assert.notDeepEqual(bottom(stopped), [...sliceColor(SLICES[4] as number), 255]);
  // The slice under the pointer looks the same in both.
  const top = (img: typeof stopped) => pixelAt(img, 128, Math.round(128 - 0.8 * 0.42 * 256));
  assert.deepEqual(top(spinning), top(stopped));
  // Any turn works, including negative and over a full circle.
  for (const t of [-7, 0, 3, 40]) assert.equal(readPng(renderSpinningWheel(SLICES, t, 64)).width, 64);
  assert.throws(() => renderSpinningWheel([1], 0), /at least two/);
});

test('animation: a spin lasts between the shortest and longest time, one picture change per frame', () => {
  const seen = new Set<number>();
  for (let i = 0; i < 300; i++) seen.add(spinSteps());
  const { frameMs, minSeconds, maxSeconds } = WHEEL_ANIMATION;
  const fewest = (minSeconds * 1000) / frameMs;
  const most = (maxSeconds * 1000) / frameMs;
  assert.equal(Math.min(...seen), fewest);
  assert.equal(Math.max(...seen), most);
  assert.ok(fewest * frameMs >= 3000 && most * frameMs <= 5000);
});

test('animation: the shipped animation settings pass the startup check, and a too-fast one does not', () => {
  validateConstants();
  const before = { ...WHEEL_ANIMATION };
  try {
    WHEEL_ANIMATION.frameMs = 100;
    assert.throws(() => validateConstants(), /frameMs must be at least 500/);
    Object.assign(WHEEL_ANIMATION, before, { minSeconds: 6 });
    assert.throws(() => validateConstants(), /minSeconds <= maxSeconds/);
  } finally {
    Object.assign(WHEEL_ANIMATION, before);
  }
  validateConstants();
  assert.equal(TEXT.wheel.spinning('<@1>'), '<@1> spins the wheel...');
});

/** A stand-in for a Discord message that records what the bot sends and edits. */
function fakeMessage(options: { editFails?: boolean } = {}) {
  const calls: { kind: 'reply' | 'edit'; at: number; options: any }[] = [];
  const sent = {
    edit: async (o: unknown) => {
      calls.push({ kind: 'edit', at: Date.now(), options: o });
      if (options.editFails) throw new Error('edit failed');
      return sent;
    },
  };
  const message = {
    author: { toString: () => '<@1>' },
    reply: async (o: unknown) => {
      calls.push({ kind: 'reply', at: Date.now(), options: o });
      return sent;
    },
  } as unknown as Message;
  return { message, calls };
}

/** Runs `body` with a quick animation (4 steps of 40 ms) and puts the settings back afterwards. */
async function withQuickAnimation(body: () => Promise<void>): Promise<void> {
  const before = { ...WHEEL_ANIMATION };
  Object.assign(WHEEL_ANIMATION, { frameMs: 40, minSeconds: 0.16, maxSeconds: 0.16 });
  try {
    await body();
  } finally {
    Object.assign(WHEEL_ANIMATION, before);
  }
}

test('animation: the reply shows the spinning wheel, swaps pictures, then ends on the result', async () => {
  await withQuickAnimation(async () => {
    const { message, calls } = fakeMessage();
    const result = createEmbed().setTitle('Result');
    const started = Date.now();
    await replyWithWheel(messageContext(message as Message<true>, [], 'k!'), result, { index: 4, multiplier: 2, offset: 0.4 }, { allowedMentions: { users: ['2'] } });
    const elapsed = Date.now() - started;

    assert.equal(calls[0]?.kind, 'reply');
    assert.equal(calls[0]?.options.embeds[0].data.title, TEXT.wheel.spinningTitle);
    assert.equal(calls[0]?.options.embeds[0].data.description, '<@1> spins the wheel...');
    assert.deepEqual(calls[0]?.options.allowedMentions.users, ['2']);
    assert.equal(calls[0]?.options.files.length, 1);

    const edits = calls.slice(1);
    assert.ok(edits.length >= 1 && edits.length <= 4, `${edits.length} edits`);
    assert.ok(edits.every((call) => call.kind === 'edit'));
    const last = edits[edits.length - 1];
    assert.equal(last?.options.embeds[0], result, 'the last edit is the real result');
    assert.equal(result.data.image?.url, 'attachment://wheel.png');
    assert.equal(last?.options.files.length, 1);
    for (const edit of edits.slice(0, -1)) {
      assert.equal(edit.options.embeds[0].data.title, TEXT.wheel.spinningTitle);
      assert.deepEqual(edit.options.attachments, [], 'the old picture is replaced, not kept');
    }
    assert.deepEqual(last?.options.attachments, []);
    // Frames are paced, and the result comes when the spin ends (4 steps of 40 ms).
    assert.ok(elapsed >= 150, `took ${elapsed} ms`);
    assert.ok((last?.at ?? 0) - (calls[0]?.at ?? 0) >= 150);
    // Every picture is a different image, and the last is the finished one.
    const pictures = [calls[0], ...edits].map((call) => call?.options.files[0].attachment as Buffer);
    assert.equal(new Set(pictures.map((p) => p.toString('base64'))).size, pictures.length);
    assert.ok(pictures[pictures.length - 1]?.equals(renderWheel(WHEEL_SLICES, { index: 4, offset: 0.4 })));
  });
});

test('animation: if the message can not be edited, the result is sent as a new message', async (t) => {
  t.mock.method(console, 'error', () => {});
  await withQuickAnimation(async () => {
    const { message, calls } = fakeMessage({ editFails: true });
    const result = createEmbed().setTitle('Result');
    await replyWithWheel(messageContext(message as Message<true>, [], 'k!'), result, { index: 1, multiplier: 0.1, offset: 0.5 });
    const replies = calls.filter((call) => call.kind === 'reply');
    assert.equal(replies.length, 2);
    assert.equal(replies[1]?.options.embeds[0], result);
    assert.equal(replies[1]?.options.files.length, 1);
  });
});
