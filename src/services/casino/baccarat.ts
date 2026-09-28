import { CONFIG } from '../../config.js';
import type { BaccaratBet } from '../../constants/index.js';
import { dealRound, settleBets, type BaccaratBets, type BaccaratRound } from '../../lib/game/casino/baccarat.js';
import { playTableGame, type TableResult } from './table.js';

/*
 * Baccarat rounds (see table.ts for how the points move).
 */

export type BaccaratResult = TableResult<BaccaratRound, BaccaratBet>;

/** One round of baccarat for one player: their bets, settled against `deal`'s round. */
export function playBaccarat(guildId: string, userId: string, bets: BaccaratBets, deal: () => BaccaratRound = dealRound): Promise<BaccaratResult> {
  const { minBet, maxBet, payout } = CONFIG.baccarat;
  return playTableGame(guildId, userId, bets, {
    minBet,
    maxBet,
    deal,
    settle: (b, round) => settleBets(b, round, payout),
    reasons: { bet: 'baccarat_bet', payout: 'baccarat_payout' },
  });
}
