import { CURRENCY_EMOJI } from '../core.js';
import { boldMoney } from './currency.js';

export const sellText = {
  usage: (p: string) =>
    `Use \`${p}sell <item>\` to sell one copy, \`${p}sell <number> <item>\` to sell that many copies, \`${p}sell all <item>\` to sell every copy you aren't wearing, or \`${p}sell stars <1-4>\` to sell everything of a star tier that you aren't wearing.`,
  badStars: (p: string) => `Pick a star tier from 1 to 4, like \`${p}sell stars 1\`.`,
  askWhichAll: (p: string) => `Which item? Use \`${p}sell all <item name>\`.`,
  /** Typed a number but no item. */
  askWhichAmount: (p: string) => `Which item? Use \`${p}sell <number> <item name>\`.`,
  badAmount: (p: string) => `The amount must be a whole number, 1 or more, like \`${p}sell 3 <item name>\`.`,
  /** Asked for more copies than can be sold. `available` is how many aren't in a loadout. */
  notEnough: (p: string, name: string, wanted: number, available: number) =>
    `You asked to sell ${wanted} but you only have **${available}** ${available === 1 ? 'copy' : 'copies'} of **${name}** that aren't in a loadout. Use \`${p}sell all ${name}\` to sell ${available === 1 ? 'it' : 'them all'}.`,
  ambiguous: (names: string[]) =>
    `That could be more than one of your items: ${names.map((name) => `**${name}**`).join(', ')}. Type more of the name.`,
  noSuchItem: (p: string, query: string) => `You don't have an item called "${query}". \`${p}inventory\` shows what you own.`,
  notOwned: (name: string) => `You don't own **${name}**.`,
  /** Every copy of the item is worn. */
  onlyEquipped: (p: string, name: string) =>
    `Your **${name}** is in one of your loadouts, so it can't be sold. Take it off with \`${p}unequip\` first (for a saved loadout, switch to it with \`${p}loadout\`).`,
  noneInTier: (stars: string) => `You don't own any ${stars} items.`,
  onlyEquippedTier: (p: string, stars: string) =>
    `The only ${stars} items you have are in your loadouts, so none can be sold. Take them off with \`${p}unequip\` first (for a saved loadout, switch to it with \`${p}loadout\`).`,
  /** Result of selling. `user` is a mention, `stars` the star string, `points` already formatted. */
  soldTitle: 'Sold',
  soldOne: (user: string, stars: string, name: string, points: string) => `${user} sold **${name}** ${stars} for ${boldMoney(points)}`,
  soldMany: (user: string, count: number, points: string) => `${user} sold **${count}** items for ${boldMoney(points)}`,
  /** One line of a sale: an item, how many, and what they were worth together. */
  line: (stars: string, name: string, count: number, points: string) => `${stars}  ${name} x${count} · ${points} ${CURRENCY_EMOJI}`,
  balanceField: 'Balance',
  footerLeft: (count: number) => (count === 0 ? 'You have none left' : `You have ${count} left`),
  /** Shown when some of what was planned could no longer be sold (equipped or already sold in the meantime). */
  skipped: (count: number) => (count === 1 ? '1 item could not be sold any more and was kept.' : `${count} items could not be sold any more and were kept.`),
  nothingLeft: 'None of those can be sold any more (they were equipped or saved to a loadout, or already sold).',
  /** The confirmation prompt for selling many. */
  confirmTitle: 'Sell these?',
  confirmDescription: (total: string, count: number, lines: string) => `${lines}\n\nTotal: ${boldMoney(total)} for **${count}** items.`,
  confirmFooter: (seconds: number) => `Equipped items are never sold. Confirm within ${seconds} seconds.`,
  confirmButton: 'Sell',
  cancelButton: 'Cancel',
  cancelledTitle: 'Sale cancelled',
  cancelled: 'Nothing was sold.',
  timedOutTitle: 'Sale cancelled',
  timedOut: 'You took too long to answer, so nothing was sold.',
  notYours: "That sale isn't yours to confirm.",
};
