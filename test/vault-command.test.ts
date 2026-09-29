import assert from 'node:assert/strict';
import { test } from 'node:test';
import { commandMap } from '../src/commands/index.js';
import { vault } from '../src/commands/vault.js';
import { CURRENCY_EMOJI, TEXT } from '../src/constants/index.js';
import { hasSlash } from '../src/discord/slash.js';

test('vault command: registered for everyone, with a slash version', () => {
  assert.equal(commandMap.get('vault'), vault);
  assert.notEqual(vault.adminOnly, true);
  assert.ok(hasSlash('vault'));
});

test('vault command: says what has been lost and what a vault breaker would attempt', () => {
  assert.equal(TEXT.vault.commandTitle, 'Vault');
  const line = TEXT.vault.commandInfo('1,000', '2,000', '2x');
  assert.match(line, /1,000/);
  assert.match(line, /2,000/);
  assert.match(line, /\(2x\)/);
  assert.ok(line.includes(CURRENCY_EMOJI));
});

test('events command: the vault moved out of it', () => {
  assert.equal('vaultField' in TEXT.events, false);
  assert.match(TEXT.vault.commandInfo('1', '10', '10x'), /next vault game/);
  assert.equal('vaultInfo' in TEXT.events, false);
});

test('donate command: registered for everyone, with a slash version', async () => {
  const { donate } = await import('../src/commands/donate.js');
  assert.equal(commandMap.get('donate'), donate);
  assert.notEqual(donate.adminOnly, true);
  assert.ok(hasSlash('donate'));
});

test('donate command: says what was given and what the vault holds now', () => {
  const line = TEXT.vault.donateDone('<@1>', '500', '10,500');
  assert.match(line, /500/);
  assert.match(line, /10,500/);
  assert.ok(line.includes(CURRENCY_EMOJI));
  assert.doesNotMatch(line, /at most/);
  assert.match(TEXT.vault.donateDone('<@1>', '500', '10,500', '5,000'), /at most \*\*.*5,000/);
  assert.doesNotMatch(TEXT.vault.commandInfo('10,500', '5,000', 'x1'), /at most/);
  assert.match(TEXT.vault.donateUsage('k!'), /k!donate all/);
});

test('vault command: the donor and source breakdown moved to the leaderboard', () => {
  for (const key of ['sources', 'sourcesField', 'donorsField', 'donorLine', 'moreDonors', 'noDonors']) assert.equal(key in TEXT.vault, false);
  assert.match(TEXT.leaderboard.noDonors('/'), /\/donate/);
});

test('leaderboard: buttons for balances, top donors and losses', async () => {
  const { LEADERBOARD_BUTTONS } = await import('../src/constants/index.js');
  const ids = [LEADERBOARD_BUTTONS.balanceId, LEADERBOARD_BUTTONS.donorsId, LEADERBOARD_BUTTONS.lossesId];
  assert.equal(new Set(ids).size, 3);
  assert.equal(TEXT.leaderboard.donorsButton, 'Top donors');
  assert.equal(TEXT.leaderboard.lossesButton, 'Losses');
});

test('leaderboard: losses count every casino bet and payout, and the vault fines', async () => {
  const { LOSS_REASONS } = await import('../src/services/vault.js');
  for (const reason of ['plinko_bet', 'plinko_payout', 'blackjack_refund', 'mines_payout', 'd20_penalty', 'heist_fine'] as const) {
    assert.ok(LOSS_REASONS.includes(reason), reason);
  }
  assert.ok(!LOSS_REASONS.includes('vault_donation'));
});
