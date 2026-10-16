import { TM_FIGHT, TM_ROOM } from '../../../constants/index.js';
import { HEROES_BY_ID } from '../../../data/heroes.js';
import { TM_SET_PIECES, tmSetEffect } from '../../../data/tm-sets.js';
import { potentialLines } from '../../../lib/game/heroes.js';
import { MOST_STAGE, SIM_VERSION, STEP_SECONDS, TM_BOSS, tmSkillLine } from '../../../lib/game/technomagic.js';
import { beginRun, clearedStage, finishRun, ownedHeroes, type BegunRun } from '../../../services/technomagic.js';
import { avatarUrl } from '../../auth/login.js';
import type { Player } from '../../auth/token.js';
import { technomagicRoomLink, webConfig } from '../../config.js';
import { Chat } from '../chat.js';
import type { Peer as ConnectionPeer } from '../connection.js';
import { workerFights, type FightEngine, type Fights, type Intent } from './fight.js';
import type { AnswerCode, DropView, FightStart, OverView, PickView, RoomState, ServerMessage, TurnInput } from './protocol.js';

/*
 * The TechnoMagic Raid's rooms: one a server, and one of each player's own (single player: nobody else gets in, and it
 * isn't said in Discord). Whoever opens the raid with others joins the server's room (the first is its host,
 * 1P; when the host goes, whoever has been in it longest is). Getting ready, each picks heroes of their own
 * into the lineup: the host up to TM_ROOM.hostHeroes, everyone else up to TM_ROOM.guestHeroes, TM_ROOM.slots
 * in all, even while the host is in it alone (single player, in a room of their own: as many as TM_ROOM.soloSlots, against an easier boss: TM_ROOM.mainTeam of them in the Main Team,
 * whose skills are theirs to use, and the rest in the Sub Team, on Auto for the whole fight); when someone comes or
 * goes, what no longer fits is taken out, the Sub Team first, then the last picked. Everyone but the host says they're ready, and the host
 * starts the fight at the stage they picked. One whose page goes away (a reload, a phone switching apps) keeps their place
 * and picks for TM_ROOM.awayMs, to come back to; the room stays open for them meanwhile, even with nobody else in it.
 *
 * The fight is the site's sim, run by the bot's clock (in a worker thread: ./fight.ts): every TM_FIGHT.turnMs it
 * takes the steps that are due, each with what was pressed before it, and tells every page what was pressed at which
 * step and how far the fight has got; each page runs the same fight from the same seed and never goes past that. Each
 * player presses only their own heroes. One whose page goes during the fight has their heroes fight on, on Auto, and
 * can come back to it. One who leaves it for good (Leave: `quit`) forfeits what it gives them, their heroes fighting
 * on all the same; alone, in a room of their own, that loses the fight. The fight over, a win gives each player in it TechnoMagic items and points
 * (services/technomagic.ts), and anyone takes the room back to getting ready, or runs it again (`again`).
 */

/** Where the room sends a player's messages: their page, or a fake in tests. */
export type Peer = ConnectionPeer<ServerMessage>;

/** The database, the clock, Discord and where fights run, so tests can stand in for them. */
export interface RoomDeps {
  now: () => number;
  avatar: (guildId: string, userId: string) => string | null;
  owned: (guildId: string, userId: string) => Promise<string[]>;
  /** The highest stage they have won a run at (0: none). */
  cleared: (guildId: string, userId: string) => Promise<number>;
  begin: typeof beginRun;
  /** What a run over gave each player (nothing to those who `forfeited` it): the items found and the points paid. */
  finish: (guildId: string, run: BegunRun, stage: number, result: 'won' | 'lost', ticks: number, forfeited: ReadonlySet<string>) => Promise<Map<string, { drops: DropView[]; points: number }>>;
  /** Says in the server's channel that a room has been opened (by `host`). Not waited for. */
  announce: (guildId: string, host: string) => void;
  /** The link others join the server's room by (null: there is no site). */
  link: (guildId: string) => string | null;
  /** Calls `fn` every `ms` until the returned function is called. */
  every: (ms: number, fn: () => void) => () => void;
  /** Calls `fn` once in `ms`, unless the returned function is called first. */
  after: (ms: number, fn: () => void) => () => void;
  fights: Fights;
}

export const realRoomDeps: RoomDeps = {
  now: Date.now,
  avatar: () => null,
  owned: ownedHeroes,
  cleared: clearedStage,
  begin: beginRun,
  finish: async (guildId, run, stage, result, ticks, forfeited) => {
    const found = await finishRun(guildId, run, stage, result, ticks, forfeited);
    return new Map(
      [...found].map(([userId, { finds, points }]) => [
        userId,
        {
          drops: finds.map(({ item, skill, potentials }) => {
            const setEffect = tmSetEffect(item);
            return {
              itemId: item.id,
              name: item.name,
              stars: item.stars,
              skill: tmSkillLine(skill),
              potentials: potentialLines(potentials),
              slot: item.slot,
              description: item.description,
              itemClass: item.class ?? null,
              setEffect: setEffect === null ? null : { pieces: TM_SET_PIECES, text: setEffect },
            };
          }),
          points,
        },
      ]),
    );
  },
  announce: () => {},
  link: (guildId) => {
    const config = webConfig();
    return config ? technomagicRoomLink(config, guildId) : null;
  },
  every: (ms, fn) => {
    const timer = setInterval(fn, ms);
    return () => clearInterval(timer);
  },
  after: (ms, fn) => {
    const timer = setTimeout(fn, ms);
    timer.unref();
    return () => clearTimeout(timer);
  },
  fights: workerFights,
};

interface Member {
  player: Player;
  /** Their page (null: gone, their place kept for a while; during a fight, their heroes fighting on). */
  peer: Peer | null;
  /** When their page went (null while it's here), and what stops the wait for it to come back. */
  awaySince: number | null;
  awayEnds: (() => void) | null;
  avatar: string;
  owned: Set<string>;
  ready: boolean;
  /** The highest stage they have won at (0: none): as host, they may pick up to the one after it. */
  cleared: number;
}

interface Fight {
  start: FightStart;
  engine: FightEngine;
  run: BegunRun;
  startedAt: number;
  /** Whose each hero is, by its place in the lineup. */
  owners: string[];
  /** How far it has got: its steps, every press it has taken (at its step), and its checksum at the end of each second. */
  tick: number;
  inputs: TurnInput[];
  sums: number[];
  /** What the players asked of it since it was last stepped on, and whether it is being stepped on now. */
  pending: Intent[];
  stepping: boolean;
  /** The players whose pages said their run of it parted from the bot's. */
  parted: Set<string>;
  /** The players who left it for good (`quit`): it gives them nothing. */
  forfeited: Set<string>;
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
  /** Nobody's left (onEmpty has been told). */
  private closed = false;

  constructor(
    readonly guildId: string,
    private readonly deps: RoomDeps,
    private readonly onEmpty: (room: TechnoMagicRoom) => void,
    /** A player's own room (single player), not the server's. */
    readonly single = false,
  ) {}

  get full(): boolean {
    return this.members.size >= TM_ROOM.players;
  }

  has(userId: string): boolean {
    return this.members.has(userId);
  }

  /** `userId`'s page in the room (null: not in it, or gone during a fight). */
  peerOf(userId: string): Peer | null {
    return this.members.get(userId)?.peer ?? null;
  }

  /** The host's id (null: nobody's in). */
  private host(): string | null {
    return this.members.keys().next().value ?? null;
  }

  /** Single player (a room of one's own): the teams and the easier boss. The server's room never is, even with one in it. */
  private solo(): boolean {
    return this.single;
  }

  private slots(): number {
    return this.solo() ? TM_ROOM.soloSlots : TM_ROOM.slots;
  }

  /** How many heroes `userId` may bring. */
  private limit(userId: string): number {
    if (this.solo()) return TM_ROOM.soloSlots;
    return userId === this.host() ? TM_ROOM.hostHeroes : TM_ROOM.guestHeroes;
  }

  /** The highest stage the host may pick: the one after the highest they have won (the first, for one who has won none). */
  private unlocked(): number {
    const host = this.members.get(this.host() ?? '');
    return Math.min(MOST_STAGE, (host?.cleared ?? 0) + 1);
  }

  /**
   * A page for `player`, who owns `owned` and has won up to stage `cleared`, joins
   * (or comes back). Returns the page it took over from (another tab), if any.
   */
  join(player: Player, peer: Peer, owned: readonly string[], cleared = 0): Peer | null {
    const before = this.members.get(player.userId);
    before?.awayEnds?.();
    this.members.set(player.userId, {
      player,
      peer,
      awaySince: null,
      awayEnds: null,
      avatar: this.deps.avatar(this.guildId, player.userId) ?? avatarUrl(player.userId, null),
      owned: new Set(owned),
      ready: before?.ready ?? false,
      cleared: Math.max(cleared, before?.cleared ?? 0),
    });
    if (!before) this.trim();
    this.tell();
    peer.send(this.chat.history());
    if (this.fight) this.showFight(peer);
    return before?.peer && before.peer !== peer ? before.peer : null;
  }

  /**
   * `peer` went away (nothing happens if another page has taken over since): their place and picks are kept for
   * TM_ROOM.awayMs. In a fight, their heroes fight on, on Auto.
   */
  leave(userId: string, peer: Peer): void {
    const member = this.members.get(userId);
    if (!member || member.peer !== peer) return;
    member.peer = null;
    member.awaySince = this.deps.now();
    this.waitFor(member);
    if (this.fight && !this.fight.done) this.fight.pending.push({ kind: 'autos', fighters: this.mine(userId), on: true });
    this.tell();
  }

  /** Whether `member`'s page has been gone longer than they're waited for. */
  private pastBack(member: Member): boolean {
    return member.peer === null && this.deps.now() - (member.awaySince ?? -Infinity) >= TM_ROOM.awayMs;
  }

  /** Waits for an away member's page for what's left of TM_ROOM.awayMs (none left: at once). */
  private waitFor(member: Member): void {
    member.awayEnds?.();
    const left = Math.max(0, (member.awaySince ?? this.deps.now()) + TM_ROOM.awayMs - this.deps.now());
    member.awayEnds = this.deps.after(left, () => this.gone(member));
  }

  /**
   * An away member didn't come back in time. Getting ready, they leave the room, their picks with them. A fight's
   * players stay in it to its end (finish waits for them again), and a fight over keeps them in its results until
   * the room goes back to getting ready (back). Either way, the room closes once nobody is left to come back.
   */
  private gone(member: Member): void {
    const { userId } = member.player;
    if (this.closed || this.members.get(userId) !== member || member.peer !== null) return;
    member.awayEnds = null;
    if (this.fight && !this.fight.done) return;
    if (this.phase === 'prep' && !this.starting) {
      this.members.delete(userId);
      this.lineup = this.lineup.filter((pick) => pick.owner !== userId);
      this.trim();
    }
    if (this.closeIfEmpty()) return;
    this.tell();
  }

  /** Whether anyone has the page open. */
  private present(): boolean {
    return [...this.members.values()].some((member) => member.peer !== null);
  }

  /** Closes the room (onEmpty) when nobody has the page open and nobody gone is still waited for. Whether it did. */
  private closeIfEmpty(): boolean {
    if (this.closed) return true;
    if (this.present() || [...this.members.values()].some((member) => !this.pastBack(member))) return false;
    this.closed = true;
    this.onEmpty(this);
    return true;
  }

  /** How many heroes the Main Team takes alone, or the Sub Team (`sub`). */
  private teamSlots(sub: boolean): number {
    return sub ? TM_ROOM.soloSlots - TM_ROOM.mainTeam : TM_ROOM.mainTeam;
  }

  /**
   * Takes out of the lineup what no longer fits (each player's last picks past their limit, then the last picked past
   * the slots). With more than one player there are no teams: the Sub Team goes first, and the rest are in no team.
   */
  private trim(): void {
    if (!this.solo()) {
      this.lineup = [...this.lineup.filter((pick) => !pick.sub), ...this.lineup.filter((pick) => pick.sub)].map(({ sub: _sub, ...pick }) => pick);
    }
    const counts = new Map<string, number>();
    this.lineup = this.lineup.filter((pick) => {
      const count = (counts.get(pick.owner) ?? 0) + 1;
      counts.set(pick.owner, count);
      return this.members.has(pick.owner) && count <= this.limit(pick.owner);
    });
    this.lineup = this.lineup.slice(0, this.slots());
  }

  /**
   * `userId` puts their hero `hero` (in skin `skin`) in the lineup: null, or why not (another player's in already: no
   * hero is brought twice). Alone, into the Sub Team (`sub`) or the Main Team; one of theirs in the other team already is moved over.
   */
  pick(userId: string, hero: string, skin: number, sub = false): AnswerCode | null {
    const member = this.members.get(userId);
    if (!member || this.phase !== 'prep' || this.starting) return 'closed';
    if (!HEROES_BY_ID.has(hero) || !member.owned.has(hero)) return 'not_owned';
    const solo = this.solo();
    const into = solo && sub;
    const teamFull = solo && this.lineup.filter((pick) => (pick.sub === true) === into).length >= this.teamSlots(into);
    const mine = this.lineup.filter((pick) => pick.owner === userId);
    const there = mine.find((pick) => pick.hero === hero);
    if (there) {
      if ((there.sub === true) === into) return 'picked';
      if (teamFull) return 'team_full';
      this.lineup = this.lineup.map((pick) => (pick === there ? { ...pick, sub: into } : pick));
      member.ready = false;
      this.tell();
      return null;
    }
    if (this.lineup.some((pick) => pick.hero === hero)) return 'picked';
    if (mine.length >= this.limit(userId)) return 'limit';
    if (this.lineup.length >= this.slots()) return 'full';
    if (teamFull) return 'team_full';
    this.lineup.push({ owner: userId, hero, skin: skin < (HEROES_BY_ID.get(hero)?.skins ?? 1) ? skin : 0, ...(into && { sub: true }) });
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

  /** The host picks the raid's stage: one they have opened (won the one before it). */
  setStage(userId: string, stage: number): AnswerCode | null {
    if (this.phase !== 'prep' || this.starting) return 'closed';
    if (userId !== this.host()) return 'only_host';
    const picked = Math.min(MOST_STAGE, Math.max(1, Math.floor(stage)));
    if (picked > this.unlocked()) return 'locked';
    this.stage = picked;
    this.tell();
    return null;
  }

  /** The host starts the fight: everyone else ready, and everyone with a hero in. */
  async begin(userId: string): Promise<AnswerCode | null> {
    if (this.phase !== 'prep' || this.starting) return 'closed';
    if (userId !== this.host()) return 'only_host';
    if (this.stage > this.unlocked()) return 'locked';
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
        return { owner: pick.owner, id: pick.hero, skin: pick.skin, gear: player?.gear.get(pick.hero) ?? {}, set: player?.sets.get(pick.hero) ?? null, uw: player?.uws.get(pick.hero) ?? null, ut: player?.uts.get(pick.hero) ?? null, skills: player?.skills.get(pick.hero) ?? [], perks: player?.perks.get(pick.hero) ?? [], ...(solo && pick.sub && { sub: true }) };
      }),
    };
    let engine: FightEngine | string;
    try {
      engine = await this.deps.fights.start({ boss: start.boss, seed: start.seed, stage: start.stage, solo: start.solo, heroes: start.heroes.map(({ id, skin, gear, set, uw, ut, skills, perks, sub }) => ({ id, skin, gear, set, uw, ut, skills, perks, sub })) });
    } catch (err) {
      engine = err instanceof Error ? err.message : String(err);
    }
    if (typeof engine === 'string') {
      console.error(`A TechnoMagic Raid fight could not start (${engine}).`);
      this.tell();
      return 'failed';
    }
    const fight: Fight = { start, engine, run, startedAt: this.deps.now(), owners: start.heroes.map((hero) => hero.owner), tick: 0, inputs: [], sums: [], pending: [], stepping: false, parted: new Set(), forfeited: new Set(), stop: () => {}, done: false };
    this.fight = fight;
    this.phase = 'fight';
    this.over = null;
    for (const member of this.members.values()) member.ready = false;
    // (One away as it starts: their heroes fight on Auto until they're back.)
    for (const member of this.members.values()) if (!member.peer) fight.pending.push({ kind: 'autos', fighters: this.mine(member.player.userId), on: true });
    this.tell();
    for (const member of this.members.values()) if (member.peer) this.showFight(member.peer);
    fight.stop = this.deps.every(TM_FIGHT.turnMs, () => void this.turn(fight));
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

  /** The heroes of the fight that are `userId`'s, by their places in the lineup: not the Sub Team's, which are on Auto for good. */
  private mine(userId: string): number[] {
    const { fight } = this;
    return fight ? fight.owners.flatMap((owner, fighter) => (owner === userId && !fight.start.heroes[fighter]?.sub ? [fighter] : [])) : [];
  }

  /** `userId` turns their hero `fighter`'s Auto on or off (not one of the Sub Team's). */
  auto(userId: string, fighter: number): void {
    if (this.owns(userId, fighter) && this.mine(userId).includes(fighter)) this.fight?.pending.push({ kind: 'auto', fighter });
  }

  /** `userId` turns every hero of theirs' Auto on (or, with all of them on already, off). */
  autoAll(userId: string): void {
    if (this.fight && !this.fight.done) this.fight.pending.push({ kind: 'autos', fighters: this.mine(userId) });
  }

  /** The host gives up the fight: lost. */
  giveUp(userId: string): AnswerCode | null {
    if (!this.fight || this.fight.done) return 'closed';
    if (userId !== this.host()) return 'only_host';
    this.fight.pending.push({ kind: 'leave' });
    return null;
  }

  /**
   * `userId` leaves the fight for good (the page's Leave, its page going after): it gives them nothing, and their heroes
   * fight on, on Auto. Alone, in a room of their own, the fight is lost.
   */
  quit(userId: string): AnswerCode | null {
    if (!this.members.has(userId) || !this.fight || this.fight.done) return 'closed';
    this.fight.forfeited.add(userId);
    this.fight.pending.push(this.single ? { kind: 'leave' } : { kind: 'autos', fighters: this.mine(userId), on: true });
    return null;
  }

  /** From a fight over, back to getting ready (anyone gone longer than TM_ROOM.awayMs is gone from the room; the rest are still waited for). */
  back(userId: string): AnswerCode | null {
    if (!this.members.has(userId) || this.phase !== 'over') return 'closed';
    this.phase = 'prep';
    this.over = null;
    for (const [id, member] of this.members) if (this.pastBack(member)) this.members.delete(id);
    this.lineup = this.lineup.filter((pick) => this.members.has(pick.owner));
    this.trim();
    this.tell();
    return null;
  }

  /**
   * From a fight over, the same again: back to getting ready, and then the host starts the next fight (everyone else
   * has to be ready for it, as with Start Battle), and anyone else says they're ready for it.
   */
  async again(userId: string): Promise<AnswerCode | null> {
    if (!this.members.has(userId)) return 'closed';
    if (this.phase === 'over') this.back(userId);
    if (this.phase !== 'prep') return 'closed';
    return userId === this.host() ? this.begin(userId) : this.ready(userId, true);
  }

  /**
   * `userId`'s page says its run of fight `no` parted from the bot's at `second` (its checksum then wasn't the bot's: the
   * same sim, seed and presses should never part, so it is something to look into). Noted once a page, for the fight going on.
   */
  parted(userId: string, no: number, second: number): void {
    const { fight } = this;
    if (!fight || fight.start.no !== no || fight.parted.has(userId)) return;
    fight.parted.add(userId);
    console.warn(`A page's TechnoMagic Raid fight parted from the bot's: server ${this.guildId}, run ${fight.run.id}, sim ${SIM_VERSION}, second ${second}, player ${userId}.`);
  }

  /** `userId` says `text` to the room, with a picture (`image`) or not. */
  say(userId: string, text: string, image?: string): void {
    const member = this.members.get(userId);
    const line = member && this.chat.say(member.player, text, this.deps.now(), image);
    if (line) this.send({ t: 'chat', line });
  }

  /**
   * The fight's clock: the steps due, each with what was asked of it before it; then everyone is told. (A turn that
   * comes while the last is still being stepped on waits for the next. A fight that fails is lost.)
   */
  private async turn(fight: Fight): Promise<void> {
    if (fight.done || fight.stepping) return;
    fight.stepping = true;
    const due = Math.floor((this.deps.now() - fight.startedAt) / (STEP_SECONDS * 1000));
    try {
      const progress = await fight.engine.advance(due, fight.pending.splice(0));
      if (fight.done) return;
      const told = { inputs: fight.inputs.length, sums: fight.sums.length };
      fight.tick = progress.tick;
      fight.inputs.push(...progress.inputs);
      fight.sums.push(...progress.sums);
      this.send(this.turnOf(fight, told.inputs, told.sums));
      if (progress.result) void this.finish(fight, progress.result);
    } catch (err) {
      console.error('A TechnoMagic Raid fight failed:', err);
      if (!fight.done) void this.finish(fight, 'lost');
    } finally {
      fight.stepping = false;
    }
  }

  /** What the pages are told of the fight: the presses from `from` on, and the checksums from `summed` on (each with its second, from 1). */
  private turnOf(fight: Fight, from: number, summed: number): ServerMessage {
    const sums = fight.sums.slice(summed).map((sum, i): [number, number] => [summed + i + 1, sum]);
    return { t: 'turn', no: fight.start.no, upTo: fight.tick, inputs: fight.inputs.slice(from), sums };
  }

  /** A page joining (or back) during a fight: what to run it from, and everything so far. */
  private showFight(peer: Peer): void {
    const { fight } = this;
    if (!fight) return;
    peer.send({ t: 'fight', fight: fight.start });
    peer.send(this.turnOf(fight, 0, 0));
  }

  /** The fight is over (`result`): what it gave each player, and the room shows it. */
  private async finish(fight: Fight, result: 'won' | 'lost'): Promise<void> {
    fight.done = true;
    fight.stop();
    fight.engine.close();
    let got = new Map<string, { drops: DropView[]; points: number }>();
    try {
      got = await this.deps.finish(this.guildId, fight.run, fight.start.stage, result, fight.tick, fight.forfeited);
    } catch (err) {
      console.error('Could not finish a TechnoMagic Raid run:', err);
    }
    if (this.fight !== fight) return;
    // A win opens the next stage for everyone in it to the end.
    if (result === 'won') {
      for (const userId of fight.run.players.keys()) {
        if (fight.forfeited.has(userId)) continue;
        const member = this.members.get(userId);
        if (member) member.cleared = Math.max(member.cleared, fight.start.stage);
      }
    }
    this.fight = null;
    this.phase = 'over';
    this.over = {
      result,
      drops: Object.fromEntries([...got].map(([userId, { drops }]) => [userId, drops])),
      points: Object.fromEntries([...got].map(([userId, { points }]) => [userId, points])),
    };
    // Those gone during it: still waited for, for what's left of their time.
    for (const member of this.members.values()) if (!member.peer) this.waitFor(member);
    if (this.closeIfEmpty()) return;
    this.tell();
  }

  private send(message: ServerMessage): void {
    for (const member of this.members.values()) member.peer?.send(message);
  }

  /** Tells every page the room as it is now. */
  private tell(): void {
    const host = this.host();
    // Getting ready, the stage is never past what the host (who may just have become it) has opened.
    if (this.phase === 'prep' && !this.starting) this.stage = Math.min(this.stage, this.unlocked());
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
    const state: Omit<RoomState, 'you'> = {
      phase: this.phase,
      version: SIM_VERSION,
      boss: { id: TM_BOSS, name: 'Galgoria' },
      stage: this.stage,
      stages: MOST_STAGE,
      unlocked: this.unlocked(),
      slots: this.slots(),
      solo: this.solo(),
      link: this.single ? null : this.deps.link(this.guildId),
      players,
      lineup: this.fight ? this.fight.start.heroes.map(({ owner, id, skin, sub }) => ({ owner, hero: id, skin, ...(sub && { sub }) })) : [...this.lineup],
      over: this.over,
    };
    for (const [id, member] of this.members) member.peer?.send({ t: 'room', state: { ...state, you: id } });
  }
}

/** Every server's room, and every player's own. */
export class TechnoMagicRooms {
  /** By the server's id, or (a player's own) the server's and the player's. */
  private readonly rooms = new Map<string, TechnoMagicRoom>();
  /** When each server's room was last said in its channel. */
  private readonly announced = new Map<string, number>();

  constructor(readonly realDeps: RoomDeps = realRoomDeps) {}

  private static key(player: Player, single: boolean): string {
    return single ? `${player.guildId}:${player.userId}` : player.guildId;
  }

  /**
   * Puts `player`'s page in their server's room, or (`single`) a room of their own (see TechnoMagicRoom.join). Null when
   * the server's has as many players as it can. Only the server's is said in its channel. A page of theirs in the other
   * room is taken over, as one in the same room is: one page a player.
   */
  join(player: Player, peer: Peer, owned: readonly string[], cleared = 0, deps: RoomDeps = this.realDeps, single = false): { room: TechnoMagicRoom; replaced: Peer | null } | null {
    const key = TechnoMagicRooms.key(player, single);
    let room = this.rooms.get(key);
    if (room?.full && !room.has(player.userId)) return null;
    if (!room) {
      room = new TechnoMagicRoom(
        player.guildId,
        deps,
        (empty) => {
          if (this.rooms.get(key) === empty) this.rooms.delete(key);
        },
        single,
      );
      this.rooms.set(key, room);
      const now = deps.now();
      if (!single && now - (this.announced.get(player.guildId) ?? -Infinity) >= TM_FIGHT.announceMs) {
        this.announced.set(player.guildId, now);
        deps.announce(player.guildId, player.name);
      }
    }
    const other = this.rooms.get(TechnoMagicRooms.key(player, !single))?.peerOf(player.userId) ?? null;
    return { room, replaced: room.join(player, peer, owned, cleared) ?? other };
  }
}

export const technomagicRooms = new TechnoMagicRooms();
