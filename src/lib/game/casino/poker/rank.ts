import type { Card } from '../blackjack.js';

/*
 * Texas hold'em hand rankings: the best five cards out of the seven a player can use (their two and
 * the five on the board), and which of two hands wins. Pure, and the same for every table.
 */

/** The hand categories, weakest first (a HandRank's `category` is the index). */
export const CATEGORIES = [
  'High card',
  'Pair',
  'Two pair',
  'Three of a kind',
  'Straight',
  'Flush',
  'Full house',
  'Four of a kind',
  'Straight flush',
] as const;

/**
 * How strong a five-card hand is: its category (an index into CATEGORIES), then the card values that
 * break ties within it, most important first (an ace is 14, or 5 as the low end of A-2-3-4-5).
 */
export interface HandRank {
  category: number;
  values: number[];
}

/** The best hand a player can make, and the five cards it is made of. */
export interface BestHand {
  rank: HandRank;
  cards: Card[];
}

/** A card's value for ranking: aces high (14). */
export const cardValue = (card: Card): number => (card.rank === 1 ? 14 : card.rank);

/** The high card of a straight among five distinct values (sorted high to low), or 0 for none. A-2-3-4-5 is a 5-high straight. */
function straightHigh(values: readonly number[]): number {
  if (values.length !== 5) return 0;
  if (values[0] - values[4] === 4) return values[0];
  if (values[0] === 14 && values[1] === 5 && values[4] === 2) return 5;
  return 0;
}

/** Ranks exactly five cards. */
export function rankFive(cards: readonly Card[]): HandRank {
  const values = cards.map(cardValue).sort((a, b) => b - a);
  const flush = cards.every((card) => card.suit === cards[0].suit);
  const distinct = [...new Set(values)];
  const straight = straightHigh(distinct);
  if (straight && flush) return { category: 8, values: [straight] };

  // The values grouped by how many of each there are, biggest group first, then highest value.
  const counts = new Map<number, number>();
  for (const v of values) counts.set(v, (counts.get(v) ?? 0) + 1);
  const groups = [...counts].sort((a, b) => b[1] - a[1] || b[0] - a[0]);
  const shape = groups.map(([, n]) => n).join('');
  const byGroup = groups.map(([v]) => v);

  if (shape === '41') return { category: 7, values: byGroup };
  if (shape === '32') return { category: 6, values: byGroup };
  if (flush) return { category: 5, values };
  if (straight) return { category: 4, values: [straight] };
  if (shape === '311') return { category: 3, values: byGroup };
  if (shape === '221') return { category: 2, values: byGroup };
  if (shape === '2111') return { category: 1, values: byGroup };
  return { category: 0, values };
}

/** Positive when `a` beats `b`, negative when `b` beats `a`, 0 for a tie. */
export function compareRanks(a: HandRank, b: HandRank): number {
  if (a.category !== b.category) return a.category - b.category;
  for (let i = 0; i < Math.max(a.values.length, b.values.length); i++) {
    const d = (a.values[i] ?? 0) - (b.values[i] ?? 0);
    if (d !== 0) return d;
  }
  return 0;
}

/** Every way of picking `k` of `items`, keeping their order (like Python's itertools.combinations). */
function* combinations<T>(items: readonly T[], k: number, from = 0): Generator<T[]> {
  if (k === 0) {
    yield [];
    return;
  }
  for (let i = from; i <= items.length - k; i++) {
    for (const rest of combinations(items, k - 1, i + 1)) yield [items[i], ...rest];
  }
}

/** The best five-card hand out of five to seven cards: the strongest of every five that can be picked (21 for seven cards). */
export function bestHand(cards: readonly Card[]): BestHand {
  if (cards.length < 5) throw new Error(`A poker hand needs at least five cards, got ${cards.length}`);
  let best: BestHand | null = null;
  for (const five of combinations(cards, 5)) {
    const rank = rankFive(five);
    if (!best || compareRanks(rank, best.rank) > 0) best = { rank, cards: five };
  }
  return best as BestHand;
}

const VALUE_NAME: Record<number, [string, string]> = {
  2: ['Two', 'Twos'],
  3: ['Three', 'Threes'],
  4: ['Four', 'Fours'],
  5: ['Five', 'Fives'],
  6: ['Six', 'Sixes'],
  7: ['Seven', 'Sevens'],
  8: ['Eight', 'Eights'],
  9: ['Nine', 'Nines'],
  10: ['Ten', 'Tens'],
  11: ['Jack', 'Jacks'],
  12: ['Queen', 'Queens'],
  13: ['King', 'Kings'],
  14: ['Ace', 'Aces'],
};
const one = (v: number | undefined): string => VALUE_NAME[v ?? 0]?.[0] ?? '?';
const many = (v: number | undefined): string => VALUE_NAME[v ?? 0]?.[1] ?? '?';

/** A hand in words, like "Full house, Kings over Sevens" or "Royal flush". */
export function handName(rank: HandRank): string {
  const [a, b] = rank.values;
  switch (rank.category) {
    case 8:
      return a === 14 ? 'Royal flush' : `Straight flush, ${one(a)} high`;
    case 7:
      return `Four of a kind, ${many(a)}`;
    case 6:
      return `Full house, ${many(a)} over ${many(b)}`;
    case 5:
      return `Flush, ${one(a)} high`;
    case 4:
      return `Straight, ${one(a)} high`;
    case 3:
      return `Three of a kind, ${many(a)}`;
    case 2:
      return `Two pair, ${many(a)} and ${many(b)}`;
    case 1:
      return `Pair of ${many(a)}`;
    default:
      return `${one(a)} high`;
  }
}
