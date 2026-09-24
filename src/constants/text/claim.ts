import { CURRENCY_EMOJI } from '../core.js';
import { boldMoney } from './currency.js';

export const claimText = {
  already: (unix: number) => `You already claimed this hour. Come back <t:${unix}:R>`,
  title: 'Hourly claim',
  claimed: (user: string, amount: string) => `${user} claimed ${boldMoney(amount)}`,
  claimedWithGear: (user: string, amount: string, bonus: string) =>
    `${user} claimed ${boldMoney(amount)} (+${bonus} ${CURRENCY_EMOJI} from gear)`,
  /** Added when part of the claim was taxed by someone who robbed them. `taker` is a mention. */
  taxed: (taker: string, tax: string, kept: string) => `${taker} took ${boldMoney(tax)} of it. You kept ${boldMoney(kept)}`,
  balanceField: 'Balance',
  nextField: 'Next claim',
  next: (unix: number) => `<t:${unix}:R>`,
};
