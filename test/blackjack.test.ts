import assert from 'node:assert/strict';
import { test } from 'node:test';
import { CONFIG, DEFAULTS } from '../src/config.js';
import { BLACKJACK, TEXT, validateConstants } from '../src/constants/index.js';
import { IMAGE_HEIGHT, IMAGE_WIDTH, renderTable, TABLE_HEIGHT, TABLE_WIDTH } from '../src/animations/images/blackjack-image.js';
import {
  RANKS,
  Round,
  SUITS,
  cardText,
  dealerShouldHit,
  handValue,
  isBlackjack,
  isBust,
  judge,
  newShoe,
  orderedShoe,
  parseBetText,
  parseBlackjackArgs,
  payoutFor,
  payoutRatio,
  rankLabel,
  type Card,
  type Outcome,
  type Suit,
} from '../src/lib/game/blackjack.js';
import { allBet } from '../src/lib/game/bet.js';
import { SPECS, checkConstraints, findSpec, formatValue, parseInput, validateSettings } from '../src/lib/settings-spec.js';

const SUIT_OF: Record<string, Suit> = { S: 'spades', H: 'hearts', D: 'diamonds', C: 'clubs' };
const RANK_OF: Record<string, number> = { A: 1, J: 11, Q: 12, K: 13 };

/** "AS", "10H", "KD": a card from text. */
const card = (text: string): Card => {
  const rank = text.slice(0, -1);
  return { rank: RANK_OF[rank] ?? Number(rank), suit: SUIT_OF[text.slice(-1)] as Suit };
};
const hand = (...texts: string[]): Card[] => texts.map(card);

/** A shoe that deals `texts` in this order (a round takes cards from the end). */
const stacked = (...texts: string[]): Card[] => texts.map(card).reverse();

// ---------------------------------------------------------------------------
// Hands

test('blackjack: cards count as their number, faces as 10, and an ace as 11 unless that busts the hand', () => {
  assert.deepEqual(handValue(hand('2S', '3H')), { total: 5, soft: false });
  assert.deepEqual(handValue(hand('KS', 'QH')), { total: 20, soft: false });
  assert.deepEqual(handValue(hand('10S', 'JH', 'AD')), { total: 21, soft: false });
  assert.deepEqual(handValue(hand('AS', '6H')), { total: 17, soft: true });
  assert.deepEqual(handValue(hand('AS', '6H', '10D')), { total: 17, soft: false });
  assert.deepEqual(handValue(hand('AS', 'AH')), { total: 12, soft: true });
  assert.deepEqual(handValue(hand('AS', 'AH', 'AD', 'AC')), { total: 14, soft: true });
  assert.deepEqual(handValue(hand('AS', 'AH', '9D')), { total: 21, soft: true });
  assert.deepEqual(handValue(hand('AS', 'AH', '9D', '5C')), { total: 16, soft: false });
  assert.deepEqual(handValue(hand('10S', '9H', '5D')), { total: 24, soft: false });
  assert.deepEqual(handValue([]), { total: 0, soft: false });
});

test('blackjack: a blackjack is two cards making 21, and three cards making 21 is not one', () => {
  assert.equal(isBlackjack(hand('AS', 'KH')), true);
  assert.equal(isBlackjack(hand('10D', 'AC')), true);
  assert.equal(isBlackjack(hand('7S', '7H', '7D')), false);
  assert.equal(isBlackjack(hand('AS', '5H', '5D')), false);
  assert.equal(isBlackjack(hand('KS', 'QH')), false);
});

test('blackjack: over 21 is a bust', () => {
  assert.equal(isBust(hand('10S', '9H', '5D')), true);
  assert.equal(isBust(hand('10S', '9H', '2D')), false);
  assert.equal(isBust(hand('AS', 'KH', '5D')), false);
});

test('blackjack: the dealer takes a card up to 16 and stands on every 17, soft ones too', () => {
  assert.equal(dealerShouldHit(hand('10S', '6H')), true);
  assert.equal(dealerShouldHit(hand('10S', '7H')), false);
  assert.equal(dealerShouldHit(hand('AS', '6H')), false);
  assert.equal(dealerShouldHit(hand('AS', '5H')), true);
  assert.equal(dealerShouldHit(hand('KS', '5H', '2D')), false);
});

// ---------------------------------------------------------------------------
// Who wins

const CASES: [string, string[], string[], Outcome][] = [
  ['a bust loses even when the dealer busts too', ['10S', '9H', '5D'], ['10C', '6D', '9H'], 'bust'],
  ['a higher total wins', ['10S', '9H'], ['10C', '8D'], 'win'],
  ['a lower total loses', ['10S', '8H'], ['10C', '9D'], 'lose'],
  ['the same total pushes', ['10S', '9H'], ['10C', '9D'], 'push'],
  ['the dealer busting pays a standing player', ['10S', '2H'], ['10C', '6D', '9H'], 'win'],
  ['a blackjack beats a dealer 20', ['AS', 'KH'], ['10C', 'QD'], 'blackjack'],
  ['a blackjack against a dealer blackjack pushes', ['AS', 'KH'], ['AC', 'QD'], 'push'],
  ['three cards making 21 lose to a dealer blackjack', ['7S', '7H', '7D'], ['AC', 'QD'], 'lose'],
  ['three cards making 21 beat a dealer 20', ['7S', '7H', '7D'], ['10C', 'QD'], 'win'],
  ['three cards making 21 against a dealer 21 of three cards push', ['7S', '7H', '7D'], ['5C', '6D', '10H'], 'push'],
];
for (const [name, player, dealer, expected] of CASES) {
  test(`blackjack: ${name}`, () => {
    assert.equal(judge(hand(...player), hand(...dealer)), expected);
  });
}

test('blackjack: what comes back is the bet plus the winnings, 3 to 2 on a blackjack', () => {
  assert.equal(payoutFor(100, 'win', 1.5), 200);
  assert.equal(payoutFor(100, 'push', 1.5), 100);
  assert.equal(payoutFor(100, 'lose', 1.5), 0);
  assert.equal(payoutFor(100, 'bust', 1.5), 0);
  assert.equal(payoutFor(100, 'blackjack', 1.5), 250);
  assert.equal(payoutFor(10, 'blackjack', 1.5), 25);
  assert.equal(payoutFor(15, 'blackjack', 1.5), 38, 'a half point rounds up');
  assert.equal(payoutFor(100, 'blackjack', 1), 200);
  assert.equal(payoutFor(100, 'blackjack', 0), 100);
});

test('blackjack: a blackjack payout is shown as a ratio', () => {
  assert.equal(payoutRatio(1.5), '3 to 2');
  assert.equal(payoutRatio(1.2), '6 to 5');
  assert.equal(payoutRatio(1), '1 to 1');
  assert.equal(payoutRatio(2), '2 to 1');
  assert.equal(payoutRatio(1.37), '1.37 to 1');
});

// ---------------------------------------------------------------------------
// The shoe

test('blackjack: a shoe has every card once per deck, and shuffling only moves them', () => {
  const ordered = orderedShoe(4);
  assert.equal(ordered.length, 4 * 52);
  for (const suit of SUITS) for (const rank of RANKS) assert.equal(ordered.filter((c) => c.suit === suit && c.rank === rank).length, 4);

  const key = (c: Card) => `${c.rank}${c.suit}`;
  const shuffled = newShoe(4);
  assert.equal(shuffled.length, 208);
  assert.deepEqual(shuffled.map(key).sort(), ordered.map(key).sort());
  assert.notDeepEqual(shuffled.map(key), ordered.map(key), 'shuffled');
});

test('blackjack: the shuffle uses the random numbers it is given, and a different roll gives a different shoe', () => {
  const low = newShoe(1, () => 0);
  const high = newShoe(1, () => 0.999999);
  assert.equal(low.length, 52);
  assert.notDeepEqual(low, high);
  assert.deepEqual(newShoe(1, () => 0), low, 'the same numbers, the same shoe');
});

test('blackjack: the cards read as text', () => {
  assert.equal(cardText(card('AS')), 'A♠');
  assert.equal(cardText(card('10H')), '10♥');
  assert.equal(cardText(card('KD')), 'K♦');
  assert.equal(cardText(card('JC')), 'J♣');
  assert.equal(rankLabel(12), 'Q');
  assert.equal(rankLabel(7), '7');
});

// ---------------------------------------------------------------------------
// A round

/** Deals the first cards out in the order the round says, like the game does. */
function dealAll(round: Round): void {
  for (const target of round.dealOrder()) round.deal(target);
  round.settleNaturals();
}

test('blackjack round: the cards go out one to each player, one to the dealer, one more each, one more to the dealer', () => {
  const round = new Round([{ userId: 'a', bet: 10 }, { userId: 'b', bet: 20 }], stacked('2S', '3S', '4S', '5S', '6S', '7S'));
  assert.deepEqual(round.dealOrder(), [0, 1, 'dealer', 0, 1, 'dealer']);
  dealAll(round);
  assert.deepEqual(round.seats[0]?.cards, hand('2S', '5S'));
  assert.deepEqual(round.seats[1]?.cards, hand('3S', '6S'));
  assert.deepEqual(round.dealer, hand('4S', '7S'));
});

test('blackjack round: a player dealt a blackjack is done, the others are up, and turns go left to right', () => {
  // Seats: a = A K (blackjack), b = 5 6, c = 9 9. Dealer 10 7.
  const round = new Round(
    [{ userId: 'a', bet: 10 }, { userId: 'b', bet: 10 }, { userId: 'c', bet: 10 }],
    stacked('AS', '5S', '9S', '10S', 'KS', '6S', '9H', '7S'),
  );
  dealAll(round);
  assert.equal(round.seat(0).status, 'blackjack');
  assert.equal(round.isActive(0), false);
  assert.equal(round.nextToPlay(-1), 1);
  assert.equal(round.nextToPlay(1), 2);
  assert.equal(round.nextToPlay(2), -1);
  assert.equal(round.dealerHasBlackjack(), false);
});

test('blackjack round: hitting takes a card, and going over 21 ends the turn as a bust', () => {
  const round = new Round([{ userId: 'a', bet: 10 }], stacked('10S', '9S', '6S', '7S', '9D', '2C'));
  dealAll(round); // player 10 6, dealer 9 7
  assert.equal(round.seat(0).status, 'playing');
  const drawn = round.hit(0);
  assert.deepEqual(drawn, card('9D'));
  assert.equal(round.seat(0).status, 'bust');
  assert.equal(round.isActive(0), false);
  assert.throws(() => round.hit(0), /finished/);
  assert.equal(round.dealerMustPlay(), false, 'nobody left to beat');
});

test('blackjack round: reaching 21 by hitting stands automatically', () => {
  const round = new Round([{ userId: 'a', bet: 10 }], stacked('10S', '9S', '5S', '7S', '6D'));
  dealAll(round); // 10 5
  round.hit(0); // + 6 = 21
  assert.equal(handValue(round.seat(0).cards).total, 21);
  assert.equal(round.seat(0).status, 'stood');
});

test('blackjack round: standing ends the turn', () => {
  const round = new Round([{ userId: 'a', bet: 10 }], stacked('10S', '9S', '8S', '7S'));
  dealAll(round);
  round.stand(0);
  assert.equal(round.seat(0).status, 'stood');
  assert.equal(round.dealerMustPlay(), true);
});

test('blackjack round: a double doubles the bet, takes one card and ends the turn, but only on the first two cards', () => {
  const round = new Round([{ userId: 'a', bet: 50 }], stacked('5S', '9S', '6S', '7S', '10D', '2C'));
  dealAll(round); // 5 6
  assert.equal(round.canDouble(0), true);
  const drawn = round.double(0);
  assert.deepEqual(drawn, card('10D'));
  assert.equal(round.seat(0).bet, 100);
  assert.equal(round.seat(0).doubled, true);
  assert.equal(round.seat(0).cards.length, 3);
  assert.equal(round.seat(0).status, 'stood');
  assert.equal(round.canDouble(0), false);
  assert.throws(() => round.double(0), /can't double/);

  const later = new Round([{ userId: 'a', bet: 50 }], stacked('2S', '9S', '3S', '7S', '2D', '2C'));
  dealAll(later);
  later.hit(0);
  assert.equal(later.canDouble(0), false, 'not after a hit');
});

test('blackjack round: a doubled hand that busts is a bust, and one that makes 21 with three cards is not a blackjack', () => {
  const bust = new Round([{ userId: 'a', bet: 50 }], stacked('10S', '9S', '6S', '7S', '9D'));
  dealAll(bust);
  bust.double(0);
  assert.equal(bust.seat(0).status, 'bust');
  assert.equal(bust.seat(0).bet, 100);

  const made = new Round([{ userId: 'a', bet: 50 }], stacked('5S', '9S', '6S', '7S', '10D', '10C'));
  dealAll(made);
  made.double(0); // 5 6 10 = 21
  assert.equal(made.seat(0).status, 'stood');
  assert.equal(judge(made.seat(0).cards, hand('10C', 'QD')), 'win');
});

test('blackjack round: the dealer draws to 17 and then stops', () => {
  const round = new Round([{ userId: 'a', bet: 10 }], stacked('10S', '5S', '9S', '2S', '3C', '4D', '9H'));
  dealAll(round); // player 10 9, dealer 5 2
  round.stand(0);
  assert.deepEqual(round.dealerDraw(), card('3C')); // 10
  assert.deepEqual(round.dealerDraw(), card('4D')); // 14
  assert.deepEqual(round.dealerDraw(), card('9H')); // 23, bust
  assert.equal(round.dealerDraw(), null);
  assert.deepEqual(round.outcomes(), ['win']);
});

test('blackjack round: the dealer stands on a soft 17', () => {
  const round = new Round([{ userId: 'a', bet: 10 }], stacked('10S', 'AS', '9S', '6S', '5C'));
  dealAll(round);
  round.stand(0);
  assert.equal(round.dealerDraw(), null);
  assert.deepEqual(handValue(round.dealer), { total: 17, soft: true });
  assert.deepEqual(round.outcomes(), ['win']);
});

test('blackjack round: a dealer blackjack takes every bet except a player blackjack, which pushes', () => {
  const round = new Round([{ userId: 'a', bet: 10 }, { userId: 'b', bet: 10 }], stacked('AS', '10S', 'AH', 'KS', 'KH', 'QH'));
  // The cards go a, b, dealer, a, b, dealer: a has A K (a blackjack), b has 10 K (20), the dealer has A Q (a blackjack).
  dealAll(round);
  assert.deepEqual(round.seat(0).cards, hand('AS', 'KS'));
  assert.deepEqual(round.seat(1).cards, hand('10S', 'KH'));
  assert.deepEqual(round.dealer, hand('AH', 'QH'));
  assert.equal(round.dealerHasBlackjack(), true);
  assert.deepEqual(round.outcomes(), ['push', 'lose']);
});

test('blackjack round: the dealer does not draw when every player busted or has a blackjack', () => {
  const round = new Round([{ userId: 'a', bet: 10 }], stacked('AS', '5S', 'KS', '6S'));
  dealAll(round);
  assert.equal(round.dealerMustPlay(), false);
  assert.deepEqual(round.outcomes(), ['blackjack']);
});

test('blackjack round: a round needs a player, and running out of cards is an error, not a silent hang', () => {
  assert.throws(() => new Round([]), /needs at least one player/);
  const round = new Round([{ userId: 'a', bet: 10 }], stacked('2S'));
  round.deal(0);
  assert.throws(() => round.deal(0), /shoe is empty/);
});

test('blackjack round: a shoe of four decks is plenty for five players who all hit until they bust', () => {
  const round = new Round(Array.from({ length: 5 }, (_, i) => ({ userId: String(i), bet: 10 })), newShoe(BLACKJACK.decks));
  dealAll(round);
  for (let seat = round.nextToPlay(-1); seat !== -1; seat = round.nextToPlay(seat)) while (round.isActive(seat)) round.hit(seat);
  while (round.dealerDraw());
  assert.equal(round.outcomes().length, 5);
});

// ---------------------------------------------------------------------------
// Typed commands

test('blackjack: the command reads a bet to play alone, or "party" with an optional bet', () => {
  assert.deepEqual(parseBlackjackArgs(['100']), { ok: true, kind: 'solo', bet: 100 });
  assert.deepEqual(parseBlackjackArgs(['1,000']), { ok: true, kind: 'solo', bet: 1000 });
  assert.deepEqual(parseBlackjackArgs(['ALL']), { ok: true, kind: 'solo', bet: 'all' });
  assert.deepEqual(parseBlackjackArgs(['max']), { ok: true, kind: 'solo', bet: 'all' });
  assert.deepEqual(parseBlackjackArgs(['party']), { ok: true, kind: 'party', bet: null });
  assert.deepEqual(parseBlackjackArgs(['Party', '250']), { ok: true, kind: 'party', bet: 250 });
  assert.deepEqual(parseBlackjackArgs(['party', 'all']), { ok: true, kind: 'party', bet: 'all' });
  assert.deepEqual(parseBlackjackArgs(['group']), { ok: true, kind: 'party', bet: null });
  assert.deepEqual(parseBlackjackArgs([]), { ok: false, error: 'usage' });
  assert.deepEqual(parseBlackjackArgs(['100', '200']), { ok: false, error: 'usage' });
  assert.deepEqual(parseBlackjackArgs(['party', '1', '2']), { ok: false, error: 'usage' });
  assert.deepEqual(parseBlackjackArgs(['abc']), { ok: false, error: 'bad_bet' });
  assert.deepEqual(parseBlackjackArgs(['party', 'abc']), { ok: false, error: 'bad_bet' });
  assert.deepEqual(parseBlackjackArgs(['0']), { ok: false, error: 'bad_bet' });
  assert.deepEqual(parseBlackjackArgs(['-5']), { ok: false, error: 'bad_bet' });
  assert.deepEqual(parseBlackjackArgs(['1.5']), { ok: false, error: 'bad_bet' });
});

test('blackjack: the join pop-up reads a whole number or "all", and nothing else', () => {
  assert.equal(parseBetText('100'), 100);
  assert.equal(parseBetText(' 100 '), 100);
  assert.equal(parseBetText('All'), 'all');
  assert.equal(parseBetText('1_000'), 1000);
  assert.equal(parseBetText(''), null);
  assert.equal(parseBetText('ten'), null);
  assert.equal(parseBetText('10 20'), null);
  assert.equal(parseBetText('-4'), null);
});

test('blackjack: "all" is what a member has, kept within the smallest and biggest bet', () => {
  assert.equal(allBet(500, 10, 1000), 500);
  assert.equal(allBet(5000, 10, 1000), 1000);
  assert.equal(allBet(3, 10, 1000), 10, 'less than the smallest bet: they are told what a bet costs');
  assert.equal(allBet(0, 10, 1000), 10);
});

// ---------------------------------------------------------------------------
// Settings and text

test('blackjack: the settings exist, are in their own group, and start at sensible values', () => {
  assert.deepEqual(DEFAULTS.blackjack, { minBet: 10, maxBet: 1000, naturalPayout: 1.5, joinSeconds: 15, turnSeconds: 30 });
  assert.deepEqual(CONFIG.blackjack, DEFAULTS.blackjack);
  const keys = SPECS.filter((s) => s.key.startsWith('blackjack.')).map((s) => s.key);
  assert.deepEqual(keys, ['blackjack.minBet', 'blackjack.maxBet', 'blackjack.naturalPayout', 'blackjack.joinSeconds', 'blackjack.turnSeconds']);
  for (const key of keys) assert.equal(findSpec(key)?.group, 'Blackjack');
  assert.deepEqual(validateSettings(structuredClone(DEFAULTS)), []);
});

test('blackjack: settings are checked when typed in', () => {
  const payout = findSpec('blackjack.naturalPayout')!;
  assert.deepEqual(parseInput(payout, '1.2x'), { ok: true, value: 1.2 });
  assert.deepEqual(parseInput(payout, '2'), { ok: true, value: 2 });
  assert.equal(formatValue(payout, 1.5), '1.5x');
  assert.equal(parseInput(payout, '-1').ok, false);
  assert.equal(parseInput(payout, '11').ok, false);
  const join = findSpec('blackjack.joinSeconds')!;
  assert.equal(parseInput(join, '4').ok, false);
  assert.equal(parseInput(join, '20').ok, true);
  assert.equal(parseInput(join, '301').ok, false);
  assert.equal(parseInput(findSpec('blackjack.turnSeconds')!, '2.5').ok, false);
});

test('blackjack: the smallest bet cannot be above the biggest', () => {
  const settings = structuredClone(DEFAULTS);
  settings.blackjack.minBet = 500;
  settings.blackjack.maxBet = 100;
  assert.match(checkConstraints(settings) ?? '', /blackjack\.minBet cannot be higher than blackjack\.maxBet/);
  settings.blackjack.minBet = 100;
  assert.equal(checkConstraints(settings), null);
});

test('blackjack: the constants pass the startup check, and the timings are ones Discord allows', () => {
  validateConstants();
  assert.ok(BLACKJACK.dealMs >= 500 && BLACKJACK.dealerMs >= 500);
  assert.ok(BLACKJACK.leaseMs >= 2 * BLACKJACK.heartbeatMs);
  assert.ok(BLACKJACK.maxSeats >= 1 && BLACKJACK.maxSeats <= 6);
});

test('blackjack: the messages fit the limits Discord sets', () => {
  const t = TEXT.blackjack;
  // A modal label is at most 45 characters, a button label 80, a modal title 45.
  assert.ok(t.betLabel('1,000,000', '1,000,000').length <= 45, t.betLabel('1,000,000', '1,000,000'));
  assert.ok(t.modalTitle.length <= 45);
  for (const label of [t.hitButton, t.standButton, t.doubleButton('1,000,000'), t.joinButton, t.leaveButton, t.startButton, TEXT.bet.againButton('1,000,000'), t.doubleBetButton('1,000,000'), TEXT.bet.halfButton('1,000,000')]) {
    assert.ok(label.length > 0 && label.length <= 80, label);
  }
  assert.ok(t.betPlaceholder.length <= 100);
  // The description of an embed is at most 4096 characters, even with five players.
  const lines = Array.from({ length: 5 }, (_, i) => t.playerLine(i + 1, '<@100000000000000001>', 21, true, t.statusDoubled, '1,000,000'));
  assert.ok(lines.join('\n').length < 1000);
});

// ---------------------------------------------------------------------------
// The picture

/** The width and height from a PNG's header, and its pixels after decoding (8-bit RGBA, no filters assumed beyond the ones used). */
function pngSize(bytes: Uint8Array): { width: number; height: number } {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  assert.equal(view.getUint32(0), 0x89504e47, 'PNG signature');
  return { width: view.getUint32(16), height: view.getUint32(20) };
}

test('blackjack picture: it is a PNG of the documented size, for every kind of table', () => {
  const views = [
    { dealer: [], seats: [null, null, null, null, null] },
    { dealer: hand('KS', '7H'), seats: [{ cards: hand('AS', '10H'), bet: 100, badge: 'blackjack' as const }] },
    { dealer: hand('AS', '6H', '10D'), hideHole: true, seats: [{ cards: hand('2S', '3H', '4D', '5C', '6S', '7H'), bet: 12345, active: true }, null, { cards: [], bet: 10 }] },
    { dealer: hand('KS', '7H'), dealerBadge: 'bust' as const, seats: [{ cards: hand('9S', '8H'), bet: 1000, badge: 'win' as const }, { cards: hand('QS', 'JH', '4D'), bet: 20, badge: 'bust' as const }] },
  ];
  for (const view of views) {
    const png = renderTable(view);
    assert.deepEqual(pngSize(png), { width: IMAGE_WIDTH, height: IMAGE_HEIGHT });
    assert.ok(png.length > 5000);
  }
});

test('blackjack picture: it is the layout size times the scale setting, in whole pixels', () => {
  assert.equal(IMAGE_WIDTH, TABLE_WIDTH * BLACKJACK.imageScale);
  assert.equal(IMAGE_HEIGHT, TABLE_HEIGHT * BLACKJACK.imageScale);
  assert.ok(Number.isInteger(IMAGE_WIDTH) && Number.isInteger(IMAGE_HEIGHT));
  assert.ok(BLACKJACK.imageScale >= 1);
});

test('blackjack picture: different cards and different seats draw different pictures, and the same table draws the same one', () => {
  const a = renderTable({ dealer: hand('KS', '7H'), seats: [{ cards: hand('9S', '8H'), bet: 100 }] });
  const b = renderTable({ dealer: hand('KS', '7H'), seats: [{ cards: hand('9S', '8H'), bet: 100 }] });
  const c = renderTable({ dealer: hand('KS', '7H'), seats: [{ cards: hand('9S', '8D'), bet: 100 }] });
  const d = renderTable({ dealer: hand('KS', '7H'), seats: [{ cards: hand('9S', '8H'), bet: 100, active: true }] });
  const hidden = renderTable({ dealer: hand('KS', '7H'), hideHole: true, seats: [{ cards: hand('9S', '8H'), bet: 100 }] });
  assert.ok(a.equals(b));
  assert.ok(!a.equals(c), 'a card of another suit');
  assert.ok(!a.equals(d), 'the seat whose turn it is glows');
  assert.ok(!a.equals(hidden), 'a card face down');
});
