import { randomUUID } from 'node:crypto';
import { CONFIG } from '../../../config.js';
import { POKER_BOT_NAMES, POKER_TABLE } from '../../../constants/index.js';
import type { Card } from '../../../lib/game/casino/blackjack.js';
import { botAction } from '../../../lib/game/casino/poker/bot.js';
import {
  act as handAct,
  advance,
  forfeit,
  legalActions,
  potTotal,
  shuffledDeck,
  startHand,
  type HandPlayer,
  type HandState,
  type PokerAction,
} from '../../../lib/game/casino/poker/hand.js';
import { buyIn, cashOut, houseTake, renewSeats, saveChips, type BuyInResult } from '../../../services/casino/poker.js';
import { getBalance } from '../../../services/economy/index.js';
import { avatarUrl } from '../../auth/login.js';
import { playerKey, type Player } from '../../auth/token.js';
import type { Peer as ConnectionPeer } from '../connection.js';
import type { HandView, PokerMove, PokerState, Refusal, SeatView, ServerMessage } from './protocol.js';

/*
 * The poker tables. A member opening poker joins (PokerTables.join) the table they sit at, the one
 * they were at last if it has a free seat, or the first in their server with one, and a new table is
 * opened when every one is full. Joining, they see the table; they play once they sit down with
 * chips (taken from their balance: services/casino/poker.ts keeps them safe in the database).
 *
 * A hand is dealt whenever at least two players with chips are sitting in (bots count, but a table
 * with nobody but bots doesn't play): lib/game/casino/poker/hand.ts has the rules, and this runs it
 * with a clock. Each player has poker.turnSeconds for a move, after which they check (when it's
 * free) or fold. A bot takes a moment over its move (POKER_TABLE.botThinkMs). After every hand each
 * player's chips are saved, the rake goes into the vault, and anyone getting up (or out of chips)
 * leaves; then the next hand is dealt after POKER_TABLE.nextHandMs.
 *
 * A player whose page goes away keeps their seat for POKER_TABLE.awayMs, sitting out of new hands
 * and checking or folding at once in the one they're in; after that they are cashed out. Any seated
 * player can add a bot to a free seat (its chips are the house's: what it ends up winning goes into
 * the vault when it leaves) and take one away. A table with nobody left at it closes.
 *
 * Everything that changes a table runs one at a time (`run`), so a move can't land in the middle of
 * a hand being saved.
 */

/** Where the table sends a player's messages: their page, or a fake in tests. */
export type Peer = ConnectionPeer<ServerMessage>;

/** The points, pictures, cards, clock and bots, so tests can stand in for them. */
export interface PokerDeps {
  buyIn: (guildId: string, userId: string, tableKey: string, chips: number) => Promise<BuyInResult>;
  saveChips: (seatId: string, chips: number) => Promise<void>;
  cashOut: (seatId: string) => Promise<{ amount: number; balance: number } | null>;
  renewSeats: (tableKey: string) => Promise<void>;
  houseTake: (guildId: string, amount: number) => Promise<void>;
  balance: (guildId: string, userId: string) => Promise<number>;
  avatar: (guildId: string, userId: string) => string | null;
  deck: () => Card[];
  /** Numbers from 0 up to 1, for the bots. */
  random: () => number;
  now: () => number;
  /** Calls `run` in `ms`; returns a function that cancels it. */
  schedule: (ms: number, run: () => void) => () => void;
}

export const realPokerDeps: PokerDeps = {
  buyIn,
  saveChips,
  cashOut,
  renewSeats,
  houseTake,
  balance: async (guildId, userId) => (await getBalance(guildId, userId)).points,
  avatar: () => null,
  deck: shuffledDeck,
  random: Math.random,
  now: Date.now,
  schedule: (ms, run) => {
    const timer = setTimeout(run, ms);
    timer.unref();
    return () => clearTimeout(timer);
  },
};

interface Seat {
  seat: number;
  /** The member's id, or the bot's ("bot:1"). */
  id: string;
  name: string;
  avatar: string;
  bot: boolean;
  /** Chips behind, between hands (in a hand, its HandPlayer's stack is what counts). */
  chips: number;
  /** A member's PokerSeatDoc (null for a bot). */
  seatId: string | null;
  /** A bot's chips when it sat down (the house's), to settle up when it leaves. */
  stake: number;
  /** Gets up once the hand they're in is over. */
  leaving: boolean;
  /** When their page went away (null while it's here). */
  awaySince: number | null;
}

/** A page at the table: its member, and how to reach it. */
interface Viewer {
  player: Player;
  peer: Peer | null;
  balance: number;
}

/** Each process's tables have keys of their own, so a restarted bot never mixes up seats left by the one before. */
const PROCESS = randomUUID().slice(0, 8);

/** What a member at the table can be told no, from a refusal. */
export type PokerRefusal = Refusal | null;

export class PokerTable {
  /** Every seat, empty ones null. */
  private readonly seats: (Seat | null)[] = Array.from({ length: POKER_TABLE.seats }, () => null);
  /** Every page at the table (seated or not), by member. */
  private readonly viewers = new Map<string, Viewer>();
  private hand: HandState | null = null;
  private handNo = 0;
  /** The seat with the button in the last hand. */
  private buttonSeat = -1;
  /** When the turn being played (or the wait for the next hand) ends, and what cancels its timer. */
  private deadline = 0;
  private cancelTimer: (() => void) | null = null;
  private nextHandPending = false;
  private stopHeartbeat: (() => void) | null = null;
  private closed = false;
  private botCount = 0;
  /** The changes waiting their turn: everything that changes the table runs one after another. */
  private queue: Promise<void> = Promise.resolve();
  readonly key: string;

  constructor(
    readonly guildId: string,
    readonly number: number,
    private readonly deps: PokerDeps,
    private readonly onEmpty: (table: PokerTable) => void,
  ) {
    this.key = `${PROCESS}:${guildId}:${number}`;
    this.heartbeat();
  }

  /** Runs `change` once every change before it is done. Errors are logged, never left to break the queue. */
  private run<T>(change: () => Promise<T> | T): Promise<T> {
    const result = this.queue.then(change);
    this.queue = result.then(
      () => undefined,
      (err) => console.error(`A poker table (${this.key}) failed:`, err),
    );
    return result;
  }

  /** How many are seated (bots too). */
  get taken(): number {
    return this.seats.filter((s) => s !== null).length;
  }

  get full(): boolean {
    return this.taken >= POKER_TABLE.seats;
  }

  /** `userId` sits at this table or has a page at it. */
  has(userId: string): boolean {
    return this.viewers.has(userId) || this.seatOf(userId) !== null;
  }

  seated(userId: string): boolean {
    return this.seatOf(userId) !== null;
  }

  private seatOf(id: string): Seat | null {
    return this.seats.find((s) => s?.id === id) ?? null;
  }

  private humans(): Seat[] {
    return this.seats.filter((s): s is Seat => s !== null && !s.bot);
  }

  // -------------------------------------------------------------------------
  // Pages coming and going
  // -------------------------------------------------------------------------

  /** A page for `player` joins the table. Returns the page it took over from (another tab), if any. */
  join(player: Player, peer: Peer): Promise<Peer | null> {
    return this.run(async () => {
      const before = this.viewers.get(player.userId);
      const viewer: Viewer = { player, peer, balance: before?.balance ?? 0 };
      this.viewers.set(player.userId, viewer);
      const seat = this.seatOf(player.userId);
      if (seat) {
        seat.awaySince = null;
        seat.name = player.name;
      }
      try {
        viewer.balance = await this.deps.balance(this.guildId, player.userId);
      } catch (err) {
        console.error('Could not look up a poker player’s balance:', err);
      }
      this.maybeDeal();
      this.broadcast();
      return before?.peer && before.peer !== peer ? before.peer : null;
    });
  }

  /** The page `peer` went away. A seated player keeps their seat for a while (see the top of this file). */
  leave(userId: string, peer: Peer): Promise<void> {
    return this.run(async () => {
      const viewer = this.viewers.get(userId);
      if (!viewer || viewer.peer !== peer) return;
      const seat = this.seatOf(userId);
      if (!seat) {
        this.viewers.delete(userId);
        this.closeIfEmpty();
        this.broadcast();
        return;
      }
      viewer.peer = null;
      seat.awaySince = this.deps.now();
      const since = seat.awaySince;
      this.deps.schedule(POKER_TABLE.awayMs, () => {
        void this.run(async () => {
          // Back since (or gone again later, which has its own timer).
          if (seat.awaySince !== since || this.seats[seat.seat] !== seat) return;
          await this.standUp(seat);
          this.viewers.delete(userId);
          this.closeIfEmpty();
          this.broadcast();
        });
      });
      // Their turn now: played for them.
      this.playForAway();
      this.broadcast();
    });
  }

  // -------------------------------------------------------------------------
  // Sitting down and standing up
  // -------------------------------------------------------------------------

  /** Sits `userId` down at `seatNo` (or the first free seat) with `chips` from their balance. Null when they sat; why not otherwise. */
  sit(userId: string, chips: number, seatNo?: number): Promise<PokerRefusal> {
    return this.run(async () => {
      const viewer = this.viewers.get(userId);
      if (!viewer || this.seatOf(userId)) return { reason: 'not_now' };
      const at = seatNo ?? this.seats.findIndex((s) => s === null);
      if (at < 0 || at >= POKER_TABLE.seats || this.seats[at] !== null) return { reason: 'seat_taken' };
      let bought: BuyInResult;
      try {
        bought = await this.deps.buyIn(this.guildId, userId, this.key, chips);
      } catch (err) {
        console.error('Could not buy a poker player in:', err);
        return { reason: 'failed' };
      }
      if (!bought.ok) {
        if (bought.reason === 'too_poor') {
          viewer.balance = bought.balance;
          return { reason: 'too_poor', balance: bought.balance };
        }
        return { reason: 'buy_in', min: bought.min, max: bought.max };
      }
      viewer.balance = bought.balance;
      this.seats[at] = {
        seat: at,
        id: userId,
        name: viewer.player.name,
        avatar: this.deps.avatar(this.guildId, userId) ?? avatarUrl(userId, null),
        bot: false,
        chips: bought.chips,
        seatId: bought.seatId,
        stake: 0,
        leaving: false,
        awaySince: viewer.peer ? null : this.deps.now(),
      };
      this.maybeDeal();
      this.broadcast();
      return null;
    });
  }

  /** `userId` stands up: their chips go back to their balance (once the hand they're in is over; they fold it). */
  stand(userId: string): Promise<PokerRefusal> {
    return this.run(async () => {
      const seat = this.seatOf(userId);
      if (!seat) return { reason: 'not_now' };
      await this.standUp(seat);
      this.broadcast();
      return null;
    });
  }

  /** Gets `seat` up: straight away between hands, or (folding) once the hand they're in is over. */
  private async standUp(seat: Seat): Promise<void> {
    const playing = this.hand && !this.hand.done && this.hand.players.some((p) => p.id === seat.id);
    if (playing && this.hand) {
      seat.leaving = true;
      forfeit(this.hand, seat.id);
      this.afterMove();
      return;
    }
    await this.removeSeat(seat);
    this.maybeDeal();
  }

  /** Frees `seat`, paying out its chips: a member's to their balance, a bot's winnings to the vault. */
  private async removeSeat(seat: Seat): Promise<void> {
    if (this.seats[seat.seat] !== seat) return;
    this.seats[seat.seat] = null;
    if (seat.bot) {
      const won = seat.chips - seat.stake;
      if (won > 0) await this.deps.houseTake(this.guildId, won).catch((err) => console.error('Could not put a poker bot’s winnings in the vault:', err));
      return;
    }
    if (!seat.seatId) return;
    try {
      const paid = await this.deps.cashOut(seat.seatId);
      const viewer = this.viewers.get(seat.id);
      if (paid && viewer) viewer.balance = paid.balance;
    } catch (err) {
      // cashOut leaves the chips for the sweeper.
      console.error('Could not cash a poker player out:', err);
    }
  }

  // -------------------------------------------------------------------------
  // Bots
  // -------------------------------------------------------------------------

  /** A seated member adds a bot in the first free seat. */
  addBot(userId: string): Promise<PokerRefusal> {
    return this.run(() => {
      if (!this.seatOf(userId)) return { reason: 'not_now' };
      const at = this.seats.findIndex((s) => s === null);
      if (at < 0) return { reason: 'seat_taken' };
      const names = new Set(this.seats.map((s) => s?.name));
      const name = POKER_BOT_NAMES.find((n) => !names.has(n)) ?? `Bot ${this.botCount + 1}`;
      this.botCount++;
      const chips = CONFIG.poker.maxBuyIn;
      this.seats[at] = { seat: at, id: `bot:${this.botCount}`, name, avatar: '', bot: true, chips, seatId: null, stake: chips, leaving: false, awaySince: null };
      this.maybeDeal();
      this.broadcast();
      return null;
    });
  }

  /** A seated member takes the bot in `seatNo` away (once the hand it's in is over). */
  removeBot(userId: string, seatNo: number): Promise<PokerRefusal> {
    return this.run(async () => {
      const seat = this.seats[seatNo];
      if (!this.seatOf(userId) || !seat?.bot) return { reason: 'not_now' };
      // In the hand being played (even folded, its chips aren't settled until it's over): it goes after.
      const playing = this.hand && !this.hand.done && this.hand.players.some((p) => p.id === seat.id);
      if (playing) seat.leaving = true;
      else await this.removeSeat(seat);
      this.broadcast();
      return null;
    });
  }

  // -------------------------------------------------------------------------
  // Playing
  // -------------------------------------------------------------------------

  /** `userId`'s move, on their turn. */
  act(userId: string, move: PokerMove, amount?: number): Promise<PokerRefusal> {
    return this.run(() => {
      const hand = this.hand;
      if (!hand || hand.toAct === null || hand.players[hand.toAct]?.id !== userId) return { reason: 'not_now' };
      const action = toAction(hand, move, amount);
      if (!action || handAct(hand, userId, action) !== null) return { reason: 'not_now' };
      this.afterMove();
      return null;
    });
  }

  /** Who can be dealt in: seated with chips, not getting up, and (members) with their page here. */
  private ready(): Seat[] {
    return this.seats.filter((s): s is Seat => s !== null && s.chips > 0 && !s.leaving && s.awaySince === null);
  }

  /** Deals the next hand after a pause, when there are players for one and nothing else is going on. */
  private maybeDeal(): void {
    if (this.closed || this.nextHandPending || (this.hand && !this.hand.done)) return;
    const ready = this.ready();
    if (ready.length < 2 || !ready.some((s) => !s.bot)) return;
    this.nextHandPending = true;
    this.setTimer(POKER_TABLE.nextHandMs, () => {
      void this.run(() => {
        this.nextHandPending = false;
        this.deal();
      });
    });
  }

  private deal(): void {
    const ready = this.ready();
    if (this.closed || ready.length < 2 || !ready.some((s) => !s.bot)) {
      this.broadcast();
      return;
    }
    // The button moves to the next player dealt in, round the table.
    const next = ready.find((s) => s.seat > this.buttonSeat) ?? (ready[0] as Seat);
    this.buttonSeat = next.seat;
    const { smallBlind, bigBlind, rake, rakeCap } = CONFIG.poker;
    this.hand = startHand(
      ready.map((s) => ({ id: s.id, seat: s.seat, stack: s.chips })),
      ready.indexOf(next),
      { small: smallBlind, big: bigBlind, rake: { rate: rake, cap: rakeCap } },
      this.deps.deck(),
    );
    this.handNo++;
    this.afterMove();
  }

  /** After any move: the next turn, the next street, or the end of the hand. */
  private afterMove(): void {
    const hand = this.hand;
    this.clearTimer();
    if (!hand) return;
    if (hand.done) {
      void this.run(() => this.endHand());
      this.broadcast();
      return;
    }
    if (hand.toAct === null) {
      this.setTimer(hand.cardsUp ? POKER_TABLE.allInStreetMs : POKER_TABLE.streetMs, () => {
        void this.run(() => {
          if (this.hand !== hand) return;
          advance(hand);
          this.afterMove();
        });
      });
      this.broadcast();
      return;
    }
    const player = hand.players[hand.toAct] as HandPlayer;
    const seat = this.seats[player.seat];
    if (seat?.bot) {
      const [from, to] = POKER_TABLE.botThinkMs;
      this.setTimer(from + Math.floor(this.deps.random() * (to - from)), () => {
        void this.run(() => {
          if (this.hand !== hand || hand.toAct === null || hand.players[hand.toAct] !== player) return;
          const move = botAction(hand, this.deps.random);
          if (handAct(hand, player.id, move) !== null) handAct(hand, player.id, fallback(hand));
          this.afterMove();
        });
      });
    } else if (!seat || seat.awaySince !== null || seat.leaving) {
      this.playForAway();
      return;
    } else {
      this.setTimer(CONFIG.poker.turnSeconds * 1000, () => {
        void this.run(() => {
          if (this.hand !== hand || hand.toAct === null || hand.players[hand.toAct] !== player) return;
          handAct(hand, player.id, fallback(hand));
          this.afterMove();
        });
      });
    }
    this.broadcast();
  }

  /** The player whose turn it is isn't here (or is getting up): they check when it's free, and fold otherwise. */
  private playForAway(): void {
    const hand = this.hand;
    if (!hand || hand.toAct === null) return;
    const player = hand.players[hand.toAct] as HandPlayer;
    const seat = this.seats[player.seat];
    if (seat && !seat.bot && (seat.awaySince !== null || seat.leaving)) {
      handAct(hand, player.id, fallback(hand));
      this.afterMove();
    }
  }

  /** The hand is over: saves everyone's chips, takes the rake, lets those getting up (or out of chips) go, and deals on. */
  private async endHand(): Promise<void> {
    const hand = this.hand;
    if (!hand?.done || !hand.result) return;
    for (const p of hand.players) {
      const seat = this.seats[p.seat];
      if (seat?.id === p.id) seat.chips = p.stack;
    }
    for (const seat of this.humans()) {
      if (!seat.seatId || !hand.players.some((p) => p.id === seat.id)) continue;
      await this.deps.saveChips(seat.seatId, seat.chips).catch((err) => console.error('Could not save a poker player’s chips:', err));
    }
    if (hand.result.rake > 0) await this.deps.houseTake(this.guildId, hand.result.rake).catch((err) => console.error('Could not put poker rake in the vault:', err));
    for (const seat of [...this.seats]) {
      if (seat && (seat.leaving || seat.chips <= 0)) await this.removeSeat(seat);
    }
    this.closeIfEmpty();
    this.maybeDeal();
    this.broadcast();
  }

  // -------------------------------------------------------------------------
  // Timers, closing
  // -------------------------------------------------------------------------

  private setTimer(ms: number, run: () => void): void {
    this.clearTimer();
    this.deadline = this.deps.now() + ms;
    this.cancelTimer = this.deps.schedule(ms, run);
  }

  private clearTimer(): void {
    this.cancelTimer?.();
    this.cancelTimer = null;
    this.deadline = 0;
  }

  /** Keeps the seats' chips leased in the database while the table is open. */
  private heartbeat(): void {
    this.stopHeartbeat = this.deps.schedule(POKER_TABLE.heartbeatMs, () => {
      if (this.closed) return;
      if (this.humans().length > 0) void this.deps.renewSeats(this.key).catch((err) => console.error('Could not renew poker seats:', err));
      this.heartbeat();
    });
  }

  /** Closes the table when no member is at it (seated or watching): the bots get up with it. */
  private closeIfEmpty(): void {
    if (this.closed || this.viewers.size > 0 || this.humans().length > 0) return;
    this.closed = true;
    this.clearTimer();
    this.stopHeartbeat?.();
    this.hand = null;
    for (const seat of this.seats) {
      if (seat?.bot) void this.removeSeat(seat);
    }
    this.onEmpty(this);
  }

  // -------------------------------------------------------------------------
  // What the pages see
  // -------------------------------------------------------------------------

  /** The table as `userId` sees it. */
  view(userId: string): PokerState {
    const hand = this.hand;
    const { smallBlind, bigBlind, minBuyIn, maxBuyIn, rake, rakeCap, turnSeconds } = CONFIG.poker;
    const playerOf = (id: string): HandPlayer | undefined => hand?.players.find((p) => p.id === id);
    const seats = this.seats.map((s): SeatView | null => {
      if (!s) return null;
      const p = playerOf(s.id);
      const faceUp = p && hand && !p.folded && (hand.cardsUp || (hand.done && hand.result?.shown[p.id]));
      return {
        seat: s.seat,
        id: s.id,
        name: s.name,
        avatar: s.avatar,
        bot: s.bot,
        // In a hand (being played, or just over and not yet saved), its stack is what they have.
        chips: p ? p.stack : s.chips,
        bet: p && !hand?.done ? p.bet : 0,
        inHand: p !== undefined,
        folded: p?.folded ?? false,
        allIn: (p && !hand?.done && p.allIn) ?? false,
        cards: p && (s.id === userId || faceUp) ? p.hole : null,
        last: (p && !hand?.done && p.last) || null,
        away: s.awaySince !== null,
        leaving: s.leaving,
      };
    });
    const me = hand?.toAct !== null && hand?.toAct !== undefined ? hand.players[hand.toAct] : undefined;
    const legal = me?.id === userId && hand ? legalActions(hand) : null;
    const viewer = this.viewers.get(userId);
    const playing = hand !== null && !hand.done;
    return {
      table: this.number,
      you: userId,
      seats,
      hand: hand ? handView(hand, this.handNo) : null,
      move: legal,
      msLeft: this.deadline > 0 && (this.nextHandPending || (playing && hand?.toAct !== null)) ? Math.max(0, this.deadline - this.deps.now()) : 0,
      phase: playing ? 'playing' : this.nextHandPending ? 'next' : 'waiting',
      blinds: { small: smallBlind, big: bigBlind },
      buyIn: { min: minBuyIn, max: maxBuyIn },
      rake: { rate: rake, cap: rakeCap },
      balance: viewer?.balance ?? 0,
      canAddBot: this.seatOf(userId) !== null && !this.full,
      turnSeconds,
    };
  }

  private broadcast(): void {
    for (const [userId, viewer] of this.viewers) viewer.peer?.send({ t: 'poker', state: this.view(userId) });
  }

  /** For tests: the hand being played. */
  get currentHand(): HandState | null {
    return this.hand;
  }

  /** For tests: waits for every change queued so far. */
  settled(): Promise<void> {
    return this.queue;
  }
}

/** The hand as every page is shown it (cards aren't in it: SeatView has them, for whoever may see them). */
function handView(hand: HandState, no: number): HandView {
  const seatOf = (id: string): number => (hand.players.find((p) => p.id === id) as HandPlayer).seat;
  const result = hand.result;
  return {
    no,
    button: (hand.players[hand.button] as HandPlayer).seat,
    street: hand.street,
    board: [...hand.board],
    pot: potTotal(hand),
    toAct: hand.toAct === null ? null : (hand.players[hand.toAct] as HandPlayer).seat,
    currentBet: hand.currentBet,
    result: result
      ? {
          pots: result.pots.map((pot) => ({ amount: pot.amount, seats: pot.winners.map(seatOf), hand: pot.hand })),
          rake: result.rake,
          won: Object.fromEntries(Object.entries(result.won).map(([id, amount]) => [seatOf(id), amount])),
          shown: Object.fromEntries(Object.entries(result.shown).map(([id, shown]) => [seatOf(id), shown])),
        }
      : null,
  };
}

/** A page's move as the hand's: All in is a raise to everything they have (or a call, when that's all it comes to). Null when it can't be made. */
function toAction(hand: HandState, move: PokerMove, amount?: number): PokerAction | null {
  const legal = legalActions(hand);
  if (!legal) return null;
  switch (move) {
    case 'fold':
      return { type: 'fold' };
    case 'check':
      return { type: 'check' };
    case 'call':
      return { type: 'call' };
    case 'raise':
      return amount === undefined ? null : { type: 'raise', to: amount };
    case 'allIn':
      if (legal.raise) return { type: 'raise', to: legal.raise.max };
      return legal.call > 0 ? { type: 'call' } : { type: 'check' };
  }
}

/** What's done for a player who didn't move in time: check when it's free, fold otherwise. */
const fallback = (hand: HandState): PokerAction => (legalActions(hand)?.check ? { type: 'check' } : { type: 'fold' });

/** Every server's poker tables. */
export class PokerTables {
  private readonly tables = new Map<string, PokerTable[]>();
  /** The table each player was at last (by playerKey), to go back to while it has room. */
  private readonly lastTable = new Map<string, PokerTable>();

  constructor(readonly realDeps: PokerDeps) {}

  /** The tables open in a server. */
  in(guildId: string): readonly PokerTable[] {
    return this.tables.get(guildId) ?? [];
  }

  /**
   * Puts `player`'s page at the table they sit at, the one they were at last if it has a free seat,
   * or the first with one, opening a new table when all are full. Returns the table, and the page it
   * took over from, if any.
   */
  async join(player: Player, peer: Peer, deps: PokerDeps = this.realDeps): Promise<{ table: PokerTable; replaced: Peer | null }> {
    const open = this.tables.get(player.guildId) ?? [];
    const key = playerKey(player);
    const last = this.lastTable.get(key);
    let table =
      open.find((t) => t.seated(player.userId)) ??
      open.find((t) => t.has(player.userId)) ??
      (last && open.includes(last) && !last.full ? last : undefined) ??
      open.find((t) => !t.full);
    if (!table) {
      let number = 1;
      while (open.some((t) => t.number === number)) number++;
      const { guildId } = player;
      table = new PokerTable(guildId, number, deps, (empty) => {
        const list = this.tables.get(guildId)?.filter((t) => t !== empty) ?? [];
        if (list.length > 0) this.tables.set(guildId, list);
        else this.tables.delete(guildId);
      });
      this.tables.set(player.guildId, [...open, table].sort((a, b) => a.number - b.number));
    }
    this.lastTable.set(key, table);
    const replaced = await table.join(player, peer);
    return { table, replaced };
  }

  /** For tests: forgets every table. */
  reset(): void {
    this.tables.clear();
    this.lastTable.clear();
  }
}

export const pokerTables = new PokerTables(realPokerDeps);
