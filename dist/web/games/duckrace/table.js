import { CONFIG } from '../../../config.js';
import { DUCK_RACE_TABLE, DUCK_RACE_WEB, DUCKS, TABLE_CHIPS } from '../../../constants/index.js';
import { parseBets, race } from '../../../lib/game/casino/duckrace.js';
import { playDuckRace } from '../../../services/economy/index.js';
import { PartyTables, realBaseDeps } from '../table/table.js';
export const duckRaceGame = {
    live: 'duckrace',
    table: DUCK_RACE_TABLE,
    web: DUCK_RACE_WEB,
    chips: TABLE_CHIPS,
    limits: () => CONFIG.duckRace,
    parseBets,
    view: (round, previous) => ({
        winner: round.winner,
        order: round.order,
        splits: round.splits,
        recent: [round.winner, ...(previous?.recent ?? [])].slice(0, DUCK_RACE_TABLE.recent),
    }),
    extras: () => ({ payout: CONFIG.duckRace.payout }),
    outcome: (round) => `${DUCKS[round.winner].name} wins`,
};
export const realTableDeps = { ...realBaseDeps, play: playDuckRace, deal: () => race() };
export const duckRaceTables = new PartyTables(duckRaceGame, realTableDeps);
/** The tables open in a server. */
export const tablesIn = (guildId) => duckRaceTables.in(guildId);
/** For tests: forgets every table. */
export const resetTables = () => duckRaceTables.reset();
//# sourceMappingURL=table.js.map