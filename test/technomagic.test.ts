import assert from 'node:assert/strict';
import { test } from 'node:test';
import { GAMES } from '../src/web/config.js';
import { DEFAULTS } from '../src/config.js';
import { TM_ROOM } from '../src/constants/index.js';
import { ITEMS, TM_DROPS, tmDropsOf } from '../src/data/items.js';
import { HEROES } from '../src/data/heroes.js';
import { TRANSCEND_PERKS } from '../src/data/transcend.js';
import { raidBonuses, raidGear } from '../src/lib/game/heroes.js';
import { MOST_STAGE, MOST_TICKS, MOST_TM_SKILLS, replay, rollTmDrop, rollTmPotentials, rollTmSkill, SIM_VERSION, startRaid, STEP_SECONDS, TM_BOSS, TM_SKILLS, tmSkillLine, type Run } from '../src/lib/game/technomagic.js';
import { tmDropCount } from '../src/constants/technomagic.js';
import { TM_POTENTIAL_IDS, TM_POTENTIAL_LINES, TM_POTENTIAL_RANGES } from '../src/data/tm-potentials.js';
import { pieceBonus, potentialLines } from '../src/lib/game/heroes.js';
import { findSpec, validateSettings } from '../src/lib/settings-spec.js';
import type { Player } from '../src/web/auth/token.js';
import { heroesView } from '../src/web/models/heroes.js';
import { parseClientMessage, type RoomState, type ServerMessage } from '../src/web/games/technomagic/protocol.js';
import { localFights, workerFights, type Intent, type Progress } from '../src/web/games/technomagic/fight.js';
import { TechnoMagicRooms, type Peer, type RoomDeps } from '../src/web/games/technomagic/room.js';
import { RUN_LASTS_MS, rewardsUsedFilter, type BegunRun } from '../src/services/technomagic.js';
import type { ItemCopyDoc, MemberDoc } from '../src/types.js';

/** Every hero, in its first skin, with `gear`. */
/** The heroes a raid's run fields: as many as a room's lineup holds (the first of them). */
const LINEUP = HEROES.slice(0, TM_ROOM.slots);
const run = (seed: number, gear: Record<string, number>, stage = 1, solo = false): Run => ({ boss: TM_BOSS, seed, stage, solo, heroes: LINEUP.map((hero) => ({ id: hero.id, skin: 0, gear })) });
const STRONG = { atk: 3, hp: 2, crit: 400, pen: 500, critDamage: 1, speed: 300 };
const ALL = HEROES.map((hero) => hero.id);

test("technomagic: the bot's heroes are the sim's, each with a skin, and the boss", () => {
  assert.ok(HEROES.length > 0);
  for (const hero of HEROES) assert.ok(hero.skins >= 1, hero.id);
  assert.match(SIM_VERSION, /^[0-9a-f]{12}$/);
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
  // (No fighter past the last hero.)
  assert.equal(live.input({ kind: 'skill', fighter: LINEUP.length, skill: 0 }), false);
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

test('technomagic: a win gives one piece of the boss own set, each as likely; 10 runs a day give it', () => {
  const cfg = DEFAULTS.hero;
  assert.equal(cfg.rewardsPerDay, 10);
  const pool = tmDropsOf('perseverance');
  assert.deepEqual(pool.map((_, i) => rollTmDrop('galgoria', { index: () => i })), pool);
  assert.ok(pool.every((item) => item.tmSet === 'perseverance'));
  assert.equal(rollTmDrop('siegfried', { index: () => 0 }), null, 'Hope has no gear yet');
  assert.equal(rollTmDrop('nobody'), null);
  assert.equal(findSpec('hero.rewardsPerDay')?.group, 'Hero');
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
  assert.deepEqual(parseClientMessage('{"t":"parted","no":3,"second":41}'), { t: 'parted', no: 3, second: 41 });
  assert.equal(parseClientMessage('{"t":"parted","no":3,"second":-1}'), null);
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
        players: new Map(players.map(({ userId }) => [userId, { owned: new Set(owned[userId] ?? ALL), gear: new Map(ALL.map((id) => [id, STRONG])), sets: new Map(ALL.map((id) => [id, null])), uws: new Map(ALL.map((id) => [id, null])), skills: new Map(ALL.map((id) => [id, id === 'kirze' ? ['vigor'] : []])), perks: new Map(ALL.map((id) => [id, []])), rewardable: userId !== 'broke' }])),
      }) as BegunRun,
    finish: async (_g, begun, _stage, result, steps) => {
      finished.push({ result, ticks: steps });
      return new Map([...begun.players].map(([userId, player]) => [userId, result === 'won' && player.rewardable ? [{ itemId: 'galgorias-heart', name: "Galgoria's Heart", stars: 4, skill: tmSkillLine('vigor') }] : []]));
    },
    announce: (_g, host) => announced.push(host),
    every: (_ms, fn) => {
      ticks.push(fn);
      return () => ticks.splice(ticks.indexOf(fn), 1);
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
  for (const hero of ALL.slice(0, 3)) assert.equal(room.pick('a', hero, 0), null);
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

test('technomagic room: alone, a Main Team of 4 and a Sub Team of 4 on Auto; with company, no teams', async () => {
  const h = harness();
  const a = h.peer();
  const { room } = h.rooms.join(h.player('a'), a, ALL, 10)!;
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

  // Company: no teams, the Sub Team taken out first (the host's limit is 4).
  const b = h.peer();
  h.rooms.join(h.player('b'), b, ALL, 10);
  assert.deepEqual(b.room().lineup.map((pick) => [pick.hero, pick.sub]), main.map((hero) => [hero, undefined]));
  assert.equal(room.pick('b', 'kirze', 0, true), null, 'asked for the Sub Team with company: just put in');
  assert.equal(b.room().lineup.at(-1)?.sub, undefined);
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
  // Each hero's gear's additional skills go into the fight with it.
  assert.deepEqual(fight.fight.heroes.map((hero) => hero.skills), [['vigor'], [], []]);
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
  assert.match(over.over?.drops.a?.[0]?.skill ?? '', /^Vigor: /);
  assert.deepEqual(over.over?.drops.broke, []);
  assert.deepEqual(over.over?.rewarded, ['a']);
  assert.equal(h.finished.length, 1);

  // The fight the pages ran, from what they were told, ends the same.
  const told = a.got.filter((m) => m.t === 'turn').flatMap((m) => (m.t === 'turn' ? m.inputs : []));
  const again = replay({ boss: TM_BOSS, seed: 77, stage: 1, heroes: fight.fight.heroes.map(({ id, skin, gear, skills }) => ({ id, skin, gear, skills })) }, told);
  assert.equal(again.result, 'won');
  assert.equal(again.ticks, h.finished[0]?.ticks);

  assert.equal(room.back('a'), null);
  assert.equal(a.room().phase, 'prep');
  assert.equal(a.room().lineup.length, 3);
});

test('technomagic room: one who presses Auto and leaves in the same turn has their heroes fight on, on Auto', async () => {
  const h = harness();
  const a = h.peer();
  const b = h.peer();
  const { room } = h.rooms.join(h.player('a'), a, ALL, 10)!;
  h.rooms.join(h.player('b'), b, ALL, 10);
  room.pick('a', 'kirze', 0);
  room.pick('b', 'clause', 0);
  room.ready('b', true);
  assert.equal(await room.begin('a'), null);
  // Auto on, then gone before the next step: the Auto stays on (not turned over twice).
  room.auto('b', 1);
  room.leave('b', b);
  await h.pass(100);
  const pressed = a.got.flatMap((m) => (m.t === 'turn' ? m.inputs : []));
  assert.deepEqual(pressed.map((input) => [input.kind, input.fighter]), [['auto', 1]]);
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
  // Perseverance on everyone: the damage dealer's DMG growing, every ally's ATK and defence from the supports: the boss falls sooner.
  assert.ok(replay(withSet('perseverance'), autos).ticks < plain.ticks);
  // A set the bot doesn't know of is none.
  assert.deepEqual(replay(withSet('nonsense'), autos).sums, plain.sums);
});

test('technomagic: Perseverance’s supports (Clause, Fallen Frey) and its damage dealer (Kirze) each make the boss fall sooner', () => {
  const autos = [0, 1, 2].map((fighter) => ({ tick: 0, kind: 'auto', fighter }));
  const GEARED = { atk: 1.2, hp: 0.8, crit: 250, pen: 250, critDamage: 0.4, speed: 150 };
  const wearing = (who: string[]): Run => ({ ...run(11, GEARED), heroes: LINEUP.map((hero) => ({ id: hero.id, skin: 0, gear: GEARED, set: who.includes(hero.id) ? 'perseverance' : null })) });
  const plain = replay(wearing([]), autos);
  assert.ok(replay(wearing(['clause', 'fallen-frey']), autos).ticks < plain.ticks, 'the supports: every ally +5% ATK and +10% defence');
  assert.ok(replay(wearing(['kirze']), autos).ticks < plain.ticks, 'the damage dealer: +10% DMG, growing to +25%');
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
  // What this raid hasn't: Arcane Crystal Energy (Kirze), a boss to draw in or casting time to cut (Clause), a boss's mana
  // to take (Fallen Frey), a boss's M.Block or knocking it away (Gremory's Puchi), anything on the boss to dispel (Seria,
  // Lorraine, Valance). What Galgoria shrugs off: a slow (it is steady), and less P.DMG or more P.DEF (it deals only magic).
  // What these fights don't come to: more M.Crit Resistance than Laias's passive gives (already past the boss's crit), a
  // shield on every ally with only 4 (Blessing of Doom shields 4), and the boss knocking Ezekiel down while he strikes.
  const NOTHING = ['kirze s3-light', 'kirze s3-dark', 'clause s1-dark', 'clause s3-dark', 'clause s4-light', 'clause t5-dark', 'fallen-frey s2-light', 'fallen-frey s3-dark', 'gremory s2-light', 'gremory s2-dark', 'laias s1-dark', 'seria s3-light', 'ezekiel s3-light', 'lorraine s3-dark', 'valance s3-light'];
  const own = TRANSCEND_PERKS.filter((perk) => perk.tier >= 3).map((perk) => perk.id);
  const fight = (id: string, perks: string[], seed: number, others: number): Run => ({
    boss: TM_BOSS,
    seed,
    stage: 3,
    // (The hero in two pieces of TechnoMagic gear: Valance's Transcend 5 Dark stacks once for each.)
    heroes: [id, ...ALL.filter((other) => other !== id).slice(others, others + 3)].map((hero, i) => ({ id: hero, skin: 0, gear: {}, ...(i === 0 && { skills: ['vigor', 'war-cry'], perks }) })),
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
  for (const id of ALL) {
    for (const perk of own) {
      const changed = [11, 222].some((seed, k) => key(replay(fight(id, [], seed, k * 2), inputs(perk))) !== key(replay(fight(id, [perk], seed, k * 2), inputs(perk))));
      if (!changed) still.push(`${id} ${perk}`);
    }
  }
  assert.deepEqual(still, NOTHING);
});

test('technomagic: a win gives 3 items at stages 1 to 3, 4 at 4 to 6, and 5 at 7 and 8', () => {
  assert.deepEqual([1, 2, 3, 4, 5, 6, 7, 8].map(tmDropCount), [3, 3, 3, 4, 4, 4, 5, 5]);
  assert.equal(tmDropCount(MOST_STAGE), 5);
});

test('technomagic: each copy rolls 4 potentials, each a different stat, each within its range; a hero of its class has them', () => {
  assert.equal(TM_POTENTIAL_LINES, 4);
  assert.equal(TM_POTENTIAL_IDS.length, 17);
  for (let i = 0; i < 200; i++) {
    const rolled = rollTmPotentials();
    assert.equal(rolled.length, TM_POTENTIAL_LINES);
    assert.equal(new Set(rolled.map(({ stat }) => stat)).size, rolled.length, 'no stat twice');
    for (const { stat, value } of rolled) assert.ok(value >= TM_POTENTIAL_RANGES[stat].min - 1e-9 && value <= TM_POTENTIAL_RANGES[stat].max + 1e-9, `${stat} ${value}`);
  }
  // The lowest roll is each range's bottom, the highest its top.
  assert.deepEqual(rollTmPotentials({ index: () => 0 }).map(({ value }, i) => value === TM_POTENTIAL_RANGES[TM_POTENTIAL_IDS[i] as keyof typeof TM_POTENTIAL_RANGES].min), [true, true, true, true]);
  const potentials = [
    { stat: 'lifesteal', value: 0.03 },
    { stat: 'critResist', value: 0.05 },
    { stat: 'defMagical', value: 0.08 },
    { stat: 'atk', value: 0.05 },
  ] as const;
  const piece = (TM_DROPS.find((one) => one.class === 'warrior' && one.slot === 'weapon') ?? TM_DROPS[0]) as (typeof TM_DROPS)[number];
  const on = pieceBonus({ item: piece, level: 1, potentials }, piece.class ?? 'warrior');
  assert.equal(on.lifesteal, 0.03);
  assert.equal(on.critResist, 0.05);
  assert.equal(on.defMagical, 0.08);
  assert.equal(on.atk, 0.05, 'TechnoMagic gear has no perks of its own');
  // Not on a hero of another class.
  assert.equal(pieceBonus({ item: piece, level: 1, potentials }, piece.class === 'priest' ? 'knight' : 'priest').lifesteal, 0);
  assert.deepEqual(potentialLines(potentials), ['+3% lifesteal', '+5% crit resist', '+8% magical defence', '+5% ATK']);
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
  const GEARED = { atk: 1.3, hp: 0.8, crit: 250, pen: 250, critDamage: 0.4, speed: 150 };
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
  const cleaver = TM_DROPS.find((item) => item.id === 'tri-head-cleaver')!; // the warrior's
  const ward = TM_DROPS.find((item) => item.id === 'antivenom-ward')!; // the priest's
  const heart = TM_DROPS.find((item) => item.id === 'galgorias-heart')!; // the warrior's treasure
  const raid = ITEMS.find((item) => item.raidDrop && item.slot === 'armor' && !item.class)!;
  const copy = (id: string, itemId: string, tmSkill?: string): ItemCopyDoc => ({ _id: id, guildId: 'g', userId: 'u', itemId, level: 1, obtainedAt: new Date(), ...(tmSkill && { tmSkill }) });
  const copies = [copy('a', cleaver.id, 'vigor'), copy('b', ward.id, 'berserk'), copy('c', heart.id, 'vigor'), copy('d', raid.id, 'might')];
  const member = { heroes: { kirze: { boughtAt: new Date(), equipment: { weapon1: 'a', armor1: 'b', treasure: 'c', armor2: 'd' } } }, points: 0 } as unknown as MemberDoc;
  // The priest's armor does nothing on Kirze, and the raid's gear has no skill.
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

/** Whether `doc` is one `filter` finds (the little of MongoDB's filters rewardsUsedFilter uses: fields, $or, $exists, $gt). */
function matches(doc: Record<string, unknown>, filter: Record<string, unknown>): boolean {
  return Object.entries(filter).every(([key, want]) => {
    if (key === '$or') return (want as Record<string, unknown>[]).some((one) => matches(doc, one));
    const have = doc[key];
    if (want !== null && typeof want === 'object' && !(want instanceof Date)) {
      const ops = want as { $exists?: boolean; $gt?: Date };
      if (ops.$exists !== undefined && (have !== undefined) !== ops.$exists) return false;
      if (ops.$gt !== undefined && !(have instanceof Date && have > ops.$gt)) return false;
      return true;
    }
    return have === want;
  });
}

test("technomagic: a run uses up one of the day's rewards while won, or while its fight could still be going", () => {
  assert.ok(RUN_LASTS_MS > MOST_TICKS * STEP_SECONDS * 1000, 'longer than any fight');
  const now = new Date('2026-10-15T12:00:00Z');
  const filter = rewardsUsedFilter('g', 'u', '2026-10-15', now);
  const run = (over: Record<string, unknown>) => ({ guildId: 'g', userId: 'u', day: '2026-10-15', rewardable: true, startedAt: new Date(now.getTime() - 60_000), ...over });
  assert.ok(matches(run({ result: 'won' }), filter), 'won');
  assert.ok(!matches(run({ result: 'lost' }), filter), 'lost');
  assert.ok(matches(run({}), filter), 'still going');
  // The bot stopped during its fight: never finished, it stops counting once the fight would have been over.
  assert.ok(!matches(run({ startedAt: new Date(now.getTime() - RUN_LASTS_MS - 1) }), filter), 'never finished');
  assert.ok(matches(run({ result: 'won', startedAt: new Date(now.getTime() - RUN_LASTS_MS - 1) }), filter), 'won long ago today');
  assert.ok(!matches(run({ rewardable: false, result: 'won' }), filter), 'gives no gear');
  assert.ok(!matches(run({ day: '2026-10-14', result: 'won' }), filter), 'another day');
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
