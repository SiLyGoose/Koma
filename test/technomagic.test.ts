import assert from 'node:assert/strict';
import { test } from 'node:test';
import { GAMES } from '../src/web/config.js';
import { DEFAULTS } from '../src/config.js';
import { TM_ROOM } from '../src/constants/index.js';
import { ITEMS, TM_DROPS, tmDropsOf } from '../src/data/items.js';
import { HEROES } from '../src/data/heroes.js';
import { raidBonuses, raidGear } from '../src/lib/game/heroes.js';
import { HERO_SKINS, MOST_STAGE, MOST_TM_SKILLS, replay, rollTmDrop, rollTmSkill, SIM_VERSION, startRaid, TM_BOSS, TM_SKILLS, tmSkillLine, type Run } from '../src/lib/game/technomagic.js';
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
        players: new Map(players.map(({ userId }) => [userId, { owned: new Set(owned[userId] ?? ALL), gear: new Map(ALL.map((id) => [id, STRONG])), sets: new Map(ALL.map((id) => [id, null])), uws: new Map(ALL.map((id) => [id, null])), skills: new Map(ALL.map((id) => [id, id === 'kirze' ? ['vigor'] : []])), rewardable: userId !== 'broke' }])),
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
  const withSet = (set: string | null): Run => ({ ...run(11, GEARED), heroes: HEROES.map((hero) => ({ id: hero.id, skin: 0, gear: GEARED, set })) });
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
  const wearing = (who: string[]): Run => ({ ...run(11, GEARED), heroes: HEROES.map((hero) => ({ id: hero.id, skin: 0, gear: GEARED, set: who.includes(hero.id) ? 'perseverance' : null })) });
  const plain = replay(wearing([]), autos);
  assert.ok(replay(wearing(['clause', 'fallen-frey']), autos).ticks < plain.ticks, 'the supports: every ally +5% ATK and +10% defence');
  assert.ok(replay(wearing(['kirze']), autos).ticks < plain.ticks, 'the damage dealer: +10% DMG, growing to +25%');
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
  const autos = [0, 1, 2].map((fighter) => ({ tick: 0, kind: 'auto', fighter }));
  const GEARED = { atk: 1.2, hp: 0.8, crit: 250, pen: 250, critDamage: 0.4, speed: 150 };
  const skilled = (skills: string[]): Run => ({ ...run(11, GEARED), heroes: HEROES.map((hero) => ({ id: hero.id, skin: 0, gear: GEARED, skills })) });
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
