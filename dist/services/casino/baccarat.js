import { CONFIG } from '../../config.js';
import { dealRound, settleBets } from '../../lib/game/casino/baccarat.js';
import { playTableGame } from './table.js';
/** One round of baccarat for one player: their bets, settled against `deal`'s round. */
export function playBaccarat(guildId, userId, bets, deal = dealRound) {
    const { minBet, maxBet, payout } = CONFIG.baccarat;
    return playTableGame(guildId, userId, bets, {
        minBet,
        maxBet,
        deal,
        settle: (b, round) => settleBets(b, round, payout),
        reasons: { bet: 'baccarat_bet', payout: 'baccarat_payout' },
    });
}
//# sourceMappingURL=baccarat.js.map