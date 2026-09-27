import { MINE_WEB } from '../constants/index.js';
import { optionalEnv } from '../env.js';

/*
 * Whether the mine is played on the web page, from .env:
 *   MINE_WEB_URL   the page, like https://koma-ui.vercel.app (without it the mine is played with buttons in Discord)
 *   MINE_WS_URL    the web socket's public address, like wss://koma.duckdns.org/mine
 *   MINE_WEB_PORT  the port the web socket listens on, on this machine (Caddy passes connections to it)
 */

export interface MineWebConfig {
  /** The page, with no trailing slash. */
  pageUrl: string;
  /** Its origin, which connections must come from. */
  origin: string;
  socketUrl: string;
  port: number;
}

/** The web settings, or null when the mine is played in Discord. Throws on settings that are half there or wrong. */
export function readMineWebConfig(env: NodeJS.ProcessEnv = process.env): MineWebConfig | null {
  const get = (name: string) => (env === process.env ? optionalEnv(name) : env[name]?.trim() || undefined);
  const page = get('MINE_WEB_URL');
  const socket = get('MINE_WS_URL');
  if (!page && !socket) return null;
  if (!page || !socket) throw new Error('Set both MINE_WEB_URL and MINE_WS_URL to play the mine on the web, or neither.');

  const pageUrl = new URL(page);
  if (pageUrl.protocol !== 'https:' && pageUrl.hostname !== 'localhost') throw new Error('MINE_WEB_URL must be an https:// address');
  const socketUrl = new URL(socket);
  if (socketUrl.protocol !== 'wss:' && socketUrl.hostname !== 'localhost') throw new Error('MINE_WS_URL must be a wss:// address');

  const portText = get('MINE_WEB_PORT');
  const port = portText === undefined ? MINE_WEB.defaultPort : Number(portText);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('MINE_WEB_PORT must be a port number');

  return { pageUrl: page.replace(/\/+$/, ''), origin: pageUrl.origin, socketUrl: socketUrl.toString(), port };
}

let current: MineWebConfig | null = null;

/** Set once at start (index.ts). */
export function setMineWebConfig(config: MineWebConfig | null): void {
  current = config;
}

export const mineWebConfig = (): MineWebConfig | null => current;

/** The link that opens run `token` on the page. The token rides in the part after #, which browsers never send to the page's host. */
export const playLink = (config: MineWebConfig, token: string): string =>
  `${config.pageUrl}/#t=${encodeURIComponent(token)}&s=${encodeURIComponent(config.socketUrl)}`;
