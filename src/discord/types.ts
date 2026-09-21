import type { BaseMessageOptions, Guild, Message, MessageEditOptions, User } from 'discord.js';

/** What a command can send. */
export type ReplyOptions = Pick<BaseMessageOptions, 'content' | 'embeds' | 'files' | 'components' | 'allowedMentions'> & {
  /**
   * Slash commands only: whether just the person who ran the command sees this reply. Left out,
   * a plain text reply (an error, a hint) is private and one with an embed is public. Ignored
   * for prefix commands, whose replies are always public.
   */
  ephemeral?: boolean;
};

/** What a command can change on a reply it already sent. */
export type EditOptions = Pick<MessageEditOptions, 'content' | 'embeds' | 'files' | 'components' | 'attachments'>;

/** A reply a command sent, which it can then edit or put buttons on. */
export interface SentReply {
  /** The message itself, for listening to its buttons. */
  fetchMessage(): Promise<Message>;
  /** Replaces what the reply shows. */
  edit(options: EditOptions): Promise<void>;
}

/**
 * Everything a command needs to know about how it was called and how to answer. A command runs
 * the same whether it was typed as a prefix command ("k!rob @user") or picked as a slash command
 * ("/rob user:@user"): the context hides the difference.
 */
export interface CommandContext {
  source: 'message' | 'slash';
  /** What goes before a command name in hints: the prefix for messages, "/" for slash commands. */
  prefix: string;
  guildId: string;
  guild: Guild;
  /** Who ran the command. */
  user: User;
  /**
   * The words after the command name. A slash command's options are turned into the same words
   * (see discord/slash.ts), so the command reads them the same way in both cases.
   */
  args: string[];
  /** Sends a reply. The first reply answers the command; later ones are extra messages. */
  reply(options: string | ReplyOptions): Promise<SentReply>;
}

export interface Command {
  name: string;
  aliases?: string[];
  description: string;
  /** Shown by the help command without the prefix, e.g. "rob @user". Defaults to the name. */
  usage?: string;
  /** How help shows it for slash commands, without the slash, e.g. "rob user". Defaults to the name. */
  slashUsage?: string;
  /** Only the bot admin can use it, so the help command lists it for the admin only. */
  adminOnly?: boolean;
  execute(ctx: CommandContext): Promise<void>;
}
