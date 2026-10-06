import { sumBets, type SpotBets } from '../../../lib/game/casino/table-bets.js';
import { getBalance } from '../../../services/economy/index.js';
import type { TableResult } from '../../../services/casino/table.js';
import type { Peer as ConnectionPeer } from '../connection.js';
import type { LiveGame } from '../live.js';
import { avatarUrl } from '../../auth/login.js';
import type { BetRefusal, RoundOf, SeatView, ServerMessage, TableState } from './protocol.js';
import { playerKey, type Player } from '../../auth/token.js';

/*
 * The shared tables of a game played together (baccarat, roulette). A member opening the game is
 * seated (PartyTables.seat) at the first table in their server with a free seat (the one they sat at
 * last, if it has room), and a new table is opened when every one is full. A table with nobody at
 * it is closed, but its last round (with the scoreboard the game keeps on it) is kept: the next table
 * opened with its number in the server carries on from it, like a casino's table nobody sat at for a
 * while. (Kept until the bot restarts.)
 *
 * A table goes round and round: `bettingMs` of betting, in which each player puts down and picks up
 * chips (everyone at the table sees them), then one round is dealt for everyone. Each player with
 * chips down is settled on their own (TableDeps.play, with the table's round): their chips are only
 * taken then, so leaving before the deal costs nothing, and chips they can no longer cover are
 * refused. The round is shown for `showMs`, and the next betting starts with an empty table (Rebet
 * puts a player's last chips back). The round is dealt even when nobody has chips down, so the
 * scoreboard moves on while players watch.
 *
 * The round can also be dealt early: each player can vote to deal now, and once everyone at the
 * table has (alone, that's straight away), it is dealt. The votes start over with each round.
 *
 * What differs between games is in its PartyGame: its spots (`S`), its round (`R`, and `V` as the
 * page is shown it), and anything else it puts on the table (`X`).
 */

/** One game played at shared tables. */
export interface PartyGame<S extends string, R, V, X> {
  /** Its name on the site (for the online list and watching). */
  live: LiveGame;
  /** How many players a table holds, how long the betting lasts and how long a round is shown. */
  table: { readonly seats: number; readonly bettingMs: number; readonly showMs: number };
  /** How long a new connection has to say who it is, and how many messages a second it may send. */
  web: { readonly helloMs: number; readonly messagesPerSecond: number };
  /** The chips the page offers, smallest first. */
  chips: readonly number[];
  /** The game's bet range now (its settings). */
  limits: () => { minBet: number; maxBet: number };
  /** Reads chips from the page: null when they aren't valid ones. */
  parseBets: (data: unknown) => SpotBets<S> | null;
  /** The round as the page is shown it. `previous` is the round shown before it (null for the table's first ever). */
  view: (round: R, previous: RoundOf<V> | null) => V;
  /** What the game adds to the table it sends (like what each spot pays). */
  extras: () => X;
  /** A few words on how a round came out, for the online list, like "Player wins". */
  outcome: (round: V) => string;
}

/** Where the table sends a player's messages: their page (with their watchers), or a fake in tests. */
export type Peer = ConnectionPeer<ServerMessage>;

/** The points, pictures, rounds and clock, so tests can stand in for them. */
export interface TableDeps<S extends string, R> {
  play: (guildId: string, userId: string, bets: SpotBets<S>, deal: () => R) => Promise<TableResult<R, S>>;
  balance: (guildId: string, userId: string) => Promise<number>;
  avatar: (guildId: string, userId: string) => string | null;
  deal: () => R;
  now: () => number;
  /** Calls `run` in `ms`; returns a function that cancels it. */
  schedule: (ms: number, run: () => void) => () => void;
}

/** The deps every game's real tables share: everything but its own play and deal. */
export const realBaseDeps: Omit<TableDeps<string, unknown>, 'play' | 'deal'> = {
  balance: async (guildId, userId) => (await getBalance(guildId, userId)).points,
  avatar: () => null,
  now: Date.now,
  schedule: (ms, run) => {
    const timer = setTimeout(run, ms);
    timer.unref();
    return () => clearTimeout(timer);
  },
};

/** Where a table left off: its last round and how many it had dealt. */
export interface TableHistory<V> {
  round: RoundOf<V> | null;
  rounds: number;
}

interface Seat<S extends string> {
  player: Player;
  avatar: string;
  balance: number;
  bets: SpotBets<S>;
  result: SeatView<S>['result'];
  refused: boolean;
  lastBets: SpotBets<S> | null;
  /** Voted to deal this round now. */
  ready: boolean;
  /** The page playing this seat (null for a moment while it is replaced). */
  peer: Peer | null;
}

export class PartyTable<S extends string, R, V, X> {
  private readonly seats: Seat<S>[] = [];
  private phase: TableState['phase'] = 'betting';
  private endsAt = 0;
  private round: RoundOf<V> | null = null;
  private rounds = 0;
  private cancel: (() => void) | null = null;
  private closed = false;

  constructor(
    readonly game: PartyGame<S, R, V, X>,
    readonly guildId: string,
    readonly number: number,
    private readonly deps: TableDeps<S, R>,
    private readonly onEmpty: (table: PartyTable<S, R, V, X>) => void,
    history: TableHistory<V> = { round: null, rounds: 0 },
  ) {
    this.round = history.round;
    this.rounds = history.rounds;
    this.startBetting(false);
  }

  /** Where the table is up to, for the next table opened with its number. */
  get history(): TableHistory<V> {
    return { round: this.round, rounds: this.rounds };
  }

  get players(): number {
    return this.seats.length;
  }

  get full(): boolean {
    return this.seats.length >= this.game.table.seats;
  }

  has(userId: string): boolean {
    return this.seats.some((s) => s.player.userId === userId);
  }

  /**
   * Seats `player`, or, when they already sit here (a reload, another tab), gives their seat to this
   * page. Returns the page it took the seat from, if any (to be told it was replaced).
   */
  async sit(player: Player, peer: Peer): Promise<Peer | null> {
    const existing = this.seats.find((s) => s.player.userId === player.userId);
    if (existing) {
      const before = existing.peer;
      existing.peer = peer;
      existing.player = player;
      this.send(existing);
      return before === peer ? null : before;
    }
    const seat: Seat<S> = {
      player,
      avatar: this.deps.avatar(this.guildId, player.userId) ?? avatarUrl(player.userId, null),
      balance: 0,
      bets: {},
      result: null,
      refused: false,
      lastBets: null,
      ready: false,
      peer,
    };
    this.seats.push(seat);
    try {
      seat.balance = await this.deps.balance(this.guildId, player.userId);
    } catch (err) {
      console.error(`Could not look up a ${this.game.live} player’s balance:`, err);
    }
    this.broadcast();
    return null;
  }

  /** The page `peer` went away: its player leaves the table (their chips weren't taken yet). */
  leave(userId: string, peer: Peer): void {
    const i = this.seats.findIndex((s) => s.player.userId === userId && s.peer === peer);
    if (i < 0) return;
    this.seats.splice(i, 1);
    if (this.seats.length === 0) return this.close();
    // Everyone left may have voted to deal.
    if (this.allReady()) return void this.dealNow();
    this.broadcast();
  }

  /**
   * A player's vote to deal now (`ready` false takes it back). When everyone at the table has voted,
   * the round is dealt at once. False when the round isn't taking bets.
   */
  setReady(userId: string, ready: boolean): boolean {
    const seat = this.seats.find((s) => s.player.userId === userId);
    if (!seat || this.phase !== 'betting') return false;
    seat.ready = ready;
    if (this.allReady()) void this.dealNow();
    else this.broadcast();
    return true;
  }

  /** Everyone at the table voted to deal. */
  private allReady(): boolean {
    return this.phase === 'betting' && this.seats.length > 0 && this.seats.every((s) => s.ready);
  }

  /** A player's chips on the table now. Null when they went down; why not otherwise. */
  setBets(userId: string, bets: SpotBets<S>): BetRefusal | null {
    const seat = this.seats.find((s) => s.player.userId === userId);
    if (!seat || this.phase !== 'betting') return { reason: 'closed' };
    const total = sumBets(bets);
    const { maxBet } = this.game.limits();
    if (total > maxBet) return { reason: 'too_big', limit: maxBet };
    if (total > seat.balance) return { reason: 'too_poor', balance: seat.balance };
    seat.bets = { ...bets };
    this.broadcast();
    return null;
  }

  /** Sends one player the table as it is (after a refusal, so their page shows what is really down). */
  resend(userId: string): void {
    const seat = this.seats.find((s) => s.player.userId === userId);
    if (seat) this.send(seat);
  }

  private startBetting(announce = true): void {
    if (this.closed) return;
    this.phase = 'betting';
    for (const seat of this.seats) {
      seat.bets = {};
      seat.result = null;
      seat.refused = false;
      seat.ready = false;
    }
    const { bettingMs } = this.game.table;
    this.endsAt = this.deps.now() + bettingMs;
    this.cancel = this.deps.schedule(bettingMs, () => void this.dealNow());
    if (announce) this.broadcast();
  }

  /** The betting is over: deals the round, settling everyone with chips down. */
  async dealNow(): Promise<void> {
    if (this.closed || this.phase !== 'betting') return;
    this.cancel?.();
    const betting = this.seats.filter((s) => sumBets(s.bets) > 0);

    this.phase = 'dealing';
    const round = this.deps.deal();
    this.rounds += 1;
    // Everyone is settled against the same round.
    for (const seat of betting) {
      const bets = seat.bets;
      try {
        const result = await this.deps.play(this.guildId, seat.player.userId, bets, () => round);
        if (result.ok) {
          seat.result = { bets: result.bets, bet: result.bet, payout: result.payout, net: result.net };
          seat.balance = result.balance;
          seat.lastBets = bets;
        } else {
          seat.refused = true;
          if (result.reason === 'too_poor') seat.balance = result.balance;
        }
      } catch (err) {
        console.error(`Could not settle a ${this.game.live} player’s round:`, err);
        seat.refused = true;
      }
    }
    if (this.closed) return;
    this.round = { ...this.game.view(round, this.round), no: this.rounds };
    const { showMs } = this.game.table;
    this.endsAt = this.deps.now() + showMs;
    this.cancel = this.deps.schedule(showMs, () => this.startBetting());
    this.broadcast();
  }

  private close(): void {
    this.closed = true;
    this.cancel?.();
    this.onEmpty(this);
  }

  /** The table as `userId` sees it. */
  view(userId: string): TableState<S, V, X> {
    const { minBet, maxBet } = this.game.limits();
    return {
      table: this.number,
      you: userId,
      seats: this.seats.map((s) => ({
        userId: s.player.userId,
        name: s.player.name,
        avatar: s.avatar,
        balance: s.balance,
        bets: { ...s.bets },
        result: s.result,
        refused: s.refused,
        ready: s.ready,
        lastBets: s.lastBets,
      })),
      phase: this.phase,
      msLeft: Math.max(0, this.endsAt - this.deps.now()),
      round: this.round,
      minBet,
      maxBet,
      maxSeats: this.game.table.seats,
      chips: [...this.game.chips],
      ...this.game.extras(),
    };
  }

  private send(seat: Seat<S>): void {
    seat.peer?.send({ t: 'table', state: this.view(seat.player.userId) });
  }

  private broadcast(): void {
    for (const seat of this.seats) this.send(seat);
  }
}

/** A game's open tables, by server. */
export class PartyTables<S extends string, R, V, X> {
  private readonly tables = new Map<string, PartyTable<S, R, V, X>[]>();
  /** Where each table closed left off, by server and then table number. */
  private readonly histories = new Map<string, Map<number, TableHistory<V>>>();
  /** The table each player sat at last (by playerKey), to go back to while it has room. */
  private readonly lastTable = new Map<string, PartyTable<S, R, V, X>>();

  constructor(
    readonly game: PartyGame<S, R, V, X>,
    readonly realDeps: TableDeps<S, R>,
  ) {}

  /** The tables open in a server. */
  in(guildId: string): readonly PartyTable<S, R, V, X>[] {
    return this.tables.get(guildId) ?? [];
  }

  /**
   * Seats `player` (see PartyTable.sit) at the table they already sit at, the one they sat at last
   * if it has room, or the first with a free seat, opening a new one when all are full. Returns the
   * table, and the page they were replaced from, if any.
   */
  async seat(player: Player, peer: Peer, deps: TableDeps<S, R> = this.realDeps): Promise<{ table: PartyTable<S, R, V, X>; replaced: Peer | null }> {
    const open = this.tables.get(player.guildId) ?? [];
    const key = playerKey(player);
    const last = this.lastTable.get(key);
    let table =
      open.find((t) => t.has(player.userId)) ??
      (last && open.includes(last) && !last.full ? last : undefined) ??
      open.find((t) => !t.full);
    if (!table) {
      // The lowest table number not in use.
      let number = 1;
      while (open.some((t) => t.number === number)) number++;
      const { guildId } = player;
      const histories = this.histories.get(guildId) ?? new Map<number, TableHistory<V>>();
      this.histories.set(guildId, histories);
      table = new PartyTable(
        this.game,
        guildId,
        number,
        deps,
        (empty) => {
          histories.set(empty.number, empty.history);
          const list = this.tables.get(guildId)?.filter((t) => t !== empty) ?? [];
          if (list.length > 0) this.tables.set(guildId, list);
          else this.tables.delete(guildId);
        },
        histories.get(number),
      );
      this.tables.set(player.guildId, [...open, table].sort((a, b) => a.number - b.number));
    }
    this.lastTable.set(key, table);
    const replaced = await table.sit(player, peer);
    return { table, replaced };
  }

  /** For tests: forgets every table. */
  reset(): void {
    this.tables.clear();
    this.histories.clear();
    this.lastTable.clear();
  }
}
