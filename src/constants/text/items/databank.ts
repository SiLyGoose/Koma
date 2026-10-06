import { REFINE } from '../../items/refine.js';

/** Under the list: which refinement the strengths shown are at. */
const refineNote = (level: number): string =>
  level >= REFINE.maxLevel
    ? `Strengths shown at **R${level}** (fully refined). A new copy starts at R1 and gets stronger with \`refine\`.`
    : `Strengths shown at **R${level}**${level === 1 ? ' (a new copy)' : ''}. Items get stronger with \`refine\`, up to R${REFINE.maxLevel}.`;

export const databankText = {
  title: 'Databank',
  /** The title with the refinement level the strengths are shown at, like "Databank · R5", and "· Masterwork" when the bonuses are on. */
  titleAt: (title: string, level: number, masterwork = false) => `${title} · R${level}${masterwork ? ' · Masterwork' : ''}`,
  /** The button that switches the strengths shown to `level`. */
  showLevel: (level: number) => `Show R${level}`,
  /** The button that turns the masterwork bonuses on (`show`) or off. */
  masterworkButton: (show: boolean) => (show ? 'Show masterwork' : 'Hide masterwork'),
  /** Added to the title when the list needs more than one message, like "Databank (2/3)". */
  titlePage: (title: string, page: number, pages: number) => `${title} (${page}/${pages})`,
  description: (level: number) => `Every item and what it does while equipped.\n${refineNote(level)}`,
  /** `stars` is the star string; `count` is how many items are in that tier. */
  tierField: (stars: string, count: number) => `${stars} (${count})`,
  /** A tier long enough to need more than one page of its own, e.g. "★★★★ (7) — page 2/2". */
  tierFieldPage: (stars: string, count: number, page: number, pages: number) => `${stars} (${count}) — page ${page}/${pages}`,
  item: (name: string, slot: string, masterwork = false) => `${slot} **${name}**${masterwork ? ' · ✨ Masterwork' : ''}`,
  noEffects: 'No effects',
  /** The list of one star tier (`databank <1-4>`). `stars` is the star string. */
  tierTitle: (stars: string) => `Databank: ${stars}`,
  tierDescription: (stars: string, level: number) => `Every ${stars} item and what it does while equipped.\n${refineNote(level)}`,
  /** Asked for a number that isn't a tier. `low` and `high` are the lowest and highest tier. */
  badTier: (p: string, low: number, high: number) =>
    `Pick a star tier from ${low} to ${high}, like \`${p}databank ${high}\`. \`${p}databank\` lists every item.`,
  noItemsInTier: (stars: string) => `There are no ${stars} items.`,
  /** One category (`databank weapon`), maybe of one tier too. `category` is its name, like "Weapon"; `stars` the star string or null. */
  categoryTitle: (title: string, category: string) => `${title} · ${category}`,
  categoryDescription: (category: string, stars: string | null, level: number) =>
    `Every ${stars === null ? '' : `${stars} `}${category.toLowerCase()} item and what it does while equipped.\n${refineNote(level)}`,
  noItemsInCategory: (category: string, stars: string | null) => `There are no ${stars === null ? '' : `${stars} `}${category.toLowerCase()} items.`,
  previousButton: 'Previous',
  nextButton: 'Next',
  notYours: "This isn't your databank to flip through.",
  /** Last line of an item that only some members can use. `owners` is mentions. */
  exclusive: (owners: string) => `Exclusive to ${owners}`,
  /** Last line of an item the gacha never gives (ItemDef.raidDrop). */
  raidDrop: '🎁 Only drops from raid bosses',
  detailRaidDropField: 'Where to get it',
  detailRaidDrop: "Can't be pulled from the gacha. Beating a raid boss gives the party a chance (higher with more raiders) that every raider finds one.",
  footer: (p: string) =>
    `${p}databank <item> shows one item in full, ${p}databank <1-4> one star tier, ${p}databank <weapon | armor | treasure> one category, and ${p}databank bosses the raid bosses. Pull items with ${p}gacha and wear them with ${p}equip <item name>`,
  /** The details of one item (`databank <item>`). `stars` is the star string. */
  detailTitle: (stars: string, name: string) => `${stars}  ${name}`,
  detailSlotField: 'Slot',
  detailEffectsField: (level: number, masterwork = false) => `Effects (at R${level}${masterwork ? ' · ✨ Masterwork' : ''})`,
  detailExclusiveField: 'Exclusive',
  /** `owners` is mentions. */
  /** `share` is how much of its effects everyone else gets, like "50%". */
  detailExclusive: (owners: string, share: string) =>
    `Made for ${owners}. Anyone can pull and equip it, but it only works at ${share} for everyone else.`,
  detailFooter: (p: string) => `${p}databank lists every item. Pull items with ${p}gacha and wear them with ${p}equip <item name>`,
  /** `databank bosses <name>` with a name that isn't a boss. `bosses` is every boss's name, listed. */
  noSuchBoss: (p: string, query: string, bosses: string) =>
    `There is no raid boss called "${query}". The bosses are ${bosses}, and \`${p}databank bosses\` shows them all.`,
  noSuchItem: (p: string, query: string) => `There is no item called "${query}". \`${p}databank\` lists every item.`,
  ambiguous: (names: string[]) =>
    `That could be more than one item: ${names.map((name) => `**${name}**`).join(', ')}. Type more of the name.`,
};
