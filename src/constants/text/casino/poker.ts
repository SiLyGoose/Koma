import { POKER_TABLE } from '../../casino/poker.js';

export const pokerText = {
  title: "♠️ Texas Hold'em",
  /** What `k!poker` says, above the button to the site. Amounts are already formatted, like "1,000". `rake` is like "5%". */
  intro: (small: string, big: string, min: string, max: string, rake: string, cap: string) =>
    `Play no-limit Texas hold'em on the Koma site, at a table of up to ${POKER_TABLE.seats}. Sit down with **${min}** to **${max}** of your points as chips, and play against the others at the table, or add bots to fill the seats.\n` +
    `Blinds **${small}/${big}**. The house takes **${rake}** of every pot that sees a flop (at most ${cap}), into the vault. Stand up whenever you like: your chips go back to your balance.`,
  footer: 'Log in with Discord on the site. Your points are the same as here.',
  playButton: 'Play Poker',
  /** Without the web site, poker can't be played. */
  off: 'Poker is played in the browser, and the web site is not set up on this bot yet.',
};
