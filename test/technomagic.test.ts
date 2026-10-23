import assert from 'node:assert/strict';
import { test } from 'node:test';
import { GAMES } from '../src/web/config.js';
import { DEFAULTS } from '../src/config.js';
import { DRAGON_ROOM, TM_FIGHT, TM_ROOM } from '../src/constants/index.js';
import { ITEMS, TM_DROPS, tmDropsOf } from '../src/data/items.js';
import { HEROES, HEROES_BY_ID } from '../src/data/heroes.js';
import { TRANSCEND_PERKS } from '../src/data/transcend.js';
import { raidBonuses, raidGear } from '../src/lib/game/heroes.js';
import { MOST_STAGE, MOST_TICKS, MOST_TM_SKILLS, replay, rollTmArmorDef, rollTmDrop, rollTmPotentials, rollTmSkill, SIM_VERSION, startRaid, TM_BOSS, TM_SKILLS, tmSkillLine, wholePotentials, type Run } from '../src/lib/game/technomagic.js';
import { tmDropCount } from '../src/constants/technomagic.js';
import { TM_POTENTIAL_IDS, TM_POTENTIAL_LINES, TM_POTENTIAL_RANGES, UT_OPTION_LINES } from '../src/data/tm-potentials.js';
import { KR_POOLS, krOptionValue, rerollKrOption, rerollPrice, rollKrOptions, upgradable, upgradeKrOption, upgradePrice } from '../src/data/kr-gear.js';
import { ITEMS_BY_ID } from '../src/data/items.js';
import { pieceBonus, potentialLines } from '../src/lib/game/heroes.js';
import { findSpec, validateSettings } from '../src/lib/settings-spec.js';
import type { Player } from '../src/web/auth/token.js';
import { heroesView } from '../src/web/models/heroes.js';
import { databankView } from '../src/web/models/databank.js';
import { parseClientMessage, type RoomState, type ServerMessage } from '../src/web/games/technomagic/protocol.js';
import { localFights, workerFights, type Intent, type Progress } from '../src/web/games/technomagic/fight.js';
import { DRAGON_RAID, TechnoMagicRooms, type Peer, type RoomDeps } from '../src/web/games/technomagic/room.js';
import { type BegunRun } from '../src/services/technomagic.js';
import type { ItemCopyDoc, MemberDoc } from '../src/types.js';

/** Every hero, in its first skin, with `gear`. */
/** The heroes a raid's run fields: as many as a room's lineup holds (the first of them). */
const LINEUP = HEROES.slice(0, TM_ROOM.slots);
const run = (seed: number, gear: Record<string, number>, stage = 1, solo = false): Run => ({ boss: TM_BOSS, seed, stage, solo, heroes: LINEUP.map((hero) => ({ id: hero.id, skin: 0, gear })) });
// (A UW R5's ATK, a TechnoMagic weapon's and a UT R5's HP, and good potentials and more: the bosses are King's Raid's playtest's.)
const STRONG = { atkFlat: 110_000, hpFlat: 3_900_000, atk: 1, hp: 0.5, crit: 400, pen: 500, critDamage: 1, speed: 300 };
const ALL = HEROES.map((hero) => hero.id);

test("technomagic: the bot's heroes are the sim's, each with a skin, and the boss", () => {
  assert.ok(HEROES.length > 0);
  for (const hero of HEROES) assert.ok(hero.skins >= 1, hero.id);
  assert.match(SIM_VERSION, /^[0-9a-f]{12}$/);
  assert.equal(MOST_STAGE, 20, "the Normal dragons' 20 (the Hard ones have 10, Galgoria 8)");
  assert.equal(GAMES.technomagic.page, '/games/technomagic');
});

test("technomagic: each hero's skills are the sim's, in King's Raid's words with the fight's numbers, sent to the site", () => {
  for (const hero of HEROES) {
    assert.equal(hero.abilities.length, 4, `${hero.id}: three skills, then its passive`);
    for (const skill of hero.abilities.slice(0, 3)) assert.ok(skill.name && skill.text && skill.cost !== null && skill.cooldown !== null, `${hero.id} ${skill.name}`);
    const passive = hero.abilities[3];
    assert.ok(passive?.name && passive.text && passive.cost === null && passive.cooldown === null, `${hero.id}'s passive`);
  }
  // The fight's numbers: Klaus's Cut Ground stuns for 5 seconds; Gremory's skills say they're sealed, not a cooldown.
  const klaus = HEROES_BY_ID.get('klaus');
  assert.equal(klaus?.abilities[0]?.text, 'Leaps into the air and deals P.DMG to enemies in range, stunning them for 5 sec.');
  assert.deepEqual(
    HEROES_BY_ID.get('gremory')?.abilities.map(({ cost, tag }) => [cost, tag]),
    [[3, 'Sealed after use'], [3, 'Sealed after use'], [4, 'Sealed after use'], [null, 'Once all are sealed']],
  );
  // The heroes page has them from the heroes view, the databank from its own.
  assert.deepEqual(heroesView([], null).heroes.map(({ id, abilities }) => ({ id, abilities })), databankView().heroes);
  assert.deepEqual(databankView().heroes.map(({ id }) => id), ALL);
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
  // (No fighter past the last hero.)
  assert.equal(live.input({ kind: 'skill', fighter: LINEUP.length, skill: 0 }), false);
  while (!live.result) live.step();
  assert.equal(live.tick, once.ticks);
  assert.deepEqual([...live.sums], once.sums);
});

test('technomagic: alone the boss is easier; heroes that fall stay down; giving up is losing', () => {
  const alone = replay(run(6, STRONG, 1, true), [0, 1, 2].map((fighter) => ({ tick: 0, kind: 'auto', fighter })));
  const together = replay(run(6, STRONG), [0, 1, 2].map((fighter) => ({ tick: 0, kind: 'auto', fighter })));
  assert.ok(alone.ticks < together.ticks, `${alone.ticks} < ${together.ticks}`);
  // With no gear and nothing pressed, every hero falls and none gets up: lost before the boss's rage.
  const weak = replay(run(9, { hp: -0.9 }), []);
  assert.equal(weak.result, 'lost');
  assert.equal(replay(run(1, STRONG), [{ tick: 30, kind: 'leave' }]).result, 'lost');
  assert.equal(replay(run(1, STRONG), [{ tick: 5, kind: 'toggle', fighter: 0 }]).result, 'invalid');
});

test('technomagic: a win gives one piece of the boss own set, each as likely; no daily limit', () => {
  const cfg = DEFAULTS.hero;
  assert.ok(!('rewardsPerDay' in cfg));
  assert.equal(cfg.winPoints, 100);
  assert.equal(findSpec('hero.winPoints')?.group, 'Hero');
  const pool = tmDropsOf('perseverance');
  assert.deepEqual(pool.map((_, i) => rollTmDrop('galgoria', { index: () => i })), pool);
  assert.ok(pool.every((item) => item.tmSet === 'perseverance'));
  assert.equal(rollTmDrop('siegfried', { index: () => 0 }), null, 'Hope has no gear yet');
  assert.equal(rollTmDrop('nobody'), null);
  assert.equal(findSpec('hero.rewardsPerDay'), undefined);
  assert.deepEqual(validateSettings(DEFAULTS), []);
});

test('technomagic: a run is fought with the gear the heroes page shows', () => {
  const weapon = ITEMS.find((item) => item.raidDrop && item.slot === 'weapon' && !item.class)!;
  const treasure = TM_DROPS.find((item) => item.slot === 'treasure')!;
  const copies: ItemCopyDoc[] = [
    { _id: 'c1', guildId: 'g', userId: 'u', itemId: weapon.id, level: 3, obtainedAt: new Date() },
    { _id: 'c2', guildId: 'g', userId: 'u', itemId: treasure.id, level: 1, obtainedAt: new Date() },
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
  assert.deepEqual(parseClientMessage('{"t":"parted","no":3,"second":41}'), { t: 'parted', no: 3, second: 41 });
  assert.equal(parseClientMessage('{"t":"parted","no":3,"second":-1}'), null);
  assert.equal(parseClientMessage('nope'), null);
  assert.deepEqual(parseClientMessage('{"t":"hello","token":"x","single":true}'), { t: 'hello', token: 'x', single: true });
  assert.deepEqual(parseClientMessage('{"t":"hello","token":"x","single":false}'), { t: 'hello', token: 'x' });
  assert.equal(parseClientMessage('{"t":"hello","token":"x","single":1}'), null);
});

/** A room with a hand-turned clock and a pretend database. */
function harness(owned: Record<string, string[]> = {}) {
  let clock = 0;
  const ticks: (() => void)[] = [];
  const timers: { at: number; fn: () => void; off: boolean }[] = [];
  const announced: string[] = [];
  const finished: { result: string; ticks: number }[] = [];
  const deps: RoomDeps = {
    now: () => clock,
    avatar: () => null,
    owned: async (_g, userId) => owned[userId] ?? ALL,
    cleared: async () => 0,
    begin: async (_g, _stage, players) =>
      ({
        id: 'run',
        seed: 77,
        players: new Map(players.map(({ userId }) => [userId, { owned: new Set(owned[userId] ?? ALL), gear: new Map(ALL.map((id) => [id, STRONG])), sets: new Map(ALL.map((id) => [id, null])), uws: new Map(ALL.map((id) => [id, null])), uts: new Map(ALL.map((id) => [id, null])), skills: new Map(ALL.map((id) => [id, id === 'kirze' ? ['vigor'] : []])), perks: new Map(ALL.map((id) => [id, []])) }])),
      }) as BegunRun,
    finish: async (_g, begun, _stage, result, steps, forfeited) => {
      finished.push({ result, ticks: steps });
      return new Map(
        [...begun.players].map(([userId, player]) => {
          const paid = result === 'won' && !forfeited.has(userId);
          const heart = { itemId: 'galgorias-heart', name: "Galgoria's Heart", stars: 4, skill: tmSkillLine('vigor'), potentials: [], slot: 'treasure' as const, description: '', itemClass: null, setEffect: null };
          return [userId, { drops: paid ? [heart] : [], points: paid ? 100 : 0 }];
        }),
      );
    },
    announce: (_g, host) => announced.push(host),
    link: (guildId) => `https://site/?play=technomagic&guild=${guildId}&mode=multi`,
    every: (_ms, fn) => {
      ticks.push(fn);
      return () => ticks.splice(ticks.indexOf(fn), 1);
    },
    after: (ms, fn) => {
      const timer = { at: clock + ms, fn, off: false };
      timers.push(timer);
      return () => void (timer.off = true);
    },
    fights: localFights,
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
  /** Moves the clock on by `ms`, the fight's turn firing every 100 (and whatever else comes due). */
  const pass = async (ms: number) => {
    for (let at = 0; at < ms; at += 100) {
      clock += 100;
      for (const fn of [...ticks]) fn();
      for (const timer of timers.filter((t) => !t.off && t.at <= clock)) {
        timer.off = true;
        timer.fn();
      }
      await new Promise((resolve) => setImmediate(resolve));
    }
  };
  return { rooms, peer, player, deps, announced, finished, pass };
}

test('technomagic room: single player is a room of their own, not said in Discord, with no link', () => {
  const h = harness();
  const a = h.peer();
  const own = h.rooms.join(h.player('a'), a, ALL, 0, h.deps, true)!;
  assert.deepEqual(h.announced, [], 'a room of their own is not said in the channel');
  assert.equal(a.room().link, null);
  assert.equal(own.room.single, true);

  // Someone else opening the raid with others goes into the server's room, not theirs.
  const b = h.peer();
  const shared = h.rooms.join(h.player('b'), b, ALL)!;
  assert.notEqual(shared.room, own.room);
  assert.deepEqual(h.announced, ['B']);
  assert.equal(b.room().link, 'https://site/?play=technomagic&guild=g1&mode=multi');
  assert.deepEqual(b.room().players.map((p) => p.id), ['b']);

  // One page a player: going in with others takes over the page in their own room.
  const again = h.peer();
  const back = h.rooms.join(h.player('a'), again, ALL)!;
  assert.equal(back.room, shared.room);
  assert.equal(back.replaced, a);
});

test('technomagic room: says how far each player’s heroes are transcended (none for heroes given by id)', () => {
  const h = harness();
  const a = h.peer();
  h.rooms.join(h.player('a'), a, new Map(ALL.map((id, i) => [id, i === 0 ? 3 : 0])));
  const b = h.peer();
  h.rooms.join(h.player('b'), b, ALL);
  const [first, second] = b.room().players;
  assert.deepEqual(first?.owned, ALL);
  assert.deepEqual(first?.transcend, { [ALL[0] as string]: 3 }, 'only the transcended ones');
  assert.deepEqual(second?.transcend, {});
});

test('technomagic room: a player’s heroes read again (Manage closed) are what every page shows', () => {
  const h = harness();
  const a = h.peer();
  h.rooms.join(h.player('a'), a, ALL);
  const b = h.peer();
  const { room } = h.rooms.join(h.player('b'), b, ALL)!;
  assert.equal(room.pick('a', ALL[0] as string, 0), null);
  assert.equal(room.pick('a', ALL[1] as string, 0), null);
  room.reowned('a', new Map(ALL.slice(1).map((id) => [id, id === ALL[1] ? 4 : 0])));
  const [first] = b.room().players;
  assert.deepEqual(first?.transcend, { [ALL[1] as string]: 4 });
  assert.deepEqual(b.room().lineup.map((pick) => pick.hero), [ALL[1]], 'one no longer theirs goes out');
});

test('technomagic room: the host brings up to 4, everyone else 3, 8 in all, even alone in the server’s room', async () => {
  const h = harness();
  const a = h.peer();
  const { room } = h.rooms.join(h.player('a'), a, ALL)!;
  assert.deepEqual(h.announced, ['A']);
  assert.equal(a.room().slots, TM_ROOM.slots);
  assert.equal(a.room().solo, false, 'alone in the server’s room is still multiplayer');
  assert.equal(a.room().players[0]?.limit, TM_ROOM.hostHeroes);
  for (const hero of ALL.slice(0, 3)) assert.equal(room.pick('a', hero, 0), null);
  assert.equal(room.pick('a', 'kirze', 0), 'picked');
  assert.equal(room.pick('a', 'nobody', 0), 'not_owned');

  // A second player: the host's limit stays 4, the slots 8.
  const b = h.peer();
  h.rooms.join(h.player('b'), b, ALL.slice(0, 7));
  assert.deepEqual(h.announced, ['A'], 'the room was opened once');
  const state = b.room();
  assert.equal(state.slots, TM_ROOM.slots);
  assert.equal(state.solo, false);
  assert.deepEqual(state.players.map((p) => [p.number, p.host, p.limit]), [[1, true, 4], [2, false, 3]]);
  assert.equal(room.pick('b', 'kirze', 0), 'picked', 'no hero is brought twice, not even by two players');
  for (const hero of ALL.slice(3, 6)) assert.equal(room.pick('b', hero, 0), null);
  assert.equal(room.pick('b', ALL[6] as string, 0), 'limit');
  assert.equal(b.room().lineup.length, 6);

  // Only the host starts, and only with everyone ready.
  assert.equal(await room.begin('b'), 'only_host');
  assert.equal(await room.begin('a'), 'not_ready');
  assert.equal(room.ready('b', true), null);
  assert.equal(room.ready('a', true), 'only_host');
  assert.equal(room.setStage('b', 3), 'only_host');
  assert.equal(room.setStage('a', 3), 'locked', 'the host has won no stage yet');
  assert.equal(room.setStage('a', 1), null);

  // The host's page goes: their place is kept a while, still host; not back by then, b is host, alone, and keeps all three of theirs.
  room.leave('a', a);
  assert.deepEqual(b.room().players.map((p) => [p.id, p.host, p.away]), [['a', true, true], ['b', false, false]]);
  await h.pass(TM_ROOM.awayMs);
  assert.deepEqual(b.room().players.map((p) => [p.id, p.host, p.limit]), [['b', true, 4]]);
  assert.deepEqual(b.room().lineup.map((p) => p.owner), ['b', 'b', 'b']);
});

test('technomagic room: a page gone getting ready keeps its place and picks for a while, and the room stays open for it', async () => {
  const h = harness();
  const a = h.peer();
  const b = h.peer();
  const { room } = h.rooms.join(h.player('a'), a, ALL)!;
  h.rooms.join(h.player('b'), b, ALL);
  room.pick('b', 'klaus', 0);
  room.ready('b', true);

  // b reloads: back within the time, the same place, picks and ready.
  room.leave('b', b);
  assert.equal(a.room().players.find((p) => p.id === 'b')?.away, true);
  await h.pass(TM_ROOM.awayMs - 1000);
  const again = h.peer();
  assert.equal(h.rooms.join(h.player('b'), again, ALL)?.room, room);
  assert.deepEqual(again.room().players.map((p) => [p.id, p.away, p.ready]), [['a', false, true], ['b', false, true]]);
  assert.deepEqual(again.room().lineup.map((p) => [p.owner, p.hero]), [['b', 'klaus']]);
  // (Its wait was over once they were back: the time running out later changes nothing.)
  await h.pass(2000);
  assert.equal(a.room().players.length, 2);

  // Everyone gone: the room is still there for them for a while, then it is gone.
  room.leave('a', a);
  room.leave('b', again);
  await h.pass(1000);
  const c = h.peer();
  assert.equal(h.rooms.join(h.player('a'), c, ALL)?.room, room, 'back to the same room');
  room.leave('a', c);
  await h.pass(TM_ROOM.awayMs);
  const d = h.peer();
  h.rooms.join(h.player('d'), d, ALL);
  assert.deepEqual(d.room().players.map((p) => p.id), ['d'], 'a new room');
});

test('technomagic room: the host picks only a stage they have opened, by winning the one before it', async () => {
  const h = harness();
  const a = h.peer();
  const { room } = h.rooms.join(h.player('a'), a, ALL, 2)!;
  assert.deepEqual([a.room().stage, a.room().unlocked], [3, 3], 'the room starts at the highest stage the host has opened');
  assert.equal(room.setStage('a', 4), 'locked');
  assert.equal(room.setStage('a', 1), null);
  assert.equal(a.room().stage, 1);

  // Someone who has won more joins: the stage stays the host's pick.
  const c = h.peer();
  h.rooms.join(h.player('c'), c, ALL, 5);
  assert.equal(c.room().stage, 1);

  // The host goes, and c takes over: the highest stage they have opened.
  room.leave('a', a);
  await h.pass(TM_ROOM.awayMs);
  assert.deepEqual([c.room().stage, c.room().unlocked], [6, 6]);

  // A host who has won less takes over: the stage comes down to what they have opened.
  const b = h.peer();
  h.rooms.join(h.player('b'), b, ALL, 0);
  room.leave('c', c);
  await h.pass(TM_ROOM.awayMs);
  assert.deepEqual([b.room().stage, b.room().unlocked], [1, 1]);
});

test('technomagic room: single player, a Main Team of 4 and a Sub Team of 3 on Auto; in the server’s room, no teams', async () => {
  const h = harness();
  const a = h.peer();
  const { room } = h.rooms.join(h.player('a'), a, ALL, 0, h.deps, true)!;
  assert.equal(a.room().solo, true);
  assert.equal(a.room().slots, TM_ROOM.soloSlots);
  const [main, sub] = [ALL.slice(0, TM_ROOM.mainTeam), ALL.slice(TM_ROOM.mainTeam, TM_ROOM.soloSlots)];
  for (const hero of main) assert.equal(room.pick('a', hero, 0), null);
  assert.equal(room.pick('a', ALL[TM_ROOM.soloSlots] as string, 0), 'team_full');
  for (const hero of sub) assert.equal(room.pick('a', hero, 0, true), null);
  assert.deepEqual(a.room().lineup.map((pick) => [pick.hero, pick.sub === true]), [...main.map((hero) => [hero, false]), ...sub.map((hero) => [hero, true])]);
  // Moved over: only with room in the other team.
  assert.equal(room.pick('a', main[0] as string, 0, true), 'team_full');
  assert.equal(room.pick('a', main[0] as string, 0), 'picked');
  assert.equal(room.unpick('a', sub[0] as string), null);
  assert.equal(room.pick('a', main[0] as string, 0, true), null);
  assert.equal(a.room().lineup.find((pick) => pick.hero === main[0])?.sub, true);
  assert.equal(room.pick('a', main[0] as string, 0), null, 'and back');

  // The Sub Team fights on Auto: not to be turned off, not even by Auto for all.
  assert.equal(await room.begin('a'), null);
  const fight = a.got.find((m) => m.t === 'fight');
  assert.ok(fight && fight.t === 'fight');
  const subs = fight.fight.heroes.flatMap((hero, i) => (hero.sub ? [i] : []));
  assert.equal(subs.length, TM_ROOM.soloSlots - TM_ROOM.mainTeam - 1);
  room.autoAll('a');
  await h.pass(200);
  const pressed = a.got.flatMap((m) => (m.t === 'turn' ? m.inputs : []));
  assert.deepEqual(pressed.map((input) => input.fighter), fight.fight.heroes.flatMap((hero, i) => (hero.sub ? [] : [i])), 'Auto for all: the Main Team only');
  const raid = startRaid({ boss: TM_BOSS, seed: 1, stage: 1, solo: true, heroes: fight.fight.heroes.map(({ id, skin, gear, sub }) => ({ id, skin, gear, sub })) });
  assert.ok(typeof raid !== 'string');
  assert.deepEqual(raid.autos(), fight.fight.heroes.map((hero) => hero.sub === true));
  raid.input({ kind: 'auto', fighter: subs[0] as number });
  raid.input({ kind: 'all-auto' });
  raid.step();
  assert.deepEqual(raid.autos(), fight.fight.heroes.map(() => true), 'the Main Team on Auto, the Sub Team still on it');
  assert.equal(room.giveUp('a'), null);
  await h.pass(200);
  assert.equal(room.back('a'), null);

  // The server's room, even alone: no teams.
  const b = h.peer();
  const shared = h.rooms.join(h.player('b'), b, ALL)!;
  assert.equal(shared.room.pick('b', ALL[0] as string, 0, true), null, 'asked for the Sub Team in the server’s room: just put in');
  assert.equal(b.room().lineup.at(-1)?.sub, undefined);
});

test('technomagic room: a fight is run by the bot, each pressing only their own heroes, and a win gives each their drop', async () => {
  const h = harness();
  const a = h.peer();
  const b = h.peer();
  const { room } = h.rooms.join(h.player('a'), a, ALL)!;
  h.rooms.join(h.player('guest'), b, ALL);
  room.pick('a', 'kirze', 0);
  room.pick('a', 'fallen-frey', 0);
  room.pick('guest', 'klaus', 0);
  assert.equal(await room.begin('a'), 'not_ready');
  room.ready('guest', true);
  assert.equal(await room.begin('a'), null);
  assert.equal(a.room().phase, 'fight');
  const fight = a.got.find((m) => m.t === 'fight');
  assert.ok(fight && fight.t === 'fight');
  assert.deepEqual(fight.fight.heroes.map((hero) => [hero.owner, hero.id]), [['a', 'kirze'], ['a', 'fallen-frey'], ['guest', 'klaus']]);
  // Each hero's gear's additional skills go into the fight with it.
  assert.deepEqual(fight.fight.heroes.map((hero) => hero.skills), [['vigor'], [], []]);
  assert.equal(room.pick('a', 'klaus', 0), 'closed');

  // Their own heroes only: a's Auto on for both of theirs; guest can't press a's.
  room.autoAll('a');
  room.press('guest', 0, 0);
  room.auto('guest', 2);
  await h.pass(300);
  const turns = a.got.filter((m) => m.t === 'turn');
  const pressed = turns.flatMap((m) => (m.t === 'turn' ? m.inputs : []));
  assert.deepEqual(pressed.map((input) => [input.kind, input.fighter]), [['auto', 0], ['auto', 1], ['auto', 2]]);
  assert.ok(pressed.every((input) => input.tick === pressed[0]?.tick));
  const last = turns.at(-1);
  assert.ok(last && last.t === 'turn' && last.upTo === 9, 'three turns of 100 ms: 9 steps');

  // guest leaves and comes back mid-fight: their hero fights on, and the page is given the fight so far.
  room.leave('guest', b);
  assert.equal(a.room().players.find((p) => p.id === 'guest')?.away, true);
  const back = h.peer();
  h.rooms.join(h.player('guest'), back, ALL);
  assert.equal(back.got.filter((m) => m.t === 'fight').length, 1);
  const sofar = back.got.find((m) => m.t === 'turn');
  assert.ok(sofar && sofar.t === 'turn' && sofar.inputs.length === 3);

  // The fight runs to its end on the bot's clock alone.
  for (let i = 0; i < 300 && a.room().phase === 'fight'; i++) await h.pass(1000);
  const over = a.room();
  assert.equal(over.phase, 'over');
  assert.equal(over.over?.result, 'won');
  assert.equal(over.over?.drops.a?.[0]?.name, "Galgoria's Heart");
  assert.match(over.over?.drops.a?.[0]?.skill ?? '', /^Vigor: /);
  assert.equal(over.over?.drops.guest?.[0]?.name, "Galgoria's Heart", 'every win gives gear: no daily limit');
  assert.deepEqual(over.over?.points, { a: 100, guest: 100 });
  assert.equal(h.finished.length, 1);

  // The fight the pages ran, from what they were told, ends the same.
  const told = a.got.filter((m) => m.t === 'turn').flatMap((m) => (m.t === 'turn' ? m.inputs : []));
  const again = replay({ boss: TM_BOSS, seed: 77, stage: 1, heroes: fight.fight.heroes.map(({ id, skin, gear, skills }) => ({ id, skin, gear, skills })) }, told);
  assert.equal(again.result, 'won');
  assert.equal(again.ticks, h.finished[0]?.ticks);

  // Run again: each says they're in for the next fight, the room staying on the result; once everyone is, it starts by itself.
  assert.equal(await room.again('a'), null);
  assert.equal(a.room().phase, 'over');
  assert.deepEqual(a.room().players.map((p) => p.ready), [true, false], 'the host in, the guest not yet');
  assert.equal(await room.again('guest'), null);
  assert.equal(a.room().phase, 'fight');
  assert.equal(a.room().lineup.length, 3);
  assert.equal(a.got.filter((m) => m.t === 'fight').length, 2);
  assert.ok(!a.got.some((m) => m.t === 'room' && m.state.phase === 'prep'), 'never back to getting ready');
  assert.equal(room.giveUp('a'), null);
  await h.pass(200);
  assert.equal(a.room().phase, 'over');

  // The host can start it without waiting (forcing it): straight from the result.
  assert.equal(await room.again('a'), null);
  assert.equal(await room.begin('a'), 'not_ready');
  assert.equal(await room.begin('guest', true), 'only_host');
  assert.equal(await room.begin('a', true), null);
  assert.equal(a.room().phase, 'fight');
  assert.equal(room.giveUp('a'), null);
  await h.pass(200);
  assert.equal(room.back('a'), null);
  assert.equal(a.room().phase, 'prep');
});

test("technomagic room: a hero's artifact goes into the fight, the bot's and the pages'", async () => {
  const h = harness();
  const begin = h.deps.begin;
  h.deps.begin = async (...args) => {
    const run = await begin(...args);
    for (const player of run.players.values()) player.artifacts = new Map(ALL.map((id) => [id, id === 'kirze' ? { id: 'artifact-1001', tier: 3 } : null]));
    return run;
  };
  const runs: Run[] = [];
  h.deps.fights = { start: (run) => (runs.push(run), localFights.start(run)) };
  const a = h.peer();
  const { room } = h.rooms.join(h.player('a'), a, ALL)!;
  room.pick('a', 'kirze', 0);
  room.pick('a', 'klaus', 0);
  assert.equal(await room.begin('a'), null);
  const fight = a.got.find((m) => m.t === 'fight');
  assert.ok(fight && fight.t === 'fight');
  assert.deepEqual(fight.fight.heroes.map((hero) => hero.artifact), [{ id: 'artifact-1001', tier: 3 }, null]);
  assert.deepEqual(runs[0]?.heroes.map((hero) => hero.artifact), [{ id: 'artifact-1001', tier: 3 }, null]);
});

test('technomagic room: the host can force the start, those not ready fighting all the same and those with no hero in sitting it out', async () => {
  const h = harness();
  const a = h.peer();
  const { room } = h.rooms.join(h.player('a'), a, ALL)!;
  h.rooms.join(h.player('b'), h.peer(), ALL);
  h.rooms.join(h.player('c'), h.peer(), ALL);
  room.pick('a', 'kirze', 0);
  room.pick('b', 'klaus', 0);
  assert.equal(await room.begin('a'), 'not_ready');
  room.ready('b', true);
  room.ready('c', true);
  assert.equal(await room.begin('a'), 'no_heroes');
  room.ready('b', false);
  assert.equal(await room.begin('a', true), null);
  const fight = a.got.find((m) => m.t === 'fight');
  assert.ok(fight && fight.t === 'fight');
  assert.deepEqual(fight.fight.heroes.map((hero) => hero.owner), ['a', 'b']);
  assert.equal(room.giveUp('a'), null);
  await h.pass(200);
  assert.deepEqual(Object.keys(a.room().over?.points ?? {}), ['a', 'b'], 'c, with no hero in, isn’t in the run');

  // Run again: each in for the next fight, on the result still; c, with no hero in, takes the room back to getting ready.
  assert.equal(await room.again('a'), null);
  assert.equal(await room.again('b'), null);
  assert.equal(a.room().phase, 'over');
  assert.deepEqual(a.room().players.map((p) => p.ready), [true, true, false]);
  assert.equal(await room.again('c'), null);
  assert.equal(a.room().phase, 'prep');
  room.pick('c', 'fallen-frey', 0);
  room.ready('b', true);
  room.ready('c', true);
  assert.equal(await room.begin('a'), null);
  assert.equal(room.giveUp('a'), null);
  await h.pass(200);
  assert.equal(a.room().phase, 'over');
  // Everyone in: it starts by itself, never back to getting ready.
  const told = a.got.length;
  for (const id of ['c', 'b']) assert.equal(await room.again(id), null);
  assert.equal(a.room().phase, 'over');
  assert.equal(await room.again('a'), null);
  assert.equal(a.room().phase, 'fight');
  assert.ok(!a.got.slice(told).some((m) => m.t === 'room' && m.state.phase === 'prep'));
});

test('technomagic room: one who leaves the fight (quit) forfeits what it gives them, their heroes fighting on; alone, it is lost', async () => {
  const h = harness();
  const a = h.peer();
  const b = h.peer();
  const { room } = h.rooms.join(h.player('a'), a, ALL)!;
  h.rooms.join(h.player('b'), b, ALL);
  assert.equal(room.quit('b'), 'closed', 'only in a fight');
  room.pick('a', 'kirze', 0);
  room.pick('a', 'fallen-frey', 0);
  room.pick('b', 'klaus', 0);
  room.ready('b', true);
  assert.equal(await room.begin('a'), null);
  room.autoAll('a');
  assert.equal(room.quit('b'), null);
  assert.deepEqual(a.room().players.map((player) => player.id), ['a'], 'out of the room at once');
  room.autoAll('b');
  room.leave('b', b);
  await h.pass(100);
  const pressed = a.got.flatMap((m) => (m.t === 'turn' ? m.inputs : []));
  assert.deepEqual(pressed.map((input) => [input.kind, input.fighter]), [['auto', 0], ['auto', 1], ['auto', 2]], 'their hero on Auto too');
  // Coming back doesn't undo it.
  h.rooms.join(h.player('b'), h.peer(), ALL);
  for (let i = 0; i < 300 && a.room().phase === 'fight'; i++) await h.pass(1000);
  const over = a.room().over;
  assert.equal(over?.result, 'won', 'won with their hero still in it');
  assert.deepEqual(over?.points, { a: 100, b: 0 });
  assert.deepEqual(over?.drops.b, []);

  // Alone, in a room of their own: leaving loses the fight.
  const c = h.peer();
  const own = h.rooms.join(h.player('c'), c, ALL, 0, h.deps, true)!;
  own.room.pick('c', 'kirze', 0);
  assert.equal(await own.room.begin('c'), null);
  assert.equal(own.room.quit('c'), null);
  await h.pass(200);
  assert.equal(c.room().over?.result, 'lost');
  assert.deepEqual(c.room().over?.points, { c: 0 });
});

test('technomagic room: one who presses Auto and leaves in the same turn has their heroes fight on, on Auto', async () => {
  const h = harness();
  const a = h.peer();
  const b = h.peer();
  const { room } = h.rooms.join(h.player('a'), a, ALL)!;
  h.rooms.join(h.player('b'), b, ALL);
  room.pick('a', 'kirze', 0);
  room.pick('b', 'klaus', 0);
  room.ready('b', true);
  assert.equal(await room.begin('a'), null);
  // Auto on, then gone before the next step: the Auto stays on (not turned over twice).
  room.auto('b', 1);
  room.leave('b', b);
  await h.pass(100);
  const pressed = a.got.flatMap((m) => (m.t === 'turn' ? m.inputs : []));
  assert.deepEqual(pressed.map((input) => [input.kind, input.fighter]), [['auto', 1]]);
});

test('technomagic room: a page back after the fight is over, or whose run parted from the bot\'s, is given the whole fight to run to the bot\'s end', async () => {
  const h = harness();
  const a = h.peer();
  const b = h.peer();
  const { room } = h.rooms.join(h.player('a'), a, ALL)!;
  h.rooms.join(h.player('b'), b, ALL);
  room.pick('a', 'kirze', 0);
  room.pick('a', 'fallen-frey', 0);
  room.pick('b', 'klaus', 0);
  room.ready('b', true);
  assert.equal(await room.begin('a'), null);
  const start = a.got.find((m) => m.t === 'fight');
  assert.ok(start && start.t === 'fight');
  room.autoAll('a');
  await h.pass(300);

  // b's page drops mid-fight; the fight runs to its end without it.
  room.leave('b', b);
  for (let i = 0; i < 300 && a.room().phase === 'fight'; i++) await h.pass(1000);
  const over = a.room().over;
  assert.ok(over);
  assert.equal(over.no, start.fight.no);
  assert.equal(over.upTo, h.finished[0]?.ticks, 'the result says the step the fight ended at');

  // Back as the result is up: the whole fight, every press, up to its last step.
  const back = h.peer();
  h.rooms.join(h.player('b'), back, ALL);
  const again = back.got.filter((m) => m.t === 'fight');
  assert.equal(again.length, 1);
  assert.ok(again[0]?.t === 'fight' && again[0].fight.no === start.fight.no);
  const all = back.got.find((m) => m.t === 'turn');
  assert.ok(all && all.t === 'turn');
  assert.equal(all.upTo, over.upTo);
  const told = a.got.flatMap((m) => (m.t === 'turn' ? m.inputs : []));
  assert.deepEqual(all.inputs, told);
  const ran = replay({ boss: TM_BOSS, seed: 77, stage: 1, heroes: start.fight.heroes.map(({ id, skin, gear, skills }) => ({ id, skin, gear, skills })) }, all.inputs);
  assert.equal(ran.result, over.result);
  assert.equal(ran.ticks, over.upTo);

  // Parted: given the fight again each time, but no more than once every TM_FIGHT.resyncMs.
  const warn = console.warn;
  const warned: string[] = [];
  console.warn = (line: string) => void warned.push(line);
  try {
    const given = () => back.got.filter((m) => m.t === 'fight' || m.t === 'turn').map((m) => m.t);
    const before = given().length;
    room.parted('b', start.fight.no, 12);
    assert.deepEqual(given().slice(before), ['fight', 'turn']);
    room.parted('b', start.fight.no, 12);
    assert.equal(given().length, before + 2, 'not again so soon');
    await h.pass(TM_FIGHT.resyncMs);
    room.parted('b', start.fight.no, 12);
    assert.deepEqual(given().slice(before + 2), ['fight', 'turn'], 'given it again once it has been a while');
    room.parted('b', start.fight.no + 1, 3);
    assert.equal(given().length, before + 4, 'not a fight there was');
    assert.equal(warned.length, 2, 'noted the first two times, for a fight there was');
  } finally {
    console.warn = warn;
  }

  // Back to getting ready: the fight is let go, and a page back then isn't given it.
  assert.equal(room.back('a'), null);
  const later = h.peer();
  h.rooms.join(h.player('b'), later, ALL);
  assert.ok(!later.got.some((m) => m.t === 'fight'));
});

test('technomagic room: a player presses no more than a few times a turn (the rest dropped), so the fight\'s presses stay few', async () => {
  const h = harness();
  const a = h.peer();
  const { room } = h.rooms.join(h.player('a'), a, ALL)!;
  room.pick('a', 'kirze', 0);
  room.pick('a', 'fallen-frey', 0);
  assert.equal(await room.begin('a'), null);
  for (let i = 0; i < 20; i++) room.press('a', i % 2, 0);
  await h.pass(100);
  for (let i = 0; i < 3; i++) room.auto('a', 0);
  await h.pass(100);
  const pressed = a.got.flatMap((m) => (m.t === 'turn' ? m.inputs : []));
  assert.deepEqual(pressed.map((input) => input.kind), ['skill', 'skill', 'skill', 'skill', 'auto', 'auto', 'auto']);
});

test('technomagic room: the host can give up, and a room with nobody left is gone', async () => {
  const h = harness();
  const a = h.peer();
  const { room } = h.rooms.join(h.player('a'), a, ALL)!;
  room.pick('a', 'kirze', 0);
  assert.equal(await room.begin('a'), null);
  assert.equal(room.giveUp('a'), null);
  await h.pass(200);
  assert.equal(a.room().over?.result, 'lost');
  room.leave('a', a);
  await h.pass(TM_ROOM.awayMs);
  const again = h.peer();
  h.rooms.join(h.player('c'), again, ALL);
  assert.equal(again.room().players.length, 1, 'a new room');
  assert.equal(again.room().phase, 'prep');
});

test('technomagic: a hero in a set’s pieces has its effect, the same every time the fight is run', () => {
  const autos = [0, 1, 2].map((fighter) => ({ tick: 0, kind: 'auto', fighter }));
  const GEARED = { atk: 1.2, hp: 0.8, crit: 250, pen: 250, critDamage: 0.4, speed: 150 };
  const withSet = (set: string | null): Run => ({ ...run(11, GEARED), heroes: LINEUP.map((hero) => ({ id: hero.id, skin: 0, gear: GEARED, set })) });
  const plain = replay(withSet(null), autos);
  for (const set of ['perseverance', 'hope', 'authority']) {
    const once = replay(withSet(set), autos);
    assert.deepEqual(replay(withSet(set), autos, once.sums), once, set);
    assert.notDeepEqual(once.sums, plain.sums, `${set} changes the fight`);
  }
  // Perseverance on everyone: each one's own (King's Raid's 4-piece skill for its class): the boss falls sooner.
  assert.ok(replay(withSet('perseverance'), autos).ticks < plain.ticks);
  // A set the bot doesn't know of is none.
  assert.deepEqual(replay(withSet('nonsense'), autos).sums, plain.sums);
});

test("technomagic: Perseverance on a damage dealer (Kirze) makes the boss fall sooner (King's Raid's: its DMG and ATK, growing)", () => {
  const autos = [0, 1, 2].map((fighter) => ({ tick: 0, kind: 'auto', fighter }));
  const GEARED = { atk: 3, hp: 2, crit: 400, pen: 500, critDamage: 1, speed: 300 };
  const wearing = (who: string[]): Run => ({ ...run(11, GEARED), heroes: LINEUP.map((hero) => ({ id: hero.id, skin: 0, gear: GEARED, set: who.includes(hero.id) ? 'perseverance' : null })) });
  const plain = replay(wearing([]), autos);
  assert.ok(replay(wearing(['kirze']), autos).ticks < plain.ticks, '+10% DMG and ATK, growing to +25%');
});

test("technomagic perks: a hero's transcendence perks change its fight, the same every time; one the fight doesn't know is none", () => {
  const autos = [0, 1, 2].map((fighter) => ({ tick: 0, kind: 'auto', fighter }));
  const GEARED = { atk: 1.2, hp: 0.8, crit: 250, pen: 250, critDamage: 0.4, speed: 150 };
  const perked = (perks: string[]): Run => ({ ...run(11, GEARED), heroes: LINEUP.map((hero) => ({ id: hero.id, skin: 0, gear: GEARED, perks })) });
  const plain = replay(perked([]), autos);
  // Transcend 1's on everyone (ATK Up, and Monster Hunting's DMG on the boss): it falls sooner, the same every time.
  const common = replay(perked(['atk-up', 'monster-hunting']), autos);
  assert.ok(common.ticks < plain.ticks, 'sooner');
  assert.deepEqual(replay(perked(['atk-up', 'monster-hunting']), autos, common.sums), common);
  // Every hero its class's five (Transcend 2): not as without them, and the same every time.
  const classes = replay(perked(['class-1', 'class-2', 'class-3', 'class-4', 'class-5']), autos);
  assert.notDeepEqual(classes.sums, plain.sums);
  assert.deepEqual(replay(perked(['class-1', 'class-2', 'class-3', 'class-4', 'class-5']), autos, classes.sums), classes);
  assert.deepEqual(replay(perked(['nonsense']), autos).sums, plain.sums);
});

test("technomagic perks: each of a hero's own perks changes its fight, but for those with nothing to work on here", () => {
  // What this raid hasn't: Arcane Crystal Energy (Kirze), a boss to draw in or casting time to cut (Klaus), a boss's mana
  // to take (Fallen Frey, Lucikiel's Doomsday), a boss's M.Block or knocking it away (Gremory's Puchi), anything on the
  // boss to dispel (Seria, Lorraine, Valance) or that dispels what is on it (Lucikiel's Death Storm), a boss's block
  // (Selene's Moonlight Flash, Dark Lord Kasel's Judgment Blade's mana kept from it), further to reach (Selene's Moonlight Arrow), more enemies than one (Oddy's Time
  // Fragments and Time Distortion) or another with a higher ATK (Naila's Fierce Winds), a Dragon (Yanne's Dragon
  // Slayer), a boss's block (Yanne's Transcend 5 Dark), its crit resistance to lower (Tanya's Target Sighted) or anything
  // of its to silence (Tanya's Silent Ambush), an enemy killed (Erze's Life Drinker). What Galgoria shrugs off: a slow
  // (it is steady: Neraxis's Obsidian Roar, Loman's The Last Gatekeeper), and less P.DMG or more P.DEF or P.Block (it
  // deals only magic: Dark Lord Kasel's Advent of the Dark Lord); and a stun rather than a knock down lasts as long (his Doom). What these fights don't come to: a shield on every ally with only 4 (Blessing of Doom shields 4), 100 Flame
  // on the boss (Morrah's Auto goes round her skills), Ezekiel's Dawning Despair in his Fury, the boss knocking him,
  // Crow, Loman or Rebel Klaus down while he strikes (Strike of Doom, Target will be Eliminated., Knight's Creed, Perish.),
  // anything harmful on Rebel Klaus as he uses Indomitable Will, and a blow that would bring Erze down with her Soaking
  // Blood ready (Life Drinker's Light: its smaller cut to her max HP after).
  // Galgoria seldom lands a critical blow (10%), so the M.Crit Resistance Laias's Healing Droplets' Dark gives for a
  // while seldom comes to anything.
  const NOTHING = ['kirze s3-light', 'kirze s3-dark', 'klaus s1-dark', 'klaus s3-dark', 'klaus s4-light', 'klaus t5-dark', 'fallen-frey s2-light', 'fallen-frey s3-dark', 'gremory s2-light', 'gremory s2-dark', 'morrah s4-dark', 'laias s1-dark', 'seria s3-light', 'ezekiel s2-dark', 'ezekiel s3-light', 'lorraine s3-dark', 'valance s3-light', 'lucikiel s1-light', 'lucikiel s3-dark', 'selene s3-dark', 'selene s4-dark', 'crow s1-dark', 'oddy s2-light', 'oddy s3-dark', 'naila s1-dark', 'yanne s4-light', 'yanne s4-dark', 'yanne t5-dark', 'neraxis s2-dark', 'erze s4-light', 'erze s4-dark', 'loman s3-dark', 'loman s4-dark', 'tanya s1-dark', 'tanya s4-dark', 'rebel-klaus s2-dark', 'rebel-klaus s3-dark', 'dark-lord-kasel s1-dark', 'dark-lord-kasel s2-dark', 'dark-lord-kasel s3-light'];
  const own = TRANSCEND_PERKS.filter((perk) => perk.tier >= 3).map((perk) => perk.id);
  // (Health enough to last long enough for every perk to come round: Galgoria hits as hard as at stage 3.)
  const SURVIVES = { hp: 2 };
  const fight = (id: string, perks: string[], seed: number, others: number): Run => ({
    boss: TM_BOSS,
    seed,
    stage: 3,
    // (The hero in two pieces of TechnoMagic gear: Valance's Transcend 5 Dark stacks once for each.)
    heroes: [id, ...ALL.filter((other) => other !== id).slice(others, others + 3)].map((hero, i) => ({ id: hero, skin: 0, gear: SURVIVES, ...(i === 0 && { skills: ['vigor', 'war-cry'], perks }) })),
  });
  // Everyone on Auto; for a skill's perk, its hero off it and that skill pressed every 20 seconds (Auto spends mana on the
  // dearest skill it can afford at once).
  const inputs = (perk: string) => {
    const skill = /^s([123])-/.exec(perk);
    const presses = skill ? [{ tick: 0, kind: 'auto', fighter: 0 }, ...Array.from({ length: 11 }, (_, i) => ({ tick: 150 + i * 600, kind: 'skill', fighter: 0, skill: Number(skill[1]) - 1 }))] : [];
    return [{ tick: 0, kind: 'all-auto' }, ...presses];
  };
  const key = (played: ReturnType<typeof replay>): string => JSON.stringify([played.ticks, played.dealt, played.sums]);
  const still: string[] = [];
  // (Three fights: some perks come to something only now and then, as the Light of Gremory's passive, once the boss
  // hits her while she sleeps.)
  for (const id of ALL) {
    for (const perk of own) {
      const changed = [11, 222, 5].some((seed, k) => key(replay(fight(id, [], seed, k * 2), inputs(perk))) !== key(replay(fight(id, [perk], seed, k * 2), inputs(perk))));
      if (!changed) still.push(`${id} ${perk}`);
    }
  }
  assert.deepEqual(still, NOTHING);
});

test('technomagic: a win gives 3 items at stages 1 to 3, 4 at 4 to 6, and 5 at 7 and 8', () => {
  assert.deepEqual([1, 2, 3, 4, 5, 6, 7, 8].map(tmDropCount), [3, 3, 3, 4, 4, 4, 5, 5]);
  assert.equal(tmDropCount(MOST_STAGE), 5, 'past its last stage, as much as the last');
});

test("technomagic: each piece rolls King's Raid's options (any stat of its pool, two the same or not, at a step), rerolled and upgraded as King's Raid's; a unique treasure rolls its 2 options", () => {
  // A unique treasure's options: still 2 of the potentials, each within its range.
  assert.equal(UT_OPTION_LINES, 2);
  for (let i = 0; i < 100; i++) {
    const rolled = rollTmPotentials(undefined, UT_OPTION_LINES);
    assert.equal(new Set(rolled.map(({ stat }) => stat)).size, 2);
    for (const { stat, value } of rolled) assert.ok(value >= TM_POTENTIAL_RANGES[stat].min - 1e-9 && value <= TM_POTENTIAL_RANGES[stat].max + 1e-9, `${stat} ${value}`);
  }
  // A Perseverance piece: 2 options from its pool; a dragon piece, 4. Any may be the same stat as another, as King's Raid's.
  const tm = ITEMS_BY_ID.get('perseverance-warrior-armor')!.kr!;
  const dragon = ITEMS_BY_ID.get('opportune-fire-t8-heavy-armor')!.kr!;
  for (let i = 0; i < 100; i++) {
    const options = rollKrOptions(tm);
    assert.equal(options.length, 2);
    for (const option of options) assert.ok(option.step >= 0 && option.step <= 2, option.stat);
    assert.equal(rollKrOptions(dragon).length, 4);
  }
  const first = rollKrOptions(dragon, { index: () => 0 });
  assert.equal(new Set(first.map((option) => option.stat)).size, 1);
  assert.equal(first.length, 4);
  // Its value: so far between its least and most (Perseverance's ATK: 12%, 14%, 16%).
  assert.deepEqual([0, 1, 2].map((step) => krOptionValue(tm, { stat: 'atk', step })), [0.12, 0.14, 0.16]);
  // A reroll rolls one again, counted; an upgrade raises one not at its top a step (TechnoMagic gear's too, for 1,000 zeiucoins).
  const rerolled = rerollKrOption(tm, [{ stat: 'atk', step: 0 }, { stat: 'hp', step: 0 }], 0, { index: () => 0 });
  assert.equal(rerolled?.[0]?.rerolls, 1);
  assert.equal(rerolled?.[1]?.stat, 'hp');
  // It may land on another option's stat; a dragon piece's never on the one it was (a TechnoMagic piece's may).
  const pool = (kr: typeof tm) => KR_POOLS[kr.pool!]!.map((option) => option.stat);
  const [tmFirst, dragonFirst, dragonSecond] = [pool(tm)[0]!, pool(dragon)[0]!, pool(dragon)[1]!];
  assert.equal(rerollKrOption(tm, [{ stat: tmFirst, step: 0 }, { stat: tmFirst, step: 0 }], 0, { index: () => 0 })?.[0]?.stat, tmFirst);
  assert.equal(rerollKrOption(dragon, [{ stat: dragonFirst, step: 0 }, { stat: dragonSecond, step: 0 }], 0, { index: () => 0 })?.[0]?.stat, dragonSecond);
  assert.equal(rerollKrOption(dragon, [{ stat: dragonSecond, step: 0 }, { stat: dragonFirst, step: 0 }], 0, { index: () => 0 })?.[0]?.stat, dragonFirst);
  // Enhancing rolls the picked option's amount again, its stat kept: down as well as up, at its top or not; no such option, null.
  const top = (kr: typeof tm, stat: string) => KR_POOLS[kr.pool!]!.find((option) => option.stat === stat)!.steps;
  assert.deepEqual(upgradeKrOption(dragon, [{ stat: 'atk', step: 10 }, { stat: 'crit', step: 3 }], 0, { index: () => 2 }), [{ stat: 'atk', step: 2 }, { stat: 'crit', step: 3 }]);
  assert.deepEqual(upgradeKrOption(dragon, [{ stat: 'atk', step: 10 }, { stat: 'crit', step: 3 }], 1, { index: (n) => n - 1 }), [{ stat: 'atk', step: 10 }, { stat: 'crit', step: top(dragon, 'crit') }]);
  assert.equal(upgradeKrOption(dragon, [{ stat: 'atk', step: 10 }], 1), null);
  assert.ok(upgradable(tm) && upgradable(dragon));
  assert.deepEqual(upgradeKrOption(tm, [{ stat: 'atk', step: 0, rerolls: 2 }, { stat: 'hp', step: 2 }], 0, { index: () => 1 }), [{ stat: 'atk', step: 1, rerolls: 2 }, { stat: 'hp', step: 2 }]);
  assert.equal(upgradePrice(tm), 1_000);
  assert.deepEqual([0, 1, 5, 9].map(rerollPrice), [500, 1_000, 8_000, 8_000]);
});

test('technomagic: TechnoMagic gear’s additional skills, one rolled for each copy as it drops, from one list whatever the set', () => {
  const ids = TM_SKILLS.map((skill) => skill.id);
  assert.equal(new Set(ids).size, ids.length, 'no skill twice');
  assert.ok(ids.length >= 30);
  for (const skill of TM_SKILLS) assert.ok(skill.name && skill.about && ['S', 'A', 'B', 'C', 'F'].includes(skill.tier), skill.id);
  // Each as likely: the roll picks by index.
  assert.deepEqual(ids.map((_, i) => rollTmSkill({ index: () => i })), ids);
  assert.ok(ids.includes(rollTmSkill()));
  assert.equal(tmSkillLine('vigor'), `Vigor: ${TM_SKILLS.find((skill) => skill.id === 'vigor')?.about}`);
  assert.equal(tmSkillLine('nonsense'), null);
  assert.equal(tmSkillLine(undefined), null);
  assert.equal(MOST_TM_SKILLS, 5);
});

test('technomagic: a hero has its gear’s additional skills in the fight, the same every time it is run', () => {
  // (Geared to win with every skill, Galgoria's crits and all.)
  const autos = [0, 1, 2].map((fighter) => ({ tick: 0, kind: 'auto', fighter }));
  const GEARED = { atk: 3, hp: 2, crit: 400, pen: 500, critDamage: 1, speed: 300 };
  const skilled = (skills: string[]): Run => ({ ...run(11, GEARED), heroes: LINEUP.map((hero) => ({ id: hero.id, skin: 0, gear: GEARED, skills })) });
  const plain = replay(skilled([]), autos);
  let changed = 0;
  for (const { id } of TM_SKILLS) {
    const once = replay(skilled([id]), autos);
    assert.equal(once.result, 'won', id);
    assert.deepEqual(replay(skilled([id]), autos, once.sums), once, id);
    if (JSON.stringify(once.sums) !== JSON.stringify(plain.sums)) changed++;
  }
  // (Some need what this fight on Auto never has: a full mana bar, the other kind of damage, a hero near falling.)
  assert.ok(changed >= TM_SKILLS.length - 6, `${changed} of ${TM_SKILLS.length} change the fight`);
  // ATK up, DEF down: the boss falls sooner. Twice over: sooner again.
  const berserk = replay(skilled(['berserk']), autos);
  assert.ok(berserk.ticks < plain.ticks);
  assert.ok(replay(skilled(['berserk', 'berserk']), autos).ticks < berserk.ticks);
  // ATK down for DEF: later.
  assert.ok(replay(skilled(['fortress']), autos).ticks > plain.ticks);
  // A skill the bot doesn't know of is none; past the most a hero can wear, the rest are none.
  assert.deepEqual(replay(skilled(['nonsense']), autos).sums, plain.sums);
  assert.deepEqual(replay(skilled(['vigor', 'vigor', 'vigor', 'vigor', 'vigor', 'berserk']), autos).sums, replay(skilled(['vigor', 'vigor', 'vigor', 'vigor', 'vigor']), autos).sums);
});

test('technomagic: a run takes the additional skills of the TechnoMagic copies a hero wears that work on its class', () => {
  const copy = (id: string, itemId: string, tmSkill?: string): ItemCopyDoc => ({ _id: id, guildId: 'g', userId: 'u', itemId, level: 1, obtainedAt: new Date(), ...(tmSkill && { tmSkill }) });
  // Kirze (a warrior): two warrior pieces with Vigor, the priest's Mantle, and a dragon set's Orb (no unique option).
  const copies = [copy('a', 'perseverance-warrior-armor', 'vigor'), copy('b', 'perseverance-priest-secondary', 'berserk'), copy('c', 'perseverance-warrior-ring', 'vigor'), copy('d', 'opportune-fire-t8-orb')];
  const member = { heroes: { kirze: { boughtAt: new Date(), equipment: { armor: 'a', secondary: 'b', accessory: 'c', orb: 'd' } } }, points: 0 } as unknown as MemberDoc;
  // The priest's piece does nothing on Kirze, and the dragon set's has no skill.
  assert.deepEqual(raidGear(copies, member).get('kirze')?.skills, ['vigor', 'vigor']);
  const view = heroesView(copies, member);
  const kirze = view.heroes.find((hero) => hero.id === 'kirze');
  assert.deepEqual(kirze?.skills, ['vigor', 'vigor']);
  assert.ok(kirze?.totals.some((line) => line.startsWith('✴️ Vigor ×2: ')));
  assert.equal(view.copies.find((one) => one.id === 'a')?.skill, 'vigor');
  // Its additional effect apart from its effects, like "Vigor: Increases DMG…".
  assert.match(view.copies.find((one) => one.id === 'a')?.additional ?? '', /^Vigor: /);
  assert.ok(!view.copies.find((one) => one.id === 'a')?.effects.some((line) => line.includes('Vigor')));
  assert.equal(view.copies.find((one) => one.id === 'd')?.skill, null);
  assert.equal(view.copies.find((one) => one.id === 'd')?.additional, null);
});

test('technomagic: a fight in the worker thread goes as one run right here, step for step', async () => {
  const fight = run(5, STRONG, 2);
  const turns: { due: number; intents: Intent[] }[] = [
    { due: 30, intents: [{ kind: 'autos', fighters: [0, 1, 2] }] },
    { due: 300, intents: [{ kind: 'skill', fighter: 3, skill: 0 }, { kind: 'auto', fighter: 4 }] },
    { due: 3000, intents: [{ kind: 'autos', fighters: [0, 1, 2, 3, 4, 5, 6, 7, 8], on: true }] },
    { due: MOST_TICKS, intents: [] },
  ];
  const play = async (where: typeof localFights): Promise<Progress[]> => {
    const engine = await where.start(fight);
    assert.ok(typeof engine !== 'string', String(engine));
    const out: Progress[] = [];
    for (const { due, intents } of turns) out.push(await engine.advance(due, intents));
    engine.close();
    return out;
  };
  const here = await play(localFights);
  assert.ok(here.at(-1)?.result, 'it ends');
  assert.deepEqual(await play(workerFights), here);
  // A run that makes no sense: why, from either.
  assert.equal(await workerFights.start({ ...fight, boss: 'nobody' }), 'boss');
});

test('dragon room: 9 heroes with others (the host 4, everyone else 3), 8 alone (a Main Team of 4 and a Sub Team of 4)', () => {
  const h = harness();
  const dragons = new TechnoMagicRooms(h.deps, DRAGON_RAID);
  const a = h.peer();
  dragons.join(h.player('a'), a, ALL, 0, h.deps, false, 'temeraire');
  const b = h.peer();
  dragons.join(h.player('b'), b, ALL, 0, h.deps, false, 'temeraire');
  assert.equal(b.room().slots, DRAGON_ROOM.slots);
  assert.equal(DRAGON_ROOM.slots, 9);
  assert.deepEqual(b.room().players.map((p) => [p.host, p.limit]), [[true, 4], [false, 3]]);

  const c = h.peer();
  const { room } = dragons.join(h.player('c'), c, ALL, 0, h.deps, true, 'temeraire')!;
  assert.equal(c.room().slots, 8);
  for (const hero of ALL.slice(0, 4)) assert.equal(room.pick('c', hero, 0), null);
  for (const hero of ALL.slice(4, 8)) assert.equal(room.pick('c', hero, 0, true), null);
  assert.equal(room.pick('c', ALL[8] as string, 0, true), 'limit');

  // The TechnoMagic Raid's stay as they are.
  const d = h.peer();
  h.rooms.join(h.player('d'), d, ALL, 0, h.deps, true);
  assert.equal(d.room().slots, TM_ROOM.soloSlots);
});
