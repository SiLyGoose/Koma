import { CURRENCY_EMOJI } from '../core.js';

export const leaderboardText = {
  title: 'Leaderboard',
  empty: (p: string) => `Nobody has any ${CURRENCY_EMOJI} yet. Be the first with \`${p}claim\`!`,
  row: (rank: number, userId: string, points: string) => `**${rank}.** <@${userId}> — ${points} ${CURRENCY_EMOJI}`,

  /** The buttons that switch between the boards. */
  balanceButton: 'Balance',
  donorsButton: 'Top donors',
  lossesButton: 'Losses',
  winningsButton: 'Winnings',
  donorsTitle: 'Leaderboard: top vault donors',
  lossesTitle: 'Leaderboard: biggest losses',
  lossesFooter: 'Every losing casino round, fine and penalty, with no winnings taken off. All time.',
  noDonors: (p: string) => `No one has donated to the vault yet. Use \`${p}donate <amount>\` to be the first.`,
  noLosses: 'No one has lost anything yet.',
  winningsTitle: 'Leaderboard: biggest casino winnings',
  winningsFooter: 'What every winning casino round paid over its bet, with no losses taken off. All time.',
  noWinnings: 'No one has won anything at the casino yet.',
};
