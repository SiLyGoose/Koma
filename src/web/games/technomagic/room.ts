import { randomBytes } from 'node:crypto';
import { DRAGON_ROOM, TM_FIGHT, TM_ROOM } from '../../../constants/index.js';
import { HEROES_BY_ID } from '../../../data/heroes.js';
import type { RaidClassId } from '../../../constants/raid.js';
import { KR_TM_SETS } from '../../../data/kr-gear.js';
import { copyMainStat, heroItemLines, partOf, potentialLines, setBonusLines } from '../../../lib/game/heroes.js';
import { runeView } from '../../models/heroes.js';
import { DRAGONS, isDragon } from '../../../lib/game/dragon.js';
import { SIM_VERSION, STEP_SECONDS, TM_BOSSES, tmSkillLine } from '../../../lib/game/technomagic.js';
import { beginRun, clearedStages, finishRun, ownedHeroes, type BegunRun, type TmFind } from '../../../services/technomagic.js';
import { avatarUrl } from '../../auth/login.js';
import type { Player } from '../../auth/token.js';
import { dragonRoomLink, technomagicRoomLink, webConfig } from '../../config.js';
import { Chat } from '../chat.js';
import type { Peer as ConnectionPeer } from '../connection.js';
import { workerFights, type FightEngine, type Fights, type Intent } from './fight.js';
import type { AnswerCode, BossView, DropView, FightStart, LobbyView, OverView, PickView, RaidKind, RaidMode, RoomState, ServerMessage, TurnInput } from './protocol.js';

/*
 * The TechnoMagic Raid's rooms: raids others can join, as many in a server as its players create (each with an id of its
 * own, its link's and the front page's Find Raid's, and said in Discord as it is created), and one of each player's own
 * (single player: nobody else gets in, and it isn't said in Discord). Whoever creates a raid is its host (1P; when the
 * host goes, whoever has been in it longest is); a page that names no raid joins an open one against its boss, or creates
 * one. Getting ready, each picks heroes of their own
 * into the lineup: the host up to TM_ROOM.hostHeroes, everyone else up to TM_ROOM.guestHeroes, TM_ROOM.slots
 * in all, even while the host is in it alone (single player, in a room of their own: as many as TM_ROOM.soloSlots, the Dragon Raid's TM_ROOM.dragonSoloSlots, against an easier boss: TM_ROOM.mainTeam of them in the Main Team,
 * whose skills are theirs to use, and the rest in the Sub Team, on Auto for the whole fight); when someone comes or
 * goes, what no longer fits is taken out, the Sub Team first, then the last picked. Everyone but the host says they're ready, and the host
 * starts the fight at the stage they picked (or sooner, forcing it: whoever has no hero in sits it out). One whose page goes away (a reload, a phone switching apps) keeps their place
 * and picks for TM_ROOM.awayMs, to come back to; the room stays open for them meanwhile, even with nobody else in it.
 *
 * The fight is the site's sim, run by the bot's clock (in a worker thread: ./fight.ts): every TM_FIGHT.turnMs it
 * takes the steps that are due, each with what was pressed before it, and tells every page what was pressed at which
 * step and how far the fight has got; each page runs the same fight from the same seed and never goes past that. Each
 * player presses only their own heroes. One whose page goes during the fight has their heroes fight on, on Auto, and
 * can come back to it. One who leaves it for good (Leave: `quit`) forfeits what it gives them and is out of the room,
 * their heroes fighting on all the same; alone, in a room of their own, that loses the fight. The fight over, a win gives each player in it TechnoMagic items and points
 * (services/technomagic.ts), and anyone takes the room back to getting ready, or is in for running it again (`again`): once
 * everyone is, the next fight starts by itself.
 *
 * The Dragon Raid's rooms are the same (dragonRooms), each against one of its dragons (a page names the dragon it wants),
 * and its run is against that dragon (lib/game/dragon.ts). Each boss's stages are opened apart. Getting ready, the host can
 * take the raid against another dragon, everyone in it with it (`setBoss`), or into the dragon's other mode, Normal or Hard
 * (`setMode`: each mode's stages are opened apart too); and anyone can leave it for good (`part`), to create one of their own
 * against another. Two raids are never put together.
 */

/** A raid whose rooms these are: which, and its bosses (the first is fought unless a page names another). */
export interface RaidSetup {
  kind: RaidKind;
  bosses: readonly BossView[];
}

export const TECHNOMAGIC_RAID: RaidSetup = { kind: 'technomagic', bosses: TM_BOSSES };
export const DRAGON_RAID: RaidSetup = { kind: 'dragon', bosses: DRAGONS };

/** A drop as the page shows it: an item found, with what its copy came with. */
function dropView({ item, skill, potentials, options, salvaged }: TmFind): DropView {
  const tmSet = item.kr?.set && KR_TM_SETS.includes(item.kr.set) ? item.kr.set : undefined;
  const bonus = item.kr?.set ? setBonusLines(item.kr.set, item.kr.classes.length === 1 ? (item.kr.classes[0] as RaidClassId) : null, 0)[tmSet ? 0 : 1] : undefined;
  return {
    itemId: item.id,
    name: item.name,
    stars: item.stars,
    skill: tmSkillLine(skill),
    potentials: item.kr ? heroItemLines(item, 1, undefined, options) : potentialLines(potentials),
    icon: item.kr?.icon ?? null,
    mainStat: copyMainStat(item, { level: 1 }),
    slot: item.slot,
    part: partOf(item),
    description: item.description,
    itemClass: item.class ?? (item.kr && item.kr.classes.length === 1 ? (item.kr.classes[0] as string) : null),
    setEffect: bonus ? { pieces: bonus.pieces, text: bonus.text } : null,
    ...(salvaged !== undefined && { salvaged }),
  };
}

/** Where the room sends a player's messages: their page, or a fake in tests. */
export type Peer = ConnectionPeer<ServerMessage>;

/** The highest stage someone has won against a boss in each mode (0: none). */
export type Cleared = Readonly<Record<RaidMode, number>>;

/** How far someone has got, as it is told: in each mode, or (a number) in Hard alone. */
const clearedOf = (cleared: Partial<Cleared> | number): Cleared => (typeof cleared === 'number' ? { hard: cleared, normal: 0 } : { hard: cleared.hard ?? 0, normal: cleared.normal ?? 0 });

/** What a run over gave a player: the items found, the points paid, and (the Dragon Raid's) the hero essences and komaGems, and how many stages it cleared for them for the first time. */
export interface Got {
  drops: DropView[];
  points: number;
  essences?: Record<string, number>;
  gems?: number;
  firstClears?: number;
}

/** The heroes a player owns: their ids (none transcended), or by id how far each is transcended. */
export type Owned = readonly string[] | ReadonlyMap<string, number>;
const isMap = (owned: Owned): owned is ReadonlyMap<string, number> => owned instanceof Map;

/** The database, the clock, Discord and where fights run, so tests can stand in for them. */
export interface RoomDeps {
  now: () => number;
  avatar: (guildId: string, userId: string) => string | null;
  /** The heroes they own: their ids, or by id how far each is transcended (none said: 0). */
  owned: (guildId: string, userId: string) => Promise<Owned>;
  /** The highest stage they have won a run against `boss` at, in each mode (0: none). */
  cleared: (guildId: string, userId: string, boss: string) => Promise<Cleared>;
  /** Begins a run against `boss` in `mode` (services/technomagic.ts beginRun). */
  begin: (guildId: string, stage: number, players: Parameters<typeof beginRun>[2], boss: string, mode: RaidMode) => Promise<BegunRun>;
  /** What a run over gave each player (nothing to those who `forfeited` it): the items found, the points paid, the hero essences and komaGems, and whether it was their first win at its stage. */
  finish: (guildId: string, run: BegunRun, stage: number, result: 'won' | 'lost', ticks: number, forfeited: ReadonlySet<string>) => Promise<Map<string, Got>>;
  /** Says in the server's channel that `host` has created raid `room`, against `boss`. Not waited for. */
  announce: (guildId: string, host: string, boss: string, room: string) => void;
  /** The link others join raid `room` (against `boss`) by (null: there is no site). */
  link: (guildId: string, boss: string, room: string) => string | null;
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
  cleared: clearedStages,
  begin: (guildId, stage, players, boss, mode) => beginRun(guildId, stage, players, new Date(), boss, mode),
  finish: async (guildId, run, stage, result, ticks, forfeited) => {
    const found = await finishRun(guildId, run, stage, result, ticks, forfeited);
    return new Map([...found].map(([userId, { finds, runes, points, essences, gems, firstClears }]) => [userId, { drops: finds.map(dropView), runes: (runes ?? []).flatMap((id) => { const rune = runeView(id); return rune ? [{ id: rune.id, name: rune.name, icon: rune.icon, grade: rune.grade }] : []; }), points, ...(essences && { essences: essences as Record<string, number> }), ...(gems !== undefined && { gems }), ...(firstClears !== undefined && { firstClears }) }]));
  },
  announce: () => {},
  link: (guildId, _boss, room) => {
    const config = webConfig();
    return config ? technomagicRoomLink(config, guildId, room) : null;
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

/** The Dragon Raid's: the same, but for its rooms' links (each dragon's). */
export const realDragonDeps: RoomDeps = {
  ...realRoomDeps,
  link: (guildId, boss, room) => {
    const config = webConfig();
    return config ? dragonRoomLink(config, guildId, boss, room) : null;
  },
};

interface Member {
  player: Player;
  /** Their page (null: gone, their place kept for a while; during a fight, their heroes fighting on). */
  peer: Peer | null;
  /** When their page went (null while it's here), and what stops the wait for it to come back. */
  awaySince: number | null;
  awayEnds: (() => void) | null;
  avatar: string;
  /** The heroes they own, by id, with how far each is transcended. */
  owned: Map<string, number>;
  ready: boolean;
  /** The highest stage they have won at, in each mode (0: none): as host, they may pick up to the one after it. */
  cleared: Cleared;
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
  /** The boss's mode the raid is against (a dragon's Normal or Hard; any other boss's, Hard), and its stage in it. */
  private mode: RaidMode = 'hard';
  private stage = 1;
  /** The host the stage was last set for (a new one gets the highest they have opened). */
  private stageHost: string | null = null;
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
    /** The raid it is a room of, and the boss its fights are against (the host can change it: setBoss). */
    readonly raid: RaidSetup = TECHNOMAGIC_RAID,
    private against: BossView = raid.bosses[0] as BossView,
    /** Its id, for its link and Find Raid (null: a player's own). */
    readonly id: string | null = null,
  ) {}

  get boss(): BossView {
    return this.against;
  }

  /** Getting ready, with room for another: one a page that names no raid can be put in. */
  get open(): boolean {
    return !this.closed && !this.full && this.phase === 'prep' && !this.starting;
  }

  /** As Find Raid lists it (null: a player's own, or nobody's in it). */
  view(): LobbyView | null {
    const host = this.members.get(this.host() ?? '');
    if (this.id === null || this.closed || !host) return null;
    return { id: this.id, boss: this.boss, host: { name: host.player.name, avatar: host.avatar }, mode: this.mode, stage: this.stage, players: this.members.size, most: TM_ROOM.players, phase: this.phase };
  }

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

  /** How many heroes the lineup takes alone: the Dragon Raid's more. */
  private soloSlots(): number {
    return this.raid.kind === 'dragon' ? TM_ROOM.dragonSoloSlots : TM_ROOM.soloSlots;
  }

  private slots(): number {
    return this.solo() ? this.soloSlots() : TM_ROOM.slots;
  }

  /** How many heroes `userId` may bring. */
  private limit(userId: string): number {
    if (this.solo()) return this.soloSlots();
    return userId === this.host() ? TM_ROOM.hostHeroes : TM_ROOM.guestHeroes;
  }

  /** How many stages the boss has in the raid's mode. */
  private stages(): number {
    return this.mode === 'normal' ? (this.boss.normal ?? this.boss.stages) : this.boss.stages;
  }

  /** The highest stage the host may pick, and the one the room starts at: the one after the highest they have won in the raid's mode (the first, for one who has won none). */
  private unlocked(): number {
    const host = this.members.get(this.host() ?? '');
    return Math.min(this.stages(), (host?.cleared[this.mode] ?? 0) + 1);
  }

  /**
   * A page for `player`, who owns `owned` and has won up to stage `cleared` (in each mode, or a number: in Hard), joins
   * (or comes back). Returns the page it took over from (another tab), if any.
   */
  join(player: Player, peer: Peer, owned: Owned, cleared: Partial<Cleared> | number = 0): Peer | null {
    const before = this.members.get(player.userId);
    before?.awayEnds?.();
    this.members.set(player.userId, {
      player,
      peer,
      awaySince: null,
      awayEnds: null,
      avatar: this.deps.avatar(this.guildId, player.userId) ?? avatarUrl(player.userId, null),
      owned: new Map(isMap(owned) ? owned : owned.map((id) => [id, 0])),
      ready: before?.ready ?? false,
      cleared: { hard: Math.max(clearedOf(cleared).hard, before?.cleared.hard ?? 0), normal: Math.max(clearedOf(cleared).normal, before?.cleared.normal ?? 0) },
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
   * the room goes back to getting ready (back) or the next fight starts (and everyone else in for it, it does now). Either
   * way, the room closes once nobody is left to come back.
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
    if (this.phase === 'over') void this.startIfAllIn();
    else this.tell();
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
    return sub ? this.soloSlots() - TM_ROOM.mainTeam : TM_ROOM.mainTeam;
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
    const picked = Math.min(this.stages(), Math.max(1, Math.floor(stage)));
    if (picked > this.unlocked()) return 'locked';
    this.stage = picked;
    this.tell();
    return null;
  }

  /** The host takes the raid into the boss's other mode (a dragon's Normal or Hard), getting ready: at the highest stage they have opened in it. */
  setMode(userId: string, mode: RaidMode): AnswerCode | null {
    if (this.phase !== 'prep' || this.starting) return 'closed';
    if (userId !== this.host()) return 'only_host';
    if (mode === 'normal' && this.boss.normal === undefined) return 'closed';
    if (mode === this.mode) return null;
    this.mode = mode;
    this.stage = this.unlocked();
    this.tell();
    return null;
  }

  /**
   * The host takes the raid against `boss` (another of the raid's), getting ready: everyone in it goes with it, their picks
   * kept but nobody ready, in the same mode (Hard, where it has no Normal one), and the stage the highest the host has opened
   * against it. Each page goes to it once told.
   */
  async setBoss(userId: string, boss: string): Promise<AnswerCode | null> {
    if (this.phase !== 'prep' || this.starting || this.id === null) return 'closed';
    if (userId !== this.host()) return 'only_host';
    const next = this.raid.bosses.find((one) => one.id === boss);
    if (!next) return 'closed';
    if (next.id === this.boss.id) return null;
    // (Nothing about the room changes while how far each has got against it is read.)
    this.starting = true;
    let cleared: Cleared[];
    const members = [...this.members.values()];
    try {
      cleared = await Promise.all(members.map((member) => this.deps.cleared(this.guildId, member.player.userId, next.id).catch(() => clearedOf(0))));
    } finally {
      this.starting = false;
    }
    if (this.closed) return 'closed';
    members.forEach((member, i) => {
      member.cleared = cleared[i] ?? clearedOf(0);
      member.ready = false;
    });
    this.against = next;
    if (next.normal === undefined) this.mode = 'hard';
    this.stage = this.unlocked();
    this.tell();
    return null;
  }

  /** `userId` leaves the raid for good, getting ready: their place and picks go at once. */
  part(userId: string): AnswerCode | null {
    const member = this.members.get(userId);
    if (!member || this.phase !== 'prep' || this.starting) return 'closed';
    member.awayEnds?.();
    this.members.delete(userId);
    this.lineup = this.lineup.filter((pick) => pick.owner !== userId);
    this.trim();
    if (!this.closeIfEmpty()) this.tell();
    return null;
  }

  /**
   * The host starts the fight, getting ready or from a fight over (without going back to getting ready): everyone else
   * ready, and everyone with a hero in; or (`force`) at once, those with no hero in sitting it out.
   */
  async begin(userId: string, force = false): Promise<AnswerCode | null> {
    if ((this.phase !== 'prep' && this.phase !== 'over') || this.starting) return 'closed';
    if (userId !== this.host()) return 'only_host';
    if (this.phase === 'over') this.dropGone();
    if (this.stage > this.unlocked()) return 'locked';
    const inIt = (member: Member): boolean => this.lineup.some((pick) => pick.owner === member.player.userId);
    const all = [...this.members.values()];
    if (!force && all.some((member) => member.player.userId !== userId && !member.ready)) return 'not_ready';
    if (this.lineup.length === 0 || (!force && !all.every(inIt))) return 'no_heroes';
    const members = all.filter(inIt);

    this.starting = true;
    this.tell();
    const stage = this.stage;
    const mode = this.mode;
    const solo = this.solo();
    let run: BegunRun;
    try {
      const players = members.map((member) => ({ userId: member.player.userId, heroes: this.lineup.filter((pick) => pick.owner === member.player.userId).map(({ hero, skin }) => ({ id: hero, skin })) }));
      run = await this.deps.begin(this.guildId, stage, players, this.boss.id, mode);
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
      boss: this.boss.id,
      seed: run.seed,
      stage,
      solo,
      mode,
      heroes: lineup.map((pick) => {
        const player = run.players.get(pick.owner);
        return { owner: pick.owner, id: pick.hero, skin: pick.skin, gear: player?.gear.get(pick.hero) ?? {}, set: player?.sets.get(pick.hero) ?? null, uw: player?.uws.get(pick.hero) ?? null, ut: player?.uts.get(pick.hero) ?? null, artifact: player?.artifacts?.get(pick.hero) ?? null, skills: player?.skills.get(pick.hero) ?? [], perks: player?.perks.get(pick.hero) ?? [], ...(solo && pick.sub && { sub: true }) };
      }),
    };
    let engine: FightEngine | string;
    try {
      engine = await this.deps.fights.start({ boss: start.boss, seed: start.seed, stage: start.stage, solo: start.solo, mode, heroes: start.heroes.map(({ id, skin, gear, set, uw, ut, artifact, skills, perks, sub }) => ({ id, skin, gear, set, uw, ut, artifact, skills, perks, sub })) });
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

  /** Whether hero `fighter` of the fight is `userId`'s (one who has left the room has none to use). */
  private owns(userId: string, fighter: number): boolean {
    return this.fight !== null && !this.fight.done && this.members.has(userId) && this.fight.owners[fighter] === userId;
  }

  /** `userId` presses skill `skill` of their hero `fighter`. */
  press(userId: string, fighter: number, skill: number): void {
    if (this.owns(userId, fighter)) this.fight?.pending.push({ kind: 'skill', fighter, skill });
  }

  /** The heroes of the fight that are `userId`'s, by their places in the lineup: not the Sub Team's, which are on Auto for good (one who has left the room: none). */
  private mine(userId: string): number[] {
    const { fight } = this;
    return fight && this.members.has(userId) ? fight.owners.flatMap((owner, fighter) => (owner === userId && !fight.start.heroes[fighter]?.sub ? [fighter] : [])) : [];
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
   * `userId` leaves the fight for good (the page's Leave): it gives them nothing, and their heroes fight on, on Auto,
   * while they are out of the room at once, their place and picks with them. Alone, in a room of their own, the fight is
   * lost (and they stay in it, to get ready again).
   */
  quit(userId: string): AnswerCode | null {
    const member = this.members.get(userId);
    if (!member || !this.fight || this.fight.done) return 'closed';
    this.fight.forfeited.add(userId);
    if (this.single) {
      this.fight.pending.push({ kind: 'leave' });
      return null;
    }
    this.fight.pending.push({ kind: 'autos', fighters: this.mine(userId), on: true });
    member.awayEnds?.();
    this.members.delete(userId);
    this.lineup = this.lineup.filter((pick) => pick.owner !== userId);
    this.trim();
    // (The last one in it: nobody's left to fight it, so it is lost, and the room closes as it ends.)
    if (this.members.size === 0) this.fight.pending.push({ kind: 'leave' });
    this.tell();
    return null;
  }

  /** From a fight over, back to getting ready (anyone gone longer than TM_ROOM.awayMs is gone from the room; the rest are still waited for). */
  back(userId: string): AnswerCode | null {
    if (!this.members.has(userId) || this.phase !== 'over' || this.starting) return 'closed';
    this.phase = 'prep';
    this.over = null;
    this.dropGone();
    this.tell();
    return null;
  }

  /** Those gone longer than TM_ROOM.awayMs out of the room, their picks with them. */
  private dropGone(): void {
    for (const [id, member] of this.members) if (this.pastBack(member)) this.members.delete(id);
    this.lineup = this.lineup.filter((pick) => this.members.has(pick.owner));
    this.trim();
  }

  /**
   * From a fight over, the same again: `userId` is in for the next fight, which starts by itself once everyone still waited
   * for is (the host can start it sooner: begin's `force`), never going back to getting ready. One with no hero in (in
   * since the fight began) takes the room back to getting ready, to pick theirs. Getting ready, the host's starts the fight
   * and anyone else's says they're ready.
   */
  async again(userId: string): Promise<AnswerCode | null> {
    const member = this.members.get(userId);
    if (!member) return 'closed';
    if (this.phase === 'prep') return userId === this.host() ? this.begin(userId) : this.ready(userId, true);
    if (this.phase !== 'over' || this.starting) return 'closed';
    if (!this.lineup.some((pick) => pick.owner === userId)) return this.back(userId);
    member.ready = true;
    return this.startIfAllIn();
  }

  /** A fight over: the next one starts once everyone still waited for is in for it (`again`); until then, the room as it is. */
  private async startIfAllIn(): Promise<AnswerCode | null> {
    const waiting = [...this.members.values()].some((member) => !member.ready && !this.pastBack(member));
    if (this.phase !== 'over' || this.starting || waiting) {
      this.tell();
      return null;
    }
    this.dropGone();
    const host = this.host();
    return host ? this.begin(host) : null;
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
    let got = new Map<string, Got>();
    try {
      got = await this.deps.finish(this.guildId, fight.run, fight.start.stage, result, fight.tick, fight.forfeited);
    } catch (err) {
      console.error('Could not finish a TechnoMagic Raid run:', err);
    }
    if (this.fight !== fight) return;
    // A win opens the next stage (in its mode) for everyone in it to the end.
    if (result === 'won') {
      const mode = fight.start.mode ?? 'hard';
      for (const userId of fight.run.players.keys()) {
        if (fight.forfeited.has(userId)) continue;
        const member = this.members.get(userId);
        if (member) member.cleared = { ...member.cleared, [mode]: Math.max(member.cleared[mode], fight.start.stage) };
      }
    }
    this.fight = null;
    this.phase = 'over';
    this.over = {
      result,
      drops: Object.fromEntries([...got].map(([userId, { drops }]) => [userId, drops])),
      points: Object.fromEntries([...got].map(([userId, { points }]) => [userId, points])),
      ...(this.raid.kind === 'dragon' && { essences: Object.fromEntries([...got].map(([userId, { essences }]) => [userId, essences ?? {}])) }),
      gems: Object.fromEntries([...got].map(([userId, { gems }]) => [userId, gems ?? 0])),
      firstClears: Object.fromEntries([...got].map(([userId, { firstClears }]) => [userId, firstClears ?? 0])),
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
    // Getting ready, a new host (the room's first, or one taking over) starts at the highest stage they have opened, and
    // the stage is never past it.
    if (this.phase === 'prep' && !this.starting) {
      if (host !== this.stageHost) this.stage = this.unlocked();
      this.stageHost = host;
      this.stage = Math.min(this.stage, this.unlocked());
    }
    const players = [...this.members.values()].map((member, i) => ({
      id: member.player.userId,
      name: member.player.name,
      avatar: member.avatar,
      number: i + 1,
      host: member.player.userId === host,
      // (A fight over: whether they're in for the next one, the host too.)
      ready: (this.phase !== 'over' && member.player.userId === host) || member.ready,
      away: member.peer === null,
      limit: this.limit(member.player.userId),
      owned: [...member.owned.keys()],
      transcend: Object.fromEntries([...member.owned].filter(([, level]) => level > 0)),
    }));
    const state: Omit<RoomState, 'you'> = {
      phase: this.phase,
      version: SIM_VERSION,
      raid: this.raid.kind,
      boss: this.boss,
      bosses: [...this.raid.bosses],
      room: this.id,
      mode: this.mode,
      stage: this.stage,
      stages: this.stages(),
      unlocked: this.unlocked(),
      slots: this.slots(),
      solo: this.solo(),
      link: this.id === null ? null : this.deps.link(this.guildId, this.boss.id, this.id),
      players,
      lineup: this.fight ? this.fight.start.heroes.map(({ owner, id, skin, sub }) => ({ owner, hero: id, skin, ...(sub && { sub }) })) : [...this.lineup],
      over: this.over,
    };
    for (const [id, member] of this.members) member.peer?.send({ t: 'room', state: { ...state, you: id } });
  }
}

/** Where a page asks to go: a raid by its id (`room`), a new one (`create`), or (neither) an open one against its boss. */
export interface RoomWanted {
  room?: string;
  create?: boolean;
}

/** Every server's raids, and every player's own. */
export class TechnoMagicRooms {
  /** By the server's id and the raid's, or (a player's own) the boss's, the server's and the player's. */
  private readonly rooms = new Map<string, TechnoMagicRoom>();
  /** When raids against each boss in each server (by the boss's id and the server's) were last said in its channel. */
  private readonly announced = new Map<string, number>();

  constructor(
    readonly realDeps: RoomDeps = realRoomDeps,
    readonly raid: RaidSetup = TECHNOMAGIC_RAID,
  ) {}

  /** The raid's boss of an id (the first, for one it hasn't). */
  bossOf(id: string | undefined): BossView {
    return this.raid.bosses.find((boss) => boss.id === id) ?? (this.raid.bosses[0] as BossView);
  }

  private static ownKey = (player: Player, boss: string): string => `own:${boss}:${player.guildId}:${player.userId}`;
  private static raidKey = (guildId: string, id: string): string => `raid:${guildId}:${id}`;

  /** `guildId`'s raid `id` (undefined: there is none, or it is over). */
  lobby(guildId: string, id: string): TechnoMagicRoom | undefined {
    return this.rooms.get(TechnoMagicRooms.raidKey(guildId, id));
  }

  /** `guildId`'s raids (not anyone's own), oldest first. */
  private raidsIn(guildId: string): TechnoMagicRoom[] {
    return [...this.rooms.values()].filter((room) => room.guildId === guildId && room.id !== null);
  }

  /** Find Raid: `guildId`'s raids against `boss`, those that can be joined first (the fullest first), then the rest. */
  lobbies(guildId: string, boss: string): LobbyView[] {
    const joinable = (view: LobbyView): number => Number(view.phase === 'prep' && view.players < view.most);
    const views = this.raidsIn(guildId).flatMap((room) => (room.boss.id === boss ? (room.view() ?? []) : []));
    return views.sort((a, b) => joinable(b) - joinable(a) || b.players - a.players);
  }

  /** The boss a page asking for `wanted` (against `boss`) is to fight: the raid's, when it names one (null: that raid is gone). */
  bossFor(player: Player, wanted: RoomWanted, boss?: string): BossView | null {
    if (!wanted.room) return this.bossOf(boss);
    return this.lobby(player.guildId, wanted.room)?.boss ?? null;
  }

  /** A new id for a raid in `guildId`. */
  private newId(guildId: string): string {
    for (;;) {
      const id = randomBytes(4).toString('hex');
      if (!this.lobby(guildId, id)) return id;
    }
  }

  /** A new room at `key` (a raid, `id`, or a player's own: null) against `against`; a raid is said in the server's channel. */
  private create(key: string, player: Player, deps: RoomDeps, against: BossView, id: string | null): TechnoMagicRoom {
    const room = new TechnoMagicRoom(
      player.guildId,
      deps,
      (empty) => {
        if (this.rooms.get(key) === empty) this.rooms.delete(key);
      },
      id === null,
      this.raid,
      against,
      id,
    );
    this.rooms.set(key, room);
    const said = `${against.id}:${player.guildId}`;
    const now = deps.now();
    if (id !== null && now - (this.announced.get(said) ?? -Infinity) >= TM_FIGHT.announceMs) {
      this.announced.set(said, now);
      deps.announce(player.guildId, player.name, against.id, id);
    }
    return room;
  }

  /**
   * Puts `player`'s page in a room (see TechnoMagicRoom.join): `single`, a room of their own against `boss` (one of the
   * raid's: its first, for none); else the raid `wanted` names, a new one (`create`), or one against `boss` (one they're in
   * already, else an open one), or a new one when there is none. Null when the raid named is full, or gone. A page of
   * theirs in another room is taken over, as one in the same room is: one page a player.
   */
  join(player: Player, peer: Peer, owned: Owned, cleared: Partial<Cleared> | number = 0, deps: RoomDeps = this.realDeps, single = false, boss?: string, wanted: RoomWanted = {}): { room: TechnoMagicRoom; replaced: Peer | null } | null {
    const against = this.bossOf(boss);
    let room: TechnoMagicRoom | undefined;
    if (single) {
      const key = TechnoMagicRooms.ownKey(player, against.id);
      room = this.rooms.get(key) ?? this.create(key, player, deps, against, null);
    } else if (wanted.room) {
      room = this.lobby(player.guildId, wanted.room);
      if (!room || (room.full && !room.has(player.userId))) return null;
    } else {
      const raids = this.raidsIn(player.guildId).filter((one) => one.boss.id === against.id);
      room = wanted.create ? undefined : (raids.find((one) => one.has(player.userId)) ?? raids.find((one) => one.open));
      if (!room) {
        const id = this.newId(player.guildId);
        room = this.create(TechnoMagicRooms.raidKey(player.guildId, id), player, deps, against, id);
      }
    }
    // (Their page in any other room of this raid's: taken over too.)
    const other = [...this.rooms.values()].find((one) => one !== room && one.peerOf(player.userId) !== null)?.peerOf(player.userId) ?? null;
    return { room, replaced: room.join(player, peer, owned, cleared) ?? other };
  }
}

export const technomagicRooms = new TechnoMagicRooms();
export const dragonRooms = new TechnoMagicRooms(realDragonDeps, DRAGON_RAID);
