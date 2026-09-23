import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DEFAULTS } from '../src/config.js';
import { MAX_VAULT_MULTIPLIER, MAX_VAULT_SECONDS, TEXT, VAULT, validateConstants } from '../src/constants.js';
import { GAME_EVENTS, validateEvents } from '../src/events/registry.js';
import { failedEmbed, heldEmbed, joinRow, notEnoughEmbed, successEmbed, vaultBreaker, vaultEmbed } from '../src/events/vault-breaker.js';
import { splitPile } from '../src/lib/events/crate.js';
import { vaultChance } from '../src/lib/events/vault.js';
import { checkConstraints, findSpec, parseInput, validateSettings } from '../src/lib/settings-spec.js';

// ---------------------------------------------------------------------------
// The vault breaker's rules
// ---------------------------------------------------------------------------

test('vaultChance: 0 below minPlayers, base at exactly minPlayers, rising per joiner, capped at maxChance', () => {
  assert.equal(vaultChance(0, 3, 0.3, 0.1, 0.9), 0);
  assert.equal(vaultChance(2, 3, 0.3, 0.1, 0.9), 0);
  assert.equal(vaultChance(3, 3, 0.3, 0.1, 0.9), 0.3);
  assert.equal(vaultChance(4, 3, 0.3, 0.1, 0.9), 0.4);
  assert.equal(vaultChance(5, 3, 0.3, 0.1, 0.9), 0.5);
  assert.equal(vaultChance(9, 3, 0.3, 0.1, 0.9), 0.9);
  assert.equal(vaultChance(50, 3, 0.3, 0.1, 0.9), 0.9, 'never above maxChance, however many join');
  // Whatever the numbers are, it never exceeds maxChance and is never negative.
  for (let joiners = 0; joiners < 30; joiners++) {
    const c = vaultChance(joiners, 5, 0.2, 0.15, 0.85);
    assert.ok(c >= 0 && c <= 0.85);
  }
});

// ---------------------------------------------------------------------------
// The list of events
// ---------------------------------------------------------------------------

test('the shipped list of events includes the vault breaker, with a valid id, label and weight', () => {
  validateEvents();
  assert.ok(GAME_EVENTS.includes(vaultBreaker));
  assert.equal(vaultBreaker.id, 'vault');
  assert.ok(vaultBreaker.label.length > 0);
  assert.ok(vaultBreaker.weight > 0);
  assert.equal(typeof vaultBreaker.run, 'function');
  assert.equal(typeof vaultBreaker.resume, 'function');
});

// ---------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------

test('vault settings: defaults are valid, and each has a spec in the Events group with sane limits', () => {
  assert.deepEqual(validateSettings(structuredClone(DEFAULTS)), []);
  for (const key of [
    'events.vault.minPlayers',
    'events.vault.joinSeconds',
    'events.vault.multiplier',
    'events.vault.fine',
    'events.vault.baseChance',
    'events.vault.chancePerPlayer',
    'events.vault.maxChance',
  ]) {
    const spec = findSpec(key);
    assert.ok(spec, key);
    assert.equal(spec.group, 'Events');
  }
});

test('vault settings: baseChance cannot pass maxChance', () => {
  const bad = structuredClone(DEFAULTS);
  bad.events.vault.baseChance = 0.95;
  assert.match(checkConstraints(bad) ?? '', /events\.vault\.baseChance/);
  bad.events.vault.baseChance = bad.events.vault.maxChance;
  assert.equal(checkConstraints(bad), null, 'equal is fine');
});

test('vault settings: joinSeconds and multiplier are held to their limits', () => {
  const joinSeconds = findSpec('events.vault.joinSeconds');
  assert.ok(joinSeconds);
  assert.equal(parseInput(joinSeconds, '10').ok, false, 'joining for 10 seconds is too short');
  assert.equal(parseInput(joinSeconds, String(MAX_VAULT_SECONDS + 1)).ok, false);
  assert.deepEqual(parseInput(joinSeconds, '120'), { ok: true, value: 120 });

  const multiplier = findSpec('events.vault.multiplier');
  assert.ok(multiplier);
  assert.equal(parseInput(multiplier, '0').ok, false, 'a vault breaker has to attempt something');
  assert.equal(parseInput(multiplier, String(MAX_VAULT_MULTIPLIER + 1)).ok, false);
  assert.deepEqual(parseInput(multiplier, '5x'), { ok: true, value: 5 });

  const chance = findSpec('events.vault.baseChance');
  assert.ok(chance);
  assert.deepEqual(parseInput(chance, '30%'), { ok: true, value: 0.3 });
  assert.equal(parseInput(chance, '101%').ok, false);
});

test('the shipped vault constants pass the startup check', () => {
  validateConstants();
  assert.ok(VAULT.refreshMs >= 1000);
  assert.ok(VAULT.joinId.length > 0 && VAULT.joinId.length <= 100);
  assert.ok(MAX_VAULT_SECONDS > 0);
  assert.ok(MAX_VAULT_MULTIPLIER > 0);
});

// ---------------------------------------------------------------------------
// What the vault breaker looks like
// ---------------------------------------------------------------------------

/** The plain data of an embed, as Discord would receive it. */
const data = (embed: { toJSON(): unknown }) => embed.toJSON() as { title?: string; description?: string; fields?: { name: string; value: string }[]; footer?: { text: string } };

test('vault embed: shows the prize, when it closes, and how many have joined', () => {
  const none = data(vaultEmbed(5000, 1_700_000_000, 0, 3));
  assert.equal(none.title, TEXT.vault.title);
  assert.match(none.description ?? '', /5,000/);
  assert.match(none.description ?? '', /<t:1700000000:R>/);
  assert.equal(none.fields?.[0]?.value, TEXT.vault.joinedNobody);
  assert.equal(data(vaultEmbed(5000, 1, 1, 3)).fields?.[0]?.value, '1 person (needs 3)');
  assert.equal(data(vaultEmbed(5000, 1, 3, 3)).fields?.[0]?.value, '3 people');
  assert.equal(data(vaultEmbed(5000, 1, 4, 3)).fields?.[0]?.value, '4 people');
});

test('vault button: one Join button with the id the collector looks for, switched off on request', () => {
  const on = joinRow().toJSON().components;
  assert.equal(on.length, 1);
  assert.equal((on[0] as { custom_id: string }).custom_id, VAULT.joinId);
  assert.equal((on[0] as { disabled?: boolean }).disabled ?? false, false);
  assert.equal((joinRow(true).toJSON().components[0] as { disabled?: boolean }).disabled, true);
});

test('success embed: says how it was split, lists who got what, and notes payouts that failed', () => {
  const even = data(successEmbed(300, 3, '50%', splitPile(300, ['1', '2', '3']), 0));
  assert.equal(even.title, TEXT.vault.successTitle);
  assert.match(even.description ?? '', /300/);
  assert.match(even.description ?? '', /100/);
  assert.match(even.description ?? '', /50%/);
  assert.doesNotMatch(even.description ?? '', /lucky/);
  assert.match(even.fields?.[0]?.value ?? '', /<@1> \*\*\+100\*\*/);
  assert.equal(even.footer, undefined);

  const odd = data(successEmbed(10, 4, '90%', splitPile(10, ['1', '2', '3', '4']), 1));
  assert.match(odd.description ?? '', /2 lucky crackers got 1 more/);
  assert.equal(odd.footer?.text, TEXT.vault.someFailed(1));
});

test('held embed: the odds, how many joined, and the fine each paid', () => {
  const held = data(heldEmbed('40%', 5, 50));
  assert.equal(held.title, TEXT.vault.failTitle);
  assert.match(held.description ?? '', /40%/);
  assert.match(held.description ?? '', /5/);
  assert.match(held.description ?? '', /50/);
});

test('not enough embed: how many joined against the minimum', () => {
  const short = data(notEnoughEmbed(1, 3));
  assert.equal(short.title, TEXT.vault.notEnoughTitle);
  assert.match(short.description ?? '', /1/);
  assert.match(short.description ?? '', /3/);
});

test('failed embed: a plain apology, no numbers to get wrong', () => {
  const failed = data(failedEmbed());
  assert.equal(failed.title, TEXT.vault.failedTitle);
  assert.equal(failed.description, TEXT.vault.failed);
});
