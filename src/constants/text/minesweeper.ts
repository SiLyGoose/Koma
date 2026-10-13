import { MINESWEEPER_LEVELS } from '../minesweeper.js';

const board = (level: keyof typeof MINESWEEPER_LEVELS): string => {
  const { cols, rows, mines } = MINESWEEPER_LEVELS[level];
  return `${cols}x${rows}, ${mines} mines`;
};

export const minesweeperText = {
  title: '🚩 Minesweeper',
  /** What `k!minesweeper` says, above the button to the site. */
  intro:
    'Play minesweeper on the Koma site, together: everyone who opens it in this server clears the same board, and you can see each other\'s cursors as you go. ' +
    `Pick **Beginner** (${board('easy')}), **Intermediate** (${board('medium')}) or **Expert** (${board('hard')}). One mine ends it for everyone. No bet: a board cleared pays out between everyone who opened its tiles, by how many each opened, and more the faster it's cleared.`,
  footer: 'Log in with Discord on the site.',
  playButton: 'Play Minesweeper',
  /** Without the web site, minesweeper can't be played. */
  off: 'Minesweeper is played in the browser, and the web site is not set up on this bot yet.',
};
