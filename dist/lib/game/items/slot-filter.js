/*
 * Filtering item lists by category (the gear slot): `databank weapon`, `inventory @user armor`.
 * The category is typed as a word, not picked with buttons.
 */
/** Every word that names a category, singular and plural (and armour, spelled the British way). */
const SLOT_WORDS = {
    weapon: 'weapon',
    weapons: 'weapon',
    armor: 'armor',
    armors: 'armor',
    armour: 'armor',
    armours: 'armor',
    treasure: 'treasure',
    treasures: 'treasure',
};
/** The category a word names (any letter case), or null. */
export function parseSlotWord(word) {
    return SLOT_WORDS[word.trim().toLowerCase()] ?? null;
}
/** Takes the first word that names a category out of `args`: which category, and the other words in order. */
export function takeSlot(args) {
    const at = args.findIndex((word) => parseSlotWord(word) !== null);
    if (at < 0)
        return { slot: null, rest: [...args] };
    return { slot: parseSlotWord(args[at]), rest: args.filter((_, i) => i !== at) };
}
//# sourceMappingURL=slot-filter.js.map