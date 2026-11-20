import { MessageFlags, type Message, type MessageReplyOptions, type RepliableInteraction } from 'discord.js';

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

/** Answers a button press or pop-up with a message only the presser sees. Never throws: a failed answer is just dropped. */
export function replyPrivately(interaction: RepliableInteraction, content: string): Promise<void> {
  return interaction
    .reply({ content, flags: MessageFlags.Ephemeral })
    .then(() => undefined)
    .catch(() => undefined);
}

/** Like replyPrivately, for an interaction that was already answered or deferred. */
export function followUpPrivately(interaction: RepliableInteraction, content: string): Promise<void> {
  return interaction
    .followUp({ content, flags: MessageFlags.Ephemeral })
    .then(() => undefined)
    .catch(() => undefined);
}
