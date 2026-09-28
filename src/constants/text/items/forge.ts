import { boldGems } from '../currency.js';

export const forgeText = {
  askWhich: (p: string, gems: number) =>
    `Which item? Use \`${p}forge <item name>\` (or \`${p}mw\`) to forge your R5 copy of a 4-star item into a masterwork for ${boldGems(gems)}, awakening its bonus.`,
  noBonus: (name: string) => `**${name}** has no masterwork bonus.`,
  /** `level` is the copy's refinement now, `needed` the level a masterwork needs. */
  tooLow: (p: string, name: string, level: number, needed: number) =>
    `Your **${name}** is at **R${level}**. It has to be **R${needed}** before it can be forged into a masterwork: use \`${p}refine ${name}\`.`,
  already: (name: string) => `Your **${name}** is already a masterwork.`,
  tooPoor: (price: number, gems: number) => `Forging a masterwork costs ${boldGems(price)}, and you have ${boldGems(gems)}. Win raids to earn more.`,
  busy: 'Your items changed at the same moment. No komaGems were spent; try again.',
  title: (stars: string, name: string, slot: string) => `${stars}  ${name} ${slot}`,
  /** `user` is a mention; `text` is what the bonus does. */
  done: (user: string, price: number, text: string) => `${user} forged it into a masterwork for ${boldGems(price)}.\n✨ ${text}`,
  gemsField: 'komaGems left',
};
