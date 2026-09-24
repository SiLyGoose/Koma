import { CURRENCY_EMOJI } from '../core.js';

export const claimText = {
  already: (unix: number) => `You already claimed this hour. Come back <t:${unix}:R>`,
  title: 'Hourly claim',
  claimed: (user: string, amount: string) => `${user} claimed **${amount}** ${CURRENCY_EMOJI}.`,
  claimedWithGear: (user: string, amount: string, bonus: string) =>
    `${user} claimed **${amount}** ${CURRENCY_EMOJI}. (+${bonus} ${CURRENCY_EMOJI} from gear.)`,
  /** Added when part of the claim was taxed by someone who robbed them. `taker` is a mention. */
  taxed: (taker: string, tax: string, kept: string) => `${taker} took **${tax}** ${CURRENCY_EMOJI} of it. You kept **${kept}** ${CURRENCY_EMOJI}.`,
  balanceField: 'Balance',
  nextField: 'Next claim',
  next: (unix: number) => `<t:${unix}:R>`,
};
