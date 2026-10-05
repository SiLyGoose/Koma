import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ADMIN_USER_ID } from '../src/config.js';
import { CURRENCY_EMOJI, NEWSLETTER, SLASH_EXCLUDED, TEXT } from '../src/constants/index.js';
import { commands } from '../src/commands/index.js';
import { PER_SERVER_CHANNELS } from '../src/commands/config.js';
import { newsletter } from '../src/commands/newsletter.js';
import type { CommandContext } from '../src/discord/types.js';
import { raidWeek } from '../src/lib/events/raid-week.js';
import { summarizeRaid, summarizeRobs, type RobEntry } from '../src/lib/newsletter.js';
import { textAfterCommand } from '../src/lib/parse.js';
import { raidLines, robLines, weekDate } from '../src/newsletter/digest.js';
import type { RaidDoc } from '../src/types.js';

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
// The raid

const raid = (over: Partial<RaidDoc>): RaidDoc => ({
  _id: 'g:2026-10-03',
  guildId: 'g',
  weekKey: '2026-10-03',
  boss: 'reaper',
  startedBy: 'A',
  status: 'won',
  channelId: null,
  messageId: null,
  players: ['A', 'B', 'C'],
  spent: {},
  stolen: {},
  createdAt: at(0),
  rounds: 9,
  lastHit: 'B',
  ...over,
});
const stats = (damage: number, healed: number, mitigated: number) =>
  ({ damage, healed, mitigated, guards: 0, supports: 0, actions: 0, spent: 0, stolen: 0 }) as never;

test('newsletter raid: who did the most, and who landed the final blow', () => {
  const summary = summarizeRaid(raid({ stats: { A: stats(500, 0, 30), B: stats(800, 120, 0), C: stats(800, 40, 90) } }));
  assert.deepEqual(summary?.topDamage, { userId: 'B', amount: 800 }, 'a tie goes to whoever joined first');
  assert.deepEqual(summary?.topHealer, { userId: 'B', amount: 120 });
  assert.deepEqual(summary?.topGuard, { userId: 'C', amount: 90 });

  const lines = raidLines({ raid: raid({ stats: { A: stats(500, 0, 0), B: stats(800, 0, 0), C: stats(0, 0, 0) } }), extraRaid: null }, 'wyrm');
  assert.deepEqual(lines, ['The party of 3 beat **💀 Soul Reaper** in 9 rounds!', '🗡️ Most damage: <@B> (**800**)', '⭐ Final blow: <@B>']);
});

test('newsletter raid: a raid from before every stat was kept falls back to its damage', () => {
  assert.deepEqual(summarizeRaid(raid({ damage: { A: 10, C: 40 } }))?.topDamage, { userId: 'C', amount: 40 });
});

test('newsletter raid: a wipe, a boss that left, an extra raid, one still going, and none at all', () => {
  assert.match(raidLines({ raid: raid({ status: 'wiped' }), extraRaid: null }, 'wyrm')[0]!, /Soul Reaper\*\* wiped out the party of 3 in round 9/);
  assert.match(raidLines({ raid: raid({ status: 'fled', boss: 'wyrm' }), extraRaid: null }, 'wyrm')[0]!, /Ember Wyrm\*\* flew off before/);
  const withExtra = raidLines({ raid: raid({}), extraRaid: raid({ status: 'wiped', players: ['A'], rounds: 4 }) }, 'wyrm');
  assert.equal(withExtra[1], 'Extra raid: **💀 Soul Reaper** wiped out the party of 1 in round 4.');
  assert.deepEqual(raidLines({ raid: raid({ status: 'fighting' }), extraRaid: null }, 'wyrm'), ['The raid against **💀 Soul Reaper** is still going.']);
  assert.equal(summarizeRaid(raid({ status: 'preparing' })), null);
  assert.deepEqual(raidLines({ raid: null, extraRaid: null }, 'wyrm'), ['Nobody took on **🐉 Ember Wyrm**.']);
  // No final blow when the boss wasn't beaten.
  assert.ok(!raidLines({ raid: raid({ status: 'wiped' }), extraRaid: null }, 'wyrm').some((line) => line.includes('Final blow')));
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
  for (const args of [[], ['patch', 'hi'], ['note', 'hi'], ['preview']]) {
    const { ctx, replies } = fakeContext('42', args);
    await newsletter.execute(ctx);
    assert.deepEqual(replies, [TEXT.newsletter.adminOnly], args.join(' '));
  }
  const { ctx, replies } = fakeContext(ADMIN_USER_ID, ['send']);
  await newsletter.execute(ctx);
  assert.deepEqual(replies, [TEXT.newsletter.usage('k!')]);
});

test('newsletter command: patch notes need some text, and not too much (checked before anything is looked up)', async () => {
  let { ctx, replies } = fakeContext(ADMIN_USER_ID, ['patch'], 'patch');
  await newsletter.execute(ctx);
  assert.deepEqual(replies, [TEXT.newsletter.patchEmpty('k!')]);

  const long = 'x'.repeat(NEWSLETTER.maxPatchLength + 1);
  ({ ctx, replies } = fakeContext(ADMIN_USER_ID, ['patch', long], `patch ${long}`));
  await newsletter.execute(ctx);
  assert.deepEqual(replies, [TEXT.newsletter.patchTooLong(NEWSLETTER.maxPatchLength)]);
});

test('textAfterCommand: everything after the command name, line breaks kept', () => {
  assert.equal(textAfterCommand('k!newsletter patch\n- Robs read better\n- STONKS! on k!bal', 'k!'), 'patch\n- Robs read better\n- STONKS! on k!bal');
  assert.equal(textAfterCommand('K!News   patch  hi ', 'k!'), 'patch  hi');
  assert.equal(textAfterCommand('k!newsletter', 'k!'), '');
});
