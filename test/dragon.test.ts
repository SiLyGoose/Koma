import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DEFAULTS } from '../src/config.js';
import { DRAGON_DROPS, DRAGON_GEMS, dragonClearGems, dragonDrops, dragonGems, TM_GEMS, tmClearGems, TM_ROOM } from '../src/constants/index.js';
import { HEROES } from '../src/data/heroes.js';
import { DRAGON_ESSENCES, ESSENCES } from '../src/data/transcend.js';
import { DRAGON_IDS, DRAGONS, dragonPay, isDragon, rollDragonEssences, rollDragonGear } from '../src/lib/game/dragon.js';
import { replay, rollDragonPieces, TM_BOSS } from '../src/lib/game/technomagic.js';
import { findSpec } from '../src/lib/settings-spec.js';
import type { BegunRun } from '../src/services/technomagic.js';
import type { Player } from '../src/web/auth/token.js';
import { GAMES } from '../src/web/config.js';
import { localFights } from '../src/web/games/technomagic/fight.js';
import { parseClientMessage, type RoomState, type ServerMessage } from '../src/web/games/technomagic/protocol.js';
import { DRAGON_RAID, TechnoMagicRooms, type Peer, type RoomDeps } from '../src/web/games/technomagic/room.js';

const ALL = HEROES.map((hero) => hero.id);
const LINEUP = HEROES.slice(0, TM_ROOM.slots);
// (A UW R5's ATK, a TechnoMagic weapon's and a UT R5's HP, and good potentials and more: the bosses are King's Raid's playtest's.)
const STRONG = { atkFlat: 110_000, hpFlat: 3_900_000, atk: 1, hp: 0.5, crit: 400, pen: 500, critDamage: 1, speed: 300 };

test("dragon: King's Raid's four dragons, on a page and socket of their own", () => {
  assert.deepEqual(DRAGON_IDS, ['temeraire', 'scalaxia', 'zyrrkinoth', 'armarta']);
  assert.deepEqual(DRAGONS.map((dragon) => dragon.name), ['Temeraire', 'Scalaxia', 'Zyrrkinoth', 'Armarta']);
  assert.ok(DRAGON_IDS.every(isDragon) && !isDragon(TM_BOSS));
  assert.equal(GAMES.dragon.page, '/games/dragon');
  assert.equal(GAMES.dragon.socket, '/dragon');
  assert.deepEqual(parseClientMessage('{"t":"hello","token":"x","boss":"armarta"}'), { t: 'hello', token: 'x', boss: 'armarta' });
  assert.equal(parseClientMessage('{"t":"hello","token":"x","boss":7}'), null);
  assert.deepEqual(parseClientMessage('{"t":"hello","token":"x","room":"ab12","create":false}'), { t: 'hello', token: 'x', room: 'ab12' });
  assert.deepEqual(parseClientMessage('{"t":"hello","token":"x","create":true}'), { t: 'hello', token: 'x', create: true });
  assert.equal(parseClientMessage('{"t":"hello","token":"x","room":""}'), null);
  assert.deepEqual(parseClientMessage('{"t":"boss","boss":"armarta"}'), { t: 'boss', boss: 'armarta' });
  assert.deepEqual(parseClientMessage('{"t":"part"}'), { t: 'part' });
});

test('dragon: a win pays more points and essences at each stage, and the settings say how much', () => {
  assert.deepEqual(dragonPay(1, DEFAULTS.dragon), { points: 750, essences: 8 });
  assert.deepEqual(dragonPay(10, DEFAULTS.dragon), { points: 3_000, essences: 44 });
  for (const key of ['dragon.winPoints', 'dragon.pointsPerStage', 'dragon.essences', 'dragon.essencesPerStage']) assert.ok(findSpec(key), key);
});

test('dragon: each stage pays komaGems the first time it is cleared, and a win clears those under it too', () => {
  assert.equal(DRAGON_GEMS.normal.length, 20);
  assert.equal(DRAGON_GEMS.hard.length, 10);
  assert.equal(dragonGems(1, 'normal'), 1);
  assert.equal(dragonGems(20, 'normal'), 4);
  assert.equal(dragonGems(1, 'hard'), 3);
  assert.equal(dragonGems(10, 'hard'), 10);
  assert.equal(dragonGems(99, 'hard'), 10, 'past the last stage, as the last');
  assert.equal(dragonClearGems(0, 1, 'hard'), 3, 'the first stage, the first time');
  assert.equal(dragonClearGems(10, 10, 'hard'), 0, 'cleared before: none');
  assert.equal(dragonClearGems(10, 3, 'hard'), 0, 'under what they have cleared: none');
  assert.equal(dragonClearGems(1, 10, 'normal'), 1 * 5 + 2 * 4, 'carried from Normal 1 to 10: stages 2 to 10');
  assert.equal(dragonClearGems(0, 20, 'normal') + dragonClearGems(0, 10, 'hard'), 100, 'every stage of a dragon: 100');
  assert.equal(TM_GEMS.length, 9, "Galgoria's stages");
  assert.equal(tmClearGems(0, 9), 105, 'every stage of the TechnoMagic Raid: 105');
  assert.equal(tmClearGems(2, 4), 5 + 10, 'carried from 2 to 4: stages 3 and 4');
  assert.equal(tmClearGems(9, 9), 0);
});

test('dragon: a Normal win pays as the Hard stage it is as tough as; one easier than all of them, less than Hard stage 1', () => {
  assert.deepEqual(dragonPay(13, DEFAULTS.dragon, 'normal'), dragonPay(3, DEFAULTS.dragon), 'Normal 13: as tough as Hard 3');
  assert.deepEqual(dragonPay(20, DEFAULTS.dragon, 'normal'), dragonPay(10, DEFAULTS.dragon));
  assert.deepEqual(dragonPay(1, DEFAULTS.dragon, 'normal'), { points: 58, essences: 1 });
  assert.deepEqual(dragonPay(12, DEFAULTS.dragon, 'normal'), { points: 692, essences: 7 });
  const first = { index: () => 0 };
  assert.deepEqual(rollDragonPieces('temeraire', 6, first, 'normal'), [], 'no gear before Normal 7');
  const seven = rollDragonPieces('temeraire', 7, first, 'normal');
  assert.deepEqual(seven.map((item) => item.kr?.tier), [6], 'a T6 piece from Normal 7 (the playtest’s T6 stages)');
  assert.deepEqual(rollDragonPieces('temeraire', 20, first, 'normal').map((item) => item.kr?.tier), rollDragonPieces('temeraire', 10, first).map((item) => item.kr?.tier));
});

test('dragon: each dragon gives two kinds of essences after its element, every kind from one dragon or another', () => {
  assert.deepEqual(rollDragonEssences('temeraire', 10), { force: 10, justice: 10 });
  assert.deepEqual(rollDragonEssences('scalaxia', 10), { wisdom: 10, patience: 10 });
  assert.deepEqual(rollDragonEssences('zyrrkinoth', 10), { fortune: 10, strategy: 10 });
  // Armarta: Harmony, and a kind rolled for each win (Harmony again: 20 of it).
  assert.deepEqual(rollDragonEssences('armarta', 10, { index: () => ESSENCES.indexOf('force') }), { harmony: 10, force: 10 });
  assert.deepEqual(rollDragonEssences('armarta', 10, { index: () => ESSENCES.indexOf('harmony') }), { harmony: 20 });
  assert.deepEqual(rollDragonEssences('galgoria', 10), {});
  assert.deepEqual(rollDragonEssences('temeraire', 0), {});
  assert.deepEqual(new Set(Object.values(DRAGON_ESSENCES).flat().filter((kind) => kind !== null)), new Set(ESSENCES));
});

test('dragon: a win gives hero gear (raid items, never TechnoMagic gear), more and better at the higher stages', () => {
  assert.equal(DRAGON_DROPS.length, 10);
  let next = 0;
  const rng = { index: (max: number) => next++ % max };
  for (let stage = 1; stage <= 10; stage++) {
    const gear = rollDragonGear(stage, rng);
    const counts = dragonDrops(stage);
    assert.equal(gear.length, (counts[3] ?? 0) + (counts[4] ?? 0), `stage ${stage}`);
    assert.ok(gear.every((item) => item.raidDrop && !item.tmDrop), `stage ${stage}`);
    assert.deepEqual(gear.map((item) => item.stars), [...gear.map((item) => item.stars)].sort((a, b) => b - a), 'the best first');
  }
  assert.ok(rollDragonGear(1).every((item) => item.stars === 3), 'no 4-star at stage 1');
  assert.ok(rollDragonGear(10).some((item) => item.stars === 4));
  assert.deepEqual(dragonDrops(50), dragonDrops(10));
});

test('dragon: each dragon is fought the same every time from the same seed, and a strong party on Auto beats it', () => {
  for (const boss of DRAGON_IDS) {
    const run = { boss, seed: 9, stage: 1, heroes: LINEUP.map((hero) => ({ id: hero.id, skin: 0, gear: STRONG })) };
    const once = replay(run, []);
    assert.deepEqual(replay(run, [], once.sums), once, boss);
    assert.equal(once.result, 'won', boss);
    assert.equal(once.parted, null, boss);
  }
});

/** A Dragon Raid room with a hand-turned clock and a pretend database: what each run was begun against, and what it paid. */
function harness() {
  let clock = 0;
  const ticks: (() => void)[] = [];
  const announced: [string, string][] = [];
  const begun: string[] = [];
  const modes: string[] = [];
  const deps: RoomDeps = {
    now: () => clock,
    avatar: () => null,
    owned: async () => ALL,
    cleared: async () => ({ hard: 0, normal: 0 }),
    begin: async (_g, _stage, players, boss, mode) => {
      begun.push(boss);
      modes.push(mode);
      return {
        id: 'run',
        boss,
        seed: 5,
        players: new Map(players.map(({ userId }) => [userId, { owned: new Set(ALL), gear: new Map(ALL.map((id) => [id, STRONG])), sets: new Map(ALL.map((id) => [id, null])), uws: new Map(ALL.map((id) => [id, null])), uts: new Map(ALL.map((id) => [id, null])), skills: new Map(ALL.map((id) => [id, []])), perks: new Map(ALL.map((id) => [id, []])) }])),
      } as BegunRun;
    },
    finish: async (_g, run, _stage, result) =>
      new Map([...run.players.keys()].map((userId) => [userId, result === 'won' ? { drops: [], points: 750, essences: { force: 8, justice: 8 } } : { drops: [], points: 0 }])),
    announce: (_g, host, boss) => announced.push([host, boss]),
    link: (guildId, boss) => `https://site/?play=dragon&guild=${guildId}&mode=multi&boss=${boss}`,
    every: (_ms, fn) => {
      ticks.push(fn);
      return () => ticks.splice(ticks.indexOf(fn), 1);
    },
    after: () => () => {},
    fights: localFights,
  };
  const rooms = new TechnoMagicRooms(deps, DRAGON_RAID);
  const peer = () => {
    const got: ServerMessage[] = [];
    const p: Peer & { room: () => RoomState } = { send: (m) => got.push(m), close: () => {}, room: () => (got.filter((m) => m.t === 'room').at(-1) as { state: RoomState }).state };
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
  return { rooms, deps, peer, player, announced, begun, modes, pass };
}

test('dragon room: a page naming no raid joins an open one against the dragon it names, or creates one, said in Discord with its dragon', () => {
  const h = harness();
  const a = h.peer();
  const temeraire = h.rooms.join(h.player('a'), a, ALL, 0, h.deps)!;
  const state = a.room();
  assert.equal(state.raid, 'dragon');
  assert.deepEqual(state.boss, { id: 'temeraire', name: 'Temeraire', stages: 10, normal: 20 }, 'the first dragon, with none named');
  assert.equal(state.mode, 'hard', 'in Hard, unless the host picks Normal');
  assert.deepEqual(state.bosses.map((boss) => boss.id), DRAGON_IDS);
  assert.equal(state.link, 'https://site/?play=dragon&guild=g1&mode=multi&boss=temeraire');

  const b = h.peer();
  const armarta = h.rooms.join(h.player('b'), b, ALL, 0, h.deps, false, 'armarta')!;
  assert.notEqual(armarta.room, temeraire.room);
  assert.deepEqual(b.room().boss, { id: 'armarta', name: 'Armarta', stages: 10, normal: 20 });
  assert.deepEqual(h.announced, [['A', 'temeraire'], ['B', 'armarta']]);

  // One that isn't a dragon: the first dragon's room. And one page a player: a's page in another dragon's room takes over.
  const c = h.peer();
  assert.equal(h.rooms.join(h.player('c'), c, ALL, 0, h.deps, false, 'galgoria')!.room, temeraire.room);
  const again = h.peer();
  const moved = h.rooms.join(h.player('a'), again, ALL, 0, h.deps, false, 'armarta')!;
  assert.equal(moved.room, armarta.room);
  assert.equal(moved.replaced, a);
});

test("dragon room: a run is against the room's dragon, and a win says the essences each player got", async () => {
  const h = harness();
  const a = h.peer();
  const { room } = h.rooms.join(h.player('a'), a, ALL, 0, h.deps, true, 'scalaxia')!;
  for (const hero of ALL.slice(0, 4)) assert.equal(room.pick('a', hero, 0), null);
  assert.equal(await room.begin('a'), null);
  assert.deepEqual(h.begun, ['scalaxia']);
  assert.equal(a.room().phase, 'fight');
  for (let i = 0; i < 200 && a.room().phase === 'fight'; i++) await h.pass(1_000);
  const over = a.room().over;
  assert.equal(over?.result, 'won');
  assert.deepEqual(over?.essences, { a: { force: 8, justice: 8 } });
  assert.deepEqual(over?.points, { a: 750 });
});

test('dragon room: single player, up to 8 heroes, a Main Team of 4 and a Sub Team of 4', async () => {
  const h = harness();
  const a = h.peer();
  const { room } = h.rooms.join(h.player('a'), a, ALL, 0, h.deps, true, 'temeraire')!;
  assert.equal(a.room().slots, TM_ROOM.dragonSoloSlots);
  assert.equal(TM_ROOM.dragonSoloSlots, 8);
  const [main, sub] = [ALL.slice(0, TM_ROOM.mainTeam), ALL.slice(TM_ROOM.mainTeam, TM_ROOM.dragonSoloSlots)];
  for (const hero of main) assert.equal(room.pick('a', hero, 0), null);
  for (const hero of sub) assert.equal(room.pick('a', hero, 0, true), null);
  assert.equal(a.room().lineup.length, 8);
  assert.equal(room.pick('a', ALL[TM_ROOM.dragonSoloSlots] as string, 0, true), 'limit');
  assert.equal(await room.begin('a'), null);
  assert.equal(a.room().phase, 'fight');
});

test('dragon room: raids are created apart, joined by their id, and listed for Find Raid; one over is gone', () => {
  const h = harness();
  const a = h.peer();
  const first = h.rooms.join(h.player('a'), a, ALL, 0, h.deps, false, 'temeraire', { create: true })!;
  const id = a.room().room;
  assert.ok(id, 'a raid has an id');
  // Another created against the same dragon is a raid of its own, never the same one.
  const b = h.peer();
  const second = h.rooms.join(h.player('b'), b, ALL, 0, h.deps, false, 'temeraire', { create: true })!;
  assert.notEqual(second.room, first.room);
  assert.notEqual(b.room().room, id);
  // Joined by its id (whatever dragon the page names), or a page naming none goes into an open one.
  const c = h.peer();
  assert.equal(h.rooms.join(h.player('c'), c, ALL, 0, h.deps, false, 'armarta', { room: id! })!.room, first.room);
  assert.deepEqual(c.room().boss, { id: 'temeraire', name: 'Temeraire', stages: 10, normal: 20 });
  assert.deepEqual(h.rooms.bossFor(h.player('d'), { room: id! }), { id: 'temeraire', name: 'Temeraire', stages: 10, normal: 20 });
  // Find Raid: the fullest first; none against another dragon.
  const listed = h.rooms.lobbies('g1', 'temeraire');
  assert.deepEqual(listed.map((one) => [one.id, one.host.name, one.players, one.most]), [
    [id, 'A', 2, TM_ROOM.players],
    [b.room().room, 'B', 1, TM_ROOM.players],
  ]);
  assert.deepEqual(h.rooms.lobbies('g1', 'armarta'), []);
  assert.deepEqual(h.rooms.lobbies('g2', 'temeraire'), [], 'only the server asked about');
  // A raid that isn't there: none to join.
  assert.equal(h.rooms.bossFor(h.player('d'), { room: 'nope' }), null);
  assert.equal(h.rooms.join(h.player('d'), h.peer(), ALL, 0, h.deps, false, 'temeraire', { room: 'nope' }), null);
});

test('dragon room: the host takes the raid against another dragon, everyone with it; anyone can part from it at once', async () => {
  const h = harness();
  const a = h.peer();
  const { room } = h.rooms.join(h.player('a'), a, ALL, 0, h.deps, false, 'temeraire', { create: true })!;
  const b = h.peer();
  h.rooms.join(h.player('b'), b, ALL, 0, h.deps, false, 'temeraire', { room: a.room().room! });
  assert.equal(room.pick('a', ALL[0]!, 0), null);
  assert.equal(room.pick('b', ALL[1]!, 0), null);
  assert.equal(room.ready('b', true), null);
  assert.equal(await room.setBoss('b', 'armarta'), 'only_host');
  assert.equal(await room.setBoss('a', 'galgoria'), 'closed', 'not one of the raid’s');
  // The host has won stage 3 against Armarta: up to 4 there.
  h.deps.cleared = async (_g, userId, boss) => ({ hard: userId === 'a' && boss === 'armarta' ? 3 : 0, normal: 0 });
  assert.equal(await room.setBoss('a', 'armarta'), null);
  for (const page of [a, b]) {
    assert.deepEqual(page.room().boss, { id: 'armarta', name: 'Armarta', stages: 10, normal: 20 });
    assert.deepEqual(page.room().players.map((p) => p.id), ['a', 'b'], 'everyone with it');
  }
  assert.deepEqual([a.room().stage, a.room().unlocked], [4, 4], 'the highest stage the host has opened against it');
  assert.equal(b.room().players[1]?.ready, false, 'nobody ready against the new dragon');
  assert.equal(a.room().lineup.length, 2, 'the picks kept');
  assert.deepEqual(h.rooms.lobbies('g1', 'armarta').map((one) => one.id), [a.room().room]);
  assert.deepEqual(h.rooms.lobbies('g1', 'temeraire'), []);
  // Back to a dragon the host has won nothing against: stage 1 there.
  assert.equal(await room.setBoss('a', 'temeraire'), null);
  assert.deepEqual([a.room().stage, a.room().unlocked], [1, 1]);
  assert.equal(await room.setBoss('a', 'armarta'), null);

  // b parts: gone at once, picks and all, not kept for a while as a page gone is.
  assert.equal(room.part('b'), null);
  assert.deepEqual(a.room().players.map((p) => p.id), ['a']);
  assert.equal(a.room().lineup.length, 1);
  // The last to part: the raid is over.
  assert.equal(room.part('a'), null);
  assert.deepEqual(h.rooms.lobbies('g1', 'armarta'), []);
  assert.equal(h.rooms.bossFor(h.player('a'), { room: 'x' }), null);
});

test('dragon room: the host takes the raid between Normal and Hard, each with its own stages opened, and the run is in its mode', async () => {
  const h = harness();
  const a = h.peer();
  const { room } = h.rooms.join(h.player('a'), a, ALL, { hard: 2, normal: 5 }, h.deps, false, 'temeraire', { create: true })!;
  const b = h.peer();
  h.rooms.join(h.player('b'), b, ALL, 0, h.deps, false, 'temeraire', { room: a.room().room! });
  assert.deepEqual([a.room().mode, a.room().stage, a.room().stages, a.room().unlocked], ['hard', 3, 10, 3]);
  assert.equal(room.setMode('b', 'normal'), 'only_host');
  assert.equal(room.setMode('a', 'normal'), null);
  for (const page of [a, b]) assert.deepEqual([page.room().mode, page.room().stage, page.room().stages, page.room().unlocked], ['normal', 6, 20, 6], 'the highest Normal stage the host has opened');
  assert.equal(h.rooms.lobbies('g1', 'temeraire')[0]?.mode, 'normal', 'Find Raid says its mode');
  assert.equal(room.setStage('a', 7), 'locked');
  assert.equal(room.setStage('a', 4), null);
  assert.equal(room.setMode('a', 'hard'), null);
  assert.deepEqual([a.room().mode, a.room().stage], ['hard', 3]);
  assert.equal(room.setMode('a', 'normal'), null);
  assert.equal(room.setStage('a', 1), null);
  assert.equal(room.pick('a', ALL[0]!, 0), null);
  for (const hero of ALL.slice(1, 4)) assert.equal(room.pick('b', hero, 0), null);
  assert.equal(room.ready('b', true), null);
  assert.equal(await room.begin('a'), null);
  assert.deepEqual(h.modes, ['normal']);
  assert.equal(room.setMode('a', 'hard'), 'closed', 'not in a fight');
  for (let i = 0; i < 200 && a.room().phase === 'fight'; i++) await h.pass(1_000);
  assert.equal(a.room().over?.result, 'won');
  assert.equal(room.back('a'), null);
  assert.deepEqual([a.room().mode, a.room().unlocked], ['normal', 6], 'a Normal 1 win opens nothing new past Normal 6');
  assert.equal(room.setMode('a', 'hard'), null);
  assert.equal(a.room().unlocked, 3, 'Hard untouched');

  assert.deepEqual(parseClientMessage('{"t":"mode","mode":"normal"}'), { t: 'mode', mode: 'normal' });
  assert.equal(parseClientMessage('{"t":"mode","mode":"hell"}'), null);
});

test('dragon room: the TechnoMagic Raid has no Normal mode', () => {
  const h = harness();
  const rooms = new TechnoMagicRooms(h.deps);
  const a = h.peer();
  const { room } = rooms.join(h.player('a'), a, ALL, 0, h.deps)!;
  assert.equal(a.room().boss.normal, undefined);
  assert.equal(room.setMode('a', 'normal'), 'closed');
  assert.equal(a.room().mode, 'hard');
});
