import assert from 'node:assert/strict';
import { test } from 'node:test';
import { inflateSync } from 'node:zlib';
import { renderCrate } from '../src/animations/images/crate-image.js';
import { crc32 } from '../src/animations/images/png.js';
import type { CommandContext } from '../src/discord/types.js';
import { events as eventCommand } from '../src/commands/events.js';
import { commands } from '../src/commands/index.js';
import { ADMIN_USER_ID, DEFAULTS } from '../src/config.js';
import { CRATE, EVENTS, MAX_CRATE_SECONDS, MINUTE_MS, TEXT, validateConstants } from '../src/constants.js';
import { crumbledEmbed, failedEmbed, grabRow, openedEmbed, crateEmbed, pointCrate } from '../src/events/point-crate.js';
import { claimGuild, isEventRunning } from '../src/events/busy.js';
import { crateFile, prepareEndPictures, setCrateRenderer } from '../src/events/crate-picture.js';
import { GAME_EVENTS, eventChances, findEvent, pickEvent, validateEvents } from '../src/events/registry.js';
import { decideTick, randomGapMs } from '../src/events/timing.js';
import type { GameEvent } from '../src/events/types.js';
import { crateTier, rollPile, splitPile } from '../src/lib/events/crate.js';
import { parseChannelArg } from '../src/lib/parse.js';
import { checkConstraints, findSpec, parseInput, validateSettings } from '../src/lib/settings-spec.js';

// ---------------------------------------------------------------------------
// When events happen
// ---------------------------------------------------------------------------

const NOW = 1_000_000_000_000;
const STALE = EVENTS.staleMs;

test('decideTick: no time yet means pick one; before the time waits; on time fires', () => {
  assert.equal(decideTick(NOW, null, STALE), 'schedule');
  assert.equal(decideTick(NOW, NOW + 1, STALE), 'wait');
  assert.equal(decideTick(NOW, NOW + 3 * MINUTE_MS, STALE), 'wait');
  assert.equal(decideTick(NOW, NOW, STALE), 'fire');
  assert.equal(decideTick(NOW, NOW - 1, STALE), 'fire');
});

test('decideTick: a time that passed while the bot was off is skipped, not fired late (exactly stale is still fired)', () => {
  assert.equal(decideTick(NOW, NOW - STALE, STALE), 'fire');
  assert.equal(decideTick(NOW, NOW - STALE - 1, STALE), 'skip');
  assert.equal(decideTick(NOW, NOW - 5 * 60 * MINUTE_MS, STALE), 'skip');
});

test('randomGapMs: whole minutes from the smallest to the biggest, in milliseconds', () => {
  const seen: number[][] = [];
  const rand = (min: number, max: number) => {
    seen.push([min, max]);
    return max;
  };
  assert.equal(randomGapMs(120, 360, rand), 360 * MINUTE_MS);
  assert.deepEqual(seen, [[120, 360]]);
  assert.equal(randomGapMs(5, 5, (min) => min), 5 * MINUTE_MS);
  for (let i = 0; i < 200; i++) {
    const gap = randomGapMs(10, 12);
    assert.ok(gap >= 10 * MINUTE_MS && gap <= 12 * MINUTE_MS && gap % MINUTE_MS === 0);
  }
});

test('randomGapMs: refuses numbers that make no sense', () => {
  for (const [min, max] of [[0, 5], [5, 4], [1.5, 3], [1, 2.5], [-1, 3], [Number.NaN, 3]] as const) {
    assert.throws(() => randomGapMs(min, max), /whole numbers of minutes/);
  }
});

// ---------------------------------------------------------------------------
// The crate's rules
// ---------------------------------------------------------------------------

test('rollPile: a whole number from the smallest to the biggest, and it refuses a bad range', () => {
  assert.equal(rollPile(200, 600, (min) => min), 200);
  assert.equal(rollPile(200, 600, (_, max) => max), 600);
  assert.equal(rollPile(7, 7), 7);
  for (let i = 0; i < 200; i++) {
    const pile = rollPile(200, 210);
    assert.ok(Number.isInteger(pile) && pile >= 200 && pile <= 210);
  }
  for (const [min, max] of [[0, 5], [6, 5], [1.5, 3], [1, Number.NaN]] as const) assert.throws(() => rollPile(min, max), /crate needs a pile/);
});

test('splitPile: nothing is lost or made up, and nobody gets more than 1 above anyone else', () => {
  for (const pile of [0, 1, 2, 7, 99, 100, 101, 599, 600, 12345]) {
    for (let count = 1; count <= 12; count++) {
      const ids = Array.from({ length: count }, (_, i) => `u${i}`);
      const shares = splitPile(pile, ids);
      assert.deepEqual(shares.map((s) => s.userId), ids, 'same members, same order');
      assert.equal(shares.reduce((sum, s) => sum + s.amount, 0), pile, `pile ${pile} between ${count}`);
      const amounts = shares.map((s) => s.amount);
      assert.ok(Math.max(...amounts) - Math.min(...amounts) <= 1);
      assert.ok(amounts.every((a) => Number.isInteger(a) && a >= 0));
    }
  }
});

test('splitPile: exactly enough for everyone gives everyone the same; the leftovers go to different members', () => {
  assert.deepEqual(splitPile(300, ['a', 'b', 'c']).map((s) => s.amount), [100, 100, 100]);
  assert.deepEqual(splitPile(5, ['a']).map((s) => s.amount), [5]);
  // 10 between 4 = 2 each and 2 left over: two different members get the extra 1, chosen by pick.
  const asked: number[] = [];
  const shares = splitPile(10, ['a', 'b', 'c', 'd'], (below) => {
    asked.push(below);
    return 0;
  });
  assert.deepEqual(asked, [4, 3], 'the second pick is from the members that have not got one');
  assert.deepEqual(shares.map((s) => s.amount), [3, 3, 2, 2]);
  // Picking the last one each time gives them to the last members.
  assert.deepEqual(splitPile(10, ['a', 'b', 'c', 'd'], (below) => below - 1).map((s) => s.amount), [2, 2, 3, 3]);
});

test('splitPile: with nobody it is empty; a member twice or a pile that is not a whole number is refused', () => {
  assert.deepEqual(splitPile(100, []), []);
  assert.throws(() => splitPile(100, ['a', 'a']), /only be in the split once/);
  assert.throws(() => splitPile(10.5, ['a']), /whole number/);
  assert.throws(() => splitPile(-1, ['a']), /whole number/);
});

test('splitPile: a pile smaller than the number of people gives 1 to some and 0 to the rest', () => {
  const shares = splitPile(2, ['a', 'b', 'c', 'd', 'e']);
  assert.equal(shares.filter((s) => s.amount === 1).length, 2);
  assert.equal(shares.filter((s) => s.amount === 0).length, 3);
});

// ---------------------------------------------------------------------------
// The list of events
// ---------------------------------------------------------------------------

const fake = (id: string, weight: number, label = id): GameEvent => ({ id, label, description: '', weight, run: async () => {} });

test('the shipped list of events is valid and includes the crate', () => {
  validateEvents();
  assert.ok(GAME_EVENTS.includes(pointCrate));
  assert.equal(pointCrate.id, 'crate');
});

test('validateEvents: refuses an empty list, repeated or badly written ids, and weights that are not above 0', () => {
  assert.throws(() => validateEvents([]), /no events/);
  assert.throws(() => validateEvents([fake('a', 1), fake('a', 1)]), /used twice/);
  for (const id of ['A', 'two words', '', 'a_b']) assert.throws(() => validateEvents([fake(id, 1)]), /lower-case/);
  for (const weight of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) assert.throws(() => validateEvents([fake('a', weight)]), /weight/);
  assert.throws(() => validateEvents([fake('a', 1, '  ')]), /label/);
  assert.throws(() => validateEvents(Array.from({ length: 26 }, (_, i) => fake(`e${i}`, 1))), /more than 25/);
  validateEvents([fake('a', 1), fake('b-2', 0.5)]);
});

test('pickEvent: each event in proportion to its weight, and the ends of the roll are covered', () => {
  const list = [fake('a', 1), fake('b', 3)];
  assert.equal(pickEvent(list, 0).id, 'a');
  assert.equal(pickEvent(list, 0.2499).id, 'a');
  assert.equal(pickEvent(list, 0.25).id, 'b');
  assert.equal(pickEvent(list, 0.9999999).id, 'b');
  assert.throws(() => pickEvent([]), /no events/);
  assert.equal(pickEvent([fake('only', 1)]).id, 'only');
  const counts = { a: 0, b: 0 };
  for (let i = 0; i < 4000; i++) counts[pickEvent(list).id as 'a' | 'b']++;
  assert.ok(counts.a > 700 && counts.a < 1300, `a was picked ${counts.a} times of 4000`);
});

test('findEvent: by id or by name, ignoring case and spaces at the ends', () => {
  assert.equal(findEvent('crate')?.id, 'crate');
  assert.equal(findEvent('  CRATE ')?.id, 'crate');
  assert.equal(findEvent('Point crate')?.id, 'crate');
  assert.equal(findEvent('point CRATE')?.id, 'crate');
  assert.equal(findEvent('nope'), undefined);
  assert.equal(findEvent(''), undefined);
  assert.equal(findEvent('   '), undefined);
});

test('eventChances: each event\'s share of the random picks, adding up to 1', () => {
  const list = [fake('a', 1), fake('b', 3)];
  assert.deepEqual(eventChances(list).map((c) => c.chance), [0.25, 0.75]);
  assert.deepEqual(eventChances(list).map((c) => c.event.id), ['a', 'b']);
  assert.deepEqual(eventChances([fake('only', 7)]).map((c) => c.chance), [1]);
  assert.deepEqual(eventChances([]), []);
  const total = eventChances().reduce((sum, c) => sum + c.chance, 0);
  assert.ok(Math.abs(total - 1) < 1e-9);
});

test('busy: a server can be claimed once until it is freed, and one server does not affect another', () => {
  const free = claimGuild('busy-test-1');
  assert.ok(free);
  assert.equal(isEventRunning('busy-test-1'), true);
  assert.equal(claimGuild('busy-test-1'), null);
  const other = claimGuild('busy-test-2');
  assert.ok(other);
  free();
  assert.equal(isEventRunning('busy-test-1'), false);
  assert.equal(isEventRunning('busy-test-2'), true);
  const again = claimGuild('busy-test-1');
  assert.ok(again);
  again();
  other();
  // Freeing twice is harmless.
  free();
  assert.equal(isEventRunning('busy-test-1'), false);
});

// ---------------------------------------------------------------------------
// Channel arguments and settings
// ---------------------------------------------------------------------------

test('parseChannelArg: a mention or a bare id, nothing else', () => {
  assert.equal(parseChannelArg('<#123456789012345678>'), '123456789012345678');
  assert.equal(parseChannelArg('123456789012345678'), '123456789012345678');
  for (const bad of [undefined, '', 'general', '#general', '<@123456789012345678>', '<#123>', '1234', '<#123456789012345678', '12345678901234567890123']) {
    assert.equal(parseChannelArg(bad), null, String(bad));
  }
});

test('event settings: defaults are valid, minimum cannot pass maximum, and each has a spec with limits', () => {
  assert.deepEqual(validateSettings(structuredClone(DEFAULTS)), []);
  for (const key of ['events.minMinutes', 'events.maxMinutes', 'events.crate.minPoints', 'events.crate.maxPoints', 'events.crate.seconds']) {
    const spec = findSpec(key);
    assert.ok(spec, key);
    assert.equal(spec.group, 'Events');
  }

  const times = structuredClone(DEFAULTS);
  times.events.minMinutes = 400;
  assert.match(checkConstraints(times) ?? '', /events\.minMinutes/);
  times.events.minMinutes = times.events.maxMinutes;
  assert.equal(checkConstraints(times), null);

  const piles = structuredClone(DEFAULTS);
  piles.events.crate.minPoints = 900;
  assert.match(checkConstraints(piles) ?? '', /events\.crate\.minPoints/);

  const seconds = findSpec('events.crate.seconds');
  assert.ok(seconds);
  assert.equal(parseInput(seconds, '5').ok, false, 'a crate open for 5 seconds is too short to grab');
  assert.equal(parseInput(seconds, String(MAX_CRATE_SECONDS + 1)).ok, false);
  assert.deepEqual(parseInput(seconds, '90'), { ok: true, value: 90 });
  const gap = findSpec('events.minMinutes');
  assert.ok(gap);
  assert.equal(parseInput(gap, '1').ok, false, 'events every minute would be spam');
});

test('the shipped event constants pass the startup check, and bad ones do not', () => {
  validateConstants();
  assert.ok(EVENTS.tickMs >= 10_000);
  assert.ok(EVENTS.staleMs > EVENTS.tickMs);
  assert.ok(CRATE.refreshMs >= 1000);
  assert.ok(CRATE.grabId.length > 0 && CRATE.grabId.length <= 100);
});

// ---------------------------------------------------------------------------
// What the crate looks like
// ---------------------------------------------------------------------------

/** The plain data of an embed, as Discord would receive it. */
const data = (embed: { toJSON(): unknown }) => embed.toJSON() as { title?: string; description?: string; fields?: { name: string; value: string }[]; footer?: { text: string } };

test('crate embed: shows the pile, when it opens, and how many have grabbed', () => {
  const none = data(crateEmbed(450, 1_700_000_000, 0));
  assert.equal(none.title, TEXT.crate.title);
  assert.match(none.description ?? '', /450/);
  assert.match(none.description ?? '', /<t:1700000000:R>/);
  assert.equal(none.fields?.[0]?.value, TEXT.crate.grabbedNobody);
  assert.equal(data(crateEmbed(450, 1, 1)).fields?.[0]?.value, '1 person');
  assert.equal(data(crateEmbed(450, 1, 4)).fields?.[0]?.value, '4 people');
});

test('crate embeds: the picture is shown only when there is one attached, and the picture name is the one the file gets', () => {
  const image = (embed: { toJSON(): unknown }) => (embed.toJSON() as { image?: { url: string } }).image?.url;
  const url = `attachment://${CRATE.imageName}`;
  assert.equal(image(crateEmbed(450, 1, 0)), undefined);
  assert.equal(image(crateEmbed(450, 1, 0, true)), url);
  assert.equal(image(openedEmbed(10, 2, splitPile(10, ['1', '2']), 0)), undefined);
  assert.equal(image(openedEmbed(10, 2, splitPile(10, ['1', '2']), 0, true)), url);
  assert.equal(image(crumbledEmbed(10)), undefined);
  assert.equal(image(crumbledEmbed(10, true)), url);
  // Nothing else about the embed changes with a picture.
  assert.equal(data(crateEmbed(450, 1_700_000_000, 2, true)).description, data(crateEmbed(450, 1_700_000_000, 2)).description);
});

test('crateTier: the lowest third of the range is low, the middle third mid and the top third high', () => {
  assert.equal(crateTier(200, 200, 600), 'low');
  assert.equal(crateTier(333, 200, 600), 'low');
  assert.equal(crateTier(334, 200, 600), 'mid');
  assert.equal(crateTier(466, 200, 600), 'mid');
  assert.equal(crateTier(467, 200, 600), 'high');
  assert.equal(crateTier(600, 200, 600), 'high');
  // Whatever the range is.
  assert.deepEqual([1, 2, 3].map((pile) => crateTier(pile, 1, 3)), ['low', 'mid', 'high']);
  assert.equal(crateTier(50, 1, 100), 'mid');
  // A crate that can only hold one amount is always low, and a piled-up range is fine.
  assert.equal(crateTier(500, 500, 500), 'low');
  assert.equal(crateTier(9_000_000, 1, 10_000_000), 'high');
});

test('crate pictures: each is drawn once per state and glow, named for the embed, and a failure is null and tried again', async () => {
  const drawn: string[] = [];
  let failing = true;
  setCrateRenderer(async (state, tier) => {
    drawn.push(`${state}/${tier}`);
    if (failing && state === 'lost') throw new Error('nope');
    return Buffer.from(`${state}/${tier}`);
  });
  const errors = console.error;
  console.error = () => {};
  try {
    const a = await crateFile('closed', 'mid');
    const b = await crateFile('closed', 'mid');
    assert.equal(a?.name, CRATE.imageName);
    assert.equal(a?.attachment.toString(), 'closed/mid');
    assert.equal(b?.attachment, a?.attachment, 'the same picture again');
    assert.deepEqual(drawn, ['closed/mid'], 'drawn once');
    await crateFile('closed', 'high');
    assert.deepEqual(drawn, ['closed/mid', 'closed/high'], 'another glow is another picture');

    assert.equal(await crateFile('lost', 'low'), null, 'a picture that can not be drawn is null');
    failing = false;
    assert.equal((await crateFile('lost', 'low'))?.attachment.toString(), 'lost/low', 'and it is tried again later');

    drawn.length = 0;
    prepareEndPictures('high');
    await Promise.all([crateFile('opened', 'high'), crateFile('lost', 'high')]);
    assert.deepEqual([...drawn].sort(), ['lost/high', 'opened/high'], 'the end pictures are started early, each once');
  } finally {
    console.error = errors;
    setCrateRenderer(null);
  }
});

/** The pixels of a PNG (and a check of its signature and every chunk's checksum). */
function decodePng(png: Buffer): { width: number; height: number; pixels: Uint8Array } {
  assert.deepEqual([...png.subarray(0, 8)], [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 'PNG signature');
  const parts: Buffer[] = [];
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
    if (type === 'IDAT') parts.push(png.subarray(at + 8, at + 8 + length));
    at += 12 + length;
  }
  const raw = inflateSync(Buffer.concat(parts));
  const pixels = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y++) raw.copy(pixels, y * width * 4, y * (width * 4 + 1) + 1, (y + 1) * (width * 4 + 1));
  return { width, height, pixels };
}

/** How many bright pixels in the picture are emerald, violet and red. */
function glowColours(pixels: Uint8Array): { emerald: number; violet: number; red: number } {
  const counts = { emerald: 0, violet: 0, red: 0 };
  for (let i = 0; i < pixels.length; i += 4) {
    const r = pixels[i] as number;
    const g = pixels[i + 1] as number;
    const b = pixels[i + 2] as number;
    if (g > 200 && g > r + 80 && g > b + 30) counts.emerald++;
    else if (b > 200 && r > 130 && r + 40 < b && g < r - 20) counts.violet++;
    else if (r > 200 && r > g + 110 && r > b + 110) counts.red++;
  }
  return counts;
}

test('crate picture: a 640 by 400 PNG in each state, the three differ, and the runes glow emerald, violet or red by tier', async () => {
  const closed = decodePng(await renderCrate('closed', 'low'));
  const opened = decodePng(await renderCrate('opened', 'low'));
  const lost = decodePng(await renderCrate('lost', 'low'));
  for (const picture of [closed, opened, lost]) assert.deepEqual([picture.width, picture.height], [640, 400]);
  const same = (a: Uint8Array, b: Uint8Array) => a.length === b.length && a.every((v, i) => v === b[i]);
  assert.equal(same(closed.pixels, opened.pixels), false);
  assert.equal(same(closed.pixels, lost.pixels), false);
  assert.equal(same(opened.pixels, lost.pixels), false);

  const mid = decodePng(await renderCrate('closed', 'mid'));
  const high = decodePng(await renderCrate('closed', 'high'));
  const winner = (counts: { emerald: number; violet: number; red: number }) => Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0];
  assert.equal(winner(glowColours(closed.pixels)), 'emerald');
  assert.equal(winner(glowColours(mid.pixels)), 'violet');
  assert.equal(winner(glowColours(high.pixels)), 'red');
  // The chest itself is the same; only the glow changes, so the pictures differ in a small part of the picture.
  let changed = 0;
  for (let i = 0; i < closed.pixels.length; i += 4) if (Math.abs((closed.pixels[i] as number) - (high.pixels[i] as number)) > 40) changed++;
  assert.ok(changed > 200 && changed < 640 * 400 * 0.2, `${changed} pixels changed`);
});

test('crate button: one Grab button with the id the collector looks for, switched off on request', () => {
  const on = grabRow().toJSON().components;
  assert.equal(on.length, 1);
  assert.equal((on[0] as { custom_id: string }).custom_id, CRATE.grabId);
  assert.equal((on[0] as { disabled?: boolean }).disabled ?? false, false);
  assert.equal((grabRow(true).toJSON().components[0] as { disabled?: boolean }).disabled, true);
});

test('opened embed: says how it was split, lists who got what, and notes payouts that failed', () => {
  const even = data(openedEmbed(300, 3, splitPile(300, ['1', '2', '3']), 0));
  assert.equal(even.title, TEXT.crate.openedTitle);
  assert.match(even.description ?? '', /300/);
  assert.match(even.description ?? '', /100/);
  assert.doesNotMatch(even.description ?? '', /lucky/);
  assert.match(even.fields?.[0]?.value ?? '', /<@1> \*\*\+100\*\*/);
  assert.equal(even.footer, undefined);

  const odd = data(openedEmbed(10, 4, splitPile(10, ['1', '2', '3', '4']), 1));
  assert.match(odd.description ?? '', /2 lucky grabbers got 1 more/);
  assert.equal(odd.footer?.text, TEXT.crate.someFailed(1));

  const single = data(openedEmbed(11, 2, splitPile(11, ['1', '2']), 0));
  assert.match(single.description ?? '', /1 lucky grabber got 1 more/);
});

test('opened embed: a long list of grabbers is cut short and still fits an embed field', () => {
  const ids = Array.from({ length: 60 }, (_, i) => String(100000000000000000n + BigInt(i)));
  const shares = splitPile(6000, ids);
  const field = data(openedEmbed(6000, ids.length, shares, 0)).fields?.[0]?.value ?? '';
  assert.ok(field.length <= 1024, `${field.length} characters`);
  assert.equal(field.split('\n').length, CRATE.listMax + 1);
  assert.match(field, /and 45 more/);
});

test('the other results: a crumbled crate says how much blew away, a stuck one asks for the logs', () => {
  assert.match(data(crumbledEmbed(1234)).description ?? '', /1,234/);
  assert.equal(data(crumbledEmbed(5)).title, TEXT.crate.crumbledTitle);
  assert.equal(data(failedEmbed()).description, TEXT.crate.failed);
});

// ---------------------------------------------------------------------------
// The event command (the parts that need no database)
// ---------------------------------------------------------------------------

function fakeContext(userId: string, args: string[]): { ctx: CommandContext; replies: unknown[] } {
  const replies: unknown[] = [];
  const ctx = {
    source: 'message',
    prefix: 'k!',
    guildId: '1',
    guild: {},
    user: { id: userId },
    args,
    reply: async (options: unknown) => {
      replies.push(options);
      return {};
    },
  } as unknown as CommandContext;
  return { ctx, replies };
}

test('event command: registered, admin only, and its names do not clash', () => {
  assert.ok(commands.includes(eventCommand));
  assert.equal(eventCommand.adminOnly, true);
  assert.equal(eventCommand.name, 'events');
  assert.ok(eventCommand.aliases?.includes('event'), 'the old name still works');
  const names = commands.flatMap((c) => [c.name, ...(c.aliases ?? [])]);
  assert.equal(new Set(names).size, names.length);
});

test('event command: a member who is not the bot admin is turned away from every action', async () => {
  for (const args of [[], ['status'], ['list'], ['start'], ['start', 'crate'], ['channel', '<#123456789012345678>'], ['channel', 'off'], ['nonsense']]) {
    const { ctx, replies } = fakeContext('42', args);
    await eventCommand.execute(ctx);
    assert.deepEqual(replies, [TEXT.events.adminOnly], args.join(' '));
  }
});

test('event command: the admin gets a usage hint for an unknown action (channel is not one any more), and an event that does not exist', async () => {
  let { ctx, replies } = fakeContext(ADMIN_USER_ID, ['dance']);
  await eventCommand.execute(ctx);
  assert.deepEqual(replies, [TEXT.events.usage('k!')]);

  // Choosing the channel moved into k!config (see config.test.ts); "channel" is just an
  // unknown action here now, same as any other typo.
  ({ ctx, replies } = fakeContext(ADMIN_USER_ID, ['channel']));
  await eventCommand.execute(ctx);
  assert.deepEqual(replies, [TEXT.events.usage('k!')]);

  ({ ctx, replies } = fakeContext(ADMIN_USER_ID, ['channel', 'general']));
  await eventCommand.execute(ctx);
  assert.deepEqual(replies, [TEXT.events.usage('k!')]);

  ({ ctx, replies } = fakeContext(ADMIN_USER_ID, ['start', 'piñata']));
  await eventCommand.execute(ctx);
  assert.equal(replies.length, 1);
  assert.match(String(replies[0]), /no event called "piñata"/);
  assert.match(String(replies[0]), /`crate`/);
});

test('event command: `list` is not an action any more, it gets the usage hint (the status shows every event)', async () => {
  const { ctx, replies } = fakeContext(ADMIN_USER_ID, ['list']);
  await eventCommand.execute(ctx);
  assert.deepEqual(replies, [TEXT.events.usage('k!')]);
});

test('event command: the usage hint and the help usage name the actions that exist, and say nothing about the channel (that is k!config\'s job now)', () => {
  assert.match(TEXT.events.usage('k!'), /k!events start/);
  assert.doesNotMatch(TEXT.events.usage('k!'), /channel/i, 'the events command has nothing to say about the channel any more');
  assert.doesNotMatch(TEXT.events.usage('k!'), /list/);
  assert.doesNotMatch(eventCommand.usage ?? '', /list/);
  assert.doesNotMatch(eventCommand.usage ?? '', /channel/);
  assert.doesNotMatch(eventCommand.slashUsage ?? '', /list/);
  assert.doesNotMatch(eventCommand.slashUsage ?? '', /channel/);
});
