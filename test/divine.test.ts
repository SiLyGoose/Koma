import assert from 'node:assert/strict';
import { test } from 'node:test';
import { BLASPHEMY_STORAGE } from '../src/constants/divine.js';
import { HEROES, HEROES_BY_ID } from '../src/data/heroes.js';
import { ITEMS_BY_ID } from '../src/data/items.js';
import { KR_RUNES } from '../src/data/kr-gear.js';
import {
  afterWin,
  ALIVE_MS,
  blasphemyCost,
  blasphemyLines,
  blasphemyLookup,
  blasphemyMain,
  blasphemyRef,
  blasphemySocketOf,
  bossOpenPrice,
  CLASS_LINE,
  clearsNow,
  DIVINE_INFO,
  divineInfo,
  enterRefusal,
  finalReward,
  finalRow,
  highestOpenable,
  isBlasphemyRef,
  karmaFragmentCount,
  karmaReward,
  karmaWon,
  KR_BLASPHEMY,
  krFillShards,
  openBoss,
  openingOpen,
  openKarma,
  resetBoss,
  rollBlasphemy,
  sideReward,
  type BlasphemyRuneData,
  type DivineRng,
} from '../src/lib/game/divine.js';
import { pieceBonus, raidGear, runeBonus } from '../src/lib/game/heroes.js';
import { ingredientRefusal, nextExtension, payInc, socketedIn } from '../src/services/divine.js';
import { DivineRefusal } from '../src/services/divine.js';
import { divineView, rewardsView } from '../src/web/models/divine.js';
import { parseClientMessage, type RoomState, type ServerMessage } from '../src/web/games/technomagic/protocol.js';
import { DIVINE_RAID, TechnoMagicRooms, type Peer, type RoomDeps } from '../src/web/games/technomagic/room.js';
import type { Fights, Progress } from '../src/web/games/technomagic/fight.js';
import type { BegunRun } from '../src/services/technomagic.js';
import type { Player } from '../src/web/auth/token.js';
import type { BlasphemyCopyDoc, DivineBossDoc, DivineGroupDoc, ItemDef, MemberDoc } from '../src/types.js';
import type { DivineRewardItem, DivineRewardsView } from '../src/protocol/divine.js';
import type { Run } from '../vendor/technomagic-sim.mjs';

/*
 * The Divine Punishment Raid's rules (lib/game/divine.ts), its view (web/models/divine.ts) and its rooms (web/games/technomagic/
 * room.ts, with a pretend database and fight). The sim's DIVINE_INFO / KR_BLASPHEMY / fillShards aren't in vendor/ until Koma-UI's
 * `yarn sync`: these tests use fixtures (a rune of their own, KR's GetFullFlask) and the bosses' fallback list; the one that needs the
 * real KR_BLASPHEMY is skipped without it.
 */

/** Every item there is: the catalog's and King's Raid's hero gear. */
const ITEMS: readonly ItemDef[] = [...ITEMS_BY_ID.values()];

const NOW = new Date('2026-11-10T12:00:00Z');
const later = (ms: number): Date => new Date(NOW.getTime() + ms);
/** An rng that always rolls `at` (clamped to what it's asked for). */
const always = (at: number | 'max'): DivineRng => ({ index: (max) => (at === 'max' ? max - 1 : Math.min(max - 1, at)) });

const opened = (over: Partial<DivineBossDoc> = {}): DivineBossDoc => ({ open: true, level: 3, since: NOW, expires: later(ALIVE_MS), clears: 0, cleared: [], ...over });

/** A Rune of Blasphemy of the tests' own: a Laz one (a unique weapon's second socket), ATK main stat. */
const FIXTURE: BlasphemyRuneData = {
  id: 'blasphemy-test-laz',
  code: 'RUNE_BLASPHAMY_TEST_2',
  name: 'Rune of Blasphemy: Test – Laz',
  group: 'apocalypsion',
  socket: 'laz',
  color: 'red',
  legend: 'fierce-5',
  main: { stat: 'atk', min: 0.25, max: 0.3 },
  lines: [
    { skill: 'line-wk', min: 60, max: 80, text: 'Warriors: {v}%' },
    { skill: 'line-aam', min: 1, max: 3, text: 'Archers: {v}%' },
    { skill: 'line-wp', min: 0.5, max: 2, text: 'Wizards: {v}%' },
  ],
  icon: 'RUNE_BLASPHAMY_TEST_2',
};

test('divine: the bosses are the contract’s ten, in its order, each of a group and kind', () => {
  assert.deepEqual(
    DIVINE_INFO.map(({ id, group, kind }) => `${group}:${kind}:${id}`),
    [
      'apocalypsion:side:dp-temeraire',
      'apocalypsion:side:dp-scalaxia',
      'apocalypsion:side:dp-zyrrkinoth',
      'apocalypsion:side:dp-armarta',
      'apocalypsion:final:apocalypsion',
      'solenis:side:luciteron',
      'solenis:side:altigma',
      'solenis:final:solenis',
      'apocalypsion:karma:karma-apocalypsion',
      'solenis:karma:karma-solenis',
    ],
  );
});

test("divine unlock: King's Raid's Stamina ladder, in zeiucoins (6,000 plus the first clears' increments, the last repeating)", () => {
  // (The brief's table: 0, 1, 2, 3, 4, 5, 6, 7, 10, 20, 30, 50, 69, 100 clears.)
  const want: [number, number][] = [[0, 6_000], [1, 9_000], [2, 12_600], [3, 16_800], [4, 21_600], [5, 27_000], [6, 33_000], [7, 40_800], [10, 67_800], [20, 196_800], [30, 385_800], [50, 943_800], [69, 1_696_200], [100, 3_091_200]];
  for (const [clears, price] of want) assert.equal(bossOpenPrice(clears), price, `${clears} clears`);
  assert.deepEqual(openKarma(undefined), { price: 3_000 });
  assert.equal(openKarma({ karma: { open: true } }), 'already_open', 'one Karma run an unlock');
});

test('divine unlock: a window starts with the first unlock and lasts 7 days; its clears price the next; levels 1 to the one after the best', () => {
  const first = openBoss(undefined, 1, NOW);
  assert.ok(typeof first !== 'string');
  assert.equal(first.price, 6_000);
  assert.deepEqual(first.boss, { open: true, level: 1, since: NOW, expires: later(7 * 86_400_000), clears: 0, cleared: [] });
  assert.equal(openBoss(undefined, 2, NOW), 'bad_level', 'nothing cleared yet: level 1 only');
  assert.equal(highestOpenable({ best: 4 }), 5);
  assert.equal(openBoss({ boss: first.boss }, 1, later(1000)), 'already_open', 'one opening at a time');

  // Its final boss beaten twice in the window: the next unlock costs the ladder's third step, and keeps the window.
  const group: DivineGroupDoc = { best: 2, boss: { ...first.boss, open: false, clears: 2 } };
  const again = openBoss(group, 3, later(86_400_000));
  assert.ok(typeof again !== 'string');
  assert.equal(again.price, 12_600);
  assert.equal(again.boss.since, NOW);
  assert.equal(again.boss.clears, 2);
  assert.equal(openBoss(group, 4, later(86_400_000)), 'bad_level');

  // The window over: its clears count for nothing, and the next unlock starts another.
  const after = later(ALIVE_MS + 1);
  assert.equal(clearsNow(group.boss, after), 0);
  assert.equal(openingOpen({ ...first.boss }, after), false, 'an opening ends with its window');
  const fresh = openBoss(group, 3, after);
  assert.ok(typeof fresh !== 'string');
  assert.equal(fresh.price, 6_000);
  assert.equal(fresh.boss.since.getTime(), after.getTime());
  assert.equal(fresh.boss.clears, 0);

  // Reset (KR's ResetPunishmentRaid): closed, its side clears gone, the window kept.
  const reset = resetBoss({ boss: opened({ cleared: ['dp-temeraire'], clears: 1 }) }, NOW);
  assert.ok(typeof reset !== 'string');
  assert.deepEqual([reset.open, reset.cleared, reset.clears], [false, [], 1]);
  assert.equal(resetBoss({ boss: { ...opened(), open: false } }, NOW), 'not_open');
});

test('divine entering: side bosses once an opening, at most 2 dragons, the final boss any time it is open, Karma one run an unlock', () => {
  const info = (id: string) => divineInfo(id)!;
  assert.equal(enterRefusal(info('dp-temeraire'), undefined, NOW), 'not_open');
  const group: DivineGroupDoc = { boss: opened({ cleared: ['dp-temeraire', 'dp-scalaxia'] }) };
  assert.equal(enterRefusal(info('dp-temeraire'), group, NOW), 'cleared');
  assert.equal(enterRefusal(info('dp-zyrrkinoth'), group, NOW), 'not_allowed', 'a third dragon');
  assert.equal(enterRefusal(info('apocalypsion'), group, NOW), null);
  assert.equal(enterRefusal(info('dp-zyrrkinoth'), { boss: opened({ cleared: ['dp-temeraire'] }) }, NOW), null);
  // Solenis' mid-bosses have no limit.
  assert.equal(enterRefusal(info('altigma'), { boss: opened({ cleared: ['luciteron'] }) }, NOW), null);
  assert.equal(enterRefusal(info('apocalypsion'), { boss: opened() }, later(ALIVE_MS)), 'not_open', 'the window over');
  assert.equal(enterRefusal(info('karma-apocalypsion'), { boss: opened() }, NOW), 'not_open');
  assert.equal(enterRefusal(info('karma-apocalypsion'), { karma: { open: true } }, NOW), null);

  // A side boss's win clears it in the opening; the final boss's closes it, counts a clear and raises the best.
  const side = afterWin(info('dp-armarta'), { boss: opened() }, 3);
  assert.deepEqual(side.boss?.cleared, ['dp-armarta']);
  const final = afterWin(info('apocalypsion'), { best: 2, boss: opened({ cleared: ['dp-armarta'], clears: 1 }) }, 3);
  assert.deepEqual([final.boss?.open, final.boss?.clears, final.best], [false, 2, 3]);
  assert.deepEqual(afterWin(info('solenis'), { best: 9, boss: opened() }, 3).best, 9, 'the best never goes down');
});

test("divine rewards: a side boss's Sub row and its scaled group at the level", () => {
  // Temeraire (70010191 + group 301 at level 1): Doomstone 250, 2 Mysterious Rune: Legendary, Tear 300 + 9, Blood 1.
  assert.deepEqual(sideReward('dp-temeraire', 1, always(0)), { blood: { apocalypsion: 1 }, fragments: { doomstone: 250, tear: 309 }, legendary: 2, tickets: 0, empty: {}, full: {} });
  // Level 40: group 301's 102 Blood and 48 Tear.
  assert.deepEqual(sideReward('dp-armarta', 40).fragments.tear, 348);
  assert.deepEqual(sideReward('dp-armarta', 40).blood, { apocalypsion: 102 });
  // Luciteron (70010120 + group 401 at level 5): its row's runes, ticket and Apocalypsion's fragments (KR's quirk), Solenis' Blood and Engraving.
  assert.deepEqual(sideReward('luciteron', 5, always(0)), { blood: { solenis: 5 }, fragments: { tear: 1_200, doomstone: 750, engraving: 11 }, legendary: 8, tickets: 1, empty: {}, full: {} });
});

test("divine rewards: a final boss's Active row by the side bosses cleared, more for fewer dragons, more for more mid-bosses", () => {
  assert.equal(finalRow('apocalypsion', [])?.group, 100);
  assert.equal(finalRow('apocalypsion', ['dp-armarta'])?.group, 101);
  assert.equal(finalRow('apocalypsion', ['dp-armarta', 'dp-scalaxia'])?.reward, 70010140);
  assert.equal(finalRow('solenis', ['luciteron', 'altigma'])?.group, 202);
  assert.equal(finalRow('solenis', ['altigma'])?.reward, 70010160);

  // No dragon, level 1 (70010050 + group 100): 10 runes, Tear 1,500 + 36 + 24, Doomstone 1,000, Blood 4 + 2, a ticket and one more at 20%.
  const none = finalReward('apocalypsion', [], 1, always(0));
  assert.deepEqual(none, { blood: { apocalypsion: 6 }, fragments: { tear: 1_560, doomstone: 1_000 }, legendary: 10, tickets: 2, empty: {}, full: {} });
  assert.equal(finalReward('apocalypsion', [], 1, always('max')).tickets, 1, "the scaled ticket's 200‰ missed");
  assert.equal(finalReward('apocalypsion', [], 21, always('max')).tickets, 2, 'from level 21 it is certain');
  // Two dragons (70010070 + group 102): 6 runes, Tear 900 + 18 + 24, Doomstone 500, Blood 2 + 2.
  assert.deepEqual(finalReward('apocalypsion', ['dp-temeraire', 'dp-scalaxia'], 1, always('max')), { blood: { apocalypsion: 4 }, fragments: { tear: 942, doomstone: 500 }, legendary: 6, tickets: 1, empty: {}, full: {} });
  // Solenis with both mid-bosses (70010170 + group 202): Blood 2 + 4, Engraving 18 + 42, beside its fixed row's.
  const both = finalReward('solenis', ['luciteron', 'altigma'], 1, always('max'));
  assert.deepEqual([both.blood, both.fragments.engraving, both.legendary], [{ solenis: 6 }, 60, 6]);
  const alone = finalReward('solenis', [], 1, always('max'));
  assert.deepEqual([alone.blood, alone.fragments.engraving], [{ solenis: 4 }, 42]);
});

/** What a Reward List's items come to, each count summed by what it gives, a chance hit (`hit`) or missed (a certain one, 1,000‰, always hit): as a DivinePay's counters. */
function listed(items: readonly DivineRewardItem[], hit: boolean): Record<string, number> {
  const out: Record<string, number> = {};
  for (const item of items) if (item.ratio === undefined || hit || item.ratio >= 1000) out[item.key] = (out[item.key] ?? 0) + item.count;
  return out;
}
/** A win's pay as the same counters. */
const counters = (pay: ReturnType<typeof finalReward>): Record<string, number> => {
  const out: Record<string, number> = {};
  for (const [group, n] of Object.entries(pay.blood)) out[`blood.${group}`] = n;
  for (const [fragment, n] of Object.entries(pay.fragments)) out[fragment] = n;
  for (const [tier, n] of Object.entries(pay.empty)) out[`empty.${tier}`] = n;
  if (pay.legendary) out.legendary = pay.legendary;
  if (pay.tickets) out.ticket = pay.tickets;
  return out;
};

test("divine reward list: King's Raid's levels (1 to five past the best, opening at the opening's or the one after the best), the rows a win pays", () => {
  const fresh = rewardsView(undefined, 'apocalypsion', undefined, NOW) as DivineRewardsView;
  assert.deepEqual([fresh.level, fresh.most], [1, 5]);
  assert.equal((rewardsView({ best: 7 }, 'apocalypsion', undefined, NOW) as DivineRewardsView).level, 8, 'none open: the one after the best');
  const open = rewardsView({ best: 7, boss: opened({ level: 6, cleared: ['dp-scalaxia'] }) }, 'apocalypsion', undefined, later(1000)) as DivineRewardsView;
  assert.deepEqual([open.level, open.most], [6, 12]);
  assert.equal(rewardsView({ best: 7 }, 'apocalypsion', 13, NOW), 'bad_level');
  assert.equal(rewardsView({ best: 7 }, 'apocalypsion', 0, NOW), 'bad_level');
  assert.equal((rewardsView({ best: 500 }, 'apocalypsion', undefined, NOW) as DivineRewardsView).most, 110, 'at most the levels tabled');

  // Level 1, her Clear Reward (70010050 + group 100), summed: the scaled ticket apart, as its chance.
  assert.deepEqual(fresh.final.items, [
    { key: 'legendary', count: 10 },
    { key: 'tear', count: 1_560 },
    { key: 'ticket', count: 1 },
    { key: 'doomstone', count: 1_000 },
    { key: 'blood.apocalypsion', count: 6 },
    { key: 'ticket', count: 1, ratio: 200 },
  ]);
  assert.deepEqual(fresh.sides.map((one) => one.id), ['dp-temeraire', 'dp-scalaxia', 'dp-zyrrkinoth', 'dp-armarta']);
  assert.deepEqual(fresh.sides[0]?.items, [
    { key: 'doomstone', count: 250 },
    { key: 'legendary', count: 2 },
    { key: 'tear', count: 309 },
    { key: 'blood.apocalypsion', count: 1 },
  ]);
  // Every set her table has: none, each dragon, each two.
  assert.deepEqual(fresh.final.byCleared.map((one) => one.cleared.length), [0, 1, 1, 1, 1, 2, 2, 2, 2, 2, 2]);
  assert.deepEqual(fresh.final.byCleared[0]?.items, fresh.final.items);

  for (const level of [1, 7, 20, 21, 55, 110]) {
    const list = rewardsView({ best: 200 }, 'apocalypsion', level, NOW) as DivineRewardsView;
    for (const one of list.final.byCleared) {
      for (const hit of [true, false]) assert.deepEqual(listed(one.items, hit), counters(finalReward('apocalypsion', one.cleared, level, always(hit ? 0 : 'max'))), `her win at ${level} with ${one.cleared.join('+') || 'none'}, the ticket ${hit ? 'hit' : 'missed'}`);
    }
    for (const side of list.sides) assert.deepEqual(listed(side.items, false), counters(sideReward(side.id, level)), `${side.id} at ${level}`);
    // A dragon cleared takes its Sub reward off hers: "Whenever you clear each Dragon dungeon, Apocalypsion's dynamic rewards are reduced".
    const none = listed(list.final.items, false);
    for (const side of list.sides) {
      const less = listed(list.final.byCleared.find((one) => one.cleared.length === 1 && one.cleared[0] === side.id)?.items ?? [], false);
      const sub = listed(side.items, false);
      for (const key of Object.keys(none)) assert.equal((none[key] ?? 0) - (less[key] ?? 0), sub[key] ?? 0, `${side.id} at ${level}: ${key}`);
    }
  }

  // Solenis: her two mid-bosses, and more with each cleared.
  const solenis = rewardsView(undefined, 'solenis', 3, NOW) as DivineRewardsView;
  assert.deepEqual(solenis.sides.map((one) => one.id), ['luciteron', 'altigma']);
  assert.deepEqual(solenis.final.byCleared.map((one) => one.cleared), [[], ['luciteron'], ['altigma'], ['luciteron', 'altigma']]);
  assert.ok(listed(solenis.final.byCleared[3]!.items, false)['blood.solenis']! > listed(solenis.final.items, false)['blood.solenis']!);
});

test("divine karma: King's Raid's GetFullFlask, the fragments by waves cleared, a win needing one Tier 1 shard", () => {
  assert.deepEqual(krFillShards(5_000, { tier: 3, count: 1 }), { empty: 1, full: { 1: 5, 2: 0, 3: 1, 4: 0, 5: 0 } }, 'the brought tier first, the rest into Tier 1');
  assert.deepEqual(krFillShards(5_000, { tier: 4, count: 5 }), { empty: 1, full: { 1: 1, 2: 0, 3: 0, 4: 1, 5: 0 } }, 'only what fills is used');
  assert.deepEqual(krFillShards(499, null).full[1], 0);
  assert.equal(karmaWon(499), false);
  assert.equal(karmaWon(500), true);

  assert.equal(karmaFragmentCount(0), 0);
  assert.equal(karmaFragmentCount(1), 1);
  // 1 + 1.023 + 1.023² + … (19 factors of 1.023 to wave 20), then ×1.09 a wave.
  let sum = 0;
  let worth = 1;
  for (let wave = 1; wave <= 25; wave++) {
    if (wave > 1) worth *= wave >= 21 ? 1.09 : 1.023;
    sum += worth;
  }
  assert.equal(karmaFragmentCount(25), Math.floor(sum));

  const fill = krFillShards(1_300, { tier: 2, count: 3 });
  const lost = karmaReward('apocalypsion', { waves: 4, gauge: 400 }, krFillShards(400, null), always(0));
  assert.deepEqual(lost, { blood: {}, fragments: {}, legendary: 0, tickets: 0, empty: {}, full: {} }, 'no shard filled: a fail, no Artifact Pieces');
  // Won: its fragment by waves, the Full Shards filled, and (the bonus roll hitting, Tier 2) 10 Empty Shards.
  assert.deepEqual(karmaReward('solenis', { waves: 6, gauge: 1_300 }, fill, always(0)), { blood: {}, fragments: { fuel: karmaFragmentCount(6) }, legendary: 0, tickets: 0, empty: { '2': 10 }, full: { '2': 1 } });
  assert.deepEqual(karmaReward('apocalypsion', { waves: 6, gauge: 1_300 }, fill, always('max')).empty, {}, 'the bonus missed');

  // What a pay adds to the member: its counters by field, its Mysterious Runes rolled into Legendary runes.
  const { inc, runes } = payInc('apocalypsion', { blood: { apocalypsion: 3 }, fragments: { tear: 5 }, legendary: 2, tickets: 1, empty: { '3': 4 }, full: { '1': 2 } });
  assert.equal(runes.length, 2);
  for (const id of runes) assert.equal(KR_RUNES.find((rune) => rune.id === id)?.grade, 6);
  assert.deepEqual(Object.fromEntries(Object.entries(inc).filter(([field]) => !field.startsWith('runes.'))), { 'blood.apocalypsion': 3, 'dpFragments.tear': 5, 'shards.empty.apocalypsion.3': 4, 'shards.full.apocalypsion.1': 2, uniqueTickets: 1 });
});

test('divine blasphemy: craft costs by how many are owned, its gauge of 10 Legendary or Velkazar runes, storage', () => {
  assert.deepEqual(blasphemyCost(0), { fragments: 10_000, blood: 150, ingredients: 10 });
  assert.deepEqual(blasphemyCost(10), { fragments: 11_156, blood: 167, ingredients: 10 });
  assert.deepEqual(blasphemyCost(100), { fragments: 24_495, blood: 367, ingredients: 10 });
  assert.deepEqual(blasphemyCost(500), { fragments: 147_557, blood: 2_213, ingredients: 10 });
  assert.deepEqual(blasphemyCost(900), blasphemyCost(500), 'past the table, its last');

  const legendary = KR_RUNES.filter((rune) => rune.grade === 6);
  const velkazar = KR_RUNES.find((rune) => rune.grade === 5 && !rune.ancient)!;
  const ancient = KR_RUNES.find((rune) => rune.ancient)!;
  assert.equal(ingredientRefusal({ [legendary[0]!.id]: 6, [velkazar.id]: 4 }), null);
  assert.equal(ingredientRefusal({ [legendary[0]!.id]: 9 }), 'bad_material', 'the gauge takes 10');
  assert.equal(ingredientRefusal({ [legendary[0]!.id]: 9, [ancient.id]: 1 }), 'bad_material', 'an Ancient rune is neither');
  assert.equal(ingredientRefusal({ 'nope-5': 10 }), 'bad_material');

  assert.deepEqual(nextExtension(BLASPHEMY_STORAGE.base), { slots: 4, price: 5_000 });
  assert.equal(nextExtension(296)?.slots, 4);
  assert.equal(nextExtension(300), null, 'at most 300');
});

test('divine blasphemy: a craft rolls its main stat and each line in their ranges, in whole steps', () => {
  const low = rollBlasphemy(FIXTURE, 'a', NOW, always(0));
  assert.deepEqual([low.main, low.lines], [0.25, [60, 1, 0.5]]);
  const high = rollBlasphemy(FIXTURE, 'b', NOW, always('max'));
  assert.deepEqual([high.main, high.lines], [0.3, [80, 3, 2]]);
  const mid = rollBlasphemy(FIXTURE, 'c', NOW, always(7));
  // (Main: 0.001 steps; lines: tenths, the table's fraction 10.)
  assert.deepEqual([mid.main, mid.lines], [0.257, [60.7, 1.7, 1.2]]);
  assert.equal(mid.rune, FIXTURE.id);
});

test("divine blasphemy: sockets (a unique weapon's Doh, Laz, Geb; an armor's Oth; a secondary's Ans), its main stat into the gear's bonus, its class's line", () => {
  const uw = ITEMS.find((item) => item.uniqueWeapon !== undefined)!;
  assert.deepEqual([0, 1, 2, 3].map((i) => blasphemySocketOf(uw, i)), ['doh', 'laz', 'geb', null]);
  const armor = ITEMS.find((item) => item.kr?.part === 'armor' && item.kr.runes > 0)!;
  const secondary = ITEMS.find((item) => item.kr?.part === 'secondary' && item.kr.runes > 0)!;
  const weapon = ITEMS.find((item) => item.kr?.part === 'weapon' && item.uniqueWeapon === undefined && item.kr.runes > 0);
  assert.equal(blasphemySocketOf(armor, 0), 'oth');
  assert.equal(blasphemySocketOf(secondary, 0), 'ans');
  assert.equal(blasphemySocketOf(armor, armor.kr!.runes), null, 'past its sockets');
  if (weapon) assert.equal(blasphemySocketOf(weapon, 0), null, "a King's Raid weapon piece's socket takes none");

  assert.deepEqual(CLASS_LINE, { knight: 0, warrior: 0, archer: 1, assassin: 1, mechanic: 1, wizard: 2, priest: 2 });
  const copy: BlasphemyCopyDoc = { id: 'x1', rune: FIXTURE.id, main: 0.28, lines: [70, 2.5, 1.5], at: NOW };
  const lookup = blasphemyLookup([copy], [FIXTURE]);
  const runes = [null, blasphemyRef('x1'), null];
  assert.ok(isBlasphemyRef(runes[1]));
  assert.deepEqual(blasphemyMain(runes, lookup), { atk: 0.28 });
  assert.deepEqual(blasphemyLines(runes, lookup, 'warrior'), [{ skill: 'line-wk', value: 70 }]);
  assert.deepEqual(blasphemyLines(runes, lookup, 'mechanic'), [{ skill: 'line-aam', value: 2.5 }]);
  assert.deepEqual(blasphemyLines(runes, lookup, 'priest'), [{ skill: 'line-wp', value: 1.5 }]);
  // A plain rune's reader leaves the `bl:` one alone, and with the lookup counts its main stat.
  assert.deepEqual(runeBonus(runes), {});
  assert.deepEqual(runeBonus(runes, lookup), { atk: 0.28 });

  // On the piece, as runes are: its main stat in the hero's gear bonus.
  const owner = HEROES_BY_ID.get(uw.uniqueWeapon as string)!;
  const plain = pieceBonus({ item: uw, level: 0, runes }, owner.class, owner.id);
  const blessed = pieceBonus({ item: uw, level: 0, runes, blasphemy: blasphemyMain(runes, lookup) }, owner.class, owner.id);
  assert.ok(Math.abs(blessed.atk - plain.atk - 0.28) < 1e-9);

  // Where each is socketed, from the copies' sockets.
  assert.deepEqual([...socketedIn([{ _id: 'c1', runes: ['fierce-5', blasphemyRef('x1')] }, { _id: 'c2' }])], [['x1', { copy: 'c1', socket: 1 }]]);
});

test("divine blasphemy: a hero's raid gear has its socketed Rune of Blasphemy's main stat and class line (the tests' rune)", () => {
  const uw = ITEMS.find((item) => item.uniqueWeapon !== undefined)!;
  const hero = HEROES_BY_ID.get(uw.uniqueWeapon as string)!;
  const copy: BlasphemyCopyDoc = rollBlasphemy(FIXTURE, 'r1', NOW, always(0));
  const member = { heroes: { [hero.id]: { equipment: { weapon: 'w1' } } }, blasphemy: [copy] } as unknown as Pick<MemberDoc, 'heroes' | 'blasphemy'>;
  const withRune = raidGear([{ _id: 'w1', itemId: uw.id, level: 1, tmSkill: undefined, tmPotentials: undefined, runes: [null, blasphemyRef('r1'), null] }], member, [FIXTURE]).get(hero.id)!;
  const without = raidGear([{ _id: 'w1', itemId: uw.id, level: 1, tmSkill: undefined, tmPotentials: undefined }], member, [FIXTURE]).get(hero.id)!;
  const line = FIXTURE.lines[CLASS_LINE[hero.class]];
  assert.deepEqual(withRune.blasphemy, [{ skill: line.skill, value: copy.lines[CLASS_LINE[hero.class]] }]);
  // (ATK +25%: the raid's share, as gear's.)
  assert.ok(Math.abs(withRune.bonus.atk - without.bonus.atk - 0.25) < 1e-9);
  assert.deepEqual(without.blasphemy, []);
});

test("divine blasphemy: a hero's raid gear has its socketed Rune of Blasphemy's main stat and class line (the sim's runes)", { skip: KR_BLASPHEMY.length === 0 && "needs the sim's KR_BLASPHEMY (Koma-UI's `yarn sync`)" }, () => {
  assert.equal(KR_BLASPHEMY.length, 44);
  for (const one of KR_BLASPHEMY) assert.ok(blasphemyCost(0) && KR_RUNES.some((rune) => rune.id === one.legend), `${one.id}'s Legendary rune is one of KR_RUNES`);
  const data = KR_BLASPHEMY.find((one) => one.socket === 'doh')!;
  const uw = ITEMS.find((item) => item.uniqueWeapon !== undefined)!;
  const hero = HEROES_BY_ID.get(uw.uniqueWeapon as string)!;
  const copy: BlasphemyCopyDoc = rollBlasphemy(data, 'r1', NOW, always(0));
  const member = { heroes: { [hero.id]: { equipment: { weapon: 'w1' } } }, blasphemy: [copy] } as unknown as Pick<MemberDoc, 'heroes' | 'blasphemy'>;
  const withRune = raidGear([{ _id: 'w1', itemId: uw.id, level: 1, runes: [blasphemyRef('r1'), null, null] }], member).get(hero.id)!;
  const without = raidGear([{ _id: 'w1', itemId: uw.id, level: 1 }], member).get(hero.id)!;
  assert.deepEqual(withRune.blasphemy, [{ skill: data.lines[CLASS_LINE[hero.class]].skill, value: copy.lines[CLASS_LINE[hero.class]] }]);
  assert.ok(Object.entries(withRune.bonus).some(([stat, value]) => value !== (without.bonus as Record<string, number>)[stat]), 'its main stat in the bonus');
});

test("divine view: each group's window, prices, dungeons' refusals and shards; the counters; storage and the next craft", () => {
  const member: Partial<MemberDoc> = {
    points: 50_000,
    divine: { apocalypsion: { best: 3, boss: opened({ cleared: ['dp-temeraire', 'dp-armarta'], clears: 1 }) }, solenis: { karma: { open: true } } },
    blood: { apocalypsion: 12 },
    dpFragments: { tear: 999 },
    shards: { full: { apocalypsion: { '3': 2 } }, empty: { solenis: { '5': 1 } } },
    voidRunes: { laz: 2 },
    uniqueTickets: 1,
    runes: { 'fierce-5': 3, [KR_RUNES.find((rune) => rune.ancient)!.id]: 4 },
    blasphemy: [{ id: 'x1', rune: FIXTURE.id, main: 0.28, lines: [70, 2.5, 1.5], at: NOW }],
  };
  const view = divineView(member, new Map([['x1', { copy: 'c1', socket: 1 }]]), later(1000), [FIXTURE]);
  const [apoc, sol] = view.groups;
  assert.equal(apoc?.window?.open, true);
  assert.equal(apoc?.price, 9_000, 'one clear in the window');
  assert.equal(apoc?.highest, 4);
  assert.deepEqual(Object.fromEntries(apoc!.dungeons.map(({ id, refusal }) => [id, refusal])), { 'dp-temeraire': 'cleared', 'dp-scalaxia': 'not_allowed', 'dp-zyrrkinoth': 'not_allowed', 'dp-armarta': 'cleared', apocalypsion: null, 'karma-apocalypsion': 'not_open' });
  assert.deepEqual(apoc?.full, { '1': 0, '2': 0, '3': 2, '4': 0, '5': 0 });
  assert.equal(sol?.window, null);
  assert.equal(sol?.karma.open, true);
  assert.equal(sol?.dungeons.find((one) => one.kind === 'karma')?.refusal, null);
  assert.deepEqual(view.fragments, { doomstone: 0, tear: 999, fuel: 0, engraving: 0 });
  assert.deepEqual(view.ingredientRunes, { 'fierce-5': 3 }, 'Legendary and Velkazar runes only');
  assert.equal(view.artifacts.find((one) => one.fragment === 'tear')?.itemId, 'artifact-1001');
  assert.deepEqual([view.blasphemy.slots, view.blasphemy.stored, view.blasphemy.keepPrice, view.blasphemy.breakFragments], [100, 0, 200, 1_500]);
  assert.deepEqual(view.blasphemy.craft, blasphemyCost(1));
  assert.deepEqual(view.blasphemy.owned[0]?.socketed, { copy: 'c1', socket: 1 });
  assert.equal(view.blasphemy.owned[0]?.main.line, 'ATK +28%');
  assert.equal(view.blasphemy.owned[0]?.lines[1]?.text, 'Archers: 2.5%');
});

test('divine protocol: a card pick and the room’s Divine message are read; anything else in them is not', () => {
  assert.deepEqual(parseClientMessage('{"t":"card","card":2}'), { t: 'card', card: 2 });
  assert.equal(parseClientMessage('{"t":"card","card":3}'), null);
  assert.deepEqual(parseClientMessage('{"t":"divine","boss":"karma-solenis","empty":{"tier":4,"count":2}}'), { t: 'divine', boss: 'karma-solenis', empty: { tier: 4, count: 2 } });
  assert.deepEqual(parseClientMessage('{"t":"divine","group":"solenis","shard":null}'), { t: 'divine', group: 'solenis', shard: null });
  assert.equal(parseClientMessage('{"t":"divine","empty":{"tier":1,"count":2}}'), null, 'Tier 1 Empty Shards are free: never brought');
  assert.equal(parseClientMessage('{"t":"divine","shard":{"tier":3,"count":0}}'), null);
  assert.equal(parseClientMessage('{"t":"divine","group":"nope"}'), null);
  assert.deepEqual(parseClientMessage('{"t":"stage","stage":99}'), { t: 'stage', stage: 99 });
});

/** A Divine Punishment room with a hand-turned clock, a pretend database and a pretend fight that ends as told. */
function harness(state: Pick<MemberDoc, 'divine' | 'shards'>, refuse: DivineRefusal['code'] | null = null) {
  let clock = NOW.getTime();
  const ticks: (() => void)[] = [];
  const begun: { boss: string; stage: number; divine: unknown }[] = [];
  const finished: { result: string; karma: unknown }[] = [];
  const started: Run[] = [];
  const intents: unknown[] = [];
  const aborted: string[] = [];
  let ends: Progress = { tick: 1, result: 'won', inputs: [], sums: [] };
  const fights: Fights = {
    start: async (run) => {
      started.push(run);
      return {
        advance: async (_due, asked) => {
          intents.push(...asked);
          return ends;
        },
        close: () => {},
      };
    },
    fightOut: async () => 'no',
  };
  const ALL = HEROES.map((hero) => hero.id);
  const deps: RoomDeps = {
    now: () => clock,
    avatar: () => null,
    owned: async () => ALL,
    cleared: async () => ({ hard: 0, normal: 0 }),
    divine: async () => state,
    begin: async (_g, stage, players, boss, _mode, divine) => {
      if (refuse) throw new DivineRefusal(refuse);
      begun.push({ boss, stage, divine });
      const level = state.divine?.apocalypsion?.boss?.level;
      return {
        id: 'run',
        boss,
        seed: 5,
        divine: boss.startsWith('karma') ? { group: 'apocalypsion', empty: (divine as { empty?: never })?.empty ?? null } : { group: 'apocalypsion', level, shard: (divine as { shard?: never })?.shard ?? null },
        players: new Map(players.map(({ userId }) => [userId, { owned: new Set(ALL), gear: new Map(), sets: new Map(), uws: new Map(), uts: new Map(), artifacts: new Map(), skills: new Map(), perks: new Map(), blasphemy: new Map([['kirze', [{ skill: 'line-wk', value: 70 }]]]) }])),
      } as BegunRun;
    },
    finish: async (_g, run, _stage, result, _ticks, _forfeited, karma) => {
      finished.push({ result, karma });
      return new Map([...run.players.keys()].map((userId) => [userId, { drops: [], points: 0, divine: { group: 'apocalypsion', blood: 7 } }]));
    },
    abort: async (_g, run) => void aborted.push(run.id),
    announce: () => {},
    link: () => null,
    every: (_ms, fn) => {
      ticks.push(fn);
      return () => ticks.splice(ticks.indexOf(fn), 1);
    },
    after: () => () => {},
    fights,
  };
  const rooms = new TechnoMagicRooms(deps, DIVINE_RAID);
  const peer = () => {
    const got: ServerMessage[] = [];
    const p: Peer & { got: ServerMessage[]; room: () => RoomState } = { got, send: (m) => got.push(m), close: () => {}, room: () => (got.filter((m) => m.t === 'room').at(-1) as { state: RoomState }).state };
    return p;
  };
  const player = (userId: string): Player => ({ guildId: 'g1', userId, name: userId.toUpperCase() });
  const pass = async (ms: number) => {
    for (let at = 0; at < ms; at += 100) {
      clock += 100;
      for (const fn of [...ticks]) fn();
      await new Promise((resolve) => setImmediate(resolve));
    }
  };
  const settle = () => new Promise((resolve) => setImmediate(resolve));
  return { rooms, deps, peer, player, pass, settle, begun, finished, started, intents, aborted, end: (progress: Progress) => void (ends = progress), ALL };
}

/** Heroes of `n` different classes, and two of one class. */
const byClass = (): { mixed: string[]; same: [string, string] } => {
  const seen = new Map<string, string>();
  let same: [string, string] | null = null;
  for (const hero of HEROES) {
    const had = seen.get(hero.class);
    if (had && !same) same = [had, hero.id];
    if (!had) seen.set(hero.class, hero.id);
  }
  return { mixed: [...seen.values()], same: same! };
};

test("divine room: one of one's own at the opening's level, 4 + 4 in a boss dungeon, 3 of different classes in the Karma dungeon", async () => {
  const h = harness({ divine: { apocalypsion: { best: 6, boss: opened({ level: 7 }), karma: { open: true } } } });
  const a = h.peer();
  const { room } = h.rooms.join(h.player('a'), a, h.ALL, 0, h.deps, true, 'dp-temeraire')!;
  await h.settle();
  const state = a.room();
  assert.deepEqual([state.raid, state.solo, state.link, state.slots, state.stage], ['divine', true, null, 8, 7]);
  assert.equal(state.divine?.opening?.level, 7);
  assert.equal(room.setStage('a', 3), 'closed', 'its stage is its opening’s level');
  const { mixed, same } = byClass();
  for (const hero of mixed.slice(0, 4)) assert.equal(room.pick('a', hero, 0), null);
  assert.equal(room.pick('a', mixed[4]!, 0), 'team_full', 'the Main Team takes 4');
  assert.equal(room.pick('a', mixed[4]!, 0, true), null, 'the Sub Team the rest');

  // The Karma dungeon: 3, one of each class, no Sub Team.
  assert.equal(await room.setDivine('a', { boss: 'karma-apocalypsion', empty: { tier: 3, count: 2 } }), null);
  const karma = a.room();
  assert.deepEqual([karma.slots, karma.stage, karma.lineup.length, karma.lineup.some((pick) => pick.sub)], [3, 1, 3, false]);
  assert.deepEqual(karma.divine?.bring, { tier: 3, count: 2 });
  room.unpick('a', karma.lineup[0]!.hero);
  for (const pick of a.room().lineup) room.unpick('a', pick.hero);
  assert.equal(room.pick('a', same[0], 0), null);
  assert.equal(room.pick('a', same[1], 0), 'class_taken');

  // A page asking for another dungeon is taken to it, in the same room.
  const again = h.rooms.join(h.player('a'), h.peer(), h.ALL, 0, h.deps, true, 'solenis')!;
  assert.equal(again.room, room);
  await h.settle();
  assert.equal(room.boss.id, 'solenis');
});

test('divine room: entering brings the shards picked, refusals are answered, and the fight runs with its Divine part, Blasphemy lines and card picks', async () => {
  // Refused by the bot (a third dragon): answered, nothing begun.
  const no = harness({ divine: { apocalypsion: { boss: opened() } } }, 'not_allowed');
  const p = no.peer();
  const own = no.rooms.join(no.player('a'), p, no.ALL, 0, no.deps, true, 'dp-scalaxia')!.room;
  await no.settle();
  own.pick('a', 'kirze', 0);
  assert.equal(await own.begin('a'), 'not_allowed');
  // Refused as the openings last read say, before the bot is asked: a side boss cleared.
  const cleared = harness({ divine: { apocalypsion: { boss: opened({ cleared: ['dp-scalaxia'] }) } } });
  const q = cleared.peer();
  const room2 = cleared.rooms.join(cleared.player('a'), q, cleared.ALL, 0, cleared.deps, true, 'dp-scalaxia')!.room;
  await cleared.settle();
  room2.pick('a', 'kirze', 0);
  assert.equal(await room2.begin('a'), 'cleared');
  assert.equal(cleared.begun.length, 0);

  // A Karma run: its Empty Shards asked for, its run's Divine part and Blasphemy lines to the fight, a card pick, its outcome to finish.
  const h = harness({ divine: { apocalypsion: { karma: { open: true } } }, shards: { empty: { apocalypsion: { '4': 3 } } } });
  const a = h.peer();
  const room = h.rooms.join(h.player('a'), a, h.ALL, 0, h.deps, true, 'karma-apocalypsion')!.room;
  await h.settle();
  assert.deepEqual(a.room().divine?.empty, { '1': 0, '2': 0, '3': 0, '4': 3, '5': 0 });
  assert.equal(await room.setDivine('a', { empty: { tier: 4, count: 2 } }), null);
  room.pick('a', 'kirze', 0);
  h.end({ tick: 1, result: null, inputs: [], sums: [] });
  assert.equal(await room.begin('a'), null);
  assert.deepEqual(h.begun[0], { boss: 'karma-apocalypsion', stage: 1, divine: { empty: { tier: 4, count: 2 } } });
  assert.deepEqual(h.started[0]?.divine, { group: 'apocalypsion', empty: { tier: 4, count: 2 } });
  assert.deepEqual(h.started[0]?.heroes[0]?.blasphemy, [{ skill: 'line-wk', value: 70 }]);
  assert.equal(a.room().divine?.bring, null, 'what was brought is used: none picked for the next');
  room.card('a', 1);
  await h.pass(100);
  assert.ok(h.intents.some((one) => JSON.stringify(one) === JSON.stringify({ kind: 'card', card: 1 })));
  h.end({ tick: 2, result: 'won', inputs: [], sums: [], karma: { waves: 6, gauge: 1_300 } });
  await h.pass(100);
  await h.settle();
  assert.deepEqual(h.finished, [{ result: 'won', karma: { waves: 6, gauge: 1_300 } }]);
  assert.deepEqual(a.room().over?.divine, { a: { group: 'apocalypsion', blood: 7 } });
});

test('divine room: a run the sim refuses gives back what entering took', async () => {
  const h = harness({ divine: { apocalypsion: { boss: opened() } } });
  h.deps.fights = { start: async () => 'no such boss', fightOut: async () => 'no' };
  const a = h.peer();
  const room = h.rooms.join(h.player('a'), a, h.ALL, 0, h.deps, true, 'apocalypsion')!.room;
  await h.settle();
  room.pick('a', 'kirze', 0);
  assert.equal(await room.setDivine('a', { shard: { tier: 5, count: 1 } }), null);
  assert.equal(await room.begin('a'), 'failed');
  assert.deepEqual(h.begun[0]?.divine, { shard: { tier: 5, count: 1 } });
  assert.deepEqual(h.aborted, ['run']);
});

test('divine: items it names are the catalog’s (the four artifacts, ARTIFACT_UNIQUE_1000–1003)', () => {
  const ids = ['artifact-1000', 'artifact-1001', 'artifact-1002', 'artifact-1003'];
  for (const id of ids) assert.ok(ITEMS.some((item: ItemDef) => item.id === id), id);
});
