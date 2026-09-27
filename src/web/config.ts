import { MINE_WEB, PINECRAFT_WEB } from '../constants/index.js';
import { optionalEnv } from '../env.js';

/*
 * The games' web site (the Koma-UI repo) and the bot's side of it, from .env:
 *   WEB_URL                the site, like https://koma-ui.vercel.app
 *   WEB_API_URL            the bot's public address, like https://koma.duckdns.org (Caddy passes it on to WEB_PORT)
 *   WEB_PORT               the port the bot listens on, on this machine only (8787 if left out)
 *   DS_CLIENT_SECRET       lets members log in on the site with Discord (Developer Portal > OAuth2).
 *                          Without it the games are only opened from links handed out in Discord.
 *
 * The older MINE_WEB_URL (the mine's page), MINE_WS_URL (its wss:// address) and MINE_WEB_PORT still
 * work in place of the first three.
 *
 * Without a site, the mine is played with buttons in Discord and Pinecraft isn't played at all.
 */

export interface WebConfig {
  /** The site, with no trailing slash. */
  siteUrl: string;
  /** Its origin, which requests and connections must come from. */
  origin: string;
  /** The bot's public https:// address (its origin), and the same as wss:// for the games' web sockets. */
  apiUrl: string;
  socketUrl: string;
  port: number;
  clientSecret: string | null;
}

/** The web settings, or null when there is no site. Throws on settings that are half there or wrong. */
export function readWebConfig(env: NodeJS.ProcessEnv = process.env): WebConfig | null {
  const get = (name: string) => (env === process.env ? optionalEnv(name) : env[name]?.trim() || undefined);
  const oldPage = get('MINE_WEB_URL');
  const oldSocket = get('MINE_WS_URL');
  const site = get('WEB_URL') ?? (oldPage ? new URL(oldPage).origin : undefined);
  const api = get('WEB_API_URL') ?? (oldSocket ? oldSocket.replace(/^ws/, 'http') : undefined);
  if (!site && !api) return null;
  if (!site || !api) throw new Error('Set both WEB_URL and WEB_API_URL to play the games on the web, or neither.');

  const siteUrl = new URL(site);
  if (siteUrl.protocol !== 'https:' && siteUrl.hostname !== 'localhost') throw new Error('WEB_URL must be an https:// address');
  const apiUrl = new URL(api);
  if (apiUrl.protocol !== 'https:' && apiUrl.hostname !== 'localhost') throw new Error('WEB_API_URL must be an https:// address');

  const portText = get('WEB_PORT') ?? get('MINE_WEB_PORT');
  const port = portText === undefined ? MINE_WEB.defaultPort : Number(portText);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('WEB_PORT must be a port number');

  return {
    siteUrl: site.replace(/\/+$/, ''),
    origin: siteUrl.origin,
    apiUrl: apiUrl.origin,
    socketUrl: apiUrl.origin.replace(/^http/, 'ws'),
    port,
    clientSecret: get('DS_CLIENT_SECRET') ?? null,
  };
}

let current: WebConfig | null = null;

/** Set once at start (index.ts). */
export function setWebConfig(config: WebConfig | null): void {
  current = config;
}

export const webConfig = (): WebConfig | null => current;

/** The games on the site: where each one's page is, and its web socket. */
export const GAMES = {
  mines: { page: '/games/mines', socket: MINE_WEB.path },
  pinecraft: { page: '/games/pinecraft', socket: PINECRAFT_WEB.path },
} as const;
export type Game = keyof typeof GAMES;

/** The link that opens `game` for the holder of `token`. The token rides in the part after #, which browsers never send to the site's host. */
export const gameLink = (config: WebConfig, game: Game, token: string): string =>
  `${config.siteUrl}${GAMES[game].page}/#t=${encodeURIComponent(token)}&s=${encodeURIComponent(config.socketUrl + GAMES[game].socket)}`;

/** The link that opens `game` to watch someone, for the holder of a watch token (see signWatchToken). */
export const watchLink = (config: WebConfig, game: Game, token: string): string =>
  `${config.siteUrl}${GAMES[game].page}/#w=${encodeURIComponent(token)}&s=${encodeURIComponent(config.socketUrl + GAMES[game].socket)}`;
