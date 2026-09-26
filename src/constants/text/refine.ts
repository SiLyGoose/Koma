export const refineText = {
  askWhich: (p: string) => `Which item? Use \`${p}refine <item name>\`. Each refine uses up one duplicate of the item.`,
  ambiguous: (names: string[]) =>
    `That could be more than one of your items: ${names.map((name) => `**${name}**`).join(', ')}. Type more of the name.`,
  notOwned: (p: string, name: string) => `You don't own **${name}** yet. Pull for it with \`${p}gacha\`.`,
  noSuchItem: (p: string, query: string) => `You don't have an item called "${query}". \`${p}inventory\` shows what you own.`,
  /** `level` is the copy's refinement now (shown as R1 to R5). */
  noDuplicate: (name: string, level: number) =>
    `Your **${name}** is at **R${level}**. Refining it uses up a duplicate, and you don't have a spare one. Pull another!`,
  maxed: (name: string, max: number) => `Your **${name}** is already fully refined (**R${max}**).`,
  busy: 'Your items changed while refining. Nothing was used up; try again.',
  title: (stars: string, name: string) => `${stars}  ${name}`,
  /** `left` is how many more copies of the item they have that later refines could use. */
  done: (user: string, from: number, to: number, left: number) =>
    `${user} refined it from **R${from}** to **R${to}**, using up a duplicate. ${left === 0 ? 'No duplicates left.' : `${left} ${left === 1 ? 'duplicate' : 'duplicates'} left.`}`,
  beforeField: (level: number) => `Before (R${level})`,
  afterField: (level: number) => `Now (R${level})`,
  noEffects: 'None',
  /** The button under a refine that refines the same item again. `next` is the level it would reach. */
  againButton: (next: number) => `Refine to R${next}`,
  notYours: "That isn't your item to refine.",
  footer: (max: number) => `Every item goes up to R${max}, where it has its full listed strength.`,
};
