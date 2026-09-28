import { ROULETTE_TABLE } from '../roulette.js';

export const rouletteText = {
  title: '🎡 Roulette',
  /** What `k!roulette` says, above the button to the site. `max` is like "10,000". */
  intro: (max: string) =>
    `Play roulette on the Koma site, at a table with up to ${ROULETTE_TABLE.seats} players: drag chips onto numbers, the lines between them, or the outside bets, and the wheel is spun for everyone when the timer runs out. ` +
    `A number pays 35 to 1, a split 17, a street 11, a corner 8 and a line 5; dozens and columns pay 2 to 1, and red, black, odd, even, 1-18 and 19-36 pay 1 to 1. The wheel has 0 and 00.\n` +
    `Up to ${max} on the table a round.`,
  footer: 'Log in with Discord on the site. Your points are the same as here.',
  playButton: 'Play Roulette',
  /** Without the web site, roulette can't be played. */
  off: 'Roulette is played in the browser, and the web site is not set up on this bot yet.',
};
