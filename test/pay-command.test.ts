import assert from 'node:assert/strict';
import { test } from 'node:test';
import { commandMap } from '../src/commands/index.js';
import { pay } from '../src/commands/pay.js';
import { CURRENCY_EMOJI, TEXT } from '../src/constants/index.js';
import { hasSlash } from '../src/discord/slash.js';
import type { CommandContext } from '../src/discord/types.js';

/*
 * The pay command (commands/pay.ts): registered for everyone, with a slash version, and what it says
 * back before anything moves. (Moving the points is services/economy/shared.ts transferClamped.)
 */

/** Runs pay with `args` typed after the prefix, and returns what it replied. */
async function run(args: string[]): Promise<unknown[]> {
  const replies: unknown[] = [];
  const ctx = { args, prefix: 'k!', user: { id: '1' }, guildId: 'g', reply: async (m: unknown) => void replies.push(m) } as unknown as CommandContext;
  await pay.execute(ctx);
  return replies;
}

test('pay command: registered for everyone, with a slash version', () => {
  assert.equal(commandMap.get('pay'), pay);
  assert.notEqual(pay.adminOnly, true);
  assert.ok(hasSlash('pay'));
});

test('pay command: without a member and an amount it says how to use it; a bad amount is refused', async () => {
  assert.deepEqual(await run([]), [TEXT.pay.usage('k!')]);
  assert.deepEqual(await run(['<@2>']), [TEXT.pay.usage('k!')]);
  assert.match(TEXT.pay.usage('k!'), /k!pay @user all/);
  for (const amount of ['0', '-5', 'lots', '1.5']) assert.deepEqual(await run(['<@2>', amount]), [TEXT.pay.badAmount]);
});

test('pay command: says who paid whom, and how much', () => {
  const line = TEXT.pay.done('<@1>', '<@2>', '1,500');
  assert.match(line, /<@1> paid <@2>/);
  assert.match(line, /1,500/);
  assert.ok(line.includes(CURRENCY_EMOJI));
  assert.match(TEXT.pay.tooPoor('20'), /20/);
});
