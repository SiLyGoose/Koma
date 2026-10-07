import assert from 'node:assert/strict';
import { test } from 'node:test';
import { raidStatsEmbed } from '../src/commands/gear.js';
import { DEFAULTS } from '../src/config.js';
import { RAID_COMBAT } from '../src/constants/index.js';
import { ITEMS_BY_ID } from '../src/data/items.js';
import {
  createRaid,
  critChanceOf,
  critMultiplierOf,
  emptyGear,
  equipPlayers,
  guardTakenShare,
  resolvePlayerTurn,
  type RaidChoice,
  type RaidGear,
  type RaidRng,
  type RaidState,
} from '../src/lib/events/raid.js';
import { describeEffects } from '../src/lib/game/items/equipment.js';
import type { ItemDef } from '../src/types.js';

/*
 * The raid stat perks: more HP, harder attacks, crit chance and damage, and stronger heals and guards.
 */

const low: RaidRng = { int: (min) => min, chance: () => false, pick: (items) => items[0] as never };
/** Every chance comes up. */
const lucky: RaidRng = { int: (min) => min, chance: () => true, pick: (items) => items[0] as never };

const choose = (...picks: [string, RaidChoice['action'], string?][]): Map<string, RaidChoice> =>
  new Map(picks.map(([userId, action, target]) => [userId, { action, boost: 0, ...(target ? { target } : {}) }]));

/** A fight against a big dragon, with `a` wearing `gear` and everyone else nothing. */
function fight(gear: Partial<RaidGear>, players = ['a', 'b']): RaidState {
  const state = createRaid('wyrm', players, 100_000, 100, 15, low);
  equipPlayers(state, [{ ...emptyGear(), ...gear }], 100);
  return state;
}

const attackDamage = (events: ReturnType<typeof resolvePlayerTurn>): number =>
  (events.find((e) => e.kind === 'attack') as { damage: number } | undefined)?.damage ?? 0;

test('raid stat items: a 1-star, a 2-star, a 3-star and a 4-star item for each new raid perk', () => {
  for (const [id, stars, slot, effect] of [
    ['boiled-leather-vest', 1, 'armor', 'raidHp'],
    ['chainmail-hauberk', 2, 'armor', 'raidHp'],
    ['troll-hide-cuirass', 3, 'armor', 'raidHp'],
    ['colossus-plate', 4, 'armor', 'raidHp'],
    ['chipped-hand-axe', 1, 'weapon', 'raidAttack'],
    ['steel-warhammer', 2, 'weapon', 'raidAttack'],
    ['dragonslayer-greatsword', 3, 'weapon', 'raidAttack'],
    ['worldbreaker-maul', 4, 'weapon', 'raidAttack'],
    ['throwing-knives', 1, 'weapon', 'raidCritChance'],
    ['hunters-longbow', 2, 'weapon', 'raidCritChance'],
    ['eagle-eye-crossbow', 3, 'weapon', 'raidCritChance'],
    ['moonpiercer-bow', 4, 'weapon', 'raidCritChance'],
    ['barbed-spear', 1, 'weapon', 'raidCritDamage'],
    ['executioners-axe', 2, 'weapon', 'raidCritDamage'],
    ['heartseeker-rapier', 3, 'weapon', 'raidCritDamage'],
    ['godslayer-fang', 4, 'weapon', 'raidCritDamage'],
    ['acolytes-robe', 1, 'armor', 'raidSupport'],
    ['clerics-vestments', 2, 'armor', 'raidSupport'],
    ['saints-mantle', 3, 'armor', 'raidSupport'],
    ['seraphs-raiment', 4, 'armor', 'raidSupport'],
    ['wyrmpiercer', 3, 'weapon', 'maxHpDamage'],
    ['leviathan-harpoon', 4, 'weapon', 'maxHpDamage'],
    ['soulrender', 3, 'weapon', 'healCut'],
    ['hallowed-scythe', 4, 'weapon', 'healCut'],
  ] as const) {
    const item = ITEMS_BY_ID.get(id);
    assert.ok(item, id);
    assert.equal(item.stars, stars, id);
    assert.equal(item.slot, slot, id);
    assert.deepEqual(item.effects, [effect], id);
  }
  assert.deepEqual(describeEffects(ITEMS_BY_ID.get('troll-hide-cuirass') as ItemDef), ['Raid: +30% HP']);
  assert.deepEqual(describeEffects(ITEMS_BY_ID.get('dragonslayer-greatsword') as ItemDef), ['Raid: attacks deal 25% more damage']);
  assert.deepEqual(describeEffects(ITEMS_BY_ID.get('eagle-eye-crossbow') as ItemDef), ['Raid: +12% crit chance']);
  assert.deepEqual(describeEffects(ITEMS_BY_ID.get('heartseeker-rapier') as ItemDef), ['Raid: +60% crit damage']);
  assert.deepEqual(describeEffects(ITEMS_BY_ID.get('saints-mantle') as ItemDef), ['Raid: heals heal 25% more, and your Guard blocks 25% more, for you and the party']);
  // Each tier is stronger than the one below.
  for (const effect of ['raidHp', 'raidAttack', 'raidCritChance', 'raidCritDamage', 'raidSupport'] as const) {
    const tiers = DEFAULTS.equipment[effect];
    assert.ok(tiers[1] < tiers[2] && tiers[2] < tiers[3] && tiers[3] < tiers[4], effect);
  }
});

test('raidHp: the wearer starts the fight with more HP, at full', () => {
  const state = fight({ raidHp: 0.3 });
  assert.deepEqual(state.players.map((p) => [p.hp, p.maxHp]), [[130, 130], [100, 100]]);
});

test('raidAttack: attacks hit harder, before rallies and crits', () => {
  const plain = fight({});
  assert.equal(attackDamage(resolvePlayerTurn(plain, choose(['a', 'attack']), low)), RAID_COMBAT.attack.min);
  const strong = fight({ raidAttack: 0.25 });
  assert.equal(attackDamage(resolvePlayerTurn(strong, choose(['a', 'attack']), low)), Math.round(RAID_COMBAT.attack.min * 1.25));
  // A crit multiplies the stronger hit.
  const crit = fight({ raidAttack: 0.25 });
  assert.equal(attackDamage(resolvePlayerTurn(crit, choose(['a', 'attack']), lucky)), Math.round(RAID_COMBAT.attack.min * 1.25 * RAID_COMBAT.attack.critMultiplier));
});

test('raidCritChance and raidCritDamage: add to the base crit chance and crit multiplier', () => {
  const gear = { gear: { ...emptyGear(), raidCritChance: 0.12, raidCritDamage: 0.6 } };
  assert.equal(critChanceOf(gear), RAID_COMBAT.attack.critChance + 0.12);
  assert.equal(critMultiplierOf(gear), RAID_COMBAT.attack.critMultiplier + 0.6);
  assert.equal(critChanceOf({ gear: { ...emptyGear(), raidCritChance: 5 } }), 1, 'never past certain');

  // The crit roll asks for the wearer's own chance.
  const asked: number[] = [];
  const rng: RaidRng = { ...low, chance: (p) => (asked.push(p), true) };
  const state = fight({ raidCritChance: 0.12, raidCritDamage: 0.6 });
  const damage = attackDamage(resolvePlayerTurn(state, choose(['a', 'attack']), rng));
  assert.equal(asked[0], RAID_COMBAT.attack.critChance + 0.12);
  assert.equal(damage, Math.round(RAID_COMBAT.attack.min * (RAID_COMBAT.attack.critMultiplier + 0.6)));
});

test('raidSupport: heals and revives heal more, and Guard blocks more (adding to guardBoost)', () => {
  const state = fight({ raidSupport: 0.25 });
  (state.players[1] as { hp: number }).hp = 10;
  const healed = resolvePlayerTurn(state, choose(['a', 'heal', 'b']), low);
  assert.deepEqual(healed, [{ kind: 'heal', userId: 'a', targetId: 'b', amount: Math.round(RAID_COMBAT.heal.amount * 1.25), boost: 0 }]);

  const revive = fight({ raidSupport: 0.25 });
  (revive.players[1] as { hp: number }).hp = 0;
  const events = resolvePlayerTurn(revive, choose(['a', 'heal', 'b']), low);
  assert.equal((events[0] as { hp: number }).hp, Math.round(100 * RAID_COMBAT.heal.reviveShare * 1.25));

  const takenShare = RAID_COMBAT.guard.takenShare;
  assert.equal(guardTakenShare({ gear: { ...emptyGear(), raidSupport: 0.25 } }), 1 - (1 - takenShare) * 1.25);
  assert.equal(guardTakenShare({ gear: { ...emptyGear(), raidSupport: 0.25, guardBoost: 0.25 } }), 1 - (1 - takenShare) * 1.5);
});

test('gear stats: the new raid perks show on the card, with what they would be without gear', () => {
  const geared = raidStatsEmbed('Ana', { ...emptyGear(), raidHp: 0.3, raidAttack: 0.25, raidCritChance: 0.12, raidCritDamage: 0.6, raidSupport: 0.25 }, 100, 'k!').toJSON();
  const text = geared.description ?? '';
  const min = RAID_COMBAT.attack.min;
  assert.match(text, /\*\*HP\*\*: 130 \(normally 100\) 🎒/);
  assert.ok(text.includes(`**Attack**: ${Math.round(min * 1.25)} damage (normally ${min}) 🎒`), text);
  assert.ok(text.includes(`**Crit chance**: 22%, for ${Math.round(min * 1.25 * 2.6)} damage 🎒`), text);
  assert.ok(text.includes(`**Heal**: ${Math.round(RAID_COMBAT.heal.amount * 1.25)} HP, or brings back a knocked-out ally with ${Math.round(130 * RAID_COMBAT.heal.reviveShare * 1.25)} HP 🎒`), text);
  assert.match(text, /you take 37\.5% of a hit \(normally 50%\) 🎒/);
  assert.match(text, /the party takes 37\.5% less from attacks that hit several raiders \(normally 30%\) 🎒/);
  assert.doesNotMatch(text, /No raid gear/);
});
