import assert from 'node:assert/strict';
import { test } from 'node:test';
import { CONFIG, DEFAULTS } from '../src/config.js';
import { BACCARAT_BETS, BACCARAT_CHIPS, BACCARAT_WEB, TEXT } from '../src/constants/index.js';
import {
  bankerDraws,
  betOutcome,
  cardPoints,
  dealRound,
  handTotal,
  returnFor,
  lostChips,
  settleBets,
  totalBet,
  type BaccaratPayouts,
  type BaccaratRound,
} from '../src/lib/game/casino/baccarat.js';
import type { Card } from '../src/lib/game/casino/blackjack.js';
import { checkConstraints, findSpec, SPECS, validateSettings } from '../src/lib/settings-spec.js';
import { GAMES } from '../src/web/config.js';

const PAYOUTS: BaccaratPayouts = { banker: 0.95, tie: 8, kirin: 25, phoenix: 40 };

/** A card worth `points` (0 is a king). */
const c = (points: number): Card => ({ rank: points === 0 ? 13 : points, suit: 'spades' });
/** A shoe dealt in this order: Player, Banker, Player, Banker, then any third cards. */
const shoe = (...points: number[]): Card[] => [...points.map(c), c(0), c(0)];

// ---------------------------------------------------------------------------
// The rules

test('baccarat: aces count 1, 2 to 9 themselves, tens and faces 0, and a hand is the last digit of the sum', () => {
  assert.deepEqual([1, 2, 9, 10, 11, 12, 13].map((rank) => cardPoints({ rank, suit: 'hearts' })), [1, 2, 9, 0, 0, 0, 0]);
  assert.equal(handTotal([c(7), c(8)]), 5);
  assert.equal(handTotal([c(9), c(0)]), 9);
  assert.equal(handTotal([c(5), c(5)]), 0);
  assert.equal(handTotal([c(4), c(5), c(9)]), 8);
});

test('baccarat: the Banker draws by the standard table after the Player draws', () => {
  // Rows: the Banker's total 0 to 7; columns: the Player's third card 0 to 9. D draws, S stands.
  const table = [
    'DDDDDDDDDD',
    'DDDDDDDDDD',
    'DDDDDDDDDD',
    'DDDDDDDDSD',
    'SSDDDDDDSS',
    'SSSSDDDDSS',
    'SSSSSSDDSS',
    'SSSSSSSSSS',
  ];
  table.forEach((row, banker) => [...row].forEach((d, third) => assert.equal(bankerDraws(banker, third), d === 'D', `Banker ${banker}, Player's third ${third}`)));
});

test('baccarat: a natural ends the round with two cards each', () => {
  const round = dealRound(shoe(4, 3, 4, 3)); // Player 8, Banker 6
  assert.deepEqual([round.player.length, round.banker.length, round.natural, round.winner], [2, 2, true, 'player']);
  assert.deepEqual(round.order, ['player', 'banker', 'player', 'banker']);
  const tie = dealRound(shoe(9, 9, 0, 0)); // 9 against 9
  assert.deepEqual([tie.winner, tie.natural], ['tie', true]);
});

test('baccarat: the Player draws on 0 to 5 and stands on 6 or 7; a Banker facing a Player who stood draws on 0 to 5', () => {
  const stood = dealRound(shoe(3, 2, 3, 3, 1)); // Player 6 stands, Banker 5 draws a 1
  assert.deepEqual([stood.player.length, stood.banker.length, stood.bankerTotal, stood.winner], [2, 3, 6, 'tie']);
  assert.deepEqual(stood.order, ['player', 'banker', 'player', 'banker', 'banker']);
  const both = dealRound(shoe(3, 3, 2, 3, 4, 2)); // Player 5 draws a 4 (9), Banker 6 stands on a 4
  assert.deepEqual([both.player.length, both.banker.length, both.playerTotal, both.bankerTotal, both.winner], [3, 2, 9, 6, 'player']);
  const draws = dealRound(shoe(1, 2, 1, 2, 3, 5)); // Player 2 draws a 3 (5), Banker 4 draws on a 3: 9
  assert.deepEqual([draws.player.length, draws.banker.length, draws.bankerTotal, draws.winner], [3, 3, 9, 'banker']);
});

test('baccarat: Player and Banker pay on a win and come back on a tie; Tie pays 8 to 1', () => {
  const round = (winner: BaccaratRound['winner']) => ({ winner, player: [], banker: [], playerTotal: 0, bankerTotal: 0 }) as unknown as BaccaratRound;
  assert.deepEqual(['player', 'banker', 'tie'].map((w) => betOutcome('player', round(w as 'player'))), ['win', 'lose', 'push']);
  assert.deepEqual(['player', 'banker', 'tie'].map((w) => betOutcome('banker', round(w as 'player'))), ['lose', 'win', 'push']);
  assert.deepEqual(['player', 'banker', 'tie'].map((w) => betOutcome('tie', round(w as 'player'))), ['lose', 'lose', 'win']);
  assert.equal(returnFor('player', 100, 'win', PAYOUTS), 200);
  assert.equal(returnFor('banker', 100, 'win', PAYOUTS), 195);
  assert.equal(returnFor('banker', 15, 'win', PAYOUTS), 29, 'rounded down: 15 x 1.95 is 29.25');
  assert.equal(returnFor('tie', 10, 'win', PAYOUTS), 90);
  assert.equal(returnFor('player', 100, 'push', PAYOUTS), 100);
  assert.equal(returnFor('tie', 100, 'lose', PAYOUTS), 0);
});

test('baccarat: Kirin wins when the Player wins with three cards worth 8, Phoenix when the Banker wins with three worth 7', () => {
  const kirin = dealRound(shoe(2, 3, 3, 3, 3, 0)); // Player 5 draws a 3: 8; Banker 6 stands on a 3
  assert.deepEqual([kirin.player.length, kirin.playerTotal, kirin.winner], [3, 8, 'player']);
  assert.equal(betOutcome('kirin', kirin), 'win');
  assert.equal(returnFor('kirin', 10, 'win', PAYOUTS), 260);
  const twoCard8 = dealRound(shoe(4, 3, 4, 3));
  assert.equal(betOutcome('kirin', twoCard8), 'lose', 'a natural 8 is not a Kirin');

  const phoenix = dealRound(shoe(3, 2, 3, 2, 3)); // Player 6 stands, Banker 4 draws a 3: 7
  assert.deepEqual([phoenix.banker.length, phoenix.bankerTotal, phoenix.winner], [3, 7, 'banker']);
  assert.equal(betOutcome('phoenix', phoenix), 'win');
  assert.equal(returnFor('phoenix', 10, 'win', PAYOUTS), 410);
  assert.equal(betOutcome('kirin', phoenix), 'lose');
});

test('baccarat: every losing bet counts as lost (for the vault), even when the player comes out ahead', () => {
  const phoenix = dealRound(shoe(3, 2, 3, 2, 3)); // the Banker wins with three cards worth 7
  assert.equal(lostChips(settleBets({ banker: 100, kirin: 10 }, phoenix, PAYOUTS)), 10, 'Banker won, Kirin lost: 10 lost');
  assert.equal(lostChips(settleBets({ player: 50, banker: 100, tie: 5, phoenix: 10 }, phoenix, PAYOUTS)), 55, 'Player and Tie lost');
  const tie = dealRound(shoe(9, 9, 0, 0));
  assert.equal(lostChips(settleBets({ player: 100, banker: 100 }, tie, PAYOUTS)), 0, 'a tie gives Player and Banker back');
  assert.equal(lostChips(settleBets({ player: 100, tie: 10 }, tie, PAYOUTS)), 0);
});

test('baccarat: a table of bets is settled together, in spot order', () => {
  const round = dealRound(shoe(3, 2, 3, 2, 3)); // the Banker wins with three cards worth 7
  const settled = settleBets({ phoenix: 10, player: 50, banker: 100 }, round, PAYOUTS);
  assert.deepEqual(settled.map((b) => [b.spot, b.outcome, b.returned]), [['player', 'lose', 0], ['banker', 'win', 195], ['phoenix', 'win', 410]]);
  assert.equal(totalBet({ phoenix: 10, player: 50, banker: 100 }), 160);
});

test('baccarat: over every deal, the house keeps its usual share of each bet', () => {
  // Every deal, card by card: a card is 0 four times in 13 (10, J, Q, K) and 1 to 9 once each.
  const weight = (points: number): number => (points === 0 ? 4 : 1) / 13;
  const back = Object.fromEntries(BACCARAT_BETS.map((spot) => [spot, 0])) as Record<(typeof BACCARAT_BETS)[number], number>;
  const deal = (cards: number[], chance: number): void => {
    let round: BaccaratRound;
    try {
      round = dealRound([...cards.map(c)]);
    } catch {
      for (let p = 0; p <= 9; p++) deal([...cards, p], chance * weight(p));
      return;
    }
    for (const spot of BACCARAT_BETS) back[spot] += chance * (returnFor(spot, 1_000_000, betOutcome(spot, round), PAYOUTS) / 1_000_000);
  };
  deal([], 1);
  // These are for an endless shoe, so they sit a little off the published 8-deck figures.
  const close = (spot: keyof typeof back, want: number) => assert.ok(Math.abs(back[spot] - want) < 0.004, `${spot} pays back ${back[spot]}, not about ${want}`);
  close('player', 0.9876);
  close('banker', 0.9894);
  close('tie', 0.8564);
  close('kirin', 0.8981);
  close('phoenix', 0.9237);
});

test('baccarat: a fresh shoe deals four to six real cards', () => {
  for (let i = 0; i < 50; i++) {
    const round = dealRound();
    assert.ok(round.player.length + round.banker.length >= 4 && round.player.length + round.banker.length <= 6);
    assert.equal(round.order.length, round.player.length + round.banker.length);
    assert.equal(round.playerTotal, handTotal(round.player));
  }
});

// ---------------------------------------------------------------------------
// Settings and the command

test('baccarat: the settings exist in their own group, start at the casino payouts, and min stays under max', () => {
  assert.deepEqual(DEFAULTS.baccarat, { minBet: 1, maxBet: 10_000, payout: { banker: 0.95, tie: 8, kirin: 25, phoenix: 40 } });
  assert.deepEqual(CONFIG.baccarat, DEFAULTS.baccarat);
  const keys = SPECS.filter((s) => s.key.startsWith('baccarat.')).map((s) => s.key);
  assert.deepEqual(keys, ['baccarat.minBet', 'baccarat.maxBet', 'baccarat.payout.banker', 'baccarat.payout.tie', 'baccarat.payout.kirin', 'baccarat.payout.phoenix']);
  for (const key of keys) assert.equal(findSpec(key)?.group, 'Baccarat');
  assert.deepEqual(validateSettings(structuredClone(DEFAULTS)), []);
  const wrong = structuredClone(DEFAULTS);
  wrong.baccarat.minBet = 20_000;
  assert.match(checkConstraints(wrong) ?? '', /baccarat.minBet/);
});

test('baccarat: it is a game on the site with chips from 1 to 5,000, and the command says what the side bets pay', () => {
  assert.deepEqual(GAMES.baccarat, { page: '/games/baccarat', socket: BACCARAT_WEB.path });
  assert.deepEqual([BACCARAT_CHIPS[0], BACCARAT_CHIPS.at(-1)], [1, 5000]);
  const intro = TEXT.baccarat.intro('0.95', '8', '25', '40', '10,000');
  assert.match(intro, /Kirin\*\* pays 25 to 1/);
  assert.match(intro, /Phoenix\*\* pays 40 to 1/);
  assert.match(intro, /Up to 10,000/);
});
