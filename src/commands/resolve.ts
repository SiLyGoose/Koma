import type { Message, User } from 'discord.js';
import { TEXT } from '../constants.js';
import { parseUserArg } from '../lib/parse.js';
import { getPrefix } from '../services/settings.js';

/** Turns a mention or user ID argument into a user who is a member of this server, or null. */
export async function resolveUserArg(message: Message<true>, arg: string): Promise<User | null> {
  const id = parseUserArg(arg);
  if (!id) return null;
  try {
    const member = await message.guild.members.fetch(id);
    return member.user;
  } catch {
    return null;
  }
}

export function memberNotFound(usage: string): string {
  return TEXT.common.memberNotFound(getPrefix(), usage);
}
