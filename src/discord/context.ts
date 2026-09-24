import {
  MessageFlags,
  type ChatInputCommandInteraction,
  type Guild,
  type InteractionEditReplyOptions,
  type InteractionReplyOptions,
  type Message,
  type MessageEditOptions,
} from 'discord.js';
import { SLASH_DEFER_AFTER_MS } from '../constants/index.js';
import { reply } from './reply.js';
import type { CommandContext, EditOptions, ReplyOptions, SentReply } from './types.js';

/** What goes before a command name in hints when the command was a slash command. */
export const SLASH_PREFIX = '/';

const toOptions = (options: string | ReplyOptions): ReplyOptions => (typeof options === 'string' ? { content: options } : options);

/** Slash replies that are only text (an error, a hint) are private; ones with an embed or picture are public. */
export function isEphemeral(options: ReplyOptions): boolean {
  if (options.ephemeral !== undefined) return options.ephemeral;
  return (options.embeds?.length ?? 0) === 0 && (options.files?.length ?? 0) === 0;
}

/** The context for a prefix command: a message someone sent in a server. */
export function messageContext(message: Message<true>, args: string[], prefix: string): CommandContext {
  return {
    source: 'message',
    prefix,
    guildId: message.guildId,
    guild: message.guild,
    user: message.author,
    args,
    async reply(options) {
      const { ephemeral: _ephemeral, ...rest } = toOptions(options);
      const sent = await reply(message, rest);
      return {
        fetchMessage: async () => sent,
        edit: async (edit: EditOptions) => {
          await sent.edit(edit);
        },
      };
    },
  };
}

/** A slash command's context, and a way to end it once the command has finished. */
export interface InteractionContext {
  ctx: CommandContext;
  /** Stops the "thinking..." timer. Call it when the command is done, whether it worked or not. */
  dispose(): void;
}

/**
 * The context for a slash command. Discord wants an answer within 3 seconds or the command
 * shows as failed, so if the command hasn't replied after `deferAfterMs` the interaction is
 * acknowledged with "Koma is thinking..." and the first reply then fills that in (a reply made
 * that late is always public, because Discord decides that when acknowledging).
 */
export function interactionContext(
  interaction: ChatInputCommandInteraction,
  guild: Guild,
  args: string[],
  deferAfterMs = SLASH_DEFER_AFTER_MS,
): InteractionContext {
  let state: 'fresh' | 'deferred' | 'answered' = 'fresh';
  let deferred: Promise<unknown> = Promise.resolve();
  let first: Message | null = null;

  const timer = setTimeout(() => {
    if (state !== 'fresh') return;
    state = 'deferred';
    deferred = interaction.deferReply().catch((err) => {
      console.error('Could not acknowledge the slash command:', err);
    });
  }, deferAfterMs);
  timer.unref();

  const asSent = (message: Message): SentReply => ({
    fetchMessage: async () => message,
    edit: async (edit: EditOptions) => {
      // The first reply is the interaction's own message; anything sent after it is a follow-up.
      if (first !== null && message.id === first.id) await interaction.editReply(edit);
      else await interaction.webhook.editMessage(message, edit as MessageEditOptions);
    },
  });

  const ctx: CommandContext = {
    source: 'slash',
    prefix: SLASH_PREFIX,
    guildId: guild.id,
    guild,
    user: interaction.user,
    args,
    async reply(options) {
      const wanted = toOptions(options);
      const { ephemeral: _ephemeral, ...rest } = wanted;
      const allowedMentions = { parse: [] as never[], ...rest.allowedMentions };
      const body = { ...rest, allowedMentions } as InteractionReplyOptions;

      if (state === 'fresh') {
        state = 'answered';
        clearTimeout(timer);
        await interaction.reply(isEphemeral(wanted) ? { ...body, flags: MessageFlags.Ephemeral } : body);
        first = await interaction.fetchReply();
        return asSent(first);
      }
      if (state === 'deferred') {
        state = 'answered';
        await deferred;
        first = await interaction.editReply(body as InteractionEditReplyOptions);
        return asSent(first);
      }
      return asSent(await interaction.followUp(isEphemeral(wanted) ? { ...body, flags: MessageFlags.Ephemeral } : body));
    },
  };

  return { ctx, dispose: () => clearTimeout(timer) };
}
