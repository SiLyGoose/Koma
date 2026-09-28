import assert from 'node:assert/strict';
import { test } from 'node:test';
import { commandMap } from '../src/commands/index.js';
import { GROUPS } from '../src/commands/config.js';
import { forge } from '../src/commands/forge.js';
import { DEFAULTS } from '../src/config.js';
import { GEM_EMOJI, REFINE, TEXT } from '../src/constants/index.js';
import { ITEMS, ITEMS_BY_ID } from '../src/data/items.js';
import { hasSlash } from '../src/discord/slash.js';
import { bestCopy } from '../src/lib/game/items/copies.js';
import { bonusState, describeEffects, gearEffects } from '../src/lib/game/items/equipment.js';
import { refinePlan } from '../src/lib/game/items/refine.js';
import { worstCopies, worstCopy } from '../src/lib/game/items/sell.js';
import { SPECS } from '../src/lib/settings-spec.js';

const ruby = ITEMS_BY_ID.get('ruby-pickaxe')!;
const at = (n: number) => new Date(Date.UTC(2026, 0, n));
const copy = (_id: string, level: number, obtained: number, masterwork?: boolean) => ({ _id, level, obtainedAt: at(obtained), masterwork });

test('refine bonus: only on 4-star items, at the top level', () => {
  for (const item of ITEMS) {
    if (!item.bonus) continue;
    assert.equal(item.stars, 4, `${item.id} has a bonus but isn't 4-star`);
    assert.equal(item.bonus.level, REFINE.maxLevel);
  }
  assert.ok(ruby.bonus);
});

test('refine bonus: reaching R5 is not enough, the copy has to be forged into a masterwork with komaGems', () => {
  assert.equal(bonusState(ruby, 4, true), 'too_low');
  assert.equal(bonusState(ruby, 5, false), 'dormant');
  assert.equal(bonusState(ruby, 5, true), 'masterwork');
  assert.equal(bonusState(ITEMS_BY_ID.get('diamond-pickaxe')!, 5, true), 'none');

  // The Ruby Pickaxe's bonus removes its energy penalty, only once it's a masterwork.
  const locked = gearEffects({ weapon: ruby.id, levels: { weapon: 5 }, bonuses: { weapon: false } }, 'u');
  const forged = gearEffects({ weapon: ruby.id, levels: { weapon: 5 }, bonuses: { weapon: true } }, 'u');
  assert.ok(locked.pickaxeEnergyPenalty > 0);
  assert.equal(forged.pickaxeEnergyPenalty, 0);
  // Gear that doesn't say (the catalog describing itself) counts as a masterwork.
  assert.equal(gearEffects({ weapon: ruby.id }, 'u').pickaxeEnergyPenalty, 0);

  const lockedLines = describeEffects(ruby, 1, 5, false);
  assert.match(lockedLines.at(-1)!, /^🔒 Masterwork \(`forge` for/);
  assert.ok(lockedLines.at(-1)!.includes(GEM_EMOJI));
  assert.ok(lockedLines.some((line) => /extra ⚡|⚡ each/.test(line)), 'the penalty still shows while dormant');
  assert.match(describeEffects(ruby, 1, 5, true).at(-1)!, /^✨ Masterwork: /);
  assert.ok(!describeEffects(ruby, 1, 4, false).some((line) => line.includes('bonus')), 'hidden below R5');
});

test('refine bonus: a masterwork copy is worn first, sold last and never used up by a refine', () => {
  const plain = copy('plain', 5, 1);
  const paid = copy('paid', 5, 2, true);
  assert.equal(bestCopy([plain, paid])?._id, 'paid');
  assert.equal(worstCopy([paid, plain])?._id, 'plain');
  assert.deepEqual(worstCopies([paid, plain, copy('low', 1, 3)], 3).map((c) => c._id), ['low', 'plain', 'paid']);

  const worn = copy('worn', 3, 1);
  const plan = refinePlan([worn, paid], new Set(['worn']));
  assert.equal(plan.ok, false, 'the only spare is a masterwork, so there is nothing to use up');
});

test('forge command: registered for everyone as forge and mw, with a slash version and a price setting', () => {
  assert.equal(commandMap.get('forge'), forge);
  assert.equal(commandMap.get('mw'), forge);
  assert.notEqual(forge.adminOnly, true);
  assert.ok(hasSlash('forge'));
  assert.equal(DEFAULTS.refine.masterworkGems, 25);
  assert.ok(SPECS.some((spec) => spec.key === 'refine.masterworkGems'));
  assert.ok(GROUPS.includes('Refine'));
  assert.match(TEXT.forge.tooLow('k!', 'Ruby Pickaxe', 3, 5), /R3.*R5.*k!refine Ruby Pickaxe/);
});
