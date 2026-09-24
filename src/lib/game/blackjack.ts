import { randomUnit } from '../random.js';
import { parseBetArg } from './bet.js';

/*
 * The rules of blackjack, with no database, no Discord and no pictures.
 *
 * Everyone plays against the dealer with the same shoe. A hand is worth the sum of its cards:
 * 2 to 10 count as themselves, J, Q and K as 10, and an ace as 11 unless that would go over 21,
 * then as 1. Going over 21 is a bust and loses at once. Two cards worth 21 are a "blackjack".
 *
 * A round goes like this:
 *   1. Every player gets a card, the dealer gets one face up, every player gets a second card,
 *      and the dealer gets a second one face down.
 *   2. If the dealer has a blackjack the round is over: players with a blackjack get their bet
 *      back, everyone else loses. (Nobody can lose extra by doubling into a dealer blackjack.)
 *   3. Otherwise the players go one after the other. A player with a blackjack is done. The
 *      others can hit (take a card), stand (stop), or double (on their first two cards only: the
 *      bet doubles, they take exactly one card and stand).
 *   4. The dealer turns the hidden card over and takes cards until reaching 17 or more (the dealer
 *      stands on every 17, soft ones too). The dealer doesn't take any if no player is left to beat.
 *   5. A player who is closer to 21 than the dealer wins, or the dealer busts: the bet pays 1 to 1,
 *      a blackjack pays `naturalPayout` to 1 (3 to 2 by default). The same total is a push: the bet
 *      comes back. Anything else loses the bet.
 *
 * There is no splitting, insurance or surrender.
 */

export type Suit = 'spades' | 'hearts' | 'diamonds' | 'clubs';

export const SUITS: readonly Suit[] = ['spades', 'hearts', 'diamonds', 'clubs'];

/** A card. `rank` is 1 for the ace, 2 to 10, then 11 (jack), 12 (queen) and 13 (king). */
export interface Card {
  rank: number;
  suit: Suit;
}

export const RANKS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13] as const;

/** "A", "2" ... "10", "J", "Q", "K". */
export function rankLabel(rank: number): string {
  if (rank === 1) return 'A';
  if (rank === 11) return 'J';
  if (rank === 12) return 'Q';
  if (rank === 13) return 'K';
  return String(rank);
}

const SUIT_SYMBOL: Record<Suit, string> = { spades: '♠', hearts: '♥', diamonds: '♦', clubs: '♣' };

/** "A♠", "10♥": a card as text. */
export const cardText = (card: Card): string => `${rankLabel(card.rank)}${SUIT_SYMBOL[card.suit]}`;

/** A fresh, ordered shoe of `decks` decks. */
export function orderedShoe(decks: number): Card[] {
  const cards: Card[] = [];
  for (let d = 0; d < decks; d++) for (const suit of SUITS) for (const rank of RANKS) cards.push({ rank, suit });
  return cards;
}

/** A shuffled shoe of `decks` decks. `random` gives a number from 0 up to (not including) 1 (the real game uses a secure random source). */
export function newShoe(decks: number, random: () => number = randomUnit): Card[] {
  const cards = orderedShoe(decks);
  for (let i = cards.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [cards[i], cards[j]] = [cards[j] as Card, cards[i] as Card];
  }
  return cards;
}

export interface HandValue {
  /** The best total: as high as possible without going over 21 (if it can be done). */
  total: number;
  /** True when an ace is being counted as 11, so one more card can't bust the hand. */
  soft: boolean;
}

export function handValue(cards: readonly Card[]): HandValue {
  let total = 0;
  let aces = 0;
  for (const card of cards) {
    if (card.rank === 1) {
      aces++;
      total += 1;
    } else {
      total += Math.min(card.rank, 10);
    }
  }
  if (aces > 0 && total + 10 <= 21) return { total: total + 10, soft: true };
  return { total, soft: false };
}

/** Two cards worth 21. */
export const isBlackjack = (cards: readonly Card[]): boolean => cards.length === 2 && handValue(cards).total === 21;

export const isBust = (cards: readonly Card[]): boolean => handValue(cards).total > 21;

/** The dealer takes a card on 16 or less and stands on every 17 or more. */
export const dealerShouldHit = (cards: readonly Card[]): boolean => handValue(cards).total < 17;

/** How a player's hand ended against the dealer's. */
export type Outcome = 'blackjack' | 'win' | 'push' | 'lose' | 'bust';

/** Both hands must be finished. */
export function judge(player: readonly Card[], dealer: readonly Card[]): Outcome {
  if (isBust(player)) return 'bust';
  const playerNatural = isBlackjack(player);
  const dealerNatural = isBlackjack(dealer);
  if (playerNatural && dealerNatural) return 'push';
  if (playerNatural) return 'blackjack';
  if (dealerNatural) return 'lose';
  const mine = handValue(player).total;
  const theirs = handValue(dealer).total;
  if (theirs > 21) return 'win';
  if (mine > theirs) return 'win';
  if (mine === theirs) return 'push';
  return 'lose';
}

/**
 * What comes back to a player, in whole points, including their own bet: 0 when they lose,
 * the bet on a push, twice the bet on a win, and the bet plus `naturalPayout` times it (rounded)
 * on a blackjack.
 */
export function payoutFor(bet: number, outcome: Outcome, naturalPayout: number): number {
  switch (outcome) {
    case 'blackjack':
      return bet + Math.round(bet * naturalPayout);
    case 'win':
      return bet * 2;
    case 'push':
      return bet;
    default:
      return 0;
  }
}

/** What a blackjack pays, as a ratio in words: 1.5 is "3 to 2", 1.2 is "6 to 5", 1 is "1 to 1". */
export function payoutRatio(naturalPayout: number): string {
  for (let d = 1; d <= 5; d++) {
    const n = naturalPayout * d;
    if (Math.abs(n - Math.round(n)) < 1e-9) return `${Math.round(n)} to ${d}`;
  }
  return `${Number(naturalPayout.toFixed(2))} to 1`;
}

/** Where a seat is in the round. */
export type SeatStatus = 'playing' | 'stood' | 'bust' | 'blackjack';

export interface Seat {
  /** Whoever sits here (a Discord user id). */
  userId: string;
  /** The bet: it goes up when the player doubles. */
  bet: number;
  cards: Card[];
  status: SeatStatus;
  doubled: boolean;
}

/** Who a card is dealt to: a seat number (from 0), or the dealer. */
export type DealTarget = number | 'dealer';

/**
 * One round at the table. It holds the cards and who is doing what, and knows nothing about
 * money or Discord: whoever runs it deals the cards in the order `dealOrder` gives, asks
 * `dealerHasBlackjack`, plays the seats one at a time, then plays the dealer.
 */
export class Round {
  readonly seats: Seat[];
  readonly dealer: Card[] = [];
  private readonly shoe: Card[];

  constructor(players: readonly { userId: string; bet: number }[], shoe: Card[] = newShoe(4)) {
    if (players.length === 0) throw new Error('A round needs at least one player');
    this.shoe = shoe;
    this.seats = players.map((p) => ({ userId: p.userId, bet: p.bet, cards: [], status: 'playing', doubled: false }));
  }

  /** The order the first four cards go out: one each round the table, the dealer's first card up, then the second card, the dealer's face down. */
  dealOrder(): DealTarget[] {
    const seats = this.seats.map((_, i) => i);
    return [...seats, 'dealer', ...seats, 'dealer'];
  }

  private draw(): Card {
    const card = this.shoe.pop();
    if (!card) throw new Error('The shoe is empty');
    return card;
  }

  /** Deals one card to a seat or the dealer. */
  deal(target: DealTarget): Card {
    const card = this.draw();
    if (target === 'dealer') {
      this.dealer.push(card);
    } else {
      this.seat(target).cards.push(card);
    }
    return card;
  }

  /** Once the first cards are out: marks the players who were dealt a blackjack as done. */
  settleNaturals(): void {
    for (const seat of this.seats) if (isBlackjack(seat.cards)) seat.status = 'blackjack';
  }

  seat(index: number): Seat {
    const seat = this.seats[index];
    if (!seat) throw new Error(`There is no seat ${index}`);
    return seat;
  }

  /** The dealer's two cards make 21: the round is over without anybody playing. */
  dealerHasBlackjack(): boolean {
    return isBlackjack(this.dealer);
  }

  /** The seat's player can still act: they haven't stood, bust or been dealt a blackjack. */
  isActive(index: number): boolean {
    return this.seat(index).status === 'playing';
  }

  /** The first seat after `after` (or from the start if `after` is -1) that still has to play, or -1. */
  nextToPlay(after: number): number {
    for (let i = after + 1; i < this.seats.length; i++) if (this.isActive(i)) return i;
    return -1;
  }

  /** Doubling is for a hand of two cards that hasn't doubled. */
  canDouble(index: number): boolean {
    const seat = this.seat(index);
    return seat.status === 'playing' && seat.cards.length === 2 && !seat.doubled;
  }

  private afterCard(seat: Seat): void {
    const { total } = handValue(seat.cards);
    if (total > 21) seat.status = 'bust';
    else if (total === 21) seat.status = 'stood';
  }

  /** The seat takes a card. A bust ends their turn, and so does 21. */
  hit(index: number): Card {
    const seat = this.seat(index);
    if (seat.status !== 'playing') throw new Error(`Seat ${index} has finished playing`);
    const card = this.draw();
    seat.cards.push(card);
    this.afterCard(seat);
    return card;
  }

  stand(index: number): void {
    const seat = this.seat(index);
    if (seat.status === 'playing') seat.status = 'stood';
  }

  /** Doubles the bet, takes one card and ends the turn. */
  double(index: number): Card {
    if (!this.canDouble(index)) throw new Error(`Seat ${index} can't double`);
    const seat = this.seat(index);
    seat.bet *= 2;
    seat.doubled = true;
    const card = this.draw();
    seat.cards.push(card);
    this.afterCard(seat);
    if (seat.status === 'playing') seat.status = 'stood';
    return card;
  }

  /** The dealer has somebody left to beat: a player who stood (not a bust, and not a blackjack). */
  dealerMustPlay(): boolean {
    return this.seats.some((seat) => seat.status === 'stood');
  }

  /** The dealer takes a card if the rules say so, and returns it, or returns null when the dealer stands. */
  dealerDraw(): Card | null {
    if (!dealerShouldHit(this.dealer)) return null;
    const card = this.draw();
    this.dealer.push(card);
    return card;
  }

  /** How each seat ended, once everything is finished. */
  outcomes(): Outcome[] {
    return this.seats.map((seat) => judge(seat.cards, this.dealer));
  }
}

export type BlackjackArgs =
  | { ok: true; kind: 'solo'; bet: number | 'all' }
  | { ok: true; kind: 'party'; bet: number | 'all' | null }
  | { ok: false; error: 'usage' | 'bad_bet' };

/**
 * Reads the words after `blackjack`: a bet (a whole number, or "all") to play alone, or "party"
 * with an optional bet to open a table others can join.
 */
export function parseBlackjackArgs(args: readonly string[]): BlackjackArgs {
  const first = args[0]?.trim().toLowerCase();
  if (first === 'party' || first === 'group') {
    if (args.length === 1) return { ok: true, kind: 'party', bet: null };
    if (args.length > 2) return { ok: false, error: 'usage' };
    const bet = parseBetArg([args[1] as string]);
    return bet.ok ? { ok: true, kind: 'party', bet: bet.bet } : bet;
  }
  const bet = parseBetArg(args);
  return bet.ok ? { ok: true, kind: 'solo', bet: bet.bet } : bet;
}

/** Reads what was typed into the bet box of the join pop-up: a whole number or "all". */
export function parseBetText(text: string): number | 'all' | null {
  const parsed = parseBetArg([text.trim()]);
  return parsed.ok ? parsed.bet : null;
}
