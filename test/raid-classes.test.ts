import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DEFAULTS } from '../src/config.js';
import { RAID_CLASS_EMOJI, RAID_CLASS_IDS, RAID_CLASSES, RAID_COMBAT, RAID_DIFFICULTY, RAID_NO_CLASS, TEXT, type RaidBossId, type RaidClassId } from '../src/constants/index.js';
import { ITEMS, ITEMS_BY_ID } from '../src/data/items.js';
import { itemBlock, itemDetail } from '../src/lib/game/items/databank.js';
import type { ItemDef } from '../src/types.js';
import {
  attackMultiplierOf,
  bossTurn,
  critChanceIn,
  critChanceOf,
  classOf,
  createRaid,
  emptyGear,
  endRound,
  equipPlayers,
  findPlayer,
  guardCutOf,
  retaliateOf,
  hexOf,
  pickIntent,
  shieldBreakOf,
  resolvePlayerTurn,
  type BossIntent,
  type RaidAction,
  type RaidChoice,
  type RaidEvent,
  type RaidPlayer,
  type RaidRng,
  type RaidState,
} from '../src/lib/events/raid.js';

/** No luck either way: the lowest roll, never a crit, the first of any pick. */
const plain: RaidRng = { int: (min) => min, chance: () => false, pick: (items) => items[0] as (typeof items)[number] };
/** As `plain`, but every chance comes off (a crit every time). */
const lucky: RaidRng = { ...plain, chance: () => true };

/** A fight where the raiders (named after their classes, or `none`) have those classes, with the boss about to make `intent`. */
function fight(classes: readonly (RaidClassId | 'none')[], intent: BossIntent, boss: RaidBossId = 'reaper'): RaidState {
  const ids = classes.map((c, i) => `${c}${i}`);
  const state = createRaid(boss, ids, 100_000, 100, 15, plain);
  equipPlayers(
    state,
    ids.map(() => emptyGear()),
    100,
    classes.map((c) => (c === 'none' ? null : c)),
  );
  state.intent = intent;
  return state;
}

const choose = (...picks: [string, RaidAction, string?][]): Map<string, RaidChoice> =>
  new Map(picks.map(([userId, action, target]) => [userId, { action, boost: 0, ...(target === undefined ? {} : { target }) }]));
const player = (state: RaidState, id: string): RaidPlayer => findPlayer(state, id) as RaidPlayer;
const attackOf = (events: readonly RaidEvent[], userId: string): number => (events.find((e) => e.kind === 'attack' && e.userId === userId) as Extract<RaidEvent, { kind: 'attack' }>).damage;
const breath: BossIntent = { move: 'drain', targets: [], multiplier: 1 };
const near = (actual: number, expected: number, what: string): void => assert.ok(Math.abs(actual - expected) < 1e-9, `${what}: ${actual}`);

test('raid classes: seven of them, and a raider without one fights by the plain rules', () => {
  assert.deepEqual([...RAID_CLASS_IDS], ['knight', 'warrior', 'priest', 'mechanic', 'wizard', 'assassin', 'archer']);
  assert.equal(classOf({}), RAID_NO_CLASS);
  assert.equal(classOf({ class: null }), RAID_NO_CLASS);
  assert.equal(classOf({ class: 'knight' }), RAID_CLASSES.knight);
  // Every class but the two that live by attacking gives up a quarter of its attacks.
  for (const id of ['knight', 'priest', 'mechanic', 'wizard'] as const) assert.equal(attackMultiplierOf({ gear: emptyGear(), class: id }), 0.75, id);
  assert.equal(attackMultiplierOf({ gear: emptyGear() }), 1);
});

test("raid classes: only a knight's guard takes a hit aimed at one ally; everyone else's is theirs alone", () => {
  const { damage } = RAID_COMBAT.moves.reap;
  for (const guard of ['knight', 'none', 'priest', 'mechanic', 'wizard', 'assassin', 'archer'] as const) {
    const state = fight([guard, 'none'], { move: 'reap', targets: ['none1'], multiplier: 1 });
    resolvePlayerTurn(state, choose([`${guard}0`, 'guard']), plain);
    bossTurn(state, plain);
    const covers = guard === 'knight';
    assert.equal(player(state, 'none1').hp, covers ? 100 : 100 - damage, guard);
    assert.equal(player(state, `${guard}0`).hp, player(state, `${guard}0`).maxHp - (covers ? Math.round(damage * RAID_COMBAT.guard.takenShare) : 0), `${guard} themselves`);
  }
});

test("raid classes: only a knight's guard cuts hits on the whole party: 10%, and 30% in their class item", () => {
  const { damage } = RAID_COMBAT.moves.drain;
  const aegis = ITEMS_BY_ID.get('oathkeepers-aegis');
  assert.deepEqual([aegis?.stars, aegis?.slot, aegis?.effects, aegis?.raidDrop], [4, 'armor', ['partyGuard'], true]);
  const item = DEFAULTS.equipment.partyGuard[4];
  assert.equal(guardCutOf({ gear: emptyGear() }), 0);
  assert.equal(guardCutOf({ gear: emptyGear(), class: 'knight' }), 0.1);
  assert.ok(Math.abs(guardCutOf({ gear: { ...emptyGear(), partyGuard: item }, class: 'knight' }) - 0.3) < 1e-12);
  // The item does nothing for anyone else.
  for (const id of ['priest', 'mechanic', 'wizard', 'assassin', 'archer'] as const) assert.equal(guardCutOf({ gear: { ...emptyGear(), partyGuard: item }, class: id }), 0, id);
  for (const [guard, worn, cut] of [
    ['none', 0, 0],
    ['none', item, 0],
    ['knight', 0, 0.1],
    ['knight', item, 0.3],
  ] as const) {
    const state = fight([guard, 'none'], breath);
    player(state, `${guard}0`).gear.partyGuard = worn;
    resolvePlayerTurn(state, choose([`${guard}0`, 'guard'], ['none1', 'attack']), plain);
    bossTurn(state, plain);
    assert.equal(player(state, 'none1').hp, 100 - Math.round(damage * (1 - cut)), `${guard} ${worn}`);
    assert.equal(player(state, `${guard}0`).hp, 100 - Math.round(damage * RAID_COMBAT.guard.takenShare), `${guard} themselves`);
  }
});

test('raid classes: a priest heals more, and their heals can crit', () => {
  const heal = (rng: RaidRng): Extract<RaidEvent, { kind: 'heal' }> => {
    const state = fight(['priest', 'none'], breath);
    player(state, 'none1').hp = 1;
    return resolvePlayerTurn(state, choose(['priest0', 'heal', 'none1']), rng).find((e) => e.kind === 'heal') as Extract<RaidEvent, { kind: 'heal' }>;
  };
  const base = RAID_COMBAT.heal.amount * RAID_CLASSES.priest.heal;
  assert.deepEqual(heal(plain), { kind: 'heal', userId: 'priest0', targetId: 'none1', amount: Math.round(base), boost: 0 });
  assert.deepEqual(heal(lucky), { kind: 'heal', userId: 'priest0', targetId: 'none1', amount: Math.round(base * RAID_COMBAT.attack.critMultiplier), boost: 0, crit: true });
  // Nobody else's heals crit, however lucky.
  const state = fight(['none', 'none'], breath);
  player(state, 'none1').hp = 1;
  assert.deepEqual(resolvePlayerTurn(state, choose(['none0', 'heal', 'none1']), lucky)[0], { kind: 'heal', userId: 'none0', targetId: 'none1', amount: RAID_COMBAT.heal.amount, boost: 0 });
});

test('raid classes: a mechanic interrupts a channel alone, and their rally lasts a turn longer', () => {
  const veil: BossIntent = { move: 'veil', targets: [], multiplier: 1 };
  const alone = fight(['mechanic', 'none'], veil);
  assert.ok(resolvePlayerTurn(alone, choose(['mechanic0', 'support'], ['none1', 'attack']), plain).some((e) => e.kind === 'shieldBroken'));
  assert.equal(alone.rallied, RAID_COMBAT.support.rallyTurns + 1);
  // One Support from anyone else is not enough, and their rally is the usual length.
  const other = fight(['none', 'none'], veil);
  assert.ok(!resolvePlayerTurn(other, choose(['none0', 'support'], ['none1', 'attack']), plain).some((e) => e.kind === 'shieldBroken'));
  assert.equal(other.rallied, RAID_COMBAT.support.rallyTurns);
});

test("raid classes: a mechanic can ward an ally instead: the first hit on them that round does nothing", () => {
  const reap: BossIntent = { move: 'reap', targets: ['archer1'], multiplier: 1 };
  const state = fight(['mechanic', 'archer', 'none'], reap);
  const ward = (target?: string): Map<string, RaidChoice> =>
    new Map<string, RaidChoice>([
      ['mechanic0', { action: 'support', boost: 0, skill: 'ward', ...(target === undefined ? {} : { target }) }],
      ['archer1', { action: 'attack', boost: 0 }],
    ]);
  // With no pick it goes to whoever the boss is aiming at; it is none of a Support's usual work (no rally).
  const events = resolvePlayerTurn(state, ward(), plain);
  assert.deepEqual(events[0], { kind: 'ward', userId: 'mechanic0', targetId: 'archer1' });
  assert.ok(!events.some((e) => e.kind === 'rally'));
  assert.equal(state.rallied, 0);
  assert.deepEqual(bossTurn(state, plain).events, [{ kind: 'warded', userId: 'archer1', move: 'reap' }]);
  assert.equal(player(state, 'archer1').hp, 100);
  assert.equal(player(state, 'archer1').streak, 1, 'the archer keeps their streak');
  // One hit only, and that round only.
  endRound(state, plain);
  assert.deepEqual(state.warded, []);
  state.intent = { move: 'requiem', targets: [], multiplier: 1 };
  resolvePlayerTurn(state, ward('none2'), plain);
  const hits = bossTurn(state, plain).events;
  assert.equal(hits.filter((e) => e.kind === 'warded').length, 1);
  assert.equal(hits.filter((e) => e.kind === 'hit' && e.userId === 'none2').length, RAID_COMBAT.requiem.casts - 1);
  // A ward does not count towards interrupting a channel, and nobody else can ward.
  const veil = fight(['mechanic', 'none'], { move: 'veil', targets: [], multiplier: 1 });
  assert.ok(!resolvePlayerTurn(veil, ward(), plain).some((e) => e.kind === 'shieldBroken'));
  const other = fight(['none', 'none'], reap);
  const tried = resolvePlayerTurn(other, new Map<string, RaidChoice>([['none0', { action: 'support', boost: 0, skill: 'ward', target: 'none1' }]]), plain);
  assert.ok(!tried.some((e) => e.kind === 'ward'));
  assert.ok(tried.some((e) => e.kind === 'rally'), 'it is an ordinary Support from anyone else');
});

test('raid classes: a wizard\'s attack hexes the boss\'s move for the round, and their Support frees everyone held', () => {
  const claw: BossIntent = { move: 'reap', targets: ['none1'], multiplier: 1 };
  const state = fight(['wizard', 'none'], claw);
  const events = resolvePlayerTurn(state, choose(['wizard0', 'attack'], ['none1', 'attack']), plain);
  assert.deepEqual(events.find((e) => e.kind === 'hexed'), { kind: 'hexed', userId: 'wizard0', share: RAID_CLASSES.wizard.hex });
  bossTurn(state, plain);
  assert.equal(player(state, 'none1').hp, 100 - Math.round(RAID_COMBAT.moves.reap.damage * (1 - RAID_CLASSES.wizard.hex)));
  // Only that move: the next one hits in full unless it is hexed again.
  assert.equal(state.hexed, 0);
  endRound(state, plain);
  state.intent = claw;
  const before = player(state, 'none1').hp;
  resolvePlayerTurn(state, choose(['wizard0', 'guard']), plain);
  state.guarding = [];
  bossTurn(state, plain);
  assert.equal(player(state, 'none1').hp, Math.max(0, before - RAID_COMBAT.moves.reap.damage));

  // Two allies held: a wizard's one Support frees both, anyone else's only one.
  for (const [supporter, freed] of [
    ['wizard', 2],
    ['none', 1],
  ] as const) {
    const held = fight([supporter, 'none', 'none'], breath, 'wyrm');
    player(held, 'none1').cc = { effect: 'stunned', turns: 2 };
    player(held, 'none2').cc = { effect: 'disarmed', turns: 2 };
    assert.equal(resolvePlayerTurn(held, choose([`${supporter}0`, 'support']), plain).filter((e) => e.kind === 'cleansed').length, freed, supporter);
  }
});

test('raid classes: an assassin hits harder, has less HP and takes more', () => {
  const state = fight(['assassin', 'none'], { move: 'reap', targets: ['assassin0'], multiplier: 1 });
  assert.equal(player(state, 'assassin0').maxHp, 100 * RAID_CLASSES.assassin.hp);
  const events = resolvePlayerTurn(state, choose(['assassin0', 'attack'], ['none1', 'attack']), plain);
  assert.equal(attackOf(events, 'assassin0'), RAID_COMBAT.attack.min * RAID_CLASSES.assassin.attack);
  assert.equal(attackOf(events, 'none1'), RAID_COMBAT.attack.min);
  bossTurn(state, plain);
  const taken = Math.round(RAID_COMBAT.moves.reap.damage * RAID_CLASSES.assassin.taken);
  assert.equal(player(state, 'assassin0').hp, Math.max(0, 100 * RAID_CLASSES.assassin.hp - taken));
});

test('raid classes: an archer\'s attacks ramp while they keep attacking unhit', () => {
  // The boss keeps going for the other raider: the archer is never hit.
  const state = fight(['archer', 'none'], { move: 'empower', targets: [], multiplier: 1 });
  const { min } = RAID_COMBAT.attack;
  const hits: number[] = [];
  for (let turn = 0; turn < 7; turn++) {
    hits.push(attackOf(resolvePlayerTurn(state, choose(['archer0', 'attack']), plain), 'archer0'));
    state.intent = { move: 'empower', targets: [], multiplier: 1 };
    bossTurn(state, plain);
    state.empowered = false;
  }
  assert.deepEqual(
    hits,
    [1, 1.1, 1.2, 1.3, 1.4, 1.5, 1.5].map((times) => Math.round(min * times)),
  );
  // A hit starts it over; so does a turn spent on anything else.
  state.intent = { move: 'reap', targets: ['archer0'], multiplier: 1 };
  resolvePlayerTurn(state, choose(['archer0', 'attack']), plain);
  bossTurn(state, plain);
  assert.equal(player(state, 'archer0').streak, 0);
  state.intent = { move: 'empower', targets: [], multiplier: 1 };
  assert.equal(attackOf(resolvePlayerTurn(state, choose(['archer0', 'attack']), plain), 'archer0'), min);
  resolvePlayerTurn(state, choose(['archer0', 'guard']), plain);
  assert.equal(player(state, 'archer0').streak, 0);
});

test('raid classes: each has a 4-star raid item whose perk only works for that class', () => {
  const items: [RaidClassId, string, string, (keyof ReturnType<typeof emptyGear>)[]][] = [
    ['knight', 'oathkeepers-aegis', 'armor', ['partyGuard']],
    ['warrior', 'warlords-greataxe', 'weapon', ['warriorCounter']],
    ['priest', 'dawnsong-censer', 'weapon', ['circleOfDeath']],
    ['priest', 'choirmasters-vestments', 'weapon', ['partyHeal']],
    ['mechanic', 'stormcoil-spanner', 'weapon', ['rallyCrit']],
    ['wizard', 'hexweavers-staff', 'weapon', ['hexBoost']],
    ['assassin', 'nightfall-shroud', 'weapon', ['assassinStrike', 'assassinCrit']],
    ['archer', 'windrunners-mantle', 'weapon', ['archerRamp']],
  ];
  // Every class has one; the priest has two, both weapons (so a priest wears one or the other).
  assert.deepEqual([...new Set(items.map(([id]) => id))], [...RAID_CLASS_IDS]);
  assert.deepEqual(
    items.filter(([id]) => id === 'priest').map(([, , slot]) => slot),
    ['weapon', 'weapon'],
  );
  for (const [cls, id, slot, perks] of items) {
    const item = ITEMS_BY_ID.get(id);
    assert.deepEqual([item?.stars, item?.slot, item?.effects, item?.raidDrop, item?.class], [4, slot, perks, true, cls], id);
  }
  // They are the only items tagged with a class, and the Discord databank says whose each is.
  assert.deepEqual(ITEMS.filter((item) => item.class).map((item) => item.id).sort(), items.map(([, id]) => id).sort());
  const aegis = ITEMS_BY_ID.get('oathkeepers-aegis') as ItemDef;
  assert.ok(itemBlock(aegis).includes(`${RAID_CLASS_EMOJI.knight} Knight class item`), itemBlock(aegis));
  assert.deepEqual(itemDetail(aegis).fields.find((f) => f.name === 'Class')?.value, `**${RAID_CLASS_EMOJI.knight} Knight**: what it does only works for a raider of that class.`);
  assert.ok(!itemBlock(ITEMS_BY_ID.get('unbroken-bulwark') as ItemDef).includes('class item'));
  const worn = (perk: keyof ReturnType<typeof emptyGear>, cls: RaidClassId | null, streak = 0) => ({ gear: { ...emptyGear(), [perk]: DEFAULTS.equipment[perk][4] }, class: cls, streak });

  // The assassin's: 1.25x into 1.75x, and its crit chance on top of the usual 10%. The archer's: 15% a turn, up to 75%. The wizard's: a 35% hex.
  near(attackMultiplierOf({ gear: emptyGear(), class: 'assassin' }), 1.25, 'an assassin without it');
  near(attackMultiplierOf(worn('assassinStrike', 'assassin')), 1.75, 'assassin');
  near(critChanceOf(worn('assassinCrit', 'assassin')), Math.min(1, RAID_COMBAT.attack.critChance + RAID_CLASSES.assassin.crit + DEFAULTS.equipment.assassinCrit[4]), "assassin's crit chance");
  near(critChanceOf(worn('assassinCrit', 'archer')), RAID_COMBAT.attack.critChance + RAID_CLASSES.archer.crit, "an archer in the assassin's");
  near(critChanceOf(worn('assassinCrit', 'knight')), RAID_COMBAT.attack.critChance, "a knight in the assassin's");
  near(attackMultiplierOf(worn('archerRamp', 'archer', 2)), 1.3, 'archer after two turns');
  near(attackMultiplierOf(worn('archerRamp', 'archer', 20)), 1.75, 'archer at most');
  near(hexOf(worn('hexBoost', 'wizard')), 0.35, 'wizard');
  // On anyone else they do nothing.
  near(attackMultiplierOf(worn('assassinStrike', 'archer')), 1, "an archer in the assassin's");
  near(attackMultiplierOf(worn('assassinStrike', null)), 1, "no class in the assassin's");
  near(attackMultiplierOf(worn('archerRamp', 'assassin', 3)), 1.25, "an assassin in the archer's");
  near(hexOf(worn('hexBoost', 'knight')), 0, "a knight in the wizard's");
});

test("raid classes: one of the priest's items mends everyone else too", () => {
  // A priest's heal on one ally also mends the other two by the item's share.
  for (const [healer, mended] of [
    ['priest', 2],
    ['none', 0],
  ] as const) {
    const state = fight([healer, 'none', 'none', 'none'], breath);
    player(state, `${healer}0`).gear.partyHeal = DEFAULTS.equipment.partyHeal[4];
    for (const id of ['none1', 'none2', 'none3']) player(state, id).hp = 10;
    const events = resolvePlayerTurn(state, choose([`${healer}0`, 'heal', 'none1']), plain);
    const splashes = events.filter((e) => e.kind === 'healSplash') as Extract<RaidEvent, { kind: 'healSplash' }>[];
    assert.equal(splashes.length, mended, healer);
    for (const splash of splashes) assert.equal(splash.amount, Math.round(RAID_COMBAT.heal.amount * RAID_CLASSES.priest.heal * DEFAULTS.equipment.partyHeal[4]), healer);
  }
  // Both are weapons, so nobody wears the two at once; the perks themselves would work together (the others mended, and what the heal's own target couldn't take hitting the boss).
  const both = fight(['priest', 'none', 'none'], breath);
  player(both, 'priest0').gear.partyHeal = DEFAULTS.equipment.partyHeal[4];
  player(both, 'priest0').gear.circleOfDeath = DEFAULTS.equipment.circleOfDeath[4];
  player(both, 'none1').hp = 95;
  player(both, 'none2').hp = 10;
  const kinds = resolvePlayerTurn(both, choose(['priest0', 'heal', 'none1']), plain).map((e) => e.kind);
  assert.deepEqual(kinds, ['heal', 'healSplash', 'overheal']);
});

test("raid classes: the priest's Circle of Death turns excess healing into damage, and the mechanic's item gives the party crit chance while their rally runs", () => {
  const share = DEFAULTS.equipment.circleOfDeath[4];
  const heal = Math.round(RAID_COMBAT.heal.amount * RAID_CLASSES.priest.heal);
  const overheals = (events: readonly RaidEvent[]) => events.filter((e) => e.kind === 'overheal') as Extract<RaidEvent, { kind: 'overheal' }>[];
  const priestFight = (healer: 'priest' | 'none' = 'priest'): RaidState => {
    const state = fight([healer, 'none', 'none'], breath);
    player(state, `${healer}0`).gear.circleOfDeath = share;
    return state;
  };
  // An ally 10 HP short of full: the heal mends the 10, and the rest of it hits the boss.
  let state = priestFight();
  player(state, 'none1').hp = player(state, 'none1').maxHp - 10;
  let events = resolvePlayerTurn(state, choose(['priest0', 'heal', 'none1']), plain);
  assert.equal((events.find((e) => e.kind === 'heal') as Extract<RaidEvent, { kind: 'heal' }>).amount, 10);
  assert.deepEqual(overheals(events), [{ kind: 'overheal', userId: 'priest0', damage: Math.round((heal - 10) * share) }]);
  assert.equal(state.bossHp, state.bossMaxHp - Math.round((heal - 10) * share));
  assert.equal(player(state, 'priest0').stats.damage, Math.round((heal - 10) * share));
  // A heal that is all needed leaves nothing over.
  state = priestFight();
  player(state, 'none1').hp = 10;
  assert.deepEqual(overheals(resolvePlayerTurn(state, choose(['priest0', 'heal', 'none1']), plain)), []);
  // Nobody hurt: the whole heal hits the boss, rather than being wasted.
  state = priestFight();
  events = resolvePlayerTurn(state, choose(['priest0', 'heal']), plain);
  assert.deepEqual(overheals(events), [{ kind: 'overheal', userId: 'priest0', damage: Math.round(heal * share) }]);
  assert.ok(!events.some((e) => e.kind === 'healWasted'));
  // A shield that is up stops it (and isn't worn down by it): the heal is wasted, as without the item.
  state = priestFight();
  state.shielded = true;
  state.deflects = 3;
  events = resolvePlayerTurn(state, choose(['priest0', 'heal']), plain);
  assert.deepEqual([overheals(events).length, events.some((e) => e.kind === 'healWasted'), state.deflects, state.bossHp], [0, true, 3, state.bossMaxHp]);
  // It can land the last hit.
  state = priestFight();
  state.bossHp = 5;
  events = resolvePlayerTurn(state, choose(['priest0', 'heal']), plain);
  assert.deepEqual([overheals(events)[0]?.damage, state.bossHp, state.outcome, state.lastHit], [5, 0, 'won', 'priest0']);
  // Only a priest's: anyone else in it wastes the heal.
  state = priestFight('none');
  events = resolvePlayerTurn(state, choose(['none0', 'heal']), plain);
  assert.deepEqual([overheals(events).length, events.some((e) => e.kind === 'healWasted'), state.bossHp], [0, true, state.bossMaxHp]);

  // A mechanic's rally in their item: while it runs, everyone's crit chance is that much higher, and not after.
  const gain = DEFAULTS.equipment.rallyCrit[4];
  const base = RAID_COMBAT.attack.critChance;
  // Crits only on a chance past the usual one: nobody crits without the buff.
  const picky: RaidRng = { ...plain, chance: (probability) => probability > base + gain / 2 };
  const crits = (state: RaidState, userId: string): boolean =>
    (resolvePlayerTurn(state, choose([userId, 'attack']), picky).find((e) => e.kind === 'attack') as Extract<RaidEvent, { kind: 'attack' }>).crit;
  for (const [supporter, buffed] of [
    ['mechanic', true],
    ['none', false],
  ] as const) {
    const state = fight([supporter, 'none'], breath);
    player(state, `${supporter}0`).gear.rallyCrit = gain;
    assert.equal(crits(state, 'none1'), false, 'no rally yet');
    resolvePlayerTurn(state, choose([`${supporter}0`, 'support']), plain);
    assert.equal(state.rallyCrit, buffed ? gain : 0, supporter);
    near(critChanceIn(state, player(state, 'none1')), base + (buffed ? gain : 0), supporter);
    assert.equal(crits(state, 'none1'), buffed, `${supporter}: the turn after the rally`);
    // The rally runs its turns out (nobody rallies again), and the chance is the usual one again.
    while (state.rallied > 0) resolvePlayerTurn(state, choose([`${supporter}0`, 'guard']), plain);
    near(critChanceIn(state, player(state, 'none1')), base, `${supporter}: after`);
    assert.equal(crits(state, 'none1'), false, `${supporter}: after`);
  }
});

test('raid top levels: from level 8 a channel takes three Supports, crowd control holds one more, and Blight festers with the level', () => {
  assert.equal(shieldBreakOf({ difficulty: RAID_DIFFICULTY.topFrom - 1 }), RAID_COMBAT.support.shieldBreak);
  assert.equal(shieldBreakOf({ difficulty: RAID_DIFFICULTY.topFrom }), RAID_COMBAT.support.shieldBreak + 1);
  const veil: BossIntent = { move: 'veil', targets: [], multiplier: 1 };
  const at = (level: number, classes: readonly (RaidClassId | 'none')[]): RaidState => {
    const state = fight(classes, veil);
    state.difficulty = level;
    return state;
  };
  const broken = (state: RaidState, ...supporters: string[]): boolean =>
    resolvePlayerTurn(state, choose(...supporters.map((id): [string, RaidAction] => [id, 'support'])), plain).some((e) => e.kind === 'shieldBroken');
  // Two Supports are enough below level 8 and not from it; a mechanic's counts for two, so one more does it.
  assert.equal(broken(at(7, ['none', 'none', 'none']), 'none0', 'none1'), true);
  assert.equal(broken(at(8, ['none', 'none', 'none']), 'none0', 'none1'), false);
  assert.equal(broken(at(8, ['none', 'none', 'none']), 'none0', 'none1', 'none2'), true);
  assert.equal(broken(at(8, ['mechanic', 'none', 'none']), 'mechanic0'), false);
  assert.equal(broken(at(8, ['mechanic', 'none', 'none']), 'mechanic0', 'none1'), true);

  // The wyvern's crowd control: one raider in its first phase, two from level 8.
  const last: RaidRng = { int: (_min, max) => max, chance: () => false, pick: (items) => items[0] as (typeof items)[number] };
  for (const [level, held] of [
    [7, RAID_COMBAT.cc.targets[0]],
    [8, RAID_COMBAT.cc.targets[0] + 1],
  ] as const) {
    const state = createRaid('wyrm', ['a', 'b', 'c', 'd'], 100_000, 100, 15, plain, { level, damage: 1 });
    const intent = pickIntent(state, last);
    assert.equal(intent.move, 'taunt', `level ${level}`);
    assert.equal(intent.targets.length, held, `level ${level}`);
  }

  // Blight's damage at the end of the round is multiplied by the level's damage, as the boss's hits are.
  for (const times of [1, 1.5]) {
    const state = createRaid('plague', ['a', 'b'], 100_000, 100, 15, plain, { level: 10, damage: times });
    state.intent = { move: 'brew', targets: [], multiplier: 1 };
    player(state, 'a').blight = 4;
    bossTurn(state, plain);
    assert.equal(player(state, 'a').hp, 100 - Math.round(4 * RAID_COMBAT.blight.tick * times), `x${times}`);
  }
});

test('raid classes: assassins and archers crit 20% more often', () => {
  const base = RAID_COMBAT.attack.critChance;
  for (const id of RAID_CLASS_IDS) near(critChanceOf({ gear: emptyGear(), class: id }), base + (id === 'assassin' || id === 'archer' ? 0.2 : 0), id);
  near(critChanceOf({ gear: emptyGear() }), base, 'no class');
  // On top of gear's, and never past certain.
  near(critChanceOf({ gear: { ...emptyGear(), raidCritChance: 0.15 }, class: 'archer' }), base + 0.35, 'with gear');
  near(critChanceOf({ gear: { ...emptyGear(), raidCritChance: 5 }, class: 'archer' }), 1, 'at most');
});

test('raid classes: a warrior has more HP, strikes back once a round when hit, and is harder to heal', () => {
  const { min } = RAID_COMBAT.attack;
  const reap: BossIntent = { move: 'reap', targets: ['warrior0'], multiplier: 1 };
  const state = fight(['warrior', 'none'], reap);
  assert.equal(player(state, 'warrior0').maxHp, 100 * RAID_CLASSES.warrior.hp);
  near(retaliateOf(player(state, 'warrior0')), RAID_CLASSES.warrior.retaliate, 'without their item');
  resolvePlayerTurn(state, choose(['warrior0', 'guard']), plain);
  assert.deepEqual(bossTurn(state, plain).events.find((e) => e.kind === 'retaliate'), { kind: 'retaliate', userId: 'warrior0', damage: min * RAID_CLASSES.warrior.retaliate });
  assert.equal(player(state, 'warrior0').stats.damage, min * RAID_CLASSES.warrior.retaliate);

  // Once a round, however many times they are hit (the Soul Requiem's two casts), and a whole attack in their item.
  endRound(state, plain);
  player(state, 'warrior0').gear.warriorCounter = DEFAULTS.equipment.warriorCounter[4];
  near(retaliateOf(player(state, 'warrior0')), 1, 'in their item');
  state.intent = { move: 'requiem', targets: [], multiplier: 1 };
  resolvePlayerTurn(state, choose(['warrior0', 'guard']), plain);
  const back = bossTurn(state, plain).events.filter((e) => e.kind === 'retaliate');
  assert.deepEqual(back, [{ kind: 'retaliate', userId: 'warrior0', damage: min }]);

  // Nobody else strikes back (their item or not), a shield stops it, and a blow that fells the boss wins the raid.
  const other = fight(['knight', 'none'], { move: 'reap', targets: ['knight0'], multiplier: 1 });
  player(other, 'knight0').gear.warriorCounter = 1;
  assert.ok(!bossTurn(other, plain).events.some((e) => e.kind === 'retaliate'));
  const shielded = fight(['warrior', 'none'], reap);
  shielded.shielded = true;
  assert.ok(!bossTurn(shielded, plain).events.some((e) => e.kind === 'retaliate'));
  const last = fight(['warrior', 'none'], reap);
  last.bossHp = 5;
  const end = bossTurn(last, plain).events;
  assert.deepEqual(end.filter((e) => e.kind === 'retaliate' || e.kind === 'defeated'), [
    { kind: 'retaliate', userId: 'warrior0', damage: 5 },
    { kind: 'defeated', userId: 'warrior0' },
  ]);
  assert.equal(last.outcome, 'won');

  // Heals on them do three quarters; a heal from them is as anyone's.
  const mend = fight(['warrior', 'none'], reap);
  player(mend, 'warrior0').hp = 10;
  player(mend, 'none1').hp = 10;
  const healed = resolvePlayerTurn(mend, choose(['none1', 'heal', 'warrior0'], ['warrior0', 'heal', 'none1']), plain).filter((e) => e.kind === 'heal') as Extract<RaidEvent, { kind: 'heal' }>[];
  assert.deepEqual(
    healed.map((e) => [e.targetId, e.amount]),
    [
      ['warrior0', Math.round(RAID_COMBAT.heal.amount * RAID_CLASSES.warrior.healed)],
      ['none1', RAID_COMBAT.heal.amount],
    ],
  );
});

test('class command: a class by its id or name, none to clear it, and anything else is neither', async () => {
  const { classPick, raidClass } = await import('../src/commands/class.js');
  const { commands } = await import('../src/commands/index.js');
  for (const id of RAID_CLASS_IDS) {
    assert.equal(classPick(id), id);
    assert.equal(classPick(` ${TEXT.raid.classes[id].name.toUpperCase()} `), id);
  }
  for (const word of ['none', 'Clear', 'reset', 'off']) assert.equal(classPick(word), 'none', word);
  for (const word of ['', 'bard', 'knights', 'knight priest']) assert.equal(classPick(word), undefined, word);
  assert.ok(commands.includes(raidClass));
  assert.equal(raidClass.name, 'class');
  // What it tells them: every class with its badge, and that a pick counts from the next raid.
  const none = TEXT.raid.classCommand.none('k!', 'the classes');
  assert.ok(none.includes('`k!class <name>`') && none.includes('`k!databank classes`'), none);
  assert.match(TEXT.raid.classCommand.picked('Knight'), /now a \*\*Knight\*\*\. It counts from the next raid you fight\./);
});
