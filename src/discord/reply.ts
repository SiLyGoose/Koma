import type { Message, MessageReplyOptions } from 'discord.js';

/**
 * Replies to a message without pinging anyone by default. To ping someone on purpose, pass
 * `allowedMentions: { users: [id] }` in the options.
 */
export function reply(message: Message, options: string | MessageReplyOptions) {
  const base: MessageReplyOptions = typeof options === 'string' ? { content: options } : options;
  return message.reply({
    ...base,
    allowedMentions: { parse: [], repliedUser: false, ...base.allowedMentions },
  });
}
