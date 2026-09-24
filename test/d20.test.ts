import assert from 'node:assert/strict';
import { test } from 'node:test';
import { inflateSync } from 'node:zlib';
import type { Message } from 'discord.js';
import { CONFIG } from '../src/config.js';
import { messageContext } from '../src/discord/context.js';
import { replyWithDice } from '../src/animations/dice-reply.js';
import { D20, D20_ANIMATION, TEXT, validateConstants } from '../src/constants/index.js';
import {
  applyD20,
  d20Chance,
  d20Kind,
  d20Multiplier,
  EFFECTS,
  emptyTotals,
  rollD20,
  type D20Dice,
} from '../src/perks/index.js';
import { ITEMS_BY_ID } from '../src/data/items.js';
import { d20Color, dieFrames, renderD20 } from '../src/animations/images/d20-image.js';
import { createEmbed } from '../src/lib/embed.js';
import { describeEffects } from '../src/lib/game/equipment.js';
import { crc32 } from '../src/animations/images/png.js';
import { findSpec } from '../src/lib/settings-spec.js';

const dice = (trigger: number, face: number): D20Dice => ({ trigger, face });

/** The size of a PNG and whether every chunk's checksum is right. */
function pngSize(png: Buffer): { width: number; height: number; pixels: Uint8Array } {
  assert.deepEqual([...png.subarray(0, 8)], [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 'PNG signature');
  const data: Buffer[] = [];
  let width = 0;
  let height = 0;
  let at = 8;
  while (at < png.length) {
    const length = png.readUInt32BE(at);
    const type = png.subarray(at + 4, at + 8).toString('ascii');
    assert.equal(png.readUInt32BE(at + 8 + length), crc32(png.subarray(at + 4, at + 8 + length)), `${type} checksum`);
    if (type === 'IHDR') {
      width = png.readUInt32BE(at + 8);
      height = png.readUInt32BE(at + 12);
    }
    if (type === 'IDAT') data.push(png.subarray(at + 8, at + 8 + length));
    at += 12 + length;
  }
  const raw = inflateSync(Buffer.concat(data));
  const pixels = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y++) raw.copy(pixels, y * width * 4, y * (width * 4 + 1) + 1, (y + 1) * (width * 4 + 1));
  return { width, height, pixels };
}

const pose = (shown: number, over: Partial<{ turn: number; lift: number; squash: number }> = {}) => ({ shown, turn: 0, lift: 0, squash: 1, ...over });

// ---------------------------------------------------------------------------
// The roll

test('d20: the number comes from the face die, 1 to 20, each equally likely', () => {
  assert.equal(rollD20(1, dice(0, 0))?.roll, 1);
  assert.equal(rollD20(1, dice(0, 0.9999999))?.roll, 20);
  assert.equal(rollD20(1, dice(0, 0.5))?.roll, 11);
  const seen = new Set<number>();
  for (let i = 0; i < 20; i++) seen.add(rollD20(1, dice(0, (i + 0.5) / 20))?.roll ?? 0);
  assert.deepEqual([...seen].sort((a, b) => a - b), Array.from({ length: 20 }, (_, i) => i + 1));
  // A face die at exactly 1 (which can't happen, but must not give a 21).
  assert.equal(rollD20(1, dice(0, 1))?.roll, 20);
});

test('d20: it rolls with the chance given and not at all at 0', () => {
  assert.equal(rollD20(0, dice(0, 0.5)), null);
  assert.equal(rollD20(-1, dice(0, 0.5)), null);
  assert.equal(rollD20(Number.NaN, dice(0, 0.5)), null);
  assert.equal(rollD20(0.25, dice(0.24, 0.5))?.roll, 11);
  assert.equal(rollD20(0.25, dice(0.25, 0.5)), null);
  assert.equal(rollD20(1, dice(0.999, 0.5))?.roll, 11);
  assert.equal(rollD20(5, dice(0.999, 0.5))?.roll, 11, 'a chance above 100% is held to 100%');
});

test('d20: 1 is a critical fail, 20 a critical success, and the rest pay the roll divided by 10', () => {
  assert.equal(d20Kind(1), 'fail');
  assert.equal(d20Kind(20), 'success');
  for (let roll = 2; roll <= 19; roll++) assert.equal(d20Kind(roll), 'normal');
  assert.equal(d20Multiplier(1), 0);
  assert.equal(d20Multiplier(2), 0.2);
  assert.equal(d20Multiplier(10), 1);
  assert.equal(d20Multiplier(19), 1.9);
  assert.equal(d20Multiplier(20), 2);
  const roll = rollD20(1, dice(0, 6.5 / 20));
  assert.deepEqual(roll, { roll: 7, kind: 'normal', multiplier: 0.7 });
});

test('d20: the claim after the roll', () => {
  const at = (n: number) => rollD20(1, dice(0, (n - 0.5) / 20)) as NonNullable<ReturnType<typeof rollD20>>;
  assert.equal(applyD20(1000, at(1)), 0, 'a critical fail pays nothing');
  assert.equal(applyD20(1000, at(20)), 2000);
  assert.equal(applyD20(1000, at(10)), 1000);
  assert.equal(applyD20(1000, at(7)), 700);
  assert.equal(applyD20(1000, at(19)), 1900);
  assert.equal(applyD20(15, at(2)), 3, '3 rounds from 3.0');
  assert.equal(applyD20(3, at(2)), 1, 'a low roll on a small claim never rounds to nothing');
  assert.equal(applyD20(0, at(15)), 1, 'but the amount is at least 1 for any roll but a fail');
});

test('d20: the die colors match the wheel: red for a 1, gold for a 20', () => {
  assert.notDeepEqual(d20Color(1), d20Color(20));
  assert.ok(d20Color(1)[0] > d20Color(1)[2], 'a 1 is reddish');
  assert.ok(d20Color(20)[0] > 200 && d20Color(20)[2] < 120, 'a 20 is gold');
});

// ---------------------------------------------------------------------------
// The effect and its settings

test('d20 effect: a normal per-star chance setting, 25/50/75/100% by default, held to 0 to 100%', () => {
  assert.deepEqual([1, 2, 3, 4].map((star) => (CONFIG.equipment.d20 as Record<number, number>)[star]), [0.25, 0.5, 0.75, 1]);
  assert.ok(findSpec('equipment.d20.4'), 'it can be changed with the config command');
  assert.equal(d20Chance(emptyTotals()), 0);
  assert.equal(d20Chance({ ...emptyTotals(), d20: 0.5 }), 0.5);
  assert.equal(d20Chance({ ...emptyTotals(), d20: 9 }), 1);
  assert.equal(d20Chance({ ...emptyTotals(), d20: -1 }), 0);
});

test('d20 item: wearing it lists what the die does, with the chance', () => {
  const item = ITEMS_BY_ID.get('d20');
  assert.ok(item, 'the catalog has the D20');
  assert.deepEqual(item.effects, ['d20']);
  const lines = describeEffects(item);
  assert.equal(lines.length, 1);
  assert.match(lines[0] as string, /100% of your claims roll a D20/);
  assert.match(EFFECTS.d20.text('40%'), /40% of your claims roll a D20/);
});

test('d20 constants: the startup check refuses settings that would break the die', () => {
  validateConstants();
  const animation = { ...D20_ANIMATION };
  const rules = { ...D20 };
  try {
    D20_ANIMATION.frameMs = 100;
    assert.throws(() => validateConstants(), /D20_ANIMATION.frameMs must be at least 500/);
    Object.assign(D20_ANIMATION, animation, { minSeconds: 9 });
    assert.throws(() => validateConstants(), /D20_ANIMATION needs/);
    Object.assign(D20_ANIMATION, animation);
    D20.sides = 2;
    assert.throws(() => validateConstants(), /D20.sides/);
    Object.assign(D20, rules, { critMultiplier: 0.5 });
    assert.throws(() => validateConstants(), /D20.critMultiplier/);
    Object.assign(D20, rules, { divisor: 0 });
    assert.throws(() => validateConstants(), /D20.divisor/);
  } finally {
    Object.assign(D20_ANIMATION, animation);
    Object.assign(D20, rules);
  }
  validateConstants();
});

test('d20 text: the messages say the roll and what it paid', () => {
  assert.match(TEXT.d20.fail('<@1>', 1), /1/);
  assert.match(TEXT.d20.landed(7, '0.7x'), /7.*0\.7x/);
  assert.match(TEXT.d20.critical(20, '2x'), /20.*2x/);
});

// ---------------------------------------------------------------------------
// The picture

test('d20 image: a valid 400 by 400 PNG, with the die drawn on a clear background', () => {
  const img = pngSize(renderD20(pose(13), false));
  assert.equal(img.width, 400);
  assert.equal(img.height, 400);
  assert.equal(img.pixels[3], 0, 'the corner is clear');
  const middle = (200 * 400 + 200) * 4;
  assert.equal(img.pixels[middle + 3], 255, 'the die is opaque in the middle');
  assert.equal(pngSize(renderD20(pose(13), false, 100)).width, 100);
});

test('d20 image: the number, the tumble and the landing all change the picture', () => {
  const base = renderD20(pose(13), false);
  assert.ok(base.equals(renderD20(pose(13), false)), 'drawing is repeatable');
  assert.ok(!base.equals(renderD20(pose(14), false)), 'another number');
  assert.ok(!base.equals(renderD20(pose(13, { turn: 1 }), false)), 'turned');
  assert.ok(!base.equals(renderD20(pose(13, { squash: 0.7 }), false)), 'squashed');
  assert.ok(!base.equals(renderD20(pose(13, { lift: 0.2 }), false)), 'lifted');
  assert.ok(!base.equals(renderD20(pose(13), true)), 'landed has a ring');
});

test('d20 image: the landed die has a ring in its own color, which a tumbling one does not', () => {
  const landed = pngSize(renderD20(pose(20), true));
  const tumbling = pngSize(renderD20(pose(20), false));
  // 1.13 radii (the ring) from the middle, straight up: radius is 0.4 of the picture.
  const y = Math.round(200 - 0.4 * 400 * 1.13);
  const at = (y * 400 + 200) * 4;
  assert.equal(landed.pixels[at + 3], 255);
  assert.equal(tumbling.pixels[at + 3], 0);
  assert.deepEqual([...landed.pixels.subarray(at, at + 3)], d20Color(20).map(Math.round));
});

// ---------------------------------------------------------------------------
// The tumble

test('d20 frames: steps + 1 poses, the last upright on the real roll', () => {
  for (const roll of [1, 7, 20]) {
    const frames = dieFrames(5, roll);
    assert.equal(frames.length, 6);
    assert.deepEqual(frames[5], { shown: roll, turn: 0, lift: 0, squash: 1 });
  }
  assert.equal(dieFrames(1, 9).length, 2);
  assert.throws(() => dieFrames(0, 5), /at least one step/);
  assert.throws(() => dieFrames(2.5, 5), /at least one step/);
});

test('d20 frames: the tumble never shows the real roll early and never repeats a number', () => {
  for (const roll of [1, 2, 10, 19, 20]) {
    for (let start = 0; start < 20; start++) {
      const frames = dieFrames(12, roll, () => start);
      for (let k = 0; k < 12; k++) {
        const shown = (frames[k] as { shown: number }).shown;
        assert.notEqual(shown, roll, `frame ${k} shows the roll early`);
        assert.ok(shown >= 1 && shown <= 20);
        if (k > 0) assert.notEqual(shown, (frames[k - 1] as { shown: number }).shown, `frame ${k} repeats`);
      }
    }
  }
  // A picker that always chooses the same number still gives different ones.
  const stuck = dieFrames(8, 4, () => 3);
  for (let k = 1; k < 8; k++) assert.notEqual((stuck[k] as { shown: number }).shown, (stuck[k - 1] as { shown: number }).shown);
});

test('d20 frames: the die slows to a stop, and the hops and flips die down', () => {
  const frames = dieFrames(10, 5);
  const turns = frames.map((f) => f.turn);
  const steps = turns.slice(1).map((turn, k) => Math.abs(turn - (turns[k] as number)));
  for (let k = 1; k < steps.length; k++) assert.ok((steps[k] as number) <= (steps[k - 1] as number) + 1e-9, `step ${k} turns less than the one before`);
  assert.equal(turns[10], 0);
  assert.ok(frames.every((f) => f.squash > 0.5 && f.squash <= 1));
  assert.ok(frames.every((f) => f.lift >= 0 && f.lift < 0.3));
  // The last tumbling frame is nearly back to upright.
  const nearLast = frames[9] as { turn: number; lift: number; squash: number };
  assert.ok(Math.abs(nearLast.turn) < Math.abs((frames[0] as { turn: number }).turn));
  assert.ok(nearLast.lift < 0.05);
});

// ---------------------------------------------------------------------------
// The reply

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
  const before = { ...D20_ANIMATION };
  Object.assign(D20_ANIMATION, { frameMs: 40, minSeconds: 0.16, maxSeconds: 0.16 });
  try {
    await body();
  } finally {
    Object.assign(D20_ANIMATION, before);
  }
}

test('d20 animation: the reply shows the rolling die, swaps pictures, then ends on the result', async () => {
  await withQuickAnimation(async () => {
    const { message, calls } = fakeMessage();
    const result = createEmbed().setTitle('Result');
    const started = Date.now();
    await replyWithDice(messageContext(message as Message<true>, [], 'k!'), result, { roll: 13, kind: 'normal', multiplier: 1.3 }, { allowedMentions: { users: ['2'] } });
    const elapsed = Date.now() - started;

    assert.equal(calls[0]?.kind, 'reply');
    assert.equal(calls[0]?.options.embeds[0].data.title, TEXT.d20.spinningTitle);
    assert.equal(calls[0]?.options.embeds[0].data.description, '<@1> rolls the D20...');
    assert.deepEqual(calls[0]?.options.allowedMentions.users, ['2']);
    assert.equal(calls[0]?.options.files.length, 1);

    const edits = calls.slice(1);
    assert.ok(edits.length >= 1 && edits.length <= 4, `${edits.length} edits`);
    assert.ok(edits.every((call) => call.kind === 'edit'));
    const last = edits[edits.length - 1];
    assert.equal(last?.options.embeds[0], result, 'the last edit is the real result');
    assert.equal(result.data.image?.url, 'attachment://d20.png');
    assert.equal(last?.options.files.length, 1);
    for (const edit of edits.slice(0, -1)) {
      assert.equal(edit.options.embeds[0].data.title, TEXT.d20.spinningTitle);
      assert.deepEqual(edit.options.attachments, [], 'the old picture is replaced, not kept');
    }
    assert.deepEqual(last?.options.attachments, []);
    assert.ok(elapsed >= 150, `took ${elapsed} ms`);
    const pictures = [calls[0], ...edits].map((call) => call?.options.files[0].attachment as Buffer);
    assert.equal(new Set(pictures.map((p) => p.toString('base64'))).size, pictures.length, 'every picture is different');
    const landing = pictures[pictures.length - 1] as Buffer;
    assert.ok(landing.equals(renderD20({ shown: 13, turn: 0, lift: 0, squash: 1 }, true)), 'the last picture is the die landed on 13');
  });
});

test('d20 animation: if the message can not be edited, the result is sent as a new message', async (t) => {
  t.mock.method(console, 'error', () => {});
  await withQuickAnimation(async () => {
    const { message, calls } = fakeMessage({ editFails: true });
    const result = createEmbed().setTitle('Result');
    await replyWithDice(messageContext(message as Message<true>, [], 'k!'), result, { roll: 1, kind: 'fail', multiplier: 0 });
    const replies = calls.filter((call) => call.kind === 'reply');
    assert.equal(replies.length, 2);
    assert.equal(replies[1]?.options.embeds[0], result);
    assert.equal(replies[1]?.options.files.length, 1);
  });
});
