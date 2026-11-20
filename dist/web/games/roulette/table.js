import { CONFIG } from '../../../config.js';
import { ROULETTE_TABLE, ROULETTE_WEB, TABLE_CHIPS } from '../../../constants/index.js';
import { parseBets, spin } from '../../../lib/game/casino/roulette.js';
import { playRoulette } from '../../../services/economy/index.js';
import { PartyTables, realBaseDeps } from '../table/table.js';
const COLOR_NAME = { red: 'Red', black: 'Black', green: 'Green' };
export const rouletteGame = {
    live: 'roulette',
    table: ROULETTE_TABLE,
    web: ROULETTE_WEB,
    chips: TABLE_CHIPS,
    limits: () => CONFIG.roulette,
    parseBets,
    view: (round, previous) => ({
        number: round.number,
        color: round.color,
        recent: [round.number, ...(previous?.recent ?? [])].slice(0, ROULETTE_TABLE.recent),
    }),
    extras: () => ({}),
    outcome: (round) => `${round.number} ${COLOR_NAME[round.color]}`,
};
export const realTableDeps = { ...realBaseDeps, play: playRoulette, deal: () => spin() };
export const rouletteTables = new PartyTables(rouletteGame, realTableDeps);
/** The tables open in a server. */
export const tablesIn = (guildId) => rouletteTables.in(guildId);
/** For tests: forgets every table. */
export const resetTables = () => rouletteTables.reset();
//# sourceMappingURL=table.js.map