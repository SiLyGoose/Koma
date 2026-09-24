export const helpText = {
  title: 'Commands',
  /** `list` is the aliases already formatted, like "`k!pull`, `k!p`". */
  aliases: (list: string) => ` (also ${list})`,
  alias: (p: string, alias: string) => `\`${p}${alias}\``,
  /** `usage` already has the prefix, like "k!rob @user". */
  entry: (usage: string, aliases: string, description: string) => `**${usage}**${aliases}\n${description}`,
  footer: (claimMin: string, claimMax: string, pullCost: string) =>
    `Claim ${claimMin}-${claimMax} points every hour. A pull costs ${pullCost}.`,
};
