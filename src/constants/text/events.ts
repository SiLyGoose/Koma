import { CURRENCY_EMOJI } from '../core.js';

export const eventsText = {
  adminOnly: 'Only the bot admin can use this command.',
  usage: (p: string) => `Use \`${p}events\` to see every random event that can happen, or \`${p}events start [event]\` to start one now.`,
  statusTitle: 'Random events',
  listField: 'Events',
  /** One line of the list of events: the id you type to start it, its name, its chance of being picked at random, and what it does. */
  listLine: (id: string, label: string, description: string, chance: string) => `\`${id}\` **${label}** (${chance}): ${description}`,
  startNoChannel: 'No dedicated channel is set for this server.',
  startBusy: 'An event is already happening in this server. Wait until it is over.',
  startBadChannel: 'I could not use the channel any more (it is gone, or I lost permission there). An admin needs to choose it again.',
  /** `ids` is the list of event ids. */
  startUnknown: (name: string, ids: string) => `There is no event called "${name}". The events are: ${ids}`,
  started: (label: string, channel: string) => `Started **${label}** in ${channel}.`,
  vaultField: 'Vault',
  /** `pool` is what's been lost so far, `prize` is that times the multiplier: what a vault breaker would pay out right now. */
  vaultInfo: (pool: string, prize: string, multiplier: string) => `**${pool}** ${CURRENCY_EMOJI} lost so far. A vault breaker right now would attempt **${prize}** ${CURRENCY_EMOJI} (${multiplier}).`,
};
