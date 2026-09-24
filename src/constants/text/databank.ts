export const databankText = {
  title: 'Databank',
  /** Added to the title when the list needs more than one message, like "Databank (2/3)". */
  titlePage: (title: string, page: number, pages: number) => `${title} (${page}/${pages})`,
  description: 'Every item and what it does while equipped.',
  /** `stars` is the star string; `count` is how many items are in that tier. */
  tierField: (stars: string, count: number) => `${stars} (${count})`,
  /** A tier long enough to need more than one page of its own, e.g. "★★★★ (7) — page 2/2". */
  tierFieldPage: (stars: string, count: number, page: number, pages: number) => `${stars} (${count}) — page ${page}/${pages}`,
  item: (name: string, slot: string) => `**${name}** · ${slot}`,
  noEffects: 'No effects',
  /** The list of one star tier (`databank <1-4>`). `stars` is the star string. */
  tierTitle: (stars: string) => `Databank: ${stars}`,
  tierDescription: (stars: string) => `Every ${stars} item and what it does while equipped.`,
  /** Asked for a number that isn't a tier. `low` and `high` are the lowest and highest tier. */
  badTier: (p: string, low: number, high: number) =>
    `Pick a star tier from ${low} to ${high}, like \`${p}databank ${high}\`. \`${p}databank\` lists every item.`,
  noItemsInTier: (stars: string) => `There are no ${stars} items.`,
  previousButton: 'Previous',
  nextButton: 'Next',
  notYours: "This isn't your databank to flip through.",
  /** Last line of an item that only some members can use. `owners` is mentions. */
  exclusive: (owners: string) => `Exclusive to ${owners}`,
  footer: (p: string) =>
    `${p}databank <item> shows one item in full, and ${p}databank <1-4> one star tier. Pull items with ${p}gacha and wear them with ${p}equip <item name>`,
  /** The details of one item (`databank <item>`). `stars` is the star string. */
  detailTitle: (stars: string, name: string) => `${stars}  ${name}`,
  detailSlotField: 'Slot',
  detailEffectsField: 'Effects',
  detailExclusiveField: 'Exclusive',
  /** `owners` is mentions. */
  detailExclusive: (owners: string) => `Only ${owners} can use its effects. Anyone can pull and equip it.`,
  detailFooter: (p: string) => `${p}databank lists every item. Pull items with ${p}gacha and wear them with ${p}equip <item name>`,
  noSuchItem: (p: string, query: string) => `There is no item called "${query}". \`${p}databank\` lists every item.`,
  ambiguous: (names: string[]) =>
    `That could be more than one item: ${names.map((name) => `**${name}**`).join(', ')}. Type more of the name.`,
};
