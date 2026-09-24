import { CURRENCY_EMOJI } from '../core.js';
import { boldMoney } from './currency.js';

export const vaultText = {
  title: 'Vault Breaker',
  /** `prize` is what's at stake, `min` how many are needed, `unix` when joining closes. */
  description: (prize: string, min: number, unix: number) =>
    `A vault holding ${boldMoney(prize)} has been found! It needs at least **${min}** people to crack it. Press **Join** before <t:${unix}:R>. The more who join, the better the odds — but if the crack fails, everyone who joined pays a fine.`,
  button: 'Join',
  joinedField: 'Joined so far',
  joinedNobody: 'Nobody yet',
  joinedCount: (count: number, min: number) => `${count} ${count === 1 ? 'person' : 'people'}${count < min ? ` (needs ${min})` : ''}`,
  joined: 'You are in! The vault opens when the timer ends.',
  alreadyJoined: 'You already joined this vault breaker.',
  notEnoughTitle: 'Not enough safecrackers',
  /** `count` joined, `min` were needed. */
  notEnough: (count: number, min: number) => `Only **${count}** ${count === 1 ? 'person' : 'people'} joined; it takes at least **${min}**. The vault stays locked.`,
  successTitle: 'The vault is cracked!',
  /** `prize` split between `count` people, `chance` was the odds, `each`/`extra` as the crate's `opened`. */
  success: (prize: string, count: number, chance: string, each: string, extra: number) =>
    `The crew pulled it off (**${chance}** odds with **${count}** ${count === 1 ? 'person' : 'people'})! ${boldMoney(prize)} split: ${boldMoney(each)} each${
      extra > 0 ? `, and ${extra} lucky ${extra === 1 ? 'cracker' : 'crackers'} got 1 more` : ''
    }.`,
  shareLine: (user: string, amount: string) => `${user} **+${amount}** ${CURRENCY_EMOJI}`,
  moreShares: (count: number) => `...and ${count} more`,
  sharesField: 'Who got what',
  failTitle: 'The vault held',
  /** `chance` were the odds, `count` joined, `fine` is what each of them paid. */
  fail: (chance: string, count: number, fine: string) =>
    `The crew got caught (**${chance}** odds with **${count}** ${count === 1 ? 'person' : 'people'}). Every safecracker pays a ${boldMoney(fine)} fine, added back to the vault.`,
  failedTitle: 'The vault jammed',
  failed: `Something went wrong while settling the vault, so nobody was paid or fined. Ask the bot admin to look at the logs.`,
  someFailed: (count: number) => `${count} ${count === 1 ? 'payout' : 'payouts'} could not be made. Ask the bot admin to look at the logs.`,
};
