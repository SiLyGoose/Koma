import { CONFIG } from '../config.js';
import { BACCARAT_CHIPS, BACCARAT_TABLE } from '../constants/index.js';
import { dealRound, totalBet, type BaccaratBets, type BaccaratRound } from '../lib/game/baccarat.js';
import { getBalance, playBaccarat } from '../services/economy/index.js';
import type { BetRefusal, RoundView, SeatView, ServerMessage, TableState } from './baccarat-protocol.js';
import { avatarUrl } from './login.js';
import { playerKey, type Player } from './token.js';

/*
 * Baccarat's shared tables. A member opening baccarat is seated (seatPlayer) at the first table in
 * their server with a free seat (the one they sat at last, if it has room), and a new table is
 * opened when every one is full. A table with nobody at it is closed.
 *
 * A table goes round and round: BACCARAT_TABLE.bettingMs of betting, in which each player puts down
 * and picks up chips (everyone at the table sees them), then one round is dealt for everyone. Each
 * player with chips down is settled on their own (services/economy/baccarat.ts, with the table's
 * round): their chips are only taken then, so leaving before the deal costs nothing, and chips they
 * can no longer cover are refused. The round is shown for BACCARAT_TABLE.showMs, and the next
 * betting starts with an empty table (Rebet puts a player's last chips back). When the time is up
 * and nobody has chips down, the betting just starts over.
 *
 * The round can also be dealt early: each player can vote to deal now, and once everyone at the
 * table has (alone, that's straight away), it is dealt if anyone has chips down. The votes start
 * over with each round.
 */

/** Where the table sends a player's messages: their page (with their watchers), or a fake in tests. */
export interface Peer {
  send(message: ServerMessage): void;
  close(): void;
}

/** The points, pictures, cards and clock, so tests can stand in for them. */
export interface TableDeps {
  play: typeof playBaccarat;
  balance: (guildId: string, userId: string) => Promise<number>;
  avatar: (guildId: string, userId: string) => string | null;
  deal: () => BaccaratRound;
  now: () => number;
  /** Calls `run` in `ms`; returns a function that cancels it. */
  schedule: (ms: number, run: () => void) => () => void;
}

export const realTableDeps: TableDeps = {
  play: playBaccarat,
  balance: async (guildId, userId) => (await getBalance(guildId, userId)).points,
  avatar: () => null,
  deal: () => dealRound(),
  now: Date.now,
  schedule: (ms, run) => {
    const timer = setTimeout(run, ms);
    timer.unref();
    return () => clearTimeout(timer);
  },
};

interface Seat {
  player: Player;
  avatar: string;
  balance: number;
  bets: BaccaratBets;
  result: SeatView['result'];
  refused: boolean;
  lastBets: BaccaratBets | null;
  /** Voted to deal this round now. */
  ready: boolean;
  /** The page playing this seat (null for a moment while it is replaced). */
  peer: Peer | null;
}

export class BaccaratTable {
  private readonly seats: Seat[] = [];
  private phase: TableState['phase'] = 'betting';
  private endsAt = 0;
  private round: RoundView | null = null;
  private rounds = 0;
  private cancel: (() => void) | null = null;
  private closed = false;

  constructor(
    readonly guildId: string,
    readonly number: number,
    private readonly deps: TableDeps,
    private readonly onEmpty: (table: BaccaratTable) => void,
  ) {
    this.startBetting(false);
  }

  get players(): number {
    return this.seats.length;
  }

  get full(): boolean {
    return this.seats.length >= BACCARAT_TABLE.seats;
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
    const seat: Seat = {
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
      console.error('Could not look up a baccarat player’s balance:', err);
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
   * A player's vote to deal now (`ready` false takes it back). When everyone at the table has voted
   * and someone has chips down, the round is dealt at once. False when the round isn't taking bets.
   */
  setReady(userId: string, ready: boolean): boolean {
    const seat = this.seats.find((s) => s.player.userId === userId);
    if (!seat || this.phase !== 'betting') return false;
    seat.ready = ready;
    if (this.allReady()) void this.dealNow();
    else this.broadcast();
    return true;
  }

  /** Everyone at the table voted to deal, and there are chips to deal for. */
  private allReady(): boolean {
    return this.phase === 'betting' && this.seats.length > 0 && this.seats.every((s) => s.ready) && this.seats.some((s) => totalBet(s.bets) > 0);
  }

  /** A player's chips on the table now. Null when they went down; why not otherwise. */
  setBets(userId: string, bets: BaccaratBets): BetRefusal | null {
    const seat = this.seats.find((s) => s.player.userId === userId);
    if (!seat || this.phase !== 'betting') return { reason: 'closed' };
    const total = totalBet(bets);
    const { maxBet } = CONFIG.baccarat;
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
    this.endsAt = this.deps.now() + BACCARAT_TABLE.bettingMs;
    this.cancel = this.deps.schedule(BACCARAT_TABLE.bettingMs, () => void this.dealNow());
    if (announce) this.broadcast();
  }

  /** The betting is over: deals the round for everyone with chips down, or starts the betting over if nobody has. */
  async dealNow(): Promise<void> {
    if (this.closed || this.phase !== 'betting') return;
    this.cancel?.();
    const betting = this.seats.filter((s) => totalBet(s.bets) > 0);
    if (betting.length === 0) return this.startBetting();

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
        console.error('Could not settle a baccarat player’s round:', err);
        seat.refused = true;
      }
    }
    if (this.closed) return;
    this.round = {
      no: this.rounds,
      player: round.player,
      banker: round.banker,
      order: round.order,
      playerTotal: round.playerTotal,
      bankerTotal: round.bankerTotal,
      winner: round.winner,
      natural: round.natural,
    };
    this.endsAt = this.deps.now() + BACCARAT_TABLE.showMs;
    this.cancel = this.deps.schedule(BACCARAT_TABLE.showMs, () => this.startBetting());
    this.broadcast();
  }

  private close(): void {
    this.closed = true;
    this.cancel?.();
    this.onEmpty(this);
  }

  /** The table as `userId` sees it. */
  view(userId: string): TableState {
    const { minBet, maxBet, payout } = CONFIG.baccarat;
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
      maxSeats: BACCARAT_TABLE.seats,
      chips: [...BACCARAT_CHIPS],
      payouts: { player: 1, ...payout },
    };
  }

  private send(seat: Seat): void {
    seat.peer?.send({ t: 'table', state: this.view(seat.player.userId) });
  }

  private broadcast(): void {
    for (const seat of this.seats) this.send(seat);
  }
}

/** The open tables, by server. */
const tables = new Map<string, BaccaratTable[]>();
/** The table each player sat at last (by playerKey), to go back to while it has room. */
const lastTable = new Map<string, BaccaratTable>();

/** The tables open in a server. */
export const tablesIn = (guildId: string): readonly BaccaratTable[] => tables.get(guildId) ?? [];

/**
 * Seats `player` (see BaccaratTable.sit) at the table they already sit at, the one they sat at last
 * if it has room, or the first with a free seat, opening a new one when all are full. Returns the
 * table, and the page they were replaced from, if any.
 */
export async function seatPlayer(player: Player, peer: Peer, deps: TableDeps = realTableDeps): Promise<{ table: BaccaratTable; replaced: Peer | null }> {
  const open = tables.get(player.guildId) ?? [];
  const key = playerKey(player);
  const last = lastTable.get(key);
  let table =
    open.find((t) => t.has(player.userId)) ??
    (last && open.includes(last) && !last.full ? last : undefined) ??
    open.find((t) => !t.full);
  if (!table) {
    // The lowest table number not in use.
    let number = 1;
    while (open.some((t) => t.number === number)) number++;
    table = new BaccaratTable(player.guildId, number, deps, (empty) => {
      const list = tables.get(player.guildId)?.filter((t) => t !== empty) ?? [];
      if (list.length > 0) tables.set(player.guildId, list);
      else tables.delete(player.guildId);
    });
    tables.set(player.guildId, [...open, table].sort((a, b) => a.number - b.number));
  }
  lastTable.set(key, table);
  const replaced = await table.sit(player, peer);
  return { table, replaced };
}

/** For tests: forgets every table. */
export function resetTables(): void {
  tables.clear();
  lastTable.clear();
}
