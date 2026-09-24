import { CURRENCY_EMOJI } from '../core.js';

export const leaderboardText = {
  title: 'Leaderboard',
  empty: (p: string) => `Nobody has any ${CURRENCY_EMOJI} yet. Be the first with \`${p}claim\`!`,
  row: (rank: number, userId: string, points: string) => `**${rank}.** <@${userId}> — ${points} ${CURRENCY_EMOJI}`,
};
