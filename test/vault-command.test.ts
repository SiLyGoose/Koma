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
  assert.match(TEXT.vault.donateUsage('k!'), /k!donate all/);
});

test('vault command: lists where the points came from, and the donors', () => {
  const sources = TEXT.vault.sources('1,000', '250', '40');
  assert.match(sources, /Losses: \*\*1,000\*\*/);
  assert.match(sources, /Donations: \*\*250\*\*/);
  assert.match(sources, /Hourly growth: \*\*40\*\*/);
  assert.equal(sources.split('\n').length, 3);
  const sinceClaim = TEXT.vault.sources('1,000', '250', '40', { at: '<t:1:R>', left: '75' });
  assert.match(sinceClaim, /^Last claimed <t:1:R>, leaving \*\*75\*\*/);
  assert.equal(sinceClaim.split('\n').length, 4);
  assert.match(TEXT.vault.sourcesField(true), /since the last claim/);
  assert.match(TEXT.vault.donorsField(true), /since the last claim/);
  assert.match(TEXT.vault.donorLine(1, '<@1>', '250'), /^1\. <@1>: \*\*250\*\*/);
  assert.match(TEXT.vault.moreDonors(3), /3 more/);
  assert.match(TEXT.vault.noDonors('/'), /\/donate/);
});
