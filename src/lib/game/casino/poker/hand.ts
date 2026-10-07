import { randomInt } from 'node:crypto';
import { RANKS, SUITS, type Card } from '../blackjack.js';
import { bestHand, compareRanks, handName, type BestHand } from './rank.js';

/*
 * One hand of no-limit Texas hold'em, with no Discord, database or timers in it (the table,
 * web/games/poker/table.ts, runs hands on top of this and says when to move on). The state is
 * changed in place.
 *
 * A hand goes: blinds, two cards each, then a betting round before the flop and after the flop, the
 * turn and the river. `act` takes the move of the player whose turn it is; once a betting round is
 * over `toAct` is null and the table calls `advance` (after a pause, so everyone sees it) to deal the
 * next street, or to show down after the river. When everyone but one has folded the hand ends at
 * once; when nobody (or only one player) can still bet, the cards go face up and the table deals
 * the rest of the board street by street with `advance`.
 *
 * The betting is no-limit: a bet or raise is at least the big blind and at least the size of the
 * last full raise, and anyone can go all in. An all-in that isn't a full raise doesn't reopen the
 * betting: players who already acted may only call it or fold. Chips nobody called go back to
 * whoever put them in, the rest is split into a main pot and side pots by who put in how much, and
 * each pot goes to the best hand among the players in it (split evenly on a tie, odd chips to the
 * first winner left of the button). The house's rake comes out of the pots of a hand that saw a flop.
 */

export type Street = 'preflop' | 'flop' | 'turn' | 'river';

/** What a player did last, for the table to show. */
export type PlayerMove =
  | { type: 'blind'; amount: number }
  | { type: 'fold' }
  | { type: 'check' }
  | { type: 'call'; amount: number }
  | { type: 'bet'; to: number }
  | { type: 'raise'; to: number }
  | { type: 'allIn'; to: number };

/** A move the player whose turn it is can make. `raise` is to `to` chips in front of them this street (a bet when nobody has bet yet). */
export type PokerAction = { type: 'fold' } | { type: 'check' } | { type: 'call' } | { type: 'raise'; to: number };

export interface HandPlayer {
  id: string;
  /** Where they sit at the table. */
  seat: number;
  /** Chips behind (not yet in front of them or in the pot). */
  stack: number;
  hole: Card[];
  /** Chips in front of them this street. */
  bet: number;
  /** Chips they have put in this hand, all streets together. */
  committed: number;
  folded: boolean;
  allIn: boolean;
  /** They have acted since the last bet or raise this street. */
  acted: boolean;
  /** Facing only an all-in that wasn't a full raise since they last acted: they may call or fold, not raise. */
  raiseLocked: boolean;
  last: PlayerMove | null;
}

/** One pot, once the hand is over: who won it, and with what. */
export interface PotResult {
  amount: number;
  /** Who it went to (more than one on a split). */
  winners: string[];
  /** The winning hand in words, or null when it was won without a showdown. */
  hand: string | null;
}

export interface HandResult {
  pots: PotResult[];
  /** The house's cut of the pots. */
  rake: number;
  /** What each player won from the pots (only players who won something). */
  won: Record<string, number>;
  /** Chips nobody called, given back to whoever bet them. */
  returned: { id: string; amount: number } | null;
  /** The hands shown down: each player's two cards, their best five, and its name. */
  shown: Record<string, { best: Card[]; hand: string }>;
}

export interface HandOptions {
  small: number;
  big: number;
  /** The house's cut of a hand that saw a flop: `rate` of the pots, at most `cap`. */
  rake: { rate: number; cap: number };
}

export interface HandState {
  /** The players in the hand, in seat order. */
  players: HandPlayer[];
  /** Who has the button (an index into `players`). */
  button: number;
  options: HandOptions;
  deck: Card[];
  board: Card[];
  street: Street;
  /** Whose turn it is (an index into `players`), or null when the betting round is over. */
  toAct: number | null;
  /** The most anyone has in front of them this street: what calling comes to. */
  currentBet: number;
  /** The size of the last full bet or raise this street: the least a raise must add. */
  minRaise: number;
  /** Everyone's cards are face up: all in with the board still to come, or the showdown. */
  cardsUp: boolean;
  /** The hand is over and `result` says how it went. */
  done: boolean;
  result: HandResult | null;
}

/** A fresh deck, shuffled with the system's strong random numbers. */
export function shuffledDeck(): Card[] {
  const deck: Card[] = SUITS.flatMap((suit) => RANKS.map((rank) => ({ rank, suit })));
  for (let i = deck.length - 1; i > 0; i--) {
    const j = randomInt(0, i + 1);
    [deck[i], deck[j]] = [deck[j] as Card, deck[i] as Card];
  }
  return deck;
}

const draw = (state: HandState): Card => {
  const card = state.deck.shift();
  if (!card) throw new Error('The poker deck ran out');
  return card;
};

/** Still in the hand and able to bet: not folded, not all in. */
const canBet = (p: HandPlayer): boolean => !p.folded && !p.allIn;
/** Still in the hand (all in counts). */
export const inHand = (p: HandPlayer): boolean => !p.folded;

/** Puts `amount` of a player's chips in front of them (at most all they have). */
function put(p: HandPlayer, amount: number): number {
  const paid = Math.max(0, Math.min(amount, p.stack));
  p.stack -= paid;
  p.bet += paid;
  p.committed += paid;
  if (p.stack === 0) p.allIn = true;
  return paid;
}

/** Whether `p` still has to act this street: they can bet, and haven't answered the last bet (or not acted at all) while someone else could still bet against them. */
function needsToAct(state: HandState, p: HandPlayer): boolean {
  if (!canBet(p)) return false;
  if (p.bet < state.currentBet) return true;
  if (p.acted) return false;
  // Nobody else can bet: there is nothing left to decide.
  return state.players.some((other) => other !== p && canBet(other));
}

/** The next player after `from` (going round the table) who has to act, or null when the betting round is over. */
function nextToAct(state: HandState, from: number): number | null {
  const n = state.players.length;
  for (let i = 1; i <= n; i++) {
    const at = (from + i) % n;
    if (needsToAct(state, state.players[at] as HandPlayer)) return at;
  }
  return null;
}

/**
 * Starts a hand: posts the blinds and deals two cards to each player. `seated` are the players in
 * seat order with their stacks (at least two, every one with chips), and `button` the index of the
 * one with the button. Heads up, the button posts the small blind and acts first before the flop.
 */
export function startHand(seated: readonly { id: string; seat: number; stack: number }[], button: number, options: HandOptions, deck: Card[] = shuffledDeck()): HandState {
  if (seated.length < 2) throw new Error('A poker hand needs at least two players');
  const players: HandPlayer[] = seated.map(({ id, seat, stack }) => ({
    id,
    seat,
    stack,
    hole: [],
    bet: 0,
    committed: 0,
    folded: false,
    allIn: false,
    acted: false,
    raiseLocked: false,
    last: null,
  }));
  const n = players.length;
  const state: HandState = {
    players,
    button,
    options,
    deck,
    board: [],
    street: 'preflop',
    toAct: null,
    currentBet: options.big,
    minRaise: options.big,
    cardsUp: false,
    done: false,
    result: null,
  };
  const small = n === 2 ? button : (button + 1) % n;
  const big = (small + 1) % n;
  for (const [at, amount] of [
    [small, options.small],
    [big, options.big],
  ] as const) {
    const p = players[at] as HandPlayer;
    p.last = { type: 'blind', amount: put(p, amount) };
  }
  // Two cards each, one at a time, starting left of the button.
  for (let round = 0; round < 2; round++) for (let i = 1; i <= n; i++) (players[(button + i) % n] as HandPlayer).hole.push(draw(state));
  state.toAct = nextToAct(state, big);
  if (state.toAct === null) closeBetting(state);
  return state;
}

/** What the player whose turn it is may do. */
export interface LegalActions {
  /** Checking is free (nothing to call). */
  check: boolean;
  /** What calling costs them (all they have, when it's less), or 0 when there is nothing to call. */
  call: number;
  /** The least and most they may raise (or bet) to, counting what is in front of them this street, or null when they can't. */
  raise: { min: number; max: number } | null;
}

/** What the player whose turn it is may do, or null when it's nobody's turn. */
export function legalActions(state: HandState): LegalActions | null {
  if (state.toAct === null || state.done) return null;
  const p = state.players[state.toAct] as HandPlayer;
  const owed = Math.max(0, state.currentBet - p.bet);
  const call = Math.min(owed, p.stack);
  const max = p.bet + p.stack;
  // A raise needs chips beyond the call, the betting to be open to them, and someone left who could answer it.
  const othersCanBet = state.players.some((other) => other !== p && canBet(other));
  const canRaise = !p.raiseLocked && p.stack > owed && othersCanBet;
  return {
    check: owed === 0,
    call,
    raise: canRaise ? { min: Math.min(state.currentBet + state.minRaise, max), max } : null,
  };
}

export type ActError = 'not_your_turn' | 'cannot_check' | 'nothing_to_call' | 'cannot_raise' | 'bad_amount';

/** Makes `id`'s move, if it's their turn and they may. Null when it was made; why not otherwise. */
export function act(state: HandState, id: string, action: PokerAction): ActError | null {
  const at = state.toAct;
  const p = at === null ? undefined : state.players[at];
  if (at === null || !p || p.id !== id || state.done) return 'not_your_turn';
  const legal = legalActions(state) as LegalActions;

  switch (action.type) {
    case 'fold':
      p.folded = true;
      p.last = { type: 'fold' };
      break;
    case 'check':
      if (!legal.check) return 'cannot_check';
      p.last = { type: 'check' };
      break;
    case 'call': {
      if (legal.call <= 0) return 'nothing_to_call';
      const paid = put(p, legal.call);
      p.last = p.allIn ? { type: 'allIn', to: p.bet } : { type: 'call', amount: paid };
      break;
    }
    case 'raise': {
      if (!legal.raise) return 'cannot_raise';
      const to = action.to;
      if (!Number.isSafeInteger(to) || to < legal.raise.min || to > legal.raise.max) return 'bad_amount';
      const opening = state.currentBet === 0;
      const raisedBy = to - state.currentBet;
      put(p, to - p.bet);
      if (raisedBy >= state.minRaise) {
        // A full raise: everyone has to answer it, and may raise again.
        state.minRaise = raisedBy;
        for (const other of state.players) {
          if (other === p) continue;
          other.acted = false;
          other.raiseLocked = false;
        }
      } else {
        // An all-in short of a full raise: those who already acted have to answer it, but may not raise.
        for (const other of state.players) {
          if (other === p || !other.acted) continue;
          other.acted = false;
          other.raiseLocked = true;
        }
      }
      state.currentBet = to;
      p.last = p.allIn ? { type: 'allIn', to } : { type: opening ? 'bet' : 'raise', to };
      break;
    }
  }
  p.acted = true;
  p.raiseLocked = false;

  if (state.players.filter(inHand).length === 1) {
    finish(state, false);
    return null;
  }
  state.toAct = nextToAct(state, at);
  if (state.toAct === null) closeBetting(state);
  return null;
}

/**
 * Folds `id`'s hand whenever it is (they stood up from the table): on their turn it is their move;
 * otherwise their cards are simply out, and the hand goes on without them. Does nothing once they
 * have folded or the hand is over.
 */
export function forfeit(state: HandState, id: string): void {
  const at = state.players.findIndex((p) => p.id === id);
  const p = state.players[at];
  if (!p || p.folded || state.done) return;
  if (state.toAct === at) {
    act(state, id, { type: 'fold' });
    return;
  }
  p.folded = true;
  p.last = { type: 'fold' };
  if (state.players.filter(inHand).length === 1) {
    finish(state, false);
    return;
  }
  // They may have been the last one the betting was waiting to hear from, or the last one who could still bet.
  if (state.toAct !== null && !needsToAct(state, state.players[state.toAct] as HandPlayer)) {
    state.toAct = nextToAct(state, state.toAct);
    if (state.toAct === null) closeBetting(state);
  } else if (state.toAct === null) {
    closeBetting(state);
  }
}

/** A betting round is over: with nobody left who can bet against anyone, the cards go face up for the rest of the board. */
function closeBetting(state: HandState): void {
  if (state.players.filter(canBet).length <= 1) state.cardsUp = true;
}

/**
 * Moves the hand on once a betting round is over (`toAct` null): deals the next street and starts
 * its betting, or (after the river) shows down. Does nothing while someone still has to act, or
 * once the hand is over.
 */
export function advance(state: HandState): void {
  if (state.done || state.toAct !== null) return;
  for (const p of state.players) {
    p.bet = 0;
    p.acted = false;
    p.raiseLocked = false;
    // What they did last street is old news (folds and all-ins stay to see).
    if (p.last && p.last.type !== 'fold' && p.last.type !== 'allIn') p.last = null;
  }
  state.currentBet = 0;
  state.minRaise = state.options.big;

  if (state.street === 'river') {
    finish(state, true);
    return;
  }
  draw(state); // the burn card
  if (state.street === 'preflop') {
    state.board.push(draw(state), draw(state), draw(state));
    state.street = 'flop';
  } else {
    state.board.push(draw(state));
    state.street = state.street === 'flop' ? 'turn' : 'river';
  }
  state.toAct = state.cardsUp ? null : nextToAct(state, state.button);
  if (state.toAct === null) closeBetting(state);
}

/** The pots, by who put in how much: the main pot, then each side pot. Each lists who can win it (players who didn't fold and put in at least that much). */
export function buildPots(players: readonly HandPlayer[]): { amount: number; eligible: string[] }[] {
  const levels = [...new Set(players.map((p) => p.committed).filter((c) => c > 0))].sort((a, b) => a - b);
  const pots: { amount: number; eligible: string[] }[] = [];
  let previous = 0;
  // Chips from a level nobody still in the hand reached, before any pot: they go in the next one.
  let carry = 0;
  for (const level of levels) {
    const amount = players.reduce((sum, p) => sum + Math.max(0, Math.min(p.committed, level) - previous), 0) + carry;
    const eligible = players.filter((p) => !p.folded && p.committed >= level).map((p) => p.id);
    previous = level;
    carry = 0;
    if (amount <= 0) continue;
    const last = pots[pots.length - 1];
    // Nobody left to win it (only folded players put that much in), or the same players as the pot before: one pot.
    if (last && (eligible.length === 0 || eligible.join() === last.eligible.join())) last.amount += amount;
    else if (eligible.length === 0) carry = amount;
    else pots.push({ amount, eligible });
  }
  return pots;
}

/** Every chip in the hand: the pots and what's in front of the players. */
export const potTotal = (state: HandState): number => state.players.reduce((sum, p) => sum + p.committed, 0);

/** Ends the hand: gives back what nobody called, takes the rake, and pays out each pot. */
function finish(state: HandState, showdown: boolean): void {
  state.done = true;
  state.toAct = null;
  const { players } = state;

  // Chips nobody called go back to whoever put them in (a folded player's stay in the pot).
  let returned: HandResult['returned'] = null;
  const top = [...players].sort((a, b) => b.committed - a.committed);
  const [first, second] = top;
  if (first && second && !first.folded && first.committed > second.committed) {
    const amount = first.committed - second.committed;
    first.committed -= amount;
    first.bet = Math.max(0, first.bet - amount);
    first.stack += amount;
    returned = { id: first.id, amount };
  }

  const pots = buildPots(players);
  // No flop, no rake.
  let rake = 0;
  if (state.board.length >= 3 && state.options.rake.rate > 0) {
    const total = pots.reduce((sum, pot) => sum + pot.amount, 0);
    rake = Math.min(state.options.rake.cap, Math.floor(total * state.options.rake.rate));
    let left = rake;
    for (const pot of pots) {
      const take = Math.min(left, pot.amount);
      pot.amount -= take;
      left -= take;
    }
  }

  // Seat order starting left of the button: who gets an odd chip first.
  const order = players.map((_, i) => players[(state.button + 1 + i) % players.length] as HandPlayer);
  const won: Record<string, number> = {};
  const shown: HandResult['shown'] = {};
  const best = new Map<string, BestHand>();
  if (showdown) {
    state.cardsUp = true;
    for (const p of players.filter(inHand)) {
      const hand = bestHand([...p.hole, ...state.board]);
      best.set(p.id, hand);
      shown[p.id] = { best: hand.cards, hand: handName(hand.rank) };
    }
  }

  const results: PotResult[] = [];
  for (const pot of pots) {
    let winners: string[];
    let hand: string | null = null;
    if (!showdown || pot.eligible.length === 1) {
      winners = pot.eligible.length > 0 ? [pot.eligible[0] as string] : [];
    } else {
      let top: BestHand | null = null;
      winners = [];
      for (const id of pot.eligible) {
        const h = best.get(id) as BestHand;
        const d = top ? compareRanks(h.rank, top.rank) : 1;
        if (d > 0) {
          top = h;
          winners = [id];
        } else if (d === 0) {
          winners.push(id);
        }
      }
      hand = top ? handName(top.rank) : null;
    }
    if (winners.length === 0 || pot.amount <= 0) {
      if (pot.amount > 0) results.push({ amount: pot.amount, winners, hand });
      continue;
    }
    const share = Math.floor(pot.amount / winners.length);
    let odd = pot.amount - share * winners.length;
    for (const p of order) {
      if (!winners.includes(p.id)) continue;
      const amount = share + (odd > 0 ? 1 : 0);
      if (odd > 0) odd--;
      p.stack += amount;
      won[p.id] = (won[p.id] ?? 0) + amount;
    }
    results.push({ amount: pot.amount, winners, hand });
  }
  state.result = { pots: results, rake, won, returned, shown };
}
