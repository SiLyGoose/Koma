export const eventsText = {
    adminOnly: 'Only the bot admin can start an event.',
    /** The list's footer for everyone but the admin, who gets the usage hint instead. */
    footerOthers: 'Only the bot admin can start an event.',
    usage: (p) => `Use \`${p}events\` to see every random event that can happen, or \`${p}events start [event]\` to start one now.`,
    statusTitle: 'Random events',
    listField: 'Events',
    /** One line of the list of events: the id you type to start it, its name, its chance of being picked at random, and what it does. */
    listLine: (id, label, description, chance) => `\`${id}\` **${label}** (${chance}): ${description}`,
    startNoChannel: 'No channel is set for events in this server: set one with `config set events` (or `config set channel`).',
    startBusy: 'An event is already happening in this server. Wait until it is over.',
    startBadChannel: 'I could not use the channel any more (it is gone, or I lost permission there). An admin needs to choose it again.',
    /** `ids` is the list of event ids. */
    startUnknown: (name, ids) => `There is no event called "${name}". The events are: ${ids}`,
    started: (label, channel) => `Started **${label}** in ${channel}.`,
};
//# sourceMappingURL=events.js.map