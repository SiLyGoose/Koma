import { ActivityType, type Client } from 'discord.js';
import { STATUS, TEXT } from '../constants/index.js';

/*
 * The bot's status in the member list: how long it has been up, in a joke line (TEXT.status) that
 * changes every so often. Discord doesn't count the time up for a bot, so the text is redone every
 * STATUS.refreshMs.
 */

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/** `ms` as its two biggest units, like "3d 4h", "4h 12m" or "12m" (whole ones, rounded down). */
export function formatUptime(ms: number): string {
  const days = Math.floor(ms / DAY);
  const hours = Math.floor((ms % DAY) / HOUR);
  const minutes = Math.floor((ms % HOUR) / MINUTE);
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

/** The status after `uptimeMs` up: the line for this stretch of STATUS.rotateMs, with the uptime in it. */
export function statusLine(uptimeMs: number): string {
  if (uptimeMs < MINUTE) return TEXT.status.justWoke;
  const lines = TEXT.status.lines;
  const line = lines[Math.floor(uptimeMs / STATUS.rotateMs) % lines.length] as (uptime: string) => string;
  return line(formatUptime(uptimeMs));
}

/** How long the process has been up, in ms. */
const processUptime = (): number => process.uptime() * 1000;

/** Shows the status now and keeps it up to date. Returns what stops it. Never throws: the status is decoration. */
export function startStatus(client: Client<true>, uptime: () => number = processUptime): () => void {
  const show = (): void => {
    try {
      client.user.setPresence({ activities: [{ type: ActivityType.Custom, name: 'Custom Status', state: statusLine(uptime()) }] });
    } catch (err) {
      console.error("Could not update the bot's status:", err);
    }
  };
  show();
  const timer = setInterval(show, STATUS.refreshMs);
  timer.unref();
  return () => clearInterval(timer);
}
