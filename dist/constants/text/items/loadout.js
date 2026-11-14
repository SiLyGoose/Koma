import { boldMoney } from '../currency.js';
export const loadoutText = {
    title: (name) => `${name}'s loadouts`,
    /** A loadout's heading in the list. */
    heading: (number, name, active) => `${number}. ${name}${active ? ' ✅ (equipped)' : ''}`,
    /** One slot of a loadout: its emoji and what is in it. */
    slot: (emoji, item) => `${emoji} ${item ?? '—'}`,
    item: (name, level) => `**${name}** ★${level}`,
    /** `unlock`: there's a loadout left to unlock. */
    footer: (p, unlock) => `Switch with ${p}loadout <number or name> · Rename with ${p}loadout rename <number> <name>${unlock ? ` · Unlock more with ${p}loadout unlock` : ''}`,
    /** A loadout not unlocked yet, in the list: what unlocking it costs (`price` formatted), or, not the next one, which comes first. */
    lockedHeading: (number) => `🔒 ${number}. Locked`,
    lockedNext: (p, price) => `Unlock it with \`${p}loadout unlock\` for ${boldMoney(price)}.`,
    lockedLater: (before) => `Unlock loadout ${before} first.`,
    usage: (p) => `Use \`${p}loadout\` to see your loadouts, \`${p}loadout <number or name>\` to switch, \`${p}loadout rename <number> <name>\` to name one, or \`${p}loadout unlock\` to unlock another.`,
    notFound: (p, query) => `You don't have a loadout called "${query}". \`${p}loadout\` lists them.`,
    ambiguous: (names) => `That could be more than one of your loadouts: ${names.map((name) => `**${name}**`).join(', ')}. Type more of the name, or its number.`,
    alreadyActive: (name) => `You're already using **${name}**.`,
    /** `items` are the names of the gear now on; empty means nothing. */
    switched: (p, name, items) => items.length > 0
        ? `Switched to **${name}**.`
        : `Switched to **${name}**. It's empty, so you're wearing nothing. Anything you \`${p}equip\` now is saved to it.`,
    busy: 'Your loadouts changed while switching. Try again.',
    notYours: "Those aren't your loadouts. Use the loadout command to see your own.",
    /** Switching to or naming a loadout they haven't unlocked. */
    locked: (p, number) => `Loadout ${number} is locked. Unlock it with \`${p}loadout unlock\`.`,
    unlocked: (p, name, paid, balance) => `Unlocked **${name}** for ${boldMoney(paid)}. You have ${boldMoney(balance)} left. Switch to it with \`${p}loadout ${name}\`.`,
    allUnlocked: (count) => `You've unlocked all ${count} loadouts already.`,
    alreadyUnlocked: (number) => `You've already unlocked loadout ${number}.`,
    unlockFirst: (number) => `Unlock loadout ${number} first.`,
    unlockTooPoor: (number, price, balance) => `Unlocking loadout ${number} costs ${boldMoney(price)}, and you have ${boldMoney(balance)}.`,
    unlockBusy: 'Your loadouts changed while unlocking. Nothing was paid. Try again.',
    renameUsage: (p, count) => `Which one? Use \`${p}loadout rename <1-${count}> <name>\`, or leave the name out to reset it.`,
    renamed: (before, after) => `Renamed **${before}** to **${after}**.`,
    renamedDefault: (before, after) => `**${before}** is back to its default name, **${after}**.`,
    tooLong: (max) => `That name is too long. Keep it to ${max} characters.`,
    badCharacters: "A loadout name can only have letters, numbers, spaces and . ! ? ' & + -",
    noLetters: 'A loadout name needs at least one letter.',
    reserved: (name) => `"${name}" is a word the loadout command uses, so pick another name.`,
    taken: (number, name) => `Loadout ${number} is already called **${name}**. Pick another name.`,
};
//# sourceMappingURL=loadout.js.map