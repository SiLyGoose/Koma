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
