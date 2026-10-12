import type { Guild, MessageCreateOptions } from 'discord.js';
import { getNotifyRoleId, type NotifyRoleKey } from '../services/roles.js';

type Ping = Pick<MessageCreateOptions, 'content' | 'allowedMentions'>;

/**
 * What to add to a message to ping `roleId`: its mention as the message text, and permission to
 * actually ping it (replies ping nobody otherwise). Nothing when there is no role, or the server
 * doesn't have it.
 */
export function pingFor(guild: Guild, roleId: string | null): Ping {
  if (roleId === null || !guild.roles.cache.has(roleId)) return {};
  return { content: `<@&${roleId}>`, allowedMentions: { parse: [], roles: [roleId] } };
}

/** The ping for one of the server's notification roles (`config set notifyRole` / `raidRole`). Nothing if it can't be looked up. */
async function rolePing(guild: Guild, key: NotifyRoleKey): Promise<Ping> {
  const roleId = await getNotifyRoleId(guild.id, key).catch((err) => {
    console.error(`Could not look up the ${key} role to ping in ${guild.id}:`, err);
    return null;
  });
  return pingFor(guild, roleId);
}

/** For an event's first message: pings the server's notification role, so members who opted in hear of it. */
export function eventPing(guild: Guild): Promise<Ping> {
  return rolePing(guild, 'general');
}

/** For a raid's first message (its lobby, as the preparation starts): pings the server's raid role. */
export function raidPing(guild: Guild): Promise<Ping> {
  return rolePing(guild, 'raid');
}
