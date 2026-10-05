export interface ParsedCommand {
  name: string;
  args: string[];
}

export function parseCommand(content: string, prefix: string): ParsedCommand | null {
  // Neither the prefix nor the command name is case-sensitive: "K!Claim" works like "k!claim".
  if (content.slice(0, prefix.length).toLowerCase() !== prefix.toLowerCase()) return null;
  const rest = content.slice(prefix.length);
  if (rest.length === 0 || /^\s/.test(rest)) return null;

  const [name, ...args] = rest.trim().split(/\s+/);
  if (!name) return null;
  return { name: name.toLowerCase(), args };
}

/**
 * Everything after the command's name in a message, as typed (line breaks kept), or '' when nothing
 * follows it. For commands that take free text, like patch notes, which the words in `args` would flatten.
 */
export function textAfterCommand(content: string, prefix: string): string {
  return content.slice(prefix.length).trimStart().replace(/^\S+/, '').trim();
}

const USER_ARG = /^(?:<@!?(\d{17,20})>|(\d{17,20}))$/;

export function parseUserArg(arg: string | undefined): string | null {
  if (!arg) return null;
  const match = USER_ARG.exec(arg);
  return match ? (match[1] ?? match[2] ?? null) : null;
}

const CHANNEL_ARG = /^(?:<#(\d{17,20})>|(\d{17,20}))$/;

/** The channel id in a channel mention like `<#123456789012345678>`, or a bare id. Null if it is neither. */
export function parseChannelArg(arg: string | undefined): string | null {
  if (!arg) return null;
  const match = CHANNEL_ARG.exec(arg);
  return match ? (match[1] ?? match[2] ?? null) : null;
}
