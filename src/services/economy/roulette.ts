import { CONFIG } from '../../config.js';
import { settleBets, spin, type RouletteBets, type RouletteRound, type RouletteSpot } from '../../lib/game/roulette.js';
import { playTableGame, type TableResult } from './table.js';

/*
 * Roulette rounds (see table.ts for how the points move).
 */

export type RouletteResult = TableResult<RouletteRound, RouletteSpot>;

/** One round of roulette for one player: their bets, settled against `deal`'s spin. */
export function playRoulette(guildId: string, userId: string, bets: RouletteBets, deal: () => RouletteRound = () => spin()): Promise<RouletteResult> {
  const { minBet, maxBet } = CONFIG.roulette;
  return playTableGame(guildId, userId, bets, {
    minBet,
    maxBet,
    deal,
    settle: settleBets,
    reasons: { bet: 'roulette_bet', payout: 'roulette_payout' },
  });
}
