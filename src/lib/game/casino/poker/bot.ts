import { RANKS, SUITS, type Card } from '../blackjack.js';
import { inHand, legalActions, potTotal, type HandPlayer, type HandState, type PokerAction } from './hand.js';
import { bestHand, cardValue, compareRanks } from './rank.js';

/*
 * The poker bots' play. A bot works out how often its hand wins against the players still in (by
 * dealing out the unknown cards at random many times over), and weighs that against the price of
 * calling: strong hands bet and raise, hands worth the price call, the rest check or fold. It only
 * ever sees its own cards, the board, and what everyone at the table could see.
 *
 * On top of that it plays as a person does:
 * - Before the flop it opens with the better starting hands, more of them the fewer players are
 *   left to act behind it, completes or limps now and then, and goes all in or folds when short.
 * - It bluffs where a bluff makes sense: a continuation bet on the flop after raising before it, a
 *   bet when everyone has checked to it last, a stab at a river that brought draws in, and bets or
 *   raises with a flush or open-ended straight draw (a semi-bluff). Fewer the more players are in,
 *   and fewer against players who don't fold.
 * - Its bets are a few sizes of the pot, picked at random the same way whatever it holds (bigger on
 *   a board with draws about), so the size doesn't give its hand away. A bet that would put in most
 *   of what it has left is all in.
 * - With a very strong hand it sometimes checks, to raise whoever bets into it.
 * - It reads the betting: a player who has bet or raised this hand is dealt, in those deals, only
 *   from the better starting hands (RAISER_RANGE: fewer the more they raised before the flop), and
 *   one who has bet after the flop mostly a hand that hit the board (Range.board), so raising again
 *   and again doesn't talk it into calling with a hand that only beats a random one.
 * - It remembers how each player has played at the table (PokerReads): one caught bluffing, or who
 *   bets a lot, is given more hands when they bet; one who only plays good hands, fewer; and one who
 *   folds a lot is bluffed more.
 * - Each bot has a style of its own (BotStyle), picked when it sits down: some play more hands,
 *   some bet more, some bluff more.
 */

/** How many deals to simulate when working out a hand's chances. */
export const EQUITY_TRIALS = 300;

/**
 * The share of starting hands (the best ones) a player is taken to hold, by how many times they bet
 * or raised before the flop (the last for that many or more): any hand, then the best 30%, 12% and 5%.
 */
export const RAISER_RANGE = [1, 0.3, 0.12, 0.05] as const;

/**
 * The share of starting hands (the best ones) a bot opens with before the flop when nobody has
 * raised, by how many players are still to act behind it (the last for that many or more).
 */
export const OPEN_RANGE = [0.6, 0.5, 0.4, 0.3, 0.22, 0.17, 0.14] as const;

/** How many times a deal tries for a hand in a player's range before taking the last one it drew. */
const RANGE_TRIES = 60;

/**
 * What a player is taken to hold. `start`: the share of the best starting hands (1: any). `board`:
 * how well it has hit the board, having bet after the flop: 0 anything, 1 a pair or better (with
 * one of its own cards) or a flush draw, 2 top pair or better or a flush draw. `bluffs`: how often
 * they bet without that (the deal skips `board` that often).
 */
export interface Range {
  start: number;
  board: 0 | 1 | 2;
  bluffs: number;
}

/** How often a player is taken to bet after the flop without having hit the board, before the table has caught them at it. */
const BLUFF_RATE = 0.2;

/** How often a player is taken to fold to a bet, before the table has seen them face any. */
const FOLD_RATE = 0.45;

/** At most this many big blinds behind before the flop, a bot goes all in or folds. */
const SHORT_STACK = 10;

const sameCard = (a: Card, b: Card): boolean => a.rank === b.rank && a.suit === b.suit;
const clamp = (n: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, n));

/** A card's points in the Chen formula: A 10, K 8, Q 7, J 6, and half its value below that. */
const chenPoints = (value: number): number => (value === 14 ? 10 : value === 13 ? 8 : value === 12 ? 7 : value === 11 ? 6 : value / 2);

/** How good two cards are to start with, by the Chen formula (AA 20 down to 72 offsuit -1). */
export function chenScore(a: Card, b: Card): number {
  const hi = Math.max(cardValue(a), cardValue(b));
  const lo = Math.min(cardValue(a), cardValue(b));
  if (hi === lo) return Math.max(5, chenPoints(hi) * 2);
  const gap = hi - lo - 1;
  let score = chenPoints(hi) - ([0, 1, 2, 4][gap] ?? 5);
  if (a.suit === b.suit) score += 2;
  if (gap <= 1 && hi < 12) score++;
  return Math.ceil(score);
}

/** By Chen score: the share of the 1,326 starting hands that score higher. */
const BETTER_SHARE: ReadonlyMap<number, number> = (() => {
  const deck = SUITS.flatMap((suit) => RANKS.map((rank) => ({ rank, suit }) as Card));
  const scores: number[] = [];
  for (let i = 0; i < deck.length; i++) for (let j = i + 1; j < deck.length; j++) scores.push(chenScore(deck[i] as Card, deck[j] as Card));
  const share = new Map<number, number>();
  for (const s of new Set(scores)) share.set(s, scores.filter((other) => other > s).length / scores.length);
  return share;
})();

/** Whether two cards are among the best `range` (0 to 1) of starting hands. */
const inRange = (a: Card, b: Card, range: number): boolean => range >= 1 || (BETTER_SHARE.get(chenScore(a, b)) ?? 0) < range;

/** Whether two cards have hit `board` at least as well as `level` (Range.board). */
function hits(a: Card, b: Card, board: readonly Card[], level: 0 | 1 | 2): boolean {
  if (level === 0 || board.length < 3) return true;
  const va = cardValue(a);
  const vb = cardValue(b);
  const values = board.map(cardValue);
  const top = Math.max(...values);
  const onBoard = (v: number) => values.includes(v);
  // A flush draw (or a flush) with one of its own cards, while there are cards to come.
  if (board.length < 5) {
    const suited = (suit: string) => board.filter((c) => c.suit === suit).length + (a.suit === suit ? 1 : 0) + (b.suit === suit ? 1 : 0);
    if (suited(a.suit) >= 4 || suited(b.suit) >= 4) return true;
  }
  // Two pair or better with both its cards, or a set.
  if ((onBoard(va) && onBoard(vb)) || (va === vb && onBoard(va))) return true;
  if (level === 1) return onBoard(va) || onBoard(vb) || va === vb;
  // Top pair, or a pair above the board.
  return va === top || vb === top || (va === vb && va > top);
}

/**
 * How often `hole` wins against the other players' hands with `board` (0 to 5 cards) dealt out the
 * rest of the way, as a share from 0 to 1 (a split counts as its share). `opponents` is how many
 * there are, holding any two cards, or each one's range: the share of the best starting hands they
 * may hold (1: any), or a Range. `random` gives numbers from 0 up to 1.
 */
export function estimateEquity(
  hole: readonly Card[],
  board: readonly Card[],
  opponents: number | readonly (number | Range)[],
  random: () => number = Math.random,
  trials = EQUITY_TRIALS,
): number {
  const ranges: Range[] = (typeof opponents === 'number' ? Array.from({ length: Math.max(0, opponents) }, () => 1) : opponents).map((r) =>
    typeof r === 'number' ? { start: r, board: 0, bluffs: 0 } : r,
  );
  if (ranges.length === 0) return 1;
  const known = [...hole, ...board];
  const unseen = SUITS.flatMap((suit) => RANKS.map((rank) => ({ rank, suit }) as Card)).filter((c) => !known.some((k) => sameCard(c, k)));
  let score = 0;
  for (let t = 0; t < trials; t++) {
    // A partial shuffle: just the cards this deal needs, off the top. The players' hands first (a
    // hand outside its player's range goes back and another is drawn), then the board.
    const deck = [...unseen];
    let top = 0;
    const draw = (): Card => {
      const j = top + Math.floor(random() * (deck.length - top));
      [deck[top], deck[j]] = [deck[j] as Card, deck[top] as Card];
      return deck[top++] as Card;
    };
    const hands = ranges.map((range) => {
      const level = range.board > 0 && random() >= range.bluffs ? range.board : 0;
      for (let tries = 1; ; tries++) {
        const pair = [draw(), draw()] as const;
        if (tries >= RANGE_TRIES || (inRange(pair[0], pair[1], range.start) && hits(pair[0], pair[1], board, level))) return pair;
        top -= 2;
      }
    });
    const fullBoard = [...board];
    while (fullBoard.length < 5) fullBoard.push(draw());
    const mine = bestHand([...hole, ...fullBoard]).rank;
    let beaten = false;
    let tied = 0;
    for (const [a, b] of hands) {
      const theirs = bestHand([a, b, ...fullBoard]).rank;
      const d = compareRanks(mine, theirs);
      if (d < 0) {
        beaten = true;
        break;
      }
      if (d === 0) tied++;
    }
    if (!beaten) score += 1 / (tied + 1);
  }
  return score / trials;
}

// ---------------------------------------------------------------------------
// The board, and draws
// ---------------------------------------------------------------------------

/** Card values for straights: an ace counts high and low. */
function straightValues(cards: readonly Card[]): Set<number> {
  const values = new Set(cards.map(cardValue));
  if (values.has(14)) values.add(1);
  return values;
}

/** Whether five values in a row are all in `values`. */
function hasStraight(values: ReadonlySet<number>): boolean {
  for (let high = 5; high <= 14; high++) {
    let run = 0;
    while (run < 5 && values.has(high - run)) run++;
    if (run === 5) return true;
  }
  return false;
}

/** How the board looks to someone deciding how much to fear it. */
export interface Texture {
  /** How many of its cards share its commonest suit. */
  suited: number;
  /** Two of its cards have the same value. */
  paired: boolean;
  /** The most of its cards within a straight's reach (five values in a row). */
  connected: number;
  /** How full of draws (or made flushes and straights) it is, from 0 (none) to 1. */
  wet: number;
}

export function texture(board: readonly Card[]): Texture {
  const suits = new Map<string, number>();
  for (const card of board) suits.set(card.suit, (suits.get(card.suit) ?? 0) + 1);
  const suited = Math.max(0, ...suits.values());
  const values = straightValues(board);
  let connected = 0;
  for (let low = 1; low <= 10; low++) {
    let n = 0;
    for (let v = low; v < low + 5; v++) if (values.has(v)) n++;
    connected = Math.max(connected, n);
  }
  const drawsLeft = board.length < 5;
  const wet = (suited >= 3 ? 0.5 : suited === 2 && drawsLeft ? 0.25 : 0) + (connected >= 3 ? 0.4 : connected === 2 && drawsLeft ? 0.15 : 0);
  return { suited, paired: new Set(board.map(cardValue)).size < board.length, connected, wet: Math.min(1, wet) };
}

/**
 * The draws `hole` has on `board` with cards still to come: to a flush (four of a suit, one of them
 * its own), and how many values would make it a straight it doesn't have (2 open-ended, 1 a
 * gutshot), not counting ones that would make the straight on the board alone.
 */
export function draws(hole: readonly Card[], board: readonly Card[]): { flush: boolean; straight: number } {
  if (board.length < 3 || board.length >= 5) return { flush: false, straight: 0 };
  const all = [...hole, ...board];
  const flush = SUITS.some((suit) => all.filter((c) => c.suit === suit).length === 4 && hole.some((c) => c.suit === suit));
  const mine = straightValues(all);
  const theirs = straightValues(board);
  let straight = 0;
  if (!hasStraight(mine)) {
    for (let v = 2; v <= 14; v++) {
      if (mine.has(v)) continue;
      const add = (set: ReadonlySet<number>) => new Set([...set, v, ...(v === 14 ? [1] : [])]);
      if (hasStraight(add(mine)) && !hasStraight(add(theirs))) straight++;
    }
  }
  return { flush, straight };
}

// ---------------------------------------------------------------------------
// Styles and reads
// ---------------------------------------------------------------------------

/** A bot's own way of playing, picked when it sits down, so no two play quite alike. 1 is the average bot. */
export interface BotStyle {
  /** How many hands it plays: wider opening ranges and lighter calls above 1. */
  loose: number;
  /** How often it bets and raises a good hand rather than checking and calling. */
  aggressive: number;
  /** How often it bluffs. */
  bluffs: number;
}

export const PLAIN_STYLE: BotStyle = { loose: 1, aggressive: 1, bluffs: 1 };

/** A style for a bot sitting down. `random` gives numbers from 0 up to 1. */
export function randomStyle(random: () => number = Math.random): BotStyle {
  const pick = (lo: number, hi: number) => Math.round((lo + random() * (hi - lo)) * 100) / 100;
  return { loose: pick(0.75, 1.35), aggressive: pick(0.75, 1.35), bluffs: pick(0.5, 1.7) };
}

/** What a table has seen of one player. */
interface Read {
  /** Hands dealt to them. */
  hands: number;
  /** Hands they put chips in before the flop of their own accord (called or raised, the blinds aside). */
  played: number;
  /** Times they had a bet to answer, and how many of those they folded. */
  faced: number;
  folded: number;
  /** Moves made, and how many of them were bets and raises. */
  moves: number;
  bets: number;
  /** Showdowns after they bet or raised on the river, and how many of those they had nothing at (a bluff). */
  riverBets: number;
  bluffs: number;
}

/** A share seen so far, pulled toward `prior` while there's little to go on (as if `weight` more had been seen at it). */
const shrunk = (count: number, total: number, prior: number, weight: number): number => (count + prior * weight) / (total + weight);

/** Whether a hand shown down is nothing: high card, or no better than the board on its own. */
function nothing(hole: readonly Card[], board: readonly Card[]): boolean {
  const mine = bestHand([...hole, ...board]).rank;
  return mine.category === 0 || compareRanks(mine, bestHand(board).rank) === 0;
}

/** What `p` is taken to hold from their bets this hand alone: before the flop (RAISER_RANGE), and after it. */
export function rangeOf(p: HandPlayer, bluffs = BLUFF_RATE): Range {
  return {
    start: RAISER_RANGE[clamp(p.raises - p.postflopRaises, 0, RAISER_RANGE.length - 1)] as number,
    board: Math.min(2, p.postflopRaises) as 0 | 1 | 2,
    bluffs,
  };
}

/**
 * How the players at one table have played, as the bots there remember it: only what everyone at
 * the table saw (the moves made, and the cards shown down). The table tells it about each hand
 * dealt (`dealt`), each move before it's made (`saw`) and each hand's end (`handOver`).
 */
export class PokerReads {
  private readonly players = new Map<string, Read>();
  /** This hand: who has put chips in before the flop of their own accord, and who bet or raised on the river. */
  private readonly played = new Set<string>();
  private readonly riverBet = new Set<string>();

  private of(id: string): Read {
    let read = this.players.get(id);
    if (!read) {
      read = { hands: 0, played: 0, faced: 0, folded: 0, moves: 0, bets: 0, riverBets: 0, bluffs: 0 };
      this.players.set(id, read);
    }
    return read;
  }

  /** A hand has been dealt. */
  dealt(state: HandState): void {
    this.played.clear();
    this.riverBet.clear();
    for (const p of state.players) this.of(p.id).hands++;
  }

  /** `id` is about to make `action` on their turn (before it's made, so what they faced is still there to see). */
  saw(state: HandState, id: string, action: PokerAction): void {
    const legal = legalActions(state);
    if (!legal || state.toAct === null || state.players[state.toAct]?.id !== id) return;
    const read = this.of(id);
    if (legal.call > 0) {
      read.faced++;
      if (action.type === 'fold') read.folded++;
    }
    read.moves++;
    if (action.type === 'raise') read.bets++;
    if (state.street === 'preflop' && (action.type === 'call' || action.type === 'raise') && !this.played.has(id)) {
      this.played.add(id);
      read.played++;
    }
    if (state.street === 'river' && action.type === 'raise') this.riverBet.add(id);
  }

  /** The hand is over: a river bet shown down with nothing was a bluff. */
  handOver(state: HandState): void {
    const shown = state.result?.shown ?? {};
    for (const id of this.riverBet) {
      const p = state.players.find((player) => player.id === id);
      if (!p || !shown[id] || state.board.length < 5) continue;
      const read = this.of(id);
      read.riverBets++;
      if (nothing(p.hole, state.board)) read.bluffs++;
    }
  }

  /**
   * What `p` is taken to hold (rangeOf), in the light of how they've played: a player who bets a
   * lot, or has been caught bluffing, is given more starting hands and bluffs; one who called before
   * the flop, the share of hands they play.
   */
  range(p: HandPlayer): Range {
    const read = this.of(p.id);
    const bluffs = shrunk(read.bluffs, read.riverBets, BLUFF_RATE, 4);
    const range = rangeOf(p, bluffs);
    if (p.raises - p.postflopRaises > 0) {
      const aggression = shrunk(read.bets, read.moves, 0.25, 10) / 0.25;
      range.start = Math.min(1, range.start * clamp(aggression * Math.sqrt(bluffs / BLUFF_RATE), 0.5, 3));
    } else if (this.played.has(p.id)) {
      range.start = clamp(shrunk(read.played, read.hands, 0.4, 10), 0.12, 1);
    }
    return range;
  }

  /** How often `id` folds to a bet. */
  foldRate(id: string): number {
    const read = this.players.get(id);
    return read ? shrunk(read.folded, read.faced, FOLD_RATE, 8) : FOLD_RATE;
  }
}

// ---------------------------------------------------------------------------
// The bot's move
// ---------------------------------------------------------------------------

/** Rounds a raise to a tidy number of big blinds (or the nearest whole chip below one), kept within what's allowed. */
function tidy(to: number, big: number, min: number, max: number): number {
  const step = big >= 10 ? big / 2 : 1;
  return Math.max(min, Math.min(max, Math.round(to / step) * step));
}

/** Whether the player at `at` acts last after the flop among those who can still bet (nearest the button). */
function inPosition(state: HandState, at: number): boolean {
  const n = state.players.length;
  const order = (i: number) => (i - state.button - 1 + n) % n;
  return state.players.every((p, i) => i === at || p.folded || p.allIn || order(i) < order(at));
}

/** What the bot knows besides the hand: its own style, and the table's reads on the players. */
export interface BotMind {
  style?: BotStyle;
  reads?: PokerReads;
}

/**
 * The move for the bot whose turn it is. `random` gives numbers from 0 up to 1 (for tests to fix);
 * it drives both the simulated deals and the bot's whims.
 */
export function botAction(state: HandState, random: () => number = Math.random, mind: BotMind = {}): PokerAction {
  const legal = legalActions(state);
  if (!legal || state.toAct === null) return { type: 'check' };
  const at = state.toAct;
  const me = state.players[at] as HandPlayer;
  const style = mind.style ?? PLAIN_STYLE;
  const { reads } = mind;
  const others = state.players.filter((p) => p !== me && inHand(p));
  const ranges = others.map((p) => (reads ? reads.range(p) : rangeOf(p)));
  const equity = estimateEquity(me.hole, state.board, ranges, random);
  const pot = potTotal(state);
  const toCall = legal.call;
  const facing = toCall > 0;
  const big = state.options.big;
  const preflop = state.street === 'preflop';
  const board = texture(state.board);
  const position = inPosition(state, at);
  // What a call would win, against what it costs: the share of the pot it has to win to pay.
  const price = facing ? toCall / (pot + toCall) : 0;
  // How much better than an even share of the pot this hand is (1: average among the players in).
  const edge = equity * (others.length + 1);
  // How likely everyone still in is to fold to a bet: whether a bluff can work.
  const allFold = others.reduce((all, p) => all * (p.allIn ? 0 : (reads?.foldRate(p.id) ?? FOLD_RATE)), 1);
  const chance = (p: number): boolean => random() < p;

  const check: PokerAction = { type: 'check' };
  const call: PokerAction = { type: 'call' };
  const fold: PokerAction = { type: 'fold' };
  const allIn = (): PokerAction => (legal.raise ? { type: 'raise', to: legal.raise.max } : facing ? call : check);
  /** A bet or raise to about `to`: all in when that would put in more than half of what it has left. */
  const raiseTo = (to: number): PokerAction => {
    if (!legal.raise) return facing ? call : check;
    const { min, max } = legal.raise;
    const tidied = tidy(to, big, min, max);
    return { type: 'raise', to: tidied - me.bet > me.stack / 2 ? max : tidied };
  };
  /**
   * A bet or raise the same size whatever it holds. Before the flop: an open to 2.5 to 3.5 big
   * blinds (one more for each player who just called), or three times a raise (a little more out of
   * position). After it: a third of the pot to the whole pot, bigger on a board with draws about.
   */
  const bet = (): PokerAction => {
    if (preflop) {
      if (state.currentBet <= big) {
        const limpers = others.filter((p) => p.last?.type === 'call').length;
        return raiseTo(big * (2.5 + random() + limpers));
      }
      return raiseTo(state.currentBet * (position ? 3 : 3.5));
    }
    const sizes = board.wet >= 0.5 ? [0.5, 0.66, 0.75, 1] : [0.33, 0.5, 0.66, 0.75];
    const share = sizes[Math.floor(random() * sizes.length)] as number;
    return raiseTo(state.currentBet + share * (pot + toCall));
  };

  // Short before the flop: all in or out, as anyone would. Into a raise, with a hand worth the price.
  if (preflop && me.stack + me.bet <= big * SHORT_STACK) {
    const raised = state.currentBet > big;
    if (raised ? equity >= price + 0.03 : edge > 1.15 / style.loose) return allIn();
    return legal.check ? check : fold;
  }

  // Nobody has raised before the flop: open with the better hands, more of them the fewer are still
  // to act behind it, now and then just calling (with a big hand too, to trap); limp or complete
  // the small blind now and then with a hand nearly good enough.
  if (preflop && state.currentBet <= big) {
    const behind = others.filter((p) => !p.allIn && !p.acted).length;
    const open = Math.min(1, (OPEN_RANGE[Math.min(behind, OPEN_RANGE.length - 1)] as number) * style.loose);
    const [a, b] = me.hole as [Card, Card];
    if (inRange(a, b, open)) {
      if (legal.raise && chance(0.9)) return bet();
      return legal.check ? check : call;
    }
    if (legal.check) return legal.raise && chance(0.08 * style.bluffs) ? bet() : check;
    if (toCall <= big && inRange(a, b, open * 1.6) && chance(0.35 * style.loose)) return call;
    return fold;
  }

  const monster = equity > 0.8 || (edge > 2.2 && equity > 0.55);
  const strong = equity > 0.62 || edge > 1.7;
  const draw = draws(me.hole, state.board);
  // The draws worth betting: to a flush, or to either end of a straight (not a gutshot).
  const drawing = draw.flush || draw.straight >= 2;

  if (legal.raise) {
    // A very strong hand bets and raises, but now and then checks to raise whoever bets into it
    // (not on the river, with nothing left to come, nor on a board full of draws).
    if (monster) {
      if (!facing && !preflop && state.street !== 'river' && board.wet < 0.5 && chance(0.3)) return check;
      return bet();
    }
    if (strong && chance(0.7 * style.aggressive)) return bet();
    // A semi-bluff: a big draw bets (or raises), to win now or make the hand later.
    if (drawing && chance((facing ? 0.2 : 0.4) * style.aggressive * (0.5 + allFold))) return bet();
    // A light three-bet now and then, in position, with a hand that isn't worth calling but isn't junk.
    if (preflop && facing && position && toCall <= me.stack * 0.15 && chance(0.05 * style.bluffs)) {
      const [a, b] = me.hole as [Card, Card];
      if (inRange(a, b, 0.35)) return bet();
    }
    // A bluff, where one makes sense, and less where the others won't fold.
    let bluff: number;
    if (facing) bluff = toCall <= big * 2 ? 0.04 : 0;
    else if (preflop) bluff = 0;
    else if (me.raises > 0 && others.every((p) => p.raises === 0) && state.street === 'flop') bluff = 0.6;
    else if (position && others.every((p) => p.allIn || p.last?.type === 'check')) bluff = 0.35;
    else if (state.street === 'river' && board.wet >= 0.5) bluff = 0.15;
    else bluff = 0.05;
    if (chance(Math.min(0.9, bluff * style.bluffs * (allFold / FOLD_RATE)))) return bet();
  }
  if (legal.check) return check;
  // Worth the price, with a little room (less for a looser bot). A big draw counts what it would
  // win when it hits as well (if it isn't all in for it). What it already put in is gone either
  // way, so it never calls short of the price to protect it (chips in steps, then a shove, would
  // get it to call anything).
  const implied = drawing && state.street !== 'river' && toCall < me.stack ? 0.06 : 0;
  if (equity + implied >= price + 0.04 / style.loose) return call;
  // A cheap look now and then.
  if (toCall <= big * 2 && chance(0.08 * style.loose)) return call;
  return fold;
}
