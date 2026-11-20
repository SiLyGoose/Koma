import { CONFIG } from '../../config.js';
import { race, settleBets } from '../../lib/game/casino/duckrace.js';
import { playTableGame } from './table.js';
/** One race for one player: their bets, settled against `deal`'s race. */
export function playDuckRace(guildId, userId, bets, deal = () => race()) {
    const { minBet, maxBet, payout } = CONFIG.duckRace;
    return playTableGame(guildId, userId, bets, {
        minBet,
        maxBet,
        deal,
        settle: (b, round) => settleBets(b, round, payout),
        reasons: { bet: 'duckrace_bet', payout: 'duckrace_payout' },
    });
}
//# sourceMappingURL=duckrace.js.map