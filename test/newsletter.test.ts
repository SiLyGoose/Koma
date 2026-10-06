import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ADMIN_USER_ID } from '../src/config.js';
import { CURRENCY_EMOJI, FIELD_MAX_LENGTH, NEWSLETTER, SLASH_EXCLUDED, TEXT } from '../src/constants/index.js';
import { commands } from '../src/commands/index.js';
import { PER_SERVER_CHANNELS } from '../src/commands/config.js';
import { newsletter } from '../src/commands/newsletter.js';
import type { CommandContext } from '../src/discord/types.js';
import { raidWeek } from '../src/lib/events/raid-week.js';
import { summarizeRobs, type RobEntry } from '../src/lib/newsletter.js';
import { textAfterCommand } from '../src/lib/parse.js';
import { robLines, weekDate, weeklyDigest } from '../src/newsletter/digest.js';
import { bossForWeek } from '../src/lib/events/raid-boss.js';
import { parsePatchNotes, parseVersion, sectionHeading } from '../src/lib/patch-notes.js';
import { patchNotesEmbed } from '../src/newsletter/patch-notes.js';

const at = (minute: number): Date => new Date(Date.UTC(2026, 9, 5, 12, minute));
const won = (robber: string, victim: string, amount: number, minute: number): RobEntry => ({ userId: robber, otherUserId: victim, delta: amount, reason: 'rob_won', createdAt: at(minute) });

// ---------------------------------------------------------------------------
// Robs

test('newsletter robs: nothing to say about a week without robs', () => {
  assert.deepEqual(summarizeRobs([]), { attempts: 0, gotAway: 0, slipped: 0, caught: 0, biggest: null, topRobber: null, mostRobbed: null });
  assert.deepEqual(robLines({ robs: [] }), [TEXT.newsletter.robsNone]);
});

test('newsletter robs: counts, the biggest heist, the top robber and the most robbed', () => {
  const robs: RobEntry[] = [
    won('A', 'B', 300, 1),
    won('A', 'C', 200, 2),
    won('D', 'B', 450, 3),
    { userId: 'E', otherUserId: 'A', delta: -100, reason: 'rob_fine_paid', createdAt: at(4) },
    // Entries the summary doesn't look at.
    { userId: 'B', otherUserId: 'A', delta: -300, reason: 'rob_lost', createdAt: at(1) },
  ];
  const summary = summarizeRobs(robs);
  assert.equal(summary.attempts, 4);
  assert.equal(summary.gotAway, 3);
  assert.equal(summary.caught, 1);
  assert.equal(summary.slipped, 0);
  assert.deepEqual(summary.biggest, { robber: 'D', victim: 'B', amount: 450 });
  assert.deepEqual(summary.topRobber, { userId: 'A', amount: 500, count: 2 });
  assert.deepEqual(summary.mostRobbed, { userId: 'B', amount: 750, count: 2 });

  const lines = robLines({ robs });
  assert.equal(lines[0], '**4** robs: 3 got away, 1 got caught.');
  assert.equal(lines[1], `💸 Biggest heist: <@D> took **450** ${CURRENCY_EMOJI} from <@B>`);
  assert.equal(lines[2], `🥷 Top robber: <@A>, **500** ${CURRENCY_EMOJI} from 2 robs`);
  assert.equal(lines[3], `🎯 Most robbed: <@B>, lost **750** ${CURRENCY_EMOJI} in 2 robs`);
});

test('newsletter robs: a rob that slipped (written with its rob_won, at the same moment) counts for nobody', () => {
  const robs: RobEntry[] = [
    won('A', 'B', 900, 1),
    { userId: 'A', otherUserId: 'B', delta: -990, reason: 'rob_slip_paid', createdAt: at(1) },
    won('C', 'B', 100, 2),
    // The same robber and victim a minute later is another rob, which stuck.
    won('A', 'B', 50, 3),
  ];
  const summary = summarizeRobs(robs);
  assert.equal(summary.attempts, 3);
  assert.equal(summary.gotAway, 2);
  assert.equal(summary.slipped, 1);
  assert.deepEqual(summary.biggest, { robber: 'C', victim: 'B', amount: 100 });
  assert.deepEqual(summary.topRobber, { userId: 'C', amount: 100, count: 1 });
  assert.match(robLines({ robs })[0]!, /, 1 slipped\.$/);
});

// ---------------------------------------------------------------------------
// The digest

test('newsletter digest: only the week\'s boss and the robs, with no picture', () => {
  const covered = raidWeek(new Date('2026-10-02T12:00:00Z'));
  const upcoming = raidWeek(covered.next);
  const boss = bossForWeek('g', upcoming.key);
  const digest = weeklyDigest('g', { robs: [won('A', 'B', 300, 1)] }, covered, upcoming);
  assert.deepEqual(Object.keys(digest), ['embeds']);
  assert.equal(digest.embeds.length, 1);
  const embed = digest.embeds[0]!.toJSON();
  assert.ok(embed.description?.includes(TEXT.newsletter.newBoss(`${TEXT.raid.bosses[boss].emoji} ${TEXT.raid.bosses[boss].name}`, false)));
  assert.deepEqual(embed.fields?.map((f) => f.name), [TEXT.newsletter.robsField(false)]);
});

test('newsletter digest: off for now, so the scheduler is never started', () => {
  assert.equal(NEWSLETTER.weeklyDigest, false);
});

test('newsletter: the week is named by the day it started, in the raid time zone', () => {
  // 00:30 Eastern on Saturday 2026-10-03: the new week.
  assert.equal(weekDate(raidWeek(new Date('2026-10-03T04:30:00Z'))), 'October 3');
  // Friday evening Eastern is still the week that started on the 26th.
  assert.equal(weekDate(raidWeek(new Date('2026-10-03T02:00:00Z'))), 'September 26');
});

// ---------------------------------------------------------------------------
// The command

function fakeContext(userId: string, args: string[], text?: string): { ctx: CommandContext; replies: unknown[] } {
  const replies: unknown[] = [];
  const ctx = {
    source: 'message',
    prefix: 'k!',
    guildId: '1',
    guild: {},
    user: { id: userId },
    args,
    text,
    reply: async (options: unknown) => {
      replies.push(options);
      return {};
    },
  } as unknown as CommandContext;
  return { ctx, replies };
}

test('newsletter command: registered, admin only, prefix only', () => {
  assert.ok(commands.includes(newsletter));
  assert.equal(newsletter.adminOnly, true);
  assert.ok(SLASH_EXCLUDED.includes('newsletter'));
  assert.deepEqual([...PER_SERVER_CHANNELS], ['channel', 'newsletter']);
});

test('newsletter command: only the bot admin can use it; the admin gets the usage for anything else', async () => {
  for (const args of [[], ['patch', 'hi'], ['preview']]) {
    const { ctx, replies } = fakeContext('42', args);
    await newsletter.execute(ctx);
    assert.deepEqual(replies, [TEXT.newsletter.adminOnly], args.join(' '));
  }
  // `note` is gone: patch notes are how news goes out now.
  for (const args of [['send'], ['note', 'hi']]) {
    const { ctx, replies } = fakeContext(ADMIN_USER_ID, args);
    await newsletter.execute(ctx);
    assert.deepEqual(replies, [TEXT.newsletter.usage('k!')], args.join(' '));
  }
});

test('newsletter command: patch notes need a version and some text, and not too much (checked before anything is looked up)', async () => {
  for (const [args, text] of [
    [['patch'], 'patch'],
    [['patch', '1.0'], 'patch 1.0'],
  ] as const) {
    const { ctx, replies } = fakeContext(ADMIN_USER_ID, [...args], text);
    await newsletter.execute(ctx);
    assert.deepEqual(replies, [TEXT.newsletter.patchEmpty('k!')], text);
  }

  // Notes written without a version: the first word isn't one.
  let { ctx, replies } = fakeContext(ADMIN_USER_ID, ['patch', 'Added', '-', 'x'], 'patch\nAdded\n- x');
  await newsletter.execute(ctx);
  assert.deepEqual(replies, [TEXT.newsletter.patchBadVersion('k!', 'Added')]);

  const long = 'x'.repeat(NEWSLETTER.maxPatchLength + 1);
  ({ ctx, replies } = fakeContext(ADMIN_USER_ID, ['patch', '1.0', long], `patch 1.0 ${long}`));
  await newsletter.execute(ctx);
  assert.deepEqual(replies, [TEXT.newsletter.patchTooLong(NEWSLETTER.maxPatchLength)]);
});

test('newsletter command: patch notes with only headings, or a section too long for its field, are refused', async () => {
  let { ctx, replies } = fakeContext(ADMIN_USER_ID, ['patch', '1.0', 'Added', 'Fixed'], 'patch 1.0\nAdded\nFixed:');
  await newsletter.execute(ctx);
  assert.deepEqual(replies, [TEXT.newsletter.patchEmpty('k!')]);

  const lines = Array.from({ length: 40 }, (_, i) => `- change number ${i} with a few more words on it`).join('\n');
  ({ ctx, replies } = fakeContext(ADMIN_USER_ID, ['patch', '1.0'], `patch 1.0\nFixed\n${lines}`));
  await newsletter.execute(ctx);
  assert.deepEqual(replies, [TEXT.newsletter.patchSectionTooLong(TEXT.newsletter.patchSections.fixed, FIELD_MAX_LENGTH)]);
});

// ---------------------------------------------------------------------------
// Patch notes

test('patch notes: the version is a number like 1.0, with or without a "v", and anything else is not one', () => {
  assert.equal(parseVersion('1.0'), '1.0');
  assert.equal(parseVersion('v2.3.1'), '2.3.1');
  assert.equal(parseVersion('V1.4-beta'), '1.4-beta');
  assert.equal(parseVersion('3'), '3');
  for (const word of ['Added', 'v', '1.', '1..2', 'one', '', undefined]) assert.equal(parseVersion(word), null, String(word));
});

test('patch notes: a heading is a section name alone, however it is dressed up', () => {
  for (const line of ['Added', 'added:', '## New', '**Changed**', '  Updates: ', 'FIXED', 'Removed']) assert.notEqual(sectionHeading(line), null, line);
  for (const line of ['- Added the databank', 'Fixed a bug', 'New!', '']) assert.equal(sectionHeading(line), null, line);
  assert.equal(sectionHeading('new'), 'added');
  assert.equal(sectionHeading('updated'), 'changed');
});

test('patch notes: the intro, then each section in a fixed order, bullets tidied and blank lines dropped', () => {
  const notes = parsePatchNotes(
    ['Big week!', '', 'Thanks for playing.', 'Fixed', '- The wheel spun twice', 'Added:', '- Raid bosses in the databank', '', '* Multi pull guarantee', 'Fixed', '• Pity shows on singles'].join('\n'),
  );
  assert.equal(notes.intro, 'Big week!\n\nThanks for playing.');
  assert.deepEqual(notes.sections, [
    { section: 'added', lines: ['• Raid bosses in the databank', '• Multi pull guarantee'] },
    { section: 'fixed', lines: ['• The wheel spun twice', '• Pity shows on singles'] },
  ]);

  // Plain text with no headings is all intro, as patch notes always were.
  assert.deepEqual(parsePatchNotes('- Robs read better\n- STONKS! on k!bal'), { intro: '- Robs read better\n- STONKS! on k!bal', sections: [] });
  // A heading with nothing under it is left out.
  assert.deepEqual(parsePatchNotes('Removed\nAdded\n- x').sections, [{ section: 'added', lines: ['• x'] }]);
});

test('patch notes: the post has the intro on top and a field per section', () => {
  const embed = patchNotesEmbed('1.0', parsePatchNotes('Hi!\nChanged\n- a\n- b\nAdded\n- c')).toJSON();
  assert.equal(embed.title, '🛠️ Patch notes v1.0');
  assert.equal(embed.description, 'Hi!');
  assert.deepEqual(embed.fields, [
    { name: TEXT.newsletter.patchSections.added, value: '• c' },
    { name: TEXT.newsletter.patchSections.changed, value: '• a\n• b' },
  ]);
  assert.equal(patchNotesEmbed('1.0', parsePatchNotes('Fixed\n- x')).toJSON().description, undefined);
});

test('textAfterCommand: everything after the command name, line breaks kept', () => {
  assert.equal(textAfterCommand('k!newsletter patch\n- Robs read better\n- STONKS! on k!bal', 'k!'), 'patch\n- Robs read better\n- STONKS! on k!bal');
  assert.equal(textAfterCommand('K!News   patch  hi ', 'k!'), 'patch  hi');
  assert.equal(textAfterCommand('k!newsletter', 'k!'), '');
});
