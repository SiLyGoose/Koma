import { CURRENCY_NAME } from '../../core.js';
import { boldMoney } from '../currency.js';

/*
 * The vault command's text. The vault games themselves (Greedy Heist, Split or Steal) have their
 * own files: heist.ts and split-steal.ts.
 */
export const vaultText = {
  /** The `vault` command: how much is in the vault right now. */
  commandTitle: 'Vault',
  /**
   * `pool` is what's in the vault (losses, fines, donations and its hourly growth), `prize` is what
   * the next vault game would put up (what it can pay out of the pool, times the multiplier).
   * `cap`, only given when the pool is over events.vault.maxPool, is the most one game pays out of it.
   */
  commandInfo: (pool: string, prize: string, multiplier: string, cap?: string) =>
    `${boldMoney(pool)} in the vault. The next vault game would put up ${boldMoney(prize)} (${multiplier}).` +
    (cap ? ` A vault game pays out at most ${boldMoney(cap)} of it; the rest waits for the next one.` : ''),

  /**
   * Where the vault's points came from since a vault game last paid out of it (claimed it), on the
   * vault command. Every amount is already formatted. `claim`, only given once there has been a
   * claim, is when (a Discord timestamp) and what it left behind in the vault.
   */
  sourcesField: (claimed: boolean) => (claimed ? 'Put in since the last claim' : 'Put in so far'),
  sources: (losses: string, donated: string, grown: string, claim?: { at: string; left: string }) =>
    [
      ...(claim ? [`Last claimed ${claim.at}, leaving ${boldMoney(claim.left)}`] : []),
      `Losses: ${boldMoney(losses)}`,
      `Donations: ${boldMoney(donated)}`,
      `Hourly growth: ${boldMoney(grown)}`,
    ].join('\n'),
  donorsField: (claimed: boolean) => (claimed ? 'Top donors since the last claim' : 'Top donors'),
  /** `rank` starts at 1; `user` is a mention. */
  donorLine: (rank: number, user: string, amount: string) => `${rank}. ${user}: ${boldMoney(amount)}`,
  /** `count` is how many donors weren't listed. */
  moreDonors: (count: number) => `…and ${count} more`,
  noDonors: (p: string) => `No one has donated yet. Use \`${p}donate <amount>\` to be the first.`,

  /** The `donate` command. */
  donateUsage: (p: string) => `Use \`${p}donate <amount>\` (or \`${p}donate all\`) to give some of your ${CURRENCY_NAME} to the vault.`,
  donateBadAmount: 'The amount must be a whole number of at least 1, or "all".',
  /** `balance` is what they have. */
  donateTooPoor: (balance: string) => `You don't have that many to give. You have ${boldMoney(balance)}`,
  donateNothing: `You don't have any ${CURRENCY_NAME} to give.`,
  donateTitle: 'Vault donation',
  /** `user` is a mention; `pool` is the vault right after; `cap`, only given when that's over events.vault.maxPool, is the most one vault game pays out of it. */
  donateDone: (user: string, amount: string, pool: string, cap?: string) =>
    `${user} put ${boldMoney(amount)} into the vault. It now holds ${boldMoney(pool)}` +
    (cap ? `. A vault game pays out at most ${boldMoney(cap)} of it; the rest waits for the next one.` : ''),
  donateBalanceField: 'Your balance',
};
