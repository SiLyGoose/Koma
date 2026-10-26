import { RANKS, SUITS, type Card } from '../blackjack.js';
import { inHand, legalActions, potTotal, type HandPlayer, type HandState, type PokerAction } from './hand.js';
import { bestHand, cardValue, compareRanks } from './rank.js';

/*
 * The poker bots' play: a simple, honest strategy. A bot works out how often its hand wins against
 * the players still in (by dealing out the unknown cards at random many times over), and weighs
 * that against the price of calling: strong hands bet and raise, hands worth the price call, the
 * rest check or fold. A little randomness (the odd bluff, the odd loose call) keeps it from being
 * read like a book. It only ever sees its own cards and the board.
 *
 * It does read the betting: a player who has bet or raised this hand is dealt, in those deals, only
 * from the better starting hands (RAISER_RANGE: fewer the more they raised), so raising again and
 * again doesn't talk it into calling with a hand that only beats a random one.
 */

/** How many deals to simulate when working out a hand's chances. */
export const EQUITY_TRIALS = 300;

/**
 * The share of starting hands (the best ones) a player is taken to hold, by how many times they bet
 * or raised this hand (the last for that many or more): any hand, then the best 30%, 12% and 5%.
 */
export const RAISER_RANGE = [1, 0.3, 0.12, 0.05] as const;

/** How many times a deal tries for a hand in a player's range before taking the last one it drew. */
const RANGE_TRIES = 40;

const sameCard = (a: Card, b: Card): boolean => a.rank === b.rank && a.suit === b.suit;

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

/**
 * How often `hole` wins against the other players' hands with `board` (0 to 5 cards) dealt out the
 * rest of the way, as a share from 0 to 1 (a split counts as its share). `opponents` is how many
 * there are, holding any two cards, or each one's range: the share of the best starting hands they
 * may hold (1: any). `random` gives numbers from 0 up to 1.
 */
export function estimateEquity(hole: readonly Card[], board: readonly Card[], opponents: number | readonly number[], random: () => number = Math.random, trials = EQUITY_TRIALS): number {
  const ranges = typeof opponents === 'number' ? Array.from({ length: Math.max(0, opponents) }, () => 1) : opponents;
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
      for (let tries = 1; ; tries++) {
        const pair = [draw(), draw()] as const;
        if (tries >= RANGE_TRIES || inRange(pair[0], pair[1], range)) return pair;
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

/** Rounds a raise to a tidy number of big blinds (or the nearest whole chip below one), kept within what's allowed. */
function tidy(to: number, big: number, min: number, max: number): number {
  const step = big >= 10 ? big / 2 : 1;
  return Math.max(min, Math.min(max, Math.round(to / step) * step));
}

/**
 * The move for the bot whose turn it is. `random` gives numbers from 0 up to 1 (for tests to fix);
 * it drives both the simulated deals and the bot's whims.
 */
export function botAction(state: HandState, random: () => number = Math.random): PokerAction {
  const legal = legalActions(state);
  if (!legal || state.toAct === null) return { type: 'check' };
  const me = state.players[state.toAct] as HandPlayer;
  const others = state.players.filter((p) => p !== me && inHand(p));
  const opponents = others.length;
  const ranges = others.map((p) => RAISER_RANGE[Math.min(p.raises, RAISER_RANGE.length - 1)] as number);
  const equity = estimateEquity(me.hole, state.board, ranges, random);
  const pot = potTotal(state);
  const toCall = legal.call;
  const big = state.options.big;
  // What a call would win, against what it costs: the share of the pot it has to win to pay.
  const price = toCall > 0 ? toCall / (pot + toCall) : 0;
  // How much better than an even share of the pot this hand is (1: average among the players in).
  const edge = equity * (opponents + 1);
  const whim = random();

  if (legal.raise) {
    const { min, max } = legal.raise;
    const monster = equity > 0.8 || (edge > 2.2 && equity > 0.55);
    const strong = equity > 0.62 || edge > 1.7;
    const bluff = whim < 0.04 && toCall <= big * 2;
    if (monster && whim < 0.25) return { type: 'raise', to: max };
    if (monster || (strong && whim < 0.7) || bluff) {
      // Bigger with a better hand: half the pot to the whole pot, on top of what it takes to call.
      const size = pot * (0.5 + Math.min(0.5, Math.max(0, equity - 0.5)));
      return { type: 'raise', to: tidy(state.currentBet + size, big, min, max) };
    }
  }
  if (legal.check) return { type: 'check' };
  // Worth the price (with a little room), or a cheap look now and then. What it already put in is
  // gone either way, so it never calls short of the price to protect it (chips in steps, then a
  // shove, would get it to call anything).
  if (equity >= price + 0.04 || (whim < 0.08 && toCall <= big * 2)) return { type: 'call' };
  return { type: 'fold' };
}
