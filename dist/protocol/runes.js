/*
 * King's Raid's runes beyond their sockets, on the site (the bot's /api/runes): sold for zeiucoins or disassembled into Rune
 * Fragments (King's Raid's RuneItemBreakTable and ItemTable SellGold, both halved: the user's), Mysterious Runes crafted from
 * the fragments (King's Raid's CraftItemTable, its Rune Scrolls, gold and Ancient Runebook left out), and taking a rune out
 * of a socket: kept for HeroesView's runeKeepPrice zeiucoins (King's Raid's Rune Preserve, 100 rubies), else disassembled where it is.
 */
/** What selling a rune of each grade (1 Common to 6 Legendary; an Ancient one and a Velkazar one are 5) pays, in zeiucoins. */
export const RUNE_SELL_POINTS = { 1: 200, 2: 350, 3: 650, 4: 1_150, 5: 1_950, 6: 3_300 };
/** The Rune Fragments disassembling a rune of each grade gives. */
export const RUNE_FRAGMENTS = { 1: 8, 2: 20, 3: 50, 4: 125, 5: 312, 6: 500 };
/** The Mysterious Runes (what one takes in Rune Fragments is the bot's setting: HeroesView.craft's `runes`). */
export const RUNE_BOXES = [
    { id: 'uncommon', name: 'Mysterious Rune: Uncommon', grade: 2, icon: 'PACKAGE_RUNE_2' },
    { id: 'rare', name: 'Mysterious Rune: Rare', grade: 3, icon: 'PACKAGE_RUNE_3' },
    { id: 'heroic', name: 'Mysterious Rune: Heroic', grade: 4, icon: 'PACKAGE_RUNE_4' },
    { id: 'ancient', name: 'Mysterious Rune: Ancient', grade: 5, icon: 'PACKAGE_RUNE_5' },
];
/** The most runes one sale takes, and the most Mysterious Runes one craft makes. */
export const RUNES_AT_ONCE = 1_000;
//# sourceMappingURL=runes.js.map