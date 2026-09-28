import { BACCARAT_TABLE } from '../baccarat.js';

export const baccaratText = {
  title: '🃏 Baccarat',
  /** What `k!baccarat` says, above the button to the site. The payouts are like "8", `max` like "10,000". */
  intro: (banker: string, tie: string, kirin: string, phoenix: string, max: string) =>
    `Play baccarat on the Koma site, at a table with up to ${BACCARAT_TABLE.seats} players: drag chips onto **Player**, **Banker** or **Tie**, and every minute the hands are dealt for everyone. ` +
    `Player pays 1 to 1, Banker ${banker} to 1, Tie ${tie} to 1.\n` +
    `Side bets: **Kirin** pays ${kirin} to 1 when the Player wins with three cards worth 8, **Phoenix** pays ${phoenix} to 1 when the Banker wins with three cards worth 7.\n` +
    `Up to ${max} on the table a round.`,
  footer: 'Log in with Discord on the site. Your points are the same as here.',
  playButton: 'Play Baccarat',
  /** Without the web site, baccarat can't be played. */
  off: 'Baccarat is played in the browser, and the web site is not set up on this bot yet.',
};
