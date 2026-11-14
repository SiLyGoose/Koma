export const minesText = {
  title: '💣 Mines',
  /** What `k!mines` says, above the button to the site. `cap` is like "24x". */
  intro: (min: number, max: number, cap: string) =>
    `Play Mines on the Koma site: bet, pick how many mines hide on a 5x5 board (${min} to ${max}), then turn over tiles. ` +
    `Every gem raises your multiplier, a mine loses the bet. Cash out whenever you like, up to **${cap}**.`,
  footer: 'Log in with Discord on the site. Your points are the same as here.',
  playButton: 'Play Mines',
  /** Without the web site, the mine can't be played. */
  off: 'Mines is played in the browser, and the web site is not set up on this bot yet.',
};
