import type { SkipId } from '../../types.js';
import { boldMoney } from './currency.js';

export const skipText = {
  /** What each skip is called, and what it skips. */
  names: { claim: 'Claim' } satisfies Record<SkipId, string>,
  waits: { claim: 'the wait for your next hourly claim' } satisfies Record<SkipId, string>,

  listTitle: 'Skip a cooldown',
  /** `ids` is the skippable things, like "`claim`". */
  listInfo: (p: string, ids: string) =>
    `Pay to skip a wait with \`${p}skip <cooldown>\` (${ids})`,
  /** One line per skip: its price now, and when the wait ends (a Discord timestamp), that there is none, or that it's been used up. */
  listLine: (name: string, price: string, until: number | null, usedUp: boolean) =>
    `**${name}**: ${boldMoney(price)}, ${usedUp ? 'already used, until the wait is over' : until === null ? 'nothing to skip right now' : `ready <t:${until}:R>`}`,

  unknown: (what: string, ids: string) => `You can't skip "${what}". You can skip: ${ids}.`,
  notWaiting: (wait: string) => `You aren't waiting on ${wait} right now.`,
  tooPoor: (price: string, balance: string) => `Skipping costs ${boldMoney(price)} right now, and you have ${boldMoney(balance)}.`,
  busy: 'Something else changed at the same moment. Nothing was taken; try again.',

  doneTitle: 'Cooldown skipped',
  /** `user` is a mention. */
  done: (user: string, wait: string, paid: string) => `${user} paid ${boldMoney(paid)} to skip ${wait}.`,
  claimReady: (p: string) => `Your claim is ready: use \`${p}claim\`.`,
  balanceField: 'Balance',
  nextPriceField: 'Next skip today',

  /** Added to claim's "already claimed" reply. */
  claimHint: (p: string, price: string) => `Or skip the wait for ${boldMoney(price)} with \`${p}skip claim\`.`,
};
