export const eventsText = {
  adminOnly: 'Only the bot admin can start an event.',
  /** The list's footer for everyone but the admin, who gets the usage hint instead. */
  footerOthers: 'Only the bot admin can start an event.',
  usage: (p: string) => `Use \`${p}events\` to see every random event that can happen, or \`${p}events start [event]\` to start one now.`,
  statusTitle: 'Random events',
  /** One event on the list: its name and its chance of being picked at random... */
  entryName: (label: string, chance: string) => `${label} (${chance})`,
  /** ...then the id you type to start it, and what it does. */
  entryValue: (id: string, description: string) => `\`${id}\` ${description}`,
  /** The list's footer: which page, when there's more than one, then `hint` (the usage, or footerOthers). */
  pageFooter: (page: number, pages: number, hint: string) => (pages > 1 ? `Page ${page} of ${pages} · ${hint}` : hint),
  previousButton: 'Previous',
  nextButton: 'Next',
  notYours: 'Run the events command yourself to flip through it.',
  startNoChannel: 'No channel is set for events in this server: set one with `config set events` (or `config set channel`).',
  startBusy: 'An event is already happening in this server. Wait until it is over.',
  startBadChannel: 'I could not use the channel any more (it is gone, or I lost permission there). An admin needs to choose it again.',
  /** `ids` is the list of event ids. */
  startUnknown: (name: string, ids: string) => `There is no event called "${name}". The events are: ${ids}`,
  started: (label: string, channel: string) => `Started **${label}** in ${channel}.`,
};
