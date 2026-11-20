import { BACCARAT_BETS, BACCARAT_DECKS } from '../../../constants/index.js';
import { newShoe } from './blackjack.js';
import { lostChips, parseSpotBets, returnAt, sumBets } from './table-bets.js';
export { lostChips };
/** A card's baccarat points: ace 1, 2 to 9 themselves, 10 and faces 0. */
export const cardPoints = (card) => (card.rank >= 10 ? 0 : card.rank);
/** A hand's total: the last digit of its cards' points. */
export const handTotal = (cards) => cards.reduce((sum, card) => sum + cardPoints(card), 0) % 10;
/** Whether the Banker, on `banker` with two cards, draws after the Player drew `playerThird` (points 0 to 9). */
export function bankerDraws(banker, playerThird) {
    if (banker <= 2)
        return true;
    if (banker === 3)
        return playerThird !== 8;
    if (banker === 4)
        return playerThird >= 2 && playerThird <= 7;
    if (banker === 5)
        return playerThird >= 4 && playerThird <= 7;
    if (banker === 6)
        return playerThird === 6 || playerThird === 7;
    return false;
}
/**
 * Deals one round from the top of `shoe` (at least 6 cards). Without one, a freshly shuffled shoe of
 * BACCARAT_DECKS decks. The shoe isn't changed.
 */
export function dealRound(shoe = newShoe(BACCARAT_DECKS)) {
    let next = 0;
    const take = () => {
        const card = shoe[next++];
        if (!card)
            throw new Error('The baccarat shoe ran out of cards');
        return card;
    };
    const player = [take()];
    const banker = [take()];
    player.push(take());
    banker.push(take());
    const order = ['player', 'banker', 'player', 'banker'];
    const natural = handTotal(player) >= 8 || handTotal(banker) >= 8;
    if (!natural) {
        let playerThird = null;
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
    const winner = playerTotal > bankerTotal ? 'player' : bankerTotal > playerTotal ? 'banker' : 'tie';
    return { player, banker, order, playerTotal, bankerTotal, winner, natural };
}
/** How the bet on `spot` came out in `round`. */
export function betOutcome(spot, round) {
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
export const oddsFor = (spot, payouts) => (spot === 'player' ? 1 : payouts[spot]);
/** What a bet of `amount` on `spot` gives back (the bet included): the bet times 1 + its odds on a win, the bet on a push, 0 on a loss. */
export const returnFor = (spot, amount, outcome, payouts) => returnAt(amount, oddsFor(spot, payouts), outcome);
/** Settles every bet on the table (in BACCARAT_BETS order, only the ones with points on). */
export function settleBets(bets, round, payouts) {
    return BACCARAT_BETS.filter((spot) => (bets[spot] ?? 0) > 0).map((spot) => {
        const amount = bets[spot];
        const outcome = betOutcome(spot, round);
        return { spot, amount, outcome, returned: returnFor(spot, amount, outcome, payouts) };
    });
}
/** The points on the table. */
export const totalBet = (bets) => sumBets(bets);
const isBaccaratBet = (spot) => BACCARAT_BETS.includes(spot);
/** Reads bets from the page (see parseSpotBets): null when a spot isn't a baccarat one, or a bet isn't a whole number from 0 up. */
export const parseBets = (data) => parseSpotBets(data, isBaccaratBet);
//# sourceMappingURL=baccarat.js.map