/* A playing card, as the card games deal it (blackjack, baccarat and poker: the bot's lib/game/casino/). */

export type Suit = 'spades' | 'hearts' | 'diamonds' | 'clubs';

/** A card. `rank` is 1 for the ace, 2 to 10, then 11 (jack), 12 (queen) and 13 (king). */
export interface Card {
  rank: number;
  suit: Suit;
}
