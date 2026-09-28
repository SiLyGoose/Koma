/*
 * Blackjack.
 */

/** File name of the blackjack table picture. */
export const BLACKJACK_IMAGE_NAME = 'blackjack.png';

/** A blackjack can pay up to this many times the bet (the `blackjack.naturalPayout` setting). */
export const MAX_BLACKJACK_NATURAL = 10;

/** The longest, in seconds, a party stays open or a player gets to decide (the `blackjack.joinSeconds` and `blackjack.turnSeconds` settings). */
export const MAX_BLACKJACK_SECONDS = 300;

/**
 * How blackjack plays.
 * - `decks`: the shoe is this many decks, shuffled again for every round.
 * - `maxSeats`: how many players a party table seats (the table picture fits up to 6).
 * - `dealMs` and `dealerMs`: the picture is swapped this often while cards are dealt, and while the dealer
 *   plays (keep both at 500 or more, Discord limits message edits).
 * - `buttonsIdleMs`: how long the buttons under a finished solo game (again, double, half) keep working.
 * - `modalMs`: how long a player has to fill in the bet pop-up after pressing Join.
 * - `leaseMs`, `heartbeatMs`, `sweepMs`: the bets on a table are marked as "in use" for `leaseMs`, renewed
 *   every `heartbeatMs` while the table is played. Every `sweepMs` the bot looks for bets whose mark ran out
 *   (their table died, because the bot restarted) and gives the points back.
 */
export const BLACKJACK = {
  /** How many times bigger than its 640 by 400 layout the table picture is drawn (1.5 gives 960 by 600). Bigger is sharper but takes longer to draw. */
  imageScale: 1.5,
  decks: 4,
  maxSeats: 5,
  dealMs: 1_000,
  dealerMs: 1_000,
  buttonsIdleMs: 60_000,
  modalMs: 60_000,
  leaseMs: 90_000,
  heartbeatMs: 30_000,
  sweepMs: 60_000,
} as const;
