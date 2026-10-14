import assert from 'node:assert/strict';
import { test } from 'node:test';
import { GAMES } from '../src/web/config.js';
import { DEFAULTS } from '../src/config.js';
import { TM_ROOM } from '../src/constants/index.js';
import { ITEMS, TM_DROPS } from '../src/data/items.js';
import { HEROES } from '../src/data/heroes.js';
import { raidBonuses } from '../src/lib/game/heroes.js';
import { fourStarChance, HERO_SKINS, MOST_STAGE, replay, rollTmDrop, SIM_VERSION, startRaid, TM_BOSS, type Run } from '../src/lib/game/technomagic.js';
import { findSpec, validateSettings } from '../src/lib/settings-spec.js';
import type { Player } from '../src/web/auth/token.js';
import { heroesView } from '../src/web/models/heroes.js';
import { parseClientMessage, type RoomState, type ServerMessage } from '../src/web/games/technomagic/protocol.js';
import { TechnoMagicRooms, type Peer, type RoomDeps } from '../src/web/games/technomagic/room.js';
import type { BegunRun } from '../src/services/technomagic.js';
import type { ItemCopyDoc, MemberDoc } from '../src/types.js';

/** Every hero, in its first skin, with `gear`. */
const run = (seed: number, gear: Record<string, number>, stage = 1, solo = false): Run => ({ boss: TM_BOSS, seed, stage, solo, heroes: HEROES.map((hero) => ({ id: hero.id, skin: 0, gear })) });
const STRONG = { atk: 3, hp: 2, crit: 400, pen: 500, critDamage: 1, speed: 300 };
const ALL = HEROES.map((hero) => hero.id);

test('technomagic: the sim the bot has knows every hero of the bot, and the boss', () => {
  for (const hero of HEROES) assert.ok((HERO_SKINS[hero.id] ?? 0) >= 1, hero.id);
  assert.equal(typeof SIM_VERSION, 'number');
  assert.equal(MOST_STAGE, 8);
  assert.equal(GAMES.technomagic.page, '/games/technomagic');
});

test('technomagic: a raid is the same every time it is run, and a strong party on Auto wins it', () => {
  const inputs = [0, 1, 2].map((fighter) => ({ tick: 0, kind: 'auto', fighter }));
  const once = replay(run(42, STRONG), inputs);
  const again = replay(run(42, STRONG), inputs, once.sums);
  assert.equal(once.result, 'won');
  assert.deepEqual(again, once);
  assert.notDeepEqual(replay(run(43, {}), inputs).sums, replay(run(42, {}), inputs).sums);
  // The live raid, stepped by hand with the same inputs, is the same fight.
  const live = startRaid(run(42, STRONG));
  assert.ok(typeof live !== 'string');
  for (const fighter of [0, 1, 2]) assert.ok(live.input({ kind: 'auto', fighter }));
  assert.equal(live.input({ kind: 'skill', fighter: 7, skill: 0 }), false);
  while (!live.result) live.step();
  assert.equal(live.tick, once.ticks);
  assert.deepEqual([...live.sums], once.sums);
});

test('technomagic: alone the boss is easier; heroes that fall stay down; giving up is losing', () => {
  const alone = replay(run(5, STRONG, 1, true), [0, 1, 2].map((fighter) => ({ tick: 0, kind: 'auto', fighter })));
  const together = replay(run(5, STRONG), [0, 1, 2].map((fighter) => ({ tick: 0, kind: 'auto', fighter })));
  assert.ok(alone.ticks < together.ticks, `${alone.ticks} < ${together.ticks}`);
  // With no gear and nothing pressed, every hero falls and none gets up: lost before the boss's rage.
  const weak = replay(run(9, { hp: -0.9 }), []);
  assert.equal(weak.result, 'lost');
  assert.equal(replay(run(1, STRONG), [{ tick: 30, kind: 'leave' }]).result, 'lost');
  assert.equal(replay(run(1, STRONG), [{ tick: 5, kind: 'toggle', fighter: 0 }]).result, 'invalid');
});

test('technomagic: a win gives one TechnoMagic item, 4-star the likelier the higher the stage; 10 runs a day give it', () => {
  const cfg = DEFAULTS.hero;
  assert.equal(cfg.rewardsPerDay, 10);
  assert.ok(fourStarChance(8, cfg) > fourStarChance(1, cfg));
  assert.equal(rollTmDrop(1, cfg, { chance: () => true, index: () => 0 })?.stars, 4);
  assert.equal(rollTmDrop(1, cfg, { chance: () => false, index: () => 0 })?.stars, 3);
  assert.equal(rollTmDrop(1, cfg, undefined, []), null);
  for (const key of ['hero.rewardsPerDay', 'hero.fourStarChance', 'hero.fourStarPerStage']) assert.equal(findSpec(key)?.group, 'Hero', key);
  assert.deepEqual(validateSettings(DEFAULTS), []);
});

test('technomagic: a run is fought with the gear the heroes page shows', () => {
  const weapon = ITEMS.find((item) => item.raidDrop && item.slot === 'weapon' && !item.class)!;
  const treasure = TM_DROPS.find((item) => item.slot === 'treasure')!;
  const copies: ItemCopyDoc[] = [
    { _id: 'c1', guildId: 'g', userId: 'u', itemId: weapon.id, level: 3, obtainedAt: new Date() },
    { _id: 'c2', guildId: 'g', userId: 'u', itemId: treasure.id, level: 1, obtainedAt: new Date(), masterwork: true },
  ];
  const member = { heroes: { kirze: { boughtAt: new Date(), equipment: { weapon1: 'c1', treasure: 'c2', armor1: 'gone' } } }, points: 0 } as unknown as MemberDoc;
  const gear = raidBonuses(copies, member);
  assert.deepEqual([...gear.keys()], ['kirze']);
  assert.deepEqual(gear.get('kirze'), heroesView(copies, member).heroes.find((hero) => hero.id === 'kirze')?.bonus);
});

test('technomagic: the page says only what the room takes', () => {
  assert.deepEqual(parseClientMessage('{"t":"pick","hero":"kirze","skin":0}'), { t: 'pick', hero: 'kirze', skin: 0 });
  assert.deepEqual(parseClientMessage('{"t":"press","fighter":2,"skill":1}'), { t: 'press', fighter: 2, skill: 1 });
  assert.equal(parseClientMessage('{"t":"press","fighter":-1,"skill":1}'), null);
  assert.equal(parseClientMessage('{"t":"toggle","fighter":0}'), null);
  assert.equal(parseClientMessage('nope'), null);
});

/** A room with a hand-turned clock and a pretend database. */
function harness(owned: Record<string, string[]> = {}) {
  let clock = 0;
  const ticks: (() => void)[] = [];
  const announced: string[] = [];
  const finished: { result: string; ticks: number }[] = [];
  const deps: RoomDeps = {
    now: () => clock,
    avatar: () => null,
    owned: async (_g, userId) => owned[userId] ?? ALL,
    rewardsLeft: async () => 10,
    begin: async (_g, _stage, players) =>
      ({
        id: 'run',
        seed: 77,
        players: new Map(players.map(({ userId }) => [userId, { owned: new Set(owned[userId] ?? ALL), gear: new Map(ALL.map((id) => [id, STRONG])), rewardable: userId !== 'broke' }])),
      }) as BegunRun,
    finish: async (_g, begun, _stage, result, steps) => {
      finished.push({ result, ticks: steps });
      return new Map([...begun.players].map(([userId, player]) => [userId, result === 'won' && player.rewardable ? [{ itemId: 'galgorias-heart', name: "Galgoria's Heart", stars: 4 }] : []]));
    },
    announce: (_g, host) => announced.push(host),
    every: (_ms, fn) => {
      ticks.push(fn);
      return () => ticks.splice(ticks.indexOf(fn), 1);
    },
  };
  const rooms = new TechnoMagicRooms(deps);
  const peer = () => {
    const got: ServerMessage[] = [];
    const p: Peer & { got: ServerMessage[]; room: () => RoomState } = {
      got,
      send: (m) => got.push(m),
      close: () => {},
      room: () => (got.filter((m) => m.t === 'room').at(-1) as { state: RoomState }).state,
    };
    return p;
  };
  const player = (userId: string): Player => ({ guildId: 'g1', userId, name: userId.toUpperCase() });
  /** Moves the clock on by `ms`, the fight's turn firing every 100. */
  const pass = async (ms: number) => {
    for (let at = 0; at < ms; at += 100) {
      clock += 100;
      for (const fn of [...ticks]) fn();
      await new Promise((resolve) => setImmediate(resolve));
    }
  };
  return { rooms, peer, player, deps, announced, finished, pass };
}

test('technomagic room: the host brings up to 4, everyone else 2, 9 in all; alone, up to 8', async () => {
  const h = harness();
  const a = h.peer();
  const { room } = h.rooms.join(h.player('a'), a, ALL, 10)!;
  assert.deepEqual(h.announced, ['A']);
  assert.equal(a.room().slots, TM_ROOM.soloSlots);
  assert.equal(a.room().players[0]?.limit, TM_ROOM.soloSlots);
  for (const hero of ALL) assert.equal(room.pick('a', hero, 0), null);
  assert.equal(room.pick('a', 'kirze', 0), 'picked');
  assert.equal(room.pick('a', 'nobody', 0), 'not_owned');

  // A second player: the host's limit goes to 4 (theirs are 3, so they stay), the slots to 9.
  const b = h.peer();
  h.rooms.join(h.player('b'), b, ['kirze', 'clause', 'fallen-frey'], 10);
  assert.deepEqual(h.announced, ['A'], 'the room was opened once');
  const state = b.room();
  assert.equal(state.slots, TM_ROOM.slots);
  assert.equal(state.solo, false);
  assert.deepEqual(state.players.map((p) => [p.number, p.host, p.limit]), [[1, true, 4], [2, false, 2]]);
  assert.equal(room.pick('b', 'kirze', 0), null, 'two players may each bring their own Kirze');
  assert.equal(room.pick('b', 'clause', 0), null);
  assert.equal(room.pick('b', 'fallen-frey', 0), 'limit');
  assert.equal(b.room().lineup.length, 5);

  // Only the host starts, and only with everyone ready.
  assert.equal(await room.begin('b'), 'only_host');
  assert.equal(await room.begin('a'), 'not_ready');
  assert.equal(room.ready('b', true), null);
  assert.equal(room.ready('a', true), 'only_host');
  assert.equal(room.setStage('b', 3), 'only_host');
  assert.equal(room.setStage('a', 3), null);

  // The host goes: b is host, alone again, and keeps both of theirs.
  room.leave('a', a);
  assert.deepEqual(b.room().players.map((p) => [p.id, p.host, p.limit]), [['b', true, 8]]);
  assert.deepEqual(b.room().lineup.map((p) => p.owner), ['b', 'b']);
});

test('technomagic room: a fight is run by the bot, each pressing only their own heroes, and a win gives each their drop', async () => {
  const h = harness();
  const a = h.peer();
  const b = h.peer();
  const { room } = h.rooms.join(h.player('a'), a, ALL, 10)!;
  h.rooms.join(h.player('broke'), b, ALL, 0);
  room.pick('a', 'kirze', 0);
  room.pick('a', 'fallen-frey', 0);
  room.pick('broke', 'clause', 0);
  assert.equal(await room.begin('a'), 'not_ready');
  room.ready('broke', true);
  assert.equal(await room.begin('a'), null);
  assert.equal(a.room().phase, 'fight');
  const fight = a.got.find((m) => m.t === 'fight');
  assert.ok(fight && fight.t === 'fight');
  assert.deepEqual(fight.fight.heroes.map((hero) => [hero.owner, hero.id]), [['a', 'kirze'], ['a', 'fallen-frey'], ['broke', 'clause']]);
  assert.equal(room.pick('a', 'clause', 0), 'closed');

  // Their own heroes only: a's Auto on for both of theirs; broke can't press a's.
  room.autoAll('a');
  room.press('broke', 0, 0);
  room.auto('broke', 2);
  await h.pass(300);
  const turns = a.got.filter((m) => m.t === 'turn');
  const pressed = turns.flatMap((m) => (m.t === 'turn' ? m.inputs : []));
  assert.deepEqual(pressed.map((input) => [input.kind, input.fighter]), [['auto', 0], ['auto', 1], ['auto', 2]]);
  assert.ok(pressed.every((input) => input.tick === pressed[0]?.tick));
  const last = turns.at(-1);
  assert.ok(last && last.t === 'turn' && last.upTo === 9, 'three turns of 100 ms: 9 steps');

  // broke leaves and comes back mid-fight: their hero fights on, and the page is given the fight so far.
  room.leave('broke', b);
  assert.equal(a.room().players.find((p) => p.id === 'broke')?.away, true);
  const back = h.peer();
  h.rooms.join(h.player('broke'), back, ALL, 0);
  assert.equal(back.got.filter((m) => m.t === 'fight').length, 1);
  const sofar = back.got.find((m) => m.t === 'turn');
  assert.ok(sofar && sofar.t === 'turn' && sofar.inputs.length === 3);

  // The fight runs to its end on the bot's clock alone.
  for (let i = 0; i < 300 && a.room().phase === 'fight'; i++) await h.pass(1000);
  const over = a.room();
  assert.equal(over.phase, 'over');
  assert.equal(over.over?.result, 'won');
  assert.equal(over.over?.drops.a?.[0]?.name, "Galgoria's Heart");
  assert.deepEqual(over.over?.drops.broke, []);
  assert.deepEqual(over.over?.rewarded, ['a']);
  assert.equal(h.finished.length, 1);

  // The fight the pages ran, from what they were told, ends the same.
  const told = a.got.filter((m) => m.t === 'turn').flatMap((m) => (m.t === 'turn' ? m.inputs : []));
  const again = replay({ boss: TM_BOSS, seed: 77, stage: 1, heroes: fight.fight.heroes.map(({ id, skin, gear }) => ({ id, skin, gear })) }, told);
  assert.equal(again.result, 'won');
  assert.equal(again.ticks, h.finished[0]?.ticks);

  assert.equal(room.back('a'), null);
  assert.equal(a.room().phase, 'prep');
  assert.equal(a.room().lineup.length, 3);
});

test('technomagic room: the host can give up, and a room with nobody left is gone', async () => {
  const h = harness();
  const a = h.peer();
  const { room } = h.rooms.join(h.player('a'), a, ALL, 10)!;
  room.pick('a', 'kirze', 0);
  assert.equal(await room.begin('a'), null);
  assert.equal(room.giveUp('a'), null);
  await h.pass(200);
  assert.equal(a.room().over?.result, 'lost');
  room.leave('a', a);
  const again = h.peer();
  h.rooms.join(h.player('c'), again, ALL, 10);
  assert.equal(again.room().players.length, 1, 'a new room');
  assert.equal(again.room().phase, 'prep');
});
