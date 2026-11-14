import { REFINE } from '../../items/refine.js';
/** Under the list: which stars the strengths shown are at. */
const refineNote = (level) => level >= REFINE.maxLevel
    ? `Strengths shown at **★${level}** (fully refined). A new copy starts at ★1 and gets stronger with \`refine\`.`
    : `Strengths shown at **★${level}**${level === 1 ? ' (a new copy)' : ''}. Items get stronger with \`refine\`, up to ★${REFINE.maxLevel}.`;
export const databankText = {
    title: 'Databank',
    /** The title with the stars the strengths are shown at, like "Databank · ★5". */
    titleAt: (title, level) => `${title} · ★${level}`,
    /** The button that switches the strengths shown to `level`. */
    showLevel: (level) => `Show ★${level}`,
    /** Added to the title when the list needs more than one message, like "Databank (2/3)". */
    titlePage: (title, page, pages) => `${title} (${page}/${pages})`,
    description: (level) => `Every item and what it does while equipped.\n${refineNote(level)}`,
    /** `stars` is the star string; `count` is how many items are in that tier. */
    tierField: (stars, count) => `${stars} (${count})`,
    /** A tier long enough to need more than one page of its own, e.g. "★★★★ (7) — page 2/2". */
    tierFieldPage: (stars, count, page, pages) => `${stars} (${count}) — page ${page}/${pages}`,
    item: (name, slot) => `${slot} **${name}**`,
    noEffects: 'No effects',
    /** The list of one star tier (`databank <1-4>`). `stars` is the star string. */
    tierTitle: (stars) => `Databank: ${stars}`,
    tierDescription: (stars, level) => `Every ${stars} item and what it does while equipped.\n${refineNote(level)}`,
    /** Asked for a number that isn't a tier. `low` and `high` are the lowest and highest tier. */
    badTier: (p, low, high) => `Pick a tier from T${low} to T${high}, like \`${p}databank t${high}\`. \`${p}databank\` lists every item.`,
    noItemsInTier: (stars) => `There are no ${stars} items.`,
    /** One category (`databank weapon`), maybe of one tier too. `category` is its name, like "Weapon"; `stars` the star string or null. */
    categoryTitle: (title, category) => `${title} · ${category}`,
    categoryDescription: (category, stars, level) => `Every ${stars === null ? '' : `${stars} `}${category.toLowerCase()} item and what it does while equipped.\n${refineNote(level)}`,
    noItemsInCategory: (category, stars) => `There are no ${stars === null ? '' : `${stars} `}${category.toLowerCase()} items.`,
    previousButton: 'Previous',
    nextButton: 'Next',
    notYours: "This isn't your databank to flip through.",
    /** A class item's line, and its field in the details: `label` is the class's badge and name, like "<emoji> Knight". */
    classItem: (label) => `${label} class item`,
    detailClassField: 'Class',
    detailClass: (label) => `**${label}**: what it does only works for a raider of that class.`,
    /** `databank classes`: a class's page. Its items are listed fully refined. */
    classItemsField: 'Class items',
    classNoItems: 'It has no class items yet.',
    classFooter: (p) => `Pick your class with ${p}class <name>, or on the site's gear page by the ribbon over your character. ${p}databank <item> shows one of these items in full.`,
    noSuchClass: (p, query, classes) => `There is no raid class called "${query}". The classes are ${classes}, and \`${p}databank classes\` shows them all.`,
    /** Last line of an item that only some members can use. `owners` is mentions. */
    exclusive: (owners) => `Exclusive to ${owners}`,
    /** Last line of an item the gacha never gives (ItemDef.raidDrop): one the raid shop doesn't sell, and one it does. */
    raidDrop: '🎁 Only drops from raid bosses',
    raidDropOrShop: '🎁 Drops from raid bosses, or bought in the raid shop',
    /** Last line of a limited item (ItemDef.limited). */
    limited: '⏳ Only from the limited banner',
    /** Last line of TechnoMagic gear (ItemDef.tmDrop). */
    technomagic: '🐲 Only drops from the TechnoMagic Raid, and only heroes wear it',
    detailTechnomagic: "Can't be pulled from the gacha: only the TechnoMagic Raid drops it, and only its heroes wear it (put it on one on the site's Heroes page).",
    detailLimited: "Can't be pulled from the standard banner: only from the limited banner, while it is featured there.",
    detailRaidDropField: 'Where to get it',
    detailRaidDrop: "Can't be pulled from the gacha. Beating the Weekly Boss gives the party a chance (higher with more raiders) that every raider finds one, and the Dragon Raid drops them too.",
    /** Added to detailRaidDrop for an item the raid shop sells. `price` is a copy's, like "**10** <gem>". */
    detailRaidShop: (price) => `The raid shop on the site also sells it for ${price}, on the weeks it's on the shelf.`,
    footer: (p) => `${p}databank <item> shows one item in full, ${p}databank <T1-T4> one tier, ${p}databank <weapon | armor | treasure> one category, ${p}databank bosses the Weekly Bosses and ${p}databank classes the raid classes. Pull items with ${p}gacha and wear them with ${p}equip <item name>`,
    /** The details of one item (`databank <item>`): its name; its tier is in its slot's field (detailSlot). */
    detailTitle: (name) => name,
    detailSlotField: 'Slot',
    /** The slot field's value: the slot (its emoji and name), and the item's tier (tierLabel). */
    detailSlot: (slot, tier) => `${slot} · ${tier}`,
    detailEffectsField: (level) => `Effects (at ★${level})`,
    detailExclusiveField: 'Exclusive',
    /** `owners` is mentions. */
    /** `share` is how much of its effects everyone else gets, like "50%". */
    detailExclusive: (owners, share) => `Made for ${owners}. Anyone can pull and equip it, but it only works at ${share} for everyone else.`,
    detailFooter: (p) => `${p}databank lists every item. Pull items with ${p}gacha and wear them with ${p}equip <item name>`,
    /** `databank bosses <name>` with a name that isn't a boss. `bosses` is every boss's name, listed. */
    noSuchBoss: (p, query, bosses) => `There is no Weekly Boss called "${query}". The bosses are ${bosses}, and \`${p}databank bosses\` shows them all.`,
    noSuchItem: (p, query) => `There is no item called "${query}". \`${p}databank\` lists every item.`,
    ambiguous: (names) => `That could be more than one item: ${names.map((name) => `**${name}**`).join(', ')}. Type more of the name.`,
};
//# sourceMappingURL=databank.js.map