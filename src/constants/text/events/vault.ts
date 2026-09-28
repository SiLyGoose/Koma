import { CURRENCY_NAME } from '../../core.js';
import { boldMoney } from '../currency.js';

/*
 * The vault command's text. The vault games themselves (Greedy Heist, Split or Steal) have their
 * own files: heist.ts and split-steal.ts.
 */
export const vaultText = {
  /** The `vault` command: how much is in the vault right now. */
  commandTitle: 'Vault',
  /** `pool` is what's in the vault (losses, fines and its hourly growth), `prize` is that times the multiplier: what the next vault game would put up. */
  commandInfo: (pool: string, prize: string, multiplier: string) =>
    `${boldMoney(pool)} in the vault. The next vault game would put up ${boldMoney(prize)} (${multiplier}).`,

  /** The `donate` command. */
  donateUsage: (p: string) => `Use \`${p}donate <amount>\` (or \`${p}donate all\`) to give some of your ${CURRENCY_NAME} to the vault.`,
  donateBadAmount: 'The amount must be a whole number of at least 1, or "all".',
  /** `balance` is what they have. */
  donateTooPoor: (balance: string) => `You don't have that many to give. You have ${boldMoney(balance)}.`,
  donateNothing: `You don't have any ${CURRENCY_NAME} to give.`,
  donateTitle: 'Vault donation',
  /** `user` is a mention; `pool` is the vault right after. */
  donateDone: (user: string, amount: string, pool: string) =>
    `${user} put ${boldMoney(amount)} into the vault. It now holds ${boldMoney(pool)}.`,
  donateBalanceField: 'Your balance',
};
