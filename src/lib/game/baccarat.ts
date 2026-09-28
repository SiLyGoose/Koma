import { BACCARAT_BETS, BACCARAT_DECKS, type BaccaratBet } from '../../constants/index.js';
import { newShoe, type Card } from './blackjack.js';

/*
 * The rules of baccarat (punto banco), with no database and no pictures.
 *
 * Two hands are dealt, the Player's and the Banker's, two cards each (Player, Banker, Player,
 * Banker). A hand is worth the last digit of its cards' sum: an ace counts 1, 2 to 9 as themselves,
 * 10 and the faces 0. Neither side chooses anything; a third card is dealt by the fixed rules:
 *
 *  1. An 8 or 9 in either hand's first two cards is a "natural": nobody draws.
 *  2. Otherwise the Player draws on 0 to 5 and stands on 6 or 7.
 *  3. If the Player stood, the Banker draws on 0 to 5 and stands on 6 or 7. If the Player drew, the
 *     Banker's move depends on its total and the Player's third card:
 *       0-2 draws; 3 draws unless that card is an 8; 4 draws on a 2 to 7; 5 on a 4 to 7; 6 on a 6
 *       or 7; 7 stands.
 *
 * The hand closer to 9 wins; the same total is a tie. The bets:
 *  - Player: pays 1 to 1 when the Player wins.
 *  - Banker: pays `banker` to 1 (0.95: less a 5% commission) when the Banker wins.
 *  - Tie: pays `tie` to 1 on a tie. On a tie, Player and Banker bets are given back.
 *  - Kirin (side bet): pays `kirin` to 1 when the Player wins with three cards worth 8.
 *  - Phoenix (side bet): pays `phoenix` to 1 when the Banker wins with three cards worth 7.
 * A bet that loses is lost. What a winning bet pays back is rounded down to whole points.
 */

/** What each bet pays when it wins, "to 1" (the `baccarat.payout.*` settings). Player always pays 1 to 1. */
export interface BaccaratPayouts {
  banker: number;
  tie: number;
  kirin: number;
  phoenix: number;
}

/** Points on each spot (left out or 0: no bet there). */
export type BaccaratBets = Partial<Record<BaccaratBet, number>>;

export type BaccaratWinner = 'player' | 'banker' | 'tie';

export interface BaccaratRound {
  player: Card[];
  banker: Card[];
  /** The cards in the order they were dealt, and to whom (for showing the deal). */
  order: ('player' | 'banker')[];
  playerTotal: number;
  bankerTotal: number;
  winner: BaccaratWinner;
  /** A natural (8 or 9 in the first two cards) ended the round. */
  natural: boolean;
}

/** A card's baccarat points: ace 1, 2 to 9 themselves, 10 and faces 0. */
export const cardPoints = (card: Card): number => (card.rank >= 10 ? 0 : card.rank);

/** A hand's total: the last digit of its cards' points. */
export const handTotal = (cards: readonly Card[]): number => cards.reduce((sum, card) => sum + cardPoints(card), 0) % 10;

/** Whether the Banker, on `banker` with two cards, draws after the Player drew `playerThird` (points 0 to 9). */
export function bankerDraws(banker: number, playerThird: number): boolean {
  if (banker <= 2) return true;
  if (banker === 3) return playerThird !== 8;
  if (banker === 4) return playerThird >= 2 && playerThird <= 7;
  if (banker === 5) return playerThird >= 4 && playerThird <= 7;
  if (banker === 6) return playerThird === 6 || playerThird === 7;
  return false;
}

/**
 * Deals one round from the top of `shoe` (at least 6 cards). Without one, a freshly shuffled shoe of
 * BACCARAT_DECKS decks. The shoe isn't changed.
 */
export function dealRound(shoe: readonly Card[] = newShoe(BACCARAT_DECKS)): BaccaratRound {
  let next = 0;
  const take = (): Card => {
    const card = shoe[next++];
    if (!card) throw new Error('The baccarat shoe ran out of cards');
    return card;
  };
  const player = [take()];
  const banker = [take()];
  player.push(take());
  banker.push(take());
  const order: BaccaratRound['order'] = ['player', 'banker', 'player', 'banker'];

  const natural = handTotal(player) >= 8 || handTotal(banker) >= 8;
  if (!natural) {
    let playerThird: number | null = null;
    if (handTotal(player) <= 5) {
      const card = take();
      player.push(card);
      order.push('player');
      playerThird = cardPoints(card);
    }
    const bankerTotal = handTotal(banker);
    if (playerThird === null ? bankerTotal <= 5 : bankerDraws(bankerTotal, playerThird)) {
      banker.push(take());
      order.push('banker');
    }
  }

  const playerTotal = handTotal(player);
  const bankerTotal = handTotal(banker);
  const winner: BaccaratWinner = playerTotal > bankerTotal ? 'player' : bankerTotal > playerTotal ? 'banker' : 'tie';
  return { player, banker, order, playerTotal, bankerTotal, winner, natural };
}

/** How a bet came out: won (pays its odds), push (the bet comes back) or lost. */
export type BetOutcome = 'win' | 'push' | 'lose';

/** How the bet on `spot` came out in `round`. */
export function betOutcome(spot: BaccaratBet, round: BaccaratRound): BetOutcome {
  const { winner } = round;
  switch (spot) {
    case 'player':
      return winner === 'player' ? 'win' : winner === 'tie' ? 'push' : 'lose';
    case 'banker':
      return winner === 'banker' ? 'win' : winner === 'tie' ? 'push' : 'lose';
    case 'tie':
      return winner === 'tie' ? 'win' : 'lose';
    case 'kirin':
      return winner === 'player' && round.player.length === 3 && round.playerTotal === 8 ? 'win' : 'lose';
    case 'phoenix':
      return winner === 'banker' && round.banker.length === 3 && round.bankerTotal === 7 ? 'win' : 'lose';
  }
}

/** What a winning bet on `spot` pays, to 1. */
export const oddsFor = (spot: BaccaratBet, payouts: BaccaratPayouts): number => (spot === 'player' ? 1 : payouts[spot]);

/** What a bet of `amount` on `spot` gives back (the bet included): the bet times 1 + its odds on a win, the bet on a push, 0 on a loss. */
export function returnFor(spot: BaccaratBet, amount: number, outcome: BetOutcome, payouts: BaccaratPayouts): number {
  if (outcome === 'lose') return 0;
  if (outcome === 'push') return amount;
  return Math.floor(amount * (1 + oddsFor(spot, payouts)) + 1e-9);
}

/** One bet on the table, and how it came out. */
export interface SettledBet {
  spot: BaccaratBet;
  amount: number;
  outcome: BetOutcome;
  /** What it gave back, the bet included (0 when lost). */
  returned: number;
}

/** Settles every bet on the table (in BACCARAT_BETS order, only the ones with points on). */
export function settleBets(bets: BaccaratBets, round: BaccaratRound, payouts: BaccaratPayouts): SettledBet[] {
  return BACCARAT_BETS.filter((spot) => (bets[spot] ?? 0) > 0).map((spot) => {
    const amount = bets[spot] as number;
    const outcome = betOutcome(spot, round);
    return { spot, amount, outcome, returned: returnFor(spot, amount, outcome, payouts) };
  });
}

/**
 * The points lost on losing bets, each counted on its own: a Kirin bet that loses is lost even when
 * the Player bet beside it wins. What goes into the vault (pushes and wins give their chips back).
 */
export const lostChips = (settled: readonly SettledBet[]): number => settled.reduce((sum, b) => sum + (b.outcome === 'lose' ? b.amount : 0), 0);

/** The points on the table. */
export const totalBet = (bets: BaccaratBets): number => BACCARAT_BETS.reduce((sum, spot) => sum + Math.max(0, bets[spot] ?? 0), 0);


/**
 * Reads bets from the page: an object of spot to whole points. Null when it isn't one (an unknown
 * spot, or a bet that isn't a whole number from 0 up). Spots at 0 are left out, so `{}` is no bets.
 */
export function parseBets(data: unknown): BaccaratBets | null {
  if (typeof data !== 'object' || data === null || Array.isArray(data)) return null;
  const bets: BaccaratBets = {};
  for (const [spot, amount] of Object.entries(data as Record<string, unknown>)) {
    if (!(BACCARAT_BETS as readonly string[]).includes(spot)) return null;
    if (typeof amount !== 'number' || !Number.isSafeInteger(amount) || amount < 0) return null;
    if (amount > 0) bets[spot as BaccaratBet] = amount;
  }
  return bets;
}
