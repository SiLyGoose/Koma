import { CONFIG } from '../../config.js';
import { settleBets, spin } from '../../lib/game/casino/roulette.js';
import { playTableGame } from './table.js';
/** One round of roulette for one player: their bets, settled against `deal`'s spin. */
export function playRoulette(guildId, userId, bets, deal = () => spin()) {
    const { minBet, maxBet } = CONFIG.roulette;
    return playTableGame(guildId, userId, bets, {
        minBet,
        maxBet,
        deal,
        settle: settleBets,
        reasons: { bet: 'roulette_bet', payout: 'roulette_payout' },
    });
}
//# sourceMappingURL=roulette.js.map