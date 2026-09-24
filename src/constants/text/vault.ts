import { boldMoney } from './currency.js';

/*
 * The vault command's text. The vault games themselves (Greedy Heist, Split or Steal) have their
 * own files: heist.ts and split-steal.ts.
 */
export const vaultText = {
  /** The `vault` command: how much is in the vault right now. */
  commandTitle: 'Vault',
  /** `pool` is what's been lost so far, `prize` is that times the multiplier: what the next vault game would put up. */
  commandInfo: (pool: string, prize: string, multiplier: string) =>
    `${boldMoney(pool)} lost so far. The next vault game (Greedy Heist or Split or Steal) would put up ${boldMoney(prize)} (${multiplier}).`,
};
