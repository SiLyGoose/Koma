import assert from 'node:assert/strict';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { test } from 'node:test';
import { GROUPS } from '../src/commands/config.js';
import { DEFAULTS } from '../src/config.js';
import { gachaItems, ITEMS, ITEMS_BY_ID, UNIQUE_WEAPONS, validateItems } from '../src/data/items.js';
import { KR_DRAGON_SETS, KR_ITEMS, KR_TM_SETS, krMainValue, krPiecesOf, krWornBy } from '../src/data/kr-gear.js';
import { HEROES, HEROES_BY_ID } from '../src/data/heroes.js';
import { TM_SET_LABEL, TM_SET_PIECES, TM_SETS_BY_ID } from '../src/data/tm-sets.js';
import { bossEssences, CLASS_ESSENCES, ESSENCES, keptPerks, perksCost, RAID_BOSS_ESSENCES, TRANSCEND_PERKS, TRANSCEND_POINTS, TRANSCEND_TP, transcendCost, transcendPicks, transcendPoints } from '../src/data/transcend.js';
import { raidRewards } from '../src/lib/events/raid.js';
import { RAID_BOSS_IDS } from '../src/constants/index.js';
import { RAID_CLASS_IDS } from '../src/constants/index.js';
import { activeSet, activeTmEffects, copyMainStat, heroBonus, heroCopyIds, heroSet, raidGear, setBonusLines, setLines, heroEquipMoves, heroItemLines, heroOnly, fitsSlot, heroSlotsFor, heroWearable, heroWorn, pieceBonus, raidValue, wieldedBy } from '../src/lib/game/heroes.js';
import { keptCopyIds } from '../src/lib/game/items/loadouts.js';
import { findSpec, validateSettings } from '../src/lib/settings-spec.js';
import { createApi, type ApiDeps } from '../src/web/api.js';
import { signSession } from '../src/web/auth/login.js';
import { signToken } from '../src/web/auth/token.js';
import type { WebConfig } from '../src/web/config.js';
import { heroesView, type HeroesView, type HeroStore } from '../src/web/models/heroes.js';
import type { MemberDoc } from '../src/types.js';

const SITE: WebConfig = {
  siteUrl: 'https://koma-ui.vercel.app',
  origin: 'https://koma-ui.vercel.app',
  apiUrl: 'https://koma.duckdns.org',
  socketUrl: 'wss://koma.duckdns.org',
  port: 0,
  clientSecret: 'shh',
};

const item = (id: string) => ITEMS_BY_ID.get(id)!;

test('heroes: Kirze, Klaus, Fallen Frey, Gremory, Annette, Morrah, Laias, Seria, Ezekiel, Lorraine, Valance, Lucikiel, Selene, Crow, Oddy, Phillop, Naila, Yanne, Neraxis, Erze, Loman, Gau, Tanya, Rebel Klaus and Dark Lord Kasel, each once, each of a raid class; their price is a setting of its own', () => {
  assert.deepEqual(
    HEROES.map((hero) => [hero.id, hero.class]),
    [
      ['kirze', 'warrior'],
      ['klaus', 'knight'],
      ['fallen-frey', 'priest'],
      ['gremory', 'assassin'],
      ['annette', 'mechanic'],
      ['morrah', 'knight'],
      ['laias', 'priest'],
      ['seria', 'warrior'],
      ['ezekiel', 'assassin'],
      ['lorraine', 'wizard'],
      ['valance', 'mechanic'],
      ['lucikiel', 'wizard'],
      ['selene', 'archer'],
      ['crow', 'mechanic'],
      ['oddy', 'mechanic'],
      ['phillop', 'knight'],
      ['naila', 'warrior'],
      ['yanne', 'archer'],
      ['neraxis', 'knight'],
      ['erze', 'assassin'],
      ['loman', 'knight'],
      ['gau', 'warrior'],
      ['tanya', 'assassin'],
      ['rebel-klaus', 'warrior'],
      ['dark-lord-kasel', 'warrior'],
    ],
  );
  assert.equal(HEROES_BY_ID.size, HEROES.length);
  for (const hero of HEROES) assert.ok(RAID_CLASS_IDS.includes(hero.class));
  assert.equal(DEFAULTS.hero.price, 25_000);
  assert.equal(findSpec('hero.price')?.group, 'Hero');
  assert.ok(GROUPS.includes('Hero'));
  assert.deepEqual(validateSettings(structuredClone(DEFAULTS)), []);
});

test("King's Raid's hero gear: never pulled, heroes only, each piece of a set, a part and its classes; the members' own gear never goes on a hero", () => {
  assert.doesNotThrow(validateItems);
  const pieces = KR_ITEMS.filter((one) => one.kr?.part !== 'artifact');
  assert.equal(pieces.length, 351);
  for (const gear of KR_ITEMS) {
    assert.ok(heroOnly(gear) && heroWearable(gear), gear.id);
    assert.ok(!gachaItems(gear.stars).includes(gear), gear.id);
    assert.equal(gear.effects.length, 0, gear.id);
  }
  // Galgoria drops Perseverance: an Armor, a Secondary Armor, four Accessories and an Orb for every hero's class.
  for (const hero of HEROES) {
    for (const part of ['armor', 'secondary', 'accessory', 'orb'] as const) assert.ok(krPiecesOf('perseverance').some((gear) => gear.kr?.part === part && krWornBy(gear.kr, hero.class)), `${hero.class} ${part}`);
  }
  // The dragon sets: every part at tiers 6 to 8, and a weapon for every class.
  for (const set of KR_DRAGON_SETS) for (const tier of [6, 7, 8]) assert.equal(krPiecesOf(set, tier).length, 17, `${set} T${tier}`);
  // The members' own gear (the raid's and the gacha's) no longer goes on heroes.
  assert.ok(!heroWearable(item('worldbreaker-maul')) && !heroWearable(item('rusty-dagger')));
  assert.ok(ITEMS.filter((one) => one.uniqueWeapon === undefined && one.uniqueTreasure === undefined).every((one) => !heroWearable(one)));
});

test('unique weapons: one for each hero, heroes only, only its own hero wields it, in the Weapon slot, and the raid is told its tier', () => {
  assert.deepEqual(UNIQUE_WEAPONS.map((one) => one.uniqueWeapon).sort(), HEROES.map((hero) => hero.id).sort());
  const exian = item('the-guardian-exian');
  assert.ok(heroWearable(exian) && heroOnly(exian));
  assert.ok(wieldedBy(exian, 'klaus') && !wieldedBy(exian, 'kirze'));
  assert.deepEqual(heroSlotsFor(exian), ['weapon']);
  assert.ok(fitsSlot(exian, 'weapon') && !fitsSlot(exian, 'armor'));
  // A dragon set's weapon goes there too, in its place.
  assert.deepEqual(heroSlotsFor(item('opportune-fire-t8-knight-weapon')), ['weapon']);
  // On its own hero its flat ATK counts (King's Raid's for its class, its refinement its stars), on another nothing.
  assert.equal(pieceBonus({ item: exian, level: 1 }, 'knight', 'klaus').atkFlat, 42_332);
  assert.equal(pieceBonus({ item: exian, level: 5 }, 'knight', 'klaus').atkFlat, 96_209);
  assert.equal(pieceBonus({ item: exian, level: 5 }, 'knight', 'kirze').atkFlat, 0);
  assert.equal(raidValue('atkFlat', 96_209), 96_209);
  assert.equal(heroItemLines(exian, 2)[0], '+50,029 ATK');
  assert.match(heroItemLines(exian, 2).at(-1) ?? '', /^Klaus only, ★2: /);
  // Its three rune sockets: their runes count on its hero.
  assert.equal(pieceBonus({ item: exian, level: 1, runes: ['fierce-5', null, null] }, 'knight', 'klaus').atk, 0.15);
  const copies = [
    { _id: 'a', itemId: 'the-guardian-exian', level: 3 },
    { _id: 'c', itemId: 'judgment-edge-elicipira', level: 4 },
  ];
  const member: Pick<MemberDoc, 'heroes'> = {
    heroes: {
      klaus: { boughtAt: new Date(0), equipment: { weapon: 'a' } },
      kirze: { boughtAt: new Date(0), equipment: { weapon: 'c' } },
    },
  };
  const gear = raidGear(copies, member);
  assert.equal(gear.get('klaus')?.uw, 3);
  assert.equal(gear.get('kirze')?.uw, 4);
  // Another hero's: not counted.
  const elsewhere = raidGear(copies, { heroes: { kirze: { boughtAt: new Date(0), equipment: { weapon: 'a' } } } });
  assert.equal(elsewhere.get('kirze')?.uw, null);
  assert.equal(elsewhere.get('kirze')?.bonus.atkFlat, 0);
});

test("heroes: King's Raid's slots: Weapon, Armor, Secondary Armor, Accessory, Orb, Treasure with three subs, and Artifact", () => {
  assert.deepEqual(heroSlotsFor(item('perseverance-warrior-armor')), ['armor']);
  assert.deepEqual(heroSlotsFor(item('perseverance-warrior-secondary')), ['secondary']);
  assert.deepEqual(heroSlotsFor(item('perseverance-warrior-ring')), ['accessory']);
  assert.deepEqual(heroSlotsFor(item('perseverance-warrior-orb')), ['orb']);
  assert.deepEqual(heroSlotsFor(item('artifact-26')), ['artifact']);
  assert.deepEqual(heroSlotsFor(item('worldbreaker-maul')), []);
});

test('heroes: what they wear is kept from selling and refining, and a copy moves off any other hero it was on', () => {
  const member: Pick<MemberDoc, 'heroes' | 'equipment'> = {
    equipment: { weapon: 'w' },
    heroes: {
      kirze: { boughtAt: new Date(0), equipment: { weapon: 'a', orb: 'b', armor: null } },
      klaus: { boughtAt: new Date(0), equipment: { secondary: 'c' } },
    },
  };
  assert.deepEqual([...heroWorn(member)], [
    ['a', 'kirze'],
    ['b', 'kirze'],
    ['c', 'klaus'],
  ]);
  assert.deepEqual([...heroCopyIds(member)].sort(), ['a', 'b', 'c']);
  assert.deepEqual([...keptCopyIds(member)].sort(), ['a', 'b', 'c', 'w']);
  assert.deepEqual(heroCopyIds(null), new Set());
  // Copy a onto Klaus: it comes off Kirze's weapon slot, and must not be anywhere else meanwhile.
  const moves = heroEquipMoves(member.heroes, 'klaus', 'weapon', 'a');
  assert.deepEqual(moves.from, ['heroes.kirze.equipment.weapon']);
  assert.ok(moves.elsewhere.includes('heroes.kirze.equipment.orb') && moves.elsewhere.includes('heroes.klaus.equipment.orb'));
  assert.ok(!moves.elsewhere.includes('heroes.klaus.equipment.weapon'));
});

test("heroes: King's Raid's gear raises their stats: its main stat by its refinement, its options and runes, its set's bonuses, and only on its classes", () => {
  const armor = item('perseverance-warrior-armor');
  const orb = item('perseverance-warrior-orb');
  // The main stat at max level, by refinement (King's Raid's factors: R1 4730, R5 6450 for HP; R5 8600 for DEF).
  assert.equal(krMainValue(orb.kr!, 1), 1_288_234);
  assert.equal(krMainValue(orb.kr!, 5), 1_756_683);
  assert.equal(krMainValue(armor.kr!, 5), 54_997);
  assert.deepEqual(copyMainStat(armor, { level: 5 }), { name: 'P. DEF', value: 54_997 });
  // Options: each its pool's value at its step (Perseverance's ATK: 12%, 14% or 16%).
  const options = [
    { stat: 'atk', step: 2 },
    { stat: 'critDamage', step: 0 },
  ];
  const on = pieceBonus({ item: armor, level: 5, options }, 'warrior');
  assert.equal(on.defPhysicalFlat, 54_997);
  assert.equal(on.atk, 0.16);
  assert.equal(on.critDamage, 0.24);
  assert.deepEqual(heroItemLines(armor, 5, undefined, undefined, options, ['patience-5']), ['P. DEF +54,997', 'ATK +16%', 'Crit DMG +24%', 'P. DEF +19%']);
  assert.equal(pieceBonus({ item: armor, level: 5, options, runes: ['patience-5'] }, 'warrior').defPhysical, 0.19);
  // Not on another class.
  assert.ok(Object.values(pieceBonus({ item: armor, level: 5, options }, 'priest')).every((n) => n === 0));
  // A dragon set's bonuses: 2 pieces its 2-piece stats, 4 its 4-piece ones too (Opportune Fire: crit 180, then 270 more).
  const fire = ['opportune-fire-t8-heavy-armor', 'opportune-fire-t8-heavy-secondary', 'opportune-fire-t8-ring', 'opportune-fire-t8-orb'].map((id) => ({ item: item(id), level: 1 }));
  assert.equal(heroBonus(fire.slice(0, 1), 'warrior').crit, 0);
  assert.ok(Math.abs(heroBonus(fire.slice(0, 2), 'warrior').crit - 0.18) < 1e-9);
  assert.ok(Math.abs(heroBonus(fire, 'warrior').crit - 0.45) < 1e-9);
  assert.equal(raidValue('crit', 0.45), 450);
});

test('heroes view: every hero, the copies a hero can wear, and what each of theirs wears and gets from it', () => {
  const copies = [
    { _id: 'armor', itemId: 'perseverance-warrior-armor', level: 5, options: [{ stat: 'atk', step: 0 }, { stat: 'critDamage', step: 2 }], tmSkill: 'vigor', runes: ['patience-5'] },
    { _id: 'maul', itemId: 'worldbreaker-maul', level: 2, locked: true }, // the members' own: no hero wears it
    { _id: 'ring', itemId: 'opportune-fire-t8-ring', level: 1, options: [{ stat: 'crit', step: 10 }] },
    { _id: 'spare', itemId: 'opportune-fire-t8-ring', level: 1 },
  ];
  const member = {
    points: 30_000,
    runes: { 'fierce-5': 2, 'stamina-1': 1 },
    heroes: { kirze: { boughtAt: new Date(0), equipment: { armor: 'armor', accessory: 'ring', orb: 'gone', weapon: 'maul' } } },
  };
  const view = heroesView(copies, member);
  assert.equal(view.balance, 30_000);
  assert.deepEqual(view.copies.map((copy) => copy.id), ['armor', 'ring', 'spare']); // TechnoMagic gear first, then by tier
  assert.deepEqual(view.runes.map((rune) => [rune.id, rune.count]), [['fierce-5', 2], ['stamina-1', 1]]);
  const armor = view.copies.find((copy) => copy.id === 'armor');
  assert.equal(armor?.part, 'armor');
  assert.equal(armor?.krSet?.name, 'Perseverance');
  assert.deepEqual(armor?.mainStat, { name: 'P. DEF', value: 54_997 });
  assert.deepEqual(armor?.options.map((option) => option.line), ['ATK +12%', 'Crit DMG +32%']);
  assert.deepEqual(armor?.runes.map((rune) => rune?.id ?? null), ['patience-5']);
  assert.equal(armor?.reroll, 500);
  assert.equal(armor?.upgrade, null, "TechnoMagic gear's options are only rerolled");
  assert.ok(armor?.additional?.startsWith('Vigor'));
  assert.equal(armor?.setEffect?.pieces, 4);
  assert.equal(armor?.setEffect?.active, false);
  assert.equal(view.copies.find((copy) => copy.id === 'ring')?.upgrade, null, 'all its options at their top');
  assert.equal(view.copies.find((copy) => copy.id === 'spare')?.sell !== null, true);
  const [kirze, klaus] = view.heroes;
  assert.equal(kirze?.owned, true);
  assert.equal(klaus?.owned, false);
  assert.equal(kirze?.price, DEFAULTS.hero.price);
  // A copy they no longer own, or one no hero wears, isn't worn.
  assert.deepEqual(kirze?.equipped, { weapon: null, armor: 'armor', secondary: null, accessory: 'ring', orb: null, treasure: null, side1: null, side2: null, side3: null, artifact: null });
  assert.equal(kirze?.bonus.defPhysicalFlat, 54_997);
  assert.ok(Math.abs((kirze?.bonus.atk ?? 0) - 0.12) < 1e-9);
  assert.equal(kirze?.bonus.crit, 120);
  assert.deepEqual(kirze?.set, { id: 'perseverance', pieces: 1, active: false });
  assert.deepEqual(kirze?.sets.map((set) => [set.id, set.pieces]), [['perseverance', 1], ['opportune-fire', 1]]);
  assert.ok(kirze?.totals.some((line) => line.endsWith(' Attack')), 'its stats spelled out');
  assert.deepEqual(klaus?.totals, []);
});

test('heroes web: a logged-in member sees the heroes, buys one and gears it, in their own servers only', async () => {
  const empty = { heroes: [], copies: [], balance: 0, runes: [] } as unknown as HeroesView;
  let owned: string[] = [];
  const calls: string[] = [];
  const store: HeroStore = {
    view: async (guildId, userId) => ({ ...empty, heroes: (userId === '22' ? ['klaus'] : owned).map((id) => ({ id }) as never), balance: 500 }),
    // 22 has a hero; 33 more, but has left the server.
    owners: async () => [
      { userId: '33', heroes: 3 },
      { userId: '22', heroes: 1 },
    ],
    buy: async (guildId, userId, id) => {
      calls.push(`buy ${guildId} ${userId} ${id}`);
      if (!HEROES_BY_ID.has(id)) return 'not_found';
      if (owned.includes(id)) return 'owned';
      owned = [...owned, id];
      return { ...empty, heroes: owned.map((one) => ({ id: one }) as never) };
    },
    equip: async (guildId, userId, hero, slot, copy) => {
      calls.push(`equip ${hero} ${slot} ${copy}`);
      if (!owned.includes(hero)) return 'not_found';
      if (slot === 'treasure') return 'wrong_slot';
      return empty;
    },
    unequip: async (guildId, userId, hero, slot) => {
      calls.push(`unequip ${hero} ${slot}`);
      return owned.includes(hero) ? empty : 'not_found';
    },
    perks: async (guildId, userId, hero, perks) => {
      calls.push(`perks ${hero} ${perks.join(',')}`);
      if (!owned.includes(hero)) return 'not_found';
      const picked = transcendPicks(perks, 1);
      return typeof picked === 'string' ? picked : empty;
    },
    transcend: async (guildId, userId, hero) => {
      calls.push(`transcend ${hero}`);
      return owned.includes(hero) ? empty : 'not_found';
    },
    refine: async (guildId, userId, copy) => {
      calls.push(`refine ${copy}`);
      return copy === 'c1' ? empty : 'no_duplicate';
    },
    sell: async (guildId, userId, copies) => {
      calls.push(`sell ${copies.join(',')}`);
      return copies.includes('c1') ? { count: 1, earned: 250 } : 'nothing_to_sell';
    },
    lock: async (guildId, userId, copy, locked) => {
      calls.push(`lock ${copy} ${locked}`);
      return copy === 'c1';
    },
    rune: async (guildId, userId, copy, socket, rune) => {
      calls.push(`rune ${copy} ${socket} ${rune}`);
      return rune === 'none' ? 'no_rune' : empty;
    },
    reroll: async (guildId, userId, copy, option) => {
      calls.push(`reroll ${copy} ${option}`);
      return option === 1 ? 'no_option' : empty;
    },
    upgrade: async (guildId, userId, copy) => {
      calls.push(`upgrade ${copy}`);
      return copy === 'c1' ? empty : 'maxed';
    },
  };
  const deps: ApiDeps = {
    config: SITE,
    clientId: () => '999',
    guild: (id) => (id === 'g1' || id === 'g2' ? { name: id, icon: null } : null),
    memberName: async (guildId, userId) => (guildId === 'g1' && userId === 'u1' ? 'ZEIU' : guildId === 'g1' && userId === '22' ? 'Pine' : null),
    balance: async () => 0,
    heroes: store,
  };
  const session = signSession({ userId: 'u1', name: 'ZEIU', avatar: null, guildIds: ['g1', 'g2'] }, 'shh');
  const headers = { Origin: SITE.origin, 'Content-Type': 'application/json', Authorization: `Bearer ${session}` };
  const server: Server = createServer(createApi(deps));
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const post = (path: string, body: unknown) => fetch(`${base}${path}`, { method: 'POST', headers, body: JSON.stringify(body) });
  try {
    assert.equal((await fetch(`${base}/api/heroes?guild=g1`, { headers })).status, 200);
    assert.equal((await fetch(`${base}/api/heroes?guild=g2`, { headers })).status, 403);
    assert.equal((await fetch(`${base}/api/heroes?guild=g1`, { headers: { Origin: SITE.origin } })).status, 401);

    // Who else has heroes: them first (with none yet), not whoever left; and another's heroes to look at, without their points.
    const members = (await (await fetch(`${base}/api/heroes/members?guild=g1`, { headers })).json()) as { members: { userId: string; name: string; heroes: number; you: boolean }[] };
    assert.deepEqual(
      members.members.map(({ userId, name, heroes, you }) => ({ userId, name, heroes, you })),
      [
        { userId: 'u1', name: 'ZEIU', heroes: 0, you: true },
        { userId: '22', name: 'Pine', heroes: 1, you: false },
      ],
    );
    assert.equal((await fetch(`${base}/api/heroes/members?guild=g2`, { headers })).status, 403);
    const theirs = (await (await fetch(`${base}/api/heroes?guild=g1&user=22`, { headers })).json()) as HeroesView;
    assert.deepEqual([theirs.heroes.map((hero) => hero.id), theirs.balance], [['klaus'], 0]);
    assert.equal((await fetch(`${base}/api/heroes?guild=g1&user=33`, { headers })).status, 404); // left the server
    assert.equal((await fetch(`${base}/api/heroes?guild=g1&user=nope`, { headers })).status, 404);
    assert.equal(((await (await fetch(`${base}/api/heroes?guild=g1&user=u1`, { headers })).json()) as HeroesView).balance, 500); // their own

    // Not theirs to gear yet.
    assert.deepEqual(await (await post('/api/heroes/equip', { guild: 'g1', hero: 'kirze', slot: 'weapon', copy: 'c1' })).json(), { error: 'not_found' });
    assert.equal((await post('/api/heroes/buy', { guild: 'g1', hero: 'kirze' })).status, 200);
    assert.deepEqual(await (await post('/api/heroes/buy', { guild: 'g1', hero: 'kirze' })).json(), { error: 'owned' });
    assert.equal((await post('/api/heroes/buy', { guild: 'g1', hero: 'nobody' })).status, 404);

    assert.equal((await post('/api/heroes/equip', { guild: 'g1', hero: 'kirze', slot: 'weapon', copy: 'c1' })).status, 200);
    const wrong = await post('/api/heroes/equip', { guild: 'g1', hero: 'kirze', slot: 'treasure', copy: 'c1' });
    assert.equal(wrong.status, 409);
    assert.deepEqual(await wrong.json(), { error: 'wrong_slot' });
    assert.equal((await post('/api/heroes/equip', { guild: 'g1', hero: 'kirze', slot: 'weapon3', copy: 'c1' })).status, 400);
    assert.equal((await post('/api/heroes/unequip', { guild: 'g1', hero: 'kirze', slot: 'weapon' })).status, 200);
    assert.equal((await post('/api/heroes/unequip', { guild: 'g1', hero: 'kirze' })).status, 200);
    assert.equal((await post('/api/heroes/buy', { guild: 'g2', hero: 'klaus' })).status, 403);

    // Transcending a hero; and its perks: known ones, of the tiers it has reached, within its TP; none resets them.
    assert.equal((await post('/api/heroes/transcend', { guild: 'g1', hero: 'kirze' })).status, 200);
    assert.deepEqual(await (await post('/api/heroes/transcend', { guild: 'g1', hero: 'klaus' })).json(), { error: 'not_found' });
    assert.equal((await post('/api/heroes/perks', { guild: 'g1', hero: 'kirze', perks: ['atk-up', 'hp-up'] })).status, 200);
    assert.equal((await post('/api/heroes/perks', { guild: 'g1', hero: 'kirze', perks: [] })).status, 200);
    assert.equal((await post('/api/heroes/perks', { guild: 'g1', hero: 'kirze', perks: ['nope'] })).status, 400);
    const over = await post('/api/heroes/perks', { guild: 'g1', hero: 'kirze', perks: ['atk-up', 'hp-up', 'def-up'] });
    assert.equal(over.status, 409);
    assert.deepEqual(await over.json(), { error: 'too_many_points' });
    assert.deepEqual(await (await post('/api/heroes/perks', { guild: 'g1', hero: 'kirze', perks: ['t5-light'] })).json(), { error: 'perk_locked' });
    assert.deepEqual(await (await post('/api/heroes/perks', { guild: 'g1', hero: 'klaus', perks: [] })).json(), { error: 'not_found' });
    // Refining a copy (a unique weapon, on the heroes page): with a spare of it, or why not.
    assert.equal((await post('/api/heroes/refine', { guild: 'g1', copy: 'c1' })).status, 200);
    assert.deepEqual(await (await post('/api/heroes/refine', { guild: 'g1', copy: 'c2' })).json(), { error: 'no_duplicate' });
    // Selling copies (the same one twice counts once), and locking one, as the gear page does: answered with the heroes.
    const sold = await post('/api/heroes/sell', { guild: 'g1', copies: ['c1', 'c1', 'c2'] });
    assert.equal(sold.status, 200);
    assert.deepEqual(((await sold.json()) as { sold: unknown }).sold, { count: 1, earned: 250 });
    assert.deepEqual(await (await post('/api/heroes/sell', { guild: 'g1', copies: ['c2'] })).json(), { error: 'nothing_to_sell' });
    assert.equal((await post('/api/heroes/sell', { guild: 'g1', copies: [] })).status, 400);
    assert.equal((await post('/api/heroes/lock', { guild: 'g1', copy: 'c1', locked: true })).status, 200);
    assert.equal((await post('/api/heroes/lock', { guild: 'g1', copy: 'c2', locked: true })).status, 404);
    // Runes into and out of a copy's sockets, and its options rerolled and upgraded.
    assert.equal((await post('/api/heroes/rune', { guild: 'g1', copy: 'c1', socket: 0, rune: 'fierce-5' })).status, 200);
    assert.equal((await post('/api/heroes/rune', { guild: 'g1', copy: 'c1', socket: 0, rune: null })).status, 200);
    assert.deepEqual(await (await post('/api/heroes/rune', { guild: 'g1', copy: 'c1', socket: 0, rune: 'none' })).json(), { error: 'no_rune' });
    assert.equal((await post('/api/heroes/reroll', { guild: 'g1', copy: 'c1', option: 0 })).status, 200);
    assert.equal((await post('/api/heroes/reroll', { guild: 'g1', copy: 'c1', option: 'unique' })).status, 200);
    assert.deepEqual(await (await post('/api/heroes/reroll', { guild: 'g1', copy: 'c1', option: 1 })).json(), { error: 'no_option' });
    assert.equal((await post('/api/heroes/upgrade', { guild: 'g1', copy: 'c1' })).status, 200);
    assert.deepEqual(await (await post('/api/heroes/upgrade', { guild: 'g1', copy: 'c2' })).json(), { error: 'maxed' });
    assert.deepEqual(calls.slice(-8), ['rune c1 0 fierce-5', 'rune c1 0 null', 'rune c1 0 none', 'reroll c1 0', 'reroll c1 unique', 'reroll c1 1', 'upgrade c1', 'upgrade c2']);
    calls.length -= 8;
    assert.deepEqual(calls, [
      'equip kirze weapon c1',
      'buy g1 u1 kirze',
      'buy g1 u1 kirze',
      'buy g1 u1 nobody',
      'equip kirze weapon c1',
      'equip kirze treasure c1',
      'unequip kirze weapon',
      'unequip kirze null',
      'transcend kirze',
      'transcend klaus',
      'perks kirze atk-up,hp-up',
      'perks kirze ',
      'perks kirze atk-up,hp-up,def-up',
      'perks kirze t5-light',
      'perks klaus ',
      'refine c1',
      'refine c2',
      'sell c1,c2',
      'sell c2',
      'lock c1 true',
      'lock c2 true',
    ]);

    // A game's link (the TechnoMagic Raid's Manage popup): its own member, always in its own server; everything but buying.
    calls.length = 0;
    const token = signToken({ guildId: 'g1', userId: 'u1', name: 'ZEIU' }, 60_000);
    const link = { Origin: SITE.origin, 'Content-Type': 'application/json', Authorization: `Game ${token}` };
    const linked = (path: string, body: unknown) => fetch(`${base}${path}`, { method: 'POST', headers: link, body: JSON.stringify(body) });
    assert.equal((await fetch(`${base}/api/heroes`, { headers: link })).status, 200);
    assert.equal((await fetch(`${base}/api/heroes/members`, { headers: link })).status, 200);
    assert.equal((await fetch(`${base}/api/heroes?user=22`, { headers: link })).status, 200);
    assert.equal((await linked('/api/heroes/equip', { guild: 'g2', hero: 'kirze', slot: 'weapon', copy: 'c1' })).status, 200);
    assert.equal((await linked('/api/heroes/unequip', { hero: 'kirze' })).status, 200);
    assert.equal((await linked('/api/heroes/perks', { hero: 'kirze', perks: [] })).status, 200);
    assert.equal((await linked('/api/heroes/transcend', { hero: 'kirze' })).status, 200);
    assert.equal((await linked('/api/heroes/buy', { hero: 'klaus' })).status, 401, 'buying stays the site’s');
    assert.equal((await linked('/api/heroes/sell', { copies: ['c1'] })).status, 401, 'selling stays the site’s');
    assert.equal((await linked('/api/heroes/lock', { copy: 'c1', locked: true })).status, 401, 'locking stays the site’s');
    assert.equal((await fetch(`${base}/api/heroes`, { headers: { ...link, Authorization: 'Game nonsense' } })).status, 401);
    assert.deepEqual(calls, ['equip kirze weapon c1', 'unequip kirze null', 'perks kirze ', 'transcend kirze']);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

test("heroes: a hero's perk effects, what its picked perks give its stats, spelled out (its share too of what they give every ally)", () => {
  const view = heroesView([], {
    heroes: {
      // A warrior's: ATK Up, Opportune Strike (crit chance 150 points: 15%), Offensive Guard, Transcend 5's Light.
      kirze: { equipment: {}, transcend: 5, perks: ['atk-up', 'class-1', 'class-3', 't5-light'] },
      // A knight's Battle Cry: every ally's max HP, its own too.
      klaus: { equipment: {}, transcend: 5, perks: ['class-3'] },
      morrah: { equipment: {}, transcend: 5, perks: [] },
    },
    points: 0,
  } as unknown as MemberDoc);
  const effects = (id: string) => view.heroes.find((hero) => hero.id === id)?.perkEffects;
  assert.deepEqual(effects('kirze'), ['+45% Attack', '+15% Health', '+15% Critical Chance', '+30% Critical Damage', '+10% Attack Speed', '+15% Physical and Magical Defense', '+Attack equal to 50% of Physical Defense']);
  assert.deepEqual(effects('klaus'), ['+15% Health']);
  assert.deepEqual(effects('morrah'), []);
  assert.deepEqual(effects('laias'), [], 'not recruited: no perks');
});

test('heroes: transcendence, T0 to T5, each level more TP and its tier of perks; picked once each in their order, kept ones past it left out', () => {
  assert.deepEqual(TRANSCEND_TP, [0, 20, 35, 50, 65, 80]);
  assert.equal(TRANSCEND_POINTS, 80);
  assert.equal(transcendPoints(undefined), 0, 'a hero starts at T0');
  assert.equal(transcendPoints(1), 20);
  assert.equal(transcendPoints(9), 80);
  assert.equal(TRANSCEND_PERKS.length, 20);
  assert.equal(new Set(TRANSCEND_PERKS.map((perk) => perk.id)).size, 20);
  const t1 = TRANSCEND_PERKS.filter((perk) => perk.tier === 1).map((perk) => perk.id);
  assert.equal(perksCost(t1), 50);
  // At T5: every tier-1 perk (5 × 10) and two more (15 each) is all 80 TP.
  assert.deepEqual(transcendPicks(['t5-dark', ...t1, 's1-light', 'atk-up'], 5), [...t1, 's1-light', 't5-dark']);
  assert.equal(transcendPicks([...t1, 's1-light', 's1-dark', 't5-dark'], 5), 'too_many_points');
  assert.deepEqual(transcendPicks([], 0), []);
  // A tier opens with its level: T1's at T1, T2's at T2, T3's at T3, T5's at T5 (T4 only gives TP).
  assert.equal(transcendPicks(['atk-up'], 0), 'perk_locked');
  assert.equal(transcendPicks(['atk-up'], undefined), 'perk_locked');
  assert.deepEqual(transcendPicks(['atk-up', 'hp-up'], 1), ['atk-up', 'hp-up']);
  assert.equal(transcendPicks(['class-1'], 1), 'perk_locked');
  assert.deepEqual(transcendPicks(['class-1'], 2), ['class-1']);
  assert.equal(transcendPicks(['s1-light'], 2), 'perk_locked');
  assert.equal(transcendPicks(['t5-light'], 4), 'perk_locked');
  assert.deepEqual(transcendPicks(['t5-light'], 5), ['t5-light']);
  assert.deepEqual(keptPerks(['t5-dark', 'gone', 's1-light'], 5), ['s1-light', 't5-dark']);
  assert.deepEqual(keptPerks(['t5-dark', 's1-light'], 3), ['s1-light'], 'a tier past its level is left out');
  assert.deepEqual(keptPerks([...t1, 's1-light', 's1-dark', 't5-dark'], 5), [...t1, 's1-light', 's1-dark']);
  assert.deepEqual(keptPerks(undefined, undefined), []);
  assert.deepEqual(keptPerks(['atk-up'], undefined), [], 'nothing kept at T0');
  // The heroes view has each hero's, its level, TP and what the next one costs, and their gems and essences.
  const view = heroesView([], { points: 0, gems: 7, essences: { justice: 40 }, heroes: { kirze: { boughtAt: new Date(0), transcend: 5, perks: ['t5-light', 'hp-up'] }, klaus: { boughtAt: new Date(0) } } });
  const kirze = view.heroes.find((hero) => hero.id === 'kirze');
  assert.deepEqual(kirze?.perks, ['hp-up', 't5-light']);
  assert.deepEqual(kirze?.transcend, { level: 5, points: 80, next: null });
  assert.deepEqual(view.heroes.find((hero) => hero.id === 'klaus')?.transcend, { level: 0, points: 0, next: { essences: { justice: 20, strategy: 20, patience: 20 }, gems: 1 } });
  assert.deepEqual(view.heroes.find((hero) => hero.id === 'klaus')?.perks, []);
  assert.equal(view.gems, 7);
  assert.deepEqual(view.essences, { justice: 40, force: 0, wisdom: 0, strategy: 0, patience: 0, harmony: 0, fortune: 0 });
});

test('heroes: transcending costs its class’s three essences (20, 30, 40, 50, then 60 of each) and komaGems (1 to 5); each raid boss gives three kinds', () => {
  assert.deepEqual(transcendCost('wizard', undefined), { essences: { force: 20, wisdom: 20, harmony: 20 }, gems: 1 });
  assert.deepEqual(transcendCost('wizard', 1), { essences: { force: 30, wisdom: 30, harmony: 30 }, gems: 2 });
  assert.deepEqual(transcendCost('wizard', 4), { essences: { force: 60, wisdom: 60, harmony: 60 }, gems: 5 });
  assert.equal(transcendCost('wizard', 5), null);
  for (const kinds of Object.values(CLASS_ESSENCES)) assert.equal(new Set(kinds).size, 3);
  // Every kind comes from some boss, so every class can transcend.
  for (const boss of RAID_BOSS_IDS) assert.equal(new Set(RAID_BOSS_ESSENCES[boss]).size, 3, boss);
  assert.deepEqual(new Set(Object.values(RAID_BOSS_ESSENCES).flat()), new Set(ESSENCES));
  // A win pays 15 of each of its boss's kinds, 5 more for every level past 1: five times over (the Weekly Boss's first win of the week).
  assert.equal(DEFAULTS.raid.weeklyMultiplier, 5);
  assert.equal(raidRewards(1, DEFAULTS.raid).essences, 75);
  assert.equal(raidRewards(2, DEFAULTS.raid).essences, 100);
  assert.equal(raidRewards(10, DEFAULTS.raid).essences, 300);
  assert.equal(raidRewards(1, { ...DEFAULTS.raid, weeklyMultiplier: 1 }).essences, 15);
  assert.deepEqual(bossEssences('wyrm', 15), { justice: 15, force: 15, strategy: 15 });
  assert.deepEqual(bossEssences('wyrm', 0), {});
  assert.ok(findSpec('raid.essenceReward') && findSpec('raid.essenceRewardPerLevel'));
});

test('heroes: four pieces of a TechnoMagic set, each for its class, give the set its effect', () => {
  const piece = (part: string) => ({ item: item(`perseverance-warrior-${part}`), level: 1 });
  const ward = { item: item('perseverance-priest-armor'), level: 1 }; // the priest's
  const four = [piece('armor'), piece('secondary'), piece('ring'), piece('orb')];
  assert.equal(TM_SET_PIECES, 4);
  assert.deepEqual(heroSet(four, 'warrior'), { set: 'perseverance', pieces: 4 });
  assert.equal(activeSet(heroSet(four, 'warrior')), 'perseverance');
  assert.equal(activeSet(heroSet([...four.slice(0, 3), ward], 'warrior')), null, 'three are not');
  assert.equal(activeSet(heroSet(four, 'knight')), null, 'not for a knight');
  assert.ok(setLines(heroSet(four, 'warrior'), 'warrior')[0]?.includes('**Perseverance set**'));
  assert.deepEqual(setLines(heroSet(four.slice(0, 2), 'warrior'), 'warrior'), [], 'part of a set is not an effect');
  const copies = ['armor', 'secondary', 'ring', 'orb'].map((part) => ({ _id: part, itemId: `perseverance-warrior-${part}`, level: 1 }));
  const member = { heroes: { kirze: { boughtAt: new Date(0), equipment: { armor: 'armor', secondary: 'secondary', accessory: 'ring', orb: 'orb' } } } };
  assert.equal(raidGear(copies, member).get('kirze')?.set, 'perseverance');
});

test("heroes: every TechnoMagic piece says its set's effect for its own class: King's Raid's 4-piece skill", () => {
  assert.equal(TM_SET_LABEL, '4-set effect:');
  for (const piece of KR_ITEMS.filter((one) => KR_TM_SETS.includes(one.kr?.set ?? ''))) {
    const lines = setBonusLines(piece.kr!.set!, piece.kr!.classes[0]!, 0);
    const set = TM_SETS_BY_ID.get(piece.kr!.set as 'perseverance');
    assert.equal(lines.length, 1, piece.id);
    assert.equal(lines[0]?.text, set?.effects[piece.kr!.classes[0]!], piece.id);
  }
  assert.match(setBonusLines('perseverance', 'warrior', 4)[0]?.text ?? '', /ATK by 10%/);
});

test('heroes: a TechnoMagic copy’s set effect is on while its hero has the set, its additional effect while a hero of its class wears it', () => {
  const copy = (id: string, itemId: string) => ({ _id: id, itemId, level: 1, tmSkill: 'vigor' });
  const copies = [copy('a', 'perseverance-warrior-armor'), copy('s', 'perseverance-warrior-secondary'), copy('r', 'perseverance-warrior-ring'), copy('o', 'perseverance-warrior-orb'), copy('bag', 'perseverance-warrior-orb'), copy('p', 'perseverance-priest-armor')];
  const member = { heroes: { kirze: { boughtAt: new Date(0), equipment: { armor: 'a', secondary: 's', accessory: 'r', orb: 'o' } }, laias: { boughtAt: new Date(0), equipment: { armor: 'p' } } }, points: 0 };
  const on = activeTmEffects(copies, member);
  for (const id of ['a', 's', 'r', 'o']) assert.deepEqual(on.get(id), { set: true, additional: true, works: true }, id);
  assert.deepEqual(on.get('p'), { set: false, additional: true, works: true }, 'one piece is no set');
  assert.equal(on.get('bag'), undefined, 'one no hero wears has neither');
  const heroes = heroesView(copies, member);
  assert.equal(heroes.copies.find((one) => one.id === 'a')?.setEffect?.active, true);
  assert.equal(heroes.copies.find((one) => one.id === 'bag')?.setEffect?.active, false);
});

test("heroes: King's Raid's gear on a hero of another class gives it nothing: not its stats, its set or its additional skill", () => {
  const copies = [{ _id: 'a1', itemId: 'perseverance-priest-armor', level: 5, tmSkill: 'berserk', options: [{ stat: 'atk', step: 2 }] }];
  const member = { heroes: { kirze: { boughtAt: new Date(0), equipment: { armor: 'a1' } } }, points: 0 };
  const gear = raidGear(copies, member).get('kirze');
  assert.ok(gear && Object.values(gear.bonus).every((n) => n === 0), 'no stats');
  assert.equal(gear?.set, null);
  assert.deepEqual(gear?.skills, []);
});
