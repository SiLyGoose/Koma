import { MINESWEEPER_BEST, MINESWEEPER_LEVELS, MINESWEEPER_ROOM, MINESWEEPER_START, type MinesweeperLevel } from '../../../constants/index.js';
import { CONFIG } from '../../../config.js';
import { chordTile, flagCount, neighbours, newBoard, openTile, seenTiles, sharePool, speedMultiplier, toggleFlag, type Board, type BoardRng, type MinesweeperRewards } from '../../../lib/game/minesweeper.js';
import { randInt } from '../../../lib/random.js';
import { addMinesweeperStat, loadMinesweeperBest, loadMinesweeperStats, payMinesweeper, saveMinesweeperClear, type MinesweeperBest, type MinesweeperClear, type MinesweeperStats } from '../../../services/minesweeper.js';
import { avatarUrl } from '../../auth/login.js';
import type { Player } from '../../auth/token.js';
import { Chat } from '../chat.js';
import type { Peer as ConnectionPeer } from '../connection.js';
import type { GameView, PaidView, RoomState, ServerMessage } from './protocol.js';

/*
 * The minesweeper rooms: one a server. Everyone opening minesweeper in a server joins its room and
 * plays the same board (lib/game/minesweeper.ts has the rules): anyone can open, flag and chord, and
 * each is told where the others' mice are over the board.
 *
 * A room starts on a beginner's board (MINESWEEPER_START), and anyone can swap it for a new one, at
 * the level they pick, whenever they like (the page asks first when the board is being played). The
 * clock runs from the first tile opened until the board is won or lost. Who put each flag down is
 * kept, so a board lost to a chord can say whose wrong flag sent it into the mine. A room with nobody left in
 * it is forgotten, its board with it.
 *
 * Each member's record is kept in the database (services/minesweeper.ts) and shown beside them: the
 * mines they have opened, the boards they helped clear (a win for everyone who opened a tile of it),
 * and their trolls (the times a wrong flag of theirs sent someone else's chord into a mine: that mine
 * isn't counted against who chorded).
 *
 * A board cleared pays (the `minesweeper.*` settings): its level's pool of points, times up to
 * `speedBonus` for clearing it under its par time, shared between everyone who opened a tile of it by
 * how many tiles each opened (the ones a click of theirs showed, whether one or a whole patch). A
 * board lost pays nobody.
 *
 * The server's fastest clears of each level are kept too (MINESWEEPER_BEST of them a level, in the
 * database), with everyone who opened a tile of each: a room reads them when it's made, and tells its
 * pages them when they join and whenever a board cleared makes its level's.
 */

/** Where the room sends a player's messages: their page, or a fake in tests. */
export type Peer = ConnectionPeer<ServerMessage>;

/** The mines' places, the clock, the pictures and the records, so tests can stand in for them. */
export interface RoomDeps {
  random: BoardRng;
  now: () => number;
  avatar: (guildId: string, userId: string) => string | null;
  /** A member's record so far. */
  stats: (guildId: string, userId: string) => Promise<MinesweeperStats>;
  /** One more mine opened, board cleared, or troll, for each of `userIds`. Not waited for. */
  record: (guildId: string, userIds: string[], stat: keyof MinesweeperStats) => void;
  /** What a board cleared pays, as the settings have it now. */
  rewards: () => MinesweeperRewards;
  /** Pays each member their share (`points`, by member) of a board cleared. Not waited for. */
  pay: (guildId: string, points: ReadonlyMap<string, number>) => void;
  /** The server's fastest clears of each level so far. */
  best: (guildId: string) => Promise<MinesweeperBest>;
  /** Keeps a clear that made its level's fastest. Not waited for. */
  saveClear: (guildId: string, level: MinesweeperLevel, clear: MinesweeperClear) => void;
}

export const realRoomDeps: RoomDeps = {
  random: randInt,
  now: Date.now,
  avatar: () => null,
  stats: loadMinesweeperStats,
  record: (guildId, userIds, stat) => {
    addMinesweeperStat(guildId, userIds, stat).catch((err) => console.error(`Could not save a minesweeper ${stat} record:`, err));
  },
  rewards: () => CONFIG.minesweeper,
  pay: (guildId, points) => {
    payMinesweeper(guildId, points).catch((err) => console.error('Could not pay for a minesweeper board:', err));
  },
  best: loadMinesweeperBest,
  saveClear: (guildId, level, clear) => {
    saveMinesweeperClear(guildId, level, clear).catch((err) => console.error('Could not save a minesweeper clear:', err));
  },
};

interface Member {
  player: Player;
  peer: Peer;
  colour: number;
  avatar: string;
  stats: MinesweeperStats;
}

interface Game {
  no: number;
  level: MinesweeperLevel;
  board: Board;
  /** When the first tile was opened, and when the board was won or lost. */
  startedAt: number | null;
  endedAt: number | null;
  by: string | null;
  /** Who put down each flag on the board, by tile. */
  flaggers: Map<number, Player>;
  blamed: string[];
  /** Everyone who opened a tile of it, and how many their clicks opened: a board cleared is a win for each of them, and pays them by those. */
  openers: Map<string, { name: string; tiles: number }>;
  /** What it paid, once cleared. */
  paid: PaidView | null;
  /** Where it came among its level's fastest clears (from 1), once cleared, if it made them. */
  rank: number | null;
}

/** Of two clears, the faster first; as fast, the earlier. */
const byTime = (a: MinesweeperClear, b: MinesweeperClear): number => a.ms - b.ms || a.at - b.at;

export class MinesweeperRoom {
  private readonly members = new Map<string, Member>();
  private gameNo = 0;
  private game: Game = this.newGame(MINESWEEPER_START);
  /** What the players in the room say to each other. */
  private readonly chat = new Chat();
  /** The server's fastest clears of each level: the ones made here, until the ones on record are read. */
  private best: MinesweeperBest = { easy: [], medium: [], hard: [] };

  constructor(
    readonly guildId: string,
    private readonly deps: RoomDeps,
    private readonly onEmpty: (room: MinesweeperRoom) => void,
  ) {
    // Without them (they can't be read), the room goes on with the ones made in it.
    deps.best(guildId).then(
      (best) => this.readBest(best),
      (err) => console.error('Could not read the minesweeper leaderboards:', err),
    );
  }

  /** The fastest clears on record, read: with the ones made here meanwhile (each on record too by now, or not yet). */
  private readBest(onRecord: MinesweeperBest): void {
    for (const level of Object.keys(this.best) as MinesweeperLevel[]) {
      const known = new Set(onRecord[level].map((clear) => `${clear.at}:${clear.ms}`));
      const here = this.best[level].filter((clear) => !known.has(`${clear.at}:${clear.ms}`));
      this.best[level] = [...onRecord[level], ...here].sort(byTime).slice(0, MINESWEEPER_BEST);
    }
    this.tellBest();
  }

  get full(): boolean {
    return this.members.size >= MINESWEEPER_ROOM.players;
  }

  has(userId: string): boolean {
    return this.members.has(userId);
  }

  /** A page for `player`, whose record so far is `stats`, joins. Returns the page it took over from (another tab), if any. */
  join(player: Player, peer: Peer, stats: MinesweeperStats): Peer | null {
    const before = this.members.get(player.userId);
    this.members.set(player.userId, {
      player,
      peer,
      colour: before?.colour ?? this.freeColour(),
      avatar: this.deps.avatar(this.guildId, player.userId) ?? avatarUrl(player.userId, null),
      // What they did here since `stats` was read is in the one the room already has.
      stats: before?.stats ?? { ...stats },
    });
    this.tell();
    peer.send({ t: 'best', best: this.best });
    peer.send(this.chat.history());
    return before && before.peer !== peer ? before.peer : null;
  }

  /** `userId` says `text` to the room, with a picture (`image`) or not. */
  say(userId: string, text: string, image?: string): void {
    const member = this.members.get(userId);
    const line = member && this.chat.say(member.player, text, this.deps.now(), image);
    if (line) for (const each of this.members.values()) each.peer.send({ t: 'chat', line });
  }

  /** `peer` went away (nothing happens if another page has taken over since). */
  leave(userId: string, peer: Peer): void {
    if (this.members.get(userId)?.peer !== peer) return;
    this.members.delete(userId);
    if (this.members.size === 0) return this.onEmpty(this);
    this.tell();
  }

  /** The colour the fewest in the room have (the lowest of them). */
  private freeColour(): number {
    const used = Array.from({ length: MINESWEEPER_ROOM.colours }, () => 0);
    for (const m of this.members.values()) used[m.colour] = (used[m.colour] ?? 0) + 1;
    return used.indexOf(Math.min(...used));
  }

  private newGame(level: MinesweeperLevel): Game {
    return { no: ++this.gameNo, level, board: newBoard(MINESWEEPER_LEVELS[level]), startedAt: null, endedAt: null, by: null, flaggers: new Map(), blamed: [], openers: new Map(), paid: null, rank: null };
  }

  /** A new board at `level`, in place of the one there. */
  start(userId: string, level: MinesweeperLevel): void {
    if (!this.members.has(userId)) return;
    this.game = this.newGame(level);
    this.tell();
  }

  /** `userId` opens, flags or chords tile `index`. */
  play(userId: string, move: 'open' | 'flag' | 'chord', index: number): void {
    const member = this.members.get(userId);
    const { game } = this;
    if (!member) return;
    const { board } = game;
    const openedBefore = board.opened;
    const changed = move === 'open' ? openTile(board, index, this.deps.random) : move === 'flag' ? toggleFlag(board, index) : chordTile(board, index);
    if (!changed) return;
    if (move === 'flag') {
      if (board.flag[index]) game.flaggers.set(index, member.player);
      else game.flaggers.delete(index);
    } else {
      const now = this.deps.now();
      game.startedAt ??= now;
      game.openers.set(userId, { name: member.player.name, tiles: (game.openers.get(userId)?.tiles ?? 0) + board.opened - openedBefore });
      if (board.status !== 'playing') {
        game.endedAt = now;
        game.by = member.player.name;
      }
      if (board.status === 'won') {
        // A board cleared is everyone's who opened a tile of it.
        this.count('wins', [...game.openers.keys()]);
        game.paid = this.pay(game, now - game.startedAt);
        game.rank = this.rank(game, now - game.startedAt, now);
      } else if (board.status === 'lost') {
        // A chord into a mine: the flags round its number that were on no mine are what sent it there.
        const wrong = move === 'chord' ? neighbours(board, index).filter((n) => board.flag[n] && !board.mine[n]) : [];
        const liars = new Map(wrong.flatMap((n) => game.flaggers.get(n) ?? []).map((player) => [player.userId, player.name]));
        game.blamed = [...liars.values()];
        // Sent there by someone else's flag, it's a troll for each of them; otherwise the mine is theirs.
        const trolls = [...liars.keys()].filter((id) => id !== userId);
        if (trolls.length > 0) this.count('trolls', trolls);
        else this.count('bombs', [userId]);
      }
    }
    this.tell();
  }

  /** Pays for `game`, cleared in `elapsedMs`: its level's pool, more for speed, shared by the tiles each player opened. Returns what was paid. */
  private pay(game: Game, elapsedMs: number): PaidView {
    const rewards = this.deps.rewards();
    const bonus = speedMultiplier(elapsedMs, rewards.parSeconds[game.level], rewards.speedBonus);
    const total = Math.round(rewards.pool[game.level] * bonus);
    const points = sharePool(total, new Map([...game.openers].map(([id, opener]) => [id, opener.tiles])));
    this.deps.pay(this.guildId, points);
    const shares = [...game.openers].map(([id, opener]) => ({ id, name: opener.name, tiles: opener.tiles, points: points.get(id) ?? 0 }));
    return { bonus, total, shares: shares.sort((a, b) => b.points - a.points) };
  }

  /**
   * Puts `game`, cleared in `elapsedMs` at `now`, among its level's fastest clears, if it is one: kept
   * on record, and told to everyone. Returns where it came (from 1), or null.
   */
  private rank(game: Game, elapsedMs: number, now: number): number | null {
    const players = [...game.openers].map(([id, opener]) => ({ id, name: opener.name, tiles: opener.tiles })).sort((a, b) => b.tiles - a.tiles);
    const clear: MinesweeperClear = { ms: elapsedMs, at: now, players };
    const list = [...this.best[game.level], clear].sort(byTime).slice(0, MINESWEEPER_BEST);
    const at = list.indexOf(clear);
    if (at < 0) return null;
    this.best[game.level] = list;
    this.deps.saveClear(this.guildId, game.level, clear);
    this.tellBest();
    return at + 1;
  }

  /** Tells every page the server's fastest clears as they are now. */
  private tellBest(): void {
    for (const member of this.members.values()) member.peer.send({ t: 'best', best: this.best });
  }

  /** One more of `stat` for each of `userIds`: on what the room shows of them, and on record. */
  private count(stat: keyof MinesweeperStats, userIds: string[]): void {
    for (const id of userIds) {
      const there = this.members.get(id);
      if (there) there.stats[stat]++;
    }
    this.deps.record(this.guildId, userIds, stat);
  }

  /** Where `userId`'s mouse is over the board (null: off it), told to everyone else. */
  cursor(userId: string, at: [number, number] | null): void {
    if (!this.members.has(userId)) return;
    for (const [id, member] of this.members) {
      if (id !== userId) member.peer.send({ t: 'cursor', id: userId, at });
    }
  }

  private gameView(): GameView {
    const { game } = this;
    const { board } = game;
    return {
      no: game.no,
      level: game.level,
      cols: board.cols,
      rows: board.rows,
      mines: board.mines,
      tiles: seenTiles(board),
      flags: flagCount(board),
      flaggers: Object.fromEntries([...game.flaggers].filter(([tile]) => board.flag[tile]).map(([tile, player]) => [tile, player.userId])),
      status: game.startedAt === null ? 'ready' : board.status,
      elapsedMs: game.startedAt === null ? 0 : (game.endedAt ?? this.deps.now()) - game.startedAt,
      by: game.by,
      blamed: game.blamed,
      paid: game.paid,
      rank: game.rank,
    };
  }

  /** Tells every page the room as it is now. */
  private tell(): void {
    const state: Omit<RoomState, 'you'> = {
      players: [...this.members.values()].map((m) => ({ id: m.player.userId, name: m.player.name, avatar: m.avatar, colour: m.colour, ...m.stats })),
      levels: MINESWEEPER_LEVELS,
      rewards: this.deps.rewards(),
      game: this.gameView(),
    };
    for (const [id, member] of this.members) member.peer.send({ t: 'room', state: { you: id, ...state } });
  }
}

/** Every server's room. */
export class MinesweeperRooms {
  private readonly rooms = new Map<string, MinesweeperRoom>();

  constructor(readonly realDeps: RoomDeps = realRoomDeps) {}

  /** Puts `player`'s page in their server's room, with their record so far. Null when it has as many players as it can. */
  join(player: Player, peer: Peer, stats: MinesweeperStats = { bombs: 0, wins: 0, trolls: 0 }, deps: RoomDeps = this.realDeps): { room: MinesweeperRoom; replaced: Peer | null } | null {
    let room = this.rooms.get(player.guildId);
    if (!room) {
      room = new MinesweeperRoom(player.guildId, deps, (empty) => {
        if (this.rooms.get(empty.guildId) === empty) this.rooms.delete(empty.guildId);
      });
      this.rooms.set(player.guildId, room);
    }
    if (room.full && !room.has(player.userId)) return null;
    return { room, replaced: room.join(player, peer, stats) };
  }
}

export const minesweeperRooms = new MinesweeperRooms();
