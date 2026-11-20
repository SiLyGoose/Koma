import { CURRENCY_EMOJI } from '../../core.js';
import { boldMoney } from '../currency.js';
/** What a sale paid: its points, or (hero gear) its komaDust, or both (`powder` left out: points only). Each already formatted. */
const worth = (points, powder) => powder === undefined ? boldMoney(points) : points === '0' ? `**${powder}** komaDust` : `${boldMoney(points)} and **${powder}** komaDust`;
export const sellText = {
    usage: (p) => `Use \`${p}sell <item>\` to sell one copy, \`${p}sell <number> <item>\` to sell that many copies, \`${p}sell all <item>\` to sell every copy you aren't wearing, or \`${p}sell tier <1-4>\` to sell everything of a tier that you aren't wearing (TechnoMagic gear and unique weapons only sell by name).`,
    badStars: (p) => `Pick a tier from T1 to T4, like \`${p}sell tier 1\`.`,
    askWhichAll: (p) => `Which item? Use \`${p}sell all <item name>\`.`,
    /** Typed a number but no item. */
    askWhichAmount: (p) => `Which item? Use \`${p}sell <number> <item name>\`.`,
    badAmount: (p) => `The amount must be a whole number, 1 or more, like \`${p}sell 3 <item name>\`.`,
    /** Asked for more copies than can be sold. `available` is how many aren't in a loadout or locked. */
    notEnough: (p, name, wanted, available) => `You asked to sell ${wanted} but you only have **${available}** ${available === 1 ? 'copy' : 'copies'} of **${name}** that aren't locked or in a loadout. Use \`${p}sell all ${name}\` to sell ${available === 1 ? 'it' : 'them all'}.`,
    ambiguous: (names) => `That could be more than one of your items: ${names.map((name) => `**${name}**`).join(', ')}. Type more of the name.`,
    noSuchItem: (p, query) => `You don't have an item called "${query}". \`${p}inventory\` shows what you own.`,
    notOwned: (name) => `You don't own **${name}**.`,
    /** Every copy of the item is worn. */
    onlyEquipped: (p, name) => `Your **${name}** is in one of your loadouts, so it can't be sold. Take it off with \`${p}unequip\` first (for a saved loadout, switch to it with \`${p}loadout\`).`,
    /** Every copy of the item is locked (or worn, with at least one locked). */
    onlyLocked: (p, name) => `Your **${name}** is locked (or in a loadout), so it can't be sold. Unlock it with \`${p}unlock ${name}\` first.`,
    noneInTier: (stars) => `You don't own any ${stars} items.`,
    onlyEquippedTier: (p, stars) => `The only ${stars} items you have are in your loadouts, so none can be sold. Take them off with \`${p}unequip\` first (for a saved loadout, switch to it with \`${p}loadout\`).`,
    onlyLockedTier: (p, stars) => `The only ${stars} items you have are locked or in your loadouts, so none can be sold. Unlock them with \`${p}unlock <item>\` first.`,
    /** Result of selling. `user` is a mention, `points` already formatted, and `powder` the komaDust hero gear paid (left out: none). */
    soldTitle: 'Sold',
    soldOne: (user, name, points, powder) => `${user} sold **${name}** for ${worth(points, powder)}`,
    soldMany: (user, count, points, powder) => `${user} sold **${count}** items for ${worth(points, powder)}`,
    /** One line of a sale: an item, how many, and what they were worth together (`powder`: in komaDust, hero gear's). */
    line: (name, count, amount, powder = false) => `${name} x${count} · ${amount} ${powder ? 'komaDust' : CURRENCY_EMOJI}`,
    balanceField: 'Balance',
    /** Beside the balance, after a salvage that paid komaDust: theirs, and what crafts a komaGem from it on the site. */
    powderField: 'komaDust',
    powderValue: (powder, perGem) => `${powder} (${perGem} crafts a komaGem in the site's Raid Gear shop)`,
    footerLeft: (count) => (count === 0 ? 'You have none left' : `You have ${count} left`),
    /** Shown when some of what was planned could no longer be sold (equipped or already sold in the meantime). */
    skipped: (count) => (count === 1 ? '1 item could not be sold any more and was kept.' : `${count} items could not be sold any more and were kept.`),
    nothingLeft: 'None of those can be sold any more (they were equipped, saved to a loadout or locked, or already sold).',
    /** The confirmation prompt for selling many. */
    confirmTitle: 'Sell these?',
    confirmDescription: (total, count, lines, powder) => `${lines}\n\nTotal: ${worth(total, powder)} for **${count}** items.`,
    confirmFooter: (seconds) => `Equipped and locked items are never sold. Confirm within ${seconds} seconds.`,
    confirmButton: 'Sell',
    cancelButton: 'Cancel',
    cancelledTitle: 'Sale cancelled',
    cancelled: 'Nothing was sold.',
    timedOutTitle: 'Sale cancelled',
    timedOut: 'You took too long to answer, so nothing was sold.',
    notYours: "That sale isn't yours to confirm.",
};
//# sourceMappingURL=sell.js.map