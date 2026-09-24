import { PermissionFlagsBits, type Guild, type SendableChannels } from 'discord.js';

/** What the bot needs in a channel it is going to post in (events, or `k!config set channel`'s own checks). */
const NEEDED = [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.EmbedLinks];

export type ChannelProblem = 'missing' | 'not_text' | 'no_permission';

export type ChannelCheck = { ok: true; channel: SendableChannels } | { ok: false; problem: ChannelProblem };

/** Finds the channel in the server and checks the bot can post events there. */
export async function checkEventChannel(guild: Guild, channelId: string): Promise<ChannelCheck> {
  const channel = await guild.channels.fetch(channelId).catch(() => null);
  if (!channel) return { ok: false, problem: 'missing' };
  if (!channel.isTextBased() || channel.isThread() || !channel.isSendable()) return { ok: false, problem: 'not_text' };

  const me = guild.members.me ?? (await guild.members.fetchMe().catch(() => null));
  const allowed = me ? channel.permissionsFor(me) : null;
  if (!allowed?.has(NEEDED)) return { ok: false, problem: 'no_permission' };
  return { ok: true, channel };
}
