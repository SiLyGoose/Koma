import { CURRENCY_EMOJI } from '../core.js';
import { boldMoney } from './currency.js';

export const crateText = {
  title: 'A crate landed!',
  /** `pile` is the points inside, `unix` is when it opens, in seconds. */
  description: (pile: string, unix: number) =>
    `A crate with ${boldMoney(pile)} fell into the channel! Press **Grab** before it opens <t:${unix}:R>. Everyone who grabs splits the ${CURRENCY_EMOJI} evenly.`,
  button: 'Grab',
  grabbedField: 'Grabbed so far',
  grabbedNobody: 'Nobody yet',
  grabbedCount: (count: number) => `${count} ${count === 1 ? 'person' : 'people'}`,
  grabbed: 'You are in! The crate opens when the timer ends, and everyone who grabbed splits it.',
  alreadyGrabbed: 'You already grabbed this crate.',
  openedTitle: 'The crate opened!',
  /** `each` is what everyone got, `extra` how many got one more to use up the remainder. */
  opened: (pile: string, count: number, each: string, extra: number) =>
    `${boldMoney(pile)} split between **${count}** ${count === 1 ? 'person' : 'people'}: ${boldMoney(each)} each${
      extra > 0 ? `, and ${extra} lucky ${extra === 1 ? 'grabber' : 'grabbers'} got 1 more` : ''
    }.`,
  shareLine: (user: string, amount: string) => `${user} **+${amount}** ${CURRENCY_EMOJI}`,
  moreShares: (count: number) => `...and ${count} more`,
  sharesField: 'Who got what',
  crumbledTitle: 'The crate crumbled',
  crumbled: (pile: string) => `Nobody grabbed the ${boldMoney(pile)}, so they blew away.`,
  failedTitle: 'The crate got stuck',
  failed: `Something went wrong while handing out the ${CURRENCY_EMOJI}, so nobody was paid. Ask the bot admin to look at the logs.`,
  someFailed: (count: number) => `${count} ${count === 1 ? 'payout' : 'payouts'} could not be made. Ask the bot admin to look at the logs.`,
};
