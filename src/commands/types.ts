import type { Message } from 'discord.js';

export interface CommandContext {
  /** A message sent inside a server. */
  message: Message<true>;
  /** The words after the command name, split on whitespace. */
  args: string[];
}

export interface Command {
  name: string;
  aliases?: string[];
  description: string;
  /** Shown by the help command without the prefix, e.g. "rob @user". Defaults to the name. */
  usage?: string;
  execute(ctx: CommandContext): Promise<void>;
}
