import { BACCARAT_WEB, CODEDLE_WEB, DIVINE_WEB, DRAGON_WEB, MINE_WEB, MINESWEEPER_WEB, PINECRAFT_WEB, POKER_WEB, RAID_WEB, ROULETTE_WEB, TM_WEB } from '../constants/index.js';
import { optionalEnv } from '../env.js';
/** The web settings, or null when there is no site. Throws on settings that are half there or wrong. */
export function readWebConfig(env = process.env) {
    const get = (name) => (env === process.env ? optionalEnv(name) : env[name]?.trim() || undefined);
    const oldPage = get('MINE_WEB_URL');
    const oldSocket = get('MINE_WS_URL');
    const site = get('WEB_URL') ?? (oldPage ? new URL(oldPage).origin : undefined);
    const api = get('WEB_API_URL') ?? (oldSocket ? oldSocket.replace(/^ws/, 'http') : undefined);
    if (!site && !api)
        return null;
    if (!site || !api)
        throw new Error('Set both WEB_URL and WEB_API_URL to play the games on the web, or neither.');
    const siteUrl = new URL(site);
    if (siteUrl.protocol !== 'https:' && siteUrl.hostname !== 'localhost')
        throw new Error('WEB_URL must be an https:// address');
    const apiUrl = new URL(api);
    if (apiUrl.protocol !== 'https:' && apiUrl.hostname !== 'localhost')
        throw new Error('WEB_API_URL must be an https:// address');
    const portText = get('WEB_PORT') ?? get('MINE_WEB_PORT');
    const port = portText === undefined ? MINE_WEB.defaultPort : Number(portText);
    if (!Number.isInteger(port) || port < 1 || port > 65535)
        throw new Error('WEB_PORT must be a port number');
    return {
        siteUrl: site.replace(/\/+$/, ''),
        origin: siteUrl.origin,
        apiUrl: apiUrl.origin,
        socketUrl: apiUrl.origin.replace(/^http/, 'ws'),
        port,
        clientSecret: get('DS_CLIENT_SECRET') ?? null,
    };
}
let current = null;
/** Set once at start (index.ts). */
export function setWebConfig(config) {
    current = config;
}
export const webConfig = () => current;
/** The games on the site: where each one's page is, and its web socket. */
export const GAMES = {
    mines: { page: '/games/mines', socket: MINE_WEB.path },
    pinecraft: { page: '/games/pinecraft', socket: PINECRAFT_WEB.path },
    baccarat: { page: '/games/baccarat', socket: BACCARAT_WEB.path },
    roulette: { page: '/games/roulette', socket: ROULETTE_WEB.path },
    poker: { page: '/games/poker', socket: POKER_WEB.path },
    raid: { page: '/games/raid', socket: RAID_WEB.path },
    minesweeper: { page: '/games/minesweeper', socket: MINESWEEPER_WEB.path },
    technomagic: { page: '/games/technomagic', socket: TM_WEB.path },
    dragon: { page: '/games/dragon', socket: DRAGON_WEB.path },
    divine: { page: '/games/divine', socket: DIVINE_WEB.path },
    codedle: { page: '/games/codedle', socket: CODEDLE_WEB.path },
};
/**
 * The site's link to `game` in a server, for anyone: the front page logs them in with Discord (if
 * they aren't already) and opens it. What the bot's buttons in Discord link to.
 */
export const siteGameLink = (config, game, guildId, more = {}) => `${config.siteUrl}/?${new URLSearchParams({ play: game, guild: guildId, ...more })}`;
/** The site's link into a server's TechnoMagic Raid with others: raid `room`, or (none) its Find Raid. */
export const technomagicRoomLink = (config, guildId, room) => siteGameLink(config, 'technomagic', guildId, { mode: 'multi', ...(room && { room }) });
/** The site's link into a server's Dragon Raid against `boss` (a dragon) with others: raid `room`, or (none) its Find Raid. */
export const dragonRoomLink = (config, guildId, boss, room) => siteGameLink(config, 'dragon', guildId, { mode: 'multi', boss, ...(room && { room }) });
/** The link that opens `game` for the holder of `token`. The token rides in the part after #, which browsers never send to the site's host. */
export const gameLink = (config, game, token) => `${config.siteUrl}${GAMES[game].page}/#t=${encodeURIComponent(token)}&s=${encodeURIComponent(config.socketUrl + GAMES[game].socket)}`;
/** The link that opens `game` to watch someone, for the holder of a watch token (see signWatchToken). */
export const watchLink = (config, game, token) => `${config.siteUrl}${GAMES[game].page}/#w=${encodeURIComponent(token)}&s=${encodeURIComponent(config.socketUrl + GAMES[game].socket)}`;
//# sourceMappingURL=config.js.map