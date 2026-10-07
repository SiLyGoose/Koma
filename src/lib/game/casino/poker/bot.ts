import { RANKS, SUITS, type Card } from '../blackjack.js';
import { inHand, legalActions, potTotal, type HandPlayer, type HandState, type PokerAction } from './hand.js';
import { bestHand, compareRanks } from './rank.js';

/*
 * The poker bots' play: a simple, honest strategy. A bot works out how often its hand wins against
 * the players still in (by dealing out the unknown cards at random many times over), and weighs
 * that against the price of calling: strong hands bet and raise, hands worth the price call, the
 * rest check or fold. A little randomness (the odd bluff, the odd loose call) keeps it from being
 * read like a book. It only ever sees its own cards and the board.
 */

/** How many deals to simulate when working out a hand's chances. */
export const EQUITY_TRIALS = 300;

const sameCard = (a: Card, b: Card): boolean => a.rank === b.rank && a.suit === b.suit;

/**
 * How often `hole` wins against `opponents` random hands with `board` (0 to 5 cards) dealt out the
 * rest of the way, as a share from 0 to 1 (a split counts as its share). `random` gives numbers from
 * 0 up to 1.
 */
export function estimateEquity(hole: readonly Card[], board: readonly Card[], opponents: number, random: () => number = Math.random, trials = EQUITY_TRIALS): number {
  if (opponents <= 0) return 1;
  const known = [...hole, ...board];
  const unseen = SUITS.flatMap((suit) => RANKS.map((rank) => ({ rank, suit }) as Card)).filter((c) => !known.some((k) => sameCard(c, k)));
  const needed = 5 - board.length + opponents * 2;
  let score = 0;
  for (let t = 0; t < trials; t++) {
    // A partial shuffle: just the cards this deal needs, off the top.
    const deck = [...unseen];
    for (let i = 0; i < needed; i++) {
      const j = i + Math.floor(random() * (deck.length - i));
      [deck[i], deck[j]] = [deck[j] as Card, deck[i] as Card];
    }
    const fullBoard = [...board, ...deck.slice(0, 5 - board.length)];
    const mine = bestHand([...hole, ...fullBoard]).rank;
    let beaten = false;
    let tied = 0;
    for (let o = 0; o < opponents; o++) {
      const at = 5 - board.length + o * 2;
      const theirs = bestHand([deck[at] as Card, deck[at + 1] as Card, ...fullBoard]).rank;
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
  const opponents = state.players.filter((p) => p !== me && inHand(p)).length;
  const equity = estimateEquity(me.hole, state.board, opponents, random);
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
  // Worth the price (with a little room), a cheap look now and then, or too much in already to let go.
  const committed = me.committed / Math.max(1, me.committed + me.stack);
  if (equity >= price + 0.04 || (whim < 0.08 && toCall <= big * 2) || (committed > 0.6 && equity > price * 0.8)) return { type: 'call' };
  return { type: 'fold' };
}
