import assert from 'node:assert/strict';
import { test } from 'node:test';
import { commandMap } from '../src/commands/index.js';
import { skip } from '../src/commands/skip.js';
import { GROUPS } from '../src/commands/config.js';
import { DEFAULTS } from '../src/config.js';
import { CURRENCY_EMOJI, HOUR_MS, TEXT } from '../src/constants/index.js';
import { hasSlash } from '../src/discord/slash.js';
import { dayKey } from '../src/lib/events/raid-week.js';
import { skipPrice, skipsUsedOn } from '../src/lib/game/skips.js';
import { SPECS } from '../src/lib/settings-spec.js';
import { claimReadyHour, hasBonusClaim } from '../src/services/economy/claim.js';
import { extraRaidId, raidId } from '../src/services/raid.js';
import { claimSkip, findSkip, SKIPS } from '../src/services/skips.js';
import type { MemberDoc } from '../src/types.js';

const HOUR = 500_000;
const NOW = HOUR * HOUR_MS + 10 * 60_000; // 10 minutes into HOUR

const member = (fields: Partial<MemberDoc>): MemberDoc =>
  ({ guildId: 'g', userId: 'u', points: 1000, lastClaimHour: -1, lastRobAt: null, totalPulls: 0, ...fields }) as MemberDoc;

test('skipPrice: the base price, doubled for each skip already made today', () => {
  assert.deepEqual([0, 1, 2, 3].map((used) => skipPrice(300, used)), [300, 600, 1200, 2400]);
  assert.equal(skipPrice(0, 5), 0, 'a free skip stays free');
  assert.equal(skipPrice(300, 2000), Number.MAX_SAFE_INTEGER, 'never overflows');
});

test('skipsUsedOn: only skips made on that day count', () => {
  assert.equal(skipsUsedOn(undefined, '2026-09-28'), 0);
  assert.equal(skipsUsedOn({ day: '2026-09-28', count: 2 }, '2026-09-28'), 2);
  assert.equal(skipsUsedOn({ day: '2026-09-27', count: 5 }, '2026-09-28'), 0, 'a new day starts over');
});

test('dayKey: the date in Eastern time, so the day turns over at midnight Eastern', () => {
  assert.equal(dayKey(new Date('2026-09-28T03:59:00Z')), '2026-09-27', '11:59pm EDT');
  assert.equal(dayKey(new Date('2026-09-28T04:00:00Z')), '2026-09-28', 'midnight EDT');
  assert.equal(dayKey(new Date('2026-01-15T05:00:00Z')), '2026-01-15', 'midnight EST');
});

test('claim skip: only when waiting, and clearing it makes the claim ready now', () => {
  assert.equal(findSkip('CLAIM'), claimSkip);
  const claim = claimSkip;
  assert.equal(claim.waitingUntil(member({ lastClaimHour: -1 }), NOW), null, 'never claimed');
  assert.equal(claim.waitingUntil(member({ lastClaimHour: HOUR - 1 }), NOW), null, 'claimed last hour');
  assert.equal(claim.waitingUntil(member({ lastClaimHour: HOUR, bonusClaimHour: HOUR }), NOW), null, 'has a bonus claim left');

  for (const waiting of [member({ lastClaimHour: HOUR }), member({ lastClaimHour: HOUR - 1, claimGapHours: 2 }), member({ lastClaimHour: HOUR, claimGapHours: 2 })]) {
    const until = claim.waitingUntil(waiting, NOW);
    assert.ok(until !== null && until * 1000 > NOW);
    const { filter, set } = claim.clear(waiting, NOW);
    assert.equal(filter.lastClaimHour, waiting.lastClaimHour);
    const after = { ...waiting, ...set };
    assert.ok(claimReadyHour(after) <= HOUR && !hasBonusClaim(after, HOUR));
    assert.equal(claim.waitingUntil(after, NOW), null);
    assert.ok(after.lastClaimHour >= HOUR - 1, "STONKS! sees a one-hour wait, not the time before the last claim");
  }
});

test('skip command: registered for everyone, with a slash version, a setting and text for every skip', () => {
  assert.equal(commandMap.get('skip'), skip);
  assert.notEqual(skip.adminOnly, true);
  assert.ok(hasSlash('skip'));
  assert.ok(GROUPS.includes('Skip'));
  for (const s of SKIPS) {
    assert.ok(SPECS.some((spec) => spec.key === `skip.${s.id}`), `skip.${s.id} is a setting`);
    assert.ok(TEXT.skip.names[s.id] && TEXT.skip.waits[s.id]);
  }
  assert.equal(DEFAULTS.skip.claim, 300);
  assert.equal(DEFAULTS.skip.raid, 50_000);
  assert.deepEqual(SKIPS.map((s) => s.id), ['claim', 'raid']);
  assert.ok(TEXT.skip.claimHint('k!', '300').includes('k!skip claim'));
  assert.ok(TEXT.skip.claimHint('k!', '300').includes(CURRENCY_EMOJI));
});

test("raid skip: the extra raid has its own id next to the week's, so it can only be bought once", () => {
  assert.equal(raidId('g', '2026-09-26'), 'g:2026-09-26');
  assert.equal(extraRaidId('g', '2026-09-26'), 'g:2026-09-26:extra');
  assert.notEqual(extraRaidId('g', '2026-09-26'), extraRaidId('g', '2026-10-03'));
  const hint = TEXT.skip.raidHint('k!', '50,000');
  assert.match(hint, /k!skip raid/);
  assert.match(hint, /50,000/);
  assert.ok(!hint.includes('**'), 'a footer shows no markdown');
  assert.match(TEXT.skip.raidNotYet('/'), /\/raid/);
  assert.match(TEXT.skip.listLine('Raid', '50,000', null, true), /already used/);
});
