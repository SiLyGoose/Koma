import assert from 'node:assert/strict';
import { test } from 'node:test';
import { EFFECT_IDS, EFFECTS, emptyTotals, modify, robStolenAmount, type EffectId, type PerkDef, type StatId } from '../src/perks/index.js';

/*
 * The perk hooks: a perk lists the stats it changes under `modifies`, and modify() applies every
 * perk that does. These check the rules every perk (including ones added later) has to follow.
 */

const gear = (over: Partial<ReturnType<typeof emptyTotals>>) => ({ ...emptyTotals(), ...over });

/** Every stat some perk modifies, with the perks that modify it. */
function modifiers(): Map<StatId, EffectId[]> {
  const out = new Map<StatId, EffectId[]>();
  for (const id of EFFECT_IDS) {
    const perk: PerkDef = EFFECTS[id];
    for (const stat of Object.keys(perk.modifies ?? {}) as StatId[]) out.set(stat, [...(out.get(stat) ?? []), id]);
  }
  return out;
}

// A base that is in range for every stat (chances and rates are 0 to 1, so 0.5 leaves room both ways).
const BASE = 0.5;
const AMOUNT_BASE = 1000;
const baseFor = (stat: StatId): number => (['robChance', 'wheelChance', 'd20Chance', 'claimTaxRate', 'robTaxRate', 'cooldownScale'].includes(stat) ? BASE : AMOUNT_BASE);

test('stats: with nothing equipped, every stat is just its base', () => {
  for (const stat of modifiers().keys()) {
    const base = baseFor(stat);
    assert.equal(modify(stat, base, emptyTotals(), emptyTotals()), base, stat);
  }
});

test('stats: every perk that says it changes a stat really does, from the side it says', () => {
  for (const [stat, ids] of modifiers()) {
    const base = baseFor(stat);
    for (const id of ids) {
      const perk: PerkDef = EFFECTS[id];
      const fromTarget = perk.modifies?.[stat]?.whose === 'target';
      const worn = gear({ [id]: 0.3 });
      const onRightSide = fromTarget ? modify(stat, base, emptyTotals(), worn) : modify(stat, base, worn, emptyTotals());
      const onWrongSide = fromTarget ? modify(stat, base, worn, emptyTotals()) : modify(stat, base, emptyTotals(), worn);
      assert.notEqual(onRightSide, base, `${id} changes ${stat}`);
      assert.equal(onWrongSide, base, `${id} only counts from the ${fromTarget ? 'target' : 'actor'}`);
    }
  }
});

test('stats: different perks on the same stat stack by multiplying, whoever wears them', () => {
  // 100 stolen, +20% (robAmount), then 2x (glassCannon), then the victim keeps 25% (robShield).
  assert.equal(robStolenAmount(100, gear({ robAmount: 0.2, glassCannon: 1 }), gear({ robShield: 0.25 })), 180);
  assert.equal(robStolenAmount(100, gear({ glassCannon: 1, robAmount: 0.2 }), gear({ robShield: 0.25 })), 180);
});

test('stats: a perk with no settings strength changes nothing', () => {
  for (const [stat, ids] of modifiers()) {
    const base = baseFor(stat);
    for (const id of ids) assert.equal(modify(stat, base, gear({ [id]: 0 }), gear({ [id]: 0 })), base, `${id} at 0 leaves ${stat} alone`);
  }
});
