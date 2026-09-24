import { CURRENCY_EMOJI } from '../core.js';
import { boldMoney } from './currency.js';
import { MULTI_PULLS } from '../gacha.js';

export const gachaText = {
  cantAfford: (p: string, cost: string, balance: string) =>
    `A pull costs ${boldMoney(cost)} and you have ${boldMoney(balance)} Use \`${p}claim\` to earn more.`,
  /** `stars` is the star string, like "★★". */
  title: (stars: string, name: string) => `${stars}  ${name}`,
  description: (itemDescription: string) => `*${itemDescription}*`,
  /** Added under the description when the pulled item is exclusive to other members. `owners` is mentions. */
  exclusive: (owners: string) => `Only ${owners} can use this one.`,
  author: (name: string) => `${name} pulled`,
  /** The message the shooting star plays in, before the result. */
  pullingTitle: 'A star is falling...',
  pulling: (user: string) => `${user} makes a wish...`,
  spentField: 'Spent',
  spent: (cost: string) => `${cost} ${CURRENCY_EMOJI}`,
  spentWithGear: (cost: string, saved: string) => `${cost} ${CURRENCY_EMOJI} (gear saved ${saved} ${CURRENCY_EMOJI})`,
  balanceField: 'Balance',
  /** Field showing how close the member is to a guaranteed top-tier item. `stars` is the star string. */
  pityField: (stars: string) => `Pity (${stars})`,
  pityProgress: (count: string, hardPity: string) => `${count} / ${hardPity}`,
  footerNew: 'New item!',
  footerOwned: (count: number) => `You now own ${count}`,
  /** When the argument after the command isn't "multi". */
  usage: (p: string) => `Use \`${p}gacha\` for one pull, or \`${p}gacha multi\` for ${MULTI_PULLS} pulls at once.`,
  multiCantAfford: (p: string, pulls: number, cost: string, balance: string) =>
    `A multi pull (${pulls} pulls) costs ${boldMoney(cost)} and you have ${boldMoney(balance)} Use \`${p}claim\` to earn more.`,
  multiTitle: (pulls: number) => `Multi pull x${pulls}`,
  /** One line per pull. `stars` is the star string; `isNew` when it is the first copy the member has ever owned. */
  multiLine: (stars: string, name: string, isNew: boolean) => `${stars}  ${name}${isNew ? ' · New!' : ''}`,
  /** Same, for a top-tier pull, which is set apart in bold. */
  multiLineTop: (stars: string, name: string, isNew: boolean) => `**${stars}  ${name}**${isNew ? ' · New!' : ''}`,
  /** Added under the list for each pulled item that is exclusive to other members. `owners` is mentions. */
  multiExclusive: (name: string, owners: string) => `Only ${owners} can use ${name}.`,
  multiSummaryField: 'Summary',
  /** One part of the summary: how many pulls gave items of a tier. `stars` is the star string. */
  multiTier: (stars: string, count: number) => `${stars} x${count}`,
  multiFooterNew: (count: number) => (count === 1 ? '1 new item!' : `${count} new items!`),
  multiFooterNoneNew: 'No new items',
};
