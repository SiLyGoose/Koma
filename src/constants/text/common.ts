export const commonText = {
  /** Sent when a command crashes. */
  error: 'Something went wrong. Please try again.',
  /** `usage` is the command as typed after the prefix, like "rob @user". */
  memberNotFound: (p: string, usage: string) => `Could not find member in server. Mention via \`${p}${usage}\`.`,
  /** Sent when a slash command is used outside a server. */
  serverOnly: 'Koma only works in servers.',
  /** Sent when a slash command is still registered with Discord but the bot no longer has it. */
  unknownSlash: 'That command is no longer available.',
  /** Ends a list that was too long for one field. */
  moreLines: (count: number) => `...and ${count} more`,
};
