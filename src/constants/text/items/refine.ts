import { boldMoney } from '../currency.js';

/** A copy's level, its stars, as Discord says it: "★3" (a hero's gear from ★0, the members' own from ★1). */
export const levelTag = (level: number, _hero = false): string => `★${level}`;

/** Refining's words, or (`hero`) awakening's: a hero's gear is awakened with a duplicate, as King's Raid's, raising its stars. */
const verbs = (hero: boolean) => (hero ? { verb: 'awaken', ing: 'Awakening', ed: 'awakened', noun: 'awakening', Verb: 'Awaken' } : { verb: 'refine', ing: 'Refining', ed: 'refined', noun: 'refine', Verb: 'Refine' });

export const refineText = {
  askWhich: (p: string) => `Which item? Use \`${p}refine <item name>\`. Each refine (a hero's gear: awakening) uses up one duplicate of the item for a star more, and some points (more for higher tiers and stars).`,
  ambiguous: (names: string[]) =>
    `That could be more than one of your items: ${names.map((name) => `**${name}**`).join(', ')}. Type more of the name.`,
  notOwned: (p: string, name: string) => `You don't own **${name}** yet. Pull for it with \`${p}gacha\`.`,
  noSuchItem: (p: string, query: string) => `You don't have an item called "${query}". \`${p}inventory\` shows what you own.`,
  /** `level` is the copy's refinement now (shown as R1 to R5; a hero's gear, `hero`, its stars). */
  noDuplicate: (name: string, level: number, hero = false) =>
    `Your **${name}** is at **${levelTag(level, hero)}**. ${verbs(hero).ing} it uses up a duplicate, and you don't have a spare one (locked copies and ones in a loadout${hero ? ' or on a hero' : ''} are never used up). Pull another!`,
  notRefineable: (name: string) => `**${name}** is TechnoMagic gear: it is never refined. What it does on a hero is its potentials, which stay as they came.`,
  maxed: (name: string, max: number, hero = false) => `Your **${name}** is already fully ${verbs(hero).ed} (**${levelTag(max, hero)}**).`,
  busy: 'Your items changed while refining. Nothing was used up; try again.',
  title: (stars: string, name: string, slot: string) => `${stars}  ${name} ${slot}`,
  /** `left` is how many more copies of the item they have that later refines could use; `paid` the points it cost. */
  done: (user: string, from: number, to: number, left: number, paid: string, hero = false) =>
    `${user} ${verbs(hero).ed} it from **${levelTag(from, hero)}** to **${levelTag(to, hero)}**, using up a duplicate${paid === '0' ? '' : ` and ${boldMoney(paid)}`}. ${left === 0 ? 'No duplicates left.' : `${left} ${left === 1 ? 'duplicate' : 'duplicates'} left.`}`,
  /** `to` is the level it would reach, `price` what that costs, `balance` what they have. */
  tooPoor: (name: string, to: number, price: string, balance: string, hero = false) =>
    `${verbs(hero).ing} your **${name}** to **${levelTag(to, hero)}** costs ${boldMoney(price)} (and a duplicate), and you have ${boldMoney(balance)}.`,
  /** Under a refine that raised an extra copy: `count` other copies of the item are already at `max`. */
  alsoMaxed: (name: string, max: number, count: number, hero = false) =>
    `You already have ${count === 1 ? 'a' : `**${count}**`} fully ${verbs(hero).ed} (**${levelTag(max, hero)}**) **${name}**, so this ${verbs(hero).noun} raised ${count === 1 ? 'another copy' : 'one more'}.`,
  balanceField: 'Balance',
  beforeField: (level: number, hero = false) => `Before (${levelTag(level, hero)})`,
  afterField: (level: number, hero = false) => `Now (${levelTag(level, hero)})`,
  noEffects: 'None',
  /** The button under a refine that refines the same item again. `next` is the level it would reach. */
  /** Button labels can't show custom emoji, so the price is a plain number. */
  againButton: (next: number, cost: string, hero = false) =>
    cost === '0' ? `${verbs(hero).Verb} to ${levelTag(next, hero)}` : `${verbs(hero).Verb} to ${levelTag(next, hero)} (${cost})`,
  notYours: "That isn't your item to refine.",
  footer: (max: number, hero = false) =>
    hero
      ? `A hero's gear is awakened up to ${levelTag(max, true)}, as in King's Raid. Each awakening uses up a duplicate and some points.`
      : `Every item goes up to ★${max}, where it has its full listed strength. Each refine uses up a duplicate for a star more, and some points.`,
};
