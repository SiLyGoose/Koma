import { PermissionFlagsBits, type Guild, type SendableChannels } from 'discord.js';

/** What the bot needs in a channel it is going to post in (events, or `k!config set channel`'s own checks). */
const NEEDED = [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.EmbedLinks];

/** The newsletter's channel needs a little more: the weekly digest attaches the new raid boss's picture. */
export const NEWSLETTER_NEEDED = [...NEEDED, PermissionFlagsBits.AttachFiles];

export type ChannelProblem = 'missing' | 'not_text' | 'no_permission';

export type ChannelCheck = { ok: true; channel: SendableChannels } | { ok: false; problem: ChannelProblem };

/** Finds the channel in the server and checks the bot can post events there (or, with `needed`, whatever goes there). */
export async function checkEventChannel(guild: Guild, channelId: string, needed: bigint[] = NEEDED): Promise<ChannelCheck> {
  const channel = await guild.channels.fetch(channelId).catch(() => null);
  if (!channel) return { ok: false, problem: 'missing' };
  if (!channel.isTextBased() || channel.isThread() || !channel.isSendable()) return { ok: false, problem: 'not_text' };

  const me = guild.members.me ?? (await guild.members.fetchMe().catch(() => null));
  const allowed = me ? channel.permissionsFor(me) : null;
  if (!allowed?.has(needed)) return { ok: false, problem: 'no_permission' };
  return { ok: true, channel };
}
