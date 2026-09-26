import type { Guild, MessageCreateOptions } from 'discord.js';
import { EVENT_PING_ROLE_IDS } from '../constants/index.js';

/**
 * What to add to an event's first message to ping the event roles (EVENT_PING_ROLE_IDS) this server
 * has: their mentions as the message text, and permission to actually ping them (replies ping
 * nobody otherwise). Nothing when the server has none of them.
 */
export function eventPing(guild: Guild): Pick<MessageCreateOptions, 'content' | 'allowedMentions'> {
  const roles = EVENT_PING_ROLE_IDS.filter((id) => guild.roles.cache.has(id));
  if (roles.length === 0) return {};
  return { content: roles.map((id) => `<@&${id}>`).join(' '), allowedMentions: { parse: [], roles } };
}
