import { CONFIG } from '../../config.js';
import { race, settleBets, type Duck, type DuckRaceBets, type DuckRaceRound } from '../../lib/game/casino/duckrace.js';
import { playTableGame, type TableResult } from './table.js';

/*
 * Duck races (see table.ts for how the points move).
 */

export type DuckRaceResult = TableResult<DuckRaceRound, Duck>;

/** One race for one player: their bets, settled against `deal`'s race. */
export function playDuckRace(guildId: string, userId: string, bets: DuckRaceBets, deal: () => DuckRaceRound = () => race()): Promise<DuckRaceResult> {
  const { minBet, maxBet, payout } = CONFIG.duckRace;
  return playTableGame(guildId, userId, bets, {
    minBet,
    maxBet,
    deal,
    settle: (b, round) => settleBets(b, round, payout),
    reasons: { bet: 'duckrace_bet', payout: 'duckrace_payout' },
  });
}
