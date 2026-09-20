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

const USER_ARG = /^(?:<@!?(\d{17,20})>|(\d{17,20}))$/;

export function parseUserArg(arg: string | undefined): string | null {
  if (!arg) return null;
  const match = USER_ARG.exec(arg);
  return match ? (match[1] ?? match[2] ?? null) : null;
}
