import { TM_FIGHT, TM_ROOM } from '../../../constants/index.js';
import { HEROES_BY_ID } from '../../../data/heroes.js';
import { HERO_SKINS, MOST_STAGE, SIM_VERSION, startRaid, STEP_SECONDS, TM_BOSS, type LiveRaid } from '../../../lib/game/technomagic.js';
import { beginRun, finishRun, ownedHeroes, rewardsLeft, type BegunRun } from '../../../services/technomagic.js';
import { avatarUrl } from '../../auth/login.js';
import type { Player } from '../../auth/token.js';
import { Chat } from '../chat.js';
import type { Peer as ConnectionPeer } from '../connection.js';
import type { AnswerCode, FightStart, OverView, PickView, RoomState, ServerMessage, TurnInput } from './protocol.js';

/*
 * The TechnoMagic Raid's rooms: one a server. Whoever opens the raid joins its room (the first is its host,
 * 1P; when the host goes, whoever has been in it longest is). Getting ready, each picks heroes of their own
 * into the lineup: the host up to TM_ROOM.hostHeroes, everyone else up to TM_ROOM.guestHeroes, TM_ROOM.slots
 * in all (alone, as many as TM_ROOM.soloSlots, against an easier boss); when someone comes or goes, what no
 * longer fits is taken out, the last picked first. Everyone but the host says they're ready, and the host
 * starts the fight at the stage they picked.
 *
 * The fight is the site's sim, run here by the bot's clock: every TM_FIGHT.turnMs it takes the steps that are
 * due, each with what was pressed before it, and tells every page what was pressed at which step and how far
 * the fight has got; each page runs the same fight from the same seed and never goes past that. Each player
 * presses only their own heroes. One who leaves during the fight has their heroes fight on, on Auto, and
 * can come back to it. The fight over, a win gives each player whose run gives gear one TechnoMagic item
 * (services/technomagic.ts), and anyone takes the room back to getting ready.
 */

/** Where the room sends a player's messages: their page, or a fake in tests. */
export type Peer = ConnectionPeer<ServerMessage>;

/** The database, the clock and Discord, so tests can stand in for them. */
export interface RoomDeps {
  now: () => number;
  avatar: (guildId: string, userId: string) => string | null;
  owned: (guildId: string, userId: string) => Promise<string[]>;
  rewardsLeft: (guildId: string, userId: string) => Promise<number>;
  begin: typeof beginRun;
  /** What a run over gave each player. */
  finish: (guildId: string, run: BegunRun, stage: number, result: 'won' | 'lost', ticks: number) => Promise<Map<string, { itemId: string; name: string; stars: number }[]>>;
  /** Says in the server's channel that a room has been opened (by `host`). Not waited for. */
  announce: (guildId: string, host: string) => void;
  /** Calls `fn` every `ms` until the returned function is called. */
  every: (ms: number, fn: () => void) => () => void;
}

export const realRoomDeps: RoomDeps = {
  now: Date.now,
  avatar: () => null,
  owned: ownedHeroes,
  rewardsLeft: (guildId, userId) => rewardsLeft(guildId, userId),
  begin: beginRun,
  finish: async (guildId, run, stage, result, ticks) => {
    const found = await finishRun(guildId, run, stage, result, ticks);
    return new Map([...found].map(([userId, items]) => [userId, items.map((item) => ({ itemId: item.id, name: item.name, stars: item.stars }))]));
  },
  announce: () => {},
  every: (ms, fn) => {
    const timer = setInterval(fn, ms);
    return () => clearInterval(timer);
  },
};

interface Member {
  player: Player;
  /** Their page (null: gone during a fight, their heroes fighting on). */
  peer: Peer | null;
  avatar: string;
  owned: Set<string>;
  ready: boolean;
  rewardsLeft: number;
}

/** A press, before the step it counts at. */
type Press = Omit<TurnInput, 'tick'>;

interface Fight {
  start: FightStart;
  raid: LiveRaid;
  run: BegunRun;
  startedAt: number;
  /** Whose each hero is, by its place in the lineup. */
  owners: string[];
  /** Every press taken so far, at its step; and how many of them, and of the checksums, the pages have been told. */
  inputs: TurnInput[];
  told: number;
  summed: number;
  /** Presses waiting for the next step. */
  pending: Press[];
  stop: () => void;
  done: boolean;
}

export class TechnoMagicRoom {
  /** In the order they came in: the first is the host. */
  private readonly members = new Map<string, Member>();
  private lineup: PickView[] = [];
  private stage = 1;
  private phase: RoomState['phase'] = 'prep';
  private fight: Fight | null = null;
  private over: OverView | null = null;
  /** The host has pressed Start and the run is being begun (nothing about the lineup changes meanwhile). */
  private starting = false;
  private fights = 0;
  private readonly chat = new Chat();

  constructor(
    readonly guildId: string,
    private readonly deps: RoomDeps,
    private readonly onEmpty: (room: TechnoMagicRoom) => void,
  ) {}

  get full(): boolean {
    return this.members.size >= TM_ROOM.players;
  }

  has(userId: string): boolean {
    return this.members.has(userId);
  }

  /** The host's id (null: nobody's in). */
  private host(): string | null {
    return this.members.keys().next().value ?? null;
  }

  private solo(): boolean {
    return this.members.size <= 1;
  }

  private slots(): number {
    return this.solo() ? TM_ROOM.soloSlots : TM_ROOM.slots;
  }

  /** How many heroes `userId` may bring. */
  private limit(userId: string): number {
    if (this.solo()) return TM_ROOM.soloSlots;
    return userId === this.host() ? TM_ROOM.hostHeroes : TM_ROOM.guestHeroes;
  }

  /** A page for `player`, who owns `owned`, joins (or comes back). Returns the page it took over from (another tab), if any. */
  join(player: Player, peer: Peer, owned: readonly string[], left: number): Peer | null {
    const before = this.members.get(player.userId);
    this.members.set(player.userId, {
      player,
      peer,
      avatar: this.deps.avatar(this.guildId, player.userId) ?? avatarUrl(player.userId, null),
      owned: new Set(owned),
      ready: before?.ready ?? false,
      rewardsLeft: left,
    });
    if (!before) this.trim();
    this.tell();
    peer.send(this.chat.history());
    if (this.fight) this.showFight(peer);
    return before?.peer && before.peer !== peer ? before.peer : null;
  }

  /** `peer` went away (nothing happens if another page has taken over since). In a fight, their heroes fight on, on Auto. */
  leave(userId: string, peer: Peer): void {
    const member = this.members.get(userId);
    if (!member || member.peer !== peer) return;
    if (this.fight && !this.fight.done) {
      member.peer = null;
      const autos = this.fight.raid.autos();
      this.fight.owners.forEach((owner, fighter) => {
        if (owner === userId && !autos[fighter]) this.fight?.pending.push({ kind: 'auto', fighter });
      });
      return this.tell();
    }
    this.members.delete(userId);
    this.lineup = this.lineup.filter((pick) => pick.owner !== userId);
    this.trim();
    if (!this.present()) return this.onEmpty(this);
    this.tell();
  }

  /** Whether anyone has the page open. */
  private present(): boolean {
    return [...this.members.values()].some((member) => member.peer !== null);
  }

  /** Takes out of the lineup what no longer fits (each player's last picks past their limit, then the last picked past the slots). */
  private trim(): void {
    const counts = new Map<string, number>();
    this.lineup = this.lineup.filter((pick) => {
      const count = (counts.get(pick.owner) ?? 0) + 1;
      counts.set(pick.owner, count);
      return this.members.has(pick.owner) && count <= this.limit(pick.owner);
    });
    this.lineup = this.lineup.slice(0, this.slots());
  }

  /** `userId` puts their hero `hero` (in skin `skin`) in the lineup: null, or why not. */
  pick(userId: string, hero: string, skin: number): AnswerCode | null {
    const member = this.members.get(userId);
    if (!member || this.phase !== 'prep' || this.starting) return 'closed';
    if (!HEROES_BY_ID.has(hero) || !member.owned.has(hero)) return 'not_owned';
    const mine = this.lineup.filter((pick) => pick.owner === userId);
    if (mine.some((pick) => pick.hero === hero)) return 'picked';
    if (mine.length >= this.limit(userId)) return 'limit';
    if (this.lineup.length >= this.slots()) return 'full';
    this.lineup.push({ owner: userId, hero, skin: skin < (HERO_SKINS[hero] ?? 1) ? skin : 0 });
    member.ready = false;
    this.tell();
    return null;
  }

  /** `userId` takes their hero `hero` out of the lineup. */
  unpick(userId: string, hero: string): AnswerCode | null {
    const member = this.members.get(userId);
    if (!member || this.phase !== 'prep' || this.starting) return 'closed';
    this.lineup = this.lineup.filter((pick) => pick.owner !== userId || pick.hero !== hero);
    member.ready = false;
    this.tell();
    return null;
  }

  /** `userId` (not the host) says they're ready, or not. */
  ready(userId: string, on: boolean): AnswerCode | null {
    const member = this.members.get(userId);
    if (!member || this.phase !== 'prep' || this.starting) return 'closed';
    if (userId === this.host()) return 'only_host';
    member.ready = on;
    this.tell();
    return null;
  }

  /** The host picks the raid's stage. */
  setStage(userId: string, stage: number): AnswerCode | null {
    if (this.phase !== 'prep' || this.starting) return 'closed';
    if (userId !== this.host()) return 'only_host';
    this.stage = Math.min(MOST_STAGE, Math.max(1, Math.floor(stage)));
    this.tell();
    return null;
  }

  /** The host starts the fight: everyone else ready, and everyone with a hero in. */
  async begin(userId: string): Promise<AnswerCode | null> {
    if (this.phase !== 'prep' || this.starting) return 'closed';
    if (userId !== this.host()) return 'only_host';
    const members = [...this.members.values()];
    if (members.some((member) => member.player.userId !== userId && !member.ready)) return 'not_ready';
    if (this.lineup.length === 0 || members.some((member) => !this.lineup.some((pick) => pick.owner === member.player.userId))) return 'no_heroes';

    this.starting = true;
    this.tell();
    const stage = this.stage;
    const solo = this.solo();
    let run: BegunRun;
    try {
      const players = members.map((member) => ({ userId: member.player.userId, heroes: this.lineup.filter((pick) => pick.owner === member.player.userId).map(({ hero, skin }) => ({ id: hero, skin })) }));
      run = await this.deps.begin(this.guildId, stage, players);
    } catch (err) {
      console.error('Could not begin a TechnoMagic Raid run:', err);
      this.starting = false;
      this.tell();
      return 'failed';
    }
    this.starting = false;
    // What is theirs still (one sold since it was picked is left out).
    const lineup = this.lineup.filter((pick) => this.members.has(pick.owner) && run.players.get(pick.owner)?.owned.has(pick.hero));
    if (lineup.length === 0) {
      this.tell();
      return 'no_heroes';
    }
    const start: FightStart = {
      no: ++this.fights,
      boss: TM_BOSS,
      seed: run.seed,
      stage,
      solo,
      heroes: lineup.map((pick) => {
        const player = run.players.get(pick.owner);
        return { owner: pick.owner, id: pick.hero, skin: pick.skin, gear: player?.gear.get(pick.hero) ?? {}, set: player?.sets.get(pick.hero) ?? null };
      }),
    };
    const raid = startRaid({ boss: start.boss, seed: start.seed, stage: start.stage, solo: start.solo, heroes: start.heroes.map(({ id, skin, gear, set }) => ({ id, skin, gear, set })) });
    if (typeof raid === 'string') {
      console.error(`A TechnoMagic Raid run made no sense to the sim (${raid}).`);
      this.tell();
      return 'failed';
    }
    const fight: Fight = { start, raid, run, startedAt: this.deps.now(), owners: start.heroes.map((hero) => hero.owner), inputs: [], told: 0, summed: 0, pending: [], stop: () => {}, done: false };
    this.fight = fight;
    this.phase = 'fight';
    this.over = null;
    for (const member of this.members.values()) member.ready = false;
    this.tell();
    for (const member of this.members.values()) if (member.peer) this.showFight(member.peer);
    fight.stop = this.deps.every(TM_FIGHT.turnMs, () => this.turn(fight));
    return null;
  }

  /** Whether hero `fighter` of the fight is `userId`'s. */
  private owns(userId: string, fighter: number): boolean {
    return this.fight !== null && !this.fight.done && this.fight.owners[fighter] === userId;
  }

  /** `userId` presses skill `skill` of their hero `fighter`. */
  press(userId: string, fighter: number, skill: number): void {
    if (this.owns(userId, fighter)) this.fight?.pending.push({ kind: 'skill', fighter, skill });
  }

  /** `userId` turns their hero `fighter`'s Auto on or off. */
  auto(userId: string, fighter: number): void {
    if (this.owns(userId, fighter)) this.fight?.pending.push({ kind: 'auto', fighter });
  }

  /** `userId` turns every hero of theirs' Auto on (or, with all of them on already, off). */
  autoAll(userId: string): void {
    const { fight } = this;
    if (!fight || fight.done) return;
    const mine = fight.owners.flatMap((owner, fighter) => (owner === userId ? [fighter] : []));
    const autos = fight.raid.autos();
    const on = !mine.every((fighter) => autos[fighter]);
    for (const fighter of mine) if (autos[fighter] !== on) fight.pending.push({ kind: 'auto', fighter });
  }

  /** The host gives up the fight: lost. */
  giveUp(userId: string): AnswerCode | null {
    if (!this.fight || this.fight.done) return 'closed';
    if (userId !== this.host()) return 'only_host';
    this.fight.pending.push({ kind: 'leave' });
    return null;
  }

  /** From a fight over, back to getting ready (anyone who has gone since is gone from the room). */
  back(userId: string): AnswerCode | null {
    if (!this.members.has(userId) || this.phase !== 'over') return 'closed';
    this.phase = 'prep';
    this.over = null;
    for (const [id, member] of this.members) if (!member.peer) this.members.delete(id);
    this.lineup = this.lineup.filter((pick) => this.members.has(pick.owner));
    this.trim();
    this.tell();
    return null;
  }

  /** `userId` says `text` to the room, with a picture (`image`) or not. */
  say(userId: string, text: string, image?: string): void {
    const member = this.members.get(userId);
    const line = member && this.chat.say(member.player, text, this.deps.now(), image);
    if (line) this.send({ t: 'chat', line });
  }

  /** The fight's clock: the steps due, each with what was pressed before it; then everyone is told. */
  private turn(fight: Fight): void {
    if (fight.done) return;
    const { raid } = fight;
    const due = Math.floor((this.deps.now() - fight.startedAt) / (STEP_SECONDS * 1000));
    while (raid.tick < due && !raid.result) {
      for (const press of fight.pending.splice(0)) if (raid.input(press)) fight.inputs.push({ ...press, tick: raid.tick });
      raid.step();
    }
    this.send(this.turnOf(fight, fight.told, fight.summed));
    fight.told = fight.inputs.length;
    fight.summed = raid.sums.length;
    if (raid.result) void this.finish(fight);
  }

  /** What the pages are told of the fight: the presses from `from` on, and the checksums from `summed` on (each with its second, from 1). */
  private turnOf(fight: Fight, from: number, summed: number): ServerMessage {
    const sums = fight.raid.sums.slice(summed).map((sum, i): [number, number] => [summed + i + 1, sum]);
    return { t: 'turn', no: fight.start.no, upTo: fight.raid.tick, inputs: fight.inputs.slice(from), sums };
  }

  /** A page joining (or back) during a fight: what to run it from, and everything so far. */
  private showFight(peer: Peer): void {
    const { fight } = this;
    if (!fight) return;
    peer.send({ t: 'fight', fight: fight.start });
    peer.send(this.turnOf(fight, 0, 0));
  }

  /** The fight is over: what it gave each player, and the room shows it. */
  private async finish(fight: Fight): Promise<void> {
    fight.done = true;
    fight.stop();
    const result = fight.raid.result === 'won' ? 'won' : 'lost';
    let drops = new Map<string, { itemId: string; name: string; stars: number }[]>();
    try {
      drops = await this.deps.finish(this.guildId, fight.run, fight.start.stage, result, fight.raid.tick);
    } catch (err) {
      console.error('Could not finish a TechnoMagic Raid run:', err);
    }
    if (this.fight !== fight) return;
    this.fight = null;
    this.phase = 'over';
    this.over = {
      result,
      drops: Object.fromEntries(drops),
      rewarded: [...fight.run.players].flatMap(([userId, player]) => (player.rewardable ? [userId] : [])),
    };
    await Promise.all(
      [...this.members.values()].map(async (member) => {
        member.rewardsLeft = await this.deps.rewardsLeft(this.guildId, member.player.userId).catch(() => member.rewardsLeft);
      }),
    );
    if (!this.present()) return this.onEmpty(this);
    this.tell();
  }

  private send(message: ServerMessage): void {
    for (const member of this.members.values()) member.peer?.send(message);
  }

  /** Tells every page the room as it is now. */
  private tell(): void {
    const host = this.host();
    const players = [...this.members.values()].map((member, i) => ({
      id: member.player.userId,
      name: member.player.name,
      avatar: member.avatar,
      number: i + 1,
      host: member.player.userId === host,
      ready: member.player.userId === host || member.ready,
      away: member.peer === null,
      limit: this.limit(member.player.userId),
      owned: [...member.owned],
    }));
    const state: Omit<RoomState, 'you' | 'rewardsLeft'> = {
      phase: this.phase,
      version: SIM_VERSION,
      boss: { id: TM_BOSS, name: 'Galgoria' },
      stage: this.stage,
      stages: MOST_STAGE,
      slots: this.slots(),
      solo: this.solo(),
      players,
      lineup: this.fight ? this.fight.start.heroes.map(({ owner, id, skin }) => ({ owner, hero: id, skin })) : [...this.lineup],
      over: this.over,
    };
    for (const [id, member] of this.members) member.peer?.send({ t: 'room', state: { ...state, you: id, rewardsLeft: member.rewardsLeft } });
  }
}

/** Every server's room. */
export class TechnoMagicRooms {
  private readonly rooms = new Map<string, TechnoMagicRoom>();
  /** When each server's room was last said in its channel. */
  private readonly announced = new Map<string, number>();

  constructor(readonly realDeps: RoomDeps = realRoomDeps) {}

  /** Puts `player`'s page in their server's room. Null when it has as many players as it can. */
  join(player: Player, peer: Peer, owned: readonly string[], left: number, deps: RoomDeps = this.realDeps): { room: TechnoMagicRoom; replaced: Peer | null } | null {
    let room = this.rooms.get(player.guildId);
    if (!room) {
      room = new TechnoMagicRoom(player.guildId, deps, (empty) => {
        if (this.rooms.get(empty.guildId) === empty) this.rooms.delete(empty.guildId);
      });
      this.rooms.set(player.guildId, room);
      const now = deps.now();
      if (now - (this.announced.get(player.guildId) ?? -Infinity) >= TM_FIGHT.announceMs) {
        this.announced.set(player.guildId, now);
        deps.announce(player.guildId, player.name);
      }
    }
    if (room.full && !room.has(player.userId)) return null;
    return { room, replaced: room.join(player, peer, owned, left) };
  }
}

export const technomagicRooms = new TechnoMagicRooms();
