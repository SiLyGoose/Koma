import { createEmbed } from '../lib/embed.js';
import { CONFIG } from '../config.js';
import { CURRENCY_NAME, TEXT } from '../constants/index.js';
import { fmt } from '../lib/format.js';
import { getLeaderboard } from '../services/economy/index.js';
import type { Command } from '../discord/types.js';

export const leaderboard: Command = {
  name: 'leaderboard',
  aliases: ['lb', 'top'],
  description: `See who has the most ${CURRENCY_NAME} in this server.`,

  async execute(ctx) {
    const rows = await getLeaderboard(ctx.guildId, CONFIG.leaderboardSize);

    if (rows.length === 0) {
      await ctx.reply(TEXT.leaderboard.empty(ctx.prefix));
      return;
    }

    const lines = rows.map((row, index) => TEXT.leaderboard.row(index + 1, row.userId, fmt(row.points)));
    const embed = createEmbed()
      .setTitle(TEXT.leaderboard.title)
      .setDescription(lines.join('\n'));
    await ctx.reply({ embeds: [embed] });
  },
};
